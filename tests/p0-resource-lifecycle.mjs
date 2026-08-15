import assert from 'node:assert/strict';
import { removeAndDispose } from '../scene-resource-lifecycle.mjs';
import { activeJs } from './active-assets.mjs';

function disposable(extra = {}) {
  return { calls: 0, dispose() { this.calls++; }, ...extra };
}

const texture = disposable({ isTexture: true, userData: {} });
const geometry = disposable();
const material = disposable({ map: texture });
const child = { geometry, material };
const root = {
  parentRemoved: 0,
  removeFromParent() { this.parentRemoved++; },
  traverse(visitor) { visitor(this); visitor(child); },
};

assert.deepEqual(removeAndDispose(null, root), { geometries: 1, materials: 1, textures: 1 });
assert.equal(root.parentRemoved, 1);
assert.equal(geometry.calls, 1);
assert.equal(material.calls, 1);
assert.equal(texture.calls, 1);
assert.deepEqual(removeAndDispose(null, root), { geometries: 0, materials: 0, textures: 0 }, 'repeat cleanup must not dispose GPU resources twice');
assert.equal(geometry.calls, 1);
assert.equal(material.calls, 1);
assert.equal(texture.calls, 1);

const rawRemovals = activeJs.match(/scene\.remove\(/g) ?? [];
assert.equal(rawRemovals.length, 0, 'active transient cleanup must use removeAndDispose');
for (const collection of ['wilds', 'projectiles', 'effects', 'groundDecals', 'ranchVisuals']) {
  assert.ok(activeJs.includes(collection), `active runtime missing ${collection} lifecycle`);
}
console.log('P0 scene resource lifecycle regression: PASS');
