import assert from 'node:assert/strict';
import fs from 'node:fs';

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(game, /let pirateFruitReturnPortalArmed=false/);
assert.match(game, /pirateFruitReturnPortalArmed=true;[\s\S]*pirateFruitReturnPortalNeedsExit=true/);
assert.match(game, /First frame in Pocket hub: never auto-warp/);
assert.match(game, /pirateFruitReturnPortalArmed=false;return setSceneRuntimeActive\(false\)/);

const launch = fs.readFileSync(new URL('../launch-bootstrap.mjs', import.meta.url), 'utf8');
assert.match(launch, /Keep world\/panel \(and other non-launch\) query params/);
assert.match(launch, /url\.searchParams\.delete\('ticket'\);/);
assert.doesNotMatch(launch, /replaceState\(null, '', `\$\{url\.pathname\}`\)/);

console.log('V9 Pocket return-portal arm + launch deep-link preserve: PASS');
