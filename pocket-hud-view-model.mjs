/**
 * Unified HUD Task 5A — complete Pocket HUD view models.
 *
 * Pure presenters + bounded stores for the remaining Pocket HUD features
 * (player, target, actions, utilities, banner). game-v800.js projects only
 * safe primitives across this boundary; every feature normalizes into the
 * unified HUD contract shape and publishes through the shared dirty-checked
 * feature store, so identical semantic state never bumps revisions.
 */

import { createHudFeatureStore } from './unified-hud-feature-store.mjs';

const TEXT_LIMIT = 160;
const BUFF_LIMIT = 16;
const TARGET_STATE_LIMIT = 16;
const ACTION_LIMIT = 16;
const UTILITY_LIMIT = 16;
const LEVEL_MAX = 999;
const NUMERIC_MAX = 1_000_000_000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

function clampText(value, fallback = '') {
  return typeof value === 'string' ? value.trim().slice(0, TEXT_LIMIT) : fallback;
}

function finiteClamp(value, minimum, maximum, fallback = 0) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
}

function stableId(value) {
  const clean = clampText(value);
  return ID_PATTERN.test(clean) ? clean : '';
}

// ---------- Player ----------

export function buildPocketPlayerHudFeature(input = {}) {
  return {
    available: input.available === true,
    portraitKey: input.portraitKey,
    displayName: input.displayName,
    level: input.level,
    title: input.title,
    hp: input.hp,
    hpMax: input.hpMax,
    resourceKind: input.resourceKind,
    resource: input.resource,
    resourceMax: input.resourceMax,
    modeLabel: input.modeLabel,
    modePercent: input.modePercent,
    buffs: Array.isArray(input.buffs) ? input.buffs : [],
  };
}

function unavailablePlayerSnapshot(revision) {
  return Object.freeze({
    revision, available: false, portraitKey: '', displayName: '', level: 0, title: '',
    hp: 0, hpMax: 0, resourceKind: '', resource: 0, resourceMax: 0, modeLabel: '', modePercent: 0,
    buffs: Object.freeze([]),
  });
}

function normalizeBuffForStore(candidate, index) {
  if (!candidate || typeof candidate !== 'object') return null;
  const id = stableId(candidate.id) || `buff-${index}`;
  return Object.freeze({
    id,
    label: clampText(candidate.label),
    visualKey: clampText(candidate.visualKey),
    description: clampText(candidate.description),
    expiresAt: finiteClamp(candidate.expiresAt, 0, 8_640_000_000_000_000),
  });
}

function normalizePlayerForStore(input, revision) {
  if (!input || typeof input !== 'object' || input.available !== true) return unavailablePlayerSnapshot(revision);
  const hpMax = finiteClamp(input.hpMax, 0, NUMERIC_MAX);
  const resourceMax = finiteClamp(input.resourceMax, 0, NUMERIC_MAX);
  const buffs = [];
  for (const candidate of (Array.isArray(input.buffs) ? input.buffs : []).slice(0, BUFF_LIMIT)) {
    const normalized = normalizeBuffForStore(candidate, buffs.length);
    if (normalized && !buffs.some(buff => buff.id === normalized.id)) buffs.push(normalized);
  }
  return Object.freeze({
    revision,
    available: true,
    portraitKey: clampText(input.portraitKey),
    displayName: clampText(input.displayName),
    level: Math.trunc(finiteClamp(input.level, 0, LEVEL_MAX)),
    title: clampText(input.title),
    hp: finiteClamp(input.hp, 0, hpMax),
    hpMax,
    resourceKind: clampText(input.resourceKind),
    resource: finiteClamp(input.resource, 0, resourceMax),
    resourceMax,
    modeLabel: clampText(input.modeLabel),
    modePercent: finiteClamp(input.modePercent, 0, 100),
    buffs: Object.freeze(buffs),
  });
}

export function createPocketPlayerHudStore() {
  return createHudFeatureStore(normalizePlayerForStore);
}

// ---------- Target ----------

export function buildPocketTargetHudFeature(input) {
  if (!input || typeof input !== 'object') return { available: false };
  return {
    available: true,
    id: input.id,
    portraitKey: input.portraitKey,
    name: input.name,
    level: input.level,
    hp: input.hp,
    hpMax: input.hpMax,
    states: Array.isArray(input.states) ? input.states : [],
  };
}

function unavailableTargetSnapshot(revision) {
  return Object.freeze({
    revision, available: false, id: '', portraitKey: '', name: '', level: 0, hp: 0, hpMax: 0,
    states: Object.freeze([]),
  });
}

function normalizeTargetForStore(input, revision) {
  if (!input || typeof input !== 'object' || input.available !== true) return unavailableTargetSnapshot(revision);
  const hpMax = finiteClamp(input.hpMax, 0, NUMERIC_MAX);
  const states = [];
  for (const value of (Array.isArray(input.states) ? input.states : []).slice(0, TARGET_STATE_LIMIT)) {
    const text = clampText(value);
    if (text && !states.includes(text)) states.push(text);
  }
  return Object.freeze({
    revision,
    available: true,
    id: stableId(input.id),
    portraitKey: clampText(input.portraitKey),
    name: clampText(input.name),
    level: Math.trunc(finiteClamp(input.level, 0, LEVEL_MAX)),
    hp: finiteClamp(input.hp, 0, hpMax),
    hpMax,
    states: Object.freeze(states),
  });
}

export function createPocketTargetHudStore() {
  return createHudFeatureStore(normalizeTargetForStore);
}

// ---------- Actions ----------

const ACTION_CORE_IDS = Object.freeze(['capture', 'summon', 'recall']);

export function buildPocketActionsHudFeature({ core = {}, skills = [], captureBalls = 0 } = {}) {
  const items = [];
  for (const id of ACTION_CORE_IDS) {
    const view = core?.[id];
    if (!view || typeof view !== 'object') continue;
    items.push({
      id,
      visualKey: id,
      label: id === 'capture' ? 'ปาจับ' : id === 'summon' ? 'ปาเรียก' : 'Recall คู่หู',
      enabled: view.disabled !== true,
      state: view.state,
      reason: view.reason,
      count: id === 'capture' ? captureBalls : 0,
      cooldownRemaining: 0,
      cooldownTotal: 0,
    });
  }
  (Array.isArray(skills) ? skills : []).slice(0, 4).forEach((skill, index) => {
    if (!skill || typeof skill !== 'object') return;
    const cooldownRemaining = finiteClamp(skill.cooldownRemaining, 0, NUMERIC_MAX);
    items.push({
      id: `skill-${index + 1}`,
      visualKey: 'skill',
      label: `S${index + 1} ${clampText(skill.name) || `สกิล ${index + 1}`}`,
      enabled: skill.disabled !== true,
      state: skill.state,
      reason: skill.reason,
      count: finiteClamp(skill.currentUses, 0, NUMERIC_MAX),
      cooldownRemaining,
      cooldownTotal: Math.max(cooldownRemaining, finiteClamp(skill.cooldownTotal, 0, NUMERIC_MAX)),
    });
  });
  return { items };
}

function normalizeActionsForStore(input, revision) {
  const items = [];
  const candidates = input && typeof input === 'object' && Array.isArray(input.items) ? input.items : [];
  for (const candidate of candidates.slice(0, ACTION_LIMIT)) {
    if (!candidate || typeof candidate !== 'object') continue;
    const id = stableId(candidate.id);
    if (!id || items.some(item => item.id === id)) continue;
    const cooldownTotal = finiteClamp(candidate.cooldownTotal, 0, NUMERIC_MAX);
    items.push(Object.freeze({
      id,
      visualKey: clampText(candidate.visualKey),
      label: clampText(candidate.label),
      enabled: candidate.enabled === true,
      pressed: candidate.pressed === true,
      cooldownRemaining: finiteClamp(candidate.cooldownRemaining, 0, cooldownTotal),
      cooldownTotal,
      count: Math.trunc(finiteClamp(candidate.count, 0, NUMERIC_MAX)),
      state: clampText(candidate.state, 'unavailable'),
      reason: clampText(candidate.reason),
    }));
  }
  return Object.freeze({ revision, items: Object.freeze(items) });
}

export function createPocketActionsHudStore() {
  return createHudFeatureStore(normalizeActionsForStore);
}

// ---------- Utilities ----------

export function buildPocketUtilitiesHudFeature({ audioMuted = false } = {}) {
  return {
    items: [
      { id: 'character', label: 'ข้อมูลตัวละคร', visualKey: 'character', enabled: true },
      { id: 'save', label: 'บันทึกเกม', visualKey: 'save', enabled: true },
      { id: 'audio', label: audioMuted ? 'เปิดเสียง' : 'ปิดเสียง', visualKey: 'audio', enabled: true },
      { id: 'restart', label: 'เริ่มใหม่', visualKey: 'restart', enabled: true },
    ],
  };
}

function normalizeUtilitiesForStore(input, revision) {
  const items = [];
  const candidates = input && typeof input === 'object' && Array.isArray(input.items) ? input.items : [];
  for (const candidate of candidates.slice(0, UTILITY_LIMIT)) {
    if (!candidate || typeof candidate !== 'object') continue;
    const id = stableId(candidate.id);
    if (!id || items.some(item => item.id === id)) continue;
    items.push(Object.freeze({
      id,
      label: clampText(candidate.label),
      visualKey: clampText(candidate.visualKey),
      enabled: candidate.enabled === true,
      badge: clampText(candidate.badge),
      reason: clampText(candidate.reason),
    }));
  }
  return Object.freeze({ revision, items: Object.freeze(items) });
}

export function createPocketUtilitiesHudStore() {
  return createHudFeatureStore(normalizeUtilitiesForStore);
}

// ---------- Banner ----------

export function buildPocketBannerFeature(text) {
  const clean = clampText(text);
  if (!clean) return { kind: '', text: '', expiresAt: 0 };
  return { kind: 'system', text: clean, expiresAt: 0 };
}

function normalizeBannerForStore(input, revision) {
  const text = input && typeof input === 'object' ? clampText(input.text) : '';
  const kind = input && typeof input === 'object' ? clampText(input.kind) : '';
  return Object.freeze({
    revision,
    kind: text ? (kind || 'system') : '',
    text,
    expiresAt: finiteClamp(input?.expiresAt, 0, 8_640_000_000_000_000),
  });
}

export function createPocketBannerHudStore() {
  return createHudFeatureStore(normalizeBannerForStore);
}
