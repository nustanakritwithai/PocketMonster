import assert from 'node:assert/strict';

export const GOLDEN_PATH_ORDER = Object.freeze([
  'Spawn',
  'Summon',
  'Basic AI',
  'Skill 1',
  'Skill 2',
  'Skill 3',
  'Skill 4',
  'Recall',
  'Capture',
  'Ranch',
  'Keeper',
  'Growth',
  'Evolution',
  'Breed',
  'Hatch',
  'Save/Reload',
]);

export const A40_ACCEPTANCE_POLICY = Object.freeze({
  authority: 'integrated_acceptance_only',
  liveRuntime: 'game-v800.js',
  headlessCoverage: 'pure_transactions_plus_static_live_wiring',
  deviceCoverage: 'separate_android_landscape_touch_proof',
  manualSkillCoverage: 'four_slot_command_boundary',
  liveEffectScope: 'approved_direct_damage_targets_only',
  targetKinds: Object.freeze(['NearestEnemy', 'EnemyArea', 'Self', 'GroundPoint']),
  deferredManualTargets: Object.freeze(['Self', 'GroundPoint']),
  captureLedgerPersistence: 'transient_not_saved',
  serverAuthorityClaim: false,
  workbookSha256: 'fdda777b1cbb0eeaacb7e02ced3c1c9df1a3af2853bfdf8d1fe902370789e39c',
});

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing live function ${name}`);
  const compactHeader = source.indexOf('){', start);
  const spacedHeader = source.indexOf(') {', start);
  const headerEnd = compactHeader >= 0 && (spacedHeader < 0 || compactHeader < spacedHeader)
    ? compactHeader
    : spacedHeader;
  assert.ok(headerEnd > start, `missing header end for live function ${name}`);
  const brace = source.indexOf('{', headerEnd);
  assert.ok(brace > start, `missing body for live function ${name}`);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`unclosed live function ${name}`);
}

export function assertGoldenPathLiveWiring({ js, packageJson }) {
  assert.equal(A40_ACCEPTANCE_POLICY.serverAuthorityClaim, false);
  assert.equal(A40_ACCEPTANCE_POLICY.headlessCoverage, 'pure_transactions_plus_static_live_wiring');
  assert.equal(A40_ACCEPTANCE_POLICY.deviceCoverage, 'separate_android_landscape_touch_proof');

  const createWild = extractFunction(js, 'createWild');
  const spawnZone = extractFunction(js, 'spawnZone');
  const summonThrow = extractFunction(js, 'summonThrow');
  const spawnOwned = extractFunction(js, 'spawnOwned');
  const updateOwned = extractFunction(js, 'updateOwned');
  const createSkillDispatchIntent = extractFunction(js, 'createSkillDispatchIntent');
  const useSkill = extractFunction(js, 'useSkill');
  const canApplyLiveSkill = extractFunction(js, 'canApplyLiveSkill');
  const recall = extractFunction(js, 'recall');
  const capturePrerequisite = extractFunction(js, 'capturePrerequisite');
  const executeCaptureThrow = extractFunction(js, 'executeCaptureThrow');
  const resolveCapture = extractFunction(js, 'resolveCapture');
  const updateCaptureSequence = extractFunction(js, 'updateCaptureSequence');
  const finishCaptureSuccess = extractFunction(js, 'finishCaptureSuccess');
  const depositMonster = extractFunction(js, 'depositMonster');
  const toggleRanchActive = extractFunction(js, 'toggleRanchActive');
  const healAll = extractFunction(js, 'healAll');
  const levelUpInstance = extractFunction(js, 'levelUpInstance');
  const evolveMonster = extractFunction(js, 'evolveMonster');
  const createEgg = extractFunction(js, 'createEgg');
  const hatchEgg = extractFunction(js, 'hatchEgg');
  const migrateLoadedState = extractFunction(js, 'migrateLoadedState');
  const currentSaveEnvelope = extractFunction(js, 'currentSaveEnvelope');
  const saveGame = extractFunction(js, 'saveGame');
  const loadGame = extractFunction(js, 'loadGame');

  assert.match(createWild, /resolveEncounterProfile\(/, 'Spawn enters the canonical encounter profile');
  assert.match(spawnZone, /spawnRecords\(cfg\.spawn\)/, 'zone load materializes the configured spawn list');

  assert.match(summonThrow, /if\(activeSummon\|\|pendingSummon\)/, 'only one owned monster may be active or in flight');
  assert.match(summonThrow, /spawnOwned\(inst,end\)/, 'accepted summon materializes the selected owned instance');
  assert.match(spawnOwned, /summon=\{inst,mesh,target:null/, 'summon builds one provisional owned runtime');
  assert.match(spawnOwned, /activeSummon=summon/, 'summon publishes the fully initialized owned runtime');
  assert.ok(spawnOwned.indexOf('setupMonsterMotion(mesh,sp,inst)') < spawnOwned.indexOf('activeSummon=summon'),
    'summon cannot publish a half-initialized scene runtime');
  assert.match(spawnOwned, /skillCds:MANUAL_SKILL_SLOTS\.map/, 'active runtime has exactly the manual-slot cooldown vector');

  assert.match(updateOwned, /resolveOwnedBasicAiAction\(/, 'active owned AI uses the canonical Basic AI resolver');
  assert.match(updateOwned, /commandSource:OWNED_BASIC_AI_POLICY\.commandSource/, 'Basic Attack remains a system command');
  assert.doesNotMatch(updateOwned, /executeEquippedSkillCommand\(/, 'Basic AI cannot invoke manual skills');
  assert.match(useSkill, /slot=MANUAL_SKILL_SLOTS\[index\]/, 'manual buttons resolve through slots s1-s4');
  assert.match(useSkill, /executeEquippedSkillCommand\(/, 'manual skills enter the canonical command runtime');
  assert.match(useSkill, /groundPoint:intent\.groundPoint\?\?null/, 'GroundPoint reaches the canonical command runtime');
  assert.match(useSkill, /canApply:\(command,targets\)=>canApplyLiveSkill\(a,move,command,targets\)/, 'live readiness cannot be bypassed by the button adapter');
  assert.match(useSkill, /applyAccepted:\(command,targets\)=>applyAcceptedSkillCommand\(a,index,move,command,targets\)/, 'accepted commands reach the live effect boundary exactly once');
  assert.match(createSkillDispatchIntent, /move\?\.targetType==='GroundPoint'\?reticleGroundPoint\(\):null/, 'GroundPoint is sourced from the live reticle');
  assert.match(canApplyLiveSkill, /canExecuteReviewedSkillEffect\(command\.skillId\)/, 'live effects are gated by cumulative reviewed coverage');
  assert.match(canApplyLiveSkill, /validateReviewedSkillEffectRequest\(canonicalSkillEffectRequest/, 'live readiness validates the exact effect request before Uses commit');
  for (let index = 1; index <= 4; index += 1) {
    assert.match(js, new RegExp(`bindActionPress\\(el\\('skill${index}Btn'\\),\\(\\)=>dispatchSkill\\(${index - 1}\\)\\)`), `combat hotbar slot ${index} is wired`);
  }

  assert.match(recall, /activeSummon=null/, 'Recall clears the active owned monster');
  assert.match(capturePrerequisite, /if\(activeSummon\)/, 'Capture requires Recall first');
  assert.match(capturePrerequisite, /pendingSummon\|\|projectiles\.some\(p=>p\.type==='summon'\)/, 'Capture also blocks an in-flight summon');
  assert.match(executeCaptureThrow, /beginCaptureAttempt\(/, 'Capture begins through the idempotent transaction');
  assert.match(resolveCapture, /resolveCaptureAttempt\(/, 'Capture outcome resolves through the transaction');
  assert.match(updateCaptureSequence, /commitCaptureAttempt\(/, 'Capture side effects commit once');
  assert.match(finishCaptureSuccess, /state\.collection\.push\(inst\)/, 'capture success adds one canonical owned instance');
  assert.match(finishCaptureSuccess, /state\.party\[empty\]=inst\.instanceId/, 'capture fills an available party slot');
  assert.match(finishCaptureSuccess, /else state\.storage\.push\(inst\.instanceId\)/, 'capture falls back to Storage when Party is full');

  assert.match(js, /const RANCH_ACTIVE_MAX=6;/, 'Ranch active capacity remains six');
  assert.match(depositMonster, /state\.party\.filter\(Boolean\)\.length<=1/, 'Ranch deposit preserves at least one Party monster');
  assert.match(depositMonster, /if\(!state\.storage\.includes\(id\)\)state\.storage\.push\(id\)/, 'deposit moves ownership to Storage without duplication');
  assert.match(toggleRanchActive, /state\.ranchActive\.length>=RANCH_ACTIVE_MAX/, 'Ranch rejects a seventh active monster');
  assert.match(healAll, /recoverSkillUses\(state\.collection,\{routeId:'REC_NPC'/, 'Keeper owns the active Uses recovery route');

  assert.match(levelUpInstance, /addGrowthExp\(/, 'Growth uses the shared progression resolver');
  assert.match(evolveMonster, /commitEvolution\(/, 'live Evolution commits through the canonical boundary');
  assert.match(createEgg, /createStandardBreedingEggTransaction\(/, 'Breed creates one canonical egg transaction');
  assert.match(hatchEgg, /hatchBreedingEggTransaction\(/, 'Hatch commits through the canonical idempotent transaction');

  assert.match(migrateLoadedState, /normalizeSavedState\(/, 'load normalizes ownership and persistence schema');
  assert.match(migrateLoadedState, /migrateState\(/, 'load migrates every monster instance');
  assert.match(currentSaveEnvelope, /sanitizeStateForPersistence\(/, 'save strips transient runtime state');
  assert.match(saveGame, /writeStoredSave\(localStorage,envelope\)/, 'save uses current plus backup storage');
  assert.match(loadGame, /readStoredSave\(localStorage\)/, 'reload uses current/backup/legacy recovery');
  assert.doesNotMatch(currentSaveEnvelope, /captureAttemptLedger|activeCaptureAttempt|activeSummon|pendingSummon/, 'transient encounter state cannot enter the save envelope');

  const scripts = JSON.parse(packageJson).scripts;
  assert.equal(
    scripts['test:v81:golden-path'],
    'node tests/v81-monster-content-golden-path.mjs && node tests/v81-monster-content-golden-path-mutants.mjs',
    'A40 focused acceptance must run the deterministic path and its mutants',
  );
  assert.match(scripts.ci, /npm run test:v81:golden-path/, 'full CI must include A40');
  for (const requiredTest of [
    'tests/p0-multitouch-input.mjs',
    'tests/p0-resource-lifecycle.mjs',
    'tests/p0-performance-runtime.mjs',
    'tests/p0-performance-mutation.mjs',
    'tests/v80-in-scene-warp.mjs',
    'tests/v82-stage-objectives.mjs',
    'tests/v82-stage-objectives-mutants.mjs',
  ]) {
    assert.match(scripts.test, new RegExp(requiredTest.replaceAll('.', '\\.')), `W15 full matrix includes ${requiredTest}`);
  }

  return Object.freeze({ ok: true, order: GOLDEN_PATH_ORDER });
}
