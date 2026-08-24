import assert from 'node:assert/strict';
import { BUILD_RUNTIME_CONFIG, loadRuntimeConfig, runtimeWritePolicy, validateRuntimeManifest } from '../runtime-config.mjs';
import { healthVersionGate } from '../server-sync.mjs';

const safe = await loadRuntimeConfig({ fetchImpl: async () => ({ ok: true, json: async () => ({ environment: 'hybrid', featureFlags: { vpsEnabled: true, vpsReads: true, vpsWrites: true, playerDataWrites: true } }) }), locationHref: 'https://game.invalid/' });
assert.equal(safe.featureFlags.vpsWrites, false);
assert.equal(safe.canWritePlayerData, false);
assert.equal(runtimeWritePolicy(safe).playerDataWrites, false);
assert.equal(BUILD_RUNTIME_CONFIG.featureFlags.firebaseFallback, true);
assert.equal(validateRuntimeManifest({ configVersion: 99 }).valid, false);

let calls = 0;
const disabled = await healthVersionGate(BUILD_RUNTIME_CONFIG, { fetchImpl: async () => { calls++; throw new Error('must not call'); } });
assert.equal(disabled.state, 'disabled');
assert.equal(calls, 0);

const config = await loadRuntimeConfig({ manifest: { environment: 'hybrid', apiBaseUrl: 'https://server.invalid', apiVersion: 'v1', minimumClientVersion: '8.2.0', saveSchemaVersion: 1, featureFlags: { vpsEnabled: true, vpsReads: true } } });
const response = async (payload) => ({ ok: true, status: 200, json: async () => payload });
const healthy = await healthVersionGate(config, { fetchImpl: async (url) => url.endsWith('/api/health') ? response({ status: 'ok' }) : response({ apiVersion: 'v1', minimumClientVersion: '8.2.0', saveSchemaVersion: 1, deployedRelease: 'sha-test' }) });
assert.equal(healthy.state, 'healthy');
assert.equal(healthy.server.deployedRelease, 'sha-test');

const maintenance = await healthVersionGate(config, { fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
assert.equal(maintenance.state, 'maintenance');
const incompatible = await healthVersionGate(config, { fetchImpl: async () => response({ apiVersion: 'v2', saveSchemaVersion: 1 }) });
assert.equal(incompatible.state, 'incompatible');
const malformed = await healthVersionGate(config, { fetchImpl: async () => response(null) });
assert.equal(malformed.state, 'invalid');
const offline = await healthVersionGate(config, { timeoutMs: 1, fetchImpl: async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return response({}); } });
assert.equal(offline.state, 'offline');
assert.equal(healthy.allowPlayerDataWrites, false);
console.log('Goal 1 integration foundation contracts: PASS');
