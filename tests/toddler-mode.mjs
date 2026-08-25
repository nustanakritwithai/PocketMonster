import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../style-v800.css',import.meta.url),'utf8');
assert.match(html,/toddlerModeToggle/,'toddler mode toggle exists');
assert.match(html,/monsterlife-toddler-mode/,'toddler mode preference persists');
assert.match(css,/\.toddler-mode/,'toddler mode CSS exists');
console.log('Toddler mode Plan 1: PASS');
