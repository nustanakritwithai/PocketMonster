import { PirateObservatoryDashboard } from './dashboard.mjs';
import { PirateObservatoryRestTransport } from './transport.mjs';
import { PirateObservatoryRestSession } from './rest-session.mjs';
import { PirateObservatoryHybridSession } from './hybrid-session.mjs';
import { PirateObservatoryInterestSession } from './interest-session.mjs';
import { resolvePirateObservatoryRuntimeContext } from './runtime-context.mjs';
import { SYNC_STATES } from './protocol.mjs';

let activeSession = null;
let activeTransport = null;
let activeInterestSession = null;
let activeViewportUnsubscribe = null;
let activeInterestPartition = null;
let activeInterestPollMs = 750;

function stopInterestSession() {
  activeViewportUnsubscribe?.();
  activeViewportUnsubscribe = null;
  activeInterestSession?.stop?.();
  activeInterestSession = null;
  activeInterestPartition = null;
}

function ensureInterestSession(transport, partition) {
  if (!transport?.getInterest) return;
  if (activeInterestSession?.transport === transport && activeInterestPartition === partition) {
    void activeInterestSession.refresh();
    return;
  }

  stopInterestSession();
  const session = new PirateObservatoryInterestSession({
    transport,
    pollMs: activeInterestPollMs,
    getRequest: () => PirateObservatoryDashboard.currentInterestRequest(partition),
    onInterest: response => PirateObservatoryDashboard.acceptInterest(response),
    onError: error => {
      if (error?.status === 401 || error?.status === 403) {
        PirateObservatoryDashboard.acceptEvent({
          type: 'interest.auth',
          label: 'Viewport interest authorization expired',
        });
      }
    },
  });
  activeInterestSession = session;
  activeInterestPartition = partition;
  activeViewportUnsubscribe = PirateObservatoryDashboard.subscribeViewport(() => { void session.refresh(); });
  session.start();
}

function applyDashboardState(partition, state, detail = {}) {
  const connected = detail.serverReachable ?? state !== SYNC_STATES.OFFLINE;
  PirateObservatoryDashboard.setServerStatus({
    connected,
    issues: state === SYNC_STATES.LIVE ? 0 : connected ? 1 : 0,
    tick: detail.tick,
    reason: detail.reason ?? null,
    waitingForAuthority: detail.waitingForAuthority === true || detail.mode === 'waiting-authority',
    nextAuthorityCheckAt: detail.nextAuthorityCheckAt ?? null,
    transport: detail.transport ?? null,
  });
  PirateObservatoryDashboard.markPartition(partition, state);
  if (state === SYNC_STATES.LIVE && activeTransport) ensureInterestSession(activeTransport, partition);
  else if (state === SYNC_STATES.OFFLINE || state === SYNC_STATES.DESYNC || state === SYNC_STATES.SYNCING || state === SYNC_STATES.CATCHING_UP) stopInterestSession();
}

function stopActiveSession() {
  stopInterestSession();
  activeSession?.stop?.();
  activeSession = null;
  activeTransport = null;
}

export async function connectPirateObservatoryRest({
  baseUrl,
  partition = 'pirate-fruit',
  headers = null,
  fetchImpl = globalThis.fetch,
  pollMs = 500,
  notReadyPollMs = 3000,
  interestPollMs = 750,
  startPolling = true,
} = {}) {
  stopActiveSession();
  activeInterestPollMs = interestPollMs;
  const transport = new PirateObservatoryRestTransport({ baseUrl, headers, fetchImpl });
  activeTransport = transport;
  const session = new PirateObservatoryRestSession({
    transport,
    partition,
    pollMs,
    notReadyPollMs,
    onSnapshot: snapshot => PirateObservatoryDashboard.acceptSnapshot(snapshot),
    onDelta: packet => PirateObservatoryDashboard.acceptDelta(packet),
    onState: (state, detail = {}) => applyDashboardState(partition, state, { ...detail, transport: 'rest' }),
  });

  activeSession = session;
  const result = await session.bootstrap();
  if (startPolling && (result.ok || result.serverReachable)) session.start();
  return { ...result, transport, session };
}

export async function connectPirateObservatoryHybrid({
  baseUrl,
  token,
  partition = 'pirate-fruit',
  headers = null,
  fetchImpl = globalThis.fetch,
  WebSocketImpl = globalThis.WebSocket,
  pollMs = 500,
  notReadyPollMs = 3000,
  interestPollMs = 750,
} = {}) {
  stopActiveSession();
  activeInterestPollMs = interestPollMs;
  const session = new PirateObservatoryHybridSession({
    baseUrl,
    token,
    headers,
    partition,
    fetchImpl,
    WebSocketImpl,
    pollMs,
    notReadyPollMs,
    onSnapshot: snapshot => PirateObservatoryDashboard.acceptSnapshot(snapshot),
    onDelta: packet => PirateObservatoryDashboard.acceptDelta(packet),
    onEvent: (event, envelope) => PirateObservatoryDashboard.acceptEvent({ ...event, at: envelope?.serverTime ?? Date.now() }),
    onServerHealth: (payload, envelope) => PirateObservatoryDashboard.setServerStatus({
      connected: true,
      tick: envelope?.tick,
      reason: payload?.code ?? null,
      waitingForAuthority: payload?.ready === false,
      transport: 'websocket',
    }),
    onWorldHealth: payload => {
      if (Number.isFinite(payload?.issueCount)) PirateObservatoryDashboard.setServerStatus({ issues: payload.issueCount });
    },
    onAlert: (payload, envelope) => PirateObservatoryDashboard.acceptEvent({
      ...payload,
      type: payload?.code ?? 'system.alert',
      label: payload?.message ?? payload?.code ?? 'System alert',
      at: envelope?.serverTime ?? Date.now(),
    }),
    onState: (state, detail = {}) => applyDashboardState(partition, state, detail),
    onTransport: mode => PirateObservatoryDashboard.setServerStatus({ transport: mode }),
  });
  activeSession = session;
  activeTransport = session.transport;
  const result = await session.start();
  return { ...result, session };
}

export async function connectPirateObservatoryFromRuntime({
  partition = 'pirate-fruit',
  pollMs = 500,
  notReadyPollMs = 3000,
  interestPollMs = 750,
  preferWebSocket = true,
  startPolling = true,
  windowLike = globalThis.window,
  storage = globalThis.sessionStorage,
  fetchImpl = globalThis.fetch,
  WebSocketImpl = globalThis.WebSocket,
  loadConfig,
  now,
} = {}) {
  const context = await resolvePirateObservatoryRuntimeContext({
    windowLike,
    storage,
    fetchImpl,
    ...(loadConfig ? { loadConfig } : {}),
    ...(Number.isFinite(now) ? { now } : {}),
  });
  if (!context.ok) {
    stopActiveSession();
    PirateObservatoryDashboard.setServerStatus({ connected: false, issues: 0, reason: context.reason ?? null, waitingForAuthority: false });
    PirateObservatoryDashboard.markPartition(partition, SYNC_STATES.OFFLINE);
    return context;
  }

  if (preferWebSocket && typeof WebSocketImpl === 'function') {
    return connectPirateObservatoryHybrid({
      baseUrl: context.baseUrl,
      token: context.session.sessionToken,
      partition,
      headers: context.headers,
      fetchImpl,
      WebSocketImpl,
      pollMs,
      notReadyPollMs,
      interestPollMs,
    });
  }

  return connectPirateObservatoryRest({
    baseUrl: context.baseUrl,
    partition,
    headers: context.headers,
    fetchImpl,
    pollMs,
    notReadyPollMs,
    interestPollMs,
    startPolling,
  });
}

export function disconnectPirateObservatory() {
  stopActiveSession();
}

if (typeof window !== 'undefined') {
  window.PIRATE_OBSERVATORY_CONNECT_REST = connectPirateObservatoryRest;
  window.PIRATE_OBSERVATORY_CONNECT_HYBRID = connectPirateObservatoryHybrid;
  window.PIRATE_OBSERVATORY_CONNECT_RUNTIME = connectPirateObservatoryFromRuntime;
  window.PIRATE_OBSERVATORY_DISCONNECT = disconnectPirateObservatory;
  window.addEventListener('pocketmonster:session-ended', disconnectPirateObservatory);
  queueMicrotask(() => { void connectPirateObservatoryFromRuntime(); });
}
