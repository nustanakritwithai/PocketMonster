import assert from 'node:assert/strict';
import fs from 'node:fs';

import { pixelDiffRatio } from '../asset-presentation/four-side/apply.mjs';
import { GROUND_COARSE, GROUND_GRID, paintGroundGrid } from '../asset-presentation/blocky-ground.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const painterSrc = fs.readFileSync(new URL('../asset-presentation/blocky-ground.mjs', import.meta.url), 'utf8');

function extractFn(name) {
  const start = js.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const headerEnd = js.indexOf('){', start) >= 0 ? js.indexOf('){', start) : js.indexOf(') {', start);
  assert.ok(headerEnd > start, `${name} header`);
  const brace = js.indexOf('{', headerEnd);
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

function lumaAt(img, x, y) {
  const i = (y * img.width + x) * 4;
  return img.rgba[i] * 0.299 + img.rgba[i + 1] * 0.587 + img.rgba[i + 2] * 0.114;
}

const flower = extractFn('makeFlower');
const tree = extractFn('makeTree');
const stalagmite = extractFn('makeStalagmite');
const addDeco = extractFn('addDeco');
const incubatorSrc = js.slice(js.indexOf('const incubator='), js.indexOf('// ---------- Monster species'));

assert.match(js, /function glowMat\(/, 'polish caches emissive materials');
assert.match(flower, /glowMat\(color,color,\.08/, 'flower bloom has a small emissive glow');
assert.match(tree, /glowMat\(fruit,fruit,\.06/, 'fruit boxes have a small emissive glow');
assert.match(stalagmite, /glowMat\(0x94a3b8,0x4a90d9,\.04/, 'stalagmite tips have a cool mineral glow');
assert.match(incubatorSrc, /emissiveIntensity:\.15/, 'incubator egg glow matches the polish spec');
assert.match(addDeco, /mesh\.traverse\(obj=>\{ if\(obj\.isMesh\)\{ obj\.castShadow=true; obj\.receiveShadow=true; \} \}\)/, 'every decoration mesh casts and receives shadow');
assert.match(incubatorSrc, /baseInc\.castShadow=true/, 'incubator base casts a shadow when the quality tier allows it');
assert.match(js, /renderer\.shadowMap\.enabled=qualityProfile\.shadows/, 'shadow map still follows the quality profile');
assert.match(js, /tier:'medium',maxDpr:1\.25,antialias:true,shadows:false/, 'medium profile keeps shadows off so FPS does not drop');
assert.match(js, /if\(qualityProfile\.shadows\)/, 'high-tier shadow camera is ready without forcing shadows on medium');
assert.match(js, /sun\.shadow\.mapSize\.set\(1024,1024\)/, 'shadow map stays 1024 when enabled');
assert.match(js, /makePad\(7,3,3\.4,0x22c55e,\.42\)/, 'ranch pad floor is more visible on green grass');
assert.match(painterSrc, /strokeGrid\(img, GROUND_GRID, 1, 0\.14\)/, 'fine grid lines are stronger');
assert.match(painterSrc, /strokeGrid\(img, GROUND_COARSE, 2, 0\.24\)/, 'coarse grid lines are stronger');
assert.match(tree, /g\.rotation\.y=\(x\*1\.3\+z\)\*\.08/, 'trees get a seeded yaw so they are not identical');
assert.match(flower, /g\.rotation\.y=\(x\*2\.1\+z\)\*\.31/, 'flowers get a seeded yaw so they are not identical');
assert.doesNotMatch(flower + tree + stalagmite, /Math\.random\(/, 'polish variation stays seeded');

const hubGround = paintGroundGrid(0x62c96b, 'grass');
const cell = lumaAt(hubGround, 8, 8);
const fine = lumaAt(hubGround, GROUND_GRID, 8);
const coarse = lumaAt(hubGround, GROUND_COARSE, 8);
assert.ok(fine < cell - 6, 'stronger 16px lines stay darker than the fill');
assert.ok(coarse < fine - 2, 'stronger 64px lines stay darker than the fine grid');
assert.equal(pixelDiffRatio(hubGround, paintGroundGrid(0x62c96b, 'grass')), 0, 'stronger grid paint stays deterministic');

assert.match(js, /setZoneLighting\(zone\)/, 'P5 lighting still runs');
assert.match(extractFn('setZoneGround'), /scene\.fog\.near=zone==='cave'\?15:zone==='frozen-pass'\?18:zone==='rocky-canyon'\?24:zone==='sky-ruins'\?22:30/, 'P5 stage fog remains readable');
assert.match(js, /sphereGeometry\(\.16\*scale,12,10\)/, 'monster shine stays a sphere');

console.log('V8.0 blocky polish: PASS');
