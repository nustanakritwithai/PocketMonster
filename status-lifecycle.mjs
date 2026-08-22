// PocketMonster V8.1 — immutable encounter-local status lifecycle.

import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { statusCatalogEntry } from './status-catalog.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

export const STATUS_LIFECYCLE_POLICY = Object.freeze({
  tickAtApply: false,
  dotCanFaint: true,
  encounterBoundary: 'clear_all',
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
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

function frozenStatuses(statuses) {
  return Object.freeze(statuses.map(status => Object.freeze({ ...status })));
}

function statusState({ encounterId, currentTimeSec, ended, statuses }) {
  return Object.freeze({ encounterId, currentTimeSec, ended, statuses: frozenStatuses(statuses) });
}

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function validState(state) {
  return state && typeof state.encounterId === 'string' && state.encounterId.length > 0
    && Number.isFinite(state.currentTimeSec) && typeof state.ended === 'boolean' && Array.isArray(state.statuses);
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
  return statusState({ encounterId, currentTimeSec: nowSec, ended: false, statuses: [] });
}

export function applyEncounterStatus(state, proposed, { nowSec } = {}) {
  if (!validState(state)) return result(false, 'invalid_state', { state });
  if (state.ended) return result(false, 'encounter_ended', { state });
  if (!Number.isFinite(nowSec) || nowSec < state.currentTimeSec) return result(false, 'invalid_time', { state });
  if (!proposed || typeof proposed !== 'object') return result(false, 'invalid_proposed_status', { state });
  const definition = statusCatalogEntry(proposed.statusId);
  if (!definition) return result(false, 'unknown_status', { state, statusId: proposed.statusId ?? null });
  if (!Number.isInteger(proposed.stacks) || proposed.stacks < 1
    || !Number.isFinite(proposed.durationSec) || proposed.durationSec <= 0) {
    return result(false, 'invalid_proposed_status', { state, statusId: definition.id });
  }

  const liveStatuses = state.statuses.filter(status => status.expiresAtSec > nowSec);
  const incoming = runtimeStatus(proposed, definition, nowSec);
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
    return result(true, null, {
      applied: replacement !== existing,
      state: statusState({ ...state, currentTimeSec: nowSec, statuses }),
      removedStatusIds: Object.freeze([]),
      interaction: definition.stackRule,
    });
  }

  const matching = liveStatuses
    .map((status, index) => ({ status, index, rule: interactionFor(incoming.statusId, status.statusId) }))
    .filter(match => match.rule)
    .sort((a, b) => b.rule.priority - a.rule.priority)[0] ?? null;
  if (matching?.rule.interaction === 'LongerRemainingWins'
    && matching.status.expiresAtSec - nowSec >= proposed.durationSec) {
    return result(true, 'existing_longer', {
      applied: false,
      state: statusState({ ...state, currentTimeSec: nowSec, statuses: liveStatuses }),
      removedStatusIds: Object.freeze([]),
      interaction: matching.rule.interaction,
    });
  }

  const replace = matching && ['RemoveExistingThenApply', 'ReplaceExisting', 'LongerRemainingWins']
    .includes(matching.rule.interaction);
  const removedStatusIds = replace ? [matching.status.statusId] : [];
  const statuses = liveStatuses.filter((_, index) => !replace || index !== matching.index);
  statuses.push(incoming);
  return result(true, null, {
    applied: true,
    state: statusState({ ...state, currentTimeSec: nowSec, statuses }),
    removedStatusIds: Object.freeze(removedStatusIds),
    interaction: matching?.rule.interaction ?? 'Coexist',
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
        ticks.push(Object.freeze({ statusId: status.statusId, atSec: nextTickAtSec, stacks: status.stacks, damage: tickDamage }));
        nextTickAtSec += definition.tickIntervalSec;
      }
    }
    if (status.expiresAtSec > toSec) statuses.push({ ...status, nextTickAtSec });
  }
  const nextHp = Math.max(0, targetHp - damage);
  return result(true, null, {
    state: statusState({ ...state, currentTimeSec: toSec, statuses }),
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
  return statusState({ ...state, currentTimeSec: nowSec, ended: true, statuses: [] });
}

for (const rule of STATUS_INTERACTIONS) {
  if (!statusCatalogEntry(rule.incomingStatusId) || !statusCatalogEntry(rule.existingStatusId)) {
    throw new TypeError(`Invalid status interaction: ${rule.incomingStatusId}/${rule.existingStatusId}`);
  }
}
