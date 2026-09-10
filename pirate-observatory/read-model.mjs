import { CHANGE_TYPES, PIRATE_OBSERVATORY_SCHEMA_VERSION, assertPartition } from './protocol.mjs';

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  return value;
}

export class SequenceGapError extends Error {
  constructor(partition, expected, received) {
    super(`sequence gap for ${partition}: expected ${expected}, received ${received}`);
    this.name = 'SequenceGapError';
    this.partition = partition;
    this.expected = expected;
    this.received = received;
  }
}

export class CanonicalReadModel {
  constructor() {
    this.world = {};
    this.regions = new Map();
    this.entities = new Map();
    this.events = new Map();
    this.sequenceByPartition = new Map();
    this.tickByPartition = new Map();
  }

  lastSequence(partition = 'world') {
    return this.sequenceByPartition.get(assertPartition(partition)) ?? 0;
  }

  apply(event, { strictSequence = true } = {}) {
    const partition = assertPartition(event.partition ?? 'world');
    const last = this.lastSequence(partition);
    if (event.sequence <= last) return { applied: false, duplicate: true };
    if (strictSequence && event.sequence !== last + 1) {
      throw new SequenceGapError(partition, last + 1, event.sequence);
    }

    switch (event.type) {
      case CHANGE_TYPES.SPAWN:
        this.entities.set(event.entity, { id: event.entity, partition, ...cloneValue(event.after ?? {}) });
        break;
      case CHANGE_TYPES.DESPAWN:
        this.entities.delete(event.entity);
        break;
      case CHANGE_TYPES.MOVE: {
        const entity = this.entities.get(event.entity);
        if (entity && event.after && typeof event.after === 'object') Object.assign(entity, cloneValue(event.after));
        break;
      }
      case CHANGE_TYPES.DAMAGE:
      case CHANGE_TYPES.HEAL: {
        const entity = this.entities.get(event.entity);
        if (entity) {
          if (event.after && typeof event.after === 'object') Object.assign(entity, cloneValue(event.after));
          else if (Number.isFinite(event.after)) entity.hp = event.after;
        }
        break;
      }
      case CHANGE_TYPES.STATE_CHANGE: {
        const entity = this.entities.get(event.entity);
        if (entity) {
          if (event.after && typeof event.after === 'object') Object.assign(entity, cloneValue(event.after));
          else entity.state = event.after;
        }
        break;
      }
      case CHANGE_TYPES.EVENT_START:
        this.events.set(event.entity ?? event.eventId, cloneValue(event.after ?? {}));
        break;
      case CHANGE_TYPES.EVENT_END:
        this.events.delete(event.entity ?? event.eventId);
        break;
      default:
        break;
    }

    this.sequenceByPartition.set(partition, event.sequence);
    this.tickByPartition.set(partition, Math.max(this.tickByPartition.get(partition) ?? 0, event.tick ?? 0));
    return { applied: true, duplicate: false };
  }

  snapshotPartition(partition) {
    const target = assertPartition(partition);
    const entities = [];
    for (const entity of this.entities.values()) {
      if ((entity.partition ?? 'world') === target) entities.push(cloneValue(entity));
    }
    return Object.freeze({
      schemaVersion: PIRATE_OBSERVATORY_SCHEMA_VERSION,
      partition: target,
      tick: this.tickByPartition.get(target) ?? 0,
      sequence: this.lastSequence(target),
      region: cloneValue(this.regions.get(target) ?? null),
      entities,
    });
  }
}
