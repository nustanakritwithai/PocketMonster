import assert from 'node:assert/strict';
import fs from 'node:fs';
import { commitEquippedSkillCommand } from '../targeting-resolver.mjs';

const sourceUrl = new URL('../skill-command-runtime.mjs', import.meta.url);
const originalSource = fs.readFileSync(sourceUrl, 'utf8');

async function loadSource(source, tag) {
  const withAbsoluteImports = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${withAbsoluteImports}\n//# sourceURL=${tag}`).toString('base64')}`);
}

function fixture() {
  const instance = {
    instanceId: 'runtime-mutant-caster',
    speciesId: 'flameling',
    skills: [
      { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 28 },
      { skillId: 'SK_GRASS_05', slot: 's2', currentUses: 8 },
      { skillId: 'SK_FIRE_04', slot: 's3', currentUses: 10 },
      { skillId: 'SK_ICE_04', slot: 's4', currentUses: 10 },
    ],
  };
  const actor = { id: instance.instanceId, alive: true, position: { x: 0, z: 0 } };
  const enemies = [
    { id: 'enemy-a', alive: true, targetable: true, position: { x: 1, z: 0 } },
    { id: 'enemy-b', alive: true, targetable: true, position: { x: 3, z: 0 } },
    { id: 'enemy-c', alive: true, targetable: true, position: { x: 4.6, z: 0 } },
  ];
  const entities = new Map([[actor.id, actor], ...enemies.map(enemy => [enemy.id, enemy])]);
  const applied = [];
  const hooks = {
    materializeTargets(command) {
      return command.targetIds.map(targetId => entities.get(targetId));
    },
    canApply() {
      return true;
    },
    applyAccepted(command, targets) {
      const receipt = {
        ids: targets.map(target => target.id),
        point: command.targetPoint,
        cooldown: command.startCooldownSec,
      };
      applied.push(receipt);
      return receipt;
    },
  };
  return { instance, actor, enemies, entities, applied, hooks };
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

function currentUses(state, slot) {
  return state.instance.skills.find(skill => skill.slot === slot).currentUses;
}

function assertRejectedWithoutApply(execute, hooksPatch, expectedReason, commandId) {
  const state = fixture();
  const before = currentUses(state, 's1');
  const result = execute(
    state.instance,
    request(state, 's1', commandId),
    { ...state.hooks, ...hooksPatch },
  );
  assert.equal(result.reason, expectedReason);
  assert.equal(currentUses(state, 's1'), before);
  assert.equal(state.applied.length, 0);
}

function assertRuntimeContract(module) {
  const { executeEquippedSkillCommand, SKILL_COMMAND_RUNTIME_REASONS: reasons } = module;
  const state = fixture();
  assert.deepEqual(state.instance.skills.map(skill => skill.slot), ['s1', 's2', 's3', 's4']);

  const area = executeEquippedSkillCommand(
    state.instance,
    request(state, 's3', 'mutant-area'),
    state.hooks,
  );
  assert.equal(area.ok, true);
  assert.deepEqual(area.targets.map(target => target.id), ['enemy-a', 'enemy-b']);
  assert.deepEqual(state.applied[0].ids, ['enemy-a', 'enemy-b']);
  assert.deepEqual(state.applied[0].point, { x: 1, z: 0 });
  assert.equal(currentUses(state, 's3'), 9);

  const duplicate = executeEquippedSkillCommand(
    state.instance,
    request(state, 's3', 'mutant-area'),
    state.hooks,
  );
  assert.equal(duplicate.reason, 'duplicate_cast');
  assert.equal(currentUses(state, 's3'), 9);
  assert.equal(state.applied.length, 1);

  const self = executeEquippedSkillCommand(
    state.instance,
    request(state, 's2', 'mutant-self'),
    state.hooks,
  );
  assert.equal(self.ok, true);
  assert.strictEqual(self.targets[0], state.actor);

  const ground = executeEquippedSkillCommand(
    state.instance,
    request(state, 's4', 'mutant-ground', { groundPoint: { x: 3, z: 4 } }),
    state.hooks,
  );
  assert.equal(ground.ok, true);
  assert.deepEqual(ground.targets, []);
  assert.deepEqual(state.applied.at(-1).point, { x: 3, z: 4 });

  assertRejectedWithoutApply(
    executeEquippedSkillCommand,
    { materializeTargets: () => [null] },
    reasons.TARGET_MISSING,
    'mutant-missing',
  );
  assertRejectedWithoutApply(
    executeEquippedSkillCommand,
    { materializeTargets: () => [{ id: 'enemy-b', alive: true, targetable: true }] },
    reasons.TARGET_SUBSTITUTION,
    'mutant-substitution',
  );
  assertRejectedWithoutApply(
    executeEquippedSkillCommand,
    { materializeTargets: command => command.targetIds.map(id => ({ id, alive: false, targetable: true })) },
    reasons.TARGET_DEAD,
    'mutant-dead',
  );
  assertRejectedWithoutApply(
    executeEquippedSkillCommand,
    { materializeTargets: command => command.targetIds.map(id => ({ id, alive: true, targetable: false })) },
    reasons.TARGET_UNAVAILABLE,
    'mutant-unavailable',
  );
  assertRejectedWithoutApply(
    executeEquippedSkillCommand,
    { canApply: () => false },
    reasons.NOT_READY,
    'mutant-not-ready',
  );

  const countState = fixture();
  const count = executeEquippedSkillCommand(
    countState.instance,
    request(countState, 's4', 'mutant-ground-extra', { groundPoint: { x: 3, z: 4 } }),
    { ...countState.hooks, materializeTargets: () => [countState.actor] },
  );
  assert.equal(count.reason, reasons.TARGET_COUNT_MISMATCH);
  assert.equal(currentUses(countState, 's4'), 10);
  assert.equal(countState.applied.length, 0);

  const forgedState = fixture();
  const forged = executeEquippedSkillCommand(
    forgedState.instance,
    { ...request(forgedState, 's1', 'mutant-forged'), command: { ok: true } },
    forgedState.hooks,
  );
  assert.equal(forged.reason, reasons.FORGED_COMMAND);
  assert.equal(currentUses(forgedState, 's1'), 28);
  assert.equal(forgedState.applied.length, 0);

  const failureState = fixture();
  let failureCalls = 0;
  const acceptedFailure = executeEquippedSkillCommand(
    failureState.instance,
    request(failureState, 's1', 'mutant-accepted-failure'),
    {
      ...failureState.hooks,
      applyAccepted() {
        failureCalls += 1;
        throw new Error('accepted adapter failure');
      },
    },
  );
  assert.deepEqual({
    ok: acceptedFailure.ok,
    reason: acceptedFailure.reason,
    stage: acceptedFailure.stage,
    accepted: acceptedFailure.accepted,
    retryable: acceptedFailure.retryable,
    consumed: acceptedFailure.consumed,
  }, {
    ok: false,
    reason: reasons.APPLY_FAILED,
    stage: 'accepted_apply_failed',
    accepted: true,
    retryable: false,
    consumed: 1,
  });
  assert.equal(currentUses(failureState, 's1'), 27);
  assert.equal(executeEquippedSkillCommand(
    failureState.instance,
    request(failureState, 's1', 'mutant-accepted-failure', { enemies: [] }),
    failureState.hooks,
  ).reason, 'duplicate_cast');
  assert.equal(failureCalls, 1);

  const commitRaceState = fixture();
  let outerApplyCalls = 0;
  const commitRace = executeEquippedSkillCommand(
    commitRaceState.instance,
    request(commitRaceState, 's1', 'mutant-reentrant-commit'),
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
  assert.equal(commitRace.reason, 'duplicate_cast');
  assert.equal(commitRace.stage, 'commit');
  assert.equal(currentUses(commitRaceState, 's1'), 27);
  assert.equal(outerApplyCalls, 0);
}

assertRuntimeContract(await loadSource(originalSource, 'skill-command-runtime-current'));

const applyLine = 'application = hooks.applyAccepted(command, checkedTargets.targets);';
const mutants = [
  [
    'allow injected prepared command',
    "&& Object.prototype.hasOwnProperty.call(request, 'command')) {",
    '&& false) {',
  ],
  [
    'allow target count mismatch',
    'if (materialized.length !== command.targetIds.length) {',
    'if (false) {',
  ],
  [
    'allow missing target',
    "if (!target || typeof target !== 'object') {",
    'if (false) {',
  ],
  [
    'allow target substitution',
    'if (target.id !== expectedTargetId) {',
    'if (false) {',
  ],
  [
    'allow dead target',
    'if (target.alive !== true) {',
    'if (false) {',
  ],
  [
    'allow unavailable enemy',
    "if (command.targetKind !== 'Self' && target.targetable !== true) {",
    'if (false) {',
  ],
  [
    'bypass readiness rejection',
    'const ready = readiness === true\n      || (readiness && typeof readiness === \'object\' && readiness.ok === true);',
    'const ready = true;',
  ],
  [
    'apply after duplicate commit',
    'if (!consumption.ok) {',
    'if (false) {',
  ],
  [
    'apply accepted twice',
    applyLine,
    `${applyLine}\n    hooks.applyAccepted(command, checkedTargets.targets);`,
  ],
  [
    'reverse canonical target order',
    applyLine,
    'application = hooks.applyAccepted(command, [...checkedTargets.targets].reverse());',
  ],
  [
    'replace canonical ground point',
    applyLine,
    'application = hooks.applyAccepted({ ...command, targetPoint: null }, checkedTargets.targets);',
  ],
  [
    'accepted apply failure becomes retryable',
    "stage: 'accepted_apply_failed',\n      accepted: true,\n      retryable: false,",
    "stage: 'accepted_apply_failed',\n      accepted: true,\n      retryable: true,",
  ],
  [
    'accepted apply failure loses accepted marker',
    "stage: 'accepted_apply_failed',\n      accepted: true,",
    "stage: 'accepted_apply_failed',\n      accepted: false,",
  ],
];

for (const [name, before, after] of mutants) {
  const source = originalSource.replace(before, after);
  assert.notEqual(source, originalSource, `${name} mutation must alter source`);
  const module = await loadSource(source, `skill-command-runtime-mutant-${name.replaceAll(' ', '-')}`);
  assert.throws(() => assertRuntimeContract(module), undefined, `${name} must be killed`);
}

console.log(`V8.1 skill command runtime mutants: PASS (${mutants.length}/${mutants.length} killed)`);
