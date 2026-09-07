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
assert.match(boot, /getActors: \(\) => piratePose\?\.actors/, 'parent publisher forwards actors through the existing WORLD_STATE provider');
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
