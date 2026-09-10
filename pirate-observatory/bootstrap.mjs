import { PirateObservatoryDashboard } from './dashboard.mjs';
import { PirateObservatoryRestTransport } from './transport.mjs';
import { SYNC_STATES } from './protocol.mjs';

export function classifyObservatoryConnectError(error) {
  const code = error?.code ?? 'CONNECT_FAILED';
  if (code === 'OBSERVATORY_NOT_READY' || error?.status === 503) {
    return { reason: code, state: SYNC_STATES.SYNCING, serverReachable: true, retryable: true };
  }
  if (code === 'SCHEMA_MISMATCH' || code === 'PARTITION_MISMATCH') {
    return { reason: code, state: SYNC_STATES.DESYNC, serverReachable: true, retryable: false };
  }
  return { reason: code, state: SYNC_STATES.OFFLINE, serverReachable: false, retryable: true };
}

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
