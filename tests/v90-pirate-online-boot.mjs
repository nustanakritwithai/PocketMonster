import assert from 'node:assert/strict';
import fs from 'node:fs';

import { worldById } from '../combined-worlds-v900.mjs';

const boot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const combined = fs.readFileSync(new URL('../combined-worlds-v900.mjs', import.meta.url), 'utf8');
const serverSync = fs.readFileSync(new URL('../server-sync.mjs', import.meta.url), 'utf8');
const pages = ['index.html', 'v900.html', 'scene-v900.html'].map(name => ({
  name,
  html: fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'),
}));

assert.match(boot, /function mountPirateOnline\(/);
assert.match(boot, /export const PIRATE_FRUIT_OFFLINE_ENTRY/);
assert.match(boot, /frameUrl\.searchParams\.set\('parentOrigin', location\.origin\)/);
assert.match(boot, /event\.origin !== 'null'/);
assert.match(boot, /source: 'pirate-fruit-offline'/);
assert.match(boot, /remote: false/);
assert.doesNotMatch(boot, /pirateClient/);
assert.match(boot, /pirate-fruit-offline\/index\.html/);
assert.equal(worldById('pirate-fruit').runtime, './boot-pirate-fruit-v900.mjs?v=962');
assert.match(combined, /โลก Pirate Fruit ออนไลน์ชุดล่าสุด/);

const timeout = serverSync.match(/timeoutMs = (\d+)/);
assert.ok(timeout, 'server contract timeout must be explicit');
assert.ok(Number(timeout[1]) >= 15000, 'slow MonsterLife /api/version must not trip the 5s gate');

for (const page of pages) {
  assert.doesNotMatch(page.html, /pirate-fruit-u555\.onrender\.com/, `${page.name} CSP must not allow the retired remote Pirate iframe`);
  assert.match(page.html, /style-v900\.css\?v=972/, `${page.name} cache-busts the Pirate gate hit-test stylesheet`);
}

const css = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');
assert.match(css, /body:not\(\[data-pirate-world-ready\]\) #pirateUnifiedControls #joystick\.tc-joyzone/);
assert.match(css, /body:not\(\[data-pirate-world-ready\]\) #pirateUnifiedControls #cameraPad\.tc-camzone\{pointer-events:none!important\}/);
assert.match(boot, /document\.body\.dataset\.pirateWorldReady = '1'/);

console.log('pirate online boot contract passed');
