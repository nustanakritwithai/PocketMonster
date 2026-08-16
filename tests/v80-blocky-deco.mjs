import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

function extractFn(name) {
  const start = js.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const next = js.indexOf('\nfunction ', start + 1);
  assert.ok(next > start, `${name} must be followed by another function`);
  return js.slice(start, next);
}

function count(src, re) {
  return (src.match(re) || []).length;
}

const rock = extractFn('makeRock');
const tree = extractFn('makeTree');
const grass = extractFn('makeGrassTuft');
const stalagmite = extractFn('makeStalagmite');
const fence = extractFn('makeFencePost');
const flower = extractFn('makeFlower');

assert.equal(count(rock, /boxGeometry\(/g), 3, 'rock is three stacked boxes');
assert.doesNotMatch(rock, /dodecahedronGeometry/, 'rocks are no longer dodecahedrons');
assert.match(rock, /boxGeometry\(s,s\*\.8,s\*\.9\)/, 'main rock box keeps the plan proportions');
assert.match(rock, /rotation\.y=\(x\*1\.7\+z\)\*\.15/, 'rock yaw still uses world position');

assert.equal(count(tree, /boxGeometry\(/g), 4, 'tree trunk, two canopy boxes, and fruit use boxGeometry');
assert.doesNotMatch(tree, /cylinderGeometry/, 'tree trunk is a box, not a cylinder');
assert.doesNotMatch(tree, /coneGeometry/, 'tree canopy is boxes, not cones');
assert.doesNotMatch(tree, /sphereGeometry/, 'fruit is boxes, not spheres');
assert.match(tree, /\[\[\.35,1\.5,\.2\],\[-\.28,1\.7,-\.15\],\[\.1,1\.95,\.32\]\]/, 'fruit offsets sit on the box canopy');

assert.match(grass, /\[\[-\.06,\.28,\.18\],\[\.05,\.34,-\.12\],\[0,\.22,\.04\]\]/, 'grass still has three blades');
assert.match(grass, /boxGeometry\(\.05\*s,h\*s,\.05\*s\)/, 'grass blades are thin boxes');
assert.doesNotMatch(grass, /coneGeometry/, 'grass blades are no longer cones');

assert.equal(count(stalagmite, /boxGeometry\(/g), 3, 'stalagmite is three stacked boxes');
assert.doesNotMatch(stalagmite, /coneGeometry/, 'stalagmites are no longer cones');
assert.match(stalagmite, /boxGeometry\(\.6\*s,\.5\*s,\.6\*s\)/, 'stalagmite base is the wide box');
assert.match(stalagmite, /boxGeometry\(\.15\*s,\.4\*s,\.15\*s\)/, 'stalagmite tip is the small box');

assert.match(fence, /boxGeometry\(\.1,\.7,\.1\)/, 'fence posts stay the original box');
assert.equal(count(flower, /boxGeometry\(/g), 2, 'flower is stem box + bloom box');
assert.doesNotMatch(flower, /cylinderGeometry/, 'flower stem is a box, not a cylinder');
assert.doesNotMatch(flower, /sphereGeometry/, 'flower bloom is a box, not a sphere');

assert.match(js, /function makeRock\(/);
assert.match(js, /function makeTree\(/);
assert.match(js, /function makeGrassTuft\(/);
assert.match(js, /function makeStalagmite\(/);
assert.match(js, /function makeFlower\(/);
assert.match(js, /function makeFencePost\(/);

console.log('V8.0 blocky decorations: PASS');
