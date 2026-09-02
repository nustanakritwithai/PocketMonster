import fs from 'node:fs';
import assert from 'node:assert/strict';
import { APP_VERSION, ASSET_REVISION } from '../save-schema.mjs';
import {
  activeCssName,
  activeCssRef,
  activeEntry,
  activeEntryName,
  activeHtml,
  activeJs,
  activeJsName,
  activeJsRef,
  rootUrl,
} from './active-assets.mjs';

const packageJson = JSON.parse(fs.readFileSync(new URL('package.json', rootUrl), 'utf8'));
assert.equal(packageJson.version, APP_VERSION);
assert.equal(activeEntryName, 'entry-preload-v900.mjs');
assert.equal(activeJsName, 'game-v800.js');
assert.equal(activeCssName, 'style-v800.css');
assert.ok(activeCssRef.endsWith(`?v=${ASSET_REVISION}`));
assert.match(activeHtml, /<title>[^<]*V9(?:\.0)?[^<]*<\/title>/);
assert.match(activeHtml, /entry-preload-v900\.mjs/);
assert.match(activeEntry, /prepareLaunch/);
assert.match(activeEntry, /applyPendingPatch/);
assert.match(activeEntry, /online-world-shell-v900\.mjs\?v=16/);
assert.ok(activeJs.includes(`Monster Life RPG V${APP_VERSION}`));
assert.ok(!activeHtml.includes('game.js'));
assert.ok(!activeHtml.includes('game-v705.js'));
assert.ok(!activeHtml.includes('game-v706.js'));
assert.ok(!activeHtml.includes('game-v707.js'));
assert.ok(!activeHtml.includes('game-v710.js'));
const versionedHtml = fs.readFileSync(new URL('v900.html', rootUrl), 'utf8');
assert.equal(activeHtml, versionedHtml, 'index.html and v900.html must be byte-identical active entries');
console.log('P0 active entry/version regression: PASS');
