import assert from 'node:assert/strict';
import { BUILD_RUNTIME_CONFIG, loadRuntimeConfig, runtimeWritePolicy, validateRuntimeManifest } from '../runtime-config.mjs';
import { compareSemanticVersions, healthVersionGate } from '../server-sync.mjs';

const headers = (apiVersion = '1.1') => ({ get: (name) => name === 'X-API-Version' ? apiVersion : null });
const reply = (payload, status = 200, apiVersion = '1.1') => ({ ok: status >= 200 && status < 300, status, headers: headers(apiVersion), json: async () => payload });
const fetchPair = (health, version, healthStatus = 200, versionStatus = 200, healthApiVersion = '1.1', versionApiVersion = healthApiVersion) => async (url, options) => {
  assert.equal(options.headers['X-Request-Id'], 'goal1-test');
  return url.endsWith('/api/health') ? reply(health, healthStatus, healthApiVersion) : reply(version, versionStatus, versionApiVersion);
};

const safe = await loadRuntimeConfig({ fetchImpl: async () => ({ ok: true, json: async () => ({ environment: 'hybrid', featureFlags: { vpsEnabled: true, vpsReads: true, vpsWrites: true, playerDataWrites: true } }) }), locationHref: 'https://game.invalid/' });
assert.equal(safe.featureFlags.vpsWrites, false);
assert.equal(safe.canWritePlayerData, false);
assert.equal(runtimeWritePolicy(safe).playerDataWrites, false);
assert.equal(BUILD_RUNTIME_CONFIG.featureFlags.firebaseFallback, true);
assert.equal(BUILD_RUNTIME_CONFIG.minimumClientVersion, '8.3.0');
assert.equal(validateRuntimeManifest({ configVersion: 99 }).valid, false);
assert.equal(compareSemanticVersions('8.10.0', '8.3.0'), 1);
assert.equal(compareSemanticVersions('8.3.0', '8.10.0'), -1);

let calls = 0;
const disabled = await healthVersionGate(BUILD_RUNTIME_CONFIG, { fetchImpl: async () => { calls++; throw new Error('must not call'); } });
assert.equal(disabled.state, 'disabled');
assert.equal(calls, 0);

const config = await loadRuntimeConfig({ manifest: { environment: 'hybrid', apiBaseUrl: 'https://server.invalid', apiVersion: '1.1', minimumClientVersion: '8.3.0', saveSchemaVersion: 1, featureFlags: { vpsEnabled: true, vpsReads: true } } });
const release = { version: '1.1.0', commitSha: '0123456789abcdef0123456789abcdef01234567', builtAtUtc: '2026-08-24T00:00:00Z' };
const healthy = await healthVersionGate(config, { correlationId: 'goal1-test', fetchImpl: fetchPair({ status: 'ready', maintenance: false, apiVersion: '1.1' }, { apiVersion: '1.1', minimumClientVersion: '8.3.0', saveSchemaVersion: 1, deployedRelease: release }) });
assert.equal(healthy.state, 'healthy');
assert.deepEqual(healthy.server.deployedRelease, release);

const maintenance = await healthVersionGate(config, { correlationId: 'goal1-test', fetchImpl: fetchPair({ status: 'ready', maintenance: true }, { apiVersion: '1.1', deployedRelease: release }) });
assert.equal(maintenance.state, 'maintenance');
const notReady = await healthVersionGate(config, { correlationId: 'goal1-test', fetchImpl: fetchPair({ status: 'not_ready', maintenance: false }, { apiVersion: '1.1', deployedRelease: release }, 503, 200) });
assert.equal(notReady.state, 'offline');
const incompatible = await healthVersionGate(config, { correlationId: 'goal1-test', fetchImpl: fetchPair({ status: 'ready' }, { apiVersion: '1.1', minimumClientVersion: '8.10.0', saveSchemaVersion: 1, deployedRelease: release }) });
assert.equal(incompatible.state, 'incompatible');
const unverifiedRelease = await healthVersionGate(config, { correlationId: 'goal1-test', fetchImpl: fetchPair({ status: 'ready' }, { apiVersion: '1.1', minimumClientVersion: '8.3.0', saveSchemaVersion: 1, deployedRelease: { version: '1.1.0', commitSha: 'unavailable', builtAtUtc: '2026-08-24T00:00:00Z' } }) });
assert.equal(unverifiedRelease.state, 'incompatible');
assert.equal(unverifiedRelease.reason, 'release-unverified');
const malformed = await healthVersionGate(config, { correlationId: 'goal1-test', fetchImpl: fetchPair({}, { apiVersion: '1.1' }) });
assert.equal(malformed.state, 'offline');
const badHeader = await healthVersionGate(config, { correlationId: 'goal1-test', fetchImpl: fetchPair({ status: 'ready' }, { apiVersion: '1.1', minimumClientVersion: '8.3.0', saveSchemaVersion: 1, deployedRelease: release }, 200, 200, '1.0') });
assert.equal(badHeader.state, 'invalid');
assert.equal(badHeader.reason, 'health-api-version-header-mismatch');
const badVersionHeader = await healthVersionGate(config, { correlationId: 'goal1-test', fetchImpl: fetchPair({ status: 'ready' }, { apiVersion: '1.1', minimumClientVersion: '8.3.0', saveSchemaVersion: 1, deployedRelease: release }, 200, 200, '1.1', '1.0') });
assert.equal(badVersionHeader.state, 'invalid');
assert.equal(badVersionHeader.reason, 'version-api-version-header-mismatch');
const shortSha = await healthVersionGate(config, { correlationId: 'goal1-test', fetchImpl: fetchPair({ status: 'ready' }, { apiVersion: '1.1', minimumClientVersion: '8.3.0', saveSchemaVersion: 1, deployedRelease: { ...release, commitSha: 'abc123' } }) });
assert.equal(shortSha.state, 'incompatible');
assert.equal(shortSha.reason, 'release-unverified');
const offline = await healthVersionGate(config, { timeoutMs: 1, fetchImpl: async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return reply({}); } });
assert.equal(offline.state, 'offline');
assert.equal(healthy.allowPlayerDataWrites, false);
console.log('Goal 1 integration foundation contracts: PASS');
