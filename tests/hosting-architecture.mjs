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

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketmonster-launcher-'));
try {
  buildFirebaseLauncher({ root: path.resolve('.'), output });
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  assert.match(html, /firebase-launcher-entry\.mjs/, 'Firebase remains the V8.4 login and launch-ticket entry');
  assert.match(html, /https:\/\/nustanakritwithai\.github\.io\/PocketMonster\/style-v800\.css/);
  assert.match(html, /https:\/\/nustanakritwithai\.github\.io\/PocketMonster\/style-v900\.css/);
  assert.doesNotMatch(html, /entry-preload-v900\.mjs/, 'Firebase launcher must redirect into the GitHub V9 entry instead of booting V9 locally');
  assert.doesNotMatch(html, /combat-v91\.css/,
    'Firebase login/redirect launcher must not request the Pages-only Combat stylesheet');
  assert.equal(fs.existsSync(path.join(output, 'combat-v91.css')), false,
    'Firebase launcher must not copy a dormant Combat client asset');
  assert.equal(fs.existsSync(path.join(output, 'firebase-launcher-entry.mjs')), true);
  assert.equal(fs.existsSync(path.join(output, 'firebase-auth-ui.mjs')), true);
  assert.equal(fs.existsSync(path.join(output, 'server-auth.mjs')), true);
  assert.equal(fs.existsSync(path.join(output, 'runtime-config.json')), true);
  const runtimeConfig = JSON.parse(fs.readFileSync(path.join(output, 'runtime-config.json'), 'utf8'));
  assert.equal(runtimeConfig.featureFlags.launchTicket, true, 'Firebase live launcher cannot boot a legacy local game');
  for (const flag of ['vpsWrites', 'playerDataWrites', 'firebaseFallback']) assert.equal(runtimeConfig.featureFlags[flag], false);
  assert.equal(fs.existsSync(path.join(output, 'entry-preload-v900.mjs')), false);
  assert.match(html, /form-action 'self'/, 'launcher forms must be handled on the same origin');
  assert.match(html, new RegExp(`connect-src[^;]*${new URL(runtimeConfig.apiBaseUrl).origin.replaceAll('.', '\\.')}`), 'launcher CSP must allow its configured API origin');
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}

console.log('hosting architecture contract passed');
