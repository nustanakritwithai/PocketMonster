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

assert.equal(PIRATE_FRUIT_PBR_GROUND_SCHEMA, 'pocketmonster.pirate-fruit-pbr-ground.v1');
assert.equal(PIRATE_FRUIT_PBR_GROUND_PACK, '../assets/world-ground/material-pack-v1.json');
assert.deepEqual(Object.keys(PIRATE_FRUIT_TERRAIN_PBR), [
  'STARTER-ISLAND',
  'MIST-JUNGLE',
  'SUNSCAR-DESERT',
  'AZURE-FROST',
  'TEMPEST-SKY',
  'EMBER-VOLCANO',
]);
assert.equal(pirateFruitTerrainPbrProfile('PF_TERRAIN_STARTER-ISLAND').material, 'grass');
assert.equal(pirateFruitTerrainPbrProfile('PF_TERRAIN_MIST-JUNGLE').material, 'forest-floor');
assert.equal(pirateFruitTerrainPbrProfile('PF_TERRAIN_SUNSCAR-DESERT').material, 'sand');
assert.equal(pirateFruitTerrainPbrProfile('PF_TERRAIN_AZURE-FROST').material, 'rock');
assert.equal(pirateFruitTerrainPbrProfile('PF_TERRAIN_TEMPEST-SKY').material, 'rock');
assert.equal(pirateFruitTerrainPbrProfile('PF_TERRAIN_EMBER-VOLCANO').material, 'burned');

const pack = JSON.parse(fs.readFileSync(new URL('../assets/world-ground/material-pack-v1.json', import.meta.url), 'utf8'));
assert.equal(pack.installed, true);
for (const profile of Object.values(PIRATE_FRUIT_TERRAIN_PBR)) {
  assert.ok(pack.materials[profile.material], `PBR family ${profile.material} exists in WorldSim material pack`);
  for (const slot of ['albedo', 'normal', 'roughness']) {
    assert.ok(pack.materials[profile.material][slot], `${profile.material}.${slot} exists`);
  }
}

const pbrSrc = fs.readFileSync(new URL('../asset-presentation/pirate-fruit-pbr-ground.mjs', import.meta.url), 'utf8');
const presentationSrc = fs.readFileSync(new URL('../pirate-fruit-offline/pocket-presentation.mjs', import.meta.url), 'utf8');
const groundEntrySrc = fs.readFileSync(new URL('../pirate-fruit-offline/pocket-ground-presentation.mjs', import.meta.url), 'utf8');
const offlineHtml = fs.readFileSync(new URL('../pirate-fruit-offline/index.html', import.meta.url), 'utf8');
const legacyBridgeSrc = fs.readFileSync(new URL('../asset-presentation/pirate-fruit-client-bridge.mjs', import.meta.url), 'utf8');

for (const file of [
  'asset-presentation/pirate-fruit-pbr-ground.mjs',
  'pirate-fruit-offline/pocket-presentation.mjs',
  'pirate-fruit-offline/pocket-ground-presentation.mjs',
]) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${file}`, import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || `${file} syntax failed`);
}

assert.match(legacyBridgeSrc, /surfaceStyle = 'four-side-block-v1'/, 'test proves the old repaint path still exists and therefore needs a post-overlay');
assert.match(presentationSrc, /hookPirateFruitRenderer\(pirateFruitThree\);/, 'existing Pirate/Studio presentation remains unchanged');
assert.doesNotMatch(presentationSrc, /hookPirateFruitPbrGround/, 'ground is isolated from the Studio presentation entry');
assert.match(groundEntrySrc, /threeFromPirateFruitVendor/, 'PBR overlay shares the exact Pirate Fruit Three instance');
assert.match(groundEntrySrc, /hookPirateFruitPbrGround\(\{ THREE: pirateFruitThreeKit \}\)/, 'isolated ground entry installs the post-overlay');
assert.match(offlineHtml, /pocket-presentation\.mjs\?v=29/, 'existing immediate attack presentation cache contract stays intact');
assert.match(offlineHtml, /pocket-ground-presentation\.mjs\?v=1/, 'offline iframe loads the new isolated PBR ground entry');
assert.ok(
  offlineHtml.indexOf('pocket-presentation.mjs?v=29') < offlineHtml.indexOf('pocket-ground-presentation.mjs?v=1'),
  'legacy Pirate presentation is installed before the PBR post-overlay',
);

assert.match(pbrSrc, /material-pack-v1\.json/, 'PBR overlay consumes the shared WorldSim material library');
assert.match(pbrSrc, /normalMap/, 'PBR overlay assigns normal maps');
assert.match(pbrSrc, /roughnessMap/, 'PBR overlay assigns roughness maps');
assert.match(pbrSrc, /aoMap/, 'PBR overlay supports AO when UVs are available');
assert.match(pbrSrc, /surfaceStyle = 'worldsim-pbr-v1'/, 'terrain is marked with the new visible surface style');
assert.match(pbrSrc, /simulationAuthority: false/, 'Pirate semantic material mapping never pretends to be WorldSim truth');
assert.match(pbrSrc, /presentationOnly: true/, 'PBR terrain overlay is presentation-only');
assert.match(pbrSrc, /geometry\/collision stays untouched/, 'source documents geometry/collision preservation');
assert.doesNotMatch(pbrSrc, /geometry\.setAttribute\(['"]position|position\.set\(/, 'PBR overlay never changes terrain positions');
assert.doesNotMatch(pbrSrc, /fetchWorldMapFrame|\/world\/zones\//, 'Pirate island material mapping does not invent a live WorldSim zone mapping');

console.log('V9.0 Pirate Fruit WorldSim PBR ground: PASS');
