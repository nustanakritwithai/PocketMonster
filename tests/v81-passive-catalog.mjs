import assert from 'node:assert/strict';
import {
  PASSIVE_CATALOG,
  PASSIVE_RUNTIME_POLICY,
  PASSIVE_SPECIES_PROFILES,
  defaultPassiveIdForSpecies,
  isPassiveEligibleForSpecies,
  passiveCatalogEntry,
  passiveSpeciesProfile,
  validatePassiveCatalog,
  validatePassiveSpeciesProfiles,
} from '../passive-catalog.mjs';

const EXPECTED_PASSIVES = [
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

assert.equal(PASSIVE_CATALOG.length, 36, 'Passive_Master A2:K37 contains exactly 36 rows');
assert.equal(validatePassiveCatalog(PASSIVE_CATALOG).ok, true);
assert.deepEqual(PASSIVE_CATALOG.map(passive => [
  passive.id,
  passive.nameTH,
  passive.nameEN,
  passive.sourceType,
  passive.typeTH,
  passive.trigger,
  passive.effect,
  passive.value,
  passive.valueUnit,
  passive.scope,
  passive.unlockStage,
]), EXPECTED_PASSIVES, 'catalog is an exact normalized projection of Passive_Master');

assert.deepEqual(PASSIVE_RUNTIME_POLICY.resolverReadyPassiveIds, ['PASS_ROCK_01']);
assert.equal(PASSIVE_RUNTIME_POLICY.unlistedEffectPolicy, 'catalog_only_noop');
assert.equal(PASSIVE_RUNTIME_POLICY.eventStatePersistence, 'do_not_persist');
assert.equal(PASSIVE_RUNTIME_POLICY.lightRuntimeActivation, 'deferred_D2');
assert.equal(PASSIVE_RUNTIME_POLICY.passiveSelection, 'stage1_default_stage2_selection_deferred');

const byType = Object.groupBy(PASSIVE_CATALOG, passive => passive.sourceType);
assert.equal(Object.keys(byType).length, 18);
for (const passives of Object.values(byType)) {
  assert.deepEqual(passives.map(passive => passive.unlockStage), ['Stage1', 'Stage2']);
}

const stoneHide = passiveCatalogEntry('PASS_ROCK_01');
assert.equal(stoneHide.nameEN, 'Stone Hide');
assert.equal(stoneHide.activation, 'resolver_ready');
assert.equal(passiveCatalogEntry('PASS_LIGHT_01').activation, 'catalog_only');
assert.equal(passiveCatalogEntry('PASS_UNKNOWN_99'), null);
assert.equal(Object.isFrozen(PASSIVE_CATALOG), true);
assert.equal(Object.isFrozen(stoneHide), true);

assert.equal(PASSIVE_SPECIES_PROFILES.length, 18, 'Monster_Profile contributes one runtime family profile per source type');
assert.equal(validatePassiveSpeciesProfiles(PASSIVE_SPECIES_PROFILES).ok, true);
assert.deepEqual(passiveSpeciesProfile('rockhorn'), {
  runtimeSpeciesId: 'rockhorn',
  workbookBaseMonsterId: 'MON_007',
  workbookStage2MonsterId: 'MON_025',
  passive1Id: 'PASS_ROCK_01',
  passive2Id: 'PASS_ROCK_02',
  selectedSlotPolicy: 'passive1_default',
  sourceWorkbookVersion: '2.1',
});
assert.equal(defaultPassiveIdForSpecies('rockhorn'), 'PASS_ROCK_01');
assert.equal(defaultPassiveIdForSpecies('fairimp'), 'PASS_LIGHT_01', 'LIGHT remains only a source catalog identity');
assert.equal(defaultPassiveIdForSpecies('unknown'), null);
assert.equal(isPassiveEligibleForSpecies('rockhorn', 'PASS_ROCK_01'), true);
assert.equal(isPassiveEligibleForSpecies('rockhorn', 'PASS_ROCK_02'), false, 'Stage2 slot selection remains deferred');
assert.equal(isPassiveEligibleForSpecies('normalooze', 'PASS_ROCK_01'), false);

const duplicate = PASSIVE_CATALOG.map(passive => ({ ...passive }));
duplicate[1].id = duplicate[0].id;
assert.ok(validatePassiveCatalog(duplicate).issues.some(issue => issue.code === 'duplicate_passive_id'));

const runtimeLeak = PASSIVE_CATALOG.map(passive => ({ ...passive }));
runtimeLeak[0].processedEventIds = ['event-1'];
assert.ok(validatePassiveCatalog(runtimeLeak).issues.some(issue => issue.code === 'runtime_field_in_passive_master'));

const activatedLight = PASSIVE_CATALOG.map(passive => ({ ...passive }));
activatedLight.find(passive => passive.id === 'PASS_LIGHT_01').activation = 'resolver_ready';
assert.ok(validatePassiveCatalog(activatedLight).issues.some(issue => issue.code === 'unauthorized_runtime_activation'));

const swappedCatalogTypes = PASSIVE_CATALOG.map(passive => ({ ...passive }));
for (const passive of swappedCatalogTypes) {
  if (passive.sourceType === 'NORMAL') passive.sourceType = 'FIRE';
  else if (passive.sourceType === 'FIRE') passive.sourceType = 'NORMAL';
}
assert.ok(validatePassiveCatalog(swappedCatalogTypes).issues.some(issue => issue.code === 'passive_source_type_mismatch'),
  'the type encoded by PassiveID cannot be swapped while preserving pair counts');

const danglingProfile = PASSIVE_SPECIES_PROFILES.map(profile => ({ ...profile }));
danglingProfile[0].passive1Id = 'PASS_UNKNOWN_99';
assert.ok(validatePassiveSpeciesProfiles(danglingProfile).issues.some(issue => issue.code === 'unknown_profile_passive'));

const wrongFamilyProfile = PASSIVE_SPECIES_PROFILES.map(profile => ({ ...profile }));
const rockProfile = wrongFamilyProfile.find(profile => profile.runtimeSpeciesId === 'rockhorn');
rockProfile.passive1Id = 'PASS_NORMAL_01';
rockProfile.passive2Id = 'PASS_NORMAL_02';
assert.ok(validatePassiveSpeciesProfiles(wrongFamilyProfile).issues.some(
  issue => issue.code === 'profile_species_passive_type_mismatch'),
'species profiles must bind passives to the workbook type candidate');

console.log('V8.1 A34 passive catalog: PASS');
