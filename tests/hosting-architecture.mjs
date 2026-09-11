import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFirebaseLauncher } from '../scripts/build-firebase-launcher.mjs';
import { isPublicGameFile } from '../scripts/build-github-pages.mjs';

assert.equal(isPublicGameFile('pirate-fruit-offline/index.html'), true);
assert.equal(isPublicGameFile('pirate-fruit-offline/SOURCE.json'), true);
assert.equal(isPublicGameFile('assets/catalog/monster-slimes.json'), true);
assert.equal(isPublicGameFile('assets/textures/monsters/flame-wolf-f2/README.md'), false);
assert.equal(isPublicGameFile('tests/server-auth.mjs'), false);
assert.equal(isPublicGameFile('combat-v91-entry.mjs'), true);
assert.equal(isPublicGameFile('combat-v91-server-authority.mjs'), false,
  'Server authority code must stay outside the browser artifact');
assert.equal(isPublicGameFile('assets/combat-v91-server-authority.mjs'), false,
  'Server authority basename must stay private inside public directories too');
assert.equal(isPublicGameFile('world-runtime-lifecycle-v910.mjs'), false,
  'unwired one-document runtime lifecycle must stay source-only');
assert.equal(isPublicGameFile('one-document-world-runtime-host-v910.mjs'), false,
  'unwired one-document runtime host must stay source-only');
assert.equal(isPublicGameFile('world-runtime-resource-scope-v912.mjs'), false,
  'unwired runtime resource scope must stay source-only');
assert.equal(isPublicGameFile('world-runtime-import-purity-v912.mjs'), false,
  'unwired import-purity contract must stay source-only');
assert.equal(isPublicGameFile('server_save_backup.json'), false);
assert.equal(isPublicGameFile('firebase.json'), false);
assert.equal(isPublicGameFile('package.json'), false);
const firebaseHostingConfig = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
assert.deepEqual(firebaseHostingConfig.hosting.headers, [{
  source: '**',
  headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
}], 'Firebase launcher must not cache a stale release entry after a deployment');

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketmonster-launcher-'));
try {
  buildFirebaseLauncher({ root: path.resolve('.'), output });
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(output, 'firebase-launcher.css'), 'utf8');
  assert.match(html, /firebase-launcher-entry\.mjs/, 'Firebase remains the login and launch-ticket entry');
  assert.match(html, /firebase-launcher\.css/, 'Firebase launcher uses its own neutral boot stylesheet');
  assert.match(html, /id="accountGate" class="account-gate hidden"/,
    'auth gate starts hidden so returning users never see an intermediate screen before redirect');
  assert.match(css, /\.hidden\{display:none!important\}/, 'launcher CSS must hide the auth gate until Firebase reports no session');
  assert.doesNotMatch(html, /entry-preload-v900\.mjs/, 'Firebase launcher must redirect into the game entry instead of booting the game locally');
  assert.doesNotMatch(html, /style-v800\.css|style-v900\.css|combat-v91\.css/,
    'Firebase launcher must not render any old or game-version presentation styles');
  assert.doesNotMatch(html, /id="game"|id="versionBadge"|V9\.0|3 โลก/,
    'Firebase launcher must not expose the old game/version shell before the target release');
  assert.equal(fs.existsSync(path.join(output, 'combat-v91.css')), false,
    'Firebase launcher must not copy a dormant Combat client asset');
  assert.equal(fs.existsSync(path.join(output, 'entry-preload-v900.mjs')), false,
    'Firebase launcher must not copy the game runtime entry');
  assert.equal(fs.existsSync(path.join(output, 'firebase-launcher.css')), true);
  assert.equal(fs.existsSync(path.join(output, 'firebase-launcher-entry.mjs')), true);
  assert.equal(fs.existsSync(path.join(output, 'firebase-auth-ui.mjs')), true);
  assert.equal(fs.existsSync(path.join(output, 'server-auth.mjs')), true);
  assert.equal(fs.existsSync(path.join(output, 'runtime-config.json')), true);
  const runtimeConfig = JSON.parse(fs.readFileSync(path.join(output, 'runtime-config.json'), 'utf8'));
  assert.equal(runtimeConfig.featureFlags.launchTicket, true, 'Firebase live launcher must issue a launch ticket before redirect');
  for (const flag of ['vpsWrites', 'playerDataWrites', 'firebaseFallback']) assert.equal(runtimeConfig.featureFlags[flag], false);
  assert.match(html, /form-action 'self'/, 'launcher forms must be handled on the same origin');
  assert.match(html, new RegExp(`connect-src[^;]*${new URL(runtimeConfig.apiBaseUrl).origin.replaceAll('.', '\\.')}`), 'launcher CSP must allow its configured API origin');
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}

console.log('hosting architecture contract passed');
