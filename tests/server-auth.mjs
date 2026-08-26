import assert from 'node:assert/strict';
import { establishReadOnlyBridge, exchangeFirebaseIdentity, issueLaunchTicket, linkFirebaseAccount, logoutMonsterLifeSession, readMonsterLifeProfile } from '../server-auth.mjs';

const config = { apiBaseUrl: 'https://vps.example/auth-staging/', apiVersion: '1.1', featureFlags: { firebaseAuthBridge: true, profileReads: true } };
const user = { getIdToken: async force => (assert.equal(force, true), 'firebase-id-token') };
const calls = [];
const fetchImpl = async (url, init) => {
  calls.push({ url, init });
  if (url.endsWith('/api/auth/firebase/login')) return new Response(JSON.stringify({ success: true, sessionToken: 'server-session', expiresAtUtc: 'soon' }), { status: 200 });
  if (url.endsWith('/api/player/profile')) return new Response(JSON.stringify({ success: true, profile: { userId: 'u1', displayName: 'Tester', character: { name: 'Hero' } } }), { status: 200 });
  return new Response(JSON.stringify({ success: true }), { status: 200 });
};

await exchangeFirebaseIdentity(config, user, { fetchImpl });
assert.equal(calls[0].url, 'https://vps.example/auth-staging/api/auth/firebase/login');
assert.equal(calls[0].init.headers.Authorization, 'Bearer firebase-id-token');
assert.equal(JSON.parse(calls[0].init.body).idToken, undefined, 'Firebase token must never be sent in JSON');
await readMonsterLifeProfile(config, 'server-session', { fetchImpl });
assert.equal(calls[1].init.headers.Authorization, 'Bearer server-session');
await linkFirebaseAccount(config, user, { username: 'approved', password: 'secret', linkRequestId: 'request-1' }, { fetchImpl });
assert.deepEqual(JSON.parse(calls[2].init.body), { username: 'approved', password: 'secret', linkRequestId: 'request-1' });
calls.length = 0;
const issued = await issueLaunchTicket(config, user, { fetchImpl: async (_url, init) => {
  const body = JSON.parse(init.body);
  return new Response(JSON.stringify({ success: true, launchUrl: 'https://game.example/#ticket=opaque', expiresAtUtc: 'soon' }), { status: 200 });
} });
assert.equal(issued.launchUrl.includes('state='), false, 'launch URL may contain only the opaque ticket');
assert.equal(issued.launchContext.kind, 'monsterlife-launch-v1');
assert.equal(typeof issued.launchContext.verifier, 'string');
assert.equal(typeof issued.launchContext.state, 'string');

const linked = await establishReadOnlyBridge(config, user, { fetchImpl });
assert.equal(linked.state, 'linked');
assert.equal(linked.profile.displayName, 'Tester');
assert.equal((await establishReadOnlyBridge({ ...config, featureFlags: {} }, user, { fetchImpl })).state, 'disabled');
const sessionData = new Map([['monsterlife.session.v1', '{"sessionToken":"server-session","expiresAtUtc":"2099-01-01T00:00:00Z"}']]);
const storage = { removeItem: key => sessionData.delete(key) };
await logoutMonsterLifeSession(config, 'server-session', { fetchImpl, storage });
assert.equal(calls.at(-1).url.endsWith('/api/account/logout'), true);
assert.equal(sessionData.size, 0, 'logout must clear tab-scoped session state');
console.log('MonsterLife auth/profile bridge contract passed');
