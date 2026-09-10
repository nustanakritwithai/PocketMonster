import assert from 'node:assert/strict';
import { syncStudioLegacyFightingStyleWraps } from '../asset-presentation/providers/studio-character.mjs';

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
}
class Node {
  constructor(name, x = 0, y = 0, z = 0) {
    this.name = name;
    this.position = new Vec3(x, y, z);
    this.children = [];
    this.parent = null;
    this.userData = {};
    this.quaternion = {};
    this.isScene = false;
    this.type = 'Group';
  }
  add(child) { child.parent = this; this.children.push(child); return this; }
  traverse(visitor) { visitor(this); for (const child of this.children) child.traverse(visitor); }
  updateMatrixWorld() {}
  getWorldPosition(out) {
    out.set(0, 0, 0);
    const chain = [];
    for (let current = this; current; current = current.parent) chain.push(current);
    for (let i = chain.length - 1; i >= 0; i--) {
      out.x += chain[i].position.x; out.y += chain[i].position.y; out.z += chain[i].position.z;
    }
    return out;
  }
  worldToLocal(out) {
    const world = this.getWorldPosition(new Vec3());
    out.x -= world.x; out.y -= world.y; out.z -= world.z;
    return out;
  }
}
function world(node) { return node.getWorldPosition(new Vec3()); }
function near(a, b, label) {
  assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.z - b.z) < 1e-9,
    `${label}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}

const THREE = { Vector3: Vec3 };
const gameplayRoot = new Node('player:gameplay-root', 10, 2, -3);
const visualHost = new Node('player:pirate-v1', 0, 0, 0);
const studio = new Node('studio-character:test', 0.25, 0.1, -0.2);
gameplayRoot.add(visualHost);
visualHost.add(studio);
const leftAnchor = new Node('studio-socket:weaponGripL', -0.55, 1.15, 0.12);
const rightAnchor = new Node('studio-socket:weaponGripR', 0.55, 1.15, 0.12);
studio.add(leftAnchor).add(rightAnchor);

// Pirate Fruit EquipmentVisuals is a sibling of player:pirate-v1 under
// player:gameplay-root, not a descendant of the Studio visual host.
const style = new Node('equipment:style', 0.2, 0.3, 0.4);
const leftWrap = new Node('equipment:style:left-hand', -0.62, 0.76, 0.04);
const rightWrap = new Node('equipment:style:right-hand', 0.62, 0.76, 0.04);
const sword = new Node('equipment:sword', 4, 5, 6);
gameplayRoot.add(style).add(sword);
style.add(leftWrap).add(rightWrap);
const swordBefore = world(sword);

const synced = syncStudioLegacyFightingStyleWraps({
  THREE,
  studioRoot: studio,
  host: visualHost,
  socketAnchors: { weaponGripL: leftAnchor, weaponGripR: rightAnchor },
});

assert.equal(synced, 2, 'both Fighting Style hand wraps must be found across the gameplay-root sibling hierarchy');
near(world(leftWrap), world(leftAnchor), 'left wrap follows Studio left-hand socket');
near(world(rightWrap), world(rightAnchor), 'right wrap follows Studio right-hand socket');
assert.equal(leftWrap.parent, style, 'left wrap stays in legacy EquipmentVisuals hierarchy');
assert.equal(rightWrap.parent, style, 'right wrap stays in legacy EquipmentVisuals hierarchy');
assert.equal(style.parent, gameplayRoot, 'style parent remains a gameplay-root sibling of the Studio visual host');
assert.equal(visualHost.parent, gameplayRoot, 'Studio visual host remains under gameplay root');
near(world(sword), swordBefore, 'unrelated equipment is untouched by wrap correction');
assert.equal(leftWrap.userData.studioSocketSynced, 'weaponGripL');
assert.equal(rightWrap.userData.studioSocketSynced, 'weaponGripR');

console.log('V9.1 Studio Fighting Style gameplay-root socket regression passed');
