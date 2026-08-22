import assert from 'node:assert/strict';
import { BALANCE_CONFIG, WORKBOOK_GROWTH_ADAPTER } from '../balance-config.mjs';
import { calculateWorkbookGrowthPreview } from '../balance-formulas.mjs';

assert.equal(BALANCE_CONFIG.level.cap,50,'live level cap remains unchanged');
assert.equal(WORKBOOK_GROWTH_ADAPTER.sourceLevel.cap,60,'workbook cap is retained only in the preview adapter');
assert.equal(WORKBOOK_GROWTH_ADAPTER.activation,'calculator_only');
assert.deepEqual(WORKBOOK_GROWTH_ADAPTER.activeRuntimeStats,['hp','atk','def','spd']);
assert.deepEqual(WORKBOOK_GROWTH_ADAPTER.deferredRuntimeStats,['spAtk','spDef']);
assert.equal(Object.isFrozen(WORKBOOK_GROWTH_ADAPTER),true);

const input={stat:'hp',baseStat:80,level:1,potential:15,training:0};
const snapshot=structuredClone(input);
const hp=calculateWorkbookGrowthPreview(input);
assert.equal(hp.ok,true);
assert.equal(hp.value,12,'HP uses floor(source subtotal × level / 100) + level + 10');
assert.deepEqual(input,snapshot,'calculator never mutates caller input');
assert.equal(hp.activation,'calculator_only');

const atk=calculateWorkbookGrowthPreview({stat:'atk',baseStat:15,level:1,potential:15,training:0});
assert.equal(atk.value,5,'non-HP stats use the +5 flat bonus');

const maxHp=calculateWorkbookGrowthPreview({stat:'hp',baseStat:80,level:60,potential:31,training:200});
assert.equal(maxHp.value,214,'maximum vector follows workbook FLOOR rounding');
const clamped=calculateWorkbookGrowthPreview({stat:'hp',baseStat:80,level:999,potential:999,training:999});
assert.deepEqual(
  {value:clamped.value,level:clamped.level,potential:clamped.potential,training:clamped.training},
  {value:maxHp.value,level:60,potential:31,training:200},
  'level, potential and per-stat training are bounded',
);

let previous=-Infinity;
for(let level=1;level<=60;level+=1){
  const current=calculateWorkbookGrowthPreview({stat:'def',baseStat:20,level,potential:15,training:80}).value;
  assert.ok(current>=previous,`growth is monotonic at level ${level}`);
  previous=current;
}
const lowPotential=calculateWorkbookGrowthPreview({stat:'spd',baseStat:18,level:30,potential:0,training:0}).value;
const highPotential=calculateWorkbookGrowthPreview({stat:'spd',baseStat:18,level:30,potential:31,training:200}).value;
assert.ok(highPotential>=lowPotential,'potential/training cannot reduce a projection');

const special=calculateWorkbookGrowthPreview({stat:'spAtk',baseStat:20,level:20,potential:15,training:0});
assert.equal(special.ok,true,'source-only special stat can be audited in the calculator');
assert.equal(special.runtimeEligible,false,'SPATK remains deferred from runtime');
assert.equal(special.statModelDecision,'D3_SPATK_SPDEF_DEFERRED');

const unknown=calculateWorkbookGrowthPreview({stat:'luck',baseStat:99,level:60});
assert.deepEqual(unknown,{ok:false,reason:'unknown_id',stat:'luck'});

console.log('V8.1 growth calculator contract: PASS');
