import assert from 'node:assert/strict';
import { createSceneRouteController } from '../scene-route-controller-v900.mjs';

const events = [];
const controller = createSceneRouteController({ initialRoute: null });
controller.register('pocket-monster', {
  async mount(route) { events.push(['mount-pocket', route]); },
  async unmount() { events.push(['unmount-pocket']); },
});
controller.register('pirate-fruit', {
  async mount(route) { events.push(['mount-pirate', route]); },
  async unmount() { events.push(['unmount-pirate']); },
});
assert.equal(await controller.switchTo('pocket-monster', { panel: 'throw' }), true);
assert.equal(await controller.switchTo('pirate-fruit', { panel: 'human' }), true);
assert.deepEqual(events, [
  ['mount-pocket', { panel: 'throw' }],
  ['unmount-pocket'],
  ['mount-pirate', { panel: 'human' }],
]);
assert.deepEqual(controller.diagnostics(), { active: 'pirate-fruit', switching: false, runtimeCount: 2 });
console.log('V9 in-document scene route controller: PASS');
