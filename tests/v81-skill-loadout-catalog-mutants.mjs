import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceUrl = new URL('../skill-progression.mjs', import.meta.url);
const originalSource = fs.readFileSync(sourceUrl, 'utf8');

async function loadSource(source, tag) {
  const withAbsoluteImports = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${withAbsoluteImports}\n//# sourceURL=${tag}`).toString('base64')}`);
}

function assertLoadoutContract(module) {
  assert.deepEqual(module.MANUAL_SKILL_SLOTS, ['s1','s2','s3','s4']);
  assert.deepEqual(module.SKILL_SLOTS, ['basicAI','s1','s2','s3','s4','passive','evolutionTrait']);
  assert.deepEqual(module.WORKBOOK_DEFAULT_SKILL_SUFFIXES, ['01','02','04','03']);
  assert.deepEqual(module.workbookDefaultSkillIds('flameling'), ['SK_FIRE_01','SK_FIRE_02','SK_FIRE_04','SK_FIRE_03']);

  const instance={skills:[]};
  module.learnSkill(instance,{skillId:'SK_FIRE_03',slot:'s4'});
  assert.equal(module.consumeSkillUse(instance,{skillId:'SK_FIRE_03',castId:'s4-cast',castAccepted:true}).ok,true);
  assert.equal(module.learnSkill(instance,{skillId:'SK_FIRE_04',slot:'s5'}),null);

  const ai={skills:[]};
  module.learnSkill(ai,{skillId:'SK_NORMAL_01',slot:'basicAI'});
  assert.equal(module.consumeSkillUse(ai,{skillId:'SK_NORMAL_01',castId:'ai-cast',castAccepted:true}).reason,'manual_slot_required');
}

assertLoadoutContract(await loadSource(originalSource, 'loadout-current'));

const mutants = [
  ['remove fourth slot', "['s1', 's2', 's3', 's4']", "['s1', 's2', 's3']"],
  ['allow fifth slot', "['s1', 's2', 's3', 's4']", "['s1', 's2', 's3', 's4', 's5']"],
  ['swap workbook defaults', "['01', '02', '04', '03']", "['01', '02', '03', '04']"],
  ['meter Basic Attack as manual', "if (!MANUAL_SKILL_SLOTS.includes(skill.slot)) {", 'if (false) {'],
];

for (const [name, before, after] of mutants) {
  const source=originalSource.replace(before,after);
  assert.notEqual(source,originalSource,`${name} mutation must alter source`);
  const module=await loadSource(source,`loadout-mutant-${name.replaceAll(' ','-')}`);
  assert.throws(()=>assertLoadoutContract(module),undefined,`${name} must be killed`);
}

console.log(`V8.1 four-slot loadout mutants: PASS (${mutants.length}/${mutants.length} killed)`);
