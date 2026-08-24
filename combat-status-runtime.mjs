import { STATUS_CATALOG, statusCatalogEntry } from './status-catalog.mjs';
import { isEncounterStatusState } from './status-lifecycle.mjs';

export const COMBAT_STATUS_RUNTIME_VERSION = 'combat-status-runtime/v1';

export const STATUS_RUNTIME_CHANNELS = Object.freeze({
  ST_BURN: Object.freeze(['dot']),
  ST_POISON: Object.freeze(['dot', 'stack']),
  ST_BLEED: Object.freeze(['dot', 'stack']),
  ST_SWARM: Object.freeze(['dot']),
  ST_SLOW: Object.freeze(['movement_speed']),
  ST_FREEZE: Object.freeze(['action_lock', 'movement_lock']),
  ST_PARALYZE: Object.freeze(['movement_speed', 'cooldown_recovery']),
  ST_STUN: Object.freeze(['action_lock', 'movement_lock']),
  ST_ROOT: Object.freeze(['movement_lock']),
  ST_FEAR: Object.freeze(['forced_retreat', 'skill_lock']),
  ST_CONFUSE: Object.freeze(['accuracy']),
  ST_BLIND: Object.freeze(['accuracy']),
  ST_WEAKEN: Object.freeze(['attack_stat']),
  ST_ARMOR_BREAK: Object.freeze(['defense_stat']),
  ST_VULNERABLE: Object.freeze(['damage_taken']),
  ST_STAGGER: Object.freeze(['action_lock', 'interrupt']),
  ST_ATK_UP: Object.freeze(['attack_stat']),
  ST_DEF_UP: Object.freeze(['defense_stat']),
  ST_SPATK_UP: Object.freeze(['special_attack_stat']),
  ST_SPD_UP: Object.freeze(['movement_speed']),
  ST_DAMAGE_REDUCE: Object.freeze(['damage_taken']),
  ST_EVASION_UP: Object.freeze(['evasion']),
  ST_CRIT_UP: Object.freeze(['critical']),
  ST_ATKDEF_UP: Object.freeze(['attack_stat', 'defense_stat']),
  ST_FIRE_RESIST: Object.freeze(['element_resistance']),
  ST_POISON_RESIST: Object.freeze(['status_resistance']),
});

const STATUS_GLYPHS = Object.freeze({
  ST_BURN: '🔥', ST_POISON: '☠', ST_BLEED: '🩸', ST_SWARM: '🐝',
  ST_SLOW: '🐢', ST_FREEZE: '❄', ST_PARALYZE: '⚡', ST_STUN: '✦',
  ST_ROOT: '🌿', ST_FEAR: '👁', ST_CONFUSE: '🌀', ST_BLIND: '◉',
  ST_WEAKEN: '↓', ST_ARMOR_BREAK: '💥', ST_VULNERABLE: '◇', ST_STAGGER: '!',
  ST_ATK_UP: '⚔', ST_DEF_UP: '🛡', ST_SPATK_UP: '✧', ST_SPD_UP: '➤',
  ST_DAMAGE_REDUCE: '◆', ST_EVASION_UP: '💨', ST_CRIT_UP: '✹',
  ST_ATKDEF_UP: '⬆', ST_FIRE_RESIST: '♨', ST_POISON_RESIST: '⚗',
});

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

const EMPTY_ACTIVE_STATUS_IDS = Object.freeze([]);
export const NEUTRAL_COMBAT_STATUS_RUNTIME = Object.freeze({
  ok: true,
  reason: null,
  activeStatusIds: EMPTY_ACTIVE_STATUS_IDS,
  canMove: true,
  canAttack: true,
  canUseSkill: true,
  actionLocked: false,
  movementLocked: false,
  forcedRetreat: false,
  accuracyMultiplier: 1,
  cooldownRecoveryMultiplier: 1,
});

function activeEntries(statusState, nowSec) {
  return statusState.statuses.filter(status => status.appliedAtSec <= nowSec && status.expiresAtSec > nowSec);
}

export function combatStatusDescriptors(statusState, { nowSec = statusState?.currentTimeSec } = {}) {
  if (!isEncounterStatusState(statusState) || statusState.ended
    || !Number.isFinite(nowSec) || nowSec < statusState.currentTimeSec) return Object.freeze([]);
  return Object.freeze(activeEntries(statusState, nowSec).map(status => {
    const definition = statusCatalogEntry(status.statusId);
    if (!definition) return null;
    const remainingSec = Math.max(0, status.expiresAtSec - nowSec);
    return Object.freeze({
      statusId: status.statusId,
      nameTH: definition.nameTH,
      nameEN: definition.nameEN,
      glyph: STATUS_GLYPHS[status.statusId] ?? '•',
      iconKey: definition.iconKey,
      polarity: definition.polarity,
      category: definition.category,
      stacks: status.stacks,
      remainingSec,
      remainingText: remainingSec < 1 ? remainingSec.toFixed(1) : String(Math.ceil(remainingSec)),
      channels: STATUS_RUNTIME_CHANNELS[status.statusId] ?? Object.freeze([]),
    });
  }).filter(Boolean));
}

export function resolveCombatStatusRuntime(statusState, { nowSec = statusState?.currentTimeSec } = {}) {
  if (!isEncounterStatusState(statusState) || statusState.ended
    || !Number.isFinite(nowSec) || nowSec < statusState.currentTimeSec) {
    return result(false, 'invalid_status_context');
  }
  if (statusState.statuses.length === 0) return NEUTRAL_COMBAT_STATUS_RUNTIME;
  const definitions = activeEntries(statusState, nowSec).map(status => statusCatalogEntry(status.statusId)).filter(Boolean);
  const ids = definitions.map(definition => definition.id);
  const actionLocked = ids.some(id => ['ST_FREEZE', 'ST_STUN', 'ST_STAGGER'].includes(id));
  const movementLocked = actionLocked || ids.includes('ST_ROOT');
  const forcedRetreat = ids.includes('ST_FEAR');
  const accuracyModifierPct = definitions
    .filter(definition => definition.modifiedStat === 'Accuracy')
    .reduce((total, definition) => total + definition.magnitude, 0);
  return result(true, null, {
    activeStatusIds: Object.freeze(ids),
    canMove: !movementLocked,
    canAttack: !actionLocked && !forcedRetreat,
    canUseSkill: !actionLocked && !forcedRetreat,
    actionLocked,
    movementLocked,
    forcedRetreat,
    accuracyMultiplier: Math.max(0.05, Math.min(1, 1 + accuracyModifierPct / 100)),
    cooldownRecoveryMultiplier: ids.includes('ST_PARALYZE') ? 0.8 : 1,
  });
}

for (const status of STATUS_CATALOG) {
  if (!STATUS_RUNTIME_CHANNELS[status.id] || !STATUS_GLYPHS[status.id]) {
    throw new TypeError(`Missing live combat status routing: ${status.id}`);
  }
}
