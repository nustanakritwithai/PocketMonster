// PocketMonster V8.1 — Workbook secondary-type catalog and pure assignment guard.
// The resolver validates a chosen result only; it does not roll, mutate an
// instance, or alter the currently locked live-evolution behavior.

import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { MONSTER_CATALOG, monsterCatalogEntry } from './monster-catalog.mjs';
import { RUNTIME_TYPES, sourceTypeToRuntime } from './type-catalog.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

export const SECONDARY_TYPE_POLICY = Object.freeze({
  activation: 'resolver_only',
  stage1SecondaryType: null,
  stage2MaximumSecondaryTypes: 1,
  assignmentRollActivation: 'deferred',
  runtimeEvolutionDecision: 'D4_LIVE_LV2_UNCHANGED',
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
});

const SOURCE_POOLS = Object.freeze({
  NORMAL: Object.freeze(['FIGHTING', 'FLYING', 'PSYCHIC']),
  FIRE: Object.freeze(['DRAGON', 'DARK', 'FIGHTING']),
  WATER: Object.freeze(['ICE', 'PSYCHIC', 'POISON']),
  GRASS: Object.freeze(['POISON', 'BUG', 'LIGHT']),
  ELECTRIC: Object.freeze(['STEEL', 'FLYING', 'DARK']),
  ICE: Object.freeze(['WATER', 'GHOST', 'STEEL']),
  ROCK: Object.freeze(['GROUND', 'STEEL', 'FIGHTING']),
  GROUND: Object.freeze(['ROCK', 'POISON', 'STEEL']),
  FLYING: Object.freeze(['ELECTRIC', 'DRAGON', 'NORMAL']),
  POISON: Object.freeze(['DARK', 'BUG', 'GHOST']),
  DARK: Object.freeze(['GHOST', 'POISON', 'FIRE']),
  LIGHT: Object.freeze(['PSYCHIC', 'FLYING', 'STEEL']),
  PSYCHIC: Object.freeze(['LIGHT', 'GHOST', 'DARK']),
  BUG: Object.freeze(['GRASS', 'POISON', 'FLYING']),
  DRAGON: Object.freeze(['FIRE', 'ELECTRIC', 'FLYING']),
  FIGHTING: Object.freeze(['ROCK', 'STEEL', 'NORMAL']),
  STEEL: Object.freeze(['ROCK', 'ELECTRIC', 'FIGHTING']),
  GHOST: Object.freeze(['DARK', 'PSYCHIC', 'ICE']),
});
const ALLOWED_WEIGHTS_PCT = Object.freeze([50, 30, 20]);
const RUNTIME_TYPE_SET = new Set(RUNTIME_TYPES);

function makeRule(mapping, stage) {
  const sourceAllowedTypes = SOURCE_POOLS[mapping.workbookTypeCandidate];
  const allowedTypes = Object.freeze(sourceAllowedTypes.map(sourceTypeToRuntime));
  const stage2 = stage === 2;
  return Object.freeze({
    runtimeSpeciesId: mapping.runtimeSpeciesId,
    workbookMonsterId: stage2 ? mapping.workbookStage2MonsterId : mapping.workbookBaseMonsterId,
    stage,
    sourcePrimaryType: mapping.workbookTypeCandidate,
    primaryType: mapping.runtimeType,
    mode: stage2 ? 'OptionalPool' : 'Locked',
    sourceAllowedTypes,
    allowedTypes,
    allowedWeightsPct: ALLOWED_WEIGHTS_PCT,
    wildSecondaryChancePct: stage2 ? 30 : 0,
    evolutionAssignChancePct: stage2 ? 35 : 0,
    maximumSecondaryTypes: 1,
    preserveAfterCapture: true,
    canReroll: false,
    activation: 'resolver_only',
    typeDecision: sourceAllowedTypes.includes('LIGHT') || mapping.workbookTypeCandidate === 'LIGHT'
      ? 'D2_EXPLICIT_LIGHT_TO_FAIRY'
      : 'D2_DIRECT_TYPE_MAPPING',
    sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  });
}

export const WORKBOOK_SECONDARY_TYPE_RULES = Object.freeze(MONSTER_CATALOG.flatMap(mapping => [
  makeRule(mapping, 1),
  makeRule(mapping, 2),
]));

const RULE_BY_SPECIES_STAGE = new Map(WORKBOOK_SECONDARY_TYPE_RULES.map(rule => [
  `${rule.runtimeSpeciesId}:${rule.stage}`,
  rule,
]));
const RULE_BY_WORKBOOK_ID = new Map(WORKBOOK_SECONDARY_TYPE_RULES.map(rule => [rule.workbookMonsterId, rule]));

function issue(code, index, field, detail = {}) {
  return Object.freeze({ code, index, field, ...detail });
}

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

export function validateSecondaryTypeCatalog(records) {
  if (!Array.isArray(records)) {
    return Object.freeze({ ok: false, issues: Object.freeze([issue('invalid_catalog', -1, 'root')]) });
  }
  const issues = [];
  const keys = new Set();
  const workbookIds = new Set();
  if (records.length !== MONSTER_CATALOG.length * 2) {
    issues.push(issue('rule_count_mismatch', -1, 'length', { value: records.length }));
  }

  records.forEach((rule, index) => {
    if (!rule || typeof rule !== 'object') {
      issues.push(issue('invalid_rule', index, 'root'));
      return;
    }
    const key = `${rule.runtimeSpeciesId}:${rule.stage}`;
    if (keys.has(key)) issues.push(issue('duplicate_rule', index, 'runtimeSpeciesId', { key }));
    keys.add(key);
    if (workbookIds.has(rule.workbookMonsterId)) issues.push(issue('duplicate_workbook_monster', index, 'workbookMonsterId'));
    workbookIds.add(rule.workbookMonsterId);

    const mapping = monsterCatalogEntry(rule.runtimeSpeciesId);
    const expectedWorkbookId = rule.stage === 1
      ? mapping?.workbookBaseMonsterId
      : rule.stage === 2 ? mapping?.workbookStage2MonsterId : null;
    if (!mapping || expectedWorkbookId !== rule.workbookMonsterId) {
      issues.push(issue('mapping_mismatch', index, 'workbookMonsterId'));
    }
    const expectedSourcePool = mapping ? SOURCE_POOLS[mapping.workbookTypeCandidate] : null;
    const expectedRuntimePool = expectedSourcePool?.map(sourceTypeToRuntime) ?? null;
    if (mapping && (rule.sourcePrimaryType !== mapping.workbookTypeCandidate || rule.primaryType !== mapping.runtimeType)) {
      issues.push(issue('primary_type_source_mismatch', index, 'primaryType'));
    }
    if (expectedSourcePool && (!sameArray(rule.sourceAllowedTypes, expectedSourcePool)
      || !sameArray(rule.allowedTypes, expectedRuntimePool))) {
      issues.push(issue('allowed_pool_source_mismatch', index, 'allowedTypes'));
    }
    if (![1, 2].includes(rule.stage)) issues.push(issue('invalid_stage', index, 'stage'));
    if (!RUNTIME_TYPE_SET.has(rule.primaryType) || rule.primaryType === 'Light') {
      issues.push(issue('invalid_primary_type', index, 'primaryType'));
    }
    if (!Array.isArray(rule.allowedTypes) || rule.allowedTypes.length !== 3) {
      issues.push(issue('invalid_allowed_pool', index, 'allowedTypes'));
    } else {
      if (new Set(rule.allowedTypes).size !== 3) issues.push(issue('duplicate_allowed_type', index, 'allowedTypes'));
      if (rule.allowedTypes.some(type => !RUNTIME_TYPE_SET.has(type) || type === 'Light' || type === 'LIGHT')) {
        issues.push(issue('invalid_allowed_type', index, 'allowedTypes'));
      }
      if (rule.allowedTypes.includes(rule.primaryType)) issues.push(issue('primary_in_secondary_pool', index, 'allowedTypes'));
    }
    if (!Array.isArray(rule.allowedWeightsPct)
      || rule.allowedWeightsPct.length !== 3
      || rule.allowedWeightsPct.some(weight => !Number.isFinite(weight) || weight < 0)
      || rule.allowedWeightsPct.reduce((sum, weight) => sum + weight, 0) !== 100
      || !sameArray(rule.allowedWeightsPct, ALLOWED_WEIGHTS_PCT)) {
      issues.push(issue('invalid_weights', index, 'allowedWeightsPct'));
    }
    if (rule.maximumSecondaryTypes !== 1) issues.push(issue('secondary_slot_count_mismatch', index, 'maximumSecondaryTypes'));
    if (rule.stage === 1 && (rule.mode !== 'Locked' || rule.wildSecondaryChancePct !== 0 || rule.evolutionAssignChancePct !== 0)) {
      issues.push(issue('stage1_assignment_forbidden', index, 'mode'));
    }
    if (rule.stage === 2 && (rule.mode !== 'OptionalPool' || rule.wildSecondaryChancePct !== 30 || rule.evolutionAssignChancePct !== 35)) {
      issues.push(issue('stage2_source_mismatch', index, 'mode'));
    }
  });

  for (const mapping of MONSTER_CATALOG) {
    for (const stage of [1, 2]) {
      if (!keys.has(`${mapping.runtimeSpeciesId}:${stage}`)) {
        issues.push(issue('missing_rule', -1, 'runtimeSpeciesId', { runtimeSpeciesId: mapping.runtimeSpeciesId, stage }));
      }
    }
  }
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function secondaryTypeRuleForSpecies(runtimeSpeciesId, stage) {
  return RULE_BY_SPECIES_STAGE.get(`${runtimeSpeciesId}:${stage}`) ?? null;
}

export function secondaryTypeRuleForWorkbookMonster(workbookMonsterId) {
  return RULE_BY_WORKBOOK_ID.get(workbookMonsterId) ?? null;
}

function assignmentResult(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, readOnly: true, ...detail });
}

export function resolveSecondaryTypeAssignment({
  runtimeSpeciesId,
  stage,
  candidateType = null,
} = {}) {
  if (stage !== 1 && stage !== 2) {
    return assignmentResult(false, 'invalid_stage', { runtimeSpeciesId: runtimeSpeciesId ?? null, stage: stage ?? null });
  }
  const rule = secondaryTypeRuleForSpecies(runtimeSpeciesId, stage);
  if (!rule) return assignmentResult(false, 'unknown_id', { runtimeSpeciesId: runtimeSpeciesId ?? null, stage });
  if (stage === 1) {
    if (candidateType !== null) {
      return assignmentResult(false, 'stage_locked', {
        runtimeSpeciesId,
        stage,
        primaryType: rule.primaryType,
        secondaryType: null,
        allowedTypes: rule.allowedTypes,
      });
    }
    return assignmentResult(true, null, {
      runtimeSpeciesId,
      stage,
      primaryType: rule.primaryType,
      secondaryType: null,
      allowedTypes: rule.allowedTypes,
      rule,
    });
  }
  if (candidateType === null) {
    return assignmentResult(true, null, {
      runtimeSpeciesId,
      stage,
      primaryType: rule.primaryType,
      secondaryType: null,
      allowedTypes: rule.allowedTypes,
      rule,
    });
  }
  if (!RUNTIME_TYPE_SET.has(candidateType)) {
    return assignmentResult(false, 'invalid_type', { runtimeSpeciesId, stage, candidateType, allowedTypes: rule.allowedTypes });
  }
  if (candidateType === rule.primaryType) {
    return assignmentResult(false, 'same_as_primary', { runtimeSpeciesId, stage, candidateType, allowedTypes: rule.allowedTypes });
  }
  if (!rule.allowedTypes.includes(candidateType)) {
    return assignmentResult(false, 'secondary_type_not_allowed', { runtimeSpeciesId, stage, candidateType, allowedTypes: rule.allowedTypes });
  }
  return assignmentResult(true, null, {
    runtimeSpeciesId,
    stage,
    primaryType: rule.primaryType,
    secondaryType: candidateType,
    allowedTypes: rule.allowedTypes,
    rule,
  });
}

const catalogValidation = validateSecondaryTypeCatalog(WORKBOOK_SECONDARY_TYPE_RULES);
if (!catalogValidation.ok) {
  throw new TypeError(`Invalid secondary type catalog: ${catalogValidation.issues.map(entry => entry.code).join(', ')}`);
}
