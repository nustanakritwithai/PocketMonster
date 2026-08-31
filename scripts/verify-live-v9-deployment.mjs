import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { healthVersionGate } from '../server-sync.mjs';

const PRODUCTION_PAGES_URL = 'https://nustanakritwithai.github.io/PocketMonster/';
const PRODUCTION_FIREBASE_URL = 'https://pocketmonster-game.web.app/';
const PRODUCTION_API_URL = 'https://157.85.96.139';
const SAFE_FALSE_FLAGS = Object.freeze([
  'vpsWrites',
  'playerDataWrites',
  'firebaseFallback',
  'accountMigration',
  'saveMigration',
  'economyMutation',
]);

export const PAGES_LIVE_SMOKE_FILES = Object.freeze([
  'runtime-config.json',
  'index.html',
  'v900.html',
  'scene-v900.html',
  'entry-preload-v900.mjs',
  'launch-bootstrap.mjs',
  'server-sync.mjs',
  'online-world-shell-v900.mjs',
  'online-world-bridge-v900.mjs',
  'scene-entry-v900.mjs',
  'worlds-v900.mjs',
  'combined-worlds-v900.mjs',
  'chat-runtime.mjs',
  'style-v900.css',
  'game-v800.js',
  'boot-pirate-fruit-v900.mjs',
  'world-living-v900.mjs',
  'pirate-fruit-offline/index.html',
  'pirate-fruit-offline/pocket-bootstrap.mjs',
  'pirate-save-bridge-v900.mjs',
  'pirate-fruit-offline/assets/index-C3SJLfq8.js',
  'pirate-fruit-offline/assets/vendor-three-Bv6LZXUZ.js',
]);

function secureBaseUrl(value, label) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must be a credential-free HTTPS base URL`);
  }
  return `${url.href.replace(/\/+$/, '')}/`;
}

function secureApiBaseUrl(value, label = 'expected API base URL') {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !['', '/'].includes(url.pathname)) {
    throw new Error(`${label} must be a credential-free HTTPS origin`);
  }
  return url.origin;
}

function expectedWebSocketUrl(apiBaseUrl) {
  const url = new URL(apiBaseUrl);
  return `wss://${url.host}/ws/chat`;
}

function validateExpectedSha(value) {
  const sha = String(value || '').trim().toLowerCase();
  if (!/^[a-f\d]{40}$/.test(sha)) throw new Error('MONSTERLIFE_EXPECTED_SHA must be a full 40-character Git commit SHA');
  return sha;
}

function wait(milliseconds) {
  return milliseconds > 0 ? new Promise(resolve => setTimeout(resolve, milliseconds)) : Promise.resolve();
}

async function fetchLiveText(relative, {
  baseUrl,
  expectedSha,
  fetchImpl,
  attempts,
  retryDelayMs,
  fetchTimeoutMs,
  validate,
}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const url = new URL(relative, baseUrl);
    url.searchParams.set('__monsterlife_verify', `${expectedSha}-${attempt}`);
    try {
      const options = {
        cache: 'no-store',
        headers: { Accept: relative.endsWith('.json') ? 'application/json' : '*/*' },
      };
      if (typeof AbortSignal?.timeout === 'function') options.signal = AbortSignal.timeout(fetchTimeoutMs);
      const response = await fetchImpl(url, options);
      if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'unknown'}`);
      const body = await response.text();
      if (validate) await validate(body);
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(retryDelayMs);
    }
  }
  throw new Error(`Live verification failed for ${relative}: ${lastError?.message || lastError}`);
}

function parseJson(body, label) {
  try { return JSON.parse(body); } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
}

function validateRuntimeConfig(config, expectedSha, expectedApiBaseUrl) {
  const expectedRelease = `8.4.0-github.${expectedSha}`;
  if (config?.deployedRelease !== expectedRelease) throw new Error(`deployedRelease must equal ${expectedRelease}`);
  const checkedApiBase = secureApiBaseUrl(expectedApiBaseUrl);
  if (config?.apiBaseUrl !== checkedApiBase) throw new Error(`apiBaseUrl must equal ${checkedApiBase}`);
  const checkedWebSocket = expectedWebSocketUrl(checkedApiBase);
  if (config?.webSocketUrl !== checkedWebSocket) throw new Error(`webSocketUrl must equal ${checkedWebSocket}`);
  if (config?.healthPath !== '/api/health') throw new Error('healthPath must equal /api/health');
  if (config?.versionPath !== '/api/version') throw new Error('versionPath must equal /api/version');
  if (config?.featureFlags?.vpsEnabled !== true) throw new Error('vpsEnabled must be true');
  if (config?.featureFlags?.vpsReads !== true) throw new Error('vpsReads must be true');
  if (config?.featureFlags?.launchTicket !== true) throw new Error('launchTicket must be true');
  for (const flag of SAFE_FALSE_FLAGS) {
    if (config?.featureFlags?.[flag] !== false) throw new Error(`${flag} must be false`);
  }
  return config;
}

function sha256(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}

export async function verifyRuntimeBackend(runtimeConfig, {
  expectedApiBaseUrl,
  fetchImpl = globalThis.fetch,
  attempts = 3,
  retryDelayMs = 2_000,
  fetchTimeoutMs = 15_000,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
  const checkedApiBase = secureApiBaseUrl(expectedApiBaseUrl);
  if (runtimeConfig?.apiBaseUrl !== checkedApiBase) throw new Error(`apiBaseUrl must equal ${checkedApiBase}`);
  if (runtimeConfig?.healthPath !== '/api/health') throw new Error('healthPath must equal /api/health');
  if (runtimeConfig?.versionPath !== '/api/version') throw new Error('versionPath must equal /api/version');
  let lastGate = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastGate = await healthVersionGate(runtimeConfig, {
      fetchImpl,
      timeoutMs: fetchTimeoutMs,
      correlationId: `v9-deployment-backend-${attempt}`,
    });
    if (lastGate.state === 'healthy') return lastGate;
    if (attempt < attempts) await wait(retryDelayMs);
  }
  throw new Error(`Monster Life backend gate must be healthy; received ${lastGate?.state || 'invalid'} (${lastGate?.reason || 'unknown'})`);
}

async function verifyPages(options, runtimeConfig) {
  const manifestBody = await fetchLiveText('patch-manifest.json', options);
  const manifest = parseJson(manifestBody, 'patch-manifest.json');
  if (!Array.isArray(manifest?.files)) throw new Error('patch-manifest.json must contain a files array');
  const entries = new Map();
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== 'string' || !/^[a-f\d]{64}$/i.test(entry.sha256 || '')) {
      throw new Error('patch-manifest.json contains an invalid file entry');
    }
    if (entries.has(entry.path)) throw new Error(`patch-manifest.json contains duplicate path ${entry.path}`);
    entries.set(entry.path, entry);
  }

  const bodies = new Map();
  for (const relative of PAGES_LIVE_SMOKE_FILES) {
    const entry = entries.get(relative);
    if (!entry) throw new Error(`patch-manifest.json is missing ${relative}`);
    const body = await fetchLiveText(relative, {
      ...options,
      validate(value) {
        const actual = sha256(value);
        if (actual !== entry.sha256.toLowerCase()) throw new Error(`manifest hash mismatch for ${relative}`);
      },
    });
    bodies.set(relative, body);
  }

  validateRuntimeConfig(parseJson(bodies.get('runtime-config.json'), 'runtime-config.json'), options.expectedSha, options.expectedApiBaseUrl);
  for (const entry of ['index.html', 'v900.html']) {
    if (!bodies.get(entry).includes('entry-preload-v900.mjs')) throw new Error(`${entry} must boot entry-preload-v900.mjs`);
  }
  if (!bodies.get('scene-v900.html').includes('scene-entry-v900.mjs')) throw new Error('scene-v900.html must boot scene-entry-v900.mjs');
  if (!bodies.get('pirate-fruit-offline/index.html').includes('pocket-bootstrap.mjs?v=1')) {
    throw new Error('Pirate Fruit entry must boot its isolated save bootstrap');
  }
  const pirateBootstrap = bodies.get('pirate-fruit-offline/pocket-bootstrap.mjs');
  if (!pirateBootstrap.includes('await installPirateSaveSandbox();')
    || !pirateBootstrap.includes("await import('./assets/index-C3SJLfq8.js')")) {
    throw new Error('Pirate Fruit bootstrap must install its save sandbox before the vendored scene bundle');
  }
  return { runtimeConfig, manifest };
}

async function verifyFirebase(options, runtimeConfig, expectedAssetBaseUrl) {
  const [index, launcher] = await Promise.all([
    fetchLiveText('index.html', options),
    fetchLiveText('firebase-launcher-entry.mjs', options),
  ]);
  if (!index.includes('firebase-launcher-entry.mjs')) throw new Error('Firebase index must boot firebase-launcher-entry.mjs');
  if (index.includes('src="./entry-preload-v900.mjs')) throw new Error('Firebase index must not boot the V9 game locally');
  if (!launcher.includes('runtime-config.json')) throw new Error('Firebase launcher must load runtime-config.json');
  if (expectedAssetBaseUrl) {
    const expectedAssetBase = secureBaseUrl(expectedAssetBaseUrl, 'expected asset base URL');
    const configuredAssetBase = secureBaseUrl(runtimeConfig?.assetBaseUrl, 'runtime asset base URL');
    if (configuredAssetBase !== expectedAssetBase) throw new Error(`assetBaseUrl must equal ${expectedAssetBase}`);
    if (!index.includes(expectedAssetBase)) throw new Error('Firebase index must load game styles from the verified Pages origin');
  }
  return { runtimeConfig };
}

export async function verifyLiveV9Deployment({
  target,
  baseUrl,
  expectedSha,
  expectedApiBaseUrl,
  expectedAssetBaseUrl = '',
  fetchImpl = globalThis.fetch,
  attempts = 12,
  retryDelayMs = 5_000,
  fetchTimeoutMs = 15_000,
} = {}) {
  if (!['pages', 'firebase'].includes(target)) throw new Error('Deployment target must be pages or firebase');
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
  const checkedSha = validateExpectedSha(expectedSha);
  const checkedBaseUrl = secureBaseUrl(baseUrl, 'deployment base URL');
  const checkedApiBaseUrl = secureApiBaseUrl(expectedApiBaseUrl);
  const options = {
    baseUrl: checkedBaseUrl,
    expectedSha: checkedSha,
    expectedApiBaseUrl: checkedApiBaseUrl,
    fetchImpl,
    attempts,
    retryDelayMs,
    fetchTimeoutMs,
  };
  const runtimeBody = await fetchLiveText('runtime-config.json', {
    ...options,
    validate(body) { validateRuntimeConfig(parseJson(body, 'runtime-config.json'), checkedSha, checkedApiBaseUrl); },
  });
  const runtimeConfig = validateRuntimeConfig(parseJson(runtimeBody, 'runtime-config.json'), checkedSha, checkedApiBaseUrl);
  await verifyRuntimeBackend(runtimeConfig, {
    expectedApiBaseUrl: checkedApiBaseUrl,
    fetchImpl,
    attempts,
    retryDelayMs,
    fetchTimeoutMs,
  });
  return target === 'pages'
    ? verifyPages(options, runtimeConfig)
    : verifyFirebase(options, runtimeConfig, expectedAssetBaseUrl);
}

export async function runDeploymentVerifierCli(target, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = message => console.log(message),
  runtimeConfig: providedRuntimeConfig = null,
} = {}) {
  const expectedSha = env.MONSTERLIFE_EXPECTED_SHA;
  const expectedApiBaseUrl = env.MONSTERLIFE_EXPECTED_API_BASE_URL
    || env.MONSTERLIFE_READONLY_ORIGIN
    || PRODUCTION_API_URL;
  if (target === 'backend') {
    const runtimeConfig = providedRuntimeConfig || parseJson(
      fs.readFileSync(new URL('../runtime-config.json', import.meta.url), 'utf8'),
      'runtime-config.json',
    );
    validateRuntimeConfig(runtimeConfig, validateExpectedSha(expectedSha), expectedApiBaseUrl);
    const gate = await verifyRuntimeBackend(runtimeConfig, { expectedApiBaseUrl, fetchImpl });
    logger(`Verified Monster Life backend for release ${expectedSha}`);
    return Object.freeze({ target, gate });
  }
  const baseUrl = env.MONSTERLIFE_DEPLOYMENT_BASE_URL
    || (target === 'pages' ? PRODUCTION_PAGES_URL : PRODUCTION_FIREBASE_URL);
  const expectedAssetBaseUrl = target === 'firebase'
    ? (env.MONSTERLIFE_EXPECTED_ASSET_BASE_URL || PRODUCTION_PAGES_URL)
    : '';
  const result = await verifyLiveV9Deployment({
    target,
    baseUrl,
    expectedSha,
    expectedApiBaseUrl,
    expectedAssetBaseUrl,
    fetchImpl,
  });
  logger(`Verified live ${target} release ${expectedSha}`);
  return Object.freeze({ target, result });
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  await runDeploymentVerifierCli(process.argv[2]);
}
