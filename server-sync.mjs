import { runtimeWritePolicy } from './runtime-config.mjs';

export const SERVER_GATE_STATES = Object.freeze(['disabled', 'healthy', 'maintenance', 'offline', 'incompatible', 'invalid']);

function joinUrl(base, path) {
  if (!base) return path;
  return new URL(path, `${base.replace(/\/$/, '')}/`).toString();
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
  try { return await response.json(); } catch { return null; }
}

export async function requestServerContract(config, { fetchImpl = globalThis.fetch, signal, timeoutMs = 5000, correlationId = `pm-${Date.now().toString(36)}` } = {}) {
  if (!config?.featureFlags?.vpsEnabled || !config?.featureFlags?.vpsReads) return { state: 'disabled', reason: 'vps-read-disabled', correlationId };
  if (typeof fetchImpl !== 'function') return { state: 'offline', reason: 'fetch-unavailable', correlationId };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
  const headers = { Accept: 'application/json', 'X-Request-Id': correlationId };
  try {
    const requests = Promise.all([
      fetchImpl(joinUrl(config.apiBaseUrl, config.healthPath), { method: 'GET', headers, signal: controller.signal, cache: 'no-store' }),
      fetchImpl(joinUrl(config.apiBaseUrl, config.versionPath), { method: 'GET', headers, signal: controller.signal, cache: 'no-store' }),
    ]);
    const [healthResponse, versionResponse] = await Promise.race([
      requests,
      new Promise((_, reject) => setTimeout(() => { const error = new Error('request timeout'); error.name = 'AbortError'; reject(error); }, timeoutMs)),
    ]);
    const [healthPayload, versionPayload] = await Promise.all([readJson(healthResponse), readJson(versionResponse)]);
    const health = normalizePayload(healthPayload);
    const version = normalizePayload(versionPayload);
    if (!health || !version) return { state: 'invalid', reason: 'malformed-payload', correlationId };
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
  } finally { clearTimeout(timer); }
}

export async function healthVersionGate(config, options = {}) {
  const result = await requestServerContract(config, options);
  const fallback = config?.featureFlags?.firebaseFallback !== false;
  return Object.freeze({ ...result, allowFirebaseFallback: fallback, allowPlayerDataWrites: false, writePolicy: runtimeWritePolicy(config) });
}
