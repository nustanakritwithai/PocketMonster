// Monster Life RPG — V7.7 Evolution
// Evolution is the result of a Raising Profile, not a level-up skin swap (A3, R10).
// It preserves the Instance identity (Gene/Parents/Generation/Bond/Training/History)
// and only redistributes power (+5-8% total budget) while changing skill pool and
// passives. Branch selection is player-driven — never auto-evolve to the top score.

import { BALANCE_CONFIG } from './balance-config.mjs';
import { clamp } from './balance-formulas.mjs';
import { combatRating, CORE_STATS } from './combat-rating.mjs';
import { evaluateEligibility } from './requirements.mjs';
import { masteryRankFromExp } from './skill-progression.mjs';
import { appendHistory, canonicalFormIdForInstance } from './monster-instance.mjs';
import { MONSTER_CATALOG, monsterCatalogEntry } from './monster-catalog.mjs';
import { monsterStatCatalogEntry } from './monster-stat-catalog.mjs';
import { calculateMonsterStats } from './monster-stat-formula.mjs';
import { skillCatalogEntry } from './skill-catalog.mjs';

function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

const WORKBOOK_EVOLUTION_TARGET_DATA = Object.freeze({
  MON_019: Object.freeze(['กระต่ายว่องไว', 'SK_NORMAL_06', 262, 476]),
  MON_020: Object.freeze(['จิ้งจอกเพลิง', 'SK_FIRE_06', 256, 464]),
  MON_021: Object.freeze(['นากวารี', 'SK_WATER_06', 262, 474]),
  MON_022: Object.freeze(['กวางพฤกษา', 'SK_GRASS_06', 258, 469]),
  MON_023: Object.freeze(['เสือสายฟ้า', 'SK_ELECTRIC_06', 260, 471]),
  MON_024: Object.freeze(['หมาป่าน้ำแข็ง', 'SK_ICE_06', 258, 467]),
  MON_025: Object.freeze(['แรดศิลา', 'SK_ROCK_06', 264, 477]),
  MON_026: Object.freeze(['ตัวตุ่นปฐพี', 'SK_GROUND_06', 258, 466]),
  MON_027: Object.freeze(['เหยี่ยววายุ', 'SK_FLYING_06', 254, 462]),
  MON_028: Object.freeze(['งูพิษ', 'SK_POISON_06', 256, 464]),
  MON_029: Object.freeze(['เสือดำเงา', 'SK_DARK_06', 262, 474]),
  MON_030: Object.freeze(['กวางศักดิ์สิทธิ์', 'SK_LIGHT_06', 262, 473]),
  MON_031: Object.freeze(['แมวจิต', 'SK_PSYCHIC_06', 258, 467]),
  MON_032: Object.freeze(['ด้วงเกราะ', 'SK_BUG_06', 258, 467]),
  MON_033: Object.freeze(['มังกรน้อย', 'SK_DRAGON_06', 262, 474]),
  MON_034: Object.freeze(['ลิงนักสู้', 'SK_FIGHTING_06', 258, 467]),
  MON_035: Object.freeze(['หมาป่าเหล็ก', 'SK_STEEL_06', 264, 477]),
  MON_036: Object.freeze(['จิ้งจอกวิญญาณ', 'SK_GHOST_06', 262, 475]),
});

export const WORKBOOK_EVOLUTION_PATHS = Object.freeze(MONSTER_CATALOG.map(mapping => {
  const [toNameTH, unlockSkillId] = WORKBOOK_EVOLUTION_TARGET_DATA[mapping.workbookStage2MonsterId];
  const sourceForm = monsterStatCatalogEntry(mapping.workbookBaseMonsterId);
  const targetForm = monsterStatCatalogEntry(mapping.workbookStage2MonsterId);
  return Object.freeze({
    id: `EVO_${mapping.workbookBaseMonsterId}_${mapping.workbookStage2MonsterId}`,
    runtimeSpeciesId: mapping.runtimeSpeciesId,
    fromWorkbookMonsterId: mapping.workbookBaseMonsterId,
    toWorkbookMonsterId: mapping.workbookStage2MonsterId,
    toNameTH,
    conditionType: 'Level',
    requiredLevelReference: sourceForm.evolution.requiredLevel,
    requiredBondReference: sourceForm.evolution.requiredBond,
    requiredItemId: null,
    extraCondition: null,
    previewRule: 'form_type_stats_skills_before_confirm',
    unlockSkillId,
    sourceBST: sourceForm.bst,
    targetBST: targetForm.bst,
    bstGain: targetForm.bst - sourceForm.bst,
    oneWay: true,
    activation: 'runtime_live',
    runtimeEvolutionDecision: 'M6_CANONICAL_STAGE2_LIVE',
    secondaryTypeActivation: 'deferred_to_A29',
    unlockSkillActivation: 'deferred_to_A16',
    sourceWorkbookVersion: mapping.sourceWorkbookVersion,
  });
}));

const WORKBOOK_EVOLUTION_BY_SPECIES = new Map(WORKBOOK_EVOLUTION_PATHS.map(path => [path.runtimeSpeciesId, path]));
const WORKBOOK_EVOLUTION_BY_ID = new Map(WORKBOOK_EVOLUTION_PATHS.map(path => [path.id, path]));

function evolutionCatalogIssue(code, index, field, detail = {}) {
  return Object.freeze({ code, index, field, ...detail });
}

export function validateWorkbookEvolutionCatalog(records) {
  if (!Array.isArray(records)) {
    return Object.freeze({ ok: false, issues: Object.freeze([evolutionCatalogIssue('invalid_catalog', -1, 'root')]) });
  }
  const issues = [];
  const ids = new Set(), sources = new Set(), targets = new Set();
  if (records.length !== MONSTER_CATALOG.length) {
    issues.push(evolutionCatalogIssue('path_count_mismatch', -1, 'length', { value: records.length }));
  }
  records.forEach((path, index) => {
    if (!path || typeof path !== 'object') {
      issues.push(evolutionCatalogIssue('invalid_path', index, 'root'));
      return;
    }
    if (!/^EVO_MON_\d{3}_MON_\d{3}$/.test(path.id ?? '')) issues.push(evolutionCatalogIssue('invalid_path_id', index, 'id'));
    if (ids.has(path.id)) issues.push(evolutionCatalogIssue('duplicate_path_id', index, 'id', { id: path.id }));
    ids.add(path.id);
    if (sources.has(path.fromWorkbookMonsterId)) issues.push(evolutionCatalogIssue('duplicate_source', index, 'fromWorkbookMonsterId'));
    if (targets.has(path.toWorkbookMonsterId)) issues.push(evolutionCatalogIssue('duplicate_target', index, 'toWorkbookMonsterId'));
    sources.add(path.fromWorkbookMonsterId);
    targets.add(path.toWorkbookMonsterId);
    const mapping = monsterCatalogEntry(path.runtimeSpeciesId);
    if (!mapping || mapping.workbookBaseMonsterId !== path.fromWorkbookMonsterId || mapping.workbookStage2MonsterId !== path.toWorkbookMonsterId) {
      issues.push(evolutionCatalogIssue('mapping_mismatch', index, 'runtimeSpeciesId'));
    }
    const skill = skillCatalogEntry(path.unlockSkillId);
    if (!skill || skill.runtimeType !== mapping?.runtimeType) issues.push(evolutionCatalogIssue('invalid_unlock_skill', index, 'unlockSkillId'));
    if (path.requiredLevelReference !== 15 || path.requiredBondReference !== 50) issues.push(evolutionCatalogIssue('source_requirement_mismatch', index, 'requiredLevelReference'));
    if (!Number.isFinite(path.sourceBST) || !Number.isFinite(path.targetBST) || path.bstGain !== path.targetBST - path.sourceBST) {
      issues.push(evolutionCatalogIssue('invalid_bst_projection', index, 'bstGain'));
    }
    if (path.activation !== 'runtime_live' || path.runtimeEvolutionDecision !== 'M6_CANONICAL_STAGE2_LIVE' || path.oneWay !== true) {
      issues.push(evolutionCatalogIssue('runtime_activation_mismatch', index, 'activation'));
    }
  });
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function workbookEvolutionPathForSpecies(runtimeSpeciesId) {
  return WORKBOOK_EVOLUTION_BY_SPECIES.get(runtimeSpeciesId) ?? null;
}

export function workbookEvolutionPathById(pathId) {
  return WORKBOOK_EVOLUTION_BY_ID.get(pathId) ?? null;
}

// Resolve Stage-2 identity from stable form/evolution facts. This accepts the
// Workbook target form for future captured Stage-2 records and the currently
// locked live Lv2 evolution history; display names never count as identity.
export function resolveWorkbookEvolutionStage(instance) {
  if (!instance || typeof instance !== 'object') {
    return Object.freeze({ ok: false, reason: 'invalid_state', stage2: false, stageEvidence: null, path: null });
  }
  const path = workbookEvolutionPathForSpecies(instance.speciesId);
  if (!path) {
    return Object.freeze({ ok: false, reason: 'unknown_id', stage2: false, stageEvidence: null, path: null });
  }
  const history = Array.isArray(instance.evolutionHistory) ? instance.evolutionHistory : [];
  if (instance.formId === path.toWorkbookMonsterId) {
    return Object.freeze({ ok: true, reason: null, stage2: true, stageEvidence: 'workbook_stage2_form', path });
  }
  if (history.some(entry => entry?.workbookEvolutionId === path.id
    && entry?.toWorkbookMonsterId === path.toWorkbookMonsterId)) {
    return Object.freeze({ ok: true, reason: null, stage2: true, stageEvidence: 'canonical_evolution_history', path });
  }
  if (history.some(entry => entry?.evolutionId === path.id && entry?.to === path.toWorkbookMonsterId)) {
    return Object.freeze({ ok: true, reason: null, stage2: true, stageEvidence: 'workbook_evolution_history', path });
  }
  const liveEvolution = history.findLast(entry => entry
    && typeof entry.evolutionId === 'string'
    && entry.evolutionId.length > 0
    && typeof entry.from === 'string'
    && typeof entry.to === 'string'
    && entry.from !== entry.to
    && entry.to === instance.formId
    && instance.formId !== instance.speciesId);
  if (liveEvolution) {
    return Object.freeze({
      ok: true,
      reason: null,
      stage2: true,
      stageEvidence: 'live_evolution_history',
      path,
      liveEvolution: Object.freeze({ ...liveEvolution }),
    });
  }
  if (instance.canonicalFormId === path.toWorkbookMonsterId) {
    return Object.freeze({ ok: true, reason: null, stage2: true, stageEvidence: 'canonical_form_id', path });
  }
  return Object.freeze({ ok: true, reason: 'evolution_required', stage2: false, stageEvidence: null, path });
}

export function previewWorkbookEvolution(instance) {
  if (!instance || typeof instance !== 'object') return Object.freeze({ ok: false, reason: 'invalid_state' });
  const path = workbookEvolutionPathForSpecies(instance.speciesId);
  if (!path) return Object.freeze({ ok: false, reason: 'unknown_id', runtimeSpeciesId: instance.speciesId ?? null });
  const level = Number.isFinite(instance.level) ? instance.level : 1;
  const bond = Number.isFinite(instance.mind?.bond) ? instance.mind.bond : num(instance.bond, 0);
  const sourceEligible = level >= path.requiredLevelReference && bond >= path.requiredBondReference;
  const canonicalFormId = canonicalFormIdForInstance(instance);
  const alreadyCommitted = (Array.isArray(instance.evolutionHistory) ? instance.evolutionHistory : [])
    .some(entry => entry?.evolutionId === path.id)
    || canonicalFormId === path.toWorkbookMonsterId
    || instance.formId === path.toWorkbookMonsterId;
  const sourceStats = calculateMonsterStats({
    formId: path.fromWorkbookMonsterId,
    level,
    potential: instance.potential,
    training: instance.statTraining,
  });
  const targetStats = calculateMonsterStats({
    formId: path.toWorkbookMonsterId,
    level,
    potential: instance.potential,
    training: instance.statTraining,
  });
  if (!sourceStats.ok || !targetStats.ok) {
    return Object.freeze({ ok: false, reason: 'invalid_canonical_stats', sourceStats, targetStats });
  }
  const statDelta = Object.freeze(Object.fromEntries(Object.keys(sourceStats.stats).map(stat => [
    stat,
    targetStats.stats[stat] - sourceStats.stats[stat],
  ])));
  const unlockSkill = skillCatalogEntry(path.unlockSkillId);
  return Object.freeze({
    ok: true,
    reason: null,
    path,
    runtimeSpeciesId: path.runtimeSpeciesId,
    level,
    bond,
    sourceEligible,
    alreadyCommitted,
    canCommit: sourceEligible && !alreadyCommitted && canonicalFormId === path.fromWorkbookMonsterId,
    readOnly: false,
    canonicalFormId,
    sourceStats: sourceStats.stats,
    targetStats: targetStats.stats,
    statDelta,
    unlockSkill: Object.freeze({ id: unlockSkill.id, nameTH: unlockSkill.nameTH, nameEN: unlockSkill.nameEN }),
    activation: path.activation,
    runtimeEvolutionDecision: path.runtimeEvolutionDecision,
  });
}

export function validateEvolutionPath(evoDef, instance) {
  if (!instance || typeof instance !== 'object') return Object.freeze({ ok: false, reason: 'invalid_state' });
  if (!evoDef || typeof evoDef !== 'object' || typeof evoDef.id !== 'string' || !evoDef.id
    || typeof evoDef.toFormId !== 'string' || !evoDef.toFormId) {
    return Object.freeze({ ok: false, reason: 'invalid_evolution_path' });
  }
  if ((Array.isArray(instance.evolutionHistory) ? instance.evolutionHistory : [])
    .some(entry => entry?.evolutionId === evoDef.id)) {
    return Object.freeze({ ok: false, reason: 'already_committed' });
  }
  if ((evoDef.fromFormId ?? null) !== (instance.formId ?? null)) {
    return Object.freeze({ ok: false, reason: 'form_mismatch' });
  }
  return Object.freeze({ ok: true, reason: null });
}

// Build a requirement-engine context from an instance (R10 requirement types).
export function evolutionContext(instance) {
  const skillMastery = {};
  for (const s of instance.skills ?? []) skillMastery[s.skillId] = s.masteryRank;
  return {
    level: instance.level,
    training: instance.training,
    trainingFocus: instance.trainingFocus,
    aptitude: instance.aptitude,
    bond: instance.mind?.bond,
    trust: instance.mind?.trust,
    discipline: instance.mind?.discipline,
    traitIds: instance.traitIds,
    skillMastery,
    career: instance.career,
    zoneTime: instance.zoneTime ?? {},
    foodHistory: instance.foodHistory ?? {},
    eventFlags: instance.eventFlags ?? [],
    currentZone: instance.currentZone ?? null,
    weather: instance.weather ?? null,
    formId: instance.formId,
  };
}

export function evaluateEvolution(evoDef, instance) {
  const pathValidation = validateEvolutionPath(evoDef, instance);
  if (!pathValidation.ok) {
    return {
      evolutionId: evoDef?.id,
      toFormId: evoDef?.toFormId,
      eligible: false,
      requiredMet: false,
      failedRequired: [],
      optionalMet: false,
      blocked: true,
      blockedBy: [],
      reason: pathValidation.reason,
    };
  }
  const result = evaluateEligibility(evoDef?.requirements ?? {}, evolutionContext(instance));
  return { evolutionId: evoDef?.id, toFormId: evoDef?.toFormId, ...result, reason: result.eligible ? null : 'not_eligible' };
}

// List every eligible branch. The player chooses; the system never auto-picks (R10).
export function listEligibleBranches(instance, evoDefs) {
  return (evoDefs ?? [])
    .filter(def => (def.fromFormId ?? null) === (instance.formId ?? null))
    .map(def => ({ def, result: evaluateEvolution(def, instance) }))
    .filter(({ result }) => result.eligible)
    .map(({ def }) => def.id);
}

// R10 — Verify an evolution profile adds only ~5-8% total combat power.
export function checkEvolutionBudget(build, evolutionProfile, config = BALANCE_CONFIG) {
  const before = combatRating({ ...build, evolutionProfile: undefined }, config).cr;
  const after = combatRating({ ...build, evolutionProfile }, config).cr;
  const share = before > 0 ? (after - before) / before : 0;
  const { min, max } = config.evolution.budget;
  return { before, after, share, withinBudget: share >= min - 1e-9 && share <= max + 1e-9, min, max };
}

// Preview the outcome of choosing a branch (stat/CR change + carried skills).
export function previewEvolution(instance, evoDef, build, config = BALANCE_CONFIG) {
  const pathValidation = validateEvolutionPath(evoDef, instance);
  if (!pathValidation.ok) return Object.freeze({ ok: false, reason: pathValidation.reason });
  const budget = build ? Object.freeze(checkEvolutionBudget(build, evoDef.profile, config)) : null;
  const profile = evoDef.profile && typeof evoDef.profile === 'object'
    ? Object.freeze({ ...evoDef.profile })
    : evoDef.profile;
  const skillCarry = Object.freeze((instance.skills ?? []).map(s => {
    const map = evoDef.skillMapping?.[s.skillId];
    const carry = map ? clamp(map.carry ?? 1, config.evolution.minSkillCarry, config.evolution.maxSkillCarry) : 1;
    return Object.freeze({ from: s.skillId, to: map?.to ?? s.skillId, carry });
  }));
  return Object.freeze({ ok: true, reason: null, toFormId: evoDef.toFormId, profile, secondaryType: evoDef.addsSecondaryType ?? null, budget, skillCarry });
}

// Commit an evolution on the SAME instance. Preserves identity + history (R10, P1).
export function commitEvolution(instance, evoDef, { now = Date.now(), ownedItemCompat = {} } = {}, config = BALANCE_CONFIG) {
  const eligibility = evaluateEvolution(evoDef, instance);
  if (!eligibility.eligible) return { ok: false, reason: eligibility.reason ?? 'not_eligible', eligibility };

  const workbookPath = workbookEvolutionPathForSpecies(instance.speciesId);
  const canonicalFormId = canonicalFormIdForInstance(instance);
  const isWorkbookStageTransition = workbookPath
    && canonicalFormId === workbookPath.fromWorkbookMonsterId
    && evoDef.fromFormId === instance.formId;
  let workbookPreview = null;
  if (isWorkbookStageTransition) {
    workbookPreview = previewWorkbookEvolution(instance);
    if (!workbookPreview.ok) return { ok: false, reason: workbookPreview.reason, workbookPreview };
    if (!workbookPreview.canCommit) {
      return {
        ok: false,
        reason: workbookPreview.alreadyCommitted ? 'already_committed' : 'workbook_requirements_not_met',
        workbookPreview,
      };
    }
  }

  const fromFormId = instance.formId ?? null;

  // Identity anchors that MUST NOT change.
  const preservedInstanceId = instance.instanceId;
  const preservedParents = instance.parents;
  const preservedGeneration = instance.generation;
  const preservedGenes = instance.genes;

  // Change form + profile + (optional) secondary type.
  instance.formId = evoDef.toFormId;
  instance.evolutionProfile = { ...(instance.evolutionProfile ?? {}) };
  for (const stat of CORE_STATS) {
    instance.evolutionProfile[stat] = num(evoDef.profile?.[stat], 1) || 1;
  }
  if (evoDef.addsSecondaryType) instance.secondaryType = evoDef.addsSecondaryType;

  // Map skill mastery (carry 70-100%); unmapped skills carry 100% (R10).
  const carried = [];
  for (const skill of instance.skills ?? []) {
    const map = evoDef.skillMapping?.[skill.skillId];
    if (map) {
      const carry = clamp(map.carry ?? 1, config.evolution.minSkillCarry, config.evolution.maxSkillCarry);
      skill.skillId = map.to ?? skill.skillId;
      skill.masteryExp = Math.round(num(skill.masteryExp) * carry);
      skill.masteryRank = masteryRankFromExp(skill.masteryExp, config);
      carried.push({ to: skill.skillId, carry });
    }
  }

  // Keep compatible equipment, otherwise unequip (reversible, R10).
  const unequipped = [];
  if (instance.equipment) {
    for (const slot of Object.keys(instance.equipment)) {
      const item = instance.equipment[slot];
      if (!item) continue;
      const compatible = ownedItemCompat[item.id] !== false;
      if (!compatible) {
        unequipped.push(item.id);
        instance.equipment[slot] = null;
      }
    }
  }

  // Append to evolution + life history (never reset — P1).
  if (!Array.isArray(instance.evolutionHistory)) instance.evolutionHistory = [];
  instance.evolutionHistory.push({ from: fromFormId, to: evoDef.toFormId, evolutionId: evoDef.id, at: now });
  if (workbookPreview) {
    instance.canonicalFormId = workbookPath.toWorkbookMonsterId;
    const historyEntry = instance.evolutionHistory.at(-1);
    historyEntry.workbookEvolutionId = workbookPath.id;
    historyEntry.fromWorkbookMonsterId = workbookPath.fromWorkbookMonsterId;
    historyEntry.toWorkbookMonsterId = workbookPath.toWorkbookMonsterId;
  }
  appendHistory(instance, { type: 'evolution', from: fromFormId, to: evoDef.toFormId }, now);

  // Assert identity anchors survived.
  instance.instanceId = preservedInstanceId;
  instance.parents = preservedParents;
  instance.generation = preservedGeneration;
  instance.genes = preservedGenes;

  return {
    ok: true,
    fromFormId,
    toFormId: evoDef.toFormId,
    canonicalFromFormId: workbookPreview?.path.fromWorkbookMonsterId ?? null,
    canonicalToFormId: workbookPreview?.path.toWorkbookMonsterId ?? null,
    canonicalStats: workbookPreview?.targetStats ?? null,
    carried,
    unequipped,
  };
}
