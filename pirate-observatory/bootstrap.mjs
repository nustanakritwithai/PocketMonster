import { PirateObservatoryDashboard } from './dashboard.mjs';
import { PirateObservatoryRestTransport } from './transport.mjs';
import { SYNC_STATES } from './protocol.mjs';
import { classifyObservatoryConnectError } from './connection-state.mjs';

export async function connectPirateObservatoryRest({
  baseUrl,
  partition = 'pirate-fruit',
  headers = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const transport = new PirateObservatoryRestTransport({ baseUrl, headers, fetchImpl });
  PirateObservatoryDashboard.setServerStatus({ connected: true });
  PirateObservatoryDashboard.markPartition(partition, SYNC_STATES.SYNCING);
  try {
    const snapshot = await transport.getPartitionSnapshot(partition);
    const result = PirateObservatoryDashboard.acceptSnapshot(snapshot);
    if (!result.ok) {
      PirateObservatoryDashboard.markPartition(partition, SYNC_STATES.DESYNC);
      return { ok: false, reason: result.reason, retryable: false, transport };
    }
    PirateObservatoryDashboard.setServerStatus({ connected: true, issues: 0 });
    return { ok: true, transport, snapshot };
  } catch (error) {
    const classified = classifyObservatoryConnectError(error);
    PirateObservatoryDashboard.setServerStatus({
      connected: classified.serverReachable,
      issues: classified.serverReachable ? 1 : 0,
    });
    PirateObservatoryDashboard.markPartition(partition, classified.state);
    return {
      ok: false,
      reason: classified.reason,
      retryable: classified.retryable,
      serverReachable: classified.serverReachable,
      error,
      transport,
    };
  }
}

if (typeof window !== 'undefined') {
  window.PIRATE_OBSERVATORY_CONNECT_REST = connectPirateObservatoryRest;
}
