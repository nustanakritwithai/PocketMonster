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

const geom = extractFn('fxGeom');
const elemental = extractFn('spawnElementalFX');
const boxCount = (geom.match(/boxGeometry\(/g) || []).length;

assert.equal(boxCount, 18, 'all 18 fxGeom shapes including default are boxes');
assert.doesNotMatch(geom, /sphereGeometry/, 'fxGeom no longer returns spheres');
assert.doesNotMatch(geom, /coneGeometry/, 'fxGeom no longer returns cones');
assert.doesNotMatch(geom, /torusGeometry/, 'fxGeom halo is no longer a torus');
assert.doesNotMatch(geom, /octahedronGeometry/, 'fxGeom leaf/crystal/star are no longer octahedrons');
assert.doesNotMatch(geom, /TetrahedronGeometry/, 'fxGeom shard is no longer a tetrahedron');

assert.match(geom, /case 'flame': return boxGeometry\(size\*0\.6,size\*1\.8,size\*0\.6\)/, 'flame is a tall box');
assert.match(geom, /case 'drop': return boxGeometry\(size\*0\.8,size\*1\.2,size\*0\.8\)/, 'drop is a tall box');
assert.match(geom, /case 'leaf': return boxGeometry\(size\*0\.9,size\*0\.3,size\*0\.9\)/, 'leaf is a flat box');
assert.match(geom, /case 'crystal': return boxGeometry\(size,size\*1\.4,size\)/, 'crystal is a tall box');
assert.match(geom, /case 'impact': return boxGeometry\(size\*1\.5,size\*0\.45,size\*1\.2\)/, 'impact stays a squat box');
assert.match(geom, /case 'bubble': return boxGeometry\(size\*0\.85,size\*0\.85,size\*0\.85\)/, 'bubble is a cube');
assert.match(geom, /case 'dust': return boxGeometry\(size\*1\.2,size\*0\.55,size\*1\.2\)/, 'dust stays a squat box');
assert.match(geom, /case 'feather': return boxGeometry\(size\*0\.3,size\*1\.7,size\*0\.5\)/, 'feather is a thin tall box');
assert.match(geom, /case 'halo': return boxGeometry\(size\*1\.6,size\*0\.15,size\*1\.6\)/, 'halo is a wide thin box');
assert.match(geom, /case 'spore': return boxGeometry\(size\*0\.72,size\*0\.72,size\*0\.72\)/, 'spore is a cube');
assert.match(geom, /case 'shard': return boxGeometry\(size\*0\.5,size\*1\.5,size\*0\.5\)/, 'shard is a tall box');
assert.match(geom, /case 'mist': return boxGeometry\(size\*0\.95,size\*0\.7,size\*0\.95\)/, 'mist is a flattened box');
assert.match(geom, /case 'arc': return boxGeometry\(size\*0\.5,size\*1\.9,size\*0\.5\)/, 'arc is a tall box');
assert.match(geom, /case 'smoke': return boxGeometry\(size,size,size\)/, 'smoke is a cube');
assert.match(geom, /case 'metal': return boxGeometry\(size,size\*0\.52,size\*1\.45\)/, 'metal stays an elongated box');
assert.match(geom, /case 'star': return boxGeometry\(size\*0\.9,size\*0\.9,size\*0\.9\)/, 'star is a cube');
assert.match(geom, /case 'spark': return boxGeometry\(size\*1\.5,size\*0\.35,size\*1\.5\)/, 'spark stays a flat box');
assert.match(geom, /default: return boxGeometry\(size,size,size\)/, 'orb default is a cube');

assert.match(elemental, /fxGeom\(cfg\.shape/, 'elemental bursts still pick a shape through fxGeom');
assert.match(elemental, /kind:'spark'/, 'elemental particles still update as sparks');
assert.match(elemental, /spawnRingPulse/, 'non-trail bursts still fire a ring pulse');

assert.match(js, /Fire:\{core:0xff6b2c,accent:0xffc347,shape:'flame'/, 'Fire still maps to flame');
assert.match(js, /Psychic:\{core:0xff5a98,accent:0xffd3e8,shape:'halo'/, 'Psychic still maps to halo');
assert.match(js, /Normal:\{core:0xc4b08b,accent:0xf5e2be,shape:'orb'/, 'Normal still maps to orb');

assert.match(extractFn('throwProjectile'), /boxGeometry\(\.14,\.14,\.14\)/, 'P2 throw cube stays');
assert.match(extractFn('spawnRingPulse'), /boxGeometry\(size,\.02,size\)/, 'map ring pulses stay thin boxes');
assert.match(js, /sphereGeometry\(\.16\*scale,12,10\)/, 'monster shine stays a sphere');

const pool = js.slice(js.indexOf('const sparkPool=createObjectPool({'), js.indexOf('function setHumanoidAction'));
assert.match(pool, /boxGeometry\(1,1,1\)/, 'spark pool from Phase 1 stays boxes');
assert.match(js, /maxParticles:200/, 'shared particle cap from Phase 1 stays 200');
assert.match(pool, /maxSize:VFX_LIMITS\.maxParticles/, 'spark pool consumes the shared cap');

console.log('V8.0 VFX P3 fxGeom: PASS');
