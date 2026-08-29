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

import {
  COMBINED_VERSION,
  COMBINED_WORLD_COUNT,
  COMBINED_WORLDS,
  worldById,
  worldIdFromLocation,
} from '../combined-worlds-v900.mjs';

const liveJs = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../game-v900.js', import.meta.url), 'utf8');
const worldsJs = fs.readFileSync(new URL('../worlds-v900.mjs', import.meta.url), 'utf8');
const livingJs = fs.readFileSync(new URL('../world-living-v900.mjs', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8');
const liveHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../entry-preload.mjs', import.meta.url), 'utf8');
const preloadV900 = fs.readFileSync(new URL('../entry-preload-v900.mjs', import.meta.url), 'utf8');
const providerSrc = fs.readFileSync(new URL('../asset-presentation/providers/pirate-fruit-player.mjs', import.meta.url), 'utf8');
const bundle = JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8'));

const check = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('../asset-presentation/providers/pirate-fruit-player.mjs', import.meta.url))], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr || 'pirate-fruit-player syntax failed');
for (const file of ['game-v900.js', 'entry-preload-v900.mjs', 'worlds-v900.mjs', 'combined-worlds-v900.mjs', 'world-living-v900.mjs']) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${file}`, import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || `${file} syntax failed`);
}

assert.equal(PIRATE_FRUIT_SOURCE.repo, 'https://github.com/nustanakritwithai/Pirate-fruit-');
assert.equal(PIRATE_FRUIT_SOURCE.visual, 'client/src/art/PiratePlayerVisual.ts');
assert.equal(PIRATE_FRUIT_SOURCE.contract, 'presentation-only');
assert.ok(ALLOWED_PROVIDERS.includes('pirate-fruit'));
assert.doesNotMatch(providerSrc, /from ['"]three['"]/, 'provider must not import the three npm package');
assert.doesNotMatch(providerSrc, /mergeGeometries/, 'do not vendor Pirate Fruit mesh merging');
assert.doesNotMatch(providerSrc, /fruitPower\s*[:=]|vitality\s*[:=]|blade\s*[:=]|mastery\s*[:=]/, 'provider must not copy Pirate Fruit combat stats');
assert.equal(liveHtml.includes('game-v900.js'), false, 'active index.html must not boot the V9 runtime');
assert.match(preload, /game-v800\.js\?v=810/, 'live preload still loads V8.4');
assert.doesNotMatch(preload, /game-v900|worlds-v900/, 'live preload must not import the combined V9 channel');
assert.match(preloadV900, /worlds-v900\.mjs\?v=900/, 'V9.0 preload boots the 3-world orchestrator');
assert.doesNotMatch(preloadV900, /await import\('\.\/game-v900\.js/, 'V9 preload must not skip the world gate');
assert.match(html, /entry-preload-v900\.mjs/, 'v900.html is the separate combined entry');
assert.doesNotMatch(html, /src="\.\/entry-preload\.mjs"/, 'combined page must not use the live V8.4 preload');
assert.doesNotMatch(html, /history\.replaceState/, 'combined page must keep ?world= instead of scrubbing the query');
assert.match(html, /id="worldGate"/, 'combined page has a 3-world gate');
assert.match(html, /data-combined-world="pocket-monster"/, 'gate includes the original game');
assert.match(html, /เกมเดิม/, 'original game is labeled in V9');
assert.match(html, /id="joystick"/, 'original game HUD is present so Ranch Hub can boot');
assert.match(html, /id="huntBtn"/, 'original hunt button is present in V9');
assert.match(html, /ยังไม่รวมเข้าเกม live V8\.4/, 'combined channel stays off the live V8.4 entry');
assert.equal(COMBINED_VERSION, '9.0.0-combined');
assert.equal(COMBINED_WORLD_COUNT, 3);
assert.deepEqual(COMBINED_WORLDS.map(world => world.id), ['pocket-monster', 'pirate-fruit', 'living-world']);
assert.equal(worldById('pocket-monster').runtime, './game-v800.js?v=810');
assert.equal(worldById('pirate-fruit').runtime, './game-v900.js?v=900');
assert.equal(worldById('living-world').runtime, './world-living-v900.mjs?v=900');
assert.equal(worldIdFromLocation({ href: 'https://example.test/v900.html?world=pocket-monster' }), 'pocket-monster');
assert.equal(worldIdFromLocation({ href: 'https://example.test/v900.html' }), null);
assert.match(worldsJs, /includesOriginalGame: true/, 'combined channel records that the original game is inside V9');
assert.match(worldsJs, /mergedIntoLiveV800: false/, 'combined channel is not the live V8.4 entry');
assert.match(worldsJs, /import\(world\.runtime\)/, 'orchestrator boots the selected world runtime');
assert.match(livingJs, /presentationOnly: true/, 'living world is presentation-only');
assert.match(livingJs, /combatAuthority: false/, 'living world is not combat authority');
assert.doesNotMatch(livingJs, /vpsWrites|playerDataWrites/, 'living world must not open VPS write flags');
assert.doesNotMatch(liveJs, /pirate-fruit-player\.mjs/, 'V8.4 live loop does not import the pirate provider');
assert.doesNotMatch(liveJs, /character\.human\.pirate-fruit\.v1/, 'V8.4 Ranch Hub player stays on the current game version');
assert.match(liveJs, /assets\.spawn\('character\.human\.blocky-bighead\.v1',\{role:'player'/, 'current game version still spawns blocky-bighead');
assert.match(js, /NEW_WORLD_ID = 'pirate-fruit-new-world'/, 'pirate module remains a named world inside V9');
assert.match(js, /mergedWithV800: false/, 'pirate module records that it is not merged into live V8.4');
assert.doesNotMatch(js, /Ranch Hub/, 'pirate module must not boot Ranch Hub itself');
assert.match(js, /createPirateFruitPlayerProvider\(/, 'pirate world registers the pirate-fruit provider');
assert.match(js, /assets\.registerProvider\('pirate-fruit'/, 'pirate-fruit is its own provider name');
assert.match(js, /assets\.spawn\('character\.human\.pirate-fruit\.v1'/, 'pirate-world player spawn is pirate-fruit');
assert.doesNotMatch(js, /from ['"]three['"]/, 'pirate world still does not import the three npm package');

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
