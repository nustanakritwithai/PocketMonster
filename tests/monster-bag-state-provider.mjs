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
let inventory = structuredClone(original.envelope.state), revision = 4;
let readFails = false;
const urls = [];
const central = createMonsterBagStateProvider({ config, sessionToken: 'fixture-session', fetchImpl: async (url, init) => {
  urls.push(url);
  if (init.method === 'POST') {
    const command = JSON.parse(init.body);
    assert.equal(command.expectedRevision, revision);
    assert.equal(command.destination, 'ranch');
    assert.equal(command.instanceId, 'owned_b');
    inventory.ranchActive = ['owned_b']; revision++;
    return new Response(JSON.stringify({ ok: true, revision }));
  }
  if (readFails) return new Response(JSON.stringify({ ok: false, code: 'INVENTORY_UNAVAILABLE' }), { status: 503 });
  return new Response(JSON.stringify({ ok: true, revision, inventory }));
} });
const changes = [];
const unsubscribe = central.subscribe(value => changes.push(value.available));
await central.refresh();
assert.equal((await central.moveTo('owned_b', 'ranch')).ok, true);
assert.deepEqual(central.snapshot().envelope.state.storage, ['owned_b']);
assert.deepEqual(central.snapshot().envelope.state.ranchActive, ['owned_b']);
assert.equal(urls.some(url => url.endsWith('/api/save')), false, 'กระเป๋าไม่อ่านเซฟออฟไลน์/เซฟรวมเป็น fallback');
assert.ok(urls.some(url => url.endsWith('/api/monsters/placement')));
readFails = true;
assert.equal((await central.refresh()).code, 'INVENTORY_UNAVAILABLE');
assert.equal(central.snapshot().available, false);
assert.equal(changes.at(-1), false, 'ทุกหน้าต้องเห็นข้อมูลไม่พร้อมพร้อมกัน');
unsubscribe(); central.dispose();
let starterState = { collection: [], party: [null,null,null], storage: [], ranchActive: [] };
const starterCommands = [];
const fresh = createMonsterBagStateProvider({ config, sessionToken: 'fixture-session', fetchImpl: async (url, init) => {
  if (init.method === 'POST') {
    assert.ok(url.endsWith('/api/monsters/starter'));
    const command = JSON.parse(init.body); starterCommands.push(command);
    assert.deepEqual(Object.keys(command), ['commandId'], 'ชนิด/เลเวล/มอนเก่าไม่ถูกส่งจาก client');
    starterState = { ...starterState, collection: [{ instanceId: 'server_starter', speciesId: 'normalooze' }], party: ['server_starter',null,null] };
    return new Response(JSON.stringify({ ok: true, revision: 1 }));
  }
  return new Response(JSON.stringify({ ok: true, revision: starterState.collection.length, inventory: starterState }));
} });
assert.equal((await fresh.claimStarter()).ok, true);
assert.equal(fresh.snapshot().slots[0].instanceId, 'server_starter');
assert.equal(starterCommands.length, 1);
fresh.dispose();
console.log('Monster bag canonical assignment and ranch inventory: PASS');
