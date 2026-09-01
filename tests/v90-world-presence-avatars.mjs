import assert from 'node:assert/strict';

import { createWorldPresenceController } from '../world-presence-v800.mjs';

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
const marker = domNodes.find(node => node.className === 'remote-world-player');
assert.equal(marker?.textContent, 'Player B');

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
console.log('V9 world presence remote avatars: PASS');
