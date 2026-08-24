import assert from 'node:assert/strict';
import { configureServerPlayerState, loadServerPlayerState, mergeServerMonsterProgress } from '../server-player-state.mjs';

configureServerPlayerState({ apiBaseUrl: 'https://vps.example/', featureFlags: { playerStateReads: true } }, 'session-token');
let request;
const snapshot = await loadServerPlayerState({ fetchImpl: async (url, init) => {
  request = { url, init };
  return new Response(JSON.stringify({ monsters: [{ instanceId: 'm1' }, { instanceId: 'm2' }], placements: [{ instanceId: 'm1', partySlot: 0 }, { instanceId: 'm2', storageOrder: 0, ranchSlot: 0 }], progress: { exp: 12, currentZone: 'grass-meadow' } }), { status: 200 });
} });
assert.equal(request.url, 'https://vps.example/api/player/state');
assert.equal(request.init.headers.Authorization, 'Bearer session-token');
const merged = mergeServerMonsterProgress({ inventory: { captureBalls: 3 }, exp: 0 }, snapshot);
assert.equal(merged.collection.length, 2);
assert.deepEqual(merged.party, ['m1', null, null]);
assert.deepEqual(merged.storage, ['m2']);
assert.deepEqual(merged.ranchActive, ['m2']);
assert.equal(merged.exp, 12);
assert.deepEqual(merged.inventory, { captureBalls: 3 }, 'phase 5 must not replace server-authoritative inventory before phase 6');
configureServerPlayerState({ apiBaseUrl: 'https://vps.example/', featureFlags: { playerStateReads: false } }, 'session-token');
assert.equal(await loadServerPlayerState({ fetchImpl: async () => { throw new Error('must not fetch'); } }), null);
console.log('server player monster/progress adapter passed');
