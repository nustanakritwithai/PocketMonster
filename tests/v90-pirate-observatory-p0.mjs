import assert from 'node:assert/strict';
import {
  CHANGE_TYPES,
  PIRATE_OBSERVATORY_SCHEMA_VERSION,
  STREAM_CHANNELS,
  SYNC_STATES,
  PartitionSync,
  PirateObservatoryRestTransport,
  classifyObservatoryConnectError,
  createStreamEnvelope,
  recoverPartition,
} from '../pirate-observatory/index.mjs';

const snapshot = ({ partition = 'pirate-fruit', tick = 10, sequence = 1, entities = [] } = {}) => ({
  schemaVersion: PIRATE_OBSERVATORY_SCHEMA_VERSION,
  snapshotId: `${partition}:${tick}:${sequence}`,
  partition,
  tick,
  sequence,
  entities,
});

const delta = ({ partition = 'pirate-fruit', tick = 11, baseSequence = 1, sequence = 2, changes = [] } = {}) => ({
  schemaVersion: PIRATE_OBSERVATORY_SCHEMA_VERSION,
  partition,
  tick,
  baseSequence,
  sequence,
  changes,
});

// Snapshot establishes canonical local cursor.
{
  const sync = new PartitionSync('pirate-fruit');
  const result = sync.applySnapshot(snapshot({ entities: [{ id: 'ship_1', type: 'ship', partition: 'pirate-fruit', x: 1, z: 2, hp: 100 }] }));
  assert.equal(result.ok, true);
  assert.equal(sync.state, SYNC_STATES.LIVE);
  assert.equal(sync.sequence, 1);
  assert.equal(sync.entities.get('ship_1').hp, 100);
}

// One transport packet may cover several journal sequence numbers.
{
  const sync = new PartitionSync('pirate-fruit');
  sync.applySnapshot(snapshot({ entities: [{ id: 'ship_1', type: 'ship', partition: 'pirate-fruit', x: 1, z: 2, hp: 100 }] }));
  const packet = delta({
    tick: 12,
    baseSequence: 1,
    sequence: 3,
    changes: [
      { sequence: 2, type: CHANGE_TYPES.MOVE, entity: 'ship_1', after: { x: 4, z: 5 } },
      { sequence: 3, type: CHANGE_TYPES.DAMAGE, entity: 'ship_1', after: { hp: 72 } },
    ],
  });
  assert.equal(sync.applyDelta(packet).ok, true);
  assert.equal(sync.sequence, 3);
  assert.equal(sync.entities.get('ship_1').x, 4);
  assert.equal(sync.entities.get('ship_1').z, 5);
  assert.equal(sync.entities.get('ship_1').hp, 72);
  assert.equal(sync.applyDelta(packet).duplicate, true);
}

// Gap marks only the affected partition DESYNC and does not guess missing state.
{
  const sync = new PartitionSync('pirate-fruit');
  sync.applySnapshot(snapshot());
  const result = sync.applyDelta(delta({ baseSequence: 9, sequence: 10 }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'SEQUENCE_GAP');
  assert.equal(result.expectedBase, 1);
  assert.equal(sync.state, SYNC_STATES.DESYNC);
}

// A malformed batch cannot advance the partition cursor past unseen changes.
{
  const sync = new PartitionSync('pirate-fruit');
  sync.applySnapshot(snapshot());
  const result = sync.applyDelta(delta({
    baseSequence: 1,
    sequence: 3,
    changes: [{ sequence: 2, type: CHANGE_TYPES.SPAWN, entity: 'ghost-gap', after: { id: 'ghost-gap', x: 0, z: 0 } }],
  }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'INVALID_DELTA');
  assert.equal(sync.sequence, 1);
  assert.equal(sync.entities.has('ghost-gap'), false);
  assert.equal(sync.state, SYNC_STATES.DESYNC);
}

// Wrong partition and schema never mutate the client cursor.
{
  const sync = new PartitionSync('pirate-fruit');
  assert.equal(sync.applySnapshot(snapshot({ partition: 'north-sea' })).reason, 'PARTITION_MISMATCH');
  assert.equal(sync.sequence, 0);
  assert.equal(sync.applySnapshot({ ...snapshot(), schemaVersion: 999 }).reason, 'SCHEMA_MISMATCH');
  assert.equal(sync.sequence, 0);
}

// Stale entity changes never resurrect a ghost entity.
{
  const sync = new PartitionSync('pirate-fruit');
  sync.applySnapshot(snapshot());
  const result = sync.applyDelta(delta({
    changes: [{ sequence: 2, type: CHANGE_TYPES.MOVE, entity: 'ghost', after: { x: 9, z: 9 } }],
  }));
  assert.equal(result.ok, true);
  assert.equal(sync.entities.has('ghost'), false);
  assert.equal(sync.staleChangeCount, 1);
}

// Recovery first uses retained journal catch-up.
{
  const sync = new PartitionSync('pirate-fruit');
  sync.applySnapshot(snapshot());
  const result = await recoverPartition(sync, {
    async getChangesAfter(partition, sequence) {
      assert.equal(partition, 'pirate-fruit');
      assert.equal(sequence, 1);
      return { complete: true, packets: [delta({ changes: [{ sequence: 2, type: CHANGE_TYPES.SPAWN, entity: 'player_1', after: { id: 'player_1', type: 'player', x: 0, z: 0 } }] })] };
    },
    async getPartitionSnapshot() { throw new Error('snapshot fallback should not run'); },
  });
  assert.deepEqual(result, { ok: true, mode: 'catch-up' });
  assert.equal(sync.entities.has('player_1'), true);
}

// Expired journal falls back to a fresh partition checkpoint.
{
  const sync = new PartitionSync('pirate-fruit');
  sync.applySnapshot(snapshot());
  const result = await recoverPartition(sync, {
    async getChangesAfter() { return { complete: false, packets: [] }; },
    async getPartitionSnapshot() {
      return snapshot({ tick: 30, sequence: 30, entities: [{ id: 'ship_30', type: 'ship', partition: 'pirate-fruit', x: 30, z: 30 }] });
    },
  });
  assert.deepEqual(result, { ok: true, mode: 'snapshot' });
  assert.equal(sync.sequence, 30);
  assert.equal(sync.entities.has('ship_30'), true);
}

// Stream envelope contract stays explicit and versioned.
{
  const envelope = createStreamEnvelope({ channel: STREAM_CHANNELS.WORLD_DELTA, partition: 'pirate-fruit', tick: 5, sequence: 6, payload: { ok: true }, serverTime: 123 });
  assert.equal(envelope.schemaVersion, PIRATE_OBSERVATORY_SCHEMA_VERSION);
  assert.equal(envelope.partition, 'pirate-fruit');
  assert.equal(envelope.channel, 'world.delta');
}

// REST transport is read-only and anchors Observatory routes at the server API root.
{
  const calls = [];
  const transport = new PirateObservatoryRestTransport({
    baseUrl: 'https://server.example/game/',
    headers: () => ({ Authorization: 'Bearer test-only' }),
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return { ok: true, status: 200, async json() { return { ok: true }; } };
    },
  });
  await transport.getPartitionSnapshot('pirate-fruit');
  await transport.getChangesAfter('pirate-fruit', 12);
  await transport.getInterest({
    partition: 'pirate-fruit',
    viewport: { minX: -1, maxX: 2, minZ: -3, maxZ: 4 },
    zoom: 1.2,
    selectedId: 'ship_1',
    watchedIds: ['player_2'],
    includeTypes: ['ship'],
    maxEntities: 100,
  });
  assert.equal(new URL(calls[0].url).pathname, '/api/observatory/regions/pirate-fruit/snapshot');
  assert.equal(new URL(calls[1].url).searchParams.get('afterSequence'), '12');
  const interestUrl = new URL(calls[2].url);
  assert.equal(interestUrl.pathname, '/api/observatory/regions/pirate-fruit/interest');
  assert.equal(interestUrl.searchParams.get('selectedId'), 'ship_1');
  assert.equal(interestUrl.searchParams.get('watch'), 'player_2');
  assert.equal(interestUrl.searchParams.get('type'), 'ship');
  assert.equal(calls.every(call => call.options.method === 'GET'), true);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-only');
}

// Reachable-but-not-ready is SYNCING, not falsely OFFLINE or LIVE.
{
  const notReady = classifyObservatoryConnectError({ code: 'OBSERVATORY_NOT_READY', status: 503 });
  assert.deepEqual(notReady, {
    reason: 'OBSERVATORY_NOT_READY',
    state: SYNC_STATES.SYNCING,
    serverReachable: true,
    retryable: true,
  });
  const schema = classifyObservatoryConnectError({ code: 'SCHEMA_MISMATCH', status: 409 });
  assert.equal(schema.state, SYNC_STATES.DESYNC);
  assert.equal(schema.serverReachable, true);
  assert.equal(schema.retryable, false);
  const network = classifyObservatoryConnectError({ code: 'CONNECT_FAILED' });
  assert.equal(network.state, SYNC_STATES.OFFLINE);
  assert.equal(network.serverReachable, false);
}

console.log('v90 Pirate World Observatory client P0: PASS');
