import assert from 'node:assert/strict';
import {
  CONTENT_STATES,
  CONTENT_ID_PATTERNS,
  LEARNSET_METHODS,
  assertContentBundle,
  validateContentBundle,
} from '../content-validation.mjs';

function validFixture() {
  return {
    monsters: [{ id: 'MON_001', passiveId: 'PASS_NORMAL_01', name: 'Plain Slime' }],
    skills: [{ id: 'SK_NORMAL_01', name: 'Tackle', target: 'NearestEnemy' }],
    passives: [{ id: 'PASS_NORMAL_01', name: 'Adaptive Body' }],
    statuses: [{ id: 'ST_POISON', name: 'Poison' }],
    learnsets: [{ monsterId: 'MON_001', skillId: 'SK_NORMAL_01', method: 'LevelUp', level: 1, state: 'Active' }],
    skillStatusLinks: [{ skillId: 'SK_NORMAL_01', statusId: 'ST_POISON' }],
  };
}

const valid = validFixture();
assert.equal(validateContentBundle(valid).ok, true, 'a complete stable-ID fixture passes');
assert.equal(assertContentBundle(valid), valid, 'assertion returns the validated bundle without cloning runtime state');
assert.equal(CONTENT_ID_PATTERNS.monsters.test('MON_001'), true, 'monster IDs match the reviewed workbook');
assert.equal(CONTENT_ID_PATTERNS.skills.test('SK_NORMAL_01'), true, 'skill IDs match the reviewed workbook');
assert.equal(CONTENT_ID_PATTERNS.passives.test('PASS_NORMAL_01'), true, 'passive IDs match the reviewed workbook');
assert.equal(CONTENT_ID_PATTERNS.statuses.test('ST_ATK_UP'), true, 'status IDs match the reviewed workbook');
assert.equal(LEARNSET_METHODS.includes('RareManual'), true, 'deferred workbook methods remain schema-valid');
assert.equal(LEARNSET_METHODS.includes('SecondaryLevel'), true, 'secondary-type level rows remain schema-valid');
assert.equal(LEARNSET_METHODS.includes('BreedingCandidate'), true, 'breeding candidate rows remain schema-valid');
assert.equal(CONTENT_STATES.includes('DataReady'), true, 'data-ready rows remain distinct from active rows');

const dataReady = validFixture();
dataReady.learnsets[0] = {
  ...dataReady.learnsets[0],
  method: 'BreedingCandidate',
  state: 'DataReady',
};
assert.equal(validateContentBundle(dataReady).ok, true, 'reviewed non-active learnset enums validate without activating content');

const duplicate = validFixture();
duplicate.monsters.push({ id: 'MON_001', passiveId: 'PASS_NORMAL_01', name: 'Duplicate' });
assert.ok(
  validateContentBundle(duplicate).issues.some(issue => issue.code === 'duplicate_id' && issue.catalog === 'monsters'),
  'duplicate stable IDs are rejected',
);

const badId = validFixture();
badId.skills[0].id = 'skill-one';
assert.ok(
  validateContentBundle(badId).issues.some(issue => issue.code === 'invalid_id' && issue.catalog === 'skills'),
  'invalid stable-ID shapes are rejected',
);

const danglingPassive = validFixture();
danglingPassive.monsters[0].passiveId = 'PASS_UNKNOWN_99';
assert.ok(
  validateContentBundle(danglingPassive).issues.some(issue => issue.code === 'dangling_reference' && issue.field === 'passiveId'),
  'monster-to-passive dangling references are rejected',
);

const danglingLearnset = validFixture();
danglingLearnset.learnsets[0].skillId = 'SK_NORMAL_99';
assert.ok(
  validateContentBundle(danglingLearnset).issues.some(issue => issue.code === 'dangling_reference' && issue.catalog === 'learnsets'),
  'learnset-to-skill dangling references are rejected',
);

const danglingStatus = validFixture();
danglingStatus.skillStatusLinks[0].statusId = 'ST_UNKNOWN';
assert.ok(
  validateContentBundle(danglingStatus).issues.some(issue => issue.code === 'dangling_reference' && issue.catalog === 'skillStatusLinks'),
  'skill-to-status dangling references are rejected',
);

const invalidMethod = validFixture();
invalidMethod.learnsets[0].method = 'DebugGrant';
assert.ok(
  validateContentBundle(invalidMethod).issues.some(issue => issue.code === 'invalid_enum' && issue.field === 'method'),
  'unknown learnset grant methods are rejected',
);

const invalidState = validFixture();
invalidState.learnsets[0].state = 'AutoEquip';
assert.ok(
  validateContentBundle(invalidState).issues.some(issue => issue.code === 'invalid_enum' && issue.field === 'state'),
  'unknown rollout states are rejected',
);

for (const [field, value] of [
  ['currentHp', 10],
  ['currentUses', 2],
  ['cooldownRemaining', 1],
  ['ownerState', 'party'],
  ['instanceId', 'instance-1'],
  ['equippedSkills', ['SK_NORMAL_01']],
]) {
  const leaked = validFixture();
  leaked.monsters[0].profile = { [field]: value };
  assert.ok(
    validateContentBundle(leaked).issues.some(issue => issue.code === 'runtime_field_in_static_catalog' && issue.field.endsWith(field)),
    `${field} cannot leak into immutable master data`,
  );
}

const malformed = validateContentBundle({ monsters: null });
assert.equal(malformed.ok, false, 'missing catalog arrays are rejected');
assert.equal(Object.isFrozen(malformed.issues), true, 'validation output is immutable');

assert.throws(
  () => assertContentBundle(danglingStatus),
  error => error instanceof TypeError && error.code === 'content_bundle_invalid',
  'invalid bundles cannot cross the catalog boundary',
);

console.log('V8.1 content validation: PASS');
