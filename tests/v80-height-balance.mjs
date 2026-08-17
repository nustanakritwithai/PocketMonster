import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gameSrc = readFileSync('game-v800.js', 'utf8');
const providerSrc = readFileSync('asset-presentation/providers/procedural-bighead-monster.mjs', 'utf8');
const markSrc = readFileSync('asset-presentation/monster-mark.mjs', 'utf8');

// ── Phase 1: Bighead base geometry ──────────────────────────
assert.match(providerSrc, /h:\s*0\.84.*y:\s*0\.48/, 'slime body h=0.84 y=0.48 (Phase 1)');
assert.match(providerSrc, /0\.56\s*\*\s*scale.*0\.70\s*\*\s*scale/, 'bird body h=0.56 (Phase 1)');
assert.match(providerSrc, /0\.42\s*\*\s*scale.*0\.50\s*\*\s*scale/, 'bird head h=0.42 (Phase 1)');
assert.match(providerSrc, /0\.38\s*\*\s*scale.*0\.45\s*\*\s*scale/, 'serpent body h=0.38 (Phase 1)');
assert.match(providerSrc, /0\.42\s*\*\s*scale.*0\.45\s*\*\s*scale/, 'serpent head h=0.42 (Phase 1)');
assert.match(providerSrc, /0\.42\s*\*\s*scale.*0\.85\s*\*\s*scale/, 'quadruped body h=0.42 (Phase 1)');
assert.match(providerSrc, /0\.44\s*\*\s*scale.*0\.48\s*\*\s*scale/, 'quadruped head h=0.44 (Phase 1)');

// ── Phase 2: path.scale ≤ 1.06 ──────────────────────────────
// Match only evo path scales: "scale:1.XX,statMods"
const evoScaleMatches = [...gameSrc.matchAll(/scale:(1\.\d+),statMods/g)];
assert.ok(evoScaleMatches.length >= 18, `found ${evoScaleMatches.length} evo path.scale values`);
for (const m of evoScaleMatches) {
  assert.ok(parseFloat(m[1]) <= 1.06, `evo path.scale ${m[1]} > 1.06 (Phase 2)`);
}

// ── Phase 3: Baby scale 0.85 ────────────────────────────────
assert.match(gameSrc, /Baby'\)\?\.85:1/, 'Baby scale = 0.85 (Phase 3)');

// ── Phase 4: per-species scale.y ────────────────────────────
assert.match(gameSrc, /\.88,0\.98,1\.24/, 'flame_wolf scale.y=0.98 (Phase 4)');
assert.match(gameSrc, /1\.28,1\.06,1\.08/, 'magma_bear scale.y=1.06 (Phase 4)');
assert.match(gameSrc, /1\.12,0\.99,1\.16/, 'rockhorn scale.y=0.99 (Phase 4)');
assert.match(gameSrc, /1\.1,0\.98,1\.18/, 'voidhorn scale.y=0.98 (Phase 4)');

// ── Phase 5: applyVisualGrowth no negative ──────────────────
assert.match(markSrc, /power\s*\*\s*0\.02\s*\+\s*defense\s*\*\s*0\.03\s*\+\s*spirit\s*\*\s*0\.01/, 'growth y formula updated (Phase 5)');
assert.ok(!markSrc.includes('- speed * 0.05'), 'no negative speed in growth y (Phase 5)');
assert.ok(!markSrc.includes('- defense * 0.04'), 'no negative defense in growth z (Phase 5)');

// ── Phase 6: boss > wild, animation pulse ≤ 0.03 ────────────
assert.match(gameSrc, /boss\?1\.12:1\.06/, 'boss scale 1.12 > wild 1.06 (Phase 6)');
// Extract the animateMonster switch block and check no sy pulse >= 0.08
const animBlock = gameSrc.slice(gameSrc.indexOf("switch(u.monsterType)"), gameSrc.indexOf("if(u.monsterEvolved)"));
assert.ok(!animBlock.includes('*0.12'), 'no animation pulse 0.12 in animateMonster (Phase 6)');
assert.ok(!animBlock.match(/\*0\.0[89]/), 'no animation pulse >= 0.08 in animateMonster (Phase 6)');

// ── Phase 7: Legacy alignment ───────────────────────────────
assert.match(gameSrc, /sphereGeometry\(\.36\*scale/, 'legacy bird body radius .36 (Phase 7)');
assert.match(gameSrc, /sphereGeometry\(\.24\*scale/, 'legacy bird head radius .24 (Phase 7)');
assert.match(gameSrc, /capsuleGeometry\(\.24\*scale,\.42\*scale/, 'legacy quadruped body (Phase 7)');
assert.match(gameSrc, /sphereGeometry\(\.26\*scale.*\.88\*scale/, 'legacy quadruped head at y=.88 (Phase 7)');

console.log('V8.0 height balance regression: PASS');