import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STAGE_SET_MEMBERS, createStageProgress, recordStageClear, stageIdsForSet, stageUnlockReason } from '../stage-catalog.mjs';

const routes=fs.readFileSync(new URL('../warp-routes.mjs',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
const set3=stageIdsForSet('set-3');
assert.equal(set3.length,4,'mutation 1: Set 3 cannot lose a stage');
assert.match(routes,/from:'steel-factory',to:'hub'/,'mutation 2: Steel Factory must retain safe Hub return');
assert.match(js,/function completeStageClear\(stageId,\{recovered=false\}=\{\}\)\{[\s\S]*?const first=!next\.firstClearRewards\[stageId\]/,'mutation 3: first-clear guard cannot be removed');
assert.doesNotMatch(js,/state\.stageProgress\.setCleared|next\.setCleared/,'mutation 4: no persisted set completion duplicate');
const partial=createStageProgress();
for(const id of set3.slice(0,3))Object.assign(partial,recordStageClear(partial,id));
assert.equal(stageUnlockReason(partial,'dragon-crater').ok,false,'mutation 5: partial Set 3 cannot unlock Dragon Crater');
const full={...partial,cleared:[...partial.cleared,set3[3]]};
assert.equal(stageUnlockReason(full,'dragon-crater').ok,true,'full Set 3 unlock remains derived');
assert.deepEqual(STAGE_SET_MEMBERS['set-3'],['dream-shrine','haunted-woods','shadow-city','steel-factory'],'Set 3 membership remains catalog-owned');
console.log('V8 Set 3 Acceptance mutation guards: PASS (5/5 killed)');
