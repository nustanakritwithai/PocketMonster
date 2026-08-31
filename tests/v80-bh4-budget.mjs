import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GAMEPLAY_LOCKS } from '../asset-presentation/anchors.mjs';
import { loadCatalog, resetCatalog } from '../asset-presentation/catalog.mjs';
import { createAssetEngine } from '../asset-presentation/engine.mjs';
import { createBigheadProvider } from '../asset-presentation/providers/procedural-bighead.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const versioned = fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8');
assert.equal(html, versioned, 'active entry stays byte-identical');
assert.match(js, /new THREE\.Vector3\(0,1\.36,0\)/, 'camera look target follows the pirate player at y+1.36');
assert.match(js, /distXZ\(player\.position,npc\.position\)<3\.4/);
assert.match(js, /duration:\.55/, 'projectile duration stays 0.55');
assert.match(js, /play\('throw',\{duration:\.34\}\)/);
assert.match(js, /play\('skill',\{duration:\.28\}\)/);
assert.match(js, /play\('hurt',\{duration:\.24\}\)/);
assert.equal(GAMEPLAY_LOCKS.cameraLookY, 1.36);

function vec() {
  return { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
}
class Node {
  constructor() { this.children = []; this.position = vec(); this.rotation = vec(); this.userData = {}; this.parent = null; }
  add(child) { this.children.push(child); child.parent = this; }
  traverse(fn) { fn(this); for (const child of this.children) child.traverse(fn); }
}
class Mesh extends Node {
  constructor(geo, mat) { super(); this.geometry = geo; this.material = mat; }
}
const THREE = { Group: Node, Mesh };
resetCatalog();
loadCatalog(JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8')));
const engine = createAssetEngine({ THREE });
engine.registerProvider('procedural', createBigheadProvider({
  THREE,
  box: (w, h, d) => ({ type: 'box', w, h, d }),
  cylinder: () => ({ type: 'cylinder' }),
  material: color => ({ color }),
}));

function meshCount(handle) {
  let count = 0;
  handle.root.traverse(node => { if (node.geometry) count++; });
  return count;
}

const player = engine.spawn('character.human.blocky-bighead.v1', { role: 'player', appearanceId: 'appearance.human.player-orange.v1' });
const keeper = engine.spawn('character.human.blocky-bighead.v1', { role: 'keeper', appearanceId: 'appearance.human.keeper-green.v1' });
const playerMeshes = meshCount(player);
const keeperMeshes = meshCount(keeper);
assert.ok(playerMeshes <= 20, `player mesh count ${playerMeshes} stays under the 36+10% budget`);
assert.ok(keeperMeshes <= 22, `keeper mesh count ${keeperMeshes} stays under the 35+10% budget`);
assert.ok(playerMeshes + keeperMeshes <= 40, 'combined Player+Keeper meshes stay well under +10% of ~71');

player.play('hurt', { duration: 0.24 });
player.update(0.1, { moving: true });
player.play('throw', { duration: 0.34 });
player.update(0, { moving: false });
assert.equal(player.rig.pivots.torsoPivot.rotation.x, 0);
player.dispose();
player.dispose();
keeper.dispose();

console.log(`V8.0 BH4 acceptance: PASS (playerMeshes=${playerMeshes}, keeperMeshes=${keeperMeshes})`);
