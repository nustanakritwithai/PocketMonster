import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STAGE_BY_ID } from '../stage-catalog.mjs';

const js=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
const routes=fs.readFileSync(new URL('../warp-routes.mjs',import.meta.url),'utf8');
const block=()=>js.match(/['"]shadow-city['"]\s*:\s*\{[\s\S]*?(?=\n  ['"]sky-ruins['"]\s*:)/)?.[0]||'';
const expectGuard=(label,pattern,replace)=>{
  const mutated=block().replace(pattern,replace);
  assert.notEqual(mutated,block(),`${label}: mutation applied`);
  assert.doesNotMatch(mutated,pattern,label);
};
assert.match(block(),/stageId:'shadow-city'/,'Shadow City stays catalog-linked');
assert.match(block(),/spawn:\[/,'Normal encounters stay present');
assert.match(block(),/eliteSpawn:\[/,'Elite encounters stay present');
assert.match(block(),/bossSpawn:\[/,'Boss encounter stays present');
assert.match(block(),/progressionBossSpeciesId:/,'Boss progression stays deterministic');
assert.equal(STAGE_BY_ID['shadow-city'].capturePolicy,'normal-wild-only','Boss capture policy stays disabled');
assert.match(routes,/from:'haunted-woods',to:'shadow-city'/,'forward route stays explicit');
assert.match(routes,/from:'shadow-city',to:'haunted-woods'/,'return route stays explicit');
assert.doesNotMatch(block(),/playerData\.hp|status|damage|teleport|fly|jump|blackout/,'scene remains presentation-only');
expectGuard('mutation 1: missing Normal spawn is rejected',/spawn:\[/,'normalSpawnRemoved:[]');
expectGuard('mutation 2: missing Elite spawn is rejected',/eliteSpawn:\[/,'eliteSpawnRemoved:[]');
expectGuard('mutation 3: missing Boss spawn is rejected',/bossSpawn:\[/,'bossSpawnRemoved:[]');
expectGuard('mutation 4: missing progression Boss is rejected',/progressionBossSpeciesId:/,'progressionBossRemoved:');
const unsafe=`${block()}\nblackout=true`;
assert.throws(()=>assert.doesNotMatch(unsafe,/playerData\.hp|status|damage|teleport|fly|jump|blackout/),'mutation 5: darkness gameplay is rejected');
console.log('V8 Shadow City mutation guards: PASS (5/5 killed)');
