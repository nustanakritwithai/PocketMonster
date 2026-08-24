import assert from 'node:assert/strict';
import { createServerEconomy } from '../server-economy.mjs';

const calls = [];
const config = { apiBaseUrl: 'https://157.85.96.139', apiVersion: '1.1', featureFlags: { vpsReads: true, economyMutation: true } };
const fetchImpl = async (url, init) => {
  calls.push({ url, init });
  return new Response(JSON.stringify({ success: true, wallet: { cashBalance: 20, bonusBalance: 5 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const economy = createServerEconomy(config, 'secret-session', { fetchImpl });
await economy.wallet();
await economy.purchase('STARTER_BALLS', 'CASH');
assert.equal(calls[0].url, 'https://157.85.96.139/api/wallet');
assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-session');
const purchase = JSON.parse(calls[1].init.body);
assert.equal(purchase.productId, 'STARTER_BALLS');
assert.equal(purchase.currency, 'CASH');
assert.match(purchase.idempotencyKey, /^[0-9a-f-]{36}$/i);
assert.throws(() => createServerEconomy({ ...config, featureFlags: { vpsReads: true, economyMutation: false } }, 'token').purchase('X', 'CASH'), /ปิดการทำรายการเงิน/);
console.log('Server-authoritative economy adapter: PASS');
