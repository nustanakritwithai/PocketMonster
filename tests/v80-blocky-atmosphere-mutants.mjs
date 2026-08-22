import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const painterSrc = fs.readFileSync(new URL('../asset-presentation/blocky-ground.mjs', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../save-schema.mjs', import.meta.url), 'utf8');

function extractFn(name) {
  const start = js.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = js.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < js.length; i++) {
    if (js[i] === '{') depth += 1;
    else if (js[i] === '}') {
      depth -= 1;
      if (depth === 0) return js.slice(start, i + 1);
    }
  }
  assert.fail(`unclosed ${name}`);
}

assert.doesNotMatch(js, /from ['"]three['"]/, 'mutant 1: do not import the three package');
assert.match(schema, /export const ASSET_REVISION = '810'/, 'mutant 2: atmosphere ASSET_REVISION stays 810');

const lighting = extractFn('setZoneLighting');
const ground = extractFn('setZoneGround');
const flower = extractFn('makeFlower');

assert.doesNotMatch(lighting, /scene\.children\.find/, 'mutant 3: do not look up hemi by scanning the scene');
assert.match(js, /const hemi=new THREE\.HemisphereLight/, 'mutant 4: hemisphere stays a named light');
assert.match(ground, /scene\.fog\.near=zone==='cave'\?15:zone==='frozen-pass'\?18:zone==='rocky-canyon'\?24:zone==='sky-ruins'\?22:zone==='poison-marsh'\?18:zone==='dream-shrine'\?20:30/, 'mutant 5: stage fog near distances stay intentional');
assert.match(ground, /scene\.fog\.far=zone==='cave'\?50:zone==='frozen-pass'\?62:zone==='rocky-canyon'\?68:zone==='sky-ruins'\?80:zone==='poison-marsh'\?58:zone==='dream-shrine'\?64:76/, 'mutant 6: stage fog far distances stay intentional');
assert.match(ground, /zone==='hub'\?0x65c9f5/, 'mutant 7: hub fog must not reuse the sky hex');
assert.match(lighting, /sun\.color\.setHex\(0xb0c4de\)/, 'mutant 8: cave sun color must cool down');
assert.match(lighting, /sun\.color\.setHex\(0xfff4e0\)/, 'mutant 9: hub sun color must warm up');
assert.match(lighting, /hemi\.intensity=0\.6/, 'mutant 10: cave hemisphere must dim');
assert.doesNotMatch(js, /ground\.material\.map\.dispose\(\)/, 'mutant 11: cached ground textures stay shared');
assert.match(
  js,
  /\[\[8,7,1\.35\],\[-11,8,1\.05\],\[16,-10,1\.5\],\[-17,-8,1\.25\],\[3,-19,1\.7\],\[-5,17,1\.15\]\]/,
  'mutant 12: ranch rock coordinates stay',
);
assert.match(js, /makePad\(7,3,3\.4,0x22c55e,\.42\)/, 'mutant 13: ranch pad call stays');
assert.match(js, /function spawnRingPulse[\s\S]*?boxGeometry\(size,\.02,size\)/, 'mutant 14: Phase 5 does not revert ring pulses');
assert.match(flower, /glowMat\(color,color,\.08/, 'mutant 15: flower bloom now uses the Phase 6 emissive glow');
assert.match(painterSrc, /zoneType === 'cave'/, 'mutant 16: cave grid still uses the cave speckle path');
assert.match(painterSrc, /zoneType === 'rocky'/, 'mutant 17: Rocky Canyon grid still uses the rock speckle path');
assert.match(painterSrc, /zoneType === 'ruins'/, 'mutant 18: Sky Ruins grid still uses the slate speckle path');
assert.match(painterSrc, /zoneType === 'marsh'/, 'mutant 19: Poison Marsh grid still uses the lime speckle path');
assert.match(painterSrc, /zoneType === 'shrine'/, 'mutant 20: Dream Shrine grid still uses the violet speckle path');
assert.match(extractFn('switchZone'), /setZoneGround\(zone\)/, 'mutant 17: zone changes still call setZoneGround');
assert.match(js, /sphereGeometry\(\.16\*scale,12,10\)/, 'mutant 21: monster shine stays a sphere');

console.log('V8.0 blocky atmosphere mutants: PASS');
