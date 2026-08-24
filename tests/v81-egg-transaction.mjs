import assert from 'node:assert/strict';
import {
  BREEDING_VERSION,
  PARENT_BREEDING_COOLDOWN_MS,
  WORKBOOK_BREEDING_PROFILES,
  createStandardBreedingEggTransaction,
  hatchBreedingEggTransaction,
  hatchedOwnedMonsterIdForEgg,
  isEggReadyToHatch,
  normalizeEggsForPersistence,
  resolveGenderFromSeed,
  validateWorkbookEgg,
  workbookBreedingProfile,
} from '../breeding.mjs';
import {
  INSTANCE_SAVE_VERSION,
  normalizeInstance,
} from '../monster-instance.mjs';
import {
  SAVE_SCHEMA_VERSION,
  normalizeSavedState,
  sanitizeStateForPersistence,
} from '../save-schema.mjs';

const NOW = 1_700_000_000_000;
const EGG_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_EGG_ID = '22222222-2222-4222-8222-222222222222';
const CASE_UUID = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const HOLDER_POTENTIAL = Object.freeze({ hp: 31, atk: 30, def: 29, spAtk: 28, spDef: 27, spd: 26 });
const PARTNER_POTENTIAL = Object.freeze({ hp: 1, atk: 2, def: 3, spAtk: 4, spDef: 5, spd: 6 });

function parent(instanceId, speciesId, formId, gender, potential, overrides = {}) {
  return normalizeInstance({
    instanceId,
    speciesId,
    formId,
    gender,
    level: 20,
    mind: { bond: 50 },
    potential,
    breedingCooldownUntil: null,
    ...overrides,
  }, { now: NOW - 1_000 });
}

const holder = parent('holder-owned', 'flameling', 'MON_020', 'Female', HOLDER_POTENTIAL, {
  secondaryType: 'Dragon',
});
const partner = parent('partner-owned', 'normalooze', 'MON_019', 'Male', PARTNER_POTENTIAL);
const alternatePartner = parent('alternate-owned', 'mossbun', 'MON_022', 'Male', PARTNER_POTENTIAL);
const initialState = {
  collection: [holder, partner, alternatePartner],
  storage: [holder.instanceId, partner.instanceId, alternatePartner.instanceId],
  eggs: [],
  untouched: { keep: true },
};

assert.equal(BREEDING_VERSION, 'BRD_v1.0');
assert.equal(PARENT_BREEDING_COOLDOWN_MS, 30 * 60 * 1000);
assert.equal(INSTANCE_SAVE_VERSION, 15);
assert.equal(SAVE_SCHEMA_VERSION, 15);
assert.equal(WORKBOOK_BREEDING_PROFILES.length, 18);
assert.equal(Object.isFrozen(WORKBOOK_BREEDING_PROFILES), true);
assert.ok(WORKBOOK_BREEDING_PROFILES.every(Object.isFrozen));
assert.deepEqual(
  workbookBreedingProfile('flameling'),
  {
    runtimeSpeciesId: 'flameling',
    childMonsterId: 'MON_002',
    adultMonsterId: 'MON_020',
    breedingGroup: 'Field',
    genderRule: '50M/50F',
    breedingEligibility: 'Yes',
    hatchTimeMin: 15,
    baseBond: 10,
    requiredStage: 2,
    requiredLevel: 20,
    breedingVersion: 'BRD_v1.0',
  },
);
assert.equal(workbookBreedingProfile('fairimp').genderRule, '25M/75F');
assert.equal(workbookBreedingProfile('emberdrake').genderRule, '75M/25F');
assert.equal(workbookBreedingProfile('ironbug').breedingEligibility, 'SpecialRecipeOnly');
assert.equal(workbookBreedingProfile('ghostpurr').genderRule, 'Genderless');
assert.equal(resolveGenderFromSeed('Genderless', 0), 'Genderless');
assert.equal(resolveGenderFromSeed('50M/50F', 49), 'Male');
assert.equal(resolveGenderFromSeed('50M/50F', 50), 'Female');
assert.equal(resolveGenderFromSeed('75M/25F', 74), 'Male');
assert.equal(resolveGenderFromSeed('75M/25F', 75), 'Female');
assert.equal(resolveGenderFromSeed('25M/75F', 24), 'Male');
assert.equal(resolveGenderFromSeed('25M/75F', 25), 'Female');
assert.equal(resolveGenderFromSeed('50M/50F', -1), 'Female');
assert.equal(resolveGenderFromSeed('invalid', 0), null);

const command = Object.freeze({
  eggId: EGG_ID,
  eggHolderOwnedMonsterId: holder.instanceId,
  partnerOwnedMonsterId: partner.instanceId,
  genderSeed: 7,
  now: NOW,
});
const before = structuredClone(initialState);
const invalidEggRoot = { ...initialState, eggs: { legacy: 'must-preserve' } };
const invalidEggRootResult = createStandardBreedingEggTransaction(invalidEggRoot, command);
assert.equal(invalidEggRootResult.ok, false);
assert.equal(invalidEggRootResult.reason, 'invalid_state');
assert.equal(invalidEggRootResult.state, invalidEggRoot);
const created = createStandardBreedingEggTransaction(initialState, command);
assert.equal(created.ok, true, created.reason);
assert.equal(created.replay, false);
assert.deepEqual(initialState, before, 'egg creation is an atomic immutable transition');
assert.equal(created.state.eggs.length, 1, 'one accepted command creates exactly one egg');
assert.equal(created.state.collection.length, initialState.collection.length);
assert.equal(created.state.untouched, initialState.untouched, 'unrelated state references remain untouched');
const egg = created.egg;
assert.deepEqual(Object.keys(egg).sort(), [
  'breedingVersion',
  'childMonsterId',
  'createdAt',
  'eggHolderOwnedMonsterId',
  'eggId',
  'genderSeed',
  'hatchAt',
  'hatchedOwnedMonsterId',
  'inheritedSkillMemoryId',
  'partnerOwnedMonsterId',
  'potentialInheritedStats',
  'potentialValues',
  'recipeId',
  'secondaryAffinity',
].sort());
assert.equal(egg.breedingVersion, 'BRD_v1.0');
assert.equal(egg.childMonsterId, 'MON_002', 'cross-species child uses the Egg Holder Stage1 family base');
assert.equal(egg.eggHolderOwnedMonsterId, holder.instanceId);
assert.equal(egg.partnerOwnedMonsterId, partner.instanceId);
assert.equal(egg.createdAt, NOW);
assert.equal(egg.hatchAt, NOW + 15 * 60 * 1000);
assert.equal(egg.genderSeed, 7);
assert.deepEqual(egg.potentialInheritedStats, ['spAtk', 'spDef', 'def']);
assert.deepEqual(egg.potentialValues, { hp: 25, atk: 0, def: 3, spAtk: 28, spDef: 27, spd: 14 });
assert.deepEqual(Object.keys(egg.potentialValues).sort(), ['atk', 'def', 'hp', 'spAtk', 'spDef', 'spd'].sort());
assert.ok(Object.values(egg.potentialValues).every(value => Number.isInteger(value) && value >= 0 && value <= 31));
assert.equal(egg.secondaryAffinity, 'Dragon');
assert.equal(egg.inheritedSkillMemoryId, null, 'A33 owns skill-memory activation');
assert.equal(egg.recipeId, null, 'standard breeding cannot silently create a hybrid');
assert.equal(egg.hatchedOwnedMonsterId, null);
assert.equal('isReadyToHatch' in egg, false, 'readiness is derived only');
assert.equal(validateWorkbookEgg(egg).ok, true);
assert.equal(validateWorkbookEgg({ ...egg, secondaryAffinity: 'BogusType' }).ok, false, 'affinity must stay inside the Holder Stage2 workbook pool');
assert.equal(validateWorkbookEgg({ ...egg, hatchAt: egg.createdAt + 1 }).ok, false, 'canonical hatch duration is exact, not merely positive');
assert.equal(validateWorkbookEgg({ ...egg, childMonsterId: 'MON_999', secondaryAffinity: null }).ok, false, 'child must resolve to a real workbook Stage1 row');
assert.equal(validateWorkbookEgg({ ...egg, childMonsterId: 'MON_017', secondaryAffinity: null }).ok, false, 'SpecialRecipeOnly species cannot enter the standard egg schema');
assert.equal(validateWorkbookEgg({ ...egg, eggId: CASE_UUID.toUpperCase() }).ok, false, 'canonical UUID identity is lowercase');
assert.equal(hatchedOwnedMonsterIdForEgg(CASE_UUID.toUpperCase()), null);
assert.equal(createStandardBreedingEggTransaction(initialState, { ...command, eggId: CASE_UUID.toUpperCase() }).reason, 'invalid_state');
const optionalEggFields = ['secondaryAffinity', 'inheritedSkillMemoryId', 'recipeId', 'hatchedOwnedMonsterId'];
const omittedOptionalEgg = { ...egg };
for (const field of optionalEggFields) delete omittedOptionalEgg[field];
assert.equal(validateWorkbookEgg(omittedOptionalEgg).ok, true, 'workbook optional fields may use their null default');
const defaultedOptionalEgg = normalizeEggsForPersistence([omittedOptionalEgg])[0];
for (const field of optionalEggFields) {
  assert.equal(defaultedOptionalEgg[field], null, `${field} is materialized with the workbook null default`);
}

const createdHolder = created.state.collection.find(monster => monster.instanceId === holder.instanceId);
const createdPartner = created.state.collection.find(monster => monster.instanceId === partner.instanceId);
assert.equal(createdHolder.breedingCooldownUntil, NOW + PARENT_BREEDING_COOLDOWN_MS);
assert.equal(createdPartner.breedingCooldownUntil, NOW + PARENT_BREEDING_COOLDOWN_MS);
assert.equal(createdHolder.breedingVersion, BREEDING_VERSION);
assert.equal(createdPartner.breedingVersion, BREEDING_VERSION);
assert.equal(createdHolder.mind.bond, 50, 'breeding does not consume Bond');
assert.equal(createdPartner.mind.bond, 50, 'breeding does not consume Bond');

const replay = createStandardBreedingEggTransaction(created.state, command);
assert.equal(replay.ok, true);
assert.equal(replay.replay, true);
assert.equal(replay.state, created.state, 'same egg command is an exact no-op');
assert.equal(replay.state.eggs.length, 1);
assert.equal(replay.state.collection.find(monster => monster.instanceId === holder.instanceId).breedingCooldownUntil, NOW + PARENT_BREEDING_COOLDOWN_MS);

const parentsRemovedAfterCreate = {
  ...created.state,
  collection: created.state.collection.filter(monster => ![holder.instanceId, partner.instanceId].includes(monster.instanceId)),
};
const replayWithoutParents = createStandardBreedingEggTransaction(parentsRemovedAfterCreate, command);
assert.equal(replayWithoutParents.ok, true);
assert.equal(replayWithoutParents.replay, true, 'a valid command ledger remains replayable after both parents leave Collection');
assert.equal(replayWithoutParents.state, parentsRemovedAfterCreate);
assert.equal(
  createStandardBreedingEggTransaction(parentsRemovedAfterCreate, { ...command, now: NOW + 1 }).reason,
  'egg_id_conflict',
  'parentless replay still requires exact command identity',
);
const oneParentMissing = {
  ...created.state,
  collection: created.state.collection.filter(monster => monster.instanceId !== partner.instanceId),
};
assert.equal(createStandardBreedingEggTransaction(oneParentMissing, command).reason, 'egg_id_conflict', 'a partially resolvable replay fails closed');

for (const changedCommand of [
  { ...command, genderSeed: command.genderSeed + 1 },
  { ...command, now: command.now + 1 },
]) {
  const divergentReplay = createStandardBreedingEggTransaction(created.state, changedCommand);
  assert.equal(divergentReplay.ok, false);
  assert.equal(divergentReplay.reason, 'egg_id_conflict', 'same UUID cannot acknowledge a different command');
  assert.equal(divergentReplay.state, created.state);
}
const corruptReplayState = { ...created.state, eggs: [{ ...egg, hatchAt: egg.createdAt + 1 }] };
const corruptReplay = createStandardBreedingEggTransaction(corruptReplayState, command);
assert.equal(corruptReplay.ok, false);
assert.equal(corruptReplay.reason, 'egg_id_conflict', 'malformed persisted eggs cannot pass replay validation');
assert.equal(corruptReplay.state, corruptReplayState);
const derivedFieldReplayState = { ...created.state, eggs: [{ ...egg, isReadyToHatch: false }] };
assert.equal(createStandardBreedingEggTransaction(derivedFieldReplayState, command).reason, 'egg_id_conflict', 'replay cannot bless a persisted derived field');
for (const tamperedEgg of [
  { ...egg, childMonsterId: 'MON_009' },
  { ...egg, potentialValues: { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 } },
]) {
  assert.equal(validateWorkbookEgg(tamperedEgg).ok, true, 'adversarial replay fixture remains individually schema-valid');
  const tamperedState = { ...created.state, eggs: [tamperedEgg] };
  const tamperedReplay = createStandardBreedingEggTransaction(tamperedState, command);
  assert.equal(tamperedReplay.ok, false);
  assert.equal(tamperedReplay.reason, 'egg_id_conflict', 'replay verifies the deterministic cross-field snapshot');
  assert.equal(tamperedReplay.state, tamperedState);
}

const idConflict = createStandardBreedingEggTransaction(created.state, {
  ...command,
  partnerOwnedMonsterId: alternatePartner.instanceId,
});
assert.equal(idConflict.ok, false);
assert.equal(idConflict.reason, 'egg_id_conflict');
assert.equal(idConflict.state, created.state);

const cooldownBlocked = createStandardBreedingEggTransaction(created.state, {
  ...command,
  eggId: SECOND_EGG_ID,
  now: NOW + 1,
});
assert.equal(cooldownBlocked.ok, false);
assert.equal(cooldownBlocked.reason, 'breeding_cooldown');
assert.equal(cooldownBlocked.state, created.state);
assert.equal(cooldownBlocked.state.eggs.length, 1);

const invalidPotentialState = {
  ...initialState,
  collection: initialState.collection.map(monster => monster.instanceId === holder.instanceId
    ? { ...monster, potential: { ...monster.potential, hp: 32 } }
    : monster),
};
const invalidPotentialBefore = structuredClone(invalidPotentialState);
const invalidPotential = createStandardBreedingEggTransaction(invalidPotentialState, command);
assert.equal(invalidPotential.ok, false);
assert.equal(invalidPotential.reason, 'invalid_potential');
assert.deepEqual(invalidPotentialState, invalidPotentialBefore);

assert.equal(isEggReadyToHatch(egg, egg.hatchAt - 1), false);
assert.equal(isEggReadyToHatch(egg, egg.hatchAt), true);
assert.equal(isEggReadyToHatch(egg, egg.hatchAt + 1), true);
assert.equal(isEggReadyToHatch({ ...egg, hatchAt: Number.NaN }, NOW), false);

const notReadyBefore = structuredClone(created.state);
const invalidStorageRoot = { ...created.state, storage: { legacy: 'must-preserve' } };
const invalidStorageRootResult = hatchBreedingEggTransaction(invalidStorageRoot, { eggId: EGG_ID, now: egg.hatchAt });
assert.equal(invalidStorageRootResult.ok, false);
assert.equal(invalidStorageRootResult.reason, 'invalid_state');
assert.equal(invalidStorageRootResult.state, invalidStorageRoot);
const notReady = hatchBreedingEggTransaction(created.state, { eggId: EGG_ID, now: egg.hatchAt - 1 });
assert.equal(notReady.ok, false);
assert.equal(notReady.reason, 'egg_not_ready');
assert.equal(notReady.state, created.state);
assert.deepEqual(created.state, notReadyBefore);
const omittedOptionalHatch = hatchBreedingEggTransaction(
  { ...created.state, eggs: [omittedOptionalEgg] },
  { eggId: EGG_ID, now: egg.hatchAt },
);
assert.equal(omittedOptionalHatch.ok, true, omittedOptionalHatch.reason);
for (const field of optionalEggFields.slice(0, 3)) {
  assert.equal(omittedOptionalHatch.egg[field], null, `${field} default survives the hatch ledger`);
}
assert.equal(omittedOptionalHatch.child.inheritedSkillMemoryId, null);

for (const invalidChildMonsterId of ['MON_999', 'MON_017']) {
  const invalidChildState = {
    ...created.state,
    eggs: [{ ...egg, childMonsterId: invalidChildMonsterId, secondaryAffinity: null }],
  };
  const invalidChild = hatchBreedingEggTransaction(invalidChildState, { eggId: EGG_ID, now: egg.hatchAt });
  assert.equal(invalidChild.ok, false);
  assert.equal(invalidChild.reason, 'child_species_unresolved');
  assert.equal(invalidChild.state, invalidChildState);
}

const expectedChildId = hatchedOwnedMonsterIdForEgg(EGG_ID);
assert.match(expectedChildId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.equal(hatchedOwnedMonsterIdForEgg(EGG_ID), expectedChildId, 'child ID is stable across reload/replay');
const hatched = hatchBreedingEggTransaction(created.state, { eggId: EGG_ID, now: egg.hatchAt });
assert.equal(hatched.ok, true, hatched.reason);
assert.equal(hatched.state.collection.length, created.state.collection.length + 1);
assert.equal(hatched.state.storage.filter(id => id === expectedChildId).length, 1);
assert.equal(hatched.state.eggs.length, 1, 'hatched egg is retained as the idempotence ledger');
assert.equal(hatched.state.eggs[0].hatchedOwnedMonsterId, expectedChildId);
const child = hatched.child;
assert.equal(child.instanceId, expectedChildId);
assert.equal(child.speciesId, 'flameling');
assert.equal(child.formId, 'flameling');
assert.equal(child.level, 1);
assert.equal(child.growthExp, 0);
assert.equal(child.mind.bond, 10);
assert.equal(child.secondaryType, null, 'Stage1 secondary type is always locked');
assert.deepEqual(child.potential, egg.potentialValues, 'hatch never rerolls Potential');
assert.deepEqual(child.parents, { a: holder.instanceId, b: partner.instanceId });
assert.equal(child.inheritedSkillMemoryId, null);
assert.equal(child.gender, 'Male');

const secondHatchBefore = structuredClone(hatched.state);
const secondHatch = hatchBreedingEggTransaction(hatched.state, { eggId: EGG_ID, now: egg.hatchAt + 1 });
assert.equal(secondHatch.ok, false);
assert.equal(secondHatch.reason, 'egg_already_hatched');
assert.equal(secondHatch.state, hatched.state);
assert.deepEqual(hatched.state, secondHatchBefore);

const deletedParents = {
  ...created.state,
  collection: created.state.collection.filter(monster => ![holder.instanceId, partner.instanceId].includes(monster.instanceId)),
  storage: created.state.storage.filter(id => ![holder.instanceId, partner.instanceId].includes(id)),
};
const orphanHatch = hatchBreedingEggTransaction(deletedParents, { eggId: EGG_ID, now: egg.hatchAt });
assert.equal(orphanHatch.ok, true, 'the persisted egg snapshot hatches without live parent objects');
assert.deepEqual(orphanHatch.child.parents, { a: holder.instanceId, b: partner.instanceId });

const markerWithoutChild = {
  ...hatched.state,
  collection: hatched.state.collection.filter(monster => monster.instanceId !== expectedChildId),
  storage: hatched.state.storage.filter(id => id !== expectedChildId),
};
const markerConflict = hatchBreedingEggTransaction(markerWithoutChild, { eggId: EGG_ID, now: egg.hatchAt + 1 });
assert.equal(markerConflict.ok, false);
assert.equal(markerConflict.reason, 'hatch_state_conflict');
assert.equal(markerConflict.state, markerWithoutChild);
const childMovedToPartyState = {
  ...hatched.state,
  party: [expectedChildId, null, null],
  storage: hatched.state.storage.filter(id => id !== expectedChildId),
};
assert.equal(
  hatchBreedingEggTransaction(childMovedToPartyState, { eggId: EGG_ID, now: egg.hatchAt + 1 }).reason,
  'egg_already_hatched',
  'party\/storage location is mutable and is not part of hatch identity',
);

const wrongMarkerEgg = { ...egg, hatchedOwnedMonsterId: CASE_UUID };
assert.equal(validateWorkbookEgg(wrongMarkerEgg).ok, false, 'ledger marker must be the ID derived from eggId');
const wrongMarkerState = {
  ...created.state,
  collection: [...created.state.collection, normalizeInstance({ instanceId: CASE_UUID, speciesId: 'aquapuff' }, { now: NOW })],
  eggs: [wrongMarkerEgg],
};
assert.equal(hatchBreedingEggTransaction(wrongMarkerState, { eggId: EGG_ID, now: egg.hatchAt }).reason, 'hatch_state_conflict');

for (const wrongChild of [
  { ...child, speciesId: 'aquapuff' },
  { ...child, parents: { a: 'wrong-holder', b: partner.instanceId } },
  { ...child, potential: { ...child.potential, hp: child.potential.hp === 31 ? 30 : 31 } },
]) {
  const wrongChildState = {
    ...hatched.state,
    collection: hatched.state.collection.map(monster => monster.instanceId === expectedChildId ? wrongChild : monster),
  };
  const wrongChildReplay = hatchBreedingEggTransaction(wrongChildState, { eggId: EGG_ID, now: egg.hatchAt + 1 });
  assert.equal(wrongChildReplay.reason, 'hatch_state_conflict', 'ledger marker must point to the child encoded by the egg snapshot');
}

const collisionState = {
  ...created.state,
  collection: [...created.state.collection, normalizeInstance({ instanceId: expectedChildId, speciesId: 'aquapuff' }, { now: NOW })],
};
const collision = hatchBreedingEggTransaction(collisionState, { eggId: EGG_ID, now: egg.hatchAt });
assert.equal(collision.ok, false);
assert.equal(collision.reason, 'hatch_owned_id_conflict');
assert.equal(collision.state, collisionState);

const canonicalSave = normalizeSavedState(created.state, { now: NOW });
assert.equal(canonicalSave.eggs[0].hatchAt, egg.hatchAt, 'reload never moves the canonical hatch deadline');
assert.equal('isReadyToHatch' in canonicalSave.eggs[0], false);
assert.deepEqual(normalizeSavedState(canonicalSave, { now: NOW + 123_456 }), canonicalSave, 'canonical reload normalization is idempotent');

const migrationDiagnostics = [];
const legacySave = {
  saveVersion: 9,
  collection: [{ instanceId: 'legacy-mon', speciesId: 'flameling' }],
  party: [null, null, null],
  storage: ['legacy-mon'],
  eggs: [{
    eggId: 'legacy-e1',
    parentAId: 'legacy-mon',
    readyAt: NOW + 30_000,
    potentialValues: [1, 2, 3],
    child: { speciesId: 'flameling' },
  }],
};
const migrated = normalizeSavedState(legacySave, { now: NOW, onDiagnostic: issue => migrationDiagnostics.push(issue) });
assert.equal(migrated.saveVersion, 15);
assert.deepEqual(migrated.eggs[0], legacySave.eggs[0], 'legacy embedded-child egg is quarantined without lossy guessing');
assert.ok(migrationDiagnostics.some(issue => issue.code === 'legacy_egg_quarantined'));
assert.deepEqual(normalizeSavedState(migrated, { now: NOW + 999 }), migrated, 'v10 migration is twice-is-same');
assert.deepEqual(Object.keys(migrated.collection[0].potential).sort(), ['atk', 'def', 'hp', 'spAtk', 'spDef', 'spd'].sort());
assert.ok(Object.values(migrated.collection[0].potential).every(value => Number.isInteger(value) && value >= 0 && value <= 31));
assert.ok(new Set(Object.values(migrated.collection[0].potential)).size > 1, 'missing legacy Potential receives a deterministic 0..31 roll, not six fixed defaults');

const persisted = sanitizeStateForPersistence({ ...created.state, collection: [createdHolder] });
assert.equal(persisted.collection[0].breedingCooldownUntil, NOW + PARENT_BREEDING_COOLDOWN_MS);
assert.equal(persisted.collection[0].breedingVersion, BREEDING_VERSION);
assert.equal('spAtk' in persisted.collection[0].potential, false);
assert.equal('spDef' in persisted.collection[0].potential, false);
assert.equal(persisted.collection[0].potential.spatk, createdHolder.potential.spAtk);
assert.equal(persisted.collection[0].potential.spdef, createdHolder.potential.spDef);
const roundTrip = normalizeSavedState({
  ...persisted,
  party: [null, null, null],
  storage: [createdHolder.instanceId],
}, { now: NOW });
assert.equal(roundTrip.collection[0].potential.spAtk, createdHolder.potential.spAtk);
assert.equal(roundTrip.collection[0].potential.spDef, createdHolder.potential.spDef);

console.log('V8.1 A32 canonical egg schema and idempotent hatch transaction: PASS');
