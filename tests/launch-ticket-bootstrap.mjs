import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanLaunchUrl, clearLaunchSession, prepareLaunch, readLaunchSession, recoverLaunchContext, redeemLaunchTicket } from '../launch-bootstrap.mjs';

const root = new URL('../', import.meta.url);
const bootstrapPath = new URL('launch-bootstrap.mjs', root);
assert.equal(fs.existsSync(bootstrapPath), true, 'RED: minimal launch bootstrap module is missing');

const source = fs.readFileSync(bootstrapPath, 'utf8');
assert.match(source, /replaceState/, 'ticket must be removed from URL immediately');
assert.match(source, /sessionStorage/, 'Monster Life session must be tab-scoped');
assert.doesNotMatch(source, /localStorage/, 'persistent browser storage is forbidden for session tokens');
assert.match(source, /launch-ticket\/redeem/, 'bootstrap must redeem through VPS');
assert.match(source, /returnToFirebaseLauncher\(locationLike\)/, 'direct GitHub access must return to Firebase launcher');

const html = fs.readFileSync(new URL('index.html', root), 'utf8');
assert.match(html, /(?:name="referrer"|Referrer-Policy)[^\n]*no-referrer/i, 'entry must declare no-referrer before external resources');
assert.match(html, /Content-Security-Policy/i, 'entry must declare a restrictive CSP');

let cleaned = '';
const handoffWindow = { name: JSON.stringify({ kind: 'monsterlife-launch-v1', verifier: 'v'.repeat(43), state: 'nonce-state-value' }) };
const rawTicket = 't'.repeat(43);
const launch = cleanLaunchUrl({ href: `https://nustanakritwithai.github.io/PocketMonster/#ticket=${rawTicket}` }, { replaceState(_state, _title, value) { cleaned = value; } }, handoffWindow);
assert.deepEqual(launch, { ticket: rawTicket, state: 'nonce-state-value', verifier: 'v'.repeat(43), invalid: false });
assert.equal(cleaned, '/PocketMonster/');
assert.equal(handoffWindow.name, '', 'window.name handoff must be cleared immediately');
const legacyQuery = cleanLaunchUrl({ href: 'https://nustanakritwithai.github.io/PocketMonster/?ticket=old&state=old-state' }, { replaceState() {} });
assert.deepEqual(legacyQuery, { ticket: null, state: null, verifier: null, invalid: true }, 'query-string tickets must never be accepted');
const duplicateTicket = cleanLaunchUrl({ href: `https://nustanakritwithai.github.io/PocketMonster/#ticket=${rawTicket}&ticket=${'x'.repeat(43)}` }, { replaceState() {} }, { name: JSON.stringify({ kind: 'monsterlife-launch-v1', verifier: 'v'.repeat(43), state: 'nonce-state-value' }) });
assert.equal(duplicateTicket.invalid, true, 'duplicate ticket fragments must fail closed');
const malformedFragment = cleanLaunchUrl({ href: 'https://nustanakritwithai.github.io/PocketMonster/#ticket=short&extra=value' }, { replaceState() {} }, { name: '{}' });
assert.equal(malformedFragment.invalid, true, 'malformed or extended fragments must fail closed');

const opener = { postMessage(message, origin) { assert.equal(message.kind, 'monsterlife-launch-context-request-v1'); assert.equal(origin, 'https://pocketmonster-game.web.app'); } };
const listeners = new Map();
const braveWindow = { opener, addEventListener(type, listener) { listeners.set(type, listener); }, removeEventListener(type) { listeners.delete(type); } };
const pendingLaunch = Object.freeze({ ticket: rawTicket, state: null, verifier: null, invalid: false });
const recovery = recoverLaunchContext(pendingLaunch, { windowLike: braveWindow, timeoutMs: 100 });
listeners.get('message')({ origin: 'https://evil.example', source: opener, data: { kind: 'monsterlife-launch-context-v1', context: { state: 'evil-state-value', verifier: 'e'.repeat(43) } } });
listeners.get('message')({ origin: 'https://pocketmonster-game.web.app', source: opener, data: { kind: 'monsterlife-launch-context-v1', context: { state: 'mobile-state-value', verifier: 'm'.repeat(43) } } });
assert.deepEqual(await recovery, { ticket: rawTicket, state: 'mobile-state-value', verifier: 'm'.repeat(43), invalid: false }, 'Brave fallback must recover context only from the exact launcher opener');

const storage = new Map();
const sessionStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
const launchConfig = { apiBaseUrl: 'https://api.example/', apiVersion: '1.1', featureFlags: { launchTicket: true } };
const session = await redeemLaunchTicket({ apiBaseUrl: 'https://api.example/', apiVersion: '1.1' }, launch, {
  storage: sessionStorage,
  fetchImpl: async (_url, init) => {
    assert.equal(init.credentials, undefined);
    assert.equal(JSON.parse(init.body).codeVerifier, 'v'.repeat(43));
    return { ok: true, json: async () => ({ sessionToken: 'opaque-session', expiresAtUtc: '2099-01-01T00:00:00Z', account: { username: 'qa' } }) };
  },
});
assert.equal(session.sessionToken, 'opaque-session');

const retryRequestIds = [];
let retryAttempt = 0;
const recovered = await redeemLaunchTicket({ apiBaseUrl: 'https://api.example/', apiVersion: '1.1' }, launch, {
  storage: sessionStorage,
  fetchImpl: async (_url, init) => {
    retryRequestIds.push(init.headers['X-Request-Id']);
    retryAttempt += 1;
    if (retryAttempt === 1) throw new TypeError('simulated response loss');
    return { ok: true, status: 200, json: async () => ({ sessionToken: 'recovered-session', expiresAtUtc: '2099-01-01T00:00:00Z', account: { username: 'qa' } }) };
  },
});
assert.equal(recovered.sessionToken, 'recovered-session');
assert.equal(retryRequestIds.length, 2, 'response loss must retry exactly once');
assert.equal(retryRequestIds[0], retryRequestIds[1], 'response-loss retry must preserve the request ID');
assert.equal(readLaunchSession(sessionStorage, Date.parse('2098-01-01T00:00:00Z')).sessionToken, 'recovered-session');

storage.set('monsterlife.session.v1', JSON.stringify({ sessionToken: 'stale-session', expiresAtUtc: '2099-01-01T00:00:00Z' }));
let freshRedeems = 0;
const freshPrepared = await prepareLaunch(launchConfig, launch, {
  storage: sessionStorage,
  locationLike: { replace() { assert.fail('a valid fresh ticket must not redirect'); } },
  fetchImpl: async () => {
    freshRedeems += 1;
    assert.equal(storage.has('monsterlife.session.v1'), false, 'fresh ticket must clear a stale tab session before redeem');
    return { ok: true, status: 200, json: async () => ({ sessionToken: 'fresh-session', expiresAtUtc: '2099-01-01T00:00:00Z', account: { username: 'qa' } }) };
  },
});
assert.equal(freshPrepared.session.sessionToken, 'fresh-session', 'fresh ticket must supersede a cached session');
assert.equal(freshRedeems, 1);

let directRedirect = '';
clearLaunchSession(sessionStorage);
const directPrepared = await prepareLaunch(launchConfig, { ticket: null, state: null, verifier: null, invalid: false }, { storage: sessionStorage, fetchImpl: async () => assert.fail('direct access must not call protected APIs'), locationLike: { replace(value) { directRedirect = value; } } });
assert.equal(directPrepared.state, 'redirecting');
assert.equal(directRedirect, 'https://pocketmonster-game.web.app/', 'direct GitHub access must return to the Firebase launcher');

storage.set('monsterlife.session.v1', JSON.stringify({ sessionToken: 'must-not-survive', expiresAtUtc: '2099-01-01T00:00:00Z' }));
let malformedRedirect = '';
const malformedPrepared = await prepareLaunch(launchConfig, legacyQuery, { storage: sessionStorage, fetchImpl: async () => assert.fail('malformed launch must not redeem'), locationLike: { replace(value) { malformedRedirect = value; } } });
assert.equal(malformedPrepared.state, 'redirecting');
assert.equal(storage.has('monsterlife.session.v1'), false, 'malformed handoff must clear copied or stale tab state');
assert.equal(malformedRedirect, 'https://pocketmonster-game.web.app/');
storage.set('monsterlife.session.v1', JSON.stringify({ sessionToken: 'bad', expiresAtUtc: 'not-a-date' }));
assert.equal(readLaunchSession(sessionStorage), null, 'malformed expiry must fail closed');
storage.set('monsterlife.session.v1', JSON.stringify({ sessionToken: 'clear-me', expiresAtUtc: '2099-01-01T00:00:00Z' }));
globalThis.POCKETMONSTER_LAUNCH_SESSION = { sessionToken: 'clear-me' };
globalThis.POCKETMONSTER_SERVER_GATE = Object.freeze({ state: 'healthy' });
globalThis.POCKETMONSTER_SERVER_GATE_OBSERVATION = Object.freeze({ gateState: 'healthy' });
clearLaunchSession(sessionStorage);
assert.equal(storage.has('monsterlife.session.v1'), false);
assert.equal('POCKETMONSTER_LAUNCH_SESSION' in globalThis, false);
assert.equal('POCKETMONSTER_SERVER_GATE' in globalThis, false, 'logout clears the inherited Server gate capability');
assert.equal('POCKETMONSTER_SERVER_GATE_OBSERVATION' in globalThis, false, 'logout clears Server gate telemetry with the session');

assert.doesNotMatch(html, /src="\.\/game-v800\.js/, 'HTML must not boot the game independently');
assert.match(html, /entry-preload-v900\.mjs\?v=934/, 'active V9 entry must cache-bust the restored minimap preload chain');
const legacyHtml = fs.readFileSync(new URL('v800.html', root), 'utf8');
assert.match(legacyHtml, /entry-preload\.mjs\?v=819/, 'legacy V8 entry must cache-bust the updated game preload');
const preload = fs.readFileSync(new URL('entry-preload.mjs', root), 'utf8');
assert.match(preload, /await prepareLaunch/);
assert.match(preload, /await import\('\.\/game-v800\.js\?v=818'\)/, 'preload must import game only after launch gate');

console.log('Launch-ticket client bootstrap contract: PASS');
