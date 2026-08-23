import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  SKILL_BUTTON_STATE_CATALOG,
  SKILL_CATEGORY_ICON_LEGEND,
  SKILL_EFFECT_ICON_LEGEND,
  SKILL_ICON_CATALOG,
  SKILL_ICON_LAYER_LEGEND,
  SKILL_ICON_POLICY,
  SKILL_ICON_UI_AUDIT,
  SKILL_TYPE_ICON_LEGEND,
  skillButtonStateDescriptor,
  skillIconDescriptor,
  validateSkillIconCatalog,
} from '../skill-icon-descriptor.mjs';
import { SKILL_CATALOG } from '../skill-catalog.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

assert.deepEqual(SKILL_ICON_POLICY.authorityRanges, [
  'Skill_Icon_Legend!A1:J46',
  'Skill_Button_Icons!A1:AB109',
  'Skill_Button_States!A1:I8',
  'Skill_Button_UI_Audit!A1:F14',
]);
assert.equal(SKILL_ICON_POLICY.descriptorCount, 108);
assert.equal(SKILL_ICON_POLICY.characterSkillsIntegration, 'deferred_A37');
assert.equal(SKILL_ICON_POLICY.runtimeMutation, 'none_descriptor_only');
assert.equal(SKILL_ICON_POLICY.auditColumnsAreSnapshot, true);
assert.equal(SKILL_ICON_POLICY.lightRuntimeActivation, 'deferred_D2');
assert.equal(SKILL_ICON_POLICY.sourceWorkbookSha256, 'fdda777b1cbb0eeaacb7e02ced3c1c9df1a3af2853bfdf8d1fe902370789e39c');
assert.equal(Object.isFrozen(SKILL_ICON_POLICY), true);
assert.equal(Object.isFrozen(SKILL_ICON_POLICY.authorityRanges), true);

for (const [catalog, count, expectedHash] of [
  [SKILL_ICON_LAYER_LEGEND, 11, 'b3809d5d9da66f4f336870fcac4805f89c1dfeaa4b7f5ced9ae4f188e9698120'],
  [SKILL_TYPE_ICON_LEGEND, 18, '9dd28cfc99e6c7714ce4a7b7fddfa83c14b7f3a8493f41e91338d6175c1a790f'],
  [SKILL_CATEGORY_ICON_LEGEND, 7, '7449ced70339696485a2054c733ee710a5490cda3ee510b26b79c1af8b25b5ac'],
  [SKILL_EFFECT_ICON_LEGEND, 53, '2d67403f70f737ec35858e2f7d4253433e492f6319f1cbd150aa4462cf281db2'],
  [SKILL_BUTTON_STATE_CATALOG, 7, '9edc9faa511aabeb9989b8e8ccd3bfb40577afb8f18ab38160de2ce4d1850835'],
]) {
  assert.equal(catalog.length, count);
  assert.equal(hash(catalog), expectedHash);
  assert.equal(Object.isFrozen(catalog), true);
  assert.ok(catalog.every(Object.isFrozen));
}

assert.deepEqual(SKILL_ICON_UI_AUDIT.kpis, {
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
});
assert.equal(SKILL_ICON_UI_AUDIT.snapshotCommit, 'd797e102e3305cd35c45cfcad90ffb9616a5599a');
assert.equal(SKILL_ICON_UI_AUDIT.liveRuntimeTruth, false);
assert.equal(SKILL_ICON_UI_AUDIT.findings.length, 6);
assert.deepEqual(SKILL_ICON_UI_AUDIT.findings.map(({ auditId, severity }) => [auditId, severity]), [
  ['ICON-A01', 'INFO'],
  ['ICON-A02', 'MEDIUM'],
  ['ICON-A03', 'MEDIUM'],
  ['ICON-A04', 'HIGH'],
  ['ICON-A05', 'MEDIUM'],
  ['ICON-A06', 'INFO'],
]);
assert.equal(Object.isFrozen(SKILL_ICON_UI_AUDIT), true);
assert.equal(Object.isFrozen(SKILL_ICON_UI_AUDIT.kpis), true);
assert.equal(Object.isFrozen(SKILL_ICON_UI_AUDIT.findings), true);
assert.ok(SKILL_ICON_UI_AUDIT.findings.every(Object.isFrozen));

assert.equal(SKILL_ICON_CATALOG.length, 108);
assert.equal(new Set(SKILL_ICON_CATALOG.map(entry => entry.skillId)).size, 108);
assert.equal(hash(SKILL_ICON_CATALOG), 'f92d470d33dc39ab9dd57d222d7e6f323232ef2a560a8f1815bbe23c6617c504');
const canonicalValidation = validateSkillIconCatalog(SKILL_ICON_CATALOG);
assert.equal(canonicalValidation.ok, true);
assert.equal(Object.isFrozen(canonicalValidation), true);
assert.equal(Object.isFrozen(canonicalValidation.issues), true);
assert.equal(Object.isFrozen(SKILL_ICON_CATALOG), true);
assert.ok(SKILL_ICON_CATALOG.every(Object.isFrozen));

const skillById = new Map(SKILL_CATALOG.map(skill => [skill.id, skill]));
for (const descriptor of SKILL_ICON_CATALOG) {
  const skill = skillById.get(descriptor.skillId);
  assert.ok(skill, `${descriptor.skillId} joins canonical Skill_Master by SkillID`);
  assert.deepEqual([
    descriptor.nameTH,
    descriptor.nameEN,
    descriptor.sourceType,
    descriptor.runtimeType,
    descriptor.typeDecision,
    descriptor.category,
    descriptor.targetType,
    descriptor.effect,
    descriptor.maxUses,
    descriptor.cooldownSec,
  ], [
    skill.nameTH,
    skill.nameEN,
    skill.sourceType,
    skill.runtimeType,
    skill.typeDecision,
    skill.category,
    skill.targetType,
    skill.effect,
    skill.maxUses,
    skill.cooldownSec,
  ]);
  assert.equal(descriptor.activation, 'catalog_only');
  assert.equal('currentUses' in descriptor, false);
  assert.equal('cooldownRemainingSec' in descriptor, false);
  assert.equal('equippedSlot' in descriptor, false);
}

const counts = key => Object.fromEntries(SKILL_ICON_CATALOG.reduce((result, descriptor) => {
  const value = descriptor[key];
  result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}, new Map()));
assert.deepEqual(counts('documentedIconKind'), {
  enemy: 36,
  buff: 6,
  area: 51,
  shield: 12,
  heal: 2,
  'groundpoint-fallback': 1,
});
assert.deepEqual(counts('category'), {
  Physical: 36,
  Support: 18,
  Special: 16,
  Control: 17,
  Ultimate: 18,
  Heal: 2,
  Defense: 1,
});
assert.deepEqual(counts('targetType'), {
  NearestEnemy: 36,
  Self: 20,
  EnemyArea: 51,
  GroundPoint: 1,
});
assert.deepEqual(counts('maxUses'), { 2: 1, 3: 17, 8: 18, 10: 36, 16: 18, 28: 18 });
assert.deepEqual(counts('cooldownSec'), { 1.8: 18, 4: 18, 5.5: 18, 7: 18, 8: 18, 14: 17, 16: 1 });
assert.equal(SKILL_ICON_CATALOG.filter(entry => entry.canCrit).length, 70);
assert.equal(SKILL_ICON_CATALOG.filter(entry => !entry.canCrit).length, 38);
assert.equal(SKILL_ICON_CATALOG.filter(entry => entry.effect === 'None').length, 8);
assert.equal(SKILL_ICON_CATALOG.filter(entry => entry.effectOverlay === '').length, 8);
assert.equal(new Set(SKILL_ICON_CATALOG.map(entry => entry.effect)).size, 53);

const iceWall = skillIconDescriptor('SK_ICE_04');
assert.deepEqual([
  iceWall.category,
  iceWall.targetType,
  iceWall.documentedIconKind,
  iceWall.documentedMainSymbol,
  iceWall.documentedRuntimeCoverage,
  iceWall.canCrit,
], ['Defense', 'GroundPoint', 'groundpoint-fallback', '↗', 'CURRENT_GAP', false]);
assert.match(iceWall.notes, /ground-point icon/);

const light = SKILL_ICON_CATALOG.filter(entry => entry.sourceType === 'LIGHT');
assert.equal(light.length, 6);
assert.ok(light.every(entry => entry.runtimeType === 'Fairy'));
assert.ok(light.every(entry => entry.typeDecision === 'D2_FAIRY_CANONICAL_LIGHT_DEFERRED'));
assert.ok(light.every(entry => entry.typeSymbol === '✦'));
assert.ok(light.every(entry => entry.accessibilityLabelTH.includes('ธาตุ แสง')));
assert.equal(SKILL_ICON_CATALOG.some(entry => entry.runtimeType === 'Light' || entry.runtimeType === 'LIGHT'), false);

const directControl = SKILL_ICON_CATALOG.filter(entry => {
  const skill = skillById.get(entry.skillId);
  return skill.category === 'Control' && skill.directDamage;
});
assert.equal(directControl.length, 17);
assert.ok(directControl.every(entry => entry.canCrit === false), 'CanCrit remains independent from DirectDamage');

assert.equal(skillIconDescriptor('SK_NORMAL_01').accessibilityLabelTH,
  'พุ่งชน, ธาตุ ปกติ, Physical, เป้าหมาย NearestEnemy, ใช้ได้สูงสุด 28 ครั้ง, คูลดาวน์ 1.8 วินาที, คริติคอลได้');
assert.equal(skillIconDescriptor('SK_FLYING_01').accessibilityLabelTH.includes('ธาตุ ลม'), true);
assert.equal(skillIconDescriptor('SK_PSYCHIC_01').accessibilityLabelTH.includes('ธาตุ พลังจิต'), true);
assert.equal(skillIconDescriptor('SK_UNKNOWN_99'), null);
assert.equal(Object.isFrozen(skillIconDescriptor('SK_NORMAL_01')), true);
assert.equal(skillButtonStateDescriptor('Active Buff').runtimeStatus, 'DESIGN');
assert.equal(Object.isFrozen(skillButtonStateDescriptor('Active Buff')), true);
assert.equal(skillButtonStateDescriptor('Unknown'), null);
assert.equal(skillButtonStateDescriptor(' Active Buff'), null);

const cloneCatalog = () => SKILL_ICON_CATALOG.map(descriptor => ({ ...descriptor }));
for (const [field, value, issueCode] of [
  ['category', 'Debug', 'workbook_descriptor_mismatch'],
  ['targetType', 'DebugTarget', 'workbook_descriptor_mismatch'],
  ['accessibilityLabelTH', 'debug', 'workbook_descriptor_mismatch'],
  ['canCrit', false, 'workbook_descriptor_mismatch'],
  ['runtimeType', 'Light', 'light_runtime_type_forbidden'],
]) {
  const changed = cloneCatalog();
  changed[0][field] = value;
  assert.ok(validateSkillIconCatalog(changed).issues.some(issue => issue.code === issueCode));
}

const duplicate = cloneCatalog();
duplicate[1].skillId = duplicate[0].skillId;
assert.ok(validateSkillIconCatalog(duplicate).issues.some(issue => issue.code === 'duplicate_skill_id'));

const runtimeLeak = cloneCatalog();
runtimeLeak[0].currentUses = 2;
assert.ok(validateSkillIconCatalog(runtimeLeak).issues.some(issue => issue.code === 'forbidden_runtime_field'));

const unknownField = cloneCatalog();
unknownField[0].debug = true;
assert.ok(validateSkillIconCatalog(unknownField).issues.some(issue => issue.code === 'unexpected_descriptor_field'));

const missingField = cloneCatalog();
delete missingField[0].accessibilityLabelTH;
assert.ok(validateSkillIconCatalog(missingField).issues.some(issue => issue.code === 'missing_descriptor_field'));

const hostileRecord = new Proxy({}, { ownKeys() { throw new Error('hostile record'); } });
assert.doesNotThrow(() => validateSkillIconCatalog([hostileRecord]));
assert.equal(validateSkillIconCatalog([hostileRecord]).ok, false);

const arrayWithExtraRootField = cloneCatalog();
arrayWithExtraRootField.debug = true;
assert.equal(validateSkillIconCatalog(arrayWithExtraRootField).ok, false, 'extra root array fields fail closed');

class DescriptorArray extends Array {}
const subclassedCatalog = DescriptorArray.from(SKILL_ICON_CATALOG, descriptor => ({ ...descriptor }));
assert.equal(validateSkillIconCatalog(subclassedCatalog).ok, false, 'array subclasses are not trusted data containers');

const inheritedRecord = Object.create({ inherited: true });
Object.assign(inheritedRecord, SKILL_ICON_CATALOG[0]);
const inheritedCatalog = cloneCatalog();
inheritedCatalog[0] = inheritedRecord;
assert.equal(validateSkillIconCatalog(inheritedCatalog).ok, false, 'records with exotic prototypes fail closed');

let rootAccessorReads = 0;
const accessorArray = [];
Object.defineProperty(accessorArray, '0', {
  enumerable: true,
  configurable: true,
  get() {
    rootAccessorReads += 1;
    return SKILL_ICON_CATALOG[0];
  },
});
assert.equal(validateSkillIconCatalog(accessorArray).ok, false);
assert.equal(rootAccessorReads, 0, 'root accessors are never invoked');

let recordAccessorReads = 0;
const accessorRecord = { ...SKILL_ICON_CATALOG[0] };
Object.defineProperty(accessorRecord, 'category', {
  enumerable: true,
  configurable: true,
  get() {
    recordAccessorReads += 1;
    return SKILL_ICON_CATALOG[0].category;
  },
});
const accessorRecordCatalog = cloneCatalog();
accessorRecordCatalog[0] = accessorRecord;
assert.equal(validateSkillIconCatalog(accessorRecordCatalog).ok, false);
assert.equal(recordAccessorReads, 0, 'record accessors are never invoked');

let arrayReads = 0;
const masqueradingArray = new Proxy([], {
  get(target, property, receiver) {
    if (property === 'length' || property === 'map' || property === 'forEach') arrayReads += 1;
    return Reflect.get(target, property, receiver);
  },
});
assert.equal(validateSkillIconCatalog(masqueradingArray).ok, false);
assert.equal(arrayReads, 0, 'validation snapshots own dense array descriptors');

let recordReads = 0;
const maskedRecord = new Proxy({ ...SKILL_ICON_CATALOG[0], category: 'Debug' }, {
  get(_target, property) {
    recordReads += 1;
    return SKILL_ICON_CATALOG[0][property];
  },
});
const maskedCatalog = cloneCatalog();
maskedCatalog[0] = maskedRecord;
assert.ok(validateSkillIconCatalog(maskedCatalog).issues.some(issue => issue.code === 'workbook_descriptor_mismatch'));
assert.equal(recordReads, 0, 'validation uses captured own data descriptors');

console.log('V8.1 A36 skill icon descriptor catalog: PASS');
