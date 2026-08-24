import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  STAGE_CATALOG,
  createStageProgress,
  recordStageClear,
  stageRewards,
  stageUnlockReason,
  validateZoneEncounterConfig,
} from '../stage-catalog.mjs';
import { resolveStageObjective, stageObjectiveTracker } from '../stage-objectives.mjs';
import { WARP_ROUTES, validateWarpRoutes, warpAvailability } from '../warp-routes.mjs';
import { extractStageBlock, parseArrayField, parseObjectField, stringField } from './v811-stage-level-progression.mjs';

export const FINAL_FOUR=Object.freeze([
  Object.freeze({id:'dragon-crater',predecessor:'steel-factory',unlockRule:Object.freeze({type:'clearSet',setId:'set-3'})}),
  Object.freeze({id:'fairy-garden',predecessor:'dragon-crater',unlockRule:Object.freeze({type:'clearStage',stageId:'dragon-crater'})}),
  Object.freeze({id:'combat-colosseum',predecessor:'fairy-garden',unlockRule:Object.freeze({type:'clearStage',stageId:'fairy-garden'})}),
  Object.freeze({id:'normal-wildlands',predecessor:'combat-colosseum',unlockRule:Object.freeze({type:'clearStage',stageId:'combat-colosseum'})}),
]);

const SET_THREE=Object.freeze(['dream-shrine','haunted-woods','shadow-city','steel-factory']);
const HAZARD_SIDE_EFFECT=/playerData\s*\.\s*hp|(?:currentHP|\.hp)\s*(?:[-+*/]?=)|apply(?:Status|Damage)|dealDamage|takeDamage|damagePlayer|hazardDamage|contactDamage|teleport(?:Player)?\s*\(|knockback|conveyor(?:Speed)?|forceMovement|movementLock|blackout\s*=|fear\s*=/i;

function numberField(block,field){
  const match=new RegExp(`\\b${field}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(block);
  return match?Number(match[1]):null;
}

function nearbyStageSource(gameSource,stageId){
  const lines=gameSource.split('\n'),selected=new Set();
  lines.forEach((line,index)=>{
    if(!line.includes(stageId))return;
    for(let offset=-1;offset<=12;offset++)if(index+offset>=0&&index+offset<lines.length)selected.add(index+offset);
  });
  return [...selected].sort((a,b)=>a-b).map(index=>lines[index]).join('\n');
}

function plainArray(value){return Array.from(value);}

export function assertFinalFourStages({
  gameSource,
  catalog=STAGE_CATALOG,
  routes=WARP_ROUTES,
  rewardsFor=stageRewards,
  objectiveResolver=resolveStageObjective,
  trackerFor=stageObjectiveTracker,
  zoneValidator=validateZoneEncounterConfig,
  routeValidator=validateWarpRoutes,
}={}){
  assert.equal(typeof gameSource,'string','Runtime source is required');
  const byId=Object.fromEntries(catalog.map(stage=>[stage.id,stage]));
  const parsedZones={};

  for(const contract of FINAL_FOUR){
    const {id}=contract,stage=byId[id];
    assert.ok(stage,`${id} must remain in the stage catalog`);
    assert.equal(stage.status,'active',`${id} must be an active runtime stage`);
    assert.deepEqual(stage.unlockRule,contract.unlockRule,`${id} must keep the final-stage unlock chain`);

    const block=extractStageBlock(gameSource,id);
    assert.ok(block,`${id} must have a runtime zone`);
    assert.equal(stringField(block,'stageId'),id,`${id} runtime metadata must link to the catalog`);
    assert.equal(stringField(block,'biomeId'),stage.biomeId,`${id} runtime biome must match the catalog`);
    assert.ok(stringField(block,'label'),`${id} must have a player-facing label`);
    assert.ok(numberField(block,'bg')!==null,`${id} must define a background color`);
    assert.ok(numberField(block,'ground')!==null,`${id} must define a ground color`);
    assert.deepEqual(plainArray(parseArrayField(block,'primaryTypes',gameSource)),stage.primaryTypes,`${id} runtime primary types must match the catalog`);
    assert.deepEqual(plainArray(parseArrayField(block,'secondaryTypes',gameSource)),stage.secondaryTypes,`${id} runtime secondary types must match the catalog`);
    assert.equal(stringField(block,'encounterTableId'),stage.encounterTableId,`${id} Normal encounter metadata must be catalog-derived`);
    assert.equal(stringField(block,'eliteEncounterTableId'),stage.eliteEncounterId,`${id} Elite encounter metadata must be catalog-derived`);
    assert.equal(stringField(block,'bossEncounterTableId'),stage.bossEncounterId,`${id} Boss encounter metadata must be catalog-derived`);
    assert.equal(stringField(block,'balanceProfileId'),stage.rewardProfileId,`${id} balance/reward profile metadata must stay aligned`);
    assert.equal(stringField(block,'sceneStatus'),'stage-ready',`${id} must be stage-ready`);

    const spawn=parseArrayField(block,'spawn',gameSource);
    const eliteSpawn=parseArrayField(block,'eliteSpawn',gameSource);
    const bossSpawn=parseArrayField(block,'bossSpawn',gameSource);
    const progressionBossSpeciesId=stringField(block,'progressionBossSpeciesId');
    assert.ok(spawn.length>0,`${id} must have Normal encounters`);
    assert.ok(spawn.length<=8,`${id} immediate Normal spawn budget must stay at or below 8`);
    assert.equal(eliteSpawn.length,1,`${id} must have one deterministic Elite encounter`);
    assert.equal(bossSpawn.length,1,`${id} must have one opt-in Boss encounter`);
    assert.ok(progressionBossSpeciesId,`${id} must name its progression Boss species`);
    assert.ok(eliteSpawn.some(record=>record[0]===progressionBossSpeciesId),`${id} progression species must own the Elite objective`);
    assert.ok(bossSpawn.some(record=>record[0]===progressionBossSpeciesId),`${id} progression species must own the Boss objective`);
    assert.ok(spawn.every(record=>!record[4]?.elite&&!record[4]?.boss),`${id} immediate Normal spawns cannot contain Elite/Boss flags`);
    assert.ok(eliteSpawn.every(record=>record[4]?.elite===true&&!record[4]?.boss),`${id} Elite spawn must keep its Elite flag`);
    assert.ok(bossSpawn.every(record=>record[4]?.boss===true&&!record[4]?.elite),`${id} Boss spawn must keep its Boss flag`);

    const bounds=parseObjectField(block,'bounds',gameSource);
    const playerStart=parseArrayField(block,'playerStart',gameSource);
    assert.ok(Number.isFinite(bounds.minX)&&Number.isFinite(bounds.maxX)&&bounds.minX<bounds.maxX,`${id} must have valid horizontal bounds`);
    assert.ok(Number.isFinite(bounds.minZ)&&Number.isFinite(bounds.maxZ)&&bounds.minZ<bounds.maxZ,`${id} must have valid depth bounds`);
    assert.equal(playerStart.length,3,`${id} playerStart must be a 3D point`);
    assert.ok(playerStart[0]>=bounds.minX&&playerStart[0]<=bounds.maxX&&playerStart[2]>=bounds.minZ&&playerStart[2]<=bounds.maxZ,`${id} playerStart must stay inside bounds`);
    for(const [listName,records] of [['spawn',spawn],['eliteSpawn',eliteSpawn],['bossSpawn',bossSpawn]]){
      records.forEach((record,index)=>{
        assert.ok(record[1]>=bounds.minX&&record[1]<=bounds.maxX&&record[2]>=bounds.minZ&&record[2]<=bounds.maxZ,`${id} ${listName}[${index}] must stay inside bounds`);
      });
    }

    const reward=rewardsFor(id);
    assert.ok(reward&&Object.keys(reward).length>0,`${id} must have a first-clear reward`);
    assert.ok(Object.values(reward).every(amount=>Number.isInteger(amount)&&amount>0),`${id} reward quantities must be positive integers`);
    const rewardKey=Object.keys(reward)[0],mutatedReward=rewardsFor(id);
    mutatedReward[rewardKey]=999;
    assert.notEqual(rewardsFor(id)[rewardKey],999,`${id} rewards must be defensive copies`);

    const stageSource=`${block}\n${nearbyStageSource(gameSource,id)}`;
    assert.doesNotMatch(stageSource,HAZARD_SIDE_EFFECT,`${id} environment must not add gameplay hazard side effects`);

    parsedZones[id]={stageId:id,spawn,eliteSpawn,bossSpawn,progressionBossSpeciesId,bounds};
  }

  const zoneValidation=zoneValidator(parsedZones);
  assert.equal(zoneValidation.ok,true,`Final-stage encounter configs must validate: ${JSON.stringify(zoneValidation.issues||[])}`);
  const routeValidation=routeValidator(routes);
  assert.equal(routeValidation.ok,true,`Warp routes must validate: ${JSON.stringify(routeValidation.issues||[])}`);

  let progress=createStageProgress();
  for(const stageId of SET_THREE)progress=recordStageClear(progress,stageId);
  for(const [index,contract] of FINAL_FOUR.entries()){
    const {id,predecessor}=contract;
    const forward=routes.find(route=>route.from===predecessor&&route.to===id&&route.kind==='forward');
    const reverse=routes.find(route=>route.from===id&&route.to===predecessor&&route.kind==='return');
    assert.ok(forward,`${predecessor} must have a forward warp to ${id}`);
    assert.ok(reverse,`${id} must have a reverse warp to ${predecessor}`);
    assert.equal(stageUnlockReason(progress,id).ok,true,`${id} must unlock after its canonical prerequisite`);
    assert.equal(warpAvailability(progress,forward,stageUnlockReason).ok,true,`${id} forward warp must open with the same progress record`);
    const next=FINAL_FOUR[index+1]?.id;
    if(next)assert.equal(stageUnlockReason(progress,next).ok,false,`${next} must remain locked before ${id} is cleared`);
    progress=recordStageClear(progress,id);
  }
  const hubReturn=routes.find(route=>route.from==='normal-wildlands'&&route.to==='hub'&&route.kind==='return');
  assert.ok(hubReturn,'Normal Wildlands must provide the final Ranch Hub return');
  assert.equal(warpAvailability(progress,hubReturn,stageUnlockReason).ok,true,'Final Ranch Hub return must remain a safe route');

  for(const {id} of FINAL_FOUR){
    const zone=parsedZones[id],speciesId=zone.progressionBossSpeciesId,key=`${id}:${speciesId}`;
    const input={zoneId:id,zone,stageProgress:{cleared:[]},starterJourney:{grassMeadow:{captured:true}},eliteProgress:{defeated:{}},bossProgress:{defeated:{}}};
    const eliteObjective=objectiveResolver(input);
    assert.deepEqual(eliteObjective,{phase:'defeat-elite',encounter:'elite',speciesId,complete:false},`${id} objective must begin at the required Elite`);
    input.eliteProgress.defeated[key]={count:1};
    const bossObjective=objectiveResolver(input);
    assert.deepEqual(bossObjective,{phase:'defeat-boss',encounter:'boss',speciesId,complete:false},`${id} objective must advance from Elite to Boss`);
    input.bossProgress.defeated[key]={count:1};
    assert.deepEqual(objectiveResolver(input),{phase:'stage-clear-pending',encounter:null,speciesId:null,complete:false},`${id} Boss defeat must enter canonical clear reconciliation`);
    input.stageProgress.cleared=[id];
    assert.deepEqual(objectiveResolver(input),{phase:'stage-cleared',encounter:null,speciesId:null,complete:true},`${id} clear record must finish the objective`);
    const tracker=trackerFor(eliteObjective,{stageId:id,stageName:byId[id].displayName,monsterName:speciesId});
    assert.deepEqual(tracker.steps.map(step=>[step.mark,step.state]),[['1/2','current'],['2/2','todo']],`${id} must use the standard two-step Elite-to-Boss tracker`);
  }
}

const isDirect=Boolean(process.argv[1])&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url;
if(isDirect){
  const gameSource=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
  assertFinalFourStages({gameSource});
  console.log('V8.11 final four stages: PASS (Dragon → Fairy → Combat → Normal → Ranch Hub)');
}
