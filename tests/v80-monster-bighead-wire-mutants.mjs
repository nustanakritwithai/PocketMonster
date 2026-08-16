import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

assert.doesNotMatch(
  js,
  /assets\.registerProvider\('procedural',createBigheadMonsterProvider/,
  'mutant 1: registering the monster factory as procedural would overwrite Player/Keeper',
);
assert.match(
  js,
  /kind==='monster'\?monsterProvider\(ctx\):humanoidProvider\(ctx\)/,
  'mutant 2: one procedural name must dispatch by kind',
);
assert.match(js, /function makeSpeciesMesh\(/, 'mutant 3: do not delete the legacy species builder');
assert.match(js, /function makeSlimeMesh\(/, 'mutant 4: do not delete makeSlimeMesh');
assert.match(js, /function makeAnimalBase\(/, 'mutant 5: do not delete makeAnimalBase');
assert.match(
  js,
  /catch\(err\)\{\s*g=makeSpeciesMesh\(sp,inst\);/,
  'mutant 6: spawn failure must fall back to makeSpeciesMesh',
);
assert.match(
  js,
  /assets\.spawn\('character\.human\.blocky-bighead\.v1',\{role:'player'/,
  'mutant 7: player still spawns as humanoid bighead',
);
assert.doesNotMatch(js, /import ['"]three['"]/, 'mutant 8: do not add an import of the three package');
assert.match(
  js,
  /if\(lifeScale!==1\) g\.scale\.multiplyScalar\(lifeScale\)/,
  'mutant 9: Baby scale still applies on the Bighead root',
);

console.log('V8.0 monster bighead wire mutants: PASS');
