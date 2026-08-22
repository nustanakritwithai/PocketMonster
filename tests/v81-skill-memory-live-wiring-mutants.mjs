import assert from 'node:assert/strict';
import fs from 'node:fs';

const gameSource = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const htmlSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const open = source.indexOf('{', source.indexOf(')', start) + 1);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a complete body`);
}

function liveContract(js, html) {
  assert.match(html, /id="breedingSkillMemory"/);
  assert.match(html, /value=""[^>]*>ไม่ส่งต่อ Skill Memory/);
  assert.match(js, /eggs:\[\],breedingSkillMemoryRequestByEggId:\{\},breeding:/);
  const choices = functionSource(js, 'renderBreedingSkillMemoryChoices');
  assert.match(choices, /listBreedingSkillMemoryCandidates\(eggHolder,partner\)/);
  assert.match(choices, /option\.value=candidate\.skillId/);
  assert.match(choices, /candidate\.preferred/);
  assert.doesNotMatch(choices, /Math\.random|rand\(|createRng/);

  const create = functionSource(js, 'createEgg');
  assert.match(create, /el\('breedingSkillMemory'\)\?\.value\|\|null/);
  assert.match(create, /genderSeed:genderSeedWords\[0\],inheritedSkillMemoryId,now/);
  assert.match(create, /applyBreedingSkillMemoryRequestLedger\(state,result\.state\)/);
  assert.doesNotMatch(create, /listBreedingSkillMemoryCandidates|Math\.random/);

  const migrateLoaded = functionSource(js, 'migrateLoadedState');
  assert.match(migrateLoaded, /applyBreedingSkillMemoryRequestLedger\(state,clean\)/);

  const prepare = functionSource(js, 'prepareHatchedChildForLive');
  assert.doesNotMatch(prepare, /learnInheritedSkillMemory|equipSkill/);

  const renderSkills = functionSource(js, 'renderSkills');
  assert.match(renderSkills, /resolveInheritedSkillMemoryEligibility\(inst\)/);
  assert.match(renderSkills, /data-learn-memory="\$\{inst\.instanceId\}"/);

  const learn = functionSource(js, 'learnSkillMemory');
  assert.match(learn, /learnInheritedSkillMemory\(inst\)/);
  assert.match(learn, /saveGame\(false\)/);
  assert.doesNotMatch(learn, /equipSkill|slot:'s[1-4]'/);

  const renderBreeding = functionSource(js, 'renderBreeding');
  assert.match(renderBreeding, /egg\.inheritedSkillMemoryId\|\|'ไม่มี'/);
}

liveContract(gameSource, htmlSource);

const gameMutants = [
  ['drop initial raw request ledger', 'eggs:[],breedingSkillMemoryRequestByEggId:{},breeding:', 'eggs:[],breeding:'],
  ['swap Holder and Partner candidate roles', 'listBreedingSkillMemoryCandidates(eggHolder,partner)', 'listBreedingSkillMemoryCandidates(partner,eggHolder)'],
  ['write method instead of SkillID option', 'option.value=candidate.skillId', 'option.value=candidate.method'],
  ['randomize memory choice UI', "const select=el('breedingSkillMemory');if(!select)return[];", "const select=el('breedingSkillMemory');Math.random();if(!select)return[];"],
  ['ignore caller selection', "inheritedSkillMemoryId=el('breedingSkillMemory')?.value||null", 'inheritedSkillMemoryId=null'],
  ['drop memory command field', 'genderSeed:genderSeedWords[0],inheritedSkillMemoryId,now', 'genderSeed:genderSeedWords[0],now'],
  ['drop live create ledger adoption', 'applyBreedingSkillMemoryRequestLedger(state,result.state);', ''],
  ['drop live load ledger restore', 'applyBreedingSkillMemoryRequestLedger(state,clean);', ''],
  ['auto-derive during create', 'const result=createStandardBreedingEggTransaction(state,', 'listBreedingSkillMemoryCandidates(compat.eggHolder,compat.partner);const result=createStandardBreedingEggTransaction(state,'],
  ['auto-learn during hatch preparation', 'synchronizeStage1Learnset(child);', 'synchronizeStage1Learnset(child);learnInheritedSkillMemory(child);'],
  ['hide memory eligibility in Skills UI', 'resolveInheritedSkillMemoryEligibility(inst)', "({eligible:false,reason:'hidden'})"],
  ['remove memory action button', 'data-learn-memory=', 'data-memory-hidden='],
  ['use generic learn path for memory', 'const result=learnInheritedSkillMemory(inst);', "const result={ok:!!learnSkill(inst,{skillId:inst.inheritedSkillMemoryId,slot:null}),skill:{skillId:inst.inheritedSkillMemoryId}};"],
  ['equip memory after relearn', 'const result=learnInheritedSkillMemory(inst);', "const result=learnInheritedSkillMemory(inst);equipSkill(inst,{skillId:inst.inheritedSkillMemoryId,slot:'s1'});"],
  ['skip save after memory relearn', "msg(`${displayName(inst)} เรียน ${result.skill.skillId} จาก Skill Memory • ยังไม่ติดตั้งในสล็อต`);\n  renderManager();if(currentManagerTab==='skills')renderSkills();saveGame(false);", "msg(`${displayName(inst)} เรียน ${result.skill.skillId} จาก Skill Memory • ยังไม่ติดตั้งในสล็อต`);\n  renderManager();if(currentManagerTab==='skills')renderSkills();"],
  ['hide memory on egg card', "egg.inheritedSkillMemoryId||'ไม่มี'", "'ไม่แสดง'"],
];

for (const [name, before, after] of gameMutants) {
  const source = gameSource.replace(before, after);
  assert.notEqual(source, gameSource, `${name} mutation must alter source`);
  let killed = false;
  try {
    liveContract(source, htmlSource);
  } catch {
    killed = true;
  }
  assert.equal(killed, true, `${name} must be killed`);
}

const htmlMutants = [
  ['remove memory selector', 'id="breedingSkillMemory"', 'id="breedingSkillMemoryRemoved"'],
  ['auto-select a non-null memory', '<option value="">ไม่ส่งต่อ Skill Memory</option>', '<option value="SK_AUTO">ส่งต่ออัตโนมัติ</option>'],
];

for (const [name, before, after] of htmlMutants) {
  const source = htmlSource.replace(before, after);
  assert.notEqual(source, htmlSource, `${name} mutation must alter source`);
  let killed = false;
  try {
    liveContract(gameSource, source);
  } catch {
    killed = true;
  }
  assert.equal(killed, true, `${name} must be killed`);
}

console.log(`V8.1 A33 Skill Memory live mutants: PASS (${gameMutants.length + htmlMutants.length}/${gameMutants.length + htmlMutants.length} killed)`);
