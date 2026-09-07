import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildWorldPosFrame,
  sanitizeOnlineWorldSnapshot,
} from '../world-presence-protocol.mjs';
import { createWorldPresenceController, publishWorldState } from '../world-presence-v800.mjs';

const livingWorldSource = fs.readFileSync(new URL('../world-living-v900.mjs', import.meta.url), 'utf8');
assert.match(livingWorldSource, /createActor:\s*actor\s*=>\s*assets\.spawn\(/, 'living world passes production monster creation into the presence controller');
assert.match(livingWorldSource, /onMonsterVisual,/, 'living world forwards bounded actor visual events to its renderer');
assert.match(livingWorldSource, /onMonsterRemoved:/, 'living world clears actor visuals on despawn/reconnect');

class Node {
  constructor(name = '') {
    this.name = name;
    this.children = [];
    this.parent = null;
    this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => Object.assign(this.position, { x, y, z }) };
    this.rotation = { y: 0 };
    this.userData = {};
  }
  add(child) { child.parent = this; this.children.push(child); }
  remove(child) { this.children = this.children.filter(item => item !== child); if (child.parent === this) child.parent = null; }
  traverse(visitor) { visitor(this); for (const child of this.children) child.traverse?.(visitor); }
}

const actor = {
  actorId: 'monster-fox-1', kind: 'monster', ownerId: 'player-b', monsterType: 'flameling',
  zone: 'pirate-fruit', generation: 1, lifecycle: 'spawn', spawnSequence: 1, stateSequence: 1,
  pose: { x: 4, y: 0, z: -2, dir: .5 }, locomotion: 'walk',
  animation: {
    combatState: 'attack1', category: 'fruit', onGround: true, dashing: false,
    verticalVelocity: 0, actionSessionId: 'monster01', actionSequence: 1,
    actionDurationMs: 400, skillAnimationType: 'projectile',
  },
  presentation: { events: [], projectiles: [] },
};

const pose = buildWorldPosFrame({
  zone: 'pirate-fruit', x: 1, z: 2, dir: 0,
  actors: [actor],
});
assert.equal(pose.actors.length, 1, 'own publisher preserves presentation-only actor state');
assert.equal(pose.actors[0].actorId, actor.actorId);
assert.equal(Object.hasOwn(pose.actors[0], 'hp'), false, 'actor presentation never carries combat authority');

const snapshot = sanitizeOnlineWorldSnapshot({
  zone: 'pirate-fruit',
  players: [{ id: 'player-b', x: 0, z: 0, dir: 0 }], actors: [actor],
}, 'pirate-fruit');
assert.equal(snapshot.actors[0].actorId, actor.actorId, 'receiver sanitizer keeps actor identity');

const previousWindow = globalThis.window;
globalThis.window = {};
publishWorldState({
  getZone: () => 'pirate-fruit',
  getSelfId: () => 'player-self',
  getPosition: () => ({ x: 0, z: 0, dir: 0 }),
  getActors: () => [actor],
});
assert.equal(globalThis.window.POCKETMONSTER_WORLD_STATE().actors[0].actorId, actor.actorId);
if (previousWindow === undefined) delete globalThis.window;
else globalThis.window = previousWindow;

const scene = new Node('scene');
const calls = [];
const visuals = [];
let clock = 0;
const controller = createWorldPresenceController({
  scene,
  getZone: () => 'pirate-fruit',
  getSelfId: () => 'player-self',
  now: () => clock,
  interpolationDelayMs: 100,
  createAvatar: () => new Node('remote-avatar'),
  createActor: item => {
    const root = new Node(`remote-actor:${item.actorId}`);
    const handle = {
      root,
      play(action, options) { calls.push({ action, options }); },
      update(dt, state) { calls.push({ dt, state }); },
      dispose() { root.disposed = true; },
    };
    return handle;
  },
  onMonsterVisual: (visual, item) => visuals.push({ visual, item }),
});

assert.equal(controller.acceptSnapshot({ zone: 'pirate-fruit', players: [{ id: 'player-b', x: 0, z: 0, dir: 0 }], actors: [actor] }), true);
const remoteMonster = scene.children.find(node => node.name === `remote-actor:${actor.actorId}`);
assert.ok(remoteMonster, 'remote receiver creates the monster actor presentation host');
assert.deepEqual([remoteMonster.position.x, remoteMonster.position.z], [4, -2]);
assert.equal(calls[0].action, 'skill', 'skill/projectile action reaches monster presentation handle');
controller.update(.016);
assert.equal(calls.at(-1).state.locomotion, 'walk');

clock = 250;
assert.equal(controller.acceptSnapshot({
  zone: 'pirate-fruit', players: [{ id: 'player-b', x: 0, z: 0, dir: 0 }],
  actors: [{ ...actor, pose: { ...actor.pose, x: 8 }, stateSequence: 2 }],
}), true);
clock = 275;
controller.update(.016);
assert.ok(remoteMonster.position.x > 4 && remoteMonster.position.x < 8, 'remote monster interpolates between 250ms samples instead of snapping');

assert.equal(controller.acceptSnapshot({ zone: 'pirate-fruit', players: [{ id: 'player-b', x: 0, z: 0, dir: 0 }], actors: [{ ...actor, lifecycle: 'despawn', stateSequence: 3 }] }), true);
assert.equal(remoteMonster.disposed, true, 'despawn removes the remote monster presentation');
assert.equal(visuals.length, 2, 'bounded visual envelope reaches the presentation effect boundary for each accepted state');
assert.equal(controller.acceptSnapshot({ zone: 'other-zone', players: [] }), false, 'zone switch cannot clear the active zone through stale data');
controller.clear();
assert.equal(scene.children.some(node => node.name === `remote-actor:${actor.actorId}`), false, 'reconnect clear disposes late actor state');
const lateJoinActor = { ...actor, lifecycle: 'spawn', generation: 2, spawnSequence: 2, stateSequence: 1, monsterType: 'summoned-flameling', actorId: 'summon-fox-1' };
assert.equal(controller.acceptSnapshot({ zone: 'pirate-fruit', generation: 2, players: [], actors: [lateJoinActor] }), true);
assert.ok(scene.children.some(node => node.name === `remote-actor:${lateJoinActor.actorId}`), 'late join recreates actor from latest snapshot');
const oldLateJoin = scene.children.find(node => node.name === `remote-actor:${lateJoinActor.actorId}`);
assert.equal(controller.acceptSnapshot({
  zone: 'pirate-fruit', generation: 2, players: [],
  actors: [{ ...lateJoinActor, generation: 3, spawnSequence: 1, stateSequence: 1, pose: { ...lateJoinActor.pose, x: 9 } }],
}), true, 'new actor lifecycle generation is accepted after reconnect');
assert.equal(oldLateJoin.disposed, true, 'old actor lifecycle generation is disposed before recreation');
assert.equal(controller.acceptSnapshot({
  zone: 'pirate-fruit', generation: 2, players: [],
  actors: [{ ...lateJoinActor, ownerId: 'player-self', actorId: 'self-monster', stateSequence: 2 }],
}), true);
assert.equal(scene.children.some(node => node.name === 'remote-actor:self-monster'), false, 'sender-owned actor is filtered from remote rendering');
assert.equal(controller.acceptSnapshot({
  zone: 'pirate-fruit', generation: 2, players: [],
  actors: [{ ...lateJoinActor, lifecycle: 'despawn', stateSequence: 0 }],
}), false, 'invalid stale lifecycle sequence is rejected before it can remove a live actor');
controller.dispose();

console.log('V9.0 remote monster combat parity client contract: PASS');
