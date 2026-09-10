import { PirateObservatoryDashboard } from './dashboard.mjs';
import { PirateObservatoryRestTransport } from './transport.mjs';
import { SYNC_STATES } from './protocol.mjs';

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
      return { ok: false, reason: result.reason, transport };
    }
    return { ok: true, transport, snapshot };
  } catch (error) {
    PirateObservatoryDashboard.setServerStatus({ connected: false });
    PirateObservatoryDashboard.markPartition(partition, SYNC_STATES.OFFLINE);
    return { ok: false, reason: error?.code ?? 'CONNECT_FAILED', error, transport };
  }
}

if (typeof window !== 'undefined') {
  window.PIRATE_OBSERVATORY_CONNECT_REST = connectPirateObservatoryRest;
}
