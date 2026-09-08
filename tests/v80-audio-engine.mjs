import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('audio-engine.mjs', 'utf8');
const gameSrc = readFileSync('game-v800.js', 'utf8');
const controlsSrc = readFileSync('unified-mobile-controls-v900.mjs', 'utf8');

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
assert.match(src, /pendingBgmZone/, 'BGM requested before unlock is retained');
assert.match(src, /pendingAmbientZone/, 'ambient requested before unlock is retained');
for (const zone of ['grass-meadow', 'ember-valley', 'misty-lake', 'storm-field', 'rocky-canyon', 'sky-ruins', 'poison-marsh', 'dream-shrine', 'haunted-woods', 'shadow-city', 'steel-factory', 'dragon-crater', 'fairy-garden', 'combat-colosseum', 'normal-wildlands', 'frozen-pass']) {
  assert.match(src, new RegExp(`['"]?${zone.replaceAll('-', '\\-')}['"]?\\s*:`), `zone audio mapping exists: ${zone}`);
}
assert.match(controlsSrc, /import \{ initAudio \} from '\.\/audio-engine\.mjs'/, 'shared controls can unlock the Pocket audio graph');
assert.match(controlsSrc, /controlSurface\.addEventListener\('pointerdown', unlockAudioFromGesture/, 'real control touch unlocks audio');
assert.match(controlsSrc, /unlockAudio\(\)\s*\{/, 'iframe transport exposes audio unlock');
assert.match(gameSrc, /playSFX\('sfx_hit_normal'\)/, 'damageWild plays sfx_hit_normal');
assert.match(gameSrc, /playSFX\('sfx_hit_effective'\)/, 'damageWild plays sfx_hit_effective');
assert.match(gameSrc, /playSFX\('sfx_faint'\)/, 'faintActive plays sfx_faint');
assert.match(gameSrc, /sfx_skill_.*toLowerCase/, 'useSkill maps skill type to sfx_skill_ dynamically');

console.log('V8.0 audio engine + combat SFX: PASS');
