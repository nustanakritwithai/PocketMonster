import fs from 'node:fs';
import assert from 'node:assert/strict';
import { APP_VERSION, ASSET_REVISION } from '../save-schema.mjs';
import {
  GAME_API_COMPAT_VERSION,
  PRODUCT_RELEASE_VERSION,
  VERSION_DEBT,
} from '../version-manifest.mjs';
import {
  activeCssName,
  activeCssRef,
  activeEntry,
  activeEntryName,
  activeEntryRef,
  activeHtml,
  activeJs,
  activeJsName,
  rootUrl,
} from './active-assets.mjs';

const packageJson = JSON.parse(fs.readFileSync(new URL('package.json', rootUrl), 'utf8'));
const productMajor = PRODUCT_RELEASE_VERSION.split('.')[0];

// Package/save compatibility still follows the legacy gameplay runtime during
// consolidation. The public shell release is a separate version domain.
assert.equal(APP_VERSION, GAME_API_COMPAT_VERSION);
assert.equal(packageJson.version, GAME_API_COMPAT_VERSION);

// Test contracts should verify capabilities, not freeze generation-specific
// filenames into the architecture. The current legacy names are documented in
// VERSION_DEBT and may be retired without rewriting this test.
assert.match(activeEntryName, /\.(?:m?js)$/);
assert.match(activeJsName, /\.js$/);
assert.match(activeCssName, /\.css$/);
assert.ok(activeHtml.includes(activeEntryRef));
assert.ok(activeCssRef.endsWith(`?v=${ASSET_REVISION}`));
assert.match(activeHtml, new RegExp(`<title>[^<]*V${productMajor}(?:\\.0)?[^<]*<\\/title>`));
assert.match(activeEntry, /prepareLaunch/);
assert.match(activeEntry, /applyPendingPatch/);
assert.ok(activeJs.includes(`Monster Life RPG V${GAME_API_COMPAT_VERSION}`));

// Keep the migration debt explicit without requiring production to keep using
// these paths forever.
assert.equal(VERSION_DEBT.legacyGameplayRuntime, 'game-v800.js');
assert.equal(VERSION_DEBT.duplicateVersionedEntry, 'v900.html');

// Very old pre-V8 entries must not re-enter the active HTML dependency graph.
assert.ok(!activeHtml.includes('game-v705.js'));
assert.ok(!activeHtml.includes('game-v706.js'));
assert.ok(!activeHtml.includes('game-v707.js'));
assert.ok(!activeHtml.includes('game-v710.js'));
console.log('P0 active entry/version regression: PASS');
