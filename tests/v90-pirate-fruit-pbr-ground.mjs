import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  PIRATE_FRUIT_PBR_GROUND_PACK,
  PIRATE_FRUIT_PBR_GROUND_SCHEMA,
  PIRATE_FRUIT_TERRAIN_PBR,
  pirateFruitTerrainPbrProfile,
} from '../asset-presentation/pirate-fruit-pbr-ground.mjs';

assert.equal(PIRATE_FRUIT_PBR_GROUND_SCHEMA, 'pocketmonster.pirate-fruit-pbr-ground.v2');
assert.equal(PIRATE_FRUIT_PBR_GROUND_PACK, '../assets/world-ground/material-pack-v1.json');
assert.deepEqual(Object.keys(PIRATE_FRUIT_TERRAIN_PBR), [
  'STARTER-ISLAND',
  'MIST-JUNGLE',
  'SUNSCAR-DESERT',
  'AZURE-FROST',
  'TEMPEST-SKY',
  'EMBER-VOLCANO',
]);
for (const id of Object.keys(PIRATE_FRUIT_TERRAIN_PBR)) {
  const p = pirateFruitTerrainPbrProfile(`PF_TERRAIN_${id}`);
  assert.equal(p.mode, 'preserve-native-splat');
  assert.deepEqual(p.layers, { sand: 'sand', grass: 'grass', rock: 'rock' });
  assert.equal(p.repeat, 34);
}

const pack = JSON.parse(fs.readFileSync(new URL('../assets/world-ground/material-pack-v1.json', import.meta.url), 'utf8'));
assert.equal(pack.installed, true);
for (const family of ['sand', 'grass', 'rock']) {
  assert.ok(pack.materials[family], `PBR family ${family} exists in WorldSim material pack`);
  for (const slot of ['albedo', 'normal', 'roughness']) {
    assert.ok(pack.materials[family][slot], `${family}.${slot} exists`);
  }
}

const pbrSrc = fs.readFileSync(new URL('../asset-presentation/pirate-fruit-pbr-ground.mjs', import.meta.url), 'utf8');
const presentationSrc = fs.readFileSync(new URL('../pirate-fruit-offline/pocket-presentation.mjs', import.meta.url), 'utf8');
const groundEntrySrc = fs.readFileSync(new URL('../pirate-fruit-offline/pocket-ground-presentation.mjs', import.meta.url), 'utf8');
const offlineHtml = fs.readFileSync(new URL('../pirate-fruit-offline/index.html', import.meta.url), 'utf8');
const legacyBridgeSrc = fs.readFileSync(new URL('../asset-presentation/pirate-fruit-client-bridge.mjs', import.meta.url), 'utf8');
const combinedSrc = fs.readFileSync(new URL('../combined-worlds-v900.mjs', import.meta.url), 'utf8');

for (const file of [
  'asset-presentation/pirate-fruit-pbr-ground.mjs',
  'pirate-fruit-offline/pocket-presentation.mjs',
  'pirate-fruit-offline/pocket-ground-presentation.mjs',
]) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${file}`, import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || `${file} syntax failed`);
}

// PR #570 restored the multi-island ocean client as the active Pirate world.
assert.match(combinedSrc, /boot-pirate-fruit-v900\.mjs\?v=953/);
assert.doesNotMatch(combinedSrc, /world-pirate-native-v900\.mjs\?v=1/);

// The older bridge still contains the grid repaint path, so the PBR hook must
// claim native terrain before that bridge runs instead of replacing it later.
assert.match(legacyBridgeSrc, /function paintTerrain\(mesh\)/);
assert.match(legacyBridgeSrc, /if \(mesh\.userData\.pocketTerrain\) return/);
assert.match(legacyBridgeSrc, /surfaceStyle = 'four-side-block-v1'/);
assert.match(pbrSrc, /mesh\.userData\.pocketTerrain = true/,
  'PBR presentation claims the real terrain before the old grid painter');

assert.match(presentationSrc, /hookPirateFruitRenderer\(pirateFruitThree\);/,
  'existing Pirate/Studio presentation remains unchanged');
assert.doesNotMatch(presentationSrc, /hookPirateFruitPbrGround/,
  'ground remains isolated from the player presentation entry');
assert.match(groundEntrySrc, /threeFromPirateFruitVendor/,
  'PBR layer shares the exact Pirate Fruit Three instance');
assert.match(groundEntrySrc, /pirate-fruit-pbr-ground\.mjs\?v=2/);
assert.match(offlineHtml, /pocket-presentation\.mjs\?v=29/,
  'existing player/attack presentation cache contract stays intact');
assert.match(offlineHtml, /pocket-ground-presentation\.mjs\?v=2/,
  'multi-island terrain loads the corrected PBR v2 entry');
assert.ok(
  offlineHtml.indexOf('pocket-presentation.mjs?v=29') < offlineHtml.indexOf('pocket-ground-presentation.mjs?v=2'),
  'bridge installs first and the PBR hook wraps it as the outer pre-terrain hook',
);

assert.match(pbrSrc, /material-pack-v1\.json/);
assert.match(pbrSrc, /mode: 'preserve-native-splat'/);
assert.match(pbrSrc, /surfaceBlend = 'sand-grass-rock'|surfaceBlend: 'sand-grass-rock'/);
assert.match(pbrSrc, /previousCompile\.call\(this, shader, renderer\)/,
  'native Pirate onBeforeCompile shader is preserved');
assert.match(pbrSrc, /shader\.uniforms\.uSandMap\.value = textures\.sand\.albedo/);
assert.match(pbrSrc, /shader\.uniforms\.uRockMap\.value = textures\.rock\.albedo/);
assert.match(pbrSrc, /shader\.uniforms\.uSandNormal\.value = textures\.sand\.normal/);
assert.match(pbrSrc, /shader\.uniforms\.uRockNormal\.value = textures\.rock\.normal/);
assert.match(pbrSrc, /uSandRoughness/);
assert.match(pbrSrc, /uGrassRoughness/);
assert.match(pbrSrc, /uRockRoughness/);
assert.match(pbrSrc, /roughnessDeclaration/,
  'roughness injection is guarded by the native shader declaration');
assert.match(pbrSrc, /preservesNativeSplat: true/);
assert.match(pbrSrc, /preservesWetShore: true/);
assert.match(pbrSrc, /waterChanged: false/);
assert.match(pbrSrc, /dockChanged: false/);
assert.match(pbrSrc, /geometryChanged: false/);
assert.match(pbrSrc, /collisionChanged: false/);
assert.match(pbrSrc, /presentation\.scan\(this\)[\s\S]*return currentUpdate\.call\(this, force\)/,
  'terrain is claimed before the legacy bridge update is invoked');
assert.match(pbrSrc, /proto\.add = add/,
  'streamed terrain is claimed immediately when it is added to the real scene');
assert.match(pbrSrc, /presentation\.upgrade\(object\)/,
  'new PF_TERRAIN meshes are upgraded before later scene scans');

// Regression for the bug reported by the user: never replace the whole terrain
// with a new flat/one-family material, and never install a flat fallback.
assert.doesNotMatch(pbrSrc, /mesh\.material\s*=\s*new THREE\.MeshStandardMaterial/);
assert.doesNotMatch(pbrSrc, /flatFallback|paintGroundGrid/);
assert.match(pbrSrc, /mesh\.material !== originalMaterial\) mesh\.material = originalMaterial/,
  'failure path restores the exact native terrain material');
assert.doesNotMatch(pbrSrc, /geometry\.setAttribute\(['"]position|position\.set\(/,
  'PBR layer never changes terrain geometry/position');
assert.doesNotMatch(pbrSrc, /fetchWorldMapFrame|\/world\/zones\//,
  'visual layer does not invent WorldSim authority for Pirate islands');

console.log('V9.0 Pirate Fruit multi-island PBR splat preservation: PASS');
