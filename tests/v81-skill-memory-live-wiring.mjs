import assert from 'node:assert/strict';
import fs from 'node:fs';

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

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(html, /id="breedingSkillMemory"/);
assert.match(html, /value=""[^>]*>ไม่ส่งต่อ Skill Memory/,
  'memory selection defaults to explicit null, never an implicit candidate');
assert.match(js, /listBreedingSkillMemoryCandidates/);
assert.match(js, /resolveInheritedSkillMemoryEligibility/);
assert.match(js, /learnInheritedSkillMemory/);
assert.match(js, /eggs:\[\],breedingSkillMemoryRequestByEggId:\{\},breeding:/,
  'live state initializes the raw Skill Memory command ledger');

const renderChoice = functionSource(js, 'renderBreedingSkillMemoryChoices');
assert.match(renderChoice, /listBreedingSkillMemoryCandidates\(eggHolder,partner\)/);
assert.match(renderChoice, /document\.createElement\('option'\)/);
assert.match(renderChoice, /option\.value=candidate\.skillId/);
assert.doesNotMatch(renderChoice, /Math\.random|rand\(|createRng/,
  'Skill Memory choice rendering must not select or shuffle by RNG');

const create = functionSource(js, 'createEgg');
assert.match(create, /el\('breedingSkillMemory'\)\?\.value\|\|null/);
assert.match(create, /inheritedSkillMemoryId/);
assert.match(create, /createStandardBreedingEggTransaction\(state/);
assert.match(create, /applyBreedingSkillMemoryRequestLedger\(state,result\.state\)/,
  'live create adopts the reducer command ledger before save');
assert.doesNotMatch(create, /listBreedingSkillMemoryCandidates|Math\.random/,
  'create uses the caller selection; it never auto-derives or rolls a memory');

const migrateLoaded = functionSource(js, 'migrateLoadedState');
assert.match(migrateLoaded, /applyBreedingSkillMemoryRequestLedger\(state,clean\)/,
  'local/Firebase load restores or resets the raw command ledger');

const prepareHatch = functionSource(js, 'prepareHatchedChildForLive');
assert.doesNotMatch(prepareHatch, /learnInheritedSkillMemory|equipSkill/,
  'hatch preparation cannot learn or equip the inherited memory');

const renderSkills = functionSource(js, 'renderSkills');
assert.match(renderSkills, /resolveInheritedSkillMemoryEligibility\(inst\)/);
assert.match(renderSkills, /data-learn-memory="\$\{inst\.instanceId\}"/);

const learnMemory = functionSource(js, 'learnSkillMemory');
assert.match(learnMemory, /learnInheritedSkillMemory\(inst\)/);
assert.match(learnMemory, /saveGame\(false\)/);
assert.doesNotMatch(learnMemory, /equipSkill|slot:'s[1-4]'/,
  'explicit relearn remains un-slotted');

assert.match(js, /egg\.inheritedSkillMemoryId/,
  'Incubator rendering exposes the persisted memory selection');

console.log('V8.1 A33 Skill Memory live wiring: PASS');
