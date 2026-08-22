import assert from 'node:assert/strict';
import {
  applyBreedingSkillMemoryRequestLedger,
  createStandardBreedingEggTransaction,
  hatchBreedingEggTransaction,
  validateWorkbookEgg,
} from '../breeding.mjs';
import { normalizeInstance } from '../monster-instance.mjs';
import {
  normalizeSavedState,
  sanitizeStateForPersistence,
} from '../save-schema.mjs';
import {
  learnInheritedSkillMemory,
  listBreedingSkillMemoryCandidates,
  resolveBreedingSkillMemory,
  resolveFamilySkillMemoryTarget,
  resolveInheritedSkillMemoryEligibility,
  resolveStage2Learnset,
  synchronizeStage1Learnset,
} from '../skill-progression.mjs';

const NOW = 1_780_000_000_000;
const EGG_ID = '12345678-1234-4123-8123-123456789abc';
const INVALID_MEMORY_EGG_ID = '22345678-1234-4123-8123-123456789abc';
const NULL_MEMORY_EGG_ID = '32345678-1234-4123-8123-123456789abc';

function adult({
  instanceId,
  speciesId,
  formId,
  gender,
  level = 25,
  bond = 70,
  secondaryType = null,
  skillIds = [],
}) {
  return normalizeInstance({
    instanceId,
    speciesId,
    formId,
    gender,
    level,
    mind: { bond },
    secondaryType,
    skillIds,
    skills: skillIds.map(skillId => ({ skillId, slot: null, masteryExp: 0 })),
    parents: { a: null, b: null },
  }, { now: NOW });
}

function firePair({ partnerSkills = ['SK_DARK_02'], partnerLevel = 25, partnerBond = 70 } = {}) {
  const holder = adult({
    instanceId: 'holder-fire', speciesId: 'flameling', formId: 'MON_020',
    gender: 'Female', secondaryType: 'Dragon', skillIds: ['SK_FIRE_01'],
  });
  const partner = adult({
    instanceId: 'partner-dark', speciesId: 'voidhorn', formId: 'MON_029',
    gender: 'Male', level: partnerLevel, bond: partnerBond, skillIds: partnerSkills,
  });
  return { holder, partner };
}

function transactionState(pair = firePair()) {
  return {
    collection: [pair.holder, pair.partner],
    storage: [pair.holder.instanceId, pair.partner.instanceId],
    eggs: [],
  };
}

// Workbook calculator example: Fire Stage2 family accepts a Dark partner's
// known LevelUp move through the Fire family's Tutor row. BreedingCandidate is
// preferred data, not an exclusive gate.
{
  const { holder, partner } = firePair();
  const result = resolveBreedingSkillMemory(holder, partner, 'SK_DARK_02');
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.inheritedSkillMemoryId, 'SK_DARK_02');
  assert.equal(result.partnerEntry.method, 'LevelUp');
  assert.equal(result.targetEntry.method, 'Tutor');
  assert.equal(result.preferred, false);
  assert.equal(resolveFamilySkillMemoryTarget('flameling', 'SK_DARK_02').ok, true);
}

// The Partner must really own the selected skill; equipped slots are not the
// source of truth and a forged learnset-only candidate is rejected.
{
  const { holder, partner } = firePair({ partnerSkills: [] });
  const result = resolveBreedingSkillMemory(holder, partner, 'SK_DARK_02');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'partner_skill_not_known');
  assert.equal(result.inheritedSkillMemoryId, null);
}

// Partner entry requirements are evaluated at egg creation.
{
  const holder = adult({
    instanceId: 'holder-water', speciesId: 'aquapuff', formId: 'MON_021',
    gender: 'Female', secondaryType: 'Psychic', skillIds: [],
  });
  const secondaryBlocked = adult({
    instanceId: 'partner-water-secondary', speciesId: 'aquapuff', formId: 'MON_021',
    gender: 'Male', secondaryType: null, skillIds: ['SK_PSYCHIC_02'],
  });
  assert.equal(
    resolveBreedingSkillMemory(holder, secondaryBlocked, 'SK_PSYCHIC_02').reason,
    'partner_secondary_required',
  );
  secondaryBlocked.secondaryType = 'Psychic';
  assert.equal(resolveBreedingSkillMemory(holder, secondaryBlocked, 'SK_PSYCHIC_02').ok, true);

  const levelBlocked = adult({
    instanceId: 'partner-water-level', speciesId: 'aquapuff', formId: 'MON_021',
    gender: 'Male', level: 13, skillIds: ['SK_WATER_05'],
  });
  assert.equal(resolveBreedingSkillMemory(holder, levelBlocked, 'SK_WATER_05').reason, 'partner_level_required');

  const stageBlocked = adult({
    instanceId: 'partner-water-stage', speciesId: 'aquapuff', formId: 'aquapuff',
    gender: 'Male', secondaryType: 'Psychic', skillIds: ['SK_PSYCHIC_02'],
  });
  assert.equal(resolveBreedingSkillMemory(holder, stageBlocked, 'SK_PSYCHIC_02').reason, 'partner_stage_required');

  const tutorBondBlocked = adult({
    instanceId: 'partner-water-bond', speciesId: 'aquapuff', formId: 'MON_021',
    gender: 'Male', level: 20, bond: 39, skillIds: ['SK_LIGHT_04'],
  });
  assert.equal(resolveBreedingSkillMemory(holder, tutorBondBlocked, 'SK_LIGHT_04').reason, 'partner_bond_required');

  const deferredPartner = adult({
    instanceId: 'partner-dark-deferred', speciesId: 'voidhorn', formId: 'MON_029',
    gender: 'Male', level: 30, bond: 60, secondaryType: 'Fire', skillIds: ['SK_FIRE_04'],
  });
  assert.equal(resolveBreedingSkillMemory(firePair().holder, deferredPartner, 'SK_FIRE_04').reason, 'partner_entry_deferred');
}

// Target-family and category gates are independent of Partner ownership.
{
  assert.equal(resolveFamilySkillMemoryTarget('flameling', 'SK_DARK_05').reason, 'family_skill_not_found');
  assert.equal(resolveFamilySkillMemoryTarget('flameling', 'SK_FIRE_06').reason, 'ultimate_excluded');
  assert.equal(resolveFamilySkillMemoryTarget('flameling', 'SK_FIGHTING_04').reason, 'rare_manual_excluded');
  assert.equal(resolveFamilySkillMemoryTarget('unknown', 'SK_DARK_02').reason, 'unknown_id');
  assert.equal(resolveFamilySkillMemoryTarget('flameling', 'SK_UNKNOWN_99').reason, 'unknown_skill');
}

// Candidate listing is deterministic, unique, and only ranks curated
// BreedingCandidate rows ahead of other valid methods. It never rolls RNG.
{
  const holder = adult({
    instanceId: 'holder-water-list', speciesId: 'aquapuff', formId: 'MON_021',
    gender: 'Female', secondaryType: 'Psychic', skillIds: [],
  });
  const partner = adult({
    instanceId: 'partner-water-list', speciesId: 'aquapuff', formId: 'MON_021',
    gender: 'Male', secondaryType: 'Psychic',
    skillIds: ['SK_WATER_05', 'SK_PSYCHIC_02', 'SK_PSYCHIC_02'],
  });
  const candidates = listBreedingSkillMemoryCandidates(holder, partner);
  assert.equal(candidates[0].skillId, 'SK_PSYCHIC_02');
  assert.equal(candidates[0].preferred, true);
  assert.equal(new Set(candidates.map(candidate => candidate.skillId)).size, candidates.length);
  assert.ok(candidates.some(candidate => candidate.skillId === 'SK_WATER_05'));
  assert.deepEqual(
    listBreedingSkillMemoryCandidates(holder, partner).map(candidate => candidate.skillId),
    candidates.map(candidate => candidate.skillId),
  );
}

// A33 only activates DataReady rows inside the memory boundary. A16 remains
// unable to expose them as ordinary Stage2 candidates.
{
  const instance = adult({
    instanceId: 'stage2-data-ready', speciesId: 'aquapuff', formId: 'MON_021',
    gender: 'Male', secondaryType: 'Psychic', skillIds: [],
  });
  const ordinary = resolveStage2Learnset(instance);
  const row = ordinary.entries.find(entry => entry.skillId === 'SK_PSYCHIC_02');
  assert.equal(row.entry.state, 'DataReady');
  assert.equal(row.eligible, false);
  assert.equal(row.reason, 'deferred');
  assert.equal(ordinary.candidates.includes('SK_PSYCHIC_02'), false);
}

// The caller-selected memory is part of the egg transaction. Invalid choices
// become null without cancelling breeding, and exact replay cannot switch it.
{
  const pair = firePair();
  const state = transactionState(pair);
  const command = {
    eggId: EGG_ID,
    eggHolderOwnedMonsterId: pair.holder.instanceId,
    partnerOwnedMonsterId: pair.partner.instanceId,
    genderSeed: 7,
    inheritedSkillMemoryId: 'SK_DARK_02',
    now: NOW,
  };
  const created = createStandardBreedingEggTransaction(state, command);
  assert.equal(created.ok, true, created.reason);
  assert.equal(created.egg.inheritedSkillMemoryId, 'SK_DARK_02');
  assert.equal(created.skillMemory.ok, true);
  assert.equal(validateWorkbookEgg(created.egg).ok, true);

  const replay = createStandardBreedingEggTransaction(created.state, command);
  assert.equal(replay.ok, true);
  assert.equal(replay.replay, true);
  assert.equal(replay.state, created.state);
  const tamperedReplayState = {
    ...created.state,
    eggs: [{ ...created.egg, inheritedSkillMemoryId: 'SK_DARK_01' }],
  };
  assert.equal(validateWorkbookEgg(tamperedReplayState.eggs[0]).ok, true,
    'the replay mutation fixture remains independently schema-valid');
  assert.equal(createStandardBreedingEggTransaction(tamperedReplayState, command).reason, 'egg_id_conflict',
    'replay revalidates the resolved memory outcome, not only the caller ledger');
  assert.equal(
    createStandardBreedingEggTransaction(created.state, {
      ...command,
      inheritedSkillMemoryId: 'SK_NORMAL_05',
    }).reason,
    'egg_id_conflict',
  );
  const parentsUnavailable = { ...created.state, collection: [] };
  assert.equal(createStandardBreedingEggTransaction(parentsUnavailable, command).replay, true);
  assert.equal(createStandardBreedingEggTransaction(parentsUnavailable, {
    ...command,
    inheritedSkillMemoryId: 'SK_NORMAL_05',
  }).reason, 'egg_id_conflict');

  const invalidPair = firePair();
  const invalidState = transactionState(invalidPair);
  const invalidCommand = {
    ...command,
    eggId: INVALID_MEMORY_EGG_ID,
    inheritedSkillMemoryId: 'SK_DARK_05',
  };
  const invalid = createStandardBreedingEggTransaction(invalidState, invalidCommand);
  assert.equal(invalid.ok, true, invalid.reason);
  assert.equal(invalid.egg.inheritedSkillMemoryId, null);
  assert.equal(invalid.skillMemory.reason, 'family_skill_not_found');
  assert.equal(createStandardBreedingEggTransaction(invalid.state, invalidCommand).replay, true,
    'the exact invalid selection remains the same command while parents exist');
  assert.equal(createStandardBreedingEggTransaction(invalid.state, {
    ...invalidCommand,
    inheritedSkillMemoryId: null,
  }).reason, 'egg_id_conflict', 'null cannot impersonate an invalid caller selection');
  assert.equal(createStandardBreedingEggTransaction(invalid.state, {
    ...invalidCommand,
    inheritedSkillMemoryId: 'SK_NORMAL_05',
  }).reason, 'egg_id_conflict', 'one invalid SkillID cannot impersonate another');

  const invalidParentsUnavailable = { ...invalid.state, collection: [] };
  assert.equal(createStandardBreedingEggTransaction(invalidParentsUnavailable, invalidCommand).replay, true,
    'the exact invalid selection remains replayable after both parents leave');
  assert.equal(createStandardBreedingEggTransaction(invalidParentsUnavailable, {
    ...invalidCommand,
    inheritedSkillMemoryId: null,
  }).reason, 'egg_id_conflict');
  assert.equal(createStandardBreedingEggTransaction(invalidParentsUnavailable, {
    ...invalidCommand,
    inheritedSkillMemoryId: 'SK_NORMAL_05',
  }).reason, 'egg_id_conflict');

  const nullPair = firePair();
  const nullCommand = {
    ...command,
    eggId: NULL_MEMORY_EGG_ID,
    eggHolderOwnedMonsterId: nullPair.holder.instanceId,
    partnerOwnedMonsterId: nullPair.partner.instanceId,
    inheritedSkillMemoryId: null,
  };
  const nullCreated = createStandardBreedingEggTransaction(transactionState(nullPair), nullCommand);
  assert.equal(nullCreated.ok, true, nullCreated.reason);
  assert.equal(nullCreated.egg.inheritedSkillMemoryId, null);
  assert.equal(createStandardBreedingEggTransaction(nullCreated.state, {
    ...nullCommand,
    inheritedSkillMemoryId: 'SK_DARK_05',
  }).reason, 'egg_id_conflict', 'an invalid selection cannot impersonate an explicit null command');
  const nullParentsUnavailable = { ...nullCreated.state, collection: [] };
  assert.equal(createStandardBreedingEggTransaction(nullParentsUnavailable, nullCommand).replay, true);
  assert.equal(createStandardBreedingEggTransaction(nullParentsUnavailable, {
    ...nullCommand,
    inheritedSkillMemoryId: 'SK_DARK_05',
  }).reason, 'egg_id_conflict');

  const liveCreatedState = {
    ...invalidState,
    collection: invalid.state.collection,
    eggs: invalid.state.eggs,
    breedingSkillMemoryRequestByEggId: {},
  };
  assert.equal(applyBreedingSkillMemoryRequestLedger(liveCreatedState, invalid.state), true);
  const liveParentsUnavailable = { ...liveCreatedState, collection: [] };
  const roundTrippedInvalidState = JSON.parse(JSON.stringify(liveParentsUnavailable));
  assert.equal(createStandardBreedingEggTransaction(roundTrippedInvalidState, invalidCommand).replay, true,
    'the raw selection identity survives JSON/save transport outside the workbook egg schema');
  const normalizedInvalidState = normalizeSavedState(JSON.parse(JSON.stringify(
    sanitizeStateForPersistence(liveParentsUnavailable),
  )), { now: NOW });
  const reloadedInvalidState = {
    ...normalizedInvalidState,
    breedingSkillMemoryRequestByEggId: { stale: null },
  };
  assert.equal(applyBreedingSkillMemoryRequestLedger(reloadedInvalidState, normalizedInvalidState), true);
  assert.equal(createStandardBreedingEggTransaction(reloadedInvalidState, invalidCommand).replay, true,
    'live create/load adoption and canonical local/Firebase save adapters preserve raw identity');

  const oldSaveWithoutLedger = { ...created.state };
  delete oldSaveWithoutLedger.breedingSkillMemoryRequestByEggId;
  const legacyLiveState = { breedingSkillMemoryRequestByEggId: { stale: null } };
  assert.equal(applyBreedingSkillMemoryRequestLedger(legacyLiveState, oldSaveWithoutLedger), true);
  assert.deepEqual(legacyLiveState.breedingSkillMemoryRequestByEggId, {},
    'loading a pre-A33 save resets a stale runtime ledger');

  const malformedRoot = {
    ...invalidParentsUnavailable,
    breedingSkillMemoryRequestByEggId: 'malformed',
  };
  assert.equal(createStandardBreedingEggTransaction(malformedRoot, invalidCommand).reason, 'invalid_state');
  const malformedEntry = {
    ...invalidParentsUnavailable,
    breedingSkillMemoryRequestByEggId: {
      ...invalidParentsUnavailable.breedingSkillMemoryRequestByEggId,
      [INVALID_MEMORY_EGG_ID]: 42,
    },
  };
  assert.equal(createStandardBreedingEggTransaction(malformedEntry, invalidCommand).reason, 'egg_id_conflict');

  assert.equal(validateWorkbookEgg({ ...created.egg, inheritedSkillMemoryId: 'SK_FIRE_06' }).ok, false);
  assert.equal(validateWorkbookEgg({ ...created.egg, inheritedSkillMemoryId: 'SK_FIGHTING_04' }).ok, false);
  assert.equal(validateWorkbookEgg({ ...created.egg, inheritedSkillMemoryId: ['SK_DARK_02'] }).ok, false);

  const hatched = hatchBreedingEggTransaction(created.state, { eggId: EGG_ID, now: created.egg.hatchAt });
  assert.equal(hatched.ok, true, hatched.reason);
  assert.equal(hatched.child.inheritedSkillMemoryId, 'SK_DARK_02');
  assert.deepEqual(hatched.child.skills, [], 'hatch reducer keeps memory as metadata only');
  assert.equal(hatched.child.secondaryType, null);

  const prepared = structuredClone(hatched.child);
  synchronizeStage1Learnset(prepared);
  assert.equal(prepared.skills.some(skill => skill.skillId === 'SK_DARK_02'), false);
  assert.equal(prepared.skills.some(skill => skill.slot === 's2' && skill.skillId === 'SK_DARK_02'), false);

  const tamperedChildState = {
    ...hatched.state,
    collection: hatched.state.collection.map(monster => monster.instanceId === hatched.child.instanceId
      ? { ...monster, inheritedSkillMemoryId: 'SK_NORMAL_05' }
      : monster),
  };
  assert.equal(
    hatchBreedingEggTransaction(tamperedChildState, { eggId: EGG_ID, now: created.egg.hatchAt + 1 }).reason,
    'hatch_state_conflict',
  );
}

// Method-specific memory unlock timing is read-only until the explicit relearn
// action. Learning never equips and never consumes the persistent memory.
{
  const levelMemory = normalizeInstance({
    instanceId: 'level-memory', speciesId: 'aquapuff', formId: 'aquapuff',
    level: 13, inheritedSkillMemoryId: 'SK_WATER_05', skills: [],
  }, { now: NOW });
  assert.equal(resolveInheritedSkillMemoryEligibility(levelMemory).reason, 'level_required');
  levelMemory.level = 14;
  assert.equal(resolveInheritedSkillMemoryEligibility(levelMemory).eligible, true);

  const secondaryMemory = normalizeInstance({
    instanceId: 'secondary-memory', speciesId: 'aquapuff', formId: 'MON_021',
    level: 1, secondaryType: null, inheritedSkillMemoryId: 'SK_PSYCHIC_02', skills: [],
  }, { now: NOW });
  assert.equal(resolveInheritedSkillMemoryEligibility(secondaryMemory).reason, 'secondary_required');
  secondaryMemory.secondaryType = 'Psychic';
  assert.equal(resolveInheritedSkillMemoryEligibility(secondaryMemory).eligible, true, 'BreedingCandidate memory may bypass LearnLevel');

  const secondaryLevelMemory = normalizeInstance({
    instanceId: 'secondary-level-memory', speciesId: 'flameling', formId: 'MON_020',
    level: 1, secondaryType: 'Dark', inheritedSkillMemoryId: 'SK_DARK_01', skills: [],
  }, { now: NOW });
  assert.equal(resolveInheritedSkillMemoryEligibility(secondaryLevelMemory).eligible, true, 'SecondaryLevel memory may bypass LearnLevel');

  const tutorMemory = normalizeInstance({
    instanceId: 'tutor-memory', speciesId: 'flameling', formId: 'MON_020',
    level: 27, mind: { bond: 60 }, inheritedSkillMemoryId: 'SK_DARK_02', skills: [],
  }, { now: NOW });
  const tutorMemoryStage1 = normalizeInstance({
    instanceId: 'tutor-memory-stage1', speciesId: 'flameling', formId: 'flameling',
    level: 28, mind: { bond: 60 }, inheritedSkillMemoryId: 'SK_DARK_02', skills: [],
  }, { now: NOW });
  assert.equal(resolveInheritedSkillMemoryEligibility(tutorMemoryStage1).reason, 'stage_required');
  assert.equal(resolveInheritedSkillMemoryEligibility(tutorMemory).reason, 'level_required');
  tutorMemory.level = 28;
  tutorMemory.mind.bond = 59;
  assert.equal(resolveInheritedSkillMemoryEligibility(tutorMemory).reason, 'bond_required');
  tutorMemory.mind.bond = 60;
  const ready = resolveInheritedSkillMemoryEligibility(tutorMemory);
  assert.equal(ready.eligible, true);
  assert.equal(ready.method, 'Tutor');
  assert.deepEqual(tutorMemory.skills, []);

  const learned = learnInheritedSkillMemory(tutorMemory);
  assert.equal(learned.ok, true, learned.reason);
  assert.equal(learned.skill.skillId, 'SK_DARK_02');
  assert.equal(learned.skill.slot, null);
  assert.equal(tutorMemory.inheritedSkillMemoryId, 'SK_DARK_02');
  assert.equal(resolveInheritedSkillMemoryEligibility(tutorMemory).reason, 'already_learned');
}

console.log('V8.1 A33 breeding Skill Memory: PASS');
