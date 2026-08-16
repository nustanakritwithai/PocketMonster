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

const throwFn = extractFn('throwProjectile');
const update = extractFn('updateProjectiles');
const pulse = extractFn('spawnRingPulse');

assert.match(throwFn, /boxGeometry\(\.14,\.14,\.14\)/, 'throw projectile is a 0.14 cube');
assert.doesNotMatch(throwFn, /sphereGeometry/, 'throw projectile is no longer a sphere');
assert.match(throwFn, /mesh\.userData\.spin=true/, 'cube is marked to spin in flight');
assert.match(throwFn, /playerThrowOrigin\(\)/, 'throw still starts at the player throw origin');
assert.match(throwFn, /emissiveIntensity:\.45/, 'projectile emissive stays 0.45');
assert.match(throwFn, /opacity:\.96/, 'projectile opacity stays 0.96');
assert.match(throwFn, /duration:\.55/, 'flight duration stays 0.55s');
assert.match(throwFn, /spawnBurst\(mesh\.position\.clone\(\),color,\{count:5,life:\.18,size:\.04\}\)/, 'start burst is unchanged');
assert.match(throwFn, /castShadow=true/, 'projectile still casts a shadow');

assert.match(update, /userData\.spin/, 'flight updater reads the spin flag');
assert.match(update, /rotation\.x\+=dt\*10/, 'cube tumbles on X while flying');
assert.match(update, /rotation\.y\+=dt\*14/, 'cube tumbles on Y while flying');
assert.match(update, /lerpVectors\(p\.start,p\.end,t\)/, 'arc lerp is unchanged');
assert.match(update, /Math\.sin\(t\*Math\.PI\)\*2\.2/, 'throw arc height is unchanged');
assert.match(update, /spawnElementalFX\(monsterTypes\(inst\)\[0\],p\.mesh\.position\.clone\(\),'trail',0\.55\)/, 'summon trail is unchanged');
assert.match(update, /removeAndDispose\(scene, p\.mesh\)/, 'impact still disposes the projectile');
assert.match(update, /p\.onHit\?\.\(\)/, 'impact still fires onHit');

assert.match(pulse, /boxGeometry\(size,\.02,size\)/, 'map ring pulses stay thin boxes');
assert.match(pulse, /wireframe:true/, 'map ring pulses stay wireframe');
assert.match(js, /case 'halo': return torusGeometry/, 'fxGeom halo stays a torus until Phase 3');

const poolStart = js.indexOf('const sparkPool=createObjectPool({');
const pool = js.slice(poolStart, js.indexOf('function setHumanoidAction', poolStart));
assert.match(pool, /boxGeometry\(1,1,1\)/, 'spark pool from Phase 1 stays boxes');
assert.match(pool, /maxSize:200/, 'spark pool cap from Phase 1 stays 200');

assert.match(extractFn('executeCaptureThrow'), /throwProjectile\('capture'/, 'capture still throws through throwProjectile');
assert.match(extractFn('summonThrow'), /throwProjectile\('summon'/, 'summon still throws through throwProjectile');

console.log('V8.0 VFX P2 projectile: PASS');
