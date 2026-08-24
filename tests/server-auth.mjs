import assert from 'node:assert/strict';
import { establishReadOnlyBridge, exchangeFirebaseIdentity, linkFirebaseAccount, readMonsterLifeProfile } from '../server-auth.mjs';

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

const linked = await establishReadOnlyBridge(config, user, { fetchImpl });
assert.equal(linked.state, 'linked');
assert.equal(linked.profile.displayName, 'Tester');
assert.equal((await establishReadOnlyBridge({ ...config, featureFlags: {} }, user, { fetchImpl })).state, 'disabled');
console.log('MonsterLife auth/profile bridge contract passed');
