import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { LEARNSET_CATALOG } from '../learnset-catalog.mjs';
import { MONSTER_CATALOG } from '../monster-catalog.mjs';
import { SKILL_CATALOG } from '../skill-catalog.mjs';
import {
  BUILD_PRESET_CATALOG,
  BUILD_PRESET_POLICY,
  buildPreset,
  buildPresetsForMonster,
  buildPresetsForRuntimeSpecies,
  validateBuildPresetCatalog,
} from '../build-preset-catalog.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function rawRows(records = BUILD_PRESET_CATALOG) {
  return records.map(record => [
    record.monsterId,
    record.monsterNameTH,
    record.presetName,
    record.role,
    ...record.skillIds,
    record.usage,
  ]);
}

function cloneCatalog() {
  return BUILD_PRESET_CATALOG.map(record => ({ ...record, skillIds: [...record.skillIds] }));
}

function hasIssue(result, code) {
  return result.issues.some(issue => issue.code === code);
}

function assertDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

assert.deepEqual(BUILD_PRESET_POLICY.authorityRanges, ['Build_Presets!A1:I55']);
assert.equal(BUILD_PRESET_POLICY.rowCount, 54);
assert.equal(BUILD_PRESET_POLICY.skillReferenceCount, 216);
assert.equal(BUILD_PRESET_POLICY.uniqueMonsterIdCount, 36);
assert.equal(BUILD_PRESET_POLICY.uniqueSkillIdCount, 108);
assert.equal(BUILD_PRESET_POLICY.manualSlotCount, 4);
assert.deepEqual(BUILD_PRESET_POLICY.presetCounts, { Field: 36, Advanced: 18 });
assert.equal(BUILD_PRESET_POLICY.normalizedRowDigest, '51e219b8038eea12293880a4f2eb1a6f99530b374425995743d7905bc5d90df5');
assert.equal(BUILD_PRESET_POLICY.skillReferenceDigest, '9db43b385aac02de40710680d613ae664766004dfad4d77bdad2a2fa47a05bbe');
assert.equal(BUILD_PRESET_POLICY.presetKeyDigest, 'b3d47a4a33e6f2018b414e1de45d4ec2ca2b8717cbc800d958d9258930ed8e93');
assert.equal(BUILD_PRESET_POLICY.activation, 'catalog_only');
assert.equal(BUILD_PRESET_POLICY.behavior, 'advisory');
assert.equal(BUILD_PRESET_POLICY.runtimeMutation, 'none');
assert.equal(BUILD_PRESET_POLICY.savePersistence, 'forbidden');
assert.equal(BUILD_PRESET_POLICY.characterUiIntegration, 'forbidden_A39');
assert.equal(BUILD_PRESET_POLICY.dexSemantics, 'forbidden_D14');
assert.equal(BUILD_PRESET_POLICY.sourceWorkbookSha256, 'fdda777b1cbb0eeaacb7e02ced3c1c9df1a3af2853bfdf8d1fe902370789e39c');

assert.equal(BUILD_PRESET_CATALOG.length, 54);
assert.equal(hash(rawRows()), BUILD_PRESET_POLICY.normalizedRowDigest);
assert.equal(hash(rawRows().flatMap(row => row.slice(4, 8))), BUILD_PRESET_POLICY.skillReferenceDigest);
assert.equal(hash(rawRows().map(row => [row[0], row[2]])), BUILD_PRESET_POLICY.presetKeyDigest);
assert.equal(new Set(BUILD_PRESET_CATALOG.map(record => record.monsterId)).size, 36);
assert.equal(new Set(BUILD_PRESET_CATALOG.flatMap(record => record.skillIds)).size, 108);
assert.equal(BUILD_PRESET_CATALOG.flatMap(record => record.skillIds).length, 216);
assert.equal(BUILD_PRESET_CATALOG.filter(record => record.presetName === 'Field').length, 36);
assert.equal(BUILD_PRESET_CATALOG.filter(record => record.presetName === 'Advanced').length, 18);
assert.equal(BUILD_PRESET_CATALOG.filter(record => record.stage === 1).length, 18);
assert.equal(BUILD_PRESET_CATALOG.filter(record => record.stage === 2).length, 36);
assert.equal(BUILD_PRESET_CATALOG.every(record => record.skillIds.length === 4), true);
assert.equal(BUILD_PRESET_CATALOG.every(record => new Set(record.skillIds).size === 4), true);
assertDeepFrozen(BUILD_PRESET_POLICY);
assertDeepFrozen(BUILD_PRESET_CATALOG);

const mappingByMonsterId = new Map();
for (const mapping of MONSTER_CATALOG) {
  mappingByMonsterId.set(mapping.workbookBaseMonsterId, { mapping, stage: 1 });
  mappingByMonsterId.set(mapping.workbookStage2MonsterId, { mapping, stage: 2 });
}
const skillById = new Map(SKILL_CATALOG.map(skill => [skill.id, skill]));
const learnsetByKey = new Map(LEARNSET_CATALOG.map(entry => [entry.lookupKey, entry]));
for (const [index, record] of BUILD_PRESET_CATALOG.entries()) {
  const mapped = mappingByMonsterId.get(record.monsterId);
  assert.ok(mapped, record.monsterId);
  assert.equal(record.runtimeSpeciesId, mapped.mapping.runtimeSpeciesId);
  assert.equal(record.stage, mapped.stage);
  assert.equal(record.sourceRow, index + 2);
  assert.equal(record.sourceRange, `Build_Presets!A${index + 2}:I${index + 2}`);
  assert.equal(record.presetKey, `${record.monsterId}|${record.presetName}`);
  assert.equal(record.activation, 'catalog_only');
  assert.equal(record.advisoryOnly, true);
  for (const skillId of record.skillIds) {
    assert.equal(skillById.get(skillId)?.sourceType, mapped.mapping.workbookTypeCandidate);
    assert.equal(learnsetByKey.get(`${record.monsterId}|${skillId}`)?.state, 'Active');
  }
}
assert.equal(BUILD_PRESET_CATALOG.filter(record => record.stage === 1).every(record => record.presetName === 'Field'), true);
assert.equal(BUILD_PRESET_CATALOG.filter(record => record.presetName === 'Advanced').every(record => record.stage === 2), true);
assert.equal(BUILD_PRESET_CATALOG.filter(record => record.runtimeSpeciesId === 'fairimp').every(record => record.skillIds.every(id => id.startsWith('SK_LIGHT_'))), true);

const canonicalValidation = validateBuildPresetCatalog(BUILD_PRESET_CATALOG);
assert.equal(canonicalValidation.ok, true, JSON.stringify(canonicalValidation.issues));
assert.deepEqual(canonicalValidation.issues, []);
assert.deepEqual(canonicalValidation.counts, {
  rows: 54,
  skillReferences: 216,
  uniqueMonsterIds: 36,
  uniqueSkillIds: 108,
  fieldPresets: 36,
  advancedPresets: 18,
});
assertDeepFrozen(canonicalValidation);

assert.equal(buildPreset('MON_001', 'Field')?.monsterNameTH, 'สไลม์ปกติ');
assert.equal(buildPreset('MON_019', 'Advanced')?.skillIds[3], 'SK_NORMAL_06');
assert.equal(buildPreset('MON_001', 'Advanced'), null);
assert.equal(buildPreset(' MON_001', 'Field'), null);
assert.equal(buildPreset('__proto__', 'Field'), null);
assert.equal(buildPreset(Symbol('hostile'), 'Field'), null);
assert.equal(buildPresetsForMonster('MON_001').length, 1);
assert.equal(buildPresetsForMonster('MON_019').length, 2);
assert.equal(buildPresetsForMonster('unknown').length, 0);
assert.equal(buildPresetsForRuntimeSpecies('normalooze').length, 3);
assert.equal(buildPresetsForRuntimeSpecies('unknown').length, 0);
assertDeepFrozen(buildPresetsForMonster('MON_019'));
assertDeepFrozen(buildPresetsForRuntimeSpecies('normalooze'));

const validClone = cloneCatalog();
const validBefore = structuredClone(validClone);
assert.equal(validateBuildPresetCatalog(validClone).ok, true);
assert.deepEqual(validClone, validBefore, 'validation is read-only');

const missing = cloneCatalog();
missing.pop();
assert.equal(hasIssue(validateBuildPresetCatalog(missing), 'preset_count_mismatch'), true);
assert.equal(hasIssue(validateBuildPresetCatalog(missing), 'missing_preset'), true);

const reordered = cloneCatalog();
[reordered[0], reordered[1]] = [reordered[1], reordered[0]];
assert.equal(hasIssue(validateBuildPresetCatalog(reordered), 'preset_order_mismatch'), true);

const duplicate = cloneCatalog();
duplicate[1].presetKey = duplicate[0].presetKey;
assert.equal(hasIssue(validateBuildPresetCatalog(duplicate), 'duplicate_preset_key'), true);

const changedWorkbookValue = cloneCatalog();
changedWorkbookValue[0].role = 'Mutant';
assert.equal(hasIssue(validateBuildPresetCatalog(changedWorkbookValue), 'workbook_preset_mismatch'), true);

const changedSlotOrder = cloneCatalog();
[changedSlotOrder[0].skillIds[2], changedSlotOrder[0].skillIds[3]] = [
  changedSlotOrder[0].skillIds[3], changedSlotOrder[0].skillIds[2],
];
assert.equal(hasIssue(validateBuildPresetCatalog(changedSlotOrder), 'workbook_preset_mismatch'), true);

const unknownMonster = cloneCatalog();
unknownMonster[0].monsterId = 'MON_999';
assert.equal(hasIssue(validateBuildPresetCatalog(unknownMonster), 'unknown_monster_reference'), true);

const wrongSpeciesMapping = cloneCatalog();
wrongSpeciesMapping[0].runtimeSpeciesId = 'flameling';
assert.equal(hasIssue(validateBuildPresetCatalog(wrongSpeciesMapping), 'species_mapping_mismatch'), true);

const unknownSkill = cloneCatalog();
unknownSkill[0].skillIds[0] = 'SK_UNKNOWN_99';
assert.equal(hasIssue(validateBuildPresetCatalog(unknownSkill), 'unknown_skill_reference'), true);

const missingLearnset = cloneCatalog();
missingLearnset[0].skillIds[0] = 'SK_FIRE_01';
assert.equal(hasIssue(validateBuildPresetCatalog(missingLearnset), 'unknown_learnset_reference'), true);

const inactiveLearnset = cloneCatalog();
inactiveLearnset.find(record => record.presetKey === 'MON_019|Advanced').skillIds[0] = 'SK_PSYCHIC_04';
assert.equal(hasIssue(validateBuildPresetCatalog(inactiveLearnset), 'inactive_learnset_reference'), true);

const wrongType = cloneCatalog();
wrongType.find(record => record.presetKey === 'MON_019|Advanced').skillIds[0] = 'SK_FLYING_01';
assert.equal(hasIssue(validateBuildPresetCatalog(wrongType), 'skill_type_mismatch'), true);

const wrongArity = cloneCatalog();
wrongArity[0].skillIds.pop();
assert.equal(hasIssue(validateBuildPresetCatalog(wrongArity), 'skill_slot_count_mismatch'), true);

const duplicateSkill = cloneCatalog();
duplicateSkill[0].skillIds[1] = duplicateSkill[0].skillIds[0];
assert.equal(hasIssue(validateBuildPresetCatalog(duplicateSkill), 'duplicate_preset_skill'), true);

const advancedStageOne = cloneCatalog();
advancedStageOne[0].presetName = 'Advanced';
assert.equal(hasIssue(validateBuildPresetCatalog(advancedStageOne), 'advanced_preset_requires_stage2'), true);

const scopeLeak = cloneCatalog();
scopeLeak[0].seen = true;
assert.equal(hasIssue(validateBuildPresetCatalog(scopeLeak), 'forbidden_scope_field'), true);

assert.equal(validateBuildPresetCatalog(null).ok, false);
assert.equal(validateBuildPresetCatalog({}).ok, false);
const extraRootField = cloneCatalog();
extraRootField.debug = true;
assert.equal(validateBuildPresetCatalog(extraRootField).ok, false);
class PresetArray extends Array {}
assert.equal(validateBuildPresetCatalog(PresetArray.from(cloneCatalog())).ok, false);
const sparse = cloneCatalog();
delete sparse[0];
assert.equal(validateBuildPresetCatalog(sparse).ok, false);

let rootAccessorReads = 0;
const rootAccessor = [];
Object.defineProperty(rootAccessor, '0', {
  enumerable: true,
  get() {
    rootAccessorReads += 1;
    return BUILD_PRESET_CATALOG[0];
  },
});
assert.equal(validateBuildPresetCatalog(rootAccessor).ok, false);
assert.equal(rootAccessorReads, 0);

const inheritedRecord = Object.create({ inherited: true });
Object.assign(inheritedRecord, cloneCatalog()[0]);
const inheritedCatalog = cloneCatalog();
inheritedCatalog[0] = inheritedRecord;
assert.equal(validateBuildPresetCatalog(inheritedCatalog).ok, false);

let recordAccessorReads = 0;
const accessorRecord = cloneCatalog()[0];
Object.defineProperty(accessorRecord, 'role', {
  enumerable: true,
  get() {
    recordAccessorReads += 1;
    return 'Balanced';
  },
});
const accessorCatalog = cloneCatalog();
accessorCatalog[0] = accessorRecord;
assert.equal(validateBuildPresetCatalog(accessorCatalog).ok, false);
assert.equal(recordAccessorReads, 0);

let skillAccessorReads = 0;
const accessorSkills = [...cloneCatalog()[0].skillIds];
Object.defineProperty(accessorSkills, '0', {
  enumerable: true,
  get() {
    skillAccessorReads += 1;
    return 'SK_NORMAL_01';
  },
});
const accessorSkillCatalog = cloneCatalog();
accessorSkillCatalog[0].skillIds = accessorSkills;
assert.equal(validateBuildPresetCatalog(accessorSkillCatalog).ok, false);
assert.equal(skillAccessorReads, 0);

let maskedRecordReads = 0;
const maskedRecord = new Proxy({ ...cloneCatalog()[0], role: 'Mutant' }, {
  get(target, property, receiver) {
    maskedRecordReads += 1;
    return property === 'role' ? 'Balanced' : Reflect.get(target, property, receiver);
  },
});
const maskedRecordCatalog = cloneCatalog();
maskedRecordCatalog[0] = maskedRecord;
assert.equal(hasIssue(validateBuildPresetCatalog(maskedRecordCatalog), 'workbook_preset_mismatch'), true);
assert.equal(maskedRecordReads, 0);

let maskedSkillReads = 0;
const maskedSkillIds = new Proxy(['SK_FIRE_01', ...cloneCatalog()[0].skillIds.slice(1)], {
  get(target, property, receiver) {
    maskedSkillReads += 1;
    return property === '0' ? 'SK_NORMAL_01' : Reflect.get(target, property, receiver);
  },
});
const maskedSkillCatalog = cloneCatalog();
maskedSkillCatalog[0].skillIds = maskedSkillIds;
assert.equal(hasIssue(validateBuildPresetCatalog(maskedSkillCatalog), 'unknown_learnset_reference'), true);
assert.equal(maskedSkillReads, 0);

let descriptorSpoofRecordReads = 0;
const descriptorSpoofRecordTarget = { ...cloneCatalog()[0], role: 'Mutant' };
const descriptorSpoofRecord = new Proxy(descriptorSpoofRecordTarget, {
  get(target, property, receiver) {
    descriptorSpoofRecordReads += 1;
    return Reflect.get(target, property, receiver);
  },
  getOwnPropertyDescriptor(target, property) {
    const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
    return property === 'role' ? { ...descriptor, value: 'Balanced' } : descriptor;
  },
});
const descriptorSpoofRecordCatalog = cloneCatalog();
descriptorSpoofRecordCatalog[0] = descriptorSpoofRecord;
const descriptorSpoofRecordResult = validateBuildPresetCatalog(descriptorSpoofRecordCatalog);
assert.equal(descriptorSpoofRecordResult.ok, false);
assert.equal(hasIssue(descriptorSpoofRecordResult, 'uncloneable_catalog'), true);
assert.equal(descriptorSpoofRecordTarget.role, 'Mutant');
assert.equal(descriptorSpoofRecordReads, 0);

let descriptorSpoofSkillReads = 0;
const descriptorSpoofSkillTarget = ['SK_FIRE_01', ...cloneCatalog()[0].skillIds.slice(1)];
const descriptorSpoofSkillIds = new Proxy(descriptorSpoofSkillTarget, {
  get(target, property, receiver) {
    descriptorSpoofSkillReads += 1;
    return Reflect.get(target, property, receiver);
  },
  getOwnPropertyDescriptor(target, property) {
    const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
    return property === '0' ? { ...descriptor, value: 'SK_NORMAL_01' } : descriptor;
  },
});
const descriptorSpoofSkillCatalog = cloneCatalog();
descriptorSpoofSkillCatalog[0].skillIds = descriptorSpoofSkillIds;
const descriptorSpoofSkillResult = validateBuildPresetCatalog(descriptorSpoofSkillCatalog);
assert.equal(descriptorSpoofSkillResult.ok, false);
assert.equal(hasIssue(descriptorSpoofSkillResult, 'uncloneable_catalog'), true);
assert.equal(descriptorSpoofSkillTarget[0], 'SK_FIRE_01');
assert.equal(descriptorSpoofSkillReads, 0);

const symbolFieldCatalog = cloneCatalog();
symbolFieldCatalog[0][Symbol('hostile')] = true;
assert.equal(hasIssue(validateBuildPresetCatalog(symbolFieldCatalog), 'unexpected_preset_field'), true);

const extraNestedField = cloneCatalog();
extraNestedField[0].skillIds.debug = true;
assert.equal(hasIssue(validateBuildPresetCatalog(extraNestedField), 'invalid_skill_id_list'), true);

const hostileRecord = new Proxy({}, { ownKeys() { throw new Error('hostile'); } });
assert.doesNotThrow(() => validateBuildPresetCatalog([hostileRecord]));
assert.equal(validateBuildPresetCatalog([hostileRecord]).ok, false);

const { proxy: revokedRoot, revoke } = Proxy.revocable([], {});
revoke();
assert.doesNotThrow(() => validateBuildPresetCatalog(revokedRoot));
const revokedResult = validateBuildPresetCatalog(revokedRoot);
assert.equal(revokedResult.ok, false);
assertDeepFrozen(revokedResult);

const hostileScalar = cloneCatalog();
hostileScalar[0].role = 1n;
assert.doesNotThrow(() => validateBuildPresetCatalog(hostileScalar));
assert.equal(validateBuildPresetCatalog(hostileScalar).ok, false);

const symbolicScalar = cloneCatalog();
symbolicScalar[0].monsterId = Symbol('hostile');
assert.doesNotThrow(() => validateBuildPresetCatalog(symbolicScalar));
assert.equal(validateBuildPresetCatalog(symbolicScalar).ok, false);

const cyclicSkill = cloneCatalog();
cyclicSkill[0].skillIds[0] = cyclicSkill[0].skillIds;
assert.doesNotThrow(() => validateBuildPresetCatalog(cyclicSkill));
assert.equal(validateBuildPresetCatalog(cyclicSkill).ok, false);

const source = fs.readFileSync(new URL('../build-preset-catalog.mjs', import.meta.url), 'utf8');
const importTargets = [...source.matchAll(/from '(\.\/[^']+)'/g)].map(match => match[1]);
assert.deepEqual(importTargets, [
  './content-provenance.mjs',
  './monster-catalog.mjs',
  './skill-catalog.mjs',
  './learnset-catalog.mjs',
], 'A39 imports catalogs only and does not wire save, runtime, Character UI, or Dex state');

console.log('V8.1 A39 Build Preset advisory catalog: PASS (54 rows, 216 references)');
