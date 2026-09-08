import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PIRATE_LOCAL_PRESENCE_MESSAGE,
  PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
  PIRATE_PRESENCE_STATUS_MESSAGE,
  createPiratePresenceStatusMessage,
  createPirateSnapshotMessage,
  advancePirateSnapshotVisualAge,
  sanitizePirateLocalPresence,
  sanitizePirateWorldSnapshot,
  pirateCentralAuthorityOwnsZone,
} from '../pirate-presence-bridge-v900.mjs';
import { publishWorldState } from '../world-presence-v800.mjs';

const boot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const chat = fs.readFileSync(new URL('../chat-runtime.mjs', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../pirate-presence-bridge-v900.mjs', import.meta.url), 'utf8');
const pirateOfflineHtml = fs.readFileSync(new URL('../pirate-fruit-offline/index.html', import.meta.url), 'utf8');
const pirateStatus = fs.readFileSync(new URL('../pirate-fruit-offline/pocketmonster-status-v900.mjs', import.meta.url), 'utf8');
const pirateBundle = fs.readFileSync(new URL('../pirate-fruit-offline/assets/index-DKUYjNyH.js', import.meta.url), 'utf8');
assert.match(pirateBundle, /onCentralAuthority/, 'compiled Pirate adapter exposes the central capability callback');
assert.match(pirateBundle, /getMonsterActors/, 'compiled Pirate adapter exposes the central actor source switch');
assert.match(pirateBundle, /generation/, 'compiled Pirate adapter carries lifecycle generation validation');

const centralAuthority = {
  contract: 'pirate-central-spatial/1', schemaVersion: 1,
  generation: 1,
  contentRevision: 'pirate-monster-catalog-2026-09-07-ai-v2-transport-v2', contentHash: 'fnv1a-236acf41',
  manifestSha256: '7D0B9E054B4D9F7669EC0EB34E4F93EE3ADF46E655E4FC7D30EFBBE8C4DD83A0',
  vectorsSha256: 'A3571B1D11E8EBFF68F9B1A027EF847E74D33B93B861D083D450910ADB4B4DF7',
  zones: ['azure-frost', 'ember-volcano', 'mist-jungle', 'starter-island', 'sunscar-desert', 'tempest-sky'],
};
assert.equal(pirateCentralAuthorityOwnsZone(centralAuthority, 'pirate-fruit'), true, 'exact Server capability activates the Pirate transport zone');
for (const mapZone of centralAuthority.zones) {
  assert.equal(pirateCentralAuthorityOwnsZone(centralAuthority, 'pirate-fruit'), true, `central map zone ${mapZone} keeps the transport gate active`);
}
assert.equal(pirateCentralAuthorityOwnsZone({ ...centralAuthority, contentHash: 'fnv1a-ae668b33' }, 'pirate-fruit'), false, 'stale manifest identity fails closed');
assert.equal(pirateCentralAuthorityOwnsZone(centralAuthority, 'living-world'), false, 'non-Pirate transport keeps owner relay');

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
const localPresentationPose = sanitizePirateLocalPresence({
  type: PIRATE_LOCAL_PRESENCE_MESSAGE,
  zone: 'pirate-fruit', x: 1, z: 2, dir: 0,
  presentation: { schemaVersion: 1, avatarId: 'pirate-v1', appearanceId: 'player-orange', clothingIds: [], equipmentIds: [], activeItem: null },
  visual: { schemaVersion: 1, sessionId: 'visual_session_1', stateSequence: 1, events: [{ sequence: 1, kind: 'hit-spark', ageMs: 0, position: { x: 1, y: 2, z: 3 }, color: 0xffffff }], projectiles: [] },
});
assert.equal(localPresentationPose.presentation.appearanceId, 'player-orange', 'iframe local pose preserves presentation metadata');
assert.equal(localPresentationPose.visual.events.length, 1, 'iframe local pose preserves visual batch for WORLD_STATE');
const localActor = {
  actorId: 'monster-fox-1', kind: 'monster', ownerId: 'player-self', monsterType: 'flameling',
  zone: 'pirate-fruit', generation: 1, lifecycle: 'spawn', spawnSequence: 1, stateSequence: 1,
  pose: { x: 4, y: 0, z: -2, dir: .5 }, locomotion: 'walk',
  animation: { combatState: 'casting', category: 'fruit', onGround: true, dashing: false, verticalVelocity: 0 },
  presentation: { events: [], projectiles: [] },
};
const localActorPose = sanitizePirateLocalPresence({
  type: PIRATE_LOCAL_PRESENCE_MESSAGE, zone: 'pirate-fruit', x: 1, z: 2, dir: 0,
  actors: [localActor],
});
assert.equal(localActorPose.actors[0].actorId, localActor.actorId, 'iframe actor state survives the local sanitizer');
assert.equal(Object.hasOwn(localActorPose.actors[0], 'hp'), false, 'local actor bridge remains presentation-only');
assert.equal(Object.hasOwn(localActorPose.actors[0], 'authority'), false, 'local actor cannot inject server authority');
const authorityActor = {
  ...localActor,
  actorId: 'monster:server-crab-1',
  lifecycle: 'active',
  authority: {
    authorityVersion: 'monster-authority/1',
    serverTimeUtc: '2026-09-08T07:00:00.000Z',
    generation: 1,
    hp: { current: 42.5, max: 70, revision: 3 },
    resultRevision: 8,
    actionSequence: 9,
    hit: true,
    damage: 7,
    death: false,
    attack: {
      attackId: 'monster:server-crab-1:attack:9',
      spawnId: 'server-crab-1',
      monsterId: 'crab',
      islandId: 'starter-island',
      targetId: 'player-1',
      action: 'melee',
      damage: 7,
      hitDelayMs: 180,
    },
  },
};
const authoritySnapshot = sanitizePirateWorldSnapshot({ zone: 'pirate-fruit', players: [], actors: [authorityActor] });
assert.equal(authoritySnapshot.actors[0].authority.hp.current, 42.5, 'Server authority HP crosses the Parent snapshot sanitizer');
assert.equal(authoritySnapshot.actors[0].authority.attack.targetId, 'player-1', 'target-aware attack result crosses the Parent snapshot sanitizer');
assert.equal(sanitizePirateWorldSnapshot({ zone: 'pirate-fruit', players: [], actors: [{ ...authorityActor, authority: { ...authorityActor.authority, hp: { ...authorityActor.authority.hp, current: 999 } } }] }), null, 'invalid authority HP fails closed');
const monsterIntent = {
  schemaVersion: 1,
  intentId: 'monster-intent:2:9',
  zone: 'starter-island',
  kind: 'melee',
  category: 'sword',
  forwardX: 3,
  forwardZ: 4,
  range: 4.5,
  sequence: 9,
  targetActorId: 'monster:server-crab-1',
  expectedGeneration: 1,
  expectedStateSequence: 12,
};
const localIntentPose = sanitizePirateLocalPresence({
  type: PIRATE_LOCAL_PRESENCE_MESSAGE, zone: 'pirate-fruit', x: 1, z: 2, dir: 0,
  monsterIntents: [monsterIntent],
});
assert.equal(localIntentPose.monsterIntents[0].forwardX, .6, 'Parent normalizes forwarded intent direction');
assert.equal(localIntentPose.monsterIntents[0].targetActorId, monsterIntent.targetActorId, 'Parent preserves target identity on intent');
assert.equal(sanitizePirateLocalPresence({
  type: PIRATE_LOCAL_PRESENCE_MESSAGE, zone: 'pirate-fruit', x: 1, z: 2, dir: 0,
  monsterIntents: [monsterIntent, monsterIntent],
}), null, 'duplicate intent ids fail closed within one frame');
const agedSnapshot = advancePirateSnapshotVisualAge({ zone: 'pirate-fruit', players: [{
  id: 'remote-one', name: 'Remote', x: 1, z: 2, dir: 0,
  visual: { schemaVersion: 1, sessionId: 'visual_session_1', stateSequence: 1,
    events: [{ sequence: 1, kind: 'hit-spark', ageMs: 100, position: { x: 1, y: 2, z: 3 }, color: 0xffffff }], projectiles: [{ id: 'projectile-1', position: { x: 1, y: 2, z: 3 }, direction: { x: 0, y: 0, z: 1 }, velocity: { x: 0, y: 0, z: 1 }, color: 0xffffff, scale: 1, elapsed: 0, lifeFraction: .8, remainingMs: 5000 }] },
}] }, 120);
assert.equal(agedSnapshot.players[0].visual.events[0].ageMs, 220, 'pending one-shot age advances on late boot');
assert.equal(agedSnapshot.players[0].visual.projectiles.length, 1, 'late boot preserves current projectile phase');
assert.equal(agedSnapshot.players[0].visual.projectiles[0].remainingMs, 4880, 'projectile remaining lifetime advances with late boot age');
assert.ok(agedSnapshot.players[0].visual.projectiles[0].position.z > 3, 'projectile position predicts forward during late boot');
assert.ok(agedSnapshot.players[0].visual.projectiles[0].lifeFraction < .8, 'projectile shader phase follows remaining lifetime');
const phaseSnapshot = advancePirateSnapshotVisualAge(agedSnapshot, 1380);
assert.equal(phaseSnapshot.players[0].visual.projectiles[0].remainingMs, 3500, 'projectile remaining lifetime reaches expected 1500ms advance');
assert.equal(phaseSnapshot.players[0].visual.projectiles[0].lifeFraction, .56, 'projectile shader phase uses remaining ratio');
assert.equal(phaseSnapshot.players[0].visual.projectiles[0].position.z, 3.37, 'projectile prediction is capped at 250ms');
assert.equal(advancePirateSnapshotVisualAge(agedSnapshot, 3000).players[0].visual.events.length, 0, 'expired one-shot is omitted after TTL');
assert.equal(advancePirateSnapshotVisualAge(agedSnapshot, 5000).players[0].visual.projectiles.length, 0, 'projectile past remaining lifetime is omitted');
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
const capabilitySnapshot = sanitizePirateWorldSnapshot({ zone: 'pirate-fruit', centralAuthority, players: [] });
assert.equal(capabilitySnapshot.centralAuthority.contentRevision, centralAuthority.contentRevision, 'valid capability crosses the parent snapshot sanitizer');
assert.equal(capabilitySnapshot.centralAuthority.generation, 1, 'central capability generation crosses the parent snapshot sanitizer');
assert.equal(sanitizePirateWorldSnapshot({ zone: 'pirate-fruit', centralAuthority: { ...centralAuthority, manifestSha256: 'bad' }, players: [] }).centralAuthority, undefined, 'mismatched capability is omitted');
assert.equal(sanitizePirateWorldSnapshot({ zone: 'pirate-fruit', centralAuthority: { ...centralAuthority, generation: 0 }, players: [] }).centralAuthority, undefined, 'invalid central capability generation is omitted');
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
pose = { x: 2, z: 3, dir: 0.25, actors: [localActor], monsterIntents: [monsterIntent] };
assert.equal(window.POCKETMONSTER_WORLD_STATE().monsterIntents[0].intentId, monsterIntent.intentId,
  'world-pos publisher carries validated Pirate monster intents to the shared socket');
publishWorldState({
  getZone: () => 'pirate-fruit',
  getPosition: () => pose,
  getDir: () => pose?.dir,
  allowActors: false,
});
assert.equal(Object.hasOwn(window.POCKETMONSTER_WORLD_STATE(), 'actors'), false,
  'central Pirate publisher suppresses iframe actor pose from outbound WORLD_STATE');
publishWorldState({
  getZone: () => 'living-world',
  getPosition: () => ({ ...pose, actors: [{ ...localActor, zone: 'living-world' }] }),
  getDir: () => pose?.dir,
  allowActors: true,
});
assert.equal(window.POCKETMONSTER_WORLD_STATE().actors[0].actorId, localActor.actorId,
  'noncentral publishers retain the existing actor compatibility gate');
pose = { x: 2, z: 3, dir: 0.25 };
publishWorldState({
  getZone: () => 'pirate-fruit',
  getPosition: () => pose,
  getDir: () => pose?.dir,
});

let relayAllowed = true;
pose = { x: 2, z: 3, dir: 0.25, actors: [localActor] };
const centralPose = { ...pose, actors: [{ ...localActor, zone: 'starter-island' }] };
publishWorldState({ getZone: () => 'starter-island', getPosition: () => centralPose, getDir: () => centralPose.dir, getAllowActors: () => relayAllowed });
assert.equal(window.POCKETMONSTER_WORLD_STATE().actors.length, 1, 'late capability starts in compatible relay mode');
relayAllowed = false;
assert.equal(Object.hasOwn(window.POCKETMONSTER_WORLD_STATE(), 'actors'), false, 'central capability can suppress owner actors dynamically');
relayAllowed = true;
publishWorldState({ getZone: () => 'pirate-fruit', getPosition: () => pose, getDir: () => pose?.dir });

assert.match(boot, /event\.source !== frame\.contentWindow/, 'frame source is checked before accepting pose');
assert.match(boot, /event\.origin !== 'null'/, 'opaque sandbox origin is checked before accepting pose');
assert.match(boot, /sanitizePirateLocalPresence\(message\)/, 'parent accepts only the validated local pose contract');
assert.match(boot, /allowActors: true/, 'Pirate parent preserves actor relay until Server central-authority capability is verified');
assert.match(boot, /getAllowActors:/, 'Pirate parent evaluates central authority dynamically per WORLD_STATE frame');
assert.match(boot, /centralAuthorityCapability = null/, 'disconnect and cleanup clear central authority capability');
assert.match(boot, /sanitizePirateWorldSnapshot\(payload\)/, 'parent sanitizes Server snapshots before forwarding');
assert.match(boot, /frame\.contentWindow\?\.postMessage\(createPirateSnapshotMessage\(snapshot\), '\*'\)/, 'snapshot targets the exact mounted opaque frame window');
assert.match(boot, /frame\.contentWindow\?\.postMessage\(createPiratePresenceStatusMessage\(connected\), '\*'\)/, 'presence status targets the exact mounted opaque frame window');
assert.match(boot, /pocketmonster:world-socket-status/, 'parent listens for the real shared-socket status');
assert.match(chat, /const snapshot = window\.POCKETMONSTER_WORLD_STATE\?\.\(\)/, 'existing authenticated chat socket reads the bridged local pose');
assert.match(chat, /type: 'world-pos'/, 'existing socket publishes the ephemeral world position');
assert.match(chat, /lastWorldZone && lastWorldZone !== frame\.zone/, 'zone change clears queued one-shots before the next world frame');
assert.match(chat, /type === 'world-snapshot'/, 'existing socket receives Server snapshots');
assert.match(chat, /type === 'world-snapshot'[\s\S]*setWorldConnected\(true\)/, 'only a Server world snapshot promotes the presence transport online');
assert.match(chat, /addEventListener\('close',[\s\S]*setWorldConnected\(false\)/, 'socket close returns the presence transport to connecting');
assert.match(boot, /pocketmonster:world-socket-status[\s\S]*POCKETMONSTER_WORLD_VISUAL_RESET/, 'logout/disconnect clears local visual queue without touching auth messages');
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
  locomotion: 'run',
  animation: { combatState: 'attack1', category: 'style', attackProgress: 1.4, onGround: false },
}), {
  x: 7,
  z: 11.5,
  dir: 0.4,
  locomotion: 'run',
  animation: { combatState: 'attack1', category: 'style', onGround: false, dashing: false, verticalVelocity: 0, attackProgress: 1 },
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
  animation: null,
});

const actionSnapshot = sanitizePirateWorldSnapshot({
  zone: 'pirate-fruit',
  players: [{
    id: 'bob',
    name: 'Bob',
    x: 3,
    z: 4,
    dir: 1,
    locomotion: 'run',
    animation: { combatState: 'casting', category: 'fruit', skillAnimationProgress: 0.25, dashing: true },
  }],
});
assert.deepEqual(actionSnapshot.players[0], {
  id: 'bob',
  name: 'Bob',
  x: 3,
  z: 4,
  dir: 1,
  locomotion: 'run',
  animation: { combatState: 'casting', category: 'fruit', onGround: true, dashing: true, verticalVelocity: 0, skillAnimationProgress: 0.25 },
});

pose = { x: 2, y: 4, z: 3, dir: 0.25, locomotion: 'run', animation: { combatState: 'blocking', category: 'style' } };
assert.deepEqual(window.POCKETMONSTER_WORLD_STATE(), {
  zone: 'pirate-fruit', x: 2, y: 4, z: 3, dir: 0.25, locomotion: 'run',
  animation: { combatState: 'blocking', category: 'style', onGround: true, dashing: false, verticalVelocity: 0 },
});

assert.equal(sanitizePirateLocalPresence({
  type: PIRATE_LOCAL_PRESENCE_MESSAGE,
  zone: 'pirate-fruit',
  x: 2,
  y: 4,
  z: 3,
  dir: 0.25,
})?.y, 4, 'the iframe-to-parent bridge preserves optional height');

assert.doesNotMatch(bridge, /PIRATE_PRESENCE_LOCOMOTION_VALUES|PIRATE_PRESENCE_COMBAT_STATES/,
  'pirate bridge must not copy protocol locomotion/combat enums');
assert.match(boot, /const markFrameReady = \(\) => \{/,
  'Pirate parent has an idempotent iframe-ready gate for reload races');
assert.match(boot, /frame\.contentDocument\?\.readyState === 'complete' \|\| frame\.readyState === 'complete'/,
  'already-loaded iframe is promoted to ready without waiting for a second load event');
assert.match(boot, /clearPresenceQueue: \(\) => \{/,
  'presence queue cleanup stays inside bindPocketMonsterLink closure');
assert.doesNotMatch(boot, /if \(frameReady\) return/,
  'reload after ready=true reactivates the HUD lifecycle');
assert.doesNotMatch(boot, /registerExternalPose\(piratePose\);[\s\S]{0,120}forwardPresence\(latestPresenceSnapshot\)/,
  'local iframe pose updates do not replay the last remote snapshot as a fresh network sample');
assert.match(boot, /POCKETMONSTER_WORLD_PRESENCE = payload => \{\s*if \(!pirateRuntimeActive\) return false;/,
  'an unmounted Pirate receiver rejects an in-flight old-zone snapshot');
assert.match(boot, /try \{\s*if \(frame\.contentDocument\?\.readyState === 'complete'/,
  'opaque iframe contentDocument getter is guarded');
assert.match(boot, /now - pending\.queuedAt <= 3000/,
  'late boot drops expired pending snapshots');
assert.doesNotMatch(boot, /unmount:[\s\S]{0,220}pendingPresenceSnapshots\.length = 0/,
  'outer lifecycle does not reference closure-owned queue storage');

console.log('V9.0 Pirate Fruit read-only presence bridge: PASS');
