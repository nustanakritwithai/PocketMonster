import assert from 'node:assert/strict';
import { normalizeInstance } from '../monster-instance.mjs';
import {
  EQUIPMENT_SLOTS,
  equipItem,
  unequip,
  equippedItems,
  computeEquipmentContribution,
  checkEquipmentBudget,
  loadoutPreview,
} from '../equipment.mjs';

const mk = (over = {}) => normalizeInstance({ instanceId: 'e1', level: 20, ...over });

const gear = { id: 'flame_claw', slot: 'gear', tier: 'rare', affixes: [{ group: 'atk', stat: 'atk', value: 5 }] };
const charm = { id: 'guard_band', slot: 'charm', tier: 'uncommon', affixes: [{ group: 'def', stat: 'def', value: 4 }] };
const utility = { id: 'focus_lens', slot: 'utility', tier: 'uncommon', affixes: [{ group: 'cdr', derived: 'cooldownReduction', value: 0.03 }] };

// Equip / unequip is reversible and never mutates base stats (R1, R9).
const mon = mk();
const genesBefore = JSON.stringify(mon.genes);
const trainingBefore = JSON.stringify(mon.training);
equipItem(mon, gear);
equipItem(mon, charm);
equipItem(mon, utility);
assert.equal(equippedItems(mon).length, 3, 'all three slots equipped');
assert.equal(mon.equipment.gear.id, 'flame_claw', 'gear slot holds the item');
const removed = unequip(mon, 'gear');
assert.equal(removed.id, 'flame_claw', 'unequip returns the removed item');
assert.equal(mon.equipment.gear, null, 'slot is empty after unequip');
assert.equal(JSON.stringify(mon.genes), genesBefore, 'equipment never changes genes');
assert.equal(JSON.stringify(mon.training), trainingBefore, 'equipment never changes training');

// Invalid slot is rejected.
assert.equal(equipItem(mon, { id: 'x', slot: 'ring', affixes: [] }).ok, false, 'unknown slot is rejected');

// Same-group affixes stack additively then hit their hard cap (R9).
const stacked = computeEquipmentContribution([
  { id: 'a', slot: 'gear', affixes: [{ group: 'atk', stat: 'atk', value: 6, cap: 8 }] },
  { id: 'b', slot: 'charm', affixes: [{ group: 'atk', stat: 'atk', value: 6, cap: 8 }] },
]);
assert.equal(stacked.flat.atk, 8, 'same-group affixes are capped (6 + 6 -> cap 8)');

// Skill-behavior affixes apply only to compatible skill tags (R9).
const skillItem = { id: 'ember_ring', slot: 'charm', affixes: [{ skillTags: ['fire'], effect: { burn: true } }] };
const noMatch = computeEquipmentContribution([skillItem], { ownedSkillTags: ['ice'] });
const match = computeEquipmentContribution([skillItem], { ownedSkillTags: ['fire'] });
assert.equal(noMatch.skillMods.length, 0, 'incompatible skill-behavior affix does nothing');
assert.equal(match.skillMods.length, 1, 'compatible skill-behavior affix applies');

// Full loadout stays within the 8-12% Expected Combat Power budget (R9 Set Rule).
const build = {
  name: 'Attacker', level: 20,
  species: { base: { hp: 120, atk: 30, def: 25, spd: 28 }, growthPerLevel: { hp: 8, atk: 2, def: 1.5, spd: 1.6 } },
  genes: { hp: 'B', atk: 'A', def: 'C', spd: 'B' },
  training: { power: 110, speed: 50, technique: 40 },
  condition: 'good',
};
const contribution = computeEquipmentContribution([gear, charm, utility]);
const budget = checkEquipmentBudget(build, contribution);
assert.ok(budget.withinBudget, `loadout CR gain ${(budget.share * 100).toFixed(1)}% must be within 8-12%`);

// Loadout preview reports the expected change before committing (R9).
const preview = loadoutPreview(build, contribution);
assert.ok(preview.crDelta > 0, 'preview shows a CR increase');
assert.ok(preview.statDelta.atk >= 5, 'preview shows the ATK gain from gear');
assert.equal(EQUIPMENT_SLOTS.length, 3, 'exactly three equipment slots');

console.log('V7.6 equipment regression: PASS');
