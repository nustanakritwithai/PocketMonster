import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  BIGHEAD_SLIME_BODY,
  MONSTER_ANCHOR_Y,
  SLIME_TYPES,
  createBigheadMonsterProvider,
} from '../asset-presentation/providers/procedural-bighead-monster.mjs';
import { assertAssetHandle } from '../asset-presentation/handle-contract.mjs';
import { resetOwnership } from '../asset-presentation/ownership.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(js, /function makeSpeciesMesh\(/, 'legacy mesh builders stay as the conversion fallback');
assert.match(js, /createBigheadMonsterProvider/, 'Phase 3 registers the monster provider');

const check = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('../asset-presentation/providers/procedural-bighead-monster.mjs', import.meta.url))], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr || 'provider syntax failed');

function vec() {
  return { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
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
  }
  add(child) { this.children.push(child); child.parent = this; return this; }
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

resetOwnership();
const provider = createBigheadMonsterProvider({
  THREE,
  box: (w, h, d) => ({ type: 'box', w, h, d }),
  cone: (r, h, seg = 4) => ({ type: 'cone', r, h, seg }),
  torus: (r, t) => ({ type: 'torus', r, t }),
  material: (color, roughness, metalness) => ({ color, roughness, metalness, dispose() {} }),
  basicMaterial: color => ({ color, basic: true, dispose() {} }),
});

const slime = provider({
  def: {
    id: 'monster.slime.flameling.bighead.v1',
    form: 'slime',
    type: 'Fire',
    color: 0xef6c32,
    metrics: { scale: 1 },
  },
  request: { role: 'wild' },
});
assertAssetHandle(slime);
assert.equal(slime.root.userData.assetForm, 'blocky-bighead');
assert.equal(slime.root.userData.monsterKind, 'slime');
assert.equal(slime.root.userData.monsterType, 'Fire');

const boxes = findBy(slime.root, n => n.geometry?.type === 'box');
const cones = findBy(slime.root, n => n.geometry?.type === 'cone');
const spheres = findBy(slime.root, n => n.geometry?.type === 'sphere');
assert.equal(spheres.length, 0, 'slime must not use sphere geometry');
assert.ok(boxes.length >= 5, 'slime has box body, eyes, mouth, nub');
assert.equal(cones.length, 3, 'Fire slime has three 4-sided flame cones');
assert.ok(cones.every(c => c.geometry.seg === 4), 'flame cones are 4-sided');

const body = findBy(slime.root, n => n.userData.part === 'body')[0];
assert.equal(body.geometry.w, BIGHEAD_SLIME_BODY.w);
assert.equal(body.geometry.h, BIGHEAD_SLIME_BODY.h);
assert.equal(body.geometry.d, BIGHEAD_SLIME_BODY.d);
assert.equal(body.position.y, BIGHEAD_SLIME_BODY.y);
assert.equal(body.castShadow, true);

const eyes = findBy(slime.root, n => n.userData.part === 'eye');
assert.equal(eyes.length, 2);
assert.ok(eyes.every(e => e.position.z < 0), 'eyes sit on Front -Z');
const mouth = findBy(slime.root, n => n.userData.part === 'mouth')[0];
assert.ok(mouth.position.z < 0, 'mouth sits on Front -Z');

assert.equal(slime.anchor('hitText').y, MONSTER_ANCHOR_Y.hitText);
assert.equal(slime.anchor('label').y, MONSTER_ANCHOR_Y.label);
assert.equal(slime.anchor('feet').y, 0);
slime.root.position.set(3, 0, -4);
assert.equal(slime.anchor('impact').x, 3);
assert.equal(slime.anchor('impact').y, MONSTER_ANCHOR_Y.impact);

slime.play('hurt', { duration: 0.22 });
slime.update(0.11, { moving: false });
assert.notEqual(slime.rig.pivots.visual.scale.x, 1, 'hurt pose squashes the visual root');

assert.equal(SLIME_TYPES.length, 18);
const decoCounts = {};
for (const type of SLIME_TYPES) {
  const handle = provider({
    def: { id: `monster.slime.${type.toLowerCase()}.bighead.v1`, form: 'slime', type, color: 0x888888 },
    request: { role: 'wild' },
  });
  decoCounts[type] = findBy(handle.root, n => n.userData.part === 'decoration').length;
  assert.ok(decoCounts[type] >= 1, `${type} slime needs a type decoration`);
  assert.equal(findBy(handle.root, n => n.geometry?.type === 'sphere').length, 0, `${type} slime stays boxy`);
  handle.dispose();
}
assert.equal(decoCounts.Fire, 3, 'Fire slime has three flame cones');
assert.equal(decoCounts.Water, 2, 'Water slime has two fins');
assert.equal(decoCounts.Dragon, 2, 'Dragon slime has two horns');
assert.notEqual(decoCounts.Fire, decoCounts.Grass, 'type decorations must differ across elements');

const quad = provider({
  def: {
    id: 'monster.plainpup.normalooze.bighead.v1',
    form: 'plainpup',
    type: 'Normal',
    color: 0xd9ceb8,
    metrics: { scale: 1.08, silhouette: 'quadruped' },
  },
  request: { role: 'owned' },
});
assert.equal(quad.root.userData.monsterKind, 'quadruped');
assert.equal(findBy(quad.root, n => n.userData.part === 'head').length, 1);
assert.equal(findBy(quad.root, n => n.userData.part === 'leg').length, 4);
assert.equal(findBy(quad.root, n => n.userData.part === 'nose').length, 1);
assert.ok(findBy(quad.root, n => n.userData.part === 'head')[0].geometry.w > 0.5, 'animal head is oversized (bighead)');
assert.ok(findBy(quad.root, n => n.userData.part === 'eye').every(e => e.position.z < 0));

const bird = provider({
  def: { id: 'monster.frostowl.frostowl.bighead.v1', form: 'frostowl', type: 'Ice', metrics: { silhouette: 'bird' } },
  request: { role: 'wild' },
});
assert.equal(bird.root.userData.monsterKind, 'bird');
assert.equal(findBy(bird.root, n => n.userData.part === 'wing').length, 2);
assert.equal(findBy(bird.root, n => n.userData.part === 'leg').length, 2);
assert.equal(findBy(bird.root, n => n.userData.part === 'beak').length, 1);
assert.equal(findBy(bird.root, n => n.userData.part === 'beak')[0].geometry.seg, 4);

const serpent = provider({
  def: { id: 'monster.ghostpurr.ghostpurr.bighead.v1', form: 'ghostpurr', type: 'Ghost', metrics: { silhouette: 'serpent' } },
  request: { role: 'wild' },
});
assert.equal(serpent.root.userData.monsterKind, 'serpent');
assert.equal(findBy(serpent.root, n => n.userData.part === 'fin').length, 2);
assert.equal(findBy(serpent.root, n => n.userData.part === 'leg').length, 0);

const boss = provider({
  def: { id: 'monster.slime.emberdrake.bighead.v1', form: 'slime', type: 'Dragon' },
  request: { role: 'boss' },
});
assert.equal(boss.anchor('label').y, MONSTER_ANCHOR_Y.bossLabel);

slime.dispose();
slime.dispose();
quad.dispose();
bird.dispose();
serpent.dispose();
boss.dispose();

console.log('V8.0 monster bighead provider: PASS');
