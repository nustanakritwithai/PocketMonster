import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertOwnedAiClosure } from './v810-owned-ai-closure.mjs';

const original = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

function mutate(before, after) {
  assert.ok(original.includes(before), `Owned closure mutation target drifted: ${before}`);
  return original.replace(before, after);
}

function mutateNth(before, after, occurrence) {
  let from = 0;
  let index = -1;
  for (let count = 0; count < occurrence; count += 1) {
    index = original.indexOf(before, from);
    assert.ok(index >= 0, `Owned closure occurrence ${occurrence} drifted: ${before}`);
    from = index + before.length;
  }
  return `${original.slice(0, index)}${after}${original.slice(index + before.length)}`;
}

function moveOwnedTraceAfterFirstSideEffect() {
  const trace = "recordOwnedAiTrace(a,{fromState:decision.action,toState:decision.action,targetId:liveTarget.id,action:'basic_attack',reason:'runtime_commit',timeSec:a.statusState.currentTimeSec});";
  const effect = "runBestEffortCombatPresentation(()=>triggerMonsterAction(a.mesh,'attack',0.22));";
  const withoutTrace = mutate(trace, '');
  const updateStart = withoutTrace.indexOf('function updateOwned(');
  const effectIndex = withoutTrace.indexOf(effect, updateStart);
  assert.ok(updateStart >= 0 && effectIndex >= 0, 'Owned first side effect target drifted');
  return `${withoutTrace.slice(0, effectIndex)}${effect}${trace}${withoutTrace.slice(effectIndex + effect.length)}`;
}

function moveOwnedCaptureCancelAfterFreeze() {
  const cancel = "cancelOwnedAITarget(t.id,'capture_started');";
  const freeze = 't.capturing=true;';
  const withoutCancel = mutate(cancel, '');
  assert.ok(withoutCancel.includes(freeze), 'capture freeze target drifted');
  return withoutCancel.replace(freeze, `${freeze}${cancel}`);
}

const appendTrace = 'appendMonsterAiSessionTrace(event);';
const ownedImpactVfx = "if(committed)runBestEffortCombatPresentation(()=>spawnElementalFX(monsterTypes(a.inst)[0],ownedBasicAiImpactScratch,'impact',0.62));";
const mutants = [
  ['enable debug unconditionally', mutate(
    "const MONSTER_AI_DEBUG=new URLSearchParams(location.search).get('debugAI')==='1';",
    'const MONSTER_AI_DEBUG=true;',
  )],
  ['unbound session trace', mutate(
    'const MONSTER_AI_SESSION_TRACE_LIMIT=160;',
    'const MONSTER_AI_SESSION_TRACE_LIMIT=Infinity;',
  )],
  ['unbound inspectable actor metrics', mutate(
    'const MONSTER_AI_SESSION_ACTOR_LIMIT=32;',
    'const MONSTER_AI_SESSION_ACTOR_LIMIT=Infinity;',
  )],
  ['hide debug session from explicit inspector', mutate(
    'if(monsterAiDebugSession)globalThis.__MONSTER_AI_DEBUG__=monsterAiDebugSession;',
    '',
  )],
  ['session FIFO never evicts', mutate(
    'monsterAiDebugSession.events.length>MONSTER_AI_SESSION_TRACE_LIMIT',
    'false',
  )],
  ['Wild trace not published to session', mutateNth(appendTrace, '', 1)],
  ['Owned trace not published to session', mutateNth(appendTrace, '', 2)],
  ['Owned trace omits canonical time', mutateNth('time:timeSec', 'timeSec', 2)],
  ['Wild frozen debug failure escapes telemetry isolation', mutate(
    "  publishMonsterAiMetrics(w.id,'wild',metrics);\n  }catch{}",
    "  publishMonsterAiMetrics(w.id,'wild',metrics);\n  }catch(error){throw error;}",
  )],
  ['Owned frozen debug failure escapes telemetry isolation', mutate(
    "  publishMonsterAiMetrics(actorId,'owned',metrics);\n  }catch{}",
    "  publishMonsterAiMetrics(actorId,'owned',metrics);\n  }catch(error){throw error;}",
  )],
  ['Wild session event sink escapes telemetry isolation', mutate(
    "  appendMonsterAiSessionTrace(event);\n  publishMonsterAiMetrics(w.id,'wild',metrics);\n  }catch{}\n}",
    "  publishMonsterAiMetrics(w.id,'wild',metrics);\n  }catch{}\n  appendMonsterAiSessionTrace({actorId:w.id,fromState,toState,targetId,action,reason,time:timeSec});\n}",
  )],
  ['Owned session event sink escapes telemetry isolation', mutate(
    "  appendMonsterAiSessionTrace(event);\n  publishMonsterAiMetrics(actorId,'owned',metrics);\n  }catch{}\n}",
    "  publishMonsterAiMetrics(actorId,'owned',metrics);\n  }catch{}\n  appendMonsterAiSessionTrace({actorId:ownedWildAiTargetId(a),fromState,toState,targetId,action,reason,time:timeSec});\n}",
  )],
  ['Wild session metrics sink escapes telemetry isolation', mutate(
    "  publishMonsterAiMetrics(w.id,'wild',metrics);\n  }catch{}\n}",
    "  }catch{}\n  publishMonsterAiMetrics(w.id,'wild',w.aiDebug);\n}",
  )],
  ['Owned session metrics sink escapes telemetry isolation', mutate(
    "  publishMonsterAiMetrics(actorId,'owned',metrics);\n  }catch{}\n}",
    "  }catch{}\n  publishMonsterAiMetrics(ownedWildAiTargetId(a),'owned',a.aiDebug);\n}",
  )],
  ['lifecycle events inflate Wild decision timing', mutate(
    'if(decision){metrics.decisionCount++;',
    'if(true){metrics.decisionCount++;',
  )],
  ['committed reset is not counted', mutate(
    'if(reset)metrics.resetCount++;',
    'void metrics.resetCount;',
  )],
  ['cancellation keeps stale decision', mutate(
    'a.target=null;a.aiDecision=null;a.aiDecisionElapsed=0;',
    'a.target=null;a.aiDecisionElapsed=0;',
  )],
  ['Owned invalid status reaches lifecycle dereference', mutate(
    "if(!isEncounterStatusState(a.statusState)||a.statusState.ended){cancelOwnedAIAction(a,'invalid_status_context');return;}",
    'void a.statusState;',
  )],
  ['zone clear keeps Owned target', mutate(
    "cancelOwnedAITarget(w?.id,'zone_clear');",
    '',
  )],
  ['retire keeps Owned target', mutate(
    "cancelOwnedAITarget(w?.id,'actor_retired');",
    '',
  )],
  ['reset keeps Owned target', mutate(
    'cancelOwnedAITarget(w.id,resetReason);',
    '',
  )],
  ['Boss start keeps Owned decision', mutate(
    "cancelOwnedAIAction(activeSummon,'boss_challenge_start');",
    '',
  )],
  ['Boss exit keeps Owned decision', mutate(
    "cancelOwnedAIAction(activeSummon,'boss_challenge_exit');",
    '',
  )],
  ['capture freezes before Owned cancellation', moveOwnedCaptureCancelAfterFreeze()],
  ['same owned target ID across re-summon', mutate(
    'runtimeEpoch:++summonRuntimeEpoch',
    'runtimeEpoch:summonRuntimeEpoch',
  )],
  ['summon arrival VFX escapes before terminal settlement', mutate(
    "runBestEffortCombatPresentation(()=>spawnBurst(safeVec3(p.end),p.color,{count:6,life:.16,size:.04,priority:'P1'}));",
    "spawnBurst(safeVec3(p.end),p.color,{count:6,life:.16,size:.04,priority:'P1'});",
  )],
  ['summon arrival VFX runs before the gameplay callback', mutate(
    "try{p.onHit?.();}catch{}\n    runBestEffortCombatPresentation(()=>spawnBurst(safeVec3(p.end),p.color,{count:6,life:.16,size:.04,priority:'P1'}));",
    "runBestEffortCombatPresentation(()=>spawnBurst(safeVec3(p.end),p.color,{count:6,life:.16,size:.04,priority:'P1'}));\n    try{p.onHit?.();}catch{}",
  )],
  ['failed summon leaves pending flight lock active', mutate(
    'finally{pendingSummon=null;}',
    'finally{void pendingSummon;}',
  )],
  ['failed provisional Owned setup leaves an orphan mesh', mutate(
    'catch{if(mesh)try{removeAndDispose(scene,mesh);}catch{}return false;}',
    'catch{return false;}',
  )],
  ['publish Owned runtime before provisional setup succeeds', mutate(
    'mesh.position.copy(pos);mesh.position.y=0;scene.add(mesh);setupMonsterMotion(mesh,sp,inst);',
    'mesh.position.copy(pos);mesh.position.y=0;scene.add(mesh);activeSummon={mesh};setupMonsterMotion(mesh,sp,inst);',
  )],
  ['recall keeps Owned decision', mutate(
    "try{cancelOwnedAIAction(summon,'owned_recall');}catch{}",
    '',
  )],
  ['recall keeps Wild intent against old epoch', mutate(
    "try{cancelWildAITarget(ownedWildAiTargetId(summon),'owned_recall');}catch{}",
    '',
  )],
  ['faint keeps Owned decision', mutate(
    "try{cancelOwnedAIAction(summon,'owned_fainted');}catch{}",
    '',
  )],
  ['faint keeps Wild intent against old epoch', mutate(
    "try{cancelWildAITarget(ownedWildAiTargetId(summon),'owned_fainted');}catch{}",
    '',
  )],
  ['faint skips encounter status lifecycle cleanup', mutate(
    'summon.statusState=endEncounterEffects(summon.statusState,{nowSec:summon.statusState.currentTimeSec});',
    'void summon.statusState;',
  )],
  ['faint leaves the retired summon runtime reference active', mutate(
    'activeSummon=null;pendingSummon=null;summonCooldownUntil=Date.now()+800;',
    'pendingSummon=null;summonCooldownUntil=Date.now()+800;',
  )],
  ['faint scene cleanup failure escapes the frame lifecycle', mutate(
    "activeSummon=null;pendingSummon=null;summonCooldownUntil=Date.now()+800;\n  try{removeSceneRole('activeSummon');}catch{}",
    "activeSummon=null;pendingSummon=null;summonCooldownUntil=Date.now()+800;\n  removeSceneRole('activeSummon');",
  )],
  ['faint companion sync failure escapes the frame lifecycle', mutate(
    "try{removeSceneRole('activeSummon');}catch{}\n  try{syncHubCompanion();}catch{}",
    "try{removeSceneRole('activeSummon');}catch{}\n  syncHubCompanion();",
  )],
  ['faint save failure escapes the frame lifecycle', mutate(
    'try{syncHubCompanion();}catch{}\n  try{saveGame(false);}catch{}',
    'try{syncHubCompanion();}catch{}\n  saveGame(false);',
  )],
  ['faint presentation failure escapes best-effort isolation', mutate(
    'function runBestEffortCombatPresentation(callback){try{callback();return true;}catch{return false;}}',
    'function runBestEffortCombatPresentation(callback){callback();return true;}',
  )],
  ['lethal Owned status skips faint finalization', mutate(
    'if(statusAdvance.fainted){faintActive();runBestEffortCombatPresentation',
    'if(statusAdvance.fainted){runBestEffortCombatPresentation',
  )],
  ['lethal Owned status presentation escapes after faint', mutate(
    "faintActive();runBestEffortCombatPresentation(()=>spawnDamageNumber(tickDamage,ownedBasicAiImpactScratch,{type:tickType,label:'STATUS'}));return;",
    "faintActive();spawnDamageNumber(tickDamage,ownedBasicAiImpactScratch,{type:tickType,label:'STATUS'});return;",
  )],
  ['recall old epoch before zone retirement', mutate(
    'zoneGeneration++;\n  abortCaptureSequence();\n  if(activeSummon)recall(false,false);',
    'if(activeSummon)recall(false,false);\n  zoneGeneration++;\n  abortCaptureSequence();',
  )],
  ['remove Owned decision timing', mutate(
    'decisionStarted=MONSTER_AI_DEBUG?performance.now():0',
    'decisionStarted=0',
  )],
  ['remove Owned resolver trace', mutate(
    'recordOwnedAiTrace(a,{fromState:previousDecision',
    'void({fromState:previousDecision',
  )],
  ['runtime rejection keeps stale Owned decision', mutate(
    "cancelOwnedAIAction(a,'runtime_revalidation_rejected')",
    'a.aiDecision=null',
  )],
  ['pre-damage rejection keeps stale Owned decision', mutate(
    "else cancelOwnedAIAction(a,'pre_damage_revalidation_rejected');",
    '',
  )],
  ['invalid status moves fail open', mutate(
    "decision.action==='move'&&control.ok&&control.canMove",
    "decision.action==='move'&&(!control.ok||control.canMove)",
  )],
  ['invalid status attacks fail open', mutate(
    "a.inst.hp>0&&control.ok&&control.canAttack",
    "a.inst.hp>0&&(!control.ok||control.canAttack)",
  )],
  ['Owned Basic bypasses deferred transaction helper', mutate(
    'commitOwnedBasicDamage(liveTarget,res,basic);',
    'damageWild(liveTarget,res.damage,{type:basic.type,eff:res.eff});',
  )],
  ['Owned Basic ghost-logs a rejected damage commit', mutateNth(
    'const commitReceipt={committed:false,damage:0};',
    'const commitReceipt={committed:true,damage:res.damage};',
    3,
  )],
  ['Owned Basic logs planned overkill damage', mutate(
    "logBattleEvent('power',commitReceipt.damage,true,liveTarget.id,basic.sourceInstanceId)",
    "logBattleEvent('power',res.damage,true,liveTarget.id,basic.sourceInstanceId)",
  )],
  ['Owned Basic lets damage finalize before its contribution', mutate(
    'damageWild(liveTarget,res.damage,{type:basic.type,eff:res.eff,deferDefeat:true,commitReceipt})',
    'damageWild(liveTarget,res.damage,{type:basic.type,eff:res.eff,deferDefeat:false,commitReceipt})',
  )],
  ['Owned Basic finalizes before contribution logging', mutate(
    "try{logBattleEvent('power',commitReceipt.damage,true,liveTarget.id,basic.sourceInstanceId);}finally{finalizePendingWildDefeat(liveTarget,basic.sourceInstanceId);}",
    "try{finalizePendingWildDefeat(liveTarget,basic.sourceInstanceId);}finally{logBattleEvent('power',commitReceipt.damage,true,liveTarget.id,basic.sourceInstanceId);}",
  )],
  ['Owned Basic leaves a killing target pending', mutate(
    'finally{finalizePendingWildDefeat(liveTarget,basic.sourceInstanceId);}',
    'finally{}',
  )],
  ['Owned Basic drops pre-presentation HP receipt', mutate(
    'damageWild(liveTarget,res.damage,{type:basic.type,eff:res.eff,deferDefeat:true,commitReceipt})',
    'damageWild(liveTarget,res.damage,{type:basic.type,eff:res.eff,deferDefeat:true,commitReceipt:null})',
  )],
  ['Owned Basic skips settlement after presentation failure', mutate(
    "finally{if(commitReceipt.committed){try{logBattleEvent('power',commitReceipt.damage,true,liveTarget.id,basic.sourceInstanceId);}",
    "finally{if(false){try{logBattleEvent('power',commitReceipt.damage,true,liveTarget.id,basic.sourceInstanceId);}",
  )],
  ['Owned Basic omits contributor identity', mutate(
    'sourceInstanceId:a.inst.instanceId',
    'sourceInstanceId:null',
  )],
  ['Owned Basic impact VFX runs before damage commit', mutate(
    `const committed=commitOwnedBasicDamage(liveTarget,res,basic);\n        ${ownedImpactVfx}`,
    "runBestEffortCombatPresentation(()=>spawnElementalFX(monsterTypes(a.inst)[0],ownedBasicAiImpactScratch,'impact',0.62));\n        const committed=commitOwnedBasicDamage(liveTarget,res,basic);",
  )],
  ['Owned Basic impact VFX failure escapes after gameplay commit', mutate(
    ownedImpactVfx,
    "if(committed)spawnElementalFX(monsterTypes(a.inst)[0],ownedBasicAiImpactScratch,'impact',0.62);",
  )],
  ['Owned Basic retries gameplay after impact VFX failure', mutate(
    ownedImpactVfx,
    "if(committed&&!runBestEffortCombatPresentation(()=>spawnElementalFX(monsterTypes(a.inst)[0],ownedBasicAiImpactScratch,'impact',0.62)))commitOwnedBasicDamage(liveTarget,res,basic);",
  )],
  ['record accepted attack after side effect', moveOwnedTraceAfterFirstSideEffect()],
  ['persist debug state', mutate(
    'return {state:sanitizeStateForPersistence(persistableState(state)),playerHp:playerData.hp,saveSchemaVersion:SAVE_SCHEMA_VERSION};',
    'return {state:sanitizeStateForPersistence(persistableState(state)),playerHp:playerData.hp,saveSchemaVersion:SAVE_SCHEMA_VERSION,aiDebug:activeSummon?.aiDebug};',
  )],
  ['Owned AI crosses manual skill boundary', mutate(
    'a.aiDecision=resolveOwnedBasicAiAction(',
    'useSkill(0);a.aiDecision=resolveOwnedBasicAiAction(',
  )],
];

let killed = 0;
for (const [name, source] of mutants) {
  try {
    assertOwnedAiClosure(source);
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

assert.equal(killed, mutants.length);
console.log(`V8.10 AI-3 Owned AI closure mutants: PASS (${killed}/${mutants.length} killed)`);
