import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const boot = read('boot-pirate-fruit-v900.mjs');
const combined = read('combined-worlds-v900.mjs');
const entry = read('entry-preload-v900.mjs');
const sceneHtml = read('scene-v900.html');
const offlineHtml = read('pirate-fruit-offline/index.html');
const bootstrap = read('pirate-fruit-offline/pocket-bootstrap.mjs');
const presentation = read('pirate-fruit-offline/pocket-presentation.mjs');
const pirateHud = read('pirate-fruit-control-hud-v900.mjs');
const npcNameInteraction = read('pirate-npc-name-interaction-v900.mjs');
const build = read('scripts/build-github-pages.mjs');
const packageJson = JSON.parse(read('package.json'));

assert.match(offlineHtml, /src="\.\/pocket-bootstrap\.mjs\?v=1"/, 'offline HTML loads the save-aware bootstrap');
assert.doesNotMatch(offlineHtml, /<script[^>]+src="\.\/assets\/index-C3SJLfq8\.js"/, 'vendored bundle is never started before save hydration');
const hydrateIndex = bootstrap.indexOf('await installPirateSaveSandbox');
const bundleIndex = bootstrap.indexOf("await import('./assets/index-C3SJLfq8.js')");
assert.ok(hydrateIndex >= 0 && bundleIndex > hydrateIndex, 'sandbox storage installs before the real Pirate bundle executes');
assert.match(bootstrap, /pirate-save-bridge-v900\.mjs\?v=1/, 'bootstrap cache-busts the save bridge');

assert.match(boot, /bindPirateSaveHost/, 'parent owns the isolated Pirate save persistence host');
assert.match(boot, /pirate-save-bridge-v900\.mjs\?v=1/, 'parent cache-busts the save bridge');
assert.match(boot, /pirate-fruit-control-hud-v900\.mjs\?v=4/, 'parent boot cache-busts the integrated child HUD retirement contract');
assert.match(boot, /pirate-npc-name-interaction-v900\.mjs\?v=1/, 'parent boot loads the NPC-name interaction bridge');
const bindIndex = boot.indexOf('bindPirateSaveHost(frame)');
const frameSrcIndex = boot.indexOf('frame.src = frameUrl.href');
assert.ok(bindIndex >= 0 && frameSrcIndex > bindIndex, 'parent save listener binds before the opaque child can request hydration');
assert.match(boot, /index\.html\?v=915/, 'parent cache-busts the Pirate child HTML after retiring the bottom prompt');
assert.match(combined, /boot-pirate-fruit-v900\.mjs\?v=921/, 'world catalog keeps the current Pirate boot module revision');
assert.match(entry, /online-world-shell-v900\.mjs\?v=25/, 'top-level entry cache-busts the scene revision carrying NPC-name interaction');
assert.match(sceneHtml, /scene-entry-v900\.mjs\?v=29/, 'scene HTML cache-busts the shared runtime dependency chain');
assert.match(sceneHtml, /style-v900\.css\?v=936/, 'scene HTML keeps the current persistent fullscreen control layout');
assert.match(offlineHtml, /pocket-presentation\.mjs\?v=6/, 'offline HTML cache-busts presentation integration after NPC prompt retirement');
assert.match(presentation, /pirate-fruit-client-bridge\.mjs\?v=1/, 'presentation keeps the current static-batch classification bridge');
assert.match(presentation, /pirate-fruit-control-hud-v900\.mjs\?v=4/, 'presentation loads the HUD policy that retires legacy Pirate overlays');
assert.match(presentation, /pirate-npc-name-interaction-v900\.mjs\?v=1/, 'presentation loads the child NPC-name hit-target bridge');
assert.match(pirateHud, /\.game-minimap,[\s\S]*\.onboarding-root,[\s\S]*\.interaction-prompt\s*\{[\s\S]*visibility:\s*hidden\s*!important/, 'Pirate child minimap, onboarding bar and bottom interaction prompt are retired together');
assert.match(npcNameInteraction, /installPirateNpcCameraCapture/, 'NPC name interaction captures the live Pirate camera without same-origin access');
assert.match(npcNameInteraction, /PIRATE_NPC_NAME_PROXY_ID/, 'NPC name interaction owns a dedicated transparent parent hit target');

assert.match(build, /ROOT_FILE_EXTENSIONS[^\n]*'\.mjs'/, 'Pages artifact publishes tracked root modules including the NPC-name bridge');
assert.match(build, /'pirate-fruit-offline\/pocket-bootstrap\.mjs'/, 'Pages artifact includes the save-aware child bootstrap');
assert.match(packageJson.scripts['test:v90:pirate-player'], /v90-pirate-save-bridge\.mjs/);
assert.match(packageJson.scripts['test:v90:pirate-player'], /v90-pirate-save-integration\.mjs/);

console.log('V9 Pirate save bootstrap and cache chain: PASS');
