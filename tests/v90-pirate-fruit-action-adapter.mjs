import assert from 'node:assert/strict';

import {
  PIRATE_FRUIT_RUN_SPEED,
  PIRATE_FRUIT_WALK_DISTANCE_SQ,
  createPirateFruitActionTracker,
} from '../asset-presentation/pirate-fruit-action-adapter.mjs';

function host(signal) {
  return { userData: signal === undefined ? {} : { pocketActionSignal: signal } };
}

const locomotion = createPirateFruitActionTracker();
assert.deepEqual(
  locomotion.sample(host(), 100, { distanceSq: 0, speed: 0 }),
  { locomotion: 'idle', action: null, actionId: null, duration: 0 },
);
assert.equal(PIRATE_FRUIT_RUN_SPEED, 5, 'the exported run threshold matches live Pirate Fruit movement');
assert.equal(
  locomotion.sample(host(), 101, { distanceSq: PIRATE_FRUIT_WALK_DISTANCE_SQ * 2, speed: 4 }).locomotion,
  'walk',
  'ordinary W speed walks',
);
assert.equal(
  locomotion.sample(host(), 102, { distanceSq: PIRATE_FRUIT_WALK_DISTANCE_SQ * 2, speed: PIRATE_FRUIT_RUN_SPEED }).locomotion,
  'walk',
  'movement at the run threshold still walks',
);
assert.equal(
  locomotion.sample(host(), 103, { distanceSq: PIRATE_FRUIT_WALK_DISTANCE_SQ * 2, speed: PIRATE_FRUIT_RUN_SPEED + 0.01 }).locomotion,
  'run',
  'movement above the run threshold runs',
);

for (const action of ['hurt', 'skill', 'attack-melee', 'attack-ranged']) {
  const tracker = createPirateFruitActionTracker();
  const source = host({ action, token: `${action}-1`, duration: 0.35, dead: false });
  const before = structuredClone(source);
  const first = tracker.sample(source, 200, { distanceSq: 1, speed: PIRATE_FRUIT_RUN_SPEED });
  const repeated = tracker.sample(source, 201, { distanceSq: 1, speed: PIRATE_FRUIT_RUN_SPEED });
  assert.equal(first.action, action);
  assert.equal(first.duration, 0.35);
  assert.ok(first.actionId, `${action} transition emits an id`);
  assert.equal(repeated.actionId, null, `${action} does not replay for the same token`);
  assert.deepEqual(source, before, 'sampling does not mutate the host');

  source.userData.pocketActionSignal = { action, token: `${action}-2`, duration: 0.4, dead: false };
  assert.ok(tracker.sample(source, 202, {}).actionId, `${action} emits when its token changes`);
}

const objectTokens = createPirateFruitActionTracker();
const firstObjectToken = { swing: 1 };
const objectSignal = host({ action: 'attack-melee', token: firstObjectToken, duration: 0.3, dead: false });
const firstObjectActionId = objectTokens.sample(objectSignal, 250, {}).actionId;
assert.ok(firstObjectActionId, 'the first object token emits an action id');
assert.equal(
  objectTokens.sample(objectSignal, 251, {}).actionId,
  null,
  'the same object token does not replay',
);
objectSignal.userData.pocketActionSignal = {
  action: 'attack-melee',
  token: { swing: 1 },
  duration: 0.3,
  dead: false,
};
const secondObjectActionId = objectTokens.sample(objectSignal, 252, {}).actionId;
assert.ok(secondObjectActionId, 'a different object token emits without an intervening null signal');
assert.notEqual(secondObjectActionId, firstObjectActionId, 'different object identities receive different action ids');

const transitions = createPirateFruitActionTracker();
const sameSignal = host({ action: 'hurt', token: 'same', duration: 0.2, dead: false });
const firstTransitionId = transitions.sample(sameSignal, 300, {}).actionId;
assert.equal(transitions.sample(host(), 301, {}).action, null);
const secondTransitionId = transitions.sample(sameSignal, 302, {}).actionId;
assert.ok(secondTransitionId, 'the action emits again after a transition back to locomotion');
assert.notEqual(secondTransitionId, firstTransitionId, 'separate edges receive separate deterministic ids');

const priority = createPirateFruitActionTracker();
const dead = priority.sample(
  host({ action: 'skill', token: 'fatal-hit', duration: 1.25, dead: true }),
  400,
  { distanceSq: 1, speed: PIRATE_FRUIT_RUN_SPEED },
);
assert.equal(dead.action, 'dead', 'dead overrides a simultaneous combat action');
assert.ok(dead.actionId);
assert.equal(priority.sample(
  host({ action: 'skill', token: 'fatal-hit', duration: 1.25, dead: true }),
  401,
  {},
).actionId, null, 'dead does not replay for the same signal');

const unknown = createPirateFruitActionTracker().sample(
  host({ action: 'dance', token: '1', duration: 9, dead: false }),
  500,
  { distanceSq: 0, speed: 0 },
);
assert.deepEqual(unknown, { locomotion: 'idle', action: null, actionId: null, duration: 0 });

console.log('V9.0 pirate-fruit action adapter: PASS');
