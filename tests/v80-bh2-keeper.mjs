import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadCatalog, resetCatalog } from '../asset-presentation/catalog.mjs';
import { createAssetEngine } from '../asset-presentation/engine.mjs';
import { createBigheadProvider } from '../asset-presentation/providers/procedural-bighead.mjs';
import { GAMEPLAY_LOCKS } from '../asset-presentation/anchors.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(js, /blocky-bighead\.v1',\{role:'keeper'/);
assert.match(js, /distXZ\(player\.position,npc\.position\)<3\.4/, 'talk radius stays 3.4');
assert.equal(GAMEPLAY_LOCKS.keeperTalkRadius, 3.4);

function vec() {
  return { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
}
class Node {
  constructor() { this.children = []; this.position = vec(); this.rotation = vec(); this.userData = {}; this.parent = null; }
  add(child) { this.children.push(child); child.parent = this; }
}
class Group extends Node {}
class Mesh extends Node {
  constructor(geo, mat) { super(); this.geometry = geo; this.material = mat; }
}
const THREE = { Group, Mesh };
resetCatalog();
loadCatalog(JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8')));
const engine = createAssetEngine({ THREE });
engine.registerProvider('procedural', createBigheadProvider({
  THREE,
  box: (w, h, d) => ({ type: 'box', w, h, d }),
  cylinder: (t, b, h) => ({ type: 'cylinder', t, b, h }),
  material: color => ({ color, emissiveIntensity: 0.22 }),
}));
const keeper = engine.spawn('character.human.blocky-bighead.v1', { role: 'keeper', appearanceId: 'appearance.human.keeper-green.v1' });
assert.equal(keeper.rig.pivots.hatRoot.parent, keeper.rig.pivots.headPivot);
const label = keeper.anchor('label');
const headTop = keeper.anchor('headTop');
assert.ok(label.y > headTop.y, 'keeper label sits above the hat/head bounds');
const staff = keeper.anchor('staffTip');
assert.ok(staff.y > keeper.root.position.y);
keeper.dispose();
keeper.dispose();

console.log('V8.0 BH2 keeper bighead: PASS');
