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

const sparkType = extractFn('updateSparkType');
assert.match(sparkType, /const cfg=e\.typeCfg/, 'type motion reads typeCfg from the spark');
assert.match(sparkType, /if\(!cfg\)return/, 'raising sparks without typeCfg stay generic');
assert.match(sparkType, /cfg\.speed>1\.1\)e\.vel\.y\+=dt\*0\.5/, 'Fire-speed sparks get extra lift');
assert.match(sparkType, /cfg\.shape==='drop'\)e\.vel\.y-=dt\*0\.3/, 'Water drops fall faster');
assert.match(sparkType, /cfg\.speed>1\.3/, 'Electric-speed sparks zigzag');
assert.match(sparkType, /Math\.sin\(e\.life\*20\)\*0\.02/, 'Electric zigzag uses remaining life');
assert.match(sparkType, /cfg\.shape==='mist'\)e\.vel\.y=Math\.max\(e\.vel\.y,0\)/, 'Ghost mist does not fall');

const update = extractFn('updateEffects');
assert.match(update, /updateSparkType\(e,dt,t\)/, 'spark updater calls type motion after gravity');
assert.match(update, /kind==='evolution-aura'/, 'P4 evolution aura updater stays');

const elemental = extractFn('spawnElementalFX');
assert.match(elemental, /typeCfg:cfg/, 'elemental sparks carry ELEMENT_FX for the updater');
assert.match(elemental, /size:pSize/, 'elemental sparks keep a size so scale fade still works');
assert.match(elemental, /fxGeom\(cfg\.shape,pSize\)/, 'elemental bursts still pick a shape through fxGeom');

assert.match(js, /Fire:\{core:0xff6b2c,accent:0xffc347,shape:'flame',intensity:1\.18,speed:1\.15\}/, 'Fire stays fast so it lifts');
assert.match(js, /Water:\{core:0x43a5ff,accent:0xb6efff,shape:'drop',intensity:1\.08,speed:0\.95\}/, 'Water stays a drop so it falls');
assert.match(js, /Electric:\{core:0xffda22,accent:0xfff79c,shape:'spark',intensity:1\.22,speed:1\.35\}/, 'Electric stays fast enough to zigzag');
assert.match(js, /Ghost:\{core:0x8870df,accent:0xe6ddff,shape:'mist',intensity:1\.06,speed:0\.85\}/, 'Ghost stays mist so it does not fall');

const updateSparkType = new Function(`return ${sparkType}`)();
function mock(cfg, velY, life = 0.2) {
  return {typeCfg: cfg, vel: {y: velY}, mesh: {position: {x: 0, z: 0}}, life};
}

const fire = mock({speed: 1.15, shape: 'flame'}, 1);
updateSparkType(fire, 0.1, 0.5);
assert.equal(fire.vel.y, 1.05, 'Fire lifts by dt*0.5');

const water = mock({speed: 0.95, shape: 'drop'}, 1);
updateSparkType(water, 0.1, 0.5);
assert.equal(water.vel.y, 0.97, 'Water drop falls by dt*0.3');

const electric = mock({speed: 1.35, shape: 'spark'}, 0, 0.2);
updateSparkType(electric, 0.1, 0.5);
assert.equal(electric.vel.y, 0.05, 'Electric also matches the Fire-speed lift');
assert.equal(electric.mesh.position.x, Math.sin(0.2 * 20) * 0.02, 'Electric zigzags on X');
assert.equal(electric.mesh.position.z, Math.cos(0.2 * 20) * 0.02, 'Electric zigzags on Z');

const ghost = mock({speed: 0.85, shape: 'mist'}, -1);
updateSparkType(ghost, 0.1, 0.5);
assert.equal(ghost.vel.y, 0, 'Ghost mist clamps downward velocity');

const normal = mock({speed: 1.0, shape: 'orb'}, 1);
updateSparkType(normal, 0.1, 0.5);
assert.equal(normal.vel.y, 1, 'Normal sparks keep their velocity');

const raising = {vel: {y: 1}, mesh: {position: {x: 0, z: 0}}, life: 0.4};
updateSparkType(raising, 0.1, 0.5);
assert.equal(raising.vel.y, 1, 'P4 raising sparks without typeCfg do not get type motion');

assert.equal((extractFn('fxGeom').match(/boxGeometry\(/g) || []).length, 18, 'P3 fxGeom still returns 18 boxes');
assert.match(extractFn('throwProjectile'), /boxGeometry\(\.14,\.14,\.14\)/, 'P2 throw cube stays');
assert.match(js, /function spawnTrainingEffect/, 'P4 training VFX stays');
assert.match(js, /sphereGeometry\(\.16\*scale,12,10\)/, 'monster shine stays a sphere');

console.log('V8.0 VFX P5 spark type: PASS');
