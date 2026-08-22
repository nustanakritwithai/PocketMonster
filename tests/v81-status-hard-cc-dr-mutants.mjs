import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceUrl = new URL('../status-lifecycle.mjs', import.meta.url);
const originalSource = fs.readFileSync(sourceUrl, 'utf8');
const proposed = (statusId, durationSec) => ({
  statusId,
  sourceSkillId: 'SK_MUTANT',
  sourceLinkId: 'SL_MUTANT',
  stacks: 1,
  durationSec,
});

async function loadSource(source, tag) {
  const withAbsoluteImports = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${withAbsoluteImports}\n//# sourceURL=${tag}`).toString('base64')}`);
}

function assertDrContract(module) {
  const {
    HARD_CC_DR_POLICY,
    advanceEncounterEffects,
    applyEncounterStatus,
    createEncounterStatusState,
  } = module;
  assert.deepEqual(HARD_CC_DR_POLICY.durationMultipliers, [1, 0.65, 0.4]);
  assert.equal(HARD_CC_DR_POLICY.windowSec, 6);
  assert.equal(HARD_CC_DR_POLICY.minimumDurationSec, 0.25);

  let rolling = createEncounterStatusState({ encounterId: 'rolling', nowSec: 0 });
  rolling = applyEncounterStatus(rolling, proposed('ST_STUN', 1), { nowSec: 0 }).state;
  rolling = applyEncounterStatus(rolling, proposed('ST_FEAR', 10), { nowSec: 5 }).state;
  const rollingThird = applyEncounterStatus(rolling, proposed('ST_FREEZE', 10), { nowSec: 6.01 });
  assert.equal(rollingThird.ccDr.stage, 2, 'the recent application remains even after the oldest expires');
  assert.equal(rollingThird.appliedDurationSec, 6.5);

  let boundary = createEncounterStatusState({ encounterId: 'boundary', nowSec: 0 });
  boundary = applyEncounterStatus(boundary, proposed('ST_STUN', 1), { nowSec: 0 }).state;
  boundary = advanceEncounterEffects(boundary, { toSec: 6, targetHp: 100, targetMaxHp: 100 }).state;
  assert.equal(applyEncounterStatus(boundary, proposed('ST_STUN', 1), { nowSec: 6 }).ccDr.stage, 1);

  let minimum = createEncounterStatusState({ encounterId: 'minimum', nowSec: 0 });
  minimum = applyEncounterStatus(minimum, proposed('ST_STUN', 1), { nowSec: 0 }).state;
  minimum = applyEncounterStatus(minimum, proposed('ST_FEAR', 1), { nowSec: 1.1 }).state;
  assert.equal(applyEncounterStatus(minimum, proposed('ST_FREEZE', 0.1), { nowSec: 3.2 }).appliedDurationSec, 0.25);

  let blocked = createEncounterStatusState({ encounterId: 'blocked', nowSec: 0 });
  blocked = applyEncounterStatus(blocked, proposed('ST_FREEZE', 1.5), { nowSec: 0 }).state;
  const rejected = applyEncounterStatus(blocked, proposed('ST_STUN', 1), { nowSec: 0.7 });
  assert.equal(rejected.applied, false);
  assert.equal(rejected.state.controlDr.count, 1);

  let multiple = createEncounterStatusState({ encounterId: 'multiple', nowSec: 0 });
  multiple = applyEncounterStatus(multiple, proposed('ST_FREEZE', 1.5), { nowSec: 0 }).state;
  multiple = applyEncounterStatus(multiple, proposed('ST_STAGGER', 0.35), { nowSec: 0.1 }).state;
  const multiResult = applyEncounterStatus(multiple, proposed('ST_STUN', 10), { nowSec: 0.2 });
  assert.deepEqual(multiResult.state.statuses.map(status => status.statusId), ['ST_STUN']);
}

const currentModule = await loadSource(originalSource, 'status-lifecycle-current');
assertDrContract(currentModule);

const mutants = [
  ['remove DR multipliers', 'Object.freeze([1, 0.65, 0.4])', 'Object.freeze([1, 1, 1])'],
  ['shorten DR window', 'windowSec: 6', 'windowSec: 5'],
  ['remove minimum duration', 'minimumDurationSec: 0.25', 'minimumDurationSec: 0'],
  ['include exact boundary', 'nowSec - entry.atSec < HARD_CC_DR_POLICY.windowSec', 'nowSec - entry.atSec <= HARD_CC_DR_POLICY.windowSec'],
  ['compare pre-DR duration', 'match.status.expiresAtSec - nowSec >= hardCc.durationSec', 'match.status.expiresAtSec - nowSec >= proposed.durationSec'],
  [
    'count rejected hard CC',
    'state: statusState({ ...state, currentTimeSec: nowSec, statuses: liveStatuses, controlDr: retainedControlDr })',
    'state: statusState({ ...state, currentTimeSec: nowSec, statuses: liveStatuses, controlDr: hardCc.controlDr })',
  ],
  ['resolve only one interaction', 'const replaceIndexes = new Set(matching\n    .filter', 'const replaceIndexes = new Set(matching.slice(0, 1)\n    .filter'],
];

for (const [name, before, after] of mutants) {
  const mutantSource = originalSource.replace(before, after);
  assert.notEqual(mutantSource, originalSource, `${name} mutation must alter source`);
  const mutantModule = await loadSource(mutantSource, `status-lifecycle-mutant-${name.replaceAll(' ', '-')}`);
  assert.throws(() => assertDrContract(mutantModule), undefined, `${name} must be killed`);
}

console.log(`V8.1 hard-CC DR mutants: PASS (${mutants.length}/${mutants.length} killed)`);
