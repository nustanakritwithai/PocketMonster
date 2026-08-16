import assert from 'node:assert/strict';
import fs from 'node:fs';

import { pixelDiffRatio } from '../asset-presentation/four-side/apply.mjs';
import { paintGroundGrid, paintSkyGradient } from '../asset-presentation/blocky-ground.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const painterSrc = fs.readFileSync(new URL('../asset-presentation/blocky-ground.mjs', import.meta.url), 'utf8');

assert.doesNotMatch(js, /from ['"]three['"]/, 'mutant 1: do not import the three package');
assert.doesNotMatch(painterSrc, /from ['"]three['"]/, 'mutant 2: ground painter stays three-free');
assert.match(js, /planeGeometry\(90,\s*90\)/, 'mutant 3: ground plane stays 90x90');
assert.match(
  js,
  /\[\[8,7,1\.35\],\[-11,8,1\.05\],\[16,-10,1\.5\],\[-17,-8,1\.25\],\[3,-19,1\.7\],\[-5,17,1\.15\]\]/,
  'mutant 4: ranch rock coordinates stay',
);
assert.match(
  js,
  /\[\[-14,8,1\.2\],\[12,-12,1\.4\],\[18,6,1\.1\],\[-16,-9,1\.3\],\[7,14,1\.5\],\[-6,-16,1\.2\]\]/,
  'mutant 5: meadow rock coordinates stay',
);
assert.match(
  js,
  /\[\[-10,6,1\.4,0x57534e\],\[9,-7,1\.6,0x44403c\],\[14,4,1\.2,0x78716c\],\[-15,-5,1\.5,0x57534e\],\[3,-15,1\.8,0x3f3f46\],\[-4,16,1\.3,0x52525b\]\]/,
  'mutant 6: cave rock coordinates stay',
);
assert.match(
  js,
  /makeFencePost\(7\+Math\.cos\(a\)\*3\.55,3\+Math\.sin\(a\)\*3\.55\)/,
  'mutant 7: ranch fence ring radius stays',
);
assert.match(
  js,
  /\[\[6\.2,1\.4\],\[8\.4,4\.6\],\[5\.1,4\.8\],\[4\.4,7\.4\]\]/,
  'mutant 8: ranch flower coordinates stay',
);
assert.match(
  js,
  /\[\[-8,-4,1\.1\],\[6,-9,1\.3\],\[-12,9,1\.4\],\[11,8,1\.2\],\[0,-12,1\.6\],\[15,-2,1\],\[-6,12,1\.25\]\]/,
  'mutant 9: cave stalagmite coordinates stay',
);
assert.match(js, /makePad\(7,3,3\.4,0x22c55e,\.42\)/, 'mutant 10: ranch pad stays at (7,3) size 3.4');
assert.match(js, /incubator\.position\.set\(5\.2,0,8\.2\)/, 'mutant 11: incubator stays at the breeding pad');
assert.doesNotMatch(js, /ground\.material\.map\.dispose\(\)/, 'mutant 12: cached ground textures are shared, not disposed');
assert.doesNotMatch(painterSrc, /zoneColor\s*\+\s*0x404040/, 'mutant 13: sky bottoms do not overflow per-channel');
assert.match(js, /new THREE\.Fog\(0x65c9f5,30,76\)/, 'mutant 14: boot Fog constructor stays 0x65c9f5,30,76');

const a = paintGroundGrid(0x62c96b, 'grass');
const b = paintGroundGrid(0x62c96b, 'grass');
assert.equal(pixelDiffRatio(a, b), 0, 'mutant 15: ground paint must not use unseeded Math.random');

const skyA = paintSkyGradient(0x72c7ef);
const skyB = paintSkyGradient(0x72c7ef);
assert.equal(pixelDiffRatio(skyA, skyB), 0, 'mutant 16: sky paint is deterministic');

console.log('V8.0 blocky ground mutants: PASS');
