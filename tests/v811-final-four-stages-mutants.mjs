import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STAGE_CATALOG, stageRewards } from '../stage-catalog.mjs';
import { resolveStageObjective } from '../stage-objectives.mjs';
import { WARP_ROUTES } from '../warp-routes.mjs';
import { assertFinalFourStages } from './v811-final-four-stages.mjs';
import { extractArrayExpression, extractStageBlock, parseArrayField } from './v811-stage-level-progression.mjs';

const gameSource=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');

function replaceStage(source,stageId,mutate){
  const block=extractStageBlock(source,stageId);
  assert.ok(block,`${stageId} baseline block exists`);
  const mutated=mutate(block);
  assert.notEqual(mutated,block,`${stageId} mutation must apply`);
  return source.replace(block,mutated);
}

function replaceList(source,stageId,listName,mutate){
  return replaceStage(source,stageId,block=>{
    const list=extractArrayExpression(block,listName);
    assert.ok(list,`${stageId} ${listName} baseline exists`);
    const mutated=mutate(list,block);
    assert.notEqual(mutated,list,`${stageId} ${listName} mutation must apply`);
    return block.replace(list,mutated);
  });
}

function moveFirstSpawnOutOfBounds(source,stageId){
  return replaceList(source,stageId,'spawn',list=>list.replace(
    /(\[\s*['"][^'"]+['"]\s*,\s*)-?\d+(?:\.\d+)?/,
    (_record,prefix)=>`${prefix}999`,
  ));
}

function exceedImmediateBudget(source,stageId){
  const block=extractStageBlock(source,stageId);
  const records=parseArrayField(block,'spawn',source);
  const first=records[0],extra=Array.from({length:9-records.length},(_value,index)=>
    `['${first[0]}',${index},${index},${first[3]},{}]`,
  );
  assert.ok(extra.length>0,`${stageId} baseline must be below the mutant budget`);
  return replaceList(source,stageId,'spawn',list=>`${list.slice(0,-1)},${extra.join(',')}]`);
}

assertFinalFourStages({gameSource});

const wrongUnlock=structuredClone(STAGE_CATALOG);
wrongUnlock.find(stage=>stage.id==='fairy-garden').unlockRule={type:'clearStage',stageId:'steel-factory'};
const missingForward=structuredClone(WARP_ROUTES).filter(route=>route.id!=='steel-to-dragon');
const missingReverse=structuredClone(WARP_ROUTES).filter(route=>route.id!=='dragon-to-steel');
const missingHubReturn=structuredClone(WARP_ROUTES).filter(route=>route.id!=='normal-to-hub');

const mutants=[
  {
    name:'Dragon Crater runtime zone is removed',
    gameSource:replaceStage(gameSource,'dragon-crater',block=>block.replace("'dragon-crater':{","'dragon-crater-removed':{")),
  },
  {
    name:'Fairy Garden scene-ready status is removed',
    gameSource:replaceStage(gameSource,'fairy-garden',block=>block.replace("sceneStatus:'stage-ready'","sceneState:'stage-ready'")),
  },
  {
    name:'Combat Colosseum Normal encounters are empty',
    gameSource:replaceList(gameSource,'combat-colosseum','spawn',()=> '[]'),
  },
  {
    name:'Dragon Crater Elite encounter is empty',
    gameSource:replaceList(gameSource,'dragon-crater','eliteSpawn',()=> '[]'),
  },
  {
    name:'Normal Wildlands Boss encounter is empty',
    gameSource:replaceList(gameSource,'normal-wildlands','bossSpawn',()=> '[]'),
  },
  {
    name:'progression Boss reference drifts from the Boss spawn',
    gameSource:replaceStage(gameSource,'dragon-crater',block=>block.replace("progressionBossSpeciesId:'emberdrake'","progressionBossSpeciesId:'normalooze'")),
  },
  {
    name:'Elite encounter loses its variant flag',
    gameSource:replaceList(gameSource,'fairy-garden','eliteSpawn',list=>list.replace('{elite:true}','{}')),
  },
  {
    name:'Normal encounter spawns outside stage bounds',
    gameSource:moveFirstSpawnOutOfBounds(gameSource,'combat-colosseum'),
  },
  {
    name:'immediate Normal spawns exceed the mobile budget',
    gameSource:exceedImmediateBudget(gameSource,'normal-wildlands'),
  },
  {
    name:'first-clear reward profile is missing',
    rewardsFor:stageId=>stageId==='fairy-garden'?{}:stageRewards(stageId),
  },
  {
    name:'Steel Factory forward warp to Dragon Crater is removed',
    routes:missingForward,
  },
  {
    name:'Dragon Crater reverse warp to Steel Factory is removed',
    routes:missingReverse,
  },
  {
    name:'Normal Wildlands Ranch Hub return is removed',
    routes:missingHubReturn,
  },
  {
    name:'final-stage unlock chain skips Dragon Crater',
    catalog:wrongUnlock,
  },
  {
    name:'objective resolver skips the Elite-to-Boss flow',
    objectiveResolver:()=>({phase:'free-explore',encounter:null,speciesId:null,complete:false}),
  },
  {
    name:'objective tracker drops the two-step contract',
    trackerFor:()=>({title:'mutant',status:'',steps:[]}),
  },
  {
    name:'stage environment applies direct player damage',
    gameSource:replaceStage(gameSource,'combat-colosseum',block=>`${block}\n  if(state.currentZone==='combat-colosseum')playerData.hp-=1;`),
  },
  {
    name:'runtime encounter metadata drifts from the catalog',
    gameSource:replaceStage(gameSource,'normal-wildlands',block=>block.replace("encounterTableId:'encounter-normal-wildlands-v1'","encounterTableId:'encounter-mutant-v1'")),
  },
];

for(const mutant of mutants){
  assert.throws(
    ()=>assertFinalFourStages({
      gameSource:mutant.gameSource??gameSource,
      catalog:mutant.catalog??STAGE_CATALOG,
      routes:mutant.routes??WARP_ROUTES,
      rewardsFor:mutant.rewardsFor??stageRewards,
      objectiveResolver:mutant.objectiveResolver??resolveStageObjective,
      trackerFor:mutant.trackerFor,
    }),
    undefined,
    `${mutant.name} must be killed`,
  );
}

console.log(`V8.11 final four stage mutants: PASS (${mutants.length}/${mutants.length} killed)`);
