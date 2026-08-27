const SESSION_KEY = 'monsterlife.session.v1';
const FIREBASE_LAUNCHER = 'https://pocketmonster-game.web.app/';

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
  const launch = Object.freeze({ ticket, state, verifier, invalid: attempted && !(ticket && state && verifier) });
  historyLike.replaceState(null, '', `${url.pathname}`);
  return launch;
}

export function readLaunchSession(storage = globalThis.sessionStorage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(SESSION_KEY) || 'null');
    const expiresAt = Date.parse(value?.expiresAtUtc);
    if (!value?.sessionToken || !Number.isFinite(expiresAt) || expiresAt <= now) { storage.removeItem(SESSION_KEY); return null; }
    return Object.freeze(value);
  } catch { storage.removeItem(SESSION_KEY); return null; }
}

export function clearLaunchSession(storage = globalThis.sessionStorage) {
  storage?.removeItem?.(SESSION_KEY);
  try { delete globalThis.POCKETMONSTER_LAUNCH_SESSION; } catch { globalThis.POCKETMONSTER_LAUNCH_SESSION = undefined; }
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
  storage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function prepareLaunch(config, launch = globalThis.__POCKETMONSTER_CLEAN_LAUNCH__ || cleanLaunchUrl(), { storage = globalThis.sessionStorage, fetchImpl = globalThis.fetch, locationLike = globalThis.location } = {}) {
  if (!config?.featureFlags?.launchTicket) return Object.freeze({ state: 'legacy' });
  let session = null;
  if (launch.invalid) clearLaunchSession(storage);
  else if (launch.ticket) {
    clearLaunchSession(storage);
    session = await redeemLaunchTicket(config, launch, { storage, fetchImpl });
  } else session = readLaunchSession(storage);
  if (!session) { locationLike.replace(FIREBASE_LAUNCHER); return Object.freeze({ state: 'redirecting' }); }
  globalThis.POCKETMONSTER_LAUNCH_SESSION = session;
  return Object.freeze({ state: 'authenticated', session });
}
