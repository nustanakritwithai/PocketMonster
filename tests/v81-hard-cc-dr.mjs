import assert from 'node:assert/strict';
import {
  HARD_CC_DR_RULES,
  resolveHardCcDuration,
} from '../status-resolver.mjs';

assert.deepEqual(HARD_CC_DR_RULES.durationMultipliers, [1, 0.65, 0.4]);
assert.equal(HARD_CC_DR_RULES.windowSec, 6);
assert.equal(HARD_CC_DR_RULES.minimumDurationSec, 0.25);

let history = [];
const first = resolveHardCcDuration({ statusId: 'ST_FREEZE', nowSec: 10, history });
assert.equal(first.ok, true);
assert.equal(first.drTier, 1);
assert.equal(first.durationSec, 1.5);
history = first.nextHistory;

const second = resolveHardCcDuration({ statusId: 'ST_STUN', nowSec: 11, history });
assert.equal(second.drTier, 2, 'switching status IDs cannot bypass shared hard-CC DR');
assert.equal(second.durationSec, 0.65);
history = second.nextHistory;

const third = resolveHardCcDuration({ statusId: 'ST_FEAR', nowSec: 12, history });
assert.equal(third.drTier, 3);
assert.equal(third.durationSec, 0.8);
history = third.nextHistory;

const floor = resolveHardCcDuration({ statusId: 'ST_STUN', baseDurationSec: 0.1, nowSec: 13, history });
assert.equal(floor.durationSec, 0.25, 'DR duration never falls below the 0.25s floor');

const reset = resolveHardCcDuration({ statusId: 'ST_STUN', nowSec: 19, history });
assert.equal(reset.drTier, 1, 'applications outside the six-second window are pruned');
assert.equal(reset.durationMultiplier, 1);

const immutableHistory = Object.freeze([{ statusId: 'ST_FREEZE', atSec: 20 }]);
const immutableBefore = structuredClone(immutableHistory);
resolveHardCcDuration({ statusId: 'ST_STUN', nowSec: 21, history: immutableHistory });
assert.deepEqual(immutableHistory, immutableBefore);

assert.equal(resolveHardCcDuration({ statusId: 'ST_BURN', nowSec: 1, history: [] }).reason, 'not_hard_cc');
assert.equal(resolveHardCcDuration({ statusId: 'ST_UNKNOWN', nowSec: 1, history: [] }).reason, 'unknown_status');
assert.equal(resolveHardCcDuration({ statusId: 'ST_STUN', nowSec: -1, history: [] }).reason, 'invalid_time');

console.log('V8.1 hard-CC diminishing returns: PASS');
