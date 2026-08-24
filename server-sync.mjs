import { runtimeWritePolicy } from './runtime-config.mjs';

export const SERVER_GATE_STATES = Object.freeze(['disabled', 'healthy', 'maintenance', 'offline', 'incompatible', 'invalid']);

function joinUrl(base, path) {
  if (!base) return path;
  return new URL(path, `${base.replace(/\/$/, '')}/`).toString();
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const health = payload.health ?? payload.status;
  const maintenance = payload.maintenance === true || health === 'maintenance';
  const status = typeof health === 'string' ? health.toLowerCase() : '';
  return {
    health: status || (maintenance ? 'maintenance' : ''),
    maintenance,
    apiVersion: payload.apiVersion ?? payload.api_version ?? payload.version?.apiVersion ?? '',
    minimumClientVersion: payload.minimumClientVersion ?? payload.minimum_client_version ?? '',
    saveSchemaVersion: payload.saveSchemaVersion ?? payload.save_schema_version ?? payload.version?.saveSchemaVersion,
    deployedRelease: payload.deployedRelease ?? payload.deployed_release ?? payload.release ?? payload.version?.deployedRelease ?? '',
  };
}

function compatible(server, config) {
  if (!server) return false;
  if (server.minimumClientVersion && config.minimumClientVersion && server.minimumClientVersion > config.minimumClientVersion) return false;
  if (server.apiVersion && config.apiVersion && server.apiVersion !== config.apiVersion) return false;
  if (server.saveSchemaVersion !== undefined && Number(server.saveSchemaVersion) !== Number(config.saveSchemaVersion)) return false;
  return true;
}

export async function requestServerContract(config, { fetchImpl = globalThis.fetch, signal, timeoutMs = 5000, correlationId = `pm-${Date.now().toString(36)}` } = {}) {
  if (!config?.featureFlags?.vpsEnabled || !config?.featureFlags?.vpsReads) return { state: 'disabled', reason: 'vps-read-disabled', correlationId };
  if (typeof fetchImpl !== 'function') return { state: 'offline', reason: 'fetch-unavailable', correlationId };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const headers = { Accept: 'application/json', 'X-Correlation-Id': correlationId };
    const requests = Promise.all([
      fetchImpl(joinUrl(config.apiBaseUrl, config.healthPath), { method: 'GET', headers, signal: controller.signal, cache: 'no-store' }),
      fetchImpl(joinUrl(config.apiBaseUrl, config.versionPath), { method: 'GET', headers, signal: controller.signal, cache: 'no-store' }),
    ]);
    const [healthResponse, versionResponse] = await Promise.race([
      requests,
      new Promise((_, reject) => setTimeout(() => { const error = new Error('request timeout'); error.name = 'AbortError'; reject(error); }, timeoutMs)),
    ]);
    if (!healthResponse.ok || !versionResponse.ok) return { state: healthResponse.status === 503 || versionResponse.status === 503 ? 'maintenance' : 'offline', reason: `http-${Math.max(healthResponse.status, versionResponse.status)}`, correlationId };
    const health = normalizePayload(await healthResponse.json());
    const version = normalizePayload(await versionResponse.json());
    const server = { ...health, ...version, maintenance: health.maintenance || version.maintenance };
    if (!health || !version) return { state: 'invalid', reason: 'malformed-payload', correlationId };
    if (server.maintenance) return { state: 'maintenance', server, correlationId };
    if (!compatible(server, config)) return { state: 'incompatible', server, correlationId };
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
