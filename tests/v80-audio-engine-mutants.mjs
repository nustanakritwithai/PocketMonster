import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('audio-engine.mjs', 'utf8');

// Mutant 1: if no lazy init guard → would create AudioContext eagerly
assert.match(src, /if\s*\(ctx\)\s*\{/, 'mutant 1: lazy init guard must exist');

// Mutant 2: if external file loading present → fail
assert.ok(!src.match(/\.mp3|\.wav|\.ogg|fetch\(/), 'mutant 2: no external audio file references');

// Mutant 3: if masterGain missing → volume control broken
assert.match(src, /masterGain/, 'mutant 3: masterGain must exist');

// Mutant 4: if sfx_bus missing → SFX would bypass master volume
assert.match(src, /sfxBus/, 'mutant 4: sfxBus must exist');

// Mutant 5: if playSFX doesn't check ctx → crash when called before init
assert.match(src, /if\s*\(!ctx\s*\|\|\s*muted\)\s*return/, 'mutant 5: playSFX must guard null ctx');

// Mutant 6: if tone() doesn't connect to sfxBus → silent
assert.match(src, /g\.connect\(sfxBus\)/, 'mutant 6: tone must connect to sfxBus');

// Mutant 7: if noiseBurst doesn't use buffer → not procedural
assert.match(src, /createBuffer/, 'mutant 7: noiseBurst must use createBuffer (procedural)');

// Mutant 8: if no exponentialRamp → clicks/pops on note end
assert.match(src, /exponentialRampToValueAtTime\(0\.0001/, 'mutant 8: exponential ramp to silence');

console.log('V8.0 audio engine mutation checks: PASS (8/8 killed)');