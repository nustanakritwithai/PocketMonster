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
