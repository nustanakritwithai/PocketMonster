import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../worlds-v900.mjs', import.meta.url), 'utf8');
const start = source.indexOf("if (typeof window !== 'undefined') {", source.indexOf('// ฉาก Pirate และ prewarm'));
const end = source.indexOf('for (const world of COMBINED_WORLDS)', start);
assert.ok(start >= 0 && end > start);
const install = new Function('window', 'preparePocketRuntime', 'worldById', 'initialWorldBootReady', source.slice(start, end));

let releaseBoot;
const bootReady = new Promise(resolve => { releaseBoot = resolve; });
const target = {};
let imports = 0;
let captured;
install(target, async () => { imports++; captured = target.POCKETMONSTER_WORLD_STATE; return true; }, id => ({ id }), bootReady);
const earlyBag = target.POCKETMONSTER_MANAGED_POCKET_PREPARE();
await Promise.resolve();
assert.equal(imports, 0, 'เปิดกระเป๋าระหว่าง bootstrap ต้องไม่เริ่ม Pocket import ทับ globals ของ Pirate');
const pirateState = () => ({ zone: 'pirate-fruit', x: 0, z: 8, dir: 0 });
target.POCKETMONSTER_WORLD_STATE = pirateState;
releaseBoot();
assert.equal(await earlyBag, true);
assert.equal(imports, 1);
assert.equal(captured, pirateState, 'เริ่ม prewarm เมื่อ Pirate ลงทะเบียน active bindings แล้วเท่านั้น');

const failed = Promise.reject(new Error('boot-failed'));
failed.catch(() => {});
install(target, async () => { imports++; }, id => ({ id }), failed);
await assert.rejects(target.POCKETMONSTER_MANAGED_POCKET_PREPARE(), /boot-failed/);
assert.equal(imports, 1, 'boot ล้มเหลวต้องไม่เริ่ม runtime สำรอง');
console.log('Pirate prewarm waits for initial world registration: PASS');
