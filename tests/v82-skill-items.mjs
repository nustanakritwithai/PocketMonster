import assert from 'node:assert/strict';
import { SKILL_ITEM_CATALOG } from '../content-catalog.mjs';
import { skillCatalogEntry } from '../skill-catalog.mjs';
import {
  SKILL_ITEM_COMMAND_HISTORY_LIMIT,
  SKILL_ITEM_REASONS,
  applySkillItemUse,
  commitSkillItemUse,
  normalizeSkillItemCommandIds,
  resolveSkillItemUse,
  skillItemAcquisitionDiagnostics,
  validateSkillItemCatalog,
} from '../skill-items.mjs';
import {
  SAVE_KEY,
  SAVE_SCHEMA_VERSION,
  normalizeSavedState,
  readStoredSave,
  sanitizeStateForPersistence,
  writeStoredSave,
} from '../save-schema.mjs';

class MemoryStorage {
  values = new Map();
  failCurrentWrite = false;
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) {
    if (this.failCurrentWrite && key === SAVE_KEY) throw new Error('quota');
    this.values.set(key, String(value));
  }
}

function monster(overrides = {}) {
  return {
    instanceId: 'fire-1',
    speciesId: 'normalooze',
    level: 12,
    body: { hunger: 61, energy: 72, fitness: 50, health: 96 },
    mind: { mood: 74, stress: 8, bond: 35, trust: 30, discipline: 28 },
    skills: [{
      skillId: 'SK_NORMAL_02', slot: 's1', masteryExp: 333,
      masteryRank: 'skilled', currentUses: 7, mutationId: 'dash-wide',
    }],
    ...overrides,
  };
}

function fixture(overrides = {}) {
  const owned = overrides.monster ?? monster();
  const { monster: _monster, ...stateOverrides } = overrides;
  return {
    collection: [owned],
    party: [owned.instanceId, null, null],
    storage: [],
    ranchActive: [],
    inventory: { emberFruit: 2, stash: [] },
    skillItemUseCommandIds: [],
    saveVersion: 13,
    ...stateOverrides,
  };
}

function command(id, extra = {}) {
  return {
    monsterId: 'fire-1', itemId: 'emberFruit', slot: 's4',
    expectedOccupantSkillId: null, commandId: id, now: 1_700_000_000_000,
    ...extra,
  };
}

assert.deepEqual(validateSkillItemCatalog(), { ok: true, issues: [] });
assert.equal(SKILL_ITEM_CATALOG.emberFruit.grantsSkillId, 'SK_FIRE_01');
assert.equal(SKILL_ITEM_CATALOG.emberFruit.consumeOn, 'success');
assert.equal(Object.isFrozen(SKILL_ITEM_CATALOG.emberFruit), true);
assert.equal(Object.isFrozen(SKILL_ITEM_CATALOG.emberFruit.compatibility), true);

{
  const state = fixture();
  const before = structuredClone(state);
  const planned = resolveSkillItemUse({ state, ...command('empty-slot') });
  assert.equal(planned.ok, true);
  const applied = applySkillItemUse({ state, operation: planned.operation });
  assert.equal(applied.ok, true);
  assert.deepEqual(state, before, 'resolve/apply is copy-on-write and never consumes live state');
  assert.notStrictEqual(applied.nextState, state);
  assert.notStrictEqual(applied.nextState.collection, state.collection);
  assert.notStrictEqual(applied.nextMonster, state.collection[0]);
  assert.notStrictEqual(applied.nextState.inventory, state.inventory);
  assert.equal(applied.nextState.inventory.emberFruit, 1, 'success consumes exactly one');
  assert.deepEqual(applied.learnedSkill, {
    skillId: 'SK_FIRE_01', slot: 's4', masteryExp: 0, masteryRank: 'novice',
    mutationId: null, currentUses: skillCatalogEntry('SK_FIRE_01').maxUses,
    sourceKind: 'skillItem', sourceItemId: 'emberFruit', learnedAt: command('x').now,
  });
  assert.deepEqual(applied.nextState.skillItemUseCommandIds, ['empty-slot']);
  assert.deepEqual(applied.nextMonster.body, before.collection[0].body, 'learning cannot modify Body');
  assert.deepEqual(applied.nextMonster.mind, before.collection[0].mind, 'learning cannot modify Mind');
}

{
  const state = fixture();
  const first = resolveSkillItemUse({ state, ...command('replace', { slot: 's1', expectedOccupantSkillId: undefined }) });
  assert.equal(first.reason, SKILL_ITEM_REASONS.CONFIRMATION_REQUIRED);
  assert.equal(first.occupantSkillId, 'SK_NORMAL_02');
  const confirmed = resolveSkillItemUse({ state, ...command('replace', { slot: 's1', expectedOccupantSkillId: 'SK_NORMAL_02' }) });
  assert.equal(confirmed.ok, true);
  const applied = applySkillItemUse({ state, operation: confirmed.operation });
  const oldSkill = applied.nextMonster.skills.find(skill => skill.skillId === 'SK_NORMAL_02');
  assert.deepEqual(oldSkill, {
    skillId: 'SK_NORMAL_02', slot: null, masteryExp: 333,
    masteryRank: 'skilled', currentUses: 7, mutationId: 'dash-wide',
  }, 'replacement keeps the old learned record and all progression/resources');
  assert.equal(applied.displacedSkillId, 'SK_NORMAL_02');
  assert.equal(applied.nextMonster.skills.length, 2);
}

function rejected(state, expectedReason, extra = {}) {
  const before = structuredClone(state);
  let persisted = 0;
  const outcome = commitSkillItemUse({
    state,
    command: command(`reject:${expectedReason}`, extra),
    persistCandidate() { persisted += 1; },
  });
  assert.equal(outcome.reason, expectedReason);
  assert.deepEqual(state, before);
  assert.equal(persisted, 0, `${expectedReason} must not reach persistence`);
}

rejected(fixture({ inventory: { emberFruit: 0, stash: [] } }), SKILL_ITEM_REASONS.ITEM_EMPTY);
rejected(fixture({ monster: monster({ speciesId: 'aquaphin' }) }), SKILL_ITEM_REASONS.INCOMPATIBLE_TYPE);
rejected(fixture({ monster: monster({ level: 4 }) }), SKILL_ITEM_REASONS.LEVEL_REQUIRED);
rejected(fixture({ monster: monster({ skills: [{ skillId: 'SK_FIRE_01', slot: 's2', currentUses: 12 }] }) }), SKILL_ITEM_REASONS.ALREADY_LEARNED);
rejected(fixture(), SKILL_ITEM_REASONS.SLOT_LOCKED, { slot: 'basicAI' });
rejected(fixture(), SKILL_ITEM_REASONS.INVALID_SLOT, { slot: 's5' });
rejected(fixture(), SKILL_ITEM_REASONS.STALE_SLOT, { slot: 's1', expectedOccupantSkillId: 'SK_FIRE_04' });
rejected(fixture({ skillItemUseCommandIds: ['reject:duplicate_command'] }), SKILL_ITEM_REASONS.DUPLICATE_COMMAND);
rejected(fixture({ monster: monster({ skills: [
  { skillId: 'SK_FIRE_02', slot: 's1' },
  { skillId: 'SK_FIRE_04', slot: 's1' },
] }) }), SKILL_ITEM_REASONS.INVALID_SLOT_STATE);

{
  const live = fixture();
  const before = structuredClone(live);
  const failed = commitSkillItemUse({
    state: live,
    command: command('persist-fails'),
    persistCandidate() { throw new Error('disk full'); },
  });
  assert.equal(failed.reason, SKILL_ITEM_REASONS.PERSISTENCE_FAILED);
  assert.equal(failed.stage, 'persist');
  assert.strictEqual(failed.state, live);
  assert.deepEqual(live, before, 'failed persistence cannot publish skill or consume item');
}

{
  const live = fixture();
  const storage = new MemoryStorage();
  let persistedCandidate;
  const success = commitSkillItemUse({
    state: live,
    command: command('persist-ok'),
    persistCandidate(nextState) {
      persistedCandidate = nextState;
      return writeStoredSave(storage, { state: nextState, playerHp: 88 });
    },
  });
  assert.equal(success.ok, true);
  assert.strictEqual(success.nextState, persistedCandidate);
  assert.equal(live.inventory.emberFruit, 2, 'caller publishes only after commit returns success');
  assert.equal(success.persisted.state.inventory.emberFruit, 1);
  assert.equal(success.persisted.state.saveVersion, SAVE_SCHEMA_VERSION);
  const read = readStoredSave(storage);
  const reloaded = normalizeSavedState(read.state, { now: command('x').now });
  const learned = reloaded.collection[0].skills.find(skill => skill.skillId === 'SK_FIRE_01');
  assert.equal(learned.slot, 's4');
  assert.equal(learned.sourceKind, 'skillItem');
  assert.equal(learned.sourceItemId, 'emberFruit');
  assert.equal(learned.learnedAt, command('x').now);
  assert.deepEqual(reloaded.skillItemUseCommandIds, ['persist-ok']);
  assert.deepEqual(skillItemAcquisitionDiagnostics(reloaded), []);

  storage.failCurrentWrite = true;
  const writeFails = commitSkillItemUse({
    state: live,
    command: command('storage-fails'),
    persistCandidate(nextState) { return writeStoredSave(storage, { state: nextState }); },
  });
  assert.equal(writeFails.reason, SKILL_ITEM_REASONS.PERSISTENCE_FAILED);
  assert.equal(live.inventory.emberFruit, 2);
}

{
  const ids = Array.from({ length: 90 }, (_, index) => `cmd-${index}`);
  assert.equal(normalizeSkillItemCommandIds(ids).length, SKILL_ITEM_COMMAND_HISTORY_LIMIT);
  assert.equal(normalizeSkillItemCommandIds(ids)[0], 'cmd-26');
  assert.deepEqual(normalizeSkillItemCommandIds(['a', 'b', 'a', '', null]), ['b', 'a']);
  const legacy = fixture({ skillItemUseCommandIds: undefined, saveVersion: 13 });
  const migrated = normalizeSavedState(legacy, { now: 123 });
  assert.equal(migrated.saveVersion, SAVE_SCHEMA_VERSION);
  assert.deepEqual(migrated.skillItemUseCommandIds, []);
  assert.deepEqual(normalizeSavedState(migrated, { now: 123 }), migrated, 'current save migration is idempotent');
  const sanitized = sanitizeStateForPersistence({ ...migrated, skillItemUseCommandIds: ids });
  assert.equal(sanitized.skillItemUseCommandIds.length, SKILL_ITEM_COMMAND_HISTORY_LIMIT);
}

assert.equal(skillItemAcquisitionDiagnostics({ collection: [{ instanceId: 'bad', skills: [{
  skillId: 'SK_FIRE_02', sourceKind: 'skillItem', sourceItemId: 'emberFruit', learnedAt: -1,
}] }] })[0].reason, 'source_skill_mismatch');

console.log('V8.9 skill items: PASS (transaction + persistence + migration + provenance)');
