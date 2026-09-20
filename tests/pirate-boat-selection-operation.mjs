import assert from 'node:assert/strict';
import { createPirateSaveMemoryStorage } from '../pirate-save-bridge-v900.mjs';
import { operationFromPirateSaveMutation } from '../pirate-central-state-client.mjs';

const key = 'pirate-fruit:boats-v1';
const initial = { ownedBoatIds: ['rowboat', 'sloop'], selectedBoatId: 'rowboat', upgrades: {} };
const mutations = [];
const storage = createPirateSaveMemoryStorage({ [key]: JSON.stringify(initial) }, value => mutations.push(value));
storage.setItem(key, JSON.stringify({ ...initial, selectedBoatId: 'sloop' }));
assert.deepEqual(operationFromPirateSaveMutation(mutations.at(-1)), { type: 'boatSelection', selectedBoatId: 'sloop' });
storage.setItem(key, JSON.stringify({ ...initial, selectedBoatId: 'sloop', coins: 999999 }));
assert.equal(operationFromPirateSaveMutation(mutations.at(-1)), null, 'การบันทึกซ้ำต้องไม่สร้างคำสั่งเศรษฐกิจ');
storage.setItem(key, JSON.stringify({ ...initial, ownedBoatIds: [...initial.ownedBoatIds, 'new-boat'], selectedBoatId: 'new-boat' }));
assert.equal(operationFromPirateSaveMutation(mutations.at(-1)), null, 'การซื้อไม่ใช่การเลือกเรือเดิม');
assert.deepEqual(operationFromPirateSaveMutation({ operation: { type: 'boatSelection', selectedBoatId: 'sloop', coins: 999999 } }),
  { type: 'boatSelection', selectedBoatId: 'sloop' }, 'ไม่ส่งยอดเงินจากเอกสาร client');
console.log('PASS การเลือกเรือเดิมส่งคำสั่งกลางและไม่ส่งยอดเงิน/เรือที่เพิ่งสร้าง');
