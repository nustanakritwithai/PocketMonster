import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeInstance } from '../monster-instance.mjs';

const progressionSource = fs.readFileSync(new URL('../skill-progression.mjs', import.meta.url), 'utf8');
const breedingSource = fs.readFileSync(new URL('../breeding.mjs', import.meta.url), 'utf8');
const NOW = 1_780_000_000_000;
const EGG_ID = '32345678-1234-4123-8123-123456789abc';
const INVALID_MEMORY_EGG_ID = '42345678-1234-4123-8123-123456789abc';
const NULL_MEMORY_EGG_ID = '52345678-1234-4123-8123-123456789abc';

async function loadSource(source, filename, tag) {
  const withAbsoluteImports = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${withAbsoluteImports}\n//# sourceURL=${filename}-${tag}`).toString('base64')}`);
}

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
    skills: skillIds.map(skillId => ({ skillId, slot: null, masteryExp: 0 })),
    parents: { a: null, b: null },
  }, { now: NOW });
}

function fireHolder() {
  return adult({
    instanceId: 'holder-fire', speciesId: 'flameling', formId: 'MON_020',
    gender: 'Female', secondaryType: 'Dragon', skillIds: ['SK_FIRE_01'],
  });
}

function darkPartner(overrides = {}) {
  return adult({
    instanceId: 'partner-dark', speciesId: 'voidhorn', formId: 'MON_029',
    gender: 'Male', skillIds: ['SK_DARK_02'], ...overrides,
  });
}

function progressionContract(module) {
  const holder = fireHolder();
  const partner = darkPartner();
  const tutor = module.resolveBreedingSkillMemory(holder, partner, 'SK_DARK_02');
  assert.equal(tutor.ok, true, tutor.reason);
  assert.equal(tutor.targetEntry.method, 'Tutor');
  assert.equal(tutor.partnerEntry.method, 'LevelUp');
  assert.equal(module.resolveBreedingSkillMemory(holder, darkPartner({ skillIds: [] }), 'SK_DARK_02').reason, 'partner_skill_not_known');
  assert.equal(module.resolveBreedingSkillMemory(holder, partner, 'SK_DARK_05').reason, 'family_skill_not_found');
  assert.equal(module.resolveFamilySkillMemoryTarget('flameling', 'SK_FIRE_06').reason, 'ultimate_excluded');
  assert.equal(module.resolveFamilySkillMemoryTarget('flameling', 'SK_FIGHTING_04').reason, 'rare_manual_excluded');

  const waterHolder = adult({
    instanceId: 'holder-water', speciesId: 'aquapuff', formId: 'MON_021',
    gender: 'Female', secondaryType: 'Psychic', skillIds: [],
  });
  const waterPartner = adult({
    instanceId: 'partner-water', speciesId: 'aquapuff', formId: 'MON_021',
    gender: 'Male', secondaryType: 'Psychic',
    skillIds: ['SK_WATER_05', 'SK_PSYCHIC_02', 'SK_PSYCHIC_02'],
  });
  const candidates = module.listBreedingSkillMemoryCandidates(waterHolder, waterPartner);
  assert.equal(candidates[0].skillId, 'SK_PSYCHIC_02');
  assert.equal(candidates[0].preferred, true);
  assert.equal(new Set(candidates.map(candidate => candidate.skillId)).size, candidates.length);

  const noSecondary = adult({
    instanceId: 'no-secondary', speciesId: 'aquapuff', formId: 'MON_021',
    gender: 'Male', skillIds: ['SK_PSYCHIC_02'],
  });
  assert.equal(module.resolveBreedingSkillMemory(waterHolder, noSecondary, 'SK_PSYCHIC_02').reason, 'partner_secondary_required');
  const lowLevel = adult({
    instanceId: 'low-level', speciesId: 'aquapuff', formId: 'MON_021',
    gender: 'Male', level: 13, skillIds: ['SK_WATER_05'],
  });
  assert.equal(module.resolveBreedingSkillMemory(waterHolder, lowLevel, 'SK_WATER_05').reason, 'partner_level_required');
  const baseStage = adult({
    instanceId: 'base-stage', speciesId: 'aquapuff', formId: 'aquapuff',
    gender: 'Male', secondaryType: 'Psychic', skillIds: ['SK_PSYCHIC_02'],
  });
  assert.equal(module.resolveBreedingSkillMemory(waterHolder, baseStage, 'SK_PSYCHIC_02').reason, 'partner_stage_required');
  const lowBond = adult({
    instanceId: 'low-bond', speciesId: 'aquapuff', formId: 'MON_021',
    gender: 'Male', level: 20, bond: 39, skillIds: ['SK_LIGHT_04'],
  });
  assert.equal(module.resolveBreedingSkillMemory(waterHolder, lowBond, 'SK_LIGHT_04').reason, 'partner_bond_required');
  const deferred = adult({
    instanceId: 'deferred', speciesId: 'voidhorn', formId: 'MON_029',
    gender: 'Male', level: 30, bond: 60, secondaryType: 'Fire', skillIds: ['SK_FIRE_04'],
  });
  assert.equal(module.resolveBreedingSkillMemory(holder, deferred, 'SK_FIRE_04').reason, 'partner_entry_deferred');

  const ordinary = module.resolveStage2Learnset(waterPartner).entries.find(entry => entry.skillId === 'SK_PSYCHIC_02');
  assert.equal(ordinary.reason, 'deferred');
  assert.equal(ordinary.eligible, false);

  const levelMemory = normalizeInstance({
    instanceId: 'level-memory', speciesId: 'aquapuff', formId: 'aquapuff',
    level: 13, inheritedSkillMemoryId: 'SK_WATER_05', skills: [],
  }, { now: NOW });
  assert.equal(module.resolveInheritedSkillMemoryEligibility(levelMemory).reason, 'level_required');
  levelMemory.level = 14;
  assert.equal(module.resolveInheritedSkillMemoryEligibility(levelMemory).eligible, true);

  const secondaryMemory = normalizeInstance({
    instanceId: 'secondary-memory', speciesId: 'aquapuff', formId: 'MON_021',
    level: 1, secondaryType: null, inheritedSkillMemoryId: 'SK_PSYCHIC_02', skills: [],
  }, { now: NOW });
  assert.equal(module.resolveInheritedSkillMemoryEligibility(secondaryMemory).reason, 'secondary_required');
  secondaryMemory.secondaryType = 'Psychic';
  assert.equal(module.resolveInheritedSkillMemoryEligibility(secondaryMemory).eligible, true);

  const secondaryLevelMemory = normalizeInstance({
    instanceId: 'secondary-level-memory', speciesId: 'flameling', formId: 'MON_020',
    level: 1, secondaryType: 'Dark', inheritedSkillMemoryId: 'SK_DARK_01', skills: [],
  }, { now: NOW });
  assert.equal(module.resolveInheritedSkillMemoryEligibility(secondaryLevelMemory).eligible, true);

  const tutorMemory = normalizeInstance({
    instanceId: 'tutor-memory', speciesId: 'flameling', formId: 'MON_020',
    level: 27, mind: { bond: 60 }, inheritedSkillMemoryId: 'SK_DARK_02', skills: [],
  }, { now: NOW });
  const tutorMemoryStage1 = normalizeInstance({
    instanceId: 'tutor-memory-stage1', speciesId: 'flameling', formId: 'flameling',
    level: 28, mind: { bond: 60 }, inheritedSkillMemoryId: 'SK_DARK_02', skills: [],
  }, { now: NOW });
  assert.equal(module.resolveInheritedSkillMemoryEligibility(tutorMemoryStage1).reason, 'stage_required');
  assert.equal(module.resolveInheritedSkillMemoryEligibility(tutorMemory).reason, 'level_required');
  tutorMemory.level = 28;
  tutorMemory.mind.bond = 59;
  assert.equal(module.resolveInheritedSkillMemoryEligibility(tutorMemory).reason, 'bond_required');
  tutorMemory.mind.bond = 60;
  const learned = module.learnInheritedSkillMemory(tutorMemory);
  assert.equal(learned.ok, true);
  assert.equal(learned.skill.skillId, 'SK_DARK_02');
  assert.equal(learned.skill.slot, null);
  assert.equal(tutorMemory.inheritedSkillMemoryId, 'SK_DARK_02');
}

function breedingContract(module) {
  const holder = fireHolder();
  const partner = darkPartner();
  const state = {
    collection: [holder, partner],
    storage: [holder.instanceId, partner.instanceId],
    eggs: [],
  };
  const command = {
    eggId: EGG_ID,
    eggHolderOwnedMonsterId: holder.instanceId,
    partnerOwnedMonsterId: partner.instanceId,
    genderSeed: 7,
    inheritedSkillMemoryId: 'SK_DARK_02',
    now: NOW,
  };
  const created = module.createStandardBreedingEggTransaction(state, command);
  assert.equal(created.ok, true, created.reason);
  assert.equal(created.egg.inheritedSkillMemoryId, 'SK_DARK_02');
  assert.equal(module.validateWorkbookEgg({ ...created.egg, inheritedSkillMemoryId: 'SK_FIRE_06' }).ok, false);
  assert.equal(module.createStandardBreedingEggTransaction(created.state, command).replay, true);
  const tamperedReplayState = {
    ...created.state,
    eggs: [{ ...created.egg, inheritedSkillMemoryId: 'SK_DARK_01' }],
  };
  assert.equal(module.validateWorkbookEgg(tamperedReplayState.eggs[0]).ok, true);
  assert.equal(module.createStandardBreedingEggTransaction(tamperedReplayState, command).reason, 'egg_id_conflict');
  assert.equal(module.createStandardBreedingEggTransaction(created.state, {
    ...command,
    inheritedSkillMemoryId: 'SK_NORMAL_05',
  }).reason, 'egg_id_conflict');
  const parentsUnavailable = { ...created.state, collection: [] };
  assert.equal(module.createStandardBreedingEggTransaction(parentsUnavailable, command).replay, true);
  assert.equal(module.createStandardBreedingEggTransaction(parentsUnavailable, {
    ...command,
    inheritedSkillMemoryId: 'SK_NORMAL_05',
  }).reason, 'egg_id_conflict');

  const invalidCommand = {
    ...command,
    eggId: INVALID_MEMORY_EGG_ID,
    inheritedSkillMemoryId: 'SK_DARK_05',
  };
  const invalidInitial = {
    collection: [holder, partner],
    storage: [holder.instanceId, partner.instanceId],
    eggs: [],
    breedingSkillMemoryRequestByEggId: {},
  };
  const invalid = module.createStandardBreedingEggTransaction(invalidInitial, invalidCommand);
  assert.equal(invalid.ok, true, invalid.reason);
  assert.equal(invalid.egg.inheritedSkillMemoryId, null);
  assert.equal(module.createStandardBreedingEggTransaction(invalid.state, invalidCommand).replay, true);
  assert.equal(module.createStandardBreedingEggTransaction(invalid.state, {
    ...invalidCommand,
    inheritedSkillMemoryId: null,
  }).reason, 'egg_id_conflict');
  assert.equal(module.createStandardBreedingEggTransaction(invalid.state, {
    ...invalidCommand,
    inheritedSkillMemoryId: 'SK_NORMAL_05',
  }).reason, 'egg_id_conflict');
  const liveInvalidState = {
    ...invalidInitial,
    collection: invalid.state.collection,
    eggs: invalid.state.eggs,
  };
  assert.equal(module.applyBreedingSkillMemoryRequestLedger(liveInvalidState, invalid.state), true);
  const invalidParentsUnavailable = { ...liveInvalidState, collection: [] };
  assert.equal(module.createStandardBreedingEggTransaction(invalidParentsUnavailable, invalidCommand).replay, true);
  assert.equal(module.createStandardBreedingEggTransaction(invalidParentsUnavailable, {
    ...invalidCommand,
    inheritedSkillMemoryId: null,
  }).reason, 'egg_id_conflict');
  assert.equal(module.createStandardBreedingEggTransaction(
    JSON.parse(JSON.stringify(invalidParentsUnavailable)),
    invalidCommand,
  ).replay, true);
  const oldSaveWithoutLedger = { ...created.state };
  delete oldSaveWithoutLedger.breedingSkillMemoryRequestByEggId;
  const legacyLiveState = { breedingSkillMemoryRequestByEggId: { stale: null } };
  assert.equal(module.applyBreedingSkillMemoryRequestLedger(legacyLiveState, oldSaveWithoutLedger), true);
  assert.deepEqual(legacyLiveState.breedingSkillMemoryRequestByEggId, {});
  assert.equal(module.createStandardBreedingEggTransaction({
    ...invalidParentsUnavailable,
    breedingSkillMemoryRequestByEggId: 'malformed',
  }, invalidCommand).reason, 'invalid_state');
  assert.equal(module.createStandardBreedingEggTransaction({
    ...invalidParentsUnavailable,
    breedingSkillMemoryRequestByEggId: {
      ...invalidParentsUnavailable.breedingSkillMemoryRequestByEggId,
      [INVALID_MEMORY_EGG_ID]: 42,
    },
  }, invalidCommand).reason, 'egg_id_conflict');

  const nullCommand = {
    ...command,
    eggId: NULL_MEMORY_EGG_ID,
    inheritedSkillMemoryId: null,
  };
  const nullCreated = module.createStandardBreedingEggTransaction({
    collection: [holder, partner],
    storage: [holder.instanceId, partner.instanceId],
    eggs: [],
  }, nullCommand);
  assert.equal(nullCreated.ok, true, nullCreated.reason);
  assert.equal(module.createStandardBreedingEggTransaction(nullCreated.state, {
    ...nullCommand,
    inheritedSkillMemoryId: 'SK_DARK_05',
  }).reason, 'egg_id_conflict');

  const hatched = module.hatchBreedingEggTransaction(created.state, { eggId: EGG_ID, now: created.egg.hatchAt });
  assert.equal(hatched.ok, true, hatched.reason);
  assert.equal(hatched.child.inheritedSkillMemoryId, 'SK_DARK_02');
  assert.deepEqual(hatched.child.skills, []);
  const tampered = {
    ...hatched.state,
    collection: hatched.state.collection.map(monster => monster.instanceId === hatched.child.instanceId
      ? { ...monster, inheritedSkillMemoryId: 'SK_NORMAL_05' }
      : monster),
  };
  assert.equal(module.hatchBreedingEggTransaction(tampered, { eggId: EGG_ID, now: created.egg.hatchAt + 1 }).reason, 'hatch_state_conflict');
}

progressionContract(await loadSource(progressionSource, 'skill-progression', 'current'));
breedingContract(await loadSource(breedingSource, 'breeding', 'current'));

const progressionMutants = [
  ['allow Ultimate', "if (definition.category === 'Ultimate') {", "if (false) {"],
  ['allow RareManual', "if (entry.method === 'RareManual') {", "if (false) {"],
  ['BreedingCandidate-only family', "if (!SKILL_MEMORY_METHOD_SET.has(entry.method)) {", "if (entry.method !== 'BreedingCandidate') {"],
  ['trust unowned partner skill', 'if (!getSkill(partner, skillId)) {', 'if (false) {'],
  ['allow Deferred partner entry', "if (entry.state === 'Deferred') {\n    return skillMemoryResult(false, 'partner_entry_deferred'", "if (false) {\n    return skillMemoryResult(false, 'partner_entry_deferred'"],
  ['skip partner Stage2', 'if (!stage.ok || !stage.stage2 || entry.stage > 2 || entry.requiredStage > 2) {', 'if (false) {'],
  ['skip partner level', 'if (level < entry.learnLevel) {', 'if (false) {'],
  ['skip partner secondary', "if (entry.requiredRuntimeSecondaryType\n    && partner?.secondaryType !== entry.requiredRuntimeSecondaryType) {", 'if (false) {'],
  ['skip partner bond', 'if (bond < entry.requiredBond) {', 'if (false) {'],
  ['use Partner family as target', 'resolveFamilySkillMemoryTarget(eggHolder?.speciesId, skillId);', 'resolveFamilySkillMemoryTarget(partner?.speciesId, skillId);'],
  ['use Egg Holder as source', 'resolvePartnerSkillMemoryEntry(partner, skillId);', 'resolvePartnerSkillMemoryEntry(eggHolder, skillId);'],
  ['disable candidate dedupe', 'if (!skillId || seen.has(skillId)) continue;', 'if (!skillId) continue;'],
  ['reverse curated preference', 'Number(right.preferred) - Number(left.preferred)', 'Number(left.preferred) - Number(right.preferred)'],
  ['ordinary Stage2 exposes DataReady reason', "if (entry.state !== 'Active') reason = 'deferred';", "if (entry.state === 'Deferred') reason = 'deferred';"],
  ['LevelUp memory bypasses LearnLevel', "const bypassLearnLevel = target.method === 'SecondaryLevel'\n    || target.method === 'BreedingCandidate';", 'const bypassLearnLevel = true;'],
  ['SecondaryLevel must wait LearnLevel', "const bypassLearnLevel = target.method === 'SecondaryLevel'\n    || target.method === 'BreedingCandidate';", "const bypassLearnLevel = target.method === 'BreedingCandidate';"],
  ['skip memory stage', 'if (stageNumber < requiredStage) {', 'if (false) {'],
  ['skip memory secondary', "if (target.entry.requiredRuntimeSecondaryType\n    && instance?.secondaryType !== target.entry.requiredRuntimeSecondaryType) {", 'if (false) {'],
  ['skip memory bond', 'if (bond < target.entry.requiredBond) {', 'if (false) {'],
  ['auto-equip learned memory', "learnSkill(instance, { skillId: eligibility.skillId, slot: null });", "learnSkill(instance, { skillId: eligibility.skillId, slot: 's1' });"],
];

for (const [name, before, after] of progressionMutants) {
  const source = progressionSource.replace(before, after);
  assert.notEqual(source, progressionSource, `${name} mutation must alter source`);
  let killed = false;
  try {
    progressionContract(await loadSource(source, 'skill-progression', `mutant-${name.replaceAll(' ', '-')}`));
  } catch {
    killed = true;
  }
  assert.equal(killed, true, `${name} must be killed`);
}

const breedingMutants = [
  ['drop selected memory at create', 'inheritedSkillMemoryId: skillMemory.inheritedSkillMemoryId,', 'inheritedSkillMemoryId: null,'],
  ['ignore memory in replay snapshot', '&& (egg.inheritedSkillMemoryId ?? null) === skillMemory.inheritedSkillMemoryId', '&& true'],
  ['accept invalid family memory in schema', 'if (!memoryTarget.ok) {', 'if (false) {'],
  ['store canonical output instead of caller request', '[SKILL_MEMORY_REQUEST_LEDGER_FIELD]: appendSkillMemoryRequest(requestLedgerSnapshot.ledger, eggId, requestedSkillMemoryId),', '[SKILL_MEMORY_REQUEST_LEDGER_FIELD]: appendSkillMemoryRequest(requestLedgerSnapshot.ledger, eggId, skillMemory.inheritedSkillMemoryId),'],
  ['ignore exact caller request identity', '&& requestSnapshot.skillId === requestedSkillMemoryId', '&& true'],
  ['drop source ledger at live boundary', "const sourceLedger = sourceHasLedger ? sourceState[SKILL_MEMORY_REQUEST_LEDGER_FIELD] : {};", 'const sourceLedger = {};'],
  ['retain stale ledger for pre-A33 load', "const sourceLedger = sourceHasLedger ? sourceState[SKILL_MEMORY_REQUEST_LEDGER_FIELD] : {};", 'const sourceLedger = sourceHasLedger ? sourceState[SKILL_MEMORY_REQUEST_LEDGER_FIELD] : targetState[SKILL_MEMORY_REQUEST_LEDGER_FIELD];'],
  ['accept malformed ledger root', "if (!requestLedgerSnapshot.ok) return transactionResult(false, 'invalid_state', state);", "if (false) return transactionResult(false, 'invalid_state', state);"],
  ['drop memory at hatch', 'inheritedSkillMemoryId: egg.inheritedSkillMemoryId ?? null,', 'inheritedSkillMemoryId: null,'],
  ['ignore hatched child memory mismatch', "const childSnapshotMatches = childMatches\n      && (child.inheritedSkillMemoryId ?? null) === (egg.inheritedSkillMemoryId ?? null);", 'const childSnapshotMatches = childMatches;'],
];

for (const [name, before, after] of breedingMutants) {
  const source = breedingSource.replace(before, after);
  assert.notEqual(source, breedingSource, `${name} mutation must alter source`);
  let killed = false;
  try {
    breedingContract(await loadSource(source, 'breeding', `mutant-${name.replaceAll(' ', '-')}`));
  } catch {
    killed = true;
  }
  assert.equal(killed, true, `${name} must be killed`);
}

console.log(`V8.1 A33 Skill Memory mutants: PASS (${progressionMutants.length + breedingMutants.length}/${progressionMutants.length + breedingMutants.length} killed)`);
