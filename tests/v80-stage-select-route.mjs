import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';

assert.equal(html,fs.readFileSync(new URL('../v900.html',import.meta.url),'utf8'),'HTML parity remains exact');
assert.doesNotMatch(html,/id="stageSelect"/,'Stage Select overlay is removed from the player HUD');
assert.doesNotMatch(html,/id="stageSelectBtn"/,'Stage Select entry is removed');
assert.doesNotMatch(html,/id="zoneToggleBtn"/,'Zone travel menu is removed');
assert.doesNotMatch(css,/\.warp-prompt/,'Stage travel has no warp confirmation tab');
assert.doesNotMatch(html,/id="warpPrompt"|id="huntBtn"/,'Stage travel is walk-through only');
assert.match(js,/function updateWalkThroughWarp\(dt\)/,'Player movement owns stage travel proximity');
assert.match(js,/startWarp\(found\)/,'Walking into the stage portal travels immediately');
assert.match(js,/warpAvailability\(state\.stageProgress/,'Warp uses the shared unlock resolver');
assert.doesNotMatch(js,/el\('stageSelectBtn'\)\.onclick/,'No stage menu button is wired');
assert.doesNotMatch(js,/switchZone\(definition\.id\)/,'Stage data no longer directly loads runtime zones');
console.log('V8 Stage route via in-scene warp: PASS');
