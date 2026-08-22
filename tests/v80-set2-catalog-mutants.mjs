import assert from 'node:assert/strict';
import { STAGE_BY_ID, STAGE_CATALOG, STAGE_REWARD_PROFILES } from '../stage-catalog.mjs';

const ids=['frozen-pass','rocky-canyon','sky-ruins','poison-marsh'];
const expectedUnlock=['storm-field','frozen-pass','rocky-canyon','sky-ruins'];
const clone=()=>ids.map(id=>({...STAGE_BY_ID[id],primaryTypes:[...STAGE_BY_ID[id].primaryTypes],secondaryTypes:[...STAGE_BY_ID[id].secondaryTypes],unlockRule:{...STAGE_BY_ID[id].unlockRule}}));
const validate=(stages,rewards=STAGE_REWARD_PROFILES)=>{
  assert.equal(stages.length,4,'Set 2 has four definitions');
  for(const [index,stage] of stages.entries()){
    assert.equal(stage.id,ids[index],'Set 2 order is stable');
    assert.deepEqual(stage.unlockRule,{type:'clearStage',stageId:expectedUnlock[index]},'Set 2 chain is direct-clear only');
    assert.ok(stage.primaryTypes.length&&stage.primaryTypes.every(type=>STAGE_CATALOG[0].primaryTypes.concat(['Ice','Rock','Ground','Flying','Poison','Water','Fighting','Electric','Psychic','Grass','Bug']).includes(type)),'Stage types remain catalog-valid');
    assert.equal(stage.capturePolicy,'normal-wild-only','Boss capture policy remains disabled');
    assert.ok(rewards[stage.rewardProfileId],'Reward profile remains catalog-owned');
  }
};
validate(clone());
for(const [label,mutate] of [
  ['removed stage',stages=>stages.splice(1,1)],
  ['changed predecessor',stages=>{stages[0].unlockRule.stageId='misty-lake';}],
  ['changed type',stages=>{stages[2].primaryTypes=['Dark'];}],
  ['capturable Boss',stages=>{stages[3].capturePolicy='boss';}],
  ['missing reward profile',stages=>{delete stages[0].rewardProfileId;}],
]){
  const stages=clone();
  mutate(stages);
  assert.throws(()=>validate(stages),/Set 2|chain|types|capture|Reward/,`${label} is rejected`);
}
console.log('V8 Set 2-0 catalog mutation guards: PASS (5/5 killed)');
