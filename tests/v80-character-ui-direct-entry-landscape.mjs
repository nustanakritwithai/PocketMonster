import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';
function extract(name){const start=js.indexOf(`function ${name}(`);assert.ok(start>=0,`missing ${name}`);const brace=js.indexOf('{',start);let d=0;for(let i=brace;i<js.length;i++){if(js[i]==='{')d++;else if(js[i]==='}'&&!--d)return js.slice(start,i+1);}throw new Error('unclosed');}
assert.match(js,/function requestLandscapeOrientation\(\)/,'shared landscape request helper is required');
assert.match(extract('openCharacterAccess'),/requestLandscapeOrientation\(\)/,'Character tap must request landscape in the user gesture');
assert.match(extract('requestLandscapeOrientation'),/screen\.orientation\?\.lock\?\.\('landscape'\)/,'helper must request landscape lock');
console.log('V8.2 Character UI direct entry requests landscape: PASS');
