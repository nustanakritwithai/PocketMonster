import assert from 'node:assert/strict';
import * as vendor from '../pirate-fruit-offline/assets/vendor-three-RYo9rfeI.js';
import { threeFromPirateFruitVendor } from '../asset-presentation/pirate-fruit-client-bridge.mjs';
import { createPirateOwnedMonsterCarry } from '../pirate-fruit-offline/pirate-owned-monster-carry.mjs';
import { createPirateMonsterInventorySync } from '../pirate-monster-inventory-sync.mjs';

const THREE = threeFromPirateFruitVendor(vendor);
const player = new THREE.Group();
const hand = new THREE.Group(); hand.name = 'socket:right-palm'; player.add(hand);
const carry = createPirateOwnedMonsterCarry({ THREE });
carry.setHeld({ instanceId: 'owned-a' });
carry.setPlayerHost(player); carry.update();
assert.equal(hand.children.length, 1);
assert.equal(carry.diagnostics().attached, true);
const mesh = hand.children[0].children[0];
let disposed = 0;
mesh.geometry.addEventListener('dispose', () => disposed++);
carry.setHeld(null);
assert.equal(hand.children.length, 0);
assert.equal(disposed, 1);

let notify, finish, calls = 0, pirate = true;
const sync = createPirateMonsterInventorySync({
  bagProvider: { subscribe(listener) { notify = listener; return () => {}; } },
  controlProvider: { refresh(options) { assert.equal(options.afterPending, true); calls++; return new Promise(resolve => { finish = resolve; }); } },
  isPirate: () => pirate,
});
notify({ available: true, revision: 1 });
notify({ available: true, revision: 2 });
finish(); await Promise.resolve(); await Promise.resolve();
assert.equal(calls, 2, 'revision ที่เข้าขณะอ่านต้องไม่หาย');
finish(); await Promise.resolve();
pirate = false; notify({ available: true, revision: 3 });
assert.equal(calls, 2, 'ไม่แตะ UI ฝั่ง Pocket');
sync.dispose();
console.log('Pirate inventory updates and native hand carry: PASS');
