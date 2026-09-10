import { PIRATE_OBSERVATORY_SCHEMA_VERSION, assertPartition } from './protocol.mjs';

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  return value;
}

export function buildPartitionSnapshot({ readModel, partition, entityIds = null, generatedAt = Date.now() }) {
  if (!readModel?.snapshotPartition) throw new TypeError('readModel.snapshotPartition is required');
  const target = assertPartition(partition);
  const base = readModel.snapshotPartition(target);
  const allow = entityIds ? new Set(entityIds) : null;
  const entities = allow ? base.entities.filter(entity => allow.has(entity.id)) : base.entities;
  return Object.freeze({
    schemaVersion: PIRATE_OBSERVATORY_SCHEMA_VERSION,
    snapshotId: `${target}:${base.tick}:${base.sequence}`,
    generatedAt,
    partition: target,
    tick: base.tick,
    sequence: base.sequence,
    region: cloneValue(base.region),
    entities: entities.map(cloneValue),
  });
}
