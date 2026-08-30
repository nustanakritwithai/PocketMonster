import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';

assert.equal(html,fs.readFileSync(new URL('../v900.html',import.meta.url),'utf8'),'active V9 HTML parity remains exact');
const grassStage=js.match(/['"]grass-meadow['"]\s*:\s*\{[\s\S]*?\n  grassland:/)?.[0]||'';
assert.match(grassStage,/eliteSpawn:/,'Grass Meadow Elite spawn pool exists');
assert.match(grassStage,/eliteChance:\.18/,'Elite chance is explicit');
assert.match(grassStage,/eliteEncounterTableId:'grass-meadow-elite-v1'/,'Elite encounter table is explicit');
assert.match(js,/function currentStageObjective\(zoneId=state\.currentZone\)[\s\S]*?starterJourney:state\.starterJourney/,'Elite gating delegates Starter Journey state to the shared objective resolver');
assert.match(js,/objective\.encounter!=='elite'&&cfg\.rareSpawn\?\.length/,'Required Elite suppresses a competing Rare spawn');
assert.match(js,/function markEliteProgress\(/,'Elite progress handler exists');
assert.match(js,/eliteProgress:\{found:\{\},defeated:\{\},captured:\{\}\}/,'Elite progress state is persisted');
assert.match(js,/if\(w\.elite\)markEliteProgress\(w,'defeated'\)/,'Elite defeat is recorded');
assert.match(css,/world-monster-label\.elite/,'Elite label styling remains available');
console.log('V8.3 Grass Meadow Elite Spawn: PASS');
