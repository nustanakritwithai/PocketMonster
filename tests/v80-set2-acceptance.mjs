import assert from 'node:assert/strict';
import { STAGE_BY_ID, createStageProgress, recordStageClear, stageRewards, stageUnlockReason } from '../stage-catalog.mjs';
import { routesFrom, warpAvailability } from '../warp-routes.mjs';
import { activeJs as js } from './active-assets.mjs';

const stages=[
  ['frozen-pass','storm-field'],
  ['rocky-canyon','frozen-pass'],
  ['sky-ruins','rocky-canyon'],
  ['poison-marsh','sky-ruins'],
];
const progress=createStageProgress();
assert.equal(stageUnlockReason(progress,'frozen-pass').ok,false,'Frozen Pass starts locked');
for(const [id,predecessor] of stages){
  assert.ok(STAGE_BY_ID[id],`${id} is catalog-defined`);
  assert.equal(STAGE_BY_ID[id].unlockRule.stageId,predecessor,`${id} follows ${predecessor}`);
  assert.ok(Object.keys(stageRewards(id)).length>0,`${id} has first-clear reward profile`);
  assert.equal(STAGE_BY_ID[id].capturePolicy,'normal-wild-only',`${id} keeps central Boss capture policy`);
  assert.equal(routesFrom(predecessor).some(route=>route.to===id),true,`${predecessor} has forward route to ${id}`);
  assert.equal(routesFrom(id).some(route=>route.to===predecessor),true,`${id} has safe return route`);
  const before={...progress,unlocked:progress.unlocked.filter(unlockedId=>unlockedId!==id),cleared:progress.cleared.filter(clearedId=>clearedId!==predecessor)};
  assert.equal(stageUnlockReason(before,id).ok,false,`${id} stays locked before predecessor clear`);
  Object.assign(progress,recordStageClear(progress,predecessor));
  assert.equal(stageUnlockReason(progress,id).ok,true,`${id} unlocks after predecessor clear`);
  const forward=routesFrom(predecessor).find(route=>route.to===id);
  assert.equal(warpAvailability(progress,forward,stageUnlockReason).ok,true,`${id} forward warp is available`);
  Object.assign(progress,recordStageClear(progress,id));
}
for(const [id] of stages){
  const block=js.match(new RegExp(`['"]${id}['"]\\s*:\\s*\\{[\\s\\S]*?(?=\\n  ['"]|\\n\\};)`))?.[0]||'';
  assert.match(block,/spawn:\[/,`${id} has Normal encounters`);
  assert.match(block,/eliteSpawn:\[/,`${id} has Elite encounters`);
  assert.match(block,/bossSpawn:\[/,`${id} has Boss encounter`);
  assert.match(block,/sceneStatus:'stage-ready'/,`${id} is stage-ready`);
  assert.doesNotMatch(block,/playerData\.hp|status|damage|teleport|fly|jump/,`${id} has no environment gameplay loop`);
}
assert.equal(routesFrom('poison-marsh').some(route=>route.to==='hub'),true,'Poison Marsh has safe Hub return');
console.log('V8 Set 2 Acceptance: PASS (Frozen → Rocky → Sky → Poison)');
