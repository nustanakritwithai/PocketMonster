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
import {
  applyControlPanel,
  allowedPanelForWorld,
  combinedLocationQuery,
  defaultPanelForWorld,
  panelIdFromLocation,
} from '../control-panels-v900.mjs';
import { PIRATE_FRUIT_CONTROL_HUD_CSS } from '../pirate-fruit-control-hud-v900.mjs';

const liveJs = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const boot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const worldsJs = fs.readFileSync(new URL('../worlds-v900.mjs', import.meta.url), 'utf8');
const livingJs = fs.readFileSync(new URL('../world-living-v900.mjs', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8');
const liveHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cssV900 = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../entry-preload.mjs', import.meta.url), 'utf8');
const preloadV900 = fs.readFileSync(new URL('../entry-preload-v900.mjs', import.meta.url), 'utf8');
const providerSrc = fs.readFileSync(new URL('../asset-presentation/providers/pirate-fruit-player.mjs', import.meta.url), 'utf8');
const pirateOfflineHtml = fs.readFileSync(new URL('../pirate-fruit-offline/index.html', import.meta.url), 'utf8');
const pirateSource = JSON.parse(fs.readFileSync(new URL('../pirate-fruit-offline/SOURCE.json', import.meta.url), 'utf8'));
const bundle = JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8'));

const check = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('../asset-presentation/providers/pirate-fruit-player.mjs', import.meta.url))], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr || 'pirate-fruit-player syntax failed');
for (const file of ['boot-pirate-fruit-v900.mjs', 'entry-preload-v900.mjs', 'worlds-v900.mjs', 'combined-worlds-v900.mjs', 'world-living-v900.mjs', 'control-panels-v900.mjs', 'pirate-fruit-control-hud-v900.mjs']) {
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
assert.equal(worldById('pirate-fruit').runtime, './boot-pirate-fruit-v900.mjs?v=900');
assert.equal(worldById('living-world').runtime, './world-living-v900.mjs?v=900');
assert.equal(worldIdFromLocation({ href: 'https://example.test/v900.html?world=pocket-monster' }), 'pocket-monster');
assert.equal(worldIdFromLocation({ href: 'https://example.test/v900.html' }), null);
assert.match(worldsJs, /includesOriginalGame: true/, 'combined channel records that the original game is inside V9');
assert.match(worldsJs, /mergedIntoLiveV800: false/, 'combined channel is not the live V8.4 entry');
assert.match(worldsJs, /characterSystem: 'pirate-fruit'/, 'V9 character system is Pirate Fruit');
assert.match(worldsJs, /throwSystem: 'pocket-monster'/, 'V9 throw/capture stays Pocket Monster');
assert.match(worldsJs, /combinedLocationQuery\(world\.id, panel\)/, 'world switch keeps the panel except Pocket Monster stays capture-only');
assert.match(worldsJs, /history\.replaceState/, 'panel switch keeps the world loaded and updates ?panel=');
assert.match(worldsJs, /import\(world\.runtime\)/, 'orchestrator boots the selected world runtime');
assert.match(html, /id="controlPanelSwitcher"/, 'V9 has the human/throw control-panel switcher');
assert.match(html, /data-control-panel="human"/, 'switcher includes the Pirate Fruit human panel');
assert.match(html, /data-control-panel="throw"/, 'switcher includes the Pocket throw panel');
assert.match(html, /id="monsterThrowStage"/, 'V9 has a dedicated Pocket animal-control stage for pirate throw');
assert.doesNotMatch(liveHtml, /id="controlPanelSwitcher"|data-control-panel|monsterThrowStage/, 'live V8.4 must not gain the V9 panel switcher or throw stage');
assert.equal(defaultPanelForWorld('pocket-monster'), 'throw');
assert.equal(defaultPanelForWorld('pirate-fruit'), 'human');
assert.equal(defaultPanelForWorld('living-world'), 'human');
assert.equal(panelIdFromLocation({ href: 'https://example.test/v900.html?world=pirate-fruit' }, 'pirate-fruit'), 'human');
assert.equal(panelIdFromLocation({ href: 'https://example.test/v900.html?world=pocket-monster' }, 'pocket-monster'), 'throw');
assert.equal(panelIdFromLocation({ href: 'https://example.test/v900.html?world=pirate-fruit&panel=throw' }, 'pirate-fruit'), 'throw');
assert.equal(panelIdFromLocation({ href: 'https://example.test/v900.html?world=pocket-monster&panel=human' }, 'pocket-monster'), 'throw');
assert.equal(allowedPanelForWorld('pocket-monster', 'human'), 'throw');
assert.equal(allowedPanelForWorld('pirate-fruit', 'throw'), 'throw');
assert.equal(combinedLocationQuery('pirate-fruit', 'throw'), 'world=pirate-fruit&panel=throw');
assert.equal(combinedLocationQuery('pocket-monster', 'bogus'), 'world=pocket-monster&panel=throw');
assert.equal(combinedLocationQuery('pocket-monster', 'human'), 'world=pocket-monster&panel=throw');
assert.match(cssV900, /data-control-panel="human"/, 'human panel CSS hides the throw HUD');
assert.match(cssV900, /data-control-panel="throw"/, 'throw panel CSS can overlay Pocket capture controls');
assert.match(cssV900, /#controlPanelSwitcher/, 'V9 stylesheet positions the panel switcher');
assert.match(PIRATE_FRUIT_CONTROL_HUD_CSS, /\.tc-root\.tc-desktop::before/, 'control HUD overlay targets the desktop rectangular tray');
assert.match(PIRATE_FRUIT_CONTROL_HUD_CSS, /content: none !important/, 'desktop control tray is removed');
assert.match(PIRATE_FRUIT_CONTROL_HUD_CSS, /\.tc-desktop \.tc-jump \{ right: 86px !important; bottom: 82px !important/, 'jump sits in the prototype circular cluster, not a desktop row');
assert.match(PIRATE_FRUIT_CONTROL_HUD_CSS, /\.hud-help \{ display: none !important; \}/, 'desktop keyboard rectangle is not the control HUD');
assert.match(cssV900, /#monsterThrowStage\{position:fixed;inset:0;z-index:0/, 'throw stage stays under the Pocket HUD');
assert.match(cssV900, /pirate-fruit"\]\[data-control-panel="throw"\] #monsterThrowStage\{display:block\}/, 'throw panel reveals the Pocket stage');
assert.match(cssV900, /pirate-fruit"\]\[data-control-panel="throw"\] #game iframe\{visibility:hidden/, 'throw panel keeps the Pirate Fruit iframe loaded but hidden');
assert.match(cssV900, /pirate-fruit"\]\[data-control-panel="throw"\] \.controls-right\{[\s\S]*background:none/, 'throw overlay keeps the circular action cluster, not a rectangular tray');
assert.doesNotMatch(cssV900, /pirate-fruit"\]\[data-control-panel="throw"\] #huntBtn/, 'pirate throw keeps hunt so animal control can leave Ranch');
assert.match(cssV900, /pocket-monster"\] #controlPanelSwitcher \[data-control-panel="human"\]\{display:none/, 'Pocket Monster world hides the Pirate Fruit attack panel');

{
  const humanBtn = { dataset: { controlPanel: 'human' }, current: '', setAttribute(name, value) { if (name === 'aria-current') this.current = value; } };
  const throwBtn = { dataset: { controlPanel: 'throw' }, current: '', setAttribute(name, value) { if (name === 'aria-current') this.current = value; } };
  const hintHidden = new Set(['hidden']);
  const hint = { textContent: '', classList: { remove(name) { hintHidden.delete(name); } } };
  const switcher = { hidden: true, querySelectorAll: () => [humanBtn, throwBtn] };
  globalThis.document = {
    body: { dataset: { combinedWorld: 'pirate-fruit' } },
    getElementById(id) {
      if (id === 'controlPanelSwitcher') return switcher;
      if (id === 'controlPanelHint') return hint;
      return null;
    },
  };
  globalThis.window = globalThis;
  const panel = applyControlPanel('throw', 'pirate-fruit');
  assert.equal(panel.id, 'throw');
  assert.equal(document.body.dataset.controlPanel, 'throw');
  assert.equal(window.POCKETMONSTER_CONTROL_PANEL.characterSystem, 'pirate-fruit');
  assert.equal(window.POCKETMONSTER_CONTROL_PANEL.throwSystem, 'pocket-monster');
  assert.equal(window.POCKETMONSTER_CONTROL_PANEL.pocketMonsterCharacterSystem, 'pending-removal');
  assert.equal(window.POCKETMONSTER_CONTROL_PANEL.keepPocketMonsterModel, true);
  assert.equal(window.POCKETMONSTER_CONTROL_PANEL.animalControl, 'pocket-monster');
  assert.equal(window.POCKETMONSTER_CONTROL_PANEL.animalControlHost, 'pirate-fruit');
  assert.equal(window.POCKETMONSTER_CONTROL_PANEL.attackPanelEnabled, true);
  assert.equal(window.POCKETMONSTER_CONTROL_PANEL.captureOnly, false);
  assert.equal(throwBtn.current, 'page');
  assert.equal(humanBtn.current, 'false');
  assert.ok(hint.textContent.includes('ควบคุมสัตว์'), 'hint says the pirate character uses Pocket animal control');
  assert.equal(hintHidden.has('hidden'), false, 'applyControlPanel reveals the panel hint');
  const locked = applyControlPanel('human', 'pocket-monster');
  assert.equal(locked.id, 'throw');
  assert.equal(document.body.dataset.controlPanel, 'throw');
  assert.equal(window.POCKETMONSTER_CONTROL_PANEL.captureOnly, true);
  assert.equal(window.POCKETMONSTER_CONTROL_PANEL.attackPanelEnabled, false);
  assert.equal(window.POCKETMONSTER_CONTROL_PANEL.animalControlHost, 'pirate-fruit');
  assert.ok(hint.textContent.includes('จับมอน') && hint.textContent.includes('ไม่ใช้แผงโจมตี'), 'Pocket Monster world is capture-only');
}
assert.match(livingJs, /presentationOnly: true/, 'living world is presentation-only');
assert.match(livingJs, /combatAuthority: false/, 'living world is not combat authority');
assert.doesNotMatch(livingJs, /vpsWrites|playerDataWrites/, 'living world must not open VPS write flags');
assert.doesNotMatch(liveJs, /^import \{ createPirateFruitPlayerProvider \} from '\.\/asset-presentation\/providers\/pirate-fruit-player\.mjs';/m, 'V8.4 live loop does not statically import the pirate provider');
assert.match(liveJs, /if\(piratePocketPlayer\)\{\s*const \{ createPirateFruitPlayerProvider \} = await import\('\.\/asset-presentation\/providers\/pirate-fruit-player\.mjs'\);/, 'pirate provider loads only when the pirate player is in the Pocket loop');
assert.match(liveJs, /animalControl'\)==='pirate-fruit'/, 'pirate throw instance is selected by the animalControl query, not by live boot');
assert.match(liveJs, /POCKETMONSTER_COMBINED_BOOT\?\.worldId==='pocket-monster'/, 'V9 Pocket Monster world can host the pirate player without the live query');
assert.match(liveJs, /POCKETMONSTER_ANIMAL_CONTROL/, 'live loop publishes Pocket animal-control functions');
assert.match(liveJs, /piratePocketPlayer\s*\?\s*assets\.spawn\('character\.human\.pirate-fruit\.v1'/, 'V9 Pocket loop can spawn the pirate player');
assert.match(liveJs, /PerspectiveCamera\(piratePocketPlayer\?50:62/, 'pirate Pocket camera is closer than the live V8.4 follow cam');
assert.match(liveJs, /distance=piratePocketPlayer\?5\.15:7\.4/, 'pirate Pocket follow distance sits behind the shoulders, not overhead');
assert.match(liveJs, /if\(piratePocketPlayer\) cameraPitch=\.28/, 'pirate Pocket camera starts lower than the live top-down pitch');
assert.match(liveJs, /assets\.spawn\('character\.human\.blocky-bighead\.v1',\{role:'player'/, 'current game version still spawns blocky-bighead');
assert.match(html, /frame-src 'self'/, 'V9 may iframe the offline Pirate Fruit client');
assert.match(html, /เกม Pirate Fruit ออฟไลน์ทั้งก้อน/, 'gate describes the real offline Pirate Fruit game');
assert.match(boot, /pirate-fruit-offline\/index\.html/, 'pirate world boots the vendored offline client');
assert.match(boot, /iframe/, 'offline Pirate Fruit is loaded as the real client frame');
assert.match(boot, /remote: false/, 'pirate world is the offline client');
assert.match(boot, /syncPirateFruitControlHud/, 'pirate boot injects the prototype circular control HUD');
assert.match(boot, /controlHud: 'circular-cluster'/, 'pirate boot records the circular control HUD');
assert.match(boot, /ensurePocketAnimalControl/, 'pirate boot can load Pocket animal control into throw mode');
assert.match(boot, /game-v800\.js\?v=810&animalControl=pirate-fruit/, 'throw runtime is a dedicated pirate animal-control instance');
assert.match(boot, /POCKETMONSTER_ENSURE_THROW_RUNTIME/, 'throw panel can request the animal-control runtime');
assert.match(boot, /dataset\?\.controlPanel === 'throw'/, 'entering Pirate Fruit already on throw boots animal control immediately');
assert.doesNotMatch(boot, /from ['"]three['"]/, 'Pocket boot module does not import the three npm package');
assert.match(pirateOfflineHtml, /Pirate Fruit/, 'offline client page is the real Pirate Fruit shell');
assert.match(pirateOfflineHtml, /src="\.\/assets\/index-/, 'offline client uses relative Vite assets');
assert.equal(pirateSource.repo, 'https://github.com/nustanakritwithai/Pirate-fruit-');
assert.equal(pirateSource.mode, 'offline');
assert.equal(pirateSource.remote, false);

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
