function endpoint(config, path) {
  if (!config?.apiBaseUrl) throw new Error('MonsterLife API is not configured');
  return new URL(path.replace(/^\//, ''), `${config.apiBaseUrl.replace(/\/$/, '')}/`).href;
}

async function request(config, path, {
  method = 'GET', sessionToken, body, headers = {}, fetchImpl = globalThis.fetch,
} = {}) {
  const requestHeaders = {
    Accept: 'application/json',
    'X-API-Version': config.apiVersion,
    ...headers,
  };
  if (sessionToken) requestHeaders.Authorization = `Bearer ${sessionToken}`;
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
  const response = await fetchImpl(endpoint(config, path), {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({ success: false, errorCode: 'INVALID_RESPONSE', message: 'Invalid server response' }));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || `MonsterLife request failed (${response.status})`);
    error.code = payload.errorCode || 'REQUEST_FAILED';
    error.status = response.status;
    error.retryable = payload.retryable === true;
    error.serverRevision = Number.isSafeInteger(payload.serverRevision) ? payload.serverRevision : undefined;
    throw error;
  }
  return { payload, response };
}

export async function readPlayerState(config, sessionToken, options = {}) {
  return (await request(config, 'api/player/state', { ...options, sessionToken })).payload;
}

export async function loadServerSave(config, sessionToken, options = {}) {
  try {
    const { payload, response } = await request(config, 'api/save', { ...options, sessionToken });
    const headerRevision = Number(response.headers?.get?.('X-Save-Revision'));
    return Object.freeze({
      envelope: payload.payload,
      revision: Number.isSafeInteger(payload.revision) ? payload.revision : (Number.isSafeInteger(headerRevision) ? headerRevision : 0),
      checksum: payload.payloadChecksum || '',
      savedAtUtc: payload.serverTimestamp || '',
    });
  } catch (error) {
    if (error.status === 404 && error.code === 'SAVE_NOT_FOUND') return null;
    throw error;
  }
}

export async function saveServerSave(config, sessionToken, envelope, {
  revision = 0, clientVersion, ...options
} = {}) {
  const version = clientVersion || config.clientVersion || config.deployedRelease?.version || config.deployedRelease;
  if (typeof version !== 'string' || !version) throw new Error('MonsterLife client version is required for server save');
  const { payload, response } = await request(config, 'api/save', {
    ...options,
    method: 'POST',
    sessionToken,
    body: envelope,
    headers: { 'X-Save-Revision': String(revision), 'X-Game-Version': version },
  });
  const headerRevision = Number(response.headers?.get?.('X-Save-Revision'));
  return Object.freeze({
    revision: Number.isSafeInteger(payload.revision) ? payload.revision : headerRevision,
    checksum: payload.payloadChecksum || '',
    savedAtUtc: payload.serverTimestamp || '',
  });
}

export async function syncPlayerData(config, sessionToken, data, options = {}) {
  return (await request(config, 'api/sync', { ...options, method: 'POST', sessionToken, body: data })).payload;
}

export async function saveCharacterProfile(config, sessionToken, character, options = {}) {
  return (await request(config, 'api/player/character', { ...options, method: 'POST', sessionToken, body: character })).payload;
}

export async function logoutServerSession(config, sessionToken, options = {}) {
  return (await request(config, 'api/account/logout', { ...options, method: 'POST', sessionToken, body: {} })).payload;
}

export async function changeServerPassword(config, sessionToken, credentials, options = {}) {
  return (await request(config, 'api/account/change-password', { ...options, method: 'POST', sessionToken, body: credentials })).payload;
}

export function canUseServerPlayerData(config, gate, bridge) {
  return Boolean(config?.featureFlags?.playerDataWrites && config?.featureFlags?.vpsWrites
    && gate?.state === 'healthy' && bridge?.state === 'linked' && bridge?.sessionToken);
}
