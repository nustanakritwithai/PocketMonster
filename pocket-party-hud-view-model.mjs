/**
 * Unified HUD Task 5 — Pocket Party view model.
 *
 * Pure presenter + bounded store for the party feature of the unified
 * MMORPG HUD contract. game-v800.js stays the only place that mutates
 * party membership/selection; this module normalizes safe primitive
 * projections of the three slots into immutable, revision-ordered
 * snapshots for the Dock.
 */

import { createHudFeatureStore } from './unified-hud-feature-store.mjs';

export const PARTY_SLOT_COUNT = 3;
const PARTY_TEXT_LIMIT = 160;
const PARTY_LEVEL_MAX = 999;
const PARTY_NUMERIC_MAX = 1_000_000_000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

function clampPartyText(value, fallback = '') {
  return typeof value === 'string' ? value.trim().slice(0, PARTY_TEXT_LIMIT) : fallback;
}

function finiteClamp(value, minimum, maximum, fallback = 0) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
}

function stableInstanceId(value) {
  const clean = clampPartyText(value);
  return ID_PATTERN.test(clean) ? clean : '';
}

function emptySlot(slot, selected) {
  return Object.freeze({
    id: `slot-${slot + 1}`,
    slot,
    available: false,
    instanceId: '',
    portraitKey: '',
    name: '',
    level: 0,
    hp: 0,
    hpMax: 0,
    condition: '',
    fainted: false,
    selected: selected === true,
    active: false,
  });
}

/**
 * Build the contract-shaped party feature input from a safe projection of
 * live Pocket state. `slots` must already be plain primitives extracted by
 * game-v800.js — no monster instances or DOM may cross this boundary.
 */
export function buildPocketPartyHudFeature({ selectedSlot = null, activeInstanceId = '', canSwitch = false, slots = [] } = {}) {
  const selected = Number.isInteger(selectedSlot) && selectedSlot >= 0 && selectedSlot < PARTY_SLOT_COUNT
    ? selectedSlot
    : null;
  const activeId = stableInstanceId(activeInstanceId);
  return {
    available: true,
    selectedSlot: selected,
    activeInstanceId: activeId,
    canSwitch: canSwitch === true,
    slots: Array.from({ length: PARTY_SLOT_COUNT }, (_, slot) => {
      const source = slots?.[slot];
      if (!source || typeof source !== 'object') return { slot, available: false, selected: slot === selected };
      return {
        slot,
        available: true,
        instanceId: source.instanceId,
        portraitKey: source.portraitKey,
        name: source.name,
        level: source.level,
        hp: source.hp,
        hpMax: source.hpMax,
        condition: source.condition,
        fainted: source.fainted === true,
        selected: slot === selected,
        active: Boolean(activeId) && stableInstanceId(source.instanceId) === activeId,
      };
    }),
  };
}

function normalizePartySlotForStore(candidate, slot, selectedSlot, activeInstanceId) {
  if (!candidate || typeof candidate !== 'object' || candidate.available === false) {
    return emptySlot(slot, candidate?.selected === true);
  }
  const hpMax = finiteClamp(candidate.hpMax, 0, PARTY_NUMERIC_MAX);
  return Object.freeze({
    id: `slot-${slot + 1}`,
    slot,
    available: true,
    instanceId: stableInstanceId(candidate.instanceId),
    portraitKey: clampPartyText(candidate.portraitKey),
    name: clampPartyText(candidate.name),
    level: Math.trunc(finiteClamp(candidate.level, 0, PARTY_LEVEL_MAX)),
    hp: finiteClamp(candidate.hp, 0, hpMax),
    hpMax,
    condition: clampPartyText(candidate.condition),
    fainted: candidate.fainted === true,
    selected: candidate.selected === true,
    active: candidate.active === true && Boolean(activeInstanceId),
  });
}

function unavailablePartySnapshot(revision) {
  return Object.freeze({
    revision,
    available: false,
    selectedSlot: null,
    activeInstanceId: '',
    canSwitch: false,
    slots: Object.freeze(Array.from({ length: PARTY_SLOT_COUNT }, (_, slot) => emptySlot(slot, false))),
  });
}

function normalizePartyForStore(input, revision) {
  if (!input || typeof input !== 'object' || input.available === false) {
    return unavailablePartySnapshot(revision);
  }
  const selectedSlot = Number.isInteger(input.selectedSlot)
    && input.selectedSlot >= 0 && input.selectedSlot < PARTY_SLOT_COUNT ? input.selectedSlot : null;
  const activeInstanceId = stableInstanceId(input.activeInstanceId);
  const candidates = Array.isArray(input.slots) ? input.slots : [];
  const slots = Array.from({ length: PARTY_SLOT_COUNT }, (_, slot) =>
    normalizePartySlotForStore(candidates[slot], slot, selectedSlot, activeInstanceId));
  return Object.freeze({
    revision,
    available: true,
    selectedSlot,
    activeInstanceId,
    canSwitch: input.canSwitch === true,
    slots: Object.freeze(slots),
  });
}

/**
 * Bounded party store: monotonic revisions, dirty publish, subscriber
 * notification, and an explicit reset used when the player leaves the
 * Pocket world so the Dock never renders stale party state.
 */
export function createPocketPartyHudStore() {
  return createHudFeatureStore(normalizePartyForStore);
}
