import assert from 'node:assert/strict';
import {
  PirateObservatoryDebugModel,
  changedFieldsForObservatoryChange,
} from '../pirate-observatory/index.mjs';

const model = new PirateObservatoryDebugModel({ maxChanges: 3 });

assert.equal(model.acceptSnapshot({
  partition: 'pirate-fruit',
  tick: 10,
  sequence: 4,
  snapshotId: 'pirate-fruit:10:4',
  entities: [{ id: 'ship:a' }],
}).ok, true);
assert.equal(model.latestSnapshot().snapshotId, 'pirate-fruit:10:4');
assert.equal(model.latestSnapshot().entityCount, 1);

const packet = {
  partition: 'pirate-fruit',
  tick: 11,
  baseSequence: 4,
  sequence: 6,
  changes: [
    { partition: 'pirate-fruit', tick: 11, sequence: 5, type: 'MOVE', entity: 'ship:a', before: { x: 0, hp: 100, fingerprint: 'a' }, after: { x: 5, hp: 100, fingerprint: 'b' } },
    { partition: 'pirate-fruit', tick: 11, sequence: 6, type: 'DAMAGE', entity: 'ship:a', before: { x: 5, hp: 100 }, after: { x: 5, hp: 80 } },
  ],
};
assert.equal(model.acceptDelta(packet).ok, true);
assert.equal(model.latestSnapshot().tick, 11);
assert.equal(model.latestSnapshot().sequence, 6);
assert.deepEqual(model.recentChanges().map(change => change.sequence), [6, 5]);
assert.equal(model.latestChangeForEntity('ship:a').sequence, 6, 'entity diff should use the newest accepted journal change');

const moveFields = changedFieldsForObservatoryChange(packet.changes[0]);
assert.deepEqual(moveFields.map(field => field.key), ['x']);
assert.equal(moveFields[0].before, 0);
assert.equal(moveFields[0].after, 5);

assert.equal(model.acceptDelta({
  partition: 'pirate-fruit',
  tick: 12,
  sequence: 7,
  changes: [{ partition: 'pirate-fruit', tick: 12, sequence: 7, type: 'STATE_CHANGE', entity: 'ship:b', before: { state: 'idle' }, after: { state: 'moving' } }],
}).ok, true);
assert.deepEqual(model.recentChanges().map(change => change.sequence), [7, 6, 5]);

// A fresh canonical snapshot/resync invalidates post-snapshot deltas from that partition.
assert.equal(model.acceptSnapshot({
  partition: 'pirate-fruit',
  tick: 20,
  sequence: 20,
  snapshotId: 'pirate-fruit:20:20',
  entities: [],
}).ok, true);
assert.equal(model.recentChanges().length, 0);
assert.equal(model.latestChangeForEntity('ship:a'), null);
assert.equal(model.latestSnapshot().sequence, 20);

model.acceptDelta({
  partition: 'other',
  tick: 2,
  sequence: 1,
  changes: [{ partition: 'other', tick: 2, sequence: 1, type: 'SPAWN', entity: 'npc:1', before: null, after: { x: 1 } }],
});
model.clear();
assert.equal(model.latestSnapshot(), null);
assert.equal(model.recentChanges().length, 0);

assert.equal(model.acceptSnapshot({ partition: '', tick: 1, sequence: 1 }).reason, 'INVALID_SNAPSHOT');
assert.equal(model.acceptDelta({ partition: 'pirate-fruit', tick: -1, sequence: 1, changes: [] }).reason, 'INVALID_DELTA');

console.log('v90 Pirate World Observatory debug model: PASS');
