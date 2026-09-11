import assert from 'node:assert/strict';
import fs from 'node:fs';

const scene = fs.readFileSync(new URL('../scene-v900.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../pirate-studio-reveal-gate-v1.css', import.meta.url), 'utf8');
const gate = fs.readFileSync(new URL('../pirate-studio-reveal-gate-v1.mjs', import.meta.url), 'utf8');

const cssIndex = scene.indexOf('pirate-studio-reveal-gate-v1.css?v=1');
const gateIndex = scene.indexOf('pirate-studio-reveal-gate-v1.mjs?v=1');
const sceneEntryIndex = scene.indexOf('scene-entry-v900.mjs?v=61');
assert.ok(cssIndex >= 0 && gateIndex > cssIndex && sceneEntryIndex > gateIndex,
  'visibility gate CSS/module must load before the scene runtime can mount Pirate Fruit');

assert.match(css, /#pirateFruitFrame\s*\{[\s\S]*visibility:\s*hidden\s*!important[\s\S]*opacity:\s*0\s*!important[\s\S]*pointer-events:\s*none\s*!important/,
  'Pirate iframe must be hidden by default before any legacy frame can paint');
assert.match(css, /html\[data-pirate-studio-ready="true"\]\s*#pirateFruitFrame\s*\{[\s\S]*visibility:\s*visible\s*!important[\s\S]*opacity:\s*1\s*!important/,
  'Pirate iframe may only become visible after the Blue-ready marker');

assert.match(gate, /message\.type === PIRATE_STUDIO_CHARACTER_ACCEPTED[\s\S]*pirateStudioReady = 'true'/,
  'Blue Explorer ACCEPTED is the only successful reveal path');
assert.match(gate, /message\.type === PIRATE_STUDIO_CHARACTER_FAILED[\s\S]*delete root\.dataset\.pirateStudioReady/,
  'Studio failure must keep the legacy Pirate frame hidden');
assert.match(gate, /event\.source !== frame\.contentWindow \|\| event\.origin !== 'null'/,
  'reveal messages must come from the sandboxed active Pirate frame');
assert.match(gate, /message\.capability !== frame\.dataset\.studioCapability/,
  'reveal messages must match the per-frame Studio capability');
assert.doesNotMatch(gate, /PIRATE_STUDIO_CHARACTER_FAILED[\s\S]{0,500}pirateStudioReady = 'true'/,
  'failure path must never reveal the old fallback');

console.log('Blue Explorer no-legacy-flash gate passed');
