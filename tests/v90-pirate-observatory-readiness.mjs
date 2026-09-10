import assert from 'node:assert/strict';
import { PirateObservatoryRestSession, SYNC_STATES } from '../pirate-observatory/index.mjs';

let now = 1000;
let ready = false;
let statusCalls = 0;
let snapshotCalls = 0;
let changesCalls = 0;
const states = [];

const transport = {
  async getStatus() {
    statusCalls += 1;
    return {
      schemaVersion: 1,
      ready,
      code: ready ? 'OK' : 'OBSERVATORY_NOT_READY',
      lastObservedTick: ready ? 10 : -1,
      mode: ready ? 'authoritative-world-tick' : 'waiting-authority',
    };
  },
  async getPartitionSnapshot(partition) {
    snapshotCalls += 1;
    return {
      schemaVersion: 1,
      snapshotId: `${partition}:10:5`,
      partition,
      tick: 10,
      sequence: 5,
      entities: [{ id: 'ship:ready', type: 'ship', partition, x: 1, z: 2, hp: 100 }],
    };
  },
  async getChangesAfter(partition, afterSequence) {
    changesCalls += 1;
    return { complete: true, code: 'OK', partition, requestedAfterSequence: afterSequence, latestSequence: afterSequence, packets: [] };
  },
};

const acceptedSnapshots = [];
const session = new PirateObservatoryRestSession({
  transport,
  partition: 'pirate-fruit',
  pollMs: 500,
  notReadyPollMs: 3000,
  now: () => now,
  onSnapshot(snapshot) { acceptedSnapshots.push(snapshot); return { ok: true }; },
  onState(state, detail) { states.push({ state, detail }); },
});

const bootstrap = await session.bootstrap();
assert.equal(bootstrap.ok, false);
assert.equal(bootstrap.waitingForAuthority, true);
assert.equal(session.waitingForAuthority, true);
assert.equal(statusCalls, 1);
assert.equal(snapshotCalls, 0);
assert.equal(changesCalls, 0);
assert.equal(states.at(-1).state, SYNC_STATES.SYNCING);
assert.equal(states.at(-1).detail.waitingForAuthority, true);

// Ordinary 500ms session ticks do not hammer the readiness route during the 3s backoff.
now = 1500;
const backoff1 = await session.pollOnce();
assert.equal(backoff1.reason, 'AUTHORITY_BACKOFF');
now = 3999;
const backoff2 = await session.pollOnce();
assert.equal(backoff2.reason, 'AUTHORITY_BACKOFF');
assert.equal(statusCalls, 1);
assert.equal(snapshotCalls, 0);

// At the readiness deadline the server is checked once. A ready authority triggers a clean snapshot resync.
now = 4000;
ready = true;
const activated = await session.pollOnce();
assert.equal(activated.ok, true);
assert.equal(activated.mode, 'resync');
assert.equal(statusCalls, 2);
assert.equal(snapshotCalls, 1);
assert.equal(acceptedSnapshots.length, 1);
assert.equal(session.waitingForAuthority, false);
assert.equal(session.sequence, 5);
assert.equal(session.tick, 10);
assert.equal(states.at(-1).state, SYNC_STATES.LIVE);

// Once live, the next ordinary poll uses deltas, not readiness status.
now = 4500;
const live = await session.pollOnce();
assert.equal(live.ok, true);
assert.equal(live.mode, 'delta');
assert.equal(changesCalls, 1);
assert.equal(statusCalls, 2);

console.log('v90 Pirate World Observatory readiness backoff: PASS');
