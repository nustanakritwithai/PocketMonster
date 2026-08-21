import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css=readFileSync(new URL('../style-v800.css', import.meta.url), 'utf8');
const compact=css.match(/\/\* Character UI compact landscape control guard \*\/([\s\S]*?)\/\* Character UI compact portrait control guard \*\//)?.[1]||'';
assert.ok(compact, 'compact landscape control guard is required');
for (const rule of ['@media (pointer:coarse) and (orientation:landscape)', '.global-character-btn', 'bottom:calc(var(--safe-bottom) + 164px)', '.character-quick-panel', 'width:min(186px,30vw)', 'max-height:min(38dvh,240px)', '.character-quick-actions button', 'min-height:38px']) {
  assert.ok(compact.includes(rule), `compact landscape guard must include ${rule}`);
}
assert.match(compact, /\.character-quick-panel[^}]*overflow:auto/, 'compact panel must retain internal scroll');
console.log('V8.2 Character UI compact landscape controls: PASS');
