import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectQualityProfile } from '../performance-runtime.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const painterSrc = fs.readFileSync(new URL('../asset-presentation/blocky-ground.mjs', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../save-schema.mjs', import.meta.url), 'utf8');

function extractFn(name) {
  const start = js.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const next = js.indexOf('\nfunction ', start + 1);
  return js.slice(start, next);
}

assert.doesNotMatch(js, /from ['"]three['"]/, 'mutant 1: do not import the three package');
assert.match(schema, /export const ASSET_REVISION = '813'/, 'mutant 2: polish uses the current ASSET_REVISION');
assert.equal(selectQualityProfile({ deviceMemory: 6, hardwareConcurrency: 6, devicePixelRatio: 2 }).shadows, false,
  'mutant 3: adaptive medium quality must not force a shadow pass');
assert.match(extractFn('addDeco'), /obj\.isMesh/, 'mutant 4: group decorations must flag child meshes, not only the group');
assert.match(extractFn('makeFlower'), /glowMat\(color,color,\.08/, 'mutant 5: flower glow must not fall back to a flat mat');
assert.match(extractFn('makeTree'), /glowMat\(fruit,fruit,\.06/, 'mutant 6: fruit glow must stay on the berry boxes');
assert.match(extractFn('makeStalagmite'), /glowMat\(0x94a3b8,0x4a90d9,\.04/, 'mutant 7: only the stalagmite tip gets mineral glow');
assert.match(painterSrc, /strokeGrid\(img, GROUND_GRID, 1, 0\.14\)/, 'mutant 8: fine grid alpha must stay the polish value');
assert.doesNotMatch(js, /ground\.material\.map\.dispose\(\)/, 'mutant 9: cached ground textures stay shared');
assert.match(
  js,
  /\[\[8,7,1\.35\],\[-11,8,1\.05\],\[16,-10,1\.5\],\[-17,-8,1\.25\],\[3,-19,1\.7\],\[-5,17,1\.15\]\]/,
  'mutant 10: ranch rock coordinates stay',
);
assert.match(js, /makePad\(7,3,3\.4,0x22c55e,\.42\)/, 'mutant 11: ranch pad world pose stays, only floor opacity was polished');
assert.match(js, /makePad\(5\.2,8\.2,1\.6,0xec4899,\.15\)/, 'mutant 12: breeding pad call stays');
assert.match(js, /incubator\.position\.set\(5\.2,0,8\.2\)/, 'mutant 13: incubator stays on the breeding pad');
assert.match(js, /function spawnRingPulse[\s\S]*?boxGeometry\(size,\.02,size\)/, 'mutant 14: polish does not revert ring pulses');
assert.match(js, /sphereGeometry\(\.16\*scale,12,10\)/, 'mutant 15: monster shine stays a sphere');
assert.match(extractFn('switchZone'), /setZoneGround\(zone\)/, 'mutant 16: zone changes still call setZoneGround');
assert.doesNotMatch(extractFn('makeRock') + extractFn('makeTree') + extractFn('makeFlower'), /Math\.random\(/, 'mutant 17: decoration builders stay deterministic');
assert.match(js, /sun\.shadow\.mapSize\.set\(1024,1024\)/, 'mutant 18: enabled shadows stay on a 1024 map, not a heavier atlas');

console.log('V8.0 blocky polish mutants: PASS');
