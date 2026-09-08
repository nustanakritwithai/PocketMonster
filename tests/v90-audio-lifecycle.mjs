import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const audio = readFileSync('audio-engine.mjs', 'utf8');
const game = readFileSync('game-v800.js', 'utf8');
const controls = readFileSync('unified-mobile-controls-v900.mjs', 'utf8');

assert.match(audio, /export function resumeAudio\(\)/, 'audio engine exposes lifecycle resume');
assert.match(audio, /if\s*\(!ctx\)\s*return Promise\.resolve\(false\)/, 'lifecycle resume never creates a context');
assert.match(audio, /ctx\.resume\(\)/, 'lifecycle resume calls AudioContext.resume');
assert.match(game, /document\.addEventListener\('visibilitychange'.*recoverAudio/, 'game resumes audio when visible');
assert.match(game, /addEventListener\('pageshow',recoverAudio\)/, 'game resumes audio after pageshow');
assert.match(game, /fullscreenchange.*recoverAudio/, 'game resumes audio after fullscreen transition');
assert.match(controls, /import \{ resumeAudio \} from '\.\/audio-engine\.mjs'/, 'mobile controls import lifecycle resume');
assert.match(controls, /visibilityState === 'hidden'.*resumeAudio/s, 'mobile controls recover audio on visible state');

console.log('V9.0 audio lifecycle recovery: PASS');
