import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';

assert.equal(html,fs.readFileSync(new URL('../v800.html',import.meta.url),'utf8'),'HTML parity remains exact');
const grassStage=js.match(/['"]grass-meadow['"]\s*:\s*\{[\s\S]*?\n  grassland:/)?.[0]||'';
assert.match(grassStage,/rareSpawn:/,'Grass Meadow rare spawn pool exists');
assert.match(grassStage,/rareChance:BALANCE\.grassMeadowRare\.chance/,'Rare chance is config-driven');
assert.match(grassStage,/rareEncounterTableId:'grass-meadow-rare-v1'/,'Rare encounter table is explicit');
assert.match(js,/function markRareDiscovery\(/,'Rare collection progress handler exists');
assert.match(js,/rareCollection:\{found:\{\},captured:\{\}\}/,'Rare collection state is persisted');
assert.match(js,/w\.rare\?'✦ RARE '/,'World label marks Rare');
assert.match(js,/function wildRespawnDelay\(w\)\{if\(state\.currentZone==='grass-meadow'&&w\.rare\)/,'Rare respawn uses separate cooldown');
assert.match(css,/world-monster-label\.rare/,'Rare label has visual treatment');
console.log('V8.3 Grass Meadow Rare Spawn: PASS');
