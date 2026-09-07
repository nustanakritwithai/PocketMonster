import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as vendor from '../pirate-fruit-offline/assets/vendor-three-Bv6LZXUZ.js';
import {
  installPirateFruitPocketPresentation,
  receivePirateStudioCharacterPackage,
  subscribePirateStudioCharacterInstallResult,
  threeFromPirateFruitVendor,
} from '../asset-presentation/pirate-fruit-client-bridge.mjs';

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const boot = read('boot-pirate-fruit-v900.mjs');
const client = read('pirate-fruit-offline/pocket-presentation.mjs');
const bridge = read('asset-presentation/pirate-fruit-client-bridge.mjs');
assert.match(boot, /loadStudioCharacterFromEngine\(\)/);
assert.match(boot, /studioCapability/);
assert.match(boot, /PIRATE_STUDIO_CHARACTER_READY/);
assert.match(boot, /PIRATE_STUDIO_CHARACTER_PACKAGE/);
assert.match(boot, /frame\.contentWindow\?\.postMessage\([\s\S]*PIRATE_STUDIO_CHARACTER_PACKAGE/);
assert.doesNotMatch(boot, /allow-same-origin/);
assert.match(client, /event\.source !== window\.parent \|\| event\.origin !== parentOrigin/);
assert.match(client, /receivePirateStudioCharacterPackage\(message\.package\)/);
assert.match(client, /subscribePirateStudioCharacterInstallResult/);
assert.match(client, /result\.installed \? PIRATE_STUDIO_CHARACTER_ACCEPTED : PIRATE_STUDIO_CHARACTER_FAILED/);
assert.match(bridge, /registerProvider\('studio-character'/);
assert.match(bridge, /visibleStudioRoot\(studio\)/);
assert.match(bridge, /item\.host\.add\(studio\.root\)/);
assert.match(bridge, /item\.rigRetargeter = null/);
assert.match(bridge, /item\.rigRetargeter\?\.update\(\)/);

const kit = threeFromPirateFruitVendor(vendor);
for (const name of ['Group', 'Mesh', 'BufferGeometry', 'BufferAttribute', 'Vector3', 'Box3']) {
  assert.equal(typeof kit[name], 'function', `active vendor adapter must expose ${name}`);
}

const nativeFetch = globalThis.fetch;
globalThis.fetch = async input => {
  const url = input instanceof URL ? input : new URL(String(input));
  if (url.protocol === 'file:') {
    try {
      const body = fs.readFileSync(fileURLToPath(url));
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    } catch { return new Response('', { status: 404 }); }
  }
  return nativeFetch(input);
};

const transform = { position: [0, 0, 0], rotation: [0, 0, 0, 'XYZ'], scale: [1, 1, 1] };
const id = 'character.human.pirate.studio-active-path-test';
const pkg = {
  schema: 'pocket-character-runtime-v1', schemaVersion: '1.0.0',
  target: { game: 'PocketMonster', assetEngine: 'asset-presentation', provider: 'studio-character' },
  manifest: { id, name: 'Active Path Test', kind: 'character', provider: 'studio-character', style: 'blocky-bighead-studio-v1', surfaceStyle: 'pbr-studio-v1', rig: 'studio-three-group-v1', metrics: { height: 1.8 }, roles: { player: {} }, contract: 'presentation-only' },
  catalogEntry: { id, name: 'Active Path Test', kind: 'character', provider: 'studio-character', style: 'blocky-bighead-studio-v1', surfaceStyle: 'pbr-studio-v1', rig: 'studio-three-group-v1', metrics: { height: 1.8 }, roles: { player: {} } },
  character: {},
  sceneGraph: { schema: 'three-group-scenegraph-v1', stats: { meshes: 1, externalTextureRefs: 0 }, root: { name: 'CharacterRoot', nodeType: 'group', visible: true, transform, userData: {}, children: [
    { name: 'joint', nodeType: 'group', visible: true, transform, userData: {}, children: [] },
    { name: 'body', nodeType: 'mesh', visible: true, transform, userData: {}, children: [], geometry: { attributes: { position: { itemSize: 3, normalized: false, arrayType: 'Float32Array', array: [-0.4, 0, 0, 0.4, 0, 0, 0, 1.5, 0] } }, index: { itemSize: 1, arrayType: 'Uint16Array', array: [0, 1, 2] }, groups: [], drawRange: { start: 0, count: 3 } }, material: { type: 'MeshStandardMaterial', color: '#ff00ff', roughness: 0.7, metalness: 0, opacity: 1, transparent: false, maps: {} } },
  ] } },
  rig: { architecture: 'THREE.Group', schema: 'studio-rig-v1', root: 'characterRoot', jointNames: ['rootJoint'], jointBindings: { rootJoint: { path: [0], nodeName: 'joint' } }, sockets: Object.fromEntries(['rightHand', 'leftHand', 'head', 'back', 'waist', 'vfxOrigin', 'attackOrigin', 'throwOrigin'].map(name => [name, { joint: 'rootJoint', offset: [0, 0, 0] }])) },
  animations: [
    { id: 'idle', name: 'idle', duration: 1, loop: true, runtime: { state: 'idle' }, keyframes: [{ time: 0, joints: { rootJoint: { rotation: [0, 0, 0] } } }, { time: 1, joints: { rootJoint: { rotation: [0, 0, 0] } } }] },
    { id: 'walk', name: 'walk', duration: 1, loop: true, runtime: { state: 'walk' }, keyframes: [{ time: 0, joints: { rootJoint: { rotation: [0, 0, 0] } } }, { time: 1, joints: { rootJoint: { rotation: [0.2, 0, 0] } } }] },
  ],
  gameplayPolicy: { included: false, authority: 'game' },
};

const installedPromise = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Studio active-path install timeout')), 3000);
  const off = subscribePirateStudioCharacterInstallResult(result => { clearTimeout(timer); off(); resolve(result); });
});
const received = receivePirateStudioCharacterPackage(pkg);
assert.equal(received.accepted, true);
assert.equal(received.installed, false, 'receipt alone must not claim visual install success');
const session = await installPirateFruitPocketPresentation({ THREE: kit, vendor });
const scene = new kit.Group(); scene.userData = {};
const host = new kit.Group(); host.name = 'player:pirate-v1'; scene.add(host);
session.visit(scene);
const installed = await installedPromise;
assert.equal(installed.installed, true, installed.error || 'Studio visual should install');
assert.equal(session.diagnostics().playerVisualSource, 'studio-character');
assert.equal(session.diagnostics().studioPlayers, 1);
assert.ok(host.children.some(child => child?.userData?.pocketVisualSource === 'studio-character'), 'Studio root is actually attached to the live player host');
assert.doesNotThrow(() => session.update(scene), 'post-install update must not dereference removed Pirate retargeter');
host.position.x += 1;
assert.doesNotThrow(() => session.update(scene), 'Studio player remains updateable while moving');
console.log('V9.1 active Pirate Studio behavioral gate passed');
