import assert from 'node:assert/strict';
import fs from 'node:fs';

const moduleSource=fs.readFileSync(new URL('../boss-challenge.mjs',import.meta.url),'utf8');
const gameSource=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
const htmlSource=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const versionedHtmlSource=fs.readFileSync(new URL('../v900.html',import.meta.url),'utf8');

async function loadModule(source,label){
  return import(`data:text/javascript;base64,${Buffer.from(`${source}\n//# sourceURL=${label}`).toString('base64')}`);
}

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

async function assertPolicy(source,label='baseline'){
  const m=await loadModule(source,label),fresh=m.createBossChallengeSession();
  assert.equal(m.bossTargetable({id:'wild',boss:false},fresh),true);
  assert.equal(m.bossTargetable({id:'boss',boss:true},fresh),false);
  assert.equal(m.bossPromptAvailable({session:fresh,bossId:'boss',alive:true,distanceM:6}),true);
  assert.equal(m.bossPromptAvailable({session:fresh,bossId:'boss',alive:true,distanceM:6.001}),false);
  const declined=m.declineBossChallenge(fresh,'boss');
  assert.equal(m.bossPromptAvailable({session:declined,bossId:'boss',alive:true,distanceM:1}),false);
  assert.equal(m.rearmBossChallenge(declined,'boss',7.999),declined);
  assert.deepEqual(m.rearmBossChallenge(declined,'boss',8),fresh);
  const active=m.acceptBossChallenge(fresh,'boss');
  assert.equal(m.bossCombatAuthorized(active,'boss'),true);
  assert.equal(m.bossCombatAuthorized(active,'other'),false);
  assert.equal(m.bossTargetable({id:'boss',boss:true},active),true);
  assert.deepEqual(m.retreatBossChallenge(active,'boss'),declined);
}

function assertRuntime(game,html=htmlSource){
  const spawnZone=game.match(/function spawnZone\(zone\)\{[\s\S]*?\n\}/)?.[0]??'';
  const exitBossChallengeSource=functionSource(game,'exitBossChallenge');
  const closeBossChallengeSource=functionSource(game,'closeBossChallengeUi');
  const finishBossChallengeSource=functionSource(game,'finishBossChallenge');
  const defeatWildSource=functionSource(game,'defeatWild');
  assert.ok(spawnZone.indexOf('spawnRecords(cfg.spawn)')>=0);
  assert.ok(spawnZone.indexOf('spawnRecords(cfg.spawn)')<spawnZone.indexOf("if(objective.encounter==='boss'){ensureProgressionEncounter(zone);return;}"));
  assert.match(game,/function wildDamageTargetAvailable\([\s\S]*?return canCombatTargetWild\(w\);/);
  assert.match(game,/function damageWild\([\s\S]*?!wildDamageTargetAvailable\(w\)[\s\S]*?w\.engaged=true/);
  assert.match(game,/targetable:isWildDamageReady\(wild\)/);
  assert.match(game,/target\.targetable=\(wild\?\.capturing===undefined\|\|wild\.capturing===false\)&&isWildDamageReady\(wild\);\s*if\(wild\?\.combatEnabled===false\)target\.targetable=false/);
  assert.match(game,/target\.combatEnabled===false/);
  assert.match(game,/candidate\.targetValid=!!w\?\.mesh\?\.position&&canCombatTargetWild\(w\)/);
  assert.match(game,/w\.dead\|\|w\.capturing\|\|!canCombatTargetWild\(w\)\|\|distXZ/);
  assert.match(game,/candidate\.dead\|\|candidate\.capturing\|\|!canCombatTargetWild\(candidate\)/);
  assert.match(exitBossChallengeSource,/retreatBossChallenge\(bossChallengeSession,boss\.id\);\s*resetWild\(boss,resetCause\);/);
  assert.match(exitBossChallengeSource,/abortCaptureSequence\(boss\);\s*bossChallengeSession=retreatBossChallenge/);
  assert.match(exitBossChallengeSource,/clearBossChallengeCombatEffects\(\);discardBattleEventsForTarget\(boss\.id\);/);
  assert.match(exitBossChallengeSource,/resetActiveBossChallengeStatus\(\)/);
  assert.ok(closeBossChallengeSource.indexOf('bossChallengeSession=createBossChallengeSession()')
    < closeBossChallengeSource.indexOf('runBestEffortCombatPresentation('));
  assert.match(finishBossChallengeSource,/runBestEffortCombatPresentation\(\(\)=>playBGM\(state\.currentZone\)\)/);
  assert.match(defeatWildSource,/progressionBossCleared=Boolean\(w\.boss&&w\.speciesId===progressionBossSpeciesId&&state\.bossProgress\?\.defeated\?\.\[progressionKey\]\)/);
  assert.match(defeatWildSource,/if\(!stageEliteCleared&&!progressionBossCleared\)respawnWild/);
  assert.match(game,/exitBossChallenge\('outside_leash'\)/);
  assert.match(game,/exitBossChallenge\(resetCause\)/);
  assert.match(game,/exitBossChallenge\(decision\.reason\)/);
  assert.match(game,/updateBossChallengePrompt\(\);/);
  assert.match(html,/id="bossChallengeAccept"/);
  assert.match(html,/id="bossChallengeDecline"/);
  assert.match(html,/id="bossRetreatBtn"/);
}

await assertPolicy(moduleSource);
assertRuntime(gameSource);
assert.equal(versionedHtmlSource,htmlSource,'active and declared V9 HTML entries remain identical');

const policyMutants=[
  ['auto-authorize every Boss',"return validBossId(bossId) && session?.activeBossId === bossId;","return validBossId(bossId);"],
  ['make dormant Boss targetable',"if (!wild?.boss) return true;","if (wild?.boss) return true;"],
  ['extend prompt radius','distanceM <= policy.promptRadiusM','distanceM <= policy.promptRadiusM + 1'],
  ['reject exact prompt edge','distanceM <= policy.promptRadiusM','distanceM < policy.promptRadiusM'],
  ['ignore decline',"|| session?.dismissedBossId === bossId",''],
  ['rearm before leaving','distanceM < policy.rearmRadiusM','distanceM < policy.promptRadiusM'],
  ['authorize wrong Boss','session?.activeBossId === bossId','session?.activeBossId !== bossId'],
  ['retreat keeps Boss active',"return Object.freeze({ activeBossId: null, dismissedBossId: bossId });","return Object.freeze({ activeBossId: bossId, dismissedBossId: null });"],
];
let killed=0;
for(const [name,from,to] of policyMutants){
  const mutant=moduleSource.replace(from,to);
  assert.notEqual(mutant,moduleSource,`${name} mutation must apply`);
  await assert.rejects(()=>assertPolicy(mutant,`boss-policy-${name}`),undefined,`${name} must be killed`);
  killed++;
}

const runtimeMutants=[
  ['restore Boss-only map',gameSource.replace("  spawnRecords(cfg.spawn);\n  if(objective.encounter==='boss'){ensureProgressionEncounter(zone);return;}","  if(objective.encounter==='boss'){ensureProgressionEncounter(zone);return;}\n  spawnRecords(cfg.spawn);")],
  ['allow direct dormant damage',gameSource.replace('  return canCombatTargetWild(w);','  return true;')],
  ['allow manual targeting',gameSource.replace('targetable:isWildDamageReady(wild)','targetable:true')],
  ['allow Basic AI targeting',gameSource.replace('    target.targetable=(wild?.capturing===undefined||wild.capturing===false)&&isWildDamageReady(wild);','    target.targetable=true;')],
  ['allow stale Basic AI action',gameSource.replace('||target.combatEnabled===false','||false')],
  ['restore proximity aggro',gameSource.replace('candidate.targetValid=!!w?.mesh?.position&&canCombatTargetWild(w);','candidate.targetValid=!!w?.mesh?.position;')],
  ['let hazards hit dormant Boss',gameSource.replace('w.dead||w.capturing||!canCombatTargetWild(w)||distXZ','w.dead||w.capturing||distXZ')],
  ['let swarms hit dormant Boss',gameSource.replace('candidate.dead||candidate.capturing||!canCombatTargetWild(candidate)||','candidate.dead||candidate.capturing||')],
  ['exit without Boss reset',gameSource.replace('  resetWild(boss,resetCause);','  void boss;')],
  ['collapse Boss boundary reset cause',gameSource
    .replaceAll('exitBossChallenge(resetCause)',"exitBossChallenge('outside_leash')")
    .replaceAll('exitBossChallenge(decision.reason)',"exitBossChallenge('outside_leash')")],
  ['exit leaves Boss capture active',gameSource.replace('  abortCaptureSequence(boss);','  void boss.capturing;')],
  ['exit leaves encounter effects',gameSource.replace('  clearBossChallengeCombatEffects();discardBattleEventsForTarget(boss.id);','  void boss.id;')],
  ['Boss exit clears other encounters globally',gameSource.replace('discardBattleEventsForTarget(boss.id);','battleEventLog.length=0;')],
  ['exit leaves owned statuses',gameSource.replace('    resetActiveBossChallengeStatus();','')],
  ['remove leash exit',gameSource
    .replaceAll("exitBossChallenge('outside_leash')","resetWild(w,'outside_leash')")
    .replaceAll('exitBossChallenge(resetCause)','resetWild(w,resetCause)')
    .replaceAll('exitBossChallenge(decision.reason)','resetWild(w,decision.reason)')],
  ['remove live prompt update',gameSource.replace('    updateBossChallengePrompt();','')],
  ['Boss victory BGM escapes presentation isolation',gameSource.replace(
    'runBestEffortCombatPresentation(()=>playBGM(state.currentZone));',
    'playBGM(state.currentZone);',
  )],
  ['defeated progression Boss schedules direct respawn',gameSource.replace(
    'if(!stageEliteCleared&&!progressionBossCleared)respawnWild',
    'if(!stageEliteCleared)respawnWild',
  )],
];
for(const [name,game] of runtimeMutants){
  assert.notEqual(game,gameSource,`${name} mutation must apply`);
  assert.throws(()=>assertRuntime(game),undefined,`${name} must be killed`);
  killed++;
}
for(const [name,html] of [
  ['remove enter choice',htmlSource.replace('id="bossChallengeAccept"','id="removedBossAccept"')],
  ['remove decline choice',htmlSource.replace('id="bossChallengeDecline"','id="removedBossDecline"')],
  ['remove combat exit',htmlSource.replace('id="bossRetreatBtn"','id="removedBossRetreat"')],
]){
  assert.throws(()=>assertRuntime(gameSource,html),undefined,`${name} must be killed`);killed++;
}

assert.equal(killed,policyMutants.length+runtimeMutants.length+3);
console.log(`V8.4 optional Boss encounter mutants: PASS (${killed}/${killed} killed)`);
