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

assert.doesNotMatch(js, /from ['"]three['"]/, 'mutant 1: do not import the three package');

const pad = extractFn('makePad');
assert.doesNotMatch(pad, /circleGeometry|ringGeometry/, 'mutant 2: pads must not fall back to circle/ring');
assert.match(pad, /new THREE\.Group\(\)/, 'mutant 3: pad ring is a group of box edges, not a dummy visible flag');
assert.match(pad, /return \{disk,ring\}/, 'mutant 4: setHubVisibility still receives disk and ring');

const incubatorSrc = js.slice(js.indexOf('const incubator='), js.indexOf('// ---------- Monster species'));
assert.doesNotMatch(incubatorSrc, /cylinderGeometry|sphereGeometry/, 'mutant 5: incubator must not keep cylinder/sphere parts');
assert.match(js, /makePad\(7,3,3\.4,0x22c55e,\.17\)/, 'mutant 6: ranch pad call stays');
assert.match(js, /makePad\(5\.2,8\.2,1\.6,0xec4899,\.15\)/, 'mutant 7: breeding pad call stays');
assert.match(js, /incubator\.position\.set\(5\.2,0,8\.2\)/, 'mutant 8: incubator world position stays');
assert.match(extractFn('setHubVisibility'), /ranchPad\.ring\.visible=on/, 'mutant 9: leaving hub still hides the pad frame');
assert.doesNotMatch(js, /ranchPad\.ring\.rotation\.z/, 'mutant 10: square frames must not spin on Z like a flat ring');
assert.match(js, /case 'halo': return torusGeometry/, 'mutant 11: Phase 3/4 does not convert particle halo shapes');
assert.match(js, /new THREE\.Fog\(0x65c9f5,30,76\)/, 'mutant 12: fog near/far stay until Phase 5');
assert.match(js, /HemisphereLight\(0xffffff,0x42643d,1\.55\)/, 'mutant 13: cave light intensity stays until Phase 5');

console.log('V8.0 blocky structure mutants: PASS');
