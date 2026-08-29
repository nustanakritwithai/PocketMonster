import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateAssetDefinition, validateBundle } from '../asset-presentation/index.mjs';
import { PIRATE_PRESENTATION_FORBIDDEN } from '../asset-presentation/providers/pirate-fruit-player.mjs';

const liveJs = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../game-v900.js', import.meta.url), 'utf8');
const liveHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const versionedHtml = fs.readFileSync(new URL('../v800.html', import.meta.url), 'utf8');
const provider = fs.readFileSync(new URL('../asset-presentation/providers/pirate-fruit-player.mjs', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../asset-presentation/schema.mjs', import.meta.url), 'utf8');
const bundle = JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8'));

assert.equal(liveHtml, versionedHtml, 'mutant 0: active V8.4 entry stays byte-identical');
assert.doesNotMatch(liveHtml, /v900\.html|game-v900/, 'mutant 0b: current game version must not point at the new world');
assert.doesNotMatch(liveJs, /pirate-fruit-player\.mjs/, 'mutant 1: V8.4 must not import the pirate provider');
assert.match(schema, /'pirate-fruit'/, 'mutant 2: schema must allow the pirate-fruit provider');
assert.match(js, /from '\.\/asset-presentation\/providers\/pirate-fruit-player\.mjs'/, 'mutant 3: new world must import the pirate player provider');
assert.match(js, /assets\.registerProvider\('pirate-fruit'/, 'mutant 4: pirate-fruit must not reuse the procedural dispatcher');
assert.doesNotMatch(
  js,
  /assets\.registerProvider\('procedural',createPirateFruitPlayerProvider/,
  'mutant 5: registering pirate as procedural would collide with V8.4 if copied later',
);
assert.match(liveJs, /assets\.spawn\('character\.human\.blocky-bighead\.v1',\{role:'player'/, 'mutant 6: current version player stays bighead');
assert.match(liveJs, /assets\.spawn\('character\.human\.blocky-bighead\.v1',\{role:'keeper'/, 'mutant 7: current version keeper stays bighead');
assert.doesNotMatch(js, /from ['"]three['"]/, 'mutant 8: do not add an import of the three package');
assert.doesNotMatch(provider, /mergeGeometries/, 'mutant 9: do not vendor Pirate Fruit BufferGeometryUtils');
assert.doesNotMatch(provider, /createMobileMaterial|compactPlayerMaterialsAndMeshes/, 'mutant 10: do not vendor Pirate Fruit PBR compaction');

const pirate = bundle.assets.find(a => a.id === 'character.human.pirate-fruit.v1');
assert.ok(pirate, 'mutant 11: catalog asset must exist');
assert.deepEqual(validateAssetDefinition(pirate), []);
assert.deepEqual(validateBundle(bundle), []);
assert.deepEqual(Object.keys(pirate.metrics), ['height', 'head', 'headY']);
for (const field of PIRATE_PRESENTATION_FORBIDDEN) {
  assert.equal(Object.hasOwn(pirate, field), false, `mutant 12: catalog must not own ${field}`);
}

assert.match(provider, /setFromMatrixPosition/, 'mutant 13: worldPos scratch must implement Three.js Vector3.setFromMatrixPosition');
assert.doesNotMatch(js, /vpsWrites|playerDataWrites/, 'mutant 14: do not open VPS write flags for this presentation slice');

console.log('V9.0 pirate-fruit player mutants: PASS');
