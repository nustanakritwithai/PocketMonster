import assert from 'node:assert/strict';
import { createMonsterHttpProvider } from '../monster-command-http-provider-v900.mjs';

const calls = [];
const fetchImpl = async (url, init) => {
  calls.push({ url, init });
  if (init.method === 'POST') return new Response(JSON.stringify({ ok: true, accepted: true, commandId: 'cmd-1' }), { status: 200 });
  return new Response(JSON.stringify({ success: true, profile: { party: { slots: [] }, actors: [], skills: {} } }), { status: 200 });
};
const provider = createMonsterHttpProvider({ config: { apiBaseUrl: 'https://server.example/', apiVersion: '1.1' }, sessionToken: 'session-secret', commandPath: 'api/monster/commands', fetchImpl });
await provider.refresh();
assert.equal(calls[0].url, 'https://server.example/api/player/state');
assert.equal(calls[0].init.headers.Authorization, 'Bearer session-secret');
assert.equal(calls[0].url.includes('session-secret'), false);
const result = await provider.send({ contract: 'owned-monster-command/v1', kind: 'summon', commandId: 'cmd-1' });
assert.equal(result.ok, true);
assert.equal(calls[1].url, 'https://server.example/api/monster/commands');
assert.equal(calls[1].init.headers.Authorization, 'Bearer session-secret');
const closed = createMonsterHttpProvider({ config: { apiBaseUrl: 'https://server.example/', apiVersion: '1.1' }, sessionToken: 'session-secret', fetchImpl });
assert.equal((await closed.send({ commandId: 'cmd-2' })).code, 'SERVER_INGRESS_UNAVAILABLE');
provider.reset();
assert.equal(provider.snapshot().available, false);
console.log('V9 monster HTTP provider: PASS');
