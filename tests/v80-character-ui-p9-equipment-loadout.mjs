import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

assert.match(js, /function renderFocusedEquipmentLoadout\(\)/, 'Phase 9 needs a focused Equipment Loadout renderer');
assert.match(js, /focusedCharacterPresentation\(\)/, 'equipment view must use the focused live instance');
assert.match(js, /EQUIPMENT_SLOTS/, 'equipment view must preserve Gear, Charm, Utility slots');
assert.match(js, /getEquipmentFlat\(inst\)/, 'equipment contribution must use the existing equipment resolver');
assert.match(js, /loadoutPreview\(/, 'stat and CR changes must use the existing preview resolver');
assert.match(js, /ACTIVE_SUMMON_READONLY_REASON/, 'active summon must remain read-only for equipment changes');
assert.doesNotMatch(js, /state\.ui\.equipment/, 'equipment view must not copy gameplay equipment into state.ui');

console.log('V8.2 Character UI Phase 9 focused Equipment Loadout: PASS');
