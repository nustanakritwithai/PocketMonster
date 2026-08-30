import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  PIRATE_FRUIT_ISLAND_CENTERS,
  PIRATE_FRUIT_ISLAND_LAYOUT_OFFSETS,
  PIRATE_FRUIT_LAYOUT_OFFSET_NEEDLE,
  PIRATE_FRUIT_LIVE_ORIGIN,
  PIRATE_FRUIT_MAP_SOURCE_COMMIT,
  PIRATE_FRUIT_PRESENCE_USES_IFRAME_POSE,
  PIRATE_FRUIT_PRESENCE_ZONE,
  parkedPirateFruitPresencePose,
} from '../pirate-fruit-island-map-v900.mjs';

const mapFile = 'pirate-fruit-island-map-v900.mjs';
const syntax = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${mapFile}`, import.meta.url))], { encoding: 'utf8' });
assert.equal(syntax.status, 0, syntax.stderr || `${mapFile} syntax failed`);

const pirateSource = JSON.parse(fs.readFileSync(new URL('../pirate-fruit-offline/SOURCE.json', import.meta.url), 'utf8'));
const boot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const bundle = fs.readFileSync(new URL('../pirate-fruit-offline/assets/index-CpjvNXV8.js', import.meta.url), 'utf8');

assert.equal(pirateSource.commit, PIRATE_FRUIT_MAP_SOURCE_COMMIT);
assert.equal(pirateSource.mode, 'offline');
assert.equal(pirateSource.remote, false);
assert.equal(pirateSource.islandMap.matchesLiveOnline, true);
assert.equal(pirateSource.islandMap.liveOrigin, PIRATE_FRUIT_LIVE_ORIGIN);
assert.equal(pirateSource.islandMap.presenceUsesIframePose, false);
assert.equal(pirateSource.islandMap.pocketServerHostsIslandCatalog, false);
assert.equal(PIRATE_FRUIT_PRESENCE_ZONE, 'pirate-fruit');
assert.equal(PIRATE_FRUIT_PRESENCE_USES_IFRAME_POSE, false, 'iframe island pose is still parked for a follow-up');

assert.equal(parkedPirateFruitPresencePose().x, 0);
assert.equal(parkedPirateFruitPresencePose().z, 0);
assert.match(boot, /parkedPirateFruitPresencePose/, 'boot still publishes the parked origin pose');
assert.match(boot, /getZone: \(\) => 'pirate-fruit'/, 'presence zone stays pirate-fruit');
assert.doesNotMatch(boot, /vpsWrites|playerDataWrites/, 'map contract does not open write flags');

assert.ok(bundle.includes(PIRATE_FRUIT_LAYOUT_OFFSET_NEEDLE), 'vendored client keeps the live island layout offsets');
assert.match(bundle, /x:170,z:-120/, 'mist-jungle center matches live Pirate Fruit Online');
assert.match(bundle, /x:360,z:-40/, 'sunscar-desert center matches live Pirate Fruit Online');
assert.match(bundle, /x:500,z:110/, 'azure-frost center matches live Pirate Fruit Online');
assert.match(bundle, /x:430,z:330/, 'tempest-sky center matches live Pirate Fruit Online');
assert.match(bundle, /x:220,z:470/, 'ember-volcano center matches live Pirate Fruit Online');

assert.equal(PIRATE_FRUIT_ISLAND_LAYOUT_OFFSETS['mist-jungle'].z, -80);
assert.equal(PIRATE_FRUIT_ISLAND_CENTERS['ember-volcano'].x, 220);
assert.equal(PIRATE_FRUIT_ISLAND_CENTERS['starter-island'].radius, 60);

console.log('v90 pirate fruit island map contract: PASS');
