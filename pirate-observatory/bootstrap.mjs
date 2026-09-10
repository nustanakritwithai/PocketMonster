import { PirateObservatoryDashboard } from './dashboard.mjs';
import { PirateObservatoryRestTransport } from './transport.mjs';
import { PirateObservatoryRestSession } from './rest-session.mjs';
import { SYNC_STATES } from './protocol.mjs';

export async function connectPirateObservatoryRest({
  baseUrl,
  partition = 'pirate-fruit',
  headers = null,
  fetchImpl = globalThis.fetch,
  pollMs = 500,
  startPolling = true,
} = {}) {
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

  const result = await session.bootstrap();
  if (startPolling && (result.ok || result.serverReachable)) session.start();
  return { ...result, transport, session };
}

if (typeof window !== 'undefined') {
  window.PIRATE_OBSERVATORY_CONNECT_REST = connectPirateObservatoryRest;
}
