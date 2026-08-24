import assert from 'node:assert/strict';
import { ENCOUNTER_POLICY, fillEngagedWildIds, selectEngagedWildIds, shouldResetEncounter } from '../runtime-policies.mjs';
import { activeJs } from './active-assets.mjs';

assert.equal(shouldResetEncounter({ engaged: true, targetValid: false, distanceToTarget: 0, distanceFromHome: 0 }), true);
assert.equal(shouldResetEncounter({ engaged: true, targetValid: true, distanceToTarget: 21, distanceFromHome: 5 }), true);
assert.equal(shouldResetEncounter({ engaged: true, targetValid: true, distanceToTarget: 5, distanceFromHome: 19 }), true);
assert.equal(shouldResetEncounter({ engaged: true, targetValid: true, distanceToTarget: 19, distanceFromHome: 17 }), false);
assert.equal(shouldResetEncounter({ engaged: false, targetValid: false, distanceToTarget: Infinity, distanceFromHome: Infinity }), false);

const ids = selectEngagedWildIds([
  { id: 'w4', dead: false, targetValid: true, engaged: false, distanceToTarget: 4, distanceFromHome: 4 },
  { id: 'w2', dead: false, targetValid: true, engaged: false, distanceToTarget: 2, distanceFromHome: 2 },
  { id: 'w1', dead: false, targetValid: true, engaged: false, distanceToTarget: 1, distanceFromHome: 1 },
  { id: 'w3', dead: false, targetValid: true, engaged: false, distanceToTarget: 3, distanceFromHome: 3 },
  { id: 'w5', dead: false, targetValid: true, engaged: false, distanceToTarget: 15, distanceFromHome: 2 },
], ENCOUNTER_POLICY);
assert.deepEqual(ids, ['w1', 'w2'], 'nearest two eligible wilds within aggro radius selected deterministically (maxEngaged=2, aggroRadius=4)');
const reusableIds = new Set(['stale']);
const filledIds = fillEngagedWildIds([
  { id: 'w2', dead: false, targetValid: true, engaged: false, distanceToTarget: 2, distanceFromHome: 2 },
  { id: 'w1', dead: false, targetValid: true, engaged: false, distanceToTarget: 1, distanceFromHome: 1 },
], ENCOUNTER_POLICY, reusableIds);
assert.equal(filledIds, reusableIds, 'live engagement selection reuses the caller-owned Set');
assert.deepEqual([...filledIds], ['w1', 'w2']);
const bossReserved = fillEngagedWildIds([
  { id: 'normal-1', dead: false, targetValid: true, engaged: false, distanceToTarget: 1, distanceFromHome: 1 },
  { id: 'normal-2', dead: false, targetValid: true, engaged: false, distanceToTarget: 2, distanceFromHome: 2 },
  { id: 'boss', dead: false, targetValid: true, engaged: true, distanceToTarget: 6, distanceFromHome: 6 },
], ENCOUNTER_POLICY, new Set(), 'boss');
assert.deepEqual([...bossReserved], ['boss', 'normal-1'],
  'an authorized active Boss reserves one bounded engagement slot');
const tiedCandidates = [
  { id: 'w-b', dead: false, targetValid: true, engaged: false, distanceToTarget: 2, distanceFromHome: 2 },
  { id: 'w-a', dead: false, targetValid: true, engaged: false, distanceToTarget: 2, distanceFromHome: 2 },
  { id: 'w-c', dead: false, targetValid: true, engaged: false, distanceToTarget: 2, distanceFromHome: 2 },
];
assert.deepEqual(selectEngagedWildIds(tiedCandidates, ENCOUNTER_POLICY), ['w-a', 'w-b']);
assert.deepEqual(selectEngagedWildIds([...tiedCandidates].reverse(), ENCOUNTER_POLICY), ['w-a', 'w-b'],
  'equal-distance engagement uses stable lexical IDs independent of input order');
assert.equal(selectEngagedWildIds([
  { id: 'w1', dead: false, targetValid: true, engaged: true, distanceToTarget: 19, distanceFromHome: 5 },
], ENCOUNTER_POLICY)[0], 'w1', 'engaged wild stays active inside disengage radius');
assert.deepEqual(selectEngagedWildIds([
  { id: 'engaged-a', dead: false, targetValid: true, engaged: true, distanceToTarget: 10, distanceFromHome: 5 },
  { id: 'engaged-b', dead: false, targetValid: true, engaged: true, distanceToTarget: 11, distanceFromHome: 5 },
  { id: 'new-near', dead: false, targetValid: true, engaged: false, distanceToTarget: 1, distanceFromHome: 1 },
], ENCOUNTER_POLICY), ['engaged-a', 'engaged-b'],
  'eligible engaged Wilds retain bounded slots until a disengage threshold is crossed');
assert.deepEqual(selectEngagedWildIds([
  { id: 'capturing', dead: false, capturing: true, targetValid: true, engaged: true, distanceToTarget: 0.5, distanceFromHome: 0.5 },
  { id: 'normal-a', dead: false, capturing: false, targetValid: true, engaged: false, distanceToTarget: 1, distanceFromHome: 1 },
  { id: 'normal-b', dead: false, capturing: false, targetValid: true, engaged: false, distanceToTarget: 2, distanceFromHome: 2 },
], ENCOUNTER_POLICY), ['normal-a', 'normal-b'],
  'a paused capture target cannot reserve one of the two live attacker slots');
const captureResumeHandoff = [
  { id: 'capture-resume', dead: false, capturing: false, targetValid: true, engaged: true, resumePriority: true, distanceToTarget: 5, distanceFromHome: 5 },
  { id: 'engaged-near', dead: false, capturing: false, targetValid: true, engaged: true, distanceToTarget: 2, distanceFromHome: 2 },
  { id: 'engaged-mid', dead: false, capturing: false, targetValid: true, engaged: true, distanceToTarget: 3, distanceFromHome: 3 },
];
assert.deepEqual(selectEngagedWildIds(captureResumeHandoff, ENCOUNTER_POLICY), ['capture-resume', 'engaged-near'],
  'a failed-capture target reclaims its pre-existing bounded slot for one deterministic handoff');
assert.deepEqual(selectEngagedWildIds([...captureResumeHandoff].reverse(), ENCOUNTER_POLICY), ['capture-resume', 'engaged-near'],
  'capture resume handoff is independent of source-array order');
assert.ok(activeJs.includes('selectWildAggressors()'), 'active runtime must select a bounded attacker set');
assert.ok(activeJs.includes('fillEngagedWildIds(wildAggressorCandidates,ENCOUNTER_POLICY,engagedWildIdsScratch,bossChallengeSession.activeBossId)'),
  'active runtime must reuse engagement candidate/Set buffers');
assert.equal(activeJs.includes('for(const w of [...wilds])'), false, 'frame loop must not clone the wild array');
assert.ok(activeJs.includes('shouldResetEncounter(resetRequest)'), 'active runtime must apply reset policy through its reusable request buffer');
assert.ok(activeJs.includes('resetRequest.engaged=w.engaged'), 'reset request must refresh live engagement state');
assert.ok(activeJs.includes('wildFrameSnapshot.length=wilds.length'), 'frame loop must reuse its ordered wild snapshot');
assert.ok(activeJs.includes('for(let wildIndex=0;wildIndex<wildFrameSnapshot.length;wildIndex++)'),
  'wild update order must remain forward/insertion ordered');
assert.ok(activeJs.includes('resetWild(w,'), 'active runtime must call resetWild with an explicit reset cause');
console.log('P0 encounter reset/leash regression: PASS');
