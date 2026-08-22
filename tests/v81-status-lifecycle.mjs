import assert from 'node:assert/strict';
import { activeJs } from './active-assets.mjs';
import {
  STATUS_INTERACTIONS,
  advanceEncounterEffects,
  applyEncounterStatus,
  createEncounterStatusState,
  endEncounterEffects,
} from '../status-lifecycle.mjs';

const proposed = (statusId, stacks, durationSec, skillId = 'SK_TEST') => ({
  statusId, sourceSkillId: skillId, sourceLinkId: 'SL_TEST', stacks, durationSec,
});

assert.ok(STATUS_INTERACTIONS.some(rule => rule.incomingStatusId === 'ST_BURN'
  && rule.existingStatusId === 'ST_FREEZE'
  && rule.interaction === 'RemoveExistingThenApply'));

let state = createEncounterStatusState({ encounterId: 'enc-1', nowSec: 0 });
const original = structuredClone(state);
let result = applyEncounterStatus(state, proposed('ST_BURN', 1, 5), { nowSec: 0 });
assert.equal(result.ok, true);
assert.equal(result.applied, true);
assert.deepEqual(state, original, 'application is immutable');
state = result.state;
assert.equal(state.statuses[0].nextTickAtSec, 1, 'DoT never ticks immediately on apply');

result = applyEncounterStatus(state, proposed('ST_FREEZE', 1, 1.5), { nowSec: 0.5 });
assert.deepEqual(result.removedStatusIds, ['ST_BURN']);
assert.deepEqual(result.state.statuses.map(status => status.statusId), ['ST_FREEZE']);
result = applyEncounterStatus(result.state, proposed('ST_BURN', 1, 5), { nowSec: 0.75 });
assert.deepEqual(result.removedStatusIds, ['ST_FREEZE']);
assert.deepEqual(result.state.statuses.map(status => status.statusId), ['ST_BURN']);

state = createEncounterStatusState({ encounterId: 'enc-stack', nowSec: 0 });
state = applyEncounterStatus(state, proposed('ST_POISON', 2, 8), { nowSec: 0 }).state;
state = applyEncounterStatus(state, proposed('ST_POISON', 3, 8), { nowSec: 0.4 }).state;
state = applyEncounterStatus(state, proposed('ST_POISON', 99, 8), { nowSec: 0.5 }).state;
assert.equal(state.statuses[0].stacks, 3, 'Poison cannot exceed catalog max stacks');
assert.equal(state.statuses[0].expiresAtSec, 8.5, 'stack application refreshes duration');

const ticked = advanceEncounterEffects(state, { toSec: 3.5, targetHp: 100, targetMaxHp: 100 });
assert.equal(ticked.ok, true);
assert.equal(ticked.damage, 9, 'three Poison stacks tick for 3% MaxHP each second');
assert.equal(ticked.targetHp, 91);
assert.equal(ticked.ticks.length, 3);
assert.equal(ticked.state.statuses[0].nextTickAtSec, 4);
const replay = advanceEncounterEffects(ticked.state, { toSec: 3.5, targetHp: 91, targetMaxHp: 100 });
assert.equal(replay.damage, 0, 'same time boundary cannot duplicate DoT damage');

const lethalState = applyEncounterStatus(
  createEncounterStatusState({ encounterId: 'enc-lethal', nowSec: 0 }),
  proposed('ST_BURN', 1, 5), { nowSec: 0 },
).state;
const lethal = advanceEncounterEffects(lethalState, { toSec: 1, targetHp: 1, targetMaxHp: 100 });
assert.equal(lethal.targetHp, 0);
assert.equal(lethal.fainted, true, 'DoT reaches normal zero-HP faint boundary');

const ended = endEncounterEffects(ticked.state, { nowSec: 4 });
assert.equal(ended.ended, true);
assert.deepEqual(ended.statuses, [], 'statuses clear at encounter end');
assert.equal(applyEncounterStatus(ended, proposed('ST_BURN', 1, 5), { nowSec: 4 }).reason, 'encounter_ended');

assert.match(activeJs, /createEncounterStatusState\(\{encounterId:w\.id,nowSec:0\}\)/);
assert.match(activeJs, /advanceEncounterEffects\(w\.statusState,/);
assert.match(activeJs, /endEncounterEffects\(w\.statusState,/);

console.log('V8.1 status interaction and DoT lifecycle: PASS');
