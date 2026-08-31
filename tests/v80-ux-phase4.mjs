// V8.0 UX Phase 4 — Equipment tab contract.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style-v800.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const versioned = fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8');

assert.equal(html, versioned, 'index.html and v900.html must stay identical');
assert.match(html, /data-manager-tab="equipment">อุปกรณ์/, 'Equipment tab button missing');
assert.match(html, /id="equipmentPanel"/, 'Equipment pane missing');
assert.match(js, /function renderEquipment\([^)]*\)/, 'renderEquipment missing');
assert.match(js, /if\(tab==='equipment'\)renderEquipment\(\)/, 'setManagerTab must render Equipment');
assert.match(js, /Power Budget/, 'equipment budget readout missing');
assert.doesNotMatch(js, /onclick="unequipMonster/, 'module functions must not be called from inline onclick');

for (const cls of ['.equipment-panel', '.equip-slot-card', '.budget-fill.ok', '.equip-btn.unequip']) {
  assert.ok(css.includes(cls), `phase 4 CSS missing ${cls}`);
}

console.log('V8.0 UX phase 4 equipment tab: PASS');
