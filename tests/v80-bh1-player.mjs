import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadCatalog, resetCatalog } from '../asset-presentation/catalog.mjs';
import { createAssetEngine } from '../asset-presentation/engine.mjs';
import { createBigheadProvider } from '../asset-presentation/providers/procedural-bighead.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(js, /pirate-fruit\.v1',\{role:'player'/, 'Player must spawn as pirate-fruit');
assert.doesNotMatch(js, /blocky-bighead\.v1',\{role:'player'/, 'Pocket Monster player model is no longer the live player');
assert.match(js, /blocky-bighead\.v1',\{role:'keeper'/, 'Keeper also consumes the Bighead asset via role');
assert.match(js, /playerThrowOrigin\(\)/, 'throw still uses the shared origin helper');

function vec() {
  return { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
}
class Node {
  constructor() {
    this.children = [];
    this.position = vec();
    this.rotation = vec();
    this.userData = {};
    this.parent = null;
    this.matrixWorld = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
  }
  add(child) { this.children.push(child); child.parent = this; }
  updateWorldMatrix() {
    let x = this.position.x, y = this.position.y, z = this.position.z;
    let parent = this.parent;
    while (parent) {
      x += parent.position.x;
      y += parent.position.y;
      z += parent.position.z;
      parent = parent.parent;
    }
    this.matrixWorld.elements[12] = x;
    this.matrixWorld.elements[13] = y;
    this.matrixWorld.elements[14] = z;
  }
  getWorldPosition(target) {
    this.updateWorldMatrix(true, false);
    target.setFromMatrixPosition(this.matrixWorld);
    return target;
  }
}
class Group extends Node {}
class Mesh extends Node {
  constructor(geo, mat) { super(); this.geometry = geo; this.material = mat; this.castShadow = false; }
}
const THREE = { Group, Mesh };
const bundle = JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8'));
resetCatalog();
loadCatalog(bundle);
const engine = createAssetEngine({ THREE });
engine.registerProvider('procedural', createBigheadProvider({
  THREE,
  box: (w, h, d) => ({ type: 'box', w, h, d }),
  cylinder: (t, b, h) => ({ type: 'cylinder', t, b, h }),
  material: color => ({ color }),
}));
const player = engine.spawn('character.human.blocky-bighead.v1', { role: 'player', appearanceId: 'appearance.human.player-orange.v1' });
const { headPivot, torsoPivot, hairRoot, rightHandAnchor } = player.rig.pivots;
function findBy(node, pred, acc = []) {
  if (pred(node)) acc.push(node);
  for (const child of node.children || []) findBy(child, pred, acc);
  return acc;
}
const boots = findBy(player.root, n => n.userData?.limbForward === 'front');
assert.equal(boots.length, 2, 'both boots are tagged as front-facing');
assert.ok(boots.every(b => b.position.z <= -0.08), 'toes point toward Front -Z, not the backpack');
const backpack = findBy(player.root, n => n.position?.z === 0.22 && n.geometry?.d === 0.12);
assert.equal(backpack.length, 1, 'backpack stays on +Z (back)');
assert.ok(backpack[0].position.z > 0, 'backpack is opposite the face');
assert.ok(rightHandAnchor.children.some(c => c.position.z < 0), 'held ball sits on the front / -Z side');
assert.equal(headPivot.parent, torsoPivot.parent, 'head and torso are siblings — no double transform');
assert.equal(headPivot.position.y, 1.44);
assert.equal(hairRoot.parent, headPivot, 'hair is a headPivot descendant');
assert.ok(player.root.userData.assetForm === 'blocky-bighead');
assert.doesNotThrow(() => player.anchor('throwOrigin'), 'throwOrigin must survive Three.js getWorldPosition');
assert.doesNotThrow(() => player.anchor('hitText'), 'hitText must survive Three.js getWorldPosition');
const throwOrigin = player.anchor('throwOrigin');
assert.ok(Math.abs(throwOrigin.y - 1.15) > 0.2, 'throwOrigin comes from the right hand, not y+1.15');
assert.equal(throwOrigin.y, rightHandAnchor.position.y + rightHandAnchor.parent.position.y);
const hitText = player.anchor('hitText');
assert.ok(hitText.y > throwOrigin.y, 'hitText sits above the throwing hand');
player.play('hurt', { duration: 0.24 });
player.update(0.12, { moving: false });
const hurtX = torsoPivot.rotation.x;
assert.ok(hurtX !== 0, 'hurt pose tilts the torso');
player.play('throw', { duration: 0.34 });
player.update(0, { moving: false });
assert.equal(torsoPivot.rotation.x, 0, 'animator resets rest before the next action overlay');

console.log('V8.0 BH1 player bighead: PASS');
