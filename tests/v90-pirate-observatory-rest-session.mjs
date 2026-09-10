import assert from 'node:assert/strict';
import { PirateObservatoryRestSession, SYNC_STATES } from '../pirate-observatory/index.mjs';

const snapshots = [];
const deltas = [];
const states = [];
let snapshotSequence = 1;
let changeResponse = {
  complete: true,
  code: 'OK',
  latestSequence: 3,
  packets: [{ partition: 'pirate-fruit', baseSequence: 1, sequence: 3, tick: 12, changes: [] }],
};

const transport = {
  async getPartitionSnapshot(partition) {
    assert.equal(partition, 'pirate-fruit');
    return { schemaVersion: 1, snapshotId: `pirate-fruit:10:${snapshotSequence}`, partition, tick: 10, sequence: snapshotSequence, entities: [] };
  },
  async getChangesAfter(partition, afterSequence) {
    assert.equal(partition, 'pirate-fruit');
    assert.equal(afterSequence, snapshotSequence);
    return changeResponse;
  },
};

const session = new PirateObservatoryRestSession({
  transport,
  partition: 'pirate-fruit',
  pollMs: 500,
  onSnapshot(snapshot) { snapshots.push(snapshot); return { ok: true }; },
  onDelta(packet) { deltas.push(packet); return { ok: true }; },
  onState(state, detail) { states.push({ state, detail }); },
});

const bootstrap = await session.bootstrap();
assert.equal(bootstrap.ok, true);
assert.equal(session.sequence, 1);
assert.equal(states.at(-1).state, SYNC_STATES.LIVE);

const poll = await session.pollOnce();
assert.equal(poll.ok, true);
assert.equal(poll.mode, 'delta');
assert.equal(session.sequence, 3);
assert.equal(deltas.length, 1);

// A server-declared incomplete catch-up forces a clean partition snapshot.
snapshotSequence = 8;
changeResponse = { complete: false, code: 'RESYNC_REQUIRED', latestSequence: 8, packets: [] };
// The previous successful poll moved the local cursor to 3; adapt the fake transport assertion.
transport.getChangesAfter = async (partition, afterSequence) => {
  assert.equal(partition, 'pirate-fruit');
  assert.equal(afterSequence, 3);
  return changeResponse;
};
const resync = await session.pollOnce();
assert.equal(resync.ok, true);
assert.equal(resync.mode, 'resync');
assert.equal(session.sequence, 8);
assert.equal(snapshots.length, 2);

// A packet whose base cursor does not match local state also falls back to snapshot.
snapshotSequence = 12;
transport.getChangesAfter = async () => ({
  complete: true,
  code: 'OK',
  latestSequence: 13,
  packets: [{ partition: 'pirate-fruit', baseSequence: 99, sequence: 13, tick: 13, changes: [] }],
});
const gapRecovery = await session.pollOnce();
assert.equal(gapRecovery.ok, true);
assert.equal(gapRecovery.mode, 'resync');
assert.equal(session.sequence, 12);
assert.ok(states.some(entry => entry.state === SYNC_STATES.DESYNC));

// Reachable server with no authoritative snapshot remains SYNCING and retryable.
const waitingStates = [];
const waitingSession = new PirateObservatoryRestSession({
  transport: {
    async getPartitionSnapshot() {
      const error = new Error('not ready');
      error.code = 'OBSERVATORY_NOT_READY';
      error.status = 503;
      throw error;
    },
    async getChangesAfter() { throw new Error('should not poll before explicit start'); },
  },
  onState(state, detail) { waitingStates.push({ state, detail }); },
});
const waiting = await waitingSession.bootstrap();
assert.equal(waiting.ok, false);
assert.equal(waiting.serverReachable, true);
assert.equal(waiting.retryable, true);
assert.equal(waitingStates.at(-1).state, SYNC_STATES.SYNCING);

session.stop();
assert.equal(states.at(-1).state, SYNC_STATES.OFFLINE);
console.log('v90 Pirate World Observatory REST session: PASS');
