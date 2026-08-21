import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css=readFileSync(new URL('../style-v800.css', import.meta.url), 'utf8');
const mobileLandscape=css.match(/\/\* Character UI mobile landscape overflow guard \*\/([\s\S]*?)\/\* Character UI mobile portrait overflow guard \*\//)?.[1]||'';
assert.ok(mobileLandscape, 'mobile landscape overflow guard CSS block is required');
for (const rule of ['@media (pointer:coarse) and (orientation:landscape)', '100dvh', '.manager-card', 'overflow:auto', '.character-manager-layout', 'min-height:0', '.character-roster .monster-meta', '.character-quick-panel', 'var(--safe-bottom)']) {
  assert.ok(mobileLandscape.includes(rule), `mobile landscape guard must include ${rule}`);
}
assert.match(mobileLandscape, /\.character-roster \.monster-meta[^}]*display:none/, 'landscape roster must suppress verbose card data instead of overflowing');
assert.match(mobileLandscape, /\.character-quick-panel[^}]*overflow:auto/, 'Quick Panel must scroll internally on mobile landscape');

console.log('V8.2 Character UI mobile landscape overflow guard: PASS');
