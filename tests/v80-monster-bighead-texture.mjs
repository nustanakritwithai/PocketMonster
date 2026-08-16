import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { atlasLayout, assertOrientation, BOX_FACE_INDEX, boxFaceUvCorners } from '../asset-presentation/four-side/uv.mjs';
import { pixelDiffRatio } from '../asset-presentation/four-side/apply.mjs';
import {
  applyMonsterFourSide,
  compileMonsterFourSideAtlas,
  EYE_COLOR,
  getMonsterFourSideTexture,
  MONSTER_FACE_SIZE,
  paintMonsterFace,
  toMonsterHex,
} from '../asset-presentation/monster-texture.mjs';
import { createBigheadMonsterProvider, SLIME_TYPES } from '../asset-presentation/providers/procedural-bighead-monster.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const providerSrc = fs.readFileSync(new URL('../asset-presentation/providers/procedural-bighead-monster.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(js, /monster-.*\.png/, 'gameplay must not load monster PNG faces');
assert.match(providerSrc, /applyMonsterFourSide/, 'provider paints body/head with the monster atlas');
assert.equal(MONSTER_FACE_SIZE, 256);

const check = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('../asset-presentation/monster-texture.mjs', import.meta.url))], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr || 'monster-texture syntax failed');

assert.equal(toMonsterHex(0xef6c32), '#ef6c32');
assert.equal(toMonsterHex('#c3b7a1'), '#c3b7a1');
assert.deepEqual(assertOrientation(atlasLayout()), []);

function countHex(img, hex) {
  const raw = hex.replace('#', '');
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  let n = 0;
  for (let i = 0; i < img.rgba.length; i += 4) {
    if (img.rgba[i] === r && img.rgba[i + 1] === g && img.rgba[i + 2] === b) n += 1;
  }
  return n;
}

const fireFront = paintMonsterFace('front', 'Fire', 0xef6c32);
const fireBack = paintMonsterFace('back', 'Fire', 0xef6c32);
const fireSide = paintMonsterFace('left', 'Fire', 0xef6c32);
const waterFront = paintMonsterFace('front', 'Water', 0x4f87e8);
assert.equal(fireFront.width, 256);
assert.ok(countHex(fireFront, EYE_COLOR) > 80, 'front has painted eyes');
assert.equal(countHex(fireBack, EYE_COLOR), 0, 'back must not copy the face');
assert.equal(countHex(fireSide, EYE_COLOR), 0, 'side must not copy the face');
assert.ok(pixelDiffRatio(fireFront, fireBack) > 0.04, 'front and back are different drawings');
assert.ok(pixelDiffRatio(fireFront, fireSide) > 0.04, 'front and side are different drawings');
assert.ok(pixelDiffRatio(fireFront, waterFront) > 0.04, 'Fire and Water fronts differ');

const fronts = {};
for (const type of SLIME_TYPES) {
  fronts[type] = paintMonsterFace('front', type, 0x888888);
  assert.ok(countHex(fronts[type], EYE_COLOR) > 80, `${type} front keeps eyes`);
  assert.equal(countHex(paintMonsterFace('back', type, 0x888888), EYE_COLOR), 0, `${type} back has no eyes`);
}
for (let i = 0; i < SLIME_TYPES.length; i++) {
  for (let j = i + 1; j < SLIME_TYPES.length; j++) {
    const a = SLIME_TYPES[i];
    const b = SLIME_TYPES[j];
    assert.ok(pixelDiffRatio(fronts[a], fronts[b]) > 0.002, `${a} vs ${b} type marks must differ`);
  }
}

const atlas = compileMonsterFourSideAtlas('Fire', 0xef6c32);
const layout = atlasLayout();
assert.equal(atlas.width, layout.atlas);
assert.equal(atlas.height, layout.atlas);
assert.equal(getMonsterFourSideTexture('Fire', '#ef6c32').width, layout.atlas);

const sharedUv = new Float32Array(48);
const sharedGeo = {
  attributes: { uv: { array: sharedUv, needsUpdate: false } },
  clone() {
    return { attributes: { uv: { array: new Float32Array(48), needsUpdate: false } } };
  },
};
const mesh = {
  geometry: sharedGeo,
  material: { dispose() { this.dead = true; } },
  userData: {},
};
applyMonsterFourSide(mesh, 'Grass', 0x63b34b, { Group: class {}, Mesh: class {} });
assert.equal(mesh.userData.atlasApplied, true);
assert.equal(mesh.material.map.width, layout.atlas);
assert.ok(mesh.geometry !== sharedGeo, 'shared box geometry must be cloned before UV writes');
assert.ok(sharedUv.every(v => v === 0), 'the cached box UV buffer stays untouched');
const frontCorners = boxFaceUvCorners('front', layout);
const frontBase = BOX_FACE_INDEX.front * 8;
assert.equal(mesh.geometry.attributes.uv.array[frontBase], frontCorners[0][0]);
assert.equal(mesh.geometry.attributes.uv.array[frontBase + 1], frontCorners[0][1]);

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
function box(w, h, d) {
  return {
    type: 'box', w, h, d,
    attributes: { uv: { array: new Float32Array(48), needsUpdate: false } },
    clone() { return box(w, h, d); },
  };
}

const provider = createBigheadMonsterProvider({
  THREE: { Group: Node, Mesh },
  box,
  cone: (r, h, seg = 4) => ({ type: 'cone', r, h, seg }),
  torus: (r, t) => ({ type: 'torus', r, t }),
  material: (color, roughness, metalness) => ({ color, roughness, metalness, dispose() {} }),
  basicMaterial: color => ({ color, basic: true, dispose() {} }),
});
const slime = provider({
  def: { form: 'slime', type: 'Fire', color: 0xef6c32, metrics: { scale: 1 } },
  request: { role: 'wild' },
});
const body = findBy(slime.root, n => n.userData.part === 'body')[0];
assert.equal(body.userData.atlasApplied, true);
assert.equal(body.userData.atlasType, 'Fire');
assert.equal(body.material.map.width, layout.atlas);
assert.equal(findBy(slime.root, n => n.userData.part === 'eye')[0].userData.atlasApplied, undefined);

const bird = provider({
  def: { form: 'frostowl', type: 'Ice', color: 0xb8edff, metrics: { silhouette: 'bird' } },
  request: { role: 'wild' },
});
assert.equal(findBy(bird.root, n => n.userData.part === 'body')[0].userData.atlasApplied, true);
assert.equal(findBy(bird.root, n => n.userData.part === 'head')[0].userData.atlasApplied, true);

slime.dispose();
bird.dispose();

console.log('V8.0 monster bighead texture: PASS');
