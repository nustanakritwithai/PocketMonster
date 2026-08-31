// V8.0 UX Phase 2 — Training tab contract.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style-v800.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const versioned = fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8');

assert.equal(html, versioned, 'index.html and v900.html must stay identical');
assert.match(html, /data-manager-tab="training">ฝึก/, 'Training tab button missing');
assert.match(html, /id="trainingPanel"/, 'Training pane missing');
assert.match(html, /data-manager-tab="collection">มอน/, 'Collection tab should use the short label');
assert.match(js, /function renderTraining\([^)]*\)/, 'renderTraining missing');
assert.match(js, /trainingSelectedId/, 'training selected monster state missing');
assert.match(js, /if\(tab==='training'\)renderTraining\(\)/, 'setManagerTab must render the Training tab');
assert.match(js, /data-train-line/, 'Training tab must bind per-line train buttons');
assert.doesNotMatch(js, /onclick="setTraining/, 'module functions must not be called from inline onclick');

for (const cls of ['.training-panel', '.training-line-card', '.train-btn', '.apt-stars', '.condition-box']) {
  assert.ok(css.includes(cls), `phase 2 CSS missing ${cls}`);
}

console.log('V8.0 UX phase 2 training tab: PASS');
