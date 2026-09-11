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
const build = read('scripts/build-github-pages.mjs');
const packageJson = JSON.parse(read('package.json'));

assert.match(offlineHtml, /src="\.\/pocket-bootstrap\.mjs\?v=4"/, 'rollback offline HTML retains the save-aware bootstrap');
assert.doesNotMatch(offlineHtml, /<script[^>]+src="\.\/assets\/index-YxSDH_bK\.js"/, 'rollback vendored bundle is never started before save hydration');
const hydrateIndex = bootstrap.indexOf('await installPirateSaveSandbox');
const bundleMatch = bootstrap.match(/await import\('\.\/assets\/([^']+\.js)'\)/);
assert.ok(bundleMatch, 'rollback save-aware bootstrap declares the compiled Pirate entry');
const bundleIndex = bootstrap.indexOf(bundleMatch[0]);
assert.ok(hydrateIndex >= 0 && bundleIndex > hydrateIndex, 'rollback sandbox storage installs before the real Pirate bundle executes');
assert.match(bootstrap, /pirate-save-bridge-v900\.mjs\?v=1/, 'rollback bootstrap cache-busts the save bridge');

assert.match(boot, /bindPirateSaveHost/, 'rollback parent owns the isolated Pirate save persistence host');
assert.match(boot, /pirate-save-bridge-v900\.mjs\?v=1/, 'rollback parent cache-busts the save bridge');
assert.match(boot, /pirate-fruit-control-hud-v900\.mjs\?v=11/, 'rollback parent boot cache-busts the child HUD retirement contract');
const bindIndex = boot.indexOf('bindPirateSaveHost(frame)');
const frameSrcIndex = boot.indexOf('frame.src = frameUrl.href');
assert.ok(bindIndex >= 0 && frameSrcIndex > bindIndex, 'rollback parent save listener binds before the opaque child can request hydration');
assert.match(boot, /index\.html\?v=941/, 'rollback parent cache-busts the Pirate child HTML with the ship-control mode bridge');
assert.match(combined, /world-pirate-native-v900\.mjs\?v=1/, 'world catalog boots the Native Pirate Studio-first runtime');
assert.doesNotMatch(combined, /boot-pirate-fruit-v900\.mjs\?v=953/, 'legacy Pirate boot is no longer an active world route');
assert.match(entry, /online-world-shell-v900\.mjs\?v=65/, 'top-level entry cache-busts the unified ship-control shell');
assert.match(sceneHtml, /scene-entry-v900\.mjs\?v=61/, 'scene HTML cache-busts the unified Pirate ship-control bridge');
assert.match(sceneHtml, /style-v900\.css\?v=969/, 'scene HTML cache-busts the helm placement beside chat');
assert.match(offlineHtml, /pocket-presentation\.mjs\?v=[1-9]\d*"/, 'rollback offline HTML cache-busts presentation integration with a positive revision');
assert.match(presentation, /pirate-fruit-client-bridge\.mjs\?v=[1-9]\d*'/, 'rollback presentation cache-busts static-batch classification');
assert.match(presentation, /pirate-fruit-control-hud-v900\.mjs\?v=17/, 'rollback presentation loads the HUD policy that retires the helm center-panel duplicate');
assert.match(pirateHud, /\.game-minimap\s*\{[\s\S]*visibility:\s*hidden\s*!important/, 'rollback Pirate child circular minimap stays hidden by the parent-primary HUD policy');
assert.match(pirateHud, /.progression-hud/, 'rollback Pirate child HP cluster stays retired by parent-primary HUD policy');

assert.match(build, /'pirate-save-bridge-v900\.mjs'/, 'Pages compatibility artifact keeps the parent/child save bridge for rollback');
assert.match(build, /'pirate-fruit-offline\/pocket-bootstrap\.mjs'/, 'Pages compatibility artifact keeps the save-aware child bootstrap for rollback');
assert.match(packageJson.scripts['test:v90:pirate-player'], /v90-pirate-save-bridge\.mjs/);
assert.match(packageJson.scripts['test:v90:pirate-player'], /v90-pirate-save-integration\.mjs/);

console.log('V9 Pirate native route + rollback save bootstrap/cache chain: PASS');
