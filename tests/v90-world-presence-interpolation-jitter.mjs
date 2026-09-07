import assert from 'node:assert/strict';
import { createWorldPresenceController } from '../world-presence-v800.mjs';

class Position {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
class Group {
  constructor() { this.children = []; this.position = new Position(); this.rotation = { y: 0, z: 0 }; this.userData = {}; this.name = ''; }
  add(...nodes) { this.children.push(...nodes); }
  remove(node) { this.children = this.children.filter(item => item !== node); }
  traverse(visitor) { visitor(this); for (const child of this.children) child.traverse?.(visitor); }
}
class BoxGeometry { dispose() {} }
class MeshStandardMaterial { dispose() {} }
class Mesh extends Group { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
class Vector3 extends Position { project() { return this.set(0, 0, 0); } }
const THREE = { Group, Mesh, BoxGeometry, MeshStandardMaterial, Vector3 };

let now = 0;
const scene = new Group();
const controller = createWorldPresenceController({
  THREE,
  scene,
  getCamera: () => ({}),
  getZone: () => 'hub',
  now: () => now,
  interpolationDelayMs: 100,
});
const snapshot = (generation, x, animation) => ({ zone: 'hub', generation, players: [{ id: 'remote-a', x, z: 0, dir: 0, locomotion: 'run', ...(animation ? { animation } : {}) }] });

// Four effective position ticks per second: normal 250ms arrivals render the
// delayed sample directly, while a 500ms legacy gap remains bounded.
let cadenceNow = 0;
const cadenceScene = new Group();
const cadenceController = createWorldPresenceController({
  THREE,
  scene: cadenceScene,
  getCamera: () => ({}),
  getZone: () => 'hub',
  now: () => cadenceNow,
  interpolationDelayMs: 100,
});
assert.equal(cadenceController.acceptSnapshot({ zone: 'hub', generation: 1, players: [{ id: 'cadence', x: 0, z: 0 }] }), true);
cadenceNow = 250;
cadenceController.acceptSnapshot({ zone: 'hub', generation: 1, players: [{ id: 'cadence', x: 10, z: 0 }] });
cadenceNow = 500;
cadenceController.acceptSnapshot({ zone: 'hub', generation: 1, players: [{ id: 'cadence', x: 20, z: 0 }] });
const cadenceAvatar = cadenceScene.children.find(item => item.name === 'remote-world-player:cadence');
cadenceNow = 475;
cadenceController.update(.05);
assert.equal(cadenceAvatar.position.x, 15, '250ms samples render a continuous interpolated midpoint');
cadenceNow = 600;
cadenceController.update(.05);
assert.equal(cadenceAvatar.position.x, 20, 'effective position reaches each 250ms sample without extra half-second lag');
cadenceNow = 1000;
cadenceController.acceptSnapshot({ zone: 'hub', generation: 1, players: [{ id: 'cadence', x: 30, z: 0 }] });
cadenceController.update(.05);
assert.ok(cadenceAvatar.position.x - 20 <= 5, '500ms legacy gap uses bounded correction instead of teleport');

assert.equal(controller.acceptSnapshot(snapshot(1, 0)), true, 'first generation snapshot is accepted');
const avatar = scene.children.find(item => item.name === 'remote-world-player:remote-a');
assert.ok(avatar, 'remote avatar exists after first snapshot');
now = 50;
assert.equal(controller.acceptSnapshot(snapshot(1, 10)), true, 'second same-generation snapshot is accepted');
now = 100;
controller.update(.05);
assert.equal(avatar.position.x, 0, '100ms render delay buffers the newest sample');
now = 125;
controller.update(.05);
assert.ok(avatar.position.x > 0 && avatar.position.x < 10, 'buffer interpolates between late samples');
const beforeGap = avatar.position.x;

// A 1.5s arrival gap must not make the first late packet teleport the avatar.
now = 1600;
assert.equal(controller.acceptSnapshot(snapshot(1, 20)), true, 'late packet remains valid in the active generation');
controller.update(.05);
assert.ok(avatar.position.x > beforeGap, 'late packet advances the rendered position');
assert.ok(avatar.position.x - beforeGap <= 5, 'late packet correction is bounded per frame');
const afterGap = avatar.position.x;
now = 1650;
controller.update(.05);
assert.ok(avatar.position.x >= afterGap, 'rendered movement remains monotonic after the gap');

// Interpolation must not delay or extend one-shot action timing.
now = 1700;
controller.acceptSnapshot(snapshot(1, 21, {
  combatState: 'attack1', category: 'sword', onGround: true, dashing: false, verticalVelocity: 0,
  actionSessionId: 'jitter-attack', actionSequence: 1, actionDurationMs: 100,
}));
controller.update(.05);
assert.equal(avatar.userData.remoteAnimation.combatState, 'attack1', 'action state applies with the late snapshot');
now = 2001;
controller.update(.05);
assert.equal(avatar.userData.remoteAnimation.combatState, 'idle', 'action expiry follows receipt time, independent of render delay');

// Delayed old-zone/generation data must not resurrect a remote player.
assert.equal(controller.acceptSnapshot({ zone: 'hub', generation: 0, players: [{ id: 'stale', x: 99, z: 99 }] }), false, 'older route generation is rejected');
assert.equal(controller.acceptSnapshot({ zone: 'grass-meadow', generation: 2, players: [{ id: 'wrong-zone', x: 1, z: 1 }] }), false, 'wrong-zone snapshot is rejected');
assert.equal(controller.diagnostics().remotePlayers, 1, 'stale packets cannot replace the active player set');

// Reconnect clears the generation high-water so a fresh route may start at 1.
controller.clear();
assert.equal(controller.acceptSnapshot(snapshot(1, 2)), true, 'fresh reconnect may restart route generation at one');
assert.equal(controller.diagnostics().remotePlayers, 1, 'reconnect accepts the fresh player snapshot');

console.log('V90 world presence interpolation jitter: PASS');
