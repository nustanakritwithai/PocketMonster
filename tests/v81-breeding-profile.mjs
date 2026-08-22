import assert from 'node:assert/strict';
import { normalizeInstance } from '../monster-instance.mjs';
import {
  BREEDING_ADULT_STAGES,
  BREEDING_MIN_BOND,
  breed,
  evaluateBreedingCompatibility,
  genderCompatible,
} from '../breeding.mjs';

const speciesById=Object.freeze({
  flameling:Object.freeze({id:'flameling',breedingGroup:'Field'}),
  aquapuff:Object.freeze({id:'aquapuff',breedingGroup:'Field'}),
  frostowl:Object.freeze({id:'frostowl',breedingGroup:'Avian'}),
});
const parent=(id,over={})=>normalizeInstance({
  instanceId:id,
  speciesId:'flameling',
  lifeStage:'Adult',
  gender:id.endsWith('a')?'Female':'Male',
  bond:70,
  ...over,
},{now:1000});

assert.deepEqual(BREEDING_ADULT_STAGES,['Adult','Mature']);
assert.equal(BREEDING_MIN_BOND,50);
assert.equal(genderCompatible({gender:'Female'},{gender:'Male'}),true);
assert.equal(genderCompatible({gender:'Genderless'},{gender:'Genderless'}),true);
assert.equal(genderCompatible({gender:'Male'},{gender:'Male'}),false);

const a=parent('parent-a');
const b=parent('parent-b',{speciesId:'aquapuff'});
const valid=evaluateBreedingCompatibility(a,b,{speciesById,now:2000});
assert.deepEqual({ok:valid.ok,reason:valid.reason,breedingGroup:valid.breedingGroup},{ok:true,reason:null,breedingGroup:'Field'});
assert.equal(Object.isFrozen(valid),true);

assert.equal(evaluateBreedingCompatibility(a,a,{speciesById,now:2000}).reason,'breeding_same_instance');
assert.equal(evaluateBreedingCompatibility(a,parent('young-b',{lifeStage:'Juvenile'}),{speciesById,now:2000}).reason,'breeding_stage_gate');
assert.equal(evaluateBreedingCompatibility(a,parent('bird-b',{speciesId:'frostowl'}),{speciesById,now:2000}).reason,'breeding_group_gate');
assert.equal(evaluateBreedingCompatibility(a,parent('male-b',{gender:'Female'}),{speciesById,now:2000}).reason,'breeding_gender_gate');
assert.equal(evaluateBreedingCompatibility(a,parent('low-b',{bond:49}),{speciesById,now:2000}).reason,'breeding_bond_gate');
assert.equal(evaluateBreedingCompatibility(a,parent('cooldown-b',{breedingCooldownUntil:2001}),{speciesById,now:2000}).reason,'breeding_cooldown');
assert.equal(evaluateBreedingCompatibility(a,parent('unknown-b',{speciesId:'unknown'}),{speciesById,now:2000}).reason,'unknown_id');

const child=parent('child-b',{parents:{a:'parent-a',b:'other'}});
assert.equal(evaluateBreedingCompatibility(a,child,{speciesById,now:2000}).reason,'breeding_relative_gate');

const blocked=breed(a,parent('young-c',{lifeStage:'Baby'}),{
  species:{id:'flameling'},
  seed:'blocked',
  now:2000,
  compatibility:{speciesById},
});
assert.equal(blocked.ok,false,'breed command can opt into the full compatibility gate');
assert.equal(blocked.reason,'breeding_stage_gate');

const legacy=breed(a,b,{species:{id:'flameling'},seed:'legacy',now:2000});
assert.equal(legacy.ok,true,'existing caller remains compatible until runtime adopts the profile adapter');

console.log('V8.1 breeding profile/compatibility adapter: PASS');
