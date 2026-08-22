import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceUrl=new URL('../skill-progression.mjs',import.meta.url);
const originalSource=fs.readFileSync(sourceUrl,'utf8');
const runtimeSource=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');

async function loadSource(source,tag){
  const withAbsoluteImports=source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_,relativePath)=>`from '${new URL(`../${relativePath.slice(2)}`,import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${withAbsoluteImports}\n//# sourceURL=${tag}`).toString('base64')}`);
}

function contract(module){
  const low={speciesId:'flameling',level:4,skills:[]};
  assert.equal(module.resolveStage1Learnset(low).autoGrant,true);
  assert.deepEqual(module.synchronizeStage1Learnset(low).granted,[{skillId:'SK_FIRE_01',slot:'s1'}]);
  const lowSnapshot=structuredClone(low);
  assert.deepEqual(module.synchronizeStage1Learnset(low).granted,[]);
  assert.deepEqual(low,lowSnapshot);

  const field={speciesId:'flameling',level:10,skills:[]};
  module.synchronizeStage1Learnset(field);
  assert.deepEqual(module.manualSkillLoadout(field).map(entry=>entry.skillId),[
    'SK_FIRE_01','SK_FIRE_02','SK_FIRE_04','SK_FIRE_03',
  ]);

  const occupied={
    speciesId:'flameling',level:5,
    skills:[{skillId:'SK_FIRE_03',slot:'s2',currentUses:4}],
  };
  module.synchronizeStage1Learnset(occupied);
  assert.equal(occupied.skills.find(skill=>skill.skillId==='SK_FIRE_03').slot,'s2');
  assert.equal(occupied.skills.find(skill=>skill.skillId==='SK_FIRE_02').slot,null);
  assert.equal(module.validateSkillSlotState(occupied).ok,true);
}

function sourceSection(source,startMarker,endMarker){
  const start=source.indexOf(startMarker);
  assert.notEqual(start,-1,`missing source marker: ${startMarker}`);
  const end=source.indexOf(endMarker,start+startMarker.length);
  assert.notEqual(end,-1,`missing source marker: ${endMarker}`);
  return source.slice(start,end);
}

function runtimeContract(source){
  const makeInstance=sourceSection(source,'function makeInstance(', '\nfunction ensureInstanceShape(');
  const defeatWild=sourceSection(source,'function defeatWild(', '\nfunction monsterDamage(');
  const levelUp=sourceSection(source,'function levelUpInstance(', '\n// V7.2: simulateLife adapter');
  const raisingEvent=sourceSection(source,'function resolveRaisingEvent(', '\nfunction renderRaisingEventBanner(');
  const prepareHatched=sourceSection(source,'function prepareHatchedChildForLive(', '\nfunction hatchLegacyEgg(');
  const hatchLegacy=sourceSection(source,'function hatchLegacyEgg(', '\nfunction hatchEgg(');
  const hatchEgg=sourceSection(source,'function hatchEgg(', '\n// ---------- Evolution ----------');
  const migration=sourceSection(source,'function migrateLoadedState(', '\nlet remoteSaveReady=');
  const monsterSkills=sourceSection(source,'function getMonsterSkills(', '\nfunction randomGenes(');
  const useSkill=sourceSection(source,'function useSkill(', '\nfunction updateOwned(');
  const mastery=sourceSection(source,'function awardAcceptedSkillMastery(', '\nfunction applyAcceptedSkillCommand(');
  const learnCandidate=sourceSection(source,'function learnCandidateSkill(', '\nfunction mutateOwnedSkill(');
  assert.match(makeInstance,/synchronizeStage1Learnset\(inst\);/);
  assert.match(defeatWild,/applyBattleGrowth\(inst,result\);[\s\S]*?synchronizeStage1Learnset\(inst\);/);
  assert.match(defeatWild,/addGrowthExp\(pm,share\);synchronizeStage1Learnset\(pm\);/);
  assert.match(levelUp,/addGrowthExp\(inst,need\);\s*synchronizeStage1Learnset\(inst\);/);
  assert.match(raisingEvent,/if\(result\.ok\)\{synchronizeStage1Learnset\(inst\);/);
  assert.match(prepareHatched,/synchronizeStage1Learnset\(child\);\s*refreshStats\(child,true\);/);
  assert.match(hatchLegacy,/prepareHatchedChildForLive\(ensureInstanceShape\(/);
  assert.match(hatchEgg,/prepareHatchedChildForLive\(result\.child\)/);
  assert.match(migration,/state\.collection\.forEach\(synchronizeStage1Learnset\);/);
  assert.match(monsterSkills,/if\(cand\?\.replaces&&rec\.slot===cand\.slot\)/);
  assert.doesNotMatch(useSkill,/learnSkill\(a\.inst/);
  assert.doesNotMatch(mastery,/learnSkill\(a\.inst/);
  assert.match(mastery,/const skillRec=getSkill\(a\.inst,move\.skillId\)/);
  assert.match(mastery,/addSkillExp\(a\.inst,move\.skillId,sExp\)/);
  assert.match(learnCandidate,/learnSkill\(inst,\{skillId:def\.id,slot:null\}\)/);
}

contract(await loadSource(originalSource,'stage1-current'));
runtimeContract(runtimeSource);

const mutants=[
  ['disable auto grant','autoGrant: true','autoGrant: false'],
  ['grant below level','if (!entry.eligible || entry.learned) continue;','if (entry.learned) continue;'],
  ['report existing skill twice','if (!entry.eligible || entry.learned) continue;','if (!entry.eligible) continue;'],
  [
    'bypass equip guard',
    'if (preferredSlot && !occupied) equipSkill(instance, { skillId: entry.skillId, slot: preferredSlot });',
    'if (preferredSlot) learned.slot = preferredSlot;',
  ],
];

for(const [name,before,after] of mutants){
  const source=originalSource.replace(before,after);
  assert.notEqual(source,originalSource,`${name} mutation must alter source`);
  const module=await loadSource(source,`stage1-mutant-${name.replaceAll(' ','-')}`);
  assert.throws(()=>contract(module),undefined,`${name} must be killed`);
}


const runtimeMutants=[
  ['skip new monster sync','\n  synchronizeStage1Learnset(inst);\n  syncFromBodyMind(inst);','\n  syncFromBodyMind(inst);'],
  ['skip active battle sync','\n    synchronizeStage1Learnset(inst);\n    refreshStats(inst,false);','\n    refreshStats(inst,false);'],
  ['skip party-share sync','addGrowthExp(pm,share);synchronizeStage1Learnset(pm);','addGrowthExp(pm,share);'],
  ['skip manual-level sync','addGrowthExp(inst,need);\n  synchronizeStage1Learnset(inst);','addGrowthExp(inst,need);'],
  ['skip raising-event sync','if(result.ok){synchronizeStage1Learnset(inst);','if(result.ok){'],
  ['skip hatch sync','\n  synchronizeStage1Learnset(child);\n  refreshStats(child,true);','\n  refreshStats(child,true);'],
  ['skip canonical hatch hydrator','const child=prepareHatchedChildForLive(result.child);','const child=result.child;'],
  ['skip legacy hatch hydrator','const child=prepareHatchedChildForLive(ensureInstanceShape({...egg.child,origin:\'bred\',parentAId,parentBId}));','const child=ensureInstanceShape({...egg.child,origin:\'bred\',parentAId,parentBId});'],
  ['skip loaded-save sync','\n  state.collection.forEach(synchronizeStage1Learnset);',''],
  ['restore lazy casting learn','const skillRec=getSkill(a.inst,move.skillId);','let skillRec=getSkill(a.inst,move.skillId);if(!skillRec)skillRec=learnSkill(a.inst,{skillId:move.skillId,slot:\'s\'+(index+1)});'],
  ['restore candidate auto-equip','learnSkill(inst,{skillId:def.id,slot:null});','learnSkill(inst,{skillId:def.id,slot:def.slot||\'s1\'});'],
  ['apply unequipped candidate','if(cand?.replaces&&rec.slot===cand.slot){','if(cand?.replaces){'],
];

for(const [name,before,after] of runtimeMutants){
  const source=runtimeSource.replace(before,after);
  assert.notEqual(source,runtimeSource,`${name} mutation must alter runtime source`);
  assert.throws(()=>runtimeContract(source),undefined,`${name} must be killed`);
}

console.log(`V8.1 Stage-1 auto-learn mutants: PASS (${mutants.length+runtimeMutants.length}/${mutants.length+runtimeMutants.length} killed)`);
