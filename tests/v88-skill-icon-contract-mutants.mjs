import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceUrl = new URL('../skill-icon-runtime.mjs', import.meta.url);
const originalSource = fs.readFileSync(sourceUrl, 'utf8');

async function loadSource(source, tag) {
  const absolute = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, path) => `from '${new URL(`../${path.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${tag}`).toString('base64')}`);
}

function contract(module) {
  assert.equal(module.LIVE_SKILL_ICON_CATALOG.length, 108);
  assert.equal(module.validateLiveSkillIconCatalog(module.LIVE_SKILL_ICON_CATALOG).ok, true);
  assert.equal(module.skillButtonIconContract('SK_FIRE_03').mainKind, 'shield');
  assert.equal(module.skillButtonIconContract('SK_GRASS_05').mainKind, 'heal');
  assert.equal(module.skillButtonIconContract('SK_ICE_04').mainKind, 'groundpoint');
  assert.equal(module.skillButtonIconContract('SK_ICE_04').mainSymbol, '⊙▥');
  assert.equal(module.skillButtonIconContract('SK_LIGHT_04').runtimeType, 'Fairy');
  assert.equal(module.skillButtonIconContract('SK_LIGHT_04').typeSymbol, '✦');
  assert.match(module.skillButtonIconContract('SK_FIRE_05').cacheKey, /^SK_FIRE_05\|area\|FIRE\|Fire\|/);
  assert.equal(module.skillButtonIconContract('SK_FIRE_05').categoryMarker, '◎');
  assert.equal(module.skillButtonIconContract('SK_FIRE_05').effectOverlay, '🔥○');
}

contract(await loadSource(originalSource, 'skill-icon-contract-current'));

const mutants = [
  ['collapse Self icons to buff', 'return descriptor.documentedIconKind;', "return 'buff';"],
  ['map GroundPoint as area', "if (descriptor.targetType === 'GroundPoint') return 'groundpoint';", "if (descriptor.targetType === 'GroundPoint') return 'area';"],
  ['erase GroundPoint symbol', "if (kind === 'groundpoint') return '⊙▥';", "if (kind === 'groundpoint') return '↗';"],
  ['cache by main kind only', "descriptor.skillId,\n    mainKind,", "'shared',\n    mainKind,"],
  ['replace runtime type with source type', 'runtimeType: descriptor.runtimeType,', 'runtimeType: descriptor.sourceType,'],
  ['erase type symbol', 'typeSymbol: descriptor.typeSymbol,', "typeSymbol: '',"],
  ['erase category marker', 'categoryMarker: descriptor.categoryMarker,', "categoryMarker: '',"],
  ['erase effect overlay', 'effectOverlay: descriptor.effectOverlay,', "effectOverlay: '',"],
];

let killed = 0;
for (const [name, before, after] of mutants) {
  const source = originalSource.replace(before, after);
  assert.notEqual(source, originalSource, `${name} mutation must alter source`);
  try {
    contract(await loadSource(source, `skill-icon-contract-mutant-${name.replaceAll(' ','-')}`));
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}
assert.equal(killed, mutants.length);
console.log(`V8.8 skill icon contract mutants: PASS (${killed}/${mutants.length} killed)`);
