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
assert.match(schema, /export const ASSET_REVISION = '800'/, 'mutant 2: raising VFX does not bump ASSET_REVISION');

assert.match(js, /function spawnTrainingEffect/, 'mutant 3: training VFX must exist');
assert.match(js, /function spawnEvolutionEffect/, 'mutant 4: evolution VFX must exist');
assert.match(js, /function spawnBreedingEffect/, 'mutant 5: breeding VFX must exist');
assert.match(js, /function spawnHatchEffect/, 'mutant 6: hatch VFX must exist');
assert.match(js, /function spawnFeedEffect/, 'mutant 7: feed VFX must exist');
assert.match(js, /function spawnRestEffect/, 'mutant 8: rest VFX must exist');
assert.match(js, /function spawnPlayEffect/, 'mutant 9: play VFX must exist');
assert.match(js, /function spawnLevelUpEffect/, 'mutant 10: level-up VFX must exist');
assert.match(js, /function spawnBondUpEffect/, 'mutant 11: bond VFX must exist');
assert.match(js, /function spawnMasteryUpEffect/, 'mutant 12: mastery VFX must exist');
assert.match(js, /function spawnConditionBadEffect/, 'mutant 13: condition VFX must exist');

assert.match(extractFn('takeSpark'), /sparkPool\.acquire\(\)/, 'mutant 14: raising sparks must rent from the P1 pool');
assert.match(extractFn('spawnEvolutionEffect'), /kind:'evolution-aura'/, 'mutant 15: evolution aura must not be a pooled spark');
assert.match(extractFn('updateEffects'), /kind==='evolution-aura'/, 'mutant 16: updater must fade the evolution aura');
assert.doesNotMatch(js, /function updateSparkType/, 'mutant 17: Phase 4 does not add type-specific spark motion');
assert.match(extractFn('feedMonster'), /result\.rejected/, 'mutant 18: rejected feed must still refund before VFX');
assert.match(extractFn('applyLifeSimulation'), /afterCond!==beforeCond/, 'mutant 19: bad-condition clouds must not spam every sim tick');
assert.equal((extractFn('fxGeom').match(/boxGeometry\(/g) || []).length, 18, 'mutant 20: P3 fxGeom stays 18 boxes');

console.log('V8.0 VFX P4 raising mutants: PASS');
