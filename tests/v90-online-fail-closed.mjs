import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scenario = process.argv[2] || '';
if (!scenario) {
  for (const name of [
    'launch-disabled',
    'invalid-manifest',
    'expired-session',
    'server-offline',
    'server-maintenance',
    'server-incompatible',
    'server-invalid',
  ]) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), name], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${name} failed\n${result.stdout}\n${result.stderr}`);
  }
  console.log('V9 online entry fail-closed gate: PASS');
  process.exit(0);
}

const events = new EventTarget();
globalThis.window = globalThis;
window.addEventListener = events.addEventListener.bind(events);
window.removeEventListener = events.removeEventListener.bind(events);
window.dispatchEvent = events.dispatchEvent.bind(events);
globalThis.CustomEvent = class extends Event {
  constructor(type, options) { super(type); this.detail = options?.detail; }
};

let redirectedTo = null;
globalThis.location = {
  href: 'https://game.example/index.html',
  origin: 'https://game.example',
  pathname: '/index.html',
  search: '',
  replace(value) { redirectedTo = value; },
};
globalThis.history = { replaceState() {} };
globalThis.__POCKETMONSTER_CLEAN_LAUNCH__ = Object.freeze({
  ticket: null,
  state: null,
  verifier: null,
  invalid: false,
});

const values = new Map();
if (scenario === 'expired-session') {
  values.set('monsterlife.session.v1', JSON.stringify({
    sessionToken: 'expired-session',
    expiresAtUtc: '2000-01-01T00:00:00Z',
  }));
}
const isServerFailure = scenario.startsWith('server-');
if (isServerFailure) {
  values.set('monsterlife.session.v1', JSON.stringify({
    sessionToken: 'valid-session-must-survive-transient-server-failure',
    expiresAtUtc: '2099-01-01T00:00:00Z',
  }));
}
globalThis.sessionStorage = {
  getItem(key) { return values.get(key) || null; },
  setItem(key, value) { values.set(key, value); },
  removeItem(key) { values.delete(key); },
};

const status = { textContent: '', className: '' };
let iframeCreates = 0;
globalThis.document = {
  documentElement: { dataset: {} },
  getElementById(id) { return id === 'startupStatus' ? status : null; },
  createElement(tag) { if (tag === 'iframe') iframeCreates += 1; return {}; },
};

let socketCreates = 0;
globalThis.WebSocket = class {
  constructor() { socketCreates += 1; }
};

const baseManifest = {
  configVersion: 1,
  environment: 'hybrid',
  apiBaseUrl: 'https://server.example',
  webSocketUrl: 'wss://server.example/ws/chat',
  apiVersion: '1.1',
  minimumClientVersion: '8.3.0',
  healthPath: '/api/health',
  versionPath: '/api/version',
  saveSchemaVersion: 1,
  featureFlags: {
    vpsEnabled: true,
    vpsReads: true,
    vpsWrites: false,
    playerDataWrites: false,
    firebaseFallback: false,
    launchTicket: scenario !== 'launch-disabled',
  },
};
if (scenario === 'invalid-manifest') baseManifest.configVersion = 99;
window.__POCKETMONSTER_RUNTIME_MANIFEST__ = baseManifest;

const release = {
  version: '8.4.0-test',
  commitSha: '0123456789abcdef0123456789abcdef01234567',
  builtAtUtc: '2026-08-30T00:00:00Z',
};
const response = (payload, status = 200, apiVersion = '1.1') => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: name => name === 'X-API-Version' ? apiVersion : null },
  json: async () => payload,
});
const fetchUrls = [];
globalThis.fetch = async input => {
  const url = new URL(String(input));
  fetchUrls.push(url.href);
  assert.ok(isServerFailure, `${scenario} must not fetch before the online session gate`);
  const health = {
    status: scenario === 'server-offline' ? 'not_ready' : 'ready',
    maintenance: scenario === 'server-maintenance',
    apiVersion: '1.1',
  };
  const version = {
    apiVersion: '1.1',
    minimumClientVersion: scenario === 'server-incompatible' ? '9.0.0' : '8.3.0',
    saveSchemaVersion: 1,
    deployedRelease: release,
  };
  if (scenario === 'server-invalid' && url.pathname.endsWith('/api/version')) {
    return response({ malformed: true });
  }
  if (url.pathname.endsWith('/api/health')) {
    return response(health, scenario === 'server-offline' ? 503 : 200);
  }
  if (url.pathname.endsWith('/api/version')) return response(version);
  assert.fail(`Server failure must stop before patch/shell fetch: ${url.href}`);
};

let error = null;
try {
  await import(`../entry-preload-v900.mjs?fail-closed=${scenario}-${Date.now()}`);
} catch (caught) {
  error = caught;
}
assert.ok(error, `${scenario} must reject before the online shell starts`);
assert.equal(iframeCreates, 0, 'failed online boot cannot create a scene iframe');
assert.equal(socketCreates, 0, 'failed online boot cannot create a WebSocket');
assert.equal('POCKETMONSTER_ONLINE_SHELL' in window, false);
if (isServerFailure) {
  assert.equal(error.code, 'ONLINE_SERVER_REQUIRED');
  assert.equal(fetchUrls.length, 2, 'parent gate checks health and version exactly once each');
  assert.deepEqual(fetchUrls.map(value => new URL(value).pathname).sort(), ['/api/health', '/api/version']);
  assert.equal(values.has('monsterlife.session.v1'), true, 'valid session survives transient Server failure for refresh/retry');
  assert.equal(window.POCKETMONSTER_LAUNCH_SESSION?.sessionToken, 'valid-session-must-survive-transient-server-failure');
  assert.equal(redirectedTo, null, 'transient Server failure stays on the fail-closed status instead of changing worlds');
  assert.match(status.className, /error/);
  assert.match(status.textContent, /Server|เซิร์ฟเวอร์|ออนไลน์/i);
} else {
  assert.equal(fetchUrls.length, 0, 'config/session failures occur before Server preflight');
  assert.equal(values.has('monsterlife.session.v1'), false, 'failed online boot clears stale tab session state');
}
if (scenario === 'expired-session') {
  assert.equal(redirectedTo, 'https://pocketmonster-game.web.app/');
} else if (!isServerFailure) {
  assert.equal(error.code, 'ONLINE_CONFIG_REQUIRED');
  assert.match(status.className, /error/);
}
