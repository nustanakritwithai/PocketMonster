import { CHANGE_TYPES, PIRATE_OBSERVATORY_SCHEMA_VERSION, assertPartition } from './protocol.mjs';

export function coalesceChanges(events) {
  const output = [];
  const pendingMove = new Map();

  const flushMove = entityId => {
    const move = pendingMove.get(entityId);
    if (move) output.push(move);
    pendingMove.delete(entityId);
  };

  for (const event of events) {
    if (event.type === CHANGE_TYPES.MOVE && event.entity) {
      pendingMove.set(event.entity, event);
      continue;
    }
    if (event.entity) flushMove(event.entity);
    output.push(event);
  }

  for (const move of pendingMove.values()) output.push(move);
  output.sort((a, b) => a.sequence - b.sequence);
  return output;
}

export function buildDeltaPacket({ partition, baseSequence, events }) {
  const target = assertPartition(partition);
  if (!Number.isSafeInteger(baseSequence) || baseSequence < 0) throw new TypeError('baseSequence must be a non-negative safe integer');
  const filtered = events.filter(event => event.partition === target && event.sequence > baseSequence);
  if (filtered.length === 0) return null;

  filtered.sort((a, b) => a.sequence - b.sequence);
  const first = filtered[0];
  if (first.sequence !== baseSequence + 1) {
    throw new Error(`delta cannot bridge sequence gap: expected ${baseSequence + 1}, received ${first.sequence}`);
  }
  for (let index = 1; index < filtered.length; index += 1) {
    if (filtered[index].sequence !== filtered[index - 1].sequence + 1) {
      throw new Error(`delta events are not contiguous at ${filtered[index - 1].sequence} -> ${filtered[index].sequence}`);
    }
  }

  const last = filtered[filtered.length - 1];
  return Object.freeze({
    schemaVersion: PIRATE_OBSERVATORY_SCHEMA_VERSION,
    partition: target,
    baseSequence,
    sequence: last.sequence,
    tick: last.tick,
    changes: coalesceChanges(filtered),
  });
}
