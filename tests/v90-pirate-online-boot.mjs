import assert from 'node:assert/strict';
import fs from 'node:fs';

import { PIRATE_FRUIT_LIVE_ORIGIN } from '../pirate-fruit-island-map-v900.mjs';
import { worldById } from '../combined-worlds-v900.mjs';

const LIVE_ORIGIN = 'https://pirate-fruit-u555.onrender.com';
const boot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const combined = fs.readFileSync(new URL('../combined-worlds-v900.mjs', import.meta.url), 'utf8');
const serverSync = fs.readFileSync(new URL('../server-sync.mjs', import.meta.url), 'utf8');
const pages = ['index.html', 'v900.html', 'scene-v900.html'].map(name => ({
  name,
  html: fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'),
}));

assert.equal(PIRATE_FRUIT_LIVE_ORIGIN, LIVE_ORIGIN);
assert.match(boot, /function mountPirateOnline\(/);
assert.match(boot, /export const PIRATE_FRUIT_ONLINE_ENTRY/);
assert.match(boot, /frameUrl\.searchParams\.set\('parentOrigin', location\.origin\)/);
assert.match(boot, /isolatedOfflinePirateClient\(\) \? 'null' : PIRATE_FRUIT_LIVE_ORIGIN/);
assert.match(boot, /source: livePirate \? 'pirate-fruit-online' : 'pirate-fruit-offline'/);
assert.match(boot, /remote: livePirate/);
assert.match(boot, /searchParams\.get\('pirateClient'\) !== 'online'/);
assert.match(boot, /pirate-fruit-offline\/index\.html/);
assert.equal(worldById('pirate-fruit').runtime, './boot-pirate-fruit-v900.mjs?v=956');
assert.match(combined, /โลก Pirate Fruit ออนไลน์ชุดล่าสุด/);

const timeout = serverSync.match(/timeoutMs = (\d+)/);
assert.ok(timeout, 'server contract timeout must be explicit');
assert.ok(Number(timeout[1]) >= 15000, 'slow MonsterLife /api/version must not trip the 5s gate');

for (const page of pages) {
  assert.match(page.html, /frame-src[^"]*https:\/\/pirate-fruit-u555\.onrender\.com/, `${page.name} CSP must allow the live Pirate iframe`);
  assert.match(page.html, /style-v900\.css\?v=970/, `${page.name} cache-busts the Pirate gate hit-test stylesheet`);
}

const css = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');
assert.match(css, /body:not\(\[data-pirate-world-ready\]\) #pirateUnifiedControls #joystick\.tc-joyzone/);
assert.match(css, /body:not\(\[data-pirate-world-ready\]\) #pirateUnifiedControls #cameraPad\.tc-camzone\{pointer-events:none!important\}/);
assert.match(boot, /document\.body\.dataset\.pirateWorldReady = '1'/);

console.log('pirate online boot contract passed');
