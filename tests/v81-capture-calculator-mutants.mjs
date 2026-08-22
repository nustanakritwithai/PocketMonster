import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CAPTURE_PROFILE_FIELDS,
  EXPECTED_CAPTURE_PROFILE_ROWS,
  EXPECTED_CAPTURE_STATUS_RULES,
} from './v81-capture-workbook-fixture.mjs';

const sourceUrls = Object.freeze({
  config: new URL('../balance-config.mjs', import.meta.url),
  formulas: new URL('../balance-formulas.mjs', import.meta.url),
  policies: new URL('../runtime-policies.mjs', import.meta.url),
  capture: new URL('../balance-capture.mjs', import.meta.url),
});
const originalSources = Object.freeze(Object.fromEntries(
  Object.entries(sourceUrls).map(([key, url]) => [key, fs.readFileSync(url, 'utf8')]),
));

async function loadSource(key, source, tag) {
  const absoluteImports = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(relativePath, sourceUrls[key]).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${absoluteImports}\n//# sourceURL=${tag}`).toString('base64')}`);
}

function configContract(module) {
  const config = module.WORKBOOK_CAPTURE_ADAPTER;
  assert.equal(config.formulaVersion, 'CAP_v1.0');
  assert.equal(config.minChancePct, 1);
  assert.equal(config.maxChancePct, 95);
  assert.deepEqual(config.hpFactor, { base: 0.5, slope: 1.5, min: 0.5, max: 2 });
  assert.deepEqual(config.statusRules, EXPECTED_CAPTURE_STATUS_RULES);
  assert.equal(config.ballRules.TypeBall.conditionalMultiplier, 1.35);
  assert.equal(config.ballRules.EliteSeal.conditionalMultiplier, 1.35);
  assert.deepEqual(config.levelRules.map(rule => rule.multiplier), [1.15, 1, 0.85, 0.7, 0.55]);
  assert.equal(config.levelRules[1].maxDifference, 2);
  assert.equal(config.levelRules[2].minDifference, 3);
  assert.deepEqual(config.variantRules.Elite, { captureEnabled: true, multiplier: 0.55 });
  assert.deepEqual(config.variantRules.Boss, { captureEnabled: false, multiplier: 0 });
  assert.equal(config.activation, 'calculator_only');
  assert.equal(config.rollAuthority, 'future_server_boundary');
}

function formulasContract(module) {
  assert.equal(module.captureHpFactorV1(1), 0.5);
  assert.equal(module.captureHpFactorV1(0.5), 1.25);
  assert.equal(module.captureHpFactorV1(0.1), 1.85);
  assert.equal(module.captureHpFactorV1(0), 2);
  assert.equal(module.captureHpFactorV1(-1), 2);
  assert.equal(module.captureHpFactorV1(2), 0.5);
  assert.equal(module.captureFinalChancePctV1(0), 0);
  assert.equal(module.captureFinalChancePctV1(0.1), 1);
  assert.equal(module.captureFinalChancePctV1(120), 95);
}

function policiesContract(module) {
  const base = { ownedMonsterActive: false, ballQuantity: 1, targetAlive: true, projectileHit: true, capturable: true };
  assert.deepEqual(module.evaluateCaptureAttemptPolicy(base), { ok: true, reason: null, shouldRoll: true });
  for (const [overrides, reason] of [
    [{ ownedMonsterActive: true }, 'active_monster_must_recall'],
    [{ ballQuantity: 0 }, 'no_capture_ball'],
    [{ targetAlive: false }, 'target_fainted'],
    [{ projectileHit: false }, 'projectile_miss'],
    [{ capturable: false }, 'capture_disabled'],
  ]) {
    assert.deepEqual(
      module.evaluateCaptureAttemptPolicy({ ...base, ...overrides }),
      { ok: false, reason, shouldRoll: false },
    );
  }
  assert.equal(module.evaluateCaptureAttemptPolicy({ ...base, ballQuantity: 0.5 }).reason, 'invalid_state');
}

function captureContract(module) {
  assert.equal(module.CAPTURE_MONSTER_PROFILES.length, 36);
  assert.equal(module.validateCaptureMonsterProfiles(module.CAPTURE_MONSTER_PROFILES).ok, true);
  assert.deepEqual(
    module.CAPTURE_MONSTER_PROFILES.map(profile => CAPTURE_PROFILE_FIELDS.map(field => profile[field])),
    EXPECTED_CAPTURE_PROFILE_ROWS,
  );
  assert.equal(module.captureMonsterProfile('MON_020').baseRatePct, 32);
  assert.equal(module.captureMonsterProfile('MON_020').baseBond, 20);
  assert.equal(module.captureMonsterProfile('MON_002').baseBond, 10);
  assert.equal(module.captureMonsterProfile('MON_999'), null);
  assert.deepEqual(module.resolveCaptureStatus(['ST_PARALYZE', 'ST_STUN']), { statusId: 'ST_STUN', multiplier: 1.35, priority: 35 });
  assert.deepEqual(module.resolveCaptureStatus(['ST_POISON', 'ST_BURN']), { statusId: 'ST_BURN', multiplier: 1.1, priority: 10 });
  assert.equal(module.resolveCaptureBall({ ballClass: 'TypeBall', ballTargetType: 'DRAGON', targetTypes: ['FIRE', 'DRAGON'], targetVariant: 'Normal' }).multiplier, 1.35);
  assert.equal(module.resolveCaptureBall({ ballClass: 'TypeBall', ballTargetType: 'WATER', targetTypes: ['FIRE', 'DRAGON'], targetVariant: 'Normal' }).multiplier, 1);
  assert.equal(module.resolveCaptureBall({ ballClass: 'EliteSeal', targetTypes: ['FIRE'], targetVariant: 'Elite' }).multiplier, 1.35);
  assert.equal(module.resolveCaptureBall({ ballClass: 'EliteSeal', targetTypes: ['FIRE'], targetVariant: 'Normal' }).multiplier, 1);
  for (const inheritedKey of ['toString', 'constructor', '__proto__']) {
    assert.deepEqual(
      module.resolveCaptureBall({ ballClass: inheritedKey, targetTypes: [], targetVariant: 'Normal' }),
      { ok: false, reason: 'invalid_ball_class', multiplier: 0 },
    );
  }
  assert.equal(module.captureLevelMultiplier(5, 10), 1.15);
  assert.equal(module.captureLevelMultiplier(6, 10), 1);
  assert.equal(module.captureLevelMultiplier(12, 10), 1);
  assert.equal(module.captureLevelMultiplier(13, 10), 0.85);
  assert.equal(module.captureLevelMultiplier(16, 10), 0.7);
  assert.equal(module.captureLevelMultiplier(20, 10), 0.55);
  assert.equal(module.snapshotCaptureReferenceLevel([5, 20, 11]), 20);
  assert.deepEqual(module.captureVariantProfile('Rare'), { variant: 'Rare', workbookVariant: 'Normal', captureEnabled: true, multiplier: 1 });
  assert.deepEqual(module.captureVariantProfile('rare'), { variant: 'rare', workbookVariant: 'Normal', captureEnabled: true, multiplier: 1 });
  assert.equal(module.captureVariantProfile('constructor'), null);
  assert.equal(module.captureVariantProfile({ toString: () => 'elite' }), null);

  const input = {
    monsterId: 'MON_020', currentHp: 10, maxHp: 100,
    activeStatusIds: ['ST_PARALYZE'], ballClass: 'Basic', ballTargetType: null,
    targetSecondaryType: null, targetLevel: 20, referenceLevel: 20,
    variant: 'Normal', ownedMonsterActive: false, ballQuantity: 5,
    projectileHit: true, targetAlive: true,
  };
  const result = module.resolveWorkbookCapture(input);
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.rawChancePct, 74);
  assert.equal(result.finalChancePct, 74);
  assert.deepEqual(result.factors, { baseRatePct: 32, hp: 1.85, status: 1.25, ball: 1, level: 1, variant: 1 });
  assert.equal(module.resolveWorkbookCapture({ ...input, currentHp: 100, activeStatusIds: [], ballClass: 'Great' }).finalChancePct, 20);
  assert.equal(module.resolveWorkbookCapture({ ...input, ballClass: 'TypeBall', ballTargetType: 'FIRE' }).factors.ball, 1.35);
  assert.equal(module.resolveWorkbookCapture({ ...input, targetSecondaryType: 'DRAGON', ballClass: 'TypeBall', ballTargetType: 'DRAGON' }).factors.ball, 1.35);
  assert.equal(module.resolveWorkbookCapture({ ...input, targetSecondaryType: null, targetTypes: ['WATER'], ballClass: 'TypeBall', ballTargetType: 'WATER' }).factors.ball, 1);
  assert.equal(module.resolveWorkbookCapture({ ...input, targetSecondaryType: 'UNKNOWN' }).reason, 'invalid_state');
  for (const invalidSecondaryType of ['', '   ', 123, {}, [], new String('DRAGON')]) {
    assert.equal(module.resolveWorkbookCapture({ ...input, targetSecondaryType: invalidSecondaryType }).reason, 'invalid_state');
  }
  assert.equal(module.resolveWorkbookCapture({ ...input, currentHp: 100, activeStatusIds: [], referenceLevel: 30 }).finalChancePct, 18.4);
  assert.equal(module.resolveWorkbookCapture({ ...input, variant: 'Elite' }).finalChancePct, 40.7);
  assert.equal(module.resolveWorkbookCapture({ ...input, variant: 'Boss' }).reason, 'capture_disabled');
  assert.equal(module.resolveWorkbookCapture({ ...input, projectileHit: false }).reason, 'projectile_miss');
  assert.equal(module.resolveWorkbookCapture({ ...input, projectileHit: false }).rawChancePct, 0);
  assert.equal(module.resolveWorkbookCapture({ ...input, projectileHit: false, maxHp: 0 }).reason, 'projectile_miss');
  assert.equal(module.resolveWorkbookCapture({ ...input, currentHp: 0 }).reason, 'target_fainted');
  assert.equal(module.resolveWorkbookCapture({ ...input, monsterId: 'MON_999' }).reason, 'unknown_id');
  assert.equal(module.resolveWorkbookCapture({ ...input, monsterId: 'MON_001', currentHp: 1, ballClass: 'Ultra' }).finalChancePct, 95);
}

configContract(await loadSource('config', originalSources.config, 'capture-config-current'));
formulasContract(await loadSource('formulas', originalSources.formulas, 'capture-formulas-current'));
policiesContract(await loadSource('policies', originalSources.policies, 'capture-policies-current'));
captureContract(await loadSource('capture', originalSources.capture, 'capture-resolver-current'));

const mutants = [
  ['config', 'wrong formula version', "formulaVersion: 'CAP_v1.0'", "formulaVersion: 'CAP_v0.9'"],
  ['config', 'remove minimum clamp', 'minChancePct: 1,', 'minChancePct: 0,'],
  ['config', 'raise maximum clamp', 'maxChancePct: 95,', 'maxChancePct: 96,'],
  ['config', 'legacy HP base', 'hpFactor: Object.freeze({ base: 0.5, slope: 1.5, min: 0.5, max: 2.0 })', 'hpFactor: Object.freeze({ base: 0.55, slope: 1.5, min: 0.5, max: 2.0 })'],
  ['config', 'wrong HP slope', 'hpFactor: Object.freeze({ base: 0.5, slope: 1.5, min: 0.5, max: 2.0 })', 'hpFactor: Object.freeze({ base: 0.5, slope: 1.4, min: 0.5, max: 2.0 })'],
  ['config', 'weaken Stun capture bonus', "statusId: 'ST_STUN', multiplier: 1.35", "statusId: 'ST_STUN', multiplier: 1.3"],
  ['config', 'weaken Paralyze capture bonus', "statusId: 'ST_PARALYZE', multiplier: 1.25", "statusId: 'ST_PARALYZE', multiplier: 1.2"],
  ['config', 'weaken Bleed capture bonus', "statusId: 'ST_BLEED', multiplier: 1.08", "statusId: 'ST_BLEED', multiplier: 1.07"],
  ['config', 'weaken Slow capture bonus', "statusId: 'ST_SLOW', multiplier: 1.1", "statusId: 'ST_SLOW', multiplier: 1.09"],
  ['config', 'weaken Root capture bonus', "statusId: 'ST_ROOT', multiplier: 1.25", "statusId: 'ST_ROOT', multiplier: 1.24"],
  ['config', 'weaken Confuse capture bonus', "statusId: 'ST_CONFUSE', multiplier: 1.12", "statusId: 'ST_CONFUSE', multiplier: 1.11"],
  ['config', 'weaken Freeze capture bonus', "statusId: 'ST_FREEZE', multiplier: 1.35", "statusId: 'ST_FREEZE', multiplier: 1.34"],
  ['config', 'weaken Fear capture bonus', "statusId: 'ST_FEAR', multiplier: 1.2", "statusId: 'ST_FEAR', multiplier: 1.19"],
  ['config', 'weaken Stagger capture bonus', "statusId: 'ST_STAGGER', multiplier: 1.05", "statusId: 'ST_STAGGER', multiplier: 1.04"],
  ['config', 'change equal-multiplier priority', "statusId: 'ST_FREEZE', multiplier: 1.35, priority: 35", "statusId: 'ST_FREEZE', multiplier: 1.35, priority: 34"],
  ['config', 'weaken TypeBall condition', "TypeBall: Object.freeze({ baseMultiplier: 1.0, conditionType: 'MatchesPrimaryOrSecondary', conditionalMultiplier: 1.35 })", "TypeBall: Object.freeze({ baseMultiplier: 1.0, conditionType: 'MatchesPrimaryOrSecondary', conditionalMultiplier: 1.3 })"],
  ['config', 'weaken EliteSeal condition', "EliteSeal: Object.freeze({ baseMultiplier: 1.0, conditionType: 'TargetVariant=Elite', conditionalMultiplier: 1.35 })", "EliteSeal: Object.freeze({ baseMultiplier: 1.0, conditionType: 'TargetVariant=Elite', conditionalMultiplier: 1.3 })"],
  ['config', 'wrong easy level multiplier', "ruleId: 'LV_EASY', maxDifference: -5, multiplier: 1.15", "ruleId: 'LV_EASY', maxDifference: -5, multiplier: 1.1"],
  ['config', 'widen normal level band', "ruleId: 'LV_NORMAL', minDifference: -4, maxDifference: 2", "ruleId: 'LV_NORMAL', minDifference: -4, maxDifference: 3"],
  ['config', 'shift hard level band', "ruleId: 'LV_HARD', minDifference: 3, maxDifference: 5", "ruleId: 'LV_HARD', minDifference: 4, maxDifference: 5"],
  ['config', 'wrong extreme level multiplier', "ruleId: 'LV_EXTREME', minDifference: 10, multiplier: 0.55", "ruleId: 'LV_EXTREME', minDifference: 10, multiplier: 0.5"],
  ['config', 'wrong Elite variant multiplier', "Elite: Object.freeze({ captureEnabled: true, multiplier: 0.55 })", "Elite: Object.freeze({ captureEnabled: true, multiplier: 0.5 })"],
  ['config', 'enable Boss capture', "Boss: Object.freeze({ captureEnabled: false, multiplier: 0.0 })", "Boss: Object.freeze({ captureEnabled: true, multiplier: 1.0 })"],
  ['config', 'activate calculator early', "statusStackRule: 'StrongestOnly',\n  activation: 'calculator_only'", "statusStackRule: 'StrongestOnly',\n  activation: 'live'"],
  ['config', 'claim server authority', "rollAuthority: 'future_server_boundary'", "rollAuthority: 'server'"],
  ['formulas', 'invert HP slope direction', 'config.hpFactor.slope * (1 - ratio)', 'config.hpFactor.slope * ratio'],
  ['formulas', 'skip HP factor clamp', 'return clamp(raw, config.hpFactor.min, config.hpFactor.max);', 'return raw;'],
  ['formulas', 'clamp raw zero to minimum', 'rawChancePct <= 0', 'rawChancePct < 0'],
  ['formulas', 'swap final clamp bounds', 'config.minChancePct, config.maxChancePct', 'config.maxChancePct, config.minChancePct'],
  ['policies', 'bypass recall gate', 'if (ownedMonsterActive)', 'if (false && ownedMonsterActive)'],
  ['policies', 'bypass ball inventory gate', 'if (ballQuantity <= 0)', 'if (false && ballQuantity <= 0)'],
  ['policies', 'bypass fainted target gate', 'if (!targetAlive)', 'if (false && !targetAlive)'],
  ['policies', 'bypass projectile hit gate', 'if (!projectileHit)', 'if (false && !projectileHit)'],
  ['policies', 'bypass capture policy gate', 'if (!capturable)', 'if (false && !capturable)'],
  ['policies', 'roll on policy failure', 'shouldRoll: ok', 'shouldRoll: true'],
  ['capture', 'wrong MON_020 profile rate', "['MON_020', 'Blaze Fox', 2, 'FIRE', 'Uncommon', 32, 20]", "['MON_020', 'Blaze Fox', 2, 'FIRE', 'Uncommon', 33, 20]"],
  ['capture', 'swap MON_019 and MON_021 rates while preserving averages', "['MON_019', 'Swift Hare', 2, 'NORMAL', 'Uncommon', 32, 20],\n  ['MON_002', 'Ember Slime', 1, 'FIRE', 'Common', 70, 10],\n  ['MON_020', 'Blaze Fox', 2, 'FIRE', 'Uncommon', 32, 20],\n  ['MON_003', 'Aqua Slime', 1, 'WATER', 'Common', 66, 10],\n  ['MON_021', 'Aqua Otter', 2, 'WATER', 'Uncommon', 28, 20]", "['MON_019', 'Swift Hare', 2, 'NORMAL', 'Uncommon', 28, 20],\n  ['MON_002', 'Ember Slime', 1, 'FIRE', 'Common', 70, 10],\n  ['MON_020', 'Blaze Fox', 2, 'FIRE', 'Uncommon', 32, 20],\n  ['MON_003', 'Aqua Slime', 1, 'WATER', 'Common', 66, 10],\n  ['MON_021', 'Aqua Otter', 2, 'WATER', 'Uncommon', 32, 20]"],
  ['capture', 'wrong Stage2 BaseBond', "['MON_020', 'Blaze Fox', 2, 'FIRE', 'Uncommon', 32, 20]", "['MON_020', 'Blaze Fox', 2, 'FIRE', 'Uncommon', 32, 10]"],
  ['capture', 'duplicate profile ID', "['MON_019', 'Swift Hare'", "['MON_001', 'Swift Hare'"],
  ['capture', 'choose weakest status', 'right.multiplier - left.multiplier', 'left.multiplier - right.multiplier'],
  ['capture', 'reverse deterministic status tie', 'left.statusId.localeCompare(right.statusId)', 'right.statusId.localeCompare(left.statusId)'],
  ['capture', 'always match TypeBall', 'conditionMet = normalizedTargetTypes.has(normalizedBallTargetType);', 'conditionMet = true;'],
  ['capture', 'disable EliteSeal condition', "conditionMet = targetVariant === 'Elite';", 'conditionMet = false;'],
  ['capture', 'accept inherited object keys as ball classes', "typeof ballClass === 'string' && Object.hasOwn(CAPTURE_BALL_RULES, ballClass)", "typeof ballClass === 'string'"],
  ['capture', 'trust caller-forged primary type', 'const targetTypes = secondaryType === null ? [profile.type] : [profile.type, secondaryType];', 'const targetTypes = input.targetTypes ?? (secondaryType === null ? [profile.type] : [profile.type, secondaryType]);'],
  ['capture', 'invert level difference', 'const difference = targetLevel - referenceLevel;', 'const difference = referenceLevel - targetLevel;'],
  ['capture', 'shift easy level boundary', 'difference <= candidate.maxDifference', 'difference < candidate.maxDifference'],
  ['capture', 'snapshot lowest party level', 'Math.max(...levels)', 'Math.min(...levels)'],
  ['capture', 'drop Rare runtime alias', "rare: 'Normal'", "rare: 'Rare'"],
  ['capture', 'coerce object variant through alias keys', "typeof variant === 'string' && Object.hasOwn(aliases, variant)", 'true'],
  ['capture', 'treat malformed secondary type as absent', "if (hasSecondaryType\n    && (!secondaryType || !CAPTURE_PROFILE_TYPES.has(secondaryType) || secondaryType === profile.type))", "if (hasSecondaryType\n    && (secondaryType && (!CAPTURE_PROFILE_TYPES.has(secondaryType) || secondaryType === profile.type)))"],
  ['capture', 'roll after failed precondition', 'if (!policy.ok) return captureFailure(policy.reason);', 'if (false) return captureFailure(policy.reason);'],
  ['capture', 'treat zero HP as alive', "if (input.currentHp <= 0) return captureFailure('target_fainted');", "if (false) return captureFailure('target_fainted');"],
  ['capture', 'drop status multiplier', 'profile.baseRatePct * hp * status.multiplier * ball.multiplier * level * variant.multiplier', 'profile.baseRatePct * hp * ball.multiplier * level * variant.multiplier'],
  ['capture', 'drop ball multiplier', 'profile.baseRatePct * hp * status.multiplier * ball.multiplier * level * variant.multiplier', 'profile.baseRatePct * hp * status.multiplier * level * variant.multiplier'],
  ['capture', 'drop level multiplier', 'profile.baseRatePct * hp * status.multiplier * ball.multiplier * level * variant.multiplier', 'profile.baseRatePct * hp * status.multiplier * ball.multiplier * variant.multiplier'],
  ['capture', 'drop variant multiplier', 'profile.baseRatePct * hp * status.multiplier * ball.multiplier * level * variant.multiplier', 'profile.baseRatePct * hp * status.multiplier * ball.multiplier * level'],
  ['capture', 'bypass final clamp', 'captureFinalChancePctV1(rawChancePct)', 'rawChancePct'],
];

const contracts = { config: configContract, formulas: formulasContract, policies: policiesContract, capture: captureContract };
for (const [key, name, before, after] of mutants) {
  const source = originalSources[key].replace(before, after);
  assert.notEqual(source, originalSources[key], `${name} mutation must alter source`);
  let killed = false;
  try {
    contracts[key](await loadSource(key, source, `capture-mutant-${name.replaceAll(' ', '-')}`));
  } catch {
    killed = true;
  }
  assert.equal(killed, true, `${name} must be killed`);
}

console.log(`V8.1 A26 capture calculator mutants: PASS (${mutants.length}/${mutants.length} killed)`);
