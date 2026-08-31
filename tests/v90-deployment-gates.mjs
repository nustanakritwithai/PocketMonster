import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  PAGES_LIVE_SMOKE_FILES,
  runDeploymentVerifierCli,
  verifyLiveV9Deployment,
  verifyRuntimeBackend,
} from '../scripts/verify-live-v9-deployment.mjs';

const SHA = '1234567890abcdef1234567890abcdef12345678';
const RELEASE = `8.4.0-github.${SHA}`;
const PAGES_BASE = 'https://example.test/PocketMonster/';
const FIREBASE_BASE = 'https://launcher.example.test/';
const API_BASE = 'https://server.example.test';
const WEBSOCKET_URL = 'wss://server.example.test/ws/chat';
const SERVER_RELEASE = Object.freeze({
  version: '8.4.0-server-test',
  commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
  builtAtUtc: '2026-08-31T00:00:00Z',
});

function runtimeConfig(overrides = {}, configOverrides = {}) {
  return {
    configVersion: 1,
    environment: 'vps-readonly',
    deployedRelease: RELEASE,
    assetBaseUrl: PAGES_BASE,
    apiBaseUrl: API_BASE,
    webSocketUrl: WEBSOCKET_URL,
    healthPath: '/api/health',
    versionPath: '/api/version',
    apiVersion: '1.1',
    minimumClientVersion: '8.3.0',
    saveSchemaVersion: 1,
    ...configOverrides,
    featureFlags: {
      vpsEnabled: true,
      vpsReads: true,
      launchTicket: true,
      vpsWrites: false,
      playerDataWrites: false,
      firebaseFallback: false,
      accountMigration: false,
      saveMigration: false,
      economyMutation: false,
      ...overrides,
    },
  };
}

function response(body, status = 200, apiVersion = '1.1') {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => name === 'X-API-Version' ? apiVersion : null },
    async text() { return text; },
    async json() { return JSON.parse(text); },
  };
}

function mappedFetch(baseUrl, files, backend = {}) {
  const base = new URL(baseUrl);
  const calls = [];
  const fetchImpl = async input => {
    const url = new URL(input);
    calls.push(url.href);
    if (url.origin === new URL(API_BASE).origin) {
      if (url.pathname === '/api/health') {
        return response(backend.healthPayload || {
          status: 'ready',
          maintenance: false,
          apiVersion: '1.1',
        }, backend.healthStatus ?? 200, backend.apiHeader || '1.1');
      }
      if (url.pathname === '/api/version') {
        return response(backend.versionPayload || {
          apiVersion: '1.1',
          minimumClientVersion: '8.3.0',
          saveSchemaVersion: 1,
          deployedRelease: SERVER_RELEASE,
        }, backend.versionStatus ?? 200, backend.apiHeader || '1.1');
      }
      return response('not found', 404);
    }
    const relative = decodeURIComponent(url.pathname.slice(base.pathname.length));
    return files.has(relative) ? response(files.get(relative)) : response('not found', 404);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const pagesFiles = new Map(PAGES_LIVE_SMOKE_FILES.map(relative => [relative, `fixture:${relative}`]));
pagesFiles.set('runtime-config.json', JSON.stringify(runtimeConfig()));
pagesFiles.set('index.html', '<link href="./style-v900.css"><link href="./combat-v91.css?v=1"><script type="module" src="./entry-preload-v900.mjs"></script>');
pagesFiles.set('v900.html', pagesFiles.get('index.html'));
pagesFiles.set('scene-v900.html', '<script type="module" src="./scene-entry-v900.mjs"></script>');
pagesFiles.set('online-world-shell-v900.mjs', "import { createCombatV91Shell } from './combat-v91-entry.mjs?v=1';\nvoid createCombatV91Shell;");
pagesFiles.set('pirate-fruit-offline/index.html', '<script type="module" src="./pocket-bootstrap.mjs?v=1"></script>');
pagesFiles.set('pirate-fruit-offline/pocket-bootstrap.mjs', "import { installPirateSaveSandbox } from '../pirate-save-bridge-v900.mjs?v=1';\nawait installPirateSaveSandbox();\nawait import('./assets/index-C3SJLfq8.js');\n");
const manifest = {
  files: [...pagesFiles].map(([relative, body]) => ({
    path: relative,
    sha256: crypto.createHash('sha256').update(body).digest('hex'),
  })),
};
pagesFiles.set('patch-manifest.json', JSON.stringify(manifest));

const pagesFetch = mappedFetch(PAGES_BASE, pagesFiles);
await verifyLiveV9Deployment({
  target: 'pages',
  baseUrl: PAGES_BASE,
  expectedSha: SHA,
  expectedApiBaseUrl: API_BASE,
  fetchImpl: pagesFetch,
  attempts: 1,
  retryDelayMs: 0,
});
assert.deepEqual(pagesFetch.calls.filter(value => new URL(value).origin === new URL(API_BASE).origin)
  .map(value => new URL(value).pathname).sort(), ['/api/health', '/api/version']);

const detachedCombatShellPages = new Map(pagesFiles);
const detachedShellBody = 'export const shell = true;';
detachedCombatShellPages.set('online-world-shell-v900.mjs', detachedShellBody);
const detachedManifest = JSON.parse(detachedCombatShellPages.get('patch-manifest.json'));
detachedManifest.files.find(entry => entry.path === 'online-world-shell-v900.mjs').sha256 = crypto
  .createHash('sha256').update(detachedShellBody).digest('hex');
detachedCombatShellPages.set('patch-manifest.json', JSON.stringify(detachedManifest));
await assert.rejects(
  verifyLiveV9Deployment({
    target: 'pages',
    baseUrl: PAGES_BASE,
    expectedSha: SHA,
    expectedApiBaseUrl: API_BASE,
    fetchImpl: mappedFetch(PAGES_BASE, detachedCombatShellPages),
    attempts: 1,
    retryDelayMs: 0,
  }),
  /must import and install combat-v91-entry\.mjs/,
);

const leakedCombatServerPages = new Map(pagesFiles);
const leakedManifest = JSON.parse(leakedCombatServerPages.get('patch-manifest.json'));
leakedManifest.files.push({
  path: 'combat-v91-server-authority.mjs',
  sha256: crypto.createHash('sha256').update('server-only').digest('hex'),
});
leakedCombatServerPages.set('patch-manifest.json', JSON.stringify(leakedManifest));
await assert.rejects(
  verifyLiveV9Deployment({
    target: 'pages',
    baseUrl: PAGES_BASE,
    expectedSha: SHA,
    expectedApiBaseUrl: API_BASE,
    fetchImpl: mappedFetch(PAGES_BASE, leakedCombatServerPages),
    attempts: 1,
    retryDelayMs: 0,
  }),
  /must not publish server-only Combat module combat-v91-server-authority\.mjs/,
);

const backendCliFetch = mappedFetch(PAGES_BASE, new Map());
const backendCliLogs = [];
const backendCliResult = await runDeploymentVerifierCli('backend', {
  env: {
    MONSTERLIFE_EXPECTED_SHA: SHA,
    MONSTERLIFE_EXPECTED_API_BASE_URL: API_BASE,
  },
  fetchImpl: backendCliFetch,
  logger: message => backendCliLogs.push(message),
  runtimeConfig: runtimeConfig(),
});
assert.equal(backendCliResult.target, 'backend');
assert.deepEqual(backendCliFetch.calls.map(value => new URL(value).pathname).sort(), ['/api/health', '/api/version']);
assert.equal(backendCliLogs.length, 1, 'backend CLI reports once and terminates without entering a deployment target');

await assert.rejects(
  verifyRuntimeBackend({ ...runtimeConfig(), healthPath: undefined }, {
    expectedApiBaseUrl: API_BASE,
    fetchImpl: mappedFetch(PAGES_BASE, pagesFiles),
    attempts: 1,
    retryDelayMs: 0,
  }),
  /healthPath must equal/,
);

const firebaseFiles = new Map([
  ['runtime-config.json', JSON.stringify(runtimeConfig())],
  ['index.html', `<script type="module" src="./firebase-launcher-entry.mjs"></script><link href="${PAGES_BASE}style-v900.css">`],
  ['firebase-launcher-entry.mjs', "await fetch('./runtime-config.json', { cache: 'no-store' });"],
]);
const firebaseFetch = mappedFetch(FIREBASE_BASE, firebaseFiles);
await verifyLiveV9Deployment({
  target: 'firebase',
  baseUrl: FIREBASE_BASE,
  expectedSha: SHA,
  expectedApiBaseUrl: API_BASE,
  expectedAssetBaseUrl: PAGES_BASE,
  fetchImpl: firebaseFetch,
  attempts: 1,
  retryDelayMs: 0,
});

const localCombatCssFirebase = new Map(firebaseFiles);
localCombatCssFirebase.set('index.html', `${firebaseFiles.get('index.html')}<link href="./combat-v91.css?v=1">`);
await assert.rejects(
  verifyLiveV9Deployment({
    target: 'firebase',
    baseUrl: FIREBASE_BASE,
    expectedSha: SHA,
    expectedApiBaseUrl: API_BASE,
    expectedAssetBaseUrl: PAGES_BASE,
    fetchImpl: mappedFetch(FIREBASE_BASE, localCombatCssFirebase),
    attempts: 1,
    retryDelayMs: 0,
  }),
  /must not load the Pages-only Combat stylesheet locally/,
);

const unsafePages = new Map(pagesFiles);
unsafePages.set('runtime-config.json', JSON.stringify(runtimeConfig({ vpsWrites: true })));
await assert.rejects(
  verifyLiveV9Deployment({
    target: 'pages', baseUrl: PAGES_BASE, expectedSha: SHA, expectedApiBaseUrl: API_BASE,
    fetchImpl: mappedFetch(PAGES_BASE, unsafePages), attempts: 1, retryDelayMs: 0,
  }),
  /vpsWrites must be false/,
);

const unsafeEconomyPages = new Map(pagesFiles);
unsafeEconomyPages.set('runtime-config.json', JSON.stringify(runtimeConfig({ economyMutation: true })));
await assert.rejects(
  verifyLiveV9Deployment({
    target: 'pages', baseUrl: PAGES_BASE, expectedSha: SHA, expectedApiBaseUrl: API_BASE,
    fetchImpl: mappedFetch(PAGES_BASE, unsafeEconomyPages), attempts: 1, retryDelayMs: 0,
  }),
  /economyMutation must be false/,
);

const staleFirebase = new Map(firebaseFiles);
staleFirebase.set('runtime-config.json', JSON.stringify({ ...runtimeConfig(), deployedRelease: '8.4.0-github.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }));
await assert.rejects(
  verifyLiveV9Deployment({
    target: 'firebase', baseUrl: FIREBASE_BASE, expectedSha: SHA, expectedApiBaseUrl: API_BASE,
    fetchImpl: mappedFetch(FIREBASE_BASE, staleFirebase), attempts: 1, retryDelayMs: 0,
  }),
  /deployedRelease must equal/,
);

for (const [label, config, pattern] of [
  ['API mismatch', runtimeConfig({}, { apiBaseUrl: 'https://other.example.test' }), /apiBaseUrl must equal/],
  ['WebSocket mismatch', runtimeConfig({}, { webSocketUrl: 'wss://other.example.test/ws/chat' }), /webSocketUrl must equal/],
]) {
  const files = new Map(firebaseFiles);
  files.set('runtime-config.json', JSON.stringify(config));
  await assert.rejects(
    verifyLiveV9Deployment({
      target: 'firebase', baseUrl: FIREBASE_BASE, expectedSha: SHA, expectedApiBaseUrl: API_BASE,
      expectedAssetBaseUrl: PAGES_BASE, fetchImpl: mappedFetch(FIREBASE_BASE, files), attempts: 1, retryDelayMs: 0,
    }),
    pattern,
    label,
  );
}

for (const [label, backend, pattern] of [
  ['offline', { healthPayload: { status: 'not_ready', maintenance: false, apiVersion: '1.1' }, healthStatus: 503 }, /backend gate must be healthy.*offline/i],
  ['maintenance', { healthPayload: { status: 'ready', maintenance: true, apiVersion: '1.1' } }, /backend gate must be healthy.*maintenance/i],
  ['incompatible', { versionPayload: { apiVersion: '1.1', minimumClientVersion: '9.0.0', saveSchemaVersion: 1, deployedRelease: SERVER_RELEASE } }, /backend gate must be healthy.*incompatible/i],
  ['header mismatch', { apiHeader: '1.0' }, /backend gate must be healthy.*invalid/i],
]) {
  await assert.rejects(
    verifyLiveV9Deployment({
      target: 'pages', baseUrl: PAGES_BASE, expectedSha: SHA, expectedApiBaseUrl: API_BASE,
      fetchImpl: mappedFetch(PAGES_BASE, pagesFiles, backend), attempts: 1, retryDelayMs: 0,
    }),
    pattern,
    label,
  );
}

const mismatchedAssetFirebase = new Map(firebaseFiles);
mismatchedAssetFirebase.set('runtime-config.json', JSON.stringify(runtimeConfig({}, { assetBaseUrl: 'https://other-assets.example.test/' })));
await assert.rejects(
  verifyLiveV9Deployment({
    target: 'firebase', baseUrl: FIREBASE_BASE, expectedSha: SHA, expectedApiBaseUrl: API_BASE,
    expectedAssetBaseUrl: PAGES_BASE, fetchImpl: mappedFetch(FIREBASE_BASE, mismatchedAssetFirebase), attempts: 1, retryDelayMs: 0,
  }),
  /assetBaseUrl must equal/,
);

const verifierSource = fs.readFileSync(new URL('../scripts/verify-live-v9-deployment.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(verifierSource, /process\.exit\s*\(/, 'deployment verifier must let fetch handles shut down naturally');

console.log('V9 deployment gates: PASS');
