import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

function extractFn(name) {
  const start = js.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const next = js.indexOf('\nfunction ', start + 1);
  return js.slice(start, next);
}

assert.doesNotMatch(js, /from ['"]three['"]/, 'mutant 1: do not import the three package');

const rock = extractFn('makeRock');
const tree = extractFn('makeTree');
const grass = extractFn('makeGrassTuft');
const stalagmite = extractFn('makeStalagmite');
const flower = extractFn('makeFlower');
assert.doesNotMatch(rock, /dodecahedronGeometry/, 'mutant 2: rocks must not fall back to dodecahedrons');
assert.doesNotMatch(tree, /cylinderGeometry|coneGeometry|sphereGeometry/, 'mutant 3: trees must not keep cylinder/cone/sphere parts');
assert.doesNotMatch(grass, /coneGeometry/, 'mutant 4: grass must not keep cone blades');
assert.doesNotMatch(flower, /cylinderGeometry|sphereGeometry/, 'mutant 5: flowers must not keep cylinder/sphere parts');
assert.doesNotMatch(stalagmite, /coneGeometry/, 'mutant 6: stalagmites must not keep cone stacks');

assert.match(
  js,
  /\[\[8,7,1\.35\],\[-11,8,1\.05\],\[16,-10,1\.5\],\[-17,-8,1\.25\],\[3,-19,1\.7\],\[-5,17,1\.15\]\]/,
  'mutant 7: ranch rock coordinates stay',
);
assert.match(
  js,
  /\[\[-7,-12,1,\{fruit:0xef4444\}\],\[10,-16,1\.15\],\[14,13,\.95,\{fruit:0xfacc15\}\],\[-15,14,1\.05\],\[20,3,1\],\[-21,-2,1\.15\]\]/,
  'mutant 8: ranch tree coordinates stay',
);
assert.match(
  js,
  /\[\[-9,-11,1\.1,\{leaf:0x22c55e\}\],\[11,-15,1\.25,\{leaf:0x16a34a,fruit:0xf97316\}\],\[15,11,1,\{leaf:0x15803d\}\],\[-13,13,1\.15\],\[19,2,1\.05\],\[-20,-3,1\.2,\{fruit:0xef4444\}\],\[3,-18,1\.3\]\]/,
  'mutant 9: meadow tree coordinates stay',
);
assert.match(
  js,
  /for\(const \[x,z\] of \[\[-5,-5\],\[2,-8\],\[8,-3\],\[-8,4\],\[5,6\],\[-2,-14\],\[10,3\],\[-12,-2\]\]\)/,
  'mutant 10: meadow grass coordinates stay',
);

assert.match(js, /sphereGeometry\(\.16\*scale,12,10\)/, 'mutant 11: monster shine stays a sphere');
assert.match(js, /new THREE\.Fog\(0x65c9f5,30,76\)/, 'mutant 12: boot Fog constructor stays 0x65c9f5,30,76');
assert.match(js, /makePad\(5\.2,8\.2,1\.6,0xec4899,\.15\)/, 'mutant 13: breeding pad stays at (5.2,8.2) size 1.6');
assert.match(extractFn('makeFencePost'), /boxGeometry\(\.1,\.7,\.1\)/, 'mutant 14: fence posts stay the original box');
assert.doesNotMatch(rock + tree + grass + stalagmite + flower, /Math\.random\(/, 'mutant 15: decoration builders stay deterministic');

console.log('V8.0 blocky decoration mutants: PASS');
