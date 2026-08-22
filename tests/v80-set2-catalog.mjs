import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STAGE_BY_ID, STAGE_CATALOG, STAGE_REWARD_PROFILES, createStageProgress, recordStageClear, stageRewards, stageUnlockReason } from '../stage-catalog.mjs';
import { WARP_ROUTES, routesFrom } from '../warp-routes.mjs';
import { activeJs as js } from './active-assets.mjs';

const set2Ids=['frozen-pass','rocky-canyon','sky-ruins','poison-marsh'];
const expectedTypes={
  'frozen-pass':['Ice','Flying','Water'],
  'rocky-canyon':['Rock','Ground','Fighting'],
  'sky-ruins':['Flying','Electric','Psychic'],
  'poison-marsh':['Poison','Grass','Bug'],
};
const set2Routes=[['storm-field','frozen-pass'],['frozen-pass','rocky-canyon'],['rocky-canyon','sky-ruins'],['sky-ruins','poison-marsh']];

assert.equal(STAGE_CATALOG.length,16,'Set 2 keeps the complete planned catalog');
for(const [index,id] of set2Ids.entries()){
  const definition=STAGE_BY_ID[id];
  assert.ok(definition,`${id} exists in catalog`);
  assert.deepEqual(definition.unlockRule,index===0?{type:'clearStage',stageId:'storm-field'}:{type:'clearStage',stageId:set2Ids[index-1]},`${id} follows the Set 2 chain`);
  assert.ok(definition.primaryTypes.concat(definition.secondaryTypes).some(type=>expectedTypes[id].includes(type)),`${id} has planned types`);
  assert.equal(definition.clearConditions[0].type,'defeatBoss',`${id} clears through Boss`);
  assert.equal(definition.capturePolicy,'normal-wild-only',`${id} keeps Boss capture disabled policy`);
  assert.ok(STAGE_REWARD_PROFILES[definition.rewardProfileId],`${id} owns a reward profile`);
}
const progress=createStageProgress();
assert.equal(stageUnlockReason(progress,'frozen-pass').ok,false,'Frozen Pass stays locked for a new save');
for(const id of ['grass-meadow','ember-valley','misty-lake','storm-field'])Object.assign(progress,recordStageClear(progress,id));
for(let i=0;i<set2Ids.length;i++){
  const id=set2Ids[i];
  assert.equal(stageUnlockReason(progress,id).ok,true,`${id} unlocks at its chain point`);
  if(i<set2Ids.length-1)assert.equal(stageUnlockReason(progress,set2Ids[i+1]).ok,false,`${set2Ids[i+1]} stays locked before clear`);
  Object.assign(progress,recordStageClear(progress,id));
}
assert.deepEqual(progress.cleared.slice(-4),set2Ids,'Set 2 can be cleared in order');
for(const id of set2Ids){
  const reward=stageRewards(id);
  assert.ok(reward&&reward.captureBalls===5,`${id} returns a catalog-owned reward payload`);
  assert.deepEqual(stageRewards(id),stageRewards(id),`${id} reward payload is stable`);
}
for(const [from,to] of set2Routes){assert.ok(routesFrom(from).some(route=>route.to===to),`${from} has an in-scene route to ${to}`);}
assert.equal(WARP_ROUTES.some(route=>route.from==='poison-marsh'&&route.to==='hub'),true,'Poison Marsh has a safe Hub return route');
assert.match(js,/stageRewards\(stageId\)/,'Runtime consumes the catalog-owned reward resolver');
assert.doesNotMatch(js,/stageId==='ember-valley'\?/,'Runtime no longer chains rewards by stage id');
assert.doesNotMatch(js,/stageId==='misty-lake'\?/,'Runtime no longer chains rewards by stage id');
assert.doesNotMatch(js,/stageId==='storm-field'\?/,'Runtime no longer chains rewards by stage id');
console.log('V8 Set 2-0 Catalog Readiness: PASS');
