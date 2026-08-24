import assert from 'node:assert/strict';
import { createReadOnlyRuntimeConfig } from '../scripts/write-deployment-runtime-config.mjs';

const config = createReadOnlyRuntimeConfig('https://157.85.96.139');
assert.equal(config.apiBaseUrl, 'https://157.85.96.139');
assert.equal(config.webSocketUrl, 'wss://157.85.96.139/ws/chat');
assert.equal(config.featureFlags.vpsEnabled, true);
assert.equal(config.featureFlags.vpsReads, true);
for (const flag of ['vpsWrites', 'playerDataWrites', 'accountMigration', 'saveMigration', 'economyMutation']) {
  assert.equal(config.featureFlags[flag], false, `${flag} must stay disabled`);
}
assert.equal(config.featureFlags.firebaseFallback, true);
assert.throws(() => createReadOnlyRuntimeConfig('http://157.85.96.139'));
assert.throws(() => createReadOnlyRuntimeConfig('https://user:pass@157.85.96.139'));

console.log('deployment runtime config contract passed');
