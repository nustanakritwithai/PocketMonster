import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createStageProgress, recordStageClear, stageUnlockReason } from '../stage-catalog.mjs';
import { routesFrom, warpAvailability } from '../warp-routes.mjs';

const objectiveModule=await import('../stage-objectives.mjs').catch(()=>({}));
const { resolveStageObjective, requiresStageClearReconciliation, runStageClearReconciliation, stageObjectiveTracker }=objectiveModule;

assert.equal(typeof resolveStageObjective,'function','Stage progression exposes a deterministic objective resolver');
assert.equal(typeof requiresStageClearReconciliation,'function','Stage progression exposes interrupted-save reconciliation policy');
assert.equal(typeof runStageClearReconciliation,'function','Stage progression exposes a behavioral interrupted-save reconciler');
assert.equal(typeof stageObjectiveTracker,'function','Stage objectives expose an MMO-style tracker view model');

const zone={stageId:'grass-meadow',progressionBossSpeciesId:'mossbun'};
const fresh={stageProgress:{cleared:[]},starterJourney:{grassMeadow:{captured:false}},eliteProgress:{defeated:{}},bossProgress:{defeated:{}}};
assert.deepEqual(resolveStageObjective({zoneId:'grass-meadow',zone,...fresh}),{
  phase:'capture-starter',encounter:null,speciesId:null,complete:false,
},'Grass Meadow starts with an explicit starter capture objective');

const captured=structuredClone(fresh);
captured.starterJourney.grassMeadow.captured=true;
assert.deepEqual(resolveStageObjective({zoneId:'grass-meadow',zone,...captured}),{
  phase:'defeat-elite',encounter:'elite',speciesId:'mossbun',complete:false,
},'Capturing the starter deterministically advances to the required Elite');

const eliteDefeated=structuredClone(captured);
eliteDefeated.eliteProgress.defeated['grass-meadow:mossbun']={count:1};
assert.deepEqual(resolveStageObjective({zoneId:'grass-meadow',zone,...eliteDefeated}),{
  phase:'defeat-boss',encounter:'boss',speciesId:'mossbun',complete:false,
},'Defeating the Elite deterministically advances to the Boss');

const cleared=structuredClone(eliteDefeated);
cleared.bossProgress.defeated['grass-meadow:mossbun']={count:1};
cleared.stageProgress=recordStageClear(createStageProgress(),'grass-meadow');
assert.deepEqual(resolveStageObjective({zoneId:'grass-meadow',zone,...cleared}),{
  phase:'stage-cleared',encounter:null,speciesId:null,complete:true,
},'Boss clear finishes the objective and does not request another encounter');
const forwardWarp=routesFrom('grass-meadow').find(route=>route.to==='ember-valley');
assert.equal(warpAvailability(cleared.stageProgress,forwardWarp,stageUnlockReason).ok,true,'The same Boss clear record unlocks the forward warp immediately');

const interrupted=structuredClone(eliteDefeated);
interrupted.bossProgress.defeated['grass-meadow:mossbun']={count:1};
const interruptedObjective=resolveStageObjective({zoneId:'grass-meadow',zone,...interrupted});
assert.equal(interruptedObjective.phase,'stage-clear-pending','Interrupted saves expose a recoverable pending clear state');
const legacyBossOnly=structuredClone(captured);
legacyBossOnly.bossProgress.defeated['grass-meadow:mossbun']={count:1};
assert.equal(resolveStageObjective({zoneId:'grass-meadow',zone,...legacyBossOnly}).phase,'stage-clear-pending','Boss defeat is monotonic and recovers even when a legacy save lacks its Elite record');
assert.equal(requiresStageClearReconciliation(interruptedObjective),true,'Pending Boss clear is explicitly marked for runtime reconciliation');
const reconciledStages=[];
let recoveredProgress=interrupted.stageProgress;
assert.equal(runStageClearReconciliation({objective:interruptedObjective,stageId:'grass-meadow',completeStageClear:stageId=>{
  reconciledStages.push(stageId);
  recoveredProgress=recordStageClear(recoveredProgress,stageId);
}}),true,'Pending Boss clear runs the canonical completion callback');
assert.deepEqual(reconciledStages,['grass-meadow'],'Interrupted save is completed exactly once for the affected stage');
assert.equal(warpAvailability(recoveredProgress,forwardWarp,stageUnlockReason).ok,true,'Recovered Boss clear unlocks the forward warp without replaying the Boss');
assert.equal(runStageClearReconciliation({objective:{phase:'stage-cleared'},stageId:'grass-meadow',completeStageClear:stageId=>reconciledStages.push(stageId)}),false,'Already-cleared stages are not completed twice');

const captureTracker=stageObjectiveTracker({phase:'capture-starter'},{stageId:'grass-meadow',stageName:'Grass Meadow',monsterName:'Mossbun'});
assert.equal(captureTracker.title,'Grass Meadow','Tracker names the current stage');
assert.deepEqual(captureTracker.steps.map(step=>step.state),['current','todo','todo'],'Grass capture is the first current tracker step');
const eliteTracker=stageObjectiveTracker({phase:'defeat-elite',speciesId:'mossbun'},{stageId:'grass-meadow',stageName:'Grass Meadow',monsterName:'Mossbun'});
assert.deepEqual(eliteTracker.steps.map(step=>step.state),['done','current','todo'],'Completed capture stays checked while Elite is current');
const laterElite=stageObjectiveTracker({phase:'defeat-elite',speciesId:'flameling'},{stageId:'ember-valley',stageName:'Ember Valley',monsterName:'Flare Slime'});
assert.deepEqual(laterElite.steps.map(step=>[step.mark,step.state]),[['1/2','current'],['2/2','todo']],'Later stages keep a two-step tracker');

const js=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../style-v800.css',import.meta.url),'utf8');
assert.match(html,/id="stageObjective"/,'A persistent player-facing stage objective is present in the HUD');
assert.match(html,/id="stageObjectiveList"/,'Objective HUD renders an MMO-style step list');
assert.match(html,/class="quest-tracker starter-journey/,'Objective HUD uses the side quest-tracker shell');
assert.match(css,/\.starter-journey,\.quest-tracker\{[^}]*left:var\(--safe-left\)/,'Quest tracker docks on the left rail instead of mid-screen');
assert.match(css,/\.starter-journey,\.quest-tracker\{[^}]*top:calc\(var\(--safe-top\) \+ var\(--touch-min\) \+ 20px\)/,'Quest tracker sits below the top HP menu');
assert.match(css,/width:min\(156px,24vw\)/,'Quest tracker stays a compact left chip');
assert.match(css,/\.quest-step\.todo\{display:none\}/,'Upcoming quest steps stay collapsed so the chip does not cover the playfield');
assert.doesNotMatch(css,/\.starter-journey\{[^}]*left:50%;transform:translateX\(-50%\)/,'Old centered objective banner must stay removed');
assert.match(js,/stageObjectiveTracker\(objective,\{stageId:zoneId,stageName,monsterName\}\)/,'Live HUD uses the shared tracker view model');
assert.match(js,/function ensureProgressionEncounter\([\s\S]*?objective=currentStageObjective\(zone\);\s*runBestEffortCombatPresentation\(\(\)=>renderStarterJourney\(\)\);\s*if\(!cfg\|\|!objective\.encounter\)/,'Objective HUD refreshes best-effort when the Boss clear transitions to a completed stage');
assert.match(js,/const step=zoneId==='grass-meadow'\?'2\/3':'1\/2'/,'Later stages start their visible objective count at Elite 1/2 instead of Grass 2/3');
assert.match(js,/if\(objective\.encounter!=='elite'&&cfg\.rareSpawn\?\.length&&Math\.random\(\)<cfg\.rareChance\)/,'Required Elite encounter suppresses a competing random Rare spawn');
assert.match(js,/function ensureProgressionEncounter\(/,'Runtime can spawn the required progression encounter immediately');
assert.match(js,/finishCaptureSuccess[\s\S]*?ensureProgressionEncounter\(state\.currentZone\)/,'Starter capture advances the encounter without requiring a zone reload');
assert.match(js,/finishCaptureSuccess[\s\S]*?const replacesProgressionElite=[\s\S]*?if\(!replacesProgressionElite\)respawnWild\(w,wildRespawnDelay\(w\)\);[\s\S]*?ensureProgressionEncounter\(state\.currentZone\)/,'Capturing the required Elite replaces it once without scheduling a duplicate Elite');
assert.match(js,/defeatWild[\s\S]*?retireWild\(w\);\s*ensureProgressionEncounter\(w\.zone\)/,'Elite defeat advances to the Boss in the same zone visit');
assert.match(js,/function completeStageClear\(stageId,\{recovered=false\}=\{\}\)\{[\s\S]*?state\.stageProgress=next;[\s\S]*?runBestEffortCombatPresentation\(\(\)=>\{renderStageSelect\(\);renderStageReward/,'Boss clear refreshes stage navigation and rewards best-effort after progression commits');
assert.doesNotMatch(js,/renderWarpPrompt\(/,'Removed warp confirmation flow must not block stage reward rendering');
assert.match(js,/function reconcilePendingStageClear\(zone,objective\)[\s\S]*?completeStageClear:stageId=>completeStageClear\(stageId,\{recovered:true\}\)[\s\S]*?currentStageObjective\(zone\)/,'Interrupted Boss saves are reconciled through the canonical stage-clear path without a fake run time');
assert.match(js,/function spawnZone\(zone\)[\s\S]*?objective=reconcilePendingStageClear\(zone,objective\)/,'Zone load reconciles pending Boss clear before choosing progression spawns');
assert.match(js,/if\(w\.boss\)markBossProgress\(w,'defeated',false\)/,'Boss defeat does not persist a half-completed state before stage clear is recorded');
assert.match(js,/function completeStageClear\(stageId,\{recovered=false\}=\{\}\)[\s\S]*?const elapsed=!recovered&&stageRunStartedAt\?/,'Recovered clears do not record an artificial one-second best time');
assert.match(js,/function reloadWorldFromLoadedState\(\)[\s\S]*?switchZone\(loadedZone,true\)\|\|switchZone\('hub',true\)/,'Loaded state rebuilds the scene through the normal zone path');
assert.match(js,/async function syncCloudSave\(\)[\s\S]*?migrateLoadedState\(remote\.state\)[\s\S]*?reloadWorldFromLoadedState\(\)/,'Cloud saves also execute pending stage-clear reconciliation');
assert.match(js,/function saveGame\(show=true\)[\s\S]*?else if\(remoteSaveSyncing\)remoteSavePending=true;/,'Local saves made during initial Cloud sync are queued for writeback');
assert.match(js,/async function flushRemoteSaveUntilSettled\(\)[\s\S]*?do\{[\s\S]*?remoteSavePending=false;[\s\S]*?await savePrimaryRemoteSave\(currentSaveEnvelope\(\)\);[\s\S]*?\}while\(remoteSavePending\);[\s\S]*?remoteSaveReady=true;[\s\S]*?remoteSaveSyncing=false;/,'Cloud sync flushes every intervening local save before becoming ready');
assert.match(js,/async function syncCloudSave\(\)[\s\S]*?remoteSaveSyncing=true;[\s\S]*?reloadWorldFromLoadedState\(\)[\s\S]*?await flushRemoteSaveUntilSettled\(\)/,'Recovered Cloud progress is durably flushed before sync completes');

console.log('V8 deterministic stage objectives: PASS');
