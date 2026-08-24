import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BALANCE_CONFIG, WORKBOOK_EXP_ADAPTER } from '../balance-config.mjs';
import {
  calculateWorkbookExpCurvePreview,
  cumulativeExpToLevel,
  expToNext,
  levelFromTotalExp,
} from '../balance-formulas.mjs';
import { applyBattleGrowth, resolveBattleGrowth, resolvePartyShareGrowth } from '../battle-growth.mjs';
import {
  INSTANCE_EXP_SCHEMA_VERSION,
  INSTANCE_SAVE_VERSION,
  addGrowthExp,
  canonicalGrowthProfile,
  createInstance,
  migrateLegacyGrowthExp,
  normalizeInstance,
  sanitizeMonsterInstanceForPersistence,
} from '../monster-instance.mjs';
import { MONSTER_STAT_CATALOG } from '../monster-stat-catalog.mjs';
import { calculateMonsterStats, DEFAULT_MONSTER_POTENTIAL, EMPTY_MONSTER_TRAINING } from '../monster-stat-formula.mjs';
import { SAVE_SCHEMA_VERSION, normalizeSavedState, sanitizeStateForPersistence } from '../save-schema.mjs';

assert.equal(WORKBOOK_EXP_ADAPTER.activation, 'runtime_live');
assert.equal(WORKBOOK_EXP_ADAPTER.runtimeEligible, true);
assert.equal(WORKBOOK_EXP_ADAPTER.levelCapDecision, 'M7_RUNTIME_CAP_60_LIVE');
assert.equal(WORKBOOK_EXP_ADAPTER.curveDecision, 'M7_WORKBOOK_CURVES_LIVE');
assert.equal(BALANCE_CONFIG.level.cap, 60);
assert.equal(BALANCE_CONFIG.level.defaultCurve, 'Medium');
assert.equal(INSTANCE_EXP_SCHEMA_VERSION, 'workbook-exp/v1');
assert.equal(INSTANCE_SAVE_VERSION, 15);
assert.equal(SAVE_SCHEMA_VERSION, 15);

for (const curve of Object.keys(WORKBOOK_EXP_ADAPTER.curves)) {
  let previous = -1;
  for (let level = 1; level <= 60; level += 1) {
    const cumulative = cumulativeExpToLevel(level, BALANCE_CONFIG, curve);
    const workbook = calculateWorkbookExpCurvePreview({ curve, level });
    assert.equal(cumulative, workbook.cumulative, `${curve} Lv.${level} uses the exact Workbook cumulative threshold`);
    assert.ok(cumulative > previous, `${curve} remains strictly monotonic through Lv.${level}`);
    const resolved = levelFromTotalExp(cumulative, BALANCE_CONFIG, curve);
    assert.equal(resolved.level, level, `${curve} Lv.${level} threshold resolves exactly`);
    assert.equal(resolved.curve, curve);
    previous = cumulative;
  }
  assert.equal(expToNext(60, BALANCE_CONFIG, curve), 0);
  const overflow = levelFromTotalExp(cumulativeExpToLevel(60, BALANCE_CONFIG, curve) + 777, BALANCE_CONFIG, curve);
  assert.deepEqual({ level: overflow.level, atCap: overflow.atCap, overflowExp: overflow.overflowExp }, {
    level: 60, atCap: true, overflowExp: 777,
  });
}

assert.equal(MONSTER_STAT_CATALOG.length, 36);
for (const form of MONSTER_STAT_CATALOG) {
  const instance = createInstance({
    instanceId: `exp-${form.formId}`,
    speciesId: form.runtimeSpeciesId,
    canonicalFormId: form.formId,
    formId: form.formId,
    level: 1,
    growthExp: 0,
  });
  const profile = canonicalGrowthProfile(instance);
  assert.deepEqual(
    { formId: profile.formId, growthCurve: profile.growthCurve, baseExpYield: profile.baseExpYield },
    { formId: form.formId, growthCurve: form.growthCurve, baseExpYield: form.baseExpYield },
  );
  assert.equal(instance.growthCurve, form.growthCurve);
  const target = cumulativeExpToLevel(60, BALANCE_CONFIG, form.growthCurve);
  const growth = addGrowthExp(instance, target);
  assert.equal(growth.toLevel, 60);
  assert.equal(growth.atCap, true);
  assert.equal(instance.level, 60);
  addGrowthExp(instance, 999999);
  assert.equal(instance.level, 60, `${form.formId} never exceeds Lv.60`);
  const stats = calculateMonsterStats({
    formId: form.formId,
    level: instance.level,
    potential: DEFAULT_MONSTER_POTENTIAL,
    training: EMPTY_MONSTER_TRAINING,
  });
  assert.equal(stats.ok, true, `${form.formId} six-stat runtime accepts Lv.60`);

  const reward = resolveBattleGrowth({
    monster: createInstance({
      instanceId: `fighter-${form.formId}`, speciesId: form.runtimeSpeciesId,
      canonicalFormId: form.formId, formId: form.formId, level: 20,
    }),
    enemy: { level: 20, tier: 'normal', baseExpYield: form.baseExpYield },
    events: [{ category: 'power', amount: 1, meaningful: true }],
    outcome: 'win',
  });
  assert.equal(reward.growthExp, Math.floor(form.baseExpYield * 20 / 7), `${form.formId} BaseExpYield is live`);
  assert.equal(reward.expPreview.activation, 'runtime_live');
}

for (const speciesId of new Set(MONSTER_STAT_CATALOG.map(form => form.runtimeSpeciesId))) {
  const family = MONSTER_STAT_CATALOG.filter(form => form.runtimeSpeciesId === speciesId);
  assert.equal(family.length, 2);
  assert.equal(family[0].growthCurve, family[1].growthCurve, `${speciesId} keeps its curve across evolution`);
  assert.ok(family[1].baseExpYield > family[0].baseExpYield, `${speciesId} Stage2 yields more EXP`);
}

const legacyMedium = normalizeInstance({
  instanceId: 'legacy-medium', speciesId: 'flameling', formId: 'flameling', level: 20, growthExp: 14820,
});
assert.equal(legacyMedium.level, 20);
assert.equal(legacyMedium.growthExp, 7999);
assert.equal(legacyMedium.growthCurve, 'Medium');
assert.equal(legacyMedium.growthExpSchemaVersion, INSTANCE_EXP_SCHEMA_VERSION);
const legacyMediumSlow = normalizeInstance({
  instanceId: 'legacy-medium-slow', speciesId: 'rockhorn', formId: 'rockhorn', level: 20, growthExp: 14820,
});
assert.equal(legacyMediumSlow.level, 20);
assert.equal(legacyMediumSlow.growthExp, 9199);
assert.equal(legacyMediumSlow.growthCurve, 'MediumSlow');
const legacySlow = normalizeInstance({
  instanceId: 'legacy-slow', speciesId: 'emberdrake', formId: 'emberdrake', level: 20, growthExp: 14820,
});
assert.equal(legacySlow.level, 20);
assert.equal(legacySlow.growthExp, 10799);
assert.equal(legacySlow.growthCurve, 'Slow');
assert.equal(migrateLegacyGrowthExp({ level: 50, totalExp: 189140, growthCurve: 'Medium' }), 124999);

const canonicalRoundTrip = normalizeInstance({
  ...legacySlow,
  growthAwardIds: ['encounter:1', 'encounter:1', '', null],
});
assert.equal(canonicalRoundTrip.growthExp, legacySlow.growthExp, 'canonical migration is idempotent');
assert.deepEqual(canonicalRoundTrip.growthAwardIds, ['encounter:1']);
const persisted = sanitizeMonsterInstanceForPersistence(canonicalRoundTrip);
assert.equal(persisted.growthExpSchemaVersion, INSTANCE_EXP_SCHEMA_VERSION);
assert.equal(persisted.growthCurve, 'Slow');
const state = normalizeSavedState({ collection: [persisted], party: [persisted.instanceId] });
const saved = sanitizeStateForPersistence(state);
assert.equal(saved.saveVersion, 15);
assert.equal(saved.collection[0].level, 20);
assert.equal(saved.collection[0].growthExp, 10799);
assert.deepEqual(normalizeSavedState(saved), state, 'save/reload is twice-is-same after M7 migration');

const battleMonster = createInstance({
  instanceId: 'reward-live', speciesId: 'flameling', canonicalFormId: 'MON_002', formId: 'MON_002', level: 20,
});
const elite = resolveBattleGrowth({
  monster: battleMonster,
  enemy: { level: 20, tier: 'elite', baseExpYield: 90 },
  events: [{ category: 'power', amount: 1, meaningful: true }],
  outcome: 'win',
});
assert.equal(elite.growthExp, 360, 'Elite reward uses Workbook 1.4 multiplier');
const before = battleMonster.growthExp;
const applied = applyBattleGrowth(battleMonster, elite, { now: 1000 });
assert.equal(battleMonster.growthExp, before + 360);
assert.equal(applied.growth.growthCurve, 'Medium');
assert.equal(resolvePartyShareGrowth({ activeGrowthExp: elite.growthExp }), 180, 'PartyAssist uses Workbook 0.5 multiplier');
const noContribution = resolveBattleGrowth({
  monster: battleMonster, enemy: { level: 20, tier: 'normal', baseExpYield: 90 }, events: [], outcome: 'win',
});
assert.equal(noContribution.growthExp, 64, 'no-contribution anti-grind still applies to Workbook reward');
assert.equal(resolveBattleGrowth({
  monster: battleMonster, enemy: { level: 20, tier: 'boss', baseExpYield: 100 }, events: [], outcome: 'lose',
}).growthExp, 0, 'loss never grants victory EXP');

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const defeatWild = game.match(/function defeatWild\(w,rewardOwnerInstanceId=null\)\{[\s\S]*?\n\}/)?.[0] ?? '';
const makeInstance = game.match(/function makeInstance\(sp,level=1,opts=\{\}\)\{[\s\S]*?\n\}/)?.[0] ?? '';
assert.match(defeatWild, /monsterStatCatalogEntry\(w\.canonicalFormId\)/);
assert.match(defeatWild, /baseExpYield:enemyForm\?\.baseExpYield/);
assert.match(makeInstance, /growthExpForLevel\(level,spawnForm\?\.growthCurve\)/);
assert.match(game, /growthExpForLevel\(\(inst\.level\|\|1\)\+1,inst\.growthCurve\)/);

console.log('V8.3 canonical GrowthCurve/BaseExpYield runtime: PASS (36 forms, Lv.60)');
