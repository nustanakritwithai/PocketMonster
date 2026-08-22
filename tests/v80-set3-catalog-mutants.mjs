import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STAGE_BY_ID, STAGE_SET_MEMBERS, createStageProgress, stageIdsForSet, stageRewards, stageUnlockReason } from '../stage-catalog.mjs';

const src=fs.readFileSync(new URL('../stage-catalog.mjs',import.meta.url),'utf8');
const set2=STAGE_SET_MEMBERS['set-2'];
const set3=STAGE_SET_MEMBERS['set-3'];
const clearSet=/if\(rule\.type==='clearSet'\)\{[\s\S]*?stageIdsForSet\(rule\.setId\)[\s\S]*?members\.every\(id=>current\.cleared\.includes\(id\)\)/;
assert.match(src,clearSet,'clearSet must derive completion from canonical cleared IDs');
assert.doesNotMatch(src,/if\(rule\.type==='clearSet'\)return \{ok:false/,'mutation 1: clearSet cannot remain permanently locked');
assert.deepEqual(set2,['frozen-pass','rocky-canyon','sky-ruins','poison-marsh'],'mutation 2: Set 2 membership cannot drop a stage');
assert.deepEqual(set3,['dream-shrine','haunted-woods','shadow-city','steel-factory'],'mutation 3: Set 3 membership cannot change');
for(const id of set3){
  assert.ok(Object.keys(stageRewards(id)).length>0,`mutation 4: ${id} reward must not be empty`);
  assert.equal(STAGE_BY_ID[id].capturePolicy,'normal-wild-only',`mutation 5: ${id} Boss policy stays central`);
}
const all=new Set([...set2]);
const progress=createStageProgress();
progress.cleared=[...all];
assert.equal(stageUnlockReason(progress,'dream-shrine').ok,true,'full Set 2 still unlocks Dream Shrine');
const invented={...progress,setCleared:{'set-2':true},cleared:[]};
assert.equal(stageUnlockReason(invented,'dream-shrine').ok,false,'persisted set flags cannot bypass derived completion');
assert.equal(stageIdsForSet('unknown-set').length,0,'unknown sets fail closed');
console.log('V8 Set 3 catalog mutation guards: PASS (5/5 killed)');
