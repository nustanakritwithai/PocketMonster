import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ANIMAL_FORMS,
  createBigheadMonsterProvider,
} from '../asset-presentation/providers/procedural-bighead-monster.mjs';

const providerSrc = fs.readFileSync(new URL('../asset-presentation/providers/procedural-bighead-monster.mjs', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

assert.match(providerSrc, /function addBigheadAnimalDecoration\(/, 'mutant 1: per-form animal decoration helper must exist');
assert.doesNotMatch(providerSrc, /SphereGeometry/, 'mutant 2: form decorations must not reintroduce spheres');
assert.doesNotMatch(providerSrc, /CapsuleGeometry/, 'mutant 3: form decorations must not reintroduce capsules');
assert.doesNotMatch(providerSrc, /CylinderGeometry/, 'mutant 4: ears/muzzles/tails stay boxes or 4-sided cones');
assert.match(providerSrc, /makeCone\(r, h, 4\)|cone\(r, h, 4\)|makeCone\(r \* scale, h \* scale, 4\)/, 'mutant 5: decoration cones stay 4-sided');
assert.match(js, /function makeSpeciesMesh\(/, 'mutant 6: legacy species mesh stays as fallback');
assert.doesNotMatch(js, /from ['"]three['"]/, 'mutant 7: Phase 5 does not import the three package');

for (const form of ANIMAL_FORMS) {
  assert.match(providerSrc, new RegExp(`case '${form}':`), `mutant 8: ${form} has its own decoration branch`);
}

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

function findBy(node, pred, acc = []) {
  if (pred(node)) acc.push(node);
  for (const child of node.children || []) findBy(child, pred, acc);
  return acc;
}

const provider = createBigheadMonsterProvider({
  THREE: { Group: Node, Mesh },
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
assert.equal(
  findBy(slime.root, n => n.userData.formDecoration).length,
  0,
  'mutant 9: slime decorations stay type-based, not animal-form',
);
slime.dispose();

const pup = provider({
  def: { form: 'plainpup', type: 'Normal', color: 0xd9ceb8, metrics: { silhouette: 'quadruped' } },
  request: { role: 'owned' },
});
const owl = provider({
  def: { form: 'frostowl', type: 'Ice', color: 0x79c9c9, metrics: { silhouette: 'bird' } },
  request: { role: 'wild' },
});
const pupDeco = findBy(pup.root, n => n.userData.formDecoration).map(n => n.userData.part).sort().join(',');
const owlDeco = findBy(owl.root, n => n.userData.formDecoration).map(n => n.userData.part).sort().join(',');
assert.notEqual(pupDeco, owlDeco, 'mutant 10: quadruped and bird forms must not share one decoration set');
pup.dispose();
owl.dispose();

console.log('V8.0 monster bighead decoration mutants: PASS');
