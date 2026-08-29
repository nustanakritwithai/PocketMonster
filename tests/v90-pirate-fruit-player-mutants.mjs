import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateAssetDefinition, validateBundle } from '../asset-presentation/index.mjs';
import { PIRATE_PRESENTATION_FORBIDDEN } from '../asset-presentation/providers/pirate-fruit-player.mjs';

import { COMBINED_WORLDS, worldById } from '../combined-worlds-v900.mjs';

const liveJs = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const boot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const worldsJs = fs.readFileSync(new URL('../worlds-v900.mjs', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8');
const liveHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cssV900 = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');
const panelsJs = fs.readFileSync(new URL('../control-panels-v900.mjs', import.meta.url), 'utf8');
const versionedHtml = fs.readFileSync(new URL('../v800.html', import.meta.url), 'utf8');
const provider = fs.readFileSync(new URL('../asset-presentation/providers/pirate-fruit-player.mjs', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../asset-presentation/schema.mjs', import.meta.url), 'utf8');
const livingJs = fs.readFileSync(new URL('../world-living-v900.mjs', import.meta.url), 'utf8');
const pirateSource = JSON.parse(fs.readFileSync(new URL('../pirate-fruit-offline/SOURCE.json', import.meta.url), 'utf8'));
const bundle = JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8'));

assert.equal(liveHtml, versionedHtml, 'mutant 0: active V8.4 entry stays byte-identical');
assert.doesNotMatch(liveHtml, /v900\.html|game-v900|worlds-v900|pirate-fruit-offline/, 'mutant 0b: current game version must not point at the combined channel');
assert.match(html, /data-combined-world="pocket-monster"/, 'mutant 0c: V9 gate includes the original game');
assert.match(html, /id="huntBtn"/, 'mutant 0d: V9 keeps the original HUD so game-v800 can boot');
assert.equal(worldById('pocket-monster').runtime, './game-v800.js?v=810', 'mutant 0e: original game runtime is game-v800.js');
assert.equal(worldById('pirate-fruit').runtime, './boot-pirate-fruit-v900.mjs?v=900', 'mutant 0e2: pirate world boots the offline client');
assert.equal(COMBINED_WORLDS.length, 3, 'mutant 0f: V9 is the 3-world combined channel');
assert.match(worldsJs, /import\(world\.runtime\)/, 'mutant 0g: orchestrator imports the selected world');
assert.doesNotMatch(liveJs, /^import \{ createPirateFruitPlayerProvider \} from '\.\/asset-presentation\/providers\/pirate-fruit-player\.mjs';/m, 'mutant 1: V8.4 must not statically import the pirate provider');
assert.match(liveJs, /if\(piratePocketPlayer\)\{\s*const \{ createPirateFruitPlayerProvider \} = await import\('\.\/asset-presentation\/providers\/pirate-fruit-player\.mjs'\);/, 'mutant 1b: pirate provider is gated behind piratePocketPlayer');
assert.match(liveJs, /distance=piratePocketPlayer\?5\.15:7\.4/, 'mutant 1c: live follow distance stays 7.4; pirate Pocket uses a closer cam');
assert.match(schema, /'pirate-fruit'/, 'mutant 2: schema must allow the pirate-fruit provider');
assert.match(boot, /pirate-fruit-offline\/index\.html/, 'mutant 3: pirate world must load the offline Pirate Fruit client');
assert.match(boot, /remote: false/, 'mutant 4: pirate world must be the offline client');
assert.doesNotMatch(boot, /from ['"]three['"]/, 'mutant 5: Pocket boot must not import the three package');
assert.match(liveJs, /assets\.spawn\('character\.human\.blocky-bighead\.v1',\{role:'player'/, 'mutant 6: current version player stays bighead');
assert.match(liveJs, /assets\.spawn\('character\.human\.blocky-bighead\.v1',\{role:'keeper'/, 'mutant 7: current version keeper stays bighead');
assert.match(livingJs, /createPirateFruitPlayerProvider\(/, 'mutant 8: living world may still use the presentation pirate traveler');
assert.doesNotMatch(provider, /mergeGeometries/, 'mutant 9: do not vendor Pirate Fruit BufferGeometryUtils into Pocket presentation');
assert.doesNotMatch(provider, /createMobileMaterial|compactPlayerMaterialsAndMeshes/, 'mutant 10: do not vendor Pirate Fruit PBR compaction into Pocket presentation');

const pirate = bundle.assets.find(a => a.id === 'character.human.pirate-fruit.v1');
assert.ok(pirate, 'mutant 11: catalog asset must exist');
assert.deepEqual(validateAssetDefinition(pirate), []);
assert.deepEqual(validateBundle(bundle), []);
assert.deepEqual(Object.keys(pirate.metrics), ['height', 'head', 'headY']);
for (const field of PIRATE_PRESENTATION_FORBIDDEN) {
  assert.equal(Object.hasOwn(pirate, field), false, `mutant 12: catalog must not own ${field}`);
}

assert.match(provider, /setFromMatrixPosition/, 'mutant 13: worldPos scratch must implement Three.js Vector3.setFromMatrixPosition');
assert.doesNotMatch(boot, /vpsWrites|playerDataWrites/, 'mutant 14: do not open VPS write flags for this pirate boot');
assert.equal(pirateSource.remote, false, 'mutant 15: vendored Pirate Fruit must be the offline build');
assert.match(html, /id="controlPanelSwitcher"/, 'mutant 16: V9 ships the control-panel switcher');
assert.match(html, /id="monsterThrowStage"/, 'mutant 16b: V9 has the pirate throw Pocket stage');
assert.doesNotMatch(liveHtml, /controlPanelSwitcher|data-control-panel|monsterThrowStage/, 'mutant 17: live index.html must not gain V9 control panels');
assert.match(worldsJs, /characterSystem: 'pirate-fruit'/, 'mutant 18: character authority stays Pirate Fruit');
assert.match(worldsJs, /throwSystem: 'pocket-monster'/, 'mutant 19: throw/capture stays Pocket Monster');
assert.match(panelsJs, /pocketMonsterCharacterSystem: 'pending-removal'/, 'mutant 20: Pocket character system is not removed yet');
assert.match(panelsJs, /keepPocketMonsterModel: true/, 'mutant 21: Pocket character models stay');
assert.match(panelsJs, /worldId === 'pocket-monster'\) return THROW_CONTROL_PANEL/, 'mutant 21b: Pocket Monster world cannot open the attack panel');
assert.match(cssV900, /pocket-monster"\] #controlPanelSwitcher \[data-control-panel="human"\]\{display:none/, 'mutant 21c: Pocket Monster world hides the Pirate Fruit attack button');
assert.match(cssV900, /data-control-panel="human".*#huntBtn/s, 'mutant 22: human panel hides throw HUD');
assert.match(cssV900, /#monsterThrowStage\{position:fixed;inset:0;z-index:0/, 'mutant 23: pirate throw stage stays under the Pocket HUD');
assert.doesNotMatch(cssV900, /pirate-fruit"\]\[data-control-panel="throw"\] #joystick/, 'mutant 23b: pirate throw does not hide Pocket movement pads');
assert.doesNotMatch(cssV900, /pirate-fruit"\]\[data-control-panel="throw"\] #huntBtn/, 'mutant 23c: pirate throw keeps hunt for wild animal control');
assert.match(boot, /game-v800\.js\?v=810&animalControl=pirate-fruit/, 'mutant 23d: throw boots a dedicated animal-control instance');
assert.match(liveJs, /POCKETMONSTER_ANIMAL_CONTROL/, 'mutant 23e: Pocket loop publishes animal-control functions');
assert.match(boot, /syncPirateFruitControlHud/, 'mutant 24: pirate boot injects the prototype circular HUD');
const pirateClient = fs.readFileSync(new URL('../pirate-fruit-offline/assets/index-BEToR5oK.js', import.meta.url), 'utf8');
const hudCss = fs.readFileSync(new URL('../pirate-fruit-control-hud-v900.mjs', import.meta.url), 'utf8');
assert.match(hudCss, /content: none !important/, 'mutant 25: desktop rectangular tray is suppressed');
assert.match(pirateClient, /tc-root\.tc-desktop::before/, 'mutant 26: do not rewrite the vendored Pirate Fruit client; overlay it');

console.log('V9.0 pirate-fruit player mutants: PASS');
