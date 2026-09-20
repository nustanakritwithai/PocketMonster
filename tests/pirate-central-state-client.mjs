import assert from 'node:assert/strict';
import {
  createPirateCentralStateClient,
  createPirateStateOperationQueue,
  operationFromPirateSaveMutation,
  pirateDocumentsFromEntries,
} from '../pirate-central-state-client.mjs';

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

assert.equal(operationFromPirateSaveMutation({ op: 'set', key: 'pirate-fruit:progression-v1', value: '{}' }), null);
const operationCalls = [];
let operationAttempt = 0;
const operationClient = createPirateCentralStateClient({
  config: { apiBaseUrl: 'https://example.invalid/', apiVersion: '1.1' },
  getSessionToken: () => 'fixture-session',
  commandId: () => 'operation-fixture-0001',
  fetchImpl: async (url, init) => {
    operationCalls.push({ url, init });
    if (url.endsWith('/api/pirate/state/operation') && operationAttempt++ === 0) {
      return { status: 409, ok: false, json: async () => ({ ok: false, errorCode: 'STATE_CONFLICT', revision: 12 }) };
    }
    if (url.endsWith('/api/pirate/state')) {
      return { status: 200, ok: true, json: async () => ({ ok: true, initialized: true, revision: 12, persisted }) };
    }
    return { status: 200, ok: true, json: async () => ({ ok: true, revision: 13, persisted }) };
  },
});
const operationQueue = createPirateStateOperationQueue({ client: operationClient, revision: 11 });
const operationResult = await operationQueue.enqueue({
  type: 'statAllocation', allocations: { vitality: 2 },
});
assert.equal(operationResult.revision, 13);
assert.equal(operationCalls.length, 3, 'conflict retry reads current revision before retrying');
assert.equal(JSON.parse(operationCalls[2].init.body).expectedRevision, 12);
assert.equal(JSON.parse(operationCalls[2].init.body).operation.allocations.vitality, 2);
assert.equal(JSON.parse(operationCalls[0].init.body).commandId, JSON.parse(operationCalls[2].init.body).commandId, 'conflict retry keeps idempotency key');
console.log('PASS canonical bootstrap migration revision, auth isolation, local-data preservation');
