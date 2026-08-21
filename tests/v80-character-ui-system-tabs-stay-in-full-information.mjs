import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

const setter=js.match(/function setManagerTab\(tab='collection'\)\{([\s\S]*?)\n\}/)?.[1]||'';
assert.ok(setter, 'manager tab setter is required');
assert.match(setter, /\['skills','equipment'\]\.includes\(tab\)/, 'Full Character must intercept legacy Skills/Equipment tabs');
assert.match(setter, /characterUI\?\.snapshot\(\)\.characterPanel==='full'/, 'interception applies only in Full Character');
assert.match(setter, /currentManagerTab='collection'/, 'interception must retain the three-column collection layout');
assert.match(setter, /setFullCharacterInfoTab\(tab\)/, 'interception must route legacy tabs into right-side Character Information tabs');
assert.match(setter, /return;/, 'legacy pane activation must stop after tab routing');
console.log('V8.2 Character UI system tabs stay inside Full Information: PASS');
