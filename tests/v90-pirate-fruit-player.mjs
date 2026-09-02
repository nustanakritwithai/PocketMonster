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
  COMBINED_WORLD_LINKS,
  DEFAULT_COMBINED_WORLD,
  combinedWorldLinksFrom,
  resolveCombinedWorld,
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
import { PIRATE_FRUIT_CONTROL_HUD_CSS, PIRATE_FRUIT_ORIGINAL_HUD, syncPirateFruitControlHud } from '../pirate-fruit-control-hud-v900.mjs';

const liveJs = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const boot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const worldsJs = fs.readFileSync(new URL('../worlds-v900.mjs', import.meta.url), 'utf8');
const livingJs = fs.readFileSync(new URL('../world-living-v900.mjs', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8');
const liveHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cssV900 = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../entry-preload.mjs', import.meta.url), 'utf8');
const preloadV900 = fs.readFileSync(new URL('../entry-preload-v900.mjs', import.meta.url), 'utf8');
const shellV900 = fs.readFileSync(new URL('../online-world-shell-v900.mjs', import.meta.url), 'utf8');
const providerSrc = fs.readFileSync(new URL('../asset-presentation/providers/pirate-fruit-player.mjs', import.meta.url), 'utf8');
const pirateOfflineHtml = fs.readFileSync(new URL('../pirate-fruit-offline/index.html', import.meta.url), 'utf8');
const pirateBootstrap = fs.readFileSync(new URL('../pirate-fruit-offline/pocket-bootstrap.mjs', import.meta.url), 'utf8');
const pirateSource = JSON.parse(fs.readFileSync(new URL('../pirate-fruit-offline/SOURCE.json', import.meta.url), 'utf8'));
const pirateBundleRef = pirateBootstrap.match(/import\('\.\/(assets\/index-[^']+\.js)'\)/)?.[1];
assert.ok(pirateBundleRef, 'offline Pirate Fruit bootstrap imports its main bundle after save hydration');
const pirateBundle = fs.readFileSync(new URL('../pirate-fruit-offline/' + pirateBundleRef, import.meta.url), 'utf8');
const bundle = JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8'));

const check = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('../asset-presentation/providers/pirate-fruit-player.mjs', import.meta.url))], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr || 'pirate-fruit-player syntax failed');
assert.equal(fs.existsSync(new URL('../world-pirate-fruit-v900.mjs', import.meta.url)), false, 'Pocket-block pirate island stage file is gone');
for (const file of ['boot-pirate-fruit-v900.mjs', 'pirate-fruit-island-map-v900.mjs', 'entry-preload-v900.mjs', 'online-world-bridge-v900.mjs', 'online-world-shell-v900.mjs', 'persistent-fullscreen-v900.mjs', 'scene-entry-v900.mjs', 'worlds-v900.mjs', 'combined-worlds-v900.mjs', 'world-living-v900.mjs', 'control-panels-v900.mjs', 'pirate-player-server.mjs']) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${file}`, import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || `${file} syntax failed`);
}

assert.equal(PIRATE_FRUIT_SOURCE.repo, 'https://github.com/nustanakritwithai/Pirate-fruit-');
assert.equal(PIRATE_FRUIT_SOURCE.visual, 'client/src/art/PiratePlayerVisual.ts');
assert.equal(PIRATE_FRUIT_SOURCE.contract, 'presentation-only');
assert.ok(ALLOWED_PROVIDERS.includes('pirate-fruit'));
assert.doesNotMatch(providerSrc, /from ['"]three['"]/, 'provider must not import the three npm package');
assert.doesNotMatch(providerSrc, /mergeGeometries/, 'do not vendor Pirate Fruit mesh merging');
assert.doesNotMatch(providerSrc, /CapsuleGeometry|geo\.capsule|geo\.sphere|geo\.torus/, 'pirate body uses Pocket boxes, not capsule/sphere silhouette');
assert.doesNotMatch(providerSrc, /fruitPower\s*[:=]|vitality\s*[:=]|blade\s*[:=]|mastery\s*[:=]/, 'provider must not copy Pirate Fruit combat stats');
assert.match(liveHtml, /entry-preload-v900\.mjs/, 'active index.html boots the V9 runtime');
assert.match(preload, /game-v800\.js\?v=818/, 'legacy V8.4 preload remains available for v800.html');
assert.doesNotMatch(preload, /game-v900|worlds-v900/, 'legacy V8.4 preload stays isolated from the combined V9 channel');
assert.match(preloadV900, /prepareLaunch/, 'V9 reuses the proven V8.4 launch-ticket login bootstrap');
assert.match(preloadV900, /online-world-shell-v900.mjs\?v=20/, 'V9 preload cache-busts the persistent 3-world shell after login');
assert.doesNotMatch(preloadV900, /await import\('\.\/game-v900\.js/, 'V9 preload must not skip the world gate');
assert.match(html, /entry-preload-v900\.mjs/, 'v900.html is the separate combined entry');
assert.doesNotMatch(html, /src="\.\/entry-preload\.mjs"/, 'combined page must not use the live V8.4 preload');
assert.match(html, /u\.searchParams\.delete\('ticket'\);u\.searchParams\.delete\('state'\)/, 'launch scrubber removes sensitive query parameters');
assert.match(html, /history\.replaceState\(null,''\,u\.pathname\+u\.search\)/, 'launch scrubber preserves V9 world and panel query parameters');
assert.doesNotMatch(html, /id="worldGate"|id="worldSwitcher"/, 'world picker and clickable world tabs are removed');
assert.match(html, /id="joystick"/, 'original game HUD is present so Ranch Hub can boot');
assert.doesNotMatch(html, /id="huntBtn"|id="warpPrompt"/, 'V9 has no clickable hunt or warp confirmation tab');
assert.match(html, /V9[^<]*live entry/, 'combined V9 channel is the live entry');
assert.match(html, /เริ่มที่โลก Pirate Fruit จริง แล้ววาปเชื่อมเข้าเกมเดิม/, 'login copy says V9 starts in the real Pirate Fruit world');
assert.doesNotMatch(html, /id="pocketWorldWarpBtn"|data-combined-world=/, 'V9 world travel is portal-only');
assert.equal(COMBINED_VERSION, '9.0.1-unified-online-shell');
assert.equal(COMBINED_WORLD_COUNT, 3);
assert.deepEqual(COMBINED_WORLDS.map(world => world.id), ['pocket-monster', 'pirate-fruit', 'living-world']);
assert.equal(worldById('pocket-monster').runtime, './game-v800.js?v=826');
assert.equal(worldById('pirate-fruit').runtime, './boot-pirate-fruit-v900.mjs?v=920');
assert.equal(worldById('living-world').runtime, './world-living-v900.mjs?v=904');
assert.equal(worldIdFromLocation({ href: 'https://example.test/v900.html?world=pocket-monster' }), 'pocket-monster');
assert.equal(worldIdFromLocation({ href: 'https://example.test/v900.html' }), null);
assert.equal(DEFAULT_COMBINED_WORLD, 'pirate-fruit');
assert.equal(resolveCombinedWorld({ href: 'https://example.test/v900.html' }), 'pirate-fruit');
assert.equal(resolveCombinedWorld({ href: 'https://example.test/v900.html?world=pocket-monster' }), 'pocket-monster');
assert.equal(resolveCombinedWorld({ href: 'https://example.test/v900.html?world=living-world' }), 'living-world');
assert.deepEqual(combinedWorldLinksFrom('pirate-fruit').map(link => link.id), ['pirate-to-pocket-monster', 'pirate-to-living-world']);
assert.deepEqual(combinedWorldLinksFrom('pocket-monster').map(link => link.id), ['pocket-monster-to-pirate']);
assert.equal(COMBINED_WORLD_LINKS[0].to, 'pocket-monster');
assert.equal(COMBINED_WORLD_LINKS[0].kind, 'world-link');
assert.match(worldsJs, /includesOriginalGame: true/, 'combined channel records that the original game is inside V9');
assert.match(worldsJs, /mergedIntoLiveV800: false/, 'combined channel is not the live V8.4 entry');
assert.match(worldsJs, /defaultWorld: DEFAULT_COMBINED_WORLD/, 'combined channel starts in Pirate Fruit');
assert.match(worldsJs, /await bootWorld\(resolveCombinedWorld\(\)\)/, 'V9 boots Pirate Fruit when ?world= is missing');
assert.doesNotMatch(worldsJs, /worldGate\?\.classList\.remove\('hidden'\)/, 'V9 no longer waits on the 3-world picker before the first world');
assert.match(worldsJs, /characterSystem: 'pirate-fruit'/, 'V9 character system is Pirate Fruit');
assert.match(worldsJs, /throwSystem: 'pocket-monster'/, 'V9 throw/capture stays Pocket Monster');
assert.match(worldsJs, /switchWorldInDocument\(id, panelOverride = null\)/, 'world switching uses the in-document route controller');
assert.match(worldsJs, /query\.set\('shellRevision', shellRevision\)/, 'hosted world routes preserve the parent scene revision lease');
assert.match(worldsJs, /runtimeLifecycles\.set\(world\.id, window\.POCKETMONSTER_SCENE_LIFECYCLE \|\| null\);[\s\S]*activeRuntimeId = world\.id;/, 'initial scene lifecycle is retained before any in-document route switch');
assert.match(worldsJs, /preparePocketRuntime\(worldById\('pocket-monster'\)\)/, 'Pirate boot prewarms the heavy Pocket runtime before the player reaches its portal');
assert.match(worldsJs, /await preparePocketRuntime\(world\);[\s\S]*applyControlPanel\(panelId, world\.id\)/, 'Pocket scene and controls switch atomically only after its runtime is ready');
assert.match(worldsJs, /POCKETMONSTER_SCENE_MOUNT_TARGET = mountTarget[\s\S]*savedWorldGameNodes\.set\(world\.id, \[\.\.\.mountTarget\.childNodes\]\)/, 'Pocket prewarm builds its canvas off-DOM for an instant mount');
assert.match(liveJs, /POCKETMONSTER_SCENE_MOUNT_TARGET[\s\S]*sceneRuntimeActive=!sceneRuntimePrewarming/, 'Pocket prewarm remains inactive until scene mount');
assert.match(liveJs, /window\.POCKETMONSTER_UNIFIED_MOBILE_CONTROLS\?\.reset\?\.\(reason\);[\s\S]*for\(const code of Object\.keys\(keys\)\)keys\[code\]=false;[\s\S]*window\.dispatchEvent\(new Event\('resize'\)\)/, 'Pocket lifecycle rearms the shared control surface after every scene mount');
assert.match(liveJs, /pirateFruitReturnPortalNeedsExit=false/, 'Pocket return portal has an explicit re-arm state');
assert.match(liveJs, /if\(pirateFruitReturnPortalNeedsExit\)\{[\s\S]*if\(distance>2\.75\)pirateFruitReturnPortalNeedsExit=false/, 'Pocket return portal waits for the player to leave its trigger radius before rearming');
assert.match(liveJs, /unmount:\(\)=>\{pirateFruitReturnPortalBusy=false;pirateFruitReturnPortalNeedsExit=true;return setSceneRuntimeActive\(false\);\}/, 'Pocket return portal resets and rearms safely across repeated scene round trips');
assert.doesNotMatch(liveJs, /\b(?:joyEnd|endCam)\s*\(/, 'Pocket lifecycle cannot call removed legacy pointer helpers');
assert.match(boot, /pirateFrame\.contentWindow\?\.focus\?\.\(\)/, 'Pirate lifecycle restores iframe focus after returning without a document reload');
assert.match(worldsJs, /history\.replaceState/, 'panel switch keeps the world loaded and updates ?panel=');
assert.match(worldsJs, /import\(world\.runtime\)/, 'orchestrator boots the selected world runtime');
assert.match(shellV900, /chat-runtime\.mjs\?v=8\.4\.0-unified-world-shell/, 'persistent shell owns the presence-aware Pocket chat for every world');
assert.match(shellV900, /requestFullscreen: requestPersistentFullscreen/, 'persistent shell owns fullscreen across scene swaps');
assert.match(pirateOfflineHtml, /\.\.\/persistent-fullscreen-v900\.mjs\?v=3/, 'vendored Pirate client delegates fullscreen to the persistent shell before booting');
assert.doesNotMatch(worldsJs, /requireFirebaseLogin/, 'GitHub V9 must use the V8.4 launch session instead of a second Firebase login');
assert.match(html, /id="chatToggleBtn"/, 'V9 ships the player chat toggle outside the HUD');
assert.doesNotMatch(html, /id="controlPanelSwitcher"/, 'human/throw switcher is removed from the game');
assert.match(html, /id="monsterThrowStage"/, 'V9 has a dedicated Pocket animal-control stage for pirate throw');
assert.doesNotMatch(liveHtml, /id="controlPanelSwitcher"/, 'live V9 does not mount the human/throw switcher');
assert.match(liveHtml, /id="monsterThrowStage"/, 'live V9 includes the Pocket throw stage');
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
assert.doesNotMatch(cssV900, /#controlPanelSwitcher/, 'switcher CSS is gone with the control');
assert.match(cssV900, /#recallBtn\.tc-jump\{[^}]*bottom:2px/, 'jump sits on the bottom edge');
assert.match(cssV900, /#summonBtn\.tc-dash\{[^}]*right:2px/, 'dash sits on the right edge');
assert.match(cssV900, /--arc-right:42px/, 'attack sits against dash and jump');
assert.match(cssV900, /#skill1Btn\.tc-skill1\{[^}]*right:4px/, 'skill 1 sits on the right edge');
assert.match(cssV900, /#skill4Btn\.tc-ult\{[^}]*bottom:2px/, 'ult sits on the bottom edge');
assert.match(PIRATE_FRUIT_CONTROL_HUD_CSS, /data-pirate-hud="pirate-primary-parent"/, 'iframe uses the Pirate-primary parent control surface');
assert.match(PIRATE_FRUIT_CONTROL_HUD_CSS, /\.tc-root[\s\S]*visibility: hidden !important/, 'vendored touch HUD is not visible');
assert.match(PIRATE_FRUIT_CONTROL_HUD_CSS, /pointer-events: none !important/, 'vendored touch HUD cannot steal parent touches');
assert.equal(PIRATE_FRUIT_ORIGINAL_HUD, false, 'V9 parent HTML is the only mobile control chrome');
{
  const sent = [];
  const frame = { contentWindow: { postMessage(message, origin) { sent.push({ message, origin }); } } };
  assert.equal(syncPirateFruitControlHud(frame), true);
  assert.deepEqual(sent, [{
    message: { type: 'pocketmonster:pirate-control-v1', panel: 'human' },
    origin: '*',
  }]);
}
assert.match(cssV900, /#monsterThrowStage\{position:fixed;inset:0;z-index:0/, 'throw stage stays under the Pocket HUD');
assert.match(cssV900, /pirate-fruit"\]\[data-control-panel="throw"\] #monsterThrowStage\{display:block\}/, 'throw panel reveals the Pocket stage');
assert.match(cssV900, /#pirateFruitFrame\{position:absolute;inset:0/, 'offline Pirate Fruit frame fills the game stage');
assert.match(cssV900, /throw"\] #pirateFruitFrame\{visibility:hidden/, 'throw panel hides the real Pirate Fruit frame');
assert.match(cssV900, /pirate-fruit"\]\[data-control-panel="human"\] \.message/, 'human pirate panel hides leftover Pocket stage message chrome');
assert.doesNotMatch(cssV900, /\.combined-world-warp|#worldSwitcher/, 'clickable world warp controls have no live CSS');
assert.match(cssV900, /#pirateUnifiedControls \.controls-right\.tc-actions\{[^}]*background:none/, 'the shared Pirate control surface keeps a circular action cluster, not a rectangular tray');
assert.doesNotMatch(cssV900, /pirate-fruit"\]\[data-control-panel="throw"\] #huntBtn/, 'pirate throw keeps hunt so animal control can leave Ranch');
assert.doesNotMatch(cssV900, /pocket-monster"\] #controlPanelSwitcher/, 'Pocket Monster world has no human/throw switcher');

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
  assert.equal(window.POCKETMONSTER_CONTROL_PANEL.pocketMonsterCharacterSystem, 'removed');
  assert.equal(window.POCKETMONSTER_CONTROL_PANEL.keepPocketMonsterModel, false);
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
assert.match(liveJs, /const \{ createPirateFruitPlayerProvider \} = await import\('\.\/asset-presentation\/providers\/pirate-fruit-player\.mjs'\);/, 'pirate provider always loads dynamically for the live player');
assert.match(liveJs, /animalControl'\)==='pirate-fruit'/, 'pirate throw instance is selected by the animalControl query, not by live boot');
assert.match(liveJs, /POCKETMONSTER_ANIMAL_CONTROL/, 'live loop publishes Pocket animal-control functions');
assert.match(liveJs, /assets\.spawn\('character\.human\.pirate-fruit\.v1',\{role:'player'/, 'live player is the pirate character');
assert.doesNotMatch(liveJs, /assets\.spawn\('character\.human\.blocky-bighead\.v1',\{role:'player'/, 'Pocket Monster player model is no longer spawned');
assert.match(liveJs, /PerspectiveCamera\(50,/, 'pirate follow camera uses FOV 50');
assert.match(liveJs, /distance=5\.15/, 'pirate follow distance sits behind the shoulders, not overhead');
assert.match(liveJs, /cameraPitch=\.28/, 'pirate camera starts lower than the old top-down pitch');
assert.match(liveJs, /new THREE\.Vector3\(0,1\.36,0\)/, 'camera looks at the pirate chest, not the old bighead look-at');
assert.match(liveJs, /hostCharacter:'pirate-fruit'/, 'animal control is hosted on the pirate player');
assert.match(liveJs, /playerCharacterServer:'pirate-fruit'/, 'Pocket character server APIs are hosted on the pirate player');
assert.match(liveJs, /from '\.\/pirate-player-server\.mjs'/, 'live loop rebinds Pocket character server functions onto pirate');
assert.match(html, /เริ่มที่โลก Pirate Fruit จริง/, 'gate describes the real Pirate Fruit client');
assert.match(boot, /pirate-fruit-offline\/index\.html/, 'pirate world boots the vendored Pirate Fruit client');
assert.match(boot, /source: 'pirate-fruit-offline'/, 'pirate world is the real offline Pirate Fruit client');
assert.match(boot, /id = 'pirateFruitFrame'/, 'pirate world mounts the offline client in a frame');
assert.match(boot, /remote: false/, 'pirate world is local, not a remote Pirate Fruit host');
assert.match(boot, /presentationOnly: true/, 'pirate frame is presentation-only for Pocket combat');
assert.match(boot, /combatAuthority: false/, 'pirate frame is not Pocket combat authority');
assert.match(boot, /ensurePocketAnimalControl/, 'pirate boot can load Pocket animal control into throw mode');
assert.match(boot, /game-v800\.js\?v=826&animalControl=pirate-fruit/, 'throw runtime is a dedicated pirate animal-control instance');
assert.match(cssV900, /compact-topbar[\s\S]*display:none!important/, 'V9 removes the top status bar');
assert.match(cssV900, /zone-travel\{display:none!important\}/, 'V9 removes the location travel bar');
assert.match(boot, /POCKETMONSTER_ENSURE_THROW_RUNTIME/, 'throw panel can request the animal-control runtime');
assert.match(boot, /dataset\?\.controlPanel === 'throw'/, 'entering Pirate Fruit already on throw boots animal control immediately');
assert.match(boot, /event\.source !== frame\.contentWindow/, 'parent accepts portal messages only from the mounted Pirate Fruit frame');
assert.match(boot, /frameUrl\.searchParams\.set\('parentOrigin', location\.origin\)/, 'parent origin is passed into the Pirate Fruit frame');
assert.match(boot, /frame\.setAttribute\('sandbox', 'allow-scripts allow-pointer-lock allow-fullscreen'\)/, 'nested Pirate Fruit runs in an opaque-origin sandbox');
assert.doesNotMatch(boot, /allow-same-origin/, 'nested Pirate Fruit cannot read the scene session or shared storage');
assert.match(boot, /event\.origin !== 'null'/, 'parent accepts portal messages only from the mounted opaque-origin frame');
assert.match(boot, /pocketmonster:world-warp-v1/, 'parent binds the in-world portal message contract');
assert.doesNotMatch(boot, /from ['"]three['"]/, 'Pocket boot module does not import the three npm package');
assert.doesNotMatch(boot, /world-pirate-fruit-v900|paintGroundGrid|PIRATE_BLOCK_WORLD/, 'pirate world does not boot or keep the Pocket-block island stage');
{
  const serverGate = fs.readFileSync(new URL('../docs/v9-334-server-gate-response.md', import.meta.url), 'utf8');
  assert.match(serverGate, /presentationOnly=true/, 'Server gate response records the pirate iframe as presentation-only');
  assert.match(serverGate, /combatAuthority=false/, 'Server gate response keeps Pirate Fruit combat off Server');
  assert.match(serverGate, /vpsWrites=false/, 'Server gate response keeps write flags closed');
  assert.doesNotMatch(serverGate, /vpsWrites=true|playerDataWrites=true|firebaseFallback=true/, 'Server gate response must not ask Server to open writes');
}
assert.match(pirateOfflineHtml, /Pirate Fruit/, 'offline client page remains vendored for later use');
assert.match(pirateBootstrap, /import\('\.\/assets\/index-/, 'offline bootstrap imports the relative playable Vite bundle');
assert.match(pirateOfflineHtml, /src="\.\/pocket-presentation\.mjs\?v=5"/, 'offline client cache-busts and loads the Pocket visual hook before the save bootstrap');
assert.ok(
  pirateOfflineHtml.indexOf('pocket-presentation.mjs') < pirateOfflineHtml.indexOf('pocket-bootstrap.mjs'),
  'Pocket visual hook is listed before the save bootstrap that loads the real Pirate Fruit bundle',
);
assert.equal(fs.existsSync(new URL('../asset-presentation/scenes/pirate-fruit-world.mjs', import.meta.url)), false, 'Pocket-built pirate island scene is gone');
assert.match(boot, /visual: 'pocket-asset-engine'/, 'pirate boot records Pocket presentation overlays');
assert.match(boot, /ui: 'pirate-fruit-parent-primary'/, 'pirate boot uses the Pirate Fruit parent control HUD');
assert.match(boot, /syncPirateFruitControlHud/, 'pirate boot disables the iframe touch HUD');
assert.doesNotMatch(cssV900, /pirate-fruit"\]\[data-control-panel="human"\] #hud,/, 'parent HUD container stays mounted so its shared controls remain interactive');
assert.equal(pirateSource.repo, 'https://github.com/nustanakritwithai/Pirate-fruit-');
assert.equal(pirateSource.mode, 'offline');
assert.equal(pirateSource.remote, false);
assert.equal(pirateSource.pocketPresentation.visual, 'pocket-asset-engine');
assert.equal(pirateSource.pocketPresentation.createsStage, false);
assert.equal(pirateSource.pocketPresentation.player, 'character.human.pirate-fruit.v1');
assert.equal(pirateSource.pocketPresentation.ui, 'pirate-fruit-parent-primary');
assert.equal(pirateSource.commit, 'fa71c41fa50edba67609d90ae2d5418455817c00');
assert.equal(pirateSource.integrations.pocketMonsterPresence.contract, 'presentation-only');
assert.equal(pirateSource.integrations.pocketMonsterPresence.zone, 'pirate-fruit');
assert.equal(pirateSource.integrations.pocketMonsterPresence.transport, 'existing-parent-chat-websocket');
assert.equal(pirateSource.integrations.pocketMonsterPresence.persistentWrites, false);
assert.equal(pirateSource.integrations.pocketMonsterPresence.collision, false);
assert.equal(pirateSource.integrations.pocketMonsterPresence.combatAuthority, false);
assert.equal(pirateSource.integrations.pocketMonsterPortal.contract, 'presentation-only');
assert.equal(pirateSource.integrations.pocketMonsterPortal.combatAuthority, false);
assert.deepEqual(pirateSource.integrations.pocketMonsterPortal.position, { x: 7, z: 15 });
assert.deepEqual(pirateSource.integrations.pocketMonsterPortal.safeArrival, { x: 7, z: 11.5, heading: 0 });
assert.equal(pirateSource.integrations.pocketMonsterPortal.arrivalLock, 'exit-before-rearm');
assert.deepEqual(pirateSource.integrations.livingWorldPortal.safeArrival, { x: -7, z: 11.5, heading: 0 });
assert.equal(pirateSource.integrations.livingWorldPortal.arrivalLock, 'exit-before-rearm');
assert.match(pirateBundle, /pocketmonster:world-warp-v1/, 'Pirate Fruit bundle emits the Pocket Monster portal event');
assert.match(pirateBundle, /pocket-monster-world-portal/, 'Pirate Fruit bundle contains the in-world portal object');
assert.match(pirateBundle, /observedOutside/, 'Pirate portals stay disarmed until the player leaves the trigger');
assert.match(pirateBundle, /safeArrival:Object\.freeze\(\{x:7,z:11\.5,heading:0\}\)/, 'Pocket portal restores stale saves to its safe approach point');
assert.match(pirateBundle, /safeArrival:Object\.freeze\(\{x:-7,z:11\.5,heading:0\}\)/, 'Living portal restores stale saves to its safe approach point');
assert.match(pirateBundle, /new URLSearchParams\(window\.location\.search\)\.get\("parentOrigin"\)\|\|window\.location\.origin/, 'Pirate portals target the hosting parent origin');
assert.match(pirateBundle, /pocketmonster:pirate-presence-v1/, 'Pirate iframe publishes its real local pose to the parent');
assert.match(pirateBundle, /pocketmonster:pirate-presence-snapshot-v1/, 'Pirate iframe consumes sanitized parent snapshots');

assert.deepEqual(validateBundle(bundle), []);
const pirate = bundle.assets.find(a => a.id === PIRATE_FRUIT_PLAYER_ID);
assert.ok(pirate, 'catalog includes character.human.pirate-fruit.v1');
assert.equal(pirate.provider, 'pirate-fruit');
assert.equal(pirate.style, 'pirate-fruit-v1');
assert.equal(pirate.surfaceStyle, 'four-side-block-v1');
assert.equal(pirate.rig, 'humanoid-rig-v1');
assert.deepEqual(pirate.metrics, { height: 1.8, head: [0.64, 0.72, 0.56], headY: 1.44 });
const bighead = bundle.assets.find(a => a.id === 'character.human.blocky-bighead.v1');
assert.deepEqual(pirate.metrics, bighead.metrics, 'pirate player shares Pocket humanoid metrics');
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
    this.matrixWorld = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
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
assert.ok(named('head').length === 1, 'head is a Pocket box');
for (const part of ['head', 'coat', 'bandana', 'beard', 'earring', 'capture-ball', 'hips']) {
  assert.ok(named(part).every(mesh => mesh.geometry?.type === 'box'), `${part} is a box primitive`);
}

const boots = findBy(player.root, n => n.userData?.limbForward === 'front');
assert.equal(boots.length, 2, 'both boots are tagged as front-facing');
assert.ok(boots.every(b => b.position.z <= -0.04), 'toes point toward Pocket Front -Z');
const ball = named('capture-ball')[0];
assert.ok(ball.position.z < 0, 'held ball sits on the front / -Z side');

const { headPivot, torsoPivot, rightHandAnchor } = player.rig.pivots;
assert.deepEqual(
  [
    player.rig.pivots.hipsPivot,
    torsoPivot,
    headPivot,
    player.rig.pivots.leftArmRoot,
    player.rig.pivots.rightArmRoot,
    player.rig.pivots.leftLegRoot,
    player.rig.pivots.rightLegRoot,
  ].map(pivot => pivot.name),
  [
    'pocket-rig:hips',
    'pocket-rig:torso',
    'pocket-rig:head',
    'pocket-rig:left-arm',
    'pocket-rig:right-arm',
    'pocket-rig:left-leg',
    'pocket-rig:right-leg',
  ],
  'major target pivots expose stable retargeting names',
);
assert.equal(player.rig.pivots.rightHandPivot, rightHandAnchor, 'right hand exposes a stable pivot alias');
assert.equal(player.rig.pivots.leftLowerLegPivot, player.rig.pivots.leftLegRoot, 'left lower leg exposes a stable pivot alias');
assert.equal(headPivot.parent, torsoPivot.parent, 'head and torso are siblings — no double transform');
assert.equal(headPivot.position.y, 1.44);
assert.equal(player.rig.pivots.leftArmRoot.position.y, 1.02);
assert.equal(player.rig.pivots.leftArmRoot.position.x, -0.25);
assert.equal(torsoPivot.position.y, 0.88);
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
player.update(0.12, { locomotion: 'idle' });
assert.ok(Math.abs(torsoPivot.rotation.x) < 1e-12, 'hurt flinch returns to rest when its pose completes');
player.play('throw', { duration: 0.34 });
player.update(0, { moving: false });
assert.equal(torsoPivot.rotation.x, 0, 'animator resets rest before the next action overlay');
player.play('attack-melee', { duration: 0.4 });
player.update(0.2, { locomotion: 'idle' });
assert.notEqual(torsoPivot.rotation.y, 0, 'melee attack twists the torso');
assert.notEqual(player.rig.pivots.rightArmRoot.rotation.z, 0, 'melee attack drives a right-arm slash arc');
player.play('attack-ranged', { duration: 0.4 });
player.update(0.2, { locomotion: 'idle' });
assert.ok(player.rig.pivots.rightArmRoot.rotation.x < -0.5, 'ranged attack raises the right arm to aim forward');
assert.notEqual(player.rig.pivots.rightArmRoot.position.z, -0.02, 'ranged attack adds visible recoil at the shoulder');
assert.equal(torsoPivot.rotation.y > 0, true, 'ranged aim braces the torso opposite the melee twist');
player.play('skill', { duration: 0.4 });
player.update(0.2, { locomotion: 'idle' });
assert.ok(player.rig.pivots.rightArmRoot.rotation.x < -0.5, 'skill retains a strong right-arm cast or punch');
assert.notEqual(player.rig.pivots.leftArmRoot.rotation.z, 0, 'skill has a distinct two-arm casting silhouette');
const skillPose = {
  torsoX: torsoPivot.rotation.x,
  leftArmZ: player.rig.pivots.leftArmRoot.rotation.z,
  rightArmX: player.rig.pivots.rightArmRoot.rotation.x,
};
player.update(0, { locomotion: 'idle' });
assert.deepEqual({
  torsoX: torsoPivot.rotation.x,
  leftArmZ: player.rig.pivots.leftArmRoot.rotation.z,
  rightArmX: player.rig.pivots.rightArmRoot.rotation.x,
}, skillPose, 'reapplying the same frame starts from rest and does not accumulate pose drift');
player.update(0.05, { moving: true });
assert.ok(player.rig.pivots.leftLegRoot.rotation.x !== 0, 'moving:true remains a backward-compatible walk');
player.update(0.05, { locomotion: 'walk' });
assert.ok(player.rig.pivots.leftLegRoot.rotation.x !== 0, 'explicit walk locomotion swings the legs');
player.update(0, { locomotion: 'idle' });
assert.equal(player.rig.pivots.leftLegRoot.rotation.x, 0, 'explicit idle locomotion resets the leg pose');
player.update(0.05, { locomotion: 'idle', moving: true });
assert.equal(player.rig.pivots.leftLegRoot.rotation.x, 0, 'explicit idle locomotion overrides the legacy moving flag');

const walkPlayer = engine.spawn(PIRATE_FRUIT_PLAYER_ID, { role: 'player', appearanceId: 'appearance.human.player-orange.v1' });
const runPlayer = engine.spawn(PIRATE_FRUIT_PLAYER_ID, { role: 'player', appearanceId: 'appearance.human.player-orange.v1' });
walkPlayer.update(0.05, { locomotion: 'walk' });
runPlayer.update(0.05, { locomotion: 'run' });
assert.ok(
  Math.abs(runPlayer.rig.pivots.leftLegRoot.rotation.x) > Math.abs(walkPlayer.rig.pivots.leftLegRoot.rotation.x),
  'run advances faster and swings the legs farther than walk',
);
assert.ok(
  Math.abs(runPlayer.rig.pivots.leftArmRoot.rotation.x) > Math.abs(walkPlayer.rig.pivots.leftArmRoot.rotation.x),
  'run swings the arms farther than walk',
);
walkPlayer.dispose();
runPlayer.dispose();

const deadPlayer = engine.spawn(PIRATE_FRUIT_PLAYER_ID, { role: 'player', appearanceId: 'appearance.human.player-orange.v1' });
deadPlayer.play('dead');
deadPlayer.update(0.1, { locomotion: 'run' });
assert.notEqual(deadPlayer.rig.pivots.torsoPivot.rotation.z, 0, 'dead pose presents a collapsed torso');
assert.equal(
  deadPlayer.rig.pivots.leftLegRoot.rotation.x,
  deadPlayer.rig.pivots.rightLegRoot.rotation.x,
  'dead pose suppresses alternating locomotion leg swing',
);
const collapsed = {
  torsoZ: deadPlayer.rig.pivots.torsoPivot.rotation.z,
  hipsY: deadPlayer.rig.pivots.hipsPivot.position.y,
  leftLegX: deadPlayer.rig.pivots.leftLegRoot.rotation.x,
};
deadPlayer.play('attack-melee', { duration: 0.2 });
deadPlayer.update(1, { locomotion: 'run' });
assert.deepEqual({
  torsoZ: deadPlayer.rig.pivots.torsoPivot.rotation.z,
  hipsY: deadPlayer.rig.pivots.hipsPivot.position.y,
  leftLegX: deadPlayer.rig.pivots.leftLegRoot.rotation.x,
}, collapsed, 'dead is highest priority and holds a stable collapsed pose');
for (const forcedAction of ['skill', 'hurt', 'attack-melee']) {
  deadPlayer.play(forcedAction, { force: true, duration: 0.2 });
  deadPlayer.update(0.1, { locomotion: 'idle' });
  assert.deepEqual({
    torsoZ: deadPlayer.rig.pivots.torsoPivot.rotation.z,
    hipsY: deadPlayer.rig.pivots.hipsPivot.position.y,
    leftLegX: deadPlayer.rig.pivots.leftLegRoot.rotation.x,
  }, collapsed, `forced ${forcedAction} cannot recover a dead handle`);
}
deadPlayer.play('idle', { force: true });
deadPlayer.update(0, { locomotion: 'idle' });
assert.equal(deadPlayer.rig.pivots.torsoPivot.rotation.z, 0, 'forced idle recovers a reused handle from dead');
assert.equal(deadPlayer.rig.pivots.hipsPivot.position.y, 0.60, 'forced idle restores the hips rest pose');
deadPlayer.dispose();

player.setAppearance('appearance.human.player-orange.v1');
assert.equal(player.appearance().id, 'appearance.human.player-orange.v1');
player.dispose();

console.log('V9.0 pirate-fruit player presentation: PASS');
