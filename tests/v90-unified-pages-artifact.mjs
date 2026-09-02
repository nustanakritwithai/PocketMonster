import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUIRED_V9_ENTRY_FILES,
  collectPublicDependencyClosure,
} from '../scripts/build-github-pages.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'dist-pages');
const manifest = JSON.parse(fs.readFileSync(path.join(output, 'patch-manifest.json'), 'utf8'));
const closure = collectPublicDependencyClosure(root);
const required = new Set([
  ...REQUIRED_V9_ENTRY_FILES,
  'entry-preload-v900.mjs',
  'online-world-bridge-v900.mjs',
  'online-world-shell-v900.mjs',
  'combat-v91-entry.mjs',
  'combat-v91-transport.mjs',
  'combat-v91.css',
  'scene-entry-v900.mjs',
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
  'pirate-fruit-offline/assets/index-C3SJLfq8.js',
  'pirate-fruit-offline/assets/vendor-three-Bv6LZXUZ.js',
  'assets/catalog/humanoid-core.json',
]);

for (const relative of required) assert.ok(closure.has(relative), `${relative} must be reachable from a shipped V9 entry`);

const manifestFiles = new Map(manifest.files.map(item => [item.path, item]));
for (const relative of closure) {
  const entry = manifestFiles.get(relative);
  assert.ok(entry, `${relative} must ship in the Pages manifest`);
  const source = fs.readFileSync(path.join(root, relative));
  const built = fs.readFileSync(path.join(output, relative));
  assert.equal(crypto.createHash('sha256').update(built).digest('hex'), entry.sha256, `${relative} built hash must match manifest`);
  assert.equal(Buffer.compare(source, built), 0, `${relative} built bytes must match source`);
}

const index = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
const versionedEntry = fs.readFileSync(path.join(output, 'v900.html'), 'utf8');
assert.match(index, /entry-preload-v900\.mjs\?v=927/);
assert.match(index, /style-v900\.css\?v=925/);
const scene = fs.readFileSync(path.join(output, 'scene-v900.html'), 'utf8');
assert.match(scene, /style-v900\.css\?v=925/, 'scene entry loads the same HUD stylesheet revision as the parent');
assert.doesNotMatch(scene, /style-v900\.css\?v=913/, 'scene cannot mix a stale V9 stylesheet');
assert.match(index, /id="pirateUnifiedControls"[\s\S]*id="captureBtn"[^>]*tc-attack/);
assert.equal(versionedEntry, index, 'index.html and v900.html must boot the same unified V9 shell');
const runtimeConfig = JSON.parse(fs.readFileSync(path.join(output, 'runtime-config.json'), 'utf8'));
assert.equal(runtimeConfig.featureFlags.launchTicket, true, 'public V9 artifact requires the one Monster Life launch session');
for (const flag of ['vpsWrites', 'playerDataWrites', 'firebaseFallback']) {
  assert.equal(runtimeConfig.featureFlags[flag], false, `${flag} must stay disabled in the public artifact`);
}
console.log('V9 unified Pages artifact: PASS');
