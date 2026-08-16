import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.doesNotMatch(js, /const player=buildPlayerCharacter\(\)/, 'mutant 1: player is not built in gameplay');
assert.match(js, /playerThrowOrigin\(\)/, 'mutant 3/4: live throw path stays on the handle anchor');
assert.doesNotMatch(js, /headPivot\.position\.y=1\.44[\s\S]{0,80}torsoPivot\.add\(headPivot\)/, 'mutant 2: head is not nested under torso');

console.log('V8.0 BH1 mutants: PASS');
