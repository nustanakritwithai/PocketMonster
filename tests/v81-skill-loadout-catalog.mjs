import assert from 'node:assert/strict';
import { migrateState, normalizeInstance } from '../monster-instance.mjs';
import { MONSTER_CATALOG } from '../monster-catalog.mjs';
import { skillCatalogEntry } from '../skill-catalog.mjs';
import {
  MANUAL_SKILL_SLOTS,
  SKILL_SLOTS,
  SYSTEM_SKILL_SLOTS,
  WORKBOOK_DEFAULT_SKILL_SUFFIXES,
  basicAiSkill,
  consumeSkillUse,
  equipSkill,
  learnSkill,
  manualSkillLoadout,
  validateSkillSlotState,
  workbookDefaultSkillIds,
} from '../skill-progression.mjs';

assert.deepEqual(MANUAL_SKILL_SLOTS, ['s1','s2','s3','s4'], 'workbook equips exactly four manual slots');
assert.deepEqual(SYSTEM_SKILL_SLOTS, ['basicAI','passive','evolutionTrait']);
assert.deepEqual(SKILL_SLOTS, ['basicAI','s1','s2','s3','s4','passive','evolutionTrait'], 'Basic Attack remains separate from four manual slots');
assert.deepEqual(WORKBOOK_DEFAULT_SKILL_SUFFIXES, ['01','02','04','03'], 'Monster_Table default order stays exact');

for (const mapping of MONSTER_CATALOG) {
  const ids=workbookDefaultSkillIds(mapping.runtimeSpeciesId);
  assert.deepEqual(
    ids,
    WORKBOOK_DEFAULT_SKILL_SUFFIXES.map(suffix=>`SK_${mapping.workbookTypeCandidate}_${suffix}`),
    `${mapping.runtimeSpeciesId} matches Monster_Table DefaultSkill1..4`,
  );
  assert.equal(ids.length,4);
  assert.ok(ids.every(skillId=>skillCatalogEntry(skillId)),`${mapping.runtimeSpeciesId} defaults resolve to reviewed skills`);
  assert.equal(Object.isFrozen(ids),true);
}
assert.deepEqual(workbookDefaultSkillIds('unknown-species'),[]);
assert.equal(Object.isFrozen(workbookDefaultSkillIds('unknown-species')),true);

const instance=normalizeInstance({instanceId:'loadout-1',speciesId:'flameling',skills:[]},{now:1000});
learnSkill(instance,{skillId:'basic_attack',slot:'basicAI'});
for(const skillId of ['SK_FIRE_01','SK_FIRE_02','SK_FIRE_03','SK_FIRE_04']){
  assert.ok(learnSkill(instance,{skillId,slot:null}),`${skillId} is learned without auto-equipping`);
}

assert.equal(equipSkill(instance,{skillId:'SK_FIRE_01',slot:'s1'}).ok,true);
assert.equal(equipSkill(instance,{skillId:'SK_FIRE_02',slot:'s2'}).ok,true);
assert.equal(equipSkill(instance,{skillId:'SK_FIRE_04',slot:'s3'}).ok,true);
assert.equal(equipSkill(instance,{skillId:'SK_FIRE_03',slot:'s4'}).ok,true);
assert.deepEqual(manualSkillLoadout(instance).map(entry=>entry.skillId),['SK_FIRE_01','SK_FIRE_02','SK_FIRE_04','SK_FIRE_03']);
assert.equal(basicAiSkill(instance).skillId,'basic_attack','Basic AI stays outside the manual loadout');

const before=structuredClone(instance.skills);
const fifth=equipSkill(instance,{skillId:'SK_FIRE_04',slot:'s5'});
assert.deepEqual({ok:fifth.ok,reason:fifth.reason},{ok:false,reason:'slot_locked'},'fifth manual slot is rejected');
assert.deepEqual(instance.skills,before,'rejected fifth slot mutates nothing');

const aiOverride=equipSkill(instance,{skillId:'SK_FIRE_04',slot:'basicAI'});
assert.equal(aiOverride.ok,false);
assert.equal(aiOverride.reason,'slot_locked','manual command cannot overwrite Basic AI');
assert.equal(basicAiSkill(instance).skillId,'basic_attack');

const occupied=equipSkill(instance,{skillId:'SK_FIRE_03',slot:'s3'});
assert.equal(occupied.ok,false);
assert.equal(occupied.reason,'duplicate_slot');
assert.equal(equipSkill(instance,{skillId:'SK_WATER_01',slot:'s1'}).reason,'not_learned');
assert.equal(equipSkill(instance,{skillId:'not-a-catalog-skill',slot:'s1'}).reason,'unknown_id');
assert.equal(validateSkillSlotState(instance).ok,true);

const fourthUse=consumeSkillUse(instance,{skillId:'SK_FIRE_03',castId:'slot-four-cast',castAccepted:true});
assert.equal(fourthUse.ok,true,'slot four is a metered manual skill');
assert.equal(fourthUse.currentUses,9);
assert.equal(learnSkill(instance,{skillId:'slot-five-bypass',slot:'s5'}),null,'legacy learn API cannot create slot five');
const corrupted=normalizeInstance({instanceId:'bad',skills:[{skillId:'a',slot:'s1'},{skillId:'a',slot:'s2'},{skillId:'b',slot:'s1'},{skillId:'c',slot:'s5'}]},{now:1000});
const validation=validateSkillSlotState(corrupted);
assert.equal(validation.ok,false);
assert.ok(validation.issues.some(issue=>issue.code==='duplicate_slot'));
assert.ok(validation.issues.some(issue=>issue.code==='duplicate_skill'));
assert.ok(validation.issues.some(issue=>issue.code==='slot_locked'));

assert.equal(manualSkillLoadout(instance).length,4);
assert.equal(Object.isFrozen(manualSkillLoadout(instance)),true);

const persistedFourth={
  collection:[{
    instanceId:'persist-s4',speciesId:'flameling',
    skills:[{skillId:'SK_FIRE_03',slot:'s4',currentUses:7}],
  }],
};
const migratedOnce=migrateState(persistedFourth,{now:1000});
const migratedTwice=migrateState(migratedOnce,{now:1000});
assert.deepEqual(migratedTwice,migratedOnce,'fourth-slot save migration is idempotent');
assert.deepEqual(
  migratedOnce.collection[0].skills[0],
  {skillId:'SK_FIRE_03',slot:'s4',currentUses:7},
  'the persisted fourth slot and Uses survive migration exactly',
);
assert.equal(validateSkillSlotState(migratedOnce.collection[0]).ok,true);

console.log('V8.1 four-manual-slot workbook adapter: PASS (18/18 species)');
