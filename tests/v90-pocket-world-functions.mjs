import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { installWorldPresence, publishWorldState } from '../world-presence-v800.mjs';

const liveJs = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const chat = fs.readFileSync(new URL('../chat-runtime.mjs', import.meta.url), 'utf8');
const worldsJs = fs.readFileSync(new URL('../worlds-v900.mjs', import.meta.url), 'utf8');
const boot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const livingJs = fs.readFileSync(new URL('../world-living-v900.mjs', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8');
const liveHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const versionedHtml = fs.readFileSync(new URL('../v800.html', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../entry-preload.mjs', import.meta.url), 'utf8');
const launcher = fs.readFileSync(new URL('../firebase-launcher-entry.mjs', import.meta.url), 'utf8');
const helper = fs.readFileSync(new URL('../world-presence-v800.mjs', import.meta.url), 'utf8');

for (const file of ['world-presence-v800.mjs', 'world-presence-protocol.mjs', 'chat-runtime.mjs']) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${file}`, import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || `${file} syntax failed`);
}

assert.equal(liveHtml, versionedHtml, 'live V8.4 entries stay byte-identical after chat markup');
assert.ok(liveHtml.indexOf('id="chatToggleBtn"') < liveHtml.indexOf('<div id="hud">'), 'live chat toggle stays outside #hud');
assert.ok(html.indexOf('id="chatToggleBtn"') < html.indexOf('<div id="hud">'), 'V9 chat toggle stays outside #hud');
assert.match(html, /id="gameChat"/, 'V9 combined entry ships the player chat panel');
assert.match(preload, /chat-runtime\.mjs\?v=8\.4\.0-world-presence-live/, 'live preload cache-busts the top-right chat');
assert.match(preload, /chat-runtime\.mjs\?v=8\.4\.0-world-presence-live[\s\S]*game-v800\.js\?v=810/, 'live preload binds chat before game overlays');
assert.match(launcher, /chat-runtime\.mjs\?v=8\.4\.0-world-presence-live/, 'Firebase launcher mounts chat before the game');
assert.match(worldsJs, /await import\('\.\/chat-runtime\.mjs\?v=8\.4\.0-world-presence-live'\)/, 'V9 combined channel loads chat for every world');
assert.match(worldsJs, /await bootWorld\(resolveCombinedWorld\(\)\)/, 'V9 starts in Pirate Fruit then warps into Pocket Monster');
assert.match(boot, /assignCombinedWorld\(link\.to\)/, 'real pirate world assigns Pocket Monster through the world link');
assert.doesNotMatch(worldsJs, /if \(world\.id === 'pocket-monster'\) await import\('\.\/chat-runtime/, 'chat is not gated to Pocket Monster only');
assert.match(chat, /type: 'world-pos'/, 'chat socket publishes world position for shared-zone presence');
assert.match(chat, /type === 'world-snapshot'/, 'chat socket dispatches remote player snapshots');
assert.match(chat, /type === 'chat'/, 'chat socket still pulls messages on chat frames');
assert.match(chat, /buildWorldPosFrame/, 'chat sends only the finite world-pos contract');
assert.match(chat, /worldSnapshotPayload/, 'chat reads snapshot payload only, never root players');
assert.match(chat, /POCKETMONSTER_WORLD_STATE/, 'chat reads the local world snapshot');
assert.match(chat, /POCKETMONSTER_WORLD_PRESENCE/, 'chat forwards presence to the overlay');
assert.match(liveJs, /POCKETMONSTER_SELF_PRESENCE_ID/, 'Pocket Monster skips drawing the local player');
assert.doesNotMatch(chat, /vpsWrites|playerDataWrites/, 'chat runtime must not open write flags');
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
assert.match(livingJs, /from '\.\/world-presence-v800\.mjs'/, 'living world uses the shared presence helper');
assert.match(livingJs, /LIVING_WORLD_ID/, 'living presence uses the living-world zone id');
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
    window.POCKETMONSTER_SELF_PRESENCE_ID = 'p1';
    window.POCKETMONSTER_WORLD_PRESENCE({
      zone: 'pirate-fruit',
      players: [{ id: 'p1', x: 2, z: 3, name: 'ตัวเอง' }, { id: 'p3', x: 4, z: 5, name: 'คนอื่น' }],
    });
    const live = created.filter(node => node.className === 'remote-world-player' && !node.removed);
    assert.equal(live.length, 1);
    assert.equal(live[0].textContent, 'คนอื่น');
    delete window.POCKETMONSTER_SELF_PRESENCE_ID;
  } finally {
    dispose();
  }
}

console.log('V9.0 Pocket Monster world functions port: PASS');
