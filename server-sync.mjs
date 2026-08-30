import { runtimeWritePolicy } from './runtime-config.mjs';

export const SERVER_GATE_STATES = Object.freeze(['disabled', 'healthy', 'maintenance', 'offline', 'incompatible', 'invalid']);

const ONLINE_WORLD_SHELL_KIND = 'monsterlife-online-world-shell-v1';
const EMBEDDED_RUNTIME_KEYS = Object.freeze([
  'configVersion',
  'environment',
  'apiBaseUrl',
  'webSocketUrl',
  'apiVersion',
  'minimumClientVersion',
  'healthPath',
  'versionPath',
  'saveSchemaVersion',
  'manifestValid',
]);
const EMBEDDED_FLAG_KEYS = Object.freeze([
  'vpsEnabled',
  'vpsReads',
  'vpsWrites',
  'playerDataWrites',
  'firebaseFallback',
  'launchTicket',
]);
const DISABLED_EMBEDDED_WRITE_POLICY = Object.freeze({
  playerDataWrites: false,
  accountMigration: false,
  saveMigration: false,
  economyMutation: false,
  enabled: false,
});
const INVALID_EMBEDDED_SERVER_GATE = Object.freeze({
  state: 'invalid',
  reason: 'embedded-server-gate-unavailable',
  correlationId: '',
  latencyMs: 0,
  allowFirebaseFallback: false,
  allowPlayerDataWrites: false,
  writePolicy: DISABLED_EMBEDDED_WRITE_POLICY,
});

function sameEmbeddedRuntimeContract(config, parentConfig) {
  if (!config || !parentConfig) return false;
  for (const key of EMBEDDED_RUNTIME_KEYS) {
    if (!Object.is(config[key], parentConfig[key])) return false;
  }
  for (const key of EMBEDDED_FLAG_KEYS) {
    if (!Object.is(config.featureFlags?.[key], parentConfig.featureFlags?.[key])) return false;
  }
  return true;
}

function inheritedEmbeddedServerGate(config) {
  const child = globalThis.window;
  if (child?.POCKETMONSTER_SCENE_EMBEDDED !== true) return null;
  try {
    const parent = child.parent;
    const parentConfig = parent?.POCKETMONSTER_RUNTIME_CONFIG;
    const parentGate = parent?.POCKETMONSTER_SERVER_GATE;
    const exactHostedScene = parent
      && parent !== child
      && child.location?.origin === parent.location?.origin
      && parent.POCKETMONSTER_ONLINE_SHELL?.kind === ONLINE_WORLD_SHELL_KIND;
    const exactCapabilities = child.POCKETMONSTER_LAUNCH_SESSION === parent?.POCKETMONSTER_LAUNCH_SESSION
      && child.POCKETMONSTER_RUNTIME_CONFIG === parentConfig
      && child.__POCKETMONSTER_RUNTIME_MANIFEST__ === parentConfig
      && child.POCKETMONSTER_SERVER_GATE === parentGate;
    const healthyReadOnlyGate = Object.isFrozen(parentGate)
      && parentGate?.state === 'healthy'
      && parentGate.allowFirebaseFallback === false
      && parentGate.allowPlayerDataWrites === false
      && parentGate.writePolicy?.enabled === false;
    if (exactHostedScene && exactCapabilities && healthyReadOnlyGate && sameEmbeddedRuntimeContract(config, parentConfig)) {
      return parentGate;
    }
  } catch {
    // Embedded scenes are never allowed to recover by contacting another Server.
  }
  return INVALID_EMBEDDED_SERVER_GATE;
}

function defaultClock() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function joinUrl(base, path) {
  if (!base) return path;
  return new URL(path, `${base.replace(/\/$/, '')}/`).toString();
}

async function serverMutation(config, sessionToken, path, body, { fetchImpl = globalThis.fetch } = {}) {
  if (!config?.apiBaseUrl || !sessionToken) throw Object.assign(new Error('Server player session is unavailable'), { code: 'SERVER_SESSION_UNAVAILABLE' });
  const response = await fetchImpl(joinUrl(config.apiBaseUrl, path), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}`, 'X-API-Version': config.apiVersion, ...(globalThis.window?.POCKETMONSTER_SERVER_CATALOG_VERSION ? { 'X-Catalog-Version': globalThis.window.POCKETMONSTER_SERVER_CATALOG_VERSION } : {}) },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const payload = await readJson(response) || { success: false, message: 'Invalid server response' };
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || `MonsterLife mutation failed (${response.status})`);
    error.code = payload.errorCode || 'MUTATION_REJECTED';
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function consumeInventory(config, sessionToken, itemId, amount, reason, options = {}) {
  return serverMutation(config, sessionToken, '/api/player/inventory/consume', { itemId, amount, reason }, options);
}

export async function setMonsterEquipment(config, sessionToken, instanceId, itemId, slot, unequip = false, options = {}) {
  return serverMutation(config, sessionToken, '/api/player/equipment', { instanceId, itemId, slot, unequip }, options);
}

export async function learnMonsterSkill(config, sessionToken, instanceId, skillId, slot, options = {}) {
  return serverMutation(config, sessionToken, '/api/player/skills/learn', { instanceId, skillId, slot }, options);
}

export async function learnMonsterSkillFromItem(config, sessionToken, instanceId, itemId, slot, commandId, options = {}) {
  return serverMutation(config, sessionToken, '/api/player/skills/learn-item', { instanceId, itemId, slot, commandId }, options);
}

export async function applyMonsterAction(config, sessionToken, instanceId, action, value, options = {}) {
  return serverMutation(config, sessionToken, '/api/player/monster-action', { instanceId, action, value }, options);
}

export async function redeemItemCode(config, sessionToken, code, options = {}) {
  return serverMutation(config, sessionToken, '/api/item-code/redeem', { code }, options);
}

function parseVersion(value) {
  const match = typeof value === 'string' && value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1, 4).map(Number) : null;
}

export function compareSemanticVersions(left, right) {
  const a = parseVersion(left); const b = parseVersion(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  return 0;
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const status = typeof payload.status === 'string' ? payload.status.toLowerCase() : '';
  const release = payload.deployedRelease ?? payload.deployed_release ?? payload.release ?? payload.version?.deployedRelease;
  return {
    status,
    maintenance: payload.maintenance === true,
    apiVersion: payload.apiVersion ?? payload.api_version ?? payload.version?.apiVersion ?? '',
    minimumClientVersion: payload.minimumClientVersion ?? payload.minimum_client_version ?? '',
    saveSchemaVersion: payload.saveSchemaVersion ?? payload.save_schema_version,
    deployedRelease: release,
  };
}

function validRelease(release) {
  return Boolean(release && typeof release === 'object' && !Array.isArray(release)
    && typeof release.version === 'string' && release.version
    && typeof release.commitSha === 'string' && /^[a-f0-9]{40}$/i.test(release.commitSha)
    && typeof release.builtAtUtc === 'string' && release.builtAtUtc);
}

function compatible(server, config) {
  if (!server || server.status !== 'ready' || server.maintenance) return false;
  if (!server.apiVersion || (config.apiVersion && server.apiVersion !== config.apiVersion)) return false;
  const versionResult = compareSemanticVersions(config.minimumClientVersion, server.minimumClientVersion);
  if (server.minimumClientVersion && versionResult === null) return false;
  if (versionResult !== null && versionResult < 0) return false;
  if (server.saveSchemaVersion === undefined || Number(server.saveSchemaVersion) !== Number(config.saveSchemaVersion)) return false;
  return validRelease(server.deployedRelease);
}

async function readJson(response) {
  try { return await response.json(); } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return null;
  }
}

export async function requestServerContract(config, { fetchImpl = globalThis.fetch, signal, timeoutMs = 5000, correlationId = `pm-${Date.now().toString(36)}` } = {}) {
  if (!config?.featureFlags?.vpsEnabled || !config?.featureFlags?.vpsReads) return { state: 'disabled', reason: 'vps-read-disabled', correlationId };
  if (typeof fetchImpl !== 'function') return { state: 'offline', reason: 'fetch-unavailable', correlationId };
  if (signal?.aborted) return { state: 'offline', reason: 'timeout', correlationId };
  const controller = new AbortController();
  let rejectAbort;
  const abortPromise = new Promise((_, reject) => { rejectAbort = reject; });
  const createAbortError = message => {
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
  };
  const abortRequest = message => {
    controller.abort();
    rejectAbort(createAbortError(message));
  };
  const timer = setTimeout(() => abortRequest('request timeout'), timeoutMs);
  const callerAbort = () => abortRequest('request aborted');
  if (signal?.aborted) callerAbort();
  else signal?.addEventListener?.('abort', callerAbort, { once: true });
  const headers = { Accept: 'application/json', 'X-Request-Id': correlationId, 'X-Game-Version': '8.4.0' };
  try {
    const guardedFetch = url => Promise.resolve().then(() => {
      if (controller.signal.aborted) throw createAbortError('request aborted');
      return fetchImpl(url, { method: 'GET', headers, signal: controller.signal, cache: 'no-store' });
    });
    const healthUrl = joinUrl(config.apiBaseUrl, config.healthPath);
    const versionUrl = joinUrl(config.apiBaseUrl, config.versionPath);
    const contractRequest = Promise.all([
      guardedFetch(healthUrl),
      guardedFetch(versionUrl),
    ]).then(async ([healthResponse, versionResponse]) => {
      const [healthPayload, versionPayload] = await Promise.all([readJson(healthResponse), readJson(versionResponse)]);
      return { healthResponse, versionResponse, healthPayload, versionPayload };
    });
    const {
      healthResponse,
      versionResponse,
      healthPayload,
      versionPayload,
    } = await Promise.race([
      contractRequest,
      abortPromise,
    ]);
    const health = normalizePayload(healthPayload);
    const version = normalizePayload(versionPayload);
    if (!health || !version || !['ready', 'not_ready'].includes(health.status) || !version.apiVersion) {
      return { state: 'invalid', reason: 'malformed-payload', correlationId };
    }
    const healthApiResponseVersion = healthResponse.headers?.get?.('X-API-Version') || '';
    const versionApiResponseVersion = versionResponse.headers?.get?.('X-API-Version') || '';
    const server = { ...health, ...version, status: health.status, maintenance: health.maintenance || version.maintenance, healthApiResponseVersion, versionApiResponseVersion };
    if (config.apiVersion && healthApiResponseVersion !== config.apiVersion) return { state: 'invalid', reason: 'health-api-version-header-mismatch', server, correlationId };
    if (config.apiVersion && versionApiResponseVersion !== config.apiVersion) return { state: 'invalid', reason: 'version-api-version-header-mismatch', server, correlationId };
    if (server.maintenance) return { state: 'maintenance', server, correlationId };
    if (healthResponse.status === 503 || versionResponse.status === 503 || health.status !== 'ready') return { state: 'offline', reason: health.status === 'not_ready' ? 'server-not-ready' : `http-${Math.max(healthResponse.status, versionResponse.status)}`, server, correlationId };
    if (!healthResponse.ok || !versionResponse.ok) return { state: 'offline', reason: `http-${Math.max(healthResponse.status, versionResponse.status)}`, server, correlationId };
    if (!compatible(server, config)) return { state: 'incompatible', reason: validRelease(server.deployedRelease) ? 'version-incompatible' : 'release-unverified', server, correlationId };
    return { state: 'healthy', server, correlationId };
  } catch (error) {
    return { state: error?.name === 'AbortError' ? 'offline' : 'invalid', reason: error?.name === 'AbortError' ? 'timeout' : 'request-failed', correlationId };
  } finally {
    clearTimeout(timer);
    if (!controller.signal.aborted) controller.abort();
    signal?.removeEventListener?.('abort', callerAbort);
  }
}

export async function healthVersionGate(config, options = {}) {
  const inheritedGate = inheritedEmbeddedServerGate(config);
  if (inheritedGate) return inheritedGate;
  const clock = typeof options.clock === 'function' ? options.clock : defaultClock;
  const startedAt = clock();
  const result = await requestServerContract(config, options);
  const fallback = config?.featureFlags?.firebaseFallback !== false;
  const latencyMs = Math.max(0, Math.round(clock() - startedAt));
  const writePolicy = runtimeWritePolicy(config);
  return Object.freeze({ ...result, latencyMs, allowFirebaseFallback: fallback, allowPlayerDataWrites: result.state === 'healthy' && writePolicy.playerDataWrites, writePolicy });
}

export function serverGateTelemetry(result, { observedAtUtc = new Date().toISOString() } = {}) {
  const release = result?.server?.deployedRelease;
  return Object.freeze({
    requestId: typeof result?.correlationId === 'string' ? result.correlationId : '',
    latencyMs: Number.isFinite(result?.latencyMs) ? Math.max(0, Math.round(result.latencyMs)) : null,
    gateState: SERVER_GATE_STATES.includes(result?.state) ? result.state : 'invalid',
    reason: typeof result?.reason === 'string' ? result.reason : '',
    observedAtUtc,
    release: Object.freeze({
      version: typeof release?.version === 'string' ? release.version : '',
      commitSha: typeof release?.commitSha === 'string' && /^[a-f0-9]{40}$/i.test(release.commitSha) ? release.commitSha : '',
      builtAtUtc: typeof release?.builtAtUtc === 'string' ? release.builtAtUtc : '',
    }),
  });
}

export function publishServerGateTelemetry(result, { target = globalThis.window, observedAtUtc } = {}) {
  const detail = serverGateTelemetry(result, { observedAtUtc });
  if (target && typeof target.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
    target.dispatchEvent(new CustomEvent('pocketmonster:server-gate', { detail }));
  }
  return detail;
}
