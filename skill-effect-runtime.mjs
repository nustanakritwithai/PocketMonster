import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { SKILL_EFFECT_COVERAGE_CONTRACT, skillEffectCoverageEntry } from './skill-effect-contract.mjs';
import { SKILL_CATALOG, skillCatalogEntry } from './skill-catalog.mjs';
import { statusCatalogEntry } from './status-catalog.mjs';
import { applyEncounterStatus, isEncounterStatusState } from './status-lifecycle.mjs';
import { resolveStatusApplication } from './status-resolver.mjs';
import { RUNTIME_TYPES, typeEffectiveness } from './type-catalog.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

export const WORKBOOK_DAMAGE_RULES = Object.freeze({
  formulaVersion: 'DMG_v1.0',
  levelMin: 1,
  levelCap: 60,
  levelScaleDivisor: 5,
  baseFormulaDivisor: 50,
  baseDamageFlat: 2,
  stabMultiplier: 1.2,
  criticalMultiplier: 1.5,
  baseCritChancePct: 5,
  critChanceCapPct: 80,
  varianceMin: 0.9,
  varianceMax: 1,
  variancePreview: 0.95,
  minimumSuccessfulDamage: 1,
  statModifierMin: 0.25,
  statModifierMax: 2.5,
  damageTakenMin: 0.25,
  damageTakenMax: 3,
  armorPierceCapPct: 50,
  bonusVsDarkPct: 25,
});

export const DAMAGE_STATUS_MODIFIERS = Object.freeze([
  Object.freeze({ statusId: 'ST_ATK_UP', layer: 'AttackStat', stat: 'ATK', magnitudePct: 15 }),
  Object.freeze({ statusId: 'ST_WEAKEN', layer: 'AttackStat', stat: 'ATK', magnitudePct: -15 }),
  Object.freeze({ statusId: 'ST_SPATK_UP', layer: 'AttackStat', stat: 'SPATK', magnitudePct: 15 }),
  Object.freeze({ statusId: 'ST_ATKDEF_UP', layer: 'AttackStat', stat: 'ATK', magnitudePct: 12 }),
  Object.freeze({ statusId: 'ST_DEF_UP', layer: 'DefenseStat', stat: 'DEF', magnitudePct: 15 }),
  Object.freeze({ statusId: 'ST_ARMOR_BREAK', layer: 'DefenseStat', stat: 'DEF', magnitudePct: -15 }),
  Object.freeze({ statusId: 'ST_ATKDEF_UP', layer: 'DefenseStat', stat: 'DEF', magnitudePct: 12 }),
  Object.freeze({ statusId: 'ST_VULNERABLE', layer: 'DamageTaken', stat: 'FinalDamage', magnitudePct: 15 }),
  Object.freeze({ statusId: 'ST_DAMAGE_REDUCE', layer: 'DamageTaken', stat: 'FinalDamage', magnitudePct: -25 }),
  Object.freeze({ statusId: 'ST_FIRE_RESIST', layer: 'ElementResist', stat: 'Fire', magnitudePct: -25 }),
  Object.freeze({ statusId: 'ST_CRIT_UP', layer: 'CritChance', stat: 'CritChance', magnitudePct: 15 }),
]);

const TOTAL_POWER_BUDGET_SKILLS = new Set([
  'SK_GRASS_06',
  'SK_ELECTRIC_06',
  'SK_PSYCHIC_06',
  'SK_BUG_05',
  'SK_FIGHTING_02',
]);

const REFERENCE_DAMAGE_BY_POWER = new Map([
  [38, 13], [42, 14], [52, 18], [72, 25], [77, 26], [118, 39], [135, 44],
]);

function scalingProfile(skill) {
  if (!skill.directDamage) return Object.freeze({ scalingStat: 'None', defenseStat: 'None', canCrit: false });
  if (skill.category === 'Physical') return Object.freeze({ scalingStat: 'ATK', defenseStat: 'DEF', canCrit: true });
  return Object.freeze({
    scalingStat: 'SPATK',
    defenseStat: 'SPDEF',
    canCrit: skill.category !== 'Control',
  });
}

export const SKILL_DAMAGE_PROFILES = Object.freeze(SKILL_CATALOG.map(skill => {
  const scaling = scalingProfile(skill);
  const hitCount = TOTAL_POWER_BUDGET_SKILLS.has(skill.id) ? 3 : 1;
  return Object.freeze({
    skillId: skill.id,
    sourceType: skill.sourceType,
    runtimeType: skill.runtimeType,
    category: skill.category,
    power: skill.power,
    scalingStat: scaling.scalingStat,
    defenseStat: scaling.defenseStat,
    directDamage: skill.directDamage,
    canCrit: scaling.canCrit,
    hitCount,
    effect: skill.effect,
    armorPiercePct: skill.armorPiercePct,
    bonusVsDarkPct: skill.effect === 'BonusVsDark' ? WORKBOOK_DAMAGE_RULES.bonusVsDarkPct : 0,
    powerBudgetRule: hitCount > 1 ? 'TotalPowerBudget' : 'SingleResolution',
    referenceDamageLv30: skill.directDamage ? REFERENCE_DAMAGE_BY_POWER.get(skill.power) ?? null : 0,
    formulaVersion: skill.damageFormulaVersion,
    sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  });
}));

const DAMAGE_PROFILE_BY_SKILL_ID = new Map(SKILL_DAMAGE_PROFILES.map(profile => [profile.skillId, profile]));
const RUNTIME_TYPE_SET = new Set(RUNTIME_TYPES);

function e1ComponentActive(component) {
  return component.kind === 'direct_damage'
    || (component.kind === 'status' && component.targetChannel === 'command_targets')
    || ['attack_modifier', 'damage_modifier', 'damage_shape'].includes(component.kind);
}

export const E1_READY_SKILL_IDS = Object.freeze(SKILL_EFFECT_COVERAGE_CONTRACT
  .filter(row => row.components.some(component => component.kind === 'direct_damage'))
  .map(row => row.skillId));

const E1_READY_SKILLS = new Set(E1_READY_SKILL_IDS);

export const E2_READY_SKILL_IDS = Object.freeze(SKILL_EFFECT_COVERAGE_CONTRACT
  .filter(row => row.components.some(component => component.slice === 'E2_SELF_HEAL_BUFF_SHIELD'))
  .map(row => row.skillId));

const E2_READY_SKILLS = new Set(E2_READY_SKILL_IDS);

export const REVIEWED_SKILL_EFFECT_IDS = Object.freeze(SKILL_EFFECT_COVERAGE_CONTRACT
  .filter(row => E1_READY_SKILLS.has(row.skillId) || E2_READY_SKILLS.has(row.skillId))
  .map(row => row.skillId));

const REVIEWED_SKILL_EFFECTS = new Set(REVIEWED_SKILL_EFFECT_IDS);

export const E2_SELF_EFFECT_POLICY = Object.freeze({
  phase: 'E2_SELF_HEAL_BUFF_SHIELD',
  activation: 'live',
  statusSource: 'Status_Master + Skill_Status_Link',
  healMode: 'percentage_max_hp',
  healPercentMaxHp: 25,
  healMagnitudeSource: 'runtime_fallback_workbook_percentage_unspecified',
  positiveStatusChance: 'guaranteed_by_status_resolver',
  encounterBoundary: 'clear_all',
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
});

export const SKILL_EFFECT_RUNTIME_POLICY = Object.freeze({
  phase: 'E1_DIRECT_DAMAGE_STATUS',
  activation: 'live',
  directDamageFormula: WORKBOOK_DAMAGE_RULES.formulaVersion,
  statusOrder: 'after_successful_nonlethal_hit',
  targetOrder: 'canonical_command_order',
  multiHitRule: 'total_power_budget_single_damage_resolution',
  rngAuthority: 'injected_runtime_rng',
  usesCommitOwner: 'skill_command_runtime',
  cooldownCommitOwner: 'live_accepted_adapter',
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
});

function effectResult(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function validTypes(types) {
  return Array.isArray(types) && types.length >= 1 && types.length <= 2
    && new Set(types).size === types.length && types.every(type => RUNTIME_TYPE_SET.has(type));
}

function validLevel(level) {
  return Number.isInteger(level)
    && level >= WORKBOOK_DAMAGE_RULES.levelMin && level <= WORKBOOK_DAMAGE_RULES.levelCap;
}

function activeStatusIds(combatant, nowSec) {
  if (Array.isArray(combatant?.activeStatusIds)) return [...new Set(combatant.activeStatusIds)];
  const statuses = combatant?.statusState?.statuses;
  if (!Array.isArray(statuses)) return [];
  return [...new Set(statuses
    .filter(status => status && status.appliedAtSec <= nowSec && status.expiresAtSec > nowSec)
    .map(status => status.statusId))];
}

function modifierPct(statusIds, layer, stat = null) {
  return DAMAGE_STATUS_MODIFIERS
    .filter(modifier => statusIds.includes(modifier.statusId)
      && modifier.layer === layer && (stat == null || modifier.stat === stat))
    .reduce((total, modifier) => total + modifier.magnitudePct, 0);
}

function finitePercent(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function readRoll(rng, label) {
  if (typeof rng !== 'function') return effectResult(false, 'rng_required', { label, rngDraws: 0 });
  let roll;
  try {
    roll = rng();
  } catch {
    return effectResult(false, 'rng_failure', { label, rngDraws: 0 });
  }
  if (!Number.isFinite(roll) || roll < 0 || roll > 1) {
    return effectResult(false, 'invalid_rng_value', { label, roll, rngDraws: 1 });
  }
  return effectResult(true, null, { label, roll, rngDraws: 1 });
}

function validateDamageInput(profile, attacker, defender) {
  if (!profile?.directDamage) return 'not_direct_damage';
  if (!attacker || typeof attacker.id !== 'string' || !validLevel(attacker.level)
    || !validTypes(attacker.types) || !attacker.stats || !Number.isFinite(attacker.stats[profile.scalingStat])
    || attacker.stats[profile.scalingStat] <= 0) return 'invalid_attacker';
  if (!defender || typeof defender.id !== 'string' || !validLevel(defender.level)
    || !validTypes(defender.types) || !defender.stats || !Number.isFinite(defender.stats[profile.defenseStat])
    || defender.stats[profile.defenseStat] <= 0 || !Number.isFinite(defender.hp)
    || !Number.isFinite(defender.maxHp) || defender.hp <= 0 || defender.maxHp <= 0
    || defender.hp > defender.maxHp) return 'invalid_defender';
  return null;
}

export function skillDamageProfile(skillId) {
  return DAMAGE_PROFILE_BY_SKILL_ID.get(skillId) ?? null;
}

export function canExecuteE1SkillEffect(skillId) {
  return E1_READY_SKILLS.has(skillId);
}

export function canExecuteE2SkillEffect(skillId) {
  return E2_READY_SKILLS.has(skillId);
}

export function canExecuteReviewedSkillEffect(skillId) {
  return REVIEWED_SKILL_EFFECTS.has(skillId);
}

export function resolveWorkbookDirectDamage({
  skillId,
  attacker,
  defender,
  nowSec = 0,
  attackerNowSec = nowSec,
  defenderNowSec = nowSec,
} = {}, { rng } = {}) {
  const profile = skillDamageProfile(skillId);
  if (!profile) return effectResult(false, 'unknown_skill', { skillId: skillId ?? null, rngDraws: 0 });
  const invalid = validateDamageInput(profile, attacker, defender);
  if (invalid) return effectResult(false, invalid, { skillId, rngDraws: 0 });
  if (!Number.isFinite(attackerNowSec) || attackerNowSec < 0
    || !Number.isFinite(defenderNowSec) || defenderNowSec < 0) {
    return effectResult(false, 'invalid_time', { skillId, rngDraws: 0 });
  }

  const skill = skillCatalogEntry(skillId);
  let rngDraws = 0;
  let accuracyRoll = null;
  if (skill.accuracy < 100) {
    const accuracy = readRoll(rng, 'accuracy');
    if (!accuracy.ok) return effectResult(false, accuracy.reason, { skillId, rngDraws: accuracy.rngDraws });
    rngDraws += accuracy.rngDraws;
    accuracyRoll = accuracy.roll;
    if (accuracyRoll >= skill.accuracy / 100) {
      return effectResult(true, 'attack_missed', {
        skillId,
        targetId: defender.id,
        hit: false,
        damage: 0,
        accuracyRoll,
        accuracyPct: skill.accuracy,
        hitCount: profile.hitCount,
        powerBudgetRule: profile.powerBudgetRule,
        rngDraws,
      });
    }
  }

  const attackerStatuses = activeStatusIds(attacker, attackerNowSec);
  const defenderStatuses = activeStatusIds(defender, defenderNowSec);
  const attackModifier = clamp(
    1 + modifierPct(attackerStatuses, 'AttackStat', profile.scalingStat) / 100,
    WORKBOOK_DAMAGE_RULES.statModifierMin,
    WORKBOOK_DAMAGE_RULES.statModifierMax,
  );
  const defenseModifier = clamp(
    1 + modifierPct(defenderStatuses, 'DefenseStat', profile.defenseStat) / 100,
    WORKBOOK_DAMAGE_RULES.statModifierMin,
    WORKBOOK_DAMAGE_RULES.statModifierMax,
  );
  const powerBonusPct = finitePercent(attacker.powerBonusPct);
  const effectivePower = profile.power * (1 + powerBonusPct / 100);
  const effectiveAttack = attacker.stats[profile.scalingStat] * attackModifier;
  const armorPiercePct = clamp(profile.armorPiercePct, 0, WORKBOOK_DAMAGE_RULES.armorPierceCapPct);
  const effectiveDefense = Math.max(1, defender.stats[profile.defenseStat]
    * defenseModifier * (1 - armorPiercePct / 100));
  const baseDamage = Math.floor(
    ((((2 * attacker.level / WORKBOOK_DAMAGE_RULES.levelScaleDivisor) + 2)
      * effectivePower * effectiveAttack / effectiveDefense)
      / WORKBOOK_DAMAGE_RULES.baseFormulaDivisor)
      + WORKBOOK_DAMAGE_RULES.baseDamageFlat,
  );
  const stab = attacker.types.includes(profile.runtimeType) ? WORKBOOK_DAMAGE_RULES.stabMultiplier : 1;
  const typeMultiplier = typeEffectiveness(profile.runtimeType, defender.types);
  if (typeMultiplier === 0) {
    return effectResult(true, 'type_immune', {
      skillId,
      targetId: defender.id,
      hit: true,
      damage: 0,
      accuracyRoll,
      accuracyPct: skill.accuracy,
      baseDamage,
      stab,
      typeMultiplier,
      critical: false,
      criticalMultiplier: 1,
      variance: null,
      armorPiercePct,
      hitCount: profile.hitCount,
      powerBudgetRule: profile.powerBudgetRule,
      rngDraws,
    });
  }

  let critical = false;
  let criticalRoll = null;
  let criticalMultiplier = 1;
  const critChancePct = profile.canCrit
    ? clamp(
      finitePercent(attacker.critChancePct, WORKBOOK_DAMAGE_RULES.baseCritChancePct)
        + modifierPct(attackerStatuses, 'CritChance'),
      0,
      WORKBOOK_DAMAGE_RULES.critChanceCapPct,
    )
    : 0;
  if (profile.canCrit) {
    const crit = readRoll(rng, 'critical');
    if (!crit.ok) return effectResult(false, crit.reason, { skillId, rngDraws: rngDraws + crit.rngDraws });
    rngDraws += crit.rngDraws;
    criticalRoll = crit.roll;
    critical = criticalRoll < critChancePct / 100;
    criticalMultiplier = critical ? WORKBOOK_DAMAGE_RULES.criticalMultiplier : 1;
  }
  const varianceRoll = readRoll(rng, 'variance');
  if (!varianceRoll.ok) return effectResult(false, varianceRoll.reason, { skillId, rngDraws: rngDraws + varianceRoll.rngDraws });
  rngDraws += varianceRoll.rngDraws;
  const variance = WORKBOOK_DAMAGE_RULES.varianceMin
    + (WORKBOOK_DAMAGE_RULES.varianceMax - WORKBOOK_DAMAGE_RULES.varianceMin) * varianceRoll.roll;
  const conditionalMultiplier = profile.bonusVsDarkPct > 0 && defender.types.includes('Dark')
    ? 1 + profile.bonusVsDarkPct / 100
    : 1;
  const damageDealtMultiplier = Math.max(0, 1 + finitePercent(attacker.damageDealtPct) / 100);
  const damageTakenMultiplier = clamp(
    1 + (modifierPct(defenderStatuses, 'DamageTaken') + finitePercent(defender.damageTakenPct)) / 100,
    WORKBOOK_DAMAGE_RULES.damageTakenMin,
    WORKBOOK_DAMAGE_RULES.damageTakenMax,
  );
  const fireResistPct = profile.runtimeType === 'Fire' && defenderStatuses.includes('ST_FIRE_RESIST') ? 25 : 0;
  const elementResistMultiplier = Math.max(0,
    1 - clamp(finitePercent(defender.elementResistPct) + fireResistPct, 0, 100) / 100);
  const rawDamage = baseDamage * stab * typeMultiplier * criticalMultiplier
    * conditionalMultiplier * damageDealtMultiplier * damageTakenMultiplier
    * elementResistMultiplier * variance;
  const damage = Math.max(WORKBOOK_DAMAGE_RULES.minimumSuccessfulDamage, Math.floor(rawDamage));

  return effectResult(true, null, {
    skillId,
    targetId: defender.id,
    hit: true,
    damage,
    accuracyRoll,
    accuracyPct: skill.accuracy,
    baseDamage,
    effectivePower,
    effectiveAttack,
    effectiveDefense,
    attackModifier,
    defenseModifier,
    stab,
    typeMultiplier,
    critical,
    criticalRoll,
    critChancePct,
    criticalMultiplier,
    conditionalMultiplier,
    damageDealtMultiplier,
    damageTakenMultiplier,
    elementResistMultiplier,
    variance,
    armorPiercePct,
    hitCount: profile.hitCount,
    powerBudgetRule: profile.powerBudgetRule,
    rngDraws,
  });
}

function currentStacks(state, statusId, nowSec) {
  const status = state.statuses.find(entry => entry.statusId === statusId && entry.expiresAtSec > nowSec);
  return status?.stacks ?? 0;
}

function skippedStatusResults(row, reason) {
  return Object.freeze(row.statusLinkIds.map((linkId, index) => Object.freeze({
    linkId,
    statusId: row.statusIds[index],
    applied: false,
    reason,
    rngDraws: 0,
  })));
}

function e1StatusCoverage(row) {
  return row.components.some(component => component.kind === 'status'
    && component.targetChannel === 'command_targets')
    ? Object.freeze({ statusLinkIds: row.statusLinkIds, statusIds: row.statusIds })
    : Object.freeze({ statusLinkIds: Object.freeze([]), statusIds: Object.freeze([]) });
}

function validE1Request(command, attacker, targets, nowSec) {
  if (!command || command.ok !== true || typeof command.skillId !== 'string'
    || !Array.isArray(command.targetIds) || !E1_READY_SKILLS.has(command.skillId)) return 'effect_not_ready';
  const skill = skillCatalogEntry(command.skillId);
  if (!skill || command.targetKind !== skill.targetType
    || !['NearestEnemy', 'EnemyArea'].includes(command.targetKind)) return 'invalid_command';
  if (!Array.isArray(targets) || targets.length !== command.targetIds.length
    || targets.some((target, index) => target?.id !== command.targetIds[index])) return 'target_mismatch';
  if (!Number.isFinite(nowSec) || nowSec < 0) return 'invalid_time';
  const profile = skillDamageProfile(command.skillId);
  const enemyStatuses = e1StatusCoverage(skillEffectCoverageEntry(command.skillId));
  for (const target of targets) {
    const targetNowSec = Number.isFinite(target?.nowSec) ? target.nowSec : nowSec;
    const invalid = validateDamageInput(profile, attacker, target);
    if (invalid) return invalid;
    if (enemyStatuses.statusLinkIds.length > 0
      && (!isEncounterStatusState(target.statusState)
        || target.statusState.ended === true || target.statusState.currentTimeSec > targetNowSec)) return 'invalid_status_state';
  }
  return null;
}

export function validateE1SkillEffectRequest(request = {}) {
  const reason = validE1Request(request.command, request.attacker, request.targets, request.nowSec);
  return effectResult(reason === null, reason);
}

export function resolveE1SkillEffects({ command, attacker, targets, nowSec = 0 } = {}, { rng } = {}) {
  const invalid = validE1Request(command, attacker, targets, nowSec);
  if (invalid) return effectResult(false, invalid, { rngDraws: 0 });
  const coverage = skillEffectCoverageEntry(command.skillId);
  const enemyStatuses = e1StatusCoverage(coverage);
  const targetResults = [];
  let totalDamage = 0;
  let statusAppliedCount = 0;
  let rngDraws = 0;

  for (const target of targets) {
    const targetNowSec = Number.isFinite(target.nowSec) ? target.nowSec : nowSec;
    const damage = resolveWorkbookDirectDamage({
      skillId: command.skillId,
      attacker,
      defender: target,
      attackerNowSec: nowSec,
      defenderNowSec: targetNowSec,
    }, { rng });
    if (!damage.ok) return effectResult(false, damage.reason, { rngDraws: rngDraws + damage.rngDraws });
    rngDraws += damage.rngDraws;
    const predictedHp = Math.max(0, target.hp - damage.damage);
    const fainted = predictedHp <= 0;
    let nextStatusState = target.statusState ?? null;
    let statusResults = Object.freeze([]);

    if (enemyStatuses.statusLinkIds.length > 0) {
      if (!damage.hit) {
        statusResults = skippedStatusResults(enemyStatuses, 'attack_missed');
      } else if (fainted) {
        statusResults = skippedStatusResults(enemyStatuses, 'target_fainted');
      } else {
        const resolvedStatuses = [];
        for (let index = 0; index < enemyStatuses.statusLinkIds.length; index += 1) {
          const linkId = enemyStatuses.statusLinkIds[index];
          const statusId = enemyStatuses.statusIds[index];
          const resolved = resolveStatusApplication({
            linkId,
            targetTypes: target.types,
            currentStacks: currentStacks(nextStatusState, statusId, targetNowSec),
            extraResistancePct: finitePercent(target.statusResistancePct),
          }, { rng });
          if (!resolved.ok) return effectResult(false, resolved.reason, { rngDraws: rngDraws + resolved.rngDraws });
          rngDraws += resolved.rngDraws;
          let applied = false;
          let lifecycleReason = resolved.reason;
          let ccDr = null;
          if (resolved.applied) {
            const lifecycle = applyEncounterStatus(nextStatusState, {
              ...resolved.proposedStatus,
              stacks: resolved.stackRule === 'AddStackAndRefresh'
                ? resolved.potencyStacks
                : resolved.proposedStatus.stacks,
              sourceInstanceId: attacker.id,
            }, { nowSec: targetNowSec });
            if (!lifecycle.ok) return effectResult(false, lifecycle.reason, { rngDraws });
            nextStatusState = lifecycle.state;
            applied = lifecycle.applied;
            lifecycleReason = lifecycle.reason;
            ccDr = lifecycle.ccDr;
            if (applied) statusAppliedCount += 1;
          }
          resolvedStatuses.push(Object.freeze({
            linkId,
            statusId,
            applied,
            reason: lifecycleReason,
            finalChancePct: resolved.finalChancePct,
            rngDraws: resolved.rngDraws,
            ccDr,
          }));
        }
        statusResults = Object.freeze(resolvedStatuses);
      }
    }
    totalDamage += damage.damage;
    targetResults.push(Object.freeze({
      targetId: target.id,
      nowSec: targetNowSec,
      hit: damage.hit,
      damage: damage.damage,
      predictedHp,
      fainted,
      damageResult: damage,
      statusResults,
      nextStatusState,
    }));
  }

  return effectResult(true, null, {
    effectMode: 'canonical_e1_direct_status',
    skillId: command.skillId,
    targetResults: Object.freeze(targetResults),
    hitCount: targetResults.filter(target => target.hit).length,
    totalDamage,
    statusAppliedCount,
    activeComponentKinds: Object.freeze(coverage.components.filter(e1ComponentActive).map(component => component.kind)),
    deferredComponentKinds: Object.freeze(coverage.components.filter(component => !e1ComponentActive(component)).map(component => component.kind)),
    rngDraws,
  });
}

function e2Components(row) {
  return row.components.filter(component => component.slice === E2_SELF_EFFECT_POLICY.phase);
}

function validE2Request(command, actor, nowSec) {
  if (!command || command.ok !== true || typeof command.skillId !== 'string'
    || !Array.isArray(command.targetIds) || !E2_READY_SKILLS.has(command.skillId)) return 'effect_not_ready';
  const skill = skillCatalogEntry(command.skillId);
  if (!skill || command.targetKind !== skill.targetType) return 'invalid_command';
  if (!actor || typeof actor.id !== 'string' || !validLevel(actor.level) || !validTypes(actor.types)
    || !Number.isFinite(actor.hp) || !Number.isFinite(actor.maxHp) || actor.hp <= 0
    || actor.maxHp <= 0 || actor.hp > actor.maxHp || !isEncounterStatusState(actor.statusState)
    || actor.statusState.ended === true) return 'invalid_actor';
  if (!Number.isFinite(nowSec) || nowSec < actor.statusState.currentTimeSec) return 'invalid_time';
  if (command.targetKind === 'Self'
    && (command.targetIds.length !== 1 || command.targetIds[0] !== actor.id)) return 'actor_mismatch';
  return null;
}

export function validateE2SkillEffectRequest(request = {}) {
  const reason = validE2Request(request.command, request.actor, request.nowSec);
  return effectResult(reason === null, reason);
}

export function resolveE2SkillEffects({ command, actor, nowSec = 0 } = {}, { rng } = {}) {
  const invalid = validE2Request(command, actor, nowSec);
  if (invalid) return effectResult(false, invalid, { rngDraws: 0 });
  const coverage = skillEffectCoverageEntry(command.skillId);
  const components = e2Components(coverage);
  let nextStatusState = actor.statusState;
  const statusResults = [];
  let statusAppliedCount = 0;
  let rngDraws = 0;

  if (components.some(component => component.kind === 'status')) {
    for (let index = 0; index < coverage.statusLinkIds.length; index += 1) {
      const linkId = coverage.statusLinkIds[index];
      const statusId = coverage.statusIds[index];
      const resolved = resolveStatusApplication({
        linkId,
        targetTypes: actor.types,
        currentStacks: currentStacks(nextStatusState, statusId, nowSec),
      }, { rng });
      if (!resolved.ok) return effectResult(false, resolved.reason, { rngDraws: rngDraws + resolved.rngDraws });
      rngDraws += resolved.rngDraws;
      let applied = false;
      let lifecycleReason = resolved.reason;
      if (resolved.applied) {
        const lifecycle = applyEncounterStatus(nextStatusState, {
          ...resolved.proposedStatus,
          stacks: resolved.stackRule === 'AddStackAndRefresh'
            ? resolved.potencyStacks
            : resolved.proposedStatus.stacks,
          sourceInstanceId: actor.id,
        }, { nowSec });
        if (!lifecycle.ok) return effectResult(false, lifecycle.reason, { rngDraws });
        nextStatusState = lifecycle.state;
        applied = lifecycle.applied;
        lifecycleReason = lifecycle.reason;
        if (applied) statusAppliedCount += 1;
      }
      statusResults.push(Object.freeze({
        linkId,
        statusId,
        applied,
        reason: lifecycleReason,
        finalChancePct: resolved.finalChancePct,
        rngDraws: resolved.rngDraws,
      }));
    }
  }

  const hasHeal = components.some(component => component.kind === 'self_heal');
  const requestedHealing = hasHeal
    ? Math.max(1, Math.round(actor.maxHp * E2_SELF_EFFECT_POLICY.healPercentMaxHp / 100))
    : 0;
  const healing = Math.min(actor.maxHp - actor.hp, requestedHealing);
  const predictedHp = actor.hp + healing;
  return effectResult(true, null, {
    effectMode: 'canonical_e2_self_support',
    skillId: command.skillId,
    actorResult: Object.freeze({
      actorId: actor.id,
      previousHp: actor.hp,
      predictedHp,
      requestedHealing,
      healing,
      statusResults: Object.freeze(statusResults),
      nextStatusState,
    }),
    healing,
    statusAppliedCount,
    activeComponentKinds: Object.freeze(components.map(component => component.kind)),
    rngDraws,
  });
}

export function resolveActiveSelfStatusModifiers(statusState, { nowSec = statusState?.currentTimeSec, incomingType = null } = {}) {
  if (!isEncounterStatusState(statusState) || statusState.ended === true
    || !Number.isFinite(nowSec) || nowSec < statusState.currentTimeSec
    || (incomingType !== null && !RUNTIME_TYPE_SET.has(incomingType))) {
    return effectResult(false, 'invalid_status_context');
  }
  const definitions = activeStatusIds({ statusState }, nowSec)
    .map(statusCatalogEntry)
    .filter(Boolean);
  const magnitudeFor = modifiedStat => definitions
    .filter(definition => definition.modifiedStat === modifiedStat)
    .reduce((total, definition) => total + definition.magnitude, 0);
  const attackPct = magnitudeFor('ATK') + magnitudeFor('ATK_DEF');
  const specialAttackPct = magnitudeFor('SPATK');
  const defensePct = magnitudeFor('DEF') + magnitudeFor('ATK_DEF');
  const speedPct = magnitudeFor('SPD');
  const damageTakenPct = magnitudeFor('DamageTaken');
  const elementDamageTakenPct = incomingType === 'Fire' ? magnitudeFor('FireDamageTaken') : 0;
  return effectResult(true, null, {
    attackMultiplier: clamp(1 + attackPct / 100, WORKBOOK_DAMAGE_RULES.statModifierMin, WORKBOOK_DAMAGE_RULES.statModifierMax),
    specialAttackMultiplier: clamp(1 + specialAttackPct / 100, WORKBOOK_DAMAGE_RULES.statModifierMin, WORKBOOK_DAMAGE_RULES.statModifierMax),
    defenseMultiplier: clamp(1 + defensePct / 100, WORKBOOK_DAMAGE_RULES.statModifierMin, WORKBOOK_DAMAGE_RULES.statModifierMax),
    speedMultiplier: clamp(1 + speedPct / 100, WORKBOOK_DAMAGE_RULES.statModifierMin, WORKBOOK_DAMAGE_RULES.statModifierMax),
    damageTakenMultiplier: clamp(1 + damageTakenPct / 100, WORKBOOK_DAMAGE_RULES.damageTakenMin, WORKBOOK_DAMAGE_RULES.damageTakenMax),
    elementDamageTakenMultiplier: Math.max(0, 1 + elementDamageTakenPct / 100),
    critChancePct: clamp(magnitudeFor('CritChance'), 0, WORKBOOK_DAMAGE_RULES.critChanceCapPct),
    evasionChancePct: clamp(magnitudeFor('Evasion'), 0, 100),
    poisonResistancePct: clamp(Math.abs(magnitudeFor('PoisonApplyChance')), 0, 100),
    activeStatusIds: Object.freeze(definitions.map(definition => definition.id)),
  });
}

export function validateReviewedSkillEffectRequest(request = {}) {
  const skillId = request.command?.skillId;
  if (!REVIEWED_SKILL_EFFECTS.has(skillId)) return effectResult(false, 'effect_not_ready');
  if (E1_READY_SKILLS.has(skillId)) {
    const e1 = validateE1SkillEffectRequest(request);
    if (!e1.ok) return e1;
  }
  if (E2_READY_SKILLS.has(skillId)) {
    const e2 = validateE2SkillEffectRequest({ command: request.command, actor: request.attacker, nowSec: request.nowSec });
    if (!e2.ok) return e2;
  }
  return effectResult(true, null);
}

export function resolveReviewedSkillEffects(request = {}, { rng } = {}) {
  const valid = validateReviewedSkillEffectRequest(request);
  if (!valid.ok) return effectResult(false, valid.reason, { rngDraws: 0 });
  const skillId = request.command.skillId;
  let e1 = null;
  let e2 = null;
  let rngDraws = 0;
  if (E1_READY_SKILLS.has(skillId)) {
    e1 = resolveE1SkillEffects(request, { rng });
    if (!e1.ok) return e1;
    rngDraws += e1.rngDraws;
  }
  if (E2_READY_SKILLS.has(skillId)) {
    e2 = resolveE2SkillEffects({ command: request.command, actor: request.attacker, nowSec: request.nowSec }, { rng });
    if (!e2.ok) return effectResult(false, e2.reason, { rngDraws: rngDraws + e2.rngDraws });
    rngDraws += e2.rngDraws;
  }
  const coverage = skillEffectCoverageEntry(skillId);
  const active = component => e1ComponentActive(component) || component.slice === E2_SELF_EFFECT_POLICY.phase;
  return effectResult(true, null, {
    effectMode: 'canonical_reviewed_effects',
    skillId,
    targetResults: e1?.targetResults ?? Object.freeze([]),
    actorResult: e2?.actorResult ?? null,
    hitCount: e1?.hitCount ?? 0,
    totalDamage: e1?.totalDamage ?? 0,
    healing: e2?.healing ?? 0,
    statusAppliedCount: (e1?.statusAppliedCount ?? 0) + (e2?.statusAppliedCount ?? 0),
    activeComponentKinds: Object.freeze(coverage.components.filter(active).map(component => component.kind)),
    deferredComponentKinds: Object.freeze(coverage.components.filter(component => !active(component)).map(component => component.kind)),
    rngDraws,
  });
}

for (const modifier of DAMAGE_STATUS_MODIFIERS) {
  if (!statusCatalogEntry(modifier.statusId)) throw new TypeError(`Unknown damage status modifier: ${modifier.statusId}`);
}
if (SKILL_DAMAGE_PROFILES.length !== 108 || SKILL_DAMAGE_PROFILES.some(profile => profile.referenceDamageLv30 === null)) {
  throw new TypeError('Skill damage profile coverage mismatch');
}
