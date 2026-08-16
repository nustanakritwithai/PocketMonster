import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileLabAppearance, exportAppearancePacket, normalizeLabInput } from '../asset-lab/compiler.mjs';
import { previewMatrix, previewState, PREVIEW_CAMERA } from '../asset-lab/preview.mjs';

const html = fs.readFileSync(new URL('../asset-lab/index.html', import.meta.url), 'utf8');
const gameHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /Asset Lab/);
assert.doesNotMatch(gameHtml, /asset-lab\/index.html/, 'Asset Lab must not be wired into the live game entry');
assert.equal(PREVIEW_CAMERA.lookY, 1.1);

const four = compileLabAppearance({
  id: 'appearance.human.player-orange.v1',
  mode: 'four',
  front: 'head.front.png',
  right: 'head.right.png',
  back: 'head.back.png',
  left: 'head.left.png',
});
const again = compileLabAppearance({
  id: 'appearance.human.player-orange.v1',
  mode: 'four',
  front: 'head.front.png',
  right: 'head.right.png',
  back: 'head.back.png',
  left: 'head.left.png',
});
assert.equal(four.contentHash, again.contentHash);
assert.equal(exportAppearancePacket(four).atlas.materialCount, 1);

const strip = normalizeLabInput({ mode: 'strip', stripId: 'head', part: 'head' });
assert.equal(strip.mode, 'strip');
assert.equal(strip.parts.head.front, 'head.front');

const shots = previewMatrix(four);
assert.equal(shots.length, 4 * 4 + 2);
assert.equal(previewState({ appearanceId: four.id, contentHash: four.contentHash, yaw: 90 }).seed, shots.find(s => s.yaw === 90 && s.pose === 'idle').seed);

console.log('V8.0 FS2 Asset Lab: PASS');
