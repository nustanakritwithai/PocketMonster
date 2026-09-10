import { CHANGE_TYPE_SET, PIRATE_OBSERVATORY_SCHEMA_VERSION, assertPartition, assertTick } from './protocol.mjs';

function freezeEvent(event) {
  return Object.freeze({ ...event });
}

export class ChangeJournal {
  constructor({ retention = 50000 } = {}) {
    if (!Number.isSafeInteger(retention) || retention < 1) {
      throw new TypeError('retention must be a positive safe integer');
    }
    this.retention = retention;
    this.globalSequence = 0;
    this.partitionSequences = new Map();
    this.events = [];
    this.eventById = new Map();
  }

  append(change) {
    if (!change || typeof change !== 'object') throw new TypeError('change is required');
    assertTick(change.tick);
    const partition = assertPartition(change.partition ?? 'world');
    if (!CHANGE_TYPE_SET.has(change.type)) throw new TypeError(`unsupported change type: ${change.type}`);

    const nextPartitionSequence = (this.partitionSequences.get(partition) ?? 0) + 1;
    const eventId = change.eventId ?? `${partition}:${nextPartitionSequence}`;
    const duplicate = this.eventById.get(eventId);
    if (duplicate) return { appended: false, event: duplicate };

    const event = freezeEvent({
      schemaVersion: PIRATE_OBSERVATORY_SCHEMA_VERSION,
      eventId,
      globalSequence: ++this.globalSequence,
      sequence: nextPartitionSequence,
      tick: change.tick,
      partition,
      type: change.type,
      entity: change.entity ?? null,
      source: change.source ?? null,
      before: change.before ?? null,
      after: change.after ?? null,
      position: change.position ?? null,
      metadata: change.metadata ?? null,
      timestamp: change.timestamp ?? Date.now(),
    });

    this.partitionSequences.set(partition, nextPartitionSequence);
    this.events.push(event);
    this.eventById.set(eventId, event);
    this.#trim();
    return { appended: true, event };
  }

  latestSequence(partition = 'world') {
    return this.partitionSequences.get(assertPartition(partition)) ?? 0;
  }

  oldestRetainedSequence(partition = 'world') {
    const target = assertPartition(partition);
    const event = this.events.find(candidate => candidate.partition === target);
    return event?.sequence ?? this.latestSequence(target);
  }

  canCatchUpFrom(partition, sequence) {
    const target = assertPartition(partition);
    if (!Number.isSafeInteger(sequence) || sequence < 0) return false;
    const latest = this.latestSequence(target);
    if (sequence >= latest) return true;
    const oldest = this.oldestRetainedSequence(target);
    return sequence + 1 >= oldest;
  }

  afterPartition(partition, sequence, { limit = Infinity } = {}) {
    const target = assertPartition(partition);
    if (!Number.isSafeInteger(sequence) || sequence < 0) throw new TypeError('sequence must be a non-negative safe integer');
    const output = [];
    for (const event of this.events) {
      if (event.partition !== target || event.sequence <= sequence) continue;
      output.push(event);
      if (output.length >= limit) break;
    }
    return output;
  }

  #trim() {
    while (this.events.length > this.retention) {
      const removed = this.events.shift();
      this.eventById.delete(removed.eventId);
    }
  }
}
