import assert from 'node:assert/strict';
import { createPirateCentralStateClient, pirateDocumentsFromEntries } from '../pirate-central-state-client.mjs';

const entries = { 'pirate-fruit:progression-v1': '{"level":12}', 'pirate-fruit:audio:v1': '{}' };
const persisted = pirateDocumentsFromEntries(entries);
const calls = [];
let token = 'fixture-session';
const client = createPirateCentralStateClient({ config: { apiBaseUrl: 'https://example.invalid/', apiVersion: '1.1' },
  getSessionToken: () => token, commandId: () => 'migration-fixture-0001',
  fetchImpl: async (url, init) => {
    calls.push(init);
    return { status: 200, ok: true, json: async () => init.method === 'GET'
      ? { ok: true, initialized: false, revision: 9 }
      : { ok: true, initialized: true, revision: 10, persisted } };
  } });
const result = await client.bootstrap(entries);
assert.equal(result.online, true);
assert.deepEqual(result.entries, entries);
assert.equal(calls[0].headers.Authorization, 'Bearer fixture-session');
assert.equal(JSON.parse(calls[1].body).expectedRevision, 9);
assert.equal(JSON.parse(calls[1].body).initialMigration, true);
assert.equal(calls.length, 2);
const stale = createPirateCentralStateClient({ config: { apiBaseUrl: 'https://example.invalid/' },
  getSessionToken: () => token, fetchImpl: async () => {
    token = 'different-account';
    return { status: 200, ok: true, json: async () => ({ ok: true, initialized: true, revision: 2, persisted }) };
  } });
await assert.rejects(stale.bootstrap(entries), /STALE_SESSION/);
assert.deepEqual(entries, { 'pirate-fruit:progression-v1': '{"level":12}', 'pirate-fruit:audio:v1': '{}' });
console.log('PASS canonical bootstrap migration revision, auth isolation, local-data preservation');
