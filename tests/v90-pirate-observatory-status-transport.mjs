import assert from 'node:assert/strict';
import { PirateObservatoryRestTransport } from '../pirate-observatory/index.mjs';

const calls = [];
const transport = new PirateObservatoryRestTransport({
  baseUrl: 'https://server.example/game/',
  headers: () => ({ Authorization: 'Bearer runtime-only', 'X-API-Version': '1.1' }),
  fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      async json() {
        return { schemaVersion: 1, ready: false, code: 'OBSERVATORY_NOT_READY', lastObservedTick: -1, mode: 'waiting-authority' };
      },
    };
  },
});

const status = await transport.getStatus();
assert.equal(status.ready, false);
assert.equal(status.mode, 'waiting-authority');
assert.equal(calls.length, 1);
const url = new URL(calls[0].url);
assert.equal(url.pathname, '/api/observatory/status');
assert.equal(url.search, '');
assert.equal(calls[0].options.method, 'GET');
assert.equal(calls[0].options.cache, 'no-store');
assert.equal(calls[0].options.headers.Authorization, 'Bearer runtime-only');
assert.equal(calls[0].options.headers['X-API-Version'], '1.1');
assert.equal(url.href.includes('runtime-only'), false);

console.log('v90 Pirate World Observatory status transport: PASS');
