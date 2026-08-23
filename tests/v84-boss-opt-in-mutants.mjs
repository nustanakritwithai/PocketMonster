import assert from 'node:assert/strict';
import fs from 'node:fs';

const moduleSource=fs.readFileSync(new URL('../boss-challenge.mjs',import.meta.url),'utf8');
const gameSource=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
const htmlSource=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const versionedHtmlSource=fs.readFileSync(new URL('../v800.html',import.meta.url),'utf8');

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
  assert.ok(spawnZone.indexOf('spawnRecords(cfg.spawn)')>=0);
  assert.ok(spawnZone.indexOf('spawnRecords(cfg.spawn)')<spawnZone.indexOf("if(objective.encounter==='boss'){ensureProgressionEncounter(zone);return;}"));
  assert.match(game,/w\.engaged=true;if\(!canCombatTargetWild\(w\)\)\{w\.engaged=false;return false;\}/);
  assert.match(game,/targetable:!wild\.capturing&&canCombatTargetWild\(wild\)/);
  assert.match(game,/target\.targetable=wild\?\.capturing===undefined\|\|wild\.capturing===false;\s*if\(wild\?\.combatEnabled===false\)target\.targetable=false/);
  assert.match(game,/target\.combatEnabled===false/);
  assert.match(game,/candidate\.targetValid=!!w\?\.mesh\?\.position&&canCombatTargetWild\(w\)/);
  assert.match(game,/w\.dead\|\|w\.capturing\|\|!canCombatTargetWild\(w\)\|\|distXZ/);
  assert.match(game,/candidate\.dead\|\|candidate\.capturing\|\|!canCombatTargetWild\(candidate\)/);
  assert.match(exitBossChallengeSource,/retreatBossChallenge\(bossChallengeSession,boss\.id\);\s*resetWild\(boss\);/);
  assert.match(exitBossChallengeSource,/clearBossChallengeCombatEffects\(\);battleEventLog\.length=0;/);
  assert.match(exitBossChallengeSource,/resetActiveBossChallengeStatus\(\)/);
  assert.match(game,/exitBossChallenge\('leash'\)/);
  assert.match(game,/updateBossChallengePrompt\(\);/);
  assert.match(html,/id="bossChallengeAccept"/);
  assert.match(html,/id="bossChallengeDecline"/);
  assert.match(html,/id="bossRetreatBtn"/);
}

await assertPolicy(moduleSource);
assertRuntime(gameSource);
assert.equal(versionedHtmlSource,htmlSource,'active HTML entries remain identical');

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
  ['allow direct dormant damage',gameSource.replace('if(!canCombatTargetWild(w)){w.engaged=false;return false;}','')],
  ['allow manual targeting',gameSource.replace('targetable:!wild.capturing&&canCombatTargetWild(wild)','targetable:!wild.capturing')],
  ['allow Basic AI targeting',gameSource.replace('    if(wild?.combatEnabled===false)target.targetable=false;','')],
  ['allow stale Basic AI action',gameSource.replace('||target.combatEnabled===false','||false')],
  ['restore proximity aggro',gameSource.replace('candidate.targetValid=!!w?.mesh?.position&&canCombatTargetWild(w);','candidate.targetValid=!!w?.mesh?.position;')],
  ['let hazards hit dormant Boss',gameSource.replace('w.dead||w.capturing||!canCombatTargetWild(w)||distXZ','w.dead||w.capturing||distXZ')],
  ['let swarms hit dormant Boss',gameSource.replace('candidate.dead||candidate.capturing||!canCombatTargetWild(candidate)||','candidate.dead||candidate.capturing||')],
  ['exit without Boss reset',gameSource.replace('  resetWild(boss);','  void boss;')],
  ['exit leaves encounter effects',gameSource.replace('  clearBossChallengeCombatEffects();battleEventLog.length=0;','  void battleEventLog;')],
  ['exit leaves owned statuses',gameSource.replace('    resetActiveBossChallengeStatus();','')],
  ['remove leash exit',gameSource.replace("exitBossChallenge('leash');return;","resetWild(w);return;")],
  ['remove live prompt update',gameSource.replace('    updateBossChallengePrompt();','')],
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
