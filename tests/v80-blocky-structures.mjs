import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

function extractFn(name) {
  const start = js.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = js.indexOf('{', start);
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

function count(src, re) {
  return (src.match(re) || []).length;
}

const pad = extractFn('makePad');
const vis = extractFn('setHubVisibility');
const incStart = js.indexOf('const incubator=');
const incEnd = js.indexOf('// ---------- Monster species');
assert.ok(incStart >= 0 && incEnd > incStart, 'incubator block is present');
const incubatorSrc = js.slice(incStart, incEnd);

assert.doesNotMatch(pad, /circleGeometry/, 'pad floor is no longer a circle');
assert.doesNotMatch(pad, /ringGeometry/, 'pad border is no longer a ring');
assert.match(pad, /boxGeometry\(halfSize\*2,\.02,halfSize\*2\)/, 'pad floor is a thin box');
assert.match(pad, /boxGeometry\(w,\.04,d\)/, 'pad edges are boxes');
assert.match(pad, /boxGeometry\(\.08,\.08,\.08\)/, 'pad corners are box posts');
assert.equal(count(pad, /boxGeometry\(/g), 3, 'pad source stamps floor, edge, and corner boxes');
assert.match(
  pad,
  /\[\[halfSize\*2,\.04,0,-halfSize\],\[halfSize\*2,\.04,0,halfSize\],\[\.04,halfSize\*2,-halfSize,0\],\[\.04,halfSize\*2,halfSize,0\]\]/,
  'pad has four edge offsets',
);
assert.match(
  pad,
  /\[\[-halfSize,-halfSize\],\[halfSize,-halfSize\],\[-halfSize,halfSize\],\[halfSize,halfSize\]\]/,
  'pad has four corner posts',
);
assert.match(pad, /return \{disk,ring\}/, 'pads still return disk + ring for hub visibility');

assert.match(js, /makePad\(7,3,3\.4,0x22c55e,\.28\)/, 'ranch pad stays at (7,3) half-size 3.4');
assert.match(js, /makePad\(5\.2,8\.2,1\.6,0xec4899,\.15\)/, 'breeding pad stays at (5.2,8.2) half-size 1.6');
assert.match(js, /const ranchCenter=new THREE\.Vector3\(7,0,3\)/, 'ranch center stays');

assert.doesNotMatch(incubatorSrc, /cylinderGeometry/, 'incubator base is no longer a cylinder');
assert.doesNotMatch(incubatorSrc, /sphereGeometry/, 'incubator egg is no longer a sphere');
assert.match(incubatorSrc, /boxGeometry\(\.9,\.35,\.9\)/, 'incubator base is a box');
assert.match(incubatorSrc, /boxGeometry\(\.5,\.65,\.45\)/, 'incubator egg is a box');
assert.match(incubatorSrc, /eggVisual\.scale\.y=1\.28/, 'egg stretch stays');
assert.match(incubatorSrc, /incubator\.position\.set\(5\.2,0,8\.2\)/, 'incubator stays on the breeding pad');

assert.match(vis, /ranchPad\.disk\.visible=ranchPad\.ring\.visible=on/, 'hub hide still toggles ranch pad disk and ring');
assert.match(vis, /breedingPad\.disk\.visible=breedingPad\.ring\.visible=on/, 'hub hide still toggles breeding pad disk and ring');
assert.match(vis, /incubator\.visible=on/, 'hub hide still toggles the incubator');
assert.match(js, /ranchPad\.ring\.rotation\.y\+=dt\*\.2/, 'square pad frame spins on Y');
assert.match(js, /breedingPad\.ring\.rotation\.y-=dt\*\.16/, 'breeding frame spins on Y the other way');
assert.match(js, /incubator\.rotation\.y\+=dt\*\.12/, 'incubator still turns');

assert.match(js, /new THREE\.Fog\(0x65c9f5,30,76\)/, 'boot Fog constructor stays 0x65c9f5,30,76');
assert.match(js, /case 'halo': return torusGeometry/, 'particle halo shapes stay toruses');

console.log('V8.0 blocky structures: PASS');
