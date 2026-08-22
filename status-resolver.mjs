// PocketMonster V8.1 — pure Workbook status-application resolver.
// This computes chance, type immunity/resistance and proposed stacks without
// mutating encounter state. A23/A24 own lifecycle/interactions and hard-CC DR.

import { clamp } from './balance-formulas.mjs';
import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { SKILL_STATUS_LINKS, statusCatalogEntry } from './status-catalog.mjs';
import { RUNTIME_TYPES, sourceTypeToRuntime } from './type-catalog.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

export const STATUS_APPLICATION_POLICY = Object.freeze({
  activation: 'resolver_only',
  liveStatusMutation: 'deferred_A23',
  hardCcDiminishingReturns: 'deferred_A24',
  chanceMinimumPct: 5,
  chanceMaximumPct: 95,
  positiveBuffChancePct: 100,
  dualTypeResistanceRule: 'strongest_matching_resistance',
  stackRuleSource: 'Status_Master',
  serverAuthorityClaim: false,
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
});

export const HARD_CC_DR_RULES = Object.freeze({
  windowSec: 6,
  durationMultipliers: Object.freeze([1, 0.65, 0.4]),
  minimumDurationSec: 0.25,
  historyScope: 'shared_target_all_hard_cc',
});

const RAW_STATUS_TYPE_RULES = [
  ['FIRE', 'ST_BURN', 'Immune', 100],
  ['POISON', 'ST_POISON', 'Immune', 100],
  ['STEEL', 'ST_POISON', 'Immune', 100],
  ['ICE', 'ST_FREEZE', 'Immune', 100],
  ['STEEL', 'ST_BLEED', 'Immune', 100],
  ['GHOST', 'ST_FEAR', 'Immune', 100],
  ['ROCK', 'ST_BLEED', 'Resist', 50],
  ['ELECTRIC', 'ST_PARALYZE', 'Resist', 50],
  ['GRASS', 'ST_POISON', 'Resist', 25],
  ['DARK', 'ST_FEAR', 'Resist', 35],
  ['FIGHTING', 'ST_STAGGER', 'Resist', 30],
  ['ROCK', 'ST_STAGGER', 'Resist', 30],
];

export const STATUS_TYPE_RULES = Object.freeze(RAW_STATUS_TYPE_RULES.map(([
  sourceTargetType, statusId, ruleType, resistancePct,
]) => Object.freeze({
  sourceTargetType,
  targetType: sourceTypeToRuntime(sourceTargetType),
  statusId,
  ruleType,
  resistancePct,
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
})));

const LINK_BY_ID = new Map(SKILL_STATUS_LINKS.map(link => [link.id, link]));
const RUNTIME_TYPE_SET = new Set(RUNTIME_TYPES);

function statusResult(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function typeResistance(statusId, targetTypes) {
  let resistancePct = 0;
  const matchingRules = [];
  for (const rule of STATUS_TYPE_RULES) {
    if (rule.statusId !== statusId || !targetTypes.includes(rule.targetType)) continue;
    matchingRules.push(rule);
    resistancePct = Math.max(resistancePct, rule.resistancePct);
  }
  return Object.freeze({
    resistancePct,
    immune: resistancePct >= 100,
    matchingRules: Object.freeze(matchingRules),
  });
}

function readStatusRoll(rng) {
  if (typeof rng !== 'function') return statusResult(false, 'rng_required', { rngDraws: 0 });
  let roll;
  try {
    roll = rng();
  } catch {
    return statusResult(false, 'rng_failure', { rngDraws: 0 });
  }
  if (!Number.isFinite(roll) || roll < 0 || roll > 1) {
    return statusResult(false, 'invalid_rng_value', { rngDraws: 1 });
  }
  return statusResult(true, null, { roll, rngDraws: 1 });
}

export function resolveHardCcDuration({
  statusId,
  baseDurationSec,
  nowSec,
  history = [],
} = {}) {
  const status = statusCatalogEntry(statusId);
  if (!status) return statusResult(false, 'unknown_status', { statusId: statusId ?? null });
  if (!status.hardCC || status.category !== 'HardCC') {
    return statusResult(false, 'not_hard_cc', { statusId });
  }
  if (!Number.isFinite(nowSec) || nowSec < 0) {
    return statusResult(false, 'invalid_time', { statusId, nowSec: nowSec ?? null });
  }
  if (!Array.isArray(history) || history.some(entry => (
    !entry || typeof entry !== 'object'
      || typeof entry.statusId !== 'string'
      || !Number.isFinite(entry.atSec)
      || entry.atSec < 0
      || entry.atSec > nowSec
  ))) {
    return statusResult(false, 'invalid_history', { statusId });
  }

  const duration = baseDurationSec == null ? status.baseDurationSec : baseDurationSec;
  if (!Number.isFinite(duration) || duration <= 0) {
    return statusResult(false, 'invalid_duration', { statusId, baseDurationSec: duration ?? null });
  }

  const rules = HARD_CC_DR_RULES;
  const activeHistory = history.filter(entry => nowSec - entry.atSec < rules.windowSec);
  const drTier = Math.min(3, activeHistory.length + 1);
  const durationMultiplier = rules.durationMultipliers[drTier - 1];
  const durationSec = Math.max(rules.minimumDurationSec, duration * durationMultiplier);
  const current = Object.freeze({ statusId, atSec: nowSec });
  const nextHistory = Object.freeze([
    ...activeHistory.map(entry => Object.freeze({ statusId: entry.statusId, atSec: entry.atSec })),
    current,
  ]);

  return statusResult(true, null, {
    statusId,
    baseDurationSec: duration,
    durationSec,
    durationMultiplier,
    drTier,
    applicationsInWindow: activeHistory.length,
    windowSec: rules.windowSec,
    minimumDurationSec: rules.minimumDurationSec,
    nextHistory,
  });
}

export function resolveStatusApplication({
  linkId,
  targetTypes = [],
  currentStacks = 0,
  extraResistancePct = 0,
} = {}, { rng } = {}) {
  const link = LINK_BY_ID.get(linkId);
  if (!link) return statusResult(false, 'unknown_link', { linkId: linkId ?? null });
  const status = statusCatalogEntry(link.statusId);
  if (!status) return statusResult(false, 'unknown_status', { linkId, statusId: link.statusId });
  if (!Array.isArray(targetTypes)
    || targetTypes.length > 2
    || new Set(targetTypes).size !== targetTypes.length
    || targetTypes.some(type => !RUNTIME_TYPE_SET.has(type))) {
    return statusResult(false, 'invalid_type', { linkId, targetTypes });
  }
  if (!Number.isInteger(currentStacks) || currentStacks < 0 || currentStacks > status.maxStacks) {
    return statusResult(false, 'invalid_stacks', { linkId, currentStacks, maxStacks: status.maxStacks });
  }
  if (!Number.isFinite(extraResistancePct) || extraResistancePct < 0 || extraResistancePct > 100) {
    return statusResult(false, 'invalid_resistance', { linkId, extraResistancePct });
  }

  const typeRule = typeResistance(status.id, targetTypes);
  const durationSec = link.durationOverrideSec > 0 ? link.durationOverrideSec : status.baseDurationSec;
  const baseDetail = {
    activation: STATUS_APPLICATION_POLICY.activation,
    linkId,
    skillId: link.skillId,
    statusId: status.id,
    status,
    link,
    targetTypes: Object.freeze([...targetTypes]),
    matchingTypeRules: typeRule.matchingRules,
    resistancePct: typeRule.resistancePct,
    extraResistancePct,
    baseChancePct: link.finalBaseChancePct,
    baseDurationSec: durationSec,
    previousStacks: currentStacks,
    maxStacks: status.maxStacks,
    stackRule: status.stackRule,
    potencyStacks: link.potencyStacks,
  };

  if (status.polarity === 'Negative' && typeRule.immune) {
    return statusResult(true, 'type_immune', {
      ...baseDetail,
      applied: false,
      finalChancePct: 0,
      nextStacks: currentStacks,
      proposedStatus: null,
      rngDraws: 0,
    });
  }

  const finalChancePct = status.polarity === 'Positive'
    ? STATUS_APPLICATION_POLICY.positiveBuffChancePct
    : link.finalBaseChancePct <= 0
      ? 0
      : clamp(
        link.finalBaseChancePct
          * (1 - typeRule.resistancePct / 100)
          * (1 - extraResistancePct / 100),
        STATUS_APPLICATION_POLICY.chanceMinimumPct,
        STATUS_APPLICATION_POLICY.chanceMaximumPct,
      );

  let applied = status.polarity === 'Positive';
  let roll = null;
  let rngDraws = 0;
  if (status.polarity === 'Negative' && finalChancePct > 0) {
    const rolled = readStatusRoll(rng);
    if (!rolled.ok) return statusResult(false, rolled.reason, { ...baseDetail, finalChancePct, rngDraws: rolled.rngDraws });
    roll = rolled.roll;
    rngDraws = rolled.rngDraws;
    applied = roll < finalChancePct / 100;
  }

  const nextStacks = applied
    ? status.stackRule === 'AddStackAndRefresh'
      ? Math.min(status.maxStacks, currentStacks + link.potencyStacks)
      : 1
    : currentStacks;
  const proposedStatus = applied ? Object.freeze({
    statusId: status.id,
    sourceSkillId: link.skillId,
    sourceLinkId: link.id,
    stacks: nextStacks,
    durationSec,
    stackRule: status.stackRule,
  }) : null;

  return statusResult(true, applied ? null : 'chance_miss', {
    ...baseDetail,
    applied,
    finalChancePct,
    roll,
    rngDraws,
    nextStacks,
    proposedStatus,
  });
}

for (const rule of STATUS_TYPE_RULES) {
  if (!RUNTIME_TYPE_SET.has(rule.targetType) || !statusCatalogEntry(rule.statusId)
    || !['Immune', 'Resist'].includes(rule.ruleType)
    || !Number.isFinite(rule.resistancePct) || rule.resistancePct < 0 || rule.resistancePct > 100) {
    throw new TypeError(`Invalid status type rule: ${rule.sourceTargetType}/${rule.statusId}`);
  }
}
