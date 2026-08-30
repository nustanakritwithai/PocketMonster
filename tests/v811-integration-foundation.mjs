import assert from 'node:assert/strict';
import { BUILD_RUNTIME_CONFIG, loadRuntimeConfig, runtimeWritePolicy, validateRuntimeManifest } from '../runtime-config.mjs';
import { compareSemanticVersions, healthVersionGate, serverGateTelemetry } from '../server-sync.mjs';

const headers = (apiVersion = '1.1') => ({ get: (name) => name === 'X-API-Version' ? apiVersion : null });
const reply = (payload, status = 200, apiVersion = '1.1') => ({ ok: status >= 200 && status < 300, status, headers: headers(apiVersion), json: async () => payload });
const fetchPair = (health, version, healthStatus = 200, versionStatus = 200, healthApiVersion = '1.1', versionApiVersion = healthApiVersion) => async (url, options) => {
  assert.equal(options.headers['X-Request-Id'], 'goal1-test');
  return url.endsWith('/api/health') ? reply(health, healthStatus, healthApiVersion) : reply(version, versionStatus, versionApiVersion);
};

const safe = await loadRuntimeConfig({ fetchImpl: async () => ({ ok: true, json: async () => ({ environment: 'hybrid', featureFlags: { vpsEnabled: true, vpsReads: true, vpsWrites: true, playerDataWrites: true } }) }), locationHref: 'https://game.invalid/' });
assert.equal(safe.featureFlags.vpsWrites, true);
assert.equal(safe.canWritePlayerData, true);
assert.equal(runtimeWritePolicy(safe).playerDataWrites, true);
assert.equal(BUILD_RUNTIME_CONFIG.featureFlags.firebaseFallback, false);
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
assert.equal(Number.isInteger(healthy.latencyMs), true);
assert.deepEqual(serverGateTelemetry(healthy, { observedAtUtc: '2026-08-24T12:00:00Z' }), {
  requestId: 'goal1-test', latencyMs: healthy.latencyMs, gateState: 'healthy', reason: '', observedAtUtc: '2026-08-24T12:00:00Z', release,
});

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
assert.equal(malformed.state, 'invalid');
assert.equal(malformed.reason, 'malformed-payload');
const badHeader = await healthVersionGate(config, { correlationId: 'goal1-test', fetchImpl: fetchPair({ status: 'ready' }, { apiVersion: '1.1', minimumClientVersion: '8.3.0', saveSchemaVersion: 1, deployedRelease: release }, 200, 200, '1.0') });
assert.equal(badHeader.state, 'invalid');
assert.equal(badHeader.reason, 'health-api-version-header-mismatch');
const badVersionHeader = await healthVersionGate(config, { correlationId: 'goal1-test', fetchImpl: fetchPair({ status: 'ready' }, { apiVersion: '1.1', minimumClientVersion: '8.3.0', saveSchemaVersion: 1, deployedRelease: release }, 200, 200, '1.1', '1.0') });
assert.equal(badVersionHeader.state, 'invalid');
assert.equal(badVersionHeader.reason, 'version-api-version-header-mismatch');
const shortSha = await healthVersionGate(config, { correlationId: 'goal1-test', fetchImpl: fetchPair({ status: 'ready' }, { apiVersion: '1.1', minimumClientVersion: '8.3.0', saveSchemaVersion: 1, deployedRelease: { ...release, commitSha: 'abc123' } }) });
assert.equal(shortSha.state, 'incompatible');
assert.equal(shortSha.reason, 'release-unverified');
const nonHexSha = await healthVersionGate(config, { correlationId: 'goal1-test', fetchImpl: fetchPair({ status: 'ready' }, { apiVersion: '1.1', minimumClientVersion: '8.3.0', saveSchemaVersion: 1, deployedRelease: { ...release, commitSha: `g${'0'.repeat(39)}` } }) });
assert.equal(nonHexSha.state, 'incompatible');
assert.equal(nonHexSha.reason, 'release-unverified');

const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const pendingTimers = new Set();
const externalSignal = {
  aborted: false,
  listeners: new Set(),
  addEventListener(type, listener) {
    if (type === 'abort') this.listeners.add(listener);
  },
  removeEventListener(type, listener) {
    if (type === 'abort') this.listeners.delete(listener);
  },
};
globalThis.setTimeout = (callback, delay, ...args) => {
  let timer;
  timer = originalSetTimeout(() => {
    pendingTimers.delete(timer);
    callback(...args);
  }, delay);
  pendingTimers.add(timer);
  return timer;
};
globalThis.clearTimeout = timer => {
  pendingTimers.delete(timer);
  return originalClearTimeout(timer);
};
try {
  const timerSafe = await healthVersionGate(config, {
    correlationId: 'goal1-test',
    fetchImpl: fetchPair(
      { status: 'ready', maintenance: false, apiVersion: '1.1' },
      { apiVersion: '1.1', minimumClientVersion: '8.3.0', saveSchemaVersion: 1, deployedRelease: release },
    ),
    signal: externalSignal,
    timeoutMs: 60_000,
  });
  assert.equal(timerSafe.state, 'healthy');
  assert.equal(pendingTimers.size, 0, 'server gate must clear every timeout after a settled request');
  assert.equal(externalSignal.listeners.size, 0, 'server gate must detach the caller abort listener after settling');
} finally {
  for (const timer of pendingTimers) originalClearTimeout(timer);
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}

const preAbortedController = new AbortController();
preAbortedController.abort();
let preAbortedFetchCalls = 0;
const preAborted = await healthVersionGate(config, {
  correlationId: 'goal1-test',
  signal: preAbortedController.signal,
  fetchImpl: async () => {
    preAbortedFetchCalls += 1;
    return reply({});
  },
});
assert.equal(preAborted.state, 'offline');
assert.equal(preAborted.reason, 'timeout');
assert.equal(preAbortedFetchCalls, 0, 'a pre-aborted gate must not start a network request');

const synchronousAbortController = new AbortController();
const unhandledRejections = [];
const captureUnhandled = reason => unhandledRejections.push(reason);
process.on('unhandledRejection', captureUnhandled);
try {
  const synchronousAbort = await healthVersionGate(config, {
    correlationId: 'goal1-test',
    signal: synchronousAbortController.signal,
    fetchImpl() {
      synchronousAbortController.abort();
      throw new Error('synchronous fetch failure');
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(synchronousAbort.state, 'offline');
  assert.equal(synchronousAbort.reason, 'timeout');
  assert.equal(unhandledRejections.length, 0, 'abort/fetch races must not leave an unhandled rejection');
} finally {
  process.off('unhandledRejection', captureUnhandled);
}

let siblingRequestAborted = false;
const siblingFailure = await healthVersionGate(config, {
  correlationId: 'goal1-test',
  fetchImpl(url, options) {
    if (url.endsWith('/api/health')) return Promise.reject(new Error('health request failed'));
    return new Promise((resolve, reject) => {
      const rejectOnAbort = () => {
        siblingRequestAborted = true;
        const error = new Error('version request aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (options.signal.aborted) rejectOnAbort();
      else options.signal.addEventListener('abort', rejectOnAbort, { once: true });
    });
  },
});
assert.equal(siblingFailure.state, 'invalid');
assert.equal(siblingFailure.reason, 'request-failed');
assert.equal(siblingRequestAborted, true, 'a failed contract request must abort its still-pending sibling');

const malformedUrlRejections = [];
const captureMalformedUrlRejection = reason => malformedUrlRejections.push(reason);
let malformedUrlFetchCalls = 0;
process.on('unhandledRejection', captureMalformedUrlRejection);
try {
  const malformedUrl = await healthVersionGate({ ...config, versionPath: 'http://[' }, {
    correlationId: 'goal1-test',
    fetchImpl: async () => {
      malformedUrlFetchCalls += 1;
      return reply({});
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(malformedUrl.state, 'invalid');
  assert.equal(malformedUrl.reason, 'request-failed');
  assert.equal(malformedUrlFetchCalls, 0, 'invalid contract URLs must fail before starting either request');
  assert.equal(malformedUrlRejections.length, 0, 'URL construction failure must not leave an unhandled request rejection');
} finally {
  process.off('unhandledRejection', captureMalformedUrlRejection);
}

const bodyReadDeadline = await Promise.race([
  healthVersionGate(config, {
    correlationId: 'goal1-test',
    timeoutMs: 5,
    fetchImpl: async url => url.endsWith('/api/health')
      ? { ...reply({}), json: () => new Promise(() => {}) }
      : reply({ apiVersion: '1.1', minimumClientVersion: '8.3.0', saveSchemaVersion: 1, deployedRelease: release }),
  }),
  new Promise(resolve => setTimeout(() => resolve({ state: 'test-deadline-exceeded' }), 100)),
]);
assert.equal(bodyReadDeadline.state, 'offline', 'response body reads must remain inside the server gate timeout');
assert.equal(bodyReadDeadline.reason, 'timeout');

const abortedBody = await healthVersionGate(config, {
  correlationId: 'goal1-test',
  fetchImpl: async url => url.endsWith('/api/health')
    ? {
        ...reply({}),
        async json() {
          const error = new Error('body read aborted');
          error.name = 'AbortError';
          throw error;
        },
      }
    : reply({ apiVersion: '1.1', minimumClientVersion: '8.3.0', saveSchemaVersion: 1, deployedRelease: release }),
});
assert.equal(abortedBody.state, 'offline');
assert.equal(abortedBody.reason, 'timeout');

const offline = await healthVersionGate(config, { timeoutMs: 1, fetchImpl: async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return reply({}); } });
assert.equal(offline.state, 'offline');
assert.equal(healthy.allowPlayerDataWrites, false);
console.log('Goal 1 integration foundation contracts: PASS');
