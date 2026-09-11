import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES_LIVE_SMOKE_FILES } from '../scripts/verify-live-v9-deployment.mjs';
import {
  REQUIRED_V9_ENTRY_FILES,
  collectPublicDependencyClosure,
} from '../scripts/build-github-pages.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'dist-pages');
const manifest = JSON.parse(fs.readFileSync(path.join(output, 'patch-manifest.json'), 'utf8'));
const closure = collectPublicDependencyClosure(root);
const pirateBootstrap = fs.readFileSync(path.join(root, 'pirate-fruit-offline/pocket-bootstrap.mjs'), 'utf8');
const pirateEntryMatch = pirateBootstrap.match(/import\('\.\/assets\/([^']+\.js)'\)/);
assert.ok(pirateEntryMatch, 'Pirate bootstrap must declare its compiled entry asset');
const pirateEntryAsset = `pirate-fruit-offline/assets/${pirateEntryMatch[1]}`;
const activePirateAsset = (relative) => {
  if (!relative.startsWith('pirate-fruit-offline/assets/')) return relative;
  const filename = relative.slice('pirate-fruit-offline/assets/'.length);
  const stem = filename.replace(/-[^-]+\.js$/, '');
  return [...closure].find((candidate) => candidate.startsWith(`pirate-fruit-offline/assets/${stem}-`) && candidate.endsWith('.js')) ?? relative;
};
const required = new Set([
  ...REQUIRED_V9_ENTRY_FILES,
  'entry-preload-v900.mjs',
  'persistent-minimap-owner-v900.mjs',
  'unified-minimap-mobile-v900.css',
  'online-world-bridge-v900.mjs',
  'online-world-shell-v900.mjs',
  'combat-v91-entry.mjs',
  'combat-v91-transport.mjs',
  'combat-v91.css',
  'scene-entry-v900.mjs',
  'scene-release-cache-v1.mjs',
  'pocket-offline-npc-menu-bridge-v900.mjs',
  'style-v900.css',
  'unified-mmorpg-hud-v900.mjs',
  'worlds-v900.mjs',
  'unified-mobile-controls-v900.mjs',
  'mobile-dual-pointer-input-v900.mjs',
  'chat-runtime.mjs',
  'combined-worlds-v900.mjs',
  'game-v800.js',
  'boot-pirate-fruit-v900.mjs',
  'world-living-v900.mjs',
  'pirate-fruit-offline/index.html',
  pirateEntryAsset,
  'pirate-fruit-offline/assets/vendor-three-RYo9rfeI.js',
  'assets/catalog/humanoid-core.json',
]);

for (const relative of required) assert.ok(closure.has(relative), `${relative} must be reachable from a shipped V9 entry`);

const runtimeConfig = JSON.parse(fs.readFileSync(path.join(output, 'runtime-config.json'), 'utf8'));
const release = String(runtimeConfig.deployedRelease || '').trim();
const encodedRelease = encodeURIComponent(release);
assert.ok(release, 'public V9 artifact must expose deployedRelease');

const manifestFiles = new Map(manifest.files.map(item => [item.path, item]));
for (const relative of PAGES_LIVE_SMOKE_FILES.map(activePirateAsset)) {
  assert.ok(manifestFiles.has(relative), `รายการตรวจ live ต้องอยู่ใน manifest ก่อนเผยแพร่: ${relative}`);
}
assert.equal(manifestFiles.size, closure.size, 'patch manifest must not force-download public compatibility files outside the active V9 closure');
assert.deepEqual([...manifestFiles.keys()].sort(), [...closure].sort(), 'patch manifest must equal the active V9 dependency closure exactly');
for (const relative of closure) {
  const manifestEntry = manifestFiles.get(relative);
  assert.ok(manifestEntry, `${relative} must ship in the Pages manifest`);
  const source = fs.readFileSync(path.join(root, relative));
  const built = fs.readFileSync(path.join(output, relative));
  assert.equal(crypto.createHash('sha256').update(built).digest('hex'), manifestEntry.sha256, `${relative} built hash must match manifest`);
  if (relative === 'index.html' || relative === 'v900.html') {
    const normalizedBuilt = built.toString('utf8').replace(
      /entry-preload-v900\.mjs\?release=[^'"\s>]+/,
      'entry-preload-v900.mjs?v=972',
    );
    assert.equal(normalizedBuilt, source.toString('utf8'), `${relative} may differ from source only by the release-bound entry cache key`);
  } else {
    assert.equal(Buffer.compare(source, built), 0, `${relative} built bytes must match source`);
  }
}

const index = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
const versionedEntry = fs.readFileSync(path.join(output, 'v900.html'), 'utf8');
assert.match(index, new RegExp(`entry-preload-v900\\.mjs\\?release=${encodedRelease.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  'published entry must bind the preload module to deployedRelease');
assert.doesNotMatch(index, /entry-preload-v900\.mjs\?v=972/,
  'published entry must not reuse the source-level cache key across releases');
assert.match(index, /style-v900\.css\?v=969/);
const entry = fs.readFileSync(path.join(output, 'entry-preload-v900.mjs'), 'utf8');
assert.match(entry, /persistent-minimap-owner-v900\.mjs\?v=2/, 'V9 entry cache-busts the restored raster/near-far minimap owner');
assert.match(entry, /installReleaseBoundSceneFrames/, 'V9 entry installs release binding before online shell boot');
const scene = fs.readFileSync(path.join(output, 'scene-v900.html'), 'utf8');
assert.match(scene, /style-v900\.css\?v=969/, 'scene entry loads the same HUD stylesheet revision as the parent');
assert.doesNotMatch(scene, /npc-overhead-action-v900\.mjs/, 'Pirate scenes must not activate the replaced outer NPC action owner');
assert.doesNotMatch(scene, /style-v900\.css\?v=913/, 'scene cannot mix a stale V9 stylesheet');
assert.match(index, /id="pirateUnifiedControls"[\s\S]*id="captureBtn"[^>]*tc-attack/);
assert.equal(versionedEntry, index, 'index.html and v900.html must boot the same unified V9 shell');

assert.equal(runtimeConfig.featureFlags.launchTicket, true, 'public V9 artifact requires the one Monster Life launch session');
for (const flag of ['vpsWrites', 'playerDataWrites', 'firebaseFallback']) {
  assert.equal(runtimeConfig.featureFlags[flag], false, `${flag} must stay disabled in the public artifact`);
}
console.log('V9 unified Pages artifact: PASS');
