const SESSION_HEADER = 'Authorization';

function endpoint(config, path) {
  if (!config?.apiBaseUrl) throw new Error('MonsterLife API is not configured');
  return new URL(path.replace(/^\//, ''), `${config.apiBaseUrl.replace(/\/$/, '')}/`).href;
}

async function request(config, path, { method = 'GET', token, body, fetchImpl = globalThis.fetch } = {}) {
  const headers = { Accept: 'application/json', 'X-API-Version': config.apiVersion };
  if (token) headers[SESSION_HEADER] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetchImpl(endpoint(config, path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const payload = await response.json().catch(() => ({ success: false, errorCode: 'INVALID_RESPONSE', message: 'Invalid server response' }));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || `MonsterLife request failed (${response.status})`);
    error.code = payload.errorCode || 'REQUEST_FAILED';
    error.status = response.status;
    error.retryable = payload.retryable === true;
    throw error;
  }
  return payload;
}

export async function exchangeFirebaseIdentity(config, firebaseUser, options = {}) {
  const idToken = await firebaseUser.getIdToken(true);
  const payload = await request(config, 'api/auth/firebase/login', { ...options, method: 'POST', token: idToken, body: {} });
  return Object.freeze({ sessionToken: payload.sessionToken, expiresAtUtc: payload.expiresAtUtc, account: payload.account });
}

export async function linkFirebaseAccount(config, firebaseUser, { username, password, linkRequestId = crypto.randomUUID() }, options = {}) {
  const idToken = await firebaseUser.getIdToken(true);
  return request(config, 'api/auth/firebase/link', { ...options, method: 'POST', token: idToken, body: { username, password, linkRequestId } });
}

export async function readMonsterLifeProfile(config, sessionToken, options = {}) {
  const payload = await request(config, 'api/player/profile', { ...options, token: sessionToken });
  return payload.profile;
}

export async function establishReadOnlyBridge(config, firebaseUser, options = {}) {
  if (!config?.featureFlags?.firebaseAuthBridge || !config?.featureFlags?.profileReads) return Object.freeze({ state: 'disabled' });
  try {
    const session = await exchangeFirebaseIdentity(config, firebaseUser, options);
    const profile = await readMonsterLifeProfile(config, session.sessionToken, options);
    return Object.freeze({ state: 'linked', profile, expiresAtUtc: session.expiresAtUtc, sessionToken: session.sessionToken });
  } catch (error) {
    if (error.code === 'IDENTITY_NOT_LINKED') return Object.freeze({ state: 'unlinked', errorCode: error.code });
    return Object.freeze({ state: 'fallback', errorCode: error.code || 'BRIDGE_UNAVAILABLE' });
  }
}
