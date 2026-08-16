import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  GAMEPLAY_FORBIDDEN_FIELDS,
  GAMEPLAY_LOCKS,
  LEGACY_FALLBACKS,
  PRESENTATION_ANCHORS,
  assertAssetHandle,
  createNullHandle,
  disposeHandle,
  getAssetDef,
  getAppearance,
  listBundle,
  loadCatalog,
  normalizeAssetRequest,
  registerOwned,
  registerShared,
  resetCatalog,
  resetOwnership,
  resolvePublicRef,
  sharedSize,
  validateBundle,
} from '../asset-presentation/index.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(js, /function buildHumanoid\(/, 'legacy humanoid builder stays as the AE1 fallback mesh');

for (const file of [
  'asset-presentation/schema.mjs',
  'asset-presentation/catalog.mjs',
  'asset-presentation/handle-contract.mjs',
  'asset-presentation/ownership.mjs',
  'asset-presentation/anchors.mjs',
  'asset-presentation/requests.mjs',
]) {
  const check = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${file}`, import.meta.url))], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr || `${file} syntax failed`);
}

const bundle = JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8'));
assert.deepEqual(validateBundle(bundle), []);
assert.ok(bundle.assets.some(a => a.id === 'character.human.blocky-bighead.v1'));
assert.ok(bundle.assets.some(a => a.id === 'character.human.legacy-capsule.v1'));
assert.ok(bundle.appearances.some(a => a.id === 'appearance.human.player-orange.v1'));
assert.ok(bundle.appearances.some(a => a.id === 'appearance.human.keeper-green.v1'));
assert.equal(bundle.assets.find(a => a.id === 'character.human.blocky-bighead.v1').metrics.headY, 1.44);

resetCatalog();
loadCatalog(bundle);
assert.equal(getAssetDef('character.human.blocky-bighead.v1').id, 'character.human.blocky-bighead.v1');
assert.equal(resolvePublicRef('appearance.human.player-orange.v1').kind, 'appearance');
assert.equal(resolvePublicRef('appearance.human.player-orange.v1').id, 'appearance.human.player-orange.v1');
assert.ok(!JSON.stringify(resolvePublicRef('appearance.human.player-orange.v1')).includes('.png'));
assert.deepEqual(listBundle().assets.includes('character.human.legacy-capsule.v1'), true);
assert.equal(getAppearance('missing'), null);

const handle = createNullHandle({ role: 'player' });
assertAssetHandle(handle);
const throwA = handle.anchor('throwOrigin');
const throwB = handle.anchor('throwOrigin', throwA);
assert.equal(throwA, throwB, 'anchor must reuse the target object');
assert.equal(throwA.y, LEGACY_FALLBACKS.throwOriginY);
handle.play('throw', { duration: GAMEPLAY_LOCKS.throwDuration });
handle.update(0.016, { moving: true });
handle.setAppearance('appearance.human.player-orange.v1');
handle.dispose();
handle.dispose();

resetOwnership();
const shared = registerShared('unit-box', { dispose() { this.dead = true; } });
registerOwned(handle, shared);
const owned = registerOwned(handle, { dispose() { this.dead = true; } });
const result = disposeHandle(handle);
assert.equal(result.disposed, 1);
assert.equal(owned.dead, true);
assert.equal(shared.dead, undefined);
assert.equal(sharedSize(), 1);
disposeHandle(handle);

assert.deepEqual(GAMEPLAY_LOCKS, {
  cameraLookY: 1.10,
  keeperTalkRadius: 3.40,
  projectileDuration: 0.55,
  throwDuration: 0.34,
  skillDuration: 0.28,
  hurtDuration: 0.24,
});
assert.ok(PRESENTATION_ANCHORS.includes('throwOrigin'));
assert.ok(GAMEPLAY_FORBIDDEN_FIELDS.includes('hp'));

assert.throws(() => normalizeAssetRequest({ assetId: 'x' }), /role/);
assert.deepEqual(normalizeAssetRequest({
  assetId: 'character.human.legacy-capsule.v1',
  role: 'player',
  appearanceId: 'appearance.human.player-orange.v1',
}), {
  assetId: 'character.human.legacy-capsule.v1',
  role: 'player',
  appearanceId: 'appearance.human.player-orange.v1',
  quality: 'medium',
});

console.log('V8.0 AE0 contracts: PASS');
