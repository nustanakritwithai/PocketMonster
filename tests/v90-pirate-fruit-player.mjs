import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadCatalog, resetCatalog } from '../asset-presentation/catalog.mjs';
import { createAssetEngine } from '../asset-presentation/engine.mjs';
import { ALLOWED_PROVIDERS, validateBundle } from '../asset-presentation/schema.mjs';
import {
  PIRATE_FRUIT_ASSET_FORM,
  PIRATE_FRUIT_PLAYER_ID,
  PIRATE_FRUIT_ROOT_NAME,
  PIRATE_FRUIT_SOURCE,
  PIRATE_PLAYER_PALETTE,
  PIRATE_PRESENTATION_FORBIDDEN,
  createPirateFruitPlayerProvider,
} from '../asset-presentation/providers/pirate-fruit-player.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const providerSrc = fs.readFileSync(new URL('../asset-presentation/providers/pirate-fruit-player.mjs', import.meta.url), 'utf8');
const bundle = JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8'));

const check = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('../asset-presentation/providers/pirate-fruit-player.mjs', import.meta.url))], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr || 'pirate-fruit-player syntax failed');

assert.equal(PIRATE_FRUIT_SOURCE.repo, 'https://github.com/nustanakritwithai/Pirate-fruit-');
assert.equal(PIRATE_FRUIT_SOURCE.visual, 'client/src/art/PiratePlayerVisual.ts');
assert.equal(PIRATE_FRUIT_SOURCE.contract, 'presentation-only');
assert.ok(ALLOWED_PROVIDERS.includes('pirate-fruit'));
assert.doesNotMatch(providerSrc, /from ['"]three['"]/, 'provider must not import the three npm package');
assert.doesNotMatch(providerSrc, /mergeGeometries/, 'do not vendor Pirate Fruit mesh merging');
assert.doesNotMatch(providerSrc, /fruitPower\s*[:=]|vitality\s*[:=]|blade\s*[:=]|mastery\s*[:=]/, 'provider must not copy Pirate Fruit combat stats');
assert.match(js, /createPirateFruitPlayerProvider\(/, 'game registers the pirate-fruit provider');
assert.match(js, /assets\.registerProvider\('pirate-fruit'/, 'pirate-fruit is its own provider name');
assert.match(js, /assets\.spawn\('character\.human\.pirate-fruit\.v1',\{role:'player'/, 'Ranch Hub player spawn is pirate-fruit');
assert.match(js, /assets\.spawn\('character\.human\.blocky-bighead\.v1',\{role:'keeper'/, 'NPCs stay on blocky-bighead');
assert.doesNotMatch(js, /from ['"]three['"]/, 'game still does not import the three npm package');

assert.deepEqual(validateBundle(bundle), []);
const pirate = bundle.assets.find(a => a.id === PIRATE_FRUIT_PLAYER_ID);
assert.ok(pirate, 'catalog includes character.human.pirate-fruit.v1');
assert.equal(pirate.provider, 'pirate-fruit');
assert.equal(pirate.style, 'pirate-fruit-v1');
assert.deepEqual(Object.keys(pirate.roles), ['player']);
for (const field of PIRATE_PRESENTATION_FORBIDDEN) {
  assert.equal(pirate[field], undefined, `catalog must not carry ${field}`);
  assert.equal(pirate.metrics?.[field], undefined, `metrics must not carry ${field}`);
}

function vec() {
  return {
    x: 0, y: 0, z: 0,
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
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
    this.name = '';
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
  constructor(geo, mat) { super(); this.geometry = geo; this.material = mat; this.castShadow = false; }
}
const THREE = { Group: Node, Mesh };

resetCatalog();
loadCatalog(bundle);
const engine = createAssetEngine({ THREE });
engine.registerProvider('pirate-fruit', createPirateFruitPlayerProvider({
  THREE,
  box: (w, h, d) => ({ type: 'box', w, h, d }),
  capsule: (r, l) => ({ type: 'capsule', r, l }),
  sphere: r => ({ type: 'sphere', r }),
  cylinder: (t, b, h) => ({ type: 'cylinder', t, b, h }),
  cone: (r, h) => ({ type: 'cone', r, h }),
  torus: (r, tube) => ({ type: 'torus', r, tube }),
  material: color => ({ color }),
}));

const player = engine.spawn(PIRATE_FRUIT_PLAYER_ID, { role: 'player', appearanceId: 'appearance.human.player-orange.v1' });
assert.equal(player.root.name, PIRATE_FRUIT_ROOT_NAME);
assert.equal(player.root.userData.assetForm, PIRATE_FRUIT_ASSET_FORM);
assert.equal(player.root.userData.pirateFruitSource.repo, PIRATE_FRUIT_SOURCE.repo);

function findBy(node, pred, acc = []) {
  if (pred(node)) acc.push(node);
  for (const child of node.children || []) findBy(child, pred, acc);
  return acc;
}
const named = part => findBy(player.root, n => n.userData?.part === part || n.name === `player:${part}`);
assert.ok(named('bandana').length >= 1, 'bandana is part of the pirate silhouette');
assert.ok(named('beard').length >= 1, 'beard is part of the pirate silhouette');
assert.ok(named('earring').length >= 1, 'brass earring is part of the pirate silhouette');
assert.ok(named('coat').length >= 1, 'coat hull is present');
assert.ok(named('capture-ball').length === 1, 'capture ball sits on the right palm');
assert.equal(named('coat')[0].material.color, PIRATE_PLAYER_PALETTE.coat);
assert.equal(named('bandana')[0].material.color, PIRATE_PLAYER_PALETTE.trim);
assert.equal(named('earring')[0].material.color, PIRATE_PLAYER_PALETTE.brass);

const boots = findBy(player.root, n => n.userData?.limbForward === 'front');
assert.equal(boots.length, 2, 'both boots are tagged as front-facing');
assert.ok(boots.every(b => b.position.z <= -0.04), 'toes point toward Pocket Front -Z');
const ball = named('capture-ball')[0];
assert.ok(ball.position.z < 0, 'held ball sits on the front / -Z side');

const { headPivot, torsoPivot, rightHandAnchor } = player.rig.pivots;
assert.equal(headPivot.parent, torsoPivot.parent, 'head and torso are siblings — no double transform');
assert.equal(headPivot.position.y, 1.52);
assert.doesNotThrow(() => player.anchor('throwOrigin'), 'throwOrigin must survive Three.js getWorldPosition');
assert.doesNotThrow(() => player.anchor('hitText'), 'hitText must survive Three.js getWorldPosition');
const throwOrigin = player.anchor('throwOrigin');
assert.ok(Math.abs(throwOrigin.y - 1.15) > 0.2, 'throwOrigin comes from the right hand, not y+1.15');
assert.equal(throwOrigin.y, rightHandAnchor.position.y + rightHandAnchor.parent.position.y);
const hitText = player.anchor('hitText');
assert.ok(hitText.y > throwOrigin.y, 'hitText sits above the throwing hand');

player.play('hurt', { duration: 0.24 });
player.update(0.12, { moving: false });
assert.ok(torsoPivot.rotation.x !== 0, 'hurt pose tilts the torso');
player.play('throw', { duration: 0.34 });
player.update(0, { moving: false });
assert.equal(torsoPivot.rotation.x, 0, 'animator resets rest before the next action overlay');
player.update(0.05, { moving: true });
assert.ok(player.rig.pivots.leftLegRoot.rotation.x !== 0, 'walk pose swings the legs');

player.setAppearance('appearance.human.player-orange.v1');
assert.equal(player.appearance().id, 'appearance.human.player-orange.v1');
player.dispose();

console.log('V9.0 pirate-fruit player presentation: PASS');
