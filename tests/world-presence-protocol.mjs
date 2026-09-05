import assert from 'node:assert/strict';
import fs from 'node:fs';

const {
  WORLD_PRESENCE_PROTOCOL_VERSION,
  MAX_REMOTE_PLAYERS,
  MAX_SNAPSHOT_CANDIDATES,
  LOCOMOTION_VALUES,
  COMBAT_STATE_VALUES,
  ANIMATION_CATEGORY_VALUES,
  buildWorldPosFrame,
  sanitizeOnlineWorldPose,
  sanitizeOnlineWorldSnapshot,
  worldSnapshotPayload,
  isRemoteWorldPlayer,
  filterRemotePlayers,
  selfPresenceId,
} = await import('../world-presence-protocol.mjs');

assert.equal(WORLD_PRESENCE_PROTOCOL_VERSION, 'world-presence-protocol/v2');
assert.equal(MAX_REMOTE_PLAYERS, 100);
assert.equal(MAX_SNAPSHOT_CANDIDATES, 400);
assert.deepEqual(LOCOMOTION_VALUES, ['idle', 'walk', 'run', 'swim']);
assert.deepEqual(COMBAT_STATE_VALUES, [
  'idle', 'attack1', 'attack2', 'attack3', 'attack4', 'casting', 'blocking',
  'stunned', 'knockback', 'knockdown', 'dead',
]);
assert.deepEqual(ANIMATION_CATEGORY_VALUES, ['style', 'sword', 'gun', 'fruit', 'utility']);

const poseOnly = { zone: 'hub', x: 1, z: -2, dir: 0.5, locomotion: 'idle', animation: null };
assert.deepEqual(buildWorldPosFrame({ zone: 'hub', x: 1, z: -2, dir: 0.5 }), poseOnly);
assert.equal(buildWorldPosFrame({ zone: 'hub', x: 1, z: -2 }).dir, 0, 'missing dir defaults to 0');
assert.equal(buildWorldPosFrame(null), null);
assert.equal(buildWorldPosFrame({}), null);
assert.equal(buildWorldPosFrame({ zone: '', x: 1, z: 2 }), null);
assert.equal(buildWorldPosFrame({ zone: 5, x: 1, z: 2 }), null);
assert.equal(buildWorldPosFrame({ zone: '../bad', x: 1, z: 2, dir: 0 }), null, 'zone grammar fails closed');
assert.equal(buildWorldPosFrame({ zone: 'hub', x: NaN, z: 2 }), null);
assert.equal(buildWorldPosFrame({ zone: 'hub', x: 1, z: Infinity }), null);
assert.equal(buildWorldPosFrame({ zone: 'hub', x: 1, z: 2, dir: 'side' }), null);
assert.ok(Object.isFrozen(buildWorldPosFrame({ zone: 'hub', x: 1, z: 2 })), 'frames are immutable');

assert.deepEqual(
  buildWorldPosFrame({
    zone: 'pirate-fruit',
    x: 1,
    z: -2,
    dir: 0.25,
    locomotion: 'run',
    animation: { combatState: 'casting', category: 'fruit', skillAnimationProgress: 0.4, onGround: false, dashing: true },
  }),
  {
    zone: 'pirate-fruit',
    x: 1,
    z: -2,
    dir: 0.25,
    locomotion: 'run',
    animation: {
      combatState: 'casting', category: 'fruit', onGround: false, dashing: true,
      verticalVelocity: 0, skillAnimationProgress: 0.4,
    },
  },
  'validated locomotion/animation survive sanitization',
);
assert.equal(buildWorldPosFrame({ zone: 'hub', x: 1, z: 2, dir: 0, locomotion: 'fly' }).locomotion, 'idle', 'unknown locomotion fails closed to idle without dropping pose');

assert.equal(worldSnapshotPayload({ type: 'world-snapshot', payload: { zone: 'hub', players: [] } }).zone, 'hub');
assert.equal(worldSnapshotPayload(null), null);
assert.equal(worldSnapshotPayload({ type: 'chat', payload: { zone: 'hub', players: [] } }), null);
assert.equal(worldSnapshotPayload({ type: 'world-snapshot' }), null);
assert.equal(worldSnapshotPayload({ type: 'world-snapshot', payload: { zone: 'hub' } }), null);
assert.equal(worldSnapshotPayload({ type: 'world-snapshot', payload: { players: [] } }), null);

const snapshot = worldSnapshotPayload({
  type: 'world-snapshot',
  payload: {
    zone: 'hub',
    players: [
      { id: 'alice', name: 'Alice', x: 1, y: 3, z: 2, dir: 0.5, locomotion: 'run', animation: { combatState: 'attack1', category: 'style', attackProgress: 2 } },
      { id: 'alice', name: 'duplicate', x: 9, z: 9 },
      { id: 'bad', x: Infinity, z: 0 },
    ],
  },
});
assert.deepEqual(snapshot, {
  zone: 'hub',
  players: [{
    id: 'alice',
    name: 'Alice',
    x: 1,
    y: 3,
    z: 2,
    dir: 0.5,
    locomotion: 'run',
    animation: { combatState: 'attack1', category: 'style', onGround: true, dashing: false, verticalVelocity: 0, attackProgress: 1 },
  }],
});

assert.deepEqual(
  sanitizeOnlineWorldPose({ zone: 'pirate-fruit', x: 1, y: 2.5, z: -2, dir: 0.25, locomotion: 'run', animation: { combatState: 'attack2', category: 'sword', attackProgress: .5, dashing: true } }),
  { zone: 'pirate-fruit', x: 1, y: 2.5, z: -2, dir: .25, locomotion: 'run', animation: { combatState: 'attack2', category: 'sword', onGround: true, dashing: true, verticalVelocity: 0, attackProgress: .5 } },
);
assert.equal(buildWorldPosFrame({ zone: 'hub', x: 1, y: 20000, z: 2, dir: 0 }).y, 10000, 'height is bounded');
assert.deepEqual(
  buildWorldPosFrame({ zone: 'hub', x: 20000, y: 0, z: -20000, dir: 0 }),
  { zone: 'hub', x: 10000, y: 0, z: -10000, dir: 0, locomotion: 'idle', animation: null },
  'world coordinates are bounded at the shared protocol ingress',
);
assert.equal('y' in buildWorldPosFrame({ zone: 'hub', x: 1, y: Number.NaN, z: 2, dir: 0 }), false, 'invalid optional height is omitted');
assert.equal(sanitizeOnlineWorldSnapshot({ zone: 'hub', players: [] }, 'pirate-fruit'), null);

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

assert.equal(selfPresenceId({ id: 'a', accountId: 'b', username: 'c' }, 'explicit'), 'explicit');
assert.equal(selfPresenceId({ id: 'a', accountId: 'b', username: 'c' }), 'a');
assert.equal(selfPresenceId({ accountId: 'b', username: 'c' }), 'b');
assert.equal(selfPresenceId({ username: 'c' }), 'c');
assert.equal(selfPresenceId({ displayName: 'Tester' }), null);
assert.equal(selfPresenceId(null), null);

const root = new URL('..', import.meta.url);
const chat = fs.readFileSync(new URL('chat-runtime.mjs', root), 'utf8');
assert.match(chat, /import \{ buildWorldPosFrame, currentSelfPresenceId, filterRemotePlayers, worldSnapshotPayload \} from '\.\/world-presence-protocol\.mjs\?v=2'/, 'chat runtime owns the presence protocol');
assert.match(chat, /const snapshot = window\.POCKETMONSTER_WORLD_STATE\?\.\(\);\s*const frame = buildWorldPosFrame\(snapshot\);/, 'outbound frames are validated before the socket');
assert.match(chat, /filterRemotePlayers\(payload\.players, currentSelfPresenceId\(\)\)/, 'inbound snapshots drop self at the ingress');
const presence = fs.readFileSync(new URL('world-presence-v800.mjs', root), 'utf8');
assert.match(presence, /if \(!isRemoteWorldPlayer\(item, selfId\)\) continue;/, 'controller defense-in-depth keeps the self filter');
assert.match(presence, /locomotion: pos\?\.locomotion/, 'published world state forwards locomotion');
assert.match(presence, /animation: pos\?\.animation/, 'published world state forwards animation');
const bridge = fs.readFileSync(new URL('online-world-bridge-v900.mjs', root), 'utf8');
assert.match(bridge, /from '\.\/world-presence-protocol\.mjs\?v=2'/, 'online bridge imports the shared protocol');
assert.doesNotMatch(bridge, /LOCOMOTION_VALUES = new Set/, 'online bridge does not declare a second locomotion vocabulary');
assert.doesNotMatch(bridge, /COMBAT_STATE_VALUES = new Set/, 'online bridge does not declare a second combat vocabulary');
const bootstrap = fs.readFileSync(new URL('scripts/build-github-pages.mjs', root), 'utf8');
assert.match(bootstrap, /'world-presence-protocol\.mjs'/, 'pages artifact ships the protocol module');

console.log('World presence protocol owner: PASS');
