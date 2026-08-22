import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createStageProgress, recordStageClear, stageUnlockReason } from '../stage-catalog.mjs';
import { routesFrom, warpAvailability } from '../warp-routes.mjs';

const objectiveModule=await import('../stage-objectives.mjs').catch(()=>({}));
const { resolveStageObjective }=objectiveModule;

assert.equal(typeof resolveStageObjective,'function','Stage progression exposes a deterministic objective resolver');

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

const js=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(html,/id="stageObjective"/,'A persistent player-facing stage objective is present in the HUD');
assert.match(js,/function ensureProgressionEncounter\([\s\S]*?objective=currentStageObjective\(zone\);\s*renderStarterJourney\(\);\s*if\(!cfg\|\|!objective\.encounter\)/,'Objective HUD refreshes when the Boss clear transitions to a completed stage');
assert.match(js,/const step=zoneId==='grass-meadow'\?'2\/3':'1\/2'/,'Later stages start their visible objective count at Elite 1/2 instead of Grass 2/3');
assert.match(js,/if\(objective\.encounter!=='elite'&&cfg\.rareSpawn\?\.length&&Math\.random\(\)<cfg\.rareChance\)/,'Required Elite encounter suppresses a competing random Rare spawn');
assert.match(js,/function ensureProgressionEncounter\(/,'Runtime can spawn the required progression encounter immediately');
assert.match(js,/finishCaptureSuccess[\s\S]*?ensureProgressionEncounter\(state\.currentZone\)/,'Starter capture advances the encounter without requiring a zone reload');
assert.match(js,/finishCaptureSuccess[\s\S]*?const replacesProgressionElite=[\s\S]*?if\(!replacesProgressionElite\)respawnWild\(w,wildRespawnDelay\(w\)\);[\s\S]*?ensureProgressionEncounter\(state\.currentZone\)/,'Capturing the required Elite replaces it once without scheduling a duplicate Elite');
assert.match(js,/defeatWild[\s\S]*?retireWild\(w\);\s*ensureProgressionEncounter\(w\.zone\)/,'Elite defeat advances to the Boss in the same zone visit');
assert.match(js,/function completeStageClear\(stageId\)\{[\s\S]*?state\.stageProgress=next;[\s\S]*?renderWarpPrompt\(\);/,'Boss clear refreshes an already-visible warp prompt immediately');

console.log('V8 deterministic stage objectives: PASS');
