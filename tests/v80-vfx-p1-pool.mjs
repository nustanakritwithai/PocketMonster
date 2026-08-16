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

const poolStart = js.indexOf('const sparkPool=createObjectPool({');
const poolEnd = js.indexOf('function setHumanoidAction', poolStart);
assert.ok(poolStart >= 0 && poolEnd > poolStart, 'sparkPool block is present');
const pool = js.slice(poolStart, poolEnd);
const burst = extractFn('spawnBurst');
const release = extractFn('releaseTransientEffect');

assert.match(pool, /maxSize:200/, 'spark pool grows to 200 because boxes are cheaper than spheres');
assert.match(pool, /boxGeometry\(1,1,1\)/, 'pooled sparks are unit boxes');
assert.doesNotMatch(pool, /sphereGeometry/, 'spark pool no longer allocates spheres');
assert.match(pool, /mesh\.rotation\.set\(0,0,0\)/, 'reset clears leftover box tumble');
assert.match(pool, /destroy:mesh=>disposeObject3D\(mesh\)/, 'overflow still disposes GPU resources');

assert.match(burst, /sparkPool\.acquire\(\)/, 'spawnBurst still rents from the spark pool');
assert.match(burst, /kind:'spark'/, 'bursts still update as spark effects');
assert.match(burst, /pooled:true/, 'bursts still return meshes to the pool');
assert.match(burst, /m\.rotation\.set\(Math\.random\(\)\*6\.28/, 'each burst box starts at a random orientation');

assert.match(release, /sparkPool\.release\(effect\.mesh\)/, 'expired pooled sparks go back to the pool');
assert.match(js, /while\(effects\.length\) releaseTransientEffect\(effects\.pop\(\)\)/, 'zone clear still drains sparks through the pool');

assert.match(js, /sphereGeometry\(\.16\*scale,12,10\)/, 'monster shine stays a sphere until a later VFX phase');
assert.match(js, /case 'halo': return torusGeometry/, 'fxGeom halo stays a torus until Phase 3');
assert.match(js, /function spawnRingPulse[\s\S]*?boxGeometry\(size,\.02,size\)/, 'map Phase 4 ring pulses stay box wireframes');

console.log('V8.0 VFX P1 spark pool: PASS');
