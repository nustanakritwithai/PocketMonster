import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const provider = fs.readFileSync(new URL('../asset-presentation/providers/procedural-bighead.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(js, /const player=buildPlayerCharacter\(\)/, 'mutant 1: player is not built in gameplay');
assert.match(js, /playerThrowOrigin\(\)/, 'mutant 3/4: live throw path stays on the handle anchor');
assert.doesNotMatch(js, /headPivot\.position\.y=1\.44[\s\S]{0,80}torsoPivot\.add\(headPivot\)/, 'mutant 2: head is not nested under torso');
assert.match(provider, /setFromMatrixPosition/, 'mutant 5: worldPos scratch must implement Three.js Vector3.setFromMatrixPosition');
assert.doesNotMatch(
  provider,
  /_worldScratch = \{ set\(x, y, z\) \{ this\.x = x; this\.y = y; this\.z = z; return this; \} \}/,
  'mutant 5: do not pass a fake Vector3 that only has set()',
);

console.log('V8.0 BH1 mutants: PASS');
