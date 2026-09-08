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
const result = await provider.send({ contract: 'owned-monster-command/v1', kind: 'summon', commandId: 'cmd-1' });
assert.equal(result.ok, true);
assert.equal(calls[1].url, 'https://server.example/api/monsters/command');
assert.equal(calls[1].init.headers.Authorization, 'Bearer session-secret');
const closed = createMonsterHttpProvider({ config: { apiBaseUrl: 'https://server.example/', apiVersion: '1.1' }, sessionToken: 'session-secret', getZone: () => 'pirate-fruit', fetchImpl });
assert.equal((await closed.send({ commandId: 'cmd-2' })).ok, true);
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
console.log('V9 monster HTTP provider: PASS');
