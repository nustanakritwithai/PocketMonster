import assert from 'node:assert/strict';
import { MONSTER_CATALOG } from '../monster-catalog.mjs';
import { SKILL_ICON_CATALOG, skillIconDescriptor } from '../skill-icon-descriptor.mjs';
import { workbookDefaultSkillIds } from '../skill-progression.mjs';
import {
  CHARACTER_SKILLS_POLICY,
  createCharacterSkillsViewModel,
} from '../character-skills-view-model.mjs';

const context = Object.freeze({
  monsterId: 'focus-a',
  monsterName: 'Flameling',
  passiveId: 'PASS_FIRE_01',
  passiveLabel: 'Flame Body (แก่นเพลิง)',
  evolutionTrait: 'Solar Crest',
});

function specimen(overrides = {}) {
  return {
    instanceId: 'focus-a',
    skills: [
      { skillId: 'basic_attack', slot: 'basicAI', currentUses: 0 },
      { skillId: 'SK_LIGHT_04', slot: 's4', currentUses: 7, masteryExp: 1500, masteryRank: 'novice', mutationId: '<spark>' },
      { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 0, masteryExp: 100, masteryRank: 'master' },
      { skillId: 'SK_ICE_04', slot: 's3', currentUses: 10, masteryExp: 300 },
    ],
    ...overrides,
  };
}

assert.deepEqual(CHARACTER_SKILLS_POLICY.manualSlots, ['s1', 's2', 's3', 's4']);
assert.equal(Object.isFrozen(CHARACTER_SKILLS_POLICY.manualSlots), true);
assert.equal(CHARACTER_SKILLS_POLICY.surface, 'character_information_right_tab_only');
assert.equal(CHARACTER_SKILLS_POLICY.basicAiSeparate, true);
assert.equal(CHARACTER_SKILLS_POLICY.presentationOnly, true);
assert.equal(CHARACTER_SKILLS_POLICY.consumesUses, false);
assert.equal(CHARACTER_SKILLS_POLICY.persistsCooldownRemaining, false);
assert.equal(CHARACTER_SKILLS_POLICY.quickPanelAuthority, false);
assert.equal(CHARACTER_SKILLS_POLICY.lowerPaneAuthority, false);
assert.equal(CHARACTER_SKILLS_POLICY.lightRuntimeActivation, 'deferred_D2');

const instance = specimen();
const before = structuredClone(instance);
const view = createCharacterSkillsViewModel(instance, context);
assert.equal(view.ok, true);
assert.equal(view.available, true);
assert.deepEqual(instance, before, 'projection must not mutate the monster or its skill records');
assert.deepEqual(view.manualSlots.map(row => row.slot), ['s1', 's2', 's3', 's4']);
assert.deepEqual(view.rows.map(row => row.key), ['basicAI', 's1', 's2', 's3', 's4', 'passive', 'evolutionTrait']);
assert.equal(view.rows.length, 7, 'Basic AI and system rows remain outside the four manual slots');
assert.equal(view.systemRows[0].key, 'basicAI');
assert.equal(view.systemRows[0].usesConsumed, 0);
assert.equal(view.systemRows[0].usesText, 'ไม่ใช้ Uses');
assert.equal(view.systemRows[0].cooldownSec, 0.9);

const [s1, s2, s3, s4] = view.manualSlots;
assert.deepEqual(
  {
    skillId: s1.skillId,
    state: s1.state,
    nameTH: s1.nameTH,
    sourceType: s1.sourceType,
    runtimeType: s1.runtimeType,
    typeSymbol: s1.typeSymbol,
    categoryMarker: s1.categoryMarker,
    targetType: s1.targetType,
    currentUses: s1.currentUses,
    maxUses: s1.maxUses,
    usesText: s1.usesText,
    cooldownSec: s1.cooldownSec,
    canCrit: s1.canCrit,
    masteryRank: s1.masteryRank,
  },
  {
    skillId: 'SK_FIRE_01',
    state: 'No Uses',
    nameTH: 'สะเก็ดไฟ',
    sourceType: 'FIRE',
    runtimeType: 'Fire',
    typeSymbol: '🔥',
    categoryMarker: '╱',
    targetType: 'NearestEnemy',
    currentUses: 0,
    maxUses: 28,
    usesText: '0/28',
    cooldownSec: 1.8,
    canCrit: true,
    masteryRank: 'familiar',
  },
  'static fields come from the exact A36 SkillID descriptor; rank derives from EXP',
);
assert.equal(s2.skillId, null);
assert.equal(s2.state, 'Locked/Not Learned');
assert.equal(s2.equipped, false);
assert.equal(s2.usesText, '—');
assert.equal(s3.skillId, 'SK_ICE_04');
assert.equal(s3.targetType, 'GroundPoint');
assert.equal(s3.documentedIconKind, 'groundpoint-fallback');
assert.equal(s3.documentedRuntimeCoverage, 'CURRENT_GAP');
assert.equal(s3.canCrit, false);
assert.equal(s4.skillId, 'SK_LIGHT_04');
assert.equal(s4.sourceType, 'LIGHT');
assert.equal(s4.runtimeType, 'Fairy');
assert.equal(s4.typeSymbol, '✦');
assert.equal(s4.typeDecision, 'D2_FAIRY_CANONICAL_LIGHT_DEFERRED');
assert.match(s4.accessibilityLabelTH, /ธาตุ แสง/);
assert.equal(s4.masteryRank, 'master');
assert.equal(s4.mutationId, '<spark>');

for (const value of [view, view.monster, view.manualSlots, view.systemRows, view.rows, ...view.rows]) {
  assert.equal(Object.isFrozen(value), true, 'all published projection layers are immutable');
}
assert.strictEqual(s1.descriptor, skillIconDescriptor('SK_FIRE_01'), 'projection retains the immutable A36 descriptor identity');
assert.equal(Object.isFrozen(s1.descriptor), true);

const missingUses = createCharacterSkillsViewModel({
  instanceId: 'legacy',
  skills: [{ skillId: 'SK_FIRE_01', slot: 's1' }],
}, context);
assert.equal(missingUses.manualSlots[0].currentUses, 28, 'legacy missing Uses adopts the catalog maximum');
assert.equal(missingUses.manualSlots[0].state, 'Ready');

for (const currentUses of [NaN, Infinity, '7', -1, 29, 1.5]) {
  const malformed = createCharacterSkillsViewModel({
    instanceId: 'bad-uses',
    skills: [{ skillId: 'SK_FIRE_01', slot: 's1', currentUses }],
  }, context);
  assert.equal(malformed.ok, false);
  assert.equal(malformed.manualSlots[0].state, 'Invalid');
  assert.equal(malformed.manualSlots[0].currentUses, null);
  assert.ok(malformed.issues.some(issue => issue.code === 'invalid_current_uses'));
}

for (const skillId of ['SK_UNKNOWN_01', ' SK_FIRE_01', 'sk_fire_01', '<img src=x onerror=globalThis.pwned=1>']) {
  const unknown = createCharacterSkillsViewModel({
    instanceId: 'unknown',
    skills: [{ skillId, slot: 's1', currentUses: 1 }],
  }, context);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.manualSlots[0].state, 'Invalid');
  assert.equal(unknown.manualSlots[0].skillId, skillId);
  assert.ok(unknown.issues.some(issue => issue.code === 'unknown_skill_id'));
}

const mutableSkillId = { poisoned: false };
const objectSkillIdView = createCharacterSkillsViewModel({
  instanceId: 'object-skill-id',
  skills: [{ skillId: mutableSkillId, slot: 's1', currentUses: 1 }],
}, context);
assert.equal(objectSkillIdView.ok, false);
assert.equal(objectSkillIdView.manualSlots[0].state, 'Invalid');
assert.equal(objectSkillIdView.manualSlots[0].skillId, null, 'non-string SkillID cannot escape into the immutable projection');
mutableSkillId.poisoned = true;
assert.equal(objectSkillIdView.manualSlots[0].skillId, null, 'mutating hostile input cannot alter the published row');

const duplicateA = createCharacterSkillsViewModel({
  instanceId: 'dupe',
  skills: [
    { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 1 },
    { skillId: 'SK_ICE_04', slot: 's1', currentUses: 1 },
  ],
}, context);
const duplicateB = createCharacterSkillsViewModel({
  instanceId: 'dupe',
  skills: [
    { skillId: 'SK_ICE_04', slot: 's1', currentUses: 1 },
    { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 1 },
  ],
}, context);
assert.equal(duplicateA.ok, false);
assert.equal(duplicateA.manualSlots[0].state, 'Invalid');
assert.equal(duplicateA.manualSlots[0].skillId, null, 'duplicate slots must never use first-record-wins');
assert.deepEqual(duplicateB, duplicateA, 'duplicate-slot result is independent of record order');

const duplicateSkill = createCharacterSkillsViewModel({
  instanceId: 'dupe-skill',
  skills: [
    { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 1 },
    { skillId: 'SK_FIRE_01', slot: 's2', currentUses: 1 },
  ],
}, context);
assert.equal(duplicateSkill.ok, false);
assert.deepEqual(duplicateSkill.manualSlots.slice(0, 2).map(row => row.state), ['Invalid', 'Invalid']);
assert.ok(duplicateSkill.issues.some(issue => issue.code === 'duplicate_skill_id'));

const fifth = createCharacterSkillsViewModel({
  instanceId: 'slot-five',
  skills: [{ skillId: 'SK_FIRE_01', slot: 's5', currentUses: 1 }],
}, context);
assert.equal(fifth.ok, false);
assert.ok(fifth.issues.some(issue => issue.code === 'invalid_slot'));
assert.equal(fifth.manualSlots.length, 4);

const control = createCharacterSkillsViewModel({
  instanceId: 'control',
  skills: [{ skillId: 'SK_FIRE_05', slot: 's1', currentUses: 6 }],
}, context).manualSlots[0];
assert.equal(control.category, 'Control');
assert.equal(control.canCrit, false, 'Character UI must use descriptor CanCrit, not infer from damage/effect');

let getterReads = 0;
const accessorRecord = { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 1 };
Object.defineProperty(accessorRecord, 'skillId', {
  enumerable: true,
  get() {
    getterReads += 1;
    return 'SK_FIRE_01';
  },
});
const accessorView = createCharacterSkillsViewModel({ instanceId: 'getter', skills: [accessorRecord] }, context);
assert.equal(accessorView.ok, false);
assert.equal(getterReads, 0, 'projection must reject accessors without invoking them');

const hostile = new Proxy({}, { ownKeys() { throw new Error('hostile'); } });
assert.doesNotThrow(() => createCharacterSkillsViewModel(hostile, context));
assert.equal(createCharacterSkillsViewModel(hostile, context).available, false);

let rootGetterReads = 0;
const accessorRoot = { instanceId: 'root-getter' };
Object.defineProperty(accessorRoot, 'skills', {
  enumerable: true,
  get() {
    rootGetterReads += 1;
    return [];
  },
});
assert.equal(createCharacterSkillsViewModel(accessorRoot, context).available, false);
assert.equal(rootGetterReads, 0);
const sparseSkills = [];
sparseSkills.length = 1;
assert.equal(createCharacterSkillsViewModel({ instanceId: 'sparse', skills: sparseSkills }, context).available, false);
class SkillsSubclass extends Array {}
assert.equal(createCharacterSkillsViewModel({ instanceId: 'subclass', skills: new SkillsSubclass() }, context).available, false);

const duplicateBasicAi = createCharacterSkillsViewModel({
  instanceId: 'duplicate-basic',
  skills: [{ skillId: 'basic-a', slot: 'basicAI' }, { skillId: 'basic-b', slot: 'basicAI' }],
}, context);
const duplicateBasicAiReversed = createCharacterSkillsViewModel({
  instanceId: 'duplicate-basic',
  skills: [{ skillId: 'basic-b', slot: 'basicAI' }, { skillId: 'basic-a', slot: 'basicAI' }],
}, context);
assert.equal(duplicateBasicAi.systemRows[0].state, 'Invalid');
assert.equal(duplicateBasicAi.systemRows[0].skillId, 'basic_attack', 'Basic AI identity is policy-owned');
assert.equal(duplicateBasicAi.systemRows[0].action, 'basic_attack');
assert.ok(duplicateBasicAi.issues.some(issue => issue.code === 'duplicate_slot' && issue.slot === 'basicAI'));
assert.deepEqual(duplicateBasicAiReversed, duplicateBasicAi, 'duplicate Basic AI records must not use first-record-wins');

const foreignBasicAi = createCharacterSkillsViewModel({
  instanceId: 'foreign-basic',
  skills: [{ skillId: 'SK_FIRE_01', slot: 'basicAI' }],
}, context);
assert.equal(foreignBasicAi.ok, false);
assert.equal(foreignBasicAi.systemRows[0].state, 'Invalid');
assert.equal(foreignBasicAi.systemRows[0].skillId, 'basic_attack');
assert.equal(foreignBasicAi.systemRows[0].action, 'basic_attack');
assert.ok(foreignBasicAi.issues.some(issue => issue.code === 'invalid_basic_ai_skill_id'));

const mutableInvalidSlot = { poisoned: false };
const invalidSlotView = createCharacterSkillsViewModel({
  instanceId: 'mutable-invalid-slot',
  skills: [{ skillId: 'SK_FIRE_01', slot: mutableInvalidSlot }],
}, context);
const invalidSlotIssue = invalidSlotView.issues.find(issue => issue.code === 'invalid_slot');
assert.equal(invalidSlotIssue.slot, null, 'published issue detail normalizes hostile objects to a primitive/null');
assert.equal(Object.isFrozen(invalidSlotIssue), true);
mutableInvalidSlot.poisoned = true;
assert.equal(invalidSlotIssue.slot, null, 'mutating input cannot alter an already-published issue');

const oversizedSkills = Array.from({ length: SKILL_ICON_CATALOG.length + 2 }, (_, index) => ({
  skillId: `oversized-${index}`,
  slot: null,
}));
const oversizedView = createCharacterSkillsViewModel({ instanceId: 'oversized', skills: oversizedSkills }, context);
assert.equal(oversizedView.available, false, 'skill snapshots larger than the catalog plus Basic AI fail closed');
assert.equal(oversizedView.reason, 'invalid_skills');

const cooldownLeak = createCharacterSkillsViewModel({
  instanceId: 'cooldown-leak',
  skills: [{ skillId: 'SK_FIRE_01', slot: 's1', currentUses: 4, cooldownSec: 99, cooldownRemaining: 99 }],
}, context).manualSlots[0];
assert.equal(cooldownLeak.currentUses, 4);
assert.equal(cooldownLeak.cooldownSec, 1.8, 'configured CD comes from A36; transient/persisted cooldown fields are ignored');

const empty = createCharacterSkillsViewModel(null, context);
assert.equal(empty.available, false);
assert.equal(empty.reason, 'no_focused_monster');
assert.deepEqual(empty.rows.map(row => row.key), ['basicAI', 's1', 's2', 's3', 's4', 'passive', 'evolutionTrait']);

let runtimeDefaultSlotCount = 0;
for (const monster of MONSTER_CATALOG) {
  const ids = workbookDefaultSkillIds(monster.runtimeSpeciesId);
  const matrixView = createCharacterSkillsViewModel({
    instanceId: monster.runtimeSpeciesId,
    skills: ids.map((skillId, index) => ({
      skillId,
      slot: `s${index + 1}`,
      currentUses: skillIconDescriptor(skillId).maxUses,
    })),
  }, { monsterId: monster.runtimeSpeciesId, monsterName: monster.runtimeSpeciesId });
  assert.equal(matrixView.ok, true, `${monster.runtimeSpeciesId} default loadout projects cleanly`);
  assert.deepEqual(matrixView.manualSlots.map(row => row.skillId), ids);
  runtimeDefaultSlotCount += matrixView.manualSlots.length;
}
assert.equal(runtimeDefaultSlotCount, 72, '18 runtime species × four workbook default slots join A36 exactly');

for (const descriptor of SKILL_ICON_CATALOG) {
  const row = createCharacterSkillsViewModel({
    instanceId: `all-${descriptor.skillId}`,
    skills: [{ skillId: descriptor.skillId, slot: 's1', currentUses: descriptor.maxUses }],
  }, context).manualSlots[0];
  assert.strictEqual(row.descriptor, descriptor, `${descriptor.skillId} joins by exact descriptor identity`);
  assert.deepEqual(
    [row.sourceType, row.runtimeType, row.typeSymbol, row.category, row.categoryMarker, row.targetType, row.documentedIconKind, row.documentedRuntimeCoverage, row.effect, row.effectOverlay, row.maxUses, row.cooldownSec, row.canCrit],
    [descriptor.sourceType, descriptor.runtimeType, descriptor.typeSymbol, descriptor.category, descriptor.categoryMarker, descriptor.targetType, descriptor.documentedIconKind, descriptor.documentedRuntimeCoverage, descriptor.effect, descriptor.effectOverlay, descriptor.maxUses, descriptor.cooldownSec, descriptor.canCrit],
    `${descriptor.skillId} exposes only A36-owned static fields`,
  );
}

console.log('V8.1 A37 Character Skills view model: PASS (108 descriptors; 18×4 defaults; fail-closed state)');
