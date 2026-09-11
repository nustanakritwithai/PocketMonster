import { PIRATE_OBSERVATORY_SCHEMA_VERSION, assertPartition } from './protocol.mjs';

function assertSequence(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('sequence must be a non-negative safe integer');
  return value;
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function validateHistoryCheckpointList(value, partition) {
  if (value?.schemaVersion !== PIRATE_OBSERVATORY_SCHEMA_VERSION) return { ok: false, reason: 'SCHEMA_MISMATCH' };
  if (value.partition !== partition) return { ok: false, reason: 'PARTITION_MISMATCH' };
  if (value.available !== true || !Array.isArray(value.sequences)) return { ok: false, reason: 'HISTORY_UNAVAILABLE' };
  let previous = -1;
  for (const sequence of value.sequences) {
    if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence <= previous) return { ok: false, reason: 'INVALID_HISTORY_SEQUENCE' };
    previous = sequence;
  }
  return { ok: true };
}

export function validateHistoricalSnapshot(value, partition, targetSequence) {
  if (value?.schemaVersion !== PIRATE_OBSERVATORY_SCHEMA_VERSION) return { ok: false, reason: 'SCHEMA_MISMATCH' };
  if (value.partition !== partition) return { ok: false, reason: 'PARTITION_MISMATCH' };
  if (value.complete !== true || value.code !== 'OK') return { ok: false, reason: value?.code ?? 'HISTORY_INCOMPLETE' };
  if (value.targetSequence !== targetSequence || value.reconstructedSequence !== targetSequence) return { ok: false, reason: 'HISTORY_CURSOR_MISMATCH' };
  const snapshot = value.snapshot;
  if (snapshot?.schemaVersion !== PIRATE_OBSERVATORY_SCHEMA_VERSION
    || snapshot.partition !== partition
    || snapshot.sequence !== targetSequence
    || !Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0
    || !Array.isArray(snapshot.entities)) return { ok: false, reason: 'INVALID_HISTORICAL_SNAPSHOT' };
  return { ok: true };
}

export class PirateObservatoryHistorySession {
  constructor({
    transport,
    partition = 'pirate-fruit',
    onCheckpoints = () => {},
    onSnapshot = () => {},
    onStatus = () => {},
  } = {}) {
    if (!transport?.getHistoryCheckpoints || !transport?.getHistoricalSnapshot) {
      throw new TypeError('history transport methods are required');
    }
    this.transport = transport;
    this.partition = assertPartition(partition);
    this.onCheckpoints = onCheckpoints;
    this.onSnapshot = onSnapshot;
    this.onStatus = onStatus;
    this.checkpoints = Object.freeze([]);
    this.snapshot = null;
    this.requestGeneration = 0;
  }

  async refreshCheckpoints() {
    const generation = ++this.requestGeneration;
    this.onStatus({ state: 'loading-checkpoints' });
    try {
      const response = await this.transport.getHistoryCheckpoints(this.partition);
      if (generation !== this.requestGeneration) return { ok: false, reason: 'STALE_HISTORY_RESPONSE' };
      const validation = validateHistoryCheckpointList(response, this.partition);
      if (!validation.ok) {
        this.onStatus({ state: 'error', code: validation.reason });
        return validation;
      }
      this.checkpoints = Object.freeze([...response.sequences]);
      this.onCheckpoints(this.checkpoints, response);
      this.onStatus({ state: 'ready', code: response.code ?? 'OK', checkpointCount: this.checkpoints.length });
      return { ok: true, checkpoints: this.checkpoints };
    } catch (error) {
      if (generation !== this.requestGeneration) return { ok: false, reason: 'STALE_HISTORY_RESPONSE' };
      const reason = error?.code ?? 'HISTORY_REQUEST_FAILED';
      this.onStatus({ state: 'error', code: reason, status: error?.status ?? null });
      return { ok: false, reason, error };
    }
  }

  async loadSequence(sequence) {
    const target = assertSequence(sequence);
    const generation = ++this.requestGeneration;
    this.onStatus({ state: 'loading-snapshot', targetSequence: target });
    try {
      const response = await this.transport.getHistoricalSnapshot(this.partition, target);
      if (generation !== this.requestGeneration) return { ok: false, reason: 'STALE_HISTORY_RESPONSE' };
      const validation = validateHistoricalSnapshot(response, this.partition, target);
      if (!validation.ok) {
        this.onStatus({ state: 'error', code: validation.reason, targetSequence: target });
        return validation;
      }
      this.snapshot = Object.freeze(clone(response.snapshot));
      this.onSnapshot(this.snapshot, response);
      this.onStatus({ state: 'historical', code: 'OK', targetSequence: target });
      return { ok: true, snapshot: this.snapshot };
    } catch (error) {
      if (generation !== this.requestGeneration) return { ok: false, reason: 'STALE_HISTORY_RESPONSE' };
      const reason = error?.code ?? 'HISTORY_REQUEST_FAILED';
      this.onStatus({ state: 'error', code: reason, status: error?.status ?? null, targetSequence: target });
      return { ok: false, reason, error };
    }
  }

  clear() {
    this.requestGeneration++;
    this.checkpoints = Object.freeze([]);
    this.snapshot = null;
    this.onStatus({ state: 'idle' });
  }
}
