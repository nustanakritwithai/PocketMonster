import assert from 'node:assert/strict';
import { normalizeInstance } from '../monster-instance.mjs';
import {
  consumeSkillUse,
  evaluateSkillUse,
  getSkill,
  learnSkill,
} from '../skill-progression.mjs';

const makeInstance = (instanceId = 'uses-a') => normalizeInstance({
  instanceId,
  speciesId: 'flamewolf',
  skills: [],
}, { now: 1 });

const first = makeInstance();
const learned = learnSkill(first, { skillId: 'SK_FIRE_01', slot: 's1' });
assert.equal(learned.currentUses, 28, 'new owned skill starts at the catalog maxUses');

const rejected = consumeSkillUse(first, {
  skillId: 'SK_FIRE_01',
  castId: 'cast-rejected',
  castAccepted: false,
});
assert.equal(rejected.ok, false);
assert.equal(rejected.reason, 'cast_rejected');
assert.equal(learned.currentUses, 28, 'rejected cast consumes zero uses');

const accepted = consumeSkillUse(first, {
  skillId: 'SK_FIRE_01',
  castId: 'cast-001',
  castAccepted: true,
});
assert.equal(accepted.ok, true);
assert.equal(accepted.consumed, 1);
assert.equal(accepted.currentUses, 27, 'accepted cast consumes exactly one use');

const duplicate = consumeSkillUse(first, {
  skillId: 'SK_FIRE_01',
  castId: 'cast-001',
  castAccepted: true,
});
assert.equal(duplicate.ok, false);
assert.equal(duplicate.reason, 'duplicate_cast');
assert.equal(learned.currentUses, 27, 'duplicate callback cannot consume twice');

const paddedDuplicate = consumeSkillUse(first, {
  skillId: 'SK_FIRE_01',
  castId: '  cast-001  ',
  castAccepted: true,
});
assert.equal(paddedDuplicate.reason, 'duplicate_cast', 'cast IDs use one canonical representation');
assert.equal(learned.currentUses, 27);

const preview = evaluateSkillUse(first, {
  skillId: 'SK_FIRE_01',
  castId: 'cast-002',
  castAccepted: true,
});
assert.equal(preview.ok, true);
assert.equal(preview.currentUses, 27);
assert.equal(preview.nextUses, 26);
assert.equal(learned.currentUses, 27, 'evaluation is read-only');

learned.currentUses = 0;
const exhausted = consumeSkillUse(first, {
  skillId: 'SK_FIRE_01',
  castId: 'cast-empty',
  castAccepted: true,
});
assert.equal(exhausted.reason, 'no_uses');
assert.equal(learned.currentUses, 0);

const oldSave = normalizeInstance({
  instanceId: 'uses-old',
  speciesId: 'flamewolf',
  skills: [{ skillId: 'SK_FIRE_01', slot: 's1', masteryExp: 0, masteryRank: 'novice', mutationId: null }],
}, { now: 1 });
const oldResult = consumeSkillUse(oldSave, {
  skillId: 'SK_FIRE_01',
  castId: 'cast-old-save',
  castAccepted: true,
});
assert.equal(oldResult.currentUses, 27, 'legacy runtime record receives a safe maxUses default before consumption');

const malformed = normalizeInstance({
  instanceId: 'uses-malformed',
  speciesId: 'flamewolf',
  skills: [null, { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 'many' }],
}, { now: 1 });
const malformedResult = consumeSkillUse(malformed, {
  skillId: 'SK_FIRE_01', castId: 'cast-malformed', castAccepted: true,
});
assert.equal(malformedResult.reason, 'no_uses', 'malformed persisted use state fails closed instead of granting a refill');

const sharedRawSkill = { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 28 };
const left = normalizeInstance({ instanceId: 'left', speciesId: 'flamewolf', skills: [sharedRawSkill] }, { now: 1 });
const right = normalizeInstance({ instanceId: 'right', speciesId: 'flamewolf', skills: [sharedRawSkill] }, { now: 1 });
assert.notEqual(getSkill(left, 'SK_FIRE_01'), getSkill(right, 'SK_FIRE_01'), 'normalization clones owned skill records per instance');
consumeSkillUse(left, { skillId: 'SK_FIRE_01', castId: 'cast-left', castAccepted: true });
assert.equal(getSkill(left, 'SK_FIRE_01').currentUses, 27);
assert.equal(getSkill(right, 'SK_FIRE_01').currentUses, 28, 'one monster cannot consume another monster instance uses');

const system = makeInstance('uses-system');
learnSkill(system, { skillId: 'SK_NORMAL_01', slot: 'basicAI' });
assert.equal(consumeSkillUse(system, {
  skillId: 'SK_NORMAL_01', castId: 'cast-basic', castAccepted: true,
}).reason, 'manual_slot_required', 'basicAI remains outside the three manual use commands');

assert.equal(consumeSkillUse(first, {
  skillId: 'SK_UNKNOWN_01', castId: 'cast-unknown', castAccepted: true,
}).reason, 'unknown_id');
assert.equal(consumeSkillUse(first, {
  skillId: 'SK_WATER_01', castId: 'cast-unowned', castAccepted: true,
}).reason, 'not_learned');
assert.equal(consumeSkillUse(first, {
  skillId: 'SK_FIRE_01', castId: '', castAccepted: true,
}).reason, 'invalid_cast_id');

console.log('V8.1 per-instance skill uses runtime: PASS');
