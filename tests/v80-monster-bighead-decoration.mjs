import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  ANIMAL_FORMS,
  createBigheadMonsterProvider,
} from '../asset-presentation/providers/procedural-bighead-monster.mjs';
import { assertAssetHandle } from '../asset-presentation/handle-contract.mjs';
import { resetOwnership } from '../asset-presentation/ownership.mjs';

const providerPath = new URL('../asset-presentation/providers/procedural-bighead-monster.mjs', import.meta.url);
const check = spawnSync(process.execPath, ['--check', fileURLToPath(providerPath)], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr || 'provider syntax failed');

const providerSrc = fs.readFileSync(providerPath, 'utf8');
assert.match(providerSrc, /function addBigheadAnimalDecoration\(/, 'Phase 5 adds per-form animal decorations');
assert.match(providerSrc, /addBigheadAnimalDecoration\(g, form, scale, color\)/, 'animal factory stamps form decorations');

const animals = JSON.parse(fs.readFileSync(new URL('../assets/catalog/monster-animals.json', import.meta.url), 'utf8'));
assert.equal(ANIMAL_FORMS.length, 20, 'live count is 18 first-evo forms + Flame Wolf + Magma Bear');
assert.deepEqual(ANIMAL_FORMS, animals.assets.map(a => a.form));

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

function partNames(root, part) {
  return findBy(root, n => n.userData.part === part);
}

function decorationSignature(root) {
  const parts = findBy(root, n => n.userData.formDecoration);
  const names = parts.map(p => `${p.userData.part}:${p.geometry?.type}`).sort();
  const visual = root.children[0];
  return `${names.join(',')}|${visual.scale.x.toFixed(2)},${visual.scale.y.toFixed(2)},${visual.scale.z.toFixed(2)}`;
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
  def: { id: 'monster.slime.normalooze.bighead.v1', form: 'slime', type: 'Normal', color: 0xc3b7a1 },
  request: { role: 'wild' },
});
assert.equal(findBy(slime.root, n => n.userData.formDecoration).length, 0, 'slime path does not stamp animal form decorations');
slime.dispose();

const signatures = {};
const handles = [];
for (const rec of animals.assets) {
  const handle = provider({
    def: {
      id: rec.id,
      form: rec.form,
      type: rec.type,
      color: rec.color,
      metrics: rec.metrics,
    },
    request: { role: 'owned' },
  });
  assertAssetHandle(handle);
  handles.push(handle);
  assert.equal(handle.root.userData.monsterForm, rec.form);
  assert.equal(findBy(handle.root, n => n.geometry?.type === 'sphere').length, 0, `${rec.form} stays boxy`);
  const deco = findBy(handle.root, n => n.userData.formDecoration);
  assert.ok(deco.length >= 1, `${rec.form} needs form decorations`);
  assert.ok(deco.every(m => m.castShadow), `${rec.form} decorations cast shadows`);
  const cones = deco.filter(n => n.geometry?.type === 'cone');
  assert.ok(cones.every(c => c.geometry.seg === 4), `${rec.form} cones stay 4-sided`);
  signatures[rec.form] = decorationSignature(handle.root);
}

const unique = new Set(Object.values(signatures));
assert.equal(unique.size, ANIMAL_FORMS.length, `each animal form must have a unique decoration signature\n${JSON.stringify(signatures, null, 2)}`);

assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('plainpup')].root, 'ear').length >= 2);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('plainpup')].root, 'muzzle').length >= 1);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('plainpup')].root, 'tail').length >= 1);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('flameling')].root, 'cheek').length >= 2);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('aquapuff')].root, 'fin').length >= 2);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('voltkit')].root, 'whisker').length >= 4);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('mossbun')].root, 'leaf').length >= 1);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('frostowl')].root, 'ear').length >= 2);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('punchcub')].root, 'paw').length >= 2);
assert.equal(partNames(handles[ANIMAL_FORMS.indexOf('toxitoad')].root, 'paw').length, 4);
{
  const s = handles[ANIMAL_FORMS.indexOf('toxitoad')].rig.pivots.visual.scale;
  assert.equal(s.x, 1.08);
  assert.equal(s.y, 0.92);
  assert.equal(s.z, 1.08);
}
assert.equal(partNames(handles[ANIMAL_FORMS.indexOf('sandmole')].root, 'ear').length, 0);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('galebird')].root, 'crest').length >= 1);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('mindcoon')].root, 'gem').length >= 1);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('buglet')].root, 'shell').length >= 1);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('buglet')].root, 'horn').length >= 1);
assert.equal(partNames(handles[ANIMAL_FORMS.indexOf('rockhorn')].root, 'horn').length, 2);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('ghostpurr')].root, 'ear').length >= 2);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('emberdrake')].root, 'wing').length >= 2);
assert.equal(partNames(handles[ANIMAL_FORMS.indexOf('voidhorn')].root, 'spike').length, 3);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('ironbug')].root, 'shell').length >= 1);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('fairimp')].root, 'wing').length >= 2);
assert.equal(partNames(handles[ANIMAL_FORMS.indexOf('flame_wolf')].root, 'mane').length, 5);
assert.ok(partNames(handles[ANIMAL_FORMS.indexOf('magma_bear')].root, 'plate').length >= 1);
assert.equal(partNames(handles[ANIMAL_FORMS.indexOf('magma_bear')].root, 'paw').length, 4);

const wolf = handles[ANIMAL_FORMS.indexOf('flame_wolf')];
assert.deepEqual(wolf.rig.pivots.visual.userData.baseScale, { x: 0.88, y: 0.98, z: 1.24 });
wolf.play('hurt', { duration: 0.22 });
wolf.update(0.11, { moving: false });
assert.notEqual(wolf.rig.pivots.visual.scale.x, 0.88, 'hurt pose still squashes the wolf');
assert.equal(wolf.rig.pivots.visual.scale.z, 1.24, 'form silhouette scale survives idle/hurt squash');

const bird = handles[ANIMAL_FORMS.indexOf('frostowl')];
assert.equal(partNames(bird.root, 'wing').length, 2, 'frostowl keeps the bird-base wings');
assert.equal(partNames(bird.root, 'beak').length, 1);
const serpent = handles[ANIMAL_FORMS.indexOf('ghostpurr')];
assert.equal(partNames(serpent.root, 'fin').length, 2, 'ghostpurr keeps the serpent-base fins');
assert.equal(partNames(serpent.root, 'leg').length, 0);

for (const handle of handles) handle.dispose();

console.log('V8.0 monster bighead decoration: PASS');
