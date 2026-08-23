import assert from 'node:assert/strict';
import {
  LIVE_SKILL_ICON_CATALOG,
  LIVE_SKILL_ICON_MAIN_KINDS,
  LIVE_SKILL_ICON_POLICY,
  skillButtonIconContract,
  validateLiveSkillIconCatalog,
} from '../skill-icon-runtime.mjs';

assert.deepEqual(LIVE_SKILL_ICON_MAIN_KINDS, ['enemy','area','groundpoint','buff','shield','heal']);
assert.deepEqual(LIVE_SKILL_ICON_POLICY, {
  authority: 'PocketMonster_Detailed_v2.1_SkillButtonIcons.xlsx',
  descriptorJoinKey: 'exact_SkillID',
  skillCount: 108,
  manualButtonCount: 4,
  mainIconKindCount: 6,
  typeFamilyCount: 18,
  categoryMarkerCount: 7,
  effectOverlayCount: 53,
  groundPointGapCount: 0,
  lightFairyRuntimeMismatchCount: 0,
  cacheIdentity: 'exact_SkillID_semantic_layers',
  activation: 'canonical_resolver_live',
});
assert.equal(validateLiveSkillIconCatalog(LIVE_SKILL_ICON_CATALOG).ok, true);
assert.equal(Object.isFrozen(LIVE_SKILL_ICON_CATALOG), true);
assert.ok(LIVE_SKILL_ICON_CATALOG.every(Object.isFrozen));
assert.equal(new Set(LIVE_SKILL_ICON_CATALOG.map(row => row.skillId)).size, 108);
assert.equal(new Set(LIVE_SKILL_ICON_CATALOG.map(row => row.cacheKey)).size, 108);

const counts = key => Object.fromEntries(LIVE_SKILL_ICON_CATALOG.reduce((result, row) => {
  result.set(row[key], (result.get(row[key]) ?? 0) + 1);
  return result;
}, new Map()));
assert.deepEqual(counts('mainKind'), { enemy:36, buff:6, area:51, shield:12, heal:2, groundpoint:1 });
assert.equal(new Set(LIVE_SKILL_ICON_CATALOG.map(row => row.sourceType)).size, 18);
assert.equal(new Set(LIVE_SKILL_ICON_CATALOG.map(row => row.category)).size, 7);
assert.equal(new Set(LIVE_SKILL_ICON_CATALOG.map(row => row.effect)).size, 53);

for (const skillId of ['SK_FIRE_03','SK_WATER_03','SK_GRASS_03','SK_ICE_03','SK_LIGHT_03','SK_STEEL_03']) {
  assert.equal(skillButtonIconContract(skillId).mainKind, 'shield', `${skillId} is a shield, never a generic buff`);
}
assert.equal(skillButtonIconContract('SK_GRASS_05').mainKind, 'heal');
assert.equal(skillButtonIconContract('SK_LIGHT_04').mainKind, 'heal');
assert.deepEqual(
  [skillButtonIconContract('SK_ICE_04').mainKind,skillButtonIconContract('SK_ICE_04').mainSymbol],
  ['groundpoint','⊙▥'],
);
const light = LIVE_SKILL_ICON_CATALOG.filter(row => row.sourceType === 'LIGHT');
assert.equal(light.length, 6);
assert.ok(light.every(row => row.runtimeType === 'Fairy' && row.typeSymbol === '✦'));
assert.equal(skillButtonIconContract('SK_UNKNOWN_99'), null);
assert.equal(skillButtonIconContract(null), null);

const changed = LIVE_SKILL_ICON_CATALOG.map(row => ({ ...row }));
changed[0].mainKind = 'buff';
assert.ok(validateLiveSkillIconCatalog(changed).issues.some(entry => entry.code === 'contract_mismatch'));
const duplicate = LIVE_SKILL_ICON_CATALOG.map(row => ({ ...row }));
duplicate[1].skillId = duplicate[0].skillId;
assert.ok(validateLiveSkillIconCatalog(duplicate).issues.some(entry => entry.code === 'duplicate_skill_id'));

console.log('V8.8 canonical live skill icon contract: PASS (108/108; 0 semantic gaps)');
