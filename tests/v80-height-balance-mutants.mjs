import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Mutant tests: prove the height balance changes are enforced.
// Each test verifies that reverting a Phase 1–6 change would fail.

const gameSrc = readFileSync('game-v800.js', 'utf8');
const providerSrc = readFileSync('asset-presentation/providers/procedural-bighead-monster.mjs', 'utf8');
const markSrc = readFileSync('asset-presentation/monster-mark.mjs', 'utf8');

// Mutant 1: if slime body h reverted to 0.88 → must fail Phase 1
assert.ok(!providerSrc.match(/h:\s*0\.88.*y:\s*0\.50/), 'mutant 1: slime body h=0.88 y=0.50 must be gone');

// Mutant 2: if bird body h reverted to 0.80 → must fail
assert.ok(!providerSrc.match(/0\.80\s*\*\s*scale.*0\.70\s*\*\s*scale/), 'mutant 2: bird body h=0.80 must be gone');

// Mutant 3: if evo path.scale > 1.06 → must fail
const bigEvoScales = [...gameSrc.matchAll(/scale:(1\.\d+),statMods/g)].filter(m => parseFloat(m[1]) > 1.06);
assert.equal(bigEvoScales.length, 0, 'mutant 3: no evo path.scale > 1.06');

// Mutant 4: if Baby scale reverted to 0.72 → must fail
assert.ok(!gameSrc.includes("Baby')?.72:1"), 'mutant 4: Baby scale 0.72 must be gone');

// Mutant 5: if magma_bear scale.y reverted to 0.92 → must fail
assert.ok(!gameSrc.match(/1\.28,\.92,1\.08/), 'mutant 5: magma_bear scale.y=0.92 must be gone');

// Mutant 6: if growth formula has negative speed → must fail
assert.ok(!markSrc.includes('- speed * 0.05'), 'mutant 6: negative speed in growth must be gone');

// Mutant 7: if boss scale < wild scale → must fail
assert.ok(!gameSrc.match(/boss\?1\.0[0-7]:1\.1[2-9]/), 'mutant 7: boss shorter than wild must be gone');

// Mutant 8: if Flying animation pulse = 0.12 → must fail
const animBlockMut = gameSrc.slice(gameSrc.indexOf("switch(u.monsterType)"), gameSrc.indexOf("if(u.monsterEvolved)"));
assert.ok(!animBlockMut.includes('*0.12'), 'mutant 8: animation pulse 0.12 must be gone from animateMonster');

// Mutant 9: if legacy bird body radius = 0.42 → must fail
assert.ok(!gameSrc.match(/sphereGeometry\(\.42\*scale/), 'mutant 9: legacy bird body .42 must be gone');

console.log('V8.0 height balance mutation checks: PASS (9/9 killed)');