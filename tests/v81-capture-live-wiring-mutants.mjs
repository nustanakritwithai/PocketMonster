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
  ['bypass resolve transaction', mutate('js', 'const resolved=resolveCaptureAttempt(captureAttemptLedger', 'const resolved=fakeResolveCaptureAttempt(captureAttemptLedger')],
  ['replace injected RNG', mutate('js', 'rng:Math.random', 'rng:()=>0')],
  ['replay duplicate projectile callback', mutate('js', 'if(resolved.replay)return;', 'if(false&&resolved.replay)return;')],
  ['bypass immediate failure commit', mutate('js', 'if(!projectileHit||!resolution.shouldRoll){const committed=commitCaptureAttempt', 'if(!projectileHit||!resolution.shouldRoll){const committed=fakeCommitCaptureAttempt')],
  ['reroll inside tension', mutate('js', 'success:resolution.captureSucceeded', 'success:Math.random()<chance')],
  ['bypass completion commit', mutate('js', 'const committed=commitCaptureAttempt(captureAttemptLedger,{attemptId:cs.attemptId', 'const committed=fakeCommitCaptureAttempt(captureAttemptLedger,{attemptId:cs.attemptId')],
  ['swap success callback', mutate('js', 'onSuccess:()=>finishCaptureSuccess(cs),onFailure:()=>finishCaptureFail(cs)', 'onSuccess:()=>finishCaptureFail(cs),onFailure:()=>finishCaptureSuccess(cs)')],
  ['hardcode captured Bond', mutate('js', 'bond:captureProfile.baseBond', 'bond:24')],
  ['drop Stage2 form evidence', mutate('js', 'formId:captureProfile.stage===2?captureProfile.monsterId:undefined', 'formId:undefined')],
  ['drop identity drift guard', mutate('js', 'captureProfile.monsterId!==identity.monsterId||captureProfile.stage!==identity.stage', 'false')],
  ['leave statuses open on success', mutate('js', "playSFX('sfx_capture_success');\n  w.statusState=endEncounterEffects(w.statusState,{nowSec:w.statusState.currentTimeSec});", "playSFX('sfx_capture_success');\n  void w.statusState;")],
  ['call factory twice', mutate('js', 'const inst=makeInstance(cs.sp,w.level', 'makeInstance(cs.sp,w.level,{});const inst=makeInstance(cs.sp,w.level')],
  ['clear statuses on failure', mutate('js', "function finishCaptureFail(cs){\n  playSFX", "function finishCaptureFail(cs){\n  endEncounterEffects(cs.wild?.statusState);\n  playSFX")],
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
  ['miss first-hit reference snapshot', mutate('js', 'if(w.dead)return;ensureCaptureReferenceLevel(w);w.engaged=true;', 'if(w.dead)return;w.engaged=true;')],
  ['miss aggro reference snapshot', mutate('js', '  ensureCaptureReferenceLevel(w);\n  w.engaged=true;\n  w.state=\'chase\';', "  w.engaged=true;\n  w.state='chase';")],
  ['abort without cancelling attempt', mutate('js', 'if(attemptId)cancelCaptureAttempt(captureAttemptLedger,attemptId);', 'void attemptId;')],
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
