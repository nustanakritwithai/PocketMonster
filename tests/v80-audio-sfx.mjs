import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('audio-engine.mjs', 'utf8');
const gameSrc = readFileSync('game-v800.js', 'utf8');

// ── Phase 3 SFX: 10 new IDs registered in audio-engine.mjs ───
const phase3Sfx = [
  // Capture (4)
  'sfx_throw_ball',
  'sfx_capture_tension',
  'sfx_capture_success',
  'sfx_capture_fail',
  // Progression (6)
  'sfx_levelup',
  'sfx_evolution',
  'sfx_hatch',
  'sfx_bond',
  'sfx_feed',
  'sfx_heal',
];

for (const id of phase3Sfx) {
  assert.ok(src.includes(`'${id}'`), `SFX handler registered: ${id}`);
}

// ── Registration functions exist ──────────────────────────────
assert.match(src, /function registerCaptureSFX/, 'registerCaptureSFX defined');
assert.match(src, /function registerProgressionSFX/, 'registerProgressionSFX defined');
assert.match(src, /registerCaptureSFX\(\)/, 'registerCaptureSFX called in initAudio');
assert.match(src, /registerProgressionSFX\(\)/, 'registerProgressionSFX called in initAudio');

// ── Game wiring (8 call sites) ────────────────────────────────
assert.match(gameSrc, /playSFX\('sfx_throw_ball'\)/, 'executeCaptureThrow plays sfx_throw_ball');
assert.match(gameSrc, /playSFX\('sfx_capture_success'\)/, 'capture success plays sfx_capture_success');
assert.match(gameSrc, /playSFX\('sfx_capture_fail'\)/, 'capture fail plays sfx_capture_fail');
assert.match(gameSrc, /playSFX\('sfx_levelup'\)/, 'spawnLevelUpEffect plays sfx_levelup');
assert.match(gameSrc, /playSFX\('sfx_evolution'\)/, 'evolveMonster plays sfx_evolution');
assert.match(gameSrc, /playSFX\('sfx_hatch'\)/, 'hatchEgg plays sfx_hatch');
assert.match(gameSrc, /playSFX\('sfx_feed'\)/, 'feedMonster plays sfx_feed');
assert.match(gameSrc, /playSFX\('sfx_heal'\)/, 'healAll plays sfx_heal');

console.log('V8.0 audio Phase 3 SFX (10 IDs + 8 wiring): PASS');