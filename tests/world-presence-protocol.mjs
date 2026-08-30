import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildWorldPosFrame, isRemoteWorldPlayer, selfPresenceId, worldSnapshotPayload } from '../world-presence-protocol.mjs';

const chat = fs.readFileSync(new URL('../chat-runtime.mjs', import.meta.url), 'utf8');
const flags = fs.readFileSync(new URL('../runtime-config.json', import.meta.url), 'utf8');

assert.deepEqual(buildWorldPosFrame({ zone: 'hub', x: 1.25, z: -3.5, dir: 0.532 }), {
  type: 'world-pos',
  zone: 'hub',
  x: 1.25,
  z: -3.5,
  dir: 0.532,
});
assert.equal(buildWorldPosFrame({ zone: 'hub', x: 1, z: 2, dir: Number.NaN }), null);
assert.equal(buildWorldPosFrame({ zone: 'hub', x: 8, z: 5 }), null);
assert.equal(buildWorldPosFrame({ players: [], zone: 'hub', x: 1, z: 2, dir: 0 }).players, undefined);
assert.deepEqual(
  worldSnapshotPayload({ type: 'world-snapshot', payload: { zone: 'hub', players: [{ id: 'p1', x: 1, z: 2 }] } }),
  { zone: 'hub', players: [{ id: 'p1', x: 1, z: 2 }] },
);
assert.equal(worldSnapshotPayload({ type: 'world-snapshot', zone: 'hub', players: [{ id: 'p1', x: 1, z: 2 }] }), null);
assert.equal(worldSnapshotPayload({ type: 'chat' }), null);
assert.equal(isRemoteWorldPlayer({ id: 'p1', x: 1, z: 2 }, 'p1'), false);
assert.equal(isRemoteWorldPlayer({ id: 'p2', x: 1, z: 2 }, 'p1'), true);
assert.equal(isRemoteWorldPlayer({ id: 'p2', x: Number.NaN, z: 2 }, null), false);
assert.equal(selfPresenceId({ username: 'guest-a' }, null), 'guest-a');
assert.equal(selfPresenceId({ id: 'acc-1', username: 'guest-a' }, null), 'acc-1');
assert.match(chat, /type === 'chat'/, 'chat frames stay on the same websocket');
assert.match(flags, /"vpsWrites": false/, 'live config keeps vpsWrites closed');
assert.match(flags, /"playerDataWrites": false/, 'live config keeps playerDataWrites closed');
assert.doesNotMatch(chat, /vpsWrites|playerDataWrites/, 'chat runtime must not open write flags');

console.log('World presence protocol: PASS');
