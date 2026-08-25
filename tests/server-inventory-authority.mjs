import assert from 'node:assert/strict';
import { applyMonsterAction, consumeInventory, learnMonsterSkill, redeemItemCode, setMonsterEquipment } from '../server-sync.mjs';

const config = { apiBaseUrl: 'https://server.example', apiVersion: '1.1' };
const calls = [];
const fetchImpl = async (url, init) => {
  calls.push({ url, init, body: JSON.parse(init.body) });
  if (url.endsWith('/api/player/inventory/consume')) return new Response(JSON.stringify({ success: true, itemId: 'healthy', quantity: 3 }), { status: 200 });
  if (url.endsWith('/api/player/equipment')) return new Response(JSON.stringify({ success: true, instanceId: 'monster_1', monsterJson: '{"instanceId":"monster_1"}' }), { status: 200 });
  if (url.endsWith('/api/player/skills/learn')) return new Response(JSON.stringify({ success: true, instanceId: 'monster_1', monsterJson: '{"instanceId":"monster_1"}' }), { status: 200 });
  if (url.endsWith('/api/player/monster-action')) return new Response(JSON.stringify({ success: true, instanceId: 'monster_1', quantity: 2, monsterJson: '{"instanceId":"monster_1"}' }), { status: 200 });
  return new Response(JSON.stringify({ success: true, itemId: 'healthy', amount: 1, totalQuantity: 4 }), { status: 200 });
};

assert.equal((await consumeInventory(config, 'session', 'healthy', 1, 'FEED', { fetchImpl })).quantity, 3);
await setMonsterEquipment(config, 'session', 'monster_1', 'starter_charm', 'charm', false, { fetchImpl });
await setMonsterEquipment(config, 'session', 'monster_1', null, 'charm', true, { fetchImpl });
await learnMonsterSkill(config, 'session', 'monster_1', 'Flame Bite', 's1', { fetchImpl });
assert.equal((await applyMonsterAction(config, 'session', 'monster_1', 'FEED', 'healthy', { fetchImpl })).quantity, 2);
assert.equal((await redeemItemCode(config, 'session', 'WELCOME84', { fetchImpl })).totalQuantity, 4);

for (const call of calls) {
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers.Authorization, 'Bearer session');
  assert.equal(call.init.headers['X-API-Version'], '1.1');
}
assert.deepEqual(calls[1].body, { instanceId: 'monster_1', itemId: 'starter_charm', slot: 'charm', unequip: false });
assert.deepEqual(calls[2].body, { instanceId: 'monster_1', itemId: null, slot: 'charm', unequip: true });
assert.deepEqual(calls[3].body, { instanceId: 'monster_1', skillId: 'Flame Bite', slot: 's1' });

await assert.rejects(
  consumeInventory(config, 'session', 'healthy', 1, 'FEED', { fetchImpl: async () => new Response(JSON.stringify({ success: false, message: 'ของไม่พอ' }), { status: 400 }) }),
  error => error.status === 400 && error.message === 'ของไม่พอ',
);
console.log('MonsterLife inventory/equipment/skill authority contract passed');
