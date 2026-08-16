import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadCatalog, resetCatalog } from '../asset-presentation/catalog.mjs';
import { createAssetEngine } from '../asset-presentation/engine.mjs';
import { createBigheadProvider } from '../asset-presentation/providers/procedural-bighead.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(js, /blocky-bighead\.v1',\{role:'player'/, 'Player must spawn as blocky-bighead');
assert.match(js, /legacy-capsule\.v1',\{role:'keeper'/, 'BH1 keeps Keeper on the legacy adapter');
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
  }
  add(child) { this.children.push(child); child.parent = this; }
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
assert.equal(headPivot.parent, torsoPivot.parent, 'head and torso are siblings — no double transform');
assert.equal(headPivot.position.y, 1.44);
assert.equal(hairRoot.parent, headPivot, 'hair is a headPivot descendant');
assert.ok(player.root.userData.assetForm === 'blocky-bighead');
const throwOrigin = player.anchor('throwOrigin');
assert.ok(Math.abs(throwOrigin.y - 1.15) > 0.2, 'throwOrigin comes from the right hand, not y+1.15');
assert.equal(throwOrigin.y, rightHandAnchor.position.y + rightHandAnchor.parent.position.y);
player.play('hurt', { duration: 0.24 });
player.update(0.12, { moving: false });
const hurtX = torsoPivot.rotation.x;
assert.ok(hurtX !== 0, 'hurt pose tilts the torso');
player.play('throw', { duration: 0.34 });
player.update(0, { moving: false });
assert.equal(torsoPivot.rotation.x, 0, 'animator resets rest before the next action overlay');

console.log('V8.0 BH1 player bighead: PASS');
