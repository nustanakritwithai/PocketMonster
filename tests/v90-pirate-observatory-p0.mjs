import assert from 'node:assert/strict';
import {
  CHANGE_TYPES,
  PIRATE_OBSERVATORY_SCHEMA_VERSION,
  SYNC_STATES,
  ChangeJournal,
  PartitionSync,
  PirateObservatoryRuntime,
  SpatialIndex,
  buildDeltaPacket,
  createInterestSet,
  lodForZoom,
  recoverPartition,
} from '../pirate-observatory/index.mjs';

const event = (tick, type, extra = {}) => ({ tick, type, partition: 'south_sea', ...extra });

// Canonical runtime: WorldSim change -> journal -> read model -> spatial index.
{
  const runtime = new PirateObservatoryRuntime();
  const spawn = runtime.commit(event(1, CHANGE_TYPES.SPAWN, {
    eventId: 'spawn:ship_1', entity: 'ship_1', after: { type: 'ship', x: 10, z: 20, hp: 100, state: 'sailing' },
  }));
  assert.equal(spawn.appended, true);
  assert.equal(spawn.event.sequence, 1);
  assert.equal(runtime.readModel.entities.get('ship_1').hp, 100);
  assert.deepEqual([...runtime.spatialIndex.queryBounds({ partition: 'south_sea', minX: 0, maxX: 20, minZ: 0, maxZ: 30 })], ['ship_1']);

  runtime.commit(event(2, CHANGE_TYPES.MOVE, { entity: 'ship_1', after: { x: 30, z: 40 } }));
  runtime.commit(event(3, CHANGE_TYPES.DAMAGE, { entity: 'ship_1', after: 72 }));
  runtime.commit(event(4, CHANGE_TYPES.STATE_CHANGE, { entity: 'ship_1', after: 'combat' }));
  assert.equal(runtime.readModel.entities.get('ship_1').x, 30);
  assert.equal(runtime.readModel.entities.get('ship_1').hp, 72);
  assert.equal(runtime.readModel.entities.get('ship_1').state, 'combat');

  const duplicate = runtime.commit(event(5, CHANGE_TYPES.DAMAGE, { eventId: 'spawn:ship_1', entity: 'ship_1', after: 1 }));
  assert.equal(duplicate.appended, false);
  assert.equal(runtime.readModel.entities.get('ship_1').hp, 72);

  runtime.commit(event(5, CHANGE_TYPES.DESPAWN, { entity: 'ship_1' }));
  assert.equal(runtime.readModel.entities.has('ship_1'), false);
  assert.equal(runtime.spatialIndex.positions.has('ship_1'), false);
}

// Partition sequences are independent; global ordering still exists.
{
  const journal = new ChangeJournal();
  const south1 = journal.append({ tick: 1, partition: 'south_sea', type: CHANGE_TYPES.EVENT_START, entity: 'storm_s' }).event;
  const north1 = journal.append({ tick: 1, partition: 'north_sea', type: CHANGE_TYPES.EVENT_START, entity: 'storm_n' }).event;
  const south2 = journal.append({ tick: 2, partition: 'south_sea', type: CHANGE_TYPES.EVENT_END, entity: 'storm_s' }).event;
  assert.equal(south1.sequence, 1);
  assert.equal(north1.sequence, 1);
  assert.equal(south2.sequence, 2);
  assert.ok(south1.globalSequence < north1.globalSequence && north1.globalSequence < south2.globalSequence);
}

// Retention determines whether journal catch-up is still possible.
{
  const journal = new ChangeJournal({ retention: 2 });
  journal.append(event(1, CHANGE_TYPES.EVENT_START, { entity: 'a' }));
  journal.append(event(2, CHANGE_TYPES.EVENT_START, { entity: 'b' }));
  journal.append(event(3, CHANGE_TYPES.EVENT_START, { entity: 'c' }));
  assert.equal(journal.oldestRetainedSequence('south_sea'), 2);
  assert.equal(journal.canCatchUpFrom('south_sea', 0), false);
  assert.equal(journal.canCatchUpFrom('south_sea', 1), true);
}

// Delta batches may cover many journal events while coalescing redundant movement.
{
  const journal = new ChangeJournal();
  journal.append(event(1, CHANGE_TYPES.SPAWN, { entity: 'ship_2', after: { x: 0, z: 0 } }));
  journal.append(event(2, CHANGE_TYPES.MOVE, { entity: 'ship_2', after: { x: 1, z: 0 } }));
  journal.append(event(3, CHANGE_TYPES.MOVE, { entity: 'ship_2', after: { x: 2, z: 0 } }));
  journal.append(event(4, CHANGE_TYPES.DAMAGE, { entity: 'ship_2', after: 80 }));
  const packet = buildDeltaPacket({ partition: 'south_sea', baseSequence: 0, events: journal.afterPartition('south_sea', 0) });
  assert.equal(packet.baseSequence, 0);
  assert.equal(packet.sequence, 4);
  assert.equal(packet.changes.filter(change => change.type === CHANGE_TYPES.MOVE).length, 1);
  assert.equal(packet.changes.find(change => change.type === CHANGE_TYPES.MOVE).after.x, 2);
}

// Client sync applies a batched delta and detects duplicates/gaps safely.
{
  const runtime = new PirateObservatoryRuntime();
  runtime.commit(event(1, CHANGE_TYPES.SPAWN, { entity: 'ship_3', after: { type: 'ship', x: 5, z: 5, hp: 100 } }));
  const snapshot = runtime.snapshot('south_sea');
  const sync = new PartitionSync('south_sea');
  assert.equal(sync.applySnapshot(snapshot).ok, true);
  assert.equal(sync.state, SYNC_STATES.LIVE);
  assert.equal(sync.sequence, 1);

  runtime.commit(event(2, CHANGE_TYPES.MOVE, { entity: 'ship_3', after: { x: 8, z: 9 } }));
  runtime.commit(event(3, CHANGE_TYPES.DAMAGE, { entity: 'ship_3', after: 66 }));
  const packet = runtime.deltaAfter('south_sea', 1).packet;
  assert.equal(sync.applyDelta(packet).ok, true);
  assert.equal(sync.sequence, 3);
  assert.equal(sync.entities.get('ship_3').x, 8);
  assert.equal(sync.entities.get('ship_3').hp, 66);

  assert.equal(sync.applyDelta(packet).duplicate, true);
  const gap = sync.applyDelta({ ...packet, baseSequence: 99, sequence: 100 });
  assert.equal(gap.ok, false);
  assert.equal(gap.reason, 'SEQUENCE_GAP');
  assert.equal(sync.state, SYNC_STATES.DESYNC);
}

// Partition mismatch never mutates local state.
{
  const sync = new PartitionSync('south_sea');
  const result = sync.applySnapshot({ schemaVersion: PIRATE_OBSERVATORY_SCHEMA_VERSION, partition: 'north_sea', tick: 1, sequence: 0, entities: [] });
  assert.equal(result.reason, 'PARTITION_MISMATCH');
  assert.equal(sync.state, SYNC_STATES.SYNCING);
}

// Missing entity updates are counted as stale instead of resurrecting ghost entities.
{
  const sync = new PartitionSync('south_sea');
  sync.applySnapshot({ schemaVersion: PIRATE_OBSERVATORY_SCHEMA_VERSION, partition: 'south_sea', tick: 1, sequence: 1, entities: [] });
  const result = sync.applyDelta({
    schemaVersion: PIRATE_OBSERVATORY_SCHEMA_VERSION,
    partition: 'south_sea', baseSequence: 1, sequence: 2, tick: 2,
    changes: [{ sequence: 2, type: CHANGE_TYPES.MOVE, entity: 'ghost', after: { x: 10, z: 10 } }],
  });
  assert.equal(result.ok, true);
  assert.equal(sync.entities.has('ghost'), false);
  assert.equal(sync.staleChangeCount, 1);
}

// Recovery prefers journal catch-up, then falls back to a partition snapshot.
{
  const sync = new PartitionSync('south_sea');
  sync.applySnapshot({ schemaVersion: PIRATE_OBSERVATORY_SCHEMA_VERSION, partition: 'south_sea', tick: 1, sequence: 1, entities: [] });
  const result = await recoverPartition(sync, {
    async getChangesAfter() { return { complete: false, packets: [] }; },
    async getPartitionSnapshot() {
      return { schemaVersion: PIRATE_OBSERVATORY_SCHEMA_VERSION, snapshotId: 'south:5:5', partition: 'south_sea', tick: 5, sequence: 5, entities: [{ id: 'ship_5', x: 1, z: 1 }] };
    },
  });
  assert.deepEqual(result, { ok: true, mode: 'snapshot' });
  assert.equal(sync.sequence, 5);
  assert.equal(sync.entities.has('ship_5'), true);
}

// Interest Manager prioritizes selected/watched entities and respects viewport budget.
{
  const entities = new Map([
    ['player_1', { id: 'player_1', type: 'player', partition: 'south_sea', x: 0, z: 0 }],
    ['ship_1', { id: 'ship_1', type: 'ship', partition: 'south_sea', x: 20, z: 20 }],
    ['ship_far', { id: 'ship_far', type: 'ship', partition: 'south_sea', x: 5000, z: 5000 }],
  ]);
  const spatialIndex = new SpatialIndex({ cellSize: 64 });
  for (const entityValue of entities.values()) spatialIndex.update(entityValue);
  const interest = createInterestSet({
    spatialIndex, entities, partition: 'south_sea', viewport: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    watchedIds: ['ship_far'], selectedId: 'player_1', maxEntities: 2,
  });
  assert.equal(interest.has('ship_far'), true);
  assert.equal(interest.has('player_1'), true);
  assert.equal(interest.size, 2);
}

assert.equal(lodForZoom(0.2), 0);
assert.equal(lodForZoom(0.5), 1);
assert.equal(lodForZoom(1), 2);
assert.equal(lodForZoom(2), 3);

console.log('v90 Pirate World Observatory P0: PASS');
