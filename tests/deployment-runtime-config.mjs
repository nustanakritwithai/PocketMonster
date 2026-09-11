import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAuthProfilePreviewConfig, createReadOnlyRuntimeConfig } from '../scripts/write-deployment-runtime-config.mjs';

const config = createReadOnlyRuntimeConfig('https://157.85.96.139');
assert.equal(config.apiBaseUrl, 'https://157.85.96.139');
assert.equal(config.webSocketUrl, 'wss://157.85.96.139/ws/chat');
assert.equal(config.featureFlags.vpsEnabled, true);
assert.equal(config.featureFlags.vpsReads, true);
for (const flag of ['vpsWrites', 'playerDataWrites', 'accountMigration', 'saveMigration', 'economyMutation']) {
  assert.equal(config.featureFlags[flag], false, `${flag} must stay disabled`);
}
assert.equal(config.featureFlags.firebaseFallback, false);
assert.equal(config.featureFlags.launchTicket, false);
for (const flag of ['firebaseAuthBridge', 'accountLinking', 'profileReads']) assert.equal(config.featureFlags[flag], false);
assert.throws(() => createReadOnlyRuntimeConfig('http://157.85.96.139'));
assert.throws(() => createReadOnlyRuntimeConfig('https://user:pass@157.85.96.139'));

const preview = createAuthProfilePreviewConfig('https://157.85.96.139/auth-staging/', { apiKey: 'test-key', authDomain: 'test.example', projectId: 'test-project', appId: 'test-app' });
assert.equal(preview.apiBaseUrl, 'https://157.85.96.139/auth-staging');
assert.equal(preview.firebase.projectId, 'test-project');
for (const flag of ['firebaseAuthBridge', 'accountLinking', 'profileReads']) assert.equal(preview.featureFlags[flag], true);
for (const flag of ['vpsWrites', 'playerDataWrites', 'saveMigration', 'economyMutation']) assert.equal(preview.featureFlags[flag], false);
assert.throws(() => createAuthProfilePreviewConfig('https://157.85.96.139', { projectId: 'incomplete' }));

const checkedInConfig = JSON.parse(fs.readFileSync('runtime-config.json', 'utf8'));
assert.equal(checkedInConfig.firebase?.projectId, 'pocketmonster-game');
assert.equal(checkedInConfig.firebase?.authDomain, 'pocketmonster-game.firebaseapp.com');
assert.equal(checkedInConfig.healthPath, '/api/health');
assert.equal(checkedInConfig.versionPath, '/api/version');

const ticketConfig = createReadOnlyRuntimeConfig('https://157.85.96.139', { launchTicket: true });
assert.equal(ticketConfig.featureFlags.launchTicket, true);
for (const flag of ['vpsWrites', 'playerDataWrites', 'saveMigration', 'economyMutation']) assert.equal(ticketConfig.featureFlags[flag], false);

console.log('deployment runtime config contract passed');
