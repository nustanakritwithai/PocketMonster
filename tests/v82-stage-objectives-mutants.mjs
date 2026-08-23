import assert from 'node:assert/strict';
import fs from 'node:fs';

const objectiveSource=fs.readFileSync(new URL('../stage-objectives.mjs',import.meta.url),'utf8');
const gameSource=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
const htmlSource=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

async function loadObjectiveModule(source,label){
  const url=`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}#${encodeURIComponent(label)}`;
  return import(url);
}

async function assertObjectiveContract(source,label='baseline'){
  const {resolveStageObjective:resolve,requiresStageClearReconciliation:requiresReconciliation,runStageClearReconciliation:runReconciliation}=await loadObjectiveModule(source,label);
  const zone={stageId:'grass-meadow',progressionBossSpeciesId:'mossbun'};
  const input={zoneId:'grass-meadow',zone,stageProgress:{cleared:[]},starterJourney:{grassMeadow:{captured:false}},eliteProgress:{defeated:{}},bossProgress:{defeated:{}}};
  assert.equal(resolve(input).phase,'capture-starter');
  input.starterJourney.grassMeadow.captured=true;
  assert.equal(resolve(input).phase,'defeat-elite');
  input.eliteProgress.defeated['grass-meadow:mossbun']={count:1};
  assert.equal(resolve(input).phase,'defeat-boss');
  const legacyBossOnly=structuredClone(input);
  legacyBossOnly.eliteProgress.defeated={};
  input.bossProgress.defeated['grass-meadow:mossbun']={count:1};
  legacyBossOnly.bossProgress.defeated['grass-meadow:mossbun']={count:1};
  const pending=resolve(input);
  assert.equal(pending.phase,'stage-clear-pending');
  assert.equal(resolve(legacyBossOnly).phase,'stage-clear-pending');
  assert.equal(requiresReconciliation(pending),true);
  const reconciled=[];
  assert.equal(runReconciliation({objective:pending,stageId:'grass-meadow',completeStageClear:stage=>reconciled.push(stage)}),true);
  assert.deepEqual(reconciled,['grass-meadow']);
  input.stageProgress.cleared=['grass-meadow'];
  const cleared=resolve(input);
  assert.equal(cleared.phase,'stage-cleared');
  assert.equal(requiresReconciliation(cleared),false);
}

function assertRuntimeContract(game,html,css=fs.readFileSync(new URL('../style-v800.css',import.meta.url),'utf8')){
  assert.match(html,/id="stageObjective"[\s\S]*?STAGE OBJECTIVE/);
  assert.match(html,/id="stageObjectiveList"/);
  assert.match(html,/class="quest-tracker starter-journey/);
  assert.match(css,/\.starter-journey,\.quest-tracker\{[^}]*left:var\(--safe-left\)/);
  assert.match(css,/\.starter-journey,\.quest-tracker\{[^}]*top:calc\(var\(--safe-top\) \+ var\(--touch-min\) \+ 20px\)/);
  assert.match(css,/width:min\(156px,24vw\)/);
  assert.match(css,/\.quest-step\.todo\{display:none\}/);
  assert.doesNotMatch(css,/\.starter-journey\{[^}]*left:50%;transform:translateX\(-50%\)/);
  assert.match(game,/stageObjectiveTracker\(objective,\{stageId:zoneId,stageName,monsterName\}\)/);
  assert.match(game,/objective=currentStageObjective\(zone\);\s*renderStarterJourney\(\);\s*if\(!cfg\|\|!objective\.encounter\)/);
  assert.match(game,/if\(objective\.encounter==='boss'\)\{ensureProgressionEncounter\(zone\);return;\}/);
  assert.match(game,/if\(objective\.encounter==='elite'\)ensureProgressionEncounter\(zone\)/);
  assert.match(game,/objective\.encounter!=='elite'&&cfg\.rareSpawn\?\.length/);
  assert.match(game,/finishCaptureSuccess[\s\S]*?retireWild\(w\);\s*ensureProgressionEncounter\(state\.currentZone\)/);
  assert.match(game,/const replacesProgressionElite=[\s\S]*?if\(!replacesProgressionElite\)respawnWild\(w,wildRespawnDelay\(w\)\)/);
  assert.match(game,/defeatWild[\s\S]*?retireWild\(w\);\s*ensureProgressionEncounter\(w\.zone\)/);
  assert.match(game,/availability\.requires===state\.currentZone[\s\S]*?stageObjectiveText\(currentStageObjective\(\)\)/);
  const completeStageClear=game.match(/function completeStageClear\(stageId,\{recovered=false\}=\{\}\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(completeStageClear,/state\.stageProgress=next;\s*saveGame\(false\);[\s\S]*?renderWarpPrompt\(\);/);
  assert.match(game,/function reconcilePendingStageClear\(zone,objective\)[\s\S]*?completeStageClear:stageId=>completeStageClear\(stageId,\{recovered:true\}\)[\s\S]*?currentStageObjective\(zone\)/);
  assert.match(game,/function spawnZone\(zone\)[\s\S]*?objective=reconcilePendingStageClear\(zone,objective\)/);
  assert.match(game,/if\(w\.boss\)markBossProgress\(w,'defeated',false\)/);
  assert.match(game,/function completeStageClear\(stageId,\{recovered=false\}=\{\}\)[\s\S]*?const elapsed=!recovered&&stageRunStartedAt\?/);
  assert.match(game,/async function syncCloudSave\(\)[\s\S]*?migrateLoadedState\(remote\.state\)[\s\S]*?reloadWorldFromLoadedState\(\)/);
  assert.match(game,/function saveGame\(show=true\)[\s\S]*?else if\(remoteSaveSyncing\)remoteSavePending=true;/);
  assert.match(game,/async function flushRemoteSaveUntilSettled\(\)[\s\S]*?do\{[\s\S]*?remoteSavePending=false;[\s\S]*?await saveRemoteSave\(currentSaveEnvelope\(\)\);[\s\S]*?\}while\(remoteSavePending\);[\s\S]*?remoteSaveReady=true;[\s\S]*?remoteSaveSyncing=false;/);
  assert.match(game,/async function syncCloudSave\(\)[\s\S]*?remoteSaveSyncing=true;[\s\S]*?reloadWorldFromLoadedState\(\)[\s\S]*?await flushRemoteSaveUntilSettled\(\)/);
}

await assertObjectiveContract(objectiveSource);
assertRuntimeContract(gameSource,htmlSource);

const resolverMutants=[
  ['remove starter objective',objectiveSource.replace("if(stageId==='grass-meadow'&&!starterJourney?.grassMeadow?.captured)","if(false)")],
  ['skip required Elite',objectiveSource.replace("if(!hasProgressRecord(eliteProgress?.defeated,key))","if(false)")],
  ['ignore recorded Boss defeat',objectiveSource.replace("if(hasProgressRecord(bossProgress?.defeated,key))","if(false)")],
  ['skip required Boss',objectiveSource.replace("return {phase:'defeat-boss',encounter:'boss',speciesId,complete:false};","return {phase:'stage-clear-pending',encounter:null,speciesId:null,complete:false};")],
  ['ignore recorded stage clear',objectiveSource.replace("if(Array.isArray(stageProgress?.cleared)&&stageProgress.cleared.includes(stageId))","if(false)")],
  ['disable interrupted-save reconciliation',objectiveSource.replace("objective?.phase==='stage-clear-pending'","false")],
  ['skip canonical completion callback',objectiveSource.replace('  completeStageClear(stageId);','  void stageId;')],
];
for(const [name,mutant] of resolverMutants){
  assert.notEqual(mutant,objectiveSource,`${name} mutation must apply`);
  await assert.rejects(()=>assertObjectiveContract(mutant,name),undefined,`${name} must be killed`);
}

const runtimeMutants=[
  ['remove objective HUD',gameSource,htmlSource.replace('id="stageObjective"','id="removedObjective"')],
  ['restore centered objective banner',gameSource,htmlSource,fs.readFileSync(new URL('../style-v800.css',import.meta.url),'utf8').replace('top:calc(var(--safe-top) + var(--touch-min) + 20px);left:var(--safe-left);transform:none','top:132px;left:50%;transform:translateX(-50%)')],
  ['keep the oversized tracker under the top menu',gameSource,htmlSource,fs.readFileSync(new URL('../style-v800.css',import.meta.url),'utf8').replace('top:calc(var(--safe-top) + var(--touch-min) + 20px)','top:54px').replace('width:min(156px,24vw)','width:min(212px,36vw)')],
  ['drop MMO tracker list',gameSource,htmlSource.replace('id="stageObjectiveList"','id="removedObjectiveList"')],
  ['stop using tracker view model',gameSource.replace('stageObjectiveTracker(objective,{stageId:zoneId,stageName,monsterName})','({title:stageName,status:"",steps:[]})'),htmlSource],
  ['leave completed objective stale',gameSource.replace('renderStarterJourney();\n  if(!cfg||!objective.encounter)return null;','if(!cfg||!objective.encounter)return null;'),htmlSource],
  ['remove deterministic Boss spawn',gameSource.replace("if(objective.encounter==='boss'){ensureProgressionEncounter(zone);return;}","if(objective.encounter==='boss')return;"),htmlSource],
  ['remove deterministic Elite spawn',gameSource.replace("if(objective.encounter==='elite')ensureProgressionEncounter(zone);","if(objective.encounter==='elite')return;"),htmlSource],
  ['allow Rare to compete with required Elite',gameSource.replace("objective.encounter!=='elite'&&",''),htmlSource],
  ['require reload after capture',gameSource.replace('ensureProgressionEncounter(state.currentZone);','void state.currentZone;'),htmlSource],
  ['schedule a duplicate captured progression Elite',gameSource.replace('if(!replacesProgressionElite)respawnWild(w,wildRespawnDelay(w));','respawnWild(w,wildRespawnDelay(w));'),htmlSource],
  ['require reload after Elite',gameSource.replace('ensureProgressionEncounter(w.zone);','void w.zone;'),htmlSource],
  ['restore generic warp lock text',gameSource.replace("if(availability.requires===state.currentZone)return stageObjectiveText(currentStageObjective());",''),htmlSource],
  ['leave an open warp prompt locked after Boss clear',gameSource.replace('  renderWarpPrompt();\n  renderStageReward({definition,first,rewards,elapsed});','  renderStageReward({definition,first,rewards,elapsed});'),htmlSource],
  ['leave interrupted Boss clear unreconciled',gameSource.replace('  objective=reconcilePendingStageClear(zone,objective);','  void objective;'),htmlSource],
  ['persist half-completed Boss defeat',gameSource.replace("markBossProgress(w,'defeated',false)","markBossProgress(w,'defeated')"),htmlSource],
  ['defer canonical stage-clear persistence',gameSource.replace('  state.stageProgress=next;\n  saveGame(false);','  state.stageProgress=next;'),htmlSource],
  ['record fake recovery best time',gameSource.replace('const elapsed=!recovered&&stageRunStartedAt?', 'const elapsed=stageRunStartedAt?'),htmlSource],
  ['leave cloud save pending clear unreconciled',gameSource.replace('      reloadWorldFromLoadedState();','      void remote.state;'),htmlSource],
  ['drop local saves during initial Cloud sync',gameSource.replace('  else if(remoteSaveSyncing)remoteSavePending=true;',''),htmlSource],
  ['leave reconciled Cloud document stale',gameSource.replace('    await flushRemoteSaveUntilSettled();','    void currentSaveEnvelope();'),htmlSource],
];
for(const [name,game,html,css] of runtimeMutants){
  assert.throws(()=>assertRuntimeContract(game,html,css),undefined,`${name} must be killed`);
}

console.log(`V8 deterministic stage objective mutants: PASS (${resolverMutants.length+runtimeMutants.length}/${resolverMutants.length+runtimeMutants.length} killed)`);
