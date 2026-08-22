import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';

assert.match(html,/data-zone="grass-meadow"/,'Grass Meadow scene route exists');
assert.equal(html,fs.readFileSync(new URL('../v800.html',import.meta.url),'utf8'),'HTML parity remains exact');
assert.match(js,/['"]grass-meadow['"]\s*:\s*\{[\s\S]{0,320}sceneStatus:'blockout'/,'Grass Meadow is a blockout scene');
assert.match(js,/['"]grass-meadow['"]\s*:\s*\{[\s\S]{0,320}spawn:\[\]/,'Grass Meadow has no monsters before scene gate');
assert.match(js,/function makeStageBeacon\(/,'scene traversal markers exist');
assert.match(js,/bounds=ZONES\[state\.currentZone\]\?\.bounds/,'player bounds are zone-aware');
assert.match(js,/const start=cfg\.playerStart/,'zone player start is data-driven');
assert.match(js,/cfg\.sceneStatus==='blockout'/,'blockout scene has dedicated message');
assert.match(css,/data-zone="grass-meadow"/,'Grass Meadow has scene travel styling');
console.log('V8.3 Scene-first Grass Meadow blockout: PASS');
