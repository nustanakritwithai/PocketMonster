import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertSkillEffectClosure } from './v82-skill-effect-e5.mjs';
import { assertE5LiveWiring } from './v82-skill-effect-e5-live-wiring.mjs';

const runtimeSource = fs.readFileSync(new URL('../skill-effect-runtime.mjs', import.meta.url), 'utf8');
const gameSource = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const packageSource = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8');

async function loadRuntime(source, label) {
  const absolute = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64')}`);
}

const currentRuntime = await loadRuntime(runtimeSource, 'skill-effect-e5-current');
assertSkillEffectClosure(currentRuntime, { gameSource, packageJson: packageSource });
assertE5LiveWiring(gameSource);

const runtimeMutations = [
  ['drop E5 coverage', "['summon', 'heal_modifier'].includes(component.kind)", "['unknown'].includes(component.kind)"],
  ['change life-steal ratio', 'lifeStealDamageRatio: 0.3,', 'lifeStealDamageRatio: 1,'],
  ['change summon count', 'summonCount: 3,', 'summonCount: 1,'],
  ['change summon duration', 'summonDurationSec: 6,', 'summonDurationSec: 3,'],
  ['change summon cadence', 'summonTickIntervalSec: 1.5,', 'summonTickIntervalSec: 3,'],
  ['change summon damage ratio', 'summonTickDamageRatio: 0.15,', 'summonTickDamageRatio: 1,'],
  ['hide closure fallback provenance', "magnitudeSource: 'runtime_fallback_workbook_mechanic_without_heal_or_summon_magnitude',", "magnitudeSource: 'workbook_exact',"],
  ['heal from overkill damage', 'Math.min(result.damage, targets[index].hp)', 'result.damage'],
  ['remove max-HP heal cap', 'Math.min(attacker.maxHp - attacker.hp, requestedHealing)', 'requestedHealing'],
  ['invert closure chance boundary', 'draw.roll < effectChancePct / 100', 'draw.roll <= effectChancePct / 100'],
  ['roll closure chance on zero damage', 'if (damageBasis > 0) chance = resolveEffectChance', 'if (true) chance = resolveEffectChance'],
  ['skip E5 generic resolution', 'if (E5_READY_SKILLS.has(skillId)) {\n    e5 = resolveE5SkillEffects', 'if (false) {\n    e5 = resolveE5SkillEffects'],
  ['leave residual components deferred', "|| (E5_READY_SKILLS.has(skillId) && ['summon', 'heal_modifier'].includes(component.kind));", '|| false;'],
  ['drop heal-modifier receipt', 'healModifierResult: e5?.healModifierResult ?? null,', 'healModifierResult: null,'],
  ['drop summon receipt', 'summonResult: e5?.summonResult ?? null,', 'summonResult: null,'],
];

for (const [name, from, to] of runtimeMutations) {
  const mutant = runtimeSource.replace(from, to);
  assert.notEqual(mutant, runtimeSource, `${name} mutation must apply`);
  await assert.rejects(async () => assertSkillEffectClosure(
    await loadRuntime(mutant, `skill-effect-e5-mutant-${name}`),
    { gameSource, packageJson: packageSource },
  ), undefined, `${name} must be killed`);
}

const liveMutations = [
  ['let the first accepted skill presentation hook block gameplay',
    'runBestEffortCombatPresentation(()=>playSFX(`sfx_skill_${move.type.toLowerCase()}`));',
    'playSFX(`sfx_skill_${move.type.toLowerCase()}`);'],
  ['drop closure application', 'applyPlannedClosureEffects(a,move,planned.healModifierResult,planned.summonResult,actualTotalDamage,effectRequest.attacker,effectRequest.nowSec,contributionEvents)', '0'],
  ['duplicate cooldown', 'a.skillCds[index]=command.startCooldownSec;', 'a.skillCds[index]=command.startCooldownSec;\n  a.skillCds[index]=command.startCooldownSec;'],
  ['apply damage-derived closure after zero live damage', 'if(!(committedDamage>0))return appliedCount;', 'if(false)return appliedCount;'],
  ['heal from planned instead of committed damage', 'committedDamage*healModifierResult.healRatio', 'healModifierResult.healing'],
  ['drop life-steal HP commit', 'a.inst.hp+=healing;', 'void healing;'],
  ['drop summon activation', 'activateSkillSwarm(a,move,summonResult,attackerSnapshot,attackerNowSec);', 'void summonResult;'],
  ['report planned target totals', 'hitCount:actualHitCount,totalDamage:actualTotalDamage,statusAppliedCount:actualStatusAppliedCount', 'hitCount:planned.hitCount,totalDamage:planned.totalDamage,statusAppliedCount:planned.statusAppliedCount'],
  ['skip committed HP receipt reconciliation after a post-commit damage failure', 'if(!damageReceipt.committed||targetDamageCommitted[targetIndex]===true)continue;', 'if(true)continue;'],
  ['field damage skips settlement after a post-commit damage failure', "finally{if(commitReceipt.committed){try{logBattleEvent('power',commitReceipt.damage,true,w.id,ownerId);}", "finally{if(false){try{logBattleEvent('power',commitReceipt.damage,true,w.id,ownerId);}"],
  ['bank contribution without target scope', "&&typeof targetId==='string'&&targetId&&typeof sourceInstanceId==='string'&&sourceInstanceId", "&&typeof sourceInstanceId==='string'&&sourceInstanceId"],
  ['bank contribution without contributor scope', "&&typeof sourceInstanceId==='string'&&sourceInstanceId)battleEventLog.push", ")battleEventLog.push"],
  ['consume another contributor ledger', 'battleEventTargetId(event)===targetId&&battleEventSourceInstanceId(event)===sourceId', 'battleEventTargetId(event)===targetId'],
  ['clone full technique budget to every area target', 'const techniqueShare=Math.max(0,techniqueBudget)/committedCount;', 'const techniqueShare=Math.max(0,techniqueBudget);'],
  ['clone actor and closure contribution to every area target', 'event.amount/committedCount', 'event.amount'],
  ['fallback missing attributed owner', "const ownerId=typeof sourceInstanceId==='string'&&sourceInstanceId?sourceInstanceId:null;", "const ownerId=typeof sourceInstanceId==='string'&&sourceInstanceId?sourceInstanceId:'fallback-owner';"],
  ['grant bond after rejected target damage', 'if(!requiresTargetDamage||planned.hitCount===0||actualHitCount>0)a.inst.bond=', 'if(true)a.inst.bond='],
  ['block accepted canonical miss bond', 'if(!requiresTargetDamage||planned.hitCount===0||actualHitCount>0)a.inst.bond=', 'if(!requiresTargetDamage||actualHitCount>0)a.inst.bond='],
  ['grant mastery after rejected target damage or canonical miss', 'if(!requiresTargetDamage||actualHitCount>0)awardAcceptedSkillMastery', 'if(true)awardAcceptedSkillMastery'],
  ['drop cast-time swarm attacker', 'nextTickSec:summonResult.tickIntervalSec,\n    attacker:attackerSnapshot,', 'nextTickSec:summonResult.tickIntervalSec,\n    attacker:null,'],
  ['clone wild array per swarm tick', 'for(let wildIndex=0;wildIndex<wilds.length;wildIndex++){\n        const candidate=wilds[wildIndex];', 'for(const candidate of [...wilds]){'],
  ['target outside summon radius', 'distance>swarm.radiusM||distance>nearestDistance', 'distance>nearestDistance'],
  ['remove deterministic target tie-break', 'if(distance===nearestDistance&&target&&stableCombatIdCompare(candidate.id,target.id)>=0)continue;', 'if(false)continue;'],
  ['restore locale-sensitive swarm tie-break', 'stableCombatIdCompare(candidate.id,target.id)', 'candidate.id.localeCompare(target.id)'],
  ['bypass canonical summon damage', 'const resolved=resolveWorkbookDirectDamage({skillId:swarm.skillId', 'const resolved=mutantDamage({skillId:swarm.skillId'],
  ['drop summon damage ratio', 'Math.round(resolved.damage*swarm.tickDamageRatio)', 'Math.round(resolved.damage)'],
  ['stop summon cadence', 'swarm.nextTickSec+=swarm.tickIntervalSec;', 'swarm.nextTickSec=Infinity;'],
  ['consume Uses on summon tick', 'const damage=Math.max(1,Math.round(resolved.damage*swarm.tickDamageRatio));', 'consumeSkillUse();const damage=Math.max(1,Math.round(resolved.damage*swarm.tickDamageRatio));'],
  ['keep swarm across zone change', '  clearSkillSwarms();\n  closeStageSelect();', '  void liveSkillSwarms;\n  closeStageSelect();'],
  ['keep swarm after recall', '  clearSkillSwarms();\n  discardBattleEventsForSource(inst.instanceId);', '  void liveSkillSwarms;\n  discardBattleEventsForSource(inst.instanceId);'],
  ['recall keeps old contributor ledger', "  discardBattleEventsForSource(inst.instanceId);\n  try{cancelOwnedAIAction(summon,'owned_recall');}catch{}", "  void inst.instanceId;\n  try{cancelOwnedAIAction(summon,'owned_recall');}catch{}"],
  ['keep swarm after faint', 'clearSkillSwarms();discardBattleEventsForSource(inst.instanceId);', 'void liveSkillSwarms;discardBattleEventsForSource(inst.instanceId);'],
  ['faint keeps old contributor ledger', 'clearSkillSwarms();discardBattleEventsForSource(inst.instanceId);', 'clearSkillSwarms();void inst.instanceId;'],
  ['field kill omits cast owner', '},field.attacker?.id??null);', '},null);'],
  ['swarm kill omits cast owner', '},swarm.attacker?.id??null);', '},null);'],
  ['defeat falls back to active summon owner', 'rewardInst=rewardOwnerId?getInst(rewardOwnerId):null', 'rewardInst=rewardOwnerId?getInst(rewardOwnerId):activeSummon?.inst??null'],
  ['capture start erases resumable encounter ledger', 'else{t.captureEngagementResumePending=t.engaged===true;t.capturing=true;}', 'else{t.captureEngagementResumePending=t.engaged===true;discardBattleEventsForTarget(t.id);t.capturing=true;}'],
  ['capture failure erases resumed encounter ledger', 'const w=cs.wild;if(w)try{w.capturing=false;}catch{}', 'const w=cs.wild;if(w){discardBattleEventsForTarget(w.id);try{w.capturing=false;}catch{}}'],
  ['stop live swarm loop', 'updateSkillSwarms(dt);', 'void dt;'],
];

for (const [name, from, to] of liveMutations) {
  const mutant = gameSource.replace(from, to);
  assert.notEqual(mutant, gameSource, `${name} live mutation must apply`);
  assert.throws(() => assertE5LiveWiring(mutant), undefined, `${name} live mutation must be killed`);
}

const packageMutations = [
  ['remove E5 script body', 'node tests/v82-skill-effect-e5.mjs', 'node tests/v82-skill-effect-e4.mjs'],
  ['remove E5 from Full CI', ' && npm run test:v82:skill-effects:e5', ''],
];
for (const [name, from, to] of packageMutations) {
  const mutant = packageSource.replace(from, to);
  assert.notEqual(mutant, packageSource, `${name} package mutation must apply`);
  assert.throws(() => assertSkillEffectClosure(currentRuntime, { gameSource, packageJson: mutant }), undefined, `${name} must be killed`);
}

console.log(`V8.2 E5 skill effect closure mutants: PASS (${runtimeMutations.length + liveMutations.length + packageMutations.length}/${runtimeMutations.length + liveMutations.length + packageMutations.length} killed)`);
