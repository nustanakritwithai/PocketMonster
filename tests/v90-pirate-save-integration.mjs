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
assert.match(boot, /pirate-fruit-control-hud-v900\.mjs\?v=1/, 'parent boot cache-busts the message-only HUD contract');
const bindIndex = boot.indexOf('bindPirateSaveHost(frame)');
const frameSrcIndex = boot.indexOf('frame.src = frameUrl.href');
assert.ok(bindIndex >= 0 && frameSrcIndex > bindIndex, 'parent save listener binds before the opaque child can request hydration');
assert.match(boot, /index\.html\?v=911/, 'parent cache-busts the save-aware offline HTML');
assert.match(combined, /boot-pirate-fruit-v900\.mjs\?v=917/, 'world catalog cache-busts the sandbox/save boot beyond latest main');
assert.match(entry, /online-world-shell-v900\.mjs\?v=13/, 'top-level entry cache-busts BFCache restore behavior beyond latest main');
assert.match(sceneHtml, /scene-entry-v900\.mjs\?v=14/, 'scene HTML cache-busts scene-entry fullscreen ownership beyond latest main');
assert.match(offlineHtml, /pocket-presentation\.mjs\?v=3/, 'offline HTML cache-busts presentation integration');
assert.match(presentation, /pirate-fruit-client-bridge\.mjs\?v=1/, 'presentation cache-busts static-batch classification');
assert.match(presentation, /pirate-fruit-control-hud-v900\.mjs\?v=1/, 'presentation cache-busts the message-only HUD contract');

assert.match(build, /'pirate-save-bridge-v900\.mjs'/, 'Pages artifact includes the parent/child save bridge');
assert.match(build, /'pirate-fruit-offline\/pocket-bootstrap\.mjs'/, 'Pages artifact includes the save-aware child bootstrap');
assert.match(packageJson.scripts['test:v90:pirate-player'], /v90-pirate-save-bridge\.mjs/);
assert.match(packageJson.scripts['test:v90:pirate-player'], /v90-pirate-save-integration\.mjs/);

console.log('V9 Pirate save bootstrap and cache chain: PASS');
