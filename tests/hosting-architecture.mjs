import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFirebaseLauncher } from '../scripts/build-firebase-launcher.mjs';
import { isPublicGameFile } from '../scripts/build-github-pages.mjs';

assert.equal(isPublicGameFile('game-v800.js'), true);
assert.equal(isPublicGameFile('server-sync.mjs'), true);
assert.equal(isPublicGameFile('assets/catalog/monster-slimes.json'), true);
assert.equal(isPublicGameFile('tests/server-auth.mjs'), false);
assert.equal(isPublicGameFile('server_save_backup.json'), false);
assert.equal(isPublicGameFile('firebase.json'), false);
assert.equal(isPublicGameFile('package.json'), false);

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketmonster-launcher-'));
try {
  buildFirebaseLauncher({ root: path.resolve('.'), output });
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  assert.match(html, /firebase-launcher-entry\.mjs/);
  assert.match(html, /https:\/\/nustanakritwithai\.github\.io\/PocketMonster\/style-v800\.css/);
  assert.doesNotMatch(html, /src="\.\/game-v800\.js/);
  assert.equal(fs.existsSync(path.join(output, 'game-v800.js')), false);
  assert.equal(fs.existsSync(path.join(output, 'firebase-launcher-entry.mjs')), true);
  for (const module of ['firebase-auth-ui.mjs', 'firebase-runtime.mjs', 'server-auth.mjs', 'launch-bootstrap.mjs']) {
    assert.equal(fs.existsSync(path.join(output, module)), true, `${module} must be bundled with the launcher`);
  }
  assert.equal(fs.existsSync(path.join(output, 'runtime-config.json')), true);
  const launcher = fs.readFileSync(path.join(output, 'firebase-launcher-entry.mjs'), 'utf8');
  const authUi = fs.readFileSync(path.join(output, 'firebase-auth-ui.mjs'), 'utf8');
  assert.match(launcher, /issueLaunchTicket/);
  assert.match(launcher, /import\('\.\/server-auth\.mjs'\)/);
  assert.doesNotMatch(launcher, /new URL\('server-auth\.mjs', assetBase\)/);
  assert.doesNotMatch(authUi, /await signIn[^;]+; location\.reload\(\)/, 'Firebase sign-in must continue through the auth observer without racing a page reload');
  assert.match(launcher, /location\.replace/);
  assert.match(launcher, /game-v800\.js/);
  assert.match(launcher, /if \(!config\?\.featureFlags\?\.launchTicket\)/);
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}

console.log('hosting architecture contract passed');
