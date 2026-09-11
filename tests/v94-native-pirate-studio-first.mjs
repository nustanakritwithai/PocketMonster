import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { worldById } from '../combined-worlds-v900.mjs';
import { collectPublicDependencyClosure } from '../scripts/build-github-pages.mjs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const nativePirate = read('world-pirate-native-v900.mjs');
const combined = read('combined-worlds-v900.mjs');
const legacyBoot = read('boot-pirate-fruit-v900.mjs');

assert.equal(worldById('pirate-fruit').runtime, './world-pirate-native-v900.mjs?v=1',
  'active Pirate route must start in the native Studio-first runtime');
assert.match(combined, /Pirate Fruit Native V9/);
assert.doesNotMatch(combined, /boot-pirate-fruit-v900\.mjs\?v=953/,
  'active world catalog must not route through the offline Pirate boot');

assert.match(nativePirate, /loadStudioCharacterFromEngine\(/);
assert.match(nativePirate, /installStudioCharacterPackage\(assets, studioPackage/);
assert.match(nativePirate, /assets\.spawn\(studioPackage\.manifest\.id/);
assert.match(nativePirate, /applyStudioCharacterRenderProfile\(playerVisual\.root, playerVisual\.renderProfile/);
assert.match(nativePirate, /normalizePlayerHeight\(/);
assert.match(nativePirate, /POCKETMONSTER_SCENE_LIFECYCLE = Object\.freeze/);
assert.match(nativePirate, /publishWorldState\(\{/);
assert.match(nativePirate, /installWorldPresence\(\{/);
assert.match(nativePirate, /destination: 'pocket-monster'/);
assert.match(nativePirate, /destination: 'living-world'/);
assert.match(nativePirate, /offlineClientLoaded: false/);

assert.match(nativePirate, /action: payload => handleNativeAction\(payload\)/,
  'shared mobile Pirate controls must keep an action handler after removing the iframe');
assert.match(nativePirate, /PIRATE_NATIVE_ACTION_EVENT/,
  'native actions must be exposed to the gameplay/server integration layer');
assert.match(nativePirate, /presentationActionUntil/,
  'locomotion must not immediately cut short a native Studio action');
assert.match(nativePirate, /presentationOnly: true,[\s\S]*combatAuthority: false/,
  'native action handoff stays presentation-side and cannot become damage authority');

assert.doesNotMatch(nativePirate, /pirate-fruit-offline|pirateFruitFrame|mountPirateOffline/,
  'native Pirate runtime must never touch the vendored offline client');
assert.doesNotMatch(nativePirate,
  /^import \{ createPirateFruitPlayerProvider \} from ['"]\.\/asset-presentation\/providers\/pirate-fruit-player\.mjs/m,
  'legacy player provider must not be downloaded on the normal Studio-first path');
assert.match(nativePirate,
  /catch \(error\)[\s\S]*await import\('\.\/asset-presentation\/providers\/pirate-fruit-player\.mjs\?v=native-fallback-1'\)/,
  'legacy player provider may load only after a real Studio failure');

const root = fileURLToPath(new URL('..', import.meta.url));
const closure = collectPublicDependencyClosure(root);
assert.ok(closure.has('world-pirate-native-v900.mjs'),
  'Pages active dependency closure must include the native Pirate runtime');
assert.equal(closure.has('boot-pirate-fruit-v900.mjs'), false,
  'Pages active dependency closure must not preload the legacy Pirate boot');
assert.equal([...closure].some(path => path.startsWith('pirate-fruit-offline/')), false,
  'Pages active dependency closure must not preload any vendored offline Pirate file');

assert.match(legacyBoot, /pirate-fruit-offline\/index\.html/,
  'legacy offline client remains rollback-only in the repository');

console.log('V9.4 Native Pirate Studio-first gate: PASS');
