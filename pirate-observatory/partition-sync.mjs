import { CHANGE_TYPES, PIRATE_OBSERVATORY_SCHEMA_VERSION, SYNC_STATES, assertPartition } from './protocol.mjs';

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  return value;
}

function validateChanges(packet) {
  if (!Array.isArray(packet.changes) || packet.changes.length === 0) return false;
  let previous = packet.baseSequence;
  for (const change of packet.changes) {
    if (!Number.isSafeInteger(change?.sequence) || change.sequence <= previous || change.sequence > packet.sequence) return false;
    previous = change.sequence;
  }
  return previous === packet.sequence;
}

export class PartitionSync {
  constructor(partition) {
    this.partition = assertPartition(partition);
    this.sequence = 0;
    this.tick = 0;
    this.state = SYNC_STATES.SYNCING;
    this.entities = new Map();
    this.staleChangeCount = 0;
    this.lastSnapshotId = null;
  }

  applySnapshot(snapshot) {
    if (snapshot?.schemaVersion !== PIRATE_OBSERVATORY_SCHEMA_VERSION) return { ok: false, reason: 'SCHEMA_MISMATCH' };
    if (snapshot.partition !== this.partition) return { ok: false, reason: 'PARTITION_MISMATCH' };
    if (!Number.isSafeInteger(snapshot.sequence) || snapshot.sequence < 0 || !Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0) return { ok: false, reason: 'INVALID_SEQUENCE' };

    this.entities.clear();
    for (const entity of snapshot.entities ?? []) {
      if (!entity?.id) continue;
      this.entities.set(entity.id, cloneValue(entity));
    }
    this.sequence = snapshot.sequence;
    this.tick = snapshot.tick;
    this.lastSnapshotId = snapshot.snapshotId ?? null;
    this.state = SYNC_STATES.LIVE;
    this.staleChangeCount = 0;
    return { ok: true, snapshot: true };
  }

  applyDelta(packet) {
    if (packet?.schemaVersion !== PIRATE_OBSERVATORY_SCHEMA_VERSION) return { ok: false, reason: 'SCHEMA_MISMATCH' };
    if (packet.partition !== this.partition) return { ok: false, reason: 'PARTITION_MISMATCH' };
    if (!Number.isSafeInteger(packet.sequence) || !Number.isSafeInteger(packet.baseSequence) || !Number.isSafeInteger(packet.tick)
      || packet.sequence < 0 || packet.baseSequence < 0 || packet.tick < 0 || packet.sequence <= packet.baseSequence) {
      return { ok: false, reason: 'INVALID_SEQUENCE' };
    }

    if (packet.sequence <= this.sequence) return { ok: true, duplicate: true };
    if (packet.baseSequence !== this.sequence) {
      this.state = SYNC_STATES.DESYNC;
      return { ok: false, reason: 'SEQUENCE_GAP', expectedBase: this.sequence, receivedBase: packet.baseSequence, receivedSequence: packet.sequence };
    }
    if (!validateChanges(packet)) {
      this.state = SYNC_STATES.DESYNC;
      return { ok: false, reason: 'INVALID_DELTA' };
    }

    for (const change of packet.changes) this.#applyChange(change);
    this.sequence = packet.sequence;
    this.tick = Math.max(this.tick, packet.tick);
    this.state = SYNC_STATES.LIVE;
    return { ok: true };
  }

  markCatchingUp() { this.state = SYNC_STATES.CATCHING_UP; }
  markSyncing() { this.state = SYNC_STATES.SYNCING; }
  markDelayed() { if (this.state === SYNC_STATES.LIVE) this.state = SYNC_STATES.DELAYED; }
  markOffline() { this.state = SYNC_STATES.OFFLINE; }

  #applyChange(change) {
    switch (change.type) {
      case CHANGE_TYPES.SPAWN:
        this.entities.set(change.entity, { id: change.entity, partition: this.partition, ...cloneValue(change.after ?? {}) });
        return;
      case CHANGE_TYPES.DESPAWN:
        this.entities.delete(change.entity);
        return;
      case CHANGE_TYPES.MOVE: {
        const entity = this.entities.get(change.entity);
        if (!entity) { this.staleChangeCount += 1; return; }
        if (change.after && typeof change.after === 'object') Object.assign(entity, cloneValue(change.after));
        return;
      }
      case CHANGE_TYPES.DAMAGE:
      case CHANGE_TYPES.HEAL: {
        const entity = this.entities.get(change.entity);
        if (!entity) { this.staleChangeCount += 1; return; }
        if (change.after && typeof change.after === 'object') Object.assign(entity, cloneValue(change.after));
        else if (Number.isFinite(change.after)) entity.hp = change.after;
        return;
      }
      case CHANGE_TYPES.STATE_CHANGE: {
        const entity = this.entities.get(change.entity);
        if (!entity) { this.staleChangeCount += 1; return; }
        if (change.after && typeof change.after === 'object') Object.assign(entity, cloneValue(change.after));
        else entity.state = change.after;
        return;
      }
      default:
        return;
    }
  }
}

export async function recoverPartition(sync, transport) {
  sync.markCatchingUp();
  const catchUp = await transport.getChangesAfter(sync.partition, sync.sequence);
  if (catchUp?.complete) {
    let caughtUp = true;
    for (const packet of catchUp.packets ?? []) {
      const result = sync.applyDelta(packet);
      if (!result.ok) { caughtUp = false; break; }
    }
    if (caughtUp && sync.state === SYNC_STATES.LIVE) return { ok: true, mode: 'catch-up' };
  }

  sync.markSyncing();
  const snapshot = await transport.getPartitionSnapshot(sync.partition);
  const result = sync.applySnapshot(snapshot);
  return result.ok ? { ok: true, mode: 'snapshot' } : result;
}
