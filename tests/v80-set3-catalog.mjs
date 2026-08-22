import assert from 'node:assert/strict';
import { STAGE_BY_ID, createStageProgress, recordStageClear, stageIdsForSet, stageRewards, stageUnlockReason } from '../stage-catalog.mjs';

const set2=['frozen-pass','rocky-canyon','sky-ruins','poison-marsh'];
const set3=[
  ['dream-shrine',['Psychic'],['Fairy','Normal'],{min:20,max:24},'clearSet'],
  ['haunted-woods',['Ghost'],['Dark','Poison'],{min:22,max:26},'dream-shrine'],
  ['shadow-city',['Dark'],['Poison','Fighting'],{min:24,max:28},'haunted-woods'],
  ['steel-factory',['Steel'],['Electric','Rock'],{min:26,max:30},'shadow-city'],
];
assert.deepEqual(stageIdsForSet('set-2'),set2,'Set 2 membership is catalog-owned');
assert.deepEqual(stageIdsForSet('set-3'),set3.map(([id])=>id),'Set 3 membership is catalog-owned');
const fresh=createStageProgress();
assert.equal(stageUnlockReason(fresh,'dream-shrine').ok,false,'Dream Shrine starts locked');
for(const id of set2.slice(0,3))Object.assign(fresh,recordStageClear(fresh,id));
assert.equal(stageUnlockReason(fresh,'dream-shrine').ok,false,'partial Set 2 does not unlock Dream Shrine');
Object.assign(fresh,recordStageClear(fresh,set2[3]));
assert.equal(stageUnlockReason(fresh,'dream-shrine').ok,true,'full Set 2 unlocks Dream Shrine');
for(const [id,primary,secondary,levels,predecessor] of set3){
  const definition=STAGE_BY_ID[id];
  assert.ok(definition,`${id} is catalog-defined`);
  assert.deepEqual(definition.primaryTypes,primary,`${id} primary types stay stable`);
  assert.deepEqual(definition.secondaryTypes,secondary,`${id} secondary types stay stable`);
  assert.deepEqual(definition.recommendedLevel,levels,`${id} level range stays stable`);
  if(predecessor==='clearSet')assert.equal(definition.unlockRule.setId,'set-2',`${id} unlocks after Set 2`);
  else assert.equal(definition.unlockRule.stageId,predecessor,`${id} follows ${predecessor}`);
  assert.ok(Object.keys(stageRewards(id)).length>0,`${id} has a non-empty reward profile`);
}
const set3Progress=createStageProgress();
for(const id of set3.slice(0,3).map(([stageId])=>stageId))Object.assign(set3Progress,recordStageClear(set3Progress,id));
assert.equal(stageUnlockReason(set3Progress,'dragon-crater').ok,false,'partial Set 3 does not unlock Dragon Crater');
for(const [id] of set3)Object.assign(set3Progress,recordStageClear(set3Progress,id));
assert.equal(stageUnlockReason(set3Progress,'dragon-crater').ok,true,'full Set 3 unlocks Dragon Crater');
const malformed={version:1,cleared:['frozen-pass','not-a-stage'],unlocked:['set-2-cleared'],setCleared:{'set-2':true}};
assert.equal(stageUnlockReason(malformed,'dream-shrine').ok,false,'invented persisted set flags do not unlock stages');
const rewardA=stageRewards('dream-shrine');
rewardA.captureBalls=999;
assert.notEqual(stageRewards('dream-shrine').captureBalls,999,'stage rewards return defensive copies');
console.log('V8 Set 3 catalog foundation: PASS');
