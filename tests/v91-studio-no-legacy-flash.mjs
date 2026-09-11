import assert from 'node:assert/strict';
import fs from 'node:fs';

const scene = fs.readFileSync(new URL('../scene-v900.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../pirate-studio-reveal-gate-v1.css', import.meta.url), 'utf8');
const gate = fs.readFileSync(new URL('../pirate-studio-reveal-gate-v1.mjs', import.meta.url), 'utf8');
const child = fs.readFileSync(new URL('../pirate-fruit-offline/pocket-presentation.mjs', import.meta.url), 'utf8');
const childHtml = fs.readFileSync(new URL('../pirate-fruit-offline/index.html', import.meta.url), 'utf8');
const visibility = fs.readFileSync(new URL('../asset-presentation/pirate-local-player-visibility-v1.mjs', import.meta.url), 'utf8');

const cssIndex = scene.indexOf('pirate-studio-reveal-gate-v1.css?v=2');
const gateIndex = scene.indexOf('pirate-studio-reveal-gate-v1.mjs?v=2');
const sceneEntryIndex = scene.indexOf('scene-entry-v900.mjs?v=61');
assert.ok(cssIndex >= 0 && gateIndex > cssIndex && sceneEntryIndex > gateIndex,
  'nonblocking visibility gate CSS/module must load before the scene runtime mounts Pirate Fruit');

assert.match(css, /#pirateFruitFrame\s*\{[\s\S]*visibility:\s*hidden\s*!important[\s\S]*opacity:\s*0\s*!important[\s\S]*pointer-events:\s*none\s*!important/,
  'Pirate iframe stays hidden until the child confirms its legacy-player guard is armed');
assert.match(css, /html\[data-pirate-world-ready="true"\]\s*#pirateFruitFrame\s*\{[\s\S]*visibility:\s*visible\s*!important[\s\S]*opacity:\s*1\s*!important/,
  'world visibility depends on safe child readiness, not remote Blue delivery');
assert.doesNotMatch(css, /data-pirate-studio-ready[^}]*#pirateFruitFrame/,
  'Blue delivery must not block visibility of the whole Pirate world');

assert.match(gate, /PIRATE_STUDIO_CHARACTER_READY/,
  'gate listens for child readiness after visibility guard installation');
assert.match(gate, /message\.type === PIRATE_STUDIO_CHARACTER_READY[\s\S]*pirateWorldReady = 'true'/,
  'safe child readiness reveals the world while Blue continues asynchronously');
assert.match(gate, /message\.type === PIRATE_STUDIO_CHARACTER_ACCEPTED[\s\S]*pirateStudioReady = 'true'/,
  'Blue ACCEPTED still marks the final Studio presentation ready state');
assert.match(gate, /message\.type === PIRATE_STUDIO_CHARACTER_FAILED[\s\S]*blue-failed-world-live/,
  'Studio failure leaves the safe world live instead of re-blocking boot');
assert.doesNotMatch(gate, /message\.type === PIRATE_STUDIO_CHARACTER_FAILED[\s\S]{0,500}delete root\.dataset\.pirateWorldReady/,
  'Studio failure must never hide the already-safe world');
assert.match(gate, /url\.pathname\.endsWith\('\/pirate-fruit-offline\/index\.html'\)[\s\S]*searchParams\.set\('release', release\)/,
  'scene gate binds the Pirate child HTML request to the deployed release cache key');
assert.match(gate, /event\.source !== frame\.contentWindow \|\| event\.origin !== 'null'/,
  'gate messages must come from the sandboxed active Pirate frame');
assert.match(gate, /message\.capability !== frame\.dataset\.studioCapability/,
  'gate messages must match the per-frame Studio capability');

const guardInstall = child.indexOf('installPirateLocalPlayerVisibilityGuard(pirateFruitThree)');
const bridgeInstall = child.indexOf('hookPirateFruitRenderer(pirateFruitThree)');
const readyPost = child.indexOf('PIRATE_STUDIO_CHARACTER_READY');
assert.ok(guardInstall >= 0 && bridgeInstall > guardInstall,
  'legacy-player guard must arm before the Pirate renderer bridge');
assert.ok(readyPost >= 0 && guardInstall < readyPost,
  'child must not advertise readiness before the legacy-player guard is armed');
assert.match(childHtml, /pocket-presentation\.mjs\?v=30/,
  'Pirate child cache-busts the nonblocking presentation bootstrap');

assert.match(visibility, /hideLegacyLocalPlayer/,
  'visibility guard marks the local Pirate host as legacy-hidden');
assert.match(visibility, /pocketVisualSource === 'studio-character'/,
  'Blue Studio presentation is explicitly exempt from legacy hiding');
assert.match(visibility, /pocketKind === 'player'[\s\S]*pocketVisualSource !== 'studio-character'[\s\S]*visible = false/,
  'fallback Pocket player visual is hidden before it can paint');
assert.match(visibility, /player:pirate-v1|player:gameplay-root/,
  'guard recognizes the real local Pirate player hosts');

console.log('Blue Explorer nonblocking no-legacy-flash gate passed');
