import assert from 'node:assert/strict';
import * as vendor from '../pirate-fruit-offline/assets/vendor-three-RYo9rfeI.js';
import { threeFromPirateFruitVendor } from '../asset-presentation/pirate-fruit-client-bridge.mjs';
import { createPirateOwnedMonsterCarry } from '../pirate-fruit-offline/pirate-owned-monster-carry.mjs';
import { createPirateMonsterInventorySync } from '../pirate-monster-inventory-sync.mjs';
import { createOnlineScenePresenceBridge } from '../online-world-bridge-v900.mjs';

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
const paintedRevisions = [];
const sync = createPirateMonsterInventorySync({
  bagProvider: { subscribe(listener) { notify = listener; return () => {}; } },
  controlProvider: { refresh(options) { assert.equal(options.afterPending, true); calls++; return new Promise(resolve => { finish = resolve; }); } },
  isPirate: () => pirate,
  onSnapshot: snapshot => paintedRevisions.push(snapshot.revision),
});
notify({ available: true, revision: 1 });
notify({ available: true, revision: 2 });
assert.deepEqual(paintedRevisions, [1, 2], 'ช่องอัปเดตจากกระเป๋า server ทันที ก่อนคำตอบ control-state');
finish(); await Promise.resolve(); await Promise.resolve();
assert.equal(calls, 2, 'revision ที่เข้าขณะอ่านต้องไม่หาย');
finish(); await Promise.resolve();
pirate = false; notify({ available: true, revision: 3 });
assert.equal(calls, 2, 'ไม่แตะ UI ฝั่ง Pocket');
sync.dispose();
let time = 0, pose = { zone: 'pirate-fruit', x: 1, z: 2, dir: 0 }, accepted = true;
const scene = { POCKETMONSTER_WORLD_STATE: () => pose, POCKETMONSTER_WORLD_PRESENCE: () => accepted };
const presence = createOnlineScenePresenceBridge({ getSceneWindow: () => scene, now: () => time });
assert.equal(presence.isReady('pirate-fruit'), false, 'ตำแหน่ง local อย่างเดียวยังไม่ใช่การเข้าร่วม server');
assert.equal(presence.acceptSnapshot({ zone: 'pirate-fruit', players: [] }), true);
assert.equal(presence.isReady('pirate-fruit'), true);
time = 15000;
assert.equal(presence.isReady('pirate-fruit'), false, 'หยุดคำสั่งเมื่อไม่มี snapshot สด');
presence.acceptSnapshot({ zone: 'pirate-fruit', players: [] });
assert.equal(presence.isReady('pirate-fruit'), true, 'กลับมาพร้อมอัตโนมัติเมื่อ server ส่งใหม่');
presence.setTransportConnected(false);
assert.equal(presence.isReady('pirate-fruit'), false);
accepted = false;
assert.equal(presence.acceptSnapshot({ zone: 'pirate-fruit', players: [] }), false);
assert.equal(presence.isReady('pirate-fruit'), false, 'ฉากปฏิเสธ snapshot ต้องไม่ยืนยันว่าพร้อม');
accepted = true;
presence.acceptSnapshot({ zone: 'pirate-fruit', players: [] });
pose = { ...pose, zone: 'hub' };
assert.equal(presence.isReady('hub'), false, 'เปลี่ยนฉากต้องรอ snapshot ของฉากใหม่');
console.log('Pirate inventory updates and native hand carry: PASS');
