import assert from 'node:assert/strict';
import {
  PERSISTENT_MINIMAP_OWNER_KIND,
  createPersistentMinimapOwner,
} from '../persistent-minimap-owner-v900.mjs';

const listeners = new Map();
let scheduled = null;
let cleared = null;
const links = [];
const head = { append(node) { links.push(node); } };
const documentLike = {
  head,
  querySelector() { return null; },
  createElement(tag) { return { tagName: tag.toUpperCase(), dataset: {} }; },
};
const pose = { x: 170, z: -120, dir: Math.PI, zone: 'pirate-fruit' };
const windowLike = {
  location: { href: 'https://example.test/index.html?world=pirate-fruit' },
  POCKETMONSTER_WORLD_STATE: () => pose,
  POCKETMONSTER_UNIFIED_HUD: { rebindCount: 0, rebind() { this.rebindCount += 1; } },
  setInterval(fn, ms) { scheduled = { fn, ms }; return 7; },
  clearInterval(id) { cleared = id; },
  addEventListener(type, fn) { listeners.set(type, fn); },
  removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
};

const owner = createPersistentMinimapOwner({ windowLike, documentLike, intervalMs: 125 });
assert.equal(owner.kind, PERSISTENT_MINIMAP_OWNER_KIND);
assert.equal(windowLike.POCKETMONSTER_MINIMAP_HUD, owner.api, 'owner exposes the parent minimap global');
assert.equal(owner.api.snapshot().available, true, 'owner publishes Pirate geography immediately');
assert.equal(owner.api.snapshot().markers.length, 6);
assert.ok(owner.api.snapshot().player, 'owner publishes the live player pose');
assert.equal(links.length, 1, 'owner attaches one external mobile visibility stylesheet');
assert.match(links[0].href, /unified-minimap-mobile-v900\.css\?v=1$/);
assert.equal(scheduled.ms, 125, 'owner refreshes from parent world state at a bounded cadence');

windowLike.POCKETMONSTER_MINIMAP_HUD = null;
listeners.get('pocketmonster:online-scene-ready')?.();
assert.equal(windowLike.POCKETMONSTER_MINIMAP_HUD, owner.api, 'scene-ready restores the persistent parent owner');
assert.ok(windowLike.POCKETMONSTER_UNIFIED_HUD.rebindCount >= 2, 'Dock is rebound after initial expose and scene restore');

assert.equal(owner.stop(), true);
assert.equal(cleared, 7, 'stop clears the refresh timer');
assert.equal(listeners.has('pocketmonster:online-scene-ready'), false, 'stop removes scene listener');
assert.equal(windowLike.POCKETMONSTER_MINIMAP_HUD, undefined, 'stop releases the global owner');

console.log('V9 persistent minimap owner lifecycle: PASS');
