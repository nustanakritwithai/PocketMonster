import assert from 'node:assert/strict';
import fs from 'node:fs';

import { pixelDiffRatio } from '../asset-presentation/four-side/apply.mjs';
import { paintGroundGrid } from '../asset-presentation/blocky-ground.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const painterSrc = fs.readFileSync(new URL('../asset-presentation/blocky-ground.mjs', import.meta.url), 'utf8');

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

const lighting = extractFn('setZoneLighting');
const ground = extractFn('setZoneGround');
const switchZone = extractFn('switchZone');

assert.match(js, /const hemi=new THREE\.HemisphereLight\(0xffffff,0x42643d,1\.55\)/, 'boot hemisphere stays named hemi at 1.55');
assert.match(js, /new THREE\.Fog\(0x65c9f5,30,76\)/, 'boot Fog constructor stays the ranch default');
assert.match(js, /const sun=new THREE\.DirectionalLight\(0xffffff,2\.15\)/, 'boot sun intensity stays 2.15');

assert.match(lighting, /hemi\.intensity=0\.6/, 'cave hemisphere drops to 0.6');
assert.match(lighting, /sun\.intensity=0\.8/, 'cave sun drops to 0.8');
assert.match(lighting, /sun\.color\.setHex\(0xb0c4de\)/, 'cave sun is cool slate');
assert.match(lighting, /sun\.color\.setHex\(0xffffff\)/, 'grassland sun stays white');
assert.match(lighting, /sun\.color\.setHex\(0xfff4e0\)/, 'hub sun is warm gold');
assert.match(lighting, /hemi\.intensity=1\.55/, 'outdoor hemisphere restores to 1.55');
assert.match(lighting, /sun\.intensity=2\.15/, 'outdoor sun restores to 2.15');
assert.doesNotMatch(lighting, /scene\.children\.find/, 'lighting uses the named hemi, not a scene scan');

assert.match(ground, /setZoneLighting\(zone\)/, 'ground swap also applies zone lighting');
assert.match(ground, /scene\.fog\.color\.setHex\(zone==='cave'\?0x1e293b:\(zone==='hub'\?0x65c9f5:z\.bg\)\)/, 'hub fog is table 0x65c9f5, cave 0x1e293b, meadow uses sky');
assert.match(ground, /scene\.fog\.near=zone==='cave'\?15:zone==='frozen-pass'\?18:zone==='rocky-canyon'\?24:zone==='sky-ruins'\?22:zone==='poison-marsh'\?18:zone==='dream-shrine'\?20:zone==='haunted-woods'\?14:30/, 'stage fog uses readable near distances');
assert.match(ground, /scene\.fog\.far=zone==='cave'\?50:zone==='frozen-pass'\?62:zone==='rocky-canyon'\?68:zone==='sky-ruins'\?80:zone==='poison-marsh'\?58:zone==='dream-shrine'\?64:zone==='haunted-woods'\?48:76/, 'stage fog uses readable far distances');
assert.match(ground, /makeGroundTexture\(z\.ground,type\)/, 'zone still swaps the tiled ground map');
assert.match(ground, /makeSkyTexture\(z\.bg\)/, 'zone still swaps the sky gradient');

assert.match(switchZone, /setZoneGround\(zone\)/, 'switchZone still routes atmosphere through setZoneGround');

assert.match(painterSrc, /scatter\(img, 36, 3, 3, \[0, 0, 0\]/, 'cave grid uses extra black speckles');
assert.match(painterSrc, /scatter\(img, 34, 2, 3, \[125, 211, 252\]/, 'Frozen Pass grid uses blue ice speckles');
assert.match(painterSrc, /scatter\(img, 34, 3, 2, \[120, 53, 15\]/, 'Rocky Canyon grid uses brown rock speckles');
assert.match(painterSrc, /scatter\(img, 34, 2, 2, \[51, 65, 85\]/, 'Sky Ruins grid uses slate ruin speckles');
assert.match(painterSrc, /scatter\(img, 34, 2, 3, \[132, 204, 22\]/, 'Poison Marsh grid uses lime marsh speckles');
assert.match(painterSrc, /scatter\(img, 34, 2, 2, \[216, 180, 254\]/, 'Dream Shrine grid uses violet shrine speckles');
assert.match(painterSrc, /scatter\(img, 34, 3, 2, \[71, 85, 105\]/, 'Haunted Woods grid uses slate woods speckles');
assert.match(painterSrc, /scatter\(img, 30, 2, 4, \[0, 100, 0\]/, 'grass grid keeps green marks');

const cave = paintGroundGrid(0x57606f, 'cave');
const grassOnCaveFill = paintGroundGrid(0x57606f, 'grass');
assert.ok(pixelDiffRatio(cave, grassOnCaveFill) > 0.002, 'cave black speckles still differ from grass marks');
const frozen = paintGroundGrid(0xdbeafe, 'frozen');
const frozenAsGrass = paintGroundGrid(0xdbeafe, 'grass');
assert.ok(pixelDiffRatio(frozen, frozenAsGrass) > 0.002, 'Frozen Pass ice speckles differ from grass marks');
const rocky = paintGroundGrid(0x9a6b3f, 'rocky');
const rockyAsGrass = paintGroundGrid(0x9a6b3f, 'grass');
assert.ok(pixelDiffRatio(rocky, rockyAsGrass) > 0.002, 'Rocky Canyon rock speckles differ from grass marks');
const ruins = paintGroundGrid(0x64748b, 'ruins');
const ruinsAsGrass = paintGroundGrid(0x64748b, 'grass');
assert.ok(pixelDiffRatio(ruins, ruinsAsGrass) > 0.002, 'Sky Ruins slate speckles differ from grass marks');
const marsh = paintGroundGrid(0x365314, 'marsh');
const marshAsGrass = paintGroundGrid(0x365314, 'grass');
assert.ok(pixelDiffRatio(marsh, marshAsGrass) > 0.002, 'Poison Marsh speckles differ from grass marks');
const shrine = paintGroundGrid(0x6d28d9, 'shrine');
const shrineAsGrass = paintGroundGrid(0x6d28d9, 'grass');
assert.ok(pixelDiffRatio(shrine, shrineAsGrass) > 0.002, 'Dream Shrine speckles differ from grass marks');
const woods = paintGroundGrid(0x334155, 'woods');
const woodsAsGrass = paintGroundGrid(0x334155, 'grass');
assert.ok(pixelDiffRatio(woods, woodsAsGrass) > 0.002, 'Haunted Woods speckles differ from grass marks');

console.log('V8.0 blocky atmosphere: PASS');
