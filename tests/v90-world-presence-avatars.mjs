import assert from 'node:assert/strict';

import { createWorldPresenceController, installWorldPresence } from '../world-presence-v800.mjs';

class Position {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

class Group {
  constructor() {
    this.children = [];
    this.parent = null;
    this.position = new Position();
    this.rotation = { y: 0 };
    this.userData = {};
    this.name = '';
  }
  add(...nodes) {
    for (const node of nodes) { node.parent = this; this.children.push(node); }
  }
  remove(node) {
    this.children = this.children.filter(candidate => candidate !== node);
    if (node?.parent === this) node.parent = null;
  }
  traverse(visitor) {
    visitor(this);
    for (const child of this.children) child.traverse?.(visitor) || visitor(child);
  }
}

class BoxGeometry {
  constructor(...args) { this.args = args; this.disposed = false; }
  dispose() { this.disposed = true; }
}

class MeshStandardMaterial {
  constructor(options) { this.options = options; this.disposed = false; }
  dispose() { this.disposed = true; }
}

class Mesh extends Group {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}

class Vector3 extends Position {
  project() { this.set(0, 0, 0); return this; }
}

const THREE = { Group, Mesh, BoxGeometry, MeshStandardMaterial, Vector3 };
const domNodes = [];
function element() {
  return {
    id: '',
    className: '',
    textContent: '',
    hidden: false,
    dataset: {},
    style: {},
    children: [],
    append(node) { this.children.push(node); },
    remove() { this.removed = true; },
  };
}
globalThis.document = {
  getElementById() { return null; },
  createElement() { const node = element(); domNodes.push(node); return node; },
  body: { append(node) { domNodes.push(node); } },
};

const scene = new Group();
const controller = createWorldPresenceController({
  THREE,
  scene,
  getCamera: () => ({}),
  getZone: () => 'hub',
});

assert.equal(controller.acceptSnapshot({
  zone: 'hub',
  players: [{ id: 'player-b', name: 'Player B', x: 1, z: 2, dir: .4 }],
}), true);
assert.deepEqual(controller.diagnostics(), { remotePlayers: 1, avatars: 1 });
const avatar = scene.children.find(node => node.name === 'remote-world-player:player-b');
assert.ok(avatar, 'a same-zone remote snapshot creates a 3D avatar in the active scene');
assert.deepEqual([avatar.position.x, avatar.position.y, avatar.position.z], [1, 0, 2]);
assert.equal(avatar.rotation.y, .4);
assert.equal(avatar.children.length, 6, 'remote avatar has a visible blocky humanoid body');
assert.equal(typeof avatar.userData.remoteAnimator?.update, 'function', 'default Pocket/Living avatar exposes a remote animator');
const marker = domNodes.find(node => node.className === 'remote-world-player');
assert.equal(marker?.textContent, 'Player B');

controller.acceptSnapshot({
  zone: 'hub',
  players: [{
    id: 'player-b', x: 1, z: 2, dir: .4, locomotion: 'walk',
    animation: { combatState: 'casting', category: 'fruit', onGround: true, dashing: false, verticalVelocity: 0 },
  }],
});
controller.update(.1);
assert.equal(avatar.userData.remoteAnimationState.combatState, 'casting', 'default avatar renderer consumes canonical combat state');
assert.equal(avatar.userData.remoteAnimationState.locomotion, 'walk', 'default avatar renderer consumes canonical locomotion');

for (const [label, animation] of [
  ['jump', { combatState: 'idle', category: 'style', onGround: false, verticalVelocity: 8 }],
  ['fall', { combatState: 'idle', category: 'style', onGround: false, verticalVelocity: -8 }],
  ['land', { combatState: 'idle', category: 'style', onGround: true, verticalVelocity: 0, hitReactionId: 1 }],
  ['dash', { combatState: 'idle', category: 'utility', onGround: true, dashing: true, verticalVelocity: 0, skillAnimationType: 'dash' }],
]) {
  controller.acceptSnapshot({ zone: 'hub', players: [{ id: 'player-b', x: 1, z: 2, dir: .4, locomotion: 'idle', animation }] });
  controller.update(.1);
  assert.ok(Math.abs(avatar.children[0].rotation.x || 0) > .02, `default avatar renderer changes the rig for ${label}`);
}

const animatorEvents = [];
avatar.userData.remoteAnimator = {
  update(deltaSeconds, state) {
    animatorEvents.push({ deltaSeconds, state });
  },
};
controller.acceptSnapshot({
  zone: 'hub',
  players: [{
    id: 'player-b',
    name: 'Player B',
    x: 4,
    z: 5,
    dir: 1,
    locomotion: 'run',
    animation: {
      combatState: 'attack2',
      category: 'sword',
      onGround: true,
      dashing: false,
      verticalVelocity: 0,
      attackProgress: .4,
      actionSessionId: 'session_hub_1',
      actionSequence: 1,
      actionDurationMs: 80,
    },
  }],
});
controller.update();
assert.equal(animatorEvents.at(-1)?.state.combatState, 'attack2', 'canonical action state reaches the remote animator');
assert.equal(animatorEvents.at(-1)?.state.locomotion, 'run', 'locomotion is routed with the action state');

const originalNow = Date.now;
let now = originalNow();
Date.now = () => now;
try {
  controller.acceptSnapshot({
    zone: 'hub',
    players: [{
      id: 'player-b', x: 4, z: 5, dir: 1,
      animation: {
        combatState: 'attack1', category: 'style', onGround: true, dashing: false, verticalVelocity: 0,
        actionSessionId: 'session_expiry', actionSequence: 1, actionDurationMs: 80,
      },
    }],
  });
  now += 300;
  controller.update();
  assert.equal(avatar.userData.remoteAnimation.combatState, 'idle', 'expired action returns to neutral animation');
  controller.acceptSnapshot({
    zone: 'hub',
    players: [{
      id: 'player-b', x: 4, z: 5, dir: 1,
      animation: {
        combatState: 'attack1', category: 'style', onGround: true, dashing: false, verticalVelocity: 0,
        actionSessionId: 'session_expiry', actionSequence: 1, actionDurationMs: 80,
      },
    }],
  });
  assert.equal(avatar.userData.remoteAnimation.combatState, 'idle', 'late retransmission of an expired identity is ignored');
  controller.acceptSnapshot({
    zone: 'hub',
    players: [{
      id: 'player-b', x: 4, z: 5, dir: 1,
      animation: {
        combatState: 'attack2', category: 'sword', onGround: true, dashing: false, verticalVelocity: 0,
        actionSessionId: 'session_highwater', actionSequence: 2, actionDurationMs: 750,
      },
    }],
  });
  controller.update();
  controller.acceptSnapshot({
    zone: 'hub',
    players: [{
      id: 'player-b', x: 4, z: 5, dir: 1,
      animation: {
        combatState: 'attack1', category: 'sword', onGround: true, dashing: false, verticalVelocity: 0,
        actionSessionId: 'session_highwater', actionSequence: 1, actionDurationMs: 750,
      },
    }],
  });
  assert.equal(avatar.userData.remoteAnimation.combatState, 'attack2', 'lower sequence in the active session cannot rewind the remote action');
} finally {
  Date.now = originalNow;
}

controller.acceptSnapshot({
  zone: 'hub',
  players: [{ id: 'far-player', name: 'Far', x: 999999, z: -999999, dir: 0 }],
});
const farAvatar = scene.children.find(node => node.name === 'remote-world-player:far-player');
assert.deepEqual([farAvatar.position.x, farAvatar.position.z], [10000, -10000], 'direct presence ingress clamps remote coordinates');

controller.acceptSnapshot({
  zone: 'hub',
  players: [{ id: 'player-b', name: 'Player B', x: 4, z: 5, dir: 1 }],
});
controller.update();
assert.ok(avatar.position.x > 1 && avatar.position.x < 4, 'remote movement is smoothed toward the Server snapshot');
assert.ok(avatar.rotation.y > .4 && avatar.rotation.y < 1, 'remote facing is smoothed across snapshots');
assert.equal(controller.acceptSnapshot({ zone: 'grass-meadow', players: [] }), false, 'wrong-zone snapshots cannot clear the active avatar');
assert.equal(controller.diagnostics().remotePlayers, 1);

const geometries = avatar.children.map(child => child.geometry);
controller.acceptSnapshot({ zone: 'hub', players: [] });
assert.deepEqual(controller.diagnostics(), { remotePlayers: 0, avatars: 0 });
assert.equal(scene.children.includes(avatar), false, 'a departed player is removed from the 3D scene');
assert.ok(geometries.every(geometry => geometry.disposed), 'departed avatar geometry is disposed');
assert.equal(marker.removed, true, 'departed player name marker is removed');

controller.dispose();

const previousWindow = globalThis.window;
globalThis.window = new EventTarget();
const stopPresence = installWorldPresence({
  THREE,
  scene,
  getCamera: () => ({}),
  getZone: () => 'hub',
});
assert.equal(typeof globalThis.window.POCKETMONSTER_WORLD_PRESENCE, 'function');
globalThis.window.POCKETMONSTER_WORLD_PRESENCE({
  zone: 'hub',
  players: [{ id: 'reconnect-player', x: 1, z: 2, dir: 0 }],
});
assert.equal(scene.children.some(node => node.name === 'remote-world-player:reconnect-player'), true);
globalThis.window.dispatchEvent(new CustomEvent('pocketmonster:world-socket-status', { detail: { connected: false } }));
assert.equal(scene.children.some(node => node.name === 'remote-world-player:reconnect-player'), false, 'disconnect clears direct-world remote avatars immediately');
stopPresence();
globalThis.window = previousWindow;
console.log('V9 world presence remote avatars: PASS');
