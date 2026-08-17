import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { resetOwnership } from '../asset-presentation/ownership.mjs';
import { SLIME_TYPES, createBigheadMonsterProvider } from '../asset-presentation/providers/procedural-bighead-monster.mjs';
import {
  BIGHEAD_MARK,
  addBigheadMonsterMarks,
  applyBigheadVisualGrowth,
  isBigheadMonsterRoot,
  markRingScale,
  visualGrowthFactors,
} from '../asset-presentation/monster-mark.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(js, /function addMonsterRing\(/, 'Phase 6 extracts ring/crest onto addMonsterRing');
assert.match(js, /addBigheadMonsterMarks/, 'Bighead uses the box ring/crest helper');
assert.match(js, /applyBigheadVisualGrowth/, 'Bighead training growth writes into the visual pivot');
assert.match(js, /isBigheadMonsterRoot\(g\)/, 'monsterMesh distinguishes Bighead roots from legacy');
assert.match(js, /octahedronGeometry\(\(boss\?\.18:\.13\)\*ringScale\)/, 'legacy fallback keeps the octahedron crest');
assert.match(js, /torusGeometry\(\.58\*ringScale/, 'legacy fallback keeps the torus ring');
assert.match(js, /spiritAura/, 'spirit training still adds a visible aura');

const checkMark = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('../asset-presentation/monster-mark.mjs', import.meta.url))], { encoding: 'utf8' });
assert.equal(checkMark.status, 0, checkMark.stderr || 'monster-mark syntax failed');
const checkGame = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('../game-v800.js', import.meta.url))], { encoding: 'utf8' });
assert.equal(checkGame.status, 0, checkGame.stderr || 'game-v800 syntax failed');

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
    this.name = '';
  }
  add(child) { this.children.push(child); child.parent = this; return this; }
  getObjectByName(name) {
    if (this.name === name) return this;
    for (const child of this.children) {
      const found = child.getObjectByName?.(name);
      if (found) return found;
    }
    return undefined;
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

assert.equal(isBigheadMonsterRoot({ userData: { assetForm: 'blocky-bighead' } }), true);
assert.equal(isBigheadMonsterRoot({ userData: { assetForm: 'flame_wolf' } }), false);
assert.equal(markRingScale({ boss: true, formScale: 1.12, lifeScale: 0.72, bighead: true }), 1.65 * 1.12);
assert.equal(markRingScale({ boss: true, formScale: 1.12, lifeScale: 0.72, bighead: false }), 1.65 * 1.12 * 0.72);
assert.equal(markRingScale({ elite: true, bighead: true, lifeScale: 0.72 }), 1.35);

const factors = visualGrowthFactors({ power: 80, defense: 0, speed: 0, spirit: 40 });
assert.equal(factors.x, 1.06);
assert.equal(factors.y, 1.025);
assert.equal(factors.z, 1.01);
assert.ok(factors.spirit > 0.12);

resetAndSpawn();

function resetAndSpawn() {
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
    def: { form: 'slime', type: 'Fire', color: 0xef6c32 },
    request: { role: 'wild' },
  });
  assert.equal(isBigheadMonsterRoot(slime.root), true);
  const grown = applyBigheadVisualGrowth(slime.root, { training: { power: 80, defense: 0, speed: 0, technique: 0, spirit: 40 } });
  assert.equal(grown.userData.visualGrowth.power, 1);
  assert.equal(slime.rig.pivots.visual.userData.baseScale.x, 1.06);
  slime.update(0.11, { moving: false });
  assert.ok(Math.abs(slime.rig.pivots.visual.scale.x - 1) > 0.02, 'idle squash must keep the trained baseScale');
  assert.ok(slime.rig.pivots.visual.scale.x > 1.0, 'trained Fire slime stays wider than idle-only squash');

  const marks = addBigheadMonsterMarks(slime.root, {
    THREE,
    box: (w, h, d) => ({ type: 'box', w, h, d }),
    basicMaterial: color => ({ color, basic: true, dispose() {} }),
    material: (color, roughness, metalness) => ({ color, roughness, metalness, dispose() {} }),
    owned: true,
    formScale: 1,
  });
  assert.equal(marks.color, 0x60a5fa);
  assert.equal(findBy(slime.root, n => n.userData.part === 'groundRing').length, 4, 'Bighead ring is a square of four boxes');
  assert.equal(findBy(slime.root, n => n.userData.part === 'eliteCrest').length, 0, 'wild owned has no crest');
  assert.equal(findBy(slime.root, n => n.geometry?.type === 'torus' && n.userData.part === 'groundRing').length, 0);
  assert.equal(findBy(slime.root, n => n.userData.part === 'groundRing')[0].geometry.w > 0.9, true);

  const boss = provider({
    def: { form: 'slime', type: 'Dragon', color: 0x6a45d3 },
    request: { role: 'boss', marks: { boss: true } },
  });
  const bossMarks = addBigheadMonsterMarks(boss.root, {
    THREE,
    box: (w, h, d) => ({ type: 'box', w, h, d }),
    basicMaterial: color => ({ color, basic: true, dispose() {} }),
    material: (color, roughness, metalness) => ({ color, roughness, metalness, dispose() {} }),
    boss: true,
    formScale: 1,
  });
  assert.equal(bossMarks.color, 0xf43f5e);
  assert.equal(bossMarks.scale, 1.65);
  const crest = findBy(boss.root, n => n.userData.part === 'eliteCrest')[0];
  assert.ok(crest, 'boss Bighead gets a box crest');
  assert.equal(crest.geometry.type, 'box');
  assert.equal(crest.position.y, BIGHEAD_MARK.bossCrestY);
  assert.equal(crest.castShadow, true);

  const babyScale = markRingScale({ boss: false, formScale: 1.12, lifeScale: 0.72, bighead: true });
  assert.equal(babyScale, 1.12, 'Bighead baby scale lives on the root, not the ring geometry');

  const typeSig = {};
  for (const type of SLIME_TYPES) {
    const handle = provider({
      def: { form: 'slime', type, color: 0x888888 },
      request: { role: 'wild' },
    });
    const deco = findBy(handle.root, n => n.userData.part === 'decoration');
    assert.ok(deco.length >= 1, `${type} slime still has a type mark`);
    const boxes = deco.filter(n => n.geometry?.type === 'box').length;
    const cones = deco.filter(n => n.geometry?.type === 'cone').length;
    const torus = deco.filter(n => n.geometry?.type === 'torus').length;
    const ys = deco.map(n => `${n.position.x.toFixed(2)}:${n.position.y.toFixed(2)}`).sort().join(',');
    typeSig[type] = `${boxes}:${cones}:${torus}:${deco.length}:${ys}`;
    assert.equal(findBy(handle.root, n => n.geometry?.type === 'sphere').length, 0, `${type} stays boxy`);
    handle.dispose();
  }
  const unique = new Set(Object.values(typeSig));
  assert.equal(unique.size, SLIME_TYPES.length, `18 types must stay visually distinct\n${JSON.stringify(typeSig, null, 2)}`);
  assert.notEqual(typeSig.Fire, typeSig.Ice, 'Ice slime has a slab so it is not a Fire clone');
  assert.notEqual(typeSig.Flying, typeSig.Fairy, 'Fairy slime has a gem so it is not a Flying clone');

  slime.dispose();
  boss.dispose();
}

console.log('V8.0 monster bighead polish: PASS');
