import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveOwnedBasicAiAction } from '../basic-ai-resolver.mjs';
import {
  createStandardBreedingEggTransaction,
  evaluateStandardBreedingCompatibility,
  hatchBreedingEggTransaction,
} from '../breeding.mjs';
import {
  beginCaptureAttempt,
  commitCaptureAttempt,
  createCaptureAttemptLedger,
  resolveCaptureAttempt,
} from '../capture-transaction.mjs';
import { commitEvolution } from '../evolution.mjs';
import { evoDefFromPath, growthExpForLevel } from '../live-progression.mjs';
import { normalizeInstance } from '../monster-instance.mjs';
import { normalizeSavedState } from '../save-schema.mjs';
import { executeEquippedSkillCommand } from '../skill-command-runtime.mjs';
import { recoverSkillUses } from '../skill-recovery.mjs';
import { assertGoldenPathLiveWiring } from './v81-golden-path-contract.mjs';

const root = new URL('../', import.meta.url);
const liveSource = fs.readFileSync(new URL('game-v800.js', root), 'utf8');
const packageSource = fs.readFileSync(new URL('package.json', root), 'utf8');

function replaceOnce(source, before, after) {
  const mutated = source.replace(before, after);
  assert.notEqual(mutated, source, `mutation target missing: ${before}`);
  return mutated;
}

assertGoldenPathLiveWiring({ js: liveSource, packageJson: packageSource });

const liveMutants = [
  ['bypass spawn encounter profile', source => replaceOnce(source, 'const encounterProfile=resolveEncounterProfile(', 'const encounterProfile=mutantEncounterProfile(')],
  ['skip configured spawn list', source => replaceOnce(source, 'spawnRecords(cfg.spawn);', 'mutantSpawnRecords(cfg.spawn);')],
  ['allow two active summons', source => replaceOnce(source, 'if(activeSummon||pendingSummon){msg(\'ลงสนามได้ครั้งละ 1 ตัว • Recall ตัวเดิมก่อน\');return;}', "if(false){msg('mutant');return;}")],
  ['detach Basic AI resolver', source => replaceOnce(source, 'const decision=resolveOwnedBasicAiAction(', 'const decision=mutantOwnedBasicAiAction(')],
  ['let Basic AI enter manual command runtime', source => replaceOnce(source, 'const decision=resolveOwnedBasicAiAction(', 'executeEquippedSkillCommand();const decision=resolveOwnedBasicAiAction(')],
  ['detach manual command runtime', source => replaceOnce(source, 'const result=executeEquippedSkillCommand(a.inst,{', 'const result=mutantEquippedSkillCommand(a.inst,{')],
  ['force every manual button through slot one', source => replaceOnce(source, 'slot=MANUAL_SKILL_SLOTS[index]', 'slot=MANUAL_SKILL_SLOTS[0]')],
  ['drop GroundPoint from the live command', source => replaceOnce(source, 'groundPoint:intent.groundPoint??null', 'groundPoint:null')],
  ['bypass live effect readiness', source => replaceOnce(source, 'canApply:(command,targets)=>canApplyLiveSkill(a,move,command,targets)', 'canApply:()=>true')],
  ['replace accepted live effect with no-op', source => replaceOnce(source, 'applyAccepted:(command,targets)=>applyAcceptedSkillCommand(a,index,move,command,targets)', 'applyAccepted:()=>null')],
  ['drop reviewed effect coverage gate', source => replaceOnce(source, 'if(!canExecuteReviewedSkillEffect(command.skillId))return false;', 'if(false)return false;')],
  ['detach combat hotbar slot four', source => replaceOnce(source, "bindActionPress(el('skill4Btn'),()=>dispatchSkill(3));", "bindActionPress(el('skill4Btn'),()=>dispatchSkill(0));")],
  ['silently broaden deferred manual effects', source => replaceOnce(source, 'return validateReviewedSkillEffectRequest(canonicalSkillEffectRequest(a,move,command,materialized)).ok;', 'return true;')],
  ['leave summon active after Recall', source => replaceOnce(source, 'activeSummon=null;\n  removeSceneRole(\'activeSummon\');', "activeSummon=activeSummon;\n  removeSceneRole('activeSummon');")],
  ['allow Capture before Recall', source => replaceOnce(source, "if(activeSummon){msg('ต้อง Recall มอนของเราก่อนเข้าสู่ Capture Aim');return false;}", 'if(false){return false;}')],
  ['detach capture begin transaction', source => replaceOnce(source, 'const begun=beginCaptureAttempt(', 'const begun=mutantBeginCaptureAttempt(')],
  ['detach capture resolution transaction', source => replaceOnce(source, 'const resolved=resolveCaptureAttempt(', 'const resolved=mutantResolveCaptureAttempt(')],
  ['detach capture commit transaction', source => replaceOnce(source, 'const committed=commitCaptureAttempt(captureAttemptLedger,{attemptId:cs.attemptId', 'const committed=mutantCommitCaptureAttempt(captureAttemptLedger,{attemptId:cs.attemptId')],
  ['skip owned capture insertion', source => replaceOnce(source, 'state.collection.push(inst);', 'mutantCollection.push(inst);')],
  ['raise Ranch cap to seven', source => replaceOnce(source, 'const RANCH_ACTIVE_MAX=6;', 'const RANCH_ACTIVE_MAX=7;')],
  ['allow empty Party deposit', source => replaceOnce(source, "if(state.party.filter(Boolean).length<=1){msg('ต้องเหลือมอนอย่างน้อย 1 ตัวใน Party');return;}", 'if(false){return;}')],
  ['change Keeper route', source => replaceOnce(source, "recoverSkillUses(state.collection,{routeId:'REC_NPC'", "recoverSkillUses(state.collection,{routeId:'REC_MUTANT'")],
  ['detach Growth resolver', source => replaceOnce(source, 'addGrowthExp(inst,need);', 'mutantGrowthExp(inst,need);')],
  ['detach Evolution commit', source => replaceOnce(source, 'const committed=commitEvolution(inst,def,{now:Date.now()});', 'const committed=mutantEvolution(inst,def,{now:Date.now()});')],
  ['detach canonical egg create', source => replaceOnce(source, 'const result=createStandardBreedingEggTransaction(state,{eggId', 'const result=mutantCreateEgg(state,{eggId')],
  ['detach canonical hatch', source => replaceOnce(source, 'const result=hatchBreedingEggTransaction(state,{eggId,now});', 'const result=mutantHatchEgg(state,{eggId,now});')],
  ['skip save normalization', source => replaceOnce(source, 'const clean=normalizeSavedState(s,{ranchCap:RANCH_ACTIVE_MAX,now:Date.now()});', 'const clean=s;')],
  ['skip transient save sanitization', source => replaceOnce(source, 'sanitizeStateForPersistence(persistableState(state))', 'persistableState(state)')],
  ['detach local save writer', source => replaceOnce(source, 'const envelope=currentSaveEnvelope();\n  writeStoredSave(localStorage,envelope);', 'const envelope=currentSaveEnvelope();\n  mutantWriteStoredSave(localStorage,envelope);')],
  ['detach current/backup/legacy reader', source => replaceOnce(source, 'const saved=readStoredSave(localStorage);', 'const saved=mutantReadStoredSave(localStorage);')],
];

let killedLive = 0;
for (const [name, mutate] of liveMutants) {
  assert.throws(
    () => assertGoldenPathLiveWiring({ js: mutate(liveSource), packageJson: packageSource }),
    undefined,
    `${name} mutant survived`,
  );
  killedLive += 1;
}

function mutatePackage(mutator) {
  const parsed = JSON.parse(packageSource);
  mutator(parsed.scripts);
  return JSON.stringify(parsed);
}

const packageMutants = [
  ['drop focused A40 script', mutatePackage(scripts => { delete scripts['test:v81:golden-path']; })],
  ['drop A40 mutants', mutatePackage(scripts => { scripts['test:v81:golden-path'] = 'node tests/v81-monster-content-golden-path.mjs'; })],
  ['drop A40 from full CI', mutatePackage(scripts => { scripts.ci = scripts.ci.replace(' && npm run test:v81:golden-path', ''); })],
];

let killedPackage = 0;
for (const [name, mutantPackage] of packageMutants) {
  assert.throws(
    () => assertGoldenPathLiveWiring({ js: liveSource, packageJson: mutantPackage }),
    undefined,
    `${name} mutant survived`,
  );
  killedPackage += 1;
}

let behavioralGuards = 0;
function guard(name, assertion) {
  assert.doesNotThrow(assertion, name);
  behavioralGuards += 1;
}

guard('Recall-before-Capture blocks before inventory mutation', () => {
  const inventory = { captureBalls: 1 };
  const result = beginCaptureAttempt(createCaptureAttemptLedger(), {
    attemptId: 'mutant-active-capture', inventory, targetId: 'wild', targetMonsterId: 'MON_019',
    ballClass: 'Basic', ballTargetType: null, referenceLevel: 20, ownedMonsterActive: true,
  });
  assert.equal(result.reason, 'active_monster_must_recall');
  assert.equal(inventory.captureBalls, 1);
});

guard('Basic AI rejects manual command injection', () => {
  const result = resolveOwnedBasicAiAction({
    actor: { id: 'actor', speciesId: 'flameling', alive: true, position: { x: 0, z: 0 } },
    enemies: [], currentTargetId: null, attackReady: true, skillId: 'SK_FIRE_01',
  });
  assert.equal(result.reason, 'invalid_request_shape');
});

guard('fifth manual slot cannot consume Uses', () => {
  const instance = { instanceId: 'actor', speciesId: 'flameling', skills: [{ skillId: 'SK_FIRE_01', slot: 's1', currentUses: 28 }] };
  const before = structuredClone(instance.skills);
  const result = executeEquippedSkillCommand(instance, {
    slot: 's5', commandId: 'mutant-fifth-slot',
    actor: { id: 'actor', alive: true, position: { x: 0, z: 0 } },
    enemies: [{ id: 'wild', alive: true, targetable: true, position: { x: 1, z: 0 } }],
    cooldownRemainingSec: 0,
  }, { materializeTargets: () => [], canApply: () => true, applyAccepted: () => null });
  assert.equal(result.ok, false);
  assert.deepEqual(instance.skills, before);
});

guard('manual command replay cannot apply or consume twice', () => {
  const instance = { instanceId: 'actor', speciesId: 'flameling', skills: [{ skillId: 'SK_FIRE_01', slot: 's1', currentUses: 28 }] };
  const actor = { id: 'actor', alive: true, position: { x: 0, z: 0 } };
  const wild = { id: 'wild', alive: true, targetable: true, position: { x: 1, z: 0 } };
  let applies = 0;
  const request = { slot: 's1', commandId: 'mutant-replay', actor, enemies: [wild], cooldownRemainingSec: 0 };
  const hooks = {
    materializeTargets: command => command.targetIds.map(id => id === wild.id ? wild : actor),
    canApply: () => true,
    applyAccepted: () => { applies += 1; },
  };
  assert.equal(executeEquippedSkillCommand(instance, request, hooks).ok, true);
  assert.equal(executeEquippedSkillCommand(instance, request, hooks).reason, 'duplicate_cast');
  assert.equal(instance.skills[0].currentUses, 27);
  assert.equal(applies, 1);
});

guard('deferred Self and GroundPoint reject before Uses, cooldown, or effect mutation', () => {
  const instance = {
    instanceId: 'deferred-actor',
    speciesId: 'flameling',
    skills: [
      { skillId: 'SK_FIRE_03', slot: 's1', currentUses: 10 },
      { skillId: 'SK_ICE_04', slot: 's2', currentUses: 10 },
    ],
  };
  const actor = { id: instance.instanceId, alive: true, targetable: true, position: { x: 0, z: 0 } };
  const usesBefore = structuredClone(instance.skills);
  let applications = 0;
  const hooks = {
    materializeTargets: command => command.targetIds.map(id => id === actor.id ? actor : null),
    canApply: () => false,
    applyAccepted: () => { applications += 1; },
  };
  const self = executeEquippedSkillCommand(instance, {
    slot: 's1', commandId: 'deferred-self', actor, enemies: [], cooldownRemainingSec: 0,
  }, hooks);
  const ground = executeEquippedSkillCommand(instance, {
    slot: 's2', commandId: 'deferred-ground', actor, enemies: [],
    groundPoint: { x: 3, z: 4 }, cooldownRemainingSec: 0,
  }, hooks);
  assert.equal(self.reason, 'not_ready');
  assert.equal(self.command.targetKind, 'Self');
  assert.equal(ground.reason, 'not_ready');
  assert.equal(ground.command.targetKind, 'GroundPoint');
  assert.equal(self.consumed, 0);
  assert.equal(ground.consumed, 0);
  assert.deepEqual(instance.skills, usesBefore);
  assert.equal(applications, 0);
});

guard('capture callback replay cannot duplicate owned monster or reward', () => {
  const ledger = createCaptureAttemptLedger();
  const inventory = { captureBalls: 1 };
  beginCaptureAttempt(ledger, {
    attemptId: 'mutant-capture-replay', inventory, targetId: 'wild', targetMonsterId: 'MON_019',
    ballClass: 'Basic', ballTargetType: null, referenceLevel: 20, ownedMonsterActive: false,
  });
  resolveCaptureAttempt(ledger, {
    attemptId: 'mutant-capture-replay', projectileHit: true,
    calculatorInput: {
      targetId: 'wild', monsterId: 'MON_019', currentHp: 1, maxHp: 100, activeStatusIds: [],
      ballClass: 'Basic', ballTargetType: null, targetSecondaryType: null, targetLevel: 20,
      referenceLevel: 20, variant: 'Normal', ownedMonsterActive: false, ballQuantity: 1,
      projectileHit: true, targetAlive: true,
    },
    rng: () => 0,
  });
  let callbacks = 0;
  const hooks = { attemptId: 'mutant-capture-replay', onSuccess: () => { callbacks += 1; }, onFailure: () => {} };
  assert.equal(commitCaptureAttempt(ledger, hooks).sideEffectApplied, true);
  assert.equal(commitCaptureAttempt(ledger, hooks).sideEffectApplied, false);
  assert.equal(callbacks, 1);
});

guard('Ranch normalization kills the seventh active ID and duplicate ownership', () => {
  const ids = Array.from({ length: 7 }, (_, index) => `ranch-${index}`);
  const normalized = normalizeSavedState({
    collection: ids.map(instanceId => ({ instanceId, speciesId: 'normalooze' })),
    party: [ids[0], ids[0], null],
    storage: ids,
    ranchActive: ids,
  }, { ranchCap: 6, now: 1_800_000_000_000 });
  assert.deepEqual(normalized.party, [ids[0], null, null]);
  assert.equal(normalized.storage.includes(ids[0]), false);
  assert.equal(normalized.ranchActive.length, 6);
});

guard('Keeper route is explicit and command replay is rejected', () => {
  const collection = [{ skills: [{ skillId: 'SK_FIRE_01', slot: 's1', currentUses: 1 }] }];
  assert.equal(recoverSkillUses(collection, { routeId: 'REC_MUTANT', commandId: 'keeper-mutant' }).reason, 'unauthorized_route');
  assert.equal(recoverSkillUses(collection, { routeId: 'REC_NPC', commandId: 'keeper-once' }).ok, true);
  assert.equal(recoverSkillUses(collection, { routeId: 'REC_NPC', commandId: 'keeper-once' }).reason, 'duplicate_command');
});

guard('Evolution cannot commit twice or activate workbook preview semantics', () => {
  const instance = normalizeInstance({
    instanceId: 'evolution-mutant', speciesId: 'flameling', formId: 'flameling',
    level: 20, growthExp: growthExpForLevel(20), mind: { bond: 50 },
  }, { now: 1_800_000_000_000 });
  const definition = evoDefFromPath({
    id: 'flameling_lv2', fromFormId: 'flameling', toFormId: 'flameling_lv2',
    requires: { level: 2 }, statMods: { hp: 1.08, atk: 1.18, def: 1.06, spd: 1.10 },
  }, 'flameling');
  assert.equal(commitEvolution(instance, definition, { now: 1_800_000_000_001 }).ok, true);
  assert.equal(commitEvolution(instance, definition, { now: 1_800_000_000_002 }).reason, 'already_committed');
});

guard('breeding and hatch gates reject mutated gender, command identity, and clock', () => {
  const now = 1_800_000_000_000;
  const holder = normalizeInstance({
    instanceId: 'holder', speciesId: 'flameling', formId: 'MON_020', gender: 'Female',
    level: 20, mind: { bond: 50 }, breedingCooldownUntil: null,
  }, { now });
  const partner = normalizeInstance({
    instanceId: 'partner', speciesId: 'normalooze', formId: 'MON_019', gender: 'Male',
    level: 20, mind: { bond: 50 }, breedingCooldownUntil: null,
  }, { now });
  assert.equal(evaluateStandardBreedingCompatibility({ ...holder, gender: 'Male' }, partner, { now }).reason, 'breeding_gender_gate');
  const initial = { collection: [holder, partner], party: [null, null, null], storage: ['holder', 'partner'], ranchActive: [], eggs: [] };
  const command = {
    eggId: '50505050-5050-4050-8050-505050505050',
    eggHolderOwnedMonsterId: 'holder', partnerOwnedMonsterId: 'partner', genderSeed: 7, now,
  };
  const created = createStandardBreedingEggTransaction(initial, command);
  assert.equal(created.ok, true, created.reason);
  assert.equal(createStandardBreedingEggTransaction(created.state, { ...command, genderSeed: 8 }).reason, 'egg_id_conflict');
  assert.equal(hatchBreedingEggTransaction(created.state, { eggId: command.eggId, now: created.egg.hatchAt - 1 }).reason, 'egg_not_ready');
  const hatched = hatchBreedingEggTransaction(created.state, { eggId: command.eggId, now: created.egg.hatchAt });
  assert.equal(hatched.ok, true, hatched.reason);
  assert.equal(hatchBreedingEggTransaction(hatched.state, { eggId: command.eggId, now: created.egg.hatchAt + 1 }).reason, 'egg_already_hatched');
  assert.equal(hatched.state.collection.filter(monster => monster.instanceId === hatched.child.instanceId).length, 1);
});

assert.equal(killedLive, liveMutants.length);
assert.equal(killedPackage, packageMutants.length);
assert.equal(behavioralGuards, 10);
console.log(`V8.1 A40 Golden Path mutants: PASS (${killedLive + killedPackage} source/package mutants killed; ${behavioralGuards} behavioral guards)`);
