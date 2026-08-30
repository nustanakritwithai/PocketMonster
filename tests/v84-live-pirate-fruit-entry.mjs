import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const liveJs = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const liveHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const versionedHtml = fs.readFileSync(new URL('../v800.html', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../entry-preload.mjs', import.meta.url), 'utf8');
const chat = fs.readFileSync(new URL('../chat-runtime.mjs', import.meta.url), 'utf8');
const authUi = fs.readFileSync(new URL('../firebase-auth-ui.mjs', import.meta.url), 'utf8');
const launcher = fs.readFileSync(new URL('../firebase-launcher-entry.mjs', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../runtime-config.json', import.meta.url), 'utf8');
const v900 = fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8');
const worlds = fs.readFileSync(new URL('../worlds-v900.mjs', import.meta.url), 'utf8');
const boot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');

for (const file of ['game-v800.js', 'entry-preload.mjs', 'chat-runtime.mjs', 'firebase-auth-ui.mjs']) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${file}`, import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || `${file} syntax failed`);
}

assert.equal(liveHtml, versionedHtml, 'live index.html stays byte-identical to v800.html');
assert.match(preload, /await requireFirebaseLogin|prepareLaunch/, 'login/session gate stays in the live preload');
assert.match(preload, /applyPendingPatch/, 'patch loader stays in the live preload');
assert.match(preload, /chat-runtime\.mjs\?v=8\.4\.0-chat-top-right/, 'chat still mounts before the live game');
assert.match(preload, /game-v800\.js\?v=810/, 'live still boots the 8.4 runtime, not a second game');
assert.doesNotMatch(preload, /worlds-v900|v900\.html|pirate-fruit-offline/, 'live preload does not redirect to V9 or iframe the offline client');
assert.match(launcher, /game-v800\.js/, 'Firebase launcher still loads the live 8.4 runtime');
assert.doesNotMatch(launcher, /worlds-v900|pirate-fruit-offline/, 'Firebase launcher does not open a second runtime');

assert.match(liveJs, /await requireFirebaseLogin\(runtimeConfig\)/, 'login flow stays on the live boot');
assert.match(authUi, /export function requireFirebaseLogin/, 'login module is not rewritten');
assert.match(liveJs, /const LIVE_PRESENCE_ZONE='pirate-fruit'/, 'live presence zone is pirate-fruit');
assert.match(liveJs, /function haltLiveGameEntry/, 'live stops entering the game when Server is unavailable');
assert.match(liveJs, /firebaseFallback===false/, 'live halt requires firebaseFallback to stay closed');
assert.match(liveJs, /serverGate\.state!=='healthy'/, 'unhealthy Server gate blocks live entry');
assert.match(liveJs, /authProfileBridge\.state==='offline'\|\|authProfileBridge\.state==='fallback'/, 'offline/fallback bridge blocks live entry');
assert.match(liveJs, /else \{state\.currentZone='hub';switchZone\('hub',true);\}/, 'after login live enters the pirate home immediately instead of a saved Ranch/hunt zone');
assert.match(liveJs, /window\.POCKETMONSTER_WORLD_STATE=\(\)=>\(\{zone:LIVE_PRESENCE_ZONE,x:player\.position\.x,z:player\.position\.z,dir:player\.rotation\.y\}\)/, 'world-pos always uses pirate-fruit');
assert.match(liveJs, /if\(!payload\|\|payload\.zone!==LIVE_PRESENCE_ZONE\)return/, 'presence drops snapshots whose zone is not pirate-fruit');
assert.match(liveJs, /if\(!item\?\.id\|\|!Number\.isFinite\(item\.x\)\|\|!Number\.isFinite\(item\.z\)\)continue/, 'presence drops non-finite x/z');
assert.match(liveJs, /if\(!seen\.has\(id\)\)\{marker\.remove\(\);remoteWorldPlayers\.delete\(id\);\}/, 'presence removes labels missing from the snapshot');
assert.match(liveJs, /POCKETMONSTER_ANIMAL_CONTROL/, 'monster catch/raise/team stay in the same live runtime');
assert.match(liveJs, /hostWorld:'pirate-fruit'/, 'monster module is hosted on the pirate-fruit runtime');
assert.match(liveJs, /captureThrow|summonThrow|recall|switchPartySlot/, 'catch and party controls remain in the same runtime');
assert.doesNotMatch(liveJs, /iframe|pirateFruitFrame|pirate-fruit-offline/, 'live 8.4 must not iframe the offline Pirate Fruit client');
assert.doesNotMatch(liveJs, /vpsWrites\s*=\s*true|playerDataWrites\s*=\s*true/, 'live entry must not open write flags');
assert.doesNotMatch(liveHtml, /pirate-fruit-offline|pirateFruitFrame|v900\.html/, 'live HTML does not point at V9 or an offline iframe');
assert.match(liveHtml, /id="zoneLabel">Pirate Fruit<\/span>/, 'live HUD names the pirate-fruit home');
assert.match(liveHtml, /id="accountGate"/, 'login gate markup stays on live');
assert.match(liveHtml, /id="gameChat"/, 'chat markup stays on live');
assert.match(liveHtml, /id="monsterManager"|id="party"|id="captureBtn"/, 'monster module chrome stays in the same page');

const runtimeJson = JSON.parse(runtime);
assert.equal(runtimeJson.webSocketUrl, 'wss://157.85.96.139/ws/chat');
assert.equal(runtimeJson.featureFlags.vpsWrites, false);
assert.equal(runtimeJson.featureFlags.playerDataWrites, false);
assert.equal(runtimeJson.featureFlags.firebaseFallback, false);

assert.match(chat, /type: 'world-pos'/, 'chat keeps world-pos on the same socket');
assert.match(chat, /setInterval\(sendWorld, 250\)/, 'chat sends position every 250ms after auth');
assert.match(chat, /type === 'world-snapshot'/, 'chat still receives world-snapshot on the same socket');
assert.match(chat, /type === 'chat'/, 'chat frames stay on the same socket');
assert.doesNotMatch(chat, /vpsWrites|playerDataWrites/, 'chat must not open write flags');

assert.match(v900, /pirate-fruit-offline/, 'V9 combined page is left in place');
assert.match(worlds, /mergedIntoLiveV800: false/, 'V9 is not moved onto live');
assert.match(boot, /pirateFruitFrame/, 'V9 pirate boot is not rewritten');

console.log('V8.4 live Pirate Fruit entry contract: PASS');
