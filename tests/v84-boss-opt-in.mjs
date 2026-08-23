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
const versionedHtml=fs.readFileSync(new URL('../v800.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../style-v800.css',import.meta.url),'utf8');
const spawnZone=game.match(/function spawnZone\(zone\)\{[\s\S]*?\n\}/)?.[0]??'';
const exitBossChallengeSource=functionSource(game,'exitBossChallenge');
assert.ok(spawnZone.indexOf('spawnRecords(cfg.spawn)')>=0,'normal spawn table remains active during Boss phase');
assert.ok(spawnZone.indexOf('spawnRecords(cfg.spawn)')<spawnZone.indexOf("if(objective.encounter==='boss'){ensureProgressionEncounter(zone);return;}"),'normal monsters spawn before optional Boss');
assert.match(game,/function canCombatTargetWild\(w\)\{return bossTargetable\(w,bossChallengeSession\);\}/);
assert.match(game,/function damageWild\([\s\S]*?w\.engaged=true;if\(!canCombatTargetWild\(w\)\)\{w\.engaged=false;return false;\}/,'central damage boundary blocks dormant Boss and rolls back engagement');
assert.match(game,/targetable:!wild\.capturing&&canCombatTargetWild\(wild\)/,'manual skills cannot acquire dormant Boss');
assert.match(game,/target\.targetable=wild\?\.capturing===undefined\|\|wild\.capturing===false;\s*if\(wild\?\.combatEnabled===false\)target\.targetable=false/,'Basic AI cannot acquire dormant Boss');
assert.match(game,/target\.combatEnabled===false/,'Basic AI rechecks Boss consent before applying an action');
assert.match(game,/candidate\.targetValid=!!w\?\.mesh\?\.position&&canCombatTargetWild\(w\)/,'Boss cannot proximity-aggro before consent');
assert.match(game,/w\.dead\|\|w\.capturing\|\|!canCombatTargetWild\(w\)\|\|distXZ/,'hazard fields skip dormant Boss');
assert.match(game,/candidate\.dead\|\|candidate\.capturing\|\|!canCombatTargetWild\(candidate\)/,'summoned swarms skip dormant Boss');
assert.match(game,/function startBossChallenge\([\s\S]*?acceptBossChallenge[\s\S]*?boss\.combatEnabled=true;boss\.engaged=true[\s\S]*?playBGM\('boss'\)/,'enter button explicitly authorizes combat');
assert.match(exitBossChallengeSource,/retreatBossChallenge[\s\S]*?resetWild\(boss\)[\s\S]*?clearBossChallengeCombatEffects\(\);battleEventLog\.length=0/,'exit resets Boss and encounter effects without progression mutation');
assert.match(exitBossChallengeSource,/resetActiveBossChallengeStatus\(\)/,'exit cleans the owned monster encounter status');
assert.match(game,/shouldResetEncounter\(resetRequest\)[\s\S]*?exitBossChallenge\('leash'\)/,'leaving the arena exits without forced pursuit');
assert.match(game,/updateWarpPrompt\(dt\);\s*updateBossChallengePrompt\(\);/,'prompt is live in the frame loop');
assert.match(game,/เลือกเข้าสู้เมื่อพร้อม/,'objective text communicates optional timing');
assert.match(html,/id="bossChallengeAccept"[\s\S]*?>เข้าสู้</);
assert.match(html,/id="bossChallengeDecline"[\s\S]*?>ออก \/ ยังไม่สู้</);
assert.match(html,/id="bossRetreatBtn"[\s\S]*?>ออกจากไฟต์ BOSS</);
assert.equal(versionedHtml,html,'both active HTML entry points expose identical Boss choices');
assert.match(css,/\.boss-challenge-actions button,\.boss-retreat-btn\{min-height:var\(--touch-min\)/,'Boss choices meet touch target policy');

console.log('V8.4 optional Boss encounter: PASS (normal monsters persist; enter/exit are voluntary)');
