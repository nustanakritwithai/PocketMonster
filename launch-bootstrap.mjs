const SESSION_KEY = 'monsterlife.session.v1';
const FIREBASE_LAUNCHER = 'https://pocketmonster-game.web.app/';
const FIREBASE_LAUNCHER_ORIGIN = new URL(FIREBASE_LAUNCHER).origin;

export function isActiveLaunchSession(session, now = Date.now()) {
  const expiresAt = Date.parse(session?.expiresAtUtc);
  return typeof session?.sessionToken === 'string'
    && session.sessionToken.length > 0
    && Number.isFinite(expiresAt)
    && expiresAt > now;
}

export function requireActiveOnlineLaunchSession(config, session, now = Date.now()) {
  if (config?.manifestValid !== true || config?.featureFlags?.launchTicket !== true || !isActiveLaunchSession(session, now)) {
    throw Object.assign(new Error('An active Monster Life online session is required'), { code: 'ONLINE_SESSION_REQUIRED' });
  }
  return session;
}

export function returnToFirebaseLauncher(locationLike = globalThis.location) {
  locationLike?.replace?.(FIREBASE_LAUNCHER);
}

function apiUrl(config, path) {
  if (!config?.apiBaseUrl) throw new Error('Monster Life API is not configured');
  return new URL(path.replace(/^\//, ''), `${config.apiBaseUrl.replace(/\/$/, '')}/`).href;
}

export function cleanLaunchUrl(locationLike = globalThis.location, historyLike = globalThis.history, windowLike = globalThis.window || globalThis) {
  const url = new URL(locationLike.href);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  let context = {};
  try { context = JSON.parse(windowLike.name || '{}'); } catch { context = {}; }
  windowLike.name = '';
  const validContext = context?.kind === 'monsterlife-launch-v1';
  const tickets = fragment.getAll('ticket');
  const onlyTicket = [...fragment.keys()].every(key => key === 'ticket');
  const ticket = tickets.length === 1 && onlyTicket && /^[A-Za-z0-9_-]{43,128}$/.test(tickets[0]) ? tickets[0] : null;
  const state = validContext && /^[A-Za-z0-9_-]{16,128}$/.test(context.state || '') ? context.state : null;
  const verifier = validContext && /^[A-Za-z0-9_-]{43,128}$/.test(context.verifier || '') ? context.verifier : null;
  const attempted = fragment.has('ticket') || url.searchParams.has('ticket') || url.searchParams.has('state');
  const launch = Object.freeze({ ticket, state, verifier, invalid: attempted && !ticket });
  historyLike.replaceState(null, '', `${url.pathname}`);
  return launch;
}

export async function recoverLaunchContext(launch, { windowLike = globalThis.window || globalThis, timeoutMs = 3000 } = {}) {
  if (!launch?.ticket || launch.invalid || (launch.state && launch.verifier)) return launch;
  const opener = windowLike?.opener;
  if (!opener || typeof windowLike.addEventListener !== 'function') return Object.freeze({ ...launch, invalid: true });
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      windowLike.removeEventListener?.('message', onMessage);
      clearTimeout(timer);
      resolve(value);
    };
    const onMessage = event => {
      if (event.origin !== FIREBASE_LAUNCHER_ORIGIN || event.source !== opener || event.data?.kind !== 'monsterlife-launch-context-v1') return;
      const context = event.data.context;
      const state = /^[A-Za-z0-9_-]{16,128}$/.test(context?.state || '') ? context.state : null;
      const verifier = /^[A-Za-z0-9_-]{43,128}$/.test(context?.verifier || '') ? context.verifier : null;
      finish(Object.freeze({ ...launch, state, verifier, invalid: !(state && verifier) }));
    };
    const timer = setTimeout(() => finish(Object.freeze({ ...launch, invalid: true })), timeoutMs);
    windowLike.addEventListener('message', onMessage);
    opener.postMessage({ kind: 'monsterlife-launch-context-request-v1' }, FIREBASE_LAUNCHER_ORIGIN);
  });
}

export function readLaunchSession(storage = globalThis.sessionStorage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(SESSION_KEY) || 'null');
    if (!isActiveLaunchSession(value, now)) { storage.removeItem(SESSION_KEY); return null; }
    return Object.freeze(value);
  } catch { storage.removeItem(SESSION_KEY); return null; }
}

export function clearLaunchSession(storage = globalThis.sessionStorage) {
  storage?.removeItem?.(SESSION_KEY);
  try { delete globalThis.POCKETMONSTER_LAUNCH_SESSION; } catch { globalThis.POCKETMONSTER_LAUNCH_SESSION = undefined; }
  try { delete globalThis.POCKETMONSTER_SERVER_SESSION_TOKEN; } catch { globalThis.POCKETMONSTER_SERVER_SESSION_TOKEN = undefined; }
  try { delete globalThis.POCKETMONSTER_SERVER_GATE; } catch { globalThis.POCKETMONSTER_SERVER_GATE = undefined; }
  try { delete globalThis.POCKETMONSTER_SERVER_GATE_OBSERVATION; } catch { globalThis.POCKETMONSTER_SERVER_GATE_OBSERVATION = undefined; }
  try { globalThis.dispatchEvent?.(new Event('pocketmonster:session-ended')); } catch {}
}

export async function redeemLaunchTicket(config, launch, { fetchImpl = globalThis.fetch, storage = globalThis.sessionStorage } = {}) {
  const requestId = crypto.randomUUID();
  let response;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetchImpl(apiUrl(config, '/api/auth/launch-ticket/redeem'), {
        method: 'POST',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-API-Version': config.apiVersion, 'X-Game-Version': '8.4.0', 'X-Request-Id': requestId },
        body: JSON.stringify({ ticket: launch.ticket, state: launch.state, codeVerifier: launch.verifier }),
      });
      if (response.ok || response.status < 500) break;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  const payload = await response?.json().catch(() => ({})) || {};
  if (!response?.ok || !payload.sessionToken) throw Object.assign(new Error(payload.message || 'Launch ticket redemption failed'), { code: payload.errorCode || 'REDEEM_FAILED' });
  const session = Object.freeze({ sessionToken: payload.sessionToken, expiresAtUtc: payload.expiresAtUtc, account: payload.account });
  if (!isActiveLaunchSession(session)) {
    throw Object.assign(new Error('Launch ticket returned an invalid or expired Monster Life session'), { code: 'INVALID_SESSION' });
  }
  storage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function prepareLaunch(config, launch = globalThis.__POCKETMONSTER_CLEAN_LAUNCH__ || cleanLaunchUrl(), { storage = globalThis.sessionStorage, fetchImpl = globalThis.fetch, locationLike = globalThis.location, windowLike = globalThis.window || globalThis, contextTimeoutMs = 3000 } = {}) {
  if (!config?.featureFlags?.launchTicket) return Object.freeze({ state: 'legacy' });
  launch = await recoverLaunchContext(launch, { windowLike, timeoutMs: contextTimeoutMs });
  let session = null;
  if (launch.invalid) clearLaunchSession(storage);
  else if (launch.ticket) {
    clearLaunchSession(storage);
    session = await redeemLaunchTicket(config, launch, { storage, fetchImpl });
  } else session = readLaunchSession(storage);
  if (!session) { returnToFirebaseLauncher(locationLike); return Object.freeze({ state: 'redirecting' }); }
  globalThis.POCKETMONSTER_LAUNCH_SESSION = session;
  return Object.freeze({ state: 'authenticated', session });
}
