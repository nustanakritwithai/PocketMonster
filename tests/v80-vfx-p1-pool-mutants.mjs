import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../save-schema.mjs', import.meta.url), 'utf8');

function extractFn(name) {
  const start = js.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const headerEnd = js.indexOf('){', start) >= 0 ? js.indexOf('){', start) : js.indexOf(') {', start);
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

assert.doesNotMatch(js, /from ['"]three['"]/, 'mutant 1: do not import the three package');
assert.match(schema, /export const ASSET_REVISION = '810'/, 'mutant 2: spark pool swap ASSET_REVISION stays 810');

const poolStart = js.indexOf('const sparkPool=createObjectPool({');
const pool = js.slice(poolStart, js.indexOf('function setHumanoidAction', poolStart));
assert.doesNotMatch(pool, /sphereGeometry/, 'mutant 3: spark pool must not fall back to spheres');
assert.match(pool, /maxSize:200/, 'mutant 4: pool cap must stay 200');
assert.match(pool, /mesh\.rotation\.set\(0,0,0\)/, 'mutant 5: reset must clear rotation or reused boxes keep old tumble');
assert.match(extractFn('spawnBurst'), /sparkPool\.acquire\(\)/, 'mutant 6: bursts must keep using the pool');
assert.match(extractFn('releaseTransientEffect'), /sparkPool\.release\(effect\.mesh\)/, 'mutant 7: pooled sparks must not be disposed as unique meshes');
assert.match(js, /sphereGeometry\(\.16\*scale,12,10\)/, 'mutant 8: monster shine stays a sphere until a later VFX phase');
assert.match(extractFn('spawnElementalFX'), /fxGeom\(cfg\.shape/, 'mutant 9: elemental bursts still go through fxGeom');
assert.match(js, /function spawnRingPulse[\s\S]*?wireframe:true/, 'mutant 10: map ring pulses stay wireframe boxes');

console.log('V8.0 VFX P1 spark pool mutants: PASS');
