import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFirebaseLauncher } from '../scripts/build-firebase-launcher.mjs';
import { isPublicGameFile } from '../scripts/build-github-pages.mjs';

assert.equal(isPublicGameFile('game-v800.js'), true);
assert.equal(isPublicGameFile('server-sync.mjs'), true);
assert.equal(isPublicGameFile('assets/catalog/monster-slimes.json'), true);
assert.equal(isPublicGameFile('assets/textures/monsters/flame-wolf-f2/README.md'), false);
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
  for (const module of ['firebase-auth-ui.mjs', 'firebase-runtime.mjs', 'firebase-config.mjs', 'server-auth.mjs', 'launch-bootstrap.mjs']) {
    assert.equal(fs.existsSync(path.join(output, module)), true, `${module} must be bundled with the launcher`);
  }
  assert.equal(fs.existsSync(path.join(output, 'runtime-config.json')), true);
  const launcher = fs.readFileSync(path.join(output, 'firebase-launcher-entry.mjs'), 'utf8');
  const authUi = fs.readFileSync(path.join(output, 'firebase-auth-ui.mjs'), 'utf8');
  const runtimeConfig = JSON.parse(fs.readFileSync(path.resolve('runtime-config.json'), 'utf8'));
  assert.match(launcher, /issueLaunchTicket/);
  assert.match(launcher, /import\('\.\/server-auth\.mjs'\)/);
  assert.doesNotMatch(launcher, /new URL\('server-auth\.mjs', assetBase\)/);
  assert.doesNotMatch(authUi, /await signIn[^;]+; location\.reload\(\)/, 'Firebase sign-in must continue through the auth observer without racing a page reload');
  assert.match(html, /form-action 'self'/, 'launcher forms must be handled on the same origin');
  assert.match(html, new RegExp(`connect-src[^;]*${new URL(runtimeConfig.apiBaseUrl).origin.replaceAll('.', '\\.')}`), 'launcher CSP must allow its configured API origin');
  assert.match(launcher, /location\.replace/);
  assert.match(launcher, /navigator\?\.brave\?\.isBrave/);
  assert.match(launcher, /monsterlife-launch-context-request-v1/);
  assert.match(launcher, /event\.origin !== assetBase\.origin/);
  assert.match(launcher, /event\.source !== gameWindow/);
  assert.match(launcher, /chat-runtime\.mjs\?v=8\.4\.0-chat-visible/, 'launcher must bind chat UI from the GitHub Pages asset base');
  assert.match(launcher, /game-v800\.js/);
  assert.match(launcher, /if \(!config\?\.featureFlags\?\.launchTicket\)/);
  assert.match(launcher, /LAUNCH_TICKET_QA_ONLY/);
  assert.match(launcher, /loadLegacyGame/);
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}

console.log('hosting architecture contract passed');
