import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';
import { readFileSync } from 'fs';

// Phase 5: Cooldown VFX — grayscale + timer overlay on skill buttons

const css = readFileSync('style-v800.css', 'utf8');

// 1. CSS class exists
assert.ok(css.includes('.on-cooldown'), 'CSS: on-cooldown class missing');

// 2. CSS overlay class exists
assert.ok(css.includes('.cd-overlay'), 'CSS: cd-overlay class missing');

// 3. Game toggles on-cooldown class
assert.ok(js.includes('on-cooldown'), 'game: on-cooldown class not toggled');

// 4. Game creates cd-overlay element
assert.ok(js.includes('cd-overlay'), 'game: cd-overlay element missing');

// 5. Cooldown timer text
assert.ok(js.includes('toFixed(1)'), 'game: cooldown timer text missing');

// 6. Grayscale filter in CSS
assert.ok(css.includes('grayscale'), 'CSS: grayscale filter missing');

console.log('V8.0 Skill VFX P5 cooldown: PASS');