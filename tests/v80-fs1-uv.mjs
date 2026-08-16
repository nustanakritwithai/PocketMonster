import assert from 'node:assert/strict';
import fs from 'node:fs';
import { atlasLayout, assertOrientation, faceOffset, FACE_AXES } from '../asset-presentation/four-side/uv.mjs';
import { compileAppearance, faceList } from '../asset-presentation/four-side/atlas.mjs';
import { resolveFaceSource } from '../asset-presentation/four-side/fallback.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(js, /sphereGeometry\(\.22/, 'FS1 must not replace in-game characters');

const layout = atlasLayout();
assert.deepEqual(assertOrientation(layout), []);
assert.equal(FACE_AXES.front.sign, -1);
assert.equal(layout.gutter, 4);
assert.ok(layout.faces.front.uv.u0 > 0);
assert.ok(layout.faces.front.uv.u1 < 0.5);
assert.notEqual(layout.faces.front.uv.u0, layout.faces.right.uv.u0);
assert.equal(faceOffset(0.56), -(0.56 / 2 + 0.002));

const missingBack = resolveFaceSource({ front: 'head.front.png', topColor: '#F97316' }, 'back');
assert.equal(missingBack.fallback, 'color');
assert.equal(missingBack.mirrored, false);
assert.notEqual(missingBack.source, 'head.front.png');

const leftFromRight = resolveFaceSource({ right: 'head.right.png' }, 'left');
assert.equal(leftFromRight.source, 'head.right.png');
assert.equal(leftFromRight.mirrored, false);

const compiled = compileAppearance({
  id: 'appearance.human.player-orange.v1',
  mode: 'four',
  parts: {
    head: {
      front: 'head.front.png',
      right: 'head.right.png',
      topColor: '#F97316',
      bottomColor: '#FFC4A3',
    },
  },
});
assert.equal(compiled.materialCount, 1);
assert.equal(faceList(compiled, 'head').length, 6);
assert.equal(compileAppearance({
  id: 'appearance.human.player-orange.v1',
  mode: 'four',
  parts: {
    head: {
      front: 'head.front.png',
      right: 'head.right.png',
      topColor: '#F97316',
      bottomColor: '#FFC4A3',
    },
  },
}).contentHash, compiled.contentHash);

console.log('V8.0 FS1 four-side UV: PASS');
