import assert from 'node:assert/strict';
import { canUseServerPlayerData, changeServerPassword, loadServerSave, logoutServerSession, readPlayerState, saveCharacterProfile, saveServerSave, syncPlayerData } from '../server-player-data.mjs';

const config = { apiBaseUrl: 'https://server.example/', apiVersion: '1.1', featureFlags: { vpsWrites: true, playerDataWrites: true }, deployedRelease: { version: '8.4.0' } };
const calls = [];
const reply = (payload, status = 200, headers = {}) => new Response(JSON.stringify(payload), { status, headers });
const fetchImpl = async (url, init) => {
  calls.push({ url, init });
  if (url.endsWith('/api/player/state')) return reply({ success: true, profile: { displayName: 'Tester' } });
  if (url.endsWith('/api/save') && init.method === 'GET') return reply({ success: true, revision: 4, payloadChecksum: 'abc', payload: { state: { saveVersion: 1 }, playerHp: 90, saveSchemaVersion: 1 } }, 200, { 'X-Save-Revision': '4' });
  if (url.endsWith('/api/save')) return reply({ success: true, revision: 5, payloadChecksum: 'def' }, 200, { 'X-Save-Revision': '5' });
  return reply({ success: true });
};

const state = await readPlayerState(config, 'session', { fetchImpl });
assert.equal(state.profile.displayName, 'Tester');
const saved = await loadServerSave(config, 'session', { fetchImpl });
assert.equal(saved.revision, 4);
assert.equal(saved.envelope.playerHp, 90);
const write = await saveServerSave(config, 'session', saved.envelope, { revision: 4, fetchImpl });
assert.equal(write.revision, 5);
const saveCall = calls.find(call => call.url.endsWith('/api/save') && call.init.method === 'POST');
assert.equal(saveCall.init.headers.Authorization, 'Bearer session');
assert.equal(saveCall.init.headers['X-Save-Revision'], '4');
assert.equal(saveCall.init.headers['X-Game-Version'], '8.4.0');

await syncPlayerData(config, 'session', { actionLog: 'test' }, { fetchImpl });
await saveCharacterProfile(config, 'session', { name: 'Hero' }, { fetchImpl });
await changeServerPassword(config, 'session', { currentPassword: 'old', newPassword: 'newPass123', confirmPassword: 'newPass123' }, { fetchImpl });
await logoutServerSession(config, 'session', { fetchImpl });
assert.equal(canUseServerPlayerData(config, { state: 'healthy' }, { state: 'linked', sessionToken: 'session' }), true);
assert.equal(canUseServerPlayerData(config, { state: 'offline' }, { state: 'linked', sessionToken: 'session' }), false);

const missing = await loadServerSave(config, 'session', { fetchImpl: async () => reply({ success: false, errorCode: 'SAVE_NOT_FOUND', message: 'none' }, 404) });
assert.equal(missing, null);
await assert.rejects(
  saveServerSave(config, 'session', {}, { revision: 4, fetchImpl: async () => reply({ success: false, errorCode: 'STATE_CONFLICT', message: 'stale', serverRevision: 7 }, 409) }),
  error => error.code === 'STATE_CONFLICT' && error.serverRevision === 7,
);
console.log('MonsterLife server player-data contract passed');
