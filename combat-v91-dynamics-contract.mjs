import { fingerprintCombatValue } from './combat-v91-contract.mjs';

// Shared timing vocabulary only. This contract deliberately contains no HP,
// damage formula, transform, or wall-clock field; owners commit those domains.

export const COMBAT_V91_DYNAMICS_CONTRACT_VERSION = 'combat-v91-dynamics-contract/v1';
export const COMBAT_V91_DYNAMICS_SCHEMA = 'combat-action-dynamics/v9.1';
export const COMBAT_V91_DYNAMICS_TICK_RATE = 60;

export const COMBAT_V91_DYNAMICS_PHASES = Object.freeze([
  'windup',
  'cast',
  'active',
  'recovery',
]);

export const COMBAT_V91_DYNAMICS_TERMINAL_PHASES = Object.freeze([
  'completed',
  'cancelled',
  'interrupted',
]);

export const COMBAT_V91_DYNAMICS_EVENT_TYPES = Object.freeze([
  'action.started',
  'phase.entered',
  'phase.exited',
  'impact_window.opened',
  'impact_window.closed',
  'impact.requested',
  'projectile.spawn_requested',
  'guard_window.opened',
  'guard_window.closed',
  'movement_lock.opened',
  'movement_lock.closed',
  'combo_window.opened',
  'combo_window.closed',
  'resource.reserve_requested',
  'resource.commit_requested',
  'resource.refund_requested',
  'transition.rejected',
  'action.cancelled',
  'action.interrupted',
  'action.completed',
]);

export const COMBAT_V91_DYNAMICS_BOUNDS = Object.freeze({
  actionTicksMax: COMBAT_V91_DYNAMICS_TICK_RATE * 60,
  impactWindowsMax: 32,
  hitsMax: 32,
  transitionWindowsMax: 16,
  resourcesMax: 8,
  projectilesMax: 32,
  impulsesMax: 32,
  guardWindowsMax: 16,
  movementLockWindowsMax: 16,
  transitionRequestsMax: 64,
  policyValuesMax: 64,
  identifierLengthMax: 256,
  eventSequenceMax: 4_096,
  resourceAmountMax: 1_000_000_000,
  lifetimeTicksMax: COMBAT_V91_DYNAMICS_TICK_RATE * 60,
  impulseMilliUnitsMax: 1_000_000,
  basisPointsMax: 10_000,
  coverageMilliDegreesMax: 360_000,
});

const PHASE_SET = new Set(COMBAT_V91_DYNAMICS_PHASES);
const REFUND_POLICIES = new Set(['none', 'uncommitted', 'full']);
const RESOURCE_COMMIT_POINTS = new Set(['active_start', 'first_impact', 'completion']);
const HIT_DELIVERIES = new Set(['direct', 'projectile']);

const DEFINITION_FIELDS = Object.freeze([
  'schemaVersion',
  'actionId',
  'definitionVersion',
  'windupTicks',
  'castTicks',
  'activeTicks',
  'recoveryTicks',
  'impactWindows',
  'comboWindow',
  'cancelPolicy',
  'interruptPolicy',
  'resourceCosts',
  'projectiles',
  'impulses',
  'guard',
  'movementLocks',
  'hitstopPresentation',
  'hitCount',
  'timeline',
  'fingerprint',
]);

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function nonEmptyString(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= COMBAT_V91_DYNAMICS_BOUNDS.identifierLengthMax
    && value.trim() === value;
}

function compareStrings(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function boundedInteger(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function uniqueStrings(values, { allowEmpty = false } = {}) {
  return Array.isArray(values)
    && (allowEmpty || values.length > 0)
    && values.length <= COMBAT_V91_DYNAMICS_BOUNDS.policyValuesMax
    && values.every(nonEmptyString)
    && new Set(values).size === values.length;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function timelineFor(input) {
  const windupStartTick = 0;
  const castStartTick = windupStartTick + input.windupTicks;
  const activeStartTick = castStartTick + input.castTicks;
  const recoveryStartTick = activeStartTick + input.activeTicks;
  const completionTick = recoveryStartTick + input.recoveryTicks;
  return Object.freeze({
    windupStartTick,
    castStartTick,
    activeStartTick,
    recoveryStartTick,
    completionTick,
  });
}

function canonicalActionWindow(input, maximumTick, reason) {
  if (!exactKeys(input, ['opensAtActionTick', 'closesAtActionTickExclusive'])
    || !boundedInteger(input.opensAtActionTick, 0, maximumTick)
    || !boundedInteger(input.closesAtActionTickExclusive, 1, maximumTick)
    || input.opensAtActionTick >= input.closesAtActionTickExclusive) return result(false, reason);
  return result(true, null, {
    window: Object.freeze({
      opensAtActionTick: input.opensAtActionTick,
      closesAtActionTickExclusive: input.closesAtActionTickExclusive,
    }),
  });
}

function windowsDoNotOverlap(windows, startField, endField) {
  const ordered = [...windows].sort((left, right) => left[startField] - right[startField]
    || left[endField] - right[endField]);
  return ordered.every((window, index) => index === 0 || ordered[index - 1][endField] <= window[startField]);
}

function canonicalImpactWindows(input, activeTicks) {
  if (!Array.isArray(input) || input.length > COMBAT_V91_DYNAMICS_BOUNDS.impactWindowsMax) {
    return result(false, 'invalid_impact_windows');
  }
  const ids = new Set();
  const ordinals = new Set();
  const windows = [];
  for (const candidate of input) {
    if (!exactKeys(candidate, ['windowId', 'opensAtActiveTick', 'closesAtActiveTickExclusive', 'hits'])
      || !nonEmptyString(candidate.windowId) || ids.has(candidate.windowId)
      || !boundedInteger(candidate.opensAtActiveTick, 0, activeTicks - 1)
      || !boundedInteger(candidate.closesAtActiveTickExclusive, 1, activeTicks)
      || candidate.opensAtActiveTick >= candidate.closesAtActiveTickExclusive
      || !Array.isArray(candidate.hits) || candidate.hits.length === 0) {
      return result(false, 'invalid_impact_window');
    }
    ids.add(candidate.windowId);
    const hits = [];
    for (const hit of candidate.hits) {
      if (!exactKeys(hit, ['hitOrdinal', 'atActiveTick', 'delivery'])
        || !boundedInteger(hit.hitOrdinal, 0, COMBAT_V91_DYNAMICS_BOUNDS.hitsMax - 1)
        || ordinals.has(hit.hitOrdinal)
        || !boundedInteger(hit.atActiveTick, candidate.opensAtActiveTick,
          candidate.closesAtActiveTickExclusive - 1)
        || !HIT_DELIVERIES.has(hit.delivery)) return result(false, 'invalid_impact_hit');
      ordinals.add(hit.hitOrdinal);
      hits.push(Object.freeze({
        hitOrdinal: hit.hitOrdinal,
        atActiveTick: hit.atActiveTick,
        delivery: hit.delivery,
      }));
    }
    hits.sort((left, right) => left.atActiveTick - right.atActiveTick
      || left.hitOrdinal - right.hitOrdinal);
    windows.push(Object.freeze({
      windowId: candidate.windowId,
      opensAtActiveTick: candidate.opensAtActiveTick,
      closesAtActiveTickExclusive: candidate.closesAtActiveTickExclusive,
      hits: Object.freeze(hits),
    }));
  }
  if (!windowsDoNotOverlap(windows, 'opensAtActiveTick', 'closesAtActiveTickExclusive')) {
    return result(false, 'overlapping_impact_windows');
  }
  const orderedOrdinals = [...ordinals].sort((left, right) => left - right);
  if (orderedOrdinals.some((ordinal, index) => ordinal !== index)) {
    return result(false, 'non_contiguous_hit_ordinals');
  }
  windows.sort((left, right) => left.opensAtActiveTick - right.opensAtActiveTick
    || compareStrings(left.windowId, right.windowId));
  return result(true, null, {
    windows: Object.freeze(windows),
    hitCount: orderedOrdinals.length,
  });
}

function canonicalComboWindow(input, completionTick) {
  if (input === null) return result(true, null, { comboWindow: null });
  if (!exactKeys(input, ['opensAtActionTick', 'closesAtActionTickExclusive', 'acceptsActionTags'])
    || !uniqueStrings(input.acceptsActionTags)) return result(false, 'invalid_combo_window');
  const timing = canonicalActionWindow({
    opensAtActionTick: input.opensAtActionTick,
    closesAtActionTickExclusive: input.closesAtActionTickExclusive,
  }, completionTick, 'invalid_combo_window');
  if (!timing.ok) return timing;
  return result(true, null, {
    comboWindow: Object.freeze({
      ...timing.window,
      acceptsActionTags: Object.freeze([...input.acceptsActionTags].sort()),
    }),
  });
}

function canonicalCancelPolicy(input, completionTick) {
  if (!exactKeys(input, ['windows']) || !Array.isArray(input.windows)
    || input.windows.length > COMBAT_V91_DYNAMICS_BOUNDS.transitionWindowsMax) {
    return result(false, 'invalid_cancel_policy');
  }
  const windows = [];
  for (const candidate of input.windows) {
    if (!exactKeys(candidate, ['opensAtActionTick', 'closesAtActionTickExclusive', 'reasons'])
      || !uniqueStrings(candidate.reasons)) return result(false, 'invalid_cancel_window');
    const timing = canonicalActionWindow({
      opensAtActionTick: candidate.opensAtActionTick,
      closesAtActionTickExclusive: candidate.closesAtActionTickExclusive,
    }, completionTick, 'invalid_cancel_window');
    if (!timing.ok) return timing;
    windows.push(Object.freeze({
      ...timing.window,
      reasons: Object.freeze([...candidate.reasons].sort()),
    }));
  }
  if (!windowsDoNotOverlap(windows, 'opensAtActionTick', 'closesAtActionTickExclusive')) {
    return result(false, 'overlapping_cancel_windows');
  }
  windows.sort((left, right) => left.opensAtActionTick - right.opensAtActionTick);
  return result(true, null, { cancelPolicy: Object.freeze({ windows: Object.freeze(windows) }) });
}

function canonicalInterruptPolicy(input) {
  if (!exactKeys(input, ['allowedPhases', 'allowedReasons', 'superArmorPhases'])
    || !uniqueStrings(input.allowedPhases, { allowEmpty: true })
    || input.allowedPhases.some(phase => !PHASE_SET.has(phase))
    || !uniqueStrings(input.allowedReasons, { allowEmpty: true })
    || !uniqueStrings(input.superArmorPhases, { allowEmpty: true })
    || input.superArmorPhases.some(phase => !PHASE_SET.has(phase))
    || input.superArmorPhases.some(phase => !input.allowedPhases.includes(phase))) {
    return result(false, 'invalid_interrupt_policy');
  }
  return result(true, null, {
    interruptPolicy: Object.freeze({
      allowedPhases: Object.freeze([...input.allowedPhases].sort()),
      allowedReasons: Object.freeze([...input.allowedReasons].sort()),
      superArmorPhases: Object.freeze([...input.superArmorPhases].sort()),
    }),
  });
}

function canonicalResourceCosts(input, hitCount) {
  if (!Array.isArray(input) || input.length > COMBAT_V91_DYNAMICS_BOUNDS.resourcesMax) {
    return result(false, 'invalid_resource_costs');
  }
  const keys = new Set();
  const resources = [];
  for (const candidate of input) {
    if (!exactKeys(candidate, [
      'resourceKey', 'amountUnits', 'commitAt', 'refundOnCancel', 'refundOnInterrupt',
    ])
      || !nonEmptyString(candidate.resourceKey) || keys.has(candidate.resourceKey)
      || !boundedInteger(candidate.amountUnits, 1, COMBAT_V91_DYNAMICS_BOUNDS.resourceAmountMax)
      || !RESOURCE_COMMIT_POINTS.has(candidate.commitAt)
      || candidate.commitAt === 'first_impact' && hitCount === 0
      || !REFUND_POLICIES.has(candidate.refundOnCancel)
      || !REFUND_POLICIES.has(candidate.refundOnInterrupt)) {
      return result(false, 'invalid_resource_cost');
    }
    keys.add(candidate.resourceKey);
    resources.push(Object.freeze({
      resourceKey: candidate.resourceKey,
      amountUnits: candidate.amountUnits,
      commitAt: candidate.commitAt,
      refundOnCancel: candidate.refundOnCancel,
      refundOnInterrupt: candidate.refundOnInterrupt,
    }));
  }
  resources.sort((left, right) => compareStrings(left.resourceKey, right.resourceKey));
  return result(true, null, { resourceCosts: Object.freeze(resources) });
}

function canonicalProjectiles(input, hits, activeStartTick, completionTick) {
  if (!Array.isArray(input) || input.length > COMBAT_V91_DYNAMICS_BOUNDS.projectilesMax) {
    return result(false, 'invalid_projectiles');
  }
  const projectileHitOrdinals = new Set(hits
    .filter(hit => hit.delivery === 'projectile')
    .map(hit => hit.hitOrdinal));
  const seen = new Set();
  const projectiles = [];
  for (const candidate of input) {
    if (!exactKeys(candidate, [
      'projectileId', 'profileId', 'hitOrdinal', 'spawnAtActionTick', 'lifetimeTicks',
      'collisionAuthority',
    ])
      || !nonEmptyString(candidate.projectileId) || seen.has(candidate.projectileId)
      || !nonEmptyString(candidate.profileId)
      || !projectileHitOrdinals.has(candidate.hitOrdinal)
      || candidate.spawnAtActionTick !== activeStartTick
        + hits.find(hit => hit.hitOrdinal === candidate.hitOrdinal).atActiveTick
      || !boundedInteger(candidate.spawnAtActionTick, 0, completionTick - 1)
      || !boundedInteger(candidate.lifetimeTicks, 1, COMBAT_V91_DYNAMICS_BOUNDS.lifetimeTicksMax)
      || candidate.collisionAuthority !== 'world') return result(false, 'invalid_projectile');
    seen.add(candidate.projectileId);
    projectiles.push(Object.freeze({
      projectileId: candidate.projectileId,
      profileId: candidate.profileId,
      hitOrdinal: candidate.hitOrdinal,
      spawnAtActionTick: candidate.spawnAtActionTick,
      lifetimeTicks: candidate.lifetimeTicks,
      collisionAuthority: 'world',
    }));
  }
  if (projectiles.length !== projectileHitOrdinals.size
    || projectiles.some((projectile, index) => projectiles.some((other, otherIndex) => (
      index !== otherIndex && projectile.hitOrdinal === other.hitOrdinal
    )))) return result(false, 'projectile_hit_mapping_mismatch');
  projectiles.sort((left, right) => left.spawnAtActionTick - right.spawnAtActionTick
    || left.hitOrdinal - right.hitOrdinal);
  return result(true, null, { projectiles: Object.freeze(projectiles) });
}

function canonicalImpulses(input, hitCount) {
  if (!Array.isArray(input) || input.length > COMBAT_V91_DYNAMICS_BOUNDS.impulsesMax) {
    return result(false, 'invalid_impulses');
  }
  const ordinals = new Set();
  const impulses = [];
  for (const candidate of input) {
    if (!exactKeys(candidate, [
      'hitOrdinal', 'profileId', 'horizontalMilliUnits', 'verticalMilliUnits',
      'durationTicks', 'authority',
    ])
      || !boundedInteger(candidate.hitOrdinal, 0, hitCount - 1) || ordinals.has(candidate.hitOrdinal)
      || !nonEmptyString(candidate.profileId)
      || !boundedInteger(candidate.horizontalMilliUnits, 0,
        COMBAT_V91_DYNAMICS_BOUNDS.impulseMilliUnitsMax)
      || !boundedInteger(candidate.verticalMilliUnits, 0,
        COMBAT_V91_DYNAMICS_BOUNDS.impulseMilliUnitsMax)
      || !boundedInteger(candidate.durationTicks, 1, COMBAT_V91_DYNAMICS_BOUNDS.actionTicksMax)
      || candidate.authority !== 'world') return result(false, 'invalid_impulse');
    ordinals.add(candidate.hitOrdinal);
    impulses.push(Object.freeze({ ...candidate, authority: 'world' }));
  }
  impulses.sort((left, right) => left.hitOrdinal - right.hitOrdinal);
  return result(true, null, { impulses: Object.freeze(impulses) });
}

function canonicalGuard(input, completionTick) {
  if (input === null) return result(true, null, { guard: null });
  if (!exactKeys(input, [
    'profileId', 'windows', 'coverageMilliDegrees', 'mitigationBasisPoints', 'authority',
  ])
    || !nonEmptyString(input.profileId)
    || !Array.isArray(input.windows) || input.windows.length === 0
    || input.windows.length > COMBAT_V91_DYNAMICS_BOUNDS.guardWindowsMax
    || !boundedInteger(input.coverageMilliDegrees, 1,
      COMBAT_V91_DYNAMICS_BOUNDS.coverageMilliDegreesMax)
    || !boundedInteger(input.mitigationBasisPoints, 0,
      COMBAT_V91_DYNAMICS_BOUNDS.basisPointsMax)
    || input.authority !== 'combat_resolver') return result(false, 'invalid_guard');
  const windows = [];
  for (const candidate of input.windows) {
    const timing = canonicalActionWindow(candidate, completionTick, 'invalid_guard_window');
    if (!timing.ok) return timing;
    windows.push(timing.window);
  }
  if (!windowsDoNotOverlap(windows, 'opensAtActionTick', 'closesAtActionTickExclusive')) {
    return result(false, 'overlapping_guard_windows');
  }
  windows.sort((left, right) => left.opensAtActionTick - right.opensAtActionTick);
  return result(true, null, {
    guard: Object.freeze({
      profileId: input.profileId,
      windows: Object.freeze(windows),
      coverageMilliDegrees: input.coverageMilliDegrees,
      mitigationBasisPoints: input.mitigationBasisPoints,
      authority: 'combat_resolver',
    }),
  });
}

function canonicalMovementLocks(input, completionTick) {
  if (!Array.isArray(input)
    || input.length > COMBAT_V91_DYNAMICS_BOUNDS.movementLockWindowsMax) {
    return result(false, 'invalid_movement_locks');
  }
  const ids = new Set();
  const movementLocks = [];
  for (const candidate of input) {
    if (!exactKeys(candidate, [
      'lockId', 'opensAtActionTick', 'closesAtActionTickExclusive',
      'movementMultiplierBasisPoints', 'authority',
    ])
      || !nonEmptyString(candidate.lockId) || ids.has(candidate.lockId)
      || !boundedInteger(candidate.movementMultiplierBasisPoints, 0,
        COMBAT_V91_DYNAMICS_BOUNDS.basisPointsMax)
      || candidate.authority !== 'world_locomotion_owner') {
      return result(false, 'invalid_movement_lock');
    }
    const timing = canonicalActionWindow({
      opensAtActionTick: candidate.opensAtActionTick,
      closesAtActionTickExclusive: candidate.closesAtActionTickExclusive,
    }, completionTick, 'invalid_movement_lock');
    if (!timing.ok) return timing;
    ids.add(candidate.lockId);
    movementLocks.push(Object.freeze({
      lockId: candidate.lockId,
      ...timing.window,
      movementMultiplierBasisPoints: candidate.movementMultiplierBasisPoints,
      authority: 'world_locomotion_owner',
    }));
  }
  if (!windowsDoNotOverlap(
    movementLocks,
    'opensAtActionTick',
    'closesAtActionTickExclusive',
  )) return result(false, 'overlapping_movement_locks');
  movementLocks.sort((left, right) => left.opensAtActionTick - right.opensAtActionTick
    || compareStrings(left.lockId, right.lockId));
  return result(true, null, { movementLocks: Object.freeze(movementLocks) });
}

function canonicalHitstop(input) {
  if (input === null) return result(true, null, { hitstopPresentation: null });
  if (!exactKeys(input, [
    'activation', 'durationTicks', 'actorScaleBasisPoints', 'targetScaleBasisPoints', 'authority',
  ])
    || !['confirmed_hit', 'confirmed_critical'].includes(input.activation)
    || !boundedInteger(input.durationTicks, 1, COMBAT_V91_DYNAMICS_TICK_RATE)
    || !boundedInteger(input.actorScaleBasisPoints, 0, COMBAT_V91_DYNAMICS_BOUNDS.basisPointsMax)
    || !boundedInteger(input.targetScaleBasisPoints, 0, COMBAT_V91_DYNAMICS_BOUNDS.basisPointsMax)
    || input.authority !== 'presentation_only') return result(false, 'invalid_hitstop_presentation');
  return result(true, null, {
    hitstopPresentation: Object.freeze({
      activation: input.activation,
      durationTicks: input.durationTicks,
      actorScaleBasisPoints: input.actorScaleBasisPoints,
      targetScaleBasisPoints: input.targetScaleBasisPoints,
      authority: 'presentation_only',
    }),
  });
}

export function createCombatDynamicsDefinition(input = {}) {
  if (!isRecord(input)) return result(false, 'invalid_dynamics_definition');
  const unknown = Object.keys(input).find(key => !DEFINITION_FIELDS.includes(key));
  if (unknown) return result(false, 'unknown_dynamics_field', { field: unknown });
  if (input.schemaVersion !== undefined && input.schemaVersion !== COMBAT_V91_DYNAMICS_SCHEMA) {
    return result(false, 'dynamics_schema_mismatch');
  }
  if (!nonEmptyString(input.actionId) || !nonEmptyString(input.definitionVersion)) {
    return result(false, 'invalid_dynamics_identity');
  }
  for (const field of ['windupTicks', 'castTicks', 'activeTicks', 'recoveryTicks']) {
    const minimum = field === 'activeTicks' ? 1 : 0;
    if (!boundedInteger(input[field], minimum, COMBAT_V91_DYNAMICS_BOUNDS.actionTicksMax)) {
      return result(false, 'invalid_phase_ticks', { field });
    }
  }
  const timeline = timelineFor(input);
  if (timeline.completionTick > COMBAT_V91_DYNAMICS_BOUNDS.actionTicksMax) {
    return result(false, 'action_timeline_too_long');
  }
  const impacts = canonicalImpactWindows(input.impactWindows, input.activeTicks);
  if (!impacts.ok) return impacts;
  const hits = impacts.windows.flatMap(window => window.hits);
  const combo = canonicalComboWindow(input.comboWindow, timeline.completionTick);
  if (!combo.ok) return combo;
  const cancel = canonicalCancelPolicy(input.cancelPolicy, timeline.completionTick);
  if (!cancel.ok) return cancel;
  const interrupt = canonicalInterruptPolicy(input.interruptPolicy);
  if (!interrupt.ok) return interrupt;
  const resources = canonicalResourceCosts(input.resourceCosts, impacts.hitCount);
  if (!resources.ok) return resources;
  const projectiles = canonicalProjectiles(
    input.projectiles,
    hits,
    timeline.activeStartTick,
    timeline.completionTick,
  );
  if (!projectiles.ok) return projectiles;
  const impulses = canonicalImpulses(input.impulses, impacts.hitCount);
  if (!impulses.ok) return impulses;
  const guard = canonicalGuard(input.guard, timeline.completionTick);
  if (!guard.ok) return guard;
  const movementLocks = canonicalMovementLocks(input.movementLocks, timeline.completionTick);
  if (!movementLocks.ok) return movementLocks;
  const hitstop = canonicalHitstop(input.hitstopPresentation);
  if (!hitstop.ok) return hitstop;

  const payload = {
    schemaVersion: COMBAT_V91_DYNAMICS_SCHEMA,
    actionId: input.actionId,
    definitionVersion: input.definitionVersion,
    windupTicks: input.windupTicks,
    castTicks: input.castTicks,
    activeTicks: input.activeTicks,
    recoveryTicks: input.recoveryTicks,
    impactWindows: impacts.windows,
    comboWindow: combo.comboWindow,
    cancelPolicy: cancel.cancelPolicy,
    interruptPolicy: interrupt.interruptPolicy,
    resourceCosts: resources.resourceCosts,
    projectiles: projectiles.projectiles,
    impulses: impulses.impulses,
    guard: guard.guard,
    movementLocks: movementLocks.movementLocks,
    hitstopPresentation: hitstop.hitstopPresentation,
    hitCount: impacts.hitCount,
    timeline,
  };
  if (input.hitCount !== undefined && input.hitCount !== impacts.hitCount) {
    return result(false, 'hit_count_mismatch');
  }
  if (input.timeline !== undefined
    && fingerprintCombatValue(input.timeline) !== fingerprintCombatValue(timeline)) {
    return result(false, 'timeline_mismatch');
  }
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) {
    return result(false, 'fingerprint_mismatch', { expectedFingerprint: fingerprint });
  }
  return result(true, null, { definition: deepFreeze({ ...payload, fingerprint }) });
}

export function validateCombatDynamicsDefinition(input) {
  return createCombatDynamicsDefinition(input);
}

export function combatDynamicsPhaseAt(definition, actionTick) {
  const canonical = createCombatDynamicsDefinition(definition);
  if (!canonical.ok || !Number.isSafeInteger(actionTick)) return null;
  const timeline = canonical.definition.timeline;
  if (actionTick < 0) return 'scheduled';
  if (actionTick < timeline.castStartTick && canonical.definition.windupTicks > 0) return 'windup';
  if (actionTick < timeline.activeStartTick && canonical.definition.castTicks > 0) return 'cast';
  if (actionTick < timeline.recoveryStartTick) return 'active';
  if (actionTick < timeline.completionTick && canonical.definition.recoveryTicks > 0) return 'recovery';
  return 'completed';
}
