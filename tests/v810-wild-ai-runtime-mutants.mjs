import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertWildAiRuntimeWiring } from './v810-wild-ai-runtime.mjs';

const original = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

function mutate(before, after) {
  assert.ok(original.includes(before), `runtime mutation target drifted: ${before}`);
  return original.replace(before, after);
}

function mutateNth(before, after, occurrence) {
  let from = 0;
  let index = -1;
  for (let count = 0; count < occurrence; count += 1) {
    index = original.indexOf(before, from);
    assert.ok(index >= 0, `runtime mutation occurrence ${occurrence} drifted: ${before}`);
    from = index + before.length;
  }
  return `${original.slice(0, index)}${after}${original.slice(index + before.length)}`;
}

function moveExecutorClaimAfterTelegraph(claim) {
  const withoutClaim = mutate(claim, '');
  const executorStart = withoutClaim.indexOf('function executeWildAiIntent(');
  const executorEnd = withoutClaim.indexOf('function updateProjectiles(', executorStart);
  const clear = 'runBestEffortCombatPresentation(()=>clearWildAiTelegraph(w));';
  const clearIndex = withoutClaim.lastIndexOf(clear, executorEnd);
  assert.ok(executorStart >= 0 && executorEnd > executorStart && clearIndex > executorStart,
    'accepted telegraph clear target drifted');
  const insertAt = clearIndex + clear.length;
  return `${withoutClaim.slice(0, insertAt)}${claim}${withoutClaim.slice(insertAt)}`;
}

const loopEpochGuard = 'zoneGeneration!==wildLoopGeneration||currentWildAiTargetKey()!==wildLoopTargetKey';
const mutants = [
  ['allow duplicate live actor IDs', mutate(
    "const duplicateId=typeof w?.id==='string'&&wildRuntimeActorIdsScratch.has(w.id);",
    'const duplicateId=false;',
  )],
  ['accept unbranded forged AI state', mutate(
    'isCanonicalMonsterAIState(aiState)',
    '!!aiState',
  )],
  ['accept direction missing lifecycle method', mutate(
    "typeof w.dir.clone==='function'&&typeof w.dir.lengthSq==='function'&&typeof w.dir.multiplyScalar==='function'",
    "typeof w.dir.clone==='function'&&typeof w.dir.multiplyScalar==='function'",
  )],
  ['accept mesh missing presentation state', mutate(
    "!!w.mesh.userData&&typeof w.mesh.userData==='object'&&finiteWildVector(w.mesh.userData.baseScale)",
    'true',
  )],
  ['accept position missing mutation method', mutate(
    "typeof w.mesh.position.copy==='function'&&typeof w.mesh.position.clone==='function'&&typeof w.mesh.position.add==='function'",
    "typeof w.mesh.position.copy==='function'&&typeof w.mesh.position.clone==='function'",
  )],
  ['accept scale missing damage method', mutate(
    "typeof w.mesh.scale.set==='function'&&typeof w.mesh.scale.multiplyScalar==='function'",
    "typeof w.mesh.scale.set==='function'",
  )],
  ['accept invalid Wild combat stat', mutate(
    'function finiteNonNegativeWildValue(value){return Number.isFinite(value)&&value>=0;}',
    'function finiteNonNegativeWildValue(){return true;}',
  )],
  ['accept non-finite animation phase', mutate(
    'Number.isFinite(w.mesh.userData.monPhase)',
    'true',
  )],
  ['accept unknown animation action', mutate(
    'knownWildMonsterAction(w.mesh.userData.monAction)',
    'true',
  )],
  ['accept malformed animation timer', mutate(
    'Number.isFinite(w.mesh.userData.monActionTimer)&&w.mesh.userData.monActionTimer>=0',
    'true',
  )],
  ['accept malformed animation duration', mutate(
    'Number.isFinite(w.mesh.userData.monActionDuration)&&w.mesh.userData.monActionDuration>0',
    'true',
  )],
  ['accept animation timer beyond duration', mutate(
    'w.mesh.userData.monActionTimer<=w.mesh.userData.monActionDuration',
    'true',
  )],
  ['accept unknown Wild motion action', mutate(
    'knownWildMotionAction(motion.action)',
    'true',
  )],
  ['allocate combat-stat array during every validation', mutate(
    'finiteNonNegativeWildValue(w.atk)&&finiteNonNegativeWildValue(w.def)&&finiteNonNegativeWildValue(w.spAtk)&&finiteNonNegativeWildValue(w.spDef)&&finiteNonNegativeWildValue(w.spd)',
    '[w.atk,w.def,w.spAtk,w.spDef,w.spd].every(finiteNonNegativeWildValue)',
  )],
  ['debug trace failure prevents invalid actor removal', mutate(
    "try{recordWildAiTrace(w,{fromState:w?.state??null,toState:'fainted',targetId:null,action:'idle',reason:duplicateId?'duplicate_runtime_actor_id':'invalid_runtime_actor',timeSec:w?.statusState?.currentTimeSec??0,rejected:true});}catch{}",
    "recordWildAiTrace(w,{fromState:w?.state??null,toState:'fainted',targetId:null,action:'idle',reason:duplicateId?'duplicate_runtime_actor_id':'invalid_runtime_actor',timeSec:w?.statusState?.currentTimeSec??0,rejected:true});",
  )],
  ['repeat full actor validation during presentation', mutate(
    'if(!wildFrameRuntimeUsable(w,frameRuntime)||w.capturing)return false;',
    'if(!validateWildRuntimeActor(w)||w.capturing)return false;',
  )],
  ['recompute status views during presentation', mutate(
    'const {control,selfModifiers}=frameRuntime;',
    'const control=resolveCombatStatusRuntime(w.statusState),selfModifiers=resolveActiveSelfStatusModifiers(w.statusState);',
  )],
  ['reuse stale frame validation token', mutate(
    'wildRuntimeFrameToken=wildRuntimeFrameToken>=Number.MAX_SAFE_INTEGER?1:wildRuntimeFrameToken+1;',
    'void wildRuntimeFrameToken;',
  )],
  ['ignore root frame validation cache', mutate(
    'frameRuntime??wildFrameRuntimeCache.get(w)??null',
    'frameRuntime??null',
  )],
  ['remove Wild state creation', mutate(
    'aiState=createMonsterAIState({actorId:wildId,encounterId:aiEncounterId});',
    'aiState=null;',
  )],
  ['remove Wild runtime generation', mutate(
    'runtimeGeneration:zoneGeneration,retired:false,lastCommittedAiActionToken:null',
    'runtimeGeneration:0,retired:false,lastCommittedAiActionToken:null',
  )],
  ['remove monotonic Wild action floor', mutate(
    'aiActionSequenceFloor:aiState.nextActionSequence,',
    '',
  )],
  ['fallback reuses action sequence one', mutate(
    'nextActionSequence:floor',
    'nextActionSequence:1',
  )],
  ['commit accepts non-canonical state', mutate(
    'canonical=validateMonsterAIState(nextState)',
    'canonical=nextState',
  )],
  ['corrupt actor remains visible and countable', mutate(
    'quarantineWildAIActor(w);',
    'w.retired=true;',
  )],
  ['quarantined actor remains in the live Wild array', mutate(
    'const index=wilds.indexOf(w);if(index>=0)wilds.splice(index,1);',
    'void wilds;',
  )],
  ['quarantine leaves capture transaction and callback active', mutate(
    'try{abortCaptureSequence(w);}catch{}',
    '',
  )],
  ['quarantine does not request population recovery', mutate(
    'wildPopulationRecoveryPending=true;',
    'wildPopulationRecoveryPending=false;',
  )],
  ['population loop ignores quarantined progression actors', mutate(
    'if(wildPopulationRecoveryPending){wildPopulationRecoveryPending=false;ensureProgressionEncounter(state.currentZone);}',
    'wildPopulationRecoveryPending=false;',
  )],
  ['target cancellation skips actors removed by quarantine', mutate(
    'for(let index=wilds.length-1;index>=0;index--){const w=wilds[index];if(w?.aiState?.targetId===targetId)',
    'for(let index=0;index<wilds.length;index++){const w=wilds[index];if(w?.aiState?.targetId===targetId)',
  )],
  ['reset keeps pending action', mutate(
    'if(!cancelWildAIAction(w,resetReason,{clearEngagement:true,encounterReset:true}))return false;',
    '',
  )],
  ['reset trace omits committed reset marker', mutate(
    '{clearEngagement:true,encounterReset:true}',
    '{clearEngagement:true}',
  )],
  ['collapse engagement-slot reset cause', mutate(
    "if(!assigned)return'engagement_slot_lost';",
    "if(!assigned)return'target_invalid';",
  )],
  ['collapse outside-disengage reset cause', mutate(
    "return'outside_disengage';",
    "return'target_invalid';",
  )],
  ['hide actual target distance after engagement selection', mutate(
    'resetRequest.distanceToTarget=targetAvailable?distXZ(w.mesh.position,target.position):Infinity;',
    'resetRequest.distanceToTarget=targetValid?distXZ(w.mesh.position,target.position):Infinity;',
  )],
  ['reset keeps encounter statuses', mutate(
    'w.statusState=createEncounterStatusState({encounterId:w.id,nowSec:0});',
    'void w.statusState;',
  )],
  ['reset does not restore HP', mutate(
    'w.captureReferenceLevel=null;w.captureEngagementResumePending=false;w.hp=w.maxHp;',
    'w.captureReferenceLevel=null;w.captureEngagementResumePending=false;w.hp=w.hp;',
  )],
  ['reset keeps capture reference', mutate(
    'w.captureReferenceLevel=null;w.captureEngagementResumePending=false;w.hp=w.maxHp;',
    'void w.captureReferenceLevel;w.captureEngagementResumePending=false;w.hp=w.maxHp;',
  )],
  ['reset keeps attack cooldown', mutate(
    'w.resetTimer=0;w.attackCd=0;',
    'w.resetTimer=0;void w.attackCd;',
  )],
  ['reset keeps Boss combat enabled', mutate(
    'if(w.boss)w.combatEnabled=false;',
    'void w.boss;',
  )],
  ['reset does not return home', mutate(
    'w.mesh.position.copy(w.home);',
    'void w.mesh.position;',
  )],
  ['zone clear keeps pending action', mutate(
    "cancelWildAIAction(w,'zone_clear',{retire:true,clearEngagement:true});",
    '',
  )],
  ['retire keeps pending action', mutate(
    "cancelWildAIAction(w,'actor_retired',{retire:true,clearEngagement:true});",
    '',
  )],
  ['capture freezes before cancellation', mutate(
    "if(!cancelWildAIAction(t,'capture_started'))",
    "if(t.capturing=true,!cancelWildAIAction(t,'capture_started'))",
  )],
  ['capture failure ignores cancellation result', mutate(
    "let resumed=false;try{resumed=cancelWildAIAction(w,'capture_failed_resume');}catch{}",
    "let resumed=true;try{cancelWildAIAction(w,'capture_failed_resume');}catch{}",
  )],
  ['capture failure does not restore engagement', mutate(
    'try{w.engaged=true;w.state=w.aiState.state;}catch{}',
    'try{w.engaged=false;w.state=w.aiState.state;}catch{}',
  )],
  ['Boss challenge ignores cancellation failure', mutate(
    "if(!cancelWildAIAction(boss,'boss_challenge_start',{clearEngagement:true})){",
    'if(false){',
  )],
  ['Boss challenge accepts a distant effective target', mutate(
    'if(!Number.isFinite(combatTargetDistance)||combatTargetDistance>ENCOUNTER_POLICY.disengageRadius){',
    'if(false){',
  )],
  ['owned summon reuses stale epoch', mutate(
    'runtimeEpoch:++summonRuntimeEpoch',
    'runtimeEpoch:summonRuntimeEpoch',
  )],
  ['recall leaves Wild target intent alive', mutate(
    "try{cancelWildAITarget(ownedWildAiTargetId(summon),'owned_recall');}catch{}",
    '',
  )],
  ['faint leaves Wild target intent alive', mutate(
    "try{cancelWildAITarget(ownedWildAiTargetId(summon),'owned_fainted');}catch{}",
    '',
  )],
  ['allow target redirect after windup', mutate(
    "if(!wildAiTargetAvailable(target)||target.id!==intent.targetId)return null;",
    'if(!wildAiTargetAvailable(target))return null;',
  )],
  ['allow committed action replay', mutate(
    '||!intent||intent.actorId!==w.id||intent.encounterId!==w.aiEncounterId||intent.actionToken===w.lastCommittedAiActionToken',
    '||!intent||intent.actorId!==w.id||intent.encounterId!==w.aiEncounterId',
  )],
  ['ignore engagement authorization', mutate(
    '||!canEngage||!canCombatTargetWild(w)||currentWildAiTargetKey()!==frameTargetKey',
    '||!canCombatTargetWild(w)||currentWildAiTargetKey()!==frameTargetKey',
  )],
  ['ignore live attack range', mutate(
    'if(!Number.isFinite(distance)||distance>policy.preferredRangeMaxM)return null;',
    'if(!Number.isFinite(distance))return null;',
  )],
  ['ignore live status attack lock', mutate(
    'if(!control.ok||!control.canAttack||!Number.isFinite(control.accuracyMultiplier)||control.accuracyMultiplier<0||control.accuracyMultiplier>1)return null;',
    'if(!control.ok)return null;',
  )],
  ['accept malformed live accuracy', mutate(
    '||!Number.isFinite(control.accuracyMultiplier)||control.accuracyMultiplier<0||control.accuracyMultiplier>1',
    '',
  )],
  ['accept forged intent kind', mutate("||intent.kind!=='basic_attack'", '')],
  ['accept forged manual skill intent', mutate('||intent.skillId!==null', '')],
  ['accept forged intent source', mutate('||intent.commandSource!==policy.commandSource', '')],
  ['accept forged Uses consumption', mutate('||intent.usesConsumed!==0', '')],
  ['accept malformed or future issue time', mutate(
    '||!Number.isFinite(intent.issuedAtSec)||!Number.isFinite(w.statusState?.currentTimeSec)||intent.issuedAtSec>w.statusState.currentTimeSec',
    '',
  )],
  ['bypass pure resolver', mutate(
    'const decision=resolveWildMonsterAI(fillWildAiRequest(wildAiScratch,w,dt,canEngage,control,target));',
    "const decision={ok:true,nextState:w.aiState,targetId:null,action:'idle',reason:'bypass'};",
  )],
  ['resolver rejection leaves an unengaged ghost', mutate(
    "cancelWildAIAction(w,'resolver_rejected',{clearEngagement:true});",
    '',
  )],
  ['sequence exhaustion avoids quarantine', mutate(
    "if(decision.reason==='action_sequence_exhausted')quarantineWildAIActor(w);else cancelWildAIAction(w,'resolver_rejected',{clearEngagement:true});",
    "cancelWildAIAction(w,'resolver_rejected',{clearEngagement:true});",
  )],
  ['capture advances Wild lifecycle', mutate(
    'if(w?.capturing)return false;',
    '',
  )],
  ['capture can reset during preflight', mutate(
    'if(!w||w.dead||w.retired||w.capturing||!w.engaged)continue;',
    'if(!w||w.dead||w.retired||!w.engaged)continue;',
  )],
  ['capturing Wild accepts damage', mutate(
    'if(!w||w.dead||w.retired||w.capturing)return false;',
    'if(!w||w.dead||w.retired)return false;',
  )],
  ['capturing Wild reserves an engagement slot', mutate(
    'candidate.capturing=w?.capturing;',
    'candidate.capturing=false;',
  )],
  ['force normal profile on Boss', mutate(
    'snapshot.profile=wildAiPolicy(w);',
    'snapshot.profile=WILD_BASIC_AI_POLICY;',
  )],
  ['drop active Boss reserved slot', mutate(
    'fillEngagedWildIds(wildAggressorCandidates,ENCOUNTER_POLICY,engagedWildIdsScratch,bossChallengeSession.activeBossId)',
    'fillEngagedWildIds(wildAggressorCandidates,ENCOUNTER_POLICY,engagedWildIdsScratch)',
  )],
  ['drop capture-resume priority mapping', mutate(
    'candidate.resumePriority=w?.captureEngagementResumePending===true;',
    'candidate.resumePriority=false;',
  )],
  ['leave capture-resume priority latched after handoff', mutate(
    'for(let index=0;index<wilds.length;index++){const w=wilds[index];if(w?.captureEngagementResumePending===true&&engagedWildIds.has(w.id))w.captureEngagementResumePending=false;}',
    'void engagedWildIds;',
  )],
  ['remove alert telegraph', mutate(
    "if(decision.transition?.toState==='alert')createWildAiTelegraph(w,w.mesh.position",
    "if(false&&decision.transition?.toState==='alert')createWildAiTelegraph(w,w.mesh.position",
  )],
  ['remove windup telegraph', mutate(
    "if(decision.transition?.toState==='attack_windup'){",
    "if(false&&decision.transition?.toState==='attack_windup'){",
  )],
  ['unwrap telegraph factory failure', mutate(
    `function createWildAiTelegraph(w,position,color,options,target=null){
  try{
    const effect=spawnRingPulse(position,color,options);
    if(!effect?.mesh||!effects.includes(effect))return false;
    return setWildAiTelegraph(w,effect,target);
  }catch{return false;}
}`,
    `function createWildAiTelegraph(w,position,color,options,target=null){
  const effect=spawnRingPulse(position,color,options);
  if(!effect?.mesh||!effects.includes(effect))return false;
  return setWildAiTelegraph(w,effect,target);
}`,
  )],
  ['allow null Boss telegraph', mutate(
    'const effect=spawnRingPulse(position,color,options);\n    if(!effect?.mesh||!effects.includes(effect))return false;',
    'const effect=spawnRingPulse(position,color,options);\n    if(effect===null)return true;\n    if(!effect?.mesh||!effects.includes(effect))return false;',
  )],
  ['remove Boss telegraph fail-closed cancellation', mutate(
    "if(w.boss&&!telegraphReady){cancelWildAIAction(w,'boss_attack_telegraph_unavailable');return false;}",
    'void telegraphReady;',
  )],
  ['make windup telegraph droppable', mutate(
    "life:aiPolicy.windupDurationSec,y:.08,priority:'P0'",
    "life:aiPolicy.windupDurationSec,y:.08,priority:'P1'",
  )],
  ['make alert telegraph droppable', mutate(
    "life:aiPolicy.alertDurationSec,y:.08,priority:'P0'",
    "life:aiPolicy.alertDurationSec,y:.08,priority:'P1'",
  )],
  ['windup ring does not bind target ID', mutate(
    "life:aiPolicy.windupDurationSec,y:.08,priority:'P0'},target)",
    "life:aiPolicy.windupDurationSec,y:.08,priority:'P0'})",
  )],
  ['telegraph redirects to a different target', mutate(
    "||target.id!==w.aiTelegraphTargetId||!effect.mesh?.position",
    "||!effect.mesh?.position",
  )],
  ['remove per-frame telegraph follow', mutate(
    'syncWildAiTelegraphs(wildAiFrameTarget);',
    '',
  )],
  ['stretch animation against hardcoded melee duration', mutate(
    'u.monActionTimer/actionDuration',
    'u.monActionTimer/0.22',
  )],
  ['drop intent executor', mutate(
    "if(decision.action==='basic_attack')executeWildAiIntent(w,decision,canEngage,frameTargetKey,frameRuntime);",
    "if(decision.action==='basic_attack')void decision;",
  )],
  ['do not settle accepted intent', mutate(
    'const settled=settleWildAIIntent(w.aiState,decision.intent,true);',
    'const settled=settleWildAIIntent(w.aiState,decision.intent,false);',
  )],
  ['remove action-token claim', mutate(
    'w.lastCommittedAiActionToken=decision.intent.actionToken;',
    '',
  )],
  ['remove cooldown claim', mutate(
    'w.attackCd=wildAiPolicy(w).basicAttackCooldownSec;',
    '',
  )],
  ['claim action token after telegraph cleanup', moveExecutorClaimAfterTelegraph(
    'w.lastCommittedAiActionToken=decision.intent.actionToken;',
  )],
  ['claim cooldown after telegraph cleanup', moveExecutorClaimAfterTelegraph(
    'w.attackCd=wildAiPolicy(w).basicAttackCooldownSec;',
  )],
  ['accepted intent leaves stale telegraph', mutate(
    'runBestEffortCombatPresentation(()=>clearWildAiTelegraph(w));',
    '',
  )],
  ['rejected intent leaves stale telegraph', mutate(
    'function rejectWildAiIntent(w,decision,reason=\'runtime_revalidation_rejected\'){\n  clearWildAiTelegraph(w);',
    'function rejectWildAiIntent(w,decision,reason=\'runtime_revalidation_rejected\'){',
  )],
  ['stale callback mutates newer state', mutate(
    'if(!wildAiStateOwnsIntent(w,decision?.intent)){',
    'if(false){',
  )],
  ['accept invalid attacker status modifiers', mutate(
    "if(!selfModifiers.ok||!Number.isFinite(selfModifiers.attackMultiplier))return rejectWildAiIntent(w,decision,'attacker_status_invalid');",
    'if(false)return false;',
  )],
  ['accept invalid defender status modifiers', mutate(
    "if(target.kind==='owned'&&(!guard?.ok||!Number.isFinite(guard.defenseMultiplier)||!Number.isFinite(guard.evasionChancePct)||!Number.isFinite(guard.damageTakenMultiplier)||!Number.isFinite(guard.elementDamageTakenMultiplier)))return rejectWildAiIntent(w,decision,'defender_status_invalid');",
    'if(false)return false;',
  )],
  ['status miss still damages player', mutate(
    "target.kind==='player'&&statusMissed",
    'false',
  )],
  ['player damage ignores attacker status', mutate(
    '*(w.boss?.7:.48)*selfModifiers.attackMultiplier',
    '*(w.boss?.7:.48)',
  )],
  ['accepted settlement skips monotonic state commit', mutate(
    "if(!commitWildAIState(w,settled.nextState)){cancelWildAIAction(w,'invalid_accepted_intent_state',{clearEngagement:true});return false;}",
    'w.aiState=settled.nextState;',
  )],
  ['settlement failure keeps pending action', mutate(
    "cancelWildAIAction(w,'invalid_accepted_intent_settlement',{clearEngagement:true});",
    '',
  )],
  ['remove first frame epoch guard', mutateNth(loopEpochGuard, 'false', 1)],
  ['remove second frame epoch guard', mutateNth(loopEpochGuard, 'false', 2)],
  ['process retired Wild actor', mutate(
    'if(!w||w.retired||w.runtimeGeneration!==wildLoopGeneration)continue;',
    'if(!w||w.runtimeGeneration!==wildLoopGeneration)continue;',
  )],
  ['scheduler measures distance from player instead of target', mutate(
    'const aiDistance=targetAvailable?distXZ(w.mesh.position,wildAiFrameTarget.position):Infinity;',
    'const aiDistance=distXZ(player.position,w.mesh.position);',
  )],
  ['scheduler forces every valid windup frame', mutate(
    'const urgentCancel=!!w.aiState?.pendingAction&&(!engagedWildIds.has(w.id)||w.aiState.targetId!==wildLoopTargetKey||!targetAvailable);',
    'const urgentCancel=!!w.aiState?.pendingAction;',
  )],
  ['present a retired actor', mutate(
    'if(!w.retired&&w.runtimeGeneration===wildLoopGeneration)applyWildMotionAndPresentation(w,dt,wildAiFrameTarget,wildLoopTargetKey,frameRuntime);',
    'applyWildMotionAndPresentation(w,dt,wildAiFrameTarget,wildLoopTargetKey,frameRuntime);',
  )],
  ['skip root actor quarantine before consumers', mutate(
    'quarantineInvalidWildActors();',
    '',
  )],
  ['skip encounter boundary preflight before damage', mutate(
    'preflightWildEncounterBoundaries();',
    '',
  )],
  ['throttle lifecycle at AI cadence', mutate(
    'if(!frameRuntime)continue;',
    '',
  )],
  ['throttle motion and presentation at AI cadence', mutate(
    'if(!w.retired&&w.runtimeGeneration===wildLoopGeneration)applyWildMotionAndPresentation(w,dt,wildAiFrameTarget,wildLoopTargetKey,frameRuntime);',
    '',
  )],
  ['let every Wild bypass maxEngaged', mutate(
    'if(aiDt>0)updateWild(w,aiDt,engagedWildIds.has(w.id),wildAiFrameTarget,wildLoopTargetKey,frameRuntime);',
    'if(aiDt>0)updateWild(w,aiDt,true,wildAiFrameTarget,wildLoopTargetKey,frameRuntime);',
  )],
  ['damage bypasses leash and root validation', mutate(
    '||!wildDamageTargetAvailable(w)',
    '',
  )],
  ['damage ignores deferred defeat ownership', mutate(
    'if(w.hp<=0&&meta.deferDefeat!==true)finalizePendingWildDefeat(w,meta.rewardOwnerInstanceId??null)',
    'if(w.hp<=0)finalizePendingWildDefeat(w,meta.rewardOwnerInstanceId??null)',
  )],
  ['legacy lethal damage never finalizes', mutate(
    'if(w.hp<=0&&meta.deferDefeat!==true)finalizePendingWildDefeat(w,meta.rewardOwnerInstanceId??null)',
    'if(false)finalizePendingWildDefeat(w,meta.rewardOwnerInstanceId??null)',
  )],
  ['damage drops pre-presentation HP receipt', mutate(
    'if(commitReceipt){commitReceipt.committed=true;commitReceipt.damage=Math.max(0,hpBefore-w.hp);}',
    'void commitReceipt;',
  )],
  ['Boss automatic exit presentation escapes best-effort isolation', mutate(
    "runBestEffortCombatPresentation(()=>{el('bossRetreatBtn')?.classList.add('hidden');playBGM(state.currentZone);msg(",
    "(callback=>callback())(()=>{el('bossRetreatBtn')?.classList.add('hidden');playBGM(state.currentZone);msg(",
  )],
  ['damage presentation escapes best-effort isolation', mutate(
    'function runBestEffortCombatPresentation(callback){try{callback();return true;}catch{return false;}}',
    'function runBestEffortCombatPresentation(callback){callback();return true;}',
  )],
  ['positive HP can be finalized as defeated', mutate(
    'if(!w||w.dead||!(w.hp<=0))return false;',
    'if(!w||w.dead)return false;',
  )],
  ['pending defeat finalizer is not idempotent', mutate(
    'if(!w||w.dead||!(w.hp<=0))return false;',
    'if(!w||!(w.hp<=0))return false;',
  )],
  ['pending defeat reports success without defeating', mutate(
    'defeatWild(w,rewardOwnerInstanceId);return true;',
    'return true;',
  )],
  ['persist Wild action sequence floor', mutate(
    'return {state:sanitizeStateForPersistence(persistableState(state)),playerHp:playerData.hp,saveSchemaVersion:SAVE_SCHEMA_VERSION};',
    'return {state:sanitizeStateForPersistence(persistableState(state)),playerHp:playerData.hp,saveSchemaVersion:SAVE_SCHEMA_VERSION,aiActionSequenceFloor:activeSummon?.aiActionSequenceFloor};',
  )],
  ['cross manual skill boundary', mutate(
    "if(decision.action==='basic_attack')executeWildAiIntent(w,decision,canEngage,frameTargetKey,frameRuntime);",
    "if(decision.action==='basic_attack'){useSkill(0);executeWildAiIntent(w,decision,canEngage,frameTargetKey,frameRuntime);}",
  )],
  ['debug counts uncommitted Basic decisions', mutate(
    "action==='basic_attack'&&reason==='runtime_commit'&&!rejected",
    "action==='basic_attack'&&!rejected",
  )],
];

let killed = 0;
for (const [name, source] of mutants) {
  try {
    assertWildAiRuntimeWiring(source);
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

assert.equal(killed, mutants.length);
console.log(`V8.10 AI-2 Wild AI runtime mutants: PASS (${killed}/${mutants.length} killed)`);
