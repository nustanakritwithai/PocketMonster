// V8.0 Asset Engine Phase 1 — loader, cache, fallback, empty manifest.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  CACHE_LIMITS,
  MANIFEST_CATEGORIES,
  bindFetch,
  bindThree,
  clearCache,
  emptyManifest,
  getCacheStats,
  getCachedModel,
  getManifest,
  hasAsset,
  loadAudio,
  loadFont,
  loadManifest,
  loadModel,
  loadTexture,
  playAudio,
  resetEngine,
  resolveAssetPath,
  resolveMonsterModel,
  resolvePortrait,
  stopAudio,
} from '../asset-engine.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8'));

const syntax = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('../asset-engine.mjs', import.meta.url))], {
  encoding: 'utf8',
});
assert.equal(syntax.status, 0, syntax.stderr || 'asset-engine.mjs syntax failed');

assert.equal(CACHE_LIMITS.models, 20, 'GLB LRU limit is 20');
assert.equal(CACHE_LIMITS.textures, 50, 'texture LRU limit is 50');
assert.deepEqual([...MANIFEST_CATEGORIES], ['models', 'textures', 'audio', 'portraits', 'fonts', 'icons', 'vfx']);

assert.equal(manifest.version, '1.0.0');
assert.equal(manifest.generator, 'Monster Life RPG Asset Engine');
for (const category of MANIFEST_CATEGORIES) {
  assert.ok(manifest.entries[category] && typeof manifest.entries[category] === 'object', `manifest missing ${category}`);
  assert.equal(Object.keys(manifest.entries[category]).length, 0, `phase 1 ${category} entries must stay empty`);
}

assert.match(js, /from '\.\/asset-engine\.mjs'/, 'game-v800.js must import the asset engine');
assert.match(js, /bindThree\(THREE\)/, 'startup must inject the loaded Three.js instance');
assert.match(js, /loadManifest\(\)/, 'startup must read the asset manifest');
assert.match(js, /function makeSpeciesMesh\(/, 'procedural mesh fallback must stay');
assert.doesNotMatch(js, /resolveMonsterModel\(/, 'phase 1 must not swap meshes — no visual change');
assert.doesNotMatch(js, /resolvePortrait\(/, 'phase 1 must not wire portraits yet');

resetEngine();
bindThree(null);
bindFetch(async () => {
  throw new Error('network down');
});
const fallback = await loadManifest('./missing.json');
assert.equal(fallback.version, '1.0.0');
for (const category of MANIFEST_CATEGORIES) {
  assert.deepEqual(fallback.entries[category], {});
}
assert.equal(getManifest(), fallback);
assert.equal(hasAsset('models', 'normalooze'), false);
assert.equal(resolveAssetPath('models', 'normalooze', 'procedural'), 'procedural');
assert.equal(await resolveMonsterModel('flameling', 'flame_wolf'), null);
assert.equal(resolvePortrait('flameling'), null);
assert.equal(await loadTexture('./missing.webp'), null);
assert.equal(await loadAudio('./missing.ogg'), null);
assert.equal(await loadFont('noto-sans-thai', './missing.woff2'), false);
assert.equal(playAudio('./missing.ogg'), false);
assert.doesNotThrow(() => stopAudio('./missing.ogg'));
assert.deepEqual(getCacheStats(), { models: 0, textures: 0, audio: 0, fonts: 0 });

resetEngine();
bindFetch(async () => ({
  ok: true,
  json: async () => ({
    version: '1.0.0',
    entries: {
      models: { flame_wolf: { url: './assets/models/monsters/flame_wolf.glb' } },
      portraits: { flameling: { url: './assets/portraits/flameling.webp' } },
    },
  }),
}));
const loaded = await loadManifest();
assert.equal(hasAsset('models', 'flame_wolf'), true);
assert.equal(resolveAssetPath('models', 'flame_wolf'), './assets/models/monsters/flame_wolf.glb');
assert.equal(resolvePortrait('flameling'), './assets/portraits/flameling.webp');
assert.equal(hasAsset('textures', 'ground_grass'), false);
assert.deepEqual(loaded.entries.textures, {});

assert.equal(await resolveMonsterModel('flameling', 'flame_wolf', async () => null), null, 'missing GLB must fall back to null');

const fakeGltf = id => ({
  scene: {
    id,
    clone(deep) {
      return { id, cloned: true, deep: !!deep };
    },
    traverse() {},
  },
});

for (let i = 0; i < 21; i++) {
  const gltf = await loadModel(`model-${i}`, async () => fakeGltf(i));
  assert.ok(gltf, `model-${i} should cache`);
}
assert.equal(getCacheStats().models, 20);
assert.equal(getCachedModel('model-0'), null, 'oldest model is evicted');
assert.ok(getCachedModel('model-20'), 'newest model stays');
assert.ok(getCachedModel('model-1'), 'model-1 remains after first eviction');

await loadModel('./assets/models/monsters/flame_wolf.glb', async () => fakeGltf('wolf'));
const resolved = await resolveMonsterModel('flameling', 'flame_wolf');
assert.deepEqual(resolved, { id: 'wolf', cloned: true, deep: true });

let disposed = 0;
await loadTexture('tex-keep', async () => ({ dispose() { disposed++; } }));
for (let i = 0; i < 50; i++) {
  await loadTexture(`tex-${i}`, async () => ({ dispose() { disposed++; } }));
}
assert.equal(getCacheStats().textures, 50);
assert.ok(disposed >= 1, 'texture LRU must dispose evicted maps');

clearCache('models');
assert.equal(getCacheStats().models, 0);
assert.equal(getCacheStats().textures, 50);
clearCache();
assert.deepEqual(getCacheStats(), { models: 0, textures: 0, audio: 0, fonts: 0 });

const empty = emptyManifest();
assert.equal(Object.keys(empty.entries.models).length, 0);

resetEngine();
bindFetch(null);
bindThree(null);

console.log('V8.0 asset engine phase 1: PASS');
