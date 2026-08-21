import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeCss as css, activeHtml as html } from './active-assets.mjs';

const versionedHtml = fs.readFileSync(new URL('../v800.html', import.meta.url), 'utf8');
assert.equal(html, versionedHtml, 'index.html and v800.html must remain byte-identical');
assert.match(html, /id="monsterManager"/, 'the existing manager remains the only full-screen surface');
assert.match(html, /class="[^"]*\bcharacter-roster\b[^"]*"/, 'full Character UI needs a left Party / Monster List region');
assert.match(html, /class="[^"]*\bcharacter-preview\b[^"]*"/, 'full Character UI needs a center selected Monster Preview region');
assert.match(html, /class="[^"]*\bcharacter-information\b[^"]*"/, 'full Character UI needs a right Character Information region');
assert.match(html, /class="[^"]*\bcharacter-tabs\b[^"]*"/, 'Character Information needs its own tab container');
assert.match(html, /data-character-layout="three-column"/, 'layout must be explicitly marked for responsive styling');
assert.match(html, /data-character-tab="info"/, 'Info tab must be available');
assert.match(html, /data-character-tab="skills"/, 'Skills tab must be available');
assert.match(html, /data-character-tab="equipment"/, 'Equipment tab must be available');
assert.match(html, /data-character-tab="training"/, 'Training tab must be available');
assert.match(html, /data-character-tab="evolution"/, 'Evolution tab must be available');
assert.doesNotMatch(html, /party:\[null,null,null,null,null,null\]/, 'Party remains exactly three slots');
assert.doesNotMatch(html, /CharacterStore|fullCharacterSelectedId/, 'layout must not introduce a duplicate monster store');
assert.match(css, /\.character-manager-layout\{[^}]*grid-template-columns:.*1fr.*1\.35fr.*1fr/, 'desktop layout must declare left/center/right columns');
assert.match(css, /@media\(max-width:760px\),\(max-height:500px\)/, 'layout must account for mobile/short-landscape');
assert.match(css, /\.character-roster-slot/, 'roster slot styling must be explicit');
assert.match(css, /\.character-preview-empty/, 'empty focused-monster state must be styled');

console.log('V8.2 Character UI Phase 6 three-column layout: PASS');
