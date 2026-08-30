import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  PIRATE_FRUIT_CLIENT_BRIDGE,
  PIRATE_FRUIT_MONSTER_VISUALS,
  classifyPirateFruitNode,
  hookPirateFruitRenderer,
  pocketMonsterIdFor,
  threeFromPirateFruitVendor,
} from '../asset-presentation/pirate-fruit-client-bridge.mjs';

const bridgeSrc = fs.readFileSync(new URL('../asset-presentation/pirate-fruit-client-bridge.mjs', import.meta.url), 'utf8');
const hookSrc = fs.readFileSync(new URL('../pirate-fruit-offline/pocket-presentation.mjs', import.meta.url), 'utf8');
const pirateOfflineHtml = fs.readFileSync(new URL('../pirate-fruit-offline/index.html', import.meta.url), 'utf8');
const boot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const worldsJs = fs.readFileSync(new URL('../combined-worlds-v900.mjs', import.meta.url), 'utf8');
const pirateSource = JSON.parse(fs.readFileSync(new URL('../pirate-fruit-offline/SOURCE.json', import.meta.url), 'utf8'));
const slimes = JSON.parse(fs.readFileSync(new URL('../assets/catalog/monster-slimes.json', import.meta.url), 'utf8'));
const animals = JSON.parse(fs.readFileSync(new URL('../assets/catalog/monster-animals.json', import.meta.url), 'utf8'));
const catalogIds = new Set([
  ...slimes.assets.map(asset => asset.id),
  ...animals.assets.map(asset => asset.id),
]);

for (const file of [
  'asset-presentation/pirate-fruit-client-bridge.mjs',
  'pirate-fruit-offline/pocket-presentation.mjs',
]) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${file}`, import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || `${file} syntax failed`);
}

assert.equal(PIRATE_FRUIT_CLIENT_BRIDGE.zone, 'pirate-fruit');
assert.equal(PIRATE_FRUIT_CLIENT_BRIDGE.source, 'pirate-fruit-offline');
assert.equal(PIRATE_FRUIT_CLIENT_BRIDGE.visual, 'pocket-asset-engine');
assert.equal(PIRATE_FRUIT_CLIENT_BRIDGE.presentationOnly, true);
assert.equal(PIRATE_FRUIT_CLIENT_BRIDGE.combatAuthority, false);
assert.equal(PIRATE_FRUIT_CLIENT_BRIDGE.createsStage, false);
assert.equal(pirateSource.pocketPresentation.visual, 'pocket-asset-engine');
assert.equal(pirateSource.pocketPresentation.createsStage, false);
assert.equal(pirateSource.pocketPresentation.player, 'character.human.pirate-fruit.v1');
assert.equal(pirateSource.pocketPresentation.people, 'character.human.blocky-bighead.v1');
assert.equal(pirateSource.pocketPresentation.ui, 'pirate-fruit-original');

assert.doesNotMatch(bridgeSrc, /from ['"]three['"]/, 'bridge must not import the three npm package');
assert.doesNotMatch(hookSrc, /from ['"]three['"]/, 'offline hook must not import the three npm package');
assert.doesNotMatch(bridgeSrc, /mergeGeometries/, 'bridge does not vendor Pirate Fruit mesh merging');
assert.doesNotMatch(bridgeSrc, /ZONES|WARP_ROUTES|world-pirate-fruit-v900/, 'bridge does not add a hunt stage');
assert.match(bridgeSrc, /createAssetEngine/, 'bridge uses the Pocket asset engine');
assert.match(bridgeSrc, /character\.human\.pirate-fruit\.v1/, 'local player uses the pirate Pocket visual');
assert.match(bridgeSrc, /character\.human\.blocky-bighead\.v1/, 'other people use the Pocket bighead visual');
assert.match(bridgeSrc, /paintGroundGrid/, 'bridge paints Pocket ground on existing terrain');
assert.match(bridgeSrc, /paintSkyGradient/, 'bridge paints Pocket sky on the existing scene');
assert.doesNotMatch(boot, /buildPirateFruitWorld|pirate-fruit-world\.mjs/, 'pirate boot does not mount a Pocket-built island');
assert.match(boot, /id = 'pirateFruitFrame'/, 'real Pirate Fruit client stays in the iframe');
assert.doesNotMatch(worldsJs, /world-pirate-fruit-v900/, 'combined worlds do not add a Pocket pirate stage runtime');
assert.equal(fs.existsSync(new URL('../asset-presentation/scenes/pirate-fruit-world.mjs', import.meta.url)), false, 'Pocket-built pirate island scene file is gone');
assert.equal(fs.existsSync(new URL('../world-pirate-fruit-v900.mjs', import.meta.url)), false, 'deleted island stage filename stays gone');

assert.match(pirateOfflineHtml, /src="\.\/pocket-presentation\.mjs"/, 'offline HTML loads the Pocket hook');
assert.match(pirateOfflineHtml, /src="\.\/assets\/index-CpjvNXV8\.js"/, 'offline HTML still boots the real Vite client');
assert.ok(
  pirateOfflineHtml.indexOf('pocket-presentation.mjs') < pirateOfflineHtml.indexOf('index-CpjvNXV8.js'),
  'Pocket hook is listed before the Pirate Fruit bundle',
);
assert.match(hookSrc, /vendor-three-Bv6LZXUZ\.js/, 'hook shares the Pirate Fruit vendor Three instance');
assert.match(hookSrc, /hookPirateFruitRenderer/, 'hook installs the Pocket overlay before the client renders');

const pirateBundle = fs.readFileSync(new URL('../pirate-fruit-offline/assets/index-CpjvNXV8.js', import.meta.url), 'utf8');
assert.match(pirateBundle, /pocketmonster:world-warp-v1/, 'real Pirate Fruit bundle is unchanged enough to keep portals');
assert.doesNotMatch(bridgeSrc, /index-CpjvNXV8/, 'bridge does not rewrite the minified Vite client');

assert.equal(classifyPirateFruitNode('player:pirate-v1'), 'player');
assert.equal(classifyPirateFruitNode('player:gameplay-root'), 'player');
assert.equal(classifyPirateFruitNode('remote-player:abc'), 'remote');
assert.equal(classifyPirateFruitNode('character:hull'), 'npc');
assert.equal(classifyPirateFruitNode('monster:crab'), 'monster');
assert.equal(classifyPirateFruitNode('PF_TERRAIN_STARTER-ISLAND'), 'terrain');
assert.equal(classifyPirateFruitNode('boat:skiff'), 'boat');
assert.equal(classifyPirateFruitNode('PF_ISLAND_STARTER_DETAILS'), 'prop');
assert.equal(classifyPirateFruitNode('pocket-monster-world-portal'), 'skip');
assert.equal(classifyPirateFruitNode('effect:slash'), 'skip');
assert.equal(pocketMonsterIdFor('monster:crab'), 'monster.slime.aquapuff.bighead.v1');
assert.equal(pocketMonsterIdFor('monster:unknown-raider'), 'monster.slime.normalooze.bighead.v1');
for (const id of Object.values(PIRATE_FRUIT_MONSTER_VISUALS)) {
  assert.equal(catalogIds.has(id), true, `mapped monster visual ${id} exists in Pocket catalogs`);
}

const vendor = await import('../pirate-fruit-offline/assets/vendor-three-Bv6LZXUZ.js');
const kit = threeFromPirateFruitVendor(vendor);
assert.equal(typeof kit.Object3D, 'function');
assert.equal(typeof kit.Group, 'function');
assert.equal(typeof kit.Mesh, 'function');
assert.equal(typeof kit.BoxGeometry, 'function');
assert.equal(typeof kit.MeshStandardMaterial, 'function');
assert.equal(typeof kit.CanvasTexture, 'function');
const group = new kit.Group();
group.name = 'player:pirate-v1';
assert.equal(classifyPirateFruitNode(group.name), 'player');
const box = new kit.BoxGeometry(1, 1, 1);
const mat = new kit.MeshStandardMaterial({ color: 0x17364b });
const mesh = new kit.Mesh(box, mat);
assert.equal(mesh.isMesh, true);
assert.equal(typeof kit.Object3D.prototype.updateMatrixWorld, 'function');

const hook = hookPirateFruitRenderer(vendor);
assert.equal(hook.hooked, true);
assert.equal(hook.createsStage, false);
assert.equal(hook.visual, 'pocket-asset-engine');
assert.equal(kit.Object3D.prototype.updateMatrixWorld.__pocketPirateBridge.hook, 'object3d-updateMatrixWorld');
assert.equal(hookPirateFruitRenderer(vendor).hook, 'object3d-updateMatrixWorld', 'hook is idempotent');

console.log('V9.0 pirate-fruit client bridge: PASS');
