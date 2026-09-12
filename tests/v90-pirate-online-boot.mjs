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
assert.match(boot, /if \(event\.origin !== PIRATE_FRUIT_LIVE_ORIGIN\) return;/);
assert.match(boot, /source: 'pirate-fruit-online'/);
assert.match(boot, /remote: true/);
assert.doesNotMatch(boot, /function mountPirateOffline\(/);
assert.doesNotMatch(boot, /pirate-fruit-offline\/index\.html/);
assert.doesNotMatch(boot, /source: 'pirate-fruit-offline'/);
assert.equal(worldById('pirate-fruit').runtime, './boot-pirate-fruit-v900.mjs?v=954');
assert.match(combined, /โลก Pirate Fruit ออนไลน์ชุดล่าสุด/);

const timeout = serverSync.match(/timeoutMs = (\d+)/);
assert.ok(timeout, 'server contract timeout must be explicit');
assert.ok(Number(timeout[1]) >= 15000, 'slow MonsterLife /api/version must not trip the 5s gate');

for (const page of pages) {
  assert.match(page.html, /frame-src[^"]*https:\/\/pirate-fruit-u555\.onrender\.com/, `${page.name} CSP must allow the live Pirate iframe`);
}

console.log('pirate online boot contract passed');
