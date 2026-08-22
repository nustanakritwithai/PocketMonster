import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync('game-v800.js','utf8');

assert.match(
  js,
  /function bindMobileNpcSheet\(panel,close,dragTarget=panel\?\.querySelector\('\:scope > \*'\)\)/,
  'mobile sheet helper owns its default direct-child drag target',
);
assert.match(
  js,
  /bindMobileNpcSheet\(el\('ranchStoragePage'\),closeRanchSurface,el\('ranchStoragePage'\)\);/,
  'Ranch Storage reuses the mobile sheet helper with its panel as drag target',
);
assert.doesNotMatch(
  js,
  /const ranchStorageSheet=el\('ranchStoragePage'\),ranchStorageHandle=/,
  'Ranch Storage does not retain a duplicate pointer listener implementation',
);

console.log('V8.2 mobile NPC sheet binding reuse: PASS');
