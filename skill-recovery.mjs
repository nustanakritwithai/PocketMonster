// PocketMonster V8.1 — explicit skill-use recovery command.
// Only the existing free Keeper/NPC heal route is activated here. Workbook
// item/level-up recovery rows remain deferred until their economy/flow exists.

import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { skillCatalogEntry } from './skill-catalog.mjs';
import { SYSTEM_SKILL_SLOTS } from './skill-progression.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

export const SKILL_RECOVERY_POLICY = Object.freeze({
  activation: 'keeper_route_only',
  automaticPostBattleRecovery: false,
  itemRoutes: 'deferred',
  levelUpRecovery: 'deferred',
  hpAndFaintRecovery: 'explicit_sibling_command',
  serverAuthorityClaim: false,
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
});

export const SKILL_RECOVERY_ROUTES = Object.freeze({
  REC_NPC: Object.freeze({
    id: 'REC_NPC',
    name: 'NPC Healer',
    sourceType: 'System',
    owner: 'keeper',
    location: 'ranch',
    targetScope: 'all_owned_monsters',
    skillScope: 'all_skills_except_system_slots',
    recoveryMode: 'Full',
    value: 0,
    sourceCost: 'Free/World',
    costPolicy: 'free',
    activation: 'active_keeper_route',
    sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  }),
});

const COMPLETED_COMMANDS = new WeakMap();
const SYSTEM_SLOT_SET = new Set(SYSTEM_SKILL_SLOTS);

function recoveryResult(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function completedCommands(collection, create = false) {
  let commands = COMPLETED_COMMANDS.get(collection);
  if (!commands && create) {
    commands = new Set();
    COMPLETED_COMMANDS.set(collection, commands);
  }
  return commands ?? null;
}

function normalizedCurrentUses(skill, maxUses) {
  if (!Number.isFinite(skill?.currentUses)) return 0;
  return Math.max(0, Math.min(maxUses, Math.floor(skill.currentUses)));
}

export function recoverSkillUses(collection, {
  routeId,
  commandId,
} = {}) {
  if (!Array.isArray(collection)) return recoveryResult(false, 'invalid_collection');
  if (typeof commandId !== 'string' || commandId.trim() === '') {
    return recoveryResult(false, 'invalid_command_id');
  }
  const normalizedCommandId = commandId.trim();
  const route = SKILL_RECOVERY_ROUTES[routeId];
  if (!route || route.activation !== 'active_keeper_route') {
    return recoveryResult(false, 'unauthorized_route', { routeId: routeId ?? null, commandId: normalizedCommandId });
  }
  if (completedCommands(collection)?.has(normalizedCommandId)) {
    return recoveryResult(false, 'duplicate_command', { routeId, commandId: normalizedCommandId });
  }

  let recoveredMonsters = 0;
  let recoveredSkills = 0;
  let recoveredUses = 0;
  const skippedUnknownSkillIds = new Set();

  for (const monster of collection) {
    if (!monster || typeof monster !== 'object' || !Array.isArray(monster.skills)) continue;
    let monsterChanged = false;
    for (const skill of monster.skills) {
      if (!skill || typeof skill !== 'object' || SYSTEM_SLOT_SET.has(skill.slot)) continue;
      const definition = skillCatalogEntry(skill.skillId);
      if (!definition) {
        if (typeof skill.skillId === 'string') skippedUnknownSkillIds.add(skill.skillId);
        continue;
      }
      const currentUses = normalizedCurrentUses(skill, definition.maxUses);
      if (currentUses === definition.maxUses && skill.currentUses === definition.maxUses) continue;
      skill.currentUses = definition.maxUses;
      recoveredSkills += 1;
      recoveredUses += definition.maxUses - currentUses;
      monsterChanged = true;
    }
    if (monsterChanged) recoveredMonsters += 1;
  }

  completedCommands(collection, true).add(normalizedCommandId);
  return recoveryResult(true, null, {
    routeId,
    commandId: normalizedCommandId,
    route,
    targetScope: route.targetScope,
    skillScope: route.skillScope,
    recoveredMonsters,
    recoveredSkills,
    recoveredUses,
    skippedUnknownSkillIds: Object.freeze([...skippedUnknownSkillIds]),
    hpRecovered: false,
    faintStateChanged: false,
    bondChanged: false,
  });
}
