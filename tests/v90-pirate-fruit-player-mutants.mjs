import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateAssetDefinition, validateBundle } from '../asset-presentation/index.mjs';
import { PIRATE_PRESENTATION_FORBIDDEN } from '../asset-presentation/providers/pirate-fruit-player.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const provider = fs.readFileSync(new URL('../asset-presentation/providers/pirate-fruit-player.mjs', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../asset-presentation/schema.mjs', import.meta.url), 'utf8');
const bundle = JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8'));

assert.match(schema, /'pirate-fruit'/, 'mutant 1: schema must allow the pirate-fruit provider');
assert.match(js, /from '\.\/asset-presentation\/providers\/pirate-fruit-player\.mjs'/, 'mutant 2: game must import the pirate player provider');
assert.match(js, /assets\.registerProvider\('pirate-fruit'/, 'mutant 3: pirate-fruit must not reuse the procedural dispatcher');
assert.doesNotMatch(
  js,
  /assets\.registerProvider\('procedural',createPirateFruitPlayerProvider/,
  'mutant 4: registering pirate as procedural would overwrite Player/Keeper/monsters',
);
assert.match(
  js,
  /assets\.spawn\('character\.human\.blocky-bighead\.v1',\{role:'keeper'/,
  'mutant 5: keeper stays blocky-bighead',
);
assert.match(
  js,
  /assets\.spawn\('character\.human\.blocky-bighead\.v1',\{role:'merchant'/,
  'mutant 6: merchant stays blocky-bighead',
);
assert.doesNotMatch(js, /from ['"]three['"]/, 'mutant 7: do not add an import of the three package');
assert.doesNotMatch(provider, /mergeGeometries/, 'mutant 8: do not vendor Pirate Fruit BufferGeometryUtils');
assert.doesNotMatch(provider, /createMobileMaterial|compactPlayerMaterialsAndMeshes/, 'mutant 9: do not vendor Pirate Fruit PBR compaction');

const pirate = bundle.assets.find(a => a.id === 'character.human.pirate-fruit.v1');
assert.ok(pirate, 'mutant 10: catalog asset must exist');
assert.deepEqual(validateAssetDefinition(pirate), []);
assert.deepEqual(validateBundle(bundle), []);
assert.deepEqual(Object.keys(pirate.metrics), ['height', 'head', 'headY']);
for (const field of PIRATE_PRESENTATION_FORBIDDEN) {
  assert.equal(Object.hasOwn(pirate, field), false, `mutant 11: catalog must not own ${field}`);
}

assert.match(provider, /setFromMatrixPosition/, 'mutant 12: worldPos scratch must implement Three.js Vector3.setFromMatrixPosition');
assert.doesNotMatch(js, /vpsWrites|playerDataWrites/, 'mutant 13: do not open VPS write flags for this presentation slice');

console.log('V9.0 pirate-fruit player mutants: PASS');
