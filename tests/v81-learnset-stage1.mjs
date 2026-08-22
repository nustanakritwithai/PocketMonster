import assert from 'node:assert/strict';
import { migrateState, normalizeInstance } from '../monster-instance.mjs';
import {
  learnSkill,
  listStage1SkillCandidates,
  resolveStage1Learnset,
} from '../skill-progression.mjs';

const below=normalizeInstance({instanceId:'below',speciesId:'flameling',level:4,skills:[]},{now:1000});
const belowResult=resolveStage1Learnset(below);
assert.equal(belowResult.ok,true);
assert.equal(belowResult.workbookMonsterId,'MON_002');
assert.deepEqual(belowResult.candidates,['SK_FIRE_01'],'level 4 exposes only the level-1 move');
assert.equal(belowResult.entries.find(row=>row.skillId==='SK_FIRE_02').reason,'level_required');
assert.equal(belowResult.autoGrant,false);
assert.equal(Object.isFrozen(belowResult),true);
assert.equal(Object.isFrozen(belowResult.entries),true);

const threshold=normalizeInstance({instanceId:'threshold',speciesId:'flameling',level:5,skills:[]},{now:1000});
assert.deepEqual(listStage1SkillCandidates(threshold),['SK_FIRE_01','SK_FIRE_02'],'skill appears exactly at its threshold');
learnSkill(threshold,{skillId:'SK_FIRE_01',slot:null});
assert.deepEqual(listStage1SkillCandidates(threshold),['SK_FIRE_02'],'known skills are excluded without being removed');

const sourceBefore=structuredClone(threshold.skills);
resolveStage1Learnset(threshold);
assert.deepEqual(threshold.skills,sourceBefore,'eligibility query is read-only');

const legacy={
  collection:[{instanceId:'legacy',speciesId:'mossbun',level:14,skills:[]}],
  party:['legacy',null,null],
  storage:[],
};
const migrated=migrateState(legacy,{now:1000});
const migratedAgain=migrateState(migrated,{now:1000});
assert.deepEqual(migratedAgain,migrated,'migration remains idempotent');
assert.equal(migrated.collection[0].skills.length,0,'migration never auto-grants eligible moves');
assert.deepEqual(
  listStage1SkillCandidates(migrated.collection[0]),
  ['SK_GRASS_01','SK_GRASS_02','SK_GRASS_03','SK_GRASS_04','SK_GRASS_05'],
  'eligible moves are candidates only',
);

const unknown=resolveStage1Learnset(normalizeInstance({instanceId:'unknown',speciesId:'legacy_unknown',level:20},{now:1000}));
assert.deepEqual({ok:unknown.ok,reason:unknown.reason},{ok:false,reason:'unknown_id'});
assert.deepEqual(unknown.candidates,[]);

console.log('V8.1 Stage-1 learnset eligibility: PASS');
