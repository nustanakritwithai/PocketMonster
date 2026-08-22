import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateState, normalizeInstance } from '../monster-instance.mjs';
import {
  learnSkill,
  listStage1SkillCandidates,
  manualSkillLoadout,
  resolveStage1Learnset,
  synchronizeStage1Learnset,
  validateSkillSlotState,
} from '../skill-progression.mjs';

function sourceSection(source,startMarker,endMarker){
  const start=source.indexOf(startMarker);
  assert.notEqual(start,-1,`missing source marker: ${startMarker}`);
  const end=source.indexOf(endMarker,start+startMarker.length);
  assert.notEqual(end,-1,`missing source marker: ${endMarker}`);
  return source.slice(start,end);
}

function assertRuntimeLearnsetHooks(source){
  const makeInstance=sourceSection(source,'function makeInstance(', '\nfunction ensureInstanceShape(');
  const defeatWild=sourceSection(source,'function defeatWild(', '\nfunction monsterDamage(');
  const levelUp=sourceSection(source,'function levelUpInstance(', '\n// V7.2: simulateLife adapter');
  const raisingEvent=sourceSection(source,'function resolveRaisingEvent(', '\nfunction renderRaisingEventBanner(');
  const hatchEgg=sourceSection(source,'function hatchEgg(', '\n// ---------- Evolution ----------');
  const migration=sourceSection(source,'function migrateLoadedState(', '\nlet remoteSaveReady=');
  const monsterSkills=sourceSection(source,'function getMonsterSkills(', '\nfunction randomGenes(');
  const useSkill=sourceSection(source,'function useSkill(', '\nfunction updateOwned(');
  const mastery=sourceSection(source,'function awardAcceptedSkillMastery(', '\nfunction applyAcceptedSkillCommand(');
  const learnCandidate=sourceSection(source,'function learnCandidateSkill(', '\nfunction mutateOwnedSkill(');
  assert.match(makeInstance,/synchronizeStage1Learnset\(inst\);/,'new/captured/created monsters synchronize LevelUp skills');
  assert.match(defeatWild,/applyBattleGrowth\(inst,result\);[\s\S]*?synchronizeStage1Learnset\(inst\);/,'active battle growth synchronizes skills');
  assert.match(defeatWild,/addGrowthExp\(pm,share\);synchronizeStage1Learnset\(pm\);/,'party-share growth synchronizes skills');
  assert.match(levelUp,/addGrowthExp\(inst,need\);\s*synchronizeStage1Learnset\(inst\);/,'manual level gain synchronizes skills');
  assert.match(raisingEvent,/applyChoice\([\s\S]*?if\(result\.ok\)\{synchronizeStage1Learnset\(inst\);/,'raising-event growth synchronizes skills');
  assert.match(hatchEgg,/const child=[\s\S]*?synchronizeStage1Learnset\(child\);\s*refreshStats\(child,true\);/,'saved and legacy eggs synchronize on hatch');
  assert.match(migration,/state\.collection\.forEach\(synchronizeStage1Learnset\);/,'loaded saves synchronize eligible skills once');
  assert.match(monsterSkills,/if\(cand\?\.replaces&&rec\.slot===cand\.slot\)/,'unequipped legacy candidates cannot alter the live field moves');
  assert.doesNotMatch(useSkill,/learnSkill\(a\.inst/,'live casting never lazy-learns or creates a duplicate manual slot');
  assert.doesNotMatch(mastery,/learnSkill\(a\.inst/,'accepted mastery never lazy-learns a missing record');
  assert.match(mastery,/const skillRec=getSkill\(a\.inst,move\.skillId\)/,'live mastery reads the canonical equipped SkillID');
  assert.match(mastery,/addSkillExp\(a\.inst,move\.skillId,sExp\)/,'live mastery follows the canonical equipped learned record');
  assert.match(learnCandidate,/learnSkill\(inst,\{skillId:def\.id,slot:null\}\)/,'legacy candidates learn unequipped instead of colliding with workbook defaults');
}

const below=normalizeInstance({instanceId:'below',speciesId:'flameling',level:4,skills:[]},{now:1000});
const belowResult=resolveStage1Learnset(below);
assert.equal(belowResult.ok,true);
assert.equal(belowResult.workbookMonsterId,'MON_002');
assert.deepEqual(belowResult.candidates,['SK_FIRE_01'],'level 4 exposes only the level-1 move');
assert.equal(belowResult.entries.find(row=>row.skillId==='SK_FIRE_02').reason,'level_required');
assert.equal(belowResult.autoGrant,true);
assert.equal(Object.isFrozen(belowResult),true);
assert.equal(Object.isFrozen(belowResult.entries),true);

const threshold=normalizeInstance({instanceId:'threshold',speciesId:'flameling',level:5,skills:[]},{now:1000});
assert.deepEqual(listStage1SkillCandidates(threshold),['SK_FIRE_01','SK_FIRE_02'],'skill appears exactly at its threshold');
learnSkill(threshold,{skillId:'SK_FIRE_01',slot:null});
assert.deepEqual(listStage1SkillCandidates(threshold),['SK_FIRE_02'],'known skills are excluded without being removed');

const sourceBefore=structuredClone(threshold.skills);
resolveStage1Learnset(threshold);
assert.deepEqual(threshold.skills,sourceBefore,'eligibility query is read-only');

const belowGrant=synchronizeStage1Learnset(below);
assert.deepEqual(belowGrant.granted,[{skillId:'SK_FIRE_01',slot:'s1'}]);
assert.equal(below.skills[0].currentUses,28,'auto-learn initializes per-instance Uses');
const belowAfterFirst=structuredClone(below);
assert.deepEqual(synchronizeStage1Learnset(below).granted,[],'repeated synchronization grants nothing twice');
assert.deepEqual(below,belowAfterFirst,'repeated synchronization is mutation-idempotent');

const field=normalizeInstance({instanceId:'field',speciesId:'flameling',level:10,skills:[]},{now:1000});
assert.deepEqual(
  synchronizeStage1Learnset(field).granted,
  [
    {skillId:'SK_FIRE_01',slot:'s1'},
    {skillId:'SK_FIRE_02',slot:'s2'},
    {skillId:'SK_FIRE_03',slot:'s4'},
    {skillId:'SK_FIRE_04',slot:'s3'},
  ],
  'eligible LevelUp rows auto-learn in source order and equip workbook default slots',
);
assert.deepEqual(
  manualSkillLoadout(field).map(entry=>entry.skillId),
  ['SK_FIRE_01','SK_FIRE_02','SK_FIRE_04','SK_FIRE_03'],
  'manual loadout follows Monster_Table DefaultSkill1..4 order',
);

const advanced=normalizeInstance({instanceId:'advanced',speciesId:'mossbun',level:14,skills:[]},{now:1000});
synchronizeStage1Learnset(advanced);
assert.equal(advanced.skills.find(skill=>skill.skillId==='SK_GRASS_05').slot,null,'non-default LevelUp skill auto-learns without displacing the field preset');
assert.equal(validateSkillSlotState(advanced).ok,true);

const occupied=normalizeInstance({
  instanceId:'occupied',speciesId:'flameling',level:5,
  skills:[{skillId:'SK_FIRE_03',slot:'s2',masteryExp:9,currentUses:4}],
},{now:1000});
synchronizeStage1Learnset(occupied);
assert.equal(occupied.skills.find(skill=>skill.skillId==='SK_FIRE_03').slot,'s2','an existing user choice is preserved');
assert.equal(occupied.skills.find(skill=>skill.skillId==='SK_FIRE_02').slot,null,'auto-learn never overwrites an occupied default slot');
assert.equal(validateSkillSlotState(occupied).ok,true);

const candidateOwner=normalizeInstance({instanceId:'candidate',speciesId:'flameling',level:5,skills:[]},{now:1000});
synchronizeStage1Learnset(candidateOwner);
learnSkill(candidateOwner,{skillId:'Flame Bite',slot:null});
assert.equal(candidateOwner.skills.find(skill=>skill.skillId==='SK_FIRE_01').slot,'s1','candidate learning preserves the workbook default occupant');
assert.equal(candidateOwner.skills.find(skill=>skill.skillId==='Flame Bite').slot,null,'legacy candidate remains learned but unequipped');
assert.equal(validateSkillSlotState(candidateOwner).ok,true,'candidate learning cannot create a duplicate manual slot');

const legacy={
  collection:[{instanceId:'legacy',speciesId:'mossbun',level:14,skills:[]}],
  party:['legacy',null,null],
  storage:[],
};
const migrated=migrateState(legacy,{now:1000});
const migratedAgain=migrateState(migrated,{now:1000});
assert.deepEqual(migratedAgain,migrated,'migration remains idempotent');
assert.equal(migrated.collection[0].skills.length,0,'pure data migration stays non-mutating until the runtime synchronizer runs');
assert.deepEqual(
  listStage1SkillCandidates(migrated.collection[0]),
  ['SK_GRASS_01','SK_GRASS_02','SK_GRASS_03','SK_GRASS_04','SK_GRASS_05'],
  'eligible moves are candidates only',
);
const migratedSync=synchronizeStage1Learnset(migrated.collection[0]);
assert.equal(migratedSync.granted.length,5,'legacy owned monsters receive every eligible LevelUp move at runtime load');
assert.deepEqual(synchronizeStage1Learnset(migrated.collection[0]).granted,[],'legacy runtime synchronization is idempotent');

const unknown=resolveStage1Learnset(normalizeInstance({instanceId:'unknown',speciesId:'legacy_unknown',level:20},{now:1000}));
assert.deepEqual({ok:unknown.ok,reason:unknown.reason},{ok:false,reason:'unknown_id'});
assert.deepEqual(unknown.candidates,[]);
const unknownBefore=structuredClone(unknown);
assert.deepEqual(synchronizeStage1Learnset({speciesId:'legacy_unknown',skills:[]}),{ok:false,reason:'unknown_id',granted:[]});
assert.deepEqual(unknown,unknownBefore);

const runtimeSource=readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
assertRuntimeLearnsetHooks(runtimeSource);

console.log('V8.1 Stage-1 LevelUp auto-learn/equip: PASS');
