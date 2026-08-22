import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  LEARNSET_CATALOG,
  learnsetEntriesForMonster,
  learnsetEntryById,
  validateLearnsetCatalog,
} from '../learnset-catalog.mjs';

assert.equal(LEARNSET_CATALOG.length, 372, 'all 372 reviewed learnset entries are normalized');
assert.equal(new Set(LEARNSET_CATALOG.map(entry => entry.id)).size, 372, 'learnset entry IDs are unique');
assert.equal(new Set(LEARNSET_CATALOG.map(entry => entry.lookupKey)).size, 372, 'lookup keys are unique');
assert.equal(validateLearnsetCatalog(LEARNSET_CATALOG).ok, true, 'the reviewed learnset graph passes');

const stateCounts = Object.fromEntries(LEARNSET_CATALOG.reduce((counts, entry) => {
  counts.set(entry.state, (counts.get(entry.state) ?? 0) + 1);
  return counts;
}, new Map()));
assert.deepEqual(stateCounts, { Active: 338, DataReady: 17, Deferred: 17 }, 'rollout states remain distinct');

const methodCounts = Object.fromEntries(LEARNSET_CATALOG.reduce((counts, entry) => {
  counts.set(entry.method, (counts.get(entry.method) ?? 0) + 1);
  return counts;
}, new Map()));
assert.deepEqual(methodCounts, {
  LevelUp: 180,
  Evolution: 18,
  SecondaryLevel: 108,
  Tutor: 32,
  BreedingCandidate: 17,
  RareManual: 17,
}, 'reviewed method counts stay stable');

assert.equal(
  createHash('sha256').update(JSON.stringify(LEARNSET_CATALOG)).digest('hex'),
  '08cbd2d9eb23a4dca497980092583ebc72709218d836869b375ffe8a8c554aa7',
  'the normalized 372-row learnset stays tied to this provenance review',
);

const starter = learnsetEntryById('LE_0001');
assert.equal(starter.monsterId, 'MON_001');
assert.equal(starter.skillId, 'SK_NORMAL_01');
assert.equal(starter.learnLevel, 1);
assert.equal(starter.autoLearn, true);
assert.equal(starter.rollout, 'eligible_for_adapter');

const breedingCandidate = learnsetEntryById('LE_0020');
assert.equal(breedingCandidate.state, 'DataReady');
assert.equal(breedingCandidate.rollout, 'blocked');
assert.equal(breedingCandidate.autoLearn, false);

const rareManual = learnsetEntryById('LE_0021');
assert.equal(rareManual.state, 'Deferred');
assert.equal(rareManual.rollout, 'blocked');
assert.equal(rareManual.requiredBond, 60);
assert.equal(rareManual.requiredRuntimeSecondaryType, 'Psychic');

assert.ok(LEARNSET_CATALOG.filter(entry => entry.state !== 'Active').every(entry => entry.rollout === 'blocked'), 'non-active rows cannot auto-unlock');
assert.ok(learnsetEntriesForMonster('MON_019').every(entry => entry.state === 'Active'), 'default queries hide blocked rows');
assert.ok(learnsetEntriesForMonster('MON_019', { includeBlocked: true }).some(entry => entry.state === 'Deferred'), 'audit queries can inspect blocked rows');
assert.deepEqual(learnsetEntriesForMonster('MON_UNKNOWN'), [], 'unknown monsters have no entries');

const lightRequirement = LEARNSET_CATALOG.find(entry => entry.requiredSourceSecondaryType === 'LIGHT');
assert.ok(lightRequirement, 'LIGHT requirement remains visible for audit');
assert.equal(lightRequirement.requiredRuntimeSecondaryType, 'Fairy', 'LIGHT requirements map to current Fairy identity');
assert.equal(LEARNSET_CATALOG.some(entry => entry.requiredRuntimeSecondaryType === 'Light'), false, 'no new Light runtime identity is created');

assert.equal(Object.isFrozen(LEARNSET_CATALOG), true, 'learnset catalog is immutable');
assert.equal(Object.isFrozen(starter), true, 'learnset entries are immutable');
assert.equal('learned' in starter, false, 'instance learned state does not leak into catalog rows');
assert.equal('equippedSlot' in starter, false, 'instance loadout state does not leak into catalog rows');

const unknownSkill = LEARNSET_CATALOG.map(entry => ({ ...entry }));
unknownSkill[0].skillId = 'SK_NORMAL_99';
assert.ok(validateLearnsetCatalog(unknownSkill).issues.some(issue => issue.code === 'unknown_skill_reference'), 'unknown skill references fail');

const unknownMonster = LEARNSET_CATALOG.map(entry => ({ ...entry }));
unknownMonster[0].monsterId = 'MON_999';
assert.ok(validateLearnsetCatalog(unknownMonster).issues.some(issue => issue.code === 'unknown_monster_reference'), 'unknown monster references fail');

const invalidMethod = LEARNSET_CATALOG.map(entry => ({ ...entry }));
invalidMethod[0].method = 'DebugGrant';
assert.ok(validateLearnsetCatalog(invalidMethod).issues.some(issue => issue.code === 'invalid_method'), 'unknown methods fail');

const activatedDeferred = LEARNSET_CATALOG.map(entry => ({ ...entry }));
activatedDeferred.find(entry => entry.state === 'Deferred').rollout = 'eligible_for_adapter';
assert.ok(validateLearnsetCatalog(activatedDeferred).issues.some(issue => issue.code === 'blocked_content_activated'), 'deferred activation fails');

console.log('V8.1 learnset catalog: PASS');
