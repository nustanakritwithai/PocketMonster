import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

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

function count(src, re) {
  return (src.match(re) || []).length;
}

const decal = extractFn('spawnGroundDecal');
const pulse = extractFn('spawnRingPulse');
const update = extractFn('updateGroundDecals');

assert.doesNotMatch(decal, /circleGeometry/, 'ground decal floor is no longer a circle');
assert.doesNotMatch(decal, /ringGeometry/, 'ground decal borders are no longer rings');
assert.equal(count(decal, /boxGeometry\(/g), 3, 'decal is floor box + outer wire box + inner wire box');
assert.match(decal, /boxGeometry\(size,\.02,size\)/, 'decal floor is a thin box');
assert.match(decal, /boxGeometry\(size\*\.78,\.02,size\*\.78\)/, 'outer frame is a box');
assert.match(decal, /boxGeometry\(size\*\.24,\.02,size\*\.24\)/, 'inner frame is a box');
assert.equal(count(decal, /wireframe:true/g), 2, 'outer and inner frames are wireframe');
assert.match(decal, /groundDecals\.push\(\{group,disc,ring,inner,/, 'decal still records disc/ring/inner for the updater');
assert.match(decal, /group\.position\.set\(pos\.x,0,pos\.z\)/, 'decal still sits on the world XZ of the hit');

assert.doesNotMatch(pulse, /torusGeometry/, 'ring pulse is no longer a torus');
assert.match(pulse, /boxGeometry\(size,\.02,size\)/, 'ring pulse is a thin box');
assert.match(pulse, /wireframe:true/, 'ring pulse is a wireframe square');
assert.match(pulse, /kind:'ring'/, 'pulse still uses the ring effect updater');
assert.doesNotMatch(pulse, /rotation\.x=Math\.PI\/2/, 'flat box does not need the old torus X tilt');

assert.match(update, /d\.ring\.rotation\.y\+=dt\*d\.spin/, 'square frames spin on Y');
assert.match(update, /d\.inner\.rotation\.y-=dt\*d\.spin\*1\.4/, 'inner frame spins the other way on Y');
assert.match(update, /removeAndDispose\(scene, d\.group\)/, 'expired decals still dispose');
assert.match(js, /updateGroundDecals\(dt\)/, 'loop still ticks ground decals');
assert.match(js, /spawnRingPulse\(activeSummon\.mesh\.position/, 'summon still fires a ring pulse');
assert.match(js, /spawnGroundDecal\(move\.type,t\.mesh\.position/, 'skills still stamp a ground decal');

assert.match(js, /new THREE\.Fog\(0x65c9f5,30,76\)/, 'boot Fog constructor stays 0x65c9f5,30,76');
assert.match(js, /sphereGeometry\(\.16\*scale,12,10\)/, 'monster shine stays a sphere');

console.log('V8.0 blocky VFX: PASS');
