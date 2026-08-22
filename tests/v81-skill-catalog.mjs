import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  SKILL_CATALOG,
  SKILL_CATEGORIES,
  SKILL_TARGET_TYPES,
  skillCatalogEntry,
  validateSkillCatalog,
} from '../skill-catalog.mjs';

assert.equal(SKILL_CATALOG.length, 108, 'all 108 reviewed workbook skills are normalized');
assert.equal(new Set(SKILL_CATALOG.map(skill => skill.id)).size, 108, 'skill IDs are unique');
assert.equal(validateSkillCatalog(SKILL_CATALOG).ok, true, 'the reviewed skill catalog passes its schema');
assert.equal(
  createHash('sha256').update(JSON.stringify(SKILL_CATALOG)).digest('hex'),
  'bdf519f8f288d40e62ecfc5111774774bd4bd98aa7a2f629e8f05d861d2548a3',
  'the normalized 108-skill dataset stays tied to this provenance review',
);
assert.deepEqual(SKILL_TARGET_TYPES, ['NearestEnemy', 'Self', 'EnemyArea', 'GroundPoint'], 'target contracts stay explicit');
assert.deepEqual(SKILL_CATEGORIES, ['Physical', 'Special', 'Support', 'Control', 'Ultimate', 'Heal', 'Defense'], 'workbook categories stay explicit');

const typeCounts = Object.fromEntries(SKILL_CATALOG.reduce((counts, skill) => {
  counts.set(skill.sourceType, (counts.get(skill.sourceType) ?? 0) + 1);
  return counts;
}, new Map()));
assert.equal(Object.keys(typeCounts).length, 18, 'the catalog covers 18 source type families');
assert.ok(Object.values(typeCounts).every(count => count === 6), 'every type family contributes exactly six skills');

const tackle = skillCatalogEntry('SK_NORMAL_01');
assert.equal(tackle.nameEN, 'Tackle');
assert.equal(tackle.power, 38);
assert.equal(tackle.maxUses, 28);
assert.equal(tackle.cooldownSec, 1.8);
assert.equal(tackle.targetType, 'NearestEnemy');

const iceWall = skillCatalogEntry('SK_ICE_04');
assert.equal(iceWall.targetType, 'GroundPoint', 'the unsupported GroundPoint target remains catalog-visible');
assert.equal(iceWall.activation, 'catalog_only', 'GroundPoint is not silently activated');

const lightBeam = skillCatalogEntry('SK_LIGHT_01');
assert.equal(lightBeam.sourceType, 'LIGHT');
assert.equal(lightBeam.runtimeType, 'Fairy', 'LIGHT rows reconcile to current Fairy identity');
assert.equal(lightBeam.typeDecision, 'D2_FAIRY_CANONICAL_LIGHT_DEFERRED');
assert.equal(SKILL_CATALOG.some(skill => skill.runtimeType === 'Light' || skill.runtimeType === 'LIGHT'), false, 'no new LIGHT runtime identity is created');

assert.equal(skillCatalogEntry('SK_UNKNOWN_99'), null, 'unknown skill IDs resolve to null');
assert.equal(Object.isFrozen(SKILL_CATALOG), true, 'skill catalog is immutable');
assert.equal(Object.isFrozen(tackle), true, 'skill records are immutable');
assert.equal('currentUses' in tackle, false, 'per-instance uses do not leak into skill masters');
assert.equal('cooldownRemaining' in tackle, false, 'per-instance cooldown state does not leak into skill masters');

function mutate(id, patch) {
  return SKILL_CATALOG.map(skill => skill.id === id ? { ...skill, ...patch } : { ...skill });
}

assert.ok(validateSkillCatalog(mutate('SK_NORMAL_01', { targetType: 'DebugTarget' })).issues.some(issue => issue.code === 'invalid_target_type'), 'bad targets fail');
assert.ok(validateSkillCatalog(mutate('SK_NORMAL_01', { effectClass: 'ScriptEval' })).issues.some(issue => issue.code === 'invalid_effect_class'), 'bad effects fail');
assert.ok(validateSkillCatalog(mutate('SK_NORMAL_01', { maxUses: 0 })).issues.some(issue => issue.code === 'invalid_max_uses'), 'bad use limits fail');
assert.ok(validateSkillCatalog(mutate('SK_NORMAL_01', { cooldownSec: -1 })).issues.some(issue => issue.code === 'invalid_cooldown'), 'bad cooldowns fail');
assert.ok(validateSkillCatalog([...SKILL_CATALOG.map(skill => ({ ...skill })), { ...tackle }]).issues.some(issue => issue.code === 'duplicate_skill_id'), 'duplicate skills fail');

console.log('V8.1 skill catalog: PASS');
