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
  getSkill,
  learnSkill,
  manualSkillLoadout,
  setManualSkillSlot,
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

const fireOne=getSkill(instance,'SK_FIRE_01');
fireOne.currentUses=7;
fireOne.cooldownRemainingMs=1234;
fireOne.masteryExp=99;
const swapped=setManualSkillSlot(instance,{skillId:'SK_FIRE_01',slot:'s2'});
assert.deepEqual(
  {ok:swapped.ok,previousSlot:swapped.previousSlot,displacedSkillId:swapped.displacedSkillId,swapped:swapped.swapped},
  {ok:true,previousSlot:'s1',displacedSkillId:'SK_FIRE_02',swapped:true},
  'moving an equipped skill swaps the target occupant atomically',
);
assert.deepEqual(manualSkillLoadout(instance).map(entry=>entry.skillId),['SK_FIRE_02','SK_FIRE_01','SK_FIRE_04','SK_FIRE_03']);
assert.deepEqual(
  {currentUses:fireOne.currentUses,cooldownRemainingMs:fireOne.cooldownRemainingMs,masteryExp:fireOne.masteryExp},
  {currentUses:7,cooldownRemainingMs:1234,masteryExp:99},
  'slot changes preserve Uses, cooldown and mastery on the learned record',
);

const fireFive=learnSkill(instance,{skillId:'SK_FIRE_05',slot:null});
const displaced=setManualSkillSlot(instance,{skillId:'SK_FIRE_05',slot:'s1'});
assert.equal(displaced.ok,true);
assert.equal(displaced.displacedSkillId,'SK_FIRE_02');
assert.equal(fireFive.slot,'s1');
assert.equal(getSkill(instance,'SK_FIRE_02').slot,null,'an unequipped skill displaces without deleting the occupant');
const cleared=setManualSkillSlot(instance,{skillId:null,slot:'s4'});
assert.equal(cleared.ok,true);
assert.equal(cleared.displacedSkillId,'SK_FIRE_03');
assert.equal(getSkill(instance,'SK_FIRE_03').slot,null,'clearing a slot keeps the skill learned');

const transactionBefore=structuredClone(instance.skills);
assert.equal(setManualSkillSlot(instance,{skillId:'SK_WATER_01',slot:'s1'}).reason,'not_learned');
assert.equal(setManualSkillSlot(instance,{skillId:'missing',slot:'s1'}).reason,'unknown_id');
assert.equal(setManualSkillSlot(instance,{skillId:'SK_FIRE_01',slot:'basicAI'}).reason,'slot_locked');
assert.deepEqual(instance.skills,transactionBefore,'rejected loadout commands are atomic');
const reloadedTransaction=migrateState({
  collection:[{instanceId:'loadout-reload',speciesId:'flameling',skills:structuredClone(instance.skills)}],
},{now:2000}).collection[0];
assert.deepEqual(
  manualSkillLoadout(reloadedTransaction).map(entry=>entry.skillId),
  ['SK_FIRE_05','SK_FIRE_01','SK_FIRE_04',null],
  'the selected loadout survives save migration',
);
const reloadedFireOne=getSkill(reloadedTransaction,'SK_FIRE_01');
assert.deepEqual(
  {currentUses:reloadedFireOne.currentUses,cooldownRemainingMs:reloadedFireOne.cooldownRemainingMs,masteryExp:reloadedFireOne.masteryExp},
  {currentUses:7,cooldownRemainingMs:undefined,masteryExp:99},
  'save/reload preserves Uses/mastery and applies the existing encounter-cooldown reset policy',
);
assert.equal(learnSkill(instance,{skillId:'slot-five-bypass',slot:'s5'}),null,'legacy learn API cannot create slot five');
const corrupted=normalizeInstance({instanceId:'bad',skills:[{skillId:'a',slot:'s1'},{skillId:'a',slot:'s2'},{skillId:'b',slot:'s1'},{skillId:'c',slot:'s5'}]},{now:1000});
const validation=validateSkillSlotState(corrupted);
assert.equal(validation.ok,false);
assert.ok(validation.issues.some(issue=>issue.code==='duplicate_slot'));
assert.ok(validation.issues.some(issue=>issue.code==='duplicate_skill'));
assert.ok(validation.issues.some(issue=>issue.code==='slot_locked'));
const corruptedBefore=structuredClone(corrupted.skills);
assert.equal(setManualSkillSlot(corrupted,{skillId:'a',slot:'s1'}).reason,'invalid_slot_state');
assert.deepEqual(corrupted.skills,corruptedBefore,'transaction fails closed on a corrupt loadout');

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
