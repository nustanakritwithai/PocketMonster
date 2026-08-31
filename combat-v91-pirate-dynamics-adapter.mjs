import { fingerprintCombatValue } from './combat-v91-contract.mjs';
import {
  COMBAT_V91_DYNAMICS_BOUNDS,
  COMBAT_V91_DYNAMICS_TICK_RATE,
  createCombatDynamicsDefinition,
} from './combat-v91-dynamics-contract.mjs';

export const PIRATE_DYNAMICS_ADAPTER_VERSION = 'pirate-dynamics-adapter/v9.1.2';
export const PIRATE_COMBO_DYNAMICS_INPUT_SCHEMA = 'pirate-combo-dynamics-input/v9.1';
export const PIRATE_SKILL_DYNAMICS_INPUT_SCHEMA = 'pirate-skill-dynamics-input/v9.1';
export const PIRATE_DYNAMICS_SOURCE = Object.freeze({
  repository: 'https://github.com/nustanakritwithai/Pirate-fruit-',
  commit: '4df5721de8bdb20c28e53b6a8c933616e132c96d',
  modules: Object.freeze([
    'client/src/combat/CombatData.ts',
    'client/src/combat/PlayerCombat.ts',
    'client/src/combat/skillGameplay/types.ts',
  ]),
  role: 'timing_and_motion_proposals_only',
});

const COMBO_FIELDS = Object.freeze([
  'schemaVersion', 'authority', 'sourceCommit', 'actionId', 'definitionVersion',
  'windupSec', 'recoverySec', 'comboWindowSec', 'movementLock',
  'knockbackUnits', 'knockbackDurationSec', 'hitstopSec',
]);
const SKILL_FIELDS = Object.freeze([
  'schemaVersion', 'authority', 'sourceCommit', 'actionId', 'definitionVersion',
  'castTimeSec', 'recoverySec', 'hitCount', 'hitIntervalSec', 'delivery',
  'movementLock', 'knockbackUnits', 'knockbackDurationSec',
  'resourceKey', 'resourceAmountUnits', 'projectileProfileId',
  'projectileLifetimeSec', 'hitstopSec',
]);

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, fields) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function boundedNumber(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function pirateSecondsToCombatTicks(seconds) {
  if (!boundedNumber(seconds, 0,
    COMBAT_V91_DYNAMICS_BOUNDS.actionTicksMax / COMBAT_V91_DYNAMICS_TICK_RATE)) {
    return result(false, 'invalid_pirate_seconds');
  }
  // Ceil guarantees that a 60 Hz projection never releases an action earlier
  // than the authoritative Pirate duration expressed in seconds.
  return result(true, null, {
    ticks: Math.ceil(seconds * COMBAT_V91_DYNAMICS_TICK_RATE),
  });
}

function seconds(seconds, field) {
  const converted = pirateSecondsToCombatTicks(seconds);
  return converted.ok ? converted : result(false, 'invalid_pirate_timing', { field });
}

function movementBasisPoints(value) {
  if (!boundedNumber(value, 0, 1)) return result(false, 'invalid_pirate_movement_lock');
  return result(true, null, { value: Math.round(value * 10_000) });
}

function knockbackMilliUnits(value) {
  if (!boundedNumber(value, 0, COMBAT_V91_DYNAMICS_BOUNDS.impulseMilliUnitsMax / 1_000)) {
    return result(false, 'invalid_pirate_knockback');
  }
  return result(true, null, { value: Math.round(value * 1_000) });
}

function inputIdentity(input, schemaVersion) {
  if (input.schemaVersion !== schemaVersion) return result(false, 'pirate_dynamics_schema_mismatch');
  if (input.authority !== 'server') return result(false, 'invalid_pirate_dynamics_authority');
  if (input.sourceCommit !== PIRATE_DYNAMICS_SOURCE.commit) {
    return result(false, 'pirate_dynamics_source_commit_mismatch');
  }
  if (!nonEmptyString(input.actionId) || !nonEmptyString(input.definitionVersion)) {
    return result(false, 'invalid_pirate_dynamics_identity');
  }
  return result(true, null);
}

function hitstop(durationTicks) {
  return durationTicks === 0 ? null : {
    activation: 'confirmed_hit',
    durationTicks,
    actorScaleBasisPoints: 0,
    targetScaleBasisPoints: 0,
    authority: 'presentation_only',
  };
}

function provenance(input, inputSchema, definition) {
  const payload = {
    adapterVersion: PIRATE_DYNAMICS_ADAPTER_VERSION,
    inputSchema,
    source: PIRATE_DYNAMICS_SOURCE,
    inputFingerprint: fingerprintCombatValue(input),
    dynamicsFingerprint: definition.fingerprint,
    tickRate: COMBAT_V91_DYNAMICS_TICK_RATE,
    secondsRounding: 'ceil_never_release_early',
    hpWriter: 'none',
    damageFormula: 'none',
    transformWriter: 'none',
  };
  return deepFreeze({ ...payload, fingerprint: fingerprintCombatValue(payload) });
}

export function createPirateComboDynamicsDefinition(input = {}) {
  if (!exactKeys(input, COMBO_FIELDS)) return result(false, 'invalid_pirate_combo_dynamics_shape');
  const identity = inputIdentity(input, PIRATE_COMBO_DYNAMICS_INPUT_SCHEMA);
  if (!identity.ok) return identity;
  const windup = seconds(input.windupSec, 'windupSec');
  const recovery = seconds(input.recoverySec, 'recoverySec');
  const comboWindow = seconds(input.comboWindowSec, 'comboWindowSec');
  const knockbackDuration = seconds(input.knockbackDurationSec, 'knockbackDurationSec');
  const hitstopDuration = seconds(input.hitstopSec, 'hitstopSec');
  for (const converted of [windup, recovery, comboWindow, knockbackDuration, hitstopDuration]) {
    if (!converted.ok) return converted;
  }
  const movement = movementBasisPoints(input.movementLock);
  if (!movement.ok) return movement;
  const knockback = knockbackMilliUnits(input.knockbackUnits);
  if (!knockback.ok) return knockback;

  const activeTicks = 1;
  const actualRecoveryEnd = windup.ticks + activeTicks + recovery.ticks;
  const completionTick = actualRecoveryEnd + comboWindow.ticks;
  if (completionTick < 1 || completionTick > COMBAT_V91_DYNAMICS_BOUNDS.actionTicksMax) {
    return result(false, 'pirate_combo_timeline_out_of_range');
  }
  const movementCloseTick = Math.max(1, actualRecoveryEnd);
  const combo = comboWindow.ticks === 0 ? null : {
    opensAtActionTick: actualRecoveryEnd,
    closesAtActionTickExclusive: completionTick,
    acceptsActionTags: ['combo', 'm1'],
  };
  const created = createCombatDynamicsDefinition({
    actionId: input.actionId,
    definitionVersion: input.definitionVersion,
    windupTicks: windup.ticks,
    castTicks: 0,
    activeTicks,
    recoveryTicks: recovery.ticks + comboWindow.ticks,
    impactWindows: [{
      windowId: `${input.actionId}:contact`,
      opensAtActiveTick: 0,
      closesAtActiveTickExclusive: 1,
      hits: [{ hitOrdinal: 0, atActiveTick: 0, delivery: 'direct' }],
    }],
    comboWindow: combo,
    cancelPolicy: { windows: combo === null ? [] : [{
      opensAtActionTick: combo.opensAtActionTick,
      closesAtActionTickExclusive: combo.closesAtActionTickExclusive,
      reasons: ['combo_chain'],
    }] },
    interruptPolicy: {
      allowedPhases: ['windup', 'active', 'recovery'],
      allowedReasons: ['damage', 'stun', 'knockback', 'knockdown', 'dead'],
      superArmorPhases: [],
    },
    resourceCosts: [],
    projectiles: [],
    impulses: knockback.value === 0 ? [] : [{
      hitOrdinal: 0,
      profileId: `${input.actionId}:pirate-knockback`,
      horizontalMilliUnits: knockback.value,
      verticalMilliUnits: 0,
      durationTicks: Math.max(1, knockbackDuration.ticks),
      authority: 'world',
    }],
    guard: null,
    movementLocks: [{
      lockId: `${input.actionId}:pirate-movement-lock`,
      opensAtActionTick: 0,
      closesAtActionTickExclusive: movementCloseTick,
      movementMultiplierBasisPoints: movement.value,
      authority: 'world_locomotion_owner',
    }],
    hitstopPresentation: hitstop(hitstopDuration.ticks),
  });
  if (!created.ok) return result(false, 'invalid_pirate_combo_dynamics', { cause: created });
  return result(true, null, {
    definition: created.definition,
    provenance: provenance(input, PIRATE_COMBO_DYNAMICS_INPUT_SCHEMA, created.definition),
  });
}

export function createPirateSkillDynamicsDefinition(input = {}) {
  if (!exactKeys(input, SKILL_FIELDS)) return result(false, 'invalid_pirate_skill_dynamics_shape');
  const identity = inputIdentity(input, PIRATE_SKILL_DYNAMICS_INPUT_SCHEMA);
  if (!identity.ok) return identity;
  if (!Number.isSafeInteger(input.hitCount) || input.hitCount < 1
    || input.hitCount > COMBAT_V91_DYNAMICS_BOUNDS.hitsMax
    || !['direct', 'projectile'].includes(input.delivery)
    || !nonEmptyString(input.resourceKey)
    || !Number.isSafeInteger(input.resourceAmountUnits)
    || input.resourceAmountUnits < 0
    || input.resourceAmountUnits > COMBAT_V91_DYNAMICS_BOUNDS.resourceAmountMax) {
    return result(false, 'invalid_pirate_skill_dynamics_value');
  }
  if (input.delivery === 'projectile'
    ? !nonEmptyString(input.projectileProfileId)
    : input.projectileProfileId !== null) {
    return result(false, 'invalid_pirate_projectile_binding');
  }
  const cast = seconds(input.castTimeSec, 'castTimeSec');
  const recovery = seconds(input.recoverySec, 'recoverySec');
  const hitInterval = seconds(input.hitIntervalSec, 'hitIntervalSec');
  const knockbackDuration = seconds(input.knockbackDurationSec, 'knockbackDurationSec');
  const projectileLifetime = seconds(input.projectileLifetimeSec, 'projectileLifetimeSec');
  const hitstopDuration = seconds(input.hitstopSec, 'hitstopSec');
  for (const converted of [cast, recovery, hitInterval, knockbackDuration,
    projectileLifetime, hitstopDuration]) {
    if (!converted.ok) return converted;
  }
  if (input.delivery === 'projectile' && projectileLifetime.ticks < 1) {
    return result(false, 'invalid_pirate_projectile_lifetime');
  }
  const intervalTicks = input.hitCount === 1 ? 0 : Math.max(1, hitInterval.ticks);
  const activeTicks = (input.hitCount - 1) * intervalTicks + 1;
  const completionTick = cast.ticks + activeTicks + recovery.ticks;
  if (completionTick < 1 || completionTick > COMBAT_V91_DYNAMICS_BOUNDS.actionTicksMax) {
    return result(false, 'pirate_skill_timeline_out_of_range');
  }
  const movement = movementBasisPoints(input.movementLock);
  if (!movement.ok) return movement;
  const knockback = knockbackMilliUnits(input.knockbackUnits);
  if (!knockback.ok) return knockback;
  const hits = Array.from({ length: input.hitCount }, (_, hitOrdinal) => ({
    hitOrdinal,
    atActiveTick: hitOrdinal * intervalTicks,
    delivery: input.delivery,
  }));
  const activeStartTick = cast.ticks;
  const projectiles = input.delivery === 'projectile' ? hits.map(hit => ({
    projectileId: `${input.actionId}:projectile:${hit.hitOrdinal}`,
    profileId: input.projectileProfileId,
    hitOrdinal: hit.hitOrdinal,
    spawnAtActionTick: activeStartTick + hit.atActiveTick,
    lifetimeTicks: projectileLifetime.ticks,
    collisionAuthority: 'world',
  })) : [];
  const impulses = knockback.value === 0 ? [] : hits.map(hit => ({
    hitOrdinal: hit.hitOrdinal,
    profileId: `${input.actionId}:pirate-knockback`,
    horizontalMilliUnits: knockback.value,
    verticalMilliUnits: 0,
    durationTicks: Math.max(1, knockbackDuration.ticks),
    authority: 'world',
  }));
  const movementCloseTick = Math.max(1, activeStartTick);
  const created = createCombatDynamicsDefinition({
    actionId: input.actionId,
    definitionVersion: input.definitionVersion,
    windupTicks: 0,
    castTicks: cast.ticks,
    activeTicks,
    recoveryTicks: recovery.ticks,
    impactWindows: [{
      windowId: `${input.actionId}:release`,
      opensAtActiveTick: 0,
      closesAtActiveTickExclusive: activeTicks,
      hits,
    }],
    comboWindow: null,
    cancelPolicy: { windows: cast.ticks === 0 ? [] : [{
      opensAtActionTick: 0,
      closesAtActionTickExclusive: cast.ticks,
      reasons: ['dodge', 'mode_change'],
    }] },
    interruptPolicy: {
      allowedPhases: ['cast', 'active', 'recovery'],
      allowedReasons: ['damage', 'stun', 'knockback', 'knockdown', 'dead', 'mounted'],
      superArmorPhases: [],
    },
    resourceCosts: input.resourceAmountUnits === 0 ? [] : [{
      resourceKey: input.resourceKey,
      amountUnits: input.resourceAmountUnits,
      commitAt: 'active_start',
      refundOnCancel: 'uncommitted',
      refundOnInterrupt: 'uncommitted',
    }],
    projectiles,
    impulses,
    guard: null,
    movementLocks: [{
      lockId: `${input.actionId}:pirate-cast-lock`,
      opensAtActionTick: 0,
      closesAtActionTickExclusive: movementCloseTick,
      movementMultiplierBasisPoints: movement.value,
      authority: 'world_locomotion_owner',
    }],
    hitstopPresentation: hitstop(hitstopDuration.ticks),
  });
  if (!created.ok) return result(false, 'invalid_pirate_skill_dynamics', { cause: created });
  return result(true, null, {
    definition: created.definition,
    provenance: provenance(input, PIRATE_SKILL_DYNAMICS_INPUT_SCHEMA, created.definition),
  });
}
