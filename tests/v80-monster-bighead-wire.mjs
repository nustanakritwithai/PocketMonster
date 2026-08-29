import assert from 'node:assert/strict';
import fs from 'node:fs';

import { resetCatalog } from '../asset-presentation/catalog.mjs';
import { createAssetEngine } from '../asset-presentation/engine.mjs';
import { resolveMonsterAssetId } from '../asset-presentation/monster-ids.mjs';
import { createBigheadProvider } from '../asset-presentation/providers/procedural-bighead.mjs';
import { createBigheadMonsterProvider } from '../asset-presentation/providers/procedural-bighead-monster.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(js, /from '\.\/asset-presentation\/providers\/procedural-bighead-monster\.mjs'/, 'game imports the monster provider');
assert.match(js, /from '\.\/asset-presentation\/monster-ids\.mjs'/, 'game resolves catalog ids from species + form');
assert.match(js, /preloadBundle\(name,/, 'monster catalogs load through the engine preload API');
assert.match(js, /\['monster-slimes','monster-slimes\.json'\]/, 'slime catalog is preloaded at boot');
assert.match(js, /\['monster-animals','monster-animals\.json'\]/, 'animal catalog is preloaded at boot');
assert.match(js, /assets\.spawn\(resolveMonsterAssetId\(sp\.id,path\?\.form\|\|'slime'\)/, 'monsterMesh tries Bighead spawn first');
assert.match(js, /catch\(err\)\{\s*g=makeSpeciesMesh\(sp,inst\);/, 'unknown or failed spawn falls back to legacy');
assert.match(js, /kind==='monster'\?monsterProvider\(ctx\):humanoidProvider\(ctx\)/, 'procedural dispatcher keeps Player/Keeper on the humanoid provider');
assert.match(js, /createBigheadProvider\(/, 'humanoid Bighead provider stays registered');
assert.match(js, /function makeSlimeMesh\(/, 'legacy slime builder stays');
assert.match(js, /function makeAnimalBase\(/, 'legacy animal builder stays');
assert.match(js, /assets\.spawn\('character\.human\.blocky-bighead\.v1',\{role:'player'/, 'player spawn is unchanged');
assert.match(js, /assets\.spawn\('character\.human\.blocky-bighead\.v1',\{role:'keeper'/, 'keeper spawn is unchanged');
assert.doesNotMatch(js, /from ['"]three['"]/, 'game still does not import the three npm package');

function vec() {
  return {
    x: 0, y: 0, z: 0,
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; },
  };
}
class Node {
  constructor() {
    this.children = [];
    this.position = vec();
    this.rotation = vec();
    this.scale = vec();
    this.scale.set(1, 1, 1);
    this.userData = {};
    this.parent = null;
    this.matrixWorld = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
  }
  add(child) { this.children.push(child); child.parent = this; return this; }
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
    this.updateWorldMatrix();
    target.setFromMatrixPosition(this.matrixWorld);
    return target;
  }
}
class Mesh extends Node {
  constructor(geo, mat) {
    super();
    this.geometry = geo;
    this.material = mat;
    this.castShadow = false;
  }
}
const THREE = { Group: Node, Mesh };

function findBy(node, pred, acc = []) {
  if (pred(node)) acc.push(node);
  for (const child of node.children || []) findBy(child, pred, acc);
  return acc;
}

const humanoid = JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8'));
const slimes = JSON.parse(fs.readFileSync(new URL('../assets/catalog/monster-slimes.json', import.meta.url), 'utf8'));
const animals = JSON.parse(fs.readFileSync(new URL('../assets/catalog/monster-animals.json', import.meta.url), 'utf8'));

resetCatalog();
const engine = createAssetEngine({ THREE });
await engine.preloadBundle('humanoid-core', humanoid);
await engine.preloadBundle('monster-slimes', slimes);
await engine.preloadBundle('monster-animals', animals);

const humanoidProvider = createBigheadProvider({
  THREE,
  box: (w, h, d) => ({ type: 'box', w, h, d }),
  cylinder: (t, b, h) => ({ type: 'cylinder', t, b, h }),
  material: (color, roughness, metalness) => ({ color, roughness, metalness, dispose() {} }),
});
const monsterProvider = createBigheadMonsterProvider({
  THREE,
  box: (w, h, d) => ({ type: 'box', w, h, d }),
  cone: (r, h, seg = 4) => ({ type: 'cone', r, h, seg }),
  torus: (r, t) => ({ type: 'torus', r, t }),
  material: (color, roughness, metalness) => ({ color, roughness, metalness, dispose() {} }),
  basicMaterial: color => ({ color, basic: true, dispose() {} }),
});
engine.registerProvider('procedural', ctx => ctx.def?.kind === 'monster' ? monsterProvider(ctx) : humanoidProvider(ctx));

const player = engine.spawn('character.human.blocky-bighead.v1', {
  role: 'player',
  appearanceId: 'appearance.human.player-orange.v1',
});
assert.equal(player.root.userData.assetForm, 'blocky-bighead');
assert.ok(player.anchor('throwOrigin').y > 0, 'humanoid throwOrigin still works through the dispatcher');

const slime = engine.spawn(resolveMonsterAssetId('flameling'), { role: 'wild' });
assert.equal(slime.root.userData.monsterKind, 'slime');
assert.equal(slime.root.userData.monsterType, 'Fire');
assert.equal(slime.root.userData.monsterForm, 'slime');
assert.ok(findBy(slime.root, n => n.geometry?.type === 'box').length >= 5);
assert.equal(findBy(slime.root, n => n.geometry?.type === 'sphere').length, 0);
assert.ok(findBy(slime.root, n => n.userData.part === 'eye').every(e => e.position.z < 0));

const wolf = engine.spawn(resolveMonsterAssetId('flameling', 'flame_wolf'), { role: 'elite', marks: { elite: true } });
assert.equal(wolf.root.userData.monsterForm, 'flame_wolf');
assert.equal(wolf.root.userData.monsterKind, 'quadruped');
assert.equal(findBy(wolf.root, n => n.userData.part === 'head').length, 1);
assert.equal(findBy(wolf.root, n => n.userData.part === 'leg').length, 4);

const bird = engine.spawn(resolveMonsterAssetId('frostowl', 'frostowl'), { role: 'owned' });
assert.equal(bird.root.userData.monsterKind, 'bird');

const boss = engine.spawn(resolveMonsterAssetId('emberdrake'), { role: 'boss', marks: { boss: true } });
assert.equal(boss.anchor('label').y, 2.55);

let spawned = 0;
for (const def of [...slimes.assets, ...animals.assets]) {
  const handle = engine.spawn(def.id, { role: 'wild' });
  assert.equal(handle.root.userData.assetForm, 'blocky-bighead', def.id);
  assert.equal(findBy(handle.root, n => n.geometry?.type === 'sphere').length, 0, `${def.id} stays boxy`);
  spawned += 1;
  handle.dispose();
}
assert.equal(spawned, 38, 'every catalog row spawns through the dispatcher');

assert.throws(
  () => engine.spawn('monster.missing.nobody.bighead.v1', { role: 'wild' }),
  /unknown asset/,
  'missing catalog ids throw so monsterMesh can fall back to legacy',
);

player.dispose();
slime.dispose();
wolf.dispose();
bird.dispose();
boss.dispose();

console.log('V8.0 monster bighead wire: PASS');
