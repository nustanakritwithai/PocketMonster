import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync('index.html','utf8');
const versioned=readFileSync('v900.html','utf8');
const css=readFileSync('style-v800.css','utf8');

assert.equal(html,versioned,'active HTML entries must remain byte-identical');
assert.match(html,/<canvas id="characterPreviewCanvas" class="character-preview-canvas"[^>]*>/,'3D preview canvas must receive its styled touch-surface class');
assert.match(css,/\.character-preview-canvas\{[^}]*width:100%[^}]*height:100%[^}]*touch-action:none/,'preview canvas must fill its stage and own touch gestures');

console.log('V8.2 Character 3D preview canvas surface contract: PASS');
