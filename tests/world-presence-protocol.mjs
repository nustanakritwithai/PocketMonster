import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const {
  WORLD_PRESENCE_PROTOCOL_VERSION,
  MAX_REMOTE_PLAYERS,
  MAX_SNAPSHOT_CANDIDATES,
  MAX_WORLD_ROUTE_GENERATION,
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
  sanitizePresentation,
  sanitizeVisual,
  MONSTER_AUTHORITY_VERSION,
  createVisualEventQueue,
  createPresenceRouteDiagnostics,
  SPELL_FX_ASSET_IDS,
} = await import('../world-presence-protocol.mjs');

assert.equal(WORLD_PRESENCE_PROTOCOL_VERSION, 'world-presence-protocol/v2');
assert.equal(MAX_REMOTE_PLAYERS, 100);
assert.equal(MAX_SNAPSHOT_CANDIDATES, 400);
assert.equal(MAX_WORLD_ROUTE_GENERATION, 2147483647);
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
assert.deepEqual(
  worldSnapshotPayload({ type: 'world-snapshot', payload: { zone: 'hub', generation: 7, players: [] } }),
  { zone: 'hub', generation: 7, players: [] },
  'optional Server route generation survives the canonical snapshot sanitizer',
);
for (const generation of [0, -1, 1.5, Number.NaN, MAX_WORLD_ROUTE_GENERATION + 1]) {
  assert.equal(
    worldSnapshotPayload({ type: 'world-snapshot', payload: { zone: 'hub', generation, players: [] } }),
    null,
    `invalid route generation ${generation} fails closed`,
  );
}
assert.equal(
  'generation' in worldSnapshotPayload({ type: 'world-snapshot', payload: { zone: 'hub', players: [] } }),
  false,
  'legacy snapshots remain valid without inventing a route generation',
);

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

const presentation = sanitizePresentation({
  schemaVersion: 1,
  avatarId: 'pirate-v1',
  appearanceId: 'player-orange',
  clothingIds: ['clothing:coat'],
  equipmentIds: ['equipment:sword'],
  activeItem: { category: 'sword', itemId: 'equipment:sword' },
});
assert.equal(presentation.activeItem.itemId, 'equipment:sword');
assert.equal(sanitizePresentation({ ...presentation, appearanceId: 'unknown' }), null, 'unknown appearance fails closed');
assert.equal(SPELL_FX_ASSET_IDS.length, 9);
const visual = sanitizeVisual({
  schemaVersion: 1,
  sessionId: 'visual-session-1',
  stateSequence: 1,
  events: [
    { sequence: 1, kind: 'slash', ageMs: 0, position: { x: 1, y: 2, z: 3 }, heading: 0.2, color: 0xff00aa, scale: 1 },
    { sequence: 2, kind: 'energy-launch', ageMs: 10, position: { x: 1, y: 2, z: 3 }, direction: { x: 0, y: 0, z: 1 }, color: 0xffffff, scale: 1 },
  ],
  projectiles: [{ id: 'projectile-1', position: { x: 1, y: 2, z: 3 }, direction: { x: 0, y: 0, z: 1 }, velocity: { x: 0, y: 0, z: 2 }, color: 0xffffff, scale: 1, elapsed: 0, lifeFraction: .2, remainingMs: 1000 }],
});
assert.equal(visual.events.length, 2);
assert.equal(visual.projectiles[0].id, 'projectile-1');
assert.equal(sanitizeVisual({ ...visual, events: Array.from({ length: 33 }, (_, i) => ({ ...visual.events[0], sequence: i + 1 })) }, { maxEvents: 32 }), null, 'outbound visual batches fail closed above 32');
assert.equal(sanitizeVisual({ ...visual, events: Array.from({ length: 512 }, (_, i) => ({ ...visual.events[0], sequence: i + 1 })) })?.events.length, 512, 'inbound snapshots preserve up to 512 history events');
assert.equal(sanitizeVisual({ ...visual, events: Array.from({ length: 514 }, (_, i) => ({ ...visual.events[0], sequence: i + 1 })) }), null, 'inbound visual history above 512 fails closed');
assert.equal(sanitizeVisual({ ...visual, projectiles: Array.from({ length: 33 }, (_, i) => ({ ...visual.projectiles[0], id: `projectile-${i}` })) }), null, 'visual projectile batches remain capped at 32');
const actorWithIndependentLifecycleGeneration = {
  actorId: 'monster-route-generation-test', kind: 'monster', monsterType: 'flameling', zone: 'hub', generation: 9,
  lifecycle: 'active', spawnSequence: 1, stateSequence: 2,
  pose: { x: 0, y: 0, z: 0, dir: 0 }, locomotion: 'idle', animation: null,
  presentation: { events: [], projectiles: [] },
};
const pirateAuthoritativeActor = {
  ...actorWithIndependentLifecycleGeneration,
  actorId: 'monster:east-forest:1',
  monsterType: 'crab',
  zone: 'pirate-fruit',
  generation: 1,
  authority: {
    authorityVersion: MONSTER_AUTHORITY_VERSION,
    serverTimeUtc: '2026-09-08T12:00:00Z', generation: 1,
    hp: { current: 41.5, max: 100, revision: 0 }, resultRevision: 2,
    actionSequence: 1, actionId: 'melee', hit: true, damage: 5, death: false,
    attack: { attackId: 'monster:east-forest:1:hit', spawnId: 'monster:east-forest:1', monsterId: 'monster:east-forest:1', islandId: 'pirate-fruit', targetId: 'player-1', action: 'melee', damage: 5, hitDelayMs: 180 },
  },
};
const pirateAuthoritativeSnapshot = sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', generation: 7, players: [], actors: [pirateAuthoritativeActor] }, 'pirate-fruit');
assert.equal(pirateAuthoritativeSnapshot.actors[0].authority.hp.current, 41.5, 'nested Server authority preserves fractional HP');
assert.equal(pirateAuthoritativeSnapshot.actors[0].authority.attack.targetId, 'player-1', 'nested Server attack preserves target identity');
assert.equal(sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', generation: 7, players: [], actors: [{ ...pirateAuthoritativeActor, authority: { ...pirateAuthoritativeActor.authority, generation: 2 } }] }, 'pirate-fruit'), null, 'authority generation mismatch fails closed');
const outboundActorPose = sanitizeOnlineWorldPose({ zone: 'pirate-fruit', x: 1, z: 2, dir: 0, actors: [pirateAuthoritativeActor] }, { allowAuthority: false });
assert.equal(outboundActorPose.actors[0].authority, undefined, 'outbound local pose strips client-authored authority');
const actualWireFixtureText = fs.readFileSync(new URL('./fixtures/monster-authority-wire.actual.json', import.meta.url));
assert.equal(crypto.createHash('sha256').update(actualWireFixtureText).digest('hex').toUpperCase(), 'E4A27463A9226226610075037E5E8EE97356009D48E7C2B5D3DC9617F785E450', 'actual Server/Pirate fixture bytes remain pinned');
const actualWireFixture = JSON.parse(actualWireFixtureText);
const actualWireSnapshot = sanitizeOnlineWorldSnapshot(actualWireFixture.payload, 'pirate-fruit');
assert.equal(actualWireSnapshot.actors[0].actorId, 'monster:east-forest', 'actual producer actor identity crosses the parent sanitizer');
assert.equal(actualWireSnapshot.actors[0].authority.attack.targetId, 'player-1', 'actual producer attack target crosses the parent sanitizer');
assert.equal(
  worldSnapshotPayload({ type: 'world-snapshot', payload: { zone: 'hub', generation: 3, players: [], actors: [actorWithIndependentLifecycleGeneration] } })?.actors[0].generation,
  9,
  'actor lifecycle generation is independent from viewer route generation',
);
let queueNow = 1000;
const queue = createVisualEventQueue(256, { now: () => queueNow });
queue.push(Array.from({ length: 40 }, (_, i) => ({ ...visual.events[0], sequence: i + 1 })));
assert.equal(queue.drain().length, 32, 'visual queue emits at most one contract batch');
assert.equal(queue.diagnostics().pending, 8, 'visual queue preserves events beyond a cadence');
queueNow += 120;
assert.equal(queue.peek(1)[0].ageMs, 120, 'queued event age advances from injectable clock time');
queueNow += 3001;
assert.equal(queue.diagnostics().pending, 0, 'expired queued events are removed before capacity/peek');
queue.push([{ ...visual.events[0], sequence: 99 }, { sequence: 100 }]);
assert.equal(queue.diagnostics().pending, 1, 'invalid events do not become head-of-line blockers');
let originalAgeNow = 0;
const originalAgeQueue = createVisualEventQueue(256, { now: () => originalAgeNow });
originalAgeQueue.push({ ...visual.events[0], sequence: 150, ageMs: 2500 });
originalAgeNow = 501;
assert.equal(originalAgeQueue.diagnostics().pending, 0, 'original event age participates in TTL expiry');
let commitNow = 0;
const commitQueue = createVisualEventQueue(256, { now: () => commitNow });
commitQueue.push({ ...visual.events[0], sequence: 201 });
commitNow = 2999;
commitQueue.push({ ...visual.events[0], sequence: 202 });
const peekedBeforeExpiry = commitQueue.peek(1);
assert.equal(peekedBeforeExpiry[0].ageMs, 2999);
commitNow = 3001;
commitQueue.commit(1, peekedBeforeExpiry);
assert.equal(commitQueue.peek(1)[0].ageMs, 2, 'unsent event keeps its own queue age after sent head expires');
assert.deepEqual(commitQueue.peek(1).map(event => event.sequence), [202], 'token commit removes only the sent event after clock advances');

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

let diagnosticsNow = 1000;
const routeDiagnostics = createPresenceRouteDiagnostics({ now: () => diagnosticsNow, maxSamples: 8 });
const actor = (stateSequence, generation = 1) => ({
  actorId: 'monster-a', kind: 'monster', monsterType: 'flameling', zone: 'hub', generation,
  spawnSequence: 1, stateSequence, lifecycle: 'active',
  pose: { x: stateSequence, y: 0, z: 0, dir: 0 },
});
routeDiagnostics.observeSnapshot({ zone: 'hub', generation: 1, players: [], actors: [actor(1)] });
diagnosticsNow = 1250;
routeDiagnostics.observeSnapshot({ zone: 'hub', generation: 1, players: [], actors: [actor(3), actor(3)] });
diagnosticsNow = 1600;
routeDiagnostics.observeSnapshot({ zone: 'hub', generation: 1, players: [] });
diagnosticsNow = 2200;
routeDiagnostics.recordRejected();
assert.deepEqual(routeDiagnostics.diagnostics().intervalMs, { min: 250, max: 600, p95: 600, p99: 600 }, 'route intervals expose percentile evidence');
assert.equal(routeDiagnostics.diagnostics().actorSequenceGaps, 1, 'actor sequence gaps are counted');
assert.equal(routeDiagnostics.diagnostics().duplicateActors, 1, 'duplicate actor identities are counted');
assert.equal(routeDiagnostics.diagnostics().actorsOmitted, 1, 'omitted actors are distinguished from empty actors');
assert.equal(routeDiagnostics.diagnostics().staleSnapshots, 1, 'rejected snapshots are counted as stale');

const authoritativeActor = { ...actor(4), zone: 'pirate-fruit' };
authoritativeActor.authority = {
  authorityVersion: MONSTER_AUTHORITY_VERSION,
  serverTimeUtc: '2026-09-08T07:00:00.000Z', generation: 1,
  hp: { current: 7, max: 10, revision: 0 }, resultRevision: 0,
  actionSequence: 1, hit: true, damage: 1, death: false, despawnReason: 'expired',
  attack: { attackId: 'attack-1', spawnId: 'monster-a', monsterId: 'monster-a', islandId: 'pirate-fruit', targetId: 'player-a', action: 'melee', damage: 1, hitDelayMs: 180 },
};
const authoritativeSnapshot = sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', players: [], actors: [authoritativeActor] });
assert.equal(authoritativeSnapshot.actors[0].authority.hp.revision, 0, 'initial authoritative HP revision survives sanitization');
assert.equal(authoritativeSnapshot.actors[0].authority.resultRevision, 0, 'initial combat result revision survives sanitization');
assert.equal(authoritativeSnapshot.actors[0].authority.despawnReason, 'expired', 'expired is a lifecycle reason, not a death state');
assert.equal(authoritativeSnapshot.actors[0].authority.attack.targetId, 'player-a', 'nested attack target survives sanitization');
assert.equal(sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', players: [], actors: [{ ...authoritativeActor, authority: { ...authoritativeActor.authority, authorityVersion: 'wrong/1' } }] }), null, 'unknown authority version fails closed');
assert.equal(sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', players: [], actors: [{ ...authoritativeActor, authority: { ...authoritativeActor.authority, hp: { current: 11, max: 10, revision: 2 } } }] }), null, 'invalid HP range fails closed');
assert.equal(sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', players: [], actors: [{ ...authoritativeActor, authority: { ...authoritativeActor.authority, generation: 2 } }] }), null, 'authority generation mismatch fails closed');
const playerAuthority = {
  schemaVersion: 1, serverTimeUtc: '2026-09-08T16:00:00.000Z',
  players: [
    { playerId: 'self-player', generation: 2, stateSequence: 7, hp: { current: 87.5, max: 100, revision: 3 }, resultRevision: 2, lifeState: 'alive' },
    { playerId: 'observer-player', generation: 2, stateSequence: 8, hp: { current: 0, max: 120, revision: 4 }, resultRevision: 5, lifeState: 'dead' },
  ],
  results: [
    { attackerId: 'monster:east-forest', targetId: 'self-player', attackId: 'hit-1', generation: 2, resultRevision: 1, authoritativeFinalHp: 87.5, serverTimeUtc: '2026-09-08T16:00:00.000Z' },
    { attackerId: 'monster:east-forest', targetId: 'observer-player', attackId: 'hit-1', generation: 2, resultRevision: 1, authoritativeFinalHp: 0, serverTimeUtc: '2026-09-08T16:00:00.000Z' },
  ],
};
const authoritySnapshot = sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', players: [{ id: 'self-player', x: 1, z: 2 }], playerAuthority });
assert.equal(authoritySnapshot.players.length, 1, 'visual self remains independently filtered by receiver');
assert.equal(authoritySnapshot.playerAuthority.players[0].hp.current, 87.5, 'self authoritative HP preserves fractional value');
assert.equal(authoritySnapshot.playerAuthority.players[1].lifeState, 'dead', 'observer death state crosses separate authority channel');
assert.equal(authoritySnapshot.playerAuthority.results.length, 2, 'same attack ID preserves results for multiple targets');
assert.equal(authoritySnapshot.playerAuthority.results[1].targetId, 'observer-player', 'target identity remains part of result transport key');
assert.equal(sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', players: [], playerAuthority: { ...playerAuthority, results: Array.from({ length: 65 }, (_, index) => ({ ...playerAuthority.results[0], attackId: `hit-${index}` })) } }), null, 'authority results are capped at 64');
assert.equal(sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', players: [], playerAuthority: { ...playerAuthority, results: [{ ...playerAuthority.results[0], authoritativeFinalHp: Infinity }] } }), null, 'invalid authoritative result HP fails closed');
assert.equal(sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', players: [], playerAuthority: { ...playerAuthority, results: [playerAuthority.results[0], playerAuthority.results[0]] } }), null, 'duplicate composite result fails closed');
assert.equal(sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', players: [], playerAuthority: { ...playerAuthority, players: [...playerAuthority.players, { ...playerAuthority.players[0], playerId: 'SELF-PLAYER' }] } }), null, 'case-insensitive duplicate authoritative player IDs fail closed');
assert.equal(sanitizeOnlineWorldSnapshot({ zone: 'hub', players: [], playerAuthority }).playerAuthority.players[0].playerId, 'self-player', 'authority remains valid across non-central visual zones');
assert.equal(sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', players: [], playerAuthority: { ...playerAuthority, players: [{ ...playerAuthority.players[0], hp: { current: 101, max: 100, revision: 4 } }] } }), null, 'authoritative HP range fails closed');
assert.equal(sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', players: [], playerAuthority: { ...playerAuthority, serverTimeUtc: 'invalid' } }), null, 'malformed authority timestamp fails closed');
assert.deepEqual(sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', players: [], playerAuthority: null }), { zone: 'pirate-fruit', players: [] }, 'null authority remains an absent optional field');
assert.equal(sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', players: [], playerAuthority: { ...playerAuthority, players: [{ ...playerAuthority.players[0], lifeState: 'dead' }] } }), null, 'dead authority must have zero HP');
assert.equal(sanitizeOnlineWorldSnapshot({ zone: 'pirate-fruit', players: [], playerAuthority: { ...playerAuthority, players: [{ ...playerAuthority.players[1], lifeState: 'alive' }] } }), null, 'alive authority must have positive HP');

const outboundPose = sanitizeOnlineWorldPose({ zone: 'pirate-fruit', x: 1, z: 2, dir: 0, actors: [authoritativeActor] }, { allowAuthority: false });
const outboundAuthorityPose = sanitizeOnlineWorldPose({ zone: 'pirate-fruit', x: 1, z: 2, dir: 0, playerAuthority }, { allowAuthority: false });
assert.equal(Object.hasOwn(outboundAuthorityPose, 'playerAuthority'), false, 'outbound local pose cannot author player HP authority');
assert.equal(outboundPose.actors[0].authority, undefined, 'client-authored authority is stripped from outbound pose');

const intentPose = sanitizeOnlineWorldPose({ zone: 'pirate-fruit', x: 1, z: 2, dir: 0, monsterIntents: [{
  schemaVersion: 1, intentId: 'monster-intent:2:9', zone: 'starter-island', kind: 'melee', category: 'sword',
  forwardX: 3, forwardZ: 4, range: 4.5, sequence: 9, targetActorId: 'monster:server-crab-1',
  expectedGeneration: 1, expectedStateSequence: 12,
}] }, { allowMonsterIntents: true });
assert.equal(intentPose.monsterIntents[0].forwardX, .6, 'monster intent direction is normalized');
assert.equal(sanitizeOnlineWorldPose({ zone: 'pirate-fruit', x: 1, z: 2, dir: 0, monsterIntents: [] }), null, 'monster intents require explicit outbound opt-in');
const root = new URL('..', import.meta.url);
const chat = fs.readFileSync(new URL('chat-runtime.mjs', root), 'utf8');
assert.match(chat, /createPresenceRouteDiagnostics.*world-presence-protocol\.mjs\?v=5/, 'chat runtime owns local route diagnostics');
assert.match(chat, /const snapshot = window\.POCKETMONSTER_WORLD_STATE\?\.\(\);\s*const frame = buildWorldPosFrame\(snapshot\);/, 'outbound frames are validated before the socket');
assert.match(chat, /filterRemotePlayers\(payload\.players, currentSelfPresenceId\(\)\)/, 'inbound snapshots drop self at the ingress');
const presence = fs.readFileSync(new URL('world-presence-v800.mjs', root), 'utf8');
assert.match(presence, /if \(!isRemoteWorldPlayer\(item, selfId\)\) continue;/, 'controller defense-in-depth keeps the self filter');
assert.match(presence, /locomotion: pos\?\.locomotion/, 'published world state forwards locomotion');
assert.match(presence, /animation: pos\?\.animation/, 'published world state forwards animation');
const bridge = fs.readFileSync(new URL('online-world-bridge-v900.mjs', root), 'utf8');
assert.match(bridge, /from '\.\/world-presence-protocol\.mjs\?v=5'/, 'online bridge imports the shared protocol');
assert.doesNotMatch(bridge, /LOCOMOTION_VALUES = new Set/, 'online bridge does not declare a second locomotion vocabulary');
assert.doesNotMatch(bridge, /COMBAT_STATE_VALUES = new Set/, 'online bridge does not declare a second combat vocabulary');
const bootstrap = fs.readFileSync(new URL('scripts/build-github-pages.mjs', root), 'utf8');
assert.match(bootstrap, /'world-presence-protocol\.mjs'/, 'pages artifact ships the protocol module');

console.log('World presence protocol owner: PASS');
