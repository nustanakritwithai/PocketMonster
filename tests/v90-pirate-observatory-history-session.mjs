import assert from 'node:assert/strict';
import {
  PirateObservatoryHistorySession,
  validateHistoricalSnapshot,
  validateHistoryCheckpointList,
} from '../pirate-observatory/index.mjs';

const checkpoints = Object.freeze({
  schemaVersion: 1,
  available: true,
  code: 'OK',
  partition: 'pirate-fruit',
  sequences: [1, 3, 5],
});

const historical = Object.freeze({
  schemaVersion: 1,
  complete: true,
  code: 'OK',
  partition: 'pirate-fruit',
  targetSequence: 3,
  reconstructedSequence: 3,
  snapshot: {
    schemaVersion: 1,
    snapshotId: 'history:pirate-fruit:11:3',
    partition: 'pirate-fruit',
    tick: 11,
    sequence: 3,
    fingerprint: null,
    entities: [{ id: 'ship:history', partition: 'pirate-fruit', type: 'ship', x: 5, z: 0, hp: 80, hpMax: 100 }],
  },
});

assert.equal(validateHistoryCheckpointList(checkpoints, 'pirate-fruit').ok, true);
assert.equal(validateHistoryCheckpointList({ ...checkpoints, partition: 'other' }, 'pirate-fruit').reason, 'PARTITION_MISMATCH');
assert.equal(validateHistoryCheckpointList({ ...checkpoints, sequences: [1, 1] }, 'pirate-fruit').reason, 'INVALID_HISTORY_SEQUENCE');
assert.equal(validateHistoricalSnapshot(historical, 'pirate-fruit', 3).ok, true);
assert.equal(validateHistoricalSnapshot({ ...historical, targetSequence: 2 }, 'pirate-fruit', 3).reason, 'HISTORY_CURSOR_MISMATCH');
assert.equal(validateHistoricalSnapshot({ ...historical, snapshot: { ...historical.snapshot, sequence: 4 } }, 'pirate-fruit', 3).reason, 'INVALID_HISTORICAL_SNAPSHOT');

const calls = [];
const statuses = [];
const seenSnapshots = [];
const session = new PirateObservatoryHistorySession({
  partition: 'pirate-fruit',
  transport: {
    async getHistoryCheckpoints(partition) {
      calls.push(['checkpoints', partition]);
      return checkpoints;
    },
    async getHistoricalSnapshot(partition, sequence) {
      calls.push(['snapshot', partition, sequence]);
      return historical;
    },
  },
  onStatus: status => statuses.push(status),
  onSnapshot: snapshot => seenSnapshots.push(snapshot),
});

const listed = await session.refreshCheckpoints();
assert.equal(listed.ok, true);
assert.deepEqual(listed.checkpoints, [1, 3, 5]);
assert.deepEqual(calls[0], ['checkpoints', 'pirate-fruit']);

const loaded = await session.loadSequence(3);
assert.equal(loaded.ok, true);
assert.equal(loaded.snapshot.sequence, 3);
assert.equal(loaded.snapshot.entities[0].hp, 80);
assert.equal(session.snapshot.sequence, 3);
assert.equal(seenSnapshots.length, 1);
assert.deepEqual(calls[1], ['snapshot', 'pirate-fruit', 3]);
assert.equal(statuses.at(-1).state, 'historical');

// Detached history is cloned: mutating the transport fixture after load cannot
// mutate the stored historical snapshot.
historical.snapshot.entities[0].hp = 1;
assert.equal(session.snapshot.entities[0].hp, 80);

session.clear();
assert.equal(session.snapshot, null);
assert.deepEqual(session.checkpoints, []);

const disabled = new PirateObservatoryHistorySession({
  partition: 'pirate-fruit',
  transport: {
    async getHistoryCheckpoints() {
      const error = Object.assign(new Error('disabled'), { status: 503, code: 'HISTORY_DISABLED' });
      throw error;
    },
    async getHistoricalSnapshot() { throw new Error('unused'); },
  },
});
const disabledResult = await disabled.refreshCheckpoints();
assert.equal(disabledResult.ok, false);
assert.equal(disabledResult.reason, 'HISTORY_DISABLED');

console.log('v90 Pirate World Observatory detached history session: PASS');
