// PocketMonster V8.1 A36 — immutable workbook skill-button descriptors.
// The workbook's "CURRENT" columns are a documentation snapshot, not live
// runtime authority. A37 owns Character Skills UI integration.

import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { SKILL_CATALOG } from './skill-catalog.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

const SNAPSHOT_COMMIT = 'd797e102e3305cd35c45cfcad90ffb9616a5599a';
const RUNTIME_SOURCE_URL = `https://github.com/nustanakritwithai/PocketMonster/blob/${SNAPSHOT_COMMIT}/game-v800.js`;
const PLAN_SOURCE_URL = `https://github.com/nustanakritwithai/PocketMonster/blob/${SNAPSHOT_COMMIT}/SKILL-ICON-UI-PLAN-V8.md`;
const SKILL_ROW_SOURCE_URL = `${PLAN_SOURCE_URL} | ${RUNTIME_SOURCE_URL}`;

export const SKILL_ICON_POLICY = Object.freeze({
  authorityRanges: Object.freeze([
    'Skill_Icon_Legend!A1:J46',
    'Skill_Button_Icons!A1:AB109',
    'Skill_Button_States!A1:I8',
    'Skill_Button_UI_Audit!A1:F14',
  ]),
  descriptorCount: 108,
  descriptorJoinKey: 'SkillID',
  documentedCurrentMainIconKindCount: 5,
  documentedElementSymbolCount: 18,
  documentedCategoryMarkerCount: 7,
  documentedRawEffectCount: 53,
  documentedGroundPointGapCount: 1,
  documentedLightFairyMismatchCount: 6,
  workbookEquippedSkillSlotCount: 4,
  characterSkillsIntegration: 'deferred_A37',
  runtimeMutation: 'none_descriptor_only',
  auditColumnsAreSnapshot: true,
  lightRuntimeActivation: 'deferred_D2',
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
});

const RAW_LAYER_LEGEND = [
  ['Main target icon', 'enemy', '↗', 'ลูกศรเฉียงพร้อมหัวลูกศร', 'โจมตีเป้าหมายเดียว', 'CURRENT', 'กลางปุ่ม', 'ขาวบนสีธาตุ', RUNTIME_SOURCE_URL, "มาจาก getSkillIcon(kind='enemy')"],
  ['Main target icon', 'area', '◎◎◎', 'วงกลม 3 ชั้น + เส้นรัศมี', 'โจมตีหลายเป้าหมายรอบพื้นที่', 'CURRENT', 'กลางปุ่ม', 'ขาวบนสีธาตุ', RUNTIME_SOURCE_URL, "มาจาก getSkillIcon(kind='area')"],
  ['Main target icon', 'heal', '+', 'กากบาทหนา', 'ฟื้น HP ตัวเอง', 'CURRENT', 'กลางปุ่ม', 'ขาว/เขียวประกอบ', RUNTIME_SOURCE_URL, "มาจาก getSkillIcon(kind='heal')"],
  ['Main target icon', 'shield', '⬟', 'โล่ปลายแหลม/ขอบหนา', 'ป้องกัน/ลดดาเมจ', 'CURRENT', 'กลางปุ่ม', 'ขาวบนสีธาตุ', RUNTIME_SOURCE_URL, "มาจาก getSkillIcon(kind='shield')"],
  ['Main target icon', 'buff', '⇧⇧', 'ลูกศรคู่ชี้ขึ้น', 'บัฟตัวเอง', 'CURRENT', 'กลางปุ่ม', 'ขาวบนสีธาตุ', RUNTIME_SOURCE_URL, "มาจาก getSkillIcon(kind='buff')"],
  ['Fallback', 'empty', '◌', 'วงกลมเส้นประ', 'ไม่มีสกิลหรือ target ไม่รู้จัก', 'CURRENT', 'กลางปุ่ม', 'ขาว', RUNTIME_SOURCE_URL, 'default ใน getSkillIcon'],
  ['Cooldown state', 'cooldown', 'ตัวเลข s', 'ตัวเลขเวลาคงเหลือทับปุ่ม', 'สกิลยังใช้ไม่ได้จน CD หมด', 'CURRENT', 'Overlay กลางปุ่ม', 'เทา/ลดความเด่น', RUNTIME_SOURCE_URL, 'updateOwned() สร้าง .cd-overlay เช่น 3.2s'],
  ['Element identity', 'type-symbol', 'ตามธาตุ', 'สัญลักษณ์ธาตุเฉพาะ', 'อ่านธาตุได้โดยไม่อ่านชื่อ', 'PLANNED/DESIGN', 'มุมซ้ายบน/พื้นหลัง', 'ELEMENT_FX core/accent', PLAN_SOURCE_URL, 'แผน V8 ระบุ 18 ธาตุ; runtime ปัจจุบัน main icon เป็น target/action'],
  ['Category marker', 'category', 'เล็ก 1 ตัว', 'รอยฟัน/ประกาย/โล่/ดาว', 'แยก Physical/Special/Support/Control/Heal/Defense/Ultimate', 'WORKBOOK DESIGN', 'มุมขวาบน', 'ขาว/สี contrast', 'Workbook v2.1', 'เพิ่มเพื่ออ่านสกิล 108 รายการง่ายขึ้น'],
  ['Effect overlay', 'effect', 'สัญลักษณ์ย่อย', 'ไฟ/พิษ/Slow/Root/ฯลฯ', 'บอกสถานะหรือกลไกสำคัญ', 'WORKBOOK DESIGN', 'ขอบล่างซ้าย', 'สีสถานะ', 'Workbook v2.1', 'ไม่ควรใหญ่กว่า main target icon'],
  ['Uses badge', 'uses', 'n/max', 'ตัวเลขจำนวนครั้งใช้', 'จำนวนครั้งสกิลเหลือ', 'WORKBOOK DESIGN', 'ขอบล่างขวา', 'ขาว; แดงเมื่อ 0', 'Workbook v2.1', 'เชื่อม Skill_Master.MaxUses + runtime CurrentUses'],
];

export const SKILL_ICON_LAYER_LEGEND = Object.freeze(RAW_LAYER_LEGEND.map(([
  layer, iconKey, symbol, shapeDescription, meaning, runtimeStatus,
  placementOnButton, colorRule, sourceUrl, notes,
]) => Object.freeze({
  layer,
  iconKey,
  symbol,
  shapeDescription,
  meaning,
  runtimeStatus,
  placementOnButton,
  colorRule,
  sourceUrl,
  notes,
})));

const RAW_TYPE_LEGEND = [
  ['NORMAL', '●', 'วงกลมทึบ', 'พลังพื้นฐาน/ไม่มีคุณสมบัติเด่น', 'น้ำตาลครีม', 'Normal', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
  ['FIRE', '🔥', 'เปลวไฟ 3 เปลว', 'ไฟ/ความร้อน/เผาไหม้', 'ส้ม/ทอง', 'Fire', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
  ['WATER', '💧', 'หยดน้ำ', 'น้ำ/ของเหลว/การไหล', 'ฟ้า/ฟ้าอ่อน', 'Water', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
  ['ELECTRIC', '⚡', 'สายฟ้าเซ็กแซก', 'ไฟฟ้า/ช็อต/ความเร็ว', 'เหลือง/ครีม', 'Electric', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
  ['GRASS', '🍃', 'ใบไม้', 'พืช/ธรรมชาติ/การฟื้นตัว', 'เขียว/เขียวอ่อน', 'Grass', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
  ['ICE', '❄', 'ผลึกหิมะ 6 แฉก', 'น้ำแข็ง/ความเย็น/แช่แข็ง', 'ฟ้าเย็น/ขาว', 'Ice', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
  ['ROCK', '◆', 'ก้อนหินเหลี่ยม', 'หิน/น้ำหนัก/ความแข็ง', 'น้ำตาลหิน/ครีม', 'Rock', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
  ['GROUND', '⛰', 'ภูเขา/ก้อนดิน', 'ดิน/พื้น/การมุด', 'น้ำตาลทอง/ครีม', 'Ground', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
  ['FLYING', '🪽', 'ปีกนก', 'บิน/ลม/การเคลื่อนที่', 'ม่วงฟ้า/ขาวม่วง', 'Flying', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
  ['POISON', '☠', 'หัวกะโหลกพิษ', 'พิษ/DoT/กัดกร่อน', 'ม่วง/ม่วงอ่อน', 'Poison', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
  ['DARK', '◐', 'พระจันทร์เสี้ยวเข้ม', 'ความมืด/ลอบโจมตี/เงา', 'น้ำตาลดำ/เทาอ่อน', 'Dark', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
  ['LIGHT', '✦', 'ดาวเรืองแสงมีรัศมี', 'แสง/ศักดิ์สิทธิ์/สนับสนุน; workbook ใช้ LIGHT ขณะที่ runtime ปัจจุบันใช้ Fairy', 'ชมพูเรือง/ขาวเรือง (runtime Fairy palette pending reconciliation)', 'Fairy (review)', 'TYPE MODEL MISMATCH', 'Workbook LIGHT ≠ runtime Fairy; keep flagged until type system is reconciled.'],
  ['PSYCHIC', '◉', 'ดวงตาที่สาม', 'จิต/ควบคุม/พลังจิต', 'ชมพู/ชมพูอ่อน', 'Psychic', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
  ['BUG', '🐞', 'รูปแมลง', 'แมลง/ใย/ฝูง', 'เขียวมะกอก/เหลืองอ่อน', 'Bug', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
  ['DRAGON', '🐉', 'หัว/เงามังกร', 'มังกร/พลังระดับสูง', 'ม่วงสด/ลาเวนเดอร์', 'Dragon', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
  ['FIGHTING', '✊', 'หมัดกำ', 'ต่อสู้ประชิด/คอมโบ', 'แดง/ชมพูอ่อน', 'Fighting', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
  ['STEEL', '⚙', 'เฟืองโลหะ', 'เหล็ก/เกราะ/เครื่องจักร', 'เทาเงิน/ขาวเงิน', 'Steel', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
  ['GHOST', '👻', 'เงาผี', 'วิญญาณ/ล่องหน/ดูดพลัง', 'ม่วงเข้ม/ม่วงอ่อน', 'Ghost', 'CURRENT PALETTE / PLANNED SYMBOL', ''],
];

export const SKILL_TYPE_ICON_LEGEND = Object.freeze(RAW_TYPE_LEGEND.map(([
  sourceType, symbol, symbolDescription, meaning, palette,
  runtimeEquivalent, status, notes,
]) => Object.freeze({
  sourceType,
  symbol,
  symbolDescription,
  meaning,
  palette,
  runtimeEquivalent,
  status,
  sourceUrl: PLAN_SOURCE_URL,
  notes,
})));

const RAW_CATEGORY_LEGEND = [
  ['Physical', '╱', 'รอยฟัน/เส้นเฉียง', 'โจมตีกายภาพ ใช้ ATK เป็นหลัก'],
  ['Special', '✧', 'ประกายพลัง', 'โจมตีพิเศษ/เวท ใช้ SPATK เป็นหลัก'],
  ['Support', '⇧', 'ลูกศรขึ้น', 'บัฟ/สนับสนุน'],
  ['Control', '◎', 'เป้า/วงควบคุม', 'ควบคุมพื้นที่หรือสถานะ'],
  ['Heal', '+', 'เครื่องหมายบวก', 'ฟื้น HP'],
  ['Defense', '⬟', 'โล่หกเหลี่ยม', 'ป้องกัน/สร้างกำแพง/ลดดาเมจ'],
  ['Ultimate', '✹', 'ดาวระเบิด/ตราท่าไม้ตาย', 'ท่าพลังสูง จำนวนครั้งใช้น้อย'],
];

export const SKILL_CATEGORY_ICON_LEGEND = Object.freeze(RAW_CATEGORY_LEGEND.map(([
  category, marker, shapeDescription, meaning,
]) => Object.freeze({
  category,
  marker,
  shapeDescription,
  meaning,
  recommendedPlacement: 'มุมขวาบน',
  status: 'WORKBOOK DESIGN',
  notes: 'เสริม main target icon; ไม่แทน icon ธาตุ',
})));

const RAW_EFFECT_LEGEND = [
  ['None', '', 'ไม่มีสถานะพิเศษถาวร'],
  ['QuickHit', '≋', 'โจมตีเร็ว'],
  ['ATKUp', '⚔↑', 'เพิ่ม ATK'],
  ['Stagger', '✦', 'ชะงัก/interrupt สั้น'],
  ['CritUp', '✦◎', 'เพิ่มโอกาส Critical'],
  ['Knockback', '⇢', 'ผลักศัตรูออก'],
  ['Burn', '🔥', 'มีโอกาสติด Burn'],
  ['FireResist', '🛡🔥', 'ต้านดาเมจไฟ'],
  ['BurnArea', '🔥○', 'เผาไหม้เป็นพื้นที่'],
  ['DamageReduce', '🛡', 'ลด Damage ที่ได้รับ'],
  ['Splash', '◉≈', 'ดาเมจกระจายรอบจุด'],
  ['Slow', '▼', 'ลดความเร็ว'],
  ['DEFUp', '🛡↑', 'เพิ่ม DEF'],
  ['Root', '⌇', 'ตรึงการเคลื่อนที่'],
  ['Heal', '+', 'ฟื้น HP'],
  ['Paralyze', '⚡', 'มีโอกาส Paralyze'],
  ['SPATKUp', '✦↑', 'เพิ่ม SPATK'],
  ['ShockArea', '⚡○', 'ช็อตเป็นพื้นที่'],
  ['Wall', '▥', 'สร้างกำแพง'],
  ['FreezeChance', '❄', 'มีโอกาส Freeze'],
  ['Stun', '✹', 'ทำให้ Stun'],
  ['AreaHazard', '⚠○', 'สร้างพื้นที่อันตรายคงอยู่'],
  ['Burrow', '⌄', 'มุดดิน'],
  ['ArmorBreak', '🛡✕', 'เจาะ/ลดเกราะ'],
  ['SlowArea', '▼○', 'พื้นที่ลดความเร็ว'],
  ['SPDUp', '»', 'เพิ่มความเร็ว'],
  ['Dash', '➤', 'Dash'],
  ['Bleed', '♦', 'ทำให้ Bleed'],
  ['Pull', '⇠⇢', 'ดึงศัตรูเข้าหา'],
  ['Poison', '☠', 'มีโอกาสติด Poison'],
  ['PoisonResist', '🛡☠', 'ต้านการติดพิษ'],
  ['PoisonArea', '☠○', 'พิษเป็นพื้นที่'],
  ['DEFDown', '🛡↓', 'ลด DEF'],
  ['StrongPoison', '☠×2', 'พิษเข้ม/เริ่มหลาย Stack'],
  ['Blink', '✦→', 'วาร์ประยะสั้น'],
  ['EvasionUp', '〰', 'เพิ่มการหลบ'],
  ['Fear', '◉!', 'ทำให้ Fear'],
  ['DamageAmp', '◎!', 'เพิ่ม Damage Taken'],
  ['BonusVsDark', '✦◐', 'โบนัสเมื่อโจมตี Dark'],
  ['ATKDEFUp', '⚔🛡', 'เพิ่ม ATK และ DEF'],
  ['AccuracyDown', '◎×', 'ลด Accuracy'],
  ['Confuse', '↻?', 'ทำให้สับสน'],
  ['DoT', '•', 'DoT'],
  ['SummonSwarm', '•••', 'เรียกฝูงแมลง/ยูนิต'],
  ['BurnParalyze', '🔥⚡', 'Burn และ Paralyze'],
  ['ATKDown', '⚔↓', 'ลด ATK'],
  ['AreaBurst', '✹○', 'Burst พื้นที่'],
  ['ArmorPierce', '➜🛡', 'เจาะ DEF'],
  ['MultiHit', '╱╱╱', 'โจมตีหลาย Hit'],
  ['LineShot', '━➤', 'โจมตีเป็นแนวเส้น'],
  ['Pierce', '━━➤', 'โจมตีทะลุ'],
  ['LifeSteal', '+♦', 'ดูด HP จากดาเมจ'],
  ['FearArea', '◉○', 'Fear เป็นพื้นที่'],
];

export const SKILL_EFFECT_ICON_LEGEND = Object.freeze(RAW_EFFECT_LEGEND.map(([
  effect, overlay, overlayDescription,
]) => Object.freeze({ effect, overlay, overlayDescription })));

const RAW_BUTTON_STATES = [
  ['Ready', 'สีธาตุเต็ม + icon ขาวคม', 'แสดงปกติ', 'Current/Max', 'ไม่มี', 'กดใช้สกิล', 'อ่านชื่อ/ธาตุ/เป้าหมาย/Uses/CD', 'CURRENT + USES DESIGN', 'Runtime ปัจจุบันมีสีธาตุ/ไอคอน; Uses เป็นระบบใน workbook'],
  ['Cooldown', 'ลดความเด่น/เทา', 'ยังเห็น icon ใต้ overlay', 'ยังแสดง', 'ตัวเลข เช่น 3.2s', 'กดแล้วแจ้งคูลดาวน์', 'aria แจ้งเวลาคงเหลือ', 'CURRENT', 'updateOwned() สร้าง .cd-overlay'],
  ['No Uses', 'ขอบ/Badge แดง', 'icon คงเดิม', '0/Max สีแดง', 'อาจไม่มี CD', 'ปิดการใช้', 'แจ้งจำนวนครั้งหมด', 'WORKBOOK DESIGN', 'ต้อง wire CurrentUses เข้าปุ่ม'],
  ['No Target', 'icon ปกติแต่ action fail', 'Enemy/Area icon', 'คงเดิม', 'ไม่มีถ้าพร้อม', 'กดแล้วแจ้งไม่มีศัตรูในระยะ', 'แจ้งเหตุผล', 'CURRENT', 'useSkill() ตรวจ target/range'],
  ['Locked/Not Learned', 'ล็อก/opacity ต่ำ', '🔒', '—', '—', 'กดไม่ได้', 'แจ้งเงื่อนไขเรียน', 'WORKBOOK DESIGN', 'เหมาะกับ Character Skill UI มากกว่า combat hotbar'],
  ['Active Buff', 'แหวน/เส้นรอบปุ่มเล็ก', 'Buff/Shield', 'คงเดิม', 'CD อาจเดินต่อ', 'ใช้ซ้ำตามกฎ', 'แจ้ง buff remaining', 'DESIGN', 'Runtime buff timer อยู่ที่ summon แต่ยังไม่แสดงบนปุ่มเป็น duration ring'],
  ['Ultimate Low Uses', 'ขอบพิเศษ/✹', 'ตาม target icon', '2–5 ครั้ง', 'CD ยาว', 'กดใช้ตามปกติ', 'อ่านว่า Ultimate', 'WORKBOOK DESIGN', 'Category marker ✹ ช่วยแยกท่าไม้ตาย'],
];

export const SKILL_BUTTON_STATE_CATALOG = Object.freeze(RAW_BUTTON_STATES.map(([
  state, visualSignal, mainIcon, usesBadge, cooldownOverlay,
  tapBehavior, accessibility, runtimeStatus, notes,
]) => Object.freeze({
  state,
  visualSignal,
  mainIcon,
  usesBadge,
  cooldownOverlay,
  tapBehavior,
  accessibility,
  runtimeStatus,
  notes,
})));

export const SKILL_ICON_UI_AUDIT = Object.freeze({
  snapshotCommit: SNAPSHOT_COMMIT,
  liveRuntimeTruth: false,
  kpis: Object.freeze({
    documentedSkillRows: 108,
    documentedCurrentMainIconKinds: 5,
    documentedElementSymbols: 18,
    documentedCategoryMarkers: 7,
    documentedRawEffects: 53,
    documentedGroundPointRuntimeGaps: 1,
    documentedLightFairyMismatches: 6,
    documentedRuntimeCombatButtons: 3,
    workbookEquippedSkillSlots: 4,
    formulaOrTableErrors: 0,
  }),
  findings: Object.freeze([
    Object.freeze({ auditId: 'ICON-A01', severity: 'INFO', finding: 'Runtime main skill icon is target/action-based, not element-symbol-based: enemy/area/heal/shield/buff.' }),
    Object.freeze({ auditId: 'ICON-A02', severity: 'MEDIUM', finding: 'SKILL-ICON-UI-PLAN-V8 describes 18 element icons, but current getSkillIcon() implementation renders target/action icons instead.' }),
    Object.freeze({ auditId: 'ICON-A03', severity: 'MEDIUM', finding: '1 GroundPoint skill(s) have no dedicated branch in current skillIconKind(); documentation uses a design fallback.' }),
    Object.freeze({ auditId: 'ICON-A04', severity: 'HIGH', finding: '6 workbook LIGHT skill(s) do not have a 1:1 runtime type because runtime currently uses Fairy instead of Light.' }),
    Object.freeze({ auditId: 'ICON-A05', severity: 'MEDIUM', finding: 'Runtime combat hotbar currently iterates 3 skill buttons, while workbook design/equipped schema supports 4 slots.' }),
    Object.freeze({ auditId: 'ICON-A06', severity: 'INFO', finding: 'Cooldown overlay with seconds is already implemented; limited Uses badge is documented here but needs runtime wiring.' }),
  ]),
});

const TYPE_LABEL_TH = Object.freeze({
  NORMAL: 'ปกติ',
  FIRE: 'ไฟ',
  WATER: 'น้ำ',
  GRASS: 'พืช',
  ELECTRIC: 'ไฟฟ้า',
  ICE: 'น้ำแข็ง',
  ROCK: 'หิน',
  GROUND: 'ดิน',
  FLYING: 'ลม',
  POISON: 'พิษ',
  DARK: 'มืด',
  LIGHT: 'แสง',
  PSYCHIC: 'พลังจิต',
  BUG: 'แมลง',
  DRAGON: 'มังกร',
  FIGHTING: 'ต่อสู้',
  STEEL: 'เหล็ก',
  GHOST: 'วิญญาณ',
});

const TYPE_BY_SOURCE = new Map(SKILL_TYPE_ICON_LEGEND.map(entry => [entry.sourceType, entry]));
const CATEGORY_BY_NAME = new Map(SKILL_CATEGORY_ICON_LEGEND.map(entry => [entry.category, entry]));
const EFFECT_BY_NAME = new Map(SKILL_EFFECT_ICON_LEGEND.map(entry => [entry.effect, entry]));
const BUTTON_STATE_BY_NAME = new Map(SKILL_BUTTON_STATE_CATALOG.map(entry => [entry.state, entry]));
const SELF_SHIELD_EFFECTS = new Set(['FireResist', 'DamageReduce', 'DEFUp', 'PoisonResist']);
// Skill_Advanced.CanCrit is a separate source field. Its reviewed matrix happens
// to allow these three categories; never substitute Skill_Master.directDamage.
const CRIT_CATEGORIES = new Set(['Physical', 'Special', 'Ultimate']);

const TARGET_ICON_RULES = Object.freeze({
  enemy: Object.freeze({
    documentedIconKind: 'enemy',
    documentedMainSymbol: '↗',
    documentedMainShapeDescription: 'ลูกศรเฉียงพุ่งเข้าหาเป้าหมาย',
    documentedRuntimeCoverage: 'CURRENT',
    implementationStatus: 'CURRENT MAIN ICON + DOCUMENTED OVERLAYS',
    notes: 'โจมตีเป้าหมายเดียวใช้ลูกศร',
  }),
  area: Object.freeze({
    documentedIconKind: 'area',
    documentedMainSymbol: '◎◎◎',
    documentedMainShapeDescription: 'วงกลมซ้อน 3 ชั้น',
    documentedRuntimeCoverage: 'CURRENT',
    implementationStatus: 'CURRENT MAIN ICON + DOCUMENTED OVERLAYS',
    notes: 'โจมตี Area ใช้วงแหวนซ้อน',
  }),
  buff: Object.freeze({
    documentedIconKind: 'buff',
    documentedMainSymbol: '⇧⇧',
    documentedMainShapeDescription: 'เชฟรอน/ลูกศรคู่ชี้ขึ้น',
    documentedRuntimeCoverage: 'CURRENT',
    implementationStatus: 'CURRENT MAIN ICON + DOCUMENTED OVERLAYS',
    notes: 'Self Buff ใช้ลูกศรคู่ชี้ขึ้น',
  }),
  shield: Object.freeze({
    documentedIconKind: 'shield',
    documentedMainSymbol: '⬟',
    documentedMainShapeDescription: 'รูปโล่',
    documentedRuntimeCoverage: 'CURRENT',
    implementationStatus: 'CURRENT MAIN ICON + DOCUMENTED OVERLAYS',
    notes: 'Self Defense/Shield ใช้สัญลักษณ์โล่',
  }),
  heal: Object.freeze({
    documentedIconKind: 'heal',
    documentedMainSymbol: '+',
    documentedMainShapeDescription: 'กากบาทหนา',
    documentedRuntimeCoverage: 'CURRENT',
    implementationStatus: 'CURRENT MAIN ICON + DOCUMENTED OVERLAYS',
    notes: 'สกิล Self-Heal ใช้เครื่องหมายบวก',
  }),
  groundPoint: Object.freeze({
    documentedIconKind: 'groundpoint-fallback',
    documentedMainSymbol: '↗',
    documentedMainShapeDescription: 'Runtime ปัจจุบันไม่มี branch GroundPoint โดยตรง; จะตกไปใช้ enemy icon หากส่งค่าไม่ถูก normalize',
    documentedRuntimeCoverage: 'CURRENT_GAP',
    implementationStatus: 'CURRENT GAP + DESIGN MAPPING',
    notes: 'ควรเพิ่ม ground-point icon เช่นหมุด/วงพื้นที่',
  }),
});

function iconRuleForSkill(skill) {
  if (skill.targetType === 'NearestEnemy') return TARGET_ICON_RULES.enemy;
  if (skill.targetType === 'EnemyArea') return TARGET_ICON_RULES.area;
  if (skill.targetType === 'GroundPoint') return TARGET_ICON_RULES.groundPoint;
  if (skill.targetType === 'Self') {
    if (skill.effect === 'Heal') return TARGET_ICON_RULES.heal;
    if (SELF_SHIELD_EFFECTS.has(skill.effect)) return TARGET_ICON_RULES.shield;
    return TARGET_ICON_RULES.buff;
  }
  throw new TypeError(`Missing workbook icon rule for ${skill.id}`);
}

export const SKILL_ICON_CATALOG = Object.freeze(SKILL_CATALOG.map(skill => {
  const type = TYPE_BY_SOURCE.get(skill.sourceType);
  const category = CATEGORY_BY_NAME.get(skill.category);
  const effect = EFFECT_BY_NAME.get(skill.effect);
  const icon = iconRuleForSkill(skill);
  if (!type || !category || !effect) {
    throw new TypeError(`Missing workbook icon metadata for ${skill.id}`);
  }
  const canCrit = CRIT_CATEGORIES.has(skill.category);
  const critMarker = canCrit ? '✦' : '';
  const effectReading = effect.overlay ? ` → ${effect.overlay} ${skill.effect}` : '';
  const buttonReadingOrder = `${icon.documentedMainSymbol} Main → ${type.symbol} ${skill.sourceType} → ${category.marker} ${skill.category}${effectReading} → Uses → CD`;
  const accessibilityLabelTH = `${skill.nameTH}, ธาตุ ${TYPE_LABEL_TH[skill.sourceType]}, ${skill.category}, เป้าหมาย ${skill.targetType}, ใช้ได้สูงสุด ${skill.maxUses} ครั้ง, คูลดาวน์ ${skill.cooldownSec} วินาที${skill.effect === 'None' ? '' : `, เอฟเฟกต์ ${skill.effect}`}${canCrit ? ', คริติคอลได้' : ''}`;
  const notes = skill.sourceType === 'LIGHT'
    ? `${icon.notes} | Workbook LIGHT uses radiant-star documentation; runtime uses Fairy and needs reconciliation.`
    : icon.notes;
  return Object.freeze({
    skillId: skill.id,
    nameTH: skill.nameTH,
    nameEN: skill.nameEN,
    sourceType: skill.sourceType,
    runtimeType: skill.runtimeType,
    typeDecision: skill.typeDecision,
    typeSymbol: type.symbol,
    typeSymbolDescription: type.symbolDescription,
    typePalette: type.palette,
    category: skill.category,
    categoryMarker: category.marker,
    targetType: skill.targetType,
    documentedIconKind: icon.documentedIconKind,
    documentedMainSymbol: icon.documentedMainSymbol,
    documentedMainShapeDescription: icon.documentedMainShapeDescription,
    documentedRuntimeCoverage: icon.documentedRuntimeCoverage,
    effect: skill.effect,
    effectOverlay: effect.overlay,
    effectOverlayDescription: effect.overlayDescription,
    maxUses: skill.maxUses,
    usesBadgeFormat: `{CurrentUses}/${skill.maxUses}`,
    cooldownSec: skill.cooldownSec,
    cooldownDisplay: `${skill.cooldownSec}s overlay เมื่อกำลัง Cooldown`,
    canCrit,
    critMarker,
    buttonReadingOrder,
    accessibilityLabelTH,
    implementationStatus: icon.implementationStatus,
    sourceUrl: SKILL_ROW_SOURCE_URL,
    notes,
    activation: 'catalog_only',
    sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  });
}));

const DESCRIPTOR_FIELDS = Object.freeze([
  'skillId',
  'nameTH',
  'nameEN',
  'sourceType',
  'runtimeType',
  'typeDecision',
  'typeSymbol',
  'typeSymbolDescription',
  'typePalette',
  'category',
  'categoryMarker',
  'targetType',
  'documentedIconKind',
  'documentedMainSymbol',
  'documentedMainShapeDescription',
  'documentedRuntimeCoverage',
  'effect',
  'effectOverlay',
  'effectOverlayDescription',
  'maxUses',
  'usesBadgeFormat',
  'cooldownSec',
  'cooldownDisplay',
  'canCrit',
  'critMarker',
  'buttonReadingOrder',
  'accessibilityLabelTH',
  'implementationStatus',
  'sourceUrl',
  'notes',
  'activation',
  'sourceWorkbookVersion',
]);
const DESCRIPTOR_FIELD_SET = new Set(DESCRIPTOR_FIELDS);
const FORBIDDEN_RUNTIME_FIELDS = new Set([
  'currentUses',
  'cooldownRemainingSec',
  'equippedSlot',
  'instanceId',
  'state',
  'style',
  'html',
  'innerHTML',
  'iconUrl',
  'assetPath',
  'onClick',
]);
const EXPECTED_BY_SKILL_ID = new Map(SKILL_ICON_CATALOG.map(descriptor => [descriptor.skillId, descriptor]));
const STATE_BY_NAME = BUTTON_STATE_BY_NAME;

function issue(code, index, field, detail = {}) {
  return Object.freeze({ code, index, field, ...detail });
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

function validateSkillIconCatalogInternal(records) {
  const descriptors = dataArraySnapshot(records);
  if (!descriptors) {
    return Object.freeze({ ok: false, issues: Object.freeze([issue('invalid_catalog', -1, 'root')]) });
  }
  const issues = [];
  if (descriptors.length !== SKILL_ICON_POLICY.descriptorCount) {
    issues.push(issue('descriptor_count_mismatch', -1, 'length', { value: descriptors.length }));
  }
  const skillIds = new Set();
  for (let index = 0; index < descriptors.length; index += 1) {
    const inspected = inspectDataRecord(descriptors[index]);
    if (!inspected) {
      issues.push(issue('invalid_descriptor', index, 'root'));
      continue;
    }
    const descriptor = inspected.values;
    for (const key of inspected.keys) {
      if (typeof key !== 'string') {
        issues.push(issue('unexpected_descriptor_field', index, 'root'));
      } else if (FORBIDDEN_RUNTIME_FIELDS.has(key)) {
        issues.push(issue('forbidden_runtime_field', index, key));
      } else if (!DESCRIPTOR_FIELD_SET.has(key)) {
        issues.push(issue('unexpected_descriptor_field', index, key));
      }
    }
    for (const field of DESCRIPTOR_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(descriptor, field)) {
        issues.push(issue('missing_descriptor_field', index, field));
      }
    }
    if (skillIds.has(descriptor.skillId)) {
      issues.push(issue('duplicate_skill_id', index, 'skillId', { id: descriptor.skillId ?? null }));
    }
    skillIds.add(descriptor.skillId);
    const expected = EXPECTED_BY_SKILL_ID.get(descriptor.skillId);
    if (!expected) {
      issues.push(issue('unknown_skill_id', index, 'skillId', { id: descriptor.skillId ?? null }));
      continue;
    }
    if (descriptor.skillId !== SKILL_CATALOG[index]?.id) {
      issues.push(issue('skill_order_mismatch', index, 'skillId', { id: descriptor.skillId }));
    }
    if (descriptor.runtimeType === 'Light' || descriptor.runtimeType === 'LIGHT') {
      issues.push(issue('light_runtime_type_forbidden', index, 'runtimeType'));
    }
    for (const field of DESCRIPTOR_FIELDS) {
      if (!Object.is(descriptor[field], expected[field])) {
        issues.push(issue('workbook_descriptor_mismatch', index, field, { id: descriptor.skillId }));
      }
    }
  }
  for (const expected of SKILL_ICON_CATALOG) {
    if (!skillIds.has(expected.skillId)) {
      issues.push(issue('missing_skill_id', -1, 'skillId', { id: expected.skillId }));
    }
  }
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function validateSkillIconCatalog(records) {
  try {
    return validateSkillIconCatalogInternal(records);
  } catch {
    return Object.freeze({ ok: false, issues: Object.freeze([issue('invalid_catalog', -1, 'root')]) });
  }
}

export function skillIconDescriptor(skillId) {
  return typeof skillId === 'string' ? (EXPECTED_BY_SKILL_ID.get(skillId) ?? null) : null;
}

export function skillButtonStateDescriptor(state) {
  return typeof state === 'string' ? (STATE_BY_NAME.get(state) ?? null) : null;
}

const validation = validateSkillIconCatalog(SKILL_ICON_CATALOG);
if (!validation.ok) {
  throw new TypeError(`Invalid skill icon catalog: ${validation.issues.map(entry => entry.code).join(', ')}`);
}
