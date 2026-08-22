import assert from 'node:assert/strict';
import { normalizeInstance } from '../monster-instance.mjs';
import {
  MANUAL_SKILL_SLOTS,
  SKILL_SLOTS,
  SYSTEM_SKILL_SLOTS,
  basicAiSkill,
  equipSkill,
  learnSkill,
  manualSkillLoadout,
  validateSkillSlotState,
} from '../skill-progression.mjs';

assert.deepEqual(MANUAL_SKILL_SLOTS, ['s1','s2','s3'], 'manual control remains exactly three slots');
assert.deepEqual(SYSTEM_SKILL_SLOTS, ['basicAI','passive','evolutionTrait']);
assert.deepEqual(SKILL_SLOTS, ['basicAI','s1','s2','s3','passive','evolutionTrait'], 'legacy slot ordering remains stable');

const instance=normalizeInstance({instanceId:'loadout-1',speciesId:'flameling',skills:[]},{now:1000});
learnSkill(instance,{skillId:'basic_attack',slot:'basicAI'});
for(const skillId of ['SK_FIRE_01','SK_FIRE_02','SK_FIRE_03','SK_FIRE_04']){
  assert.ok(learnSkill(instance,{skillId,slot:null}),`${skillId} is learned without auto-equipping`);
}

assert.equal(equipSkill(instance,{skillId:'SK_FIRE_01',slot:'s1'}).ok,true);
assert.equal(equipSkill(instance,{skillId:'SK_FIRE_02',slot:'s2'}).ok,true);
assert.equal(equipSkill(instance,{skillId:'SK_FIRE_03',slot:'s3'}).ok,true);
assert.deepEqual(manualSkillLoadout(instance).map(entry=>entry.skillId),['SK_FIRE_01','SK_FIRE_02','SK_FIRE_03']);
assert.equal(basicAiSkill(instance).skillId,'basic_attack','Basic AI stays outside the manual loadout');

const before=structuredClone(instance.skills);
const fourth=equipSkill(instance,{skillId:'SK_FIRE_04',slot:'s4'});
assert.deepEqual({ok:fourth.ok,reason:fourth.reason},{ok:false,reason:'slot_locked'},'fourth manual slot is rejected');
assert.deepEqual(instance.skills,before,'rejected fourth slot mutates nothing');

const aiOverride=equipSkill(instance,{skillId:'SK_FIRE_04',slot:'basicAI'});
assert.equal(aiOverride.ok,false);
assert.equal(aiOverride.reason,'slot_locked','manual command cannot overwrite Basic AI');
assert.equal(basicAiSkill(instance).skillId,'basic_attack');

const occupied=equipSkill(instance,{skillId:'SK_FIRE_04',slot:'s3'});
assert.equal(occupied.ok,false);
assert.equal(occupied.reason,'duplicate_slot');
assert.equal(equipSkill(instance,{skillId:'SK_WATER_01',slot:'s1'}).reason,'not_learned');
assert.equal(equipSkill(instance,{skillId:'not-a-catalog-skill',slot:'s1'}).reason,'unknown_id');
assert.equal(validateSkillSlotState(instance).ok,true);

assert.equal(learnSkill(instance,{skillId:'slot-four-bypass',slot:'s4'}),null,'legacy learn API cannot create slot four');
const corrupted=normalizeInstance({instanceId:'bad',skills:[{skillId:'a',slot:'s1'},{skillId:'a',slot:'s2'},{skillId:'b',slot:'s1'},{skillId:'c',slot:'s4'}]},{now:1000});
const validation=validateSkillSlotState(corrupted);
assert.equal(validation.ok,false);
assert.ok(validation.issues.some(issue=>issue.code==='duplicate_slot'));
assert.ok(validation.issues.some(issue=>issue.code==='duplicate_skill'));
assert.ok(validation.issues.some(issue=>issue.code==='slot_locked'));

assert.equal(manualSkillLoadout(instance).length,3);
assert.equal(Object.isFrozen(manualSkillLoadout(instance)),true);

console.log('V8.1 three-manual-slot catalog adapter: PASS');
