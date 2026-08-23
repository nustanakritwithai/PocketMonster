// Monster Life RPG V8.8 — canonical live skill-button icon contract.
// Exact SkillID is the only join key. This projection is presentation-only and
// cannot mutate combat, Uses, cooldowns, status, targeting, or save state.

import { SKILL_CATALOG } from './skill-catalog.mjs';
import { skillIconDescriptor } from './skill-icon-descriptor.mjs';

export const LIVE_SKILL_ICON_MAIN_KINDS = Object.freeze([
  'enemy',
  'area',
  'groundpoint',
  'buff',
  'shield',
  'heal',
]);

const LIVE_MAIN_KIND_SET = new Set(LIVE_SKILL_ICON_MAIN_KINDS);
const SELF_MAIN_KIND_SET = new Set(['buff', 'shield', 'heal']);

export const LIVE_SKILL_ICON_POLICY = Object.freeze({
  authority: 'PocketMonster_Detailed_v2.1_SkillButtonIcons.xlsx',
  descriptorJoinKey: 'exact_SkillID',
  skillCount: 108,
  manualButtonCount: 4,
  mainIconKindCount: 6,
  typeFamilyCount: 18,
  categoryMarkerCount: 7,
  effectOverlayCount: 53,
  groundPointGapCount: 0,
  lightFairyRuntimeMismatchCount: 0,
  cacheIdentity: 'exact_SkillID_semantic_layers',
  activation: 'canonical_resolver_live',
});

function mainKindForDescriptor(descriptor) {
  if (descriptor.targetType === 'NearestEnemy') return 'enemy';
  if (descriptor.targetType === 'EnemyArea') return 'area';
  if (descriptor.targetType === 'GroundPoint') return 'groundpoint';
  if (descriptor.targetType === 'Self' && SELF_MAIN_KIND_SET.has(descriptor.documentedIconKind)) {
    return descriptor.documentedIconKind;
  }
  return null;
}

function mainSymbolForKind(kind, descriptor) {
  if (kind === 'groundpoint') return '⊙▥';
  return descriptor.documentedMainSymbol;
}

function runtimeContractForDescriptor(descriptor) {
  const mainKind = mainKindForDescriptor(descriptor);
  if (!mainKind || !LIVE_MAIN_KIND_SET.has(mainKind)) return null;
  const mainSymbol = mainSymbolForKind(mainKind, descriptor);
  const cacheKey = [
    descriptor.skillId,
    mainKind,
    descriptor.sourceType,
    descriptor.runtimeType,
    descriptor.category,
    descriptor.effect,
  ].join('|');
  return Object.freeze({
    skillId: descriptor.skillId,
    nameTH: descriptor.nameTH,
    nameEN: descriptor.nameEN,
    sourceType: descriptor.sourceType,
    runtimeType: descriptor.runtimeType,
    typeDecision: descriptor.typeDecision,
    typeSymbol: descriptor.typeSymbol,
    typePalette: descriptor.typePalette,
    category: descriptor.category,
    categoryMarker: descriptor.categoryMarker,
    targetType: descriptor.targetType,
    mainKind,
    mainSymbol,
    effect: descriptor.effect,
    effectOverlay: descriptor.effectOverlay,
    maxUses: descriptor.maxUses,
    cooldownSec: descriptor.cooldownSec,
    canCrit: descriptor.canCrit,
    critMarker: descriptor.critMarker,
    cacheKey,
    accessibilityLabelTH: descriptor.accessibilityLabelTH,
    activation: LIVE_SKILL_ICON_POLICY.activation,
    sourceWorkbookVersion: descriptor.sourceWorkbookVersion,
  });
}

export const LIVE_SKILL_ICON_CATALOG = Object.freeze(SKILL_CATALOG.map(skill => {
  const descriptor = skillIconDescriptor(skill.id);
  const contract = descriptor ? runtimeContractForDescriptor(descriptor) : null;
  if (!contract) throw new TypeError(`Missing live skill icon contract for ${skill.id}`);
  return contract;
}));

const LIVE_ICON_BY_SKILL_ID = new Map(LIVE_SKILL_ICON_CATALOG.map(contract => [contract.skillId, contract]));

export function skillButtonIconContract(skillId) {
  return typeof skillId === 'string' ? LIVE_ICON_BY_SKILL_ID.get(skillId) ?? null : null;
}

function issue(code, index, detail = {}) {
  return Object.freeze({ code, index, ...detail });
}

export function validateLiveSkillIconCatalog(records) {
  if (!Array.isArray(records)) {
    return Object.freeze({ ok: false, issues: Object.freeze([issue('invalid_catalog', -1)]) });
  }
  const issues = [];
  const skillIds = new Set();
  const cacheKeys = new Set();
  if (records.length !== LIVE_SKILL_ICON_POLICY.skillCount) {
    issues.push(issue('skill_count_mismatch', -1, { value: records.length }));
  }
  records.forEach((record, index) => {
    if (!record || typeof record !== 'object') {
      issues.push(issue('invalid_record', index));
      return;
    }
    const canonical = skillIconDescriptor(record.skillId);
    if (!canonical) issues.push(issue('unknown_skill_id', index, { skillId: record.skillId ?? null }));
    if (skillIds.has(record.skillId)) issues.push(issue('duplicate_skill_id', index, { skillId: record.skillId }));
    skillIds.add(record.skillId);
    if (cacheKeys.has(record.cacheKey)) issues.push(issue('duplicate_cache_key', index, { cacheKey: record.cacheKey }));
    cacheKeys.add(record.cacheKey);
    if (!LIVE_MAIN_KIND_SET.has(record.mainKind)) issues.push(issue('invalid_main_kind', index, { mainKind: record.mainKind }));
    if (canonical) {
      const expected = runtimeContractForDescriptor(canonical);
      for (const field of [
        'sourceType', 'runtimeType', 'typeSymbol', 'category', 'categoryMarker',
        'targetType', 'mainKind', 'mainSymbol', 'effect', 'effectOverlay',
        'maxUses', 'cooldownSec', 'cacheKey', 'accessibilityLabelTH',
      ]) {
        if (record[field] !== expected[field]) issues.push(issue('contract_mismatch', index, { field, skillId: record.skillId }));
      }
    }
  });
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

const validation = validateLiveSkillIconCatalog(LIVE_SKILL_ICON_CATALOG);
if (!validation.ok) throw new TypeError('Invalid canonical live skill icon catalog');
