import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('audio-engine.mjs', 'utf8');
const gameSrc = readFileSync('game-v800.js', 'utf8');

// ── Exports ──────────────────────────────────────────────────
assert.match(src, /export function initAudio/, 'initAudio exported');
assert.match(src, /export function playSFX/, 'playSFX exported');
assert.match(src, /export function setVolume/, 'setVolume exported');
assert.match(src, /export function toggleMute/, 'toggleMute exported');

// ── AudioContext lazy init ───────────────────────────────────
assert.match(src, /if\s*\(ctx\)\s*\{/, 'lazy init guard: if(ctx) block exists');
assert.match(src, /AudioContext.*webkitAudioContext/, 'AudioContext with webkit fallback');
assert.match(src, /ctx\.resume\(\)/, 'resume on suspended context');

// ── No external files ───────────────────────────────────────
assert.ok(!src.match(/fetch\(|XMLHttpRequest|\.mp3|\.wav|\.ogg/), 'no external audio files');

// ── Combat SFX (8) ───────────────────────────────────────────
const sfxIds = [
  'sfx_hit_normal', 'sfx_hit_effective', 'sfx_hit_weak',
  'sfx_skill_fire', 'sfx_skill_water', 'sfx_skill_electric', 'sfx_skill_grass',
  'sfx_faint',
];
for (const id of sfxIds) {
  assert.ok(src.includes(`'${id}'`), `SFX handler registered: ${id}`);
}

// ── Game wiring ──────────────────────────────────────────────
assert.match(gameSrc, /import.*audio-engine\.mjs/, 'game-v800.js imports audio-engine');
assert.match(gameSrc, /addEventListener\('pointerdown'.*initAudio/, 'initAudio on first pointerdown');
assert.match(gameSrc, /addEventListener\('keydown'.*initAudio/, 'initAudio on first keydown');
assert.match(gameSrc, /playSFX\('sfx_hit_normal'\)/, 'damageWild plays sfx_hit_normal');
assert.match(gameSrc, /playSFX\('sfx_hit_effective'\)/, 'damageWild plays sfx_hit_effective');
assert.match(gameSrc, /playSFX\('sfx_faint'\)/, 'faintActive plays sfx_faint');
assert.match(gameSrc, /sfx_skill_fire/, 'useSkill maps fire skill to sfx_skill_fire');

console.log('V8.0 audio engine + combat SFX: PASS');