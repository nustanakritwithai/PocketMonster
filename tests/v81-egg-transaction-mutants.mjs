import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceUrl = new URL('../breeding.mjs', import.meta.url);
const originalSource = fs.readFileSync(sourceUrl, 'utf8');
const NOW = 1_700_000_000_000;
const EGG_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_ID = 'c43badb8-95db-5851-85cc-c33080a2c32a';
const CASE_UUID = 'abcdefab-cdef-4abc-8def-abcdefabcdef';

async function loadSource(source, tag) {
  const withAbsoluteImports = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${withAbsoluteImports}\n//# sourceURL=${tag}`).toString('base64')}`);
}

function parent(instanceId, speciesId, formId, gender, potential) {
  return {
    instanceId,
    speciesId,
    formId,
    gender,
    level: 20,
    mind: { bond: 50 },
    potential,
    breedingCooldownUntil: null,
    parents: { a: null, b: null },
  };
}

function transactionContract(module) {
  assert.equal(module.BREEDING_VERSION, 'BRD_v1.0');
  assert.equal(module.PARENT_BREEDING_COOLDOWN_MS, 1_800_000);
  assert.equal(module.resolveGenderFromSeed('Genderless', 0), 'Genderless');
  assert.equal(module.resolveGenderFromSeed('50M/50F', 49), 'Male');
  assert.equal(module.resolveGenderFromSeed('50M/50F', 50), 'Female');
  assert.equal(module.resolveGenderFromSeed('75M/25F', 74), 'Male');
  assert.equal(module.resolveGenderFromSeed('75M/25F', 75), 'Female');
  assert.equal(module.resolveGenderFromSeed('25M/75F', 24), 'Male');
  assert.equal(module.resolveGenderFromSeed('25M/75F', 25), 'Female');
  assert.equal(module.resolveGenderFromSeed('50M/50F', -1), 'Female');
  const holder = parent(
    'holder-owned',
    'flameling',
    'MON_020',
    'Female',
    { hp: 31, atk: 30, def: 29, spAtk: 28, spDef: 27, spd: 26 },
  );
  holder.secondaryType = 'Dragon';
  const partner = parent(
    'partner-owned',
    'normalooze',
    'MON_019',
    'Male',
    { hp: 1, atk: 2, def: 3, spAtk: 4, spDef: 5, spd: 6 },
  );
  const alternate = parent(
    'alternate-owned',
    'mossbun',
    'MON_022',
    'Male',
    { hp: 7, atk: 8, def: 9, spAtk: 10, spDef: 11, spd: 12 },
  );
  const state = {
    collection: [holder, partner, alternate],
    storage: [holder.instanceId, partner.instanceId, alternate.instanceId],
    eggs: [],
  };
  const command = {
    eggId: EGG_ID,
    eggHolderOwnedMonsterId: holder.instanceId,
    partnerOwnedMonsterId: partner.instanceId,
    genderSeed: 7,
    now: NOW,
  };

  const invalidEggRoot = { ...state, eggs: { legacy: 'must-preserve' } };
  const invalidEggRootResult = module.createStandardBreedingEggTransaction(invalidEggRoot, command);
  assert.equal(invalidEggRootResult.reason, 'invalid_state');
  assert.equal(invalidEggRootResult.state, invalidEggRoot);
  assert.equal(module.createStandardBreedingEggTransaction(state, { ...command, eggId: 'not-a-uuid' }).reason, 'invalid_state');
  assert.equal(module.createStandardBreedingEggTransaction(state, { ...command, eggId: CASE_UUID.toUpperCase() }).reason, 'invalid_state');
  const created = module.createStandardBreedingEggTransaction(state, command);
  assert.equal(created.ok, true, created.reason);
  assert.equal(created.state.eggs.length, 1);
  assert.equal(created.egg.childMonsterId, 'MON_002');
  assert.equal(created.egg.hatchAt, NOW + 900_000);
  assert.equal(created.egg.recipeId, null);
  assert.equal(created.egg.hatchedOwnedMonsterId, null);
  assert.equal(created.egg.secondaryAffinity, 'Dragon');
  assert.deepEqual(created.egg.potentialInheritedStats, ['spAtk', 'spDef', 'def']);
  assert.deepEqual(created.egg.potentialValues, { hp: 25, atk: 0, def: 3, spAtk: 28, spDef: 27, spd: 14 });
  assert.equal(module.validateWorkbookEgg({ ...created.egg, secondaryAffinity: 'BogusType' }).ok, false);
  assert.equal(module.validateWorkbookEgg({ ...created.egg, hatchAt: created.egg.createdAt + 1 }).ok, false);
  assert.equal(module.validateWorkbookEgg({ ...created.egg, childMonsterId: 'MON_999', secondaryAffinity: null }).ok, false);
  assert.equal(module.validateWorkbookEgg({ ...created.egg, childMonsterId: 'MON_017', secondaryAffinity: null }).ok, false);
  assert.equal(module.validateWorkbookEgg({ ...created.egg, eggId: CASE_UUID.toUpperCase() }).ok, false);
  assert.equal(module.hatchedOwnedMonsterIdForEgg(CASE_UUID.toUpperCase()), null);
  assert.equal(created.state.collection.find(monster => monster.instanceId === holder.instanceId).breedingCooldownUntil, NOW + 1_800_000);
  assert.equal(created.state.collection.find(monster => monster.instanceId === partner.instanceId).breedingCooldownUntil, NOW + 1_800_000);
  assert.equal(created.state.collection.find(monster => monster.instanceId === holder.instanceId).mind.bond, 50);
  assert.equal(created.state.collection.find(monster => monster.instanceId === partner.instanceId).mind.bond, 50);
  const optionalEggFields = ['secondaryAffinity', 'inheritedSkillMemoryId', 'recipeId', 'hatchedOwnedMonsterId'];
  const omittedOptionalEgg = { ...created.egg };
  for (const field of optionalEggFields) delete omittedOptionalEgg[field];
  assert.equal(module.validateWorkbookEgg(omittedOptionalEgg).ok, true);
  const defaultedOptionalEgg = module.normalizeEggsForPersistence([omittedOptionalEgg])[0];
  for (const field of optionalEggFields) assert.equal(defaultedOptionalEgg[field], null);

  const replay = module.createStandardBreedingEggTransaction(created.state, command);
  assert.equal(replay.ok, true);
  assert.equal(replay.replay, true);
  assert.equal(replay.state, created.state);
  assert.equal(replay.state.eggs.length, 1);
  const parentsRemovedAfterCreate = {
    ...created.state,
    collection: created.state.collection.filter(monster => ![holder.instanceId, partner.instanceId].includes(monster.instanceId)),
  };
  const replayWithoutParents = module.createStandardBreedingEggTransaction(parentsRemovedAfterCreate, command);
  assert.equal(replayWithoutParents.ok, true);
  assert.equal(replayWithoutParents.replay, true);
  assert.equal(replayWithoutParents.state, parentsRemovedAfterCreate);
  assert.equal(
    module.createStandardBreedingEggTransaction(parentsRemovedAfterCreate, { ...command, now: NOW + 1 }).reason,
    'egg_id_conflict',
  );
  const oneParentMissing = {
    ...created.state,
    collection: created.state.collection.filter(monster => monster.instanceId !== partner.instanceId),
  };
  assert.equal(module.createStandardBreedingEggTransaction(oneParentMissing, command).reason, 'egg_id_conflict');
  assert.equal(module.createStandardBreedingEggTransaction(created.state, { ...command, genderSeed: 8 }).reason, 'egg_id_conflict');
  assert.equal(module.createStandardBreedingEggTransaction(created.state, { ...command, now: NOW + 1 }).reason, 'egg_id_conflict');
  const corruptReplayState = { ...created.state, eggs: [{ ...created.egg, hatchAt: created.egg.createdAt + 1 }] };
  assert.equal(module.createStandardBreedingEggTransaction(corruptReplayState, command).reason, 'egg_id_conflict');
  const derivedFieldReplayState = { ...created.state, eggs: [{ ...created.egg, isReadyToHatch: false }] };
  assert.equal(module.createStandardBreedingEggTransaction(derivedFieldReplayState, command).reason, 'egg_id_conflict');
  for (const tamperedEgg of [
    { ...created.egg, childMonsterId: 'MON_009' },
    { ...created.egg, potentialValues: { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 } },
  ]) {
    assert.equal(module.validateWorkbookEgg(tamperedEgg).ok, true);
    assert.equal(
      module.createStandardBreedingEggTransaction({ ...created.state, eggs: [tamperedEgg] }, command).reason,
      'egg_id_conflict',
    );
  }
  const conflict = module.createStandardBreedingEggTransaction(created.state, {
    ...command,
    partnerOwnedMonsterId: alternate.instanceId,
  });
  assert.equal(conflict.reason, 'egg_id_conflict');

  assert.equal(module.isEggReadyToHatch(created.egg, created.egg.hatchAt - 1), false);
  assert.equal(module.isEggReadyToHatch(created.egg, created.egg.hatchAt), true);
  assert.equal(module.hatchedOwnedMonsterIdForEgg(EGG_ID), CHILD_ID);
  const notReady = module.hatchBreedingEggTransaction(created.state, { eggId: EGG_ID, now: created.egg.hatchAt - 1 });
  assert.equal(notReady.reason, 'egg_not_ready');
  const omittedOptionalHatch = module.hatchBreedingEggTransaction(
    { ...created.state, eggs: [omittedOptionalEgg] },
    { eggId: EGG_ID, now: created.egg.hatchAt },
  );
  assert.equal(omittedOptionalHatch.ok, true, omittedOptionalHatch.reason);
  for (const field of optionalEggFields.slice(0, 3)) assert.equal(omittedOptionalHatch.egg[field], null);
  assert.equal(omittedOptionalHatch.child.inheritedSkillMemoryId, null);
  const invalidStorageRoot = { ...created.state, storage: { legacy: 'must-preserve' } };
  const invalidStorageRootResult = module.hatchBreedingEggTransaction(invalidStorageRoot, { eggId: EGG_ID, now: created.egg.hatchAt });
  assert.equal(invalidStorageRootResult.reason, 'invalid_state');
  assert.equal(invalidStorageRootResult.state, invalidStorageRoot);
  for (const invalidChildMonsterId of ['MON_999', 'MON_017']) {
    const invalidChildState = { ...created.state, eggs: [{ ...created.egg, childMonsterId: invalidChildMonsterId, secondaryAffinity: null }] };
    assert.equal(
      module.hatchBreedingEggTransaction(invalidChildState, { eggId: EGG_ID, now: created.egg.hatchAt }).reason,
      'child_species_unresolved',
    );
  }

  const orphanState = {
    ...created.state,
    collection: created.state.collection.filter(monster => monster.instanceId === alternate.instanceId),
    storage: [alternate.instanceId],
  };
  const hatched = module.hatchBreedingEggTransaction(orphanState, { eggId: EGG_ID, now: created.egg.hatchAt });
  assert.equal(hatched.ok, true, hatched.reason);
  assert.equal(hatched.state.eggs.length, 1);
  assert.equal(hatched.state.eggs[0].hatchedOwnedMonsterId, CHILD_ID);
  assert.equal(hatched.state.collection.filter(monster => monster.instanceId === CHILD_ID).length, 1);
  assert.equal(hatched.state.storage.filter(id => id === CHILD_ID).length, 1);
  assert.equal(hatched.child.speciesId, 'flameling');
  assert.equal(hatched.child.formId, 'flameling');
  assert.equal(hatched.child.level, 1);
  assert.equal(hatched.child.mind.bond, 10);
  assert.equal(hatched.child.secondaryType, null);
  assert.equal(hatched.child.gender, 'Male');
  assert.deepEqual(hatched.child.potential, created.egg.potentialValues);
  assert.deepEqual(hatched.child.parents, { a: holder.instanceId, b: partner.instanceId });
  const second = module.hatchBreedingEggTransaction(hatched.state, { eggId: EGG_ID, now: created.egg.hatchAt + 1 });
  assert.equal(second.reason, 'egg_already_hatched');

  const markerConflictState = {
    ...hatched.state,
    collection: hatched.state.collection.filter(monster => monster.instanceId !== CHILD_ID),
    storage: hatched.state.storage.filter(id => id !== CHILD_ID),
  };
  assert.equal(
    module.hatchBreedingEggTransaction(markerConflictState, { eggId: EGG_ID, now: created.egg.hatchAt + 1 }).reason,
    'hatch_state_conflict',
  );
  const childMovedToPartyState = {
    ...hatched.state,
    party: [CHILD_ID, null, null],
    storage: hatched.state.storage.filter(id => id !== CHILD_ID),
  };
  assert.equal(
    module.hatchBreedingEggTransaction(childMovedToPartyState, { eggId: EGG_ID, now: created.egg.hatchAt + 1 }).reason,
    'egg_already_hatched',
  );
  const wrongMarkerEgg = { ...created.egg, hatchedOwnedMonsterId: CASE_UUID };
  assert.equal(module.validateWorkbookEgg(wrongMarkerEgg).ok, false);
  assert.equal(
    module.hatchBreedingEggTransaction({
      ...created.state,
      collection: [...created.state.collection, { instanceId: CASE_UUID, speciesId: 'aquapuff' }],
      eggs: [wrongMarkerEgg],
    }, { eggId: EGG_ID, now: created.egg.hatchAt }).reason,
    'hatch_state_conflict',
  );
  for (const wrongChild of [
    { ...hatched.child, speciesId: 'aquapuff' },
    { ...hatched.child, parents: { a: 'wrong-holder', b: partner.instanceId } },
    { ...hatched.child, potential: { ...hatched.child.potential, hp: hatched.child.potential.hp === 31 ? 30 : 31 } },
  ]) {
    const wrongChildState = {
      ...hatched.state,
      collection: hatched.state.collection.map(monster => monster.instanceId === CHILD_ID ? wrongChild : monster),
    };
    assert.equal(
      module.hatchBreedingEggTransaction(wrongChildState, { eggId: EGG_ID, now: created.egg.hatchAt + 1 }).reason,
      'hatch_state_conflict',
    );
  }
  const collisionState = {
    ...orphanState,
    collection: [...orphanState.collection, { instanceId: CHILD_ID }],
  };
  assert.equal(
    module.hatchBreedingEggTransaction(collisionState, { eggId: EGG_ID, now: created.egg.hatchAt }).reason,
    'hatch_owned_id_conflict',
  );

  const legacyRecords = [
    null,
    'opaque-legacy-record',
    [],
    { eggId: 'legacy', readyAt: NOW, isReadyToHatch: true, potentialValues: [1, 2, 3] },
  ];
  assert.deepEqual(module.normalizeEggsForPersistence(legacyRecords), [
    null,
    'opaque-legacy-record',
    [],
    { eggId: 'legacy', readyAt: NOW, potentialValues: [1, 2, 3] },
  ]);
}

transactionContract(await loadSource(originalSource, 'egg-transaction-current'));

const mutants = [
  ['short parent cooldown', 'export const PARENT_BREEDING_COOLDOWN_MS = 30 * 60 * 1000;', 'export const PARENT_BREEDING_COOLDOWN_MS = 29 * 60 * 1000;'],
  ['long hatch duration', 'hatchTimeMin: 15,', 'hatchTimeMin: 16,'],
  ['wrong hatch bond', 'baseBond: 10,', 'baseBond: 11,'],
  ['include gender boundary in Male bucket', "return roll < Number(match[1]) ? 'Male' : 'Female';", "return roll <= Number(match[1]) ? 'Male' : 'Female';"],
  ['skip negative gender normalization', 'const roll = ((seed % 100) + 100) % 100;', 'const roll = seed % 100;'],
  ['wrong child family', 'const holderProfile = workbookBreedingProfile(eggHolder.speciesId);', 'const holderProfile = workbookBreedingProfile(partner.speciesId);'],
  ['seed inheritance from gender roll', 'resolvePotentialInheritance(eggHolder, partner, { seed: eggId });', 'resolvePotentialInheritance(eggHolder, partner, { seed: genderSeed });'],
  ['append two eggs', 'eggs: [...(Array.isArray(state.eggs) ? state.eggs : []), egg],', 'eggs: [...(Array.isArray(state.eggs) ? state.eggs : []), egg, egg],'],
  ['cool down neither parent', 'monster.instanceId === eggHolderOwnedMonsterId || monster.instanceId === partnerOwnedMonsterId', 'monster.instanceId === eggHolderOwnedMonsterId && monster.instanceId === partnerOwnedMonsterId'],
  ['cool down holder only', 'monster.instanceId === eggHolderOwnedMonsterId || monster.instanceId === partnerOwnedMonsterId', 'monster.instanceId === eggHolderOwnedMonsterId'],
  ['break exact replay', "return transactionResult(true, null, state, { egg: existing, replay: true });", "return transactionResult(false, 'egg_id_conflict', state);"],
  ['skip replay schema validation', 'if (existing && validateWorkbookEgg(existing).ok', 'if (existing'],
  ['trust schema-only replay snapshot', 'if (!eggHolder || !partner) return false;', 'return true;'],
  ['ignore replay child family', '&& egg.childMonsterId === holderProfile.childMonsterId', '&& true'],
  ['ignore replay Potential snapshot', '&& samePotential(egg.potentialValues, inheritance.potential)', '&& true'],
  ['ignore replay gender seed', '&& existing.genderSeed === genderSeed', '&& true'],
  ['ignore replay creation time', '&& existing.createdAt === now', '&& true'],
  ['trust replay with one missing parent', 'replayHolders.length === 0 && replayPartners.length === 0', 'replayHolders.length === 0 || replayPartners.length === 0'],
  ['allow UUID-less create', "|| !Number.isSafeInteger(now) || !UUID_PATTERN.test(eggId ?? '')", '|| !Number.isSafeInteger(now)'],
  ['allow malformed egg root on create', ' || !Array.isArray(state.eggs)', ''],
  ['allow uppercase UUID aliases', "const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;", "const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;"],
  ['exclude hatch boundary', 'return Number.isFinite(now) && Number.isSafeInteger(egg?.hatchAt) && now >= egg.hatchAt;', 'return Number.isFinite(now) && Number.isSafeInteger(egg?.hatchAt) && now > egg.hatchAt;'],
  ['change deterministic child namespace', 'A32-hatched-owned-monster:', 'A32-mutated-owned-monster:'],
  ['drop hatch ledger marker', 'record === egg ? markedEgg : record', 'record'],
  ['delete hatch ledger', 'eggs: state.eggs.map(record => record === egg ? markedEgg : record),', 'eggs: [],'],
  ['reroll hatch potential', 'potential: egg.potentialValues,', 'potential: {},'],
  ['activate Stage1 affinity', 'secondaryType: null,', 'secondaryType: egg.secondaryAffinity,'],
  ['wrong base Bond application', 'mind: { bond: profile.baseBond },', 'mind: { bond: 24 },'],
  ['lose partner parentage', 'parents: { a: egg.eggHolderOwnedMonsterId, b: egg.partnerOwnedMonsterId },', 'parents: { a: egg.eggHolderOwnedMonsterId, b: null },'],
  ['disable already-hatched guard', "if (egg.hatchedOwnedMonsterId != null) {\n    const hatchedMatches", "if (false) {\n    const hatchedMatches"],
  ['accept arbitrary hatch marker UUID', "} else if (egg.hatchedOwnedMonsterId !== hatchedOwnedMonsterIdForEgg(egg.eggId)) {", '} else if (false) {'],
  ['ignore marked child species', '&& child.speciesId === profile.runtimeSpeciesId', '&& true'],
  ['ignore marked child parentage', '&& child.parents?.a === egg.eggHolderOwnedMonsterId', '&& true'],
  ['ignore marked child Potential', '&& samePotential(child.potential, egg.potentialValues);', '&& true;'],
  ['disable child ID collision guard', 'if (state.collection.some(monster => monster?.instanceId === instanceId)) {', 'if (false && state.collection.some(monster => monster?.instanceId === instanceId)) {'],
  ['allow malformed Storage root on hatch', '|| !Array.isArray(state.storage) || !Array.isArray(state.eggs)', '|| !Array.isArray(state.eggs)'],
  ['persist derived readiness', 'delete egg.isReadyToHatch;', '// derived readiness leaked'],
  ['accept affinity outside workbook pool', "if (!nonEmptyString(egg.secondaryAffinity) || (profile && !affinity?.ok)) {", 'if (!nonEmptyString(egg.secondaryAffinity)) {'],
  ['require explicit optional affinity', 'if (egg.secondaryAffinity != null) {', 'if (egg.secondaryAffinity !== null) {'],
  ['require explicit optional Skill Memory', 'if (egg.inheritedSkillMemoryId != null &&', 'if (egg.inheritedSkillMemoryId !== null &&'],
  ['require explicit optional recipe', 'if (egg.recipeId != null)', 'if (egg.recipeId !== null)'],
  ['require explicit optional hatch marker', "if (egg.hatchedOwnedMonsterId != null) {\n    if (!UUID_PATTERN", "if (egg.hatchedOwnedMonsterId !== null) {\n    if (!UUID_PATTERN"],
  ['drop workbook optional null defaults', 'if (record.breedingVersion === BREEDING_VERSION) {', 'if (false) {'],
  ['accept shifted hatch deadline', "if (hatchProfile && Number.isSafeInteger(egg.createdAt)\n    && egg.hatchAt !== egg.createdAt + hatchProfile.hatchTimeMin * 60 * 1000) {", 'if (false) {'],
  ['accept unresolved or RecipeOnly child', "if (!childProfile || childProfile.breedingEligibility !== 'Yes') {", 'if (false) {'],
  ['discard malformed legacy records', "if (!record || typeof record !== 'object' || Array.isArray(record)) return record;", "if (!record || typeof record !== 'object' || Array.isArray(record)) return null;"],
  ['spread opaque legacy Potential arrays', "&& !Array.isArray(record.potentialValues)) {", ') {'],
  ['stamp recipe into standard egg', 'recipeId: null,', "recipeId: 'REC_MUTANT',"],
  ['pre-mark new egg as hatched', 'hatchedOwnedMonsterId: null,', `hatchedOwnedMonsterId: '${CHILD_ID}',`],
];

for (const [name, before, after] of mutants) {
  const source = originalSource.replace(before, after);
  assert.notEqual(source, originalSource, `${name} mutation must alter source`);
  let killed = false;
  try {
    transactionContract(await loadSource(source, `egg-transaction-mutant-${name.replaceAll(' ', '-')}`));
  } catch {
    killed = true;
  }
  assert.equal(killed, true, `${name} must be killed`);
}

console.log(`V8.1 A32 egg transaction mutants: PASS (${mutants.length}/${mutants.length} killed)`);
