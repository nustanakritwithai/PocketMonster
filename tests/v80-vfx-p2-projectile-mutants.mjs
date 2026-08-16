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
assert.match(schema, /export const ASSET_REVISION = '800'/, 'mutant 2: projectile swap does not bump ASSET_REVISION');

const throwFn = extractFn('throwProjectile');
assert.doesNotMatch(throwFn, /sphereGeometry/, 'mutant 3: throwProjectile must not keep a sphere');
assert.match(throwFn, /boxGeometry\(\.14,\.14,\.14\)/, 'mutant 4: throwProjectile must use the 0.14 cube');
assert.match(throwFn, /userData\.spin=true/, 'mutant 5: cube must be flagged to spin');
assert.doesNotMatch(throwFn, /new THREE\.Vector3\(0,1\.15,0\)/, 'mutant 6: throw origin must not hard-code y+1.15');

const update = extractFn('updateProjectiles');
assert.match(update, /rotation\.x\+=dt\*10/, 'mutant 7: flight must tumble the cube on X');
assert.match(update, /rotation\.y\+=dt\*14/, 'mutant 8: flight must tumble the cube on Y');
assert.match(update, /duration/, 'mutant 9: flight duration path must stay in the updater');

assert.match(js, /case 'halo': return torusGeometry/, 'mutant 10: Phase 2 does not convert fxGeom halo shapes');
assert.match(js, /sphereGeometry\(\.16\*scale,12,10\)/, 'mutant 11: monster shine stays a sphere');
assert.match(extractFn('spawnRingPulse'), /wireframe:true/, 'mutant 12: map ring pulses stay wireframe boxes');

console.log('V8.0 VFX P2 projectile mutants: PASS');
