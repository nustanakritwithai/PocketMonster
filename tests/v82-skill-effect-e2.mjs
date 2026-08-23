import assert from 'node:assert/strict';
import { executeEquippedSkillCommand } from '../skill-command-runtime.mjs';
import { SKILL_EFFECT_COVERAGE_CONTRACT } from '../skill-effect-contract.mjs';
import {
  E2_READY_SKILL_IDS,
  E2_SELF_EFFECT_POLICY,
  REVIEWED_SKILL_EFFECT_IDS,
  canExecuteE2SkillEffect,
  canExecuteReviewedSkillEffect,
  resolveActiveSelfStatusModifiers,
  resolveE2SkillEffects,
  resolveReviewedSkillEffects,
  resolveWorkbookDirectDamage,
  validateE2SkillEffectRequest,
  validateReviewedSkillEffectRequest,
} from '../skill-effect-runtime.mjs';
import { skillCatalogEntry } from '../skill-catalog.mjs';
import { createEncounterStatusState } from '../status-lifecycle.mjs';

function sequence(...values) {
  let index = 0;
  return () => values[index++];
}

function actor(overrides = {}) {
  const id = overrides.id ?? 'actor-1';
  return {
    id,
    level: 30,
    types: ['Normal'],
    stats: { ATK: 100, SPATK: 100 },
    hp: 100,
    maxHp: 200,
    statusState: createEncounterStatusState({ encounterId: `owned:${id}`, nowSec: 0 }),
    critChancePct: 5,
    ...overrides,
  };
}

function command(skillId, actorId = 'actor-1', targetIds = null) {
  const skill = skillCatalogEntry(skillId);
  return {
    ok: true,
    skillId,
    targetKind: skill.targetType,
    targetIds: targetIds ?? (skill.targetType === 'Self' ? [actorId] : ['enemy-1']),
  };
}

const e2Rows = SKILL_EFFECT_COVERAGE_CONTRACT.filter(row => row.components.some(
  component => component.slice === E2_SELF_EFFECT_POLICY.phase,
));
assert.equal(e2Rows.length, 27);
assert.equal(E2_READY_SKILL_IDS.length, 27);
assert.equal(new Set(E2_READY_SKILL_IDS).size, 27);
assert.equal(REVIEWED_SKILL_EFFECT_IDS.length, 108, 'cumulative reviewed coverage includes the E3 GroundPoint field');
assert.equal(canExecuteReviewedSkillEffect('SK_GRASS_05'), true);
assert.equal(canExecuteReviewedSkillEffect('SK_ICE_04'), true);
assert.equal(canExecuteE2SkillEffect('SK_NORMAL_03'), true);
assert.equal(E2_SELF_EFFECT_POLICY.healPercentMaxHp, 25);
assert.equal(E2_SELF_EFFECT_POLICY.healMagnitudeSource, 'runtime_fallback_workbook_percentage_unspecified');

let actorStatusExecutions = 0;
for (const row of e2Rows.filter(entry => entry.components.some(component => component.kind === 'status'))) {
  const self = actor({ types: [skillCatalogEntry(row.skillId).runtimeType] });
  const resolved = resolveE2SkillEffects({ command: command(row.skillId), actor: self, nowSec: 0 }, { rng: () => 0 });
  assert.equal(resolved.ok, true, row.skillId);
  assert.deepEqual(resolved.actorResult.statusResults.map(result => result.statusId), row.statusIds, row.skillId);
  assert.equal(resolved.actorResult.statusResults.every(result => result.applied), true, row.skillId);
  assert.equal(resolved.actorResult.nextStatusState.statuses.some(status => row.statusIds.includes(status.statusId)), true, row.skillId);
  assert.equal(resolved.rngDraws, 0, `${row.skillId} positive self status is guaranteed`);
  actorStatusExecutions += resolved.actorResult.statusResults.length;
}
assert.equal(actorStatusExecutions, 25, 'all actor-side workbook status links execute');

const healActor = actor();
const natureHeal = resolveE2SkillEffects({ command: command('SK_GRASS_05'), actor: healActor, nowSec: 0 });
assert.equal(natureHeal.ok, true);
assert.equal(natureHeal.actorResult.requestedHealing, 50);
assert.equal(natureHeal.healing, 50);
assert.equal(natureHeal.actorResult.predictedHp, 150);
const cappedHeal = resolveE2SkillEffects({ command: command('SK_LIGHT_04'), actor: actor({ hp: 190 }), nowSec: 0 });
assert.equal(cappedHeal.actorResult.requestedHealing, 50);
assert.equal(cappedHeal.healing, 10);
assert.equal(cappedHeal.actorResult.predictedHp, 200);
const fullHeal = resolveE2SkillEffects({ command: command('SK_LIGHT_04'), actor: actor({ hp: 200 }), nowSec: 0 });
assert.equal(fullHeal.ok, true, 'valid full-HP heal remains executable instead of not_ready');
assert.equal(fullHeal.healing, 0);

assert.equal(validateE2SkillEffectRequest({
  command: { ...command('SK_NORMAL_03'), targetIds: ['substitute'] }, actor: actor(), nowSec: 0,
}).reason, 'actor_mismatch');
assert.equal(resolveE2SkillEffects({ command: command('SK_ICE_04'), actor: actor(), nowSec: 0 }).reason, 'effect_not_ready');

function modifiersFor(skillId, incomingType = null) {
  const self = actor({ types: [skillCatalogEntry(skillId).runtimeType] });
  const result = resolveE2SkillEffects({ command: command(skillId), actor: self, nowSec: 0 });
  assert.equal(result.ok, true);
  const modifiers = resolveActiveSelfStatusModifiers(result.actorResult.nextStatusState, { incomingType });
  assert.equal(modifiers.ok, true);
  return modifiers;
}

assert.equal(modifiersFor('SK_NORMAL_03').attackMultiplier, 1.15);
assert.equal(modifiersFor('SK_GRASS_03').defenseMultiplier, 1.15);
assert.equal(modifiersFor('SK_FLYING_03').speedMultiplier, 1.15);
assert.equal(modifiersFor('SK_WATER_03').damageTakenMultiplier, 0.75);
assert.equal(modifiersFor('SK_FIRE_03', 'Fire').elementDamageTakenMultiplier, 0.75);
assert.equal(modifiersFor('SK_FIRE_03', 'Water').elementDamageTakenMultiplier, 1);
assert.equal(modifiersFor('SK_DARK_01').critChancePct, 15);
assert.equal(modifiersFor('SK_DARK_03').evasionChancePct, 15);
assert.equal(modifiersFor('SK_POISON_03').poisonResistancePct, 50);

const laterActor = actor();
const laterBuff = resolveE2SkillEffects({ command: command('SK_NORMAL_03'), actor: laterActor, nowSec: 10 });
const earlyTarget = {
  id: 'early-target', level: 30, types: ['Fire'], stats: { DEF: 100, SPDEF: 100 }, hp: 200, maxHp: 200,
  statusState: createEncounterStatusState({ encounterId: 'early-target', nowSec: 0 }),
};
const crossClockDamage = resolveWorkbookDirectDamage({
  skillId: 'SK_NORMAL_01',
  attacker: { ...laterActor, statusState: laterBuff.actorResult.nextStatusState },
  defender: earlyTarget,
  attackerNowSec: 10,
  defenderNowSec: 0,
}, { rng: sequence(1, 0.5) });
assert.equal(crossClockDamage.attackModifier, 1.15, 'actor and target encounter clocks remain independent');

const compositeActor = actor({ id: 'composite-actor', types: ['Dark'] });
const compositeTarget = {
  id: 'enemy-1', level: 30, types: ['Normal'], stats: { DEF: 100, SPDEF: 100 }, hp: 200, maxHp: 200,
  statusState: createEncounterStatusState({ encounterId: 'enemy-1', nowSec: 0 }),
};
const compositeCommand = command('SK_DARK_01', compositeActor.id);
const compositeRequest = { command: compositeCommand, attacker: compositeActor, targets: [compositeTarget], nowSec: 0 };
assert.equal(validateReviewedSkillEffectRequest(compositeRequest).ok, true);
const composite = resolveReviewedSkillEffects(compositeRequest, { rng: sequence(1, 0.5) });
assert.equal(composite.ok, true);
assert.ok(composite.totalDamage > 0);
assert.equal(composite.actorResult.statusResults[0].statusId, 'ST_CRIT_UP');
assert.equal(composite.actorResult.statusResults[0].applied, true);
assert.deepEqual(composite.activeComponentKinds, ['direct_damage', 'status']);
assert.deepEqual(composite.deferredComponentKinds, []);

const atomicInstance = {
  instanceId: 'atomic-self',
  speciesId: 'normalooze',
  skills: [
    { skillId: 'SK_NORMAL_03', slot: 's1', currentUses: 10 },
    { skillId: 'SK_NORMAL_01', slot: 's2', currentUses: 28 },
    { skillId: 'SK_NORMAL_04', slot: 's3', currentUses: 10 },
    { skillId: 'SK_NORMAL_06', slot: 's4', currentUses: 3 },
  ],
};
const atomicActorPosition = { id: atomicInstance.instanceId, alive: true, position: { x: 0, z: 0 } };
let atomicEffectActor = actor({ id: atomicInstance.instanceId });
let effectCommits = 0;
let cooldownCommits = 0;
const executeAtomic = () => executeEquippedSkillCommand(atomicInstance, {
  slot: 's1', commandId: 'self-cast-1', actor: atomicActorPosition, enemies: [], cooldownRemainingSec: 0,
}, {
  materializeTargets: () => [{ ...atomicActorPosition, world: atomicEffectActor }],
  canApply: commandValue => validateReviewedSkillEffectRequest({
    command: commandValue, attacker: atomicEffectActor, targets: [], nowSec: 0,
  }).ok,
  applyAccepted: commandValue => {
    const applied = resolveReviewedSkillEffects({
      command: commandValue, attacker: atomicEffectActor, targets: [], nowSec: 0,
    });
    assert.equal(applied.ok, true);
    effectCommits += 1;
    cooldownCommits += 1;
    atomicEffectActor = { ...atomicEffectActor, statusState: applied.actorResult.nextStatusState };
    return applied;
  },
});

const accepted = executeAtomic();
assert.equal(accepted.ok, true);
assert.equal(atomicInstance.skills[0].currentUses, 9);
assert.equal(effectCommits, 1);
assert.equal(cooldownCommits, 1);
assert.equal(atomicEffectActor.statusState.statuses.filter(status => status.statusId === 'ST_ATK_UP').length, 1);
const replay = executeAtomic();
assert.equal(replay.ok, false);
assert.equal(replay.reason, 'duplicate_cast');
assert.equal(atomicInstance.skills[0].currentUses, 9);
assert.equal(effectCommits, 1);
assert.equal(cooldownCommits, 1);

console.log('V8.2 E2 canonical Self Heal/Buff/Shield: PASS (27 skills, 25 status links, 2 heals)');
