import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';

assert.equal(html,fs.readFileSync(new URL('../v800.html',import.meta.url),'utf8'),'HTML parity remains exact');
const storm=js.match(/["']storm-field["']\s*:\s*\{[\s\S]*?\n  grassland:/)?.[0]||'';
assert.match(storm,/primaryTypes:\['Electric'\]/,'Storm Field primary type is Electric');
assert.match(storm,/secondaryTypes:\['Flying','Steel'\]/,'Storm Field secondary types are explicit');
assert.match(storm,/encounterTableId:'encounter-storm-field-v1'/,'Normal encounter profile is explicit');
assert.match(storm,/eliteEncounterTableId:'elite-storm-field-v1'/,'Elite encounter profile is explicit');
assert.match(storm,/bossEncounterTableId:'boss-storm-field-v1'/,'Boss encounter profile is explicit');
assert.match(storm,/voltkit[\s\S]*galebird[\s\S]*ironbug/,'Storm Field uses Electric/Flying/Steel species');
assert.match(storm,/eliteSpawn:/,'Storm Field Elite pool exists');
assert.match(storm,/bossSpawn:/,'Storm Field Boss pool exists');
assert.match(storm,/progressionBossSpeciesId:'voltkit'/,'Storm Field Boss progression is explicit');
assert.match(js,/zone==='storm-field'\?'storm'/,'Storm Field has a distinct ground profile');
assert.match(js,/stageId==='storm-field'\?\{captureBalls:5,trainingChow:2,mineralBite:1\}/,'Storm Field reward profile is explicit');
assert.match(css,/stage-reward/,'Stage reward presentation remains available');
console.log('V8 Storm Field: PASS');
