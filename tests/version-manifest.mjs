import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  COMBINED_RUNTIME_VERSION,
  GAME_API_COMPAT_VERSION,
  LEGACY_ASSET_REVISION,
  LEGACY_GAMEPLAY_RUNTIME_VERSION,
  PRODUCT_RELEASE_VERSION,
  VERSION_DEBT,
  VERSION_POLICY,
} from '../version-manifest.mjs';
import { APP_VERSION, ASSET_REVISION } from '../save-schema.mjs';
import { COMBINED_VERSION } from '../combined-worlds-v900.mjs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

assert.match(PRODUCT_RELEASE_VERSION, /^\d+\.\d+\.\d+$/);
assert.match(GAME_API_COMPAT_VERSION, /^\d+\.\d+\.\d+$/);
assert.equal(GAME_API_COMPAT_VERSION, LEGACY_GAMEPLAY_RUNTIME_VERSION);
assert.equal(APP_VERSION, LEGACY_GAMEPLAY_RUNTIME_VERSION);
assert.equal(ASSET_REVISION, LEGACY_ASSET_REVISION);
assert.equal(COMBINED_VERSION, COMBINED_RUNTIME_VERSION);
assert.equal(VERSION_POLICY.rule, 'version-is-metadata-not-runtime-filename');

for (const [key, value] of Object.entries(VERSION_DEBT)) {
  assert.equal(typeof value, 'string', `VERSION_DEBT.${key} must be a path string`);
  assert.ok(value.length > 0, `VERSION_DEBT.${key} must not be empty`);
}

for (const path of ['patch-updater.mjs', 'launch-bootstrap.mjs', 'server-sync.mjs', 'save-schema.mjs', 'combined-worlds-v900.mjs']) {
  const source = read(path);
  assert.match(source, /version-manifest\.mjs/, `${path} must use the canonical version manifest`);
  assert.doesNotMatch(source, /['"]8\.4\.0['"]/, `${path} must not hard-code the compatibility version`);
}

const combined = read('combined-worlds-v900.mjs');
if (combined.includes(VERSION_DEBT.legacyGameplayRuntime)) {
  assert.equal(VERSION_DEBT.legacyGameplayRuntime, 'game-v800.js', 'legacy runtime debt must remain explicitly classified');
}

console.log('Version manifest/domain guard: PASS');
