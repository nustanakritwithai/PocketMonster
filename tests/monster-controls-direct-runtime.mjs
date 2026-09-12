import assert from 'node:assert/strict';
import { mountDirectMonsterControls } from '../monster-controls-runtime-v900.mjs';

class Button extends EventTarget {
  dataset = {}; classList = { toggle() {} };
  setAttribute() {}
}
const buttons = new Map(['monsterSlot1Btn', 'monsterThrowBtn'].map(id => [id, new Button()]));
const windowLike = new EventTarget();
windowLike.document = { getElementById: id => buttons.get(id) };
windowLike.POCKETMONSTER_WORLD_STATE = () => ({ zone: 'pirate-fruit', x: 1, y: 0, z: 2, dir: 0 });
const originalFetch = globalThis.fetch;
const sent = [];
globalThis.fetch = async (url, init) => {
  if (init.method === 'POST') {
    sent.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ ok: true, accepted: true }) };
  }
  return { ok: true, json: async () => ({ ok: true, monsterControl: {
    party: [{ instanceId: 'owned-a', name: 'คู่หู' }], actors: [], skills: {},
  } }) };
};
let runtime;
try {
  runtime = mountDirectMonsterControls({ windowLike, config: { apiBaseUrl: 'https://example.invalid', apiVersion: '1.1' }, sessionToken: 'test-session' });
  await runtime.provider.refresh();
  assert.equal(mountDirectMonsterControls({ windowLike, sessionToken: 'test-session' }), null);
  buttons.get('monsterSlot1Btn').dispatchEvent(new Event('click'));
  assert.equal(runtime.controller.snapshot().held.instanceId, 'owned-a');
  assert.equal(sent.length, 0);
  buttons.get('monsterThrowBtn').dispatchEvent(new Event('click'));
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, 'summon');
  assert.deepEqual(sent[0].targetPoint, { x: 1, y: 0, z: 6 });
  console.log('Direct game monster buttons → server transport: PASS');
} finally { runtime?.dispose(); globalThis.fetch = originalFetch; }
