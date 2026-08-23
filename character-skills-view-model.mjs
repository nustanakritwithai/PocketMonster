// PocketMonster V8.1 A37 — read-only Character Skills right-tab projection.
// Gameplay owns learning, equipping, Uses consumption, cooldowns and effects.
// This module only joins one normalized monster instance to the immutable A36
// descriptor catalog by exact SkillID.

import { OWNED_BASIC_AI_POLICY } from './runtime-policies.mjs';
import {
  MANUAL_SKILL_SLOTS,
  manualSkillLoadout,
  masteryRankFromExp,
} from './skill-progression.mjs';
import {
  SKILL_ICON_POLICY,
  skillButtonStateDescriptor,
  skillIconDescriptor,
} from './skill-icon-descriptor.mjs';
import { skillRangeCatalogEntry } from './skill-catalog.mjs';

const MANUAL_SLOTS = Object.freeze([...MANUAL_SKILL_SLOTS]);
const SYSTEM_SLOT_SET = new Set(['basicAI', 'passive', 'evolutionTrait']);
const MANUAL_SLOT_SET = new Set(MANUAL_SLOTS);
const ALL_SLOT_SET = new Set([...MANUAL_SLOTS, ...SYSTEM_SLOT_SET]);
const MAX_SKILL_RECORDS = SKILL_ICON_POLICY.descriptorCount + 1;

export const CHARACTER_SKILLS_POLICY = Object.freeze({
  surface: 'character_information_right_tab_only',
  manualSlots: MANUAL_SLOTS,
  basicAiSeparate: true,
  presentationOnly: true,
  consumesUses: false,
  persistsCooldownRemaining: false,
  quickPanelAuthority: false,
  lowerPaneAuthority: false,
  descriptorJoinKey: 'exact_SkillID',
  lightRuntimeActivation: 'deferred_D2',
  groundPointTreatment: 'documented_fallback_gap',
});

const STATE_READY = skillButtonStateDescriptor('Ready');
const STATE_NO_USES = skillButtonStateDescriptor('No Uses');
const STATE_LOCKED = skillButtonStateDescriptor('Locked/Not Learned');

function inspectedDataRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const values = Object.create(null);
  const present = new Set();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    present.add(key);
    values[key] = descriptor.value;
  }
  return Object.freeze({ values: Object.freeze(values), present });
}

function inspectedDataArray(value) {
  if (!Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Array.prototype && prototype !== null) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || length < 0) return null;
  if (length > MAX_SKILL_RECORDS) return null;
  const keys = Reflect.ownKeys(value);
  const keySet = new Set(keys);
  if (keys.length !== length + 1 || !keySet.has('length')) return null;
  const entries = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    if (!keySet.has(key)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    entries[index] = descriptor.value;
  }
  return Object.freeze(entries);
}

function issue(code, detail = {}) {
  const normalized = Object.create(null);
  for (const [key, value] of Object.entries(detail)) {
    normalized[key] = value === null || ['string', 'number', 'boolean'].includes(typeof value)
      ? value
      : null;
  }
  return Object.freeze({ code, ...normalized });
}

function compareIssue(left, right) {
  const leftKey = `${left.code}|${left.slot ?? ''}|${left.skillId ?? ''}`;
  const rightKey = `${right.code}|${right.slot ?? ''}|${right.skillId ?? ''}`;
  return leftKey.localeCompare(rightKey);
}

function safeText(value, fallback = '—') {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function contextSnapshot(context) {
  try {
    const inspected = inspectedDataRecord(context ?? {});
    if (!inspected) return Object.freeze({
      monsterId: null,
      monsterName: 'มอนสเตอร์',
      passiveId: null,
      passiveLabel: '—',
      evolutionTrait: '—',
    });
    const value = inspected.values;
    return Object.freeze({
      monsterId: typeof value.monsterId === 'string' ? value.monsterId : null,
      monsterName: safeText(value.monsterName, 'มอนสเตอร์'),
      passiveId: typeof value.passiveId === 'string' ? value.passiveId : null,
      passiveLabel: safeText(value.passiveLabel),
      evolutionTrait: safeText(value.evolutionTrait),
    });
  } catch {
    return Object.freeze({
      monsterId: null,
      monsterName: 'มอนสเตอร์',
      passiveId: null,
      passiveLabel: '—',
      evolutionTrait: '—',
    });
  }
}

function emptyManualRow(slot, state = 'Locked/Not Learned', reason = null) {
  const invalid = state === 'Invalid';
  return Object.freeze({
    kind: 'manual',
    key: slot,
    slot,
    label: slot.toUpperCase(),
    equipped: false,
    state,
    stateDescriptor: STATE_LOCKED,
    reason,
    skillId: null,
    nameTH: invalid ? 'ข้อมูลสกิลไม่ถูกต้อง' : 'ยังไม่มีสกิล',
    nameEN: null,
    sourceType: null,
    runtimeType: null,
    typeDecision: null,
    typeSymbol: invalid ? '!' : '🔒',
    category: null,
    categoryMarker: '',
    targetType: null,
    rangeM: null,
    radiusM: null,
    rangeText: '—',
    documentedIconKind: invalid ? 'invalid' : 'empty',
    documentedMainSymbol: invalid ? '!' : '🔒',
    documentedRuntimeCoverage: invalid ? 'INVALID' : 'WORKBOOK DESIGN',
    effect: null,
    effectOverlay: '',
    currentUses: null,
    maxUses: null,
    usesText: '—',
    cooldownSec: null,
    cooldownText: '—',
    canCrit: false,
    critMarker: '',
    masteryExp: 0,
    masteryRank: 'novice',
    mutationId: null,
    descriptor: null,
    accessibilityLabelTH: `${slot.toUpperCase()}, ${invalid ? 'ข้อมูลสกิลไม่ถูกต้อง' : 'ยังไม่มีสกิลในสล็อตนี้'}`,
  });
}

function invalidManualRow(slot, { skillId = null, descriptor = null, reason = 'invalid_skill_state' } = {}) {
  const base = emptyManualRow(slot, 'Invalid', reason);
  const normalizedSkillId = typeof skillId === 'string' ? skillId : null;
  return Object.freeze({
    ...base,
    skillId: normalizedSkillId,
    nameTH: descriptor?.nameTH ?? (normalizedSkillId ?? base.nameTH),
    nameEN: descriptor?.nameEN ?? null,
    sourceType: descriptor?.sourceType ?? null,
    runtimeType: descriptor?.runtimeType ?? null,
    typeDecision: descriptor?.typeDecision ?? null,
    typeSymbol: descriptor?.typeSymbol ?? base.typeSymbol,
    category: descriptor?.category ?? null,
    categoryMarker: descriptor?.categoryMarker ?? '',
    targetType: descriptor?.targetType ?? null,
    documentedIconKind: descriptor?.documentedIconKind ?? base.documentedIconKind,
    documentedMainSymbol: descriptor?.documentedMainSymbol ?? base.documentedMainSymbol,
    documentedRuntimeCoverage: descriptor?.documentedRuntimeCoverage ?? base.documentedRuntimeCoverage,
    effect: descriptor?.effect ?? null,
    effectOverlay: descriptor?.effectOverlay ?? '',
    maxUses: descriptor?.maxUses ?? null,
    cooldownSec: descriptor?.cooldownSec ?? null,
    cooldownText: descriptor ? `${descriptor.cooldownSec}s` : '—',
    canCrit: descriptor?.canCrit ?? false,
    critMarker: descriptor?.critMarker ?? '',
    descriptor,
    accessibilityLabelTH: `${slot.toUpperCase()}, ข้อมูลสกิลไม่ถูกต้อง${normalizedSkillId ? `, SkillID ${normalizedSkillId}` : ''}`,
  });
}

function manualRow(slot, equipped) {
  const descriptor = skillIconDescriptor(equipped.skillId);
  const geometry = skillRangeCatalogEntry(equipped.skillId);
  const record = equipped.skill;
  const currentUses = record.currentUses == null ? descriptor.maxUses : record.currentUses;
  const masteryExp = record.masteryExp == null ? 0 : record.masteryExp;
  const state = currentUses === 0 ? 'No Uses' : 'Ready';
  const stateDescriptor = currentUses === 0 ? STATE_NO_USES : STATE_READY;
  const masteryRank = masteryRankFromExp(masteryExp);
  const mutationId = typeof record.mutationId === 'string' && record.mutationId.length > 0
    ? record.mutationId
    : null;
  const usesText = `${currentUses}/${descriptor.maxUses}`;
  return Object.freeze({
    kind: 'manual',
    key: slot,
    slot,
    label: slot.toUpperCase(),
    equipped: true,
    state,
    stateDescriptor,
    reason: null,
    skillId: descriptor.skillId,
    nameTH: descriptor.nameTH,
    nameEN: descriptor.nameEN,
    sourceType: descriptor.sourceType,
    runtimeType: descriptor.runtimeType,
    typeDecision: descriptor.typeDecision,
    typeSymbol: descriptor.typeSymbol,
    category: descriptor.category,
    categoryMarker: descriptor.categoryMarker,
    targetType: descriptor.targetType,
    rangeM: geometry?.rangeM ?? null,
    radiusM: geometry?.radiusM ?? null,
    rangeText: geometry?.targetType === 'Self'
      ? 'Self'
      : geometry?.targetType === 'EnemyArea'
        ? `${geometry.rangeM}m / AoE ${geometry.radiusM}m`
        : geometry ? `${geometry.rangeM}m` : '—',
    documentedIconKind: descriptor.documentedIconKind,
    documentedMainSymbol: descriptor.documentedMainSymbol,
    documentedRuntimeCoverage: descriptor.documentedRuntimeCoverage,
    effect: descriptor.effect,
    effectOverlay: descriptor.effectOverlay,
    currentUses,
    maxUses: descriptor.maxUses,
    usesText,
    cooldownSec: descriptor.cooldownSec,
    cooldownText: `${descriptor.cooldownSec}s`,
    canCrit: descriptor.canCrit,
    critMarker: descriptor.critMarker,
    masteryExp,
    masteryRank,
    mutationId,
    descriptor,
    accessibilityLabelTH: `${slot.toUpperCase()}, ${descriptor.accessibilityLabelTH}, ระยะ ${geometry?.targetType === 'Self' ? 'ตัวเอง' : `${geometry?.rangeM ?? 0} เมตร`}${geometry?.targetType === 'EnemyArea' ? `, รัศมี ${geometry.radiusM} เมตร` : ''}, Uses เหลือ ${usesText}, สถานะ ${state}`,
  });
}

function systemRow(key, label, value, state = 'Ready', extra = {}) {
  const locked = state !== 'Ready';
  return Object.freeze({
    kind: 'system',
    key,
    label,
    state,
    stateDescriptor: locked ? STATE_LOCKED : STATE_READY,
    value,
    accessibilityLabelTH: `${label}, ${value}, ${locked ? 'ยังไม่พร้อม' : 'พร้อม'}`,
    ...extra,
  });
}

function basicAiRow(invalid = false) {
  return systemRow(
    'basicAI',
    'Basic AI',
    invalid ? 'ข้อมูล Basic AI ไม่ถูกต้อง' : 'โจมตีพื้นฐานอัตโนมัติ',
    invalid ? 'Invalid' : 'Ready',
    {
      skillId: 'basic_attack',
      action: 'basic_attack',
      commandSource: OWNED_BASIC_AI_POLICY.commandSource,
      power: OWNED_BASIC_AI_POLICY.basicAttackPower,
      cooldownSec: OWNED_BASIC_AI_POLICY.basicAttackCooldownSec,
      usesConsumed: OWNED_BASIC_AI_POLICY.usesConsumed,
      usesText: 'ไม่ใช้ Uses',
      manualSkillSlots: OWNED_BASIC_AI_POLICY.manualSkillSlots,
    },
  );
}

function unavailableModel(context, reason, issues = []) {
  const manualSlots = Object.freeze(MANUAL_SLOTS.map(slot => emptyManualRow(slot)));
  const basic = basicAiRow();
  const passive = systemRow('passive', 'Passive', context.passiveLabel, context.passiveLabel === '—' ? 'Locked/Not Learned' : 'Ready', { passiveId: context.passiveId });
  const evolution = systemRow('evolutionTrait', 'Evolution Trait', context.evolutionTrait, context.evolutionTrait === '—' ? 'Locked/Not Learned' : 'Ready');
  const systemRows = Object.freeze([basic, passive, evolution]);
  return Object.freeze({
    ok: false,
    available: false,
    reason,
    policy: CHARACTER_SKILLS_POLICY,
    monster: Object.freeze({ id: context.monsterId, name: context.monsterName }),
    issues: Object.freeze([...issues].sort(compareIssue)),
    manualSlots,
    systemRows,
    rows: Object.freeze([basic, ...manualSlots, passive, evolution]),
  });
}

function createCharacterSkillsViewModelInternal(instance, context) {
  const instanceRecord = inspectedDataRecord(instance);
  if (!instanceRecord) return unavailableModel(context, 'invalid_instance', [issue('invalid_instance')]);
  const rawSkills = instanceRecord.present.has('skills') ? instanceRecord.values.skills : [];
  const skillEntries = inspectedDataArray(rawSkills);
  if (!skillEntries) return unavailableModel(context, 'invalid_skills', [issue('invalid_skills')]);

  const issues = [];
  const safeSkills = [];
  for (const entry of skillEntries) {
    const inspected = inspectedDataRecord(entry);
    if (!inspected) {
      issues.push(issue('invalid_skill_record'));
      continue;
    }
    const value = inspected.values;
    const safe = {
      skillId: value.skillId,
      slot: value.slot ?? null,
      currentUses: value.currentUses,
      masteryExp: value.masteryExp,
      masteryRank: value.masteryRank,
      mutationId: value.mutationId,
      hasCurrentUses: inspected.present.has('currentUses'),
      hasMasteryExp: inspected.present.has('masteryExp'),
    };
    safeSkills.push(Object.freeze(safe));
    if (safe.slot !== null && !ALL_SLOT_SET.has(safe.slot)) {
      issues.push(issue('invalid_slot', { slot: safe.slot, skillId: typeof safe.skillId === 'string' ? safe.skillId : null }));
    }
    if (typeof safe.skillId !== 'string' || safe.skillId.length === 0) {
      issues.push(issue('invalid_skill_id', { slot: safe.slot }));
    }
  }

  const bySlot = new Map();
  const bySkillId = new Map();
  for (const skill of safeSkills) {
    if (skill.slot !== null) {
      const slots = bySlot.get(skill.slot) ?? [];
      slots.push(skill);
      bySlot.set(skill.slot, slots);
    }
    if (typeof skill.skillId === 'string' && skill.skillId.length > 0) {
      const records = bySkillId.get(skill.skillId) ?? [];
      records.push(skill);
      bySkillId.set(skill.skillId, records);
    }
  }

  const invalidSlots = new Map();
  for (const slot of MANUAL_SLOTS) {
    const records = bySlot.get(slot) ?? [];
    if (records.length > 1) {
      issues.push(issue('duplicate_slot', { slot }));
      invalidSlots.set(slot, Object.freeze({ reason: 'duplicate_slot' }));
    }
  }
  const duplicateBasicAi = (bySlot.get('basicAI') ?? []).length > 1;
  if (duplicateBasicAi) issues.push(issue('duplicate_slot', { slot: 'basicAI' }));

  const duplicateSkillIds = new Set();
  for (const [skillId, records] of bySkillId) {
    if (records.length <= 1) continue;
    duplicateSkillIds.add(skillId);
    issues.push(issue('duplicate_skill_id', { skillId }));
    for (const record of records) {
      if (MANUAL_SLOT_SET.has(record.slot)) {
        invalidSlots.set(record.slot, Object.freeze({ reason: 'duplicate_skill_id', skillId }));
      }
    }
  }

  const safeInstance = Object.freeze({ skills: Object.freeze(safeSkills) });
  const loadout = manualSkillLoadout(safeInstance);
  const manualSlots = Object.freeze(loadout.map(equipped => {
    const slot = equipped.slot;
    const slotInvalid = invalidSlots.get(slot);
    if (slotInvalid) return invalidManualRow(slot, slotInvalid);
    if (!equipped.skill) return emptyManualRow(slot);
    const descriptor = skillIconDescriptor(equipped.skillId);
    if (!descriptor) {
      issues.push(issue('unknown_skill_id', { slot, skillId: equipped.skillId }));
      return invalidManualRow(slot, { skillId: equipped.skillId, reason: 'unknown_skill_id' });
    }
    const skill = equipped.skill;
    const currentUses = skill.hasCurrentUses ? skill.currentUses : descriptor.maxUses;
    if (!Number.isInteger(currentUses) || currentUses < 0 || currentUses > descriptor.maxUses) {
      issues.push(issue('invalid_current_uses', { slot, skillId: equipped.skillId }));
      return invalidManualRow(slot, { skillId: equipped.skillId, descriptor, reason: 'invalid_current_uses' });
    }
    const masteryExp = skill.hasMasteryExp ? skill.masteryExp : 0;
    if (!Number.isInteger(masteryExp) || masteryExp < 0) {
      issues.push(issue('invalid_mastery_exp', { slot, skillId: equipped.skillId }));
      return invalidManualRow(slot, { skillId: equipped.skillId, descriptor, reason: 'invalid_mastery_exp' });
    }
    return manualRow(slot, Object.freeze({ ...equipped, skill: Object.freeze({ ...skill, currentUses, masteryExp }) }));
  }));

  const basicRecords = bySlot.get('basicAI') ?? [];
  const invalidBasicAiRecords = basicRecords.filter(record => record.skillId !== 'basic_attack');
  for (const record of invalidBasicAiRecords) {
    issues.push(issue('invalid_basic_ai_skill_id', {
      slot: 'basicAI',
      skillId: typeof record.skillId === 'string' ? record.skillId : null,
    }));
  }
  const basicInvalid = duplicateBasicAi
    || invalidBasicAiRecords.length > 0
    || basicRecords.some(record => duplicateSkillIds.has(record.skillId))
    || basicRecords.some(record => typeof record.skillId !== 'string' || record.skillId.length === 0);
  const basic = basicAiRow(basicInvalid);
  const passiveState = context.passiveLabel === '—' ? 'Locked/Not Learned' : 'Ready';
  const evolutionState = context.evolutionTrait === '—' ? 'Locked/Not Learned' : 'Ready';
  const passive = systemRow('passive', 'Passive', context.passiveLabel, passiveState, { passiveId: context.passiveId });
  const evolution = systemRow('evolutionTrait', 'Evolution Trait', context.evolutionTrait, evolutionState);
  const systemRows = Object.freeze([basic, passive, evolution]);
  const sortedIssues = Object.freeze(issues.sort(compareIssue));
  return Object.freeze({
    ok: sortedIssues.length === 0,
    available: true,
    reason: sortedIssues.length === 0 ? null : 'invalid_skill_state',
    policy: CHARACTER_SKILLS_POLICY,
    monster: Object.freeze({
      id: context.monsterId ?? (typeof instanceRecord.values.instanceId === 'string' ? instanceRecord.values.instanceId : null),
      name: context.monsterName,
    }),
    issues: sortedIssues,
    manualSlots,
    systemRows,
    rows: Object.freeze([basic, ...manualSlots, passive, evolution]),
  });
}

export function createCharacterSkillsViewModel(instance, context = {}) {
  const snapshot = contextSnapshot(context);
  if (instance == null) return unavailableModel(snapshot, 'no_focused_monster');
  try {
    return createCharacterSkillsViewModelInternal(instance, snapshot);
  } catch {
    return unavailableModel(snapshot, 'invalid_instance', [issue('invalid_instance')]);
  }
}
