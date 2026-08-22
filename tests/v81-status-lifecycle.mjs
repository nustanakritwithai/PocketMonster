import assert from 'node:assert/strict';
import { activeJs } from './active-assets.mjs';
import {
  STATUS_LIFECYCLE_POLICY,
  advanceStatusLifecycle,
  applyStatusToLifecycle,
  clearStatusLifecycle,
  createStatusLifecycle,
} from '../status-lifecycle.mjs';

const proposed = (statusId, stacks, durationSec, skillId = 'SK_TEST') => ({
  statusId,
  sourceSkillId: skillId,
  sourceLinkId: 'SL_TEST',
  stacks,
  durationSec,
});

let state = createStatusLifecycle();
const original = structuredClone(state);
let result = applyStatusToLifecycle(state, proposed('ST_BURN', 1, 5));
assert.equal(result.ok, true);
assert.equal(result.applied, true);
assert.deepEqual(state, original, 'status application is immutable');
state = result.lifecycle;
assert.equal(state.statuses[0].nextTickSec, 1, 'DoT never ticks immediately on apply');

result = applyStatusToLifecycle(state, proposed('ST_FREEZE', 1, 1.5));
assert.deepEqual(result.removedStatusIds, ['ST_BURN']);
assert.deepEqual(result.lifecycle.statuses.map(status => status.statusId), ['ST_FREEZE'], 'Freeze removes Burn');

result = applyStatusToLifecycle(result.lifecycle, proposed('ST_BURN', 1, 5));
assert.deepEqual(result.removedStatusIds, ['ST_FREEZE']);
assert.deepEqual(result.lifecycle.statuses.map(status => status.statusId), ['ST_BURN'], 'Burn removes Freeze');

state = createStatusLifecycle();
state = applyStatusToLifecycle(state, proposed('ST_POISON', 1, 8)).lifecycle;
state = applyStatusToLifecycle(state, proposed('ST_POISON', 2, 8)).lifecycle;
assert.equal(state.statuses[0].stacks, 2, 'absolute proposed stacks are not counted twice');
state = applyStatusToLifecycle(state, proposed('ST_POISON', 3, 8)).lifecycle;
state = applyStatusToLifecycle(state, proposed('ST_POISON', 99, 8)).lifecycle;
assert.equal(state.statuses[0].stacks, 3, 'Poison cannot exceed catalog max stacks');
assert.equal(state.statuses[0].remainingDurationSec, 8, 'stack application refreshes duration');

const ticked = advanceStatusLifecycle(state, 3.5, { maxHp: 100 });
assert.equal(ticked.ok, true);
assert.equal(ticked.totalDamage, 9, 'three Poison stacks tick for 3% MaxHP once per second');
assert.equal(ticked.events.filter(event => event.type === 'dot_tick').length, 3);
assert.equal(ticked.lifecycle.statuses[0].nextTickSec, 0.5);

const zeroAdvance = advanceStatusLifecycle(ticked.lifecycle, 0, { maxHp: 100 });
assert.equal(zeroAdvance.totalDamage, 0, 'zero elapsed time cannot duplicate DoT damage');

assert.equal(STATUS_LIFECYCLE_POLICY.dotCanFaint, true);
assert.match(activeJs, /advanceStatusLifecycle\(w\.statusLifecycle,dt,/);
assert.match(activeJs, /damageWild\(w,Math\.max\(1,Math\.round\(statusTick\.totalDamage\)\)/, 'live DoT uses the normal damage/faint path');

const ended = clearStatusLifecycle(ticked.lifecycle, 'encounter_end');
assert.equal(ended.ok, true);
assert.deepEqual(ended.lifecycle.statuses, [], 'all transient statuses clear at encounter end');
assert.ok(ended.events.every(event => event.reason === 'encounter_end'));
assert.match(activeJs, /clearStatusLifecycle\(w\.statusLifecycle,'encounter_end'\)/);

console.log('V8.1 status interaction and DoT lifecycle: PASS');
