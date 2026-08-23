import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceUrl = new URL('../skill-area-icon-profile.mjs', import.meta.url);
const originalSource = fs.readFileSync(sourceUrl, 'utf8');

async function loadSource(source, tag) {
  const absolute = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, path) => `from '${new URL(`../${path.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${tag}`).toString('base64')}`);
}

function contract(module) {
  assert.equal(module.ENEMY_AREA_ICON_CATALOG.length, 51);
  assert.equal(module.validateEnemyAreaIconCatalog(module.ENEMY_AREA_ICON_CATALOG).ok, true);
  assert.equal(Object.keys(module.AREA_TYPE_PROFILES).length, 18);
  assert.equal(new Set(Object.values(module.AREA_TYPE_PROFILES).map(row => row.familyId)).size, 18);
  assert.equal(new Set(Object.values(module.AREA_TYPE_PROFILES).map(row => row.drawPattern)).size, 18);
  assert.equal(new Set(module.ENEMY_AREA_ICON_CATALOG.map(row => row.compositeCacheKey)).size, 51);
  assert.equal(module.enemyAreaIconProfile('SK_FIRE_05').familyId, 'flame-ring');
  assert.match(module.enemyAreaIconProfile('SK_FIRE_05').compositeCacheKey, /^SK_FIRE_05\|flame-ring\|/);
  assert.equal(module.enemyAreaIconProfile('SK_FIRE_05').categoryMarker, '◎');
  assert.equal(module.enemyAreaIconProfile('SK_FIRE_05').effectOverlay, '🔥○');
  assert.equal(module.enemyAreaIconProfile('SK_POISON_04').familyId, 'toxic-pool');
  assert.equal(module.enemyAreaIconProfile('SK_LIGHT_06').familyId, 'radiant-halo');
  assert.equal(module.enemyAreaIconProfile('SK_LIGHT_06').runtimeType, 'Fairy');
  assert.equal(module.enemyAreaIconProfile('SK_ICE_04'), null);
}

contract(await loadSource(originalSource, 'skill-area-profile-current'));

const mutants = [
  ['collapse FIRE into NORMAL', "['FIRE',     'flame-ring',", "['FIRE',     'impact-pulse',"],
  ['collapse WATER pattern', "'water-ripple',    '💧', '≋', 'ripples'", "'water-ripple',    '💧', '≋', 'rings'"],
  ['collapse LIGHT into DARK', "['LIGHT',    'radiant-halo',", "['LIGHT',    'shadow-vortex',"],
  ['include GroundPoint', "contract => contract.mainKind === 'area'", "contract => contract.mainKind === 'area' || contract.mainKind === 'groundpoint'"],
  ['cache without SkillID', "contract.skillId,\n      profile.familyId,", "'shared',\n      profile.familyId,"],
  ['erase category layer', 'categoryMarker: contract.categoryMarker,', "categoryMarker: '',"],
  ['erase effect layer', 'effectOverlay: contract.effectOverlay,', "effectOverlay: '',"],
  ['erase runtime type', 'runtimeType: contract.runtimeType,', 'runtimeType: contract.sourceType,'],
];

let killed = 0;
for (const [name, before, after] of mutants) {
  const source = originalSource.replace(before, after);
  assert.notEqual(source, originalSource, `${name} mutation must alter source`);
  try {
    contract(await loadSource(source, `skill-area-profile-mutant-${name.replaceAll(' ', '-')}`));
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}
assert.equal(killed, mutants.length);
console.log(`V8.8 EnemyArea icon mutants: PASS (${killed}/${mutants.length} killed)`);
