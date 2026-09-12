import assert from 'node:assert/strict';
import { createMonsterBagStateProvider } from '../monster-bag-state-provider-v900.mjs';

const config = { apiBaseUrl: 'https://fixture.invalid/', apiVersion: '1.1' };
const original = { revision: 4, envelope: { state: {
  collection: [{ instanceId: 'owned_a', name: 'A' }, { instanceId: 'owned_b', name: 'B' }],
  party: ['owned_a', null, null], storage: ['owned_b'], ranchActive: [],
} } };
let saved = structuredClone(original);
let failTransport = true;
const commands = [];
const provider = createMonsterBagStateProvider({ config, sessionToken: 'fixture-session-secret',
  load: async () => structuredClone(saved),
  fetchImpl: async (_url, init) => {
    const command = JSON.parse(init.body); commands.push(command);
    assert.equal(init.headers['X-Game-Version'], '8.4.0');
    assert.equal(init.headers.Authorization, 'Bearer fixture-session-secret');
    assert.deepEqual(Object.keys(command).sort(), ['commandId', 'expectedRevision', 'instanceId', 'slot']);
    assert.match(command.commandId, /^[0-9a-f-]{36}$/);
    if (failTransport) { failTransport = false; throw new Error('fixture transport'); }
    saved.envelope.state.party[command.slot] = command.instanceId;
    saved.envelope.state.storage = [];
    saved.revision += 1;
    return new Response(JSON.stringify({ ok: true, revision: saved.revision }));
  },
});
await provider.refresh();
assert.equal(provider.snapshot().slots.length, 3);
assert.equal((await provider.assignToSlot('not_owned', 2)).code, 'MONSTER_NOT_OWNED');
assert.equal(commands.length, 0);
assert.equal((await provider.assignToSlot('owned_b', 2)).ok, false);
assert.equal(provider.snapshot().slots[2].instanceId, '');
assert.equal((await provider.assignToSlot('owned_b', 2)).ok, true);
assert.deepEqual(commands[1], commands[0], 'เน็ตขาดแล้วลองใหม่ต้องใช้ command เดิม');
assert.equal(provider.snapshot().slots[2].instanceId, 'owned_b');
provider.dispose();

let activeToken = 'first-fixture-session';
let resolveRead;
const delayed = createMonsterBagStateProvider({ config, getSessionToken: () => activeToken,
  load: () => new Promise(resolve => { resolveRead = resolve; }),
});
const pending = delayed.refresh();
activeToken = 'second-fixture-session';
resolveRead(structuredClone(original));
assert.equal((await pending).code, 'STALE_SESSION');
assert.equal(delayed.snapshot().available, false, 'ห้ามแสดงกระเป๋าบัญชีเดิมหลังเปลี่ยน session');
delayed.dispose();

const unconfirmed = createMonsterBagStateProvider({ config, sessionToken: 'fixture-session',
  load: async () => structuredClone(original),
  fetchImpl: async () => new Response(JSON.stringify({ ok: true, revision: 5 })),
});
assert.equal((await unconfirmed.assignToSlot('owned_b', 1)).code, 'SERVER_ASSIGN_UNCONFIRMED', 'ACK อย่างเดียวไม่ยืนยันว่าปุ่มผูกมอนถูกตัว');
unconfirmed.dispose();
console.log('Monster bag canonical assignment: PASS');
