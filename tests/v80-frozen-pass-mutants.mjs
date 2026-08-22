import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STAGE_BY_ID } from '../stage-catalog.mjs';
import { activeJs as js } from './active-assets.mjs';

const block=()=>js.match(/['"]frozen-pass['"]\s*:\s*\{[\s\S]*?\n  grassland:/)?.[0]||'';
const validate=(source,catalog=STAGE_BY_ID['frozen-pass'])=>{
  assert.match(source,/stageId:'frozen-pass'/,'zone must remain catalog-linked');
  assert.match(source,/spawn:\[/,'zone must keep Normal encounters');
  assert.match(source,/eliteSpawn:\[/,'zone must keep Elite encounters');
  assert.match(source,/bossSpawn:\[/,'zone must keep Boss encounters');
  assert.match(source,/progressionBossSpeciesId:/,'zone must keep deterministic Boss progression');
  assert.equal(catalog.capturePolicy,'normal-wild-only','Boss capture policy remains central and disabled');
  assert.doesNotMatch(source,/playerData\.hp|status|damage/,'Frozen scene remains presentation-only');
};
validate(block());
for(const [label,mutate] of [
  ['removed Normal spawn',source=>source.replace(/spawn:\[/,'spawnRemoved: [')],
  ['removed Elite spawn',source=>source.replace(/eliteSpawn:\[/,'eliteRemoved: [')],
  ['removed Boss spawn',source=>source.replace(/bossSpawn:\[/,'bossRemoved: [')],
  ['added environment damage',source=>`${source} playerData.hp-=1`],
]){
  assert.throws(()=>validate(mutate(block())),/zone|Normal|Elite|Boss|presentation|capture/,`${label} is rejected`);
}
assert.throws(()=>validate(block(),{...STAGE_BY_ID['frozen-pass'],capturePolicy:'boss'}),/capture policy/,'Capturable Boss mutation is rejected');
console.log('V8 Frozen Pass mutation guards: PASS (5/5 killed)');
