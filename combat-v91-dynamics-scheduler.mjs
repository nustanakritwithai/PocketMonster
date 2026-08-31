import { fingerprintCombatValue } from './combat-v91-contract.mjs';
import {
  COMBAT_V91_DYNAMICS_BOUNDS,
  COMBAT_V91_DYNAMICS_EVENT_TYPES,
  COMBAT_V91_DYNAMICS_PHASES,
  COMBAT_V91_DYNAMICS_TERMINAL_PHASES,
  COMBAT_V91_DYNAMICS_TICK_RATE,
  createCombatDynamicsDefinition,
} from './combat-v91-dynamics-contract.mjs';

// Pure fixed-tick planner. Every emitted value is a proposal for the relevant
// authority; this module never mutates combat resources or world transforms.

export const COMBAT_V91_DYNAMICS_SCHEDULER_VERSION = 'combat-v91-fixed-tick-scheduler/v2';
export const COMBAT_V91_DYNAMICS_STATE_SCHEMA = 'combat-dynamics-state/v9.1';
export const COMBAT_V91_DYNAMICS_EVENT_SCHEMA = 'combat-dynamics-event/v9.1';
export const COMBAT_V91_DYNAMICS_TRANSITION_PRIORITY = Object.freeze({
  interrupt: 0,
  cancel: 1,
});

const STATE_PHASES = new Set([
  'scheduled',
  ...COMBAT_V91_DYNAMICS_PHASES,
  ...COMBAT_V91_DYNAMICS_TERMINAL_PHASES,
]);
const TERMINAL_PHASES = new Set(COMBAT_V91_DYNAMICS_TERMINAL_PHASES);
const EVENT_TYPE_SET = new Set(COMBAT_V91_DYNAMICS_EVENT_TYPES);
const TRANSITION_TYPES = new Set(['cancel', 'interrupt']);
const SUPER_ARMOR_BYPASS_REASONS = new Set(['guard_break', 'scripted']);
const STATE_FIELDS = Object.freeze([
  'schemaVersion',
  'combatId',
  'actionSequence',
  'actorEntityId',
  'targetEntityId',
  'actionId',
  'definitionFingerprint',
  'startTick',
  'lastProcessedTick',
  'phase',
  'terminal',
  'emittedHitOrdinals',
  'processedRequestIds',
  'resourceProgress',
  'eventSequence',
  'fingerprint',
]);
const TRANSITION_FIELDS = Object.freeze([
  'requestId', 'authoritySequence', 'type', 'atTick', 'reason',
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

function stableId(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= COMBAT_V91_DYNAMICS_BOUNDS.identifierLengthMax
    && value.trim() === value;
}

function compareStrings(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function sortedUniqueIntegers(values, minimum, maximum) {
  return Array.isArray(values)
    && values.every(value => Number.isSafeInteger(value) && value >= minimum && value <= maximum)
    && new Set(values).size === values.length
    && values.every((value, index) => index === 0 || values[index - 1] < value);
}

function sortedUniqueStrings(values) {
  return Array.isArray(values)
    && values.length <= COMBAT_V91_DYNAMICS_BOUNDS.transitionRequestsMax
    && values.every(stableId)
    && new Set(values).size === values.length
    && values.every((value, index) => index === 0 || compareStrings(values[index - 1], value) < 0);
}

function canonicalPhaseAt(definition, actionTick) {
  const timeline = definition.timeline;
  if (actionTick < 0) return 'scheduled';
  if (actionTick < timeline.castStartTick && definition.windupTicks > 0) return 'windup';
  if (actionTick < timeline.activeStartTick && definition.castTicks > 0) return 'cast';
  if (actionTick < timeline.recoveryStartTick) return 'active';
  if (actionTick < timeline.completionTick && definition.recoveryTicks > 0) return 'recovery';
  return 'completed';
}

function statePayload(input) {
  return {
    schemaVersion: COMBAT_V91_DYNAMICS_STATE_SCHEMA,
    combatId: input.combatId,
    actionSequence: input.actionSequence,
    actorEntityId: input.actorEntityId,
    targetEntityId: input.targetEntityId,
    actionId: input.actionId,
    definitionFingerprint: input.definitionFingerprint,
    startTick: input.startTick,
    lastProcessedTick: input.lastProcessedTick,
    phase: input.phase,
    terminal: input.terminal === null ? null : { ...input.terminal },
    emittedHitOrdinals: [...input.emittedHitOrdinals],
    processedRequestIds: [...input.processedRequestIds],
    resourceProgress: input.resourceProgress.map(progress => ({ ...progress })),
    eventSequence: input.eventSequence,
  };
}

function freezeState(input) {
  const payload = statePayload(input);
  return deepFreeze({ ...payload, fingerprint: fingerprintCombatValue(payload) });
}

function expectedEmittedOrdinals(definition, state) {
  const terminalBeforeTick = state.terminal !== null
    && state.terminal.type !== 'completed'
    ? state.terminal.atTick
    : null;
  const expected = [];
  for (const window of definition.impactWindows) {
    for (const hit of window.hits) {
      const absoluteTick = state.startTick + definition.timeline.activeStartTick + hit.atActiveTick;
      const reached = terminalBeforeTick === null
        ? absoluteTick <= state.lastProcessedTick
        : absoluteTick < terminalBeforeTick;
      if (reached) expected.push(hit.hitOrdinal);
    }
  }
  return expected.sort((left, right) => left - right);
}

function canonicalTerminal(input, state, definition) {
  if (input === null) return null;
  if (!exactKeys(input, ['type', 'reason', 'requestId', 'atTick'])
    || !['cancelled', 'interrupted', 'completed'].includes(input.type)
    || !stableId(input.reason)
    || input.type === 'completed' && input.requestId !== null
    || input.type !== 'completed' && !stableId(input.requestId)
    || !Number.isSafeInteger(input.atTick)
    || input.atTick < state.startTick || input.atTick !== state.lastProcessedTick) return undefined;
  const completionTick = state.startTick + definition.timeline.completionTick;
  if (input.type === 'completed') {
    if (input.atTick !== completionTick || input.reason !== 'timeline') return undefined;
    return Object.freeze({ ...input });
  }
  if (input.atTick >= completionTick || !state.processedRequestIds.includes(input.requestId)) {
    return undefined;
  }
  const actionTick = input.atTick - state.startTick;
  const phase = canonicalPhaseAt(definition, actionTick);
  if (!COMBAT_V91_DYNAMICS_PHASES.includes(phase)) return undefined;
  if (input.type === 'cancelled' && !cancelAllowed(definition, actionTick, input.reason)) {
    return undefined;
  }
  if (input.type === 'interrupted' && interruptRejection(definition, phase, input.reason) !== null) {
    return undefined;
  }
  return Object.freeze({ ...input });
}

function canonicalResourceProgress(input, definition) {
  if (!Array.isArray(input) || input.length !== definition.resourceCosts.length) return null;
  const progressByKey = new Map();
  for (const candidate of input) {
    if (!exactKeys(candidate, ['resourceKey', 'reserveRequested', 'commitRequested', 'refundRequested'])
      || !stableId(candidate.resourceKey) || progressByKey.has(candidate.resourceKey)
      || typeof candidate.reserveRequested !== 'boolean'
      || typeof candidate.commitRequested !== 'boolean'
      || typeof candidate.refundRequested !== 'boolean'
      || candidate.commitRequested && !candidate.reserveRequested
      || candidate.refundRequested && !candidate.reserveRequested) return null;
    progressByKey.set(candidate.resourceKey, Object.freeze({ ...candidate }));
  }
  const progress = [];
  for (const resource of definition.resourceCosts) {
    const candidate = progressByKey.get(resource.resourceKey);
    if (!candidate) return null;
    progress.push(candidate);
  }
  return Object.freeze(progress);
}

function deriveExpectedDynamicsProgress(definition, state, terminal) {
  const progress = definition.resourceCosts.map(resource => ({
    resourceKey: resource.resourceKey,
    reserveRequested: false,
    commitRequested: false,
    refundRequested: false,
  }));
  const progressFor = resourceKey => progress.find(item => item.resourceKey === resourceKey);
  let eventSequence = state.processedRequestIds.length;
  let phase = 'scheduled';

  const requestReserves = () => {
    for (const resource of definition.resourceCosts) {
      const resourceProgress = progressFor(resource.resourceKey);
      if (resourceProgress.reserveRequested) continue;
      resourceProgress.reserveRequested = true;
      eventSequence += 1;
    }
  };
  const requestCommits = commitAt => {
    for (const resource of definition.resourceCosts) {
      const resourceProgress = progressFor(resource.resourceKey);
      if (resource.commitAt !== commitAt || resourceProgress.commitRequested) continue;
      resourceProgress.commitRequested = true;
      eventSequence += 1;
    }
  };
  const requestRefunds = transitionType => {
    for (const resource of definition.resourceCosts) {
      const resourceProgress = progressFor(resource.resourceKey);
      const policy = transitionType === 'cancelled'
        ? resource.refundOnCancel
        : resource.refundOnInterrupt;
      const shouldRefund = policy === 'full'
        || policy === 'uncommitted' && !resourceProgress.commitRequested;
      if (!shouldRefund || resourceProgress.refundRequested) continue;
      resourceProgress.refundRequested = true;
      eventSequence += 1;
    }
  };

  for (let tick = state.startTick; tick <= state.lastProcessedTick; tick += 1) {
    const actionTick = tick - state.startTick;
    const activeTick = actionTick - definition.timeline.activeStartTick;
    if (actionTick === 0) {
      eventSequence += 1; // action.started
      requestReserves();
    }

    eventSequence += definition.impactWindows.filter(
      window => window.closesAtActiveTickExclusive === activeTick,
    ).length;
    eventSequence += definition.guard?.windows.filter(
      window => window.closesAtActionTickExclusive === actionTick,
    ).length ?? 0;
    eventSequence += definition.movementLocks.filter(
      window => window.closesAtActionTickExclusive === actionTick,
    ).length;
    if (definition.comboWindow?.closesAtActionTickExclusive === actionTick) eventSequence += 1;

    const scheduledPhase = canonicalPhaseAt(definition, actionTick);
    if (scheduledPhase === 'completed') {
      if (COMBAT_V91_DYNAMICS_PHASES.includes(phase)) eventSequence += 1;
      requestCommits('completion');
      eventSequence += 1; // action.completed
      phase = 'completed';
      break;
    }
    if (scheduledPhase !== phase) {
      if (COMBAT_V91_DYNAMICS_PHASES.includes(phase)) eventSequence += 1;
      phase = scheduledPhase;
      eventSequence += 1;
    }

    eventSequence += definition.impactWindows.filter(
      window => window.opensAtActiveTick === activeTick,
    ).length;
    eventSequence += definition.guard?.windows.filter(
      window => window.opensAtActionTick === actionTick,
    ).length ?? 0;
    eventSequence += definition.movementLocks.filter(
      window => window.opensAtActionTick === actionTick,
    ).length;
    if (definition.comboWindow?.opensAtActionTick === actionTick) eventSequence += 1;
    if (actionTick === definition.timeline.activeStartTick) requestCommits('active_start');

    if (terminal !== null && terminal.type !== 'completed' && terminal.atTick === tick) {
      eventSequence += definition.impactWindows.filter(
        window => impactWindowIsOpen(window, activeTick),
      ).length;
      eventSequence += definition.guard?.windows.filter(
        window => phaseWindowIsOpen(window, actionTick),
      ).length ?? 0;
      eventSequence += definition.movementLocks.filter(
        window => phaseWindowIsOpen(window, actionTick),
      ).length;
      if (definition.comboWindow !== null
        && phaseWindowIsOpen(definition.comboWindow, actionTick)) eventSequence += 1;
      eventSequence += 1; // phase.exited
      requestRefunds(terminal.type);
      phase = terminal.type;
      break;
    }

    const hitsAtTick = definition.impactWindows.flatMap(window => window.hits)
      .filter(hit => hit.atActiveTick === activeTick);
    if (hitsAtTick.length > 0) requestCommits('first_impact');
    eventSequence += hitsAtTick.length;
  }

  return Object.freeze({
    resourceProgress: Object.freeze(progress.map(item => Object.freeze(item))),
    eventSequence,
    phase,
  });
}

export function validateCombatDynamicsState(input, definitionInput) {
  const definitionResult = createCombatDynamicsDefinition(definitionInput);
  if (!definitionResult.ok) return result(false, 'invalid_dynamics_definition', { cause: definitionResult });
  const definition = definitionResult.definition;
  if (!isRecord(input)) return result(false, 'invalid_dynamics_state');
  const unknown = Object.keys(input).find(key => !STATE_FIELDS.includes(key));
  if (unknown) return result(false, 'unknown_dynamics_state_field', { field: unknown });
  if (input.schemaVersion !== COMBAT_V91_DYNAMICS_STATE_SCHEMA
    || !stableId(input.combatId)
    || !Number.isSafeInteger(input.actionSequence) || input.actionSequence < 0
    || !stableId(input.actorEntityId)
    || input.targetEntityId !== null && !stableId(input.targetEntityId)
    || input.actionId !== definition.actionId
    || input.definitionFingerprint !== definition.fingerprint
    || !Number.isSafeInteger(input.startTick) || input.startTick < 0
    || input.startTick > Number.MAX_SAFE_INTEGER - definition.timeline.completionTick
    || !Number.isSafeInteger(input.lastProcessedTick)
    || input.lastProcessedTick < input.startTick - 1
    || input.lastProcessedTick > input.startTick + definition.timeline.completionTick
    || !STATE_PHASES.has(input.phase)
    || !Number.isSafeInteger(input.eventSequence) || input.eventSequence < 0
    || input.eventSequence > COMBAT_V91_DYNAMICS_BOUNDS.eventSequenceMax) {
    return result(false, 'invalid_dynamics_state');
  }
  const maximumOrdinal = Math.max(-1, definition.hitCount - 1);
  if (!sortedUniqueIntegers(input.emittedHitOrdinals, 0, maximumOrdinal)
    || !sortedUniqueStrings(input.processedRequestIds)) return result(false, 'invalid_dynamics_progress');
  const terminal = canonicalTerminal(input.terminal, input, definition);
  if (terminal === undefined
    || (terminal === null) !== !TERMINAL_PHASES.has(input.phase)
    || terminal !== null && terminal.type !== input.phase) return result(false, 'invalid_terminal_state');
  const resourceProgress = canonicalResourceProgress(input.resourceProgress, definition);
  if (!resourceProgress) return result(false, 'invalid_resource_progress');
  const expectedPhase = input.lastProcessedTick < input.startTick
    ? 'scheduled'
    : canonicalPhaseAt(definition, input.lastProcessedTick - input.startTick);
  if (terminal === null && input.phase !== expectedPhase) return result(false, 'phase_state_mismatch');
  const expectedOrdinals = expectedEmittedOrdinals(definition, input);
  if (expectedOrdinals.length !== input.emittedHitOrdinals.length
    || expectedOrdinals.some((ordinal, index) => ordinal !== input.emittedHitOrdinals[index])) {
    return result(false, 'hit_ordinal_progress_mismatch');
  }
  const expectedProgress = deriveExpectedDynamicsProgress(definition, input, terminal);
  if (expectedProgress.resourceProgress.some((expected, index) => (
    expected.resourceKey !== resourceProgress[index].resourceKey
    || expected.reserveRequested !== resourceProgress[index].reserveRequested
    || expected.commitRequested !== resourceProgress[index].commitRequested
    || expected.refundRequested !== resourceProgress[index].refundRequested
  ))) return result(false, 'resource_progress_timeline_mismatch');
  if (input.eventSequence !== expectedProgress.eventSequence) {
    return result(false, 'event_sequence_mismatch', {
      expectedEventSequence: expectedProgress.eventSequence,
    });
  }
  const payload = statePayload({ ...input, terminal, resourceProgress });
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== fingerprint) return result(false, 'fingerprint_mismatch');
  return result(true, null, { state: deepFreeze({ ...payload, fingerprint }), definition });
}

export function createCombatDynamicsSchedule({
  combatId,
  actionSequence,
  actorEntityId,
  targetEntityId = null,
  startTick,
  definition: definitionInput,
} = {}) {
  const definitionResult = createCombatDynamicsDefinition(definitionInput);
  if (!definitionResult.ok) return result(false, 'invalid_dynamics_definition', { cause: definitionResult });
  const definition = definitionResult.definition;
  if (!stableId(combatId)
    || !Number.isSafeInteger(actionSequence) || actionSequence < 0
    || !stableId(actorEntityId)
    || targetEntityId !== null && !stableId(targetEntityId)
    || !Number.isSafeInteger(startTick) || startTick < 0
    || startTick > Number.MAX_SAFE_INTEGER - definition.timeline.completionTick) {
    return result(false, 'invalid_schedule_identity');
  }
  const resourceProgress = definition.resourceCosts.map(resource => ({
    resourceKey: resource.resourceKey,
    reserveRequested: false,
    commitRequested: false,
    refundRequested: false,
  }));
  const state = freezeState({
    combatId,
    actionSequence,
    actorEntityId,
    targetEntityId,
    actionId: definition.actionId,
    definitionFingerprint: definition.fingerprint,
    startTick,
    lastProcessedTick: startTick - 1,
    phase: 'scheduled',
    terminal: null,
    emittedHitOrdinals: [],
    processedRequestIds: [],
    resourceProgress,
    eventSequence: 0,
  });
  return result(true, null, { state, definition });
}

function canonicalTransitionRequests(input, state, throughTick, completionTick) {
  if (!Array.isArray(input)
    || input.length > COMBAT_V91_DYNAMICS_BOUNDS.transitionRequestsMax
    || state.processedRequestIds.length + input.length
      > COMBAT_V91_DYNAMICS_BOUNDS.transitionRequestsMax) {
    return result(false, 'invalid_transition_requests');
  }
  const seen = new Set();
  const seenAuthoritySlots = new Set();
  const requests = [];
  for (const candidate of input) {
    if (!exactKeys(candidate, TRANSITION_FIELDS)
      || !stableId(candidate.requestId) || seen.has(candidate.requestId)
      || !Number.isSafeInteger(candidate.authoritySequence)
      || candidate.authoritySequence < 0
      || !TRANSITION_TYPES.has(candidate.type)
      || !Number.isSafeInteger(candidate.atTick)
      || !stableId(candidate.reason)) return result(false, 'invalid_transition_request');
    seen.add(candidate.requestId);
    if (state.processedRequestIds.includes(candidate.requestId)) continue;
    if (candidate.atTick <= state.lastProcessedTick) return result(false, 'stale_transition_request');
    if (candidate.atTick > throughTick || candidate.atTick >= completionTick) {
      return result(false, 'transition_outside_advance');
    }
    const authoritySlot = `${candidate.atTick}:${candidate.authoritySequence}:${candidate.type}`;
    if (seenAuthoritySlots.has(authoritySlot)) {
      return result(false, 'duplicate_transition_authority_sequence');
    }
    seenAuthoritySlots.add(authoritySlot);
    requests.push(Object.freeze({ ...candidate }));
  }
  requests.sort((left, right) => left.atTick - right.atTick
    || left.authoritySequence - right.authoritySequence
    || COMBAT_V91_DYNAMICS_TRANSITION_PRIORITY[left.type]
      - COMBAT_V91_DYNAMICS_TRANSITION_PRIORITY[right.type]);
  return result(true, null, { requests: Object.freeze(requests) });
}

function eventEmitter(mutable) {
  return (type, tick, phase, payload = {}) => {
    if (!EVENT_TYPE_SET.has(type)) throw new TypeError(`Unknown dynamics event type: ${type}`);
    const eventSequence = mutable.eventSequence;
    const eventPayload = {
      schemaVersion: COMBAT_V91_DYNAMICS_EVENT_SCHEMA,
      schedulerVersion: COMBAT_V91_DYNAMICS_SCHEDULER_VERSION,
      authority: 'proposal_only',
      eventId: `${mutable.combatId}:${mutable.actionSequence}:dynamics:${eventSequence}`,
      eventSequence,
      combatId: mutable.combatId,
      actionSequence: mutable.actionSequence,
      actorEntityId: mutable.actorEntityId,
      targetEntityId: mutable.targetEntityId,
      actionId: mutable.actionId,
      definitionFingerprint: mutable.definitionFingerprint,
      tick,
      type,
      phase,
      payload,
    };
    const event = deepFreeze({ ...eventPayload, fingerprint: fingerprintCombatValue(eventPayload) });
    mutable.eventSequence += 1;
    mutable.events.push(event);
    return event;
  };
}

function phaseWindowIsOpen(window, actionTick) {
  return window.opensAtActionTick <= actionTick
    && actionTick < window.closesAtActionTickExclusive;
}

function impactWindowIsOpen(window, activeTick) {
  return window.opensAtActiveTick <= activeTick
    && activeTick < window.closesAtActiveTickExclusive;
}

function impulseFor(definition, hitOrdinal) {
  return definition.impulses.find(candidate => candidate.hitOrdinal === hitOrdinal) ?? null;
}

function projectileFor(definition, hitOrdinal) {
  return definition.projectiles.find(candidate => candidate.hitOrdinal === hitOrdinal) ?? null;
}

function resourceProgressFor(mutable, resourceKey) {
  return mutable.resourceProgress.find(progress => progress.resourceKey === resourceKey);
}

function emitResourceCommit(mutable, definition, emit, tick, commitAt) {
  for (const resource of definition.resourceCosts) {
    const progress = resourceProgressFor(mutable, resource.resourceKey);
    if (resource.commitAt !== commitAt || progress.commitRequested) continue;
    progress.commitRequested = true;
    emit('resource.commit_requested', tick, mutable.phase, {
      resourceKey: resource.resourceKey,
      amountUnits: resource.amountUnits,
      commitAt,
      authority: 'resource_owner_commit_required',
    });
  }
}

function emitNormalWindowClosures(mutable, definition, emit, tick, actionTick) {
  const activeTick = actionTick - definition.timeline.activeStartTick;
  for (const window of definition.impactWindows) {
    if (window.closesAtActiveTickExclusive === activeTick) {
      emit('impact_window.closed', tick, mutable.phase, { windowId: window.windowId, reason: 'timeline' });
    }
  }
  if (definition.guard !== null) {
    definition.guard.windows.forEach((window, windowIndex) => {
      if (window.closesAtActionTickExclusive === actionTick) {
        emit('guard_window.closed', tick, mutable.phase, {
          profileId: definition.guard.profileId,
          windowIndex,
          reason: 'timeline',
        });
      }
    });
  }
  definition.movementLocks.forEach(lock => {
    if (lock.closesAtActionTickExclusive === actionTick) {
      emit('movement_lock.closed', tick, mutable.phase, {
        lockId: lock.lockId,
        reason: 'timeline',
        authority: 'world_locomotion_owner_commit_required',
      });
    }
  });
  if (definition.comboWindow?.closesAtActionTickExclusive === actionTick) {
    emit('combo_window.closed', tick, mutable.phase, { reason: 'timeline' });
  }
}

function emitWindowOpenings(mutable, definition, emit, tick, actionTick) {
  const activeTick = actionTick - definition.timeline.activeStartTick;
  for (const window of definition.impactWindows) {
    if (window.opensAtActiveTick === activeTick) {
      emit('impact_window.opened', tick, mutable.phase, { windowId: window.windowId });
    }
  }
  if (definition.guard !== null) {
    definition.guard.windows.forEach((window, windowIndex) => {
      if (window.opensAtActionTick === actionTick) {
        emit('guard_window.opened', tick, mutable.phase, {
          profileId: definition.guard.profileId,
          windowIndex,
          coverageMilliDegrees: definition.guard.coverageMilliDegrees,
          mitigationBasisPoints: definition.guard.mitigationBasisPoints,
          authority: definition.guard.authority,
        });
      }
    });
  }
  definition.movementLocks.forEach(lock => {
    if (lock.opensAtActionTick === actionTick) {
      emit('movement_lock.opened', tick, mutable.phase, {
        lockId: lock.lockId,
        movementMultiplierBasisPoints: lock.movementMultiplierBasisPoints,
        authority: 'world_locomotion_owner_commit_required',
      });
    }
  });
  if (definition.comboWindow?.opensAtActionTick === actionTick) {
    emit('combo_window.opened', tick, mutable.phase, {
      acceptsActionTags: definition.comboWindow.acceptsActionTags,
    });
  }
}

function emitForcedWindowClosures(mutable, definition, emit, tick, actionTick, reason) {
  const activeTick = actionTick - definition.timeline.activeStartTick;
  for (const window of definition.impactWindows) {
    if (impactWindowIsOpen(window, activeTick)) {
      emit('impact_window.closed', tick, mutable.phase, { windowId: window.windowId, reason });
    }
  }
  if (definition.guard !== null) {
    definition.guard.windows.forEach((window, windowIndex) => {
      if (phaseWindowIsOpen(window, actionTick)) {
        emit('guard_window.closed', tick, mutable.phase, {
          profileId: definition.guard.profileId,
          windowIndex,
          reason,
        });
      }
    });
  }
  definition.movementLocks.forEach(lock => {
    if (phaseWindowIsOpen(lock, actionTick)) {
      emit('movement_lock.closed', tick, mutable.phase, {
        lockId: lock.lockId,
        reason,
        authority: 'world_locomotion_owner_commit_required',
      });
    }
  });
  if (definition.comboWindow !== null && phaseWindowIsOpen(definition.comboWindow, actionTick)) {
    emit('combo_window.closed', tick, mutable.phase, { reason });
  }
}

function cancelAllowed(definition, actionTick, reason) {
  return definition.cancelPolicy.windows.some(window => phaseWindowIsOpen(window, actionTick)
    && window.reasons.includes(reason));
}

function interruptRejection(definition, phase, reason) {
  if (!definition.interruptPolicy.allowedPhases.includes(phase)
    || !definition.interruptPolicy.allowedReasons.includes(reason)) return 'interrupt_not_allowed';
  if (definition.interruptPolicy.superArmorPhases.includes(phase)
    && !SUPER_ARMOR_BYPASS_REASONS.has(reason)) return 'super_armor';
  return null;
}

function emitRefunds(mutable, definition, emit, tick, transitionType) {
  for (const resource of definition.resourceCosts) {
    const progress = resourceProgressFor(mutable, resource.resourceKey);
    const policy = transitionType === 'cancelled'
      ? resource.refundOnCancel
      : resource.refundOnInterrupt;
    const shouldRefund = policy === 'full' || policy === 'uncommitted' && !progress.commitRequested;
    if (!shouldRefund || progress.refundRequested) continue;
    progress.refundRequested = true;
    emit('resource.refund_requested', tick, mutable.phase, {
      resourceKey: resource.resourceKey,
      amountUnits: resource.amountUnits,
      policy,
      transitionType,
      commitAlreadyRequested: progress.commitRequested,
      authority: 'resource_owner_commit_required',
    });
  }
}

function terminateFromRequest(mutable, definition, emit, request, tick, actionTick) {
  const terminalType = request.type === 'cancel' ? 'cancelled' : 'interrupted';
  emitForcedWindowClosures(mutable, definition, emit, tick, actionTick, terminalType);
  if (COMBAT_V91_DYNAMICS_PHASES.includes(mutable.phase)) {
    emit('phase.exited', tick, mutable.phase, { phase: mutable.phase, reason: terminalType });
  }
  emitRefunds(mutable, definition, emit, tick, terminalType);
  emit(`action.${terminalType}`, tick, terminalType, {
    requestId: request.requestId,
    authoritySequence: request.authoritySequence,
    reason: request.reason,
  });
  mutable.phase = terminalType;
  mutable.terminal = {
    type: terminalType,
    reason: request.reason,
    requestId: request.requestId,
    atTick: tick,
  };
}

function processTransitionRequests(mutable, definition, emit, requests, tick, actionTick) {
  for (const request of requests) {
    mutable.processedRequestIds.push(request.requestId);
    mutable.processedRequestIds.sort(compareStrings);
    if (mutable.terminal !== null) {
      emit('transition.rejected', tick, mutable.phase, {
        requestId: request.requestId,
        authoritySequence: request.authoritySequence,
        transitionType: request.type,
        requestedReason: request.reason,
        reason: 'action_terminal',
      });
      continue;
    }
    const rejection = request.type === 'cancel'
      ? cancelAllowed(definition, actionTick, request.reason) ? null : 'cancel_not_allowed'
      : interruptRejection(definition, mutable.phase, request.reason);
    if (rejection !== null) {
      emit('transition.rejected', tick, mutable.phase, {
        requestId: request.requestId,
        authoritySequence: request.authoritySequence,
        transitionType: request.type,
        requestedReason: request.reason,
        reason: rejection,
      });
      continue;
    }
    terminateFromRequest(mutable, definition, emit, request, tick, actionTick);
  }
}

function emitHits(mutable, definition, emit, tick, actionTick) {
  const activeTick = actionTick - definition.timeline.activeStartTick;
  const hits = definition.impactWindows
    .flatMap(window => window.hits.map(hit => ({ ...hit, windowId: window.windowId })))
    .filter(hit => hit.atActiveTick === activeTick)
    .sort((left, right) => left.hitOrdinal - right.hitOrdinal);
  if (hits.length > 0) emitResourceCommit(mutable, definition, emit, tick, 'first_impact');
  for (const hit of hits) {
    if (mutable.emittedHitOrdinals.includes(hit.hitOrdinal)) continue;
    const idempotencyKey = `${mutable.combatId}:${mutable.actionSequence}:${definition.fingerprint}:hit:${hit.hitOrdinal}`;
    const commonPayload = {
      windowId: hit.windowId,
      hitOrdinal: hit.hitOrdinal,
      delivery: hit.delivery,
      idempotencyKey,
      impulseCandidate: impulseFor(definition, hit.hitOrdinal),
      hitstopPresentation: definition.hitstopPresentation,
    };
    if (hit.delivery === 'projectile') {
      const projectile = projectileFor(definition, hit.hitOrdinal);
      emit('projectile.spawn_requested', tick, mutable.phase, {
        ...commonPayload,
        projectile,
        authority: 'world_spawn_and_collision_required',
      });
    } else {
      emit('impact.requested', tick, mutable.phase, {
        ...commonPayload,
        authority: 'combat_resolver_required',
      });
    }
    mutable.emittedHitOrdinals.push(hit.hitOrdinal);
    mutable.emittedHitOrdinals.sort((left, right) => left - right);
  }
}

function beginTick(mutable, definition, emit, tick, actionTick) {
  if (actionTick === 0) {
    emit('action.started', tick, 'scheduled', {
      tickRate: COMBAT_V91_DYNAMICS_TICK_RATE,
      definitionVersion: definition.definitionVersion,
    });
    for (const resource of definition.resourceCosts) {
      const progress = resourceProgressFor(mutable, resource.resourceKey);
      progress.reserveRequested = true;
      emit('resource.reserve_requested', tick, 'scheduled', {
        resourceKey: resource.resourceKey,
        amountUnits: resource.amountUnits,
        authority: 'resource_owner_commit_required',
      });
    }
  }

  emitNormalWindowClosures(mutable, definition, emit, tick, actionTick);
  const scheduledPhase = canonicalPhaseAt(definition, actionTick);
  if (scheduledPhase === 'completed') {
    if (COMBAT_V91_DYNAMICS_PHASES.includes(mutable.phase)) {
      emit('phase.exited', tick, mutable.phase, { phase: mutable.phase, reason: 'timeline' });
    }
    emitResourceCommit(mutable, definition, emit, tick, 'completion');
    emit('action.completed', tick, 'completed', { reason: 'timeline' });
    mutable.phase = 'completed';
    mutable.terminal = {
      type: 'completed',
      reason: 'timeline',
      requestId: null,
      atTick: tick,
    };
    return;
  }
  if (scheduledPhase !== mutable.phase) {
    if (COMBAT_V91_DYNAMICS_PHASES.includes(mutable.phase)) {
      emit('phase.exited', tick, mutable.phase, { phase: mutable.phase, reason: 'timeline' });
    }
    mutable.phase = scheduledPhase;
    emit('phase.entered', tick, mutable.phase, { phase: mutable.phase });
  }
  emitWindowOpenings(mutable, definition, emit, tick, actionTick);
  if (actionTick === definition.timeline.activeStartTick) {
    emitResourceCommit(mutable, definition, emit, tick, 'active_start');
  }
}

export function advanceCombatDynamicsSchedule({
  state: stateInput,
  definition: definitionInput,
  throughTick,
  transitionRequests = [],
} = {}) {
  const stateResult = validateCombatDynamicsState(stateInput, definitionInput);
  if (!stateResult.ok) return stateResult;
  const state = stateResult.state;
  const definition = stateResult.definition;
  if (!Number.isSafeInteger(throughTick) || throughTick < state.lastProcessedTick) {
    return result(false, 'invalid_through_tick');
  }
  const completionTick = state.startTick + definition.timeline.completionTick;
  const requestResult = canonicalTransitionRequests(
    transitionRequests,
    state,
    throughTick,
    completionTick,
  );
  if (!requestResult.ok) return requestResult;
  if (state.terminal !== null && requestResult.requests.length > 0) {
    return result(false, 'action_terminal');
  }
  if (state.terminal !== null || throughTick === state.lastProcessedTick) {
    return result(true, null, { state, events: Object.freeze([]) });
  }

  const mutable = {
    ...statePayload(state),
    terminal: state.terminal === null ? null : { ...state.terminal },
    emittedHitOrdinals: [...state.emittedHitOrdinals],
    processedRequestIds: [...state.processedRequestIds],
    resourceProgress: state.resourceProgress.map(progress => ({ ...progress })),
    events: [],
  };
  const emit = eventEmitter(mutable);
  const finalTick = Math.min(throughTick, completionTick);
  const requestsByTick = new Map();
  for (const request of requestResult.requests) {
    const atTick = requestsByTick.get(request.atTick) ?? [];
    atTick.push(request);
    requestsByTick.set(request.atTick, atTick);
  }

  for (let tick = state.lastProcessedTick + 1; tick <= finalTick; tick += 1) {
    const actionTick = tick - state.startTick;
    beginTick(mutable, definition, emit, tick, actionTick);
    if (mutable.terminal === null) {
      processTransitionRequests(
        mutable,
        definition,
        emit,
        requestsByTick.get(tick) ?? [],
        tick,
        actionTick,
      );
    }
    if (mutable.terminal === null) emitHits(mutable, definition, emit, tick, actionTick);
    mutable.lastProcessedTick = tick;
    if (mutable.terminal !== null) break;
  }

  const nextState = freezeState(mutable);
  return result(true, null, {
    state: nextState,
    events: deepFreeze([...mutable.events]),
  });
}
