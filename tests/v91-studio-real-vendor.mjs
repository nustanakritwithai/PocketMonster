import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as vendor from '../pirate-fruit-offline/assets/vendor-three-RYo9rfeI.js';
import {
  threeFromPirateFruitVendor,
  installPirateFruitPocketPresentation,
  receivePirateStudioCharacterPackage,
  subscribePirateStudioCharacterStatus,
} from '../asset-presentation/pirate-fruit-client-bridge.mjs';

// Browser acceptance exports this input from the pinned actual Studio producer.
const source = process.argv[2];
assert.ok(source, 'Pass the actual-studio-package.json emitted by the browser test');
const pkg = JSON.parse(await fs.readFile(source, 'utf8'));
const kit = threeFromPirateFruitVendor(vendor);
assert.notEqual(kit.Box3, kit.WebGLRenderer, 'A source substring is not a constructor contract');
assert.equal(new kit.Box3().isBox3, true);
const nativeFetch = globalThis.fetch;
globalThis.fetch = async url => ({ ok: true, json: async () => JSON.parse(await fs.readFile(url, 'utf8')) });
const events = [];
const unsubscribe = subscribePirateStudioCharacterStatus(status => events.push(status));
try {
  const session = await installPirateFruitPocketPresentation({ THREE: kit, vendor });
  const scene = new kit.Scene();
  const gameplay = new kit.Group();
  gameplay.name = 'player:gameplay-root';
  gameplay.userData = { hp: 71, saveId: 'unchanged-test-identity' };
  const host = new kit.Group();
  host.name = 'player:pirate-v1';
  gameplay.add(host);
  scene.add(gameplay);
  session.visit(scene);
  const fallback = host.children.find(node => node.userData.pocketVisual);
  assert.ok(fallback);
  const dataBefore = JSON.stringify(gameplay.userData);
  const malformed = structuredClone(pkg);
  malformed.sceneGraph.root.children = [];
  assert.equal(receivePirateStudioCharacterPackage(malformed).accepted, false);
  assert.equal(fallback.visible, true);

  // A syntactically valid but degenerate producer must fail before fallback hides.
  const flat = structuredClone(pkg);
  flat.manifest.id += '.zero-height';
  flat.catalogEntry.id = flat.manifest.id;
  function flatten(node) {
    node.transform.position = [0, 0, 0];
    node.transform.rotation = [0, 0, 0, 'XYZ'];
    if (node.nodeType === 'mesh') node.geometry.attributes.position.array.fill(0);
    for (const child of node.children || []) flatten(child);
  }
  flatten(flat.sceneGraph.root);
  receivePirateStudioCharacterPackage(flat);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(events.at(-1).state, 'failed');
  assert.equal(fallback.visible, true);
  assert.equal(fallback.parent, host);

  assert.equal(receivePirateStudioCharacterPackage(pkg).accepted, true);
  assert.equal(events.at(-1).state, 'validated', 'Receipt is not attachment');
  receivePirateStudioCharacterPackage(pkg); // duplicate while installation pending
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(events.at(-1).state, 'attached');
  assert.equal(session.diagnostics().studioPlayers, 1);
  const studio = host.children.find(node => node.userData.pocketVisualSource === 'studio-character');
  assert.ok(studio);
  assert.equal(host.children.filter(node => node.userData.pocketVisual).length, 1);
  const bounds = new kit.Box3().setFromObject(studio);
  assert.ok(Math.abs(bounds.max.y - bounds.min.y - 1.8) < 0.001);
  assert.ok(Math.abs(bounds.min.y) < 0.001, 'Studio feet must meet original local ground');
  assert.equal(studio.rotation.y, 0, 'Actual Studio +Z front must not get legacy PI rotation');
  for (let i = 0; i < 120; i++) {
    gameplay.position.x += 0.01;
    gameplay.rotation.y += 0.005;
    session.update(scene); // Previously crashed on first frame: null.update().
  }
  assert.equal(session.diagnostics().studioPlayer.updates, 120);
  assert.equal(studio.parent, host);
  assert.equal(host.parent, gameplay);
  assert.equal(JSON.stringify(gameplay.userData), dataBefore);
  assert.deepEqual(gameplay.scale.toArray(), [1, 1, 1]);
  assert.deepEqual(host.scale.toArray(), [1, 1, 1]);
  assert.equal(fallback.parent, null);
  console.log('PASS: actual Studio package, real vendor, correct Box3, transactional failure, duplicate guard, 120 subsequent frames, grounded 1.8 height, unchanged gameplay owner');
} finally {
  unsubscribe();
  globalThis.fetch = nativeFetch;
}
