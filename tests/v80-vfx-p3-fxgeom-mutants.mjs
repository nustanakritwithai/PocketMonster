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
assert.match(schema, /export const ASSET_REVISION = '800'/, 'mutant 2: fxGeom swap does not bump ASSET_REVISION');

const geom = extractFn('fxGeom');
assert.doesNotMatch(geom, /sphereGeometry/, 'mutant 3: fxGeom must not keep spheres');
assert.doesNotMatch(geom, /coneGeometry/, 'mutant 4: fxGeom must not keep cones');
assert.doesNotMatch(geom, /torusGeometry/, 'mutant 5: fxGeom halo must not stay a torus');
assert.doesNotMatch(geom, /octahedronGeometry/, 'mutant 6: fxGeom must not keep octahedrons');
assert.doesNotMatch(geom, /TetrahedronGeometry/, 'mutant 7: fxGeom shard must not stay a tetrahedron');
assert.match(geom, /case 'halo': return boxGeometry\(size\*1\.6,size\*0\.15,size\*1\.6\)/, 'mutant 8: halo must be a wide thin box');
assert.match(geom, /default: return boxGeometry\(size,size,size\)/, 'mutant 9: orb default must be a cube');
assert.equal((geom.match(/boxGeometry\(/g) || []).length, 18, 'mutant 10: all 18 fxGeom returns must be boxes');

assert.match(extractFn('spawnElementalFX'), /fxGeom\(cfg\.shape/, 'mutant 11: bursts must still go through fxGeom');
assert.match(js, /shape:'flame'/, 'mutant 12: Fire still uses the flame shape name');
assert.match(js, /sphereGeometry\(\.16\*scale,12,10\)/, 'mutant 13: monster shine stays a sphere');
assert.match(extractFn('throwProjectile'), /boxGeometry\(\.14,\.14,\.14\)/, 'mutant 14: P2 throw cube stays');
assert.match(extractFn('spawnRingPulse'), /wireframe:true/, 'mutant 15: map ring pulses stay wireframe boxes');

console.log('V8.0 VFX P3 fxGeom mutants: PASS');
