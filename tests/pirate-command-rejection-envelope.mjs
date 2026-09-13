import assert from 'node:assert/strict';
import { createMonsterHttpProvider } from '../monster-command-http-provider-v900.mjs';

const calls = [];
const provider = createMonsterHttpProvider({
  config: { apiBaseUrl: 'https://game.invalid', apiVersion: '1.1' },
  sessionToken: 'session-token',
  getZone: () => 'pirate-fruit',
  fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return {
      ok: false,
      status: 400,
      async json() {
        return { ok: false, accepted: false, errorCode: 'REQUEST_FAILED', code: 'MONSTER_NOT_IN_PARTY', commandId: 'cmd-1' };
      },
    };
  },
});

const result = await provider.send({
  contract: 'owned-monster-command/v1',
  kind: 'summon',
  commandId: 'cmd-1',
  instanceId: 'monster-1',
  zone: 'pirate-fruit',
  targetPoint: { x: 1, y: 0, z: 2 },
});

assert.equal(calls.length, 1, 'command uses the real HTTP provider path');
assert.equal(calls[0].url, 'https://game.invalid/api/monsters/command');
assert.equal(result.ok, false);
assert.equal(result.code, 'MONSTER_NOT_IN_PARTY', 'specific server code survives generic REQUEST_FAILED envelope');
assert.equal(result.commandId, 'cmd-1');

provider.dispose();
console.log('Pirate command rejection envelope: PASS');
