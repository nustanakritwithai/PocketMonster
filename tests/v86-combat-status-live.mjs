import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MONSTER_CATALOG } from '../monster-catalog.mjs';
import { SKILL_CATALOG } from '../skill-catalog.mjs';
import { STATUS_CATALOG, SKILL_STATUS_LINKS, statusCatalogEntry } from '../status-catalog.mjs';
import { applyEncounterStatus, advanceEncounterEffects, createEncounterStatusState, isEncounterStatusState } from '../status-lifecycle.mjs';
import {
  COMBAT_STATUS_RUNTIME_VERSION,
  NEUTRAL_COMBAT_STATUS_RUNTIME,
  STATUS_RUNTIME_CHANNELS,
  combatStatusDescriptors,
  resolveCombatStatusRuntime,
} from '../combat-status-runtime.mjs';
import { NEUTRAL_SELF_STATUS_MODIFIERS, resolveActiveSelfStatusModifiers, resolveWorkbookDirectDamage } from '../skill-effect-runtime.mjs';

function withStatus(statusId, { encounterId = `encounter:${statusId}`, stacks = 1, nowSec = 0 } = {}) {
  const definition = statusCatalogEntry(statusId);
  const applied = applyEncounterStatus(
    createEncounterStatusState({ encounterId, nowSec }),
    { statusId, stacks, durationSec: definition.baseDurationSec, sourceInstanceId: 'status-test' },
    { nowSec },
  );
  assert.equal(applied.ok, true, `${statusId} must enter the shared encounter runtime`);
  assert.equal(applied.applied, true, `${statusId} must be applied`);
  return applied.state;
}

assert.equal(COMBAT_STATUS_RUNTIME_VERSION, 'combat-status-runtime/v1');
assert.equal(STATUS_CATALOG.length, 26);
assert.equal(Object.keys(STATUS_RUNTIME_CHANNELS).length, 26);
const neutralStatusState=createEncounterStatusState({encounterId:'neutral-cache',nowSec:0});
assert.equal(resolveCombatStatusRuntime(neutralStatusState),NEUTRAL_COMBAT_STATUS_RUNTIME,
  'neutral combat control reuses one immutable result');
assert.equal(resolveActiveSelfStatusModifiers(neutralStatusState),NEUTRAL_SELF_STATUS_MODIFIERS,
  'neutral stat modifiers reuse one immutable result');

for (const definition of STATUS_CATALOG) {
  const state = withStatus(definition.id);
  const descriptors = combatStatusDescriptors(state);
  assert.equal(descriptors.length, 1, `${definition.id} must have visible live combat feedback`);
  assert.equal(descriptors[0].statusId, definition.id);
  assert.equal(descriptors[0].nameTH, definition.nameTH);
  assert.ok(descriptors[0].glyph.length > 0);
  assert.ok(descriptors[0].channels.length > 0, `${definition.id} must route to runtime behavior`);
  assert.equal(resolveCombatStatusRuntime(state).activeStatusIds[0], definition.id);
}

for (const statusId of ['ST_FREEZE', 'ST_STUN', 'ST_STAGGER']) {
  const control = resolveCombatStatusRuntime(withStatus(statusId));
  assert.equal(control.canAttack, false, `${statusId} must stop attacks`);
  assert.equal(control.canUseSkill, false, `${statusId} must stop manual skills`);
}
const root = resolveCombatStatusRuntime(withStatus('ST_ROOT'));
assert.equal(root.canMove, false);
assert.equal(root.canAttack, true, 'Root locks movement but still permits an in-range attack');
assert.equal(root.canUseSkill, true, 'Root does not consume or block a valid manual skill');
const fear = resolveCombatStatusRuntime(withStatus('ST_FEAR'));
assert.equal(fear.forcedRetreat, true);
assert.equal(fear.canAttack, false);
assert.equal(fear.canUseSkill, false);
assert.equal(resolveCombatStatusRuntime(withStatus('ST_CONFUSE')).accuracyMultiplier, 0.65);
assert.equal(resolveCombatStatusRuntime(withStatus('ST_BLIND')).accuracyMultiplier, 0.8);
assert.equal(resolveCombatStatusRuntime(withStatus('ST_PARALYZE')).cooldownRecoveryMultiplier, 0.8);

const burnTick = advanceEncounterEffects(withStatus('ST_BURN'), { toSec: 1, targetHp: 100, targetMaxHp: 100 });
assert.equal(burnTick.ok, true);
assert.equal(burnTick.damage, 1.5, 'DoT remains authoritative, not display-only');
assert.equal(burnTick.targetHp, 98.5);
const burnState = withStatus('ST_BURN');
const dotWithoutTick = {
  ...burnState,
  statuses: burnState.statuses.map(status => ({ ...status, nextTickAtSec: null })),
};
const buffState = withStatus('ST_ATK_UP');
const buffWithTick = {
  ...buffState,
  statuses: buffState.statuses.map(status => ({ ...status, nextTickAtSec: status.appliedAtSec + 1 })),
};
const duplicateDot = {
  ...burnState,
  statuses: [burnState.statuses[0], { ...burnState.statuses[0] }],
};
const overdueDot = {
  ...burnState,
  currentTimeSec: 0.75,
  statuses: burnState.statuses.map(status => ({ ...status, nextTickAtSec: 0.5 })),
};
assert.equal(isEncounterStatusState(dotWithoutTick), false, 'DoT runtime state requires a future tick cursor');
assert.equal(isEncounterStatusState(buffWithTick), false, 'non-DoT runtime state cannot carry a tick cursor');
assert.equal(isEncounterStatusState(duplicateDot), false, 'one encounter cannot contain duplicate StatusID records');
assert.equal(isEncounterStatusState(overdueDot), false, 'stored DoT cursor must be strictly ahead of current time');
assert.equal(resolveCombatStatusRuntime(dotWithoutTick).ok, false);
assert.equal(resolveCombatStatusRuntime(buffWithTick).ok, false);
assert.equal(resolveCombatStatusRuntime(duplicateDot).ok, false);
assert.equal(resolveCombatStatusRuntime(overdueDot).ok, false);
const dueApply = applyEncounterStatus(burnState, {
  statusId: 'ST_POISON', stacks: 1, durationSec: statusCatalogEntry('ST_POISON').baseDurationSec,
}, { nowSec: 1 });
assert.equal(dueApply.reason, 'advance_required', 'callers must settle due DoT ticks before applying another status');
const settledBurn = advanceEncounterEffects(burnState, { toSec: 1, targetHp: 100, targetMaxHp: 100 });
assert.equal(applyEncounterStatus(settledBurn.state, {
  statusId: 'ST_POISON', stacks: 1, durationSec: statusCatalogEntry('ST_POISON').baseDurationSec,
}, { nowSec: 1 }).ok, true, 'status application resumes after the tick cursor is advanced');

const proposalState = createEncounterStatusState({ encounterId: 'invalid-proposal', nowSec: 0 });
for (const sourceField of ['sourceSkillId', 'sourceLinkId', 'sourceInstanceId']) {
  const rejected = applyEncounterStatus(proposalState, {
    statusId: 'ST_ATK_UP', stacks: 1, durationSec: 5, [sourceField]: 123,
  }, { nowSec: 0 });
  assert.equal(rejected.ok, false, `${sourceField} must be string, null, or omitted`);
  assert.equal(rejected.reason, 'invalid_proposed_status');
  assert.equal(rejected.state, proposalState);
  assert.equal(isEncounterStatusState(rejected.state), true,
    'a rejected proposal cannot emit an invalid replacement state');
}
const infiniteHardCc = applyEncounterStatus(proposalState, {
  statusId: 'ST_STUN', stacks: 1, durationSec: Number.MAX_VALUE,
}, { nowSec: 0 });
assert.equal(infiniteHardCc.ok, false, 'hard-CC duration rounding must remain finite');
assert.equal(infiniteHardCc.reason, 'invalid_proposed_status');
assert.equal(infiniteHardCc.state, proposalState);
const absorbedNowSec = 1e16;
const absorbedState = createEncounterStatusState({ encounterId: 'absorbed-expiry', nowSec: absorbedNowSec });
const absorbedExpiry = applyEncounterStatus(absorbedState, {
  statusId: 'ST_ATK_UP', stacks: 1, durationSec: 1,
}, { nowSec: absorbedNowSec });
assert.equal(absorbedExpiry.ok, false, 'computed expiry must advance strictly beyond current time');
assert.equal(absorbedExpiry.reason, 'invalid_proposed_status');
assert.equal(absorbedExpiry.state, absorbedState);
const absorbedTick = applyEncounterStatus(absorbedState, {
  statusId: 'ST_BURN', stacks: 1, durationSec: 100,
}, { nowSec: absorbedNowSec });
assert.equal(absorbedTick.ok, false, 'computed DoT cursor must remain strictly in the future');
assert.equal(absorbedTick.reason, 'invalid_proposed_status');
assert.equal(absorbedTick.state, absorbedState);

const blindedAttack = resolveWorkbookDirectDamage({
  skillId: 'SK_NORMAL_01',
  attacker: { id: 'blind-actor', level: 30, types: ['Normal'], stats: { ATK: 100, SPATK: 100 }, statusState: withStatus('ST_BLIND') },
  defender: { id: 'target', level: 30, types: ['Normal'], stats: { DEF: 100, SPDEF: 100 }, hp: 200, maxHp: 200 },
  nowSec: 0,
}, { rng: () => 0.9 });
assert.equal(blindedAttack.reason, 'attack_missed');
assert.equal(blindedAttack.accuracyPct, 80);
assert.equal(blindedAttack.damage, 0);

let speciesWithStatusSkills = 0;
for (const monster of MONSTER_CATALOG) {
  const skillIds = new Set(SKILL_CATALOG.filter(skill => skill.runtimeType === monster.runtimeType).map(skill => skill.id));
  const links = SKILL_STATUS_LINKS.filter(link => skillIds.has(link.skillId));
  assert.ok(links.length > 0, `${monster.runtimeSpeciesId} must own at least one canonical status skill`);
  assert.ok(links.every(link => STATUS_RUNTIME_CHANNELS[link.statusId]), `${monster.runtimeSpeciesId} status skills must all resolve live behavior`);
  speciesWithStatusSkills += 1;
}
assert.equal(speciesWithStatusSkills, 18);

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const v800 = fs.readFileSync(new URL('../v800.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style-v800.css', import.meta.url), 'utf8');
const useSkillSource = game.slice(game.indexOf('function useSkill('), game.indexOf('function createOwnedBasicAiScratch('));
const ownedSource = game.slice(game.indexOf('function updateOwned('), game.indexOf('const wildAggressorCandidates'));
const wildSource = game.slice(game.indexOf('function updateWild('), game.indexOf('function updateProjectiles('));

assert.match(game, /statusState:createEncounterStatusState\(\{encounterId:wildId,nowSec:0\}\)/, 'every wild and boss receives the same status runtime');
assert.match(game, /statusState:createEncounterStatusState\(\{encounterId:`owned:\$\{inst\.instanceId\}`,nowSec:0\}\)/, 'every summoned owned monster receives the same status runtime');
assert.match(useSkillSource, /if\(!control\.ok\|\|!control\.canUseSkill\)/,
  'manual skill control fails closed before the Uses/Cooldown boundary');
assert.match(useSkillSource, /reason:control\.ok\?'status_controlled':'invalid_status_context'/,
  'invalid control resolution is distinct from a valid status lock');
{
  const actor = { inst: { skills: [{ currentUses: 3 }] }, statusState: dotWithoutTick, skillCds: [0] };
  const announcements = [];
  let boundaryCalls = 0;
  let applyCalls = 0;
  const bindings = {
    pirateThrowPanelPaused: () => false,
    activeSummon: actor,
    MANUAL_SKILL_SLOTS: Object.freeze(['s1']),
    canonicalCombatSkills: () => Object.freeze([Object.freeze({ skillId: 'SK_TEST', name: 'Test Skill' })]),
    resolveCombatStatusRuntime,
    announceCombatReason: value => announcements.push(value),
    skillFailureMessage: (_move, result) => result.reason,
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
  const executeManualSkill = Function(...names, `return (${useSkillSource});`)(...names.map(name => bindings[name]));
  const rejected = executeManualSkill(0, Object.freeze({ commandId: 'invalid-status-cast' }));
  assert.deepEqual(rejected, { ok: false, reason: 'invalid_status_context' });
  assert.equal(boundaryCalls, 0, 'invalid status context cannot enter the Uses/Cooldown boundary');
  assert.equal(actor.inst.skills[0].currentUses, 3, 'invalid status context cannot consume Uses');
  assert.equal(actor.skillCds[0], 0, 'invalid status context cannot start Cooldown');
  assert.equal(applyCalls, 0, 'invalid status context cannot apply field or skill effects');
  assert.deepEqual(announcements, ['invalid_status_context']);
}
assert.match(ownedSource, /cooldownElapsed=dt\*\(control\.ok\?control\.cooldownRecoveryMultiplier:1\)/);
assert.match(ownedSource, /control\.forcedRetreat&&control\.canMove/);
assert.match(ownedSource, /Math\.random\(\)>=control\.accuracyMultiplier/);
assert.match(ownedSource, /spawnDamageNumber\(tickDamage,[\s\S]*?label:'STATUS'/, 'owned DoT ticks must have visible combat feedback');
assert.match(wildSource, /selfModifiers=frameRuntime\?\.actor===w&&frameRuntime\.statusState===w\.statusState\?frameRuntime\.selfModifiers:resolveActiveSelfStatusModifiers\(w\.statusState\)/);
assert.match(game, /runtime\.statusState=w\.statusState;runtime\.control=control;runtime\.selfModifiers=selfModifiers/,
  'Wild status control and modifiers are computed once then reused for decision/motion/execute');
assert.match(wildSource, /const statusMissed=Math\.random\(\)>=control\.accuracyMultiplier/);
assert.match(wildSource, /target\.kind==='player'&&statusMissed/);
assert.match(wildSource, /\*selfModifiers\.attackMultiplier/);
assert.match(game, /resolveActiveSelfStatusModifiers\(defender\?\.statusState,\{incomingType:move\.type\}\)/, 'Basic Attack must honor defender buffs and debuffs');
assert.match(game, /damage:resolved\.damage>0\?Math\.max\(1,Math\.round\(resolved\.damage\*finalMultiplier\)\):0/, 'status scaling must preserve type immunity at zero damage');
assert.match(game, /renderCombatStatusList\(el\('ownedStatusStrip'\),activeSummon\?\.statusState/);
assert.match(game, /renderCombatStatusList\(el\('targetStatusStrip'\),target\.statusState/);
assert.match(game, /skillStatusLocked=!!activeSummon&&\(!statusControl\?\.ok\|\|!statusControl\.canUseSkill\)/);
for (const html of [index, v800]) {
  assert.match(html, /id="targetStatusStrip"/);
  assert.match(html, /id="ownedStatusStrip"/);
}
assert.match(css, /\.combat-status-chip\.negative/);
assert.match(css, /\.combat-status-chip\.positive/);
assert.match(css, /\.damage-pop\.miss/);

console.log('V8.6 live combat status: PASS (26/26 statuses, 18/18 monsters, AI + Basic + Manual + HUD)');
