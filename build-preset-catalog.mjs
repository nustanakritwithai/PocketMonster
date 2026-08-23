// PocketMonster V8.1 A39 — immutable workbook Build Preset advisory catalog.
// Presets describe reviewed four-skill recommendations only. They do not equip
// skills, mutate instances, persist save state, render Character UI, or define
// Dex Seen/Raised semantics.

import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { MONSTER_CATALOG, validateMonsterCatalog } from './monster-catalog.mjs';
import { SKILL_CATALOG, validateSkillCatalog } from './skill-catalog.mjs';
import { LEARNSET_CATALOG, validateLearnsetCatalog } from './learnset-catalog.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

export const BUILD_PRESET_POLICY = Object.freeze({
  authorityRanges: Object.freeze(['Build_Presets!A1:I55']),
  rowCount: 54,
  skillReferenceCount: 216,
  uniqueMonsterIdCount: 36,
  uniqueSkillIdCount: 108,
  manualSlotCount: 4,
  presetCounts: Object.freeze({ Field: 36, Advanced: 18 }),
  normalizedRowDigest: '51e219b8038eea12293880a4f2eb1a6f99530b374425995743d7905bc5d90df5',
  skillReferenceDigest: '9db43b385aac02de40710680d613ae664766004dfad4d77bdad2a2fa47a05bbe',
  presetKeyDigest: 'b3d47a4a33e6f2018b414e1de45d4ec2ca2b8717cbc800d958d9258930ed8e93',
  activation: 'catalog_only',
  behavior: 'advisory',
  runtimeMutation: 'none',
  savePersistence: 'forbidden',
  characterUiIntegration: 'forbidden_A39',
  dexSemantics: 'forbidden_D14',
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
});

// Exact normalized projection of Build_Presets!A2:I55 in workbook order.
const RAW_PRESETS = [
  ["MON_001","สไลม์ปกติ","Field","Balanced","SK_NORMAL_01","SK_NORMAL_02","SK_NORMAL_04","SK_NORMAL_03","General exploration / sustained combat"],
  ["MON_019","กระต่ายว่องไว","Field","Balanced","SK_NORMAL_01","SK_NORMAL_02","SK_NORMAL_04","SK_NORMAL_03","General exploration / sustained combat"],
  ["MON_019","กระต่ายว่องไว","Advanced","Balanced","SK_NORMAL_01","SK_NORMAL_02","SK_NORMAL_05","SK_NORMAL_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_002","สไลม์ไฟ","Field","Burst","SK_FIRE_01","SK_FIRE_02","SK_FIRE_04","SK_FIRE_03","General exploration / sustained combat"],
  ["MON_020","จิ้งจอกเพลิง","Field","Burst","SK_FIRE_01","SK_FIRE_02","SK_FIRE_04","SK_FIRE_03","General exploration / sustained combat"],
  ["MON_020","จิ้งจอกเพลิง","Advanced","Burst","SK_FIRE_01","SK_FIRE_02","SK_FIRE_05","SK_FIRE_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_003","สไลม์น้ำ","Field","Sustain","SK_WATER_01","SK_WATER_02","SK_WATER_04","SK_WATER_03","General exploration / sustained combat"],
  ["MON_021","นากวารี","Field","Sustain","SK_WATER_01","SK_WATER_02","SK_WATER_04","SK_WATER_03","General exploration / sustained combat"],
  ["MON_021","นากวารี","Advanced","Sustain","SK_WATER_01","SK_WATER_02","SK_WATER_05","SK_WATER_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_004","สไลม์พืช","Field","Support","SK_GRASS_01","SK_GRASS_02","SK_GRASS_04","SK_GRASS_03","General exploration / sustained combat"],
  ["MON_022","กวางพฤกษา","Field","Support","SK_GRASS_01","SK_GRASS_02","SK_GRASS_04","SK_GRASS_03","General exploration / sustained combat"],
  ["MON_022","กวางพฤกษา","Advanced","Support","SK_GRASS_01","SK_GRASS_02","SK_GRASS_05","SK_GRASS_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_005","สไลม์ไฟฟ้า","Field","Speed","SK_ELECTRIC_01","SK_ELECTRIC_02","SK_ELECTRIC_04","SK_ELECTRIC_03","General exploration / sustained combat"],
  ["MON_023","เสือสายฟ้า","Field","Speed","SK_ELECTRIC_01","SK_ELECTRIC_02","SK_ELECTRIC_04","SK_ELECTRIC_03","General exploration / sustained combat"],
  ["MON_023","เสือสายฟ้า","Advanced","Speed","SK_ELECTRIC_01","SK_ELECTRIC_02","SK_ELECTRIC_05","SK_ELECTRIC_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_006","สไลม์น้ำแข็ง","Field","Control","SK_ICE_01","SK_ICE_02","SK_ICE_04","SK_ICE_03","General exploration / sustained combat"],
  ["MON_024","หมาป่าน้ำแข็ง","Field","Control","SK_ICE_01","SK_ICE_02","SK_ICE_04","SK_ICE_03","General exploration / sustained combat"],
  ["MON_024","หมาป่าน้ำแข็ง","Advanced","Control","SK_ICE_01","SK_ICE_02","SK_ICE_05","SK_ICE_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_007","สไลม์หิน","Field","Tank","SK_ROCK_01","SK_ROCK_02","SK_ROCK_04","SK_ROCK_03","General exploration / sustained combat"],
  ["MON_025","แรดศิลา","Field","Tank","SK_ROCK_01","SK_ROCK_02","SK_ROCK_04","SK_ROCK_03","General exploration / sustained combat"],
  ["MON_025","แรดศิลา","Advanced","Tank","SK_ROCK_01","SK_ROCK_02","SK_ROCK_05","SK_ROCK_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_008","สไลม์ดิน","Field","Bruiser","SK_GROUND_01","SK_GROUND_02","SK_GROUND_04","SK_GROUND_03","General exploration / sustained combat"],
  ["MON_026","ตัวตุ่นปฐพี","Field","Bruiser","SK_GROUND_01","SK_GROUND_02","SK_GROUND_04","SK_GROUND_03","General exploration / sustained combat"],
  ["MON_026","ตัวตุ่นปฐพี","Advanced","Bruiser","SK_GROUND_01","SK_GROUND_02","SK_GROUND_05","SK_GROUND_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_009","สไลม์ลม","Field","Mobility","SK_FLYING_01","SK_FLYING_02","SK_FLYING_04","SK_FLYING_03","General exploration / sustained combat"],
  ["MON_027","เหยี่ยววายุ","Field","Mobility","SK_FLYING_01","SK_FLYING_02","SK_FLYING_04","SK_FLYING_03","General exploration / sustained combat"],
  ["MON_027","เหยี่ยววายุ","Advanced","Mobility","SK_FLYING_01","SK_FLYING_02","SK_FLYING_05","SK_FLYING_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_010","สไลม์พิษ","Field","DoT","SK_POISON_01","SK_POISON_02","SK_POISON_04","SK_POISON_03","General exploration / sustained combat"],
  ["MON_028","งูพิษ","Field","DoT","SK_POISON_01","SK_POISON_02","SK_POISON_04","SK_POISON_03","General exploration / sustained combat"],
  ["MON_028","งูพิษ","Advanced","DoT","SK_POISON_01","SK_POISON_02","SK_POISON_05","SK_POISON_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_011","สไลม์มืด","Field","Assassin","SK_DARK_01","SK_DARK_02","SK_DARK_04","SK_DARK_03","General exploration / sustained combat"],
  ["MON_029","เสือดำเงา","Field","Assassin","SK_DARK_01","SK_DARK_02","SK_DARK_04","SK_DARK_03","General exploration / sustained combat"],
  ["MON_029","เสือดำเงา","Advanced","Assassin","SK_DARK_01","SK_DARK_02","SK_DARK_05","SK_DARK_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_012","สไลม์แสง","Field","Healer","SK_LIGHT_01","SK_LIGHT_02","SK_LIGHT_04","SK_LIGHT_03","General exploration / sustained combat"],
  ["MON_030","กวางศักดิ์สิทธิ์","Field","Healer","SK_LIGHT_01","SK_LIGHT_02","SK_LIGHT_04","SK_LIGHT_03","General exploration / sustained combat"],
  ["MON_030","กวางศักดิ์สิทธิ์","Advanced","Healer","SK_LIGHT_01","SK_LIGHT_02","SK_LIGHT_05","SK_LIGHT_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_013","สไลม์พลังจิต","Field","Control","SK_PSYCHIC_01","SK_PSYCHIC_02","SK_PSYCHIC_04","SK_PSYCHIC_03","General exploration / sustained combat"],
  ["MON_031","แมวจิต","Field","Control","SK_PSYCHIC_01","SK_PSYCHIC_02","SK_PSYCHIC_04","SK_PSYCHIC_03","General exploration / sustained combat"],
  ["MON_031","แมวจิต","Advanced","Control","SK_PSYCHIC_01","SK_PSYCHIC_02","SK_PSYCHIC_05","SK_PSYCHIC_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_014","สไลม์แมลง","Field","Utility","SK_BUG_01","SK_BUG_02","SK_BUG_04","SK_BUG_03","General exploration / sustained combat"],
  ["MON_032","ด้วงเกราะ","Field","Utility","SK_BUG_01","SK_BUG_02","SK_BUG_04","SK_BUG_03","General exploration / sustained combat"],
  ["MON_032","ด้วงเกราะ","Advanced","Utility","SK_BUG_01","SK_BUG_02","SK_BUG_05","SK_BUG_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_015","สไลม์มังกร","Field","Scaler","SK_DRAGON_01","SK_DRAGON_02","SK_DRAGON_04","SK_DRAGON_03","General exploration / sustained combat"],
  ["MON_033","มังกรน้อย","Field","Scaler","SK_DRAGON_01","SK_DRAGON_02","SK_DRAGON_04","SK_DRAGON_03","General exploration / sustained combat"],
  ["MON_033","มังกรน้อย","Advanced","Scaler","SK_DRAGON_01","SK_DRAGON_02","SK_DRAGON_05","SK_DRAGON_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_016","สไลม์ต่อสู้","Field","Combo","SK_FIGHTING_01","SK_FIGHTING_02","SK_FIGHTING_04","SK_FIGHTING_03","General exploration / sustained combat"],
  ["MON_034","ลิงนักสู้","Field","Combo","SK_FIGHTING_01","SK_FIGHTING_02","SK_FIGHTING_04","SK_FIGHTING_03","General exploration / sustained combat"],
  ["MON_034","ลิงนักสู้","Advanced","Combo","SK_FIGHTING_01","SK_FIGHTING_02","SK_FIGHTING_05","SK_FIGHTING_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_017","สไลม์เหล็ก","Field","Tank","SK_STEEL_01","SK_STEEL_02","SK_STEEL_04","SK_STEEL_03","General exploration / sustained combat"],
  ["MON_035","หมาป่าเหล็ก","Field","Tank","SK_STEEL_01","SK_STEEL_02","SK_STEEL_04","SK_STEEL_03","General exploration / sustained combat"],
  ["MON_035","หมาป่าเหล็ก","Advanced","Tank","SK_STEEL_01","SK_STEEL_02","SK_STEEL_05","SK_STEEL_06","Late-game build using control/advanced skill + ultimate"],
  ["MON_018","สไลม์วิญญาณ","Field","Trickster","SK_GHOST_01","SK_GHOST_02","SK_GHOST_04","SK_GHOST_03","General exploration / sustained combat"],
  ["MON_036","จิ้งจอกวิญญาณ","Field","Trickster","SK_GHOST_01","SK_GHOST_02","SK_GHOST_04","SK_GHOST_03","General exploration / sustained combat"],
  ["MON_036","จิ้งจอกวิญญาณ","Advanced","Trickster","SK_GHOST_01","SK_GHOST_02","SK_GHOST_05","SK_GHOST_06","Late-game build using control/advanced skill + ultimate"],
];

const MONSTER_BY_WORKBOOK_ID = new Map();
for (const mapping of MONSTER_CATALOG) {
  MONSTER_BY_WORKBOOK_ID.set(mapping.workbookBaseMonsterId, Object.freeze({ mapping, stage: 1 }));
  MONSTER_BY_WORKBOOK_ID.set(mapping.workbookStage2MonsterId, Object.freeze({ mapping, stage: 2 }));
}

export const BUILD_PRESET_CATALOG = Object.freeze(RAW_PRESETS.map(([
  monsterId,
  monsterNameTH,
  presetName,
  role,
  skill1,
  skill2,
  skill3,
  skill4,
  usage,
], index) => {
  const mapped = MONSTER_BY_WORKBOOK_ID.get(monsterId);
  if (!mapped) throw new TypeError(`Unknown Build Preset MonsterID at row ${index + 2}`);
  return Object.freeze({
    presetKey: `${monsterId}|${presetName}`,
    monsterId,
    runtimeSpeciesId: mapped.mapping.runtimeSpeciesId,
    stage: mapped.stage,
    monsterNameTH,
    presetName,
    role,
    skillIds: Object.freeze([skill1, skill2, skill3, skill4]),
    usage,
    sourceRow: index + 2,
    sourceRange: `Build_Presets!A${index + 2}:I${index + 2}`,
    activation: 'catalog_only',
    advisoryOnly: true,
    sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  });
}));

const PRESET_FIELDS = Object.freeze([
  'presetKey',
  'monsterId',
  'runtimeSpeciesId',
  'stage',
  'monsterNameTH',
  'presetName',
  'role',
  'skillIds',
  'usage',
  'sourceRow',
  'sourceRange',
  'activation',
  'advisoryOnly',
  'sourceWorkbookVersion',
]);
const PRESET_FIELD_SET = new Set(PRESET_FIELDS);
const FORBIDDEN_SCOPE_FIELDS = new Set([
  'seen', 'raised', 'dex', 'unlocked', 'equipped', 'equippedSlot', 'currentUses',
  'cooldownRemaining', 'instanceId', 'saveState', 'onClick', 'html', 'innerHTML', 'style',
]);
const EXPECTED_BY_KEY = new Map(BUILD_PRESET_CATALOG.map(record => [record.presetKey, record]));
const SKILL_BY_ID = new Map(SKILL_CATALOG.map(skill => [skill.id, skill]));
const LEARNSET_BY_KEY = new Map(LEARNSET_CATALOG.map(entry => [entry.lookupKey, entry]));
const EMPTY_PRESETS = Object.freeze([]);

const PRESETS_BY_MONSTER = new Map();
const PRESETS_BY_RUNTIME_SPECIES = new Map();
for (const record of BUILD_PRESET_CATALOG) {
  const monsterRows = PRESETS_BY_MONSTER.get(record.monsterId) ?? [];
  monsterRows.push(record);
  PRESETS_BY_MONSTER.set(record.monsterId, monsterRows);
  const speciesRows = PRESETS_BY_RUNTIME_SPECIES.get(record.runtimeSpeciesId) ?? [];
  speciesRows.push(record);
  PRESETS_BY_RUNTIME_SPECIES.set(record.runtimeSpeciesId, speciesRows);
}
for (const [id, records] of PRESETS_BY_MONSTER) PRESETS_BY_MONSTER.set(id, Object.freeze(records));
for (const [id, records] of PRESETS_BY_RUNTIME_SPECIES) PRESETS_BY_RUNTIME_SPECIES.set(id, Object.freeze(records));

function issue(code, index, field, detail = {}) {
  return Object.freeze({ code, index, field, ...detail });
}

function safeDiagnostic(value) {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function dataArraySnapshot(value) {
  if (!Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Array.prototype && prototype !== null) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || length < 0) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1 || !keys.includes('length')) return null;
  const snapshot = [];
  for (let index = 0; index < length; index += 1) {
    const field = String(index);
    if (!keys.includes(field)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    snapshot[index] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function inspectDataRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(value);
  const values = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    values[key] = descriptor.value;
  }
  return Object.freeze({ keys: Object.freeze([...keys]), values: Object.freeze(values) });
}

function sameArray(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => Object.is(value, expected[index]));
}

function isStructuredCloneable(value) {
  if (typeof structuredClone !== 'function') return false;
  try {
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

function validationResult(issues, counts) {
  return Object.freeze({
    ok: issues.length === 0,
    issues: Object.freeze(issues),
    counts: Object.freeze(counts),
  });
}

function invalidCatalogResult() {
  return validationResult([issue('invalid_catalog', -1, 'root')], {
    rows: 0,
    skillReferences: 0,
    uniqueMonsterIds: 0,
    uniqueSkillIds: 0,
    fieldPresets: 0,
    advancedPresets: 0,
  });
}

function validateBuildPresetCatalogInternal(records) {
  const presets = dataArraySnapshot(records);
  if (!presets) return invalidCatalogResult();
  const issues = [];
  const presetKeys = new Set();
  const monsterIds = new Set();
  const referencedSkillIds = new Set();
  let skillReferenceCount = 0;
  let fieldPresets = 0;
  let advancedPresets = 0;

  if (presets.length !== BUILD_PRESET_POLICY.rowCount) {
    issues.push(issue('preset_count_mismatch', -1, 'length', { value: presets.length }));
  }

  for (let index = 0; index < presets.length; index += 1) {
    const inspected = inspectDataRecord(presets[index]);
    if (!inspected) {
      issues.push(issue('invalid_preset', index, 'root'));
      continue;
    }
    const record = inspected.values;
    for (const key of inspected.keys) {
      if (typeof key !== 'string') {
        issues.push(issue('unexpected_preset_field', index, 'root'));
      } else if (FORBIDDEN_SCOPE_FIELDS.has(key)) {
        issues.push(issue('forbidden_scope_field', index, key));
      } else if (!PRESET_FIELD_SET.has(key)) {
        issues.push(issue('unexpected_preset_field', index, key));
      }
    }
    for (const field of PRESET_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        issues.push(issue('missing_preset_field', index, field));
      }
    }

    if (record.presetName === 'Field') fieldPresets += 1;
    if (record.presetName === 'Advanced') advancedPresets += 1;
    monsterIds.add(record.monsterId);

    if (presetKeys.has(record.presetKey)) {
      issues.push(issue('duplicate_preset_key', index, 'presetKey', { key: safeDiagnostic(record.presetKey) }));
    }
    presetKeys.add(record.presetKey);
    const expected = EXPECTED_BY_KEY.get(record.presetKey);
    if (!expected) {
      issues.push(issue('unknown_preset_key', index, 'presetKey', { key: safeDiagnostic(record.presetKey) }));
    } else {
      if (record.presetKey !== BUILD_PRESET_CATALOG[index]?.presetKey) {
        issues.push(issue('preset_order_mismatch', index, 'presetKey', { key: safeDiagnostic(record.presetKey) }));
      }
      for (const field of PRESET_FIELDS) {
        if (field !== 'skillIds' && Object.prototype.hasOwnProperty.call(record, field) && !Object.is(record[field], expected[field])) {
          issues.push(issue('workbook_preset_mismatch', index, field, { key: expected.presetKey }));
        }
      }
    }

    const mapped = MONSTER_BY_WORKBOOK_ID.get(record.monsterId);
    if (!mapped) {
      issues.push(issue('unknown_monster_reference', index, 'monsterId', { id: safeDiagnostic(record.monsterId) }));
    } else if (record.runtimeSpeciesId !== mapped.mapping.runtimeSpeciesId || record.stage !== mapped.stage) {
      issues.push(issue('species_mapping_mismatch', index, 'runtimeSpeciesId', { id: safeDiagnostic(record.monsterId) }));
    }
    if (record.presetName === 'Advanced' && record.stage !== 2) {
      issues.push(issue('advanced_preset_requires_stage2', index, 'presetName'));
    }

    const skillIds = dataArraySnapshot(record.skillIds);
    if (!skillIds) {
      issues.push(issue('invalid_skill_id_list', index, 'skillIds'));
      continue;
    }
    skillReferenceCount += skillIds.length;
    if (skillIds.length !== BUILD_PRESET_POLICY.manualSlotCount) {
      issues.push(issue('skill_slot_count_mismatch', index, 'skillIds', { value: skillIds.length }));
    }
    if (expected && !sameArray(skillIds, expected.skillIds)) {
      issues.push(issue('workbook_preset_mismatch', index, 'skillIds', { key: expected.presetKey }));
    }
    const rowSkillIds = new Set();
    for (const skillId of skillIds) {
      if (rowSkillIds.has(skillId)) {
        issues.push(issue('duplicate_preset_skill', index, 'skillIds', { id: safeDiagnostic(skillId) }));
      }
      rowSkillIds.add(skillId);
      referencedSkillIds.add(skillId);
      const skill = SKILL_BY_ID.get(skillId);
      if (!skill) {
        issues.push(issue('unknown_skill_reference', index, 'skillIds', { id: safeDiagnostic(skillId) }));
        continue;
      }
      if (mapped && skill.sourceType !== mapped.mapping.workbookTypeCandidate) {
        issues.push(issue('skill_type_mismatch', index, 'skillIds', { id: safeDiagnostic(skillId) }));
      }
      const learnset = LEARNSET_BY_KEY.get(`${record.monsterId}|${skillId}`);
      if (!learnset) {
        issues.push(issue('unknown_learnset_reference', index, 'skillIds', { id: safeDiagnostic(skillId) }));
      } else if (learnset.state !== 'Active') {
        issues.push(issue('inactive_learnset_reference', index, 'skillIds', { id: safeDiagnostic(skillId) }));
      }
    }
  }

  for (const expected of BUILD_PRESET_CATALOG) {
    if (!presetKeys.has(expected.presetKey)) {
      issues.push(issue('missing_preset', -1, 'presetKey', { key: expected.presetKey }));
    }
  }
  if (issues.length === 0 && !isStructuredCloneable(records)) {
    issues.push(issue('uncloneable_catalog', -1, 'root'));
  }

  return validationResult(issues, {
    rows: presets.length,
    skillReferences: skillReferenceCount,
    uniqueMonsterIds: monsterIds.size,
    uniqueSkillIds: referencedSkillIds.size,
    fieldPresets,
    advancedPresets,
  });
}

export function validateBuildPresetCatalog(records) {
  try {
    return validateBuildPresetCatalogInternal(records);
  } catch {
    return invalidCatalogResult();
  }
}

export function buildPreset(monsterId, presetName) {
  if (typeof monsterId !== 'string' || typeof presetName !== 'string') return null;
  return EXPECTED_BY_KEY.get(`${monsterId}|${presetName}`) ?? null;
}

export function buildPresetsForMonster(monsterId) {
  return typeof monsterId === 'string' ? (PRESETS_BY_MONSTER.get(monsterId) ?? EMPTY_PRESETS) : EMPTY_PRESETS;
}

export function buildPresetsForRuntimeSpecies(runtimeSpeciesId) {
  return typeof runtimeSpeciesId === 'string'
    ? (PRESETS_BY_RUNTIME_SPECIES.get(runtimeSpeciesId) ?? EMPTY_PRESETS)
    : EMPTY_PRESETS;
}

const dependencyValidations = [
  validateMonsterCatalog(MONSTER_CATALOG),
  validateSkillCatalog(SKILL_CATALOG),
  validateLearnsetCatalog(LEARNSET_CATALOG),
];
if (dependencyValidations.some(result => !result.ok)) {
  throw new TypeError('Build Preset dependency catalog validation failed');
}

const validation = validateBuildPresetCatalog(BUILD_PRESET_CATALOG);
if (!validation.ok) {
  throw new TypeError(`Invalid Build Preset catalog: ${validation.issues.map(entry => entry.code).join(', ')}`);
}
