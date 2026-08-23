// PocketMonster V8.1 — server/gameplay-owned skill targeting commands.
// TargetType and Skill_Advanced geometry come from the workbook catalog;
// presentation callers may request a cast but cannot inject range or resolve hits.

import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { skillCatalogEntry, skillRangeCatalogEntry } from './skill-catalog.mjs';
import {
  MANUAL_SKILL_SLOTS,
  consumeSkillUse,
  manualSkillLoadout,
} from './skill-progression.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

export const TARGETING_POLICY = Object.freeze({
  uiMayResolveHits: false,
  hitResolution: 'gameplay_targeting_resolver',
  supportedTargetKinds: Object.freeze(['Self', 'NearestEnemy', 'EnemyArea', 'GroundPoint']),
  geometrySource: 'Skill_Advanced.RangeM/RadiusM',
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
});

const PREPARED_COMMAND_INSTANCES = new WeakMap();
const COMMITTED_COMMAND_IDS = new WeakMap();

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function validPoint(point) {
  return point && typeof point === 'object'
    && Number.isFinite(point.x) && Number.isFinite(point.z);
}

function frozenPoint(point) {
  return Object.freeze({ x: point.x, z: point.z });
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function commandTargetKind(skillId) {
  return skillCatalogEntry(skillId)?.targetType ?? null;
}

function normalizeEnemies(enemies) {
  if (!Array.isArray(enemies)) return result(false, 'invalid_enemies');
  const ids = new Set();
  const normalized = [];
  for (const enemy of enemies) {
    if (!enemy || typeof enemy !== 'object' || typeof enemy.id !== 'string'
      || enemy.id.length === 0 || !validPoint(enemy.position)) {
      return result(false, 'invalid_enemy');
    }
    if (ids.has(enemy.id)) return result(false, 'duplicate_enemy_id', { enemyId: enemy.id });
    ids.add(enemy.id);
    if (enemy.alive !== true || enemy.targetable !== true) continue;
    normalized.push(Object.freeze({ id: enemy.id, position: frozenPoint(enemy.position) }));
  }
  return result(true, null, { enemies: Object.freeze(normalized) });
}

function sortedByDistance(enemies, point) {
  return [...enemies]
    .map(enemy => ({ ...enemy, distance: distance(point, enemy.position) }))
    .sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id));
}

export function resolveSkillCommand({
  commandId,
  skillId,
  actor,
  enemies = [],
  groundPoint = null,
  currentUses,
  cooldownRemainingSec = 0,
} = {}) {
  if (typeof commandId !== 'string' || commandId.trim() === '') {
    return result(false, 'invalid_command_id');
  }
  const normalizedCommandId = commandId.trim();
  const skill = skillCatalogEntry(skillId);
  if (!skill) return result(false, 'unknown_skill', { commandId: normalizedCommandId, skillId: skillId ?? null });
  if (!actor || typeof actor !== 'object' || typeof actor.id !== 'string'
    || actor.id.length === 0 || actor.alive !== true || !validPoint(actor.position)) {
    return result(false, 'invalid_actor', { commandId: normalizedCommandId, skillId });
  }
  if (!Number.isInteger(currentUses) || currentUses < 0 || currentUses > skill.maxUses) {
    return result(false, 'invalid_uses', { commandId: normalizedCommandId, skillId, currentUses: currentUses ?? null });
  }
  if (!Number.isFinite(cooldownRemainingSec) || cooldownRemainingSec < 0) {
    return result(false, 'invalid_cooldown', { commandId: normalizedCommandId, skillId, cooldownRemainingSec: cooldownRemainingSec ?? null });
  }
  if (cooldownRemainingSec > 0) {
    return result(false, 'cooldown_active', { commandId: normalizedCommandId, skillId, cooldownRemainingSec });
  }
  if (currentUses === 0) return result(false, 'no_uses', { commandId: normalizedCommandId, skillId });

  const targetKind = skill.targetType;
  const geometry = skillRangeCatalogEntry(skillId);
  if (!geometry || geometry.targetType !== targetKind) return result(false, 'unsupported_target_kind', {
    commandId: normalizedCommandId, skillId, targetKind,
  });
  let targetIds = [];
  let targetPoint = null;
  if (targetKind === 'Self') {
    targetIds = [actor.id];
    targetPoint = frozenPoint(actor.position);
  } else if (targetKind === 'GroundPoint') {
    if (!validPoint(groundPoint)) {
      return result(false, 'ground_point_required', { commandId: normalizedCommandId, skillId, targetKind });
    }
    if (distance(actor.position, groundPoint) > geometry.rangeM) {
      return result(false, 'ground_point_out_of_range', {
        commandId: normalizedCommandId, skillId, targetKind, rangeM: geometry.rangeM,
      });
    }
    targetPoint = frozenPoint(groundPoint);
  } else {
    const normalized = normalizeEnemies(enemies);
    if (!normalized.ok) return result(false, normalized.reason, {
      commandId: normalizedCommandId, skillId, ...(normalized.enemyId ? { enemyId: normalized.enemyId } : {}),
    });
    const byActorDistance = sortedByDistance(normalized.enemies, actor.position);
    const primary = byActorDistance.find(enemy => enemy.distance <= geometry.rangeM) ?? null;
    if (!primary) return result(false, 'no_valid_target', {
      commandId: normalizedCommandId, skillId, targetKind, rangeM: geometry.rangeM,
    });
    targetPoint = frozenPoint(primary.position);
    if (targetKind === 'NearestEnemy') {
      targetIds = [primary.id];
    } else {
      targetIds = sortedByDistance(normalized.enemies, primary.position)
        .filter(enemy => enemy.distance <= geometry.radiusM)
        .map(enemy => enemy.id);
    }
  }

  return result(true, null, {
    commandId: normalizedCommandId,
    castId: normalizedCommandId,
    skillId,
    targetKind,
    targetIds: Object.freeze(targetIds),
    targetPoint,
    rangeM: geometry.rangeM,
    radiusM: geometry.radiusM,
    startCooldownSec: skill.cooldownSec,
    hitResolution: TARGETING_POLICY.hitResolution,
  });
}

function equippedCurrentUses(skillRecord, maxUses) {
  if (skillRecord.currentUses == null) return maxUses;
  return skillRecord.currentUses;
}

function committedCommandIds(instance, create = false) {
  let commandIds = COMMITTED_COMMAND_IDS.get(instance);
  if (!commandIds && create) {
    commandIds = new Set();
    COMMITTED_COMMAND_IDS.set(instance, commandIds);
  }
  return commandIds ?? null;
}

function normalizedCommandId(commandId) {
  return typeof commandId === 'string' && commandId.trim() !== '' ? commandId.trim() : null;
}

// Gameplay-owned adapter for a manual-slot request. It reads the canonical
// equipped record and its per-instance Uses; callers cannot substitute another
// SkillID or resource count for the selected slot.
export function resolveEquippedSkillCommand(instance, {
  slot,
  commandId,
  actor,
  enemies = [],
  groundPoint = null,
  cooldownRemainingSec = 0,
} = {}) {
  if (!instance || typeof instance !== 'object' || typeof instance.instanceId !== 'string'
    || instance.instanceId.length === 0 || !Array.isArray(instance.skills)) {
    return result(false, 'invalid_state');
  }
  if (!MANUAL_SKILL_SLOTS.includes(slot)) return result(false, 'slot_locked', { slot: slot ?? null });
  const replayId = normalizedCommandId(commandId);
  if (replayId && committedCommandIds(instance)?.has(replayId)) {
    return result(false, 'duplicate_cast', { slot, commandId: replayId, castId: replayId });
  }
  if (!actor || actor.id !== instance.instanceId) {
    return result(false, 'actor_mismatch', { slot, actorId: actor?.id ?? null, instanceId: instance.instanceId });
  }
  const equipped = manualSkillLoadout(instance).find(entry => entry.slot === slot);
  if (!equipped?.skill) return result(false, 'not_equipped', { slot });
  const definition = skillCatalogEntry(equipped.skillId);
  if (!definition) return result(false, 'unknown_id', { slot, skillId: equipped.skillId });
  const command = resolveSkillCommand({
    commandId,
    skillId: equipped.skillId,
    actor,
    enemies,
    groundPoint,
    currentUses: equippedCurrentUses(equipped.skill, definition.maxUses),
    cooldownRemainingSec,
  });
  if (!command.ok) return result(false, command.reason, { ...command, slot });
  const prepared = result(true, null, {
    ...command,
    slot,
    currentUses: equippedCurrentUses(equipped.skill, definition.maxUses),
    maxUses: definition.maxUses,
  });
  PREPARED_COMMAND_INSTANCES.set(prepared, instance);
  return prepared;
}

// Commit only commands produced for this exact instance. Targeting is read-only;
// this is the single Uses mutation boundary and reuses A17's cast replay guard.
export function commitEquippedSkillCommand(instance, command) {
  if (!command || typeof command !== 'object' || command.ok !== true
    || PREPARED_COMMAND_INSTANCES.get(command) !== instance) {
    return result(false, 'invalid_command', { consumed: 0 });
  }
  if (committedCommandIds(instance)?.has(command.castId)) {
    return result(false, 'duplicate_cast', { consumed: 0, skillId: command.skillId, castId: command.castId });
  }
  const consumption = consumeSkillUse(instance, {
    skillId: command.skillId,
    castId: command.castId,
    castAccepted: true,
  });
  if (consumption.ok) committedCommandIds(instance, true).add(command.castId);
  return consumption;
}
