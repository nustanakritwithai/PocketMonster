import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAuthProfilePreviewConfig, createReadOnlyRuntimeConfig } from '../scripts/write-deployment-runtime-config.mjs';

const config = createReadOnlyRuntimeConfig('https://157.85.96.139');
assert.equal(config.apiBaseUrl, 'https://157.85.96.139');
assert.equal(config.webSocketUrl, 'wss://157.85.96.139/ws/chat');
assert.equal(config.featureFlags.vpsEnabled, true);
assert.equal(config.featureFlags.vpsReads, true);
assert.equal(config.featureFlags.worldSimGround, false, 'WorldSim ground stays opt-in unless deployment explicitly enables it');
for (const flag of ['vpsWrites', 'playerDataWrites', 'accountMigration', 'saveMigration', 'economyMutation']) {
  assert.equal(config.featureFlags[flag], false, `${flag} must stay disabled`);
}
assert.equal(config.featureFlags.firebaseFallback, false);
assert.equal(config.featureFlags.launchTicket, false);
for (const flag of ['firebaseAuthBridge', 'accountLinking', 'profileReads']) assert.equal(config.featureFlags[flag], false);
assert.throws(() => createReadOnlyRuntimeConfig('http://157.85.96.139'));
assert.throws(() => createReadOnlyRuntimeConfig('https://user:pass@157.85.96.139'));

const groundConfig = createReadOnlyRuntimeConfig('https://157.85.96.139', { worldSimGround: true });
assert.equal(groundConfig.featureFlags.worldSimGround, true, 'deployment may explicitly enable read-only WorldSim ground');
for (const flag of ['vpsWrites', 'playerDataWrites', 'accountMigration', 'saveMigration', 'economyMutation']) {
  assert.equal(groundConfig.featureFlags[flag], false, `WorldSim ground must not enable ${flag}`);
}

const preview = createAuthProfilePreviewConfig('https://157.85.96.139/auth-staging/', { apiKey: 'test-key', authDomain: 'test.example', projectId: 'test-project', appId: 'test-app' });
assert.equal(preview.apiBaseUrl, 'https://157.85.96.139/auth-staging');
assert.equal(preview.firebase.projectId, 'test-project');
assert.equal(preview.featureFlags.worldSimGround, false);
for (const flag of ['firebaseAuthBridge', 'accountLinking', 'profileReads']) assert.equal(preview.featureFlags[flag], true);
for (const flag of ['vpsWrites', 'playerDataWrites', 'saveMigration', 'economyMutation']) assert.equal(preview.featureFlags[flag], false);
assert.throws(() => createAuthProfilePreviewConfig('https://157.85.96.139', { projectId: 'incomplete' }));

const previewGround = createAuthProfilePreviewConfig(
  'https://157.85.96.139/auth-staging/',
  { apiKey: 'test-key', authDomain: 'test.example', projectId: 'test-project', appId: 'test-app' },
  { worldSimGround: true },
);
assert.equal(previewGround.featureFlags.worldSimGround, true);
for (const flag of ['vpsWrites', 'playerDataWrites', 'saveMigration', 'economyMutation']) assert.equal(previewGround.featureFlags[flag], false);

const checkedInConfig = JSON.parse(fs.readFileSync('runtime-config.json', 'utf8'));
assert.equal(checkedInConfig.firebase?.projectId, 'pocketmonster-game');
assert.equal(checkedInConfig.firebase?.authDomain, 'pocketmonster-game.firebaseapp.com');
assert.equal(checkedInConfig.healthPath, '/api/health');
assert.equal(checkedInConfig.versionPath, '/api/version');
assert.equal(checkedInConfig.featureFlags.worldSimGround, true, 'checked-in deployment manifest exposes the new ground renderer');

const ticketConfig = createReadOnlyRuntimeConfig('https://157.85.96.139', { launchTicket: true });
assert.equal(ticketConfig.featureFlags.launchTicket, true);
for (const flag of ['vpsWrites', 'playerDataWrites', 'saveMigration', 'economyMutation']) assert.equal(ticketConfig.featureFlags[flag], false);

const firebaseWorkflowSource = fs.readFileSync('.github/workflows/firebase-hosting-merge.yml', 'utf8');
const pagesWorkflowSource = fs.readFileSync('.github/workflows/github-pages.yml', 'utf8');
assert.match(firebaseWorkflowSource, /MONSTERLIFE_WORLD_SIM_GROUND:\s*['"]true['"]/, 'Firebase live deployment must preserve WorldSim ground enablement');
assert.match(pagesWorkflowSource, /MONSTERLIFE_WORLD_SIM_GROUND:\s*['"]true['"]/, 'GitHub Pages deployment must preserve WorldSim ground enablement');

console.log('deployment runtime config contract passed');
