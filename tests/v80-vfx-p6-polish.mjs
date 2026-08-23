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

const easeOut = new Function(`return ${extractFn('easeOut')}`)();
const clampEmissive = new Function(`return ${extractFn('clampEmissive')}`)();
const fxParticleCount = new Function(`return ${extractFn('fxParticleCount')}`)();
const fxEmissive = new Function(`${extractFn('clampEmissive')}; return ${extractFn('fxEmissive')}`)();

assert.equal(easeOut(0), 0, 'easeOut starts at 0');
assert.equal(easeOut(1), 1, 'easeOut ends at 1');
assert.equal(easeOut(0.5), 0.75, 'easeOut keeps mid-life sparks brighter than linear');
assert.ok(easeOut(0.5) > 0.5, 'soft fade stays above the old linear t*0.9 midpoint');

assert.equal(clampEmissive(0.05), 0.1, 'emissive floor is 0.1 so condition clouds stay visible');
assert.equal(clampEmissive(0.45), 0.45, 'raising sparks stay at 0.45');
assert.equal(clampEmissive(2), 0.7, 'emissive never blows out past 0.7');

assert.equal(fxParticleCount('impact', 1, 1), 7, 'impact still uses the 7-spark base');
assert.equal(fxParticleCount('burst', 1, 1.18), 14, 'Fire burst count scales with power*intensity');
assert.equal(fxParticleCount('summon', 1, 1.18), 16, 'Fire summon hits the 16 cap instead of 17');
assert.equal(fxParticleCount('trail', 0.55, 1.18), 3, 'trails stay at the 3-spark floor');
assert.equal(fxParticleCount('burst', 10, 1.5), 16, 'huge power cannot exceed 16 sparks');
assert.ok(16 * 8 + 16 < 200, 'an 8-target area fight stays under the 200 spark pool');

assert.equal(fxEmissive('trail', 1.18), 0.472, 'Fire trail emissive is 0.4*intensity');
assert.equal(Number(fxEmissive('impact', 1.18).toFixed(3)), 0.649, 'Fire impact emissive is 0.55*intensity');
assert.equal(fxEmissive('burst', 1.5), 0.7, 'high-intensity bursts clamp to 0.7');

const update = extractFn('updateEffects');
assert.match(update, /const fade=easeOut\(t\)/, 'sparks fade with easeOut');
assert.match(update, /fade\*\.9/, 'spark peak opacity stays 0.9');
assert.match(update, /e\.emi\*fade/, 'emissive eases down with the same curve');
assert.match(update, /easeOut\(t\)\*\.9/, 'rings use the same soft fade');
assert.match(update, /kind==='evolution-aura'/, 'P4 evolution aura curve stays');
assert.match(update, /updateSparkType\(e,dt,t\)/, 'P5 type motion still runs');

assert.match(extractFn('spawnElementalFX'), /fxParticleCount\(mode,power,cfg\.intensity\)/, 'elemental count goes through the power helper');
assert.match(extractFn('spawnElementalFX'), /fxEmissive\(mode,cfg\.intensity\)/, 'elemental emissive goes through the clamp helper');
assert.match(extractFn('spawnBurst'), /Math\.min\(16,/, 'pooled bursts share the 16-spark cap');
assert.match(extractFn('takeSpark'), /clampEmissive\(emissiveIntensity\)/, 'raising sparks clamp emissive');

const pool = js.slice(js.indexOf('const sparkPool=createObjectPool({'), js.indexOf('function setHumanoidAction'));
assert.match(js, /maxParticles:200/, 'shared particle cap stays 200');
assert.match(pool, /maxSize:VFX_LIMITS\.maxParticles/, 'spark pool consumes the shared cap');
assert.doesNotMatch(js, /maxSize:160/, 'pool cap does not fall back to 160');

assert.equal((extractFn('fxGeom').match(/boxGeometry\(/g) || []).length, 18, 'P3 fxGeom still returns 18 boxes');
assert.match(extractFn('throwProjectile'), /boxGeometry\(\.14,\.14,\.14\)/, 'P2 throw cube stays');
assert.match(js, /function spawnTrainingEffect/, 'P4 training VFX stays');
assert.match(js, /function updateSparkType/, 'P5 type motion stays');
assert.match(js, /sphereGeometry\(\.16\*scale,12,10\)/, 'monster shine stays a sphere');

console.log('V8.0 VFX P6 polish: PASS');
