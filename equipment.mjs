// Monster Life RPG — V7.6 Equipment
// Equipment is Reversible Power (R1, R9): a 3-slot loadout that can be swapped and
// never permanently alters Gene/Training. Same-type affixes share a stacking group
// with a hard cap; skill-behavior affixes apply only to compatible skill tags. The
// full loadout targets an 8-12% Expected Combat Power gain. Resolver is UI-free.

import { BALANCE_CONFIG } from './balance-config.mjs';
import { combatRating, CORE_STATS } from './combat-rating.mjs';

export const EQUIPMENT_SLOTS = Object.freeze(['gear', 'charm', 'utility']);

function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

// Equip an item into its slot (reversible). Returns the previously equipped item.
export function equipItem(instance, item) {
  if (!item || !EQUIPMENT_SLOTS.includes(item.slot)) return { ok: false, reason: 'invalid item/slot' };
  if (!instance.equipment) instance.equipment = { gear: null, charm: null, utility: null };
  const previous = instance.equipment[item.slot] ?? null;
  instance.equipment[item.slot] = item;
  return { ok: true, slot: item.slot, previous };
}

// Remove whatever is in a slot (reversible; no permanent stat change).
export function unequip(instance, slot) {
  if (!EQUIPMENT_SLOTS.includes(slot) || !instance.equipment) return null;
  const removed = instance.equipment[slot] ?? null;
  instance.equipment[slot] = null;
  return removed;
}

export function equippedItems(instance) {
  const eq = instance.equipment ?? {};
  return EQUIPMENT_SLOTS.map(slot => eq[slot]).filter(Boolean);
}

// Aggregate equipment contribution: flat core stats, derived bonuses, and
// skill-behavior mods. Same-group affixes stack additively then hit a hard cap.
export function computeEquipmentContribution(items, { ownedSkillTags = [] } = {}) {
  const flat = { hp: 0, atk: 0, def: 0, spd: 0 };
  const derived = {};
  const skillMods = [];
  const groupTotals = {}; // group -> { value, cap, stat|derived }

  const addToGroup = (affix, value) => {
    const group = affix.group ?? `${affix.stat ?? affix.derived}`;
    if (!groupTotals[group]) groupTotals[group] = { value: 0, cap: affix.cap ?? Infinity, kind: affix.stat ? 'stat' : 'derived', key: affix.stat ?? affix.derived };
    groupTotals[group].value += value;
    if (affix.cap != null) groupTotals[group].cap = affix.cap; // Last-declared cap wins.
  };

  const ownedTags = new Set(ownedSkillTags);
  for (const item of items ?? []) {
    for (const affix of item.affixes ?? []) {
      if (affix.skillTags) {
        // Skill-behavior affix: applies only to compatible skill tags (R9).
        if (affix.skillTags.some(tag => ownedTags.has(tag))) {
          skillMods.push({ from: item.id, skillTags: affix.skillTags, effect: affix.effect });
        }
        continue;
      }
      if (affix.stat && CORE_STATS.includes(affix.stat)) addToGroup(affix, num(affix.value));
      else if (affix.derived) addToGroup(affix, num(affix.value));
    }
  }

  for (const { value, cap, kind, key } of Object.values(groupTotals)) {
    const capped = Math.min(value, cap);
    if (kind === 'stat') flat[key] += capped;
    else derived[key] = (derived[key] ?? 0) + capped;
  }

  return { flat, derived, skillMods };
}

// Merge equipment flat contribution into a combat-rating build.
function withEquipment(build, contribution) {
  const equipmentFlat = { ...(build.equipmentFlat ?? {}) };
  for (const stat of CORE_STATS) equipmentFlat[stat] = num(equipmentFlat[stat]) + num(contribution.flat[stat]);
  const derivedBonus = { ...(build.derivedBonus ?? {}) };
  for (const [key, value] of Object.entries(contribution.derived)) derivedBonus[key] = num(derivedBonus[key]) + value;
  return { ...build, equipmentFlat, derivedBonus };
}

// R9 — Verify the loadout's Expected Combat Power gain sits within 8-12%.
export function checkEquipmentBudget(build, contribution, config = BALANCE_CONFIG) {
  const withoutCr = combatRating(build, config).cr;
  const withCr = combatRating(withEquipment(build, contribution), config).cr;
  const share = withoutCr > 0 ? (withCr - withoutCr) / withoutCr : 0;
  const { min, max } = config.equipment.budget;
  return { withoutCr, withCr, share, withinBudget: share >= min - 1e-9 && share <= max + 1e-9, min, max };
}

// Preview the stat / CR change from a loadout before committing (R9).
export function loadoutPreview(build, contribution, config = BALANCE_CONFIG) {
  const before = combatRating(build, config);
  const after = combatRating(withEquipment(build, contribution), config);
  const statDelta = {};
  for (const stat of CORE_STATS) statDelta[stat] = after.stats[stat] - before.stats[stat];
  return {
    statDelta,
    dpsDelta: after.dps - before.dps,
    ehpDelta: after.ehp - before.ehp,
    crDelta: after.cr - before.cr,
    before,
    after,
  };
}
