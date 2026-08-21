import assert from 'node:assert/strict';
import {
  attachCharacterUi,
  createCharacterUIController,
  getFocusedCharacterPresentation,
  persistableState,
} from '../character-ui-controller.mjs';

const state = {
  collection: [
    { instanceId: 'alpha', speciesId: 'flame_wolf', hp: 32, maxHp: 40, level: 12, exp: 87, atk: 41, def: 29, spd: 35, bond: 64, growth: { power: 3 } },
    { instanceId: 'beta', speciesId: 'flame_wolf', hp: 9, maxHp: 30, level: 7, exp: 11, atk: 20, def: 21, spd: 18, bond: 12 },
  ],
  party: ['alpha', 'beta', null],
  storage: [],
  ranchActive: [],
  selectedSlot: 0,
  currentZone: 'grassland',
};
attachCharacterUi(state);
const controller = createCharacterUIController({
  getState: () => state,
  getActiveSummonId: () => null,
  getZone: () => state.currentZone,
});
controller.focusMonster('alpha');

const presentation = getFocusedCharacterPresentation({
  getInst: id => state.collection.find(inst => inst.instanceId === id) || null,
  focusedMonsterId: state.ui.focusedMonsterId,
  describeRoster: id => controller.describeRoster(id),
  displayName: inst => `Name:${inst.instanceId}`,
  getTypes: inst => inst.instanceId === 'alpha' ? ['Fire'] : ['Water'],
  getCr: inst => inst.atk + inst.def + inst.spd,
});
assert.deepEqual(presentation, {
  id: 'alpha',
  name: 'Name:alpha',
  level: 12,
  exp: 87,
  hp: 32,
  maxHp: 40,
  atk: 41,
  def: 29,
  spd: 35,
  cr: 105,
  bond: 64,
  growth: { power: 3 },
  types: ['Fire'],
  place: 'Party',
  placeLabel: 'Party ช่อง 1',
  isEmpty: false,
});

state.collection[0].hp = 7;
assert.equal(getFocusedCharacterPresentation({
  getInst: id => state.collection.find(inst => inst.instanceId === id) || null,
  focusedMonsterId: 'alpha',
  describeRoster: id => controller.describeRoster(id),
  displayName: inst => inst.instanceId,
  getTypes: () => ['Fire'],
  getCr: () => 0,
}).hp, 7, 'presentation reads the current instance instead of cached UI HP');

const empty = getFocusedCharacterPresentation({
  getInst: () => null,
  focusedMonsterId: 'missing',
  describeRoster: () => ({ place: 'None', label: 'None' }),
});
assert.equal(empty.isEmpty, true);
assert.equal(empty.id, null);
assert.equal(state.ui.hp, undefined, 'session UI must never duplicate HP');
assert.equal('ui' in persistableState(state), false, 'session UI stays outside saves');

console.log('V8.2 Character UI Phase 5 focused presentation shell: PASS');
