import assert from 'node:assert/strict';
import fs from 'node:fs';

const objectiveSource=fs.readFileSync(new URL('../stage-objectives.mjs',import.meta.url),'utf8');
const gameSource=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
const htmlSource=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

async function loadResolver(source,label){
  const url=`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}#${encodeURIComponent(label)}`;
  return (await import(url)).resolveStageObjective;
}

async function assertObjectiveContract(source,label='baseline'){
  const resolve=await loadResolver(source,label);
  const zone={stageId:'grass-meadow',progressionBossSpeciesId:'mossbun'};
  const input={zoneId:'grass-meadow',zone,stageProgress:{cleared:[]},starterJourney:{grassMeadow:{captured:false}},eliteProgress:{defeated:{}},bossProgress:{defeated:{}}};
  assert.equal(resolve(input).phase,'capture-starter');
  input.starterJourney.grassMeadow.captured=true;
  assert.equal(resolve(input).phase,'defeat-elite');
  input.eliteProgress.defeated['grass-meadow:mossbun']={count:1};
  assert.equal(resolve(input).phase,'defeat-boss');
  input.bossProgress.defeated['grass-meadow:mossbun']={count:1};
  assert.equal(resolve(input).phase,'stage-clear-pending');
  input.stageProgress.cleared=['grass-meadow'];
  assert.equal(resolve(input).phase,'stage-cleared');
}

function assertRuntimeContract(game,html){
  assert.match(html,/id="stageObjective"[\s\S]*?STAGE OBJECTIVE/);
  assert.match(game,/objective=currentStageObjective\(zone\);\s*renderStarterJourney\(\);\s*if\(!cfg\|\|!objective\.encounter\)/);
  assert.match(game,/if\(objective\.encounter==='boss'\)\{ensureProgressionEncounter\(zone\);return;\}/);
  assert.match(game,/if\(objective\.encounter==='elite'\)ensureProgressionEncounter\(zone\)/);
  assert.match(game,/objective\.encounter!=='elite'&&cfg\.rareSpawn\?\.length/);
  assert.match(game,/finishCaptureSuccess[\s\S]*?retireWild\(w\);\s*ensureProgressionEncounter\(state\.currentZone\)/);
  assert.match(game,/const replacesProgressionElite=[\s\S]*?if\(!replacesProgressionElite\)respawnWild\(w,wildRespawnDelay\(w\)\)/);
  assert.match(game,/defeatWild[\s\S]*?retireWild\(w\);\s*ensureProgressionEncounter\(w\.zone\)/);
  assert.match(game,/availability\.requires===state\.currentZone[\s\S]*?stageObjectiveText\(currentStageObjective\(\)\)/);
  const completeStageClear=game.match(/function completeStageClear\(stageId\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(completeStageClear,/state\.stageProgress=next;[\s\S]*?renderWarpPrompt\(\);/);
}

await assertObjectiveContract(objectiveSource);
assertRuntimeContract(gameSource,htmlSource);

const resolverMutants=[
  ['remove starter objective',objectiveSource.replace("if(stageId==='grass-meadow'&&!starterJourney?.grassMeadow?.captured)","if(false)")],
  ['skip required Elite',objectiveSource.replace("if(!hasProgressRecord(eliteProgress?.defeated,key))","if(false)")],
  ['skip required Boss',objectiveSource.replace("if(!hasProgressRecord(bossProgress?.defeated,key))","if(false)")],
  ['ignore recorded stage clear',objectiveSource.replace("if(Array.isArray(stageProgress?.cleared)&&stageProgress.cleared.includes(stageId))","if(false)")],
];
for(const [name,mutant] of resolverMutants){
  assert.notEqual(mutant,objectiveSource,`${name} mutation must apply`);
  await assert.rejects(()=>assertObjectiveContract(mutant,name),undefined,`${name} must be killed`);
}

const runtimeMutants=[
  ['remove objective HUD',gameSource,htmlSource.replace('id="stageObjective"','id="removedObjective"')],
  ['leave completed objective stale',gameSource.replace('renderStarterJourney();\n  if(!cfg||!objective.encounter)return null;','if(!cfg||!objective.encounter)return null;'),htmlSource],
  ['remove deterministic Boss spawn',gameSource.replace("if(objective.encounter==='boss'){ensureProgressionEncounter(zone);return;}","if(objective.encounter==='boss')return;"),htmlSource],
  ['remove deterministic Elite spawn',gameSource.replace("if(objective.encounter==='elite')ensureProgressionEncounter(zone);","if(objective.encounter==='elite')return;"),htmlSource],
  ['allow Rare to compete with required Elite',gameSource.replace("objective.encounter!=='elite'&&",''),htmlSource],
  ['require reload after capture',gameSource.replace('ensureProgressionEncounter(state.currentZone);','void state.currentZone;'),htmlSource],
  ['schedule a duplicate captured progression Elite',gameSource.replace('if(!replacesProgressionElite)respawnWild(w,wildRespawnDelay(w));','respawnWild(w,wildRespawnDelay(w));'),htmlSource],
  ['require reload after Elite',gameSource.replace('ensureProgressionEncounter(w.zone);','void w.zone;'),htmlSource],
  ['restore generic warp lock text',gameSource.replace("if(availability.requires===state.currentZone)return stageObjectiveText(currentStageObjective());",''),htmlSource],
  ['leave an open warp prompt locked after Boss clear',gameSource.replace('  renderWarpPrompt();\n  renderStageReward({definition,first,rewards,elapsed});','  renderStageReward({definition,first,rewards,elapsed});'),htmlSource],
];
for(const [name,game,html] of runtimeMutants){
  assert.throws(()=>assertRuntimeContract(game,html),undefined,`${name} must be killed`);
}

console.log(`V8 deterministic stage objective mutants: PASS (${resolverMutants.length+runtimeMutants.length}/${resolverMutants.length+runtimeMutants.length} killed)`);
