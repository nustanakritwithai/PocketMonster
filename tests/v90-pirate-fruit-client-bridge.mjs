import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  PIRATE_FRUIT_CLIENT_BRIDGE,
  PIRATE_FRUIT_MONSTER_VISUALS,
  applyPirateFruitActionTransition,
  classifyPirateFruitNode,
  hidePirateFruitOriginalMeshes,
  hookPirateFruitRenderer,
  orientPirateFruitVisual,
  pirateFruitActionSignalFromCombat,
  pirateFruitKindForNode,
  pocketMonsterIdFor,
  resolvePirateVisualHost,
  shouldPreservePirateSubtree,
  threeFromPirateFruitVendor,
} from '../asset-presentation/pirate-fruit-client-bridge.mjs';

const bridgeSrc = fs.readFileSync(new URL('../asset-presentation/pirate-fruit-client-bridge.mjs', import.meta.url), 'utf8');
const hookSrc = fs.readFileSync(new URL('../pirate-fruit-offline/pocket-presentation.mjs', import.meta.url), 'utf8');
const pirateOfflineHtml = fs.readFileSync(new URL('../pirate-fruit-offline/index.html', import.meta.url), 'utf8');
const pirateBootstrap = fs.readFileSync(new URL('../pirate-fruit-offline/pocket-bootstrap.mjs', import.meta.url), 'utf8');
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

const idleCombat = { combatState: 'idle', controller: { hp: 100 } };
assert.equal(pirateFruitActionSignalFromCombat(idleCombat), null, 'idle combat has no presentation action');

const meleeSwing = {
  combatState: 'attack-1',
  controller: { hp: 100 },
  swing: { comboIndex: 1, timer: 0.18, duration: 0.42 },
  loadout: { state: { activeSet: 'sword', equippedWeaponKind: 'cutlass' } },
};
const meleeSnapshot = structuredClone(meleeSwing);
const meleeSignal = pirateFruitActionSignalFromCombat(meleeSwing);
assert.equal(meleeSignal.action, 'attack-melee');
assert.equal(meleeSignal.token, meleeSwing.swing, 'a live swing object is the stable attack token');
assert.equal(meleeSignal.duration, 0.42);
assert.deepEqual(meleeSwing, meleeSnapshot, 'normalization does not mutate combat');
assert.equal(
  pirateFruitActionSignalFromCombat({
    combatState: 'attack-ranged',
    controller: { hp: 100 },
    swing: { comboIndex: 0, timer: 0.1 },
    loadout: { state: { activeSet: 'primary', equippedWeaponKind: 'flintlock-gun' } },
  }).action,
  'attack-ranged',
  'only clearly ranged equipment selects the ranged Pocket attack',
);
assert.equal(
  pirateFruitActionSignalFromCombat({ combatState: 'attack-2', controller: { hp: 100 }, swing: null }).action,
  'attack-melee',
  'attack states default to melee without clearly ranged equipment',
);

const pendingCast = { skillId: 'fireball', targetId: 'crab-1' };
const casting = {
  combatState: 'casting',
  controller: { hp: 100 },
  pendingCast,
  skillVisualElapsed: 0.25,
  skillVisualDuration: 0.9,
};
const castSignal = pirateFruitActionSignalFromCombat(casting);
assert.equal(castSignal.action, 'skill');
assert.equal(castSignal.token, pendingCast, 'cast token does not include continuously changing elapsed time');
assert.equal(castSignal.duration, 0.9);
casting.skillVisualElapsed = 0.5;
assert.equal(pirateFruitActionSignalFromCombat(casting).token, castSignal.token, 'cast token remains stable while elapsed changes');

const hurtOverAttack = pirateFruitActionSignalFromCombat({
  combatState: 'attack-1',
  controller: { hp: 10 },
  swing: { comboIndex: 1 },
  damageReactionSerial: 7,
  timeSinceDamaged: 0.12,
});
assert.equal(hurtOverAttack.action, 'hurt', 'hurt outranks attack');
assert.match(String(hurtOverAttack.token), /7/, 'hurt token includes the damage serial');
assert.equal(
  pirateFruitActionSignalFromCombat({
    combatState: 'casting',
    controller: { hp: 0 },
    pendingCast: { skillId: 'fireball' },
    damageReactionSerial: 8,
    timeSinceDamaged: 0.1,
  }).action,
  'dead',
  'dead outranks hurt and skill',
);
assert.equal(
  pirateFruitActionSignalFromCombat({ combatState: 'dead', controller: { hp: 100 } }).dead,
  true,
  'dead combat state normalizes the explicit dead flag',
);

function actionCalls(previousAction, sample) {
  const calls = [];
  const handle = { play: (...args) => calls.push(args) };
  applyPirateFruitActionTransition(handle, previousAction, sample);
  return calls;
}

assert.deepEqual(
  actionCalls('dead', { action: 'skill', actionId: 'cast:2', duration: 0.9 }),
  [
    ['idle', { force: true }],
    ['skill', { duration: 0.9 }],
  ],
  'dead-to-skill force-idles before playing the new action',
);
for (const [action, actionId, duration] of [
  ['hurt', 'hurt:8', 0.3],
  ['attack-melee', 'swing:4', 0.45],
]) {
  assert.deepEqual(
    actionCalls('dead', { action, actionId, duration }),
    [
      ['idle', { force: true }],
      [action, { duration }],
    ],
    `direct dead-to-${action} recovery unlocks the provider before playback`,
  );
}
assert.deepEqual(
  actionCalls('dead', { action: null, actionId: null, duration: 0 }),
  [['idle', { force: true }]],
  'dead-to-null only force-idles',
);
assert.deepEqual(
  actionCalls('skill', { action: 'skill', actionId: null, duration: 0.9 }),
  [],
  'a repeated action with a null action id does not replay',
);
assert.deepEqual(
  actionCalls('dead', { action: 'dead', actionId: null, duration: 1 }),
  [],
  'a repeated dead sample neither unlocks nor replays',
);
assert.equal(pirateSource.pocketPresentation.visual, 'pocket-asset-engine');
assert.equal(pirateSource.pocketPresentation.createsStage, false);
assert.equal(pirateSource.pocketPresentation.player, 'character.human.pirate-fruit.v1');
assert.equal(pirateSource.pocketPresentation.people, 'character.human.blocky-bighead.v1');
assert.equal(pirateSource.pocketPresentation.ui, 'pirate-fruit-parent-primary');

assert.doesNotMatch(bridgeSrc, /from ['"]three['"]/, 'bridge must not import the three npm package');
assert.doesNotMatch(hookSrc, /from ['"]three['"]/, 'offline hook must not import the three npm package');
assert.doesNotMatch(bridgeSrc, /mergeGeometries/, 'bridge does not vendor Pirate Fruit mesh merging');
assert.doesNotMatch(bridgeSrc, /ZONES|WARP_ROUTES|world-pirate-fruit-v900/, 'bridge does not add a hunt stage');
assert.match(bridgeSrc, /createAssetEngine/, 'bridge uses the Pocket asset engine');
assert.match(bridgeSrc, /character\.human\.pirate-fruit\.v1/, 'local player uses the pirate Pocket visual');
assert.match(bridgeSrc, /character\.human\.blocky-bighead\.v1/, 'other people use the Pocket bighead visual');
assert.match(bridgeSrc, /paintGroundGrid/, 'bridge paints Pocket ground on existing terrain');
assert.match(bridgeSrc, /paintSkyGradient/, 'bridge paints Pocket sky on the existing scene');
assert.match(bridgeSrc, /createPirateFruitActionTracker/, 'bridge imports and creates the live action adapter');
assert.match(bridgeSrc, /createPirateFruitRigRetargeter/, 'bridge imports and creates source-bone retargeting');
assert.match(bridgeSrc, /createPirateFruitRigRetargeter\(host, handle\.rig\)/, 'local player retargets from the real host into the Pocket rig');
assert.match(bridgeSrc, /userData:\s*\{\s*pocketActionSignal:\s*signal\s*\}/, 'action adapter samples an ephemeral presentation host');
assert.doesNotMatch(bridgeSrc, /host\.userData\.pocketActionSignal\s*=/, 'bridge never writes action signals onto the real host');
assert.match(
  bridgeSrc,
  /applyPirateFruitActionTransition\(item\.handle,\s*item\.lastAction,\s*sample\)/,
  'the live update routes sampled edges through dead-safe playback',
);
assert.match(bridgeSrc, /handle\.update\?\.\(dt,\s*\{\s*moving,\s*locomotion:\s*sample\.locomotion\s*\}\)/, 'adapter locomotion drives Pocket updates');
assert.match(bridgeSrc, /rigRetargeter\.update\(\)/, 'source bones are applied after the generic Pocket update');
assert.match(bridgeSrc, /rigRetargeted:/, 'diagnostics report retargeted visuals');
assert.match(bridgeSrc, /actionDriven:/, 'diagnostics report action-driven visuals');
assert.doesNotMatch(boot, /buildPirateFruitWorld|pirate-fruit-world\.mjs/, 'pirate boot does not mount a Pocket-built island');
assert.match(boot, /id = 'pirateFruitFrame'/, 'real Pirate Fruit client stays in the iframe');
assert.doesNotMatch(worldsJs, /world-pirate-fruit-v900/, 'combined worlds do not add a Pocket pirate stage runtime');
assert.equal(fs.existsSync(new URL('../asset-presentation/scenes/pirate-fruit-world.mjs', import.meta.url)), false, 'Pocket-built pirate island scene file is gone');
assert.equal(fs.existsSync(new URL('../world-pirate-fruit-v900.mjs', import.meta.url)), false, 'deleted island stage filename stays gone');

assert.match(pirateOfflineHtml, /src="\.\/pocket-presentation\.mjs\?v=4"/, 'offline HTML cache-busts and loads the Pocket hook');
const pirateBundleRef = pirateBootstrap.match(/import\('\.\/(assets\/index-[^']+\.js)'\)/)?.[1];
assert.ok(pirateBundleRef, 'offline save bootstrap still boots the real Vite client');
assert.ok(
  pirateOfflineHtml.indexOf('pocket-presentation.mjs') < pirateOfflineHtml.indexOf('pocket-bootstrap.mjs'),
  'Pocket hook is listed before the save bootstrap that imports the Pirate Fruit bundle',
);
assert.match(hookSrc, /vendor-three-Bv6LZXUZ\.js/, 'hook shares the Pirate Fruit vendor Three instance');
assert.match(hookSrc, /hookPirateFruitRenderer/, 'hook installs the Pocket overlay before the client renders');

const pirateBundle = fs.readFileSync(new URL(`../pirate-fruit-offline/${pirateBundleRef}`, import.meta.url), 'utf8');
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
assert.equal(
  classifyPirateFruitNode('PF_STATIC_BATCH_0'),
  'skip',
  'merged static batches keep their original geometry instead of receiving one oversized box overlay',
);
assert.equal(classifyPirateFruitNode('pocket-monster-world-portal'), 'skip');
assert.equal(classifyPirateFruitNode('effect:slash'), 'skip');
assert.equal(classifyPirateFruitNode('player-rig:right-arm'), 'skip');
assert.equal(classifyPirateFruitNode('rig:root'), 'skip');
assert.equal(classifyPirateFruitNode('socket:right-palm'), 'skip');
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
const playerFacingVisual = new kit.Group();
orientPirateFruitVisual(playerFacingVisual, 'player');
assert.equal(playerFacingVisual.rotation.y, Math.PI, 'player overlay converts Pocket -Z front to Pirate Fruit +Z front');
const monsterFacingVisual = new kit.Group();
orientPirateFruitVisual(monsterFacingVisual, 'monster');
assert.equal(monsterFacingVisual.rotation.y, 0, 'non-player overlays keep their existing facing contract');
const box = new kit.BoxGeometry(1, 1, 1);
const mat = new kit.MeshStandardMaterial({ color: 0x17364b });
const mesh = new kit.Mesh(box, mat);
assert.equal(mesh.isMesh, true);
assert.equal(typeof kit.Object3D.prototype.updateMatrixWorld, 'function');

const scene = kit.Scene ? new kit.Scene() : new kit.Group();
scene.isScene = true;
const npcHost = new kit.Group();
const npcRig = new kit.Group();
npcRig.name = 'rig:root';
const npcBody = new kit.Mesh(box, mat.clone());
npcBody.name = 'rig:body:batched';
npcRig.add(npcBody);
const npcHull = new kit.Mesh(box, mat.clone());
npcHull.name = 'character:hull';
npcRig.add(npcHull);
const npcLabel = new kit.Group();
npcLabel.name = 'hp-label';
npcHost.add(npcRig, npcLabel);
scene.add(npcHost);
assert.equal(pirateFruitKindForNode(npcHost), 'npc', 'unnamed top-level rig host is an NPC');
assert.equal(resolvePirateVisualHost(npcHull), npcHost, 'hull resolves to the whole NPC host');
assert.equal(resolvePirateVisualHost(npcRig), npcHost, 'rig node resolves to the whole NPC host');
assert.equal(shouldPreservePirateSubtree(npcLabel), true, 'HP labels stay owned by Pirate Fruit');

const equipment = new kit.Group();
equipment.name = 'equipment:sword';
const equipmentMesh = new kit.Mesh(box, mat.clone());
equipment.add(equipmentMesh);
npcHost.add(equipment);
hidePirateFruitOriginalMeshes(npcHost);
assert.equal(npcBody.visible, false, 'original NPC body silhouette is hidden');
assert.equal(npcHull.visible, false, 'legacy hull silhouette is hidden');
assert.equal(equipmentMesh.visible, true, 'equipment subtree stays visible');
assert.equal(npcLabel.visible, true, 'HP label stays visible');

const hook = hookPirateFruitRenderer(vendor);
assert.equal(hook.hooked, true);
assert.equal(hook.createsStage, false);
assert.equal(hook.visual, 'pocket-asset-engine');
assert.equal(kit.Object3D.prototype.updateMatrixWorld.__pocketPirateBridge.hook, 'object3d-updateMatrixWorld');
assert.equal(hookPirateFruitRenderer(vendor).hook, 'object3d-updateMatrixWorld', 'hook is idempotent');

console.log('V9.0 pirate-fruit client bridge: PASS');
