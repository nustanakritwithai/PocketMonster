import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildWorldPosFrame,
} from '../world-presence-protocol.mjs';
import {
  PIRATE_LOCAL_PRESENCE_MESSAGE,
  createPirateSnapshotMessage,
  sanitizePirateLocalPresence,
  sanitizePirateWorldSnapshot,
} from '../pirate-presence-bridge-v900.mjs';
import {
  createMessageHost,
  createRemoteManager,
  loadPiratePresenceBundleHarness,
  seedRemotePlayer,
} from './fixtures/pirate-presence-bundle-harness.mjs';
import {
  ISLAND_ID,
  PRESENCE_ZONE,
  REMOTE_PLAYER_ID,
  movementSamples,
  richCastingSample,
  shortActionTimeline,
  shortAttackSample,
  snapshotFromPublishedFrame,
} from './fixtures/remote-animation-scenarios.mjs';

const actionMatrix = JSON.parse(fs.readFileSync(
  new URL('./fixtures/remote-animation-action-matrix.json', import.meta.url),
  'utf8',
));
const { bundleUrl, PresenceRuntime, RemotePlayerManager } = loadPiratePresenceBundleHarness();

function runtimeOptions({ host, remotePlayers, poseRef, islandRef, clock }) {
  const currentPose = () => poseRef.current;
  return {
    host,
    remotePlayers,
    targetOrigin: host.targetOrigin,
    now: () => clock.now,
    publishIntervalMs: 50,
    getIslandId: () => islandRef.current,
    getPosition: currentPose,
    getHeading: () => currentPose().dir,
    getLocomotion: () => currentPose().locomotion,
    getAnimation: () => currentPose().animation,
    getPresence: currentPose,
    getPresenceState: currentPose,
    getPose: currentPose,
    getPlayerState: currentPose,
    heightAt: () => 0,
  };
}

function publishTimeline(timeline) {
  const host = createMessageHost();
  const clock = { now: 10_000 };
  const poseRef = { current: timeline[0].pose };
  const islandRef = { current: ISLAND_ID };
  const remotePlayers = { setIsland() {}, applyPresence() {}, remove() {} };
  const runtime = new PresenceRuntime(runtimeOptions({ host, remotePlayers, poseRef, islandRef, clock }));
  runtime.start();
  for (const entry of timeline.slice(1)) {
    poseRef.current = entry.pose;
    clock.now = 10_000 + entry.atMs;
    runtime.update();
  }
  runtime.dispose();
  return host.posted.map(item => item.message);
}

function publishSamples(samples) {
  return publishTimeline(samples.map((pose, index) => ({ atMs: index * 100, pose })));
}

function parentRoundTrip(localMessage) {
  const localPose = sanitizePirateLocalPresence(localMessage);
  if (!localPose) return null;
  const frame = buildWorldPosFrame({ zone: PRESENCE_ZONE, ...localPose });
  if (!frame) return null;
  return sanitizePirateWorldSnapshot(snapshotFromPublishedFrame(frame));
}

function createReceiver({ clock = { now: 20_000 }, seed = true } = {}) {
  const host = createMessageHost();
  const animatorEvents = [];
  const islandRef = { current: ISLAND_ID };
  const poseRef = { current: movementSamples[0] };
  const manager = createRemoteManager(RemotePlayerManager, ISLAND_ID, animatorEvents, clock);
  if (seed) seedRemotePlayer(manager, REMOTE_PLAYER_ID, ISLAND_ID, animatorEvents, clock.now);
  const runtime = new PresenceRuntime(runtimeOptions({ host, remotePlayers: manager, poseRef, islandRef, clock }));
  runtime.start();
  host.posted.length = 0;
  return { host, animatorEvents, islandRef, manager, runtime, clock };
}

function sendSnapshot(receiver, snapshot) {
  receiver.host.dispatch(createPirateSnapshotMessage(snapshot));
  receiver.manager.update(1 / 60);
}

const results = [];
function check(name, assertion) {
  try {
    assertion();
    results.push({ name, status: 'PASS' });
  } catch (error) {
    results.push({ name, status: 'FAIL', detail: error.message });
  }
}
function pending(name, detail) {
  results.push({ name, status: 'PENDING', detail });
}

assert.equal(actionMatrix.contractStatus, 'accepted-sol-g1');
assert.ok(actionMatrix.rows.length >= 13, 'per-action matrix covers locomotion, attacks, skills, reactions, and death');
assert.ok(actionMatrix.rows.every(row => row.candidateStatus === 'pending-candidate'));
assert.equal(actionMatrix.browserEvidence, 'not-tested-by-team');

const movementFrames = publishSamples(movementSamples);
check('movement publisher preserves x/z/dir', () => {
  assert.deepEqual(
    movementFrames.map(frame => ({ x: frame.x, z: frame.z, dir: frame.dir })),
    movementSamples.map(sample => ({ x: sample.x, z: sample.z, dir: sample.dir })),
  );
});
const movementReceiver = createReceiver();
for (const frame of movementFrames) {
  const snapshot = parentRoundTrip(frame);
  assert.ok(snapshot, 'movement frame must survive the parent protocol');
  sendSnapshot(movementReceiver, snapshot);
}
check('movement and facing remain independent from pose delivery', () => {
  const remote = movementReceiver.manager.players.get(REMOTE_PLAYER_ID);
  assert.equal(remote.target.x, movementSamples[1].x);
  assert.equal(remote.target.z, movementSamples[1].z);
  assert.equal(remote.targetHeading, movementSamples[1].dir);
  assert.equal(remote.locomotion, 'run', 'baseline movement inference remains intact');
  assert.equal(movementReceiver.animatorEvents.at(-1)?.state.locomotion, 'run');
});
movementReceiver.runtime.dispose();

const [shortActionFrame] = publishSamples([shortAttackSample]);
const shortActionSnapshot = parentRoundTrip(shortActionFrame);
const actionReceiver = createReceiver();
if (shortActionSnapshot) sendSnapshot(actionReceiver, shortActionSnapshot);
const animatorState = actionReceiver.animatorEvents.at(-1)?.state;

check('short canonical attack leaves the real Pirate publisher', () => {
  assert.deepEqual(shortActionFrame.animation, shortAttackSample.animation);
});
check('short canonical attack survives parent protocol and neutral JSON relay', () => {
  assert.deepEqual(shortActionSnapshot?.players[0]?.animation, shortAttackSample.animation);
});
check('short canonical attack reaches the real remote animator boundary', () => {
  assert.equal(animatorState?.combatState, 'attack1');
  assert.equal(animatorState?.category, 'sword');
  assert.equal(animatorState?.attackProgress, 0.35);
  assert.equal(animatorState?.actionSessionId, 'session_a_20260905');
  assert.equal(animatorState?.actionSequence, 1);
  assert.equal(animatorState?.actionDurationMs, 100);
  assert.equal(actionReceiver.manager.players.get(REMOTE_PLAYER_ID)?.target.y, shortAttackSample.y);
});
actionReceiver.runtime.dispose();

const richActionFrame = publishSamples([richCastingSample])[0];
const richActionReceiver = createReceiver();
const richActionSnapshot = parentRoundTrip(richActionFrame);
if (richActionSnapshot) sendSnapshot(richActionReceiver, richActionSnapshot);
check('height and rich animation details reach the animator without semantic clamping', () => {
  const state = richActionReceiver.animatorEvents.at(-1)?.state;
  assert.equal(richActionReceiver.manager.players.get(REMOTE_PLAYER_ID)?.target.y, richCastingSample.y);
  assert.deepEqual(state, { ...richCastingSample.animation, locomotion: richCastingSample.locomotion });
});
richActionReceiver.runtime.dispose();

check('duplicate player entries are bounded and first-wins', () => {
  const snapshot = sanitizePirateWorldSnapshot({
    zone: PRESENCE_ZONE,
    players: [
      { id: REMOTE_PLAYER_ID, name: 'First', x: 1, z: 2, dir: 0.4 },
      { id: REMOTE_PLAYER_ID, name: 'Duplicate', x: 99, z: 99, dir: -2 },
    ],
  });
  assert.equal(snapshot.players.length, 1);
  assert.equal(snapshot.players[0].name, 'First');
  assert.equal(snapshot.players[0].x, 1);
});
check('duplicate action snapshots retain one stable action identity at the animator boundary', () => {
  const receiver = createReceiver();
  const snapshot = sanitizePirateWorldSnapshot(snapshotFromPublishedFrame({
    zone: PRESENCE_ZONE,
    ...shortAttackSample,
  }));
  sendSnapshot(receiver, snapshot);
  sendSnapshot(receiver, snapshot);
  const states = receiver.animatorEvents.slice(-2).map(event => event.state);
  assert.equal(states.length, 2);
  assert.deepEqual(
    states.map(state => [state.actionSessionId, state.actionSequence]),
    [['session_a_20260905', 1], ['session_a_20260905', 1]],
    'a duplicate must not acquire a fresh action identity before the production animator sees it',
  );
  receiver.runtime.dispose();
});

check('invalid input fails closed without poisoning a valid snapshot', () => {
  const invalid = sanitizePirateWorldSnapshot({
    zone: PRESENCE_ZONE,
    players: [
      { id: 'nan', x: Number.NaN, z: 0, dir: 0 },
      { id: 'infinite', x: 0, z: Number.POSITIVE_INFINITY, dir: 0 },
      { id: 'valid', x: 2, z: 3, dir: 0, locomotion: 'teleport', animation: { combatState: 'unknown' } },
    ],
  });
  assert.deepEqual(snapshotIds(invalid), ['valid']);
  assert.equal(invalid.players[0].locomotion, 'idle');
  assert.equal(invalid.players[0].animation, null, 'invalid required animation enums fail to null, not fake idle');
  const incompleteIdentity = sanitizePirateWorldSnapshot({
    zone: PRESENCE_ZONE,
    players: [{
      id: 'partial-action',
      x: 1,
      z: 2,
      animation: {
        combatState: 'attack1',
        category: 'sword',
        actionSessionId: 'session_a_20260905',
      },
    }],
  }).players[0].animation;
  assert.equal(incompleteIdentity.combatState, 'attack1');
  assert.equal('actionSessionId' in incompleteIdentity, false, 'an incomplete identity trio is stripped as a unit');
  const oversized = Array.from({ length: 401 }, (_, index) => ({ id: `p-${index}`, x: index, z: 0 }));
  assert.equal(sanitizePirateWorldSnapshot({ zone: PRESENCE_ZONE, players: oversized }), null);
  assert.equal(publishSamples([{ ...movementSamples[0], x: Number.NaN }]).length, 0);
});

function snapshotIds(snapshot) {
  return snapshot?.players.map(player => player.id) ?? [];
}

check('wrong-zone snapshots are ignored and zone changes clear remote avatars', () => {
  const receiver = createReceiver();
  const before = receiver.manager.players.get(REMOTE_PLAYER_ID).target.clone();
  receiver.host.dispatch({
    type: 'pocketmonster:pirate-presence-snapshot-v1',
    payload: { zone: 'different-zone', players: [{ id: REMOTE_PLAYER_ID, x: 50, z: 50, dir: 2 }] },
  });
  assert.deepEqual(receiver.manager.players.get(REMOTE_PLAYER_ID).target, before);
  receiver.islandRef.current = 'azure-frost';
  receiver.clock.now += 100;
  receiver.runtime.update();
  assert.equal(receiver.manager.count, 0);
  receiver.runtime.dispose();
});

check('empty snapshots and disposal clean up remote avatars and listeners', () => {
  const receiver = createReceiver();
  const snapshot = parentRoundTrip(movementFrames[0]);
  sendSnapshot(receiver, snapshot);
  assert.equal(receiver.manager.count, 1);
  sendSnapshot(receiver, sanitizePirateWorldSnapshot({ zone: PRESENCE_ZONE, players: [] }));
  assert.equal(receiver.manager.count, 0);
  receiver.runtime.dispose();
  assert.equal(receiver.host.listenerCount, 0);
});

check('reconnect starts without a stale avatar or stale listener', () => {
  const first = createReceiver();
  sendSnapshot(first, parentRoundTrip(movementFrames[0]));
  first.runtime.dispose();
  assert.equal(first.manager.count, 0);
  assert.equal(first.host.listenerCount, 0);
  const second = createReceiver({ seed: false });
  assert.equal(second.manager.count, 0);
  assert.equal(second.host.listenerCount, 1);
  first.host.dispatch(createPirateSnapshotMessage(parentRoundTrip(movementFrames[0])));
  assert.equal(second.manager.count, 0, 'disposed connection cannot leak a stale snapshot into the new runtime');
  second.runtime.dispose();
});

check('100 ms action is latched for at least 750 ms, then returns to current idle', () => {
  const frames = publishTimeline(shortActionTimeline);
  assert.equal(frames.length, shortActionTimeline.length);
  for (const index of [0, 1, 2]) {
    assert.equal(frames[index].animation?.combatState, 'attack1', `latched frame ${index} keeps the short attack`);
    assert.equal(frames[index].animation?.actionSessionId, 'session_a_20260905');
    assert.equal(frames[index].animation?.actionSequence, 1);
  }
  assert.equal(frames[3].animation?.combatState, 'idle', 'publisher releases the latch after the minimum window');
  assert.equal('actionSessionId' in frames[3].animation, false);
});
for (const row of actionMatrix.rows) {
  pending(`per-action candidate matrix: ${row.action}`, 'candidate not integrated; Browser result not claimed');
}

for (const result of results) {
  const detail = result.detail ? ` — ${result.detail}` : '';
  console.log(`${result.status.padEnd(7)} ${result.name}${detail}`);
}
console.log(`Bundle under test: ${bundleUrl.pathname}`);

const failures = results.filter(result => result.status === 'FAIL');
if (failures.length > 0) {
  assert.fail(`${failures.length} remote-animation integration assertion(s) failed on this candidate`);
}

console.log('V9.0 remote animation two-player round trip: PASS');
