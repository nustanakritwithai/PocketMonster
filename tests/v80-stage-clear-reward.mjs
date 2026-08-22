import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';

assert.equal(html,fs.readFileSync(new URL('../v800.html',import.meta.url),'utf8'),'HTML parity remains exact');
assert.match(html,/id="stageReward"/,'Stage reward sheet exists');
assert.match(html,/id="stageRewardList"/,'Reward list mount exists');
assert.match(css,/\.stage-reward-card/,'Reward sheet has mobile-safe presentation');
assert.match(js,/function completeStageClear\(stageId\)/,'Stage clear resolver exists');
assert.match(js,/recordStageClear\(state\.stageProgress,stageId/,'Clear state uses catalog resolver');
assert.match(js,/const first=!next\.firstClearRewards\[stageId\]/,'First-clear reward is idempotent');
assert.match(js,/next\.firstClearRewards\[stageId\]=\{grantedAt:Date\.now\(\),rewards\}/,'First-clear grant is persisted');
assert.match(js,/w\.boss&&STAGE_BY_ID\[w\.zone\]\?completeStageClear\(w\.zone\)/,'Active stage Boss completes its stage');
assert.match(js,/function renderStageReward\(/,'Reward sheet renderer exists');
assert.match(js,/el\('stageRewardDone'\)\.onclick/,'Reward sheet close action is wired');
console.log('V8 Grass Meadow Stage Clear + Reward: PASS');
