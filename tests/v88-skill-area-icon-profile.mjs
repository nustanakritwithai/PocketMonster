import assert from 'node:assert/strict';
import {
  AREA_TYPE_PROFILES,
  ENEMY_AREA_ICON_CATALOG,
  enemyAreaIconProfile,
  validateEnemyAreaIconCatalog,
} from '../skill-area-icon-profile.mjs';

const EXPECTED_TYPE_COUNTS = {
  NORMAL:3, FIRE:3, WATER:3, GRASS:2, ELECTRIC:3, ICE:2,
  ROCK:3, GROUND:3, FLYING:3, POISON:3, DARK:3, LIGHT:2,
  PSYCHIC:3, BUG:3, DRAGON:3, FIGHTING:3, STEEL:3, GHOST:3,
};

assert.equal(Object.keys(AREA_TYPE_PROFILES).length, 18);
assert.equal(new Set(Object.values(AREA_TYPE_PROFILES).map(row => row.familyId)).size, 18);
assert.equal(new Set(Object.values(AREA_TYPE_PROFILES).map(row => row.drawPattern)).size, 18);
assert.equal(ENEMY_AREA_ICON_CATALOG.length, 51);
assert.ok(ENEMY_AREA_ICON_CATALOG.every(Object.isFrozen));
assert.equal(validateEnemyAreaIconCatalog(ENEMY_AREA_ICON_CATALOG).ok, true);
assert.equal(new Set(ENEMY_AREA_ICON_CATALOG.map(row => row.skillId)).size, 51);
assert.equal(new Set(ENEMY_AREA_ICON_CATALOG.map(row => row.compositeCacheKey)).size, 51);

const counts = Object.fromEntries(ENEMY_AREA_ICON_CATALOG.reduce((result, row) => {
  result.set(row.sourceType, (result.get(row.sourceType) ?? 0) + 1);
  return result;
}, new Map()));
assert.deepEqual(counts, EXPECTED_TYPE_COUNTS);

for (const row of ENEMY_AREA_ICON_CATALOG) {
  const profile = AREA_TYPE_PROFILES[row.sourceType];
  assert.equal(row.familyId, profile.familyId);
  assert.equal(row.familyGlyph, profile.familyGlyph);
  assert.match(row.compositeCacheKey, new RegExp(`^${row.skillId}\\|${row.familyId}\\|`));
  assert.ok(row.categoryMarker.length > 0);
  assert.ok(row.effectOverlay.length > 0);
}

assert.equal(enemyAreaIconProfile('SK_FIRE_05').familyId, 'flame-ring');
assert.equal(enemyAreaIconProfile('SK_WATER_05').familyId, 'water-ripple');
assert.equal(enemyAreaIconProfile('SK_ELECTRIC_05').familyId, 'lightning-field');
assert.equal(enemyAreaIconProfile('SK_POISON_04').familyId, 'toxic-pool');
assert.equal(enemyAreaIconProfile('SK_DARK_06').familyId, 'shadow-vortex');
assert.equal(enemyAreaIconProfile('SK_LIGHT_06').familyId, 'radiant-halo');
assert.equal(enemyAreaIconProfile('SK_LIGHT_06').runtimeType, 'Fairy');
assert.equal(enemyAreaIconProfile('SK_ICE_04'), null, 'GroundPoint is not EnemyArea');
assert.equal(enemyAreaIconProfile('SK_FIRE_01'), null, 'NearestEnemy is not EnemyArea');

const changed = ENEMY_AREA_ICON_CATALOG.map(row => ({ ...row }));
changed[0].familyId = 'shared-area';
assert.ok(validateEnemyAreaIconCatalog(changed).issues.some(entry => entry.code === 'profile_mismatch'));

console.log('V8.8 EnemyArea elemental icon matrix: PASS (51 skills / 18 families)');
