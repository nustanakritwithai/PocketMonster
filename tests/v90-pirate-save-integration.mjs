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
assert.match(boot, /pirate-fruit-control-hud-v900\.mjs\?v=2/, 'parent boot cache-busts the message-only HUD contract');
const bindIndex = boot.indexOf('bindPirateSaveHost(frame)');
const frameSrcIndex = boot.indexOf('frame.src = frameUrl.href');
assert.ok(bindIndex >= 0 && frameSrcIndex > bindIndex, 'parent save listener binds before the opaque child can request hydration');
assert.match(boot, /index\.html\?v=913/, 'parent cache-busts the telemetry-aware offline HTML');
assert.match(combined, /boot-pirate-fruit-v900\.mjs\?v=920/, 'world catalog cache-busts the sandbox/save boot beyond latest main');
assert.match(entry, /online-world-shell-v900\.mjs\?v=18/, 'top-level entry cache-busts the production Combat transport and BFCache restore behavior');
assert.match(sceneHtml, /scene-entry-v900\.mjs\?v=26/, 'scene HTML cache-busts the shared transport dependency chain and fullscreen ownership');
assert.match(sceneHtml, /style-v900\.css\?v=927/, 'scene HTML cache-busts the persistent fullscreen control layout');
assert.match(offlineHtml, /pocket-presentation\.mjs\?v=4/, 'offline HTML cache-busts presentation integration');
assert.match(presentation, /pirate-fruit-client-bridge\.mjs\?v=1/, 'presentation cache-busts static-batch classification');
assert.match(presentation, /pirate-fruit-control-hud-v900\.mjs\?v=2/, 'presentation cache-busts the message-only HUD contract');

assert.match(build, /'pirate-save-bridge-v900\.mjs'/, 'Pages artifact includes the parent/child save bridge');
assert.match(build, /'pirate-fruit-offline\/pocket-bootstrap\.mjs'/, 'Pages artifact includes the save-aware child bootstrap');
assert.match(packageJson.scripts['test:v90:pirate-player'], /v90-pirate-save-bridge\.mjs/);
assert.match(packageJson.scripts['test:v90:pirate-player'], /v90-pirate-save-integration\.mjs/);

console.log('V9 Pirate save bootstrap and cache chain: PASS');
