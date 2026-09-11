import assert from 'node:assert/strict';
import { PirateObservatoryRestTransport } from '../pirate-observatory/index.mjs';

const requests = [];
const transport = new PirateObservatoryRestTransport({
  baseUrl: 'https://game.example.test/base/',
  headers: () => ({ Authorization: 'Bearer test-token' }),
  fetchImpl: async (url, options) => {
    requests.push({ url: String(url), options });
    const path = new URL(url).pathname;
    if (path.endsWith('/checkpoints')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { schemaVersion: 1, available: true, code: 'OK', partition: 'pirate-fruit', sequences: [1, 3] };
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          schemaVersion: 1,
          complete: true,
          code: 'OK',
          partition: 'pirate-fruit',
          targetSequence: 3,
          reconstructedSequence: 3,
          snapshot: { schemaVersion: 1, partition: 'pirate-fruit', tick: 11, sequence: 3, entities: [] },
        };
      },
    };
  },
});

await transport.getHistoryCheckpoints('pirate-fruit');
await transport.getHistoricalSnapshot('pirate-fruit', 3);

assert.equal(requests.length, 2);
const checkpointsUrl = new URL(requests[0].url);
assert.equal(checkpointsUrl.pathname, '/api/observatory/history/pirate-fruit/checkpoints');
assert.equal(checkpointsUrl.search, '');
const snapshotUrl = new URL(requests[1].url);
assert.equal(snapshotUrl.pathname, '/api/observatory/history/pirate-fruit/snapshot');
assert.equal(snapshotUrl.searchParams.get('sequence'), '3');
for (const request of requests) {
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers.Authorization, 'Bearer test-token');
  assert.equal(new URL(request.url).searchParams.has('token'), false, 'session token leaked into history URL');
}

await assert.rejects(() => transport.getHistoricalSnapshot('pirate-fruit', -1), /sequence/);

console.log('v90 Pirate World Observatory history transport: PASS');
