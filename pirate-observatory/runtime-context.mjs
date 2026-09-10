import { loadRuntimeConfig } from '../runtime-config.mjs';
import { isActiveLaunchSession, readLaunchSession } from '../launch-bootstrap.mjs';

function directSession(windowLike, now) {
  const launch = windowLike?.POCKETMONSTER_LAUNCH_SESSION;
  if (isActiveLaunchSession(launch, now)) return launch;
  const token = windowLike?.POCKETMONSTER_SERVER_SESSION_TOKEN;
  return typeof token === 'string' && token.length > 0
    ? Object.freeze({ sessionToken: token, expiresAtUtc: null })
    : null;
}

export async function resolvePirateObservatoryRuntimeContext({
  windowLike = globalThis.window,
  storage = globalThis.sessionStorage,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  loadConfig = loadRuntimeConfig,
} = {}) {
  let config = windowLike?.POCKETMONSTER_RUNTIME_CONFIG ?? null;
  if (!config) {
    try { config = await loadConfig({ fetchImpl }); }
    catch { config = null; }
  }

  if (!config?.manifestValid || typeof config.apiBaseUrl !== 'string' || !config.apiBaseUrl) {
    return Object.freeze({ ok: false, reason: 'RUNTIME_CONFIG_UNAVAILABLE', retryable: true });
  }

  let session = directSession(windowLike, now);
  if (!session) {
    try { session = readLaunchSession(storage, now); }
    catch { session = null; }
  }
  if (!session?.sessionToken) {
    return Object.freeze({ ok: false, reason: 'SERVER_SESSION_UNAVAILABLE', retryable: true, config });
  }

  const sessionToken = session.sessionToken;
  const apiVersion = config.apiVersion;
  return Object.freeze({
    ok: true,
    config,
    session,
    baseUrl: config.apiBaseUrl,
    headers: () => ({
      Authorization: `Bearer ${sessionToken}`,
      ...(apiVersion ? { 'X-API-Version': apiVersion } : {}),
    }),
  });
}
