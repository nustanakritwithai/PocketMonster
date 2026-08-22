// PocketMonster V8.1 — immutable encounter-status lifecycle.
// Application chance/type rules live in status-resolver.mjs. This module owns
// encounter-local timers, stacks, declared interactions, DoT ticks and cleanup.

import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { statusCatalogEntry } from './status-catalog.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

export const STATUS_LIFECYCLE_POLICY = Object.freeze({
  tickAtApply: false,
  dotCanFaint: true,
  encounterStatusesPersist: false,
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

function freezeStatuses(statuses) {
  return Object.freeze(statuses.map(status => Object.freeze({ ...status })));
}

function lifecycle(statuses = []) {
  return Object.freeze({ statuses: freezeStatuses(statuses) });
}

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function normalizeLifecycle(value) {
  if (!value || !Array.isArray(value.statuses)) return null;
  return value;
}

function interactionFor(incomingStatusId, existingStatusId) {
  return STATUS_INTERACTIONS.find(rule => rule.incomingStatusId === incomingStatusId
    && rule.existingStatusId === existingStatusId) ?? null;
}

function runtimeStatus(proposedStatus, definition) {
  return Object.freeze({
    statusId: definition.id,
    sourceSkillId: proposedStatus.sourceSkillId ?? null,
    sourceLinkId: proposedStatus.sourceLinkId ?? null,
    sourceInstanceId: proposedStatus.sourceInstanceId ?? null,
    stacks: Math.min(definition.maxStacks, proposedStatus.stacks),
    remainingDurationSec: proposedStatus.durationSec,
    nextTickSec: definition.tickIntervalSec > 0 ? definition.tickIntervalSec : null,
    stackRule: definition.stackRule,
    category: definition.category,
  });
}

export function createStatusLifecycle() {
  return lifecycle();
}

export function applyStatusToLifecycle(currentLifecycle, proposedStatus) {
  const current = normalizeLifecycle(currentLifecycle);
  if (!current) return result(false, 'invalid_lifecycle', { lifecycle: currentLifecycle });
  if (!proposedStatus || typeof proposedStatus !== 'object') {
    return result(false, 'invalid_proposed_status', { lifecycle: current });
  }
  const definition = statusCatalogEntry(proposedStatus.statusId);
  if (!definition) return result(false, 'unknown_status', { lifecycle: current, statusId: proposedStatus.statusId ?? null });
  if (!Number.isInteger(proposedStatus.stacks) || proposedStatus.stacks < 1
    || !Number.isFinite(proposedStatus.durationSec) || proposedStatus.durationSec <= 0) {
    return result(false, 'invalid_proposed_status', { lifecycle: current, statusId: definition.id });
  }

  const incoming = runtimeStatus(proposedStatus, definition);
  const sameIndex = current.statuses.findIndex(status => status.statusId === incoming.statusId);
  if (sameIndex >= 0) {
    const existing = current.statuses[sameIndex];
    let replacement;
    if (definition.stackRule === 'AddStackAndRefresh') {
      // resolveStatusApplication proposes the absolute next stack count. Taking
      // the maximum prevents counting the existing stacks a second time when
      // the lifecycle consumes that proposal.
      replacement = { ...incoming, stacks: Math.min(definition.maxStacks, Math.max(existing.stacks, incoming.stacks)) };
    } else if (definition.stackRule === 'ReplaceByLonger') {
      replacement = incoming.remainingDurationSec > existing.remainingDurationSec ? incoming : existing;
    } else {
      replacement = { ...incoming, stacks: Math.max(existing.stacks, incoming.stacks) };
    }
    const statuses = [...current.statuses];
    statuses[sameIndex] = replacement;
    return result(true, null, {
      applied: replacement !== existing,
      lifecycle: lifecycle(statuses),
      removedStatusIds: Object.freeze([]),
      interaction: definition.stackRule,
    });
  }

  const matching = current.statuses
    .map((status, index) => ({ status, index, rule: interactionFor(incoming.statusId, status.statusId) }))
    .filter(match => match.rule)
    .sort((a, b) => b.rule.priority - a.rule.priority)[0] ?? null;

  if (matching?.rule.interaction === 'LongerRemainingWins'
    && matching.status.remainingDurationSec >= incoming.remainingDurationSec) {
    return result(true, 'existing_longer', {
      applied: false,
      lifecycle: current,
      removedStatusIds: Object.freeze([]),
      interaction: matching.rule.interaction,
    });
  }

  const removesExisting = matching && ['RemoveExistingThenApply', 'ReplaceExisting', 'LongerRemainingWins']
    .includes(matching.rule.interaction);
  const removedStatusIds = removesExisting ? [matching.status.statusId] : [];
  const statuses = current.statuses.filter((_, index) => !removesExisting || index !== matching.index);
  statuses.push(incoming);
  return result(true, null, {
    applied: true,
    lifecycle: lifecycle(statuses),
    removedStatusIds: Object.freeze(removedStatusIds),
    interaction: matching?.rule.interaction ?? 'Coexist',
  });
}

function dotDamage(definition, status, maxHp) {
  if (definition.category !== 'DoT' || definition.tickIntervalSec <= 0) return 0;
  const stackMultiplier = definition.magnitudeUnit === 'PctPerTickPerStack' ? status.stacks : 1;
  return maxHp * Math.abs(definition.magnitude) / 100 * stackMultiplier;
}

export function advanceStatusLifecycle(currentLifecycle, deltaSec, { maxHp } = {}) {
  const current = normalizeLifecycle(currentLifecycle);
  if (!current) return result(false, 'invalid_lifecycle', { lifecycle: currentLifecycle, totalDamage: 0, events: Object.freeze([]) });
  if (!Number.isFinite(deltaSec) || deltaSec < 0 || !Number.isFinite(maxHp) || maxHp < 0) {
    return result(false, 'invalid_tick', { lifecycle: current, totalDamage: 0, events: Object.freeze([]) });
  }

  const statuses = [];
  const events = [];
  let totalDamage = 0;
  for (const status of current.statuses) {
    const definition = statusCatalogEntry(status.statusId);
    if (!definition) continue;
    const activeSec = Math.min(deltaSec, status.remainingDurationSec);
    let nextTickSec = status.nextTickSec;
    if (definition.category === 'DoT' && nextTickSec !== null) {
      while (nextTickSec <= activeSec + Number.EPSILON) {
        const damage = dotDamage(definition, status, maxHp);
        totalDamage += damage;
        events.push(Object.freeze({ type: 'dot_tick', statusId: status.statusId, stacks: status.stacks, damage }));
        nextTickSec += definition.tickIntervalSec;
      }
      nextTickSec -= activeSec;
    }
    const remainingDurationSec = Math.max(0, status.remainingDurationSec - deltaSec);
    if (remainingDurationSec <= Number.EPSILON) {
      events.push(Object.freeze({ type: 'status_expired', statusId: status.statusId }));
    } else {
      statuses.push({ ...status, remainingDurationSec, nextTickSec });
    }
  }
  return result(true, null, {
    lifecycle: lifecycle(statuses),
    totalDamage,
    events: Object.freeze(events),
  });
}

export function clearStatusLifecycle(currentLifecycle, reason = 'encounter_end') {
  const current = normalizeLifecycle(currentLifecycle);
  if (!current) return result(false, 'invalid_lifecycle', { lifecycle: currentLifecycle, events: Object.freeze([]) });
  const events = Object.freeze(current.statuses.map(status => Object.freeze({
    type: 'status_cleared', statusId: status.statusId, reason,
  })));
  return result(true, null, { lifecycle: lifecycle(), events });
}

for (const interaction of STATUS_INTERACTIONS) {
  if (!statusCatalogEntry(interaction.incomingStatusId) || !statusCatalogEntry(interaction.existingStatusId)) {
    throw new TypeError(`Invalid status interaction: ${interaction.incomingStatusId}/${interaction.existingStatusId}`);
  }
}
