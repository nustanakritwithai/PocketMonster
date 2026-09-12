import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMonsterHttpProvider } from '../monster-command-http-provider-v900.mjs';
const shell = fs.readFileSync(new URL('../online-world-shell-v900.mjs', import.meta.url), 'utf8');
assert.match(shell, /createMonsterHttpProvider/);
assert.doesNotMatch(shell, /POCKETMONSTER_MONSTER_COMMAND_TRANSPORT/);
assert.doesNotMatch(shell, /POCKETMONSTER_MONSTER_CONTROL_STATE/);

const calls = [];
const fetchImpl = async (url, init) => {
  calls.push({ url, init });
  if (init.method === 'POST') return new Response(JSON.stringify({ ok: true, accepted: true, commandId: 'cmd-1' }), { status: 200 });
  return new Response(JSON.stringify({ ok: true, monsterControl: { party: [], actors: [], skills: {}, revision: 3 } }), { status: 200 });
};
const provider = createMonsterHttpProvider({ config: { apiBaseUrl: 'https://server.example/', apiVersion: '1.1' }, sessionToken: 'session-secret', getZone: () => 'pirate-fruit', fetchImpl });
await provider.refresh();
assert.equal(calls[0].url, 'https://server.example/api/monsters/control-state?zone=pirate-fruit');
assert.equal(calls[0].init.headers.Authorization, 'Bearer session-secret');
assert.equal(calls[0].url.includes('session-secret'), false);
const result = await provider.send({ contract: 'owned-monster-command/v1', kind: 'summon', zone: 'pirate-fruit', commandId: 'cmd-1' });
assert.equal(result.ok, true);
assert.equal(calls[1].url, 'https://server.example/api/monsters/command');
assert.equal(calls[1].init.headers.Authorization, 'Bearer session-secret');
const closed = createMonsterHttpProvider({ config: { apiBaseUrl: 'https://server.example/', apiVersion: '1.1' }, sessionToken: 'session-secret', getZone: () => 'pirate-fruit', fetchImpl });
assert.equal((await closed.send({ zone: 'pirate-fruit', commandId: 'cmd-2' })).ok, true);
provider.reset();
assert.equal(provider.snapshot().available, false);

let accountToken = 'account-a';
let accountActive = true;
let releaseState;
const delayedFetch = async (url, init) => {
  if (init.method === 'GET') {
    await new Promise(resolve => { releaseState = resolve; });
    return new Response(JSON.stringify({ ok: true, monsterControl: { party: [{ instanceId: 'old' }], actors: [], skills: {}, revision: 4 } }), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: true, accepted: true, commandId: 'late' }), { status: 200 });
};
const guarded = createMonsterHttpProvider({
  config: { apiBaseUrl: 'https://server.example/', apiVersion: '1.1' }, sessionToken: accountToken,
  getSessionToken: () => accountToken, isSessionActive: () => accountActive, getZone: () => 'pirate-fruit', fetchImpl: delayedFetch,
});
const pendingRefresh = guarded.refresh();
guarded.reset();
releaseState();
assert.equal((await pendingRefresh).code, 'STALE_SCENE');
assert.equal(guarded.snapshot().available, false);
accountActive = false;
const denied = await guarded.send({ commandId: 'after-logout' });
assert.equal(denied.code, 'SESSION_UNAVAILABLE');
assert.equal(calls.some(call => call.init?.headers?.Authorization === 'Bearer after-logout'), false);
guarded.dispose();
// การ reset ต้องยกเลิกได้แม้รับ headers แล้วแต่ body ยังไม่เสร็จ
let releaseBody;
let bodySignal;
let bodyCalls = 0;
let currentZone = 'pirate-fruit';
const bodyPending = createMonsterHttpProvider({
  config: { apiBaseUrl: 'https://server.example/', apiVersion: '1.1' }, sessionToken: 'fixture',
  getZone: () => currentZone,
  fetchImpl: async (_url, init) => {
    bodyCalls += 1;
    bodySignal = init.signal;
    return { ok: true, json: () => new Promise(resolve => { releaseBody = resolve; }) };
  },
});
const pendingBody = bodyPending.refresh();
assert.equal(bodyPending.refresh(), pendingBody);
await Promise.resolve();
assert.equal(bodyCalls, 1);
currentZone = 'hub';
bodyPending.reset();
assert.equal(bodySignal.aborted, true);
releaseBody({ ok: true, monsterControl: { party: [{ instanceId: 'old-scene' }], revision: 9 } });
assert.equal((await pendingBody).code, 'STALE_SCENE');
assert.equal(bodyPending.snapshot().available, false);
bodyPending.dispose();
// จัดช่องสำเร็จระหว่างอ่านเก่า ต้องขอ snapshot ใหม่โดยไม่รอเปลี่ยนฉาก
let finishOld;
let reads = 0;
const slotRefresh = createMonsterHttpProvider({
  config: { apiBaseUrl: 'https://server.example/', apiVersion: '1.1' }, sessionToken: 'fixture',
  getZone: () => 'pirate-fruit', fetchImpl: async () => {
    const read = ++reads;
    if (read === 1) await new Promise(resolve => { finishOld = resolve; });
    return { ok: true, json: async () => ({ ok: true, monsterControl: {
      party: read === 1 ? [null, null, null] : [null, null, { instanceId: 'assigned' }], revision: read,
    } }) };
  },
});
slotRefresh.refresh();
const updated = slotRefresh.refresh({ afterPending: true });
finishOld();
await updated;
assert.equal(reads, 2);
assert.equal(slotRefresh.snapshot().party.slots[2].instanceId, 'assigned');
assert.equal(slotRefresh.snapshot().party.slots[0].occupied, false);
slotRefresh.dispose();

let presenceAccepted = false;
let notifyPresence;
let gatedCalls = 0;
const gated = createMonsterHttpProvider({
  config: { apiBaseUrl: 'https://server.example/', apiVersion: '1.1' }, sessionToken: 'session-secret',
  getZone: () => 'pirate-fruit', isPresenceReady: zone => ({ accepted: presenceAccepted, zone }),
  subscribeReadiness: listener => { notifyPresence = listener; return () => { notifyPresence = null; }; },
  fetchImpl: async () => { gatedCalls += 1; return new Response(JSON.stringify({ ok: true, monsterControl: { party: [{ instanceId: 'ready-monster', name: 'Ready' }], actors: [], skills: {}, revision: 9 } }), { status: 200 }); },
});
assert.equal((await gated.refresh()).code, 'PRESENCE_NOT_READY');
assert.equal((await gated.send({ zone: 'pirate-fruit', commandId: 'while-waiting' })).code, 'PRESENCE_NOT_READY');
assert.equal(gatedCalls, 0, 'presence gate must prevent requests while waiting');
presenceAccepted = true;
notifyPresence();
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(gatedCalls, 1, 'accepted presence resumes one state refresh');
assert.equal(gated.snapshot().available, true);
presenceAccepted = false;
assert.equal((await gated.refresh()).code, 'PRESENCE_NOT_READY');
assert.equal(gated.snapshot().available, false);
assert.equal(gated.snapshot().party.slots[0].instanceId, 'ready-monster', 'waiting must preserve canonical party data');

const errorCodeProvider = createMonsterHttpProvider({
  config: { apiBaseUrl: 'https://server.example/', apiVersion: '1.1' }, sessionToken: 'session-secret',
  getZone: () => 'pirate-fruit', fetchImpl: async () => new Response(JSON.stringify({ ok: false, errorCode: 'ZONE_NOT_ACCEPTED' }), { status: 409 }),
});
assert.equal((await errorCodeProvider.refresh()).code, 'ZONE_NOT_ACCEPTED');

let raceReady = true;
let releaseRace;
const raceProvider = createMonsterHttpProvider({
  config: { apiBaseUrl: 'https://server.example/', apiVersion: '1.1' }, sessionToken: 'session-secret',
  getZone: () => 'pirate-fruit', isPresenceReady: () => raceReady,
  fetchImpl: async () => { await new Promise(resolve => { releaseRace = resolve; }); return new Response(JSON.stringify({ ok: true, monsterControl: { party: [{ instanceId: 'stale' }], actors: [{ instanceId: 'stale' }], skills: { stale: ['skill'] }, revision: 10 } }), { status: 200 }); },
});
const raceRequest = raceProvider.refresh();
raceReady = false;
releaseRace();
assert.equal((await raceRequest).code, 'STALE_SCENE');
assert.equal(raceProvider.snapshot().available, false);
assert.equal(raceProvider.snapshot().actors.length, 0);

const rejectedCommand = createMonsterHttpProvider({
  config: { apiBaseUrl: 'https://server.example/', apiVersion: '1.1' }, sessionToken: 'session-secret',
  getZone: () => 'pirate-fruit', fetchImpl: async (_url, init) => init.method === 'POST'
    ? new Response(JSON.stringify({ ok: false, errorCode: 'COMMAND_NOT_ALLOWED' }), { status: 200 })
    : new Response(JSON.stringify({ ok: true, monsterControl: { party: [], actors: [], skills: {}, revision: 1 } }), { status: 200 }),
});
assert.equal((await rejectedCommand.send({ zone: 'pirate-fruit', commandId: 'rejected' })).code, 'COMMAND_NOT_ALLOWED');
assert.equal((await rejectedCommand.send({ zone: 'hub', commandId: 'wrong-zone' })).code, 'ZONE_MISMATCH');
gated.dispose();
errorCodeProvider.dispose();
raceProvider.dispose();
rejectedCommand.dispose();
console.log('V9 monster HTTP provider: PASS');
