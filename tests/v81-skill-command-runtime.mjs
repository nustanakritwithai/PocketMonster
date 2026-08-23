import assert from 'node:assert/strict';
import { skillCatalogEntry } from '../skill-catalog.mjs';
import { getSkill } from '../skill-progression.mjs';
import { commitEquippedSkillCommand } from '../targeting-resolver.mjs';
import {
  executeEquippedSkillCommand,
  SKILL_COMMAND_RUNTIME_POLICY,
  SKILL_COMMAND_RUNTIME_REASONS,
} from '../skill-command-runtime.mjs';

function fixture() {
  const instance = {
    instanceId: 'caster',
    speciesId: 'flameling',
    skills: [
      { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 28 },
      { skillId: 'SK_GRASS_05', slot: 's2', currentUses: 8 },
      { skillId: 'SK_FIRE_04', slot: 's3', currentUses: 10 },
      { skillId: 'SK_ICE_04', slot: 's4', currentUses: 10 },
    ],
  };
  const actor = { id: 'caster', alive: true, position: { x: 0, z: 0 } };
  const enemies = [
    { id: 'enemy-a', alive: true, targetable: true, position: { x: 1, z: 0 } },
    { id: 'enemy-b', alive: true, targetable: true, position: { x: 3, z: 0 } },
    { id: 'enemy-c', alive: true, targetable: true, position: { x: 4.6, z: 0 } },
  ];
  const entities = new Map([[actor.id, actor], ...enemies.map(enemy => [enemy.id, enemy])]);
  const counters = { applies: 0, cooldownStarts: 0, effects: 0 };
  const applications = [];
  const hooks = {
    materializeTargets(command) {
      return command.targetIds.map(targetId => entities.get(targetId));
    },
    canApply() {
      return true;
    },
    applyAccepted(command, targets) {
      counters.applies += 1;
      counters.cooldownStarts += 1;
      counters.effects += 1;
      const application = {
        skillId: command.skillId,
        targetIds: targets.map(target => target.id),
        targetPoint: command.targetPoint,
        cooldownSec: command.startCooldownSec,
      };
      applications.push(application);
      return application;
    },
  };
  return { instance, actor, enemies, entities, counters, applications, hooks };
}

function request(state, slot, commandId, extra = {}) {
  return {
    slot,
    commandId,
    actor: state.actor,
    enemies: state.enemies,
    cooldownRemainingSec: 0,
    ...extra,
  };
}

function uses(state) {
  return Object.fromEntries(state.instance.skills.map(skill => [skill.slot, skill.currentUses]));
}

function assertNoMutation(state, beforeUses, beforeCounters, message) {
  assert.deepEqual(uses(state), beforeUses, `${message}: Uses`);
  assert.deepEqual(state.counters, beforeCounters, `${message}: cooldown/effect/apply`);
}

assert.deepEqual(SKILL_COMMAND_RUNTIME_POLICY, {
  commandSource: 'resolveEquippedSkillCommand',
  targetMaterialization: 'exact_target_ids_in_command_order',
  readinessBeforeCommit: true,
  usesCommitBeforeApply: true,
  applyFailure: 'accepted_consumed_no_retry',
  canonicalEffectsResolved: 'phase_gated',
  applicationMode: 'canonical_effect_callback',
});

const state = fixture();
assert.deepEqual(state.instance.skills.map(skill => [skill.slot, skill.skillId]), [
  ['s1', 'SK_FIRE_01'],
  ['s2', 'SK_GRASS_05'],
  ['s3', 'SK_FIRE_04'],
  ['s4', 'SK_ICE_04'],
], 'fixture proves all four canonical manual slots');

const nearest = executeEquippedSkillCommand(
  state.instance,
  request(state, 's1', 'runtime-nearest'),
  state.hooks,
);
assert.equal(nearest.ok, true);
assert.deepEqual(nearest.command.targetIds, ['enemy-a']);
assert.deepEqual(nearest.application.targetIds, ['enemy-a']);
assert.equal(nearest.application.cooldownSec, skillCatalogEntry('SK_FIRE_01').cooldownSec);
assert.equal(getSkill(state.instance, 'SK_FIRE_01').currentUses, 27);

const self = executeEquippedSkillCommand(
  state.instance,
  request(state, 's2', 'runtime-self'),
  {
    ...state.hooks,
    materializeTargets(command) {
      return { ok: true, targets: command.targetIds.map(targetId => state.entities.get(targetId)) };
    },
    canApply() {
      return { ok: true };
    },
  },
);
assert.equal(self.ok, true);
assert.deepEqual(self.command.targetIds, ['caster'], 'Self materializes the actor by returned ID');
assert.strictEqual(self.targets[0], state.actor, 'Self applies to the materialized live actor');

const area = executeEquippedSkillCommand(
  state.instance,
  request(state, 's3', 'runtime-area'),
  state.hooks,
);
assert.equal(area.ok, true);
assert.deepEqual(area.command.targetIds, ['enemy-a', 'enemy-b'], 'area command order is preserved exactly');
assert.deepEqual(area.targets, [state.enemies[0], state.enemies[1]]);
assert.deepEqual(area.application.targetIds, ['enemy-a', 'enemy-b']);

const ground = executeEquippedSkillCommand(
  state.instance,
  request(state, 's4', 'runtime-ground', { groundPoint: { x: 3, z: 4 } }),
  state.hooks,
);
assert.equal(ground.ok, true);
assert.deepEqual(ground.command.targetIds, [], 'GroundPoint materializes no entity targets');
assert.deepEqual(ground.targets, []);
assert.deepEqual(ground.application.targetPoint, { x: 3, z: 4 }, 'canonical ground point reaches executor unchanged');
assert.deepEqual(uses(state), { s1: 27, s2: 7, s3: 9, s4: 9 });
assert.deepEqual(state.counters, { applies: 4, cooldownStarts: 4, effects: 4 });

let beforeUses = uses(state);
let beforeCounters = { ...state.counters };
const replay = executeEquippedSkillCommand(
  state.instance,
  request(state, 's1', 'runtime-nearest'),
  state.hooks,
);
assert.equal(replay.reason, 'duplicate_cast');
assert.equal(replay.stage, 'resolve', 'replay guard runs before world/readiness hooks');
assertNoMutation(state, beforeUses, beforeCounters, 'replayed command ID');

beforeUses = uses(state);
beforeCounters = { ...state.counters };
const resolverReject = executeEquippedSkillCommand(
  state.instance,
  request(state, 's1', 'runtime-no-target', { enemies: [] }),
  state.hooks,
);
assert.equal(resolverReject.reason, 'no_valid_target');
assertNoMutation(state, beforeUses, beforeCounters, 'targeting rejection');

function rejectedWithHooks(commandId, hooks, expectedReason, extra = {}) {
  const rejectState = fixture();
  const rejectUses = uses(rejectState);
  const rejectCounters = { ...rejectState.counters };
  const result = executeEquippedSkillCommand(
    rejectState.instance,
    request(rejectState, 's1', commandId, extra),
    { ...rejectState.hooks, ...hooks },
  );
  assert.equal(result.reason, expectedReason);
  assertNoMutation(rejectState, rejectUses, rejectCounters, expectedReason);
  return result;
}

rejectedWithHooks(
  'runtime-missing',
  { materializeTargets: () => [null] },
  SKILL_COMMAND_RUNTIME_REASONS.TARGET_MISSING,
);
rejectedWithHooks(
  'runtime-dead',
  { materializeTargets: command => command.targetIds.map(id => ({ id, alive: false })) },
  SKILL_COMMAND_RUNTIME_REASONS.TARGET_DEAD,
);
rejectedWithHooks(
  'runtime-substitution',
  { materializeTargets: () => [{ ...state.enemies[1] }] },
  SKILL_COMMAND_RUNTIME_REASONS.TARGET_SUBSTITUTION,
);
rejectedWithHooks(
  'runtime-count',
  { materializeTargets: () => [] },
  SKILL_COMMAND_RUNTIME_REASONS.TARGET_COUNT_MISMATCH,
);
rejectedWithHooks(
  'runtime-unavailable',
  { materializeTargets: command => command.targetIds.map(id => ({ id, alive: true, targetable: false })) },
  SKILL_COMMAND_RUNTIME_REASONS.TARGET_UNAVAILABLE,
);
rejectedWithHooks(
  'runtime-readiness',
  { canApply: () => false },
  SKILL_COMMAND_RUNTIME_REASONS.NOT_READY,
);
rejectedWithHooks(
  'runtime-readiness-result',
  { canApply: () => ({ ok: false, reason: 'silenced' }) },
  SKILL_COMMAND_RUNTIME_REASONS.NOT_READY,
);
rejectedWithHooks(
  'runtime-materializer-fail',
  { materializeTargets: () => ({ ok: false, reason: 'caller-controlled-reason' }) },
  SKILL_COMMAND_RUNTIME_REASONS.TARGET_MATERIALIZATION_FAILED,
);

const forgedState = fixture();
beforeUses = uses(forgedState);
beforeCounters = { ...forgedState.counters };
const forged = executeEquippedSkillCommand(
  forgedState.instance,
  { ...request(forgedState, 's1', 'runtime-forged'), command: { ok: true, skillId: 'SK_FIRE_01' } },
  forgedState.hooks,
);
assert.equal(forged.reason, SKILL_COMMAND_RUNTIME_REASONS.FORGED_COMMAND);
assertNoMutation(forgedState, beforeUses, beforeCounters, 'forged command injection');

const groundRejectState = fixture();
beforeUses = uses(groundRejectState);
beforeCounters = { ...groundRejectState.counters };
const groundSubstitution = executeEquippedSkillCommand(
  groundRejectState.instance,
  request(groundRejectState, 's4', 'runtime-ground-extra', { groundPoint: { x: 3, z: 4 } }),
  { ...groundRejectState.hooks, materializeTargets: () => [groundRejectState.actor] },
);
assert.equal(groundSubstitution.reason, SKILL_COMMAND_RUNTIME_REASONS.TARGET_COUNT_MISMATCH);
assertNoMutation(groundRejectState, beforeUses, beforeCounters, 'GroundPoint entity injection');

assert.equal(SKILL_COMMAND_RUNTIME_POLICY.canonicalEffectsResolved, 'phase_gated',
  'the executor exposes canonical mechanics only through live phase gates');

const applyFailureState = fixture();
let failingApplyCalls = 0;
const applyFailure = executeEquippedSkillCommand(
  applyFailureState.instance,
  request(applyFailureState, 's1', 'runtime-accepted-apply-failure'),
  {
    ...applyFailureState.hooks,
    applyAccepted() {
      failingApplyCalls += 1;
      throw new Error('presentation/effect adapter failed after acceptance');
    },
  },
);
assert.deepEqual({
  ok: applyFailure.ok,
  reason: applyFailure.reason,
  stage: applyFailure.stage,
  accepted: applyFailure.accepted,
  retryable: applyFailure.retryable,
  consumed: applyFailure.consumed,
}, {
  ok: false,
  reason: SKILL_COMMAND_RUNTIME_REASONS.APPLY_FAILED,
  stage: 'accepted_apply_failed',
  accepted: true,
  retryable: false,
  consumed: 1,
}, 'post-commit apply failure is an accepted, consumed, non-retryable command');
assert.equal(getSkill(applyFailureState.instance, 'SK_FIRE_01').currentUses, 27);
const failedReplay = executeEquippedSkillCommand(
  applyFailureState.instance,
  request(applyFailureState, 's1', 'runtime-accepted-apply-failure', { enemies: [] }),
  applyFailureState.hooks,
);
assert.equal(failedReplay.reason, 'duplicate_cast', 'accepted failure cannot be retried against a changed world');
assert.equal(failingApplyCalls, 1, 'accepted failure callback runs at most once');

const commitRaceState = fixture();
let outerApplyCalls = 0;
const commitRace = executeEquippedSkillCommand(
  commitRaceState.instance,
  request(commitRaceState, 's1', 'runtime-reentrant-commit'),
  {
    ...commitRaceState.hooks,
    canApply(command) {
      return commitEquippedSkillCommand(commitRaceState.instance, command);
    },
    applyAccepted() {
      outerApplyCalls += 1;
    },
  },
);
assert.equal(commitRace.reason, 'duplicate_cast', 'a re-entrant commit closes before outer apply');
assert.equal(commitRace.stage, 'commit');
assert.equal(getSkill(commitRaceState.instance, 'SK_FIRE_01').currentUses, 27, 're-entrant commit consumes once');
assert.equal(outerApplyCalls, 0, 'failed outer commit cannot apply effects');

console.log('V8.1 skill command runtime: PASS (4 slots, exact targets, exactly-once acceptance)');
