import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';

assert.equal(html,fs.readFileSync(new URL('../v900.html',import.meta.url),'utf8'),'HTML parity remains exact');
const lake=js.match(/["']misty-lake["']\s*:\s*\{[\s\S]*?\n  grassland:/)?.[0]||'';
assert.match(lake,/primaryTypes:\['Water'\]/,'Misty Lake primary type is Water');
assert.match(lake,/secondaryTypes:\['Grass','Flying'\]/,'Misty Lake secondary types are explicit');
assert.match(lake,/encounterTableId:'encounter-misty-lake-v1'/,'Normal encounter profile is explicit');
assert.match(lake,/eliteEncounterTableId:'elite-misty-lake-v1'/,'Elite encounter profile is explicit');
assert.match(lake,/bossEncounterTableId:'boss-misty-lake-v1'/,'Boss encounter profile is explicit');
assert.match(lake,/aquapuff[\s\S]*mossbun[\s\S]*galebird/,'Misty Lake uses Water/Grass/Flying species');
assert.match(lake,/eliteSpawn:/,'Misty Lake Elite pool exists');
assert.match(lake,/bossSpawn:/,'Misty Lake Boss pool exists');
assert.match(lake,/progressionBossSpeciesId:'aquapuff'/,'Misty Lake Boss progression is explicit');
assert.match(js,/zone==='misty-lake'\?'lake'/,'Misty Lake has a distinct ground profile');
assert.match(js,/stageId==='misty-lake'\?\{captureBalls:5,healthy:2,moonFruit:1\}/,'Misty Lake reward profile is explicit');
assert.match(css,/stage-reward/,'Stage reward presentation remains available');
console.log('V8 Misty Lake: PASS');
