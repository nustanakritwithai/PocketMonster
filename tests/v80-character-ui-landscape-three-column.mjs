import assert from 'node:assert/strict';
import { activeCss as css } from './active-assets.mjs';
const rule=css.match(/@media \(orientation:landscape\)\{([\s\S]*?)\n\}/)?.[1]||'';
assert.ok(rule,'landscape-specific Character layout rule is required');
const selector='.manager.character-manager-mode .character-manager-layout.manager-tab-pane.active';
assert.ok(rule.includes(selector),'Full Character active pane must override legacy block display');
assert.match(rule,/display:grid!important/,'Full Character active pane must remain a grid');
assert.match(rule,/grid-template-columns:minmax\(112px,.85fr\) minmax\(156px,1.2fr\) minmax\(140px,1fr\)/,'landscape layout must have roster, preview, and information columns');
console.log('V8.2 Character UI landscape Full Manager three-column override: PASS');
