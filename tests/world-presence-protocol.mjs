import assert from 'node:assert/strict';
import fs from 'node:fs';

const {
  WORLD_PRESENCE_PROTOCOL_VERSION,
  buildWorldPosFrame,
  worldSnapshotPayload,
  isRemoteWorldPlayer,
  filterRemotePlayers,
  selfPresenceId,
} = await import('../world-presence-protocol.mjs');

assert.equal(WORLD_PRESENCE_PROTOCOL_VERSION, 'world-presence-protocol/v1');

// buildWorldPosFrame: only complete frames reach the socket.
assert.deepEqual(buildWorldPosFrame({ zone: 'hub', x: 1, z: -2, dir: 0.5 }), { zone: 'hub', x: 1, z: -2, dir: 0.5 });
assert.equal(buildWorldPosFrame({ zone: 'hub', x: 1, z: -2 }).dir, 0, 'missing dir defaults to 0');
assert.equal(buildWorldPosFrame(null), null);
assert.equal(buildWorldPosFrame({}), null);
assert.equal(buildWorldPosFrame({ zone: '', x: 1, z: 2 }), null);
assert.equal(buildWorldPosFrame({ zone: 5, x: 1, z: 2 }), null);
assert.equal(buildWorldPosFrame({ zone: 'hub', x: NaN, z: 2 }), null);
assert.equal(buildWorldPosFrame({ zone: 'hub', x: 1, z: Infinity }), null);
assert.equal(buildWorldPosFrame({ zone: 'hub', x: 1, z: 2, dir: 'side' }), null);
assert.ok(Object.isFrozen(buildWorldPosFrame({ zone: 'hub', x: 1, z: 2 })), 'frames are immutable');

// worldSnapshotPayload: strict shape before any renderer sees it.
assert.equal(worldSnapshotPayload({ type: 'world-snapshot', payload: { zone: 'hub', players: [] } }).zone, 'hub');
assert.equal(worldSnapshotPayload(null), null);
assert.equal(worldSnapshotPayload({ type: 'chat', payload: { zone: 'hub', players: [] } }), null);
assert.equal(worldSnapshotPayload({ type: 'world-snapshot' }), null);
assert.equal(worldSnapshotPayload({ type: 'world-snapshot', payload: { zone: 'hub' } }), null);
assert.equal(worldSnapshotPayload({ type: 'world-snapshot', payload: { players: [] } }), null);

// isRemoteWorldPlayer: malformed entries and the player themself are dropped.
const self = 'keeper_one';
assert.equal(isRemoteWorldPlayer({ id: 'other', x: 1, z: 2 }, self), true);
assert.equal(isRemoteWorldPlayer({ id: self, x: 1, z: 2 }, self), false, 'exact self id is filtered');
assert.equal(isRemoteWorldPlayer({ id: 'KEEPER_ONE', x: 1, z: 2 }, self), false, 'self filter mirrors server case-insensitivity');
assert.equal(isRemoteWorldPlayer({ id: 'other', x: '3', z: 4 }, null), false, 'coordinates must be canonical numbers');
assert.equal(isRemoteWorldPlayer({ id: '', x: 1, z: 2 }, null), false);
assert.equal(isRemoteWorldPlayer({ id: 'other', x: null, z: 2 }, null), false);
assert.equal(isRemoteWorldPlayer(null, null), false);
assert.equal(isRemoteWorldPlayer({ id: self, x: 1, z: 2 }, null), true, 'without a self id nothing is filtered');
assert.equal(isRemoteWorldPlayer({ id: self, x: 1, z: 2 }, ''), true, 'empty self id filters nothing');

assert.deepEqual(filterRemotePlayers([
  { id: self, x: 0, z: 0 },
  { id: 'ranger_two', x: 5, z: 6 },
  { id: 'broken' },
], self), [{ id: 'ranger_two', x: 5, z: 6 }]);
assert.deepEqual(filterRemotePlayers(null, self), []);

// selfPresenceId: explicit id wins, then server profile keys.
assert.equal(selfPresenceId({ id: 'a', accountId: 'b', username: 'c' }, 'explicit'), 'explicit');
assert.equal(selfPresenceId({ id: 'a', accountId: 'b', username: 'c' }), 'a');
assert.equal(selfPresenceId({ accountId: 'b', username: 'c' }), 'b');
assert.equal(selfPresenceId({ username: 'c' }), 'c');
assert.equal(selfPresenceId({ displayName: 'Tester' }), null);
assert.equal(selfPresenceId(null), null);

// Wiring: the single online ingress validates both directions.
const root = new URL('..', import.meta.url);
const chat = fs.readFileSync(new URL('chat-runtime.mjs', root), 'utf8');
assert.match(chat, /import \{ buildWorldPosFrame, currentSelfPresenceId, filterRemotePlayers, worldSnapshotPayload \} from '\.\/world-presence-protocol\.mjs'/, 'chat runtime owns the presence protocol');
assert.match(chat, /const snapshot = window\.POCKETMONSTER_WORLD_STATE\?\.\(\);\s*const frame = buildWorldPosFrame\(snapshot\);/, 'outbound frames are validated before the socket');
assert.match(chat, /filterRemotePlayers\(payload\.players, currentSelfPresenceId\(\)\)/, 'inbound snapshots drop self at the ingress');
const presence = fs.readFileSync(new URL('world-presence-v800.mjs', root), 'utf8');
assert.match(presence, /if \(!isRemoteWorldPlayer\(item, selfId\)\) continue;/, 'controller defense-in-depth keeps the self filter');
assert.match(presence, /return buildWorldPosFrame\(\{ zone: getZone\?\.\(\), x: pos\?\.x, z: pos\?\.z, dir: dir === undefined \? 0 : dir \}\);/, 'published world state reuses the frame validator');
const bootstrap = fs.readFileSync(new URL('scripts/build-github-pages.mjs', root), 'utf8');
assert.match(bootstrap, /'world-presence-protocol\.mjs'/, 'pages artifact ships the protocol module');

console.log('World presence protocol hardening: PASS');
