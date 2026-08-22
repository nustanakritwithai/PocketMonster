import assert from 'node:assert/strict';
import { STAGE_BY_ID, STAGE_SET_MEMBERS, createStageProgress, normalizeStageProgress, recordStageClear, stageIdsForSet, stageRewards, stageUnlockReason } from '../stage-catalog.mjs';
import { routesFrom, warpAvailability } from '../warp-routes.mjs';
import { activeJs as js } from './active-assets.mjs';

const set2=stageIdsForSet('set-2');
const set3=stageIdsForSet('set-3');
assert.deepEqual(set3,['dream-shrine','haunted-woods','shadow-city','steel-factory'],'Set 3 catalog order is stable');
assert.equal(STAGE_SET_MEMBERS['set-3'].length,4,'Set 3 has four stages');
const fresh=createStageProgress();
assert.equal(stageUnlockReason(fresh,'dream-shrine').ok,false,'fresh progress locks Dream Shrine');
for(const id of set2.slice(0,3))Object.assign(fresh,recordStageClear(fresh,id));
assert.equal(stageUnlockReason(fresh,'dream-shrine').ok,false,'partial Set 2 keeps Dream Shrine locked');
Object.assign(fresh,recordStageClear(fresh,set2[3]));
assert.equal(stageUnlockReason(fresh,'dream-shrine').ok,true,'full Set 2 unlocks Dream Shrine');
for(let i=0;i<set3.length;i++){
  const id=set3[i];
  const predecessor=i===0?'poison-marsh':set3[i-1];
  const forward=routesFrom(predecessor).find(route=>route.to===id);
  const back=routesFrom(id).find(route=>route.to===predecessor);
  assert.ok(forward,`${predecessor} has ${id} forward route`);
  assert.ok(back,`${id} has ${predecessor} return route`);
  assert.ok(Object.keys(stageRewards(id)).length>0,`${id} has reward profile`);
  assert.equal(STAGE_BY_ID[id].capturePolicy,'normal-wild-only',`${id} keeps Boss capture policy`);
  assert.equal(stageUnlockReason(fresh,id).ok,true,`${id} is available after predecessor path`);
  assert.equal(warpAvailability(fresh,forward,stageUnlockReason).ok,true,`${id} forward route is available`);
  Object.assign(fresh,recordStageClear(fresh,id));
}
assert.ok(routesFrom('steel-factory').some(route=>route.to==='hub'),'Steel Factory has safe Hub return');
assert.equal(stageUnlockReason(fresh,'dragon-crater').ok,true,'full Set 3 unlocks Dragon Crater');
assert.equal(stageUnlockReason({...fresh,cleared:fresh.cleared.filter(id=>id!=='steel-factory')},'dragon-crater').ok,false,'partial Set 3 keeps Dragon Crater locked');
const malformed=normalizeStageProgress({cleared:['dream-shrine','steel-factory'],setCleared:{'set-3':true},firstClearRewards:{}});
assert.equal(stageUnlockReason(malformed,'dragon-crater').ok,false,'malformed persisted set flag cannot unlock Dragon Crater');
assert.match(js,/function completeStageClear\(stageId,\{recovered=false\}=\{\}\)\{[\s\S]*?const first=!next\.firstClearRewards\[stageId\]/,'first-clear reward remains idempotent');
for(const id of set3){
  const block=js.match(new RegExp(`['"]${id}['"]\\s*:\\s*\\{[\\s\\S]*?(?=\\n  ['"](?:steel-factory|sky-ruins|rocky-canyon)['"]\\s*:)`))?.[0]||'';
  assert.match(block,/spawn:\[/,`${id} has Normal encounters`);
  assert.match(block,/eliteSpawn:\[/,`${id} has Elite encounters`);
  assert.match(block,/bossSpawn:\[/,`${id} has Boss encounter`);
  assert.doesNotMatch(block,/playerData\.hp|status|damage|teleport|fly|jump|fear|blackout|conveyor|contact/,`${id} stays presentation-only`);
}
console.log('V8 Set 3 Acceptance: PASS (Dream → Haunted → Shadow → Steel)');
