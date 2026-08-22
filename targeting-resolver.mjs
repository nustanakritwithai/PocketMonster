// PocketMonster V8.1 — pure skill-command targeting resolver.
// This module validates who/where a command may target. Damage, accuracy,
// status application and presentation remain downstream consumers.

import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { skillCatalogEntry } from './skill-catalog.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

export const TARGETING_POLICY = Object.freeze({
  uiMayResolveHits: false,
  hitResolution: 'deferred_to_gameplay_resolver',
  supportedTargetKinds: Object.freeze(['Self', 'NearestEnemy', 'EnemyArea', 'GroundPoint']),
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
});

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function validPoint(point) {
  return point && typeof point === 'object'
    && Number.isFinite(point.x) && Number.isFinite(point.z);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function commandTargetKind(skillId) {
  const skill = skillCatalogEntry(skillId);
  if (!skill) return null;
  if (skill.applicationMode === 'Self' || skill.targetType === 'Self') return 'Self';
  if (['GroundPoint', 'GroundArea'].includes(skill.applicationMode) || skill.targetType === 'GroundPoint') {
    return 'GroundPoint';
  }
  if (['Area', 'SingleOrArea'].includes(skill.applicationMode)) return 'EnemyArea';
  return 'NearestEnemy';
}

function validEnemies(enemies, actorPosition, range) {
  if (!Array.isArray(enemies)) return [];
  const seen = new Set();
  return enemies
    .filter(enemy => {
      if (!enemy || typeof enemy !== 'object' || typeof enemy.id !== 'string' || enemy.id.length === 0) return false;
      if (seen.has(enemy.id) || enemy.alive === false || enemy.targetable === false || !validPoint(enemy.position)) return false;
      seen.add(enemy.id);
      return distance(actorPosition, enemy.position) <= range;
    })
    .map(enemy => Object.freeze({ id: enemy.id, distance: distance(actorPosition, enemy.position) }))
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
}

export function resolveSkillCommand({
  commandId,
  skillId,
  actor,
  enemies = [],
  groundPoint = null,
  range = 6,
  currentUses,
  cooldownRemainingSec = 0,
} = {}) {
  if (typeof commandId !== 'string' || commandId.trim() === '') {
    return result(false, 'invalid_command_id');
  }
  const skill = skillCatalogEntry(skillId);
  if (!skill) return result(false, 'unknown_skill', { skillId: skillId ?? null });
  if (!actor || typeof actor !== 'object' || typeof actor.id !== 'string'
    || actor.id.length === 0 || actor.alive === false || !validPoint(actor.position)) {
    return result(false, 'invalid_actor', { skillId });
  }
  if (!Number.isInteger(currentUses) || currentUses < 0) {
    return result(false, 'invalid_uses', { skillId, currentUses: currentUses ?? null });
  }
  if (!Number.isFinite(cooldownRemainingSec) || cooldownRemainingSec < 0) {
    return result(false, 'invalid_cooldown', { skillId, cooldownRemainingSec: cooldownRemainingSec ?? null });
  }
  if (cooldownRemainingSec > 0) return result(false, 'cooldown_active', { skillId, cooldownRemainingSec });
  if (currentUses === 0) return result(false, 'no_uses', { skillId });
  if (!Number.isFinite(range) || range <= 0) return result(false, 'invalid_range', { skillId, range: range ?? null });

  const targetKind = commandTargetKind(skillId);
  let targetIds = [];
  let resolvedGroundPoint = null;
  if (targetKind === 'Self') {
    targetIds = [actor.id];
  } else if (targetKind === 'GroundPoint') {
    if (!validPoint(groundPoint)) return result(false, 'ground_point_required', { skillId, targetKind });
    if (distance(actor.position, groundPoint) > range) {
      return result(false, 'ground_point_out_of_range', { skillId, targetKind, range });
    }
    resolvedGroundPoint = Object.freeze({ x: groundPoint.x, z: groundPoint.z });
  } else {
    const valid = validEnemies(enemies, actor.position, range);
    if (valid.length === 0) return result(false, 'no_valid_target', { skillId, targetKind, range });
    targetIds = targetKind === 'NearestEnemy' ? [valid[0].id] : valid.map(enemy => enemy.id);
  }

  return result(true, null, {
    commandId: commandId.trim(),
    skillId,
    targetKind,
    catalogTargetType: skill.targetType,
    applicationMode: skill.applicationMode,
    targetIds: Object.freeze(targetIds),
    groundPoint: resolvedGroundPoint,
    consumeUses: 1,
    startCooldownSec: skill.cooldownSec,
    hitResolution: TARGETING_POLICY.hitResolution,
  });
}
