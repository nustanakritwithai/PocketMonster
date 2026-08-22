import assert from 'node:assert/strict';
import {
  HARD_CC_DR_POLICY,
  advanceEncounterEffects,
  applyEncounterStatus,
  createEncounterStatusState,
  endEncounterEffects,
} from '../status-lifecycle.mjs';

const proposed = (statusId, durationSec) => ({
  statusId, sourceSkillId: 'SK_TEST', sourceLinkId: 'SL_TEST', stacks: 1, durationSec,
});

assert.deepEqual(HARD_CC_DR_POLICY.durationMultipliers, [1, 0.65, 0.4]);
assert.equal(HARD_CC_DR_POLICY.windowSec, 6);
assert.equal(HARD_CC_DR_POLICY.minimumDurationSec, 0.25);

let state = createEncounterStatusState({ encounterId: 'cc-chain', nowSec: 0 });
let applied = applyEncounterStatus(state, proposed('ST_STUN', 1), { nowSec: 0 });
assert.equal(applied.ccDr.stage, 1);
assert.equal(applied.ccDr.multiplier, 1);
assert.equal(applied.appliedDurationSec, 1);
state = applied.state;

applied = applyEncounterStatus(state, proposed('ST_FREEZE', 1.5), { nowSec: 1.1 });
assert.equal(applied.ccDr.stage, 2, 'different hard-CC IDs share one DR chain');
assert.equal(applied.ccDr.multiplier, 0.65);
assert.equal(applied.appliedDurationSec, 0.975);
state = applied.state;

applied = applyEncounterStatus(state, proposed('ST_FEAR', 2), { nowSec: 2.2 });
assert.equal(applied.ccDr.stage, 3);
assert.equal(applied.ccDr.multiplier, 0.4);
assert.equal(applied.appliedDurationSec, 0.8);
state = applied.state;

applied = applyEncounterStatus(state, proposed('ST_STUN', 0.1), { nowSec: 3.1 });
assert.equal(applied.ccDr.stage, 3, 'third and later applications stay at 40%');
assert.equal(applied.appliedDurationSec, 0.25, 'hard CC duration floors after DR');
state = applied.state;

applied = applyEncounterStatus(state, proposed('ST_FREEZE', 1.5), { nowSec: 6.01 });
assert.equal(applied.ccDr.stage, 3, 'recent hard CC keeps the rolling six-second chain active');
assert.equal(applied.appliedDurationSec, 0.6);
state = applied.state;

const advanced = advanceEncounterEffects(state, {
  toSec: 12.01, targetHp: 100, targetMaxHp: 100,
});
assert.equal(advanced.state.controlDr.count, 0, 'history expires at the exact six-second boundary');
applied = applyEncounterStatus(advanced.state, proposed('ST_FREEZE', 1.5), { nowSec: 12.01 });
assert.equal(applied.ccDr.stage, 1, 'DR resets only after every recent application leaves the window');
assert.equal(applied.appliedDurationSec, 1.5);

let rejectionState = createEncounterStatusState({ encounterId: 'cc-longer-wins', nowSec: 0 });
rejectionState = applyEncounterStatus(rejectionState, proposed('ST_FREEZE', 1.5), { nowSec: 0 }).state;
const rejected = applyEncounterStatus(rejectionState, proposed('ST_STUN', 1), { nowSec: 0.7 });
assert.equal(rejected.applied, false, 'a shorter DR-adjusted hard CC cannot replace a longer lock');
assert.equal(rejected.reason, 'existing_longer');
assert.equal(rejected.state.controlDr.count, 1, 'a rejected lock does not build DR resistance');
assert.equal(rejected.ccDr, null);
assert.equal(rejected.state.statuses[0].statusId, 'ST_FREEZE');

let refreshState = createEncounterStatusState({ encounterId: 'cc-refresh', nowSec: 0 });
refreshState = applyEncounterStatus(refreshState, proposed('ST_STUN', 2), { nowSec: 0 }).state;
const shorterRefresh = applyEncounterStatus(refreshState, proposed('ST_STUN', 1), { nowSec: 0.1 });
assert.equal(shorterRefresh.applied, false, 'same-status shorter refresh is ignored after DR');
assert.equal(shorterRefresh.state.controlDr.count, 1);

let softState = createEncounterStatusState({ encounterId: 'soft-control', nowSec: 0 });
softState = applyEncounterStatus(softState, proposed('ST_PARALYZE', 2.5), { nowSec: 0 }).state;
softState = applyEncounterStatus(softState, proposed('ST_ROOT', 2), { nowSec: 0.1 }).state;
assert.equal(softState.controlDr.count, 0, 'Control and MovementCC never consume the HardCC chain');

const legacyState = { encounterId: 'legacy-a23', currentTimeSec: 0, ended: false, statuses: [] };
const legacyApplied = applyEncounterStatus(legacyState, proposed('ST_STUN', 1), { nowSec: 0 });
assert.equal(legacyApplied.ok, true, 'A23-shaped encounter state upgrades to an empty DR history');
assert.equal(legacyApplied.state.controlDr.count, 1);

const malformedState = {
  ...createEncounterStatusState({ encounterId: 'malformed-dr', nowSec: 1 }),
  controlDr: { windowStartedAtSec: 0, lastAppliedAtSec: 0, count: 1, history: [{ statusId: 'ST_ROOT', atSec: 0 }] },
};
assert.equal(
  applyEncounterStatus(malformedState, proposed('ST_STUN', 1), { nowSec: 1 }).reason,
  'invalid_state',
  'non-HardCC or inconsistent history is rejected instead of silently discarded',
);

let multiMatch = createEncounterStatusState({ encounterId: 'cc-multi-match', nowSec: 0 });
multiMatch = applyEncounterStatus(multiMatch, proposed('ST_FREEZE', 1.5), { nowSec: 0 }).state;
multiMatch = applyEncounterStatus(multiMatch, proposed('ST_STAGGER', 0.35), { nowSec: 0.1 }).state;
const stunBlocked = applyEncounterStatus(multiMatch, proposed('ST_STUN', 1), { nowSec: 0.2 });
assert.equal(stunBlocked.applied, false);
assert.deepEqual(
  stunBlocked.state.statuses.map(status => status.statusId).sort(),
  ['ST_FREEZE', 'ST_STAGGER'],
  'a lower-priority Stagger rule cannot bypass the existing hard-lock rule',
);

const targetA = createEncounterStatusState({ encounterId: 'target-a', nowSec: 0 });
const targetB = createEncounterStatusState({ encounterId: 'target-b', nowSec: 0 });
const targetAHit = applyEncounterStatus(targetA, proposed('ST_STUN', 1), { nowSec: 0 }).state;
const targetBHit = applyEncounterStatus(targetB, proposed('ST_STUN', 1), { nowSec: 0 }).state;
assert.equal(targetAHit.controlDr.count, 1);
assert.equal(targetBHit.controlDr.count, 1, 'each encounter target owns an independent DR history');

const ended = endEncounterEffects(applied.state, { nowSec: 13 });
assert.equal(ended.controlDr.count, 0, 'encounter cleanup clears DR history');
assert.equal(ended.controlDr.windowStartedAtSec, null);

console.log('V8.1 hard-CC diminishing returns: PASS');
