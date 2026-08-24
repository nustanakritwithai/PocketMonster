import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertCaptureLiveWiring } from './v81-capture-live-wiring.mjs';

const root = new URL('../', import.meta.url);
const original = Object.freeze({
  js: fs.readFileSync(new URL('game-v800.js', root), 'utf8'),
  config: fs.readFileSync(new URL('balance-config.mjs', root), 'utf8'),
  packageJson: fs.readFileSync(new URL('package.json', root), 'utf8'),
});

function mutate(field, before, after) {
  assert.ok(original[field].includes(before), `${field} mutation target drifted: ${before}`);
  return { ...original, [field]: original[field].replace(before, after) };
}

const mutants = [
  ['consume ball in scene', mutate('js', "playerVisual.play('throw'", "state.inventory.captureBalls--;playerVisual.play('throw'")],
  ['bypass begin transaction', mutate('js', 'const begun=beginCaptureAttempt(captureAttemptLedger', 'const begun=fakeBeginCaptureAttempt(captureAttemptLedger')],
  ['drop stable attempt binding', mutate('js', 'attemptId:attemptId,inventory:state.inventory', 'attemptId:null,inventory:state.inventory')],
  ['drop inventory binding', mutate('js', 'inventory:state.inventory,targetId:', 'inventory:{captureBalls:99},targetId:')],
  ['drop workbook monster binding', mutate('js', "targetMonsterId,ballClass:'Basic'", "targetMonsterId:null,ballClass:'Basic'")],
  ['ignore pending summon at begin', mutate('js', 'referenceLevel,ownedMonsterActive:!!(activeSummon||pendingSummon)}', 'referenceLevel,ownedMonsterActive:!!activeSummon}')],
  ['allow capture during summon flight', mutate('js', "if(pendingSummon||projectiles.some(p=>p.type==='summon')){", "if(false&&pendingSummon&&projectiles.some(p=>p.type==='summon')){")],
  ['do not snapshot targeted encounter', mutate('js', 'referenceLevel=t?ensureCaptureReferenceLevel(t):null', 'referenceLevel=t?currentCaptureReferenceLevel():null')],
  ['let throw presentation escape', mutate('js', "runBestEffortCombatPresentation(()=>{playerVisual.play('throw',{duration:.34});playSFX('sfx_throw_ball');});", "playerVisual.play('throw',{duration:.34});playSFX('sfx_throw_ball');")],
  ['skip owned AI cancellation on throw', mutate('js', "cancelOwnedAITarget(t.id,'capture_started');", 'void t.id;')],
  ['skip wild AI cancellation on throw', mutate('js', "if(!cancelWildAIAction(t,'capture_started'))targetReady=false;else{t.captureEngagementResumePending=t.engaged===true;t.capturing=true;}", 't.captureEngagementResumePending=t.engaged===true;t.capturing=true;')],
  ['drop pre-freeze engagement snapshot', mutate('js', 't.captureEngagementResumePending=t.engaged===true;t.capturing=true;', 't.captureEngagementResumePending=false;t.capturing=true;')],
  ['snapshot engagement after target freeze', mutate('js', 't.captureEngagementResumePending=t.engaged===true;t.capturing=true;', 't.capturing=true;t.captureEngagementResumePending=t.engaged===true;')],
  ['defer target freeze past projectile start', mutate('js', 'else{t.captureEngagementResumePending=t.engaged===true;t.capturing=true;}', 'else{t.captureEngagementResumePending=t.engaged===true;queueMicrotask(()=>{t.capturing=true;});}')],
  ['let capture target reserve engagement slot', mutate('js', 'candidate.capturing=w?.capturing;', 'candidate.capturing=false;')],
  ['ignore projectile creation failure', mutate('js', 'if(!projectileStarted){abortCaptureSequence(t);', 'if(false&& !projectileStarted){abortCaptureSequence(t);')],
  ['retain partial projectile callback', mutate('js', 'if(index>=0)projectiles.splice(index,1);', 'void index;')],
  ['bypass resolve transaction', mutate('js', 'resolved=resolveCaptureAttempt(captureAttemptLedger', 'resolved=fakeResolveCaptureAttempt(captureAttemptLedger')],
  ['let calculator extraction escape', mutate('js', 'try{calculatorInput=projectileHit?captureCalculatorInput(w,{referenceLevel:w.captureReferenceLevel,projectileHit:true}):null;}catch{}', 'calculatorInput=projectileHit?captureCalculatorInput(w,{referenceLevel:w.captureReferenceLevel,projectileHit:true}):null;')],
  ['invalid calculator leaves active attempt', mutate('js', 'if(projectileHit&&!calculatorInput){abortCaptureSequence(w);', 'if(projectileHit&&!calculatorInput){void w;')],
  ['let resolver exception escape', mutate('js', 'try{resolved=resolveCaptureAttempt(captureAttemptLedger,{attemptId,projectileHit,calculatorInput,rng:Math.random});}catch{}', 'resolved=resolveCaptureAttempt(captureAttemptLedger,{attemptId,projectileHit,calculatorInput,rng:Math.random});')],
  ['resolver rejection leaves active attempt', mutate('js', 'if(!resolved?.ok){abortCaptureSequence(w);', 'if(!resolved?.ok){void w;')],
  ['immediate commit failure leaves capture ball', mutate('js', 'if(!committed.ok){if(ballMesh)try{removeAndDispose(scene,ballMesh);}catch{}if(w?.mesh&&!w.dead)', 'if(!committed.ok){void ballMesh;if(w?.mesh&&!w.dead)')],
  ['replace injected RNG', mutate('js', 'rng:Math.random', 'rng:()=>0')],
  ['replay duplicate projectile callback', mutate('js', 'if(resolved.replay)return;', 'if(false&&resolved.replay)return;')],
  ['bypass immediate failure commit', mutate('js', 'const committed=commitCaptureAttempt(captureAttemptLedger,{attemptId,onSuccess:()=>finishCaptureSuccess(cs)', 'const committed=fakeCommitCaptureAttempt(captureAttemptLedger,{attemptId,onSuccess:()=>finishCaptureSuccess(cs)')],
  ['reroll inside tension', mutate('js', 'success:resolution.captureSucceeded', 'success:Math.random()<chance')],
  ['bypass completion commit', mutate('js', 'const committed=commitCaptureAttempt(captureAttemptLedger,{attemptId:cs.attemptId', 'const committed=fakeCommitCaptureAttempt(captureAttemptLedger,{attemptId:cs.attemptId')],
  ['swap success callback', mutate('js', 'onSuccess:()=>finishCaptureSuccess(cs),onFailure:()=>finishCaptureFail(cs)', 'onSuccess:()=>finishCaptureFail(cs),onFailure:()=>finishCaptureSuccess(cs)')],
  ['do not publish tension sequence', mutate('js', 'captureSequence=cs;\n  try{', 'void cs;\n  try{')],
  ['start tension presentation without guard', mutate('js', "runBestEffortCombatPresentation(()=>{playSFX('sfx_capture_tension');spawnBurst", "runRequiredCombatPresentation(()=>{playSFX('sfx_capture_tension');spawnBurst")],
  ['leave tension sequence without ball', mutate('js', 'cs.ballMesh=ballMesh;ballMesh.position.copy(pos);', 'ballMesh.position.copy(pos);')],
  ['let tension animation escape', mutate('js', 'runBestEffortCombatPresentation(()=>{const drop=', 'runRequiredCombatPresentation(()=>{const drop=')],
  ['retain global sequence during commit', mutate('js', 'captureSequence=null;\n    const committed=commitCaptureAttempt', 'const committed=commitCaptureAttempt')],
  ['retain active attempt after completion', mutate('js', 'if(activeCaptureAttempt?.attemptId===cs.attemptId)activeCaptureAttempt=null;', 'void activeCaptureAttempt;')],
  ['hardcode captured Bond', mutate('js', 'bond:captureProfile.baseBond', 'bond:24')],
  ['drop Stage2 form evidence', mutate('js', 'formId:captureProfile.stage===2?captureProfile.monsterId:undefined', 'formId:undefined')],
  ['drop identity drift guard', mutate('js', 'captureProfile.monsterId!==identity.monsterId||captureProfile.stage!==identity.stage', 'false')],
  ['leave statuses open on success', mutate('js', 'secondaryType:identity.runtimeSecondary});\n  w.statusState=endEncounterEffects(w.statusState,{nowSec:w.statusState.currentTimeSec});', 'secondaryType:identity.runtimeSecondary});\n  void w.statusState;')],
  ['call factory twice', mutate('js', 'const inst=makeInstance(cs.sp,w.level', 'makeInstance(cs.sp,w.level,{});const inst=makeInstance(cs.sp,w.level')],
  ['unguard rare capture progress', mutate('js', "try{if(w.rare)markRareDiscovery(w,'captured');}catch{}", "if(w.rare)markRareDiscovery(w,'captured');")],
  ['unguard elite capture progress', mutate('js', "try{if(w.elite)markEliteProgress(w,'captured');}catch{}", "if(w.elite)markEliteProgress(w,'captured');")],
  ['unguard starter capture progress', mutate('js', "try{if(state.currentZone==='grass-meadow')markStarterJourney('captured');}catch{}", "if(state.currentZone==='grass-meadow')markStarterJourney('captured');")],
  ['render before successful ownership', mutate('js', 'state.collection.push(inst);', 'renderAll();state.collection.push(inst);')],
  ['leave successful target capturing', mutate('js', 'w.dead=true;\n  w.capturing=false;', 'w.dead=true;\n  void w.capturing;')],
  ['leave successful capture ball', mutate('js', 'ensureProgressionEncounter(state.currentZone);\n  if(cs.ballMesh)try{removeAndDispose(scene,cs.ballMesh);}catch{}', 'ensureProgressionEncounter(state.currentZone);\n  void cs.ballMesh;')],
  ['let success presentation escape', mutate('js', "runBestEffortCombatPresentation(()=>{playSFX('sfx_capture_success');", "runRequiredCombatPresentation(()=>{playSFX('sfx_capture_success');")],
  ['clear statuses on failure', mutate('js', "function finishCaptureFail(cs){\n  if(cs.ballMesh)", "function finishCaptureFail(cs){\n  endEncounterEffects(cs.wild?.statusState);\n  if(cs.ballMesh)")],
  ['leave failed capture ball', mutate('js', 'function finishCaptureFail(cs){\n  if(cs.ballMesh)try{removeAndDispose(scene,cs.ballMesh);}catch{}', 'function finishCaptureFail(cs){\n  void cs.ballMesh;')],
  ['leave failed target capturing', mutate('js', 'const w=cs.wild;if(w)try{w.capturing=false;}catch{}', 'const w=cs.wild;void w?.capturing;')],
  ['let failure presentation escape', mutate('js', "runBestEffortCombatPresentation(()=>{playSFX('sfx_capture_fail');", "runRequiredCombatPresentation(()=>{playSFX('sfx_capture_fail');")],
  ['use base ID for Stage2', mutate('js', 'mapping.workbookStage2MonsterId:mapping.workbookBaseMonsterId', 'mapping.workbookBaseMonsterId:mapping.workbookBaseMonsterId')],
  ['use Stage2 ID for base', mutate('js', 'mapping.workbookStage2MonsterId:mapping.workbookBaseMonsterId', 'mapping.workbookStage2MonsterId:mapping.workbookStage2MonsterId')],
  ['reject legacy Stage2 alias', mutate('js', 'const runtimeSecondary=stage===2?', 'if(stage===2&&!path)return null;const runtimeSecondary=stage===2?')],
  ['omit live Stage2 alias coverage', mutate('js', "evolutionPath:'flame_wolf'", "evolutionPath:'flameling_lv2'")],
  ['map Fairy as FAIRY', mutate('js', "runtimeType==='Fairy'?'LIGHT':runtimeType.toUpperCase()", "runtimeType==='Fairy'?'FAIRY':runtimeType.toUpperCase()")],
  ['include expired status', mutate('js', 'entry.expiresAtSec>status.currentTimeSec', 'entry.expiresAtSec>=0')],
  ['ignore capture policy drift', mutate('js', '||!validCapturePolicyForWild(w)', '')],
  ['calculator ignores pending summon', mutate('js', 'ownedMonsterActive:!!(activeSummon||pendingSummon)', 'ownedMonsterActive:!!activeSummon')],
  ['start encounter from HUD preview', mutate('js', 'function captureChance(w){\n  const input=', 'function captureChance(w){\n  ensureCaptureReferenceLevel(w);\n  const input=')],
  ['use legacy live formula', mutate('js', 'const result=resolveWorkbookCapture(input);', 'const result=resolveWorkbookCapture(input);liveCaptureChance({});')],
  ['retain reference across reset', mutate('js', 'w.captureReferenceLevel=null;', 'void w.captureReferenceLevel;')],
  ['miss first-hit reference snapshot', mutate('js', 'ensureCaptureReferenceLevel(w);w.engaged=true;', 'w.engaged=true;')],
  ['miss aggro reference snapshot', mutate('js', 'if(decision.targetId!==null){ensureCaptureReferenceLevel(w);w.engaged=true;}', 'if(decision.targetId!==null){w.engaged=true;}')],
  ['abort without cancelling attempt', mutate('js', 'if(attemptId)try{cancelCaptureAttempt(captureAttemptLedger,attemptId);}catch{}', 'void attemptId;')],
  ['abort leaves capture projectile callback', mutate('js', "if(projectile?.type!=='capture')continue;", 'if(true)continue;')],
  ['teardown without clearing ledger', mutate('js', 'clearCaptureAttemptLedger(captureAttemptLedger);', 'void captureAttemptLedger;')],
  ['allow summon during capture', mutate('js', 'if(activeCaptureAttempt||captureSequence){', 'if(false&&activeCaptureAttempt&&captureSequence){')],
  ['persist transient attempt', mutate('js', 'return {state:sanitizeStateForPersistence(persistableState(state)),playerHp:', 'return {state:{...sanitizeStateForPersistence(persistableState(state)),activeCaptureAttempt},playerHp:')],
  ['factory ignores explicit form', mutate('js', 'formId:opts.formId??opts.evolutionPath??sp.id', 'formId:opts.evolutionPath??sp.id')],
  ['downgrade activation', mutate('config', "statusStackRule: 'StrongestOnly',\n  activation: 'live_client_transaction'", "statusStackRule: 'StrongestOnly',\n  activation: 'calculator_only'")],
  ['claim server roll authority', mutate('config', "rollAuthority: 'future_server_boundary'", "rollAuthority: 'server'")],
  ['remove transaction focused suite', mutate('packageJson', 'v81-capture-transaction.mjs', 'removed-capture-transaction.mjs')],
  ['remove transaction mutants', mutate('packageJson', 'v81-capture-transaction-mutants.mjs', 'removed-capture-transaction-mutants.mjs')],
  ['remove live focused suite', mutate('packageJson', 'v81-capture-live-wiring.mjs', 'removed-capture-live-wiring.mjs')],
  ['remove live mutants', mutate('packageJson', 'v81-capture-live-wiring-mutants.mjs', 'removed-capture-live-wiring-mutants.mjs')],
];

for (const [name, sources] of mutants) {
  assert.throws(() => assertCaptureLiveWiring(sources), undefined, `${name} must be killed`);
}

console.log(`V8.1 A27 live capture wiring mutants: PASS (${mutants.length}/${mutants.length} killed)`);
