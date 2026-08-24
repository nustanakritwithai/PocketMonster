import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STAGE_BY_ID } from '../stage-catalog.mjs';

const js=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
const routes=fs.readFileSync(new URL('../warp-routes.mjs',import.meta.url),'utf8');
const block=()=>js.match(/['"]steel-factory['"]\s*:\s*\{[\s\S]*?(?=\n  ['"][^'"]+['"]\s*:\s*\{)/)?.[0]||'';
const expectGuard=(label,pattern,replace)=>{
  const mutated=block().replace(pattern,replace);
  assert.notEqual(mutated,block(),`${label}: mutation applied`);
  assert.doesNotMatch(mutated,pattern,label);
};
assert.match(block(),/stageId:'steel-factory'/,'Steel Factory stays catalog-linked');
assert.match(block(),/spawn:\[/,'Normal encounters stay present');
assert.match(block(),/eliteSpawn:\[/,'Elite encounters stay present');
assert.match(block(),/bossSpawn:\[/,'Boss encounter stays present');
assert.match(block(),/progressionBossSpeciesId:/,'Boss progression stays deterministic');
assert.equal(STAGE_BY_ID['steel-factory'].capturePolicy,'normal-wild-only','Boss capture policy stays disabled');
assert.match(routes,/from:'shadow-city',to:'steel-factory'/,'forward route stays explicit');
assert.match(routes,/from:'steel-factory',to:'shadow-city'/,'return route stays explicit');
assert.doesNotMatch(block(),/playerData\.hp|status|damage|teleport|fly|jump|conveyor|contact/,'scene remains presentation-only');
expectGuard('mutation 1: missing Normal spawn is rejected',/spawn:\[/,'normalSpawnRemoved:[]');
expectGuard('mutation 2: missing Elite spawn is rejected',/eliteSpawn:\[/,'eliteSpawnRemoved:[]');
expectGuard('mutation 3: missing Boss spawn is rejected',/bossSpawn:\[/,'bossSpawnRemoved:[]');
expectGuard('mutation 4: missing progression Boss is rejected',/progressionBossSpeciesId:/,'progressionBossRemoved:');
const unsafe=`${block()}\nconveyorSpeed=2`;
assert.throws(()=>assert.doesNotMatch(unsafe,/playerData\.hp|status|damage|teleport|fly|jump|conveyor|contact/),'mutation 5: hazard physics is rejected');
console.log('V8 Steel Factory mutation guards: PASS (5/5 killed)');
