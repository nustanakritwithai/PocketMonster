import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { worldById } from '../combined-worlds-v900.mjs';
import { collectPublicDependencyClosure } from '../scripts/build-github-pages.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

const offlineHtml = read('pirate-fruit-offline/index.html');
const presentation = read('pirate-fruit-offline/pocket-presentation.mjs');
const bridge = read('asset-presentation/pirate-fruit-client-bridge.mjs');
const blockyGround = read('asset-presentation/blocky-ground.mjs');

assert.equal(worldById('pirate-fruit').runtime, './boot-pirate-fruit-v900.mjs?v=953',
  'Pirate Fruit must keep the multi-island production runtime');

assert.match(offlineHtml, /pocket-presentation\.mjs\?v=29/,
  'Pirate iframe must install the Pocket presentation bridge');
assert.doesNotMatch(offlineHtml, /pocket-ground-presentation\.mjs/,
  'retired PBR ground overlay entry must not load');
assert.doesNotMatch(offlineHtml, /pirate-fruit-pbr-ground\.mjs/,
  'retired PBR ground implementation must not load');

assert.match(presentation, /hookPirateFruitRenderer\(pirateFruitThree\);/,
  'active Pirate presentation must install the renderer bridge');
assert.match(bridge, /from ['"]\.\/blocky-ground\.mjs['"]/,
  'active Pirate bridge must own the blocky ground painter');
assert.match(bridge, /paintGroundGrid/,
  'active Pirate bridge must repaint terrain with the block grid');
assert.match(bridge, /surfaceStyle = ['"]four-side-block-v1['"]/,
  'active Pirate terrain must identify as four-side-block-v1');
assert.match(blockyGround, /export const GROUND_REPEAT/,
  'blocky ground module must expose the production repeat contract');
assert.match(blockyGround, /paintGroundGrid/,
  'blocky ground module must expose the grid painter');

const closure = collectPublicDependencyClosure(root);
for (const required of [
  'pirate-fruit-offline/index.html',
  'pirate-fruit-offline/pocket-presentation.mjs',
  'asset-presentation/pirate-fruit-client-bridge.mjs',
  'asset-presentation/blocky-ground.mjs',
]) {
  assert.equal(closure.has(required), true, `${required} must be in the current production closure`);
}
for (const retired of [
  'pirate-fruit-offline/pocket-ground-presentation.mjs',
  'asset-presentation/pirate-fruit-pbr-ground.mjs',
]) {
  assert.equal(closure.has(retired), false, `${retired} must stay out of the current production closure`);
}

console.log('V9.0 Pirate Fruit multi-island blocky ground: PASS');
