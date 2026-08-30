import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PIRATE_LOCAL_PRESENCE_MESSAGE,
  PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
  createPirateSnapshotMessage,
  sanitizePirateLocalPresence,
  sanitizePirateWorldSnapshot,
} from '../pirate-presence-bridge-v900.mjs';
import { publishWorldState } from '../world-presence-v800.mjs';

const boot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const chat = fs.readFileSync(new URL('../chat-runtime.mjs', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../pirate-presence-bridge-v900.mjs', import.meta.url), 'utf8');

assert.deepEqual(sanitizePirateLocalPresence({
  type: PIRATE_LOCAL_PRESENCE_MESSAGE,
  zone: 'pirate-fruit',
  x: 7,
  z: 11.5,
  dir: 0.4,
}), { x: 7, z: 11.5, dir: 0.4 });
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
  players: [{ id: 'alice', name: 'Alice', x: 1, z: 2, dir: 0.5 }],
});
assert.equal(sanitizePirateWorldSnapshot({ zone: 'hub', players: [] }), null);
assert.deepEqual(createPirateSnapshotMessage(snapshot), {
  type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
  payload: snapshot,
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
  zone: 'pirate-fruit', x: 2, z: 3, dir: 0.25,
});

assert.match(boot, /event\.source !== frame\.contentWindow \|\| event\.origin !== frameOrigin/, 'frame source and exact origin are checked before accepting pose');
assert.match(boot, /sanitizePirateLocalPresence\(message\)/, 'parent accepts only the validated local pose contract');
assert.match(boot, /sanitizePirateWorldSnapshot\(payload\)/, 'parent sanitizes Server snapshots before forwarding');
assert.match(boot, /frame\.contentWindow\?\.postMessage\(createPirateSnapshotMessage\(snapshot\), frameOrigin\)/, 'snapshot targets only the mounted frame origin');
assert.match(chat, /const snapshot = window\.POCKETMONSTER_WORLD_STATE\?\.\(\)/, 'existing authenticated chat socket reads the bridged local pose');
assert.match(chat, /type: 'world-pos'/, 'existing socket publishes the ephemeral world position');
assert.match(chat, /type === 'world-snapshot'/, 'existing socket receives Server snapshots');
assert.doesNotMatch(boot + bridge, /new WebSocket|vpsWrites|playerDataWrites|firebaseFallback/, 'bridge opens no socket and no persistent write flags');

console.log('V9.0 Pirate Fruit read-only presence bridge: PASS');
