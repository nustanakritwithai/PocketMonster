import assert from 'node:assert/strict';
import { STAGE_BY_ID } from '../stage-catalog.mjs';
import { activeJs as js } from './active-assets.mjs';

const block=()=>js.match(/['"]rocky-canyon['"]\s*:\s*\{[\s\S]*?(?=\n  ['"]frozen-pass['"]\s*:)/)?.[0]||'';
const validate=(source,catalog=STAGE_BY_ID['rocky-canyon'])=>{
  assert.match(source,/stageId:'rocky-canyon'/,'zone must remain catalog-linked');
  assert.match(source,/spawn:\[/,'zone must keep Normal encounters');
  assert.match(source,/eliteSpawn:\[/,'zone must keep Elite encounters');
  assert.match(source,/bossSpawn:\[/,'zone must keep Boss encounters');
  assert.match(source,/progressionBossSpeciesId:/,'zone must keep deterministic Boss progression');
  assert.equal(catalog.capturePolicy,'normal-wild-only','Boss capture policy remains central and disabled');
  assert.doesNotMatch(source,/playerData\.hp|status|damage/,'Rocky scene remains presentation-only');
};
validate(block());
for(const [label,mutate] of [
  ['removed Normal spawn',source=>source.replace(/spawn:\[/,'spawnRemoved: [')],
  ['removed Elite spawn',source=>source.replace(/eliteSpawn:\[/,'eliteRemoved: [')],
  ['removed Boss spawn',source=>source.replace(/bossSpawn:\[/,'bossRemoved: [')],
  ['added terrain damage',source=>`${source} playerData.hp-=1`],
]){
  assert.throws(()=>validate(mutate(block())),/zone|Normal|Elite|Boss|presentation|capture/,`${label} is rejected`);
}
assert.throws(()=>validate(block(),{...STAGE_BY_ID['rocky-canyon'],capturePolicy:'boss'}),/capture policy/,'Capturable Boss mutation is rejected');
console.log('V8 Rocky Canyon mutation guards: PASS (5/5 killed)');
