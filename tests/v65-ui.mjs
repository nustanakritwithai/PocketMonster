import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';
const versionedHtml = fs.readFileSync(new URL('../v800.html', import.meta.url), 'utf8');
assert.doesNotMatch(versionedHtml, /maximum-scale\s*=\s*1|user-scalable\s*=\s*no/i, 'static viewport must preserve browser zoom when runtime boot fails');
assert.doesNotMatch(js, /const viewport=document\.querySelector\('meta\[name="viewport"\]'\)/, 'runtime must not repair an unsafe static viewport');
assert.ok(html.includes('id="worldLabels"'),'world labels overlay missing');
assert.ok(html.includes('id="raisingEventBanner"'),'raising event banner missing');
assert.ok(html.includes('id="crDebugPanel"'),'CR debug panel missing');
assert.ok(js.includes('function createWildLabel(w)'),'wild HP labels missing');
assert.match(js,/function updateWorldLabels\(/,'wild HP label updater missing');
assert.ok(html.includes('id="monsterPicker"'),'custom monster picker missing');
assert.ok(!html.includes('<select id="parentA"'),'native breeding select must be removed');
assert.ok(js.includes("openMonsterPicker('parentA')"),'Parent A custom picker not wired');
assert.ok(js.includes('function ensureCaptureBallSafety()'),'capture ball safety missing');
assert.ok(js.includes("healthyPartyCount()===0"),'all-fainted departure gate missing');
assert.ok(html.includes('id="utilityMenu"'),'compact HUD utility menu missing');
assert.ok(js.includes('function animateEntity(mesh,dt,moving=false,intensity=1)'),'procedural animation hook missing');
assert.ok(css.includes('.party-slot.compact'),'compact party UI missing');
assert.ok(js.includes("from './combat-ui-view-model.mjs'"),'Combat HUD view-model not integrated');
assert.match(js,/function ensureCombatHudSemantics\(/,'runtime semantic/a11y enhancement missing');
assert.match(js,/createPartySlotViewModel\(/,'Party presentation states not wired');
for(const selector of ['.party-slot.selected','.party-slot.active-monster','.party-slot.fainted-slot']){
  assert.ok(css.includes(selector),`non-color Party state missing: ${selector}`);
}
assert.ok(css.includes('--touch-min:48px'),'48px touch minimum missing');
assert.ok(css.includes('.care-actions'),'care action styles missing');
assert.ok(css.includes('.equip-actions'),'equipment action styles missing');
console.log('Active mobile UI regression: PASS');
