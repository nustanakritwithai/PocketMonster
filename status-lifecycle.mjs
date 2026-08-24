// PocketMonster V8.1 — immutable encounter-local status lifecycle.

import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { statusCatalogEntry } from './status-catalog.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

export const STATUS_LIFECYCLE_POLICY = Object.freeze({
  tickAtApply: false,
  dotCanFaint: true,
  applyRequiresSettledTickCursor: true,
  encounterBoundary: 'clear_all',
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
});

export const HARD_CC_DR_POLICY = Object.freeze({
  windowSec: 6,
  durationMultipliers: Object.freeze([1, 0.65, 0.4]),
  minimumDurationSec: 0.25,
  scope: 'central_per_encounter_target',
});

const RAW_INTERACTIONS = [
  [100, 'ST_BURN', 'ST_FREEZE', 'RemoveExistingThenApply'],
  [100, 'ST_FREEZE', 'ST_BURN', 'RemoveExistingThenApply'],
  [90, 'ST_STUN', 'ST_STAGGER', 'ReplaceExisting'],
  [90, 'ST_FREEZE', 'ST_STAGGER', 'ReplaceExisting'],
  [80, 'ST_STUN', 'ST_FREEZE', 'LongerRemainingWins'],
  [80, 'ST_FREEZE', 'ST_STUN', 'LongerRemainingWins'],
  [70, 'ST_SLOW', 'ST_FREEZE', 'SuspendUnderHardCC'],
  [70, 'ST_ROOT', 'ST_STUN', 'Coexist'],
  [60, 'ST_POISON', 'ST_POISON', 'StackRule'],
  [60, 'ST_BLEED', 'ST_BLEED', 'StackRule'],
  [50, 'ST_ATK_UP', 'ST_WEAKEN', 'NetModifier'],
  [50, 'ST_DEF_UP', 'ST_ARMOR_BREAK', 'NetModifier'],
  [50, 'ST_DAMAGE_REDUCE', 'ST_VULNERABLE', 'NetModifier'],
];

export const STATUS_INTERACTIONS = Object.freeze(RAW_INTERACTIONS.map(([
  priority, incomingStatusId, existingStatusId, interaction,
]) => Object.freeze({ priority, incomingStatusId, existingStatusId, interaction })));

const EMPTY_STATUS_LIST = Object.freeze([]);
const EMPTY_CONTROL_HISTORY = Object.freeze([]);
const EMPTY_CONTROL_DR = Object.freeze({
  windowStartedAtSec: null,
  lastAppliedAtSec: null,
  count: 0,
  history: EMPTY_CONTROL_HISTORY,
});
const EMPTY_TICKS = Object.freeze([]);

function frozenStatuses(statuses) {
  return statuses.length === 0 ? EMPTY_STATUS_LIST : Object.freeze(statuses.map(status => Object.freeze({ ...status })));
}

function emptyControlDr() {
  return EMPTY_CONTROL_DR;
}

function frozenControlDr(controlDr = emptyControlDr()) {
  if (!Array.isArray(controlDr?.history) || controlDr.history.length === 0) return EMPTY_CONTROL_DR;
  const history = Array.isArray(controlDr?.history)
    ? controlDr.history.map(entry => Object.freeze({ statusId: entry.statusId, atSec: entry.atSec }))
    : [];
  return Object.freeze({
    windowStartedAtSec: history[0]?.atSec ?? null,
    lastAppliedAtSec: history.at(-1)?.atSec ?? null,
    count: history.length,
    history: Object.freeze(history),
  });
}

function activeControlDr(controlDr, nowSec) {
  const canonical = frozenControlDr(controlDr);
  if (canonical.history.length === 0) return EMPTY_CONTROL_DR;
  const history = canonical.history.filter(
    entry => nowSec - entry.atSec < HARD_CC_DR_POLICY.windowSec,
  );
  return frozenControlDr({ history });
}

function statusState({ encounterId, currentTimeSec, ended, statuses, controlDr }) {
  return Object.freeze({
    encounterId,
    currentTimeSec,
    ended,
    statuses: frozenStatuses(statuses),
    controlDr: frozenControlDr(controlDr),
  });
}

function validRuntimeStatusTiming(status, definition, currentTimeSec) {
  return Number.isFinite(status.appliedAtSec) && status.appliedAtSec >= 0 && status.appliedAtSec <= currentTimeSec
    && Number.isFinite(status.expiresAtSec) && status.expiresAtSec > currentTimeSec
    && (definition.tickIntervalSec > 0
      ? Number.isFinite(status.nextTickAtSec) && status.nextTickAtSec > currentTimeSec
      : status.nextTickAtSec === null);
}

function validRuntimeStatus(status, currentTimeSec) {
  if (!status || typeof status !== 'object' || Array.isArray(status)) return false;
  const definition = statusCatalogEntry(status.statusId);
  if (!definition
    || ![status.sourceSkillId, status.sourceLinkId, status.sourceInstanceId]
      .every(value => value === null || typeof value === 'string')
    || !Number.isInteger(status.stacks) || status.stacks < 1 || status.stacks > definition.maxStacks
    || !validRuntimeStatusTiming(status, definition, currentTimeSec)
    || status.stackRule !== definition.stackRule
    || status.category !== definition.category) return false;
  return true;
}

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function validState(state) {
  if (!state || typeof state.encounterId !== 'string' || state.encounterId.length === 0
    || !Number.isFinite(state.currentTimeSec) || state.currentTimeSec < 0
    || typeof state.ended !== 'boolean' || !Array.isArray(state.statuses)
    || state.ended && state.statuses.length > 0) {
    return false;
  }
  for (let index = 0; index < state.statuses.length; index += 1) {
    const status = state.statuses[index];
    if (!validRuntimeStatus(status, state.currentTimeSec)) return false;
    for (let prior = 0; prior < index; prior += 1) {
      if (state.statuses[prior].statusId === status.statusId) return false;
    }
  }
  if (state.controlDr == null) return true;
  if (!Array.isArray(state.controlDr.history)
    || state.controlDr.history.some((entry, index, history) => {
      const definition = entry && statusCatalogEntry(entry.statusId);
      return !definition?.hardCC || !Number.isFinite(entry.atSec) || entry.atSec < 0
        || entry.atSec > state.currentTimeSec || (index > 0 && entry.atSec < history[index - 1].atSec);
    })) return false;
  const history = state.controlDr.history;
  return state.controlDr.count === history.length
    && state.controlDr.windowStartedAtSec === (history[0]?.atSec ?? null)
    && state.controlDr.lastAppliedAtSec === (history.at(-1)?.atSec ?? null);
}

export function isEncounterStatusState(state) {
  return validState(state);
}

function interactionFor(incomingStatusId, existingStatusId) {
  return STATUS_INTERACTIONS.find(rule => rule.incomingStatusId === incomingStatusId
    && rule.existingStatusId === existingStatusId) ?? null;
}

function runtimeStatus(proposed, definition, nowSec) {
  return {
    statusId: definition.id,
    sourceSkillId: proposed.sourceSkillId ?? null,
    sourceLinkId: proposed.sourceLinkId ?? null,
    sourceInstanceId: proposed.sourceInstanceId ?? null,
    stacks: Math.min(definition.maxStacks, proposed.stacks),
    appliedAtSec: nowSec,
    expiresAtSec: nowSec + proposed.durationSec,
    nextTickAtSec: definition.tickIntervalSec > 0 ? nowSec + definition.tickIntervalSec : null,
    stackRule: definition.stackRule,
    category: definition.category,
  };
}

export function createEncounterStatusState({ encounterId, nowSec = 0 } = {}) {
  if (typeof encounterId !== 'string' || encounterId.length === 0 || !Number.isFinite(nowSec) || nowSec < 0) {
    throw new TypeError('Invalid encounter status state');
  }
  return statusState({ encounterId, currentTimeSec: nowSec, ended: false, statuses: [], controlDr: emptyControlDr() });
}

function hardCcDuration(controlDr, definition, requestedDurationSec, nowSec) {
  const activeDr = activeControlDr(controlDr, nowSec);
  if (!definition.hardCC) {
    return Object.freeze({
      durationSec: requestedDurationSec,
      controlDr: activeDr,
      detail: null,
    });
  }
  const count = activeDr.history.length + 1;
  const stage = Math.min(count, HARD_CC_DR_POLICY.durationMultipliers.length);
  const multiplier = HARD_CC_DR_POLICY.durationMultipliers[stage - 1];
  const durationSec = Math.max(
    HARD_CC_DR_POLICY.minimumDurationSec,
    Math.round(requestedDurationSec * multiplier * 1_000_000) / 1_000_000,
  );
  const history = [...activeDr.history, Object.freeze({ statusId: definition.id, atSec: nowSec })];
  const nextControlDr = frozenControlDr({ history });
  return Object.freeze({
    durationSec,
    controlDr: nextControlDr,
    detail: Object.freeze({
      stage,
      multiplier,
      windowStartedAtSec: nextControlDr.windowStartedAtSec,
      applicationsInWindow: activeDr.history.length,
    }),
  });
}

export function applyEncounterStatus(state, proposed, { nowSec } = {}) {
  if (!validState(state)) return result(false, 'invalid_state', { state });
  if (state.ended) return result(false, 'encounter_ended', { state });
  if (!Number.isFinite(nowSec) || nowSec < state.currentTimeSec) return result(false, 'invalid_time', { state });
  const pendingTick = state.statuses.some(status => {
    const existingDefinition = statusCatalogEntry(status.statusId);
    return existingDefinition?.tickIntervalSec > 0
      && status.nextTickAtSec <= Math.min(nowSec, status.expiresAtSec);
  });
  if (pendingTick) return result(false, 'advance_required', { state });
  if (!proposed || typeof proposed !== 'object') return result(false, 'invalid_proposed_status', { state });
  const definition = statusCatalogEntry(proposed.statusId);
  if (!definition) return result(false, 'unknown_status', { state, statusId: proposed.statusId ?? null });
  if (!Number.isInteger(proposed.stacks) || proposed.stacks < 1
    || !Number.isFinite(proposed.durationSec) || proposed.durationSec <= 0) {
    return result(false, 'invalid_proposed_status', { state, statusId: definition.id });
  }
  const proposedSources = [proposed.sourceSkillId, proposed.sourceLinkId, proposed.sourceInstanceId];
  if (!proposedSources.every(value => value === undefined || value === null || typeof value === 'string')) {
    return result(false, 'invalid_proposed_status', { state, statusId: definition.id });
  }

  const liveStatuses = state.statuses.filter(status => status.expiresAtSec > nowSec);
  const hardCc = hardCcDuration(state.controlDr, definition, proposed.durationSec, nowSec);
  const retainedControlDr = activeControlDr(state.controlDr, nowSec);
  const incoming = runtimeStatus({ ...proposed, durationSec: hardCc.durationSec }, definition, nowSec);
  if (!Number.isFinite(hardCc.durationSec) || !(hardCc.durationSec > 0)
    || !validRuntimeStatusTiming(incoming, definition, nowSec)) {
    return result(false, 'invalid_proposed_status', { state, statusId: definition.id });
  }
  const sameIndex = liveStatuses.findIndex(status => status.statusId === definition.id);
  if (sameIndex >= 0) {
    const existing = liveStatuses[sameIndex];
    let replacement = incoming;
    if (definition.stackRule === 'AddStackAndRefresh') {
      replacement = {
        ...incoming,
        stacks: Math.min(definition.maxStacks, existing.stacks + incoming.stacks),
        nextTickAtSec: existing.nextTickAtSec,
      };
    } else if (definition.stackRule === 'ReplaceByLonger' && existing.expiresAtSec >= incoming.expiresAtSec) {
      replacement = existing;
    } else if (definition.stackRule !== 'Replace') {
      replacement = { ...incoming, stacks: Math.max(existing.stacks, incoming.stacks) };
    }
    const statuses = [...liveStatuses];
    statuses[sameIndex] = replacement;
    const applied = replacement !== existing;
    return result(true, null, {
      applied,
      state: statusState({
        ...state,
        currentTimeSec: nowSec,
        statuses,
        controlDr: applied ? hardCc.controlDr : retainedControlDr,
      }),
      removedStatusIds: Object.freeze([]),
      interaction: definition.stackRule,
      ccDr: applied ? hardCc.detail : null,
      appliedDurationSec: applied ? hardCc.durationSec : null,
    });
  }

  const matching = liveStatuses
    .map((status, index) => ({ status, index, rule: interactionFor(incoming.statusId, status.statusId) }))
    .filter(match => match.rule)
    .sort((a, b) => b.rule.priority - a.rule.priority);
  const blockingHardLock = matching.find(match => match.rule.interaction === 'LongerRemainingWins'
    && match.status.expiresAtSec - nowSec >= hardCc.durationSec) ?? null;
  if (blockingHardLock) {
    return result(true, 'existing_longer', {
      applied: false,
      state: statusState({ ...state, currentTimeSec: nowSec, statuses: liveStatuses, controlDr: retainedControlDr }),
      removedStatusIds: Object.freeze([]),
      interaction: blockingHardLock.rule.interaction,
      ccDr: null,
      appliedDurationSec: null,
    });
  }

  const replaceIndexes = new Set(matching
    .filter(match => ['RemoveExistingThenApply', 'ReplaceExisting', 'LongerRemainingWins']
      .includes(match.rule.interaction))
    .map(match => match.index));
  const removedStatusIds = liveStatuses
    .filter((_, index) => replaceIndexes.has(index))
    .map(status => status.statusId);
  const statuses = liveStatuses.filter((_, index) => !replaceIndexes.has(index));
  statuses.push(incoming);
  return result(true, null, {
    applied: true,
    state: statusState({ ...state, currentTimeSec: nowSec, statuses, controlDr: hardCc.controlDr }),
    removedStatusIds: Object.freeze(removedStatusIds),
    interaction: matching[0]?.rule.interaction ?? 'Coexist',
    ccDr: hardCc.detail,
    appliedDurationSec: hardCc.durationSec,
  });
}

function damagePerTick(definition, status, maxHp) {
  if (definition.category !== 'DoT') return 0;
  const stackMultiplier = definition.magnitudeUnit === 'PctPerTickPerStack' ? status.stacks : 1;
  return maxHp * Math.abs(definition.magnitude) / 100 * stackMultiplier;
}

export function advanceEncounterEffects(state, { toSec, targetHp, targetMaxHp } = {}) {
  if (!validState(state)) return result(false, 'invalid_state', { state, damage: 0, ticks: Object.freeze([]) });
  if (state.ended) return result(false, 'encounter_ended', { state, damage: 0, ticks: Object.freeze([]) });
  if (!Number.isFinite(toSec) || toSec < state.currentTimeSec
    || !Number.isFinite(targetHp) || !Number.isFinite(targetMaxHp) || targetMaxHp <= 0) {
    return result(false, 'invalid_advance', { state, damage: 0, ticks: Object.freeze([]) });
  }

  if (state.statuses.length === 0 && (state.controlDr == null || state.controlDr.history.length === 0)) {
    return result(true, null, {
      state: statusState({ ...state, currentTimeSec: toSec, statuses: EMPTY_STATUS_LIST, controlDr: EMPTY_CONTROL_DR }),
      damage: 0,
      targetHp,
      fainted: targetHp <= 0,
      ticks: EMPTY_TICKS,
    });
  }

  const statuses = [];
  const ticks = [];
  let damage = 0;
  for (const status of state.statuses) {
    const definition = statusCatalogEntry(status.statusId);
    if (!definition) continue;
    let nextTickAtSec = status.nextTickAtSec;
    if (definition.category === 'DoT' && nextTickAtSec !== null) {
      const activeUntil = Math.min(toSec, status.expiresAtSec);
      while (nextTickAtSec <= activeUntil + Number.EPSILON) {
        const tickDamage = damagePerTick(definition, status, targetMaxHp);
        damage += tickDamage;
        ticks.push(Object.freeze({ statusId: status.statusId, atSec: nextTickAtSec, stacks: status.stacks, damage: tickDamage, sourceInstanceId: status.sourceInstanceId }));
        nextTickAtSec += definition.tickIntervalSec;
      }
    }
    if (status.expiresAtSec > toSec) statuses.push({ ...status, nextTickAtSec });
  }
  const nextHp = Math.max(0, targetHp - damage);
  return result(true, null, {
    state: statusState({ ...state, currentTimeSec: toSec, statuses, controlDr: activeControlDr(state.controlDr, toSec) }),
    damage,
    targetHp: nextHp,
    fainted: nextHp <= 0,
    ticks: Object.freeze(ticks),
  });
}

export function endEncounterEffects(state, { nowSec = state?.currentTimeSec } = {}) {
  if (!validState(state) || !Number.isFinite(nowSec) || nowSec < state.currentTimeSec) {
    throw new TypeError('Invalid encounter end');
  }
  return statusState({ ...state, currentTimeSec: nowSec, ended: true, statuses: [], controlDr: emptyControlDr() });
}

for (const rule of STATUS_INTERACTIONS) {
  if (!statusCatalogEntry(rule.incomingStatusId) || !statusCatalogEntry(rule.existingStatusId)) {
    throw new TypeError(`Invalid status interaction: ${rule.incomingStatusId}/${rule.existingStatusId}`);
  }
}
