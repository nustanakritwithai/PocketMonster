import assert from 'node:assert/strict';

import { ONLINE_WORLD_SHELL_KIND } from '../online-world-bridge-v900.mjs';
import { loadRuntimeConfig } from '../runtime-config.mjs';
import { healthVersionGate } from '../server-sync.mjs';

const release = Object.freeze({
  version: '8.4.0-test',
  commitSha: '0123456789abcdef0123456789abcdef01234567',
  builtAtUtc: '2026-08-30T00:00:00Z',
});
const manifest = Object.freeze({
  configVersion: 1,
  environment: 'hybrid',
  apiBaseUrl: 'https://server.example',
  webSocketUrl: 'wss://server.example/ws/chat',
  apiVersion: '1.1',
  minimumClientVersion: '8.3.0',
  healthPath: '/api/health',
  versionPath: '/api/version',
  saveSchemaVersion: 1,
  featureFlags: Object.freeze({
    vpsEnabled: true,
    vpsReads: true,
    vpsWrites: false,
    playerDataWrites: false,
    firebaseFallback: false,
    launchTicket: true,
  }),
});
const parentConfig = await loadRuntimeConfig({ manifest });
const childConfig = await loadRuntimeConfig({ manifest: parentConfig });
assert.notEqual(childConfig, parentConfig, 'legacy runtime normalization returns a distinct frozen config object');

const response = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: name => name === 'X-API-Version' ? '1.1' : null },
  json: async () => payload,
});
let parentFetchCalls = 0;
delete globalThis.window;
const parentGate = await healthVersionGate(parentConfig, {
  correlationId: 'v90-parent-gate',
  fetchImpl: async url => {
    parentFetchCalls += 1;
    return String(url).endsWith('/api/health')
      ? response({ status: 'ready', maintenance: false, apiVersion: '1.1' })
      : response({
        apiVersion: '1.1',
        minimumClientVersion: '8.3.0',
        saveSchemaVersion: 1,
        deployedRelease: release,
      });
  },
});
assert.equal(parentFetchCalls, 2, 'top-level parent checks health and version exactly once each');
assert.equal(parentGate.state, 'healthy');
assert.equal(Object.isFrozen(parentGate), true);

const launchSession = Object.freeze({
  sessionToken: 'stable-parent-session',
  expiresAtUtc: '2099-01-01T00:00:00Z',
});
const parentWindow = {
  location: { origin: 'https://game.example' },
  POCKETMONSTER_RUNTIME_CONFIG: parentConfig,
  POCKETMONSTER_LAUNCH_SESSION: launchSession,
  POCKETMONSTER_SERVER_GATE: parentGate,
  POCKETMONSTER_ONLINE_SHELL: Object.freeze({ kind: ONLINE_WORLD_SHELL_KIND }),
};
const childWindow = {
  location: { origin: 'https://game.example' },
  parent: parentWindow,
  POCKETMONSTER_RUNTIME_CONFIG: parentConfig,
  __POCKETMONSTER_RUNTIME_MANIFEST__: parentConfig,
  POCKETMONSTER_LAUNCH_SESSION: launchSession,
  POCKETMONSTER_SERVER_GATE: parentGate,
  POCKETMONSTER_SCENE_EMBEDDED: true,
};
globalThis.window = childWindow;

let embeddedFetchCalls = 0;
const inherited = await healthVersionGate(childConfig, {
  fetchImpl: async url => {
    embeddedFetchCalls += 1;
    return String(url).endsWith('/api/health')
      ? response({ status: 'ready', apiVersion: '1.1' })
      : response({ apiVersion: '1.1', minimumClientVersion: '8.3.0', saveSchemaVersion: 1, deployedRelease: release });
  },
});
assert.equal(embeddedFetchCalls, 0, 'embedded Pocket runtime must never repeat the parent health/version requests');
assert.equal(inherited, parentGate, 'embedded Pocket runtime reuses the exact frozen parent gate object');

function restoreHealthyEmbedding() {
  parentWindow.location.origin = 'https://game.example';
  parentWindow.POCKETMONSTER_RUNTIME_CONFIG = parentConfig;
  parentWindow.POCKETMONSTER_LAUNCH_SESSION = launchSession;
  parentWindow.POCKETMONSTER_SERVER_GATE = parentGate;
  childWindow.location.origin = 'https://game.example';
  childWindow.POCKETMONSTER_RUNTIME_CONFIG = parentConfig;
  childWindow.__POCKETMONSTER_RUNTIME_MANIFEST__ = parentConfig;
  childWindow.POCKETMONSTER_LAUNCH_SESSION = launchSession;
  childWindow.POCKETMONSTER_SERVER_GATE = parentGate;
}

async function assertEmbeddedFailClosed(label, mutate, config = childConfig) {
  restoreHealthyEmbedding();
  mutate();
  let calls = 0;
  const result = await healthVersionGate(config, {
    fetchImpl: async () => {
      calls += 1;
      return response({});
    },
  });
  assert.equal(calls, 0, `${label}: invalid embedded capability cannot fall back to network`);
  assert.equal(result.state, 'invalid', `${label}: embedded boot must fail closed`);
  assert.equal(result.reason, 'embedded-server-gate-unavailable');
  assert.equal(result.allowFirebaseFallback, false);
  assert.equal(result.allowPlayerDataWrites, false);
  assert.equal(result.writePolicy.enabled, false);
  assert.equal(Object.isFrozen(result), true);
}

await assertEmbeddedFailClosed('missing child gate', () => { delete childWindow.POCKETMONSTER_SERVER_GATE; });
await assertEmbeddedFailClosed('forged child gate', () => {
  childWindow.POCKETMONSTER_SERVER_GATE = Object.freeze({ ...parentGate });
});
await assertEmbeddedFailClosed('non-healthy parent gate', () => {
  const offlineGate = Object.freeze({ ...parentGate, state: 'offline' });
  parentWindow.POCKETMONSTER_SERVER_GATE = offlineGate;
  childWindow.POCKETMONSTER_SERVER_GATE = offlineGate;
});
await assertEmbeddedFailClosed('cross-origin parent', () => {
  parentWindow.location.origin = 'https://other.example';
});
const mismatchedConfig = await loadRuntimeConfig({ manifest: { ...manifest, apiBaseUrl: 'https://other-server.example' } });
await assertEmbeddedFailClosed('mismatched runtime contract', () => {}, mismatchedConfig);

console.log('V9 inherited Server gate lifecycle: PASS');
