import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';

assert.equal(html,fs.readFileSync(new URL('../v800.html',import.meta.url),'utf8'),'HTML parity remains exact');
assert.doesNotMatch(html,/id="stageSelect"/,'Stage Select overlay is removed from the player HUD');
assert.doesNotMatch(html,/id="stageSelectBtn"/,'Stage Select entry is removed');
assert.doesNotMatch(html,/id="zoneToggleBtn"/,'Zone travel menu is removed');
assert.match(css,/\.warp-prompt-card/,'Warp confirmation uses a mobile bottom sheet');
assert.match(js,/function updateWarpPrompt\(dt\)/,'Player movement owns stage travel proximity');
assert.match(js,/warpAvailability\(state\.stageProgress/,'Warp uses the shared unlock resolver');
assert.doesNotMatch(js,/el\('stageSelectBtn'\)\.onclick/,'No stage menu button is wired');
assert.doesNotMatch(js,/switchZone\(definition\.id\)/,'Stage data no longer directly loads runtime zones');
console.log('V8 Stage route via in-scene warp: PASS');
