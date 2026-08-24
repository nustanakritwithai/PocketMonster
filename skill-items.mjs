// PocketMonster V8 — permanent skill learning through consumable Skill Items.
//
// This module owns validation and copy-on-write state changes only. Callers
// supply the local persistence boundary; live state is publishable only after
// that boundary succeeds.

import { CONTENT_PROVENANCE, validateContentProvenance } from './content-provenance.mjs';
import { SKILL_ITEM_CATALOG, skillItemById } from './content-catalog.mjs';
import { monsterCatalogEntry } from './monster-catalog.mjs';
import { skillCatalogEntry } from './skill-catalog.mjs';
import { canExecuteReviewedSkillEffect } from './skill-effect-runtime.mjs';
import {
  MANUAL_SKILL_SLOTS,
  SKILL_SLOTS,
  getSkill,
  validateSkillSlotState,
} from './skill-progression.mjs';

export const SKILL_ITEM_TRANSACTION_VERSION = 'skill-item/v1';
export const SKILL_ITEM_COMMAND_HISTORY_LIMIT = 64;
export const SKILL_ITEM_SOURCE_KIND = 'skillItem';

export const SKILL_ITEM_REASONS = Object.freeze({
  INVALID_STATE: 'invalid_state',
  INVALID_COMMAND_ID: 'invalid_command_id',
  DUPLICATE_COMMAND: 'duplicate_command',
  ITEM_NOT_FOUND: 'item_not_found',
  ITEM_EMPTY: 'item_empty',
  SKILL_NOT_FOUND: 'skill_not_found',
  CATALOG_PROVENANCE_INVALID: 'catalog_provenance_invalid',
  RUNTIME_SKILL_UNSUPPORTED: 'runtime_skill_unsupported',
  MONSTER_NOT_FOUND: 'monster_not_found',
  INVALID_SLOT: 'invalid_slot',
  INCOMPATIBLE_TYPE: 'incompatible_type',
  LEVEL_REQUIRED: 'level_required',
  ALREADY_LEARNED: 'already_learned',
  SLOT_LOCKED: 'slot_locked',
  INVALID_SLOT_STATE: 'invalid_slot_state',
  CONFIRMATION_REQUIRED: 'confirmation_required',
  STALE_SLOT: 'stale_slot',
  STALE_STATE: 'stale_state',
  INVALID_OPERATION: 'invalid_operation',
  PERSISTENCE_FAILED: 'persistence_failed',
});

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function commandId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 128 ? normalized : null;
}

export function normalizeSkillItemCommandIds(value, limit = SKILL_ITEM_COMMAND_HISTORY_LIMIT) {
  const boundedLimit = Number.isInteger(limit) && limit > 0 ? limit : SKILL_ITEM_COMMAND_HISTORY_LIMIT;
  const seen = new Set();
  const reversed = [];
  const source = Array.isArray(value) ? value : [];
  for (let index = source.length - 1; index >= 0 && reversed.length < boundedLimit; index -= 1) {
    const id = commandId(source[index]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    reversed.push(id);
  }
  return reversed.reverse();
}

function instanceTypes(instance) {
  const mapping = monsterCatalogEntry(instance?.speciesId);
  const types = new Set();
  if (mapping?.runtimeType) types.add(mapping.runtimeType);
  if (typeof instance?.secondaryType === 'string' && instance.secondaryType.length > 0) {
    types.add(instance.secondaryType);
  }
  for (const type of Array.isArray(instance?.speciesTags) ? instance.speciesTags : []) {
    if (typeof type === 'string' && type.length > 0) types.add(type);
  }
  return Object.freeze([...types]);
}

function catalogContract(item) {
  if (!item || item.category !== 'skillItem' || item.consumeOn !== 'success') return false;
  if (!Number.isInteger(item.catalogVersion) || item.catalogVersion < 1) return false;
  if (!record(item.compatibility) || !Array.isArray(item.compatibility.allowedTypes)) return false;
  if (!Number.isInteger(item.compatibility.minLevel) || item.compatibility.minLevel < 1) return false;
  return true;
}

function operationSnapshot({
  commandId: normalizedCommandId,
  monster,
  monsterIndex,
  item,
  skill,
  slot,
  occupant,
  itemQuantityBefore,
  learnedAt,
}) {
  return Object.freeze({
    version: SKILL_ITEM_TRANSACTION_VERSION,
    commandId: normalizedCommandId,
    monsterId: monster.instanceId,
    monsterIndex,
    itemId: item.id,
    itemCatalogVersion: item.catalogVersion,
    skillId: skill.id,
    slot,
    expectedOccupantSkillId: occupant?.skillId ?? null,
    itemQuantityBefore,
    learnedSkillCountBefore: monster.skills.length,
    learnedAt,
  });
}

export function resolveSkillItemUse({
  state,
  monsterId,
  itemId,
  slot,
  expectedOccupantSkillId,
  commandId: rawCommandId,
  now = Date.now(),
} = {}) {
  const source = record(state);
  if (!source || !Array.isArray(source.collection) || !record(source.inventory)) {
    return result(false, SKILL_ITEM_REASONS.INVALID_STATE);
  }
  const normalizedCommandId = commandId(rawCommandId);
  if (!normalizedCommandId) return result(false, SKILL_ITEM_REASONS.INVALID_COMMAND_ID);
  const history = normalizeSkillItemCommandIds(source.skillItemUseCommandIds);
  if (history.includes(normalizedCommandId)) {
    return result(false, SKILL_ITEM_REASONS.DUPLICATE_COMMAND, { commandId: normalizedCommandId });
  }
  const item = skillItemById(itemId);
  if (!item || !catalogContract(item)) {
    return result(false, SKILL_ITEM_REASONS.ITEM_NOT_FOUND, { itemId: itemId ?? null });
  }
  if (!Object.hasOwn(source.inventory, item.id)
    || !Number.isInteger(source.inventory[item.id])
    || source.inventory[item.id] < 0) {
    return result(false, SKILL_ITEM_REASONS.INVALID_STATE, { itemId: item.id });
  }
  const itemQuantityBefore = source.inventory[item.id];
  if (itemQuantityBefore <= 0) {
    return result(false, SKILL_ITEM_REASONS.ITEM_EMPTY, { itemId: item.id, quantity: 0 });
  }
  if (typeof monsterId !== 'string' || monsterId.length === 0) {
    return result(false, SKILL_ITEM_REASONS.MONSTER_NOT_FOUND, { monsterId: null });
  }
  const matches = source.collection
    .map((monster, index) => ({ monster, index }))
    .filter(entry => entry.monster?.instanceId === monsterId);
  if (matches.length !== 1) {
    return result(false, matches.length > 1 ? SKILL_ITEM_REASONS.INVALID_STATE : SKILL_ITEM_REASONS.MONSTER_NOT_FOUND, { monsterId });
  }
  const { monster, index: monsterIndex } = matches[0];
  if (!record(monster) || !Array.isArray(monster.skills)) {
    return result(false, SKILL_ITEM_REASONS.INVALID_STATE, { monsterId });
  }
  const skill = skillCatalogEntry(item.grantsSkillId);
  if (!skill) return result(false, SKILL_ITEM_REASONS.SKILL_NOT_FOUND, { skillId: item.grantsSkillId ?? null });
  if (!validateContentProvenance(CONTENT_PROVENANCE).ok) {
    return result(false, SKILL_ITEM_REASONS.CATALOG_PROVENANCE_INVALID, { skillId: skill.id });
  }
  if (!canExecuteReviewedSkillEffect(skill.id)) {
    return result(false, SKILL_ITEM_REASONS.RUNTIME_SKILL_UNSUPPORTED, { skillId: skill.id });
  }
  if (!MANUAL_SKILL_SLOTS.includes(slot)) {
    const reason = SKILL_SLOTS.includes(slot)
      ? SKILL_ITEM_REASONS.SLOT_LOCKED
      : SKILL_ITEM_REASONS.INVALID_SLOT;
    return result(false, reason, { slot: slot ?? null });
  }
  const slotState = validateSkillSlotState(monster);
  if (!slotState.ok) {
    return result(false, SKILL_ITEM_REASONS.INVALID_SLOT_STATE, { issues: slotState.issues });
  }
  if (getSkill(monster, skill.id)) {
    return result(false, SKILL_ITEM_REASONS.ALREADY_LEARNED, { skillId: skill.id });
  }
  const allowedTypes = item.compatibility.allowedTypes;
  const types = instanceTypes(monster);
  if (allowedTypes.length > 0 && !types.some(type => allowedTypes.includes(type))) {
    return result(false, SKILL_ITEM_REASONS.INCOMPATIBLE_TYPE, {
      allowedTypes: Object.freeze([...allowedTypes]),
      monsterTypes: types,
    });
  }
  const level = Number.isFinite(monster.level) ? Math.max(0, Math.floor(monster.level)) : 0;
  if (level < item.compatibility.minLevel) {
    return result(false, SKILL_ITEM_REASONS.LEVEL_REQUIRED, {
      level,
      requiredLevel: item.compatibility.minLevel,
    });
  }
  const occupant = monster.skills.find(owned => owned?.slot === slot) ?? null;
  if (occupant && expectedOccupantSkillId === undefined) {
    return result(false, SKILL_ITEM_REASONS.CONFIRMATION_REQUIRED, {
      occupantSkillId: occupant.skillId,
      slot,
      skillId: skill.id,
    });
  }
  const expected = expectedOccupantSkillId ?? null;
  const actual = occupant?.skillId ?? null;
  if (expected !== actual) {
    return result(false, SKILL_ITEM_REASONS.STALE_SLOT, {
      expectedOccupantSkillId: expected,
      occupantSkillId: actual,
      slot,
    });
  }
  if (!Number.isInteger(now) || now < 0) {
    return result(false, SKILL_ITEM_REASONS.INVALID_STATE, { field: 'now' });
  }
  return result(true, null, {
    operation: operationSnapshot({
      commandId: normalizedCommandId,
      monster,
      monsterIndex,
      item,
      skill,
      slot,
      occupant,
      itemQuantityBefore,
      learnedAt: now,
    }),
    item,
    skill,
    monster,
    occupant,
  });
}

function sameOperation(resolved, operation) {
  const expected = resolved.operation;
  return operation.version === expected.version
    && operation.commandId === expected.commandId
    && operation.monsterId === expected.monsterId
    && operation.monsterIndex === expected.monsterIndex
    && operation.itemId === expected.itemId
    && operation.itemCatalogVersion === expected.itemCatalogVersion
    && operation.skillId === expected.skillId
    && operation.slot === expected.slot
    && operation.expectedOccupantSkillId === expected.expectedOccupantSkillId
    && operation.itemQuantityBefore === expected.itemQuantityBefore
    && operation.learnedSkillCountBefore === expected.learnedSkillCountBefore
    && operation.learnedAt === expected.learnedAt;
}

export function applySkillItemUse({ state, operation } = {}) {
  if (!record(operation) || operation.version !== SKILL_ITEM_TRANSACTION_VERSION) {
    return result(false, SKILL_ITEM_REASONS.INVALID_OPERATION);
  }
  const resolved = resolveSkillItemUse({
    state,
    monsterId: operation.monsterId,
    itemId: operation.itemId,
    slot: operation.slot,
    expectedOccupantSkillId: operation.expectedOccupantSkillId,
    commandId: operation.commandId,
    now: operation.learnedAt,
  });
  if (!resolved.ok) return resolved;
  if (!sameOperation(resolved, operation)) {
    return result(false, SKILL_ITEM_REASONS.STALE_STATE, { commandId: operation.commandId });
  }

  const nextSkills = resolved.monster.skills.map(skill => ({ ...skill }));
  const displaced = nextSkills.find(skill => skill?.slot === operation.slot) ?? null;
  if (displaced) displaced.slot = null;
  const learnedSkill = {
    skillId: resolved.skill.id,
    slot: operation.slot,
    masteryExp: 0,
    masteryRank: 'novice',
    mutationId: null,
    currentUses: resolved.skill.maxUses,
    sourceKind: SKILL_ITEM_SOURCE_KIND,
    sourceItemId: resolved.item.id,
    learnedAt: operation.learnedAt,
  };
  nextSkills.push(learnedSkill);
  const nextMonster = { ...resolved.monster, skills: nextSkills };
  const nextCollection = [...state.collection];
  nextCollection[operation.monsterIndex] = nextMonster;
  const nextInventory = {
    ...state.inventory,
    [resolved.item.id]: operation.itemQuantityBefore - 1,
  };
  const nextCommandIds = normalizeSkillItemCommandIds([
    ...normalizeSkillItemCommandIds(state.skillItemUseCommandIds),
    operation.commandId,
  ]);
  const nextState = {
    ...state,
    collection: nextCollection,
    inventory: nextInventory,
    skillItemUseCommandIds: nextCommandIds,
  };
  return result(true, null, {
    commandId: operation.commandId,
    operation,
    nextState,
    nextMonster,
    learnedSkill,
    displacedSkillId: displaced?.skillId ?? null,
    consumed: 1,
  });
}

export function commitSkillItemUse({ state, command, persistCandidate } = {}) {
  if (typeof persistCandidate !== 'function') {
    return result(false, SKILL_ITEM_REASONS.INVALID_STATE, { stage: 'persistence_hook', state });
  }
  const planned = resolveSkillItemUse({ state, ...command });
  if (!planned.ok) return result(false, planned.reason, { stage: 'resolve', state, ...planned });
  const applied = applySkillItemUse({ state, operation: planned.operation });
  if (!applied.ok) return result(false, applied.reason, { stage: 'apply', state, ...applied });
  let persisted;
  try {
    persisted = persistCandidate(applied.nextState, applied);
  } catch (error) {
    return result(false, SKILL_ITEM_REASONS.PERSISTENCE_FAILED, {
      stage: 'persist',
      state,
      commandId: planned.operation.commandId,
      errorName: error?.name ?? 'Error',
    });
  }
  return result(true, null, {
    stage: 'persisted',
    ...applied,
    persisted,
  });
}

export function skillItemAcquisitionDiagnostics(state = {}) {
  const diagnostics = [];
  const collection = Array.isArray(state?.collection) ? state.collection : [];
  for (let monsterIndex = 0; monsterIndex < collection.length; monsterIndex += 1) {
    const monster = collection[monsterIndex];
    const skills = Array.isArray(monster?.skills) ? monster.skills : [];
    for (let skillIndex = 0; skillIndex < skills.length; skillIndex += 1) {
      const skill = skills[skillIndex];
      if (skill?.sourceKind !== SKILL_ITEM_SOURCE_KIND) continue;
      const item = skillItemById(skill.sourceItemId);
      let reason = null;
      if (!item) reason = 'unknown_source_item';
      else if (item.grantsSkillId !== skill.skillId) reason = 'source_skill_mismatch';
      else if (!Number.isInteger(skill.learnedAt) || skill.learnedAt < 0) reason = 'invalid_learned_at';
      if (!reason) continue;
      diagnostics.push(Object.freeze({
        code: 'skill_item_provenance_invalid',
        reason,
        path: `collection[${monsterIndex}].skills[${skillIndex}]`,
        instanceId: typeof monster?.instanceId === 'string' ? monster.instanceId : null,
        skillId: typeof skill?.skillId === 'string' ? skill.skillId : null,
        sourceItemId: typeof skill?.sourceItemId === 'string' ? skill.sourceItemId : null,
      }));
    }
  }
  return Object.freeze(diagnostics);
}

export function validateSkillItemCatalog(records = SKILL_ITEM_CATALOG) {
  const issues = [];
  const ids = new Set();
  for (const [key, item] of Object.entries(record(records) ?? {})) {
    if (!catalogContract(item) || key !== item.id) {
      issues.push(Object.freeze({ code: 'invalid_skill_item', itemId: key }));
      continue;
    }
    if (ids.has(item.id)) issues.push(Object.freeze({ code: 'duplicate_skill_item', itemId: item.id }));
    ids.add(item.id);
    if (!skillCatalogEntry(item.grantsSkillId)) {
      issues.push(Object.freeze({ code: 'unknown_granted_skill', itemId: item.id, skillId: item.grantsSkillId }));
    }
  }
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}
