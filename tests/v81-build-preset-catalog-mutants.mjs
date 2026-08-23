import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const filename = 'build-preset-catalog.mjs';
const fileUrl = new URL(`../${filename}`, import.meta.url);
const source = fs.readFileSync(fileUrl, 'utf8');

async function loadSource(candidate, tag) {
  const withAbsoluteImports = candidate.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(relativePath, fileUrl).href}'`,
  );
  const encoded = Buffer.from(`${withAbsoluteImports}\n//# sourceURL=${tag}`).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function rows(module, records = module.BUILD_PRESET_CATALOG) {
  return records.map(record => [
    record.monsterId,
    record.monsterNameTH,
    record.presetName,
    record.role,
    ...record.skillIds,
    record.usage,
  ]);
}

function cloneCatalog(module) {
  return module.BUILD_PRESET_CATALOG.map(record => ({ ...record, skillIds: [...record.skillIds] }));
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

function assertContract(module) {
  const policy = module.BUILD_PRESET_POLICY;
  assert.deepEqual(policy.authorityRanges, ['Build_Presets!A1:I55']);
  assert.equal(policy.rowCount, 54);
  assert.equal(policy.skillReferenceCount, 216);
  assert.equal(policy.uniqueMonsterIdCount, 36);
  assert.equal(policy.uniqueSkillIdCount, 108);
  assert.equal(policy.manualSlotCount, 4);
  assert.deepEqual(policy.presetCounts, { Field: 36, Advanced: 18 });
  assert.equal(policy.normalizedRowDigest, '51e219b8038eea12293880a4f2eb1a6f99530b374425995743d7905bc5d90df5');
  assert.equal(policy.skillReferenceDigest, '9db43b385aac02de40710680d613ae664766004dfad4d77bdad2a2fa47a05bbe');
  assert.equal(policy.presetKeyDigest, 'b3d47a4a33e6f2018b414e1de45d4ec2ca2b8717cbc800d958d9258930ed8e93');
  assert.equal(policy.activation, 'catalog_only');
  assert.equal(policy.behavior, 'advisory');
  assert.equal(policy.runtimeMutation, 'none');
  assert.equal(policy.savePersistence, 'forbidden');
  assert.equal(policy.characterUiIntegration, 'forbidden_A39');
  assert.equal(policy.dexSemantics, 'forbidden_D14');
  assert.equal(policy.sourceWorkbookSha256, 'fdda777b1cbb0eeaacb7e02ced3c1c9df1a3af2853bfdf8d1fe902370789e39c');
  assertDeepFrozen(policy);

  const projected = rows(module);
  assert.equal(module.BUILD_PRESET_CATALOG.length, 54);
  assert.equal(hash(projected), policy.normalizedRowDigest);
  assert.equal(hash(projected.flatMap(row => row.slice(4, 8))), policy.skillReferenceDigest);
  assert.equal(hash(projected.map(row => [row[0], row[2]])), policy.presetKeyDigest);
  assert.equal(new Set(module.BUILD_PRESET_CATALOG.flatMap(record => record.skillIds)).size, 108);
  assert.equal(module.BUILD_PRESET_CATALOG.every(record => record.activation === 'catalog_only' && record.advisoryOnly === true), true);
  assertDeepFrozen(module.BUILD_PRESET_CATALOG);

  const canonical = module.validateBuildPresetCatalog(module.BUILD_PRESET_CATALOG);
  assert.equal(canonical.ok, true);
  assert.deepEqual(canonical.counts, {
    rows: 54,
    skillReferences: 216,
    uniqueMonsterIds: 36,
    uniqueSkillIds: 108,
    fieldPresets: 36,
    advancedPresets: 18,
  });
  assertDeepFrozen(canonical);

  assert.equal(module.buildPreset('MON_001', 'Field')?.monsterNameTH, 'สไลม์ปกติ');
  assert.equal(module.buildPreset('MON_019', 'Advanced')?.skillIds[3], 'SK_NORMAL_06');
  assert.equal(module.buildPreset(' MON_001', 'Field'), null);
  assert.equal(module.buildPreset(Symbol('hostile'), 'Field'), null);
  assert.equal(module.buildPresetsForMonster('MON_019').length, 2);
  assert.equal(module.buildPresetsForRuntimeSpecies('normalooze').length, 3);
  assertDeepFrozen(module.buildPresetsForMonster('MON_019'));
  assertDeepFrozen(module.buildPresetsForRuntimeSpecies('normalooze'));

  const changed = cloneCatalog(module);
  changed[0].role = 'Mutant';
  assert.equal(hasIssue(module.validateBuildPresetCatalog(changed), 'workbook_preset_mismatch'), true);

  const changedSlotOrder = cloneCatalog(module);
  [changedSlotOrder[0].skillIds[2], changedSlotOrder[0].skillIds[3]] = [
    changedSlotOrder[0].skillIds[3], changedSlotOrder[0].skillIds[2],
  ];
  assert.equal(hasIssue(module.validateBuildPresetCatalog(changedSlotOrder), 'workbook_preset_mismatch'), true);

  const reordered = cloneCatalog(module);
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  assert.equal(hasIssue(module.validateBuildPresetCatalog(reordered), 'preset_order_mismatch'), true);

  const duplicate = cloneCatalog(module);
  duplicate[1].presetKey = duplicate[0].presetKey;
  assert.equal(hasIssue(module.validateBuildPresetCatalog(duplicate), 'duplicate_preset_key'), true);

  const missing = cloneCatalog(module);
  missing.pop();
  assert.equal(hasIssue(module.validateBuildPresetCatalog(missing), 'missing_preset'), true);

  const unknownMonster = cloneCatalog(module);
  unknownMonster[0].monsterId = 'MON_999';
  assert.equal(hasIssue(module.validateBuildPresetCatalog(unknownMonster), 'unknown_monster_reference'), true);

  const wrongMapping = cloneCatalog(module);
  wrongMapping[0].runtimeSpeciesId = 'flameling';
  assert.equal(hasIssue(module.validateBuildPresetCatalog(wrongMapping), 'species_mapping_mismatch'), true);

  const advancedStageOne = cloneCatalog(module);
  advancedStageOne[0].presetName = 'Advanced';
  assert.equal(hasIssue(module.validateBuildPresetCatalog(advancedStageOne), 'advanced_preset_requires_stage2'), true);

  const wrongArity = cloneCatalog(module);
  wrongArity[0].skillIds.pop();
  assert.equal(hasIssue(module.validateBuildPresetCatalog(wrongArity), 'skill_slot_count_mismatch'), true);

  const duplicateSkill = cloneCatalog(module);
  duplicateSkill[0].skillIds[1] = duplicateSkill[0].skillIds[0];
  assert.equal(hasIssue(module.validateBuildPresetCatalog(duplicateSkill), 'duplicate_preset_skill'), true);

  const unknownSkill = cloneCatalog(module);
  unknownSkill[0].skillIds[0] = 'SK_UNKNOWN_99';
  assert.equal(hasIssue(module.validateBuildPresetCatalog(unknownSkill), 'unknown_skill_reference'), true);

  const wrongType = cloneCatalog(module);
  wrongType.find(record => record.presetKey === 'MON_019|Advanced').skillIds[0] = 'SK_FLYING_01';
  assert.equal(hasIssue(module.validateBuildPresetCatalog(wrongType), 'skill_type_mismatch'), true);

  const missingLearnset = cloneCatalog(module);
  missingLearnset[0].skillIds[0] = 'SK_FIRE_01';
  assert.equal(hasIssue(module.validateBuildPresetCatalog(missingLearnset), 'unknown_learnset_reference'), true);

  const inactiveLearnset = cloneCatalog(module);
  inactiveLearnset.find(record => record.presetKey === 'MON_019|Advanced').skillIds[0] = 'SK_PSYCHIC_04';
  assert.equal(hasIssue(module.validateBuildPresetCatalog(inactiveLearnset), 'inactive_learnset_reference'), true);

  const scopeLeak = cloneCatalog(module);
  scopeLeak[0].seen = true;
  assert.equal(hasIssue(module.validateBuildPresetCatalog(scopeLeak), 'forbidden_scope_field'), true);

  const genericLeak = cloneCatalog(module);
  genericLeak[0].debug = true;
  assert.equal(hasIssue(module.validateBuildPresetCatalog(genericLeak), 'unexpected_preset_field'), true);

  const extraRoot = cloneCatalog(module);
  extraRoot.debug = true;
  assert.equal(module.validateBuildPresetCatalog(extraRoot).ok, false);
  class PresetArray extends Array {}
  assert.equal(module.validateBuildPresetCatalog(PresetArray.from(cloneCatalog(module))).ok, false);

  const inherited = Object.create({ inherited: true });
  Object.assign(inherited, cloneCatalog(module)[0]);
  const inheritedCatalog = cloneCatalog(module);
  inheritedCatalog[0] = inherited;
  assert.equal(module.validateBuildPresetCatalog(inheritedCatalog).ok, false);

  let rootAccessorReads = 0;
  const rootAccessor = [];
  Object.defineProperty(rootAccessor, '0', {
    enumerable: true,
    get() {
      rootAccessorReads += 1;
      return module.BUILD_PRESET_CATALOG[0];
    },
  });
  assert.equal(module.validateBuildPresetCatalog(rootAccessor).ok, false);
  assert.equal(rootAccessorReads, 0);

  let recordAccessorReads = 0;
  const accessorRecord = cloneCatalog(module)[0];
  Object.defineProperty(accessorRecord, 'role', {
    enumerable: true,
    get() {
      recordAccessorReads += 1;
      return 'Balanced';
    },
  });
  const accessorCatalog = cloneCatalog(module);
  accessorCatalog[0] = accessorRecord;
  assert.equal(module.validateBuildPresetCatalog(accessorCatalog).ok, false);
  assert.equal(recordAccessorReads, 0);

  const nestedExtra = cloneCatalog(module);
  nestedExtra[0].skillIds.debug = true;
  assert.equal(hasIssue(module.validateBuildPresetCatalog(nestedExtra), 'invalid_skill_id_list'), true);

  let descriptorSpoofRecordReads = 0;
  const descriptorSpoofRecordTarget = { ...cloneCatalog(module)[0], role: 'Mutant' };
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
  const descriptorSpoofRecordCatalog = cloneCatalog(module);
  descriptorSpoofRecordCatalog[0] = descriptorSpoofRecord;
  assert.equal(hasIssue(module.validateBuildPresetCatalog(descriptorSpoofRecordCatalog), 'uncloneable_catalog'), true);
  assert.equal(descriptorSpoofRecordTarget.role, 'Mutant');
  assert.equal(descriptorSpoofRecordReads, 0);

  let descriptorSpoofSkillReads = 0;
  const descriptorSpoofSkillTarget = ['SK_FIRE_01', ...cloneCatalog(module)[0].skillIds.slice(1)];
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
  const descriptorSpoofSkillCatalog = cloneCatalog(module);
  descriptorSpoofSkillCatalog[0].skillIds = descriptorSpoofSkillIds;
  assert.equal(hasIssue(module.validateBuildPresetCatalog(descriptorSpoofSkillCatalog), 'uncloneable_catalog'), true);
  assert.equal(descriptorSpoofSkillTarget[0], 'SK_FIRE_01');
  assert.equal(descriptorSpoofSkillReads, 0);

  const hostile = new Proxy({}, { ownKeys() { throw new Error('hostile'); } });
  assert.doesNotThrow(() => module.validateBuildPresetCatalog([hostile]));
  assert.equal(module.validateBuildPresetCatalog([hostile]).ok, false);

  const hostileScalar = cloneCatalog(module);
  hostileScalar[0].role = 1n;
  assert.doesNotThrow(() => module.validateBuildPresetCatalog(hostileScalar));
  assert.equal(module.validateBuildPresetCatalog(hostileScalar).ok, false);
}

assertContract(await loadSource(source, 'build-preset-current'));

function replaceOnce(before, after) {
  return candidate => {
    const mutant = candidate.replace(before, after);
    assert.notEqual(mutant, candidate, `mutation target missing: ${before}`);
    return mutant;
  };
}

const mutants = [
  ['change workbook Thai name', replaceOnce('"MON_001","สไลม์ปกติ","Field"', '"MON_001","สไลม์กลายพันธุ์","Field"')],
  ['change workbook role', replaceOnce('"Field","Balanced","SK_NORMAL_01"', '"Field","Mutant","SK_NORMAL_01"')],
  ['change workbook slot order', replaceOnce('"SK_NORMAL_02","SK_NORMAL_04","SK_NORMAL_03"', '"SK_NORMAL_02","SK_NORMAL_03","SK_NORMAL_04"')],
  ['change workbook advanced ultimate', replaceOnce('"SK_NORMAL_05","SK_NORMAL_06"', '"SK_NORMAL_05","SK_NORMAL_04"')],
  ['change workbook usage', replaceOnce('"General exploration / sustained combat"', '"Mutant usage"')],
  ['change policy row count', replaceOnce('rowCount: 54', 'rowCount: 53')],
  ['change policy reference count', replaceOnce('skillReferenceCount: 216', 'skillReferenceCount: 215')],
  ['change policy monster count', replaceOnce('uniqueMonsterIdCount: 36', 'uniqueMonsterIdCount: 35')],
  ['change policy skill count', replaceOnce('uniqueSkillIdCount: 108', 'uniqueSkillIdCount: 107')],
  ['change manual slot count', replaceOnce('manualSlotCount: 4', 'manualSlotCount: 3')],
  ['change preset counts', replaceOnce('Object.freeze({ Field: 36, Advanced: 18 })', 'Object.freeze({ Field: 35, Advanced: 19 })')],
  ['corrupt row digest', replaceOnce('51e219b8038eea12293880a4f2eb1a6f99530b374425995743d7905bc5d90df5', '01e219b8038eea12293880a4f2eb1a6f99530b374425995743d7905bc5d90df5')],
  ['corrupt reference digest', replaceOnce('9db43b385aac02de40710680d613ae664766004dfad4d77bdad2a2fa47a05bbe', '0db43b385aac02de40710680d613ae664766004dfad4d77bdad2a2fa47a05bbe')],
  ['corrupt key digest', replaceOnce('b3d47a4a33e6f2018b414e1de45d4ec2ca2b8717cbc800d958d9258930ed8e93', '03d47a4a33e6f2018b414e1de45d4ec2ca2b8717cbc800d958d9258930ed8e93')],
  ['activate policy', replaceOnce("activation: 'catalog_only',\n  behavior", "activation: 'runtime_active',\n  behavior")],
  ['make policy prescriptive', replaceOnce("behavior: 'advisory'", "behavior: 'prescriptive'")],
  ['claim runtime mutation', replaceOnce("runtimeMutation: 'none'", "runtimeMutation: 'equip'")],
  ['allow save persistence', replaceOnce("savePersistence: 'forbidden'", "savePersistence: 'allowed'")],
  ['allow Character UI integration', replaceOnce("characterUiIntegration: 'forbidden_A39'", "characterUiIntegration: 'active'")],
  ['allow Dex semantics', replaceOnce("dexSemantics: 'forbidden_D14'", "dexSemantics: 'active'")],
  ['activate catalog records', replaceOnce("activation: 'catalog_only',\n    advisoryOnly", "activation: 'runtime_active',\n    advisoryOnly")],
  ['make skill arrays mutable', replaceOnce('skillIds: Object.freeze([skill1, skill2, skill3, skill4])', 'skillIds: [skill1, skill2, skill3, skill4]')],
  ['make records mutable', replaceOnce('  return Object.freeze({\n    presetKey:', '  return ({\n    presetKey:')],
  ['make catalog shallow sealed', replaceOnce('export const BUILD_PRESET_CATALOG = Object.freeze(RAW_PRESETS.map', 'export const BUILD_PRESET_CATALOG = Object.seal(RAW_PRESETS.map')],
  ['make policy mutable', replaceOnce('export const BUILD_PRESET_POLICY = Object.freeze({', 'export const BUILD_PRESET_POLICY = ({')],
  ['make monster lookup arrays mutable', replaceOnce('PRESETS_BY_MONSTER.set(id, Object.freeze(records))', 'PRESETS_BY_MONSTER.set(id, records)')],
  ['make species lookup arrays mutable', replaceOnce('PRESETS_BY_RUNTIME_SPECIES.set(id, Object.freeze(records))', 'PRESETS_BY_RUNTIME_SPECIES.set(id, records)')],
  ['return mutable validation result', replaceOnce('  return Object.freeze({\n    ok: issues.length === 0,', '  return ({\n    ok: issues.length === 0,')],
  ['return mutable issue list', replaceOnce('issues: Object.freeze(issues),', 'issues,')],
  ['return mutable counts', replaceOnce('counts: Object.freeze(counts),', 'counts,')],
  ['skip exact scalar comparison', replaceOnce("if (field !== 'skillIds' && Object.prototype.hasOwnProperty.call(record, field) && !Object.is(record[field], expected[field])) {", "if (false) {")],
  ['skip exact skill comparison', replaceOnce('if (expected && !sameArray(skillIds, expected.skillIds)) {', 'if (false) {')],
  ['skip workbook order', replaceOnce('if (record.presetKey !== BUILD_PRESET_CATALOG[index]?.presetKey) {', 'if (false) {')],
  ['skip duplicate keys', replaceOnce('if (presetKeys.has(record.presetKey)) {', 'if (false) {')],
  ['skip missing presets', replaceOnce('if (!presetKeys.has(expected.presetKey)) {', 'if (false) {')],
  ['skip monster foreign key', replaceOnce('if (!mapped) {', 'if (false) {')],
  ['skip species mapping', replaceOnce("} else if (record.runtimeSpeciesId !== mapped.mapping.runtimeSpeciesId || record.stage !== mapped.stage) {", '} else if (false) {')],
  ['skip Advanced Stage2 guard', replaceOnce("if (record.presetName === 'Advanced' && record.stage !== 2) {", 'if (false) {')],
  ['skip exact slot count', replaceOnce('if (skillIds.length !== BUILD_PRESET_POLICY.manualSlotCount) {', 'if (false) {')],
  ['skip duplicate row skills', replaceOnce('if (rowSkillIds.has(skillId)) {', 'if (false) {')],
  ['skip unknown skills', replaceOnce('if (!skill) {', 'if (false) {')],
  ['skip skill type join', replaceOnce('if (mapped && skill.sourceType !== mapped.mapping.workbookTypeCandidate) {', 'if (false) {')],
  ['skip learnset foreign key', replaceOnce('if (!learnset) {', 'if (false) {')],
  ['skip active learnset state', replaceOnce("} else if (learnset.state !== 'Active') {", '} else if (false) {')],
  ['accept forbidden scope fields', replaceOnce('} else if (FORBIDDEN_SCOPE_FIELDS.has(key)) {', '} else if (false) {')],
  ['accept generic fields', replaceOnce('} else if (!PRESET_FIELD_SET.has(key)) {', '} else if (false) {')],
  ['accept array subclasses', replaceOnce('if (prototype !== Array.prototype && prototype !== null) return null;', 'if (false) return null;')],
  ['accept extra root fields', replaceOnce("if (keys.length !== length + 1 || !keys.includes('length')) return null;", "if (!keys.includes('length')) return null;")],
  ['invoke array accessors', replaceOnce(
    "    const descriptor = Object.getOwnPropertyDescriptor(value, field);\n    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;\n    snapshot[index] = descriptor.value;",
    "    const descriptor = Object.getOwnPropertyDescriptor(value, field);\n    if (!descriptor) return null;\n    snapshot[index] = Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : value[field];",
  )],
  ['accept inherited records', replaceOnce('if (prototype !== Object.prototype && prototype !== null) return null;', 'if (false) return null;')],
  ['invoke record accessors', replaceOnce(
    "    const descriptor = Object.getOwnPropertyDescriptor(value, key);\n    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;\n    values[key] = descriptor.value;",
    "    const descriptor = Object.getOwnPropertyDescriptor(value, key);\n    if (!descriptor) return null;\n    values[key] = Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : value[key];",
  )],
  ['skip descriptor-spoof cloneability guard', replaceOnce(
    'if (issues.length === 0 && !isStructuredCloneable(records)) {',
    'if (false) {',
  )],
  ['throw on hostile input', replaceOnce(
    '  } catch {\n    return invalidCatalogResult();\n  }',
    '  } catch (error) {\n    throw error;\n  }',
  )],
  ['normalize preset lookup', replaceOnce('EXPECTED_BY_KEY.get(`${monsterId}|${presetName}`)', 'EXPECTED_BY_KEY.get(`${monsterId.trim()}|${presetName.trim()}`)')],
];

let killed = 0;
for (let index = 0; index < mutants.length; index += 1) {
  const [name, mutate] = mutants[index];
  try {
    assertContract(await loadSource(mutate(source), `build-preset-mutant-${index}`));
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

assert.equal(killed, mutants.length);
console.log(`V8.1 A39 Build Preset mutants: PASS (${killed}/${mutants.length} killed)`);
