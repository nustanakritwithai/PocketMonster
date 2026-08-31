import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STAGE_BY_ID, STAGE_CATALOG, createStageProgress, recordStageClear, stageUnlockReason } from '../stage-catalog.mjs';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';

const set1Ids=['grass-meadow','ember-valley','misty-lake','storm-field'];
const expectedTypes={
  'grass-meadow':['Grass','Bug','Normal'],
  'ember-valley':['Fire','Rock','Ground'],
  'misty-lake':['Water','Grass','Flying'],
  'storm-field':['Electric','Flying','Steel'],
};
assert.equal(html,fs.readFileSync(new URL('../v900.html',import.meta.url),'utf8'),'HTML parity remains exact');
assert.equal(set1Ids.length,4,'Set 1 contains four playable stages');
for(const [index,id] of set1Ids.entries()){
  const definition=STAGE_BY_ID[id];
  assert.ok(definition,`${id} exists in catalog`);
  assert.ok(definition.primaryTypes.concat(definition.secondaryTypes).some(type=>expectedTypes[id].includes(type)),`${id} has planned Set 1 types`);
  assert.equal(definition.clearConditions[0].type,'defeatBoss',`${id} clears through Boss`);
  assert.equal(definition.capturePolicy,'normal-wild-only',`${id} keeps Boss capture disabled policy`);
  if(index)assert.deepEqual(definition.unlockRule,{type:'clearStage',stageId:set1Ids[index-1]},`${id} follows the Set 1 unlock chain`);
}
const progress=createStageProgress();
assert.equal(stageUnlockReason(progress,'grass-meadow').ok,true,'Grass Meadow starts available');
for(let i=0;i<set1Ids.length;i++){
  const id=set1Ids[i];
  assert.equal(stageUnlockReason(progress,id).ok,true,`${id} is available at its chain point`);
  if(i<set1Ids.length-1)assert.equal(stageUnlockReason(progress,set1Ids[i+1]).ok,false,`${set1Ids[i+1]} stays locked before clear`);
  Object.assign(progress,recordStageClear(progress,id,{bestTime:100+i}));
}
assert.deepEqual(progress.cleared,set1Ids,'All Set 1 stages can be cleared in order');
assert.equal(stageUnlockReason(progress,'storm-field').ok,true,'Storm Field remains replayable after Set 1 clear');
for(const id of set1Ids){
  const zoneBlock=js.match(new RegExp(`['"]${id}['"]\\s*:\\s*\\{[\\s\\S]*?\\n  (?:grassland|cave):`))?.[0]||'';
  assert.match(zoneBlock,/stageId:/,`${id} is wired as a runtime stage`);
  assert.match(zoneBlock,/eliteSpawn:/,`${id} has an Elite encounter`);
  assert.match(zoneBlock,/bossSpawn:/,`${id} has a Boss encounter`);
  assert.match(zoneBlock,/progressionBossSpeciesId:/,`${id} has deterministic Boss progression`);
}
assert.match(js,/STAGE_CATALOG/,'Stage Select consumes the shared catalog');
assert.match(js,/function completeStageClear\(stageId,\{recovered=false\}=\{\}\)/,'Stage clear/reward path exists');
assert.match(css,/stage-select-card/,'Stage Select remains mobile-first');
assert.match(css,/stage-reward-card/,'Stage reward remains mobile-first');
console.log('V8 Set 1 Acceptance: PASS (Grass, Ember, Misty, Storm)');
