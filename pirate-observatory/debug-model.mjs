export function changedFieldsForObservatoryChange(change, maxFields = 12) {
  const before = change?.before && typeof change.before === 'object' ? change.before : {};
  const after = change?.after && typeof change.after === 'object' ? change.after : {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => key !== 'fingerprint');
  return keys
    .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .slice(0, maxFields)
    .map(key => Object.freeze({ key, before: before[key], after: after[key] }));
}

function validCursor(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export class PirateObservatoryDebugModel {
  constructor({ maxChanges = 80 } = {}) {
    if (!Number.isSafeInteger(maxChanges) || maxChanges < 1) throw new TypeError('maxChanges must be a positive safe integer');
    this.maxChanges = maxChanges;
    this.snapshots = new Map();
    this.changes = [];
  }

  acceptSnapshot(snapshot) {
    if (!snapshot?.partition || !validCursor(snapshot.tick) || !validCursor(snapshot.sequence)) {
      return { ok: false, reason: 'INVALID_SNAPSHOT' };
    }
    this.snapshots.set(snapshot.partition, Object.freeze({
      partition: snapshot.partition,
      tick: snapshot.tick,
      sequence: snapshot.sequence,
      snapshotId: snapshot.snapshotId ?? null,
      entityCount: Array.isArray(snapshot.entities) ? snapshot.entities.length : 0,
    }));
    this.changes = this.changes.filter(change => change.partition !== snapshot.partition);
    return { ok: true };
  }

  acceptDelta(packet) {
    if (!packet?.partition || !validCursor(packet.tick) || !validCursor(packet.sequence) || !Array.isArray(packet.changes)) {
      return { ok: false, reason: 'INVALID_DELTA' };
    }
    const previous = this.snapshots.get(packet.partition);
    this.snapshots.set(packet.partition, Object.freeze({
      partition: packet.partition,
      tick: packet.tick,
      sequence: packet.sequence,
      snapshotId: previous?.snapshotId ?? null,
      entityCount: previous?.entityCount ?? null,
    }));
    for (const change of [...packet.changes].reverse()) {
      if (!change || !validCursor(change.tick) || !validCursor(change.sequence)) continue;
      this.changes.unshift(Object.freeze({ partition: packet.partition, ...change }));
    }
    if (this.changes.length > this.maxChanges) this.changes.length = this.maxChanges;
    return { ok: true };
  }

  latestSnapshot() {
    return [...this.snapshots.values()].sort((a, b) => b.tick - a.tick || b.sequence - a.sequence)[0] ?? null;
  }

  recentChanges(limit = this.maxChanges) {
    return this.changes.slice(0, Math.max(0, limit));
  }

  latestChangeForEntity(entityId) {
    return this.changes.find(change => change.entity === entityId) ?? null;
  }
}
