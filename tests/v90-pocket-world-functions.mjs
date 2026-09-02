import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { installWorldPresence, publishWorldState } from '../world-presence-v800.mjs';

const liveJs = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const chat = fs.readFileSync(new URL('../chat-runtime.mjs', import.meta.url), 'utf8');
const worldsJs = fs.readFileSync(new URL('../worlds-v900.mjs', import.meta.url), 'utf8');
const shellJs = fs.readFileSync(new URL('../online-world-shell-v900.mjs', import.meta.url), 'utf8');
const sceneEntryJs = fs.readFileSync(new URL('../scene-entry-v900.mjs', import.meta.url), 'utf8');
const boot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const livingJs = fs.readFileSync(new URL('../world-living-v900.mjs', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8');
const liveHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const versionedHtml = fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../entry-preload.mjs', import.meta.url), 'utf8');
const launcher = fs.readFileSync(new URL('../firebase-launcher-entry.mjs', import.meta.url), 'utf8');
const helper = fs.readFileSync(new URL('../world-presence-v800.mjs', import.meta.url), 'utf8');
const unifiedControls = fs.readFileSync(new URL('../unified-mobile-controls-v900.mjs', import.meta.url), 'utf8');

for (const file of ['world-presence-v800.mjs', 'chat-runtime.mjs']) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${file}`, import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || `${file} syntax failed`);
}

assert.equal(liveHtml, versionedHtml, 'live index.html stays byte-identical with the V9 entry');
assert.ok(liveHtml.indexOf('id="chatToggleBtn"') < liveHtml.indexOf('<div id="hud">'), 'live chat toggle stays outside #hud');
assert.ok(html.indexOf('id="chatToggleBtn"') < html.indexOf('<div id="hud">'), 'V9 chat toggle stays outside #hud');
assert.match(html, /id="gameChat"/, 'V9 combined entry ships the player chat panel');
assert.match(preload, /chat-runtime\.mjs\?v=8\.4\.0-chat-hud-store/, 'live preload cache-busts the top-right chat');
assert.match(preload, /chat-runtime\.mjs\?v=8\.4\.0-chat-hud-store[\s\S]*game-v800\.js\?v=818/, 'legacy preload binds chat before game overlays');
assert.doesNotMatch(liveJs, /bindMobileDualPointerInput\(/, 'Pocket runtime does not create a second pointer lifecycle');
assert.match(liveJs, /registerAdapter\('pocket-monster'/, 'Pocket movement and camera register with the parent control lifecycle');
assert.match(unifiedControls, /onJoystickStart:[\s\S]*onCameraStart:/, 'parent joystick and camera keep independent pointer channels');
assert.match(launcher, /ONLINE_CONFIG_REQUIRED/, 'Firebase launcher fails closed when launch-ticket mode is unavailable');
assert.doesNotMatch(launcher, /loadLegacyGame|chat-runtime|game-v800/, 'Firebase launcher cannot boot a second legacy game/session path');
assert.doesNotMatch(launcher, /LAUNCH_TICKET_QA_ONLY/, 'ticket admission errors stay visible instead of silently entering a local game');
assert.match(shellJs, /await import\('\.\/chat-runtime\.mjs\?v=8\.4\.0-unified-world-shell-4'\)/, 'persistent V9 shell owns the one presence-aware chat transport');
assert.match(worldsJs, /POCKETMONSTER_SCENE_EMBEDDED !== true[\s\S]*chat-runtime/, 'standalone compatibility path may mount chat but hosted scenes skip it');
assert.doesNotMatch(sceneEntryJs, /chat-runtime|new WebSocket|prepareLaunch/, 'hosted scene entry cannot create another socket or login bootstrap');
assert.match(worldsJs, /await bootWorld\(resolveCombinedWorld\(\)\)/, 'V9 starts in Pirate Fruit then warps into Pocket Monster');
assert.match(boot, /assignCombinedWorld\(message\.world\)/, 'real pirate portals assign only their validated destination');
assert.doesNotMatch(worldsJs, /if \(world\.id === 'pocket-monster'\) await import\('\.\/chat-runtime/, 'chat is not gated to Pocket Monster only');
assert.match(chat, /type: 'world-pos'/, 'chat socket publishes world position for shared-zone presence');
assert.match(chat, /type === 'world-snapshot'/, 'chat socket dispatches remote player snapshots');
assert.match(chat, /POCKETMONSTER_WORLD_STATE/, 'chat reads the local world snapshot');
assert.match(chat, /POCKETMONSTER_WORLD_PRESENCE/, 'chat forwards presence to the overlay');
assert.match(liveJs, /if\(!pirateThrowWorld\)\{/, 'animal-control overlay does not steal world presence from the real pirate world');
assert.equal(fs.existsSync(new URL('../world-pirate-fruit-v900.mjs', import.meta.url)), false, 'Pocket-block pirate island stage file is gone');
assert.match(liveJs, /window\.POCKETMONSTER_WORLD_STATE=\(\)=>\(\{zone:state\.currentZone,x:player\.position\.x,z:player\.position\.z,dir:player\.rotation\.y\}\)/, 'Pocket Monster publishes zone position');
assert.match(liveJs, /updateRemoteWorldMarkers/, 'Pocket Monster projects remote players on the existing HUD tick');
assert.doesNotMatch(liveJs, /setInterval\(\(\)=>\{for\(const marker of remoteWorldPlayers/, 'live presence must not add a wall-clock interval to the capture loop');
assert.match(liveJs, /if\(titleEl\)setTextIfChanged\(titleEl,'เริ่มการผจญภัย'\)/, 'Ranch Hub keeps the quest tracker visible');
assert.match(liveJs, /text\.textContent='1\/3 ไป Grass Meadow'/, 'Ranch Hub tracker points at Grass Meadow');
assert.doesNotMatch(liveJs, /if\(!STAGE_BY_ID\[state\.currentZone\]\)\{panel\.classList\.add\('hidden'\);return;\}/, 'Ranch Hub no longer hides the quest tracker');
assert.match(boot, /publishWorldState\(/, 'real pirate world publishes WORLD_STATE');
assert.match(boot, /getZone: \(\) => 'pirate-fruit'/, 'pirate presence uses the pirate-fruit zone id');
assert.match(livingJs, /from '\.\/world-presence-v800\.mjs\?v=2'/, 'living world uses the cache-busted shared presence helper');
assert.match(livingJs, /LIVING_WORLD_ID/, 'living presence uses the living-world zone id');
assert.match(livingJs, /living-world-pirate-fruit-portal/, 'Living World ships an in-scene return portal to Pirate Fruit');
assert.match(livingJs, /pocketmonster:world-warp-v1/, 'Living World returns directly to Pirate Fruit through the in-document route');
assert.match(boot, /source === 'pirate-fruit-living-portal'/, 'Pirate iframe bridge accepts the physical Living World portal');
assert.doesNotMatch(html, /id="worldGate"|id="worldSwitcher"|id="pocketWorldWarpBtn"|id="controlPanelSwitcher"/, 'V9 exposes no clickable world or panel travel controls');
assert.match(liveJs, /pirate-fruit-world-return-portal/, 'Ranch Hub ships a visible in-world return portal');
assert.match(liveJs, /group\.position\.set\(-8,0,3\)/, 'return portal stays at the approved Ranch Hub coordinate');
assert.match(liveJs, /state\.currentZone==='hub'/, 'return portal is active only inside Ranch Hub');
assert.match(liveJs, /pocketmonster:world-warp-v1/, 'Ranch return portal routes to Pirate Fruit in-document');
assert.match(worldsJs, /window\.addEventListener\('pocketmonster:world-warp-v1', handlePocketMonsterWorldWarp\)/, 'V9 router binds the local return portal event');
assert.match(worldsJs, /switchWorldInDocument\(warp\.world, warp\.panel\)/, 'validated return portals preserve their Pirate Fruit human destination');
assert.doesNotMatch(liveJs.match(/function updatePirateFruitReturnPortal\(dt\)\{[\s\S]*?\n\}/)?.[0]||'', /saveGame|vpsWrites|playerDataWrites/, 'return portal does not write save or enable server writes');
assert.match(helper, /remoteWorldPlayers/, 'presence overlay tracks remote markers');
assert.doesNotMatch(helper, /vpsWrites|playerDataWrites/, 'presence helper must not open write flags');
assert.doesNotMatch(chat, /vpsWrites|playerDataWrites/, 'chat runtime must not open write flags');

{
  const created = [];
  const bodyChildren = [];
  const fakeEl = (tag) => {
    const el = {
      tagName: String(tag).toUpperCase(),
      id: '',
      className: '',
      textContent: '',
      hidden: false,
      style: {},
      dataset: {},
      children: [],
      append(node) { this.children.push(node); },
      remove() { this.removed = true; },
    };
    created.push(el);
    return el;
  };
  globalThis.document = {
    getElementById() { return null; },
    createElement: fakeEl,
    body: { append(node) { bodyChildren.push(node); } },
  };
  globalThis.window = globalThis;
  class Vector3 {
    constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
    project() { this.x = 0; this.y = 0; this.z = 0; return this; }
  }
  publishWorldState({
    getZone: () => 'pirate-fruit',
    getPosition: () => ({ x: 1.5, z: -2 }),
    getDir: () => 0.4,
  });
  assert.deepEqual(window.POCKETMONSTER_WORLD_STATE(), { zone: 'pirate-fruit', x: 1.5, z: -2, dir: 0.4 });
  const dispose = installWorldPresence({
    THREE: { Vector3 },
    getCamera: () => ({}),
    getZone: () => 'pirate-fruit',
  });
  try {
    window.POCKETMONSTER_WORLD_PRESENCE({
      zone: 'pirate-fruit',
      players: [{ id: 'p1', x: 2, z: 3, name: 'ผู้เล่นทดสอบ' }],
    });
    const marker = created.find(node => node.className === 'remote-world-player');
    assert.equal(marker.textContent, 'ผู้เล่นทดสอบ');
    window.POCKETMONSTER_WORLD_PRESENCE({ zone: 'hub', players: [{ id: 'p2', x: 0, z: 0, name: 'คนละโซน' }] });
    assert.equal(created.filter(node => node.className === 'remote-world-player' && !node.removed).length, 1);
  } finally {
    dispose();
  }
}

for (const testFile of ['v90-world-presence-avatars.mjs', 'v90-two-client-world-presence.mjs']) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(testFile, import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${testFile} failed\n${result.stdout}\n${result.stderr}`);
}

console.log('V9.0 Pocket Monster world functions port: PASS');
