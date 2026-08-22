import { WORKBOOK_CAPTURE_ADAPTER } from './balance-config.mjs';
import { captureFinalChancePctV1, captureHpFactorV1 } from './balance-formulas.mjs';
import { evaluateCaptureAttemptPolicy } from './runtime-policies.mjs';

export const CAPTURE_FORMULA_VERSION = WORKBOOK_CAPTURE_ADAPTER.formulaVersion;
export const CAPTURE_STATUS_RULES = WORKBOOK_CAPTURE_ADAPTER.statusRules;
export const CAPTURE_BALL_RULES = WORKBOOK_CAPTURE_ADAPTER.ballRules;
export const CAPTURE_LEVEL_RULES = WORKBOOK_CAPTURE_ADAPTER.levelRules;
export const CAPTURE_VARIANT_RULES = WORKBOOK_CAPTURE_ADAPTER.variantRules;

const RAW_CAPTURE_MONSTER_PROFILES = [
  ['MON_001', 'Plain Slime', 1, 'NORMAL', 'Common', 70, 10],
  ['MON_019', 'Swift Hare', 2, 'NORMAL', 'Uncommon', 32, 20],
  ['MON_002', 'Ember Slime', 1, 'FIRE', 'Common', 70, 10],
  ['MON_020', 'Blaze Fox', 2, 'FIRE', 'Uncommon', 32, 20],
  ['MON_003', 'Aqua Slime', 1, 'WATER', 'Common', 66, 10],
  ['MON_021', 'Aqua Otter', 2, 'WATER', 'Uncommon', 28, 20],
  ['MON_004', 'Leaf Slime', 1, 'GRASS', 'Common', 70, 10],
  ['MON_022', 'Verdant Deer', 2, 'GRASS', 'Uncommon', 32, 20],
  ['MON_005', 'Volt Slime', 1, 'ELECTRIC', 'Common', 70, 10],
  ['MON_023', 'Volt Tiger', 2, 'ELECTRIC', 'Uncommon', 32, 20],
  ['MON_006', 'Frost Slime', 1, 'ICE', 'Common', 70, 10],
  ['MON_024', 'Frost Wolf', 2, 'ICE', 'Uncommon', 32, 20],
  ['MON_007', 'Stone Slime', 1, 'ROCK', 'Common', 66, 10],
  ['MON_025', 'Stone Rhino', 2, 'ROCK', 'Uncommon', 28, 20],
  ['MON_008', 'Mud Slime', 1, 'GROUND', 'Common', 70, 10],
  ['MON_026', 'Terra Mole', 2, 'GROUND', 'Uncommon', 32, 20],
  ['MON_009', 'Gust Slime', 1, 'FLYING', 'Common', 70, 10],
  ['MON_027', 'Gale Hawk', 2, 'FLYING', 'Uncommon', 32, 20],
  ['MON_010', 'Toxic Slime', 1, 'POISON', 'Common', 70, 10],
  ['MON_028', 'Venom Serpent', 2, 'POISON', 'Uncommon', 32, 20],
  ['MON_011', 'Shade Slime', 1, 'DARK', 'Common', 70, 10],
  ['MON_029', 'Shadow Panther', 2, 'DARK', 'Rare', 24, 20],
  ['MON_012', 'Lumen Slime', 1, 'LIGHT', 'Common', 70, 10],
  ['MON_030', 'Lumen Stag', 2, 'LIGHT', 'Rare', 24, 20],
  ['MON_013', 'Mind Slime', 1, 'PSYCHIC', 'Common', 70, 10],
  ['MON_031', 'Mystic Lynx', 2, 'PSYCHIC', 'Uncommon', 32, 20],
  ['MON_014', 'Hive Slime', 1, 'BUG', 'Common', 70, 10],
  ['MON_032', 'Aegis Beetle', 2, 'BUG', 'Uncommon', 32, 20],
  ['MON_015', 'Drake Slime', 1, 'DRAGON', 'Common', 70, 10],
  ['MON_033', 'Drake Whelp', 2, 'DRAGON', 'Rare', 24, 20],
  ['MON_016', 'Brawl Slime', 1, 'FIGHTING', 'Common', 70, 10],
  ['MON_034', 'Brawler Ape', 2, 'FIGHTING', 'Uncommon', 32, 20],
  ['MON_017', 'Iron Slime', 1, 'STEEL', 'Common', 66, 10],
  ['MON_035', 'Iron Wolf', 2, 'STEEL', 'Uncommon', 28, 20],
  ['MON_018', 'Wisp Slime', 1, 'GHOST', 'Common', 70, 10],
  ['MON_036', 'Spirit Fox', 2, 'GHOST', 'Rare', 24, 20],
];

export const CAPTURE_MONSTER_PROFILES = Object.freeze(RAW_CAPTURE_MONSTER_PROFILES.map(([
  monsterId,
  nameEN,
  stage,
  type,
  rarity,
  baseRatePct,
  baseBond,
]) => Object.freeze({
  monsterId,
  nameEN,
  stage,
  type,
  rarity,
  baseRatePct,
  baseBond,
  formulaVersion: CAPTURE_FORMULA_VERSION,
})));

const CAPTURE_PROFILE_BY_ID = new Map(CAPTURE_MONSTER_PROFILES.map(profile => [profile.monsterId, profile]));
const CAPTURE_PROFILE_TYPES = new Set([
  'NORMAL', 'FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'ICE', 'ROCK', 'GROUND', 'FLYING',
  'POISON', 'DARK', 'LIGHT', 'PSYCHIC', 'BUG', 'DRAGON', 'FIGHTING', 'STEEL', 'GHOST',
]);

const STATUS_BY_ID = new Map(CAPTURE_STATUS_RULES.map(rule => [rule.statusId, rule]));

function rounded(value) {
  return Math.round(value * 1e12) / 1e12;
}

function captureFailure(reason, detail = {}) {
  return Object.freeze({
    ok: false,
    reason,
    shouldRoll: false,
    formulaVersion: CAPTURE_FORMULA_VERSION,
    rawChancePct: 0,
    finalChancePct: 0,
    rollAuthority: WORKBOOK_CAPTURE_ADAPTER.rollAuthority,
    ...detail,
  });
}

export function validateCaptureMonsterProfiles(records) {
  const issues = [];
  if (!Array.isArray(records)) {
    return Object.freeze({ ok: false, issues: Object.freeze([{ code: 'invalid_catalog', field: 'root' }]) });
  }
  if (records.length !== 36) issues.push({ code: 'profile_count_mismatch', field: 'length' });
  const ids = new Set();
  let stage1Count = 0;
  let stage2Count = 0;
  for (const [index, profile] of records.entries()) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      issues.push({ code: 'invalid_profile', index, field: 'root' });
      continue;
    }
    if (!/^MON_\d{3}$/.test(profile.monsterId ?? '')) issues.push({ code: 'invalid_monster_id', index, field: 'monsterId' });
    if (ids.has(profile.monsterId)) issues.push({ code: 'duplicate_monster_id', index, field: 'monsterId' });
    ids.add(profile.monsterId);
    if (profile.stage === 1) stage1Count += 1;
    else if (profile.stage === 2) stage2Count += 1;
    else issues.push({ code: 'invalid_stage', index, field: 'stage' });
    if (!CAPTURE_PROFILE_TYPES.has(profile.type)) issues.push({ code: 'invalid_type', index, field: 'type' });
    if (!['Common', 'Uncommon', 'Rare'].includes(profile.rarity)) issues.push({ code: 'invalid_rarity', index, field: 'rarity' });
    if (!Number.isFinite(profile.baseRatePct) || profile.baseRatePct <= 0 || profile.baseRatePct > 100) issues.push({ code: 'invalid_base_rate', index, field: 'baseRatePct' });
    if (profile.baseBond !== (profile.stage === 1 ? 10 : 20)) issues.push({ code: 'invalid_base_bond', index, field: 'baseBond' });
    if (profile.formulaVersion !== CAPTURE_FORMULA_VERSION) issues.push({ code: 'formula_version_mismatch', index, field: 'formulaVersion' });
  }
  if (stage1Count !== 18) issues.push({ code: 'stage1_count_mismatch', field: 'stage' });
  if (stage2Count !== 18) issues.push({ code: 'stage2_count_mismatch', field: 'stage' });
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues.map(Object.freeze)) });
}

export function captureMonsterProfile(monsterId) {
  return CAPTURE_PROFILE_BY_ID.get(monsterId) ?? null;
}

export function resolveCaptureStatus(activeStatusIds = []) {
  const candidates = (Array.isArray(activeStatusIds) ? activeStatusIds : [])
    .map(statusId => STATUS_BY_ID.get(statusId))
    .filter(rule => rule && rule.statusId !== 'NONE')
    .sort((left, right) => (
      right.multiplier - left.multiplier
      || right.priority - left.priority
      || left.statusId.localeCompare(right.statusId)
    ));
  const chosen = candidates[0] ?? STATUS_BY_ID.get('NONE');
  return Object.freeze({
    statusId: chosen.statusId,
    multiplier: chosen.multiplier,
    priority: chosen.priority,
  });
}

function normalizedType(value) {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}

export function resolveCaptureBall({
  ballClass,
  ballTargetType = null,
  targetTypes = [],
  targetVariant,
} = {}) {
  const rule = typeof ballClass === 'string' && Object.hasOwn(CAPTURE_BALL_RULES, ballClass)
    ? CAPTURE_BALL_RULES[ballClass]
    : null;
  if (!rule) return Object.freeze({ ok: false, reason: 'invalid_ball_class', multiplier: 0 });
  const normalizedTargetTypeList = Array.isArray(targetTypes) ? targetTypes.map(normalizedType) : [];
  if (normalizedTargetTypeList.length < 1
    || normalizedTargetTypeList.length > 2
    || normalizedTargetTypeList.some(type => !type || !CAPTURE_PROFILE_TYPES.has(type))
    || new Set(normalizedTargetTypeList).size !== normalizedTargetTypeList.length) {
    return Object.freeze({ ok: false, reason: 'invalid_target_types', multiplier: 0 });
  }
  const normalizedTargetTypes = new Set(normalizedTargetTypeList);
  let conditionMet = false;
  if (rule.conditionType === 'MatchesPrimaryOrSecondary') {
    const normalizedBallTargetType = normalizedType(ballTargetType);
    if (!normalizedBallTargetType || !CAPTURE_PROFILE_TYPES.has(normalizedBallTargetType)) {
      return Object.freeze({ ok: false, reason: 'invalid_ball_target_type', multiplier: 0 });
    }
    conditionMet = normalizedTargetTypes.has(normalizedBallTargetType);
  } else if (rule.conditionType === 'TargetVariant=Elite') {
    conditionMet = targetVariant === 'Elite';
  }
  const conditionalMultiplier = conditionMet ? rule.conditionalMultiplier : 1;
  return Object.freeze({
    ok: true,
    reason: null,
    ballClass,
    baseMultiplier: rule.baseMultiplier,
    conditionalMultiplier,
    multiplier: rounded(rule.baseMultiplier * conditionalMultiplier),
  });
}

export function captureLevelMultiplier(targetLevel, referenceLevel) {
  if (!Number.isInteger(targetLevel) || targetLevel < 1
    || !Number.isInteger(referenceLevel) || referenceLevel < 1) return null;
  const difference = targetLevel - referenceLevel;
  const rule = CAPTURE_LEVEL_RULES.find(candidate => (
    (candidate.minDifference === undefined || difference >= candidate.minDifference)
    && (candidate.maxDifference === undefined || difference <= candidate.maxDifference)
  ));
  return rule?.multiplier ?? null;
}

export function captureVariantProfile(variant) {
  const aliases = {
    normal: 'Normal',
    rare: 'Normal',
    Elite: 'Elite',
    elite: 'Elite',
    Boss: 'Boss',
    boss: 'Boss',
    BossVariant: 'BossVariant',
    bossvariant: 'BossVariant',
  };
  const alias = typeof variant === 'string' && Object.hasOwn(aliases, variant)
    ? aliases[variant]
    : null;
  const workbookVariant = variant === 'Normal' || variant === 'Rare' ? 'Normal' : alias;
  const rule = workbookVariant && Object.hasOwn(CAPTURE_VARIANT_RULES, workbookVariant)
    ? CAPTURE_VARIANT_RULES[workbookVariant]
    : null;
  if (!rule) return null;
  return variant === workbookVariant
    ? Object.freeze({ variant, ...rule })
    : Object.freeze({ variant, workbookVariant, ...rule });
}

export function snapshotCaptureReferenceLevel(partyLevels) {
  const levels = (Array.isArray(partyLevels) ? partyLevels : [])
    .filter(level => Number.isInteger(level) && level >= 1);
  return levels.length > 0 ? Math.max(...levels) : null;
}

export function resolveWorkbookCapture(input = {}) {
  const variant = captureVariantProfile(input.variant);
  if (!variant) return captureFailure('invalid_state');

  const profile = captureMonsterProfile(input.monsterId);
  if (!profile) return captureFailure('unknown_id');

  const policy = evaluateCaptureAttemptPolicy({
    ownedMonsterActive: input.ownedMonsterActive,
    ballQuantity: input.ballQuantity,
    targetAlive: input.targetAlive,
    projectileHit: input.projectileHit,
    capturable: variant.captureEnabled,
  });
  if (!policy.ok) return captureFailure(policy.reason);

  if (!Number.isFinite(input.currentHp) || input.currentHp < 0
    || !Number.isFinite(input.maxHp) || input.maxHp <= 0
    || input.currentHp > input.maxHp
    || !Array.isArray(input.activeStatusIds)) {
    return captureFailure('invalid_state');
  }
  if (input.currentHp <= 0) return captureFailure('target_fainted');

  const hasSecondaryType = input.targetSecondaryType !== null && input.targetSecondaryType !== undefined;
  const secondaryType = hasSecondaryType ? normalizedType(input.targetSecondaryType) : null;
  if (hasSecondaryType
    && (!secondaryType || !CAPTURE_PROFILE_TYPES.has(secondaryType) || secondaryType === profile.type)) {
    return captureFailure('invalid_state');
  }
  const targetTypes = secondaryType === null ? [profile.type] : [profile.type, secondaryType];

  const level = captureLevelMultiplier(input.targetLevel, input.referenceLevel);
  if (level === null) return captureFailure('invalid_state');
  const ball = resolveCaptureBall({
    ballClass: input.ballClass,
    ballTargetType: input.ballTargetType,
    targetTypes,
    targetVariant: variant.workbookVariant ?? variant.variant,
  });
  if (!ball.ok) return captureFailure(ball.reason);

  const hp = captureHpFactorV1(input.currentHp / input.maxHp);
  const status = resolveCaptureStatus(input.activeStatusIds);
  const rawChancePct = rounded(
    profile.baseRatePct * hp * status.multiplier * ball.multiplier * level * variant.multiplier,
  );
  const finalChancePct = rounded(captureFinalChancePctV1(rawChancePct));
  const factors = Object.freeze({
    baseRatePct: profile.baseRatePct,
    hp,
    status: status.multiplier,
    ball: ball.multiplier,
    level,
    variant: variant.multiplier,
  });
  return Object.freeze({
    ok: true,
    reason: null,
    shouldRoll: finalChancePct > 0,
    formulaVersion: CAPTURE_FORMULA_VERSION,
    rawChancePct,
    finalChancePct,
    factors,
    strongestStatusId: status.statusId,
    rollAuthority: WORKBOOK_CAPTURE_ADAPTER.rollAuthority,
  });
}
