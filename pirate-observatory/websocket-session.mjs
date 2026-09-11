import { routeObservatoryEnvelope } from './stream-router.mjs';
import { SYNC_STATES, assertPartition } from './protocol.mjs';

export function deriveObservatoryWebSocketUrl(baseUrl) {
  const url = new URL(String(baseUrl ?? '').trim());
  if (url.protocol === 'https:') url.protocol = 'wss:';
  else if (url.protocol === 'http:') url.protocol = 'ws:';
  else throw new TypeError('Observatory WebSocket base URL must use http or https');
  url.pathname = '/ws/observatory';
  url.search = '';
  url.hash = '';
  return url.href;
}

function assertCursor(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('afterSequence must be a non-negative safe integer');
  return value;
}

export class PirateObservatoryWebSocketSession {
  constructor({
    baseUrl,
    token,
    partition = 'pirate-fruit',
    afterSequence = 0,
    WebSocketImpl = globalThis.WebSocket,
    connectTimeoutMs = 8000,
    onDelta = () => ({ ok: true }),
    onEvent = () => {},
    onWatch = () => {},
    onServerHealth = () => {},
    onWorldHealth = () => {},
    onAlert = () => {},
    onState = () => {},
    onResyncRequired = () => {},
    onClose = () => {},
  } = {}) {
    if (typeof WebSocketImpl !== 'function') throw new TypeError('WebSocket implementation is required');
    if (typeof token !== 'string' || !token) throw new TypeError('session token is required');
    if (!Number.isFinite(connectTimeoutMs) || connectTimeoutMs < 1000) throw new TypeError('connectTimeoutMs must be at least 1000ms');

    this.url = deriveObservatoryWebSocketUrl(baseUrl);
    this.token = token;
    this.partition = assertPartition(partition);
    this.sequence = assertCursor(afterSequence);
    this.WebSocketImpl = WebSocketImpl;
    this.connectTimeoutMs = connectTimeoutMs;
    this.onDelta = onDelta;
    this.onEvent = onEvent;
    this.onWatch = onWatch;
    this.onServerHealth = onServerHealth;
    this.onWorldHealth = onWorldHealth;
    this.onAlert = onAlert;
    this.onState = onState;
    this.onResyncRequired = onResyncRequired;
    this.onClose = onClose;
    this.socket = null;
    this.closedByClient = false;
  }

  connect() {
    if (this.socket && this.socket.readyState <= 1) return Promise.resolve({ ok: true, reused: true });
    this.closedByClient = false;
    this.onState(SYNC_STATES.SYNCING, { transport: 'websocket', partition: this.partition });

    return new Promise(resolve => {
      let settled = false;
      const socket = new this.WebSocketImpl(this.url);
      this.socket = socket;
      const finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };
      const timeout = setTimeout(() => {
        try { socket.close(1000, 'Connect timeout'); } catch {}
        this.onState(SYNC_STATES.OFFLINE, { transport: 'websocket', reason: 'CONNECT_TIMEOUT' });
        finish({ ok: false, reason: 'CONNECT_TIMEOUT' });
      }, this.connectTimeoutMs);

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({
          token: this.token,
          partition: this.partition,
          afterSequence: this.sequence,
        }));
        finish({ ok: true, mode: 'websocket', url: this.url });
      });

      socket.addEventListener('message', event => this.#handleMessage(event));
      socket.addEventListener('error', () => {
        this.onState(SYNC_STATES.OFFLINE, { transport: 'websocket', reason: 'SOCKET_ERROR' });
        finish({ ok: false, reason: 'SOCKET_ERROR' });
      });
      socket.addEventListener('close', event => {
        this.socket = null;
        const detail = {
          transport: 'websocket',
          reason: this.closedByClient ? 'CLIENT_CLOSED' : 'SOCKET_CLOSED',
          code: event.code,
        };
        if (!this.closedByClient) this.onState(SYNC_STATES.OFFLINE, detail);
        this.onClose(detail);
        finish({ ok: false, reason: detail.reason, code: event.code });
      });
    });
  }

  close() {
    this.closedByClient = true;
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState <= 1) {
      try { socket.close(1000, 'Client closed'); } catch {}
    }
    this.onState(SYNC_STATES.OFFLINE, { transport: 'websocket', stopped: true });
  }

  #handleMessage(event) {
    let envelope;
    try {
      envelope = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
    } catch {
      this.onState(SYNC_STATES.DESYNC, { transport: 'websocket', reason: 'INVALID_STREAM_JSON' });
      this.onResyncRequired({ code: 'INVALID_STREAM_JSON', partition: this.partition });
      return;
    }

    const result = routeObservatoryEnvelope(envelope, {
      onDelta: payload => {
        const applied = this.onDelta(payload, envelope);
        if (applied?.ok === false) {
          this.onState(SYNC_STATES.DESYNC, { transport: 'websocket', reason: applied.reason });
          this.onResyncRequired({ code: applied.reason ?? 'DELTA_REJECTED', partition: this.partition });
          return;
        }
        this.sequence = envelope.sequence;
        this.onState(SYNC_STATES.LIVE, {
          transport: 'websocket', partition: this.partition, sequence: this.sequence, tick: envelope.tick,
        });
      },
      onEvent: this.onEvent,
      onWatch: this.onWatch,
      onServerHealth: payload => {
        this.onServerHealth(payload, envelope);
        this.onState(payload?.ready === false ? SYNC_STATES.SYNCING : SYNC_STATES.LIVE, {
          transport: 'websocket',
          partition: this.partition,
          sequence: this.sequence,
          tick: envelope.tick,
          serverReachable: true,
          reason: payload?.code,
          mode: payload?.mode,
        });
      },
      onWorldHealth: this.onWorldHealth,
      onAlert: payload => {
        this.onAlert(payload, envelope);
        if (payload?.code === 'RESYNC_REQUIRED') {
          this.onState(SYNC_STATES.DESYNC, { transport: 'websocket', reason: payload.code, serverReachable: true });
          this.onResyncRequired(payload);
        }
      },
    });

    if (!result.ok) {
      this.onState(SYNC_STATES.DESYNC, { transport: 'websocket', reason: result.reason });
      this.onResyncRequired({ code: result.reason, partition: this.partition });
    }
  }
}
