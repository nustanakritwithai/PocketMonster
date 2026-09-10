import assert from 'node:assert/strict';
import {
  PIRATE_OBSERVATORY_SCHEMA_VERSION,
  STREAM_CHANNELS,
  createStreamEnvelope,
  routeObservatoryEnvelope,
} from '../pirate-observatory/index.mjs';

let received = null;
const envelope = createStreamEnvelope({
  channel: STREAM_CHANNELS.WORLD_DELTA,
  partition: 'pirate-fruit',
  tick: 12,
  sequence: 3,
  serverTime: 123,
  payload: {
    partition: 'pirate-fruit',
    baseSequence: 1,
    sequence: 3,
    tick: 12,
    changes: [{ sequence: 3, type: 'MOVE', entity: 'ship_1', after: { x: 5, z: 6 } }],
  },
});
const routed = routeObservatoryEnvelope(envelope, {
  onDelta(payload, meta) { received = { payload, meta }; },
});
assert.equal(routed.ok, true);
assert.equal(routed.handled, true);
assert.equal(received.payload.sequence, 3);
assert.equal(received.meta.serverTime, 123);

const wrongSchema = routeObservatoryEnvelope({ ...envelope, schemaVersion: PIRATE_OBSERVATORY_SCHEMA_VERSION + 1 });
assert.equal(wrongSchema.reason, 'SCHEMA_MISMATCH');

const wrongPartition = routeObservatoryEnvelope({
  ...envelope,
  payload: { ...envelope.payload, partition: 'north-sea' },
});
assert.equal(wrongPartition.reason, 'PARTITION_MISMATCH');

const wrongSequence = routeObservatoryEnvelope({
  ...envelope,
  payload: { ...envelope.payload, sequence: 2 },
});
assert.equal(wrongSequence.reason, 'SEQUENCE_MISMATCH');

const unsupported = routeObservatoryEnvelope({ ...envelope, channel: 'world.secret' });
assert.equal(unsupported.reason, 'CHANNEL_UNSUPPORTED');

console.log('v90 Pirate World Observatory stream router: PASS');
