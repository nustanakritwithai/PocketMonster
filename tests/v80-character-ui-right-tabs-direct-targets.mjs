import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';
const dispatcher=js.match(/function setFullCharacterInfoTab\(tab\)\{([\s\S]*?)\n\}/)?.[1]||'';
assert.match(dispatcher,/if\(tab==='skills'\)renderSkills\(el\('characterInfoBody'\)\)/,'Skills right tab must pass its body directly to the renderer');
assert.match(dispatcher,/if\(tab==='equipment'\)renderEquipment\(el\('characterInfoBody'\)\)/,'Equipment right tab must pass its body directly to the renderer');
assert.match(js,/function renderSkills\(targetPanel=null\)/,'Skills renderer must accept an explicit target');
assert.match(js,/function renderEquipment\(targetPanel=null\)/,'Equipment renderer must accept an explicit target');
console.log('V8.2 Character UI right tabs have direct renderer targets: PASS');
