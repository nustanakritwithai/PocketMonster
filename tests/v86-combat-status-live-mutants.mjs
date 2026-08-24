import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STATUS_CATALOG, statusCatalogEntry } from '../status-catalog.mjs';
import { applyEncounterStatus, createEncounterStatusState } from '../status-lifecycle.mjs';

const runtimeSource = fs.readFileSync(new URL('../combat-status-runtime.mjs', import.meta.url), 'utf8');
const statusLifecycleSource = fs.readFileSync(new URL('../status-lifecycle.mjs', import.meta.url), 'utf8');
const gameSource = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

async function loadRuntime(source, label) {
  const absolute = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64')}`);
}

function withStatus(statusId) {
  const definition = statusCatalogEntry(statusId);
  return applyEncounterStatus(
    createEncounterStatusState({ encounterId: `mutant:${statusId}`, nowSec: 0 }),
    { statusId, stacks: 1, durationSec: definition.baseDurationSec },
    { nowSec: 0 },
  ).state;
}

function assertRuntime(module) {
  assert.equal(Object.keys(module.STATUS_RUNTIME_CHANNELS).length, STATUS_CATALOG.length);
  assert.equal(module.combatStatusDescriptors(withStatus('ST_BURN')).length, 1);
  assert.equal(module.resolveCombatStatusRuntime(withStatus('ST_FREEZE')).canAttack, false);
  assert.equal(module.resolveCombatStatusRuntime(withStatus('ST_STAGGER')).canUseSkill, false);
  assert.equal(module.resolveCombatStatusRuntime(withStatus('ST_ROOT')).canMove, false);
  assert.equal(module.resolveCombatStatusRuntime(withStatus('ST_ROOT')).canAttack, true);
  assert.equal(module.resolveCombatStatusRuntime(withStatus('ST_FEAR')).forcedRetreat, true);
  assert.equal(module.resolveCombatStatusRuntime(withStatus('ST_BLIND')).accuracyMultiplier, 0.8);
  assert.equal(module.resolveCombatStatusRuntime(withStatus('ST_PARALYZE')).cooldownRecoveryMultiplier, 0.8);
}

assertRuntime(await loadRuntime(runtimeSource, 'combat-status-current'));

function assertTickCursorTopology(module) {
  const corrupt = (statusId, nextTickAtSec) => {
    const definition = statusCatalogEntry(statusId);
    const applied = module.applyEncounterStatus(
      module.createEncounterStatusState({ encounterId: `tick-shape:${statusId}`, nowSec: 0 }),
      { statusId, stacks: 1, durationSec: definition.baseDurationSec },
      { nowSec: 0 },
    );
    assert.equal(applied.ok, true);
    return {
      ...applied.state,
      statuses: applied.state.statuses.map(status => ({ ...status, nextTickAtSec })),
    };
  };
  assert.equal(module.isEncounterStatusState(corrupt('ST_BURN', null)), false);
  assert.equal(module.isEncounterStatusState(corrupt('ST_ATK_UP', 1)), false);
  const burn = corrupt('ST_BURN', 1);
  assert.equal(module.isEncounterStatusState({
    ...burn,
    statuses: [burn.statuses[0], { ...burn.statuses[0] }],
  }), false);
  assert.equal(module.isEncounterStatusState({
    ...burn,
    currentTimeSec: 0.75,
    statuses: burn.statuses.map(status => ({ ...status, nextTickAtSec: 0.5 })),
  }), false);
  const due = module.applyEncounterStatus(burn, {
    statusId: 'ST_POISON', stacks: 1,
    durationSec: statusCatalogEntry('ST_POISON').baseDurationSec,
  }, { nowSec: 1 });
  assert.equal(due.reason, 'advance_required');

  const proposalState = module.createEncounterStatusState({ encounterId: 'invalid-proposal', nowSec: 0 });
  for (const sourceField of ['sourceSkillId', 'sourceLinkId', 'sourceInstanceId']) {
    const rejected = module.applyEncounterStatus(proposalState, {
      statusId: 'ST_ATK_UP', stacks: 1, durationSec: 5, [sourceField]: 123,
    }, { nowSec: 0 });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, 'invalid_proposed_status');
    assert.equal(rejected.state, proposalState);
    assert.equal(module.isEncounterStatusState(rejected.state), true);
  }
  const infiniteHardCc = module.applyEncounterStatus(proposalState, {
    statusId: 'ST_STUN', stacks: 1, durationSec: Number.MAX_VALUE,
  }, { nowSec: 0 });
  assert.equal(infiniteHardCc.ok, false);
  assert.equal(infiniteHardCc.reason, 'invalid_proposed_status');
  const absorbedNowSec = 1e16;
  const absorbedState = module.createEncounterStatusState({ encounterId: 'absorbed-proposal', nowSec: absorbedNowSec });
  assert.equal(module.applyEncounterStatus(absorbedState, {
    statusId: 'ST_ATK_UP', stacks: 1, durationSec: 1,
  }, { nowSec: absorbedNowSec }).reason, 'invalid_proposed_status');
  assert.equal(module.applyEncounterStatus(absorbedState, {
    statusId: 'ST_BURN', stacks: 1, durationSec: 100,
  }, { nowSec: absorbedNowSec }).reason, 'invalid_proposed_status');
}

assertTickCursorTopology(await loadRuntime(statusLifecycleSource, 'status-lifecycle-current'));

const statusLifecycleMutations = [
  ['allow DoT without tick cursor', 'Number.isFinite(status.nextTickAtSec) && status.nextTickAtSec > currentTimeSec', "status.nextTickAtSec === null || (Number.isFinite(status.nextTickAtSec) && status.nextTickAtSec > currentTimeSec)"],
  ['allow non-DoT tick cursor', ': status.nextTickAtSec === null);', ': true);'],
  ['allow overdue DoT cursor', 'status.nextTickAtSec > currentTimeSec', 'status.nextTickAtSec >= status.appliedAtSec'],
  ['allow duplicate StatusID records', 'if (state.statuses[prior].statusId === status.statusId) return false;', 'if (false) return false;'],
  ['apply across an unsettled DoT tick', "if (pendingTick) return result(false, 'advance_required', { state });", 'if (false) return result(false, \'advance_required\', { state });'],
  ['accept malformed status provenance', "if (!proposedSources.every(value => value === undefined || value === null || typeof value === 'string')) {", 'if (false) {'],
  ['accept invalid computed status timing', "if (!Number.isFinite(hardCc.durationSec) || !(hardCc.durationSec > 0)\n    || !validRuntimeStatusTiming(incoming, definition, nowSec)) {", 'if (false) {'],
];
for (const [name, from, to] of statusLifecycleMutations) {
  const mutant = statusLifecycleSource.replace(from, to);
  assert.notEqual(mutant, statusLifecycleSource, `${name} mutation must apply`);
  await assert.rejects(async () => assertTickCursorTopology(
    await loadRuntime(mutant, `status-lifecycle-${name}`),
  ), undefined, `${name} must be killed`);
}

const runtimeMutations = [
  ['hide active statuses', 'status.expiresAtSec > nowSec', 'status.expiresAtSec < nowSec'],
  ['unlock hard control', "const actionLocked = ids.some(id => ['ST_FREEZE', 'ST_STUN', 'ST_STAGGER'].includes(id));", 'const actionLocked = false;'],
  ['unlock root movement', "const movementLocked = actionLocked || ids.includes('ST_ROOT');", 'const movementLocked = actionLocked;'],
  ['disable fear retreat', "const forcedRetreat = ids.includes('ST_FEAR');", 'const forcedRetreat = false;'],
  ['ignore accuracy control', 'accuracyMultiplier: Math.max(0.05, Math.min(1, 1 + accuracyModifierPct / 100)),', 'accuracyMultiplier: 1,'],
  ['ignore paralyze recovery', "cooldownRecoveryMultiplier: ids.includes('ST_PARALYZE') ? 0.8 : 1,", 'cooldownRecoveryMultiplier: 1,'],
];

for (const [name, from, to] of runtimeMutations) {
  const mutant = runtimeSource.replace(from, to);
  assert.notEqual(mutant, runtimeSource, `${name} mutation must apply`);
  await assert.rejects(async () => assertRuntime(await loadRuntime(mutant, `combat-status-${name}`)), undefined, `${name} must be killed`);
}

function assertLive(source) {
  const useSkill = source.slice(source.indexOf('function useSkill('), source.indexOf('function createOwnedBasicAiScratch('));
  const owned = source.slice(source.indexOf('function updateOwned('), source.indexOf('const wildAggressorCandidates'));
  const wild = source.slice(source.indexOf('function updateWild('), source.indexOf('function updateProjectiles('));
  assert.match(useSkill, /if\(!control\.ok\|\|!control\.canUseSkill\)/);
  assert.match(useSkill, /reason:control\.ok\?'status_controlled':'invalid_status_context'/);
  const actor = { inst: { skills: [{ currentUses: 3 }] }, statusState: {}, skillCds: [0] };
  let boundaryCalls = 0;
  let applyCalls = 0;
  const bindings = {
    activeSummon: actor,
    MANUAL_SKILL_SLOTS: Object.freeze(['s1']),
    canonicalCombatSkills: () => Object.freeze([Object.freeze({ skillId: 'SK_TEST', name: 'Test Skill' })]),
    resolveCombatStatusRuntime: () => Object.freeze({ ok: false, reason: 'invalid_status_context' }),
    announceCombatReason: () => {}, skillFailureMessage: (_move, result) => result.reason,
    skillActorSnapshot: () => Object.freeze({}), skillEnemySnapshots: () => Object.freeze([]),
    materializeSkillTargets: () => Object.freeze([]), canApplyLiveSkill: () => true,
    applyAcceptedSkillCommand: () => { applyCalls += 1; },
    executeEquippedSkillCommand: (_inst, _request, adapters) => {
      boundaryCalls += 1;
      actor.inst.skills[0].currentUses -= 1;
      actor.skillCds[0] = 5;
      adapters.applyAccepted(Object.freeze({}), Object.freeze([]));
      return Object.freeze({ ok: true });
    },
    renderSkillButtons: () => {},
  };
  const names = Object.keys(bindings);
  const executeManualSkill = Function(...names, `return (${useSkill});`)(...names.map(name => bindings[name]));
  assert.deepEqual(executeManualSkill(0, Object.freeze({ commandId: 'invalid-status-cast' })),
    { ok: false, reason: 'invalid_status_context' });
  assert.equal(boundaryCalls, 0);
  assert.equal(actor.inst.skills[0].currentUses, 3);
  assert.equal(actor.skillCds[0], 0);
  assert.equal(applyCalls, 0);
  assert.match(owned, /Math\.random\(\)>=control\.accuracyMultiplier/);
  assert.match(wild, /const statusMissed=Math\.random\(\)>=control\.accuracyMultiplier/);
  assert.match(wild, /frameRuntime\.selfModifiers:resolveActiveSelfStatusModifiers\(w\.statusState\)/);
  assert.match(wild, /target\.kind==='player'&&statusMissed/);
  assert.match(wild, /\*selfModifiers\.attackMultiplier/);
  assert.match(source, /resolveActiveSelfStatusModifiers\(defender\?\.statusState,\{incomingType:move\.type\}\)/);
  assert.match(source, /damage:resolved\.damage>0\?Math\.max\(1,Math\.round\(resolved\.damage\*finalMultiplier\)\):0/);
  assert.match(source, /renderCombatStatusList\(el\('ownedStatusStrip'\),activeSummon\?\.statusState/);
  assert.match(source, /renderCombatStatusList\(el\('targetStatusStrip'\),target\.statusState/);
  assert.match(source, /skillStatusLocked=!!activeSummon&&\(!statusControl\?\.ok\|\|!statusControl\.canUseSkill\)/);
}

assertLive(gameSource);
const liveMutations = [
  ['fail open invalid manual status', 'if(!control.ok||!control.canUseSkill){', 'if(control.ok&&!control.canUseSkill){'],
  ['bypass manual status gate', 'if(!control.ok||!control.canUseSkill){', 'if(false){'],
  ['collapse invalid status reason', "reason:control.ok?'status_controlled':'invalid_status_context'", "reason:'status_controlled'"],
  ['owned attacks never miss', 'if(control.ok&&Math.random()>=control.accuracyMultiplier)', 'if(false)'],
  ['wild attacks never miss', 'const statusMissed=Math.random()>=control.accuracyMultiplier;', 'const statusMissed=false;'],
  ['wild misses do not protect player', "target.kind==='player'&&statusMissed", 'false'],
  ['player ignores Wild attack status', '*selfModifiers.attackMultiplier', '*1'],
  ['Basic ignores defender status', 'const guard=resolveActiveSelfStatusModifiers(defender?.statusState,{incomingType:move.type});', 'const guard={ok:false};'],
  ['status layer breaks immunity', 'damage:resolved.damage>0?Math.max(1,Math.round(resolved.damage*finalMultiplier)):0', 'damage:Math.max(1,Math.round(resolved.damage*finalMultiplier))'],
  ['hide owned status HUD', "renderCombatStatusList(el('ownedStatusStrip'),activeSummon?.statusState,{limit:4});", "void el('ownedStatusStrip');"],
  ['hide target status HUD', "renderCombatStatusList(el('targetStatusStrip'),target.statusState,{limit:5});", "void el('targetStatusStrip');"],
  ['show invalid status context as ready', 'const skillStatusLocked=!!activeSummon&&(!statusControl?.ok||!statusControl.canUseSkill);', 'const skillStatusLocked=!!activeSummon&&statusControl?.ok&&!statusControl.canUseSkill;'],
];
for (const [name, from, to] of liveMutations) {
  const mutant = gameSource.replace(from, to);
  assert.notEqual(mutant, gameSource, `${name} mutation must apply`);
  assert.throws(() => assertLive(mutant), undefined, `${name} must be killed`);
}

const killed = statusLifecycleMutations.length + runtimeMutations.length + liveMutations.length;
console.log(`V8.6 live combat status mutants: PASS (${killed}/${killed} killed)`);
