import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BOSS_CHALLENGE_POLICY,
  acceptBossChallenge,
  bossCombatAuthorized,
  bossPromptAvailable,
  bossTargetable,
  createBossChallengeSession,
  declineBossChallenge,
  rearmBossChallenge,
  retreatBossChallenge,
} from '../boss-challenge.mjs';

function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,`${name} must exist`);
  const open=source.indexOf('{',source.indexOf(')',start)+1);let depth=0;
  for(let index=open;index<source.length;index++){
    if(source[index]==='{')depth++;
    if(source[index]==='}')depth--;
    if(depth===0)return source.slice(start,index+1);
  }
  assert.fail(`${name} must have a complete body`);
}

const fresh=createBossChallengeSession();
assert.deepEqual(fresh,{activeBossId:null,dismissedBossId:null});
assert.equal(Object.isFrozen(fresh),true,'challenge session is immutable');
assert.deepEqual(BOSS_CHALLENGE_POLICY,{promptRadiusM:6,rearmRadiusM:8});
assert.equal(bossTargetable({id:'wild',boss:false},fresh),true,'normal monsters remain targetable');
assert.equal(bossTargetable({id:'boss-1',boss:true},fresh),false,'Boss is dormant before consent');
assert.equal(bossPromptAvailable({session:fresh,bossId:'boss-1',alive:true,distanceM:6}),true,'exact prompt edge is accepted');
assert.equal(bossPromptAvailable({session:fresh,bossId:'boss-1',alive:true,distanceM:6.001}),false,'outside prompt edge stays quiet');

const declined=declineBossChallenge(fresh,'boss-1');
assert.equal(bossPromptAvailable({session:declined,bossId:'boss-1',alive:true,distanceM:2}),false,'decline is respected while nearby');
assert.equal(rearmBossChallenge(declined,'boss-1',7.999),declined,'declined prompt does not nag before leaving');
assert.deepEqual(rearmBossChallenge(declined,'boss-1',8),fresh,'walking away rearms a later voluntary challenge');

const active=acceptBossChallenge(fresh,'boss-1');
assert.equal(bossCombatAuthorized(active,'boss-1'),true);
assert.equal(bossCombatAuthorized(active,'boss-2'),false,'consent is scoped to one exact Boss');
assert.equal(bossTargetable({id:'boss-1',boss:true},active),true);
assert.equal(bossPromptAvailable({session:active,bossId:'boss-1',alive:true,distanceM:1}),false,'active fight does not reopen prompt');
assert.deepEqual(retreatBossChallenge(active,'boss-1'),declined,'exit ends combat and dismisses immediate re-prompt');

const game=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const versionedHtml=fs.readFileSync(new URL('../v900.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../style-v800.css',import.meta.url),'utf8');
const spawnZone=game.match(/function spawnZone\(zone\)\{[\s\S]*?\n\}/)?.[0]??'';
const exitBossChallengeSource=functionSource(game,'exitBossChallenge');
const abortCaptureSource=functionSource(game,'abortCaptureSequence');
const closeBossSource=functionSource(game,'closeBossChallengeUi');
const finishBossSource=functionSource(game,'finishBossChallenge');
assert.ok(spawnZone.indexOf('spawnRecords(cfg.spawn)')>=0,'normal spawn table remains active during Boss phase');
assert.ok(spawnZone.indexOf('spawnRecords(cfg.spawn)')<spawnZone.indexOf("if(objective.encounter==='boss'){ensureProgressionEncounter(zone);return;}"),'normal monsters spawn before optional Boss');
assert.match(game,/function canCombatTargetWild\(w\)\{return bossTargetable\(w,bossChallengeSession\);\}/);
assert.match(game,/function wildDamageTargetAvailable\([\s\S]*?return canCombatTargetWild\(w\);/,'central damage boundary blocks dormant Boss before engagement');
assert.match(game,/function damageWild\([\s\S]*?!wildDamageTargetAvailable\(w\)[\s\S]*?ensureCaptureReferenceLevel\(w\);w\.engaged=true;/);
assert.match(game,/targetable:isWildDamageReady\(wild\)/,'manual skills cannot acquire dormant or otherwise non-damageable Boss targets');
assert.match(game,/target\.targetable=\(wild\?\.capturing===undefined\|\|wild\.capturing===false\)&&isWildDamageReady\(wild\);\s*if\(wild\?\.combatEnabled===false\)target\.targetable=false/,'Basic AI cannot acquire dormant or otherwise non-damageable Boss targets');
assert.match(game,/target\.combatEnabled===false/,'Basic AI rechecks Boss consent before applying an action');
assert.match(game,/candidate\.targetValid=!!w\?\.mesh\?\.position&&canCombatTargetWild\(w\)/,'Boss cannot proximity-aggro before consent');
assert.match(game,/w\.dead\|\|w\.capturing\|\|!canCombatTargetWild\(w\)\|\|distXZ/,'hazard fields skip dormant Boss');
assert.match(game,/candidate\.dead\|\|candidate\.capturing\|\|!canCombatTargetWild\(candidate\)/,'summoned swarms skip dormant Boss');
assert.match(game,/function startBossChallenge\([\s\S]*?acceptBossChallenge[\s\S]*?boss\.combatEnabled=true;boss\.engaged=true[\s\S]*?playBGM\('boss'\)/,'enter button explicitly authorizes combat');
assert.match(exitBossChallengeSource,/resetCause=reason==='player'\?'boss_challenge_exit'[\s\S]*?retreatBossChallenge[\s\S]*?resetWild\(boss,resetCause\)[\s\S]*?clearBossChallengeCombatEffects\(\);discardBattleEventsForTarget\(boss\.id\)/,'exit preserves the exact reset cause and clears only the Boss encounter contribution without progression mutation');
assert.match(exitBossChallengeSource,/resetActiveBossChallengeStatus\(\)/,'exit cleans the owned monster encounter status');
assert.ok(closeBossSource.indexOf('bossChallengeSession=createBossChallengeSession()')
  < closeBossSource.indexOf('runBestEffortCombatPresentation('),
'Boss session closes before fallible UI presentation');
assert.match(finishBossSource,/runBestEffortCombatPresentation\(\(\)=>playBGM\(state\.currentZone\)\)/,
  'Boss victory BGM is best-effort after session closure');
assert.ok(exitBossChallengeSource.indexOf('abortCaptureSequence(boss)')
  < exitBossChallengeSource.indexOf('retreatBossChallenge('),
'Boss exit cancels an in-flight capture before resetting encounter state');
assert.match(game,/shouldResetEncounter\(resetRequest\)[\s\S]*?exitBossChallenge\(resetCause\)/,'Boss boundary exit preserves its exact cause without forced pursuit');
assert.match(game,/updateWalkThroughWarp\(dt\);[\s\S]*?updateBossChallengePrompt\(\);/,'Boss prompt remains live alongside walk-through portal updates');
assert.match(game,/เลือกเข้าสู้เมื่อพร้อม/,'objective text communicates optional timing');
assert.match(html,/id="bossChallengeAccept"[\s\S]*?>เข้าสู้</);
assert.match(html,/id="bossChallengeDecline"[\s\S]*?>ออก \/ ยังไม่สู้</);
assert.match(html,/id="bossRetreatBtn"[\s\S]*?>ออกจากไฟต์ BOSS</);
assert.equal(versionedHtml,html,'active and declared V9 HTML entries expose identical Boss choices');
assert.match(css,/\.boss-challenge-actions button,\.boss-retreat-btn\{min-height:var\(--touch-min\)/,'Boss choices meet touch target policy');

function runAbortProbe({sequence=false,mismatch=false}={}){
  const boss={id:'boss-1',dead:false,capturing:true,mesh:{visible:!sequence}};
  const capturedWild=mismatch?{id:'normal-1',dead:false,capturing:true,mesh:{visible:true}}:boss;
  const projectileMesh={id:'projectile'},ballMesh={id:'ball'};
  const projectiles=sequence?[]:[{type:'capture',mesh:projectileMesh}];
  const cancelled=[],removed=[];
  const abort=Function(
    'captureSequence','activeCaptureAttempt','cancelCaptureAttempt','captureAttemptLedger',
    'removeAndDispose','scene','projectiles',
    `'use strict';${abortCaptureSource};return abortCaptureSequence;`,
  )(
    sequence?{attemptId:'attempt-1',wild:capturedWild,ballMesh}:null,
    {attemptId:'attempt-1',wild:capturedWild},
    (_ledger,id)=>cancelled.push(id),{},
    (_scene,mesh)=>removed.push(mesh.id),{},projectiles,
  );
  const result=abort(boss);
  return{result,boss,capturedWild,projectiles,cancelled,removed};
}

const projectileAbort=runAbortProbe();
assert.equal(projectileAbort.result,true);
assert.deepEqual(projectileAbort.cancelled,['attempt-1']);
assert.deepEqual(projectileAbort.removed,['projectile']);
assert.equal(projectileAbort.projectiles.length,0,'cancelled projectile cannot deliver a later capture callback');
assert.equal(projectileAbort.boss.capturing,false);
assert.equal(projectileAbort.boss.mesh.visible,true);

const sequenceAbort=runAbortProbe({sequence:true});
assert.equal(sequenceAbort.result,true);
assert.deepEqual(sequenceAbort.cancelled,['attempt-1']);
assert.deepEqual(sequenceAbort.removed,['ball']);
assert.equal(sequenceAbort.boss.capturing,false);
assert.equal(sequenceAbort.boss.mesh.visible,true,'hidden Boss is restored when shake/tension is cancelled');

const mismatchAbort=runAbortProbe({mismatch:true});
assert.equal(mismatchAbort.result,false,'Boss exit does not cancel a different Wild capture');
assert.deepEqual(mismatchAbort.cancelled,[]);
assert.equal(mismatchAbort.projectiles.length,1);
assert.equal(mismatchAbort.capturedWild.capturing,true);

function assertBossLethalPresentationIsolation(){
  const bestEffortSource=functionSource(game,'runBestEffortCombatPresentation');
  const getTierSource=functionSource(game,'getEnemyTier');
  const defeatSource=functionSource(game,'defeatWild');
  const finalizeSource=functionSource(game,'finalizePendingWildDefeat');
  const damageSource=functionSource(game,'damageWild');
  const calls=[];
  const state={currentZone:'boss-zone',exp:0,party:[],bossProgress:{found:{},defeated:{}}};
  const vector=(x=0,y=0,z=0)=>({x,y,z,clone(){return vector(this.x,this.y,this.z);},add(other){this.x+=other.x;this.y+=other.y;this.z+=other.z;return this;}});
  const boss={
    id:'boss-lethal',speciesId:'boss-species',canonicalFormId:'boss-form',boss:true,elite:false,rare:false,
    zone:'boss-zone',level:5,hp:1,maxHp:10,dead:false,retired:false,engaged:true,
    statusState:{currentTimeSec:3,ended:false},mesh:{position:vector(),scale:{multiplyScalar(){} }},
  };
  const api=Function(
    'boss','state','calls','bossCombatAuthorized','createBossChallengeSession','el','playBGM',
    'endEncounterEffects','markStarterJourney','markEliteProgress','markBossProgress','removeAndDispose','scene',
    'removeWildLabel','playerExpReward','monsterStatCatalogEntry','getInst','consumeBattleEventsForTarget',
    'discardBattleEventsForTarget','STAGE_BY_ID','wildDisplayName','msg','renderAll','saveGame','ZONES',
    'respawnWild','wildRespawnDelay','retireWild','ensureProgressionEncounter','wildDamageTargetAvailable',
    'ensureCaptureReferenceLevel','wildTypes','triggerMonsterAction','spawnElementalFX','THREE','spawnDamageNumber',
    'hitFlashGroup','triggerCameraShake','playSFX','setTimeout','spawnRingPulse',
    `'use strict';let bossChallengeSession={activeBossId:boss.id,dismissedBossId:null},nearbyBossChallengeId=boss.id;${bestEffortSource}${closeBossSource}${finishBossSource}${getTierSource}${defeatSource}${finalizeSource}${damageSource};return{run:()=>damageWild(boss,3,{type:'Fire',eff:1}),snapshot:()=>({bossChallengeSession,nearbyBossChallengeId})};`,
  )(
    boss,state,calls,bossCombatAuthorized,createBossChallengeSession,
    ()=>({classList:{add(){calls.push('ui');}}}),
    ()=>{calls.push('bgm-throw');throw new Error('boss-bgm-presentation-failure');},
    status=>({...status,ended:true}),()=>{},()=>{},actor=>{calls.push('boss-progress');state.bossProgress.defeated[`${actor.zone}:${actor.speciesId}`]={count:1};},
    ()=>{calls.push('remove-mesh');},{},()=>{},()=>7,()=>({baseExpYield:1}),()=>null,
    ()=>[],()=>{}, {},()=> 'Boss',()=>{},()=>{},()=>{}, {'boss-zone':{progressionBossSpeciesId:'boss-species'}},
    ()=>{calls.push('respawn');},()=>1000,actor=>{actor.retired=true;calls.push('retire');},()=>{calls.push('ensure');},
    ()=>true,()=>{},()=>['Fire'],()=>{},()=>{},
    {Vector3:class{constructor(x,y,z){this.x=x;this.y=y;this.z=z;}}},()=>{},()=>{},()=>{},()=>{},()=>0,()=>{},
  );
  assert.doesNotThrow(()=>assert.equal(api.run(),true));
  assert.equal(boss.hp,0);
  assert.equal(boss.dead,true,'Boss lethal HP is finalized despite BGM failure');
  assert.equal(boss.retired,true);
  assert.equal(state.exp,7);
  assert.deepEqual(api.snapshot().bossChallengeSession,createBossChallengeSession());
  assert.equal(api.snapshot().nearbyBossChallengeId,null);
  for(const expected of ['bgm-throw','boss-progress','remove-mesh','retire','ensure'])assert.ok(calls.includes(expected));
  assert.equal(calls.includes('respawn'),false,'a defeated progression Boss cannot schedule a direct respawn');
}

assertBossLethalPresentationIsolation();

console.log('V8.4 optional Boss encounter: PASS (normal monsters persist; enter/exit are voluntary)');
