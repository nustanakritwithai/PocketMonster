import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

const resolver=js.match(/function liveFullCharacterTabPanel\(tab\)\{([\s\S]*?)\n\}/)?.[1]||'';
assert.ok(resolver, 'Full Character tab resolver is required');
assert.doesNotMatch(resolver, /characterPanel!=='full'/, 'right-side tab routing must not depend on navigation source state');
assert.match(resolver, /collectionPane\?\.classList\.contains\('active'\)/, 'resolver must require the visible three-column collection layout');
const binding=js.match(/document\.querySelectorAll\('\.character-info-tab'\)\.forEach\(btn=>\{([\s\S]*?)\n\}\);/)?.[1]||'';
assert.match(binding, /btn\.onclick=/, 'right-side tab buttons require a direct native click binding');
assert.match(binding, /setFullCharacterInfoTab\(btn\.dataset\.characterTab\)/, 'native click must render its own tab content');
console.log('V8.2 Character UI right tabs use source-independent native routing: PASS');
