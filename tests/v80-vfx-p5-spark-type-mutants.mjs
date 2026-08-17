import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../save-schema.mjs', import.meta.url), 'utf8');

function extractFn(name) {
  const start = js.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const headerEnd = js.indexOf('){', start) >= 0 ? js.indexOf('){', start) : js.indexOf(') {', start);
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
assert.match(schema, /export const ASSET_REVISION = '800'/, 'mutant 2: type motion does not bump ASSET_REVISION');

assert.match(js, /function updateSparkType/, 'mutant 3: type-specific spark motion must exist');
assert.match(extractFn('updateEffects'), /updateSparkType\(e,dt,t\)/, 'mutant 4: updater must call type motion');
assert.match(extractFn('spawnElementalFX'), /typeCfg:cfg/, 'mutant 5: elemental sparks must carry typeCfg');
assert.match(extractFn('updateSparkType'), /cfg\.speed>1\.1/, 'mutant 6: Fire-speed sparks must lift');
assert.match(extractFn('updateSparkType'), /shape==='drop'/, 'mutant 7: Water drops must fall');
assert.match(extractFn('updateSparkType'), /cfg\.speed>1\.3/, 'mutant 8: Electric-speed sparks must zigzag');
assert.match(extractFn('updateSparkType'), /shape==='mist'/, 'mutant 9: Ghost mist must not fall');
assert.match(extractFn('updateSparkType'), /if\(!cfg\)return/, 'mutant 10: missing typeCfg must skip type motion');

assert.doesNotMatch(extractFn('updateSparkType'), /easeOut|easeIn/, 'mutant 11: Phase 6 opacity easing stays out of Phase 5');
assert.doesNotMatch(js, /maxSize:160/, 'mutant 12: spark pool cap stays 200 from Phase 1');
assert.equal((extractFn('fxGeom').match(/boxGeometry\(/g) || []).length, 18, 'mutant 13: P3 fxGeom stays 18 boxes');
assert.match(js, /function spawnTrainingEffect/, 'mutant 14: P4 training VFX stays');
assert.match(js, /sphereGeometry\(\.16\*scale,12,10\)/, 'mutant 15: monster shine stays a sphere');

console.log('V8.0 VFX P5 spark type mutants: PASS');
