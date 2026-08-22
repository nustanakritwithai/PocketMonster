import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';

assert.match(html,/data-zone="grass-meadow"/,'Grass Meadow scene route exists');
assert.equal(html,fs.readFileSync(new URL('../v800.html',import.meta.url),'utf8'),'HTML parity remains exact');
const grassStage=js.match(/['"]grass-meadow['"]\s*:\s*\{[\s\S]*?\n  grassland:/)?.[0]||'';
assert.ok(grassStage,'Grass Meadow stage config is bounded before the next zone');
assert.match(grassStage,/sceneStatus:'normal-encounters'/,'Grass Meadow normal encounter stage exists');
assert.match(grassStage,/encounterTableId:'grass-meadow-normal-v1'/,'Grass Meadow encounter table is explicit');
assert.match(grassStage,/balanceProfileId:'grass-meadow-normal-v1'/,'Grass Meadow balance profile is explicit');
assert.match(grassStage,/spawn:\[[\s\S]*mossbun[\s\S]*buglet[\s\S]*normalooze/,'Grass Meadow uses the planned normal species');
assert.doesNotMatch(grassStage,/\{elite:true|\{boss:true/,'Grass Meadow normal stage has no Elite/Boss spawn');
assert.match(js,/function makeStageBeacon\(/,'scene traversal markers exist');
assert.match(js,/bounds=ZONES\[state\.currentZone\]\?\.bounds/,'player bounds are zone-aware');
assert.match(js,/const start=cfg\.playerStart/,'zone player start is data-driven');
assert.match(js,/cfg\.sceneStatus==='blockout'/,'blockout scene has dedicated message');
assert.match(css,/data-zone="grass-meadow"/,'Grass Meadow has scene travel styling');
console.log('V8.3 Scene-first Grass Meadow blockout: PASS');
