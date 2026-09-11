import { PirateObservatoryRestTransport } from './transport.mjs';
import { PirateObservatoryRestSession } from './rest-session.mjs';
import { PirateObservatoryWebSocketSession } from './websocket-session.mjs';
import { assertPartition } from './protocol.mjs';

/// <summary-like>
/// Bootstrap/resync always uses canonical REST snapshots. When a WebSocket is
/// available it becomes the live delta transport; unexpected socket closure
/// falls back to REST polling without inventing state.
/// </summary-like>
export class PirateObservatoryHybridSession {
  constructor({
    baseUrl,
    token,
    headers = null,
    partition = 'pirate-fruit',
    fetchImpl = globalThis.fetch,
    WebSocketImpl = globalThis.WebSocket,
    pollMs = 500,
    notReadyPollMs = 3000,
    onSnapshot = () => ({ ok: true }),
    onDelta = () => ({ ok: true }),
    onEvent = () => {},
    onWatch = () => {},
    onServerHealth = () => {},
    onWorldHealth = () => {},
    onAlert = () => {},
    onState = () => {},
    onTransport = () => {},
  } = {}) {
    if (typeof token !== 'string' || !token) throw new TypeError('session token is required');
    this.baseUrl = baseUrl;
    this.token = token;
    this.partition = assertPartition(partition);
    this.WebSocketImpl = WebSocketImpl;
    this.onDelta = onDelta;
    this.onEvent = onEvent;
    this.onWatch = onWatch;
    this.onServerHealth = onServerHealth;
    this.onWorldHealth = onWorldHealth;
    this.onAlert = onAlert;
    this.onState = onState;
    this.onTransport = onTransport;
    this.stopped = false;
    this.socket = null;
    this.recovery = null;

    this.transport = new PirateObservatoryRestTransport({ baseUrl, headers, fetchImpl });
    this.rest = new PirateObservatoryRestSession({
      transport: this.transport,
      partition: this.partition,
      pollMs,
      notReadyPollMs,
      onSnapshot,
      onDelta,
      onState: (state, detail) => this.onState(state, { ...detail, transport: 'rest' }),
    });
  }

  async start() {
    this.stopped = false;
    const initial = await this.rest.bootstrap();
    if (this.stopped) return { ok: false, reason: 'SESSION_STOPPED' };

    if (initial.ok && typeof this.WebSocketImpl === 'function') {
      const upgraded = await this.#openSocket(initial.sequence);
      if (upgraded.ok) {
        this.onTransport('websocket', { sequence: initial.sequence });
        return { ok: true, mode: 'websocket', sequence: initial.sequence };
      }
    }

    if (initial.ok || initial.serverReachable) {
      this.rest.start();
      this.onTransport('rest', { reason: initial.reason ?? null, sequence: this.rest.sequence });
      return { ...initial, mode: initial.ok ? 'rest' : 'rest-waiting' };
    }
    return initial;
  }

  stop() {
    this.stopped = true;
    this.socket?.close();
    this.socket = null;
    this.rest.stop();
    this.onTransport('stopped', {});
  }

  async #openSocket(afterSequence) {
    if (this.stopped) return { ok: false, reason: 'SESSION_STOPPED' };
    this.socket?.close();
    const socket = new PirateObservatoryWebSocketSession({
      baseUrl: this.baseUrl,
      token: this.token,
      partition: this.partition,
      afterSequence,
      WebSocketImpl: this.WebSocketImpl,
      onDelta: this.onDelta,
      onEvent: this.onEvent,
      onWatch: this.onWatch,
      onServerHealth: this.onServerHealth,
      onWorldHealth: this.onWorldHealth,
      onAlert: this.onAlert,
      onState: (state, detail) => this.onState(state, { ...detail, transport: 'websocket' }),
      onResyncRequired: detail => { void this.#recoverFromSocket(detail); },
      onClose: detail => {
        if (this.stopped || detail.reason === 'CLIENT_CLOSED' || this.recovery) return;
        this.rest.start();
        this.onTransport('rest', { reason: detail.reason ?? 'SOCKET_CLOSED', fallback: true });
      },
    });
    this.socket = socket;
    return socket.connect();
  }

  #recoverFromSocket(detail) {
    if (this.stopped) return Promise.resolve({ ok: false, reason: 'SESSION_STOPPED' });
    if (this.recovery) return this.recovery;
    this.recovery = this.#recoverCore(detail).finally(() => { this.recovery = null; });
    return this.recovery;
  }

  async #recoverCore(detail) {
    this.socket?.close();
    this.socket = null;
    this.onTransport('rest-resync', { reason: detail?.code ?? 'RESYNC_REQUIRED' });

    const recovered = await this.rest.bootstrap();
    if (this.stopped) return { ok: false, reason: 'SESSION_STOPPED' };
    if (recovered.ok && typeof this.WebSocketImpl === 'function') {
      const upgraded = await this.#openSocket(recovered.sequence);
      if (upgraded.ok) {
        this.onTransport('websocket', { recovered: true, sequence: recovered.sequence });
        return { ok: true, mode: 'websocket', recovered: true };
      }
    }

    if (recovered.ok || recovered.serverReachable) {
      this.rest.start();
      this.onTransport('rest', { recovered: recovered.ok, fallback: true });
    }
    return recovered;
  }
}
