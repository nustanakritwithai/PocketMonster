import { PirateObservatoryDashboard } from './dashboard.mjs';
import { PirateObservatoryRestTransport } from './transport.mjs';
import { PirateObservatoryRestSession } from './rest-session.mjs';
import { resolvePirateObservatoryRuntimeContext } from './runtime-context.mjs';
import { SYNC_STATES } from './protocol.mjs';

let activeSession = null;

export async function connectPirateObservatoryRest({
  baseUrl,
  partition = 'pirate-fruit',
  headers = null,
  fetchImpl = globalThis.fetch,
  pollMs = 500,
  startPolling = true,
} = {}) {
  activeSession?.stop?.();
  const transport = new PirateObservatoryRestTransport({ baseUrl, headers, fetchImpl });
  const session = new PirateObservatoryRestSession({
    transport,
    partition,
    pollMs,
    onSnapshot: snapshot => PirateObservatoryDashboard.acceptSnapshot(snapshot),
    onDelta: packet => PirateObservatoryDashboard.acceptDelta(packet),
    onState: (state, detail = {}) => {
      const connected = detail.serverReachable ?? state !== SYNC_STATES.OFFLINE;
      PirateObservatoryDashboard.setServerStatus({
        connected,
        issues: state === SYNC_STATES.LIVE ? 0 : connected ? 1 : 0,
        tick: detail.tick,
      });
      PirateObservatoryDashboard.markPartition(partition, state);
    },
  });

  activeSession = session;
  const result = await session.bootstrap();
  if (startPolling && (result.ok || result.serverReachable)) session.start();
  return { ...result, transport, session };
}

export async function connectPirateObservatoryFromRuntime({
  partition = 'pirate-fruit',
  pollMs = 500,
  startPolling = true,
  windowLike = globalThis.window,
  storage = globalThis.sessionStorage,
  fetchImpl = globalThis.fetch,
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
    PirateObservatoryDashboard.setServerStatus({ connected: false, issues: 0 });
    PirateObservatoryDashboard.markPartition(partition, SYNC_STATES.OFFLINE);
    return context;
  }
  return connectPirateObservatoryRest({
    baseUrl: context.baseUrl,
    partition,
    headers: context.headers,
    fetchImpl,
    pollMs,
    startPolling,
  });
}

export function disconnectPirateObservatory() {
  activeSession?.stop?.();
  activeSession = null;
}

if (typeof window !== 'undefined') {
  window.PIRATE_OBSERVATORY_CONNECT_REST = connectPirateObservatoryRest;
  window.PIRATE_OBSERVATORY_CONNECT_RUNTIME = connectPirateObservatoryFromRuntime;
  window.PIRATE_OBSERVATORY_DISCONNECT = disconnectPirateObservatory;
  window.addEventListener('pocketmonster:session-ended', disconnectPirateObservatory);
  queueMicrotask(() => { void connectPirateObservatoryFromRuntime(); });
}
