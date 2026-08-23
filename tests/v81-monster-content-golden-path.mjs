import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORKBOOK_CAPTURE_ADAPTER } from '../balance-config.mjs';
import { resolveOwnedBasicAiAction } from '../basic-ai-resolver.mjs';
import {
  createStandardBreedingEggTransaction,
  evaluateStandardBreedingCompatibility,
  hatchBreedingEggTransaction,
  isEggReadyToHatch,
} from '../breeding.mjs';
import { BUILD_PRESET_POLICY } from '../build-preset-catalog.mjs';
import {
  beginCaptureAttempt,
  commitCaptureAttempt,
  createCaptureAttemptLedger,
  resolveCaptureAttempt,
} from '../capture-transaction.mjs';
import { CONTENT_PROVENANCE } from '../content-provenance.mjs';
import { carePlay } from '../food-care.mjs';
import {
  commitEvolution,
  resolveWorkbookEvolutionStage,
  workbookEvolutionPathForSpecies,
} from '../evolution.mjs';
import {
  evoDefFromPath,
  growthExpForLevel,
  ranchTrainingGain,
} from '../live-progression.mjs';
import { monsterCatalogEntry } from '../monster-catalog.mjs';
import {
  addGrowthExp,
  addTrainingExp,
  normalizeInstance,
  trainingUsed,
} from '../monster-instance.mjs';
import { OWNED_BASIC_AI_POLICY } from '../runtime-policies.mjs';
import {
  LEGACY_SAVE_KEYS,
  SAVE_KEY,
  normalizeSavedState,
  readStoredSave,
  sanitizeStateForPersistence,
  writeStoredSave,
} from '../save-schema.mjs';
import {
  SKILL_COMMAND_RUNTIME_POLICY,
  executeEquippedSkillCommand,
} from '../skill-command-runtime.mjs';
import { skillCatalogEntry } from '../skill-catalog.mjs';
import {
  MANUAL_SKILL_SLOTS,
  manualSkillLoadout,
  synchronizeStage1Learnset,
} from '../skill-progression.mjs';
import { SKILL_RECOVERY_POLICY, recoverSkillUses } from '../skill-recovery.mjs';
import { resolveEncounterProfile } from '../stage-catalog.mjs';
import {
  A40_ACCEPTANCE_POLICY,
  GOLDEN_PATH_ORDER,
  assertGoldenPathLiveWiring,
} from './v81-golden-path-contract.mjs';

const NOW = 1_800_000_000_000;
const BREED_AT = NOW + 60_000;
const EGG_ID = '40404040-4040-4040-8040-404040404040';
const HERO_ID = 'golden-holder';
const RESERVE_ID = 'golden-reserve';
const PARTNER_ID = 'golden-breeding-partner';
const CAPTURED_ID = 'golden-captured';
const WILD_ID = 'golden-wild-stage2';

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
}

function owned(state, instanceId) {
  return state.collection.find(monster => monster.instanceId === instanceId) ?? null;
}

function assertOwnership(state, label) {
  assert.equal(state.party.length, 3, `${label}: Party has exactly three slots`);
  const ids = state.collection.map(monster => monster.instanceId);
  assert.equal(new Set(ids).size, ids.length, `${label}: Collection has no duplicate owned instance`);
  const partyIds = state.party.filter(Boolean);
  assert.equal(new Set(partyIds).size, partyIds.length, `${label}: Party has no duplicate ownership`);
  assert.equal(state.storage.some(id => partyIds.includes(id)), false, `${label}: Party and Storage are disjoint`);
  assert.equal(new Set(state.storage).size, state.storage.length, `${label}: Storage has no duplicate ownership`);
  assert.ok(state.ranchActive.length <= 6, `${label}: Ranch active cap remains six`);
  assert.ok(state.ranchActive.every(id => state.storage.includes(id)), `${label}: Ranch active is a Storage subset`);
}

function saveReload(state, storage, now, label) {
  const written = writeStoredSave(storage, { state, playerHp: 100 });
  assert.equal(written.state.saveVersion, 12, `${label}: save schema is current`);
  const read = readStoredSave(storage);
  assert.equal(read.source, 'current', `${label}: current save reloads`);
  const canonical = normalizeSavedState(read.state, { ranchCap: 6, now });
  assert.deepEqual(
    normalizeSavedState(canonical, { ranchCap: 6, now }),
    canonical,
    `${label}: migration is twice-is-same`,
  );
  assertOwnership(canonical, label);
  return canonical;
}

function usesBySlot(instance) {
  return Object.fromEntries(instance.skills
    .filter(skill => MANUAL_SKILL_SLOTS.includes(skill.slot))
    .map(skill => [skill.slot, skill.currentUses]));
}

assert.equal(CONTENT_PROVENANCE.sha256, A40_ACCEPTANCE_POLICY.workbookSha256);
assert.equal(WORKBOOK_CAPTURE_ADAPTER.rollAuthority, 'future_server_boundary');
assert.equal(SKILL_RECOVERY_POLICY.serverAuthorityClaim, false);
assert.equal(SKILL_COMMAND_RUNTIME_POLICY.canonicalEffectsResolved, 'phase_gated');
assert.equal(BUILD_PRESET_POLICY.activation, 'catalog_only');
assert.equal(workbookEvolutionPathForSpecies('flameling').activation, 'preview_only');
assert.equal(A40_ACCEPTANCE_POLICY.serverAuthorityClaim, false);
assert.equal(A40_ACCEPTANCE_POLICY.manualSkillCoverage, 'four_slot_command_boundary');
assert.deepEqual(A40_ACCEPTANCE_POLICY.targetKinds, ['NearestEnemy', 'EnemyArea', 'Self', 'GroundPoint']);
assert.deepEqual(A40_ACCEPTANCE_POLICY.deferredManualTargets, ['Self', 'GroundPoint']);
const workbookEvolutionPreview = workbookEvolutionPathForSpecies('flameling');
assert.equal(workbookEvolutionPreview.requiredLevelReference, 15);
assert.equal(workbookEvolutionPreview.requiredBondReference, 50);
assert.equal(workbookEvolutionPreview.activation, 'preview_only');
assert.equal(workbookEvolutionPreview.runtimeEvolutionDecision, 'D4_LIVE_LV2_UNCHANGED');

const liveLevelTwoEvolutionProbe = normalizeInstance({
  instanceId: 'golden-live-lv2-evolution',
  speciesId: 'flameling',
  formId: 'flameling',
  level: 2,
  growthExp: growthExpForLevel(2),
  mind: { bond: 0 },
}, { now: NOW });
const liveLevelTwoDefinition = evoDefFromPath({
  id: 'flameling_lv2',
  fromFormId: 'flameling',
  toFormId: 'flameling_lv2',
  statMods: { hp: 1.08, atk: 1.18, def: 1.06, spd: 1.10 },
  requires: { level: 2 },
}, liveLevelTwoEvolutionProbe.speciesId);
assert.equal(commitEvolution(liveLevelTwoEvolutionProbe, liveLevelTwoDefinition, { now: NOW + 1 }).ok, true);
assert.equal(liveLevelTwoEvolutionProbe.formId, 'flameling_lv2', 'live Lv.2 evolution baseline remains active');

const fresh = normalizeSavedState({}, { ranchCap: 6, now: NOW });
assert.deepEqual(fresh.party, [null, null, null]);
assert.deepEqual(fresh.storage, []);
assert.deepEqual(fresh.ranchActive, []);
assert.equal(fresh.inventory.captureBalls, 12);

let hero = normalizeInstance({
  instanceId: HERO_ID,
  speciesId: 'flameling',
  formId: 'flameling',
  level: 19,
  growthExp: growthExpForLevel(19),
  gender: 'Female',
  mind: { bond: 50 },
  hp: 100,
  maxHp: 100,
  skills: [],
}, { now: NOW });
const reserve = normalizeInstance({
  instanceId: RESERVE_ID,
  speciesId: 'aquapuff',
  formId: 'aquapuff',
  level: 1,
  gender: 'Female',
  hp: 100,
  maxHp: 100,
}, { now: NOW });
const breedingPartner = normalizeInstance({
  instanceId: PARTNER_ID,
  speciesId: 'normalooze',
  formId: 'MON_019',
  level: 20,
  growthExp: growthExpForLevel(20),
  gender: 'Male',
  mind: { bond: 50 },
  breedingCooldownUntil: null,
  hp: 100,
  maxHp: 100,
}, { now: NOW });

const learned = synchronizeStage1Learnset(hero);
assert.equal(learned.ok, true);
assert.deepEqual(
  manualSkillLoadout(hero).map(entry => entry.skillId),
  ['SK_FIRE_01', 'SK_FIRE_02', 'SK_FIRE_04', 'SK_FIRE_03'],
  'the holder owns the workbook four-slot field loadout',
);

let state = {
  collection: [hero, reserve, breedingPartner],
  party: [HERO_ID, RESERVE_ID, null],
  storage: [PARTNER_ID],
  ranchActive: [],
  selectedSlot: 0,
  inventory: { captureBalls: 3 },
  eggs: [],
  currentZone: 'grass-meadow',
  lifeLastAt: NOW,
};
assertOwnership(normalizeSavedState(state, { now: NOW }), 'initial ownership');

const operationalTrace = [];
const saveCheckpoints = [];

// Spawn: use the same stage/species/capture-policy resolver as createWild().
const encounter = resolveEncounterProfile({
  stageId: 'grass-meadow',
  runtimeSpeciesId: 'normalooze',
  variant: 'normal',
  level: 1,
  capturePolicy: 'normal',
});
assert.equal(encounter.ok, true, JSON.stringify(encounter.issues));
assert.equal(encounter.capturePolicy, 'normal');
const partnerMapping = monsterCatalogEntry('normalooze');
assert.equal(encounter.workbookMonsterId, 'MON_001');
assert.equal(partnerMapping.workbookStage2MonsterId, 'MON_019');
const captureWorkbookMonsterId = partnerMapping.workbookBaseMonsterId;
const wild = Object.freeze({
  id: WILD_ID,
  alive: true,
  targetable: true,
  position: Object.freeze({ x: 1, z: 0 }),
});
operationalTrace.push('Spawn');

// Summon: the DOM/Three transition is verified statically below; this local
// variable is only the deterministic seam supplied to the pure resolvers.
let activeOwnedMonsterId = HERO_ID;
assert.ok(state.party.includes(activeOwnedMonsterId));
operationalTrace.push('Summon');

const actor = Object.freeze({
  id: HERO_ID,
  speciesId: hero.speciesId,
  alive: true,
  position: Object.freeze({ x: 0, z: 0 }),
});
const usesBeforeAi = usesBySlot(hero);
const ai = resolveOwnedBasicAiAction({
  actor,
  enemies: [wild],
  currentTargetId: null,
  attackReady: true,
});
assert.equal(ai.ok, true);
assert.equal(ai.action, 'basic_attack');
assert.equal(ai.commandSource, 'basicAI');
assert.equal(ai.usesConsumed, 0);
assert.equal('slot' in ai, false);
assert.deepEqual(usesBySlot(hero), usesBeforeAi, 'Basic AI never consumes manual Uses');
assert.equal(OWNED_BASIC_AI_POLICY.manualSkillSlots, 'never');
operationalTrace.push('Basic AI');

const entityById = new Map([[actor.id, actor], [wild.id, wild]]);
const manualCounters = { applications: 0, cooldowns: 0, effects: 0 };
const targetKindsSeen = new Set();
function liveCompatibilityReady(command) {
  const definition = skillCatalogEntry(command.skillId);
  return Boolean(definition?.directDamage
    && (command.targetKind === 'NearestEnemy' || command.targetKind === 'EnemyArea'));
}
const beforeManualUses = usesBySlot(hero);
for (let index = 0; index < MANUAL_SKILL_SLOTS.length; index += 1) {
  const slot = MANUAL_SKILL_SLOTS[index];
  const usesBeforeCommand = usesBySlot(hero);
  const countersBeforeCommand = { ...manualCounters };
  const result = executeEquippedSkillCommand(hero, {
    slot,
    commandId: `golden-skill-${index + 1}`,
    actor,
    enemies: [wild],
    cooldownRemainingSec: 0,
  }, {
    materializeTargets(command) {
      return command.targetIds.map(id => entityById.get(id));
    },
    canApply(command) {
      targetKindsSeen.add(command.targetKind);
      return liveCompatibilityReady(command);
    },
    applyAccepted(command, targets) {
      manualCounters.applications += 1;
      manualCounters.cooldowns += 1;
      manualCounters.effects += 1;
      return Object.freeze({ skillId: command.skillId, targetIds: targets.map(target => target.id) });
    },
  });
  assert.equal(result.command.slot, slot);
  if (index < 3) {
    assert.equal(result.ok, true, `${slot}: ${result.reason}`);
    assert.equal(usesBySlot(hero)[slot], usesBeforeCommand[slot] - 1, `${slot} consumes exactly one Use`);
  } else {
    assert.equal(result.ok, false, `${slot}: deferred Self must fail closed`);
    assert.equal(result.reason, 'not_ready');
    assert.equal(result.stage, 'readiness');
    assert.equal(result.command.targetKind, 'Self');
    assert.equal(result.consumed, 0);
    assert.deepEqual(usesBySlot(hero), usesBeforeCommand, 'deferred Self mutates no Uses');
    assert.deepEqual(manualCounters, countersBeforeCommand, 'deferred Self starts no cooldown/effect/apply');
  }
  operationalTrace.push(`Skill ${index + 1}`);
}
assert.deepEqual(manualCounters, { applications: 3, cooldowns: 3, effects: 3 });
assert.deepEqual(usesBySlot(hero), {
  s1: beforeManualUses.s1 - 1,
  s2: beforeManualUses.s2 - 1,
  s3: beforeManualUses.s3 - 1,
  s4: beforeManualUses.s4,
});

// GroundPoint is a real Stage1 Frost Slime field slot. It resolves geometry,
// then the live compatibility readiness gate rejects the deferred field effect
// before Uses, cooldown, presentation, or application can mutate.
const groundCaster = normalizeInstance({
  instanceId: 'golden-ground-caster',
  speciesId: 'frostowl',
  formId: 'frostowl',
  level: 10,
  growthExp: growthExpForLevel(10),
  skills: [],
}, { now: NOW });
assert.equal(synchronizeStage1Learnset(groundCaster).ok, true);
assert.equal(manualSkillLoadout(groundCaster)[2].skillId, 'SK_ICE_04');
const groundActor = Object.freeze({
  id: groundCaster.instanceId,
  speciesId: groundCaster.speciesId,
  alive: true,
  position: Object.freeze({ x: 0, z: 0 }),
});
const groundUsesBefore = usesBySlot(groundCaster);
const groundCountersBefore = { ...manualCounters };
const groundResult = executeEquippedSkillCommand(groundCaster, {
  slot: 's3',
  commandId: 'golden-ground-point',
  actor: groundActor,
  enemies: [wild],
  groundPoint: { x: 3, z: 4 },
  cooldownRemainingSec: 0,
}, {
  materializeTargets(command) { return command.targetIds.map(id => entityById.get(id)); },
  canApply(command) {
    targetKindsSeen.add(command.targetKind);
    return liveCompatibilityReady(command);
  },
  applyAccepted() {
    manualCounters.applications += 1;
    manualCounters.cooldowns += 1;
    manualCounters.effects += 1;
  },
});
assert.equal(groundResult.ok, false);
assert.equal(groundResult.reason, 'not_ready');
assert.equal(groundResult.stage, 'readiness');
assert.equal(groundResult.command.targetKind, 'GroundPoint');
assert.deepEqual(groundResult.command.targetPoint, { x: 3, z: 4 });
assert.equal(groundResult.consumed, 0);
assert.deepEqual(usesBySlot(groundCaster), groundUsesBefore, 'deferred GroundPoint mutates no Uses');
assert.deepEqual(manualCounters, groundCountersBefore, 'deferred GroundPoint starts no cooldown/effect/apply');
assert.deepEqual([...targetKindsSeen], A40_ACCEPTANCE_POLICY.targetKinds);

const captureLedger = createCaptureAttemptLedger();
const ballsBeforeRecallProbe = state.inventory.captureBalls;
const blockedBeforeRecall = beginCaptureAttempt(captureLedger, {
  attemptId: 'golden-before-recall',
  inventory: state.inventory,
  targetId: WILD_ID,
  targetMonsterId: captureWorkbookMonsterId,
  ballClass: 'Basic',
  ballTargetType: null,
  referenceLevel: hero.level,
  ownedMonsterActive: activeOwnedMonsterId !== null,
});
assert.equal(blockedBeforeRecall.ok, false);
assert.equal(blockedBeforeRecall.reason, 'active_monster_must_recall');
assert.equal(state.inventory.captureBalls, ballsBeforeRecallProbe, 'blocked Capture consumes no ball');

activeOwnedMonsterId = null;
operationalTrace.push('Recall');

const begun = beginCaptureAttempt(captureLedger, {
  attemptId: 'golden-capture',
  inventory: state.inventory,
  targetId: WILD_ID,
  targetMonsterId: captureWorkbookMonsterId,
  ballClass: 'Basic',
  ballTargetType: null,
  referenceLevel: hero.level,
  ownedMonsterActive: false,
});
assert.equal(begun.ok, true, begun.reason);
assert.equal(begun.ballConsumed, true);
assert.equal(state.inventory.captureBalls, ballsBeforeRecallProbe - 1);

let captureRolls = 0;
const resolved = resolveCaptureAttempt(captureLedger, {
  attemptId: 'golden-capture',
  projectileHit: true,
  calculatorInput: {
    targetId: WILD_ID,
    monsterId: captureWorkbookMonsterId,
    currentHp: 1,
    maxHp: 100,
    activeStatusIds: [],
    ballClass: 'Basic',
    ballTargetType: null,
    targetSecondaryType: null,
    targetLevel: 1,
    referenceLevel: hero.level,
    variant: 'Normal',
    ownedMonsterActive: false,
    ballQuantity: begun.attempt.ballQuantityBefore,
    projectileHit: true,
    targetAlive: true,
  },
  rng() {
    captureRolls += 1;
    return 0;
  },
});
assert.equal(resolved.ok, true, resolved.reason);
assert.equal(resolved.attempt.resolution.captureSucceeded, true);
assert.equal(resolved.attempt.resolution.captureProfile.monsterId, 'MON_001');
assert.equal(resolved.attempt.resolution.captureProfile.stage, 1);
assert.equal(captureRolls, 1);

let captureFactoryCalls = 0;
let captureRewardCalls = 0;
const committedCapture = commitCaptureAttempt(captureLedger, {
  attemptId: 'golden-capture',
  onSuccess(attempt) {
    captureFactoryCalls += 1;
    captureRewardCalls += 1;
    const profile = attempt.resolution.captureProfile;
    const captured = normalizeInstance({
      instanceId: CAPTURED_ID,
      speciesId: 'normalooze',
      formId: 'normalooze',
      level: 1,
      growthExp: growthExpForLevel(1),
      gender: 'Female',
      mind: { bond: profile.baseBond },
      hp: 100,
      maxHp: 100,
      origin: 'captured',
    }, { now: NOW });
    state.collection.push(captured);
    const empty = state.party.findIndex(id => id === null);
    assert.notEqual(empty, -1, 'Golden Path keeps one Party slot for the captured partner');
    state.party[empty] = captured.instanceId;
    return { ownedMonsterId: captured.instanceId, destination: 'party', playerExp: 12 };
  },
  onFailure() { assert.fail('deterministic zero roll must capture'); },
});
assert.equal(committedCapture.ok, true, committedCapture.reason);
const captureReplay = commitCaptureAttempt(captureLedger, {
  attemptId: 'golden-capture',
  onSuccess() { captureFactoryCalls += 1; },
  onFailure() { assert.fail('successful capture cannot replay as failure'); },
});
assert.equal(captureReplay.replay, true);
assert.equal(captureReplay.sideEffectApplied, false);
assert.equal(captureFactoryCalls, 1);
assert.equal(captureRewardCalls, 1);
assert.equal(state.collection.filter(monster => monster.instanceId === CAPTURED_ID).length, 1);
operationalTrace.push('Capture');

const storage = new MemoryStorage();
state = saveReload(state, storage, NOW + 1, 'after capture');
saveCheckpoints.push('capture');
assert.equal(state.inventory.captureBalls, ballsBeforeRecallProbe - 1);
assert.equal(state.collection.filter(monster => monster.instanceId === CAPTURED_ID).length, 1);
assert.equal('captureAttemptLedger' in state, false, 'capture ledger remains transient across reload');
hero = owned(state, HERO_ID);
let partner = owned(state, PARTNER_ID);
const captured = owned(state, CAPTURED_ID);

const capturedPartySlot = state.party.indexOf(CAPTURED_ID);
assert.notEqual(capturedPartySlot, -1);
assert.ok(state.party.filter(Boolean).length > 1, 'deposit leaves another Party monster');
state.party[capturedPartySlot] = null;
if (!state.storage.includes(CAPTURED_ID)) state.storage.push(CAPTURED_ID);
state.ranchActive.push(CAPTURED_ID);
const trainingBefore = trainingUsed(captured);
const ranchGain = ranchTrainingGain(captured, 'power', 15, NOW + 2);
assert.ok(ranchGain > 0);
addTrainingExp(captured, 'power', ranchGain);
assert.ok(trainingUsed(captured) > trainingBefore);
const capturedBondBeforeCare = captured.mind.bond;
carePlay(captured, { now: NOW + 10 });
assert.ok(captured.mind.bond > capturedBondBeforeCare, 'captured monster remains usable by Ranch care');
assertOwnership(state, 'Ranch');
operationalTrace.push('Ranch');

const usesBeforeKeeper = usesBySlot(hero);
assert.deepEqual(usesBeforeKeeper, {
  s1: beforeManualUses.s1 - 1,
  s2: beforeManualUses.s2 - 1,
  s3: beforeManualUses.s3 - 1,
  s4: beforeManualUses.s4,
});
const keeper = recoverSkillUses(state.collection, { routeId: 'REC_NPC', commandId: 'golden-keeper' });
assert.equal(keeper.ok, true, keeper.reason);
assert.equal(keeper.recoveredSkills, 3);
assert.equal(recoverSkillUses(state.collection, { routeId: 'REC_NPC', commandId: 'golden-keeper' }).reason, 'duplicate_command');
for (const entry of manualSkillLoadout(hero)) {
  assert.equal(entry.skill.currentUses, skillCatalogEntry(entry.skillId).maxUses);
}
operationalTrace.push('Keeper');

const growthTarget = growthExpForLevel(20);
const growth = addGrowthExp(hero, growthTarget - hero.growthExp);
assert.equal(growth.toLevel, 20);
assert.equal(hero.level, 20);
operationalTrace.push('Growth');

const liveFlamelingPath = {
  id: 'flameling_lv2',
  fromFormId: 'flameling',
  toFormId: 'flameling_lv2',
  name: 'Flameling',
  statMods: { hp: 1.08, atk: 1.18, def: 1.06, spd: 1.10 },
  requires: { level: 2 },
};
const heroIdentityBeforeEvolution = hero.instanceId;
const evolution = commitEvolution(hero, evoDefFromPath(liveFlamelingPath, hero.speciesId), { now: NOW + 20 });
assert.equal(evolution.ok, true, evolution.reason);
assert.equal(hero.instanceId, heroIdentityBeforeEvolution);
const heroStage = resolveWorkbookEvolutionStage(hero);
assert.equal(heroStage.stage2, true);
assert.equal(heroStage.stageEvidence, 'live_evolution_history');
operationalTrace.push('Evolution');

const heroPartySlot = state.party.indexOf(HERO_ID);
assert.notEqual(heroPartySlot, -1);
assert.ok(state.party.filter(Boolean).length > 1, 'reserve keeps Party non-empty while Holder enters Storage');
state.party[heroPartySlot] = null;
if (!state.storage.includes(HERO_ID)) state.storage.push(HERO_ID);
if (!state.ranchActive.includes(HERO_ID)) state.ranchActive.push(HERO_ID);
assertOwnership(state, 'breeding parents in Ranch');

const compatibility = evaluateStandardBreedingCompatibility(hero, partner, { now: BREED_AT });
assert.equal(compatibility.ok, true, compatibility.reason);
assert.equal(compatibility.breedingGroup, 'Field');
assert.deepEqual([hero.gender, partner.gender], ['Female', 'Male']);
assert.deepEqual([hero.level, partner.level], [20, 20]);
assert.deepEqual([hero.mind.bond, partner.mind.bond], [50, 50]);

const eggCommand = Object.freeze({
  eggId: EGG_ID,
  eggHolderOwnedMonsterId: HERO_ID,
  partnerOwnedMonsterId: PARTNER_ID,
  genderSeed: 7,
  now: BREED_AT,
});
const createdEgg = createStandardBreedingEggTransaction(state, eggCommand);
assert.equal(createdEgg.ok, true, createdEgg.reason);
assert.equal(createdEgg.replay, false);
assert.equal(createdEgg.state.eggs.length, 1);
assert.equal(createdEgg.egg.childMonsterId, 'MON_002');
assert.equal(createdEgg.egg.hatchAt, BREED_AT + 15 * 60 * 1000);
assert.equal(isEggReadyToHatch(createdEgg.egg, createdEgg.egg.hatchAt - 1), false);
state = createdEgg.state;
const eggReplayBeforeSave = createStandardBreedingEggTransaction(state, eggCommand);
assert.equal(eggReplayBeforeSave.ok, true);
assert.equal(eggReplayBeforeSave.replay, true);
assert.equal(eggReplayBeforeSave.state, state);
operationalTrace.push('Breed');

state = saveReload(state, storage, BREED_AT, 'after egg');
saveCheckpoints.push('egg');
assert.equal(state.eggs.length, 1);
assert.equal(state.eggs[0].hatchAt, createdEgg.egg.hatchAt, 'reload never shifts hatchAt');
const eggReplayAfterSave = createStandardBreedingEggTransaction(state, eggCommand);
assert.equal(eggReplayAfterSave.ok, true, eggReplayAfterSave.reason);
assert.equal(eggReplayAfterSave.replay, true, 'persisted egg command remains idempotent');

const earlyHatch = hatchBreedingEggTransaction(state, { eggId: EGG_ID, now: createdEgg.egg.hatchAt - 1 });
assert.equal(earlyHatch.ok, false);
assert.equal(earlyHatch.reason, 'egg_not_ready');
const hatched = hatchBreedingEggTransaction(state, { eggId: EGG_ID, now: createdEgg.egg.hatchAt });
assert.equal(hatched.ok, true, hatched.reason);
assert.equal(hatched.state.collection.length, state.collection.length + 1);
assert.equal(hatched.child.level, 1);
assert.deepEqual(hatched.child.parents, { a: HERO_ID, b: PARTNER_ID });
state = hatched.state;
const hatchReplayBeforeSave = hatchBreedingEggTransaction(state, { eggId: EGG_ID, now: createdEgg.egg.hatchAt + 1 });
assert.equal(hatchReplayBeforeSave.ok, false);
assert.equal(hatchReplayBeforeSave.reason, 'egg_already_hatched');
assert.equal(state.collection.filter(monster => monster.instanceId === hatched.child.instanceId).length, 1);
operationalTrace.push('Hatch');

state = saveReload(state, storage, createdEgg.egg.hatchAt + 2, 'after hatch');
saveCheckpoints.push('hatch');
const persistedChild = owned(state, hatched.child.instanceId);
assert.ok(persistedChild);
assert.deepEqual(persistedChild.parents, { a: HERO_ID, b: PARTNER_ID });
assert.equal(state.storage.filter(id => id === persistedChild.instanceId).length, 1);
const hatchReplayAfterSave = hatchBreedingEggTransaction(state, { eggId: EGG_ID, now: createdEgg.egg.hatchAt + 3 });
assert.equal(hatchReplayAfterSave.reason, 'egg_already_hatched');
assert.equal(state.collection.filter(monster => monster.instanceId === persistedChild.instanceId).length, 1);
operationalTrace.push('Save/Reload');

assert.deepEqual(operationalTrace, GOLDEN_PATH_ORDER);
assert.deepEqual(saveCheckpoints, ['capture', 'egg', 'hatch']);
assert.equal(new Set(state.collection.map(monster => monster.instanceId)).size, state.collection.length);
for (const forbiddenScopeField of ['dex', 'seen', 'raised', 'serverAuthority', 'captureAttemptLedger']) {
  assert.equal(forbiddenScopeField in state, false, `${forbiddenScopeField} is outside A40 persistence scope`);
}

const bossLedger = createCaptureAttemptLedger();
const bossInventory = { captureBalls: 1 };
assert.equal(beginCaptureAttempt(bossLedger, {
  attemptId: 'golden-boss-disabled',
  inventory: bossInventory,
  targetId: 'boss-target',
  targetMonsterId: 'MON_019',
  ballClass: 'Basic',
  ballTargetType: null,
  referenceLevel: 20,
  ownedMonsterActive: false,
}).ok, true);
let bossRolls = 0;
const bossResolution = resolveCaptureAttempt(bossLedger, {
  attemptId: 'golden-boss-disabled',
  projectileHit: true,
  calculatorInput: {
    targetId: 'boss-target', monsterId: 'MON_019', currentHp: 1, maxHp: 100,
    activeStatusIds: [], ballClass: 'Basic', ballTargetType: null,
    targetSecondaryType: null, targetLevel: 20, referenceLevel: 20,
    variant: 'Boss', ownedMonsterActive: false, ballQuantity: 1,
    projectileHit: true, targetAlive: true,
  },
  rng() { bossRolls += 1; return 0; },
});
assert.equal(bossResolution.attempt.resolution.reason, 'capture_disabled');
assert.equal(bossResolution.attempt.resolution.captureSucceeded, false);
assert.equal(bossRolls, 0, 'Boss capture never rolls');

const capIds = Array.from({ length: 7 }, (_, index) => `cap-${index}`);
const capState = normalizeSavedState({
  collection: capIds.map(instanceId => ({ instanceId, speciesId: 'normalooze' })),
  party: [null, null, null],
  storage: capIds,
  ranchActive: capIds,
}, { ranchCap: 6, now: NOW });
assert.equal(capState.ranchActive.length, 6);

const transientProbe = sanitizeStateForPersistence({
  ...state,
  cooldownRemaining: 9,
  skillCds: [1, 2, 3, 4],
  collection: state.collection.map((monster, index) => index === 0
    ? { ...monster, cooldownRemainingMs: 5000, passiveRuntimeState: { stale: true } }
    : monster),
});
assert.equal('cooldownRemaining' in transientProbe, false);
assert.equal('skillCds' in transientProbe, false);
assert.ok(transientProbe.collection.every(monster => !('cooldownRemainingMs' in monster)));
assert.ok(transientProbe.collection.every(monster => !('passiveRuntimeState' in monster)));

for (const [caseIndex, saveVersion] of [5, 8, 9].entries()) {
  const legacyStorage = new MemoryStorage();
  const legacyKey = LEGACY_SAVE_KEYS[caseIndex % LEGACY_SAVE_KEYS.length];
  const partyId = `legacy-party-v${saveVersion}`;
  const ranchId = `legacy-ranch-v${saveVersion}`;
  const legacyEgg = saveVersion === 9 ? [{
    eggId: `legacy-egg-v${saveVersion}`,
    parentAId: partyId,
    readyAt: NOW + 30_000,
    potentialValues: [1, 2, 3],
    child: { speciesId: 'flameling' },
  }] : [];
  legacyStorage.setItem(legacyKey, JSON.stringify({
    state: {
      saveVersion,
      collection: [
        { instanceId: partyId, speciesId: 'flameling', formId: 'flameling', level: 5, cooldownRemainingMs: 900 },
        { instanceId: ranchId, speciesId: 'normalooze', formId: 'normalooze', level: 3 },
      ],
      party: [partyId, null, null],
      storage: [ranchId],
      ranchActive: [ranchId],
      inventory: { captureBalls: 4 },
      eggs: legacyEgg,
      rewardProgress: { preserved: true },
      skillCds: [1, 2, 3, 4],
    },
    playerHp: 88,
  }));
  const legacyRead = readStoredSave(legacyStorage);
  assert.equal(legacyRead.source, legacyKey);
  const legacyMigrated = normalizeSavedState(legacyRead.state, { ranchCap: 6, now: NOW });
  assert.deepEqual(legacyMigrated.collection.map(monster => monster.instanceId), [partyId, ranchId]);
  assert.deepEqual(legacyMigrated.party, [partyId, null, null]);
  assert.deepEqual(legacyMigrated.storage, [ranchId]);
  assert.deepEqual(legacyMigrated.ranchActive, [ranchId]);
  assert.equal(legacyMigrated.inventory.captureBalls, 4);
  assert.deepEqual(legacyMigrated.rewardProgress, { preserved: true });
  assert.equal('skillCds' in legacyMigrated, false);
  assert.ok(legacyMigrated.collection.every(monster => !('cooldownRemainingMs' in monster)));
  if (saveVersion === 9) assert.deepEqual(legacyMigrated.eggs[0], legacyEgg[0], 'legacy egg is quarantined without lossy guessing');
  assert.deepEqual(
    normalizeSavedState(legacyMigrated, { ranchCap: 6, now: NOW }),
    legacyMigrated,
    `legacy v${saveVersion} migration is twice-is-same`,
  );
  assert.equal(legacyStorage.getItem(SAVE_KEY), null, 'read-only legacy migration does not overwrite before the live save boundary');
}

const root = new URL('../', import.meta.url);
assertGoldenPathLiveWiring({
  js: fs.readFileSync(new URL('game-v800.js', root), 'utf8'),
  packageJson: fs.readFileSync(new URL('package.json', root), 'utf8'),
});

console.log('V8.1 A40 Monster Content integrated Golden Path acceptance: PASS');
