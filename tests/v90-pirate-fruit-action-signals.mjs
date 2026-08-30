import assert from 'node:assert/strict';
import fs from 'node:fs';

const signals = JSON.parse(fs.readFileSync(
  new URL('./fixtures/pirate-fruit-action-signals.json', import.meta.url),
  'utf8',
));

assert.equal(signals.presentationOnly, true, 'action inventory stays presentation-only');
assert.equal(signals.locomotion.walkSpeed, 4, 'normal Pirate movement remains walk');
assert.equal(signals.locomotion.runWhenSpeedGreaterThan, 5, 'run threshold matches the live controller');
for (const action of ['melee', 'skill', 'hurt', 'dead']) {
  assert.ok(signals.actions[action], `runtime inventory contains ${action}`);
}
for (const bone of [
  'player-rig:hips',
  'player-rig:chest',
  'player-rig:head',
  'player-rig:left-arm',
  'player-rig:right-arm',
  'player-rig:left-leg',
  'player-rig:right-leg',
]) {
  assert.ok(signals.sourceRig.includes(bone), `runtime inventory contains ${bone}`);
}
assert.equal(signals.equipment.visibleNodePrefix, 'equipment:');

console.log('V9.0 pirate-fruit action signals: PASS');
