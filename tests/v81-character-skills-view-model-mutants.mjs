import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceUrl = new URL('../character-skills-view-model.mjs', import.meta.url);
const originalSource = fs.readFileSync(sourceUrl, 'utf8');

async function loadSource(source, tag) {
  const absolute = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  const encoded = Buffer.from(`${absolute}\n//# sourceURL=${tag}`).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

function context() {
  return {
    monsterId: 'mutant-monster',
    monsterName: 'Mutant Guard',
    passiveId: 'PASS_FIRE_01',
    passiveLabel: 'Passive',
    evolutionTrait: 'Trait',
  };
}

function instance() {
  return {
    instanceId: 'mutant-monster',
    skills: [
      { skillId: 'basic_attack', slot: 'basicAI', currentUses: 0 },
      { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 0, masteryExp: 100, masteryRank: 'master' },
      { skillId: 'SK_ICE_04', slot: 's3', currentUses: 10 },
      { skillId: 'SK_LIGHT_04', slot: 's4', currentUses: 7, masteryExp: 1500 },
    ],
  };
}

function assertContract(module) {
  const policy = module.CHARACTER_SKILLS_POLICY;
  assert.deepEqual(policy.manualSlots, ['s1','s2','s3','s4']);
  assert.equal(Object.isFrozen(policy.manualSlots), true);
  assert.equal(policy.surface, 'character_information_right_tab_only');
  assert.equal(policy.basicAiSeparate, true);
  assert.equal(policy.presentationOnly, true);
  assert.equal(policy.consumesUses, false);
  assert.equal(policy.persistsCooldownRemaining, false);
  assert.equal(policy.quickPanelAuthority, false);
  assert.equal(policy.lowerPaneAuthority, false);
  assert.equal(policy.descriptorJoinKey, 'exact_SkillID');
  assert.equal(policy.lightRuntimeActivation, 'deferred_D2');

  const raw = instance();
  const before = structuredClone(raw);
  const model = module.createCharacterSkillsViewModel(raw, context());
  assert.deepEqual(raw, before);
  assert.equal(model.ok, true);
  assert.deepEqual(model.manualSlots.map(row => row.slot), ['s1','s2','s3','s4']);
  assert.deepEqual(model.rows.map(row => row.key), ['basicAI','s1','s2','s3','s4','passive','evolutionTrait']);
  assert.equal(model.systemRows[0].usesConsumed, 0);
  assert.equal(model.systemRows[0].usesText, 'ไม่ใช้ Uses');
  assert.equal(model.manualSlots[0].state, 'No Uses');
  assert.equal(model.manualSlots[0].currentUses, 0);
  assert.equal(model.manualSlots[0].maxUses, 28);
  assert.equal(model.manualSlots[0].cooldownSec, 1.8);
  assert.equal(model.manualSlots[0].masteryRank, 'familiar');
  assert.equal(model.manualSlots[1].state, 'Locked/Not Learned');
  assert.equal(model.manualSlots[2].documentedIconKind, 'groundpoint-fallback');
  assert.equal(model.manualSlots[2].documentedRuntimeCoverage, 'CURRENT_GAP');
  assert.equal(model.manualSlots[2].canCrit, false);
  assert.equal(model.manualSlots[3].sourceType, 'LIGHT');
  assert.equal(model.manualSlots[3].runtimeType, 'Fairy');
  assert.equal(model.manualSlots[3].typeSymbol, '✦');
  assert.match(model.manualSlots[3].accessibilityLabelTH, /ธาตุ แสง/);
  for (const value of [model, model.manualSlots, model.systemRows, model.rows, ...model.rows]) {
    assert.equal(Object.isFrozen(value), true);
  }

  const unknown = module.createCharacterSkillsViewModel({
    instanceId: 'unknown',
    skills: [{ skillId: ' SK_FIRE_01', slot: 's1', currentUses: 1 }],
  }, context());
  assert.equal(unknown.manualSlots[0].state, 'Invalid');
  assert.ok(unknown.issues.some(entry => entry.code === 'unknown_skill_id'));

  const malformed = module.createCharacterSkillsViewModel({
    instanceId: 'uses',
    skills: [{ skillId: 'SK_FIRE_01', slot: 's1', currentUses: '7' }],
  }, context());
  assert.equal(malformed.manualSlots[0].state, 'Invalid');
  assert.equal(malformed.manualSlots[0].currentUses, null);

  const mutableSkillId = { poisoned: false };
  const objectSkillId = module.createCharacterSkillsViewModel({
    instanceId: 'object-skill-id',
    skills: [{ skillId: mutableSkillId, slot: 's1', currentUses: 1 }],
  }, context());
  assert.equal(objectSkillId.manualSlots[0].state, 'Invalid');
  assert.equal(objectSkillId.manualSlots[0].skillId, null);
  mutableSkillId.poisoned = true;
  assert.equal(objectSkillId.manualSlots[0].skillId, null);

  const duplicate = module.createCharacterSkillsViewModel({
    instanceId: 'duplicate',
    skills: [
      { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 1 },
      { skillId: 'SK_ICE_04', slot: 's1', currentUses: 1 },
    ],
  }, context());
  assert.equal(duplicate.manualSlots[0].state, 'Invalid');
  assert.equal(duplicate.manualSlots[0].skillId, null);

  const duplicateBasicA = module.createCharacterSkillsViewModel({
    instanceId: 'duplicate-basic',
    skills: [{ skillId: 'basic-a', slot: 'basicAI' }, { skillId: 'basic-b', slot: 'basicAI' }],
  }, context());
  const duplicateBasicB = module.createCharacterSkillsViewModel({
    instanceId: 'duplicate-basic',
    skills: [{ skillId: 'basic-b', slot: 'basicAI' }, { skillId: 'basic-a', slot: 'basicAI' }],
  }, context());
  assert.deepEqual(duplicateBasicB, duplicateBasicA);
  assert.equal(duplicateBasicA.systemRows[0].skillId, 'basic_attack');
  assert.equal(duplicateBasicA.systemRows[0].action, 'basic_attack');

  const foreignBasic = module.createCharacterSkillsViewModel({
    instanceId: 'foreign-basic',
    skills: [{ skillId: 'SK_FIRE_01', slot: 'basicAI' }],
  }, context());
  assert.equal(foreignBasic.ok, false);
  assert.equal(foreignBasic.systemRows[0].state, 'Invalid');
  assert.equal(foreignBasic.systemRows[0].skillId, 'basic_attack');

  const mutableSlot = { poisoned: false };
  const invalidSlot = module.createCharacterSkillsViewModel({
    instanceId: 'invalid-slot',
    skills: [{ skillId: 'SK_FIRE_01', slot: mutableSlot }],
  }, context());
  const slotIssue = invalidSlot.issues.find(entry => entry.code === 'invalid_slot');
  assert.equal(slotIssue.slot, null);
  mutableSlot.poisoned = true;
  assert.equal(slotIssue.slot, null);

  const oversized = module.createCharacterSkillsViewModel({
    instanceId: 'oversized',
    skills: Array.from({ length: 110 }, (_, index) => ({ skillId: `oversized-${index}`, slot: null })),
  }, context());
  assert.equal(oversized.available, false);
  assert.equal(oversized.reason, 'invalid_skills');

  let reads = 0;
  const accessor = { slot: 's1', currentUses: 1 };
  Object.defineProperty(accessor, 'skillId', { enumerable: true, get() { reads += 1; return 'SK_FIRE_01'; } });
  const accessorModel = module.createCharacterSkillsViewModel({ instanceId: 'accessor', skills: [accessor] }, context());
  assert.equal(accessorModel.ok, false);
  assert.equal(reads, 0);
}

assertContract(await loadSource(originalSource, 'character-skills-current'));

function replaceOnce(before, after) {
  return source => {
    const mutated = source.replace(before, after);
    assert.notEqual(mutated, source, `mutation target missing: ${before}`);
    return mutated;
  };
}

const mutants = [
  ['remove S4', replaceOnce("const MANUAL_SLOTS = Object.freeze([...MANUAL_SKILL_SLOTS]);", "const MANUAL_SLOTS = Object.freeze(['s1','s2','s3']);")],
  ['make slots mutable', replaceOnce('const MANUAL_SLOTS = Object.freeze([...MANUAL_SKILL_SLOTS]);', 'const MANUAL_SLOTS = [...MANUAL_SKILL_SLOTS];')],
  ['fold Basic AI into manual', replaceOnce('basicAiSeparate: true', 'basicAiSeparate: false')],
  ['allow presentation mutation', replaceOnce('presentationOnly: true', 'presentationOnly: false')],
  ['claim Uses consumption', replaceOnce('consumesUses: false', 'consumesUses: true')],
  ['persist runtime cooldown', replaceOnce('persistsCooldownRemaining: false', 'persistsCooldownRemaining: true')],
  ['make quick panel authority', replaceOnce('quickPanelAuthority: false', 'quickPanelAuthority: true')],
  ['make lower pane authority', replaceOnce('lowerPaneAuthority: false', 'lowerPaneAuthority: true')],
  ['normalize SkillID join', replaceOnce(
    'const descriptor = skillIconDescriptor(equipped.skillId);\n    if (!descriptor) {',
    'const descriptor = skillIconDescriptor(equipped.skillId.trim());\n    if (!descriptor) {',
  )],
  ['activate LIGHT', replaceOnce("lightRuntimeActivation: 'deferred_D2'", "lightRuntimeActivation: 'active'")],
  ['show runtime type as source type', replaceOnce('sourceType: descriptor.sourceType,', 'sourceType: descriptor.runtimeType,')],
  ['invent GroundPoint icon', replaceOnce('documentedIconKind: descriptor.documentedIconKind,', "documentedIconKind: descriptor.targetType === 'GroundPoint' ? 'area' : descriptor.documentedIconKind,")],
  ['erase GroundPoint gap', replaceOnce('documentedRuntimeCoverage: descriptor.documentedRuntimeCoverage,', "documentedRuntimeCoverage: descriptor.targetType === 'GroundPoint' ? 'CURRENT' : descriptor.documentedRuntimeCoverage,")],
  ['derive crit from target', replaceOnce('canCrit: descriptor.canCrit,', "canCrit: descriptor.targetType !== 'Self',")],
  ['replace CurrentUses with max', replaceOnce("const currentUses = record.currentUses == null ? descriptor.maxUses : record.currentUses;", 'const currentUses = descriptor.maxUses;')],
  ['replace descriptor cooldown', replaceOnce('cooldownSec: descriptor.cooldownSec,', 'cooldownSec: 99,')],
  ['trust stored mastery rank', replaceOnce('const masteryRank = masteryRankFromExp(masteryExp);', "const masteryRank = record.masteryRank ?? 'novice';")],
  ['meter Basic AI', replaceOnce('usesConsumed: OWNED_BASIC_AI_POLICY.usesConsumed,', 'usesConsumed: 1,')],
  ['replace policy Basic AI identity', replaceOnce("skillId: 'basic_attack',", "skillId: 'SK_FIRE_01',")],
  ['accept foreign Basic AI identity', replaceOnce(
    "const invalidBasicAiRecords = basicRecords.filter(record => record.skillId !== 'basic_attack');",
    'const invalidBasicAiRecords = basicRecords.filter(() => false);',
  )],
  ['remove bounded skill snapshot', replaceOnce('if (length > MAX_SKILL_RECORDS) return null;', 'if (false) return null;')],
  ['publish raw issue object', replaceOnce(
    "normalized[key] = value === null || ['string', 'number', 'boolean'].includes(typeof value)\n      ? value\n      : null;",
    'normalized[key] = value;',
  )],
  ['publish raw invalid SkillID', replaceOnce(
    "const normalizedSkillId = typeof skillId === 'string' ? skillId : null;",
    'const normalizedSkillId = skillId;',
  )],
  ['first duplicate slot wins', replaceOnce('if (records.length > 1) {', 'if (false) {')],
  ['accept string Uses', replaceOnce('if (!Number.isInteger(currentUses) || currentUses < 0 || currentUses > descriptor.maxUses) {', 'if (!Number.isFinite(Number(currentUses)) || Number(currentUses) < 0 || Number(currentUses) > descriptor.maxUses) {')],
  ['publish mutable success model', replaceOnce('return Object.freeze({\n    ok: sortedIssues.length === 0,', 'return ({\n    ok: sortedIssues.length === 0,')],
  ['invoke record getter', replaceOnce("if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;\n    present.add(key);\n    values[key] = descriptor.value;", "if (!descriptor) return null;\n    present.add(key);\n    values[key] = Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : value[key];")],
];

let killed = 0;
for (let index = 0; index < mutants.length; index += 1) {
  const [name, mutate] = mutants[index];
  try {
    assertContract(await loadSource(mutate(originalSource), `character-skills-mutant-${index}`));
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

assert.equal(killed, mutants.length);
console.log(`V8.1 A37 Character Skills view-model mutants: PASS (${killed}/${mutants.length} killed)`);
