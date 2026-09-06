import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createPirateSnapshotMessage,
  sanitizePirateWorldSnapshot,
} from '../pirate-presence-bridge-v900.mjs';
import {
  createMessageHost,
  createRemoteManager,
  createTrackedScene,
  loadPiratePresenceBundleHarness,
  seedRemotePlayer,
} from './fixtures/pirate-presence-bundle-harness.mjs';

const combo0 = JSON.parse(fs.readFileSync(
  new URL('./fixtures/accepted-blade-visual-combo0.json', import.meta.url),
  'utf8',
));
const finisher3 = JSON.parse(fs.readFileSync(
  new URL('./fixtures/accepted-blade-visual-finisher3.json', import.meta.url),
  'utf8',
));
const { bundleUrl, PresenceRuntime, RemotePlayerManager } = await loadPiratePresenceBundleHarness();

const PLAYER_ID = 'remote-sword';
const ISLAND_ID = 'starter-island';
const ZONE = 'pirate-fruit';

function snapshotFor(visual) {
  return sanitizePirateWorldSnapshot({
    zone: ZONE,
    players: [{
      id: PLAYER_ID,
      name: 'Sword QA',
      x: 2,
      y: 0,
      z: 3,
      dir: 0,
      locomotion: 'idle',
      visual,
    }],
  });
}

function assertClose(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-5, `${label}: expected ${expected}, got ${actual}`);
}

function assertBladeEndpoint(effect, event) {
  const positions = effect.children[0].geometry.getAttribute('position');
  const final = Array.from(positions.array.slice(-6));
  const expected = [
    event.bladeBase.x, event.bladeBase.y, event.bladeBase.z,
    event.bladeTip.x, event.bladeTip.y, event.bladeTip.z,
  ];
  for (let index = 0; index < expected.length; index += 1) {
    assertClose(final[index], expected[index], `blade endpoint component ${index}`);
  }
}

const scene = createTrackedScene();
const clock = { now: 10_000 };
const animatorEvents = [];
const manager = createRemoteManager(RemotePlayerManager, ISLAND_ID, animatorEvents, clock, scene);
const sourceRig = seedRemotePlayer(manager, PLAYER_ID, ISLAND_ID, animatorEvents, clock.now);
// The Pocket overlay may hide the source rig while an owner-scoped one-shot
// remains independently visible at its accepted world-space blade sockets.
sourceRig.visible = false;
const host = createMessageHost();
const runtime = new PresenceRuntime({
  host,
  remotePlayers: manager,
  targetOrigin: host.targetOrigin,
  now: () => clock.now,
  publishIntervalMs: 50,
  getIslandId: () => ISLAND_ID,
  getPosition: () => ({ x: 0, y: 0, z: 0 }),
  getHeading: () => 0,
  getLocomotion: () => 'idle',
  getAnimation: () => null,
  getActionSnapshot: () => null,
  heightAt: () => 0,
});
runtime.start();
host.posted.length = 0;

const acceptedCombo = snapshotFor(combo0);
assert.ok(acceptedCombo, 'Server combo-0 fixture passes the parent snapshot sanitizer');
assert.equal(acceptedCombo.players[0].visual.events[0].ageMs, 338, 'accepted event age crosses the receiver boundary unchanged');
host.dispatch(createPirateSnapshotMessage(acceptedCombo));

let effects = scene.objectsByName('effect:blade-trail');
assert.equal(effects.length, 1, 'M1 combo-0 reaches the bundled RemotePlayers and creates one blade trail');
const comboEffect = effects[0];
assert.equal(sourceRig.visible, false, 'the source rig stays hidden by the overlay');
assert.equal(comboEffect.visible, true, 'the remote blade trail stays visible independently of the source rig');
assert.equal(comboEffect.children.length, 2, 'blade trail renders both ribbon mesh and cutting edge');
assert.equal(comboEffect.children[0].isMesh, true, 'the visible ribbon is a real Three mesh from the bundled Effects class');
assert.equal(comboEffect.children[0].geometry.getAttribute('position').count, 16, 'combo-0 uses the production seven-segment sweep');
assert.equal(comboEffect.children[0].material.opacity, 0.64, 'combo-0 uses the production ribbon opacity');
assertBladeEndpoint(comboEffect, combo0.events[0]);
assert.equal(manager.effects.active.at(-1).maxLife, 0.22, 'combo-0 keeps the production 220ms lifetime');

const acceptedFinisher = snapshotFor(finisher3);
assert.ok(acceptedFinisher, 'Server finisher fixture passes the parent snapshot sanitizer');
assert.deepEqual(acceptedFinisher.players[0].visual.events.map(event => event.ageMs), [672, 0],
  'the accumulated combo history keeps its accepted event ages');
host.dispatch(createPirateSnapshotMessage(acceptedFinisher));

effects = scene.objectsByName('effect:blade-trail');
assert.equal(effects.length, 2, 'the repeated sequence is deduped while finisher sequence two renders once');
const finisherEffect = effects[1];
assert.equal(finisherEffect.visible, true);
assert.equal(finisherEffect.children[0].geometry.getAttribute('position').count, 22, 'finisher uses the production ten-segment sweep');
assert.equal(finisherEffect.children[0].material.opacity, 0.78, 'finisher uses the production brighter ribbon');
assertBladeEndpoint(finisherEffect, finisher3.events[1]);
assert.equal(manager.effects.active.at(-1).maxLife, 0.3, 'finisher keeps the production 300ms lifetime');

manager.effects.update(0.23);
effects = scene.objectsByName('effect:blade-trail');
assert.deepEqual(effects, [finisherEffect], 'combo trail expires before the longer finisher');
manager.effects.update(0.08);
assert.equal(scene.objectsByName('effect:blade-trail').length, 0, 'finisher is removed after its bounded lifetime');

const expired = snapshotFor({
  ...combo0,
  sessionId: 'expired_visual_session',
  stateSequence: 1,
  events: [{ ...combo0.events[0], ageMs: 3001 }],
});
assert.ok(expired);
assert.equal('visual' in expired.players[0], false, 'an event older than the protocol TTL cannot create an overlay effect');
host.dispatch(createPirateSnapshotMessage(expired));
assert.equal(scene.objectsByName('effect:blade-trail').length, 0);

runtime.dispose();
assert.equal(scene.objectsByName('effect:blade-trail').length, 0, 'owner disposal leaves no sword overlay behind');
assert.equal(host.listenerCount, 0);

console.log(`V9 accepted sword receiver-to-visible-overlay (${bundleUrl.pathname}): PASS`);
