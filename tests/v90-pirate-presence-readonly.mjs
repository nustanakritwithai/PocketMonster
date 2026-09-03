import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PIRATE_LOCAL_PRESENCE_MESSAGE,
  PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
  PIRATE_PRESENCE_STATUS_MESSAGE,
  createPiratePresenceStatusMessage,
  createPirateSnapshotMessage,
  sanitizePirateLocalPresence,
  sanitizePirateWorldSnapshot,
} from '../pirate-presence-bridge-v900.mjs';
import { publishWorldState } from '../world-presence-v800.mjs';

const boot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const chat = fs.readFileSync(new URL('../chat-runtime.mjs', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../pirate-presence-bridge-v900.mjs', import.meta.url), 'utf8');
const pirateOfflineHtml = fs.readFileSync(new URL('../pirate-fruit-offline/index.html', import.meta.url), 'utf8');
const pirateStatus = fs.readFileSync(new URL('../pirate-fruit-offline/pocketmonster-status-v900.mjs', import.meta.url), 'utf8');

assert.deepEqual(sanitizePirateLocalPresence({
  type: PIRATE_LOCAL_PRESENCE_MESSAGE,
  zone: 'pirate-fruit',
  x: 7,
  z: 11.5,
  dir: 0.4,
}), { x: 7, z: 11.5, dir: 0.4, locomotion: 'idle', animation: null });
assert.equal(sanitizePirateLocalPresence({
  type: PIRATE_LOCAL_PRESENCE_MESSAGE,
  zone: 'hub',
  x: 7,
  z: 11.5,
  dir: 0.4,
}), null);
assert.equal(sanitizePirateLocalPresence({
  type: PIRATE_LOCAL_PRESENCE_MESSAGE,
  zone: 'pirate-fruit',
  x: Number.NaN,
  z: 11.5,
  dir: 0.4,
}), null);

const snapshot = sanitizePirateWorldSnapshot({
  zone: 'pirate-fruit',
  players: [
    { id: 'alice', name: 'Alice', x: 1, z: 2, dir: 0.5 },
    { id: 'bad', name: 'Bad', x: Number.POSITIVE_INFINITY, z: 2, dir: 0 },
    { id: 'alice', name: 'Duplicate', x: 9, z: 9, dir: 0 },
  ],
});
assert.deepEqual(snapshot, {
  zone: 'pirate-fruit',
  players: [{ id: 'alice', name: 'Alice', x: 1, z: 2, dir: 0.5, locomotion: 'idle', animation: null }],
});
assert.equal(sanitizePirateWorldSnapshot({ zone: 'hub', players: [] }), null);
assert.deepEqual(createPirateSnapshotMessage(snapshot), {
  type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
  payload: snapshot,
});
assert.deepEqual(createPiratePresenceStatusMessage(true), {
  type: PIRATE_PRESENCE_STATUS_MESSAGE,
  zone: 'pirate-fruit',
  connected: true,
});
assert.deepEqual(createPiratePresenceStatusMessage(false), {
  type: PIRATE_PRESENCE_STATUS_MESSAGE,
  zone: 'pirate-fruit',
  connected: false,
});

globalThis.window = globalThis;
let pose = null;
publishWorldState({
  getZone: () => 'pirate-fruit',
  getPosition: () => pose,
  getDir: () => pose?.dir,
});
assert.equal(window.POCKETMONSTER_WORLD_STATE(), null, 'Pirate presence fails closed until a real iframe pose arrives');
pose = { x: 2, z: 3, dir: 0.25 };
assert.deepEqual(window.POCKETMONSTER_WORLD_STATE(), {
  zone: 'pirate-fruit', x: 2, z: 3, dir: 0.25, locomotion: 'idle', animation: null,
});

assert.match(boot, /event\.source !== frame\.contentWindow/, 'frame source is checked before accepting pose');
assert.match(boot, /event\.origin !== 'null'/, 'opaque sandbox origin is checked before accepting pose');
assert.match(boot, /sanitizePirateLocalPresence\(message\)/, 'parent accepts only the validated local pose contract');
assert.match(boot, /sanitizePirateWorldSnapshot\(payload\)/, 'parent sanitizes Server snapshots before forwarding');
assert.match(boot, /frame\.contentWindow\?\.postMessage\(createPirateSnapshotMessage\(snapshot\), '\*'\)/, 'snapshot targets the exact mounted opaque frame window');
assert.match(boot, /frame\.contentWindow\?\.postMessage\(createPiratePresenceStatusMessage\(connected\), '\*'\)/, 'presence status targets the exact mounted opaque frame window');
assert.match(boot, /pocketmonster:world-socket-status/, 'parent listens for the real shared-socket status');
assert.match(chat, /const snapshot = window\.POCKETMONSTER_WORLD_STATE\?\.\(\)/, 'existing authenticated chat socket reads the bridged local pose');
assert.match(chat, /type: 'world-pos'/, 'existing socket publishes the ephemeral world position');
assert.match(chat, /type === 'world-snapshot'/, 'existing socket receives Server snapshots');
assert.match(chat, /type === 'world-snapshot'[\s\S]*setWorldConnected\(true\)/, 'only a Server world snapshot promotes the presence transport online');
assert.match(chat, /addEventListener\('close',[\s\S]*setWorldConnected\(false\)/, 'socket close returns the presence transport to connecting');
assert.match(pirateOfflineHtml, /pocketmonster-status-v900\.mjs\?v=1/, 'vendored iframe loads the Pocket-only hybrid status shim');
assert.match(pirateStatus, /event\.source !== parent \|\| event\.origin !== parentOrigin/, 'status shim validates the exact parent window and origin');
assert.match(pirateStatus, /typeof message\.connected !== 'boolean'/, 'status shim rejects malformed connection state');
assert.match(pirateStatus, /WORLD ONLINE · SAVE LOCAL/, 'online label distinguishes ephemeral presence from local gameplay saves');
assert.match(pirateStatus, /กำลังเชื่อม WORLD ONLINE · SAVE LOCAL/, 'connecting label no longer claims that the game is temporarily local');
assert.doesNotMatch(boot + bridge + pirateStatus, /new WebSocket|vpsWrites|playerDataWrites|firebaseFallback/, 'bridge and status shim open no socket and no persistent write flags');


assert.deepEqual(sanitizePirateLocalPresence({
  type: PIRATE_LOCAL_PRESENCE_MESSAGE,
  zone: 'pirate-fruit',
  x: 7,
  z: 11.5,
  dir: 0.4,
  locomotion: 'jump',
  animation: { combatState: 'attack', attackProgress: 1.4, onGround: false },
}), {
  x: 7,
  z: 11.5,
  dir: 0.4,
  locomotion: 'jump',
  animation: { combatState: 'attack', attackProgress: 1, onGround: false },
});
assert.deepEqual(sanitizePirateLocalPresence({
  type: PIRATE_LOCAL_PRESENCE_MESSAGE,
  zone: 'pirate-fruit',
  x: 7,
  z: 11.5,
  dir: 0.4,
  locomotion: 'teleport',
  animation: { combatState: 'explode' },
}), {
  x: 7,
  z: 11.5,
  dir: 0.4,
  locomotion: 'idle',
  animation: { combatState: 'idle' },
});

const actionSnapshot = sanitizePirateWorldSnapshot({
  zone: 'pirate-fruit',
  players: [{
    id: 'bob',
    name: 'Bob',
    x: 3,
    z: 4,
    dir: 1,
    locomotion: 'dash',
    animation: { combatState: 'skill', skillAnimationProgress: 0.25, dashing: true },
  }],
});
assert.deepEqual(actionSnapshot.players[0], {
  id: 'bob',
  name: 'Bob',
  x: 3,
  z: 4,
  dir: 1,
  locomotion: 'dash',
  animation: { combatState: 'skill', skillAnimationProgress: 0.25, dashing: true },
});

pose = { x: 2, z: 3, dir: 0.25, locomotion: 'run', animation: { combatState: 'guard' } };
assert.deepEqual(window.POCKETMONSTER_WORLD_STATE(), {
  zone: 'pirate-fruit', x: 2, z: 3, dir: 0.25, locomotion: 'run',
  animation: { combatState: 'guard' },
});

assert.doesNotMatch(bridge, /PIRATE_PRESENCE_LOCOMOTION_VALUES|PIRATE_PRESENCE_COMBAT_STATES/,
  'pirate bridge must not copy protocol locomotion/combat enums');

console.log('V9.0 Pirate Fruit read-only presence bridge: PASS');
