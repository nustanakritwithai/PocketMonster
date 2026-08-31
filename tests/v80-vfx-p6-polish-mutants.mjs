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
assert.match(schema, /export const ASSET_REVISION = '813'/, 'mutant 2: polish uses the current ASSET_REVISION');

assert.match(js, /function fxParticleCount/, 'mutant 3: particle count must scale with power');
assert.match(extractFn('fxParticleCount'), /Math\.min\(16,/, 'mutant 4: count must cap at 16 so the pool cannot blow');
assert.match(js, /function easeOut/, 'mutant 5: soft fade must exist');
assert.match(extractFn('updateEffects'), /easeOut\(t\)/, 'mutant 6: updater must use the soft fade');
assert.match(js, /function clampEmissive/, 'mutant 7: emissive clamp must exist');
assert.match(extractFn('clampEmissive'), /Math\.min\(\.7,Math\.max\(\.1/, 'mutant 8: emissive stays in 0.1-0.7');
assert.match(extractFn('spawnElementalFX'), /fxEmissive\(mode,cfg\.intensity\)/, 'mutant 9: combat sparks must use clamped emissive');
assert.match(js, /maxParticles:200/, 'mutant 10a: shared particle cap stays 200');
assert.match(js, /maxSize:VFX_LIMITS\.maxParticles/, 'mutant 10b: spark pool consumes the shared cap');
assert.doesNotMatch(extractFn('updateSparkType'), /easeOut/, 'mutant 11: type motion does not own the fade curve');
assert.equal((extractFn('fxGeom').match(/boxGeometry\(/g) || []).length, 18, 'mutant 12: P3 fxGeom stays 18 boxes');
assert.match(js, /function spawnTrainingEffect/, 'mutant 13: P4 training VFX stays');
assert.match(js, /function updateSparkType/, 'mutant 14: P5 type motion stays');
assert.match(js, /sphereGeometry\(\.16\*scale,12,10\)/, 'mutant 15: monster shine stays a sphere');

console.log('V8.0 VFX P6 polish mutants: PASS');
