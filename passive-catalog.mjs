// PocketMonster V8.1 A34 — immutable Passive_Master catalog.
// Runtime activation is intentionally narrow: the workbook defines 36 designs,
// while the approved rollout exposes only the first static-stat archetype.

import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { CONTENT_ID_PATTERNS } from './content-validation.mjs';
import { MONSTER_CATALOG } from './monster-catalog.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

export const PASSIVE_RUNTIME_POLICY = Object.freeze({
  activation: 'resolver_only',
  resolverReadyPassiveIds: Object.freeze(['PASS_ROCK_01']),
  unlistedEffectPolicy: 'catalog_only_noop',
  eventStatePersistence: 'do_not_persist',
  passiveSelection: 'stage1_default_stage2_selection_deferred',
  lightRuntimeActivation: 'deferred_D2',
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
});

const RAW_PASSIVES = [
  ['PASS_NORMAL_01','ร่างกายปรับตัว','Adaptive Body','NORMAL','ปกติ','เมื่อ HP ต่ำกว่า 50%','ลดความเสียหายทั้งหมด',10,'Percent','Always','Stage1'],
  ['PASS_NORMAL_02','จังหวะมั่นคง','Steady Rhythm','NORMAL','ปกติ','หลังใช้สกิลครบ 3 ครั้ง','ลด Cooldown สกิลถัดไป',20,'Percent','Combat','Stage2'],
  ['PASS_FIRE_01','หัวใจคุกรุ่น','Kindling Heart','FIRE','ไฟ','เมื่อโจมตีติด Burn','เพิ่ม SPATK ชั่วคราว',8,'Percent','Combat','Stage1'],
  ['PASS_FIRE_02','แกนโอเวอร์ฮีต','Overheat Core','FIRE','ไฟ','เมื่อ HP ต่ำกว่า 35%','เพิ่ม Power สกิลไฟ',18,'Percent','Combat','Stage2'],
  ['PASS_WATER_01','ผิวไหลเวียน','Flowing Skin','WATER','น้ำ','เมื่อโดนโจมตีหนัก','ลดความเสียหายครั้งถัดไป',12,'Percent','Combat','Stage1'],
  ['PASS_WATER_02','ฟื้นตัวแห่งสายน้ำ','Tidal Recovery','WATER','น้ำ','หลังหลบสำเร็จ','ฟื้น HP เล็กน้อย',4,'PercentHP','Combat','Stage2'],
  ['PASS_GRASS_01','สังเคราะห์พลัง','Photosynthesis','GRASS','พืช','ทุก 12 วินาทีในสนาม','ฟื้น HP',3,'PercentHP','Combat','Stage1'],
  ['PASS_GRASS_02','เจตจำนงหยั่งราก','Rooted Will','GRASS','พืช','ขณะยืนนิ่ง 2 วินาที','เพิ่ม DEF และ SPDEF',15,'Percent','Combat','Stage2'],
  ['PASS_ELECTRIC_01','ประจุสถิต','Static Charge','ELECTRIC','ไฟฟ้า','เมื่อโจมตีโดน','สะสม Charge สูงสุด 5',1,'Stack','Combat','Stage1'],
  ['PASS_ELECTRIC_02','แรงดันพุ่ง','Voltage Surge','ELECTRIC','ไฟฟ้า','เมื่อ Charge เต็ม','เพิ่ม SPD และ Power สกิลถัดไป',20,'Percent','Combat','Stage2'],
  ['PASS_ICE_01','เกราะน้ำค้าง','Frost Coat','ICE','น้ำแข็ง','เมื่อถูกโจมตีประชิด','มีโอกาส Slow ผู้โจมตี',15,'ChancePct','Combat','Stage1'],
  ['PASS_ICE_02','ศูนย์สัมบูรณ์','Absolute Zero','ICE','น้ำแข็ง','เป้าหมายติด Slow อยู่แล้ว','เพิ่ม Effect Chance ของ Freeze',20,'Percent','Combat','Stage2'],
  ['PASS_ROCK_01','ผิวศิลา','Stone Hide','ROCK','หิน','ตลอดเวลา','เพิ่ม DEF',10,'Percent','Always','Stage1'],
  ['PASS_ROCK_02','ปณิธานพื้นหิน','Bedrock Resolve','ROCK','หิน','เมื่อ HP ต่ำกว่า 40%','ลด Knockback และ Stagger',35,'Percent','Combat','Stage2'],
  ['PASS_GROUND_01','สัมผัสผืนดิน','Earth Sense','GROUND','ดิน','หลังมุด/พุ่งจากพื้น','เพิ่ม Accuracy',12,'Percent','Combat','Stage1'],
  ['PASS_GROUND_02','สัญชาตญาณขุด','Burrow Instinct','GROUND','ดิน','หลังได้รับ Critical','ลด Cooldown สกิลเคลื่อนที่',25,'Percent','Combat','Stage2'],
  ['PASS_FLYING_01','ย่างก้าวขนนก','Featherstep','FLYING','ลม','ตลอดเวลา','เพิ่ม SPD',8,'Percent','Always','Stage1'],
  ['PASS_FLYING_02','กระแสเจ็ต','Jetstream','FLYING','ลม','หลัง Dash','เพิ่ม Power สกิลถัดไป',15,'Percent','Combat','Stage2'],
  ['PASS_POISON_01','ต่อมพิษ','Toxic Gland','POISON','พิษ','เมื่อทำ Damage','เพิ่มโอกาสติด Poison',8,'Percent','Combat','Stage1'],
  ['PASS_POISON_02','โลหิตกัดกร่อน','Corrosive Blood','POISON','พิษ','เมื่อถูกโจมตีประชิด','มีโอกาสลด DEF ผู้โจมตี',15,'ChancePct','Combat','Stage2'],
  ['PASS_DARK_01','สัญชาตญาณเงา','Shadow Instinct','DARK','มืด','โจมตีจากด้านข้าง/ด้านหลัง','เพิ่ม Critical Chance',12,'Percent','Combat','Stage1'],
  ['PASS_DARK_02','ซุ่มโจมตี','Ambush','DARK','มืด','หลัง Blink/ออกจาก Stealth','เพิ่ม Damage 2 วินาที',20,'Percent','Combat','Stage2'],
  ['PASS_LIGHT_01','ออร่าเรืองรอง','Radiant Aura','LIGHT','แสง','ทุก 10 วินาที','ล้าง Debuff เบา 1 อย่าง',1,'Count','Combat','Stage1'],
  ['PASS_LIGHT_02','แสงครั้งที่สอง','Second Light','LIGHT','แสง','ครั้งแรกที่ HP ต่ำกว่า 25% ต่อไฟต์','ฟื้น HP',18,'PercentHP','Combat','Stage2'],
  ['PASS_PSYCHIC_01','สมาธิจิต','Mind Focus','PSYCHIC','พลังจิต','ไม่โดนโจมตี 4 วินาที','เพิ่ม SPATK',10,'Percent','Combat','Stage1'],
  ['PASS_PSYCHIC_02','ลางสังหรณ์','Precognition','PSYCHIC','พลังจิต','เมื่อศัตรูใช้สกิลแรง','เพิ่ม Evasion ชั่วคราว',18,'Percent','Combat','Stage2'],
  ['PASS_BUG_01','เปลือกไคติน','Chitin Shell','BUG','แมลง','ตลอดเวลา','เพิ่ม DEF และต้าน DoT',8,'Percent','Always','Stage1'],
  ['PASS_BUG_02','สัญชาตญาณฝูง','Swarm Instinct','BUG','แมลง','เมื่อ HP ต่ำกว่า 50%','เพิ่ม Hit Count/DoT Damage',15,'Percent','Combat','Stage2'],
  ['PASS_DRAGON_01','สายเลือดโบราณ','Ancient Blood','DRAGON','มังกร','ตลอดเวลา','เพิ่มค่าสเตตัสโจมตีรวม',6,'Percent','Always','Stage1'],
  ['PASS_DRAGON_02','ศักดิ์ศรีมังกร','Dragon Pride','DRAGON','มังกร','เมื่อชนะศัตรู 1 ตัว','เพิ่ม Power จนจบ Encounter',8,'Percent','Combat','Stage2'],
  ['PASS_FIGHTING_01','จิตนักสู้','Fighting Spirit','FIGHTING','ต่อสู้','เมื่อ Combo ถึง 3 Hit','เพิ่ม ATK',10,'Percent','Combat','Stage1'],
  ['PASS_FIGHTING_02','จังหวะคอมโบ','Combo Flow','FIGHTING','ต่อสู้','โจมตีต่อเนื่องไม่ขาด','ลด Cooldown สกิลกายภาพ',12,'Percent','Combat','Stage2'],
  ['PASS_STEEL_01','ร่างโลหะผสม','Alloy Body','STEEL','เหล็ก','ตลอดเวลา','ลด Critical Damage ที่ได้รับ',15,'Percent','Always','Stage1'],
  ['PASS_STEEL_02','โหมดป้อมปราการ','Fortress Protocol','STEEL','เหล็ก','เมื่อยืนนิ่ง/Guard','เพิ่ม DEF และต้าน Stagger',20,'Percent','Combat','Stage2'],
  ['PASS_GHOST_01','ร่างไร้สสาร','Ethereal Body','GHOST','วิญญาณ','ทุก 12 วินาที','หลบ Damage ครั้งถัดไปบางส่วน',25,'Percent','Combat','Stage1'],
  ['PASS_GHOST_02','เสียงสะท้อนวิญญาณ','Soul Echo','GHOST','วิญญาณ','เมื่อใช้สกิล Ghost','มีโอกาสคืน Uses 1 ครั้ง',12,'ChancePct','Combat','Stage2'],
];

const RESOLVER_READY_IDS = new Set(PASSIVE_RUNTIME_POLICY.resolverReadyPassiveIds);

export const PASSIVE_CATALOG = Object.freeze(RAW_PASSIVES.map(([
  id,
  nameTH,
  nameEN,
  sourceType,
  typeTH,
  trigger,
  effect,
  value,
  valueUnit,
  scope,
  unlockStage,
]) => Object.freeze({
  id,
  nameTH,
  nameEN,
  sourceType,
  typeTH,
  trigger,
  effect,
  value,
  valueUnit,
  scope,
  unlockStage,
  activation: RESOLVER_READY_IDS.has(id) ? 'resolver_ready' : 'catalog_only',
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
})));

const PASSIVE_BY_ID = new Map(PASSIVE_CATALOG.map(passive => [passive.id, passive]));
const SOURCE_TYPES = new Set(RAW_PASSIVES.map(row => row[3]));
const VALUE_UNITS = new Set(['Percent', 'PercentHP', 'ChancePct', 'Stack', 'Count']);
const SCOPES = new Set(['Always', 'Combat']);
const UNLOCK_STAGES = new Set(['Stage1', 'Stage2']);
const RUNTIME_FIELDS = new Set([
  'processedEventIds',
  'encounterId',
  'currentStacks',
  'cooldownRemaining',
  'remainingSec',
  'ownerInstanceId',
]);

function issue(code, index, field, detail = {}) {
  return Object.freeze({ code, index, field, ...detail });
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validatePassiveCatalog(records) {
  if (!Array.isArray(records)) {
    return Object.freeze({ ok: false, issues: Object.freeze([issue('invalid_catalog', -1, 'root')]) });
  }
  const issues = [];
  if (records.length !== 36) issues.push(issue('passive_count_mismatch', -1, 'length', { value: records.length }));
  const ids = new Set();
  const countsByType = new Map();

  records.forEach((passive, index) => {
    if (!passive || typeof passive !== 'object' || Array.isArray(passive)) {
      issues.push(issue('invalid_passive', index, 'root'));
      return;
    }
    if (!CONTENT_ID_PATTERNS.passives.test(passive.id)) {
      issues.push(issue('invalid_passive_id', index, 'id', { id: passive.id ?? null }));
    } else if (ids.has(passive.id)) {
      issues.push(issue('duplicate_passive_id', index, 'id', { id: passive.id }));
    }
    ids.add(passive.id);
    for (const field of ['nameTH', 'nameEN', 'typeTH', 'trigger', 'effect']) {
      if (!nonEmptyString(passive[field])) issues.push(issue('missing_passive_field', index, field));
    }
    if (!SOURCE_TYPES.has(passive.sourceType)) issues.push(issue('invalid_source_type', index, 'sourceType'));
    if (!Number.isFinite(passive.value) || passive.value < 0) issues.push(issue('invalid_passive_value', index, 'value'));
    if (!VALUE_UNITS.has(passive.valueUnit)) issues.push(issue('invalid_value_unit', index, 'valueUnit'));
    if (!SCOPES.has(passive.scope)) issues.push(issue('invalid_scope', index, 'scope'));
    if (!UNLOCK_STAGES.has(passive.unlockStage)) issues.push(issue('invalid_unlock_stage', index, 'unlockStage'));
    const expectedStage = passive.id?.endsWith('_01') ? 'Stage1' : passive.id?.endsWith('_02') ? 'Stage2' : null;
    if (expectedStage !== passive.unlockStage) issues.push(issue('passive_stage_mismatch', index, 'unlockStage'));
    if (passive.id !== `PASS_${passive.sourceType}_${passive.unlockStage === 'Stage1' ? '01' : '02'}`) {
      issues.push(issue('passive_source_type_mismatch', index, 'sourceType'));
    }
    const expectedActivation = RESOLVER_READY_IDS.has(passive.id) ? 'resolver_ready' : 'catalog_only';
    if (passive.activation !== expectedActivation) issues.push(issue('unauthorized_runtime_activation', index, 'activation'));
    if (passive.sourceWorkbookVersion !== CONTENT_PROVENANCE.workbookVersion) {
      issues.push(issue('workbook_version_mismatch', index, 'sourceWorkbookVersion'));
    }
    for (const field of RUNTIME_FIELDS) {
      if (field in passive) issues.push(issue('runtime_field_in_passive_master', index, field));
    }
    const stages = countsByType.get(passive.sourceType) ?? [];
    stages.push(passive.unlockStage);
    countsByType.set(passive.sourceType, stages);
  });

  if (countsByType.size !== 18) issues.push(issue('source_type_count_mismatch', -1, 'sourceType'));
  for (const [sourceType, stages] of countsByType) {
    if (stages.length !== 2 || stages[0] !== 'Stage1' || stages[1] !== 'Stage2') {
      issues.push(issue('source_type_stage_pair_mismatch', -1, 'unlockStage', { sourceType }));
    }
  }

  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function passiveCatalogEntry(passiveId) {
  return PASSIVE_BY_ID.get(passiveId) ?? null;
}

export const PASSIVE_SPECIES_PROFILES = Object.freeze(MONSTER_CATALOG.map(mapping => {
  const passiveType = mapping.workbookTypeCandidate;
  return Object.freeze({
    runtimeSpeciesId: mapping.runtimeSpeciesId,
    workbookBaseMonsterId: mapping.workbookBaseMonsterId,
    workbookStage2MonsterId: mapping.workbookStage2MonsterId,
    passive1Id: `PASS_${passiveType}_01`,
    passive2Id: `PASS_${passiveType}_02`,
    selectedSlotPolicy: 'passive1_default',
    sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  });
}));

const PASSIVE_PROFILE_BY_SPECIES = new Map(PASSIVE_SPECIES_PROFILES.map(profile => [profile.runtimeSpeciesId, profile]));

export function validatePassiveSpeciesProfiles(records) {
  if (!Array.isArray(records)) {
    return Object.freeze({ ok: false, issues: Object.freeze([issue('invalid_profile_catalog', -1, 'root')]) });
  }
  const issues = [];
  if (records.length !== 18) issues.push(issue('profile_count_mismatch', -1, 'length', { value: records.length }));
  const runtimeIds = new Set();
  const baseIds = new Set();
  const stage2Ids = new Set();
  records.forEach((profile, index) => {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      issues.push(issue('invalid_passive_profile', index, 'root'));
      return;
    }
    const expected = MONSTER_CATALOG.find(mapping => mapping.runtimeSpeciesId === profile.runtimeSpeciesId);
    if (!expected
      || profile.workbookBaseMonsterId !== expected.workbookBaseMonsterId
      || profile.workbookStage2MonsterId !== expected.workbookStage2MonsterId) {
      issues.push(issue('profile_species_mapping_mismatch', index, 'runtimeSpeciesId'));
    }
    for (const [set, value, code, field] of [
      [runtimeIds, profile.runtimeSpeciesId, 'duplicate_profile_species', 'runtimeSpeciesId'],
      [baseIds, profile.workbookBaseMonsterId, 'duplicate_profile_base', 'workbookBaseMonsterId'],
      [stage2Ids, profile.workbookStage2MonsterId, 'duplicate_profile_stage2', 'workbookStage2MonsterId'],
    ]) {
      if (!nonEmptyString(value)) issues.push(issue('invalid_profile_id', index, field));
      else if (set.has(value)) issues.push(issue(code, index, field, { id: value }));
      set.add(value);
    }
    const passive1 = passiveCatalogEntry(profile.passive1Id);
    const passive2 = passiveCatalogEntry(profile.passive2Id);
    if (!passive1 || !passive2) issues.push(issue('unknown_profile_passive', index, 'passiveId'));
    if (passive1 && passive1.unlockStage !== 'Stage1') issues.push(issue('profile_passive1_stage_mismatch', index, 'passive1Id'));
    if (passive2 && passive2.unlockStage !== 'Stage2') issues.push(issue('profile_passive2_stage_mismatch', index, 'passive2Id'));
    if (passive1 && passive2 && passive1.sourceType !== passive2.sourceType) {
      issues.push(issue('profile_passive_type_mismatch', index, 'passive2Id'));
    }
    if (expected && passive1 && passive1.sourceType !== expected.workbookTypeCandidate) {
      issues.push(issue('profile_species_passive_type_mismatch', index, 'passive1Id'));
    }
    if (expected && passive2 && passive2.sourceType !== expected.workbookTypeCandidate) {
      issues.push(issue('profile_species_passive_type_mismatch', index, 'passive2Id'));
    }
    if (profile.selectedSlotPolicy !== 'passive1_default') {
      issues.push(issue('invalid_profile_selection_policy', index, 'selectedSlotPolicy'));
    }
    if (profile.sourceWorkbookVersion !== CONTENT_PROVENANCE.workbookVersion) {
      issues.push(issue('workbook_version_mismatch', index, 'sourceWorkbookVersion'));
    }
  });
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function passiveSpeciesProfile(runtimeSpeciesId) {
  return PASSIVE_PROFILE_BY_SPECIES.get(runtimeSpeciesId) ?? null;
}

export function defaultPassiveIdForSpecies(runtimeSpeciesId) {
  return passiveSpeciesProfile(runtimeSpeciesId)?.passive1Id ?? null;
}

export function isPassiveEligibleForSpecies(runtimeSpeciesId, passiveId) {
  const profile = passiveSpeciesProfile(runtimeSpeciesId);
  return Boolean(profile && passiveId === profile.passive1Id);
}

const catalogValidation = validatePassiveCatalog(PASSIVE_CATALOG);
if (!catalogValidation.ok) {
  throw new TypeError(`Invalid passive catalog: ${catalogValidation.issues.map(entry => entry.code).join(', ')}`);
}
const profileValidation = validatePassiveSpeciesProfiles(PASSIVE_SPECIES_PROFILES);
if (!profileValidation.ok) {
  throw new TypeError(`Invalid passive species profiles: ${profileValidation.issues.map(entry => entry.code).join(', ')}`);
}
