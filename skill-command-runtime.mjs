// PocketMonster V8.1 — gameplay execution boundary for equipped skill commands.
//
// Targeting and Uses are canonical. The final callback is the accepted effect
// executor; the live adapter phase-gates canonical effect families while this
// boundary remains the sole Uses commit owner.

import {
  commitEquippedSkillCommand,
  resolveEquippedSkillCommand,
} from './targeting-resolver.mjs';

export const SKILL_COMMAND_RUNTIME_POLICY = Object.freeze({
  commandSource: 'resolveEquippedSkillCommand',
  targetMaterialization: 'exact_target_ids_in_command_order',
  readinessBeforeCommit: true,
  usesCommitBeforeApply: true,
  applyFailure: 'accepted_consumed_no_retry',
  canonicalEffectsResolved: 'phase_gated',
  applicationMode: 'canonical_effect_callback',
});

export const SKILL_COMMAND_RUNTIME_REASONS = Object.freeze({
  INVALID_HOOKS: 'invalid_hooks',
  FORGED_COMMAND: 'forged_command',
  TARGET_MATERIALIZATION_FAILED: 'target_materialization_failed',
  TARGET_COUNT_MISMATCH: 'target_count_mismatch',
  TARGET_MISSING: 'target_missing',
  TARGET_SUBSTITUTION: 'target_substitution',
  TARGET_DEAD: 'target_dead',
  TARGET_UNAVAILABLE: 'target_unavailable',
  NOT_READY: 'not_ready',
  READINESS_FAILED: 'readiness_failed',
  APPLY_FAILED: 'apply_failed',
});

function runtimeResult(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function validHooks(hooks) {
  return hooks && typeof hooks === 'object'
    && typeof hooks.materializeTargets === 'function'
    && (hooks.canApply == null || typeof hooks.canApply === 'function')
    && typeof hooks.applyAccepted === 'function';
}

function normalizedMaterializedTargets(output) {
  if (Array.isArray(output)) return output;
  if (output && typeof output === 'object' && output.ok === true
    && Array.isArray(output.targets)) {
    return output.targets;
  }
  return null;
}

function validateMaterializedTargets(command, materialized) {
  if (materialized.length !== command.targetIds.length) {
    return runtimeResult(false, SKILL_COMMAND_RUNTIME_REASONS.TARGET_COUNT_MISMATCH, {
      expectedCount: command.targetIds.length,
      actualCount: materialized.length,
    });
  }
  for (let index = 0; index < command.targetIds.length; index += 1) {
    const expectedTargetId = command.targetIds[index];
    const target = materialized[index];
    if (!target || typeof target !== 'object') {
      return runtimeResult(false, SKILL_COMMAND_RUNTIME_REASONS.TARGET_MISSING, {
        index,
        expectedTargetId,
      });
    }
    if (target.id !== expectedTargetId) {
      return runtimeResult(false, SKILL_COMMAND_RUNTIME_REASONS.TARGET_SUBSTITUTION, {
        index,
        expectedTargetId,
        actualTargetId: typeof target.id === 'string' ? target.id : null,
      });
    }
    if (target.alive !== true) {
      return runtimeResult(false, SKILL_COMMAND_RUNTIME_REASONS.TARGET_DEAD, {
        index,
        targetId: expectedTargetId,
      });
    }
    if (command.targetKind !== 'Self' && target.targetable !== true) {
      return runtimeResult(false, SKILL_COMMAND_RUNTIME_REASONS.TARGET_UNAVAILABLE, {
        index,
        targetId: expectedTargetId,
      });
    }
  }
  return runtimeResult(true, null, {
    targets: Object.freeze([...materialized]),
  });
}

// Resolve -> materialize exact live entities -> readiness -> commit Uses ->
// invoke the accepted effect executor once. A caller cannot supply a prepared
// command, a SkillID, target IDs, geometry, or resource values through this API.
export function executeEquippedSkillCommand(instance, request = {}, hooks = {}) {
  if (!validHooks(hooks)) {
    return runtimeResult(false, SKILL_COMMAND_RUNTIME_REASONS.INVALID_HOOKS, {
      stage: 'hooks',
      consumed: 0,
    });
  }
  if (request && typeof request === 'object'
    && Object.prototype.hasOwnProperty.call(request, 'command')) {
    return runtimeResult(false, SKILL_COMMAND_RUNTIME_REASONS.FORGED_COMMAND, {
      stage: 'resolve',
      consumed: 0,
    });
  }

  const command = resolveEquippedSkillCommand(instance, request);
  if (!command.ok) {
    return runtimeResult(false, command.reason, {
      stage: 'resolve',
      command,
      consumed: 0,
    });
  }

  let materializedOutput;
  try {
    materializedOutput = hooks.materializeTargets(command);
  } catch {
    return runtimeResult(false, SKILL_COMMAND_RUNTIME_REASONS.TARGET_MATERIALIZATION_FAILED, {
      stage: 'materialize',
      command,
      consumed: 0,
    });
  }
  const materialized = normalizedMaterializedTargets(materializedOutput);
  if (!materialized) {
    return runtimeResult(false, SKILL_COMMAND_RUNTIME_REASONS.TARGET_MATERIALIZATION_FAILED, {
      stage: 'materialize',
      command,
      consumed: 0,
    });
  }
  const checkedTargets = validateMaterializedTargets(command, materialized);
  if (!checkedTargets.ok) {
    return runtimeResult(false, checkedTargets.reason, {
      stage: 'materialize',
      command,
      ...checkedTargets,
      consumed: 0,
    });
  }

  if (hooks.canApply) {
    let readiness;
    try {
      readiness = hooks.canApply(command, checkedTargets.targets);
    } catch {
      return runtimeResult(false, SKILL_COMMAND_RUNTIME_REASONS.READINESS_FAILED, {
        stage: 'readiness',
        command,
        targets: checkedTargets.targets,
        consumed: 0,
      });
    }
    const ready = readiness === true
      || (readiness && typeof readiness === 'object' && readiness.ok === true);
    if (!ready) {
      return runtimeResult(false, SKILL_COMMAND_RUNTIME_REASONS.NOT_READY, {
        stage: 'readiness',
        command,
        targets: checkedTargets.targets,
        consumed: 0,
      });
    }
  }

  const consumption = commitEquippedSkillCommand(instance, command);
  if (!consumption.ok) {
    return runtimeResult(false, consumption.reason, {
      stage: 'commit',
      command,
      targets: checkedTargets.targets,
      consumption,
      consumed: 0,
    });
  }

  let application;
  try {
    application = hooks.applyAccepted(command, checkedTargets.targets);
  } catch {
    return runtimeResult(false, SKILL_COMMAND_RUNTIME_REASONS.APPLY_FAILED, {
      stage: 'accepted_apply_failed',
      accepted: true,
      retryable: false,
      command,
      targets: checkedTargets.targets,
      consumption,
      consumed: consumption.consumed,
    });
  }
  return runtimeResult(true, null, {
    stage: 'applied',
    accepted: true,
    command,
    targets: checkedTargets.targets,
    consumption,
    application,
    consumed: consumption.consumed,
  });
}
