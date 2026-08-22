import assert from 'node:assert/strict';
import { activeCss as css, activeJs as js } from './active-assets.mjs';

const dispatch=js.match(/function setFullCharacterInfoTab\(tab\)\{([\s\S]*?)\n\}/)?.[1]||'';
assert.match(dispatch,/if\(tab==='training'\)renderTraining\(el\('characterInfoBody'\)\)/,'Training right tab must pass the right-side body directly');
assert.match(dispatch,/if\(tab==='evolution'\)renderEvolution\(el\('characterInfoBody'\)\)/,'Evolution right tab must pass the right-side body directly');
assert.match(js,/function renderTraining\(targetPanel=null\)/,'Training renderer must accept an explicit panel');
assert.match(js,/function renderEvolution\(targetPanel=null\)/,'Evolution renderer must accept an explicit panel');
const evolution=js.match(/function renderEvolution\(targetPanel=null\)\{([\s\S]*?)\n\}/)?.[1]||'';
assert.match(evolution,/const box=targetPanel\|\|el\('evolutionPreview'\)/,'Evolution must use direct target before legacy fallback');
assert.match(css,/\.manager\.character-manager-mode\s+\.manager-tabs\.character-tabs\{display:none!important\}/,'Full Character mode must hide upper manager tabs');
console.log('V8.2 Character UI Training/Evolution right tabs and top-tab removal: PASS');
