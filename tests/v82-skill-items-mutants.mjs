import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceUrl = new URL('../skill-items.mjs', import.meta.url);
const original = fs.readFileSync(sourceUrl, 'utf8');

async function loadSource(source, tag) {
  const absoluteImports = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(relativePath, sourceUrl).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${absoluteImports}\n//# sourceURL=${tag}`).toString('base64')}`);
}

function state() {
  return {
    collection: [{
      instanceId: 'fire', speciesId: 'normalooze', level: 10,
      body: { hunger: 60 }, mind: { bond: 30 },
      skills: [{ skillId: 'SK_NORMAL_02', slot: 's1', masteryExp: 444, masteryRank: 'expert', currentUses: 6 }],
    }],
    inventory: { emberFruit: 2 },
    skillItemUseCommandIds: [],
  };
}

function command(commandId = 'mutant-command') {
  return {
    monsterId: 'fire', itemId: 'emberFruit', slot: 's1',
    expectedOccupantSkillId: 'SK_NORMAL_02', commandId, now: 999,
  };
}

async function contract(module) {
  const live = state();
  const before = structuredClone(live);
  let persisted = 0;
  const committed = module.commitSkillItemUse({
    state: live,
    command: command(),
    persistCandidate(nextState) { persisted += 1; return { state: nextState }; },
  });
  assert.equal(committed.ok, true, committed.reason);
  assert.equal(persisted, 1);
  assert.deepEqual(live, before, 'transaction cannot mutate live input before publish');
  assert.equal(committed.nextState.inventory.emberFruit, 1, 'consume exactly one');
  const displaced = committed.nextMonster.skills.find(skill => skill.skillId === 'SK_NORMAL_02');
  assert.deepEqual(displaced, {
    skillId: 'SK_NORMAL_02', slot: null, masteryExp: 444, masteryRank: 'expert', currentUses: 6,
  }, 'replacement retains old learned skill and progression');
  const learned = committed.nextMonster.skills.find(skill => skill.skillId === 'SK_FIRE_01');
  assert.equal(learned.slot, 's1');
  assert.equal(learned.sourceKind, 'skillItem');
  assert.equal(learned.sourceItemId, 'emberFruit');
  assert.equal(learned.learnedAt, 999);

  const replay = module.commitSkillItemUse({
    state: committed.nextState,
    command: command(),
    persistCandidate() { assert.fail('replay reached persistence'); },
  });
  assert.equal(replay.reason, module.SKILL_ITEM_REASONS.DUPLICATE_COMMAND);

  const persistenceLive = state();
  const persistenceBefore = structuredClone(persistenceLive);
  const failed = module.commitSkillItemUse({
    state: persistenceLive,
    command: command('persist-fail'),
    persistCandidate() { throw new Error('disk'); },
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, module.SKILL_ITEM_REASONS.PERSISTENCE_FAILED);
  assert.deepEqual(persistenceLive, persistenceBefore);
}

await contract(await loadSource(original, 'skill-items-current'));

const mutants = [
  ['skip item consumption', '[resolved.item.id]: operation.itemQuantityBefore - 1,', '[resolved.item.id]: operation.itemQuantityBefore,'],
  ['consume two items', '[resolved.item.id]: operation.itemQuantityBefore - 1,', '[resolved.item.id]: operation.itemQuantityBefore - 2,'],
  ['mutate original skills', 'const nextSkills = resolved.monster.skills.map(skill => ({ ...skill }));', 'const nextSkills = resolved.monster.skills;'],
  ['delete displaced skill retention', 'if (displaced) displaced.slot = null;', 'if (displaced) nextSkills.splice(nextSkills.indexOf(displaced), 1);'],
  ['drop acquisition provenance', 'sourceKind: SKILL_ITEM_SOURCE_KIND,', "sourceKind: 'unknown',"],
  ['accept duplicate command', 'if (history.includes(normalizedCommandId)) {', 'if (false) {'],
  ['publish persistence failure', 'return result(false, SKILL_ITEM_REASONS.PERSISTENCE_FAILED, {', 'return result(true, null, {'],
];

let killed = 0;
for (const [name, from, to] of mutants) {
  const mutant = original.replace(from, to);
  assert.notEqual(mutant, original, `${name}: mutation must apply`);
  const loaded = await loadSource(mutant, `skill-items-mutant-${name}`);
  await assert.rejects(() => contract(loaded), undefined, `${name} must be killed`);
  killed += 1;
}

console.log(`V8.9 skill item mutants: PASS (${killed}/${mutants.length} killed)`);
