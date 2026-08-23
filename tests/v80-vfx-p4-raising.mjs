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

const colors = js.slice(js.indexOf('const TRAIN_FX_COLOR='), js.indexOf('function takeSpark'));
assert.match(colors, /power:0xef6c32/, 'power training is orange');
assert.match(colors, /defense:0x4f87e8/, 'defense training is blue');
assert.match(colors, /speed:0xe8bd22/, 'speed training is yellow');
assert.match(colors, /technique:0x63b34b/, 'technique training is green');
assert.match(colors, /spirit:0xa78bfa/, 'spirit training is purple');

const train = extractFn('spawnTrainingEffect');
assert.match(train, /takeSpark\(color\)/, 'training sparks come from the pool');
assert.match(train, /for\(let i=0;i<8;i\+\+\)/, 'training fires 8 sparks');
assert.match(train, /spawnRingPulse\(pos\.clone\(\),color,\{scale:0\.5,life:0\.3,y:0\.08,priority:'P2'\}\)/, 'training still stamps a P2 ring pulse');
assert.match(train, /gravity:0/, 'training sparks float');

const evo = extractFn('spawnEvolutionEffect');
assert.match(evo, /boxGeometry\(1\.2,2\.0,1\.2\)/, 'evolution aura is a tall wireframe box');
assert.match(evo, /wireframe:true/, 'evolution aura is wireframe');
assert.match(evo, /kind:'evolution-aura'/, 'evolution aura uses its own updater');
assert.match(evo, /for\(let i=0;i<20;i\+\+\)/, 'evolution fires 20 sparks');
assert.match(evo, /triggerCameraShake\(0\.12,0\.2\)/, 'evolution shakes the camera');
assert.match(evo, /addTransientEffect\(\{mesh:aura,life:1\.2,maxLife:1\.2,kind:'evolution-aura'/, 'unique aura must enter the bounded disposal path');

const breed = extractFn('spawnBreedingEffect');
assert.match(breed, /0xec4899/, 'breeding hearts are pink');
assert.match(breed, /for\(let i=0;i<6;i\+\+\)/, 'breeding fires 6 hearts');
assert.match(breed, /spawnRingPulse\(mid,0xec4899/, 'breeding stamps a pink ring');

const hatch = extractFn('spawnHatchEffect');
assert.match(hatch, /for\(let i=0;i<12;i\+\+\)/, 'hatch fires 12 shards');
assert.match(hatch, /0xfde68a/, 'hatch shards are gold');
assert.match(hatch, /triggerCameraShake\(0\.08,0\.15\)/, 'hatch shakes the camera');

const feed = extractFn('spawnFeedEffect');
assert.match(feed, /for\(let i=0;i<5;i\+\+\)/, 'feed drops 5 food cubes');
assert.match(feed, /vel:new THREE\.Vector3\(0,-1\.0,0\)/, 'food cubes fall down');
assert.match(feed, /for\(let i=0;i<3;i\+\+\)/, 'feed also floats 3 hearts');

const rest = extractFn('spawnRestEffect');
assert.match(rest, /0x60a5fa/, 'rest sparks are soft blue');
assert.match(rest, /for\(let i=0;i<4;i\+\+\)/, 'rest fires 4 Z cubes');

const play = extractFn('spawnPlayEffect');
assert.match(play, /0xfacc15/, 'play sparks are gold');
assert.match(play, /for\(let i=0;i<8;i\+\+\)/, 'play fires 8 stars');

const level = extractFn('spawnLevelUpEffect');
assert.match(level, /for\(let i=0;i<10;i\+\+\)/, 'level-up fires 10 rising cubes');
assert.match(level, /spawnRingPulse\(pos\.clone\(\),0xfde047/, 'level-up stamps a gold ring');

const bond = extractFn('spawnBondUpEffect');
assert.match(bond, /0xec4899/, 'bond hearts are pink');
assert.match(bond, /for\(let i=0;i<5;i\+\+\)/, 'bond fires 5 hearts');

const mastery = extractFn('spawnMasteryUpEffect');
assert.match(mastery, /for\(let i=0;i<12;i\+\+\)/, 'mastery fires 12 gold stars');
assert.match(mastery, /spawnRingPulse\(pos\.clone\(\)\.add\(new THREE\.Vector3\(0,0\.8,0\)\),0xfde047/, 'mastery stamps a gold ring at chest height');

const cond = extractFn('spawnConditionBadEffect');
assert.match(cond, /0x64748b/, 'bad-condition clouds are slate');
assert.match(cond, /takeSpark\(0x64748b,0\.1\)/, 'bad-condition emissive stays dim');
assert.match(cond, /for\(let i=0;i<6;i\+\+\)/, 'bad-condition fires 6 clouds');

const update = extractFn('updateEffects');
assert.match(update, /kind==='evolution-aura'/, 'updater fades the evolution aura');
assert.match(update, /rotation\.y\+=dt\*1\.8/, 'evolution aura spins on Y');

assert.match(extractFn('setTraining'), /spawnTrainingEffect\(fxWorldPos\(id\),focus\)/, 'training tab fires training VFX');
assert.match(extractFn('feedMonster'), /spawnFeedEffect\(fxWorldPos\(id\),FOOD_FX_COLOR\[food\]\|\|0x22c55e\)/, 'feed fires food VFX');
assert.match(extractFn('feedMonster'), /spawnBondUpEffect\(fxWorldPos\(id\)\)/, 'feed fires bond VFX when bond rises');
assert.match(extractFn('careAction'), /spawnRestEffect\(fxWorldPos\(id\)\)/, 'rest fires rest VFX');
assert.match(extractFn('careAction'), /spawnPlayEffect\(fxWorldPos\(id\)\)/, 'play fires play VFX');
assert.match(extractFn('levelUpInstance'), /spawnLevelUpEffect\(fxWorldPos\(inst\.instanceId\)\)/, 'manual level-up fires rising cubes');
assert.match(extractFn('evolveMonster'), /spawnEvolutionEffect\(fxWorldPos\(id\),oldColor,newColor\)/, 'evolution fires the aura burst');
assert.match(extractFn('createEgg'), /spawnBreedingEffect\(posA,posB\)/, 'egg create fires breeding hearts');
assert.match(extractFn('hatchEgg'), /spawnHatchEffect\(incubator\.position\.clone\(\)\)/, 'hatch fires at the incubator');
assert.match(extractFn('applyLifeSimulation'), /spawnConditionBadEffect\(fxWorldPos\(id\)\)/, 'life sim fires dark clouds on condition drop');
assert.match(js, /spawnMasteryUpEffect\(a\.mesh\.position\.clone\(\)\)/, 'skill rank-up fires mastery stars');

const geom = extractFn('fxGeom');
assert.equal((geom.match(/boxGeometry\(/g) || []).length, 18, 'P3 fxGeom still returns 18 boxes');
assert.match(extractFn('throwProjectile'), /boxGeometry\(\.14,\.14,\.14\)/, 'P2 throw cube stays');
assert.match(js, /sphereGeometry\(\.16\*scale,12,10\)/, 'monster shine stays a sphere');

console.log('V8.0 VFX P4 raising effects: PASS');
