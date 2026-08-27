import assert from 'node:assert/strict';
import fs from 'node:fs';
import { refreshPatchFiles } from '../patch-updater.mjs';

const source = fs.readFileSync(new URL('../patch-updater.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /setTimeout\(\(\) => location\.reload\(\), 5000\)/, 'patch failure must not create an automatic reload loop');
assert.doesNotMatch(source, /searchParams\.set\(['"]patch['"]/, 'patch refresh must use the canonical asset cache key');
assert.match(source, /MAX_CONCURRENT_DOWNLOADS = 6/, 'patch downloads must use bounded concurrency');
assert.match(source, /เข้าเกมด้วยไฟล์ที่มีอยู่/, 'a failed patch must offer a non-looping continuation');

let active = 0;
let peak = 0;
const requested = [];
const files = Array.from({ length: 12 }, (_, index) => ({ path: `asset-${index}.mjs`, size: 4 }));
const fetchImpl = async url => {
  active += 1;
  peak = Math.max(peak, active);
  requested.push(String(url));
  await new Promise(resolve => setTimeout(resolve, 2));
  active -= 1;
  return new Response(new Uint8Array(4), { status: 200 });
};
let progress = 0;
await refreshPatchFiles(files, value => { progress = value; }, { fetchImpl, concurrency: 3 });
assert.equal(requested.length, files.length);
assert.equal(peak, 3, 'worker count must bound simultaneous downloads');
assert.equal(progress, 48);
assert.ok(requested.every(url => !new URL(url).search), 'canonical URLs must not add cache-busting queries');

console.log('Patch updater bounded-concurrency and no-loop contract: PASS');
