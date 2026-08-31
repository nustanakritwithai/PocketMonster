// V8.0 UX Phase 6 — in-game popups, mastery toast, party dots, battle breakdown.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const v800 = fs.readFileSync(new URL('../v800.html', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style-v800.css', import.meta.url), 'utf8');

for (const entry of [html, v800]) {
  assert.match(entry, /id="eventPopup"/, 'event popup missing');
  assert.match(entry, /id="eventChoices"/, 'event choices missing');
}
assert.match(js, /function showEventPopup/, 'showEventPopup missing');
assert.match(js, /function showMasteryPopup/, 'showMasteryPopup missing');
assert.match(js, /showEventPopup\(inst,picked\.def\)/, 'triggerRaisingEvent must open the popup');
assert.match(js, /showMasteryPopup\(/, 'useSkill rank-up must toast mastery');
assert.match(js, /party-cond-dot/, 'party condition dots missing');
assert.match(js, /Party Share/, 'multi-line battle result missing');

for (const cls of ['.event-popup', '.mastery-popup', '.party-cond-dot']) {
  assert.ok(css.includes(cls), `phase 6 CSS missing ${cls}`);
}
assert.match(css, /white-space:pre-line/, 'multi-line message CSS missing');

console.log('V8.0 UX phase 6 in-game popups: PASS');
