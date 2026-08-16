import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

assert.doesNotMatch(
  js,
  /const player=buildPlayerCharacter\(\);\s*scene\.add\(player\)/,
  'mutant 1: gameplay must not bypass the engine when creating the player',
);
assert.ok(
  js.includes('playerThrowOrigin()') && js.includes('start=playerThrowOrigin().clone()'),
  'mutant 4: aim line and projectile must share playerThrowOrigin()',
);
assert.doesNotMatch(
  js,
  /throwProjectile[\s\S]{0,400}new THREE\.Vector3\(0,1\.15,0\)/,
  'mutant 3: projectile path must not hard-code y+1.15 beside the handle',
);

console.log('V8.0 AE1 mutants: PASS');
