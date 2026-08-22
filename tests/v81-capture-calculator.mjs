import assert from 'node:assert/strict';
import { WORKBOOK_CAPTURE_ADAPTER } from '../balance-config.mjs';
import { captureFinalChancePctV1, captureHpFactorV1 } from '../balance-formulas.mjs';
import {
  CAPTURE_MONSTER_PROFILES,
  CAPTURE_STATUS_RULES,
  captureLevelMultiplier,
  captureMonsterProfile,
  captureVariantProfile,
  resolveCaptureBall,
  resolveCaptureStatus,
  resolveWorkbookCapture,
  snapshotCaptureReferenceLevel,
  validateCaptureMonsterProfiles,
} from '../balance-capture.mjs';
import { evaluateCaptureAttemptPolicy } from '../runtime-policies.mjs';
import {
  CAPTURE_PROFILE_FIELDS,
  EXPECTED_CAPTURE_PROFILE_ROWS,
  EXPECTED_CAPTURE_STATUS_RULES,
} from './v81-capture-workbook-fixture.mjs';

const VALID_INPUT = Object.freeze({
  monsterId: 'MON_020',
  currentHp: 10,
  maxHp: 100,
  activeStatusIds: Object.freeze(['ST_PARALYZE']),
  ballClass: 'Basic',
  ballTargetType: null,
  targetSecondaryType: null,
  targetLevel: 20,
  referenceLevel: 20,
  variant: 'Normal',
  ownedMonsterActive: false,
  ballQuantity: 5,
  projectileHit: true,
  targetAlive: true,
});

assert.equal(WORKBOOK_CAPTURE_ADAPTER.formulaVersion, 'CAP_v1.0');
assert.equal(WORKBOOK_CAPTURE_ADAPTER.activation, 'calculator_only', 'A26 must not activate live capture coefficients');
assert.equal(WORKBOOK_CAPTURE_ADAPTER.rollAuthority, 'future_server_boundary', 'browser calculator must not claim server authority');
assert.equal(WORKBOOK_CAPTURE_ADAPTER.minChancePct, 1);
assert.equal(WORKBOOK_CAPTURE_ADAPTER.maxChancePct, 95);
assert.equal(WORKBOOK_CAPTURE_ADAPTER.referenceLevelRule, 'HighestPartyLevelAtEncounterStart');
assert.equal(CAPTURE_MONSTER_PROFILES.length, 36);
assert.equal(validateCaptureMonsterProfiles(CAPTURE_MONSTER_PROFILES).ok, true);
assert.deepEqual(
  CAPTURE_MONSTER_PROFILES.map(profile => CAPTURE_PROFILE_FIELDS.map(field => profile[field])),
  EXPECTED_CAPTURE_PROFILE_ROWS,
  'all 36 capture rows must exactly match the workbook ledger',
);
assert.equal(captureMonsterProfile('MON_020').baseRatePct, 32);
assert.equal(captureMonsterProfile('MON_020').baseBond, 20);
assert.equal(captureMonsterProfile('MON_002').baseRatePct, 70);
assert.equal(captureMonsterProfile('MON_002').baseBond, 10);
assert.equal(captureMonsterProfile('MON_999'), null);
assert.equal(Object.isFrozen(CAPTURE_MONSTER_PROFILES), true);
assert.ok(CAPTURE_MONSTER_PROFILES.every(Object.isFrozen));
assert.deepEqual(CAPTURE_STATUS_RULES, EXPECTED_CAPTURE_STATUS_RULES, 'status table must exactly match CAP_v1.0');

assert.equal(captureHpFactorV1(1), 0.5);
assert.equal(captureHpFactorV1(0.5), 1.25);
assert.equal(captureHpFactorV1(0.1), 1.85);
assert.equal(captureHpFactorV1(0), 2);
assert.equal(captureHpFactorV1(-1), 2);
assert.equal(captureHpFactorV1(2), 0.5);
assert.equal(captureFinalChancePctV1(0), 0);
assert.equal(captureFinalChancePctV1(0.1), 1);
assert.equal(captureFinalChancePctV1(120), 95);

assert.deepEqual(resolveCaptureStatus([]), { statusId: 'NONE', multiplier: 1, priority: 0 });
assert.deepEqual(resolveCaptureStatus(['ST_BURN', 'ST_POISON']), { statusId: 'ST_BURN', multiplier: 1.1, priority: 10 });
assert.deepEqual(resolveCaptureStatus(['ST_BLIND', 'ST_PARALYZE', 'ST_STUN']), { statusId: 'ST_STUN', multiplier: 1.35, priority: 35 });
assert.deepEqual(resolveCaptureStatus(['ST_BLIND', 'ST_UNKNOWN']), { statusId: 'NONE', multiplier: 1, priority: 0 });

assert.equal(resolveCaptureBall({ ballClass: 'Basic', targetTypes: ['FIRE'], targetVariant: 'Normal' }).multiplier, 1);
assert.equal(resolveCaptureBall({ ballClass: 'Great', targetTypes: ['FIRE'], targetVariant: 'Normal' }).multiplier, 1.25);
assert.equal(resolveCaptureBall({ ballClass: 'Ultra', targetTypes: ['FIRE'], targetVariant: 'Normal' }).multiplier, 1.5);
assert.equal(resolveCaptureBall({ ballClass: 'TypeBall', ballTargetType: 'FIRE', targetTypes: ['FIRE', 'DRAGON'], targetVariant: 'Normal' }).multiplier, 1.35);
assert.equal(resolveCaptureBall({ ballClass: 'TypeBall', ballTargetType: 'WATER', targetTypes: ['FIRE', 'DRAGON'], targetVariant: 'Normal' }).multiplier, 1);
assert.equal(resolveCaptureBall({ ballClass: 'EliteSeal', targetTypes: ['FIRE'], targetVariant: 'Elite' }).multiplier, 1.35);
assert.equal(resolveCaptureBall({ ballClass: 'EliteSeal', targetTypes: ['FIRE'], targetVariant: 'Normal' }).multiplier, 1);
assert.equal(resolveCaptureBall({ ballClass: 'Unknown', targetTypes: [], targetVariant: 'Normal' }).reason, 'invalid_ball_class');
for (const inheritedKey of ['toString', 'constructor', '__proto__']) {
  assert.deepEqual(
    resolveCaptureBall({ ballClass: inheritedKey, targetTypes: [], targetVariant: 'Normal' }),
    { ok: false, reason: 'invalid_ball_class', multiplier: 0 },
  );
  assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, ballClass: inheritedKey }).reason, 'invalid_ball_class');
}
assert.equal(resolveCaptureBall({ ballClass: 'Basic', targetTypes: [], targetVariant: 'Normal' }).reason, 'invalid_target_types');
assert.equal(resolveCaptureBall({ ballClass: 'Basic', targetTypes: ['FIRE', 'WATER', 'ICE'], targetVariant: 'Normal' }).reason, 'invalid_target_types');
assert.equal(resolveCaptureBall({ ballClass: 'Basic', targetTypes: ['FIRE', 'UNKNOWN'], targetVariant: 'Normal' }).reason, 'invalid_target_types');
assert.equal(resolveCaptureBall({ ballClass: 'Basic', targetTypes: ['FIRE', 'FIRE'], targetVariant: 'Normal' }).reason, 'invalid_target_types');
assert.equal(resolveCaptureBall({ ballClass: 'TypeBall', ballTargetType: 'UNKNOWN', targetTypes: ['FIRE'], targetVariant: 'Normal' }).reason, 'invalid_ball_target_type');

for (const [target, reference, expected] of [
  [5, 10, 1.15],
  [6, 10, 1],
  [12, 10, 1],
  [13, 10, 0.85],
  [15, 10, 0.85],
  [16, 10, 0.7],
  [19, 10, 0.7],
  [20, 10, 0.55],
]) {
  assert.equal(captureLevelMultiplier(target, reference), expected, `level boundary ${target - reference}`);
}
assert.equal(captureLevelMultiplier(0, 10), null);
assert.equal(snapshotCaptureReferenceLevel([5, 20, 11]), 20);
assert.equal(snapshotCaptureReferenceLevel([]), null);
assert.equal(snapshotCaptureReferenceLevel([0, Number.NaN]), null);

assert.deepEqual(captureVariantProfile('Normal'), { variant: 'Normal', captureEnabled: true, multiplier: 1 });
assert.deepEqual(captureVariantProfile('Elite'), { variant: 'Elite', captureEnabled: true, multiplier: 0.55 });
assert.deepEqual(captureVariantProfile('Boss'), { variant: 'Boss', captureEnabled: false, multiplier: 0 });
assert.deepEqual(captureVariantProfile('BossVariant'), { variant: 'BossVariant', captureEnabled: false, multiplier: 0 });
assert.deepEqual(captureVariantProfile('Rare'), { variant: 'Rare', workbookVariant: 'Normal', captureEnabled: true, multiplier: 1 });
assert.deepEqual(captureVariantProfile('rare'), { variant: 'rare', workbookVariant: 'Normal', captureEnabled: true, multiplier: 1 });
assert.equal(captureVariantProfile('unknown'), null);
for (const invalidVariant of ['constructor', '__proto__', { toString: () => 'elite' }]) {
  assert.equal(captureVariantProfile(invalidVariant), null);
  assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, variant: invalidVariant }).reason, 'invalid_state');
}

for (const [overrides, reason] of [
  [{ ownedMonsterActive: true }, 'active_monster_must_recall'],
  [{ ballQuantity: 0 }, 'no_capture_ball'],
  [{ targetAlive: false }, 'target_fainted'],
  [{ projectileHit: false }, 'projectile_miss'],
  [{ capturable: false }, 'capture_disabled'],
]) {
  const policy = evaluateCaptureAttemptPolicy({
    ownedMonsterActive: false,
    ballQuantity: 1,
    targetAlive: true,
    projectileHit: true,
    capturable: true,
    ...overrides,
  });
  assert.equal(policy.ok, false);
  assert.equal(policy.reason, reason);
  assert.equal(policy.shouldRoll, false);
}
assert.deepEqual(
  evaluateCaptureAttemptPolicy({ ownedMonsterActive: false, ballQuantity: 1, targetAlive: true, projectileHit: true, capturable: true }),
  { ok: true, reason: null, shouldRoll: true },
);

const referenceLevels = [5, 20, 11];
const referenceLevel = snapshotCaptureReferenceLevel(referenceLevels);
referenceLevels.push(60);
assert.equal(referenceLevel, 20, 'encounter reference is a scalar snapshot, not a live party lookup');

const result = resolveWorkbookCapture(VALID_INPUT);
assert.equal(result.ok, true, result.reason);
assert.equal(result.shouldRoll, true);
assert.equal(result.formulaVersion, 'CAP_v1.0');
assert.equal(result.rawChancePct, 74);
assert.equal(result.finalChancePct, 74);
assert.deepEqual(result.factors, {
  baseRatePct: 32,
  hp: 1.85,
  status: 1.25,
  ball: 1,
  level: 1,
  variant: 1,
});
assert.equal(result.strongestStatusId, 'ST_PARALYZE');
assert.equal(result.rollAuthority, 'future_server_boundary');
assert.equal(Object.isFrozen(result), true);
assert.deepEqual(resolveWorkbookCapture(VALID_INPUT), result, 'calculator is deterministic and performs no roll');

assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, currentHp: 100, activeStatusIds: [] }).finalChancePct, 16);
assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, ballClass: 'TypeBall', ballTargetType: 'FIRE' }).factors.ball, 1.35, 'primary type comes from the Monster Profile');
assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, targetSecondaryType: 'DRAGON', ballClass: 'TypeBall', ballTargetType: 'DRAGON' }).factors.ball, 1.35, 'validated secondary type can match');
assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, targetSecondaryType: null, targetTypes: ['WATER'], ballClass: 'TypeBall', ballTargetType: 'WATER' }).factors.ball, 1, 'caller cannot forge the canonical primary type');
assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, targetSecondaryType: 'UNKNOWN' }).reason, 'invalid_state');
assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, targetSecondaryType: 'FIRE' }).reason, 'invalid_state');
for (const invalidSecondaryType of ['', '   ', 123, {}, [], new String('DRAGON')]) {
  assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, targetSecondaryType: invalidSecondaryType }).reason, 'invalid_state');
}
assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, monsterId: 'MON_001', currentHp: 1, ballClass: 'Ultra' }).finalChancePct, 95);
assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, variant: 'Elite' }).finalChancePct, 40.7);
assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, variant: 'Boss' }).reason, 'capture_disabled');
assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, variant: 'Boss' }).finalChancePct, 0);
assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, projectileHit: false }).reason, 'projectile_miss');
assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, projectileHit: false }).rawChancePct, 0, 'miss skips the formula');
assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, projectileHit: false, maxHp: 0 }).reason, 'projectile_miss', 'miss does not enter formula validation');
assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, maxHp: 0 }).reason, 'invalid_state');
assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, currentHp: 0 }).reason, 'target_fainted');
assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, monsterId: 'MON_999' }).reason, 'unknown_id');
assert.equal(resolveWorkbookCapture({ ...VALID_INPUT, referenceLevel: 60 }).factors.level, 1.15, 'uses the supplied encounter snapshot exactly');

const stage1Profiles = CAPTURE_MONSTER_PROFILES.filter(profile => profile.stage === 1);
const stage2Profiles = CAPTURE_MONSTER_PROFILES.filter(profile => profile.stage === 2);
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
assert.ok(Math.abs(average(stage1Profiles.map(profile => profile.baseRatePct)) - 69.33333333333333) < 1e-10);
assert.ok(Math.abs(average(stage2Profiles.map(profile => profile.baseRatePct)) - 29.555555555555557) < 1e-10);
const fullHpStage1 = stage1Profiles.map(profile => resolveWorkbookCapture({
  ...VALID_INPUT,
  monsterId: profile.monsterId,
  currentHp: 100,
  activeStatusIds: [],
}).finalChancePct);
assert.ok(Math.abs(average(fullHpStage1) - 34.666666666666664) < 1e-10);
const lowHpEliteStage2 = stage2Profiles.map(profile => resolveWorkbookCapture({
  ...VALID_INPUT,
  monsterId: profile.monsterId,
  activeStatusIds: [],
  variant: 'Elite',
}).finalChancePct);
assert.ok(Math.abs(average(lowHpEliteStage2) - 30.07277777777778) < 1e-10);

console.log('V8.1 A26 CAP_v1.0 workbook calculator: PASS');
