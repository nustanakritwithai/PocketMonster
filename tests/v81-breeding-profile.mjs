import assert from 'node:assert/strict';
import { normalizeInstance } from '../monster-instance.mjs';
import { workbookEvolutionPathForSpecies } from '../evolution.mjs';
import {
  BREEDING_GROUPS,
  BREEDING_MIN_BOND,
  BREEDING_MIN_LEVEL,
  BREEDING_REQUIRED_STAGE,
  breed,
  evaluateStandardBreedingCompatibility,
  genderCompatible,
} from '../breeding.mjs';

const speciesById = Object.freeze({
  flameling: Object.freeze({ id: 'flameling', stage: 2, breedingGroup: 'Field', breedingEligibility: 'Yes' }),
  normalooze: Object.freeze({ id: 'normalooze', stage: 2, breedingGroup: 'Field', breedingEligibility: 'Yes' }),
  galebird: Object.freeze({ id: 'galebird', stage: 2, breedingGroup: 'Flying', breedingEligibility: 'Yes' }),
  ironbug: Object.freeze({ id: 'ironbug', stage: 2, breedingGroup: 'Mineral', breedingEligibility: 'SpecialRecipeOnly' }),
  voidhorn: Object.freeze({ id: 'voidhorn', stage: 2, breedingGroup: 'Field', breedingEligibility: 'No' }),
  fairimp: Object.freeze({ id: 'fairimp', stage: 2, breedingGroup: 'Field' }),
  unknownStage: Object.freeze({ id: 'unknownStage', stage: 2, breedingGroup: 'Field', breedingEligibility: 'Yes' }),
});

function stage2Form(speciesId) {
  return workbookEvolutionPathForSpecies(speciesId)?.toWorkbookMonsterId ?? speciesId;
}

const parent = (instanceId, speciesId, gender, overrides = {}) => normalizeInstance({
  instanceId,
  speciesId,
  formId: stage2Form(speciesId),
  level: 25,
  gender,
  bond: 70,
  breedingCooldownUntil: 0,
  ...overrides,
}, { now: 1000 });

assert.equal(BREEDING_REQUIRED_STAGE, 2);
assert.equal(BREEDING_MIN_LEVEL, 20);
assert.equal(BREEDING_MIN_BOND, 50);
assert.deepEqual(BREEDING_GROUPS, [
  'Field', 'Water1', 'Mineral', 'Flying', 'Bug', 'Dragon', 'Humanlike', 'Amorphous',
]);
assert.equal(Object.isFrozen(BREEDING_GROUPS), true);
assert.equal(genderCompatible({ gender: 'Female' }, { gender: 'Male' }), true);
assert.equal(genderCompatible({ gender: 'Male' }, { gender: 'Female' }), false, 'roles are explicit, not symmetric aliases');
assert.equal(genderCompatible({ gender: 'Female' }, { gender: 'Female' }), false);
assert.equal(genderCompatible({ gender: 'Genderless' }, { gender: 'Male' }), false);
assert.equal(genderCompatible({ gender: 'Female' }, { gender: 'Genderless' }), false);

const eggHolder = parent('parent-a', 'flameling', 'Female');
const partner = parent('parent-b', 'normalooze', 'Male');
const holderSnapshot = structuredClone(eggHolder);
const partnerSnapshot = structuredClone(partner);
const valid = evaluateStandardBreedingCompatibility(eggHolder, partner, { speciesById, now: 2000 });
assert.deepEqual(
  {
    ok: valid.ok,
    reason: valid.reason,
    breedingGroup: valid.breedingGroup,
    requiredStage: valid.requiredStage,
    minLevel: valid.minLevel,
    minBond: valid.minBond,
    stageEvidence: valid.stageEvidence,
  },
  {
    ok: true,
    reason: null,
    breedingGroup: 'Field',
    requiredStage: 2,
    minLevel: 20,
    minBond: 50,
    stageEvidence: ['workbook_stage2_form', 'workbook_stage2_form'],
  },
);
assert.equal(Object.isFrozen(valid), true);
assert.equal(Object.isFrozen(valid.stageEvidence), true);
assert.deepEqual(eggHolder, holderSnapshot);
assert.deepEqual(partner, partnerSnapshot);

assert.equal(evaluateStandardBreedingCompatibility(eggHolder, eggHolder, { speciesById, now: 2000 }).reason, 'breeding_same_instance');
assert.equal(evaluateStandardBreedingCompatibility({ ...eggHolder, instanceId: '' }, partner, { speciesById, now: 2000 }).reason, 'invalid_state');
assert.equal(evaluateStandardBreedingCompatibility({ ...eggHolder, instanceId: undefined }, partner, { speciesById, now: 2000 }).reason, 'invalid_state');
assert.equal(evaluateStandardBreedingCompatibility(eggHolder, { ...partner, instanceId: '   ' }, { speciesById, now: 2000 }).reason, 'invalid_state');

assert.equal(
  evaluateStandardBreedingCompatibility(
    parent('stage-a', 'flameling', 'Female', { formId: 'flameling', evolutionStage: 2, lifeStage: 'Mature' }),
    partner,
    { speciesById, now: 2000 },
  ).reason,
  'breeding_stage_gate',
  'profile.stage, evolutionStage, and lifeStage cannot replace owned form/history evidence',
);
assert.equal(
  evaluateStandardBreedingCompatibility(parent('unknown-stage-a', 'unknownStage', 'Female'), partner, { speciesById, now: 2000 }).reason,
  'breeding_stage_gate',
  'unknown runtime species identity fails the Stage2 gate closed',
);
const liveStage2 = parent('live-stage-a', 'flameling', 'Female', {
  formId: 'flameling_lv2',
  evolutionHistory: [{ evolutionId: 'flameling_lv2', from: 'flameling', to: 'flameling_lv2' }],
});
assert.equal(
  evaluateStandardBreedingCompatibility(liveStage2, partner, { speciesById, now: 2000 }).ok,
  true,
  'the locked live evolutionHistory is trusted Stage2 evidence',
);

assert.equal(evaluateStandardBreedingCompatibility({ ...eggHolder, level: 19 }, partner, { speciesById, now: 2000 }).reason, 'breeding_level_gate');
assert.equal(evaluateStandardBreedingCompatibility({ ...eggHolder, level: 20 }, partner, { speciesById, now: 2000 }).ok, true);
assert.equal(evaluateStandardBreedingCompatibility({ ...eggHolder, level: 20.5 }, partner, { speciesById, now: 2000 }).reason, 'breeding_level_gate');
assert.equal(evaluateStandardBreedingCompatibility({ ...eggHolder, mind: { ...eggHolder.mind, bond: 49 } }, partner, { speciesById, now: 2000 }).reason, 'breeding_bond_gate');
assert.equal(evaluateStandardBreedingCompatibility({ ...eggHolder, mind: { ...eggHolder.mind, bond: 50 } }, partner, { speciesById, now: 2000 }).ok, true);
assert.equal(evaluateStandardBreedingCompatibility(partner, eggHolder, { speciesById, now: 2000 }).reason, 'breeding_gender_gate');
assert.equal(evaluateStandardBreedingCompatibility(eggHolder, { ...partner, gender: 'Female' }, { speciesById, now: 2000 }).reason, 'breeding_gender_gate');
assert.equal(evaluateStandardBreedingCompatibility({ ...eggHolder, gender: 'Genderless' }, partner, { speciesById, now: 2000 }).reason, 'breeding_recipe_only');
assert.equal(evaluateStandardBreedingCompatibility(eggHolder, { ...partner, gender: 'Genderless' }, { speciesById, now: 2000 }).reason, 'breeding_recipe_only');

const avian = parent('avian-b', 'galebird', 'Male');
assert.equal(evaluateStandardBreedingCompatibility(eggHolder, avian, { speciesById, now: 2000 }).reason, 'breeding_group_gate');
const invalidGroups = {
  ...speciesById,
  flameling: { ...speciesById.flameling, breedingGroup: 'Mystic' },
  normalooze: { ...speciesById.normalooze, breedingGroup: 'Mystic' },
};
assert.equal(
  evaluateStandardBreedingCompatibility(eggHolder, partner, { speciesById: invalidGroups, now: 2000 }).reason,
  'breeding_group_gate',
  'equal but non-canonical groups fail closed',
);
const recipeOnly = parent('recipe-a', 'ironbug', 'Female');
assert.equal(
  evaluateStandardBreedingCompatibility(recipeOnly, partner, { speciesById, now: 2000 }).reason,
  'breeding_recipe_only',
  'SpecialRecipeOnly takes precedence over a cross-group mismatch',
);
assert.equal(evaluateStandardBreedingCompatibility(eggHolder, parent('disabled-b', 'voidhorn', 'Male'), { speciesById, now: 2000 }).reason, 'breeding_eligibility_gate');
assert.equal(evaluateStandardBreedingCompatibility(eggHolder, parent('missing-b', 'fairimp', 'Male'), { speciesById, now: 2000 }).reason, 'breeding_eligibility_gate');
assert.equal(evaluateStandardBreedingCompatibility(eggHolder, { ...partner, breedingCooldownUntil: 2001 }, { speciesById, now: 2000 }).reason, 'breeding_cooldown');
assert.equal(evaluateStandardBreedingCompatibility(eggHolder, { ...partner, breedingCooldownUntil: 2000 }, { speciesById, now: 2000 }).ok, true);
assert.equal(evaluateStandardBreedingCompatibility(eggHolder, { ...partner, breedingCooldownUntil: Number.NaN }, { speciesById, now: 2000 }).reason, 'invalid_state');
assert.equal(evaluateStandardBreedingCompatibility(eggHolder, { ...partner, speciesId: 'unknown' }, { speciesById, now: 2000 }).reason, 'unknown_id');
assert.equal(evaluateStandardBreedingCompatibility(eggHolder, partner, { speciesById, now: Number.NaN }).reason, 'invalid_state');

const child = { ...partner, instanceId: 'child-b', parents: { a: 'parent-a', b: 'other' } };
assert.equal(evaluateStandardBreedingCompatibility(eggHolder, child, { speciesById, now: 2000 }).reason, 'breeding_relative_gate');

const mapProfiles = new Map(Object.entries(speciesById));
assert.equal(evaluateStandardBreedingCompatibility(eggHolder, partner, { speciesById: mapProfiles, now: 2000 }).ok, true);
assert.equal(evaluateStandardBreedingCompatibility(eggHolder, partner, { speciesById: id => speciesById[id], now: 2000 }).ok, true);

const reversedLegacy = breed(partner, eggHolder, { species: { id: 'normalooze' }, seed: 'legacy-symmetric-pair', now: 2000 });
assert.equal(reversedLegacy.ok, true, 'legacy breed remains symmetric until A32 owns role-oriented egg transactions');

console.log('V8.1 BRD_v1.0 breeding compatibility adapter: PASS');
