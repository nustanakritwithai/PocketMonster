import assert from 'node:assert/strict';
import { activeCss as css } from './active-assets.mjs';
for(const property of ['pointer-events:auto!important','touch-action:manipulation','position:relative','z-index:12']) assert.ok(css.includes(`.character-info-tab{pointer-events:auto!important;touch-action:manipulation;position:relative;z-index:12`) && css.includes(property), `right tab hit target requires ${property}`);
console.log('V8.2 Character UI right tab touch hit target: PASS');
