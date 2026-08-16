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

assert.doesNotMatch(js, /from ['"]three['"]/, 'mutant 1: do not import the three package');

const decal = extractFn('spawnGroundDecal');
const pulse = extractFn('spawnRingPulse');
const update = extractFn('updateGroundDecals');

assert.doesNotMatch(decal, /circleGeometry|ringGeometry/, 'mutant 2: ground decals must not fall back to circle/ring');
assert.doesNotMatch(pulse, /torusGeometry/, 'mutant 3: ring pulses must not fall back to torus');
assert.match(decal, /wireframe:true/, 'mutant 4: decal frames must be wireframe boxes');
assert.match(pulse, /wireframe:true/, 'mutant 5: ring pulse must be a wireframe box');
assert.doesNotMatch(update, /d\.ring\.rotation\.z/, 'mutant 6: square decal frames must not spin on Z like a flat ring');
assert.match(js, /groundDecals\.push\(\{group,disc,ring,inner,/, 'mutant 7: updater still receives disc/ring/inner');
assert.match(js, /spawnGroundDecal\(wildTypes\(w\)\[0\],w\.mesh\.position/, 'mutant 8: capture still stamps a ground decal');
assert.match(js, /spawnRingPulse\(w\.mesh\.position\.clone\(\),0xffffff/, 'mutant 9: KO still fires a ring pulse');
assert.match(js, /sphereGeometry\(\.16\*scale,12,10\)/, 'mutant 10: monster shine stays a sphere');
assert.match(js, /new THREE\.Fog\(0x65c9f5,30,76\)/, 'mutant 11: boot Fog constructor stays 0x65c9f5,30,76');
assert.match(js, /HemisphereLight\(0xffffff,0x42643d,1\.55\)/, 'mutant 12: boot HemisphereLight intensity stays 1.55');

console.log('V8.0 blocky VFX mutants: PASS');
