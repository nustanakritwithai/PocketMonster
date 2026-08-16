// V8.0 UX Phase 3 — Skills tab contract.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style-v800.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const versioned = fs.readFileSync(new URL('../v800.html', import.meta.url), 'utf8');

assert.equal(html, versioned, 'index.html and v800.html must stay identical');
assert.match(html, /data-manager-tab="skills">สกิล/, 'Skills tab button missing');
assert.match(html, /id="skillsPanel"/, 'Skills pane missing');
assert.match(js, /function renderSkills\(\)/, 'renderSkills missing');
assert.match(js, /SKILL_MASTERY/, 'SKILL_MASTERY import/use missing');
assert.match(js, /if\(tab==='skills'\)renderSkills\(\)/, 'setManagerTab must render Skills');
assert.match(js, /skill-mastery-bar/, 'mastery bar markup missing');

for (const cls of ['.skills-panel', '.skill-card', '.skill-mastery-fill.master', '.skill-help']) {
  assert.ok(css.includes(cls), `phase 3 CSS missing ${cls}`);
}

console.log('V8.0 UX phase 3 skills tab: PASS');
