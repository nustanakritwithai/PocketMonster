import assert from 'node:assert/strict';
import { ENCOUNTER_POLICY, selectEngagedWildIds, shouldResetEncounter } from '../runtime-policies.mjs';
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
assert.equal(selectEngagedWildIds([
  { id: 'w1', dead: false, targetValid: true, engaged: true, distanceToTarget: 19, distanceFromHome: 5 },
], ENCOUNTER_POLICY)[0], 'w1', 'engaged wild stays active inside disengage radius');
assert.ok(activeJs.includes('selectWildAggressors()'), 'active runtime must select a bounded attacker set');
assert.ok(activeJs.includes('shouldResetEncounter({'), 'active runtime must apply reset policy');
assert.ok(activeJs.includes('resetWild(w)'), 'active runtime must call resetWild');
console.log('P0 encounter reset/leash regression: PASS');
