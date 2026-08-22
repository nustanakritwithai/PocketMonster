import assert from 'node:assert/strict';
import { MONSTER_CATALOG } from '../monster-catalog.mjs';
import {
  WORKBOOK_SECONDARY_TYPE_RULES,
  resolveSecondaryTypeAssignment,
  secondaryTypeRuleForSpecies,
  validateSecondaryTypeCatalog,
} from '../secondary-type-resolver.mjs';

const validation = validateSecondaryTypeCatalog(WORKBOOK_SECONDARY_TYPE_RULES);
assert.equal(validation.ok, true, validation.issues.map(issue => issue.code).join(', '));
assert.equal(WORKBOOK_SECONDARY_TYPE_RULES.length, 36, 'Stage 1 and Stage 2 rules exist for all 18 species mappings');

for (const mapping of MONSTER_CATALOG) {
  const stage1 = secondaryTypeRuleForSpecies(mapping.runtimeSpeciesId, 1);
  const stage2 = secondaryTypeRuleForSpecies(mapping.runtimeSpeciesId, 2);
  assert.equal(stage1.workbookMonsterId, mapping.workbookBaseMonsterId);
  assert.equal(stage1.mode, 'Locked');
  assert.equal(stage2.workbookMonsterId, mapping.workbookStage2MonsterId);
  assert.equal(stage2.mode, 'OptionalPool');
  assert.equal(stage2.allowedTypes.length, 3);
  assert.equal(new Set(stage2.allowedTypes).size, 3);
  assert.equal(stage2.allowedTypes.includes(mapping.runtimeType), false);

  const primaryOnlyStage1 = resolveSecondaryTypeAssignment({
    runtimeSpeciesId: mapping.runtimeSpeciesId, stage: 1, candidateType: null,
  });
  assert.equal(primaryOnlyStage1.ok, true);
  assert.equal(primaryOnlyStage1.secondaryType, null, 'Stage 1 always stays primary-only');

  const blockedStage1 = resolveSecondaryTypeAssignment({
    runtimeSpeciesId: mapping.runtimeSpeciesId, stage: 1, candidateType: stage1.allowedTypes[0],
  });
  assert.equal(blockedStage1.ok, false);
  assert.equal(blockedStage1.reason, 'stage_locked');

  const optionalPrimaryOnly = resolveSecondaryTypeAssignment({
    runtimeSpeciesId: mapping.runtimeSpeciesId, stage: 2, candidateType: null,
  });
  assert.equal(optionalPrimaryOnly.ok, true, 'Stage 2 may remain primary-only after a failed assignment roll');
  assert.equal(optionalPrimaryOnly.secondaryType, null);

  for (const candidateType of stage2.allowedTypes) {
    const allowed = resolveSecondaryTypeAssignment({
      runtimeSpeciesId: mapping.runtimeSpeciesId, stage: 2, candidateType,
    });
    assert.equal(allowed.ok, true, `${mapping.runtimeSpeciesId}/${candidateType} is in the Workbook pool`);
    assert.equal(allowed.secondaryType, candidateType);
  }
}

assert.deepEqual(secondaryTypeRuleForSpecies('flameling', 2).allowedTypes, ['Dragon', 'Dark', 'Fighting']);
assert.deepEqual(secondaryTypeRuleForSpecies('mossbun', 2).allowedTypes, ['Poison', 'Bug', 'Fairy'], 'Workbook LIGHT candidate maps explicitly to Fairy');
assert.deepEqual(secondaryTypeRuleForSpecies('mindcoon', 2).allowedTypes, ['Fairy', 'Ghost', 'Dark']);

assert.equal(resolveSecondaryTypeAssignment({
  runtimeSpeciesId: 'flameling', stage: 2, candidateType: 'Fire',
}).reason, 'same_as_primary');
assert.equal(resolveSecondaryTypeAssignment({
  runtimeSpeciesId: 'flameling', stage: 2, candidateType: 'Water',
}).reason, 'secondary_type_not_allowed');
assert.equal(resolveSecondaryTypeAssignment({
  runtimeSpeciesId: 'mossbun', stage: 2, candidateType: 'LIGHT',
}).reason, 'invalid_type', 'LIGHT never becomes an implicit runtime identity');
assert.equal(resolveSecondaryTypeAssignment({
  runtimeSpeciesId: 'unknown', stage: 2, candidateType: null,
}).reason, 'unknown_id');
assert.equal(resolveSecondaryTypeAssignment({
  runtimeSpeciesId: 'flameling', stage: 3, candidateType: null,
}).reason, 'invalid_stage');

const duplicate = [...WORKBOOK_SECONDARY_TYPE_RULES, WORKBOOK_SECONDARY_TYPE_RULES[0]];
assert.ok(validateSecondaryTypeCatalog(duplicate).issues.some(issue => issue.code === 'rule_count_mismatch'));
assert.ok(validateSecondaryTypeCatalog(duplicate).issues.some(issue => issue.code === 'duplicate_rule'));
const badStage1 = WORKBOOK_SECONDARY_TYPE_RULES.map((rule, index) => index === 0 ? { ...rule, evolutionAssignChancePct: 35 } : rule);
assert.ok(validateSecondaryTypeCatalog(badStage1).issues.some(issue => issue.code === 'stage1_assignment_forbidden'));
const badPool = WORKBOOK_SECONDARY_TYPE_RULES.map((rule, index) => index === 1 ? { ...rule, allowedTypes: [rule.primaryType, ...rule.allowedTypes.slice(1)] } : rule);
assert.ok(validateSecondaryTypeCatalog(badPool).issues.some(issue => issue.code === 'primary_in_secondary_pool'));
const wrongButValidPool = WORKBOOK_SECONDARY_TYPE_RULES.map((rule, index) => index === 1
  ? { ...rule, allowedTypes: ['Water', 'Dark', 'Fighting'] }
  : rule);
assert.ok(validateSecondaryTypeCatalog(wrongButValidPool).issues.some(issue => issue.code === 'allowed_pool_source_mismatch'));

assert.ok(Object.isFrozen(WORKBOOK_SECONDARY_TYPE_RULES));
assert.ok(Object.isFrozen(secondaryTypeRuleForSpecies('flameling', 2).allowedTypes));
console.log('V8.1 secondary type resolver: PASS');
