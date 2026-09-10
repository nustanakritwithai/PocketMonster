import assert from 'node:assert/strict';
import { resolvePirateObservatoryRuntimeContext } from '../pirate-observatory/index.mjs';

function storageWith(value) {
  const values = new Map(value ? [['monsterlife.session.v1', JSON.stringify(value)]] : []);
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, next) { values.set(key, next); },
    removeItem(key) { values.delete(key); },
  };
}

const activeSession = {
  sessionToken: 'runtime-session-token',
  expiresAtUtc: '2099-01-01T00:00:00.000Z',
};
const config = {
  manifestValid: true,
  apiBaseUrl: 'https://server.example/',
  apiVersion: '1.1',
};

// Existing in-memory runtime config + launch session wins and produces runtime-only auth headers.
{
  const context = await resolvePirateObservatoryRuntimeContext({
    windowLike: { POCKETMONSTER_RUNTIME_CONFIG: config, POCKETMONSTER_LAUNCH_SESSION: activeSession },
    storage: storageWith(null),
    now: Date.parse('2026-09-11T00:00:00.000Z'),
    loadConfig: async () => { throw new Error('must not reload existing runtime config'); },
  });
  assert.equal(context.ok, true);
  assert.equal(context.baseUrl, config.apiBaseUrl);
  assert.equal(context.headers().Authorization, 'Bearer runtime-session-token');
  assert.equal(context.headers()['X-API-Version'], '1.1');
}

// A separate Observatory page on the same origin can recover the active launch session from sessionStorage.
{
  const context = await resolvePirateObservatoryRuntimeContext({
    windowLike: { POCKETMONSTER_RUNTIME_CONFIG: config },
    storage: storageWith(activeSession),
    now: Date.parse('2026-09-11T00:00:00.000Z'),
  });
  assert.equal(context.ok, true);
  assert.equal(context.session.sessionToken, activeSession.sessionToken);
}

// Existing legacy server session token remains usable; the server still validates it on every request.
{
  const context = await resolvePirateObservatoryRuntimeContext({
    windowLike: { POCKETMONSTER_RUNTIME_CONFIG: config, POCKETMONSTER_SERVER_SESSION_TOKEN: 'legacy-server-session' },
    storage: storageWith(null),
  });
  assert.equal(context.ok, true);
  assert.equal(context.headers().Authorization, 'Bearer legacy-server-session');
}

// Missing/invalid config must not guess a server URL.
{
  const context = await resolvePirateObservatoryRuntimeContext({
    windowLike: {},
    storage: storageWith(activeSession),
    loadConfig: async () => ({ manifestValid: true, apiBaseUrl: '', apiVersion: '1.1' }),
  });
  assert.equal(context.ok, false);
  assert.equal(context.reason, 'RUNTIME_CONFIG_UNAVAILABLE');
}

// Expired session is removed by the existing launch-session contract and does not connect.
{
  const expired = { sessionToken: 'expired', expiresAtUtc: '2020-01-01T00:00:00.000Z' };
  const storage = storageWith(expired);
  const context = await resolvePirateObservatoryRuntimeContext({
    windowLike: { POCKETMONSTER_RUNTIME_CONFIG: config },
    storage,
    now: Date.parse('2026-09-11T00:00:00.000Z'),
  });
  assert.equal(context.ok, false);
  assert.equal(context.reason, 'SERVER_SESSION_UNAVAILABLE');
  assert.equal(storage.getItem('monsterlife.session.v1'), null);
}

console.log('v90 Pirate World Observatory runtime context: PASS');
