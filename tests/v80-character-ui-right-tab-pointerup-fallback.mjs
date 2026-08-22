import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';
assert.match(js,/el\('monsterManager'\)\?\.addEventListener\('pointerup'/,'manager must capture right-tab pointerup');
assert.match(js,/event\.target\.closest\?\.\('\.character-info-tab'\)/,'pointerup must identify the right tab');
assert.match(js,/setFullCharacterInfoTab\(tab\.dataset\.characterTab\)/,'pointerup must route the selected right tab');
console.log('V8.2 Character UI right tab pointerup fallback: PASS');
