import assert from 'node:assert/strict';
import fs from 'node:fs';

const sources = Object.freeze({
  config: ['balance-config.mjs', fs.readFileSync(new URL('../balance-config.mjs', import.meta.url), 'utf8')],
  formula: ['balance-formulas.mjs', fs.readFileSync(new URL('../balance-formulas.mjs', import.meta.url), 'utf8')],
  monster: ['monster-instance.mjs', fs.readFileSync(new URL('../monster-instance.mjs', import.meta.url), 'utf8')],
  battle: ['battle-growth.mjs', fs.readFileSync(new URL('../battle-growth.mjs', import.meta.url), 'utf8')],
  save: ['save-schema.mjs', fs.readFileSync(new URL('../save-schema.mjs', import.meta.url), 'utf8')],
  game: ['game-v800.js', fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8')],
});

async function loadModule(source, filename, label) {
  const fileUrl = new URL(`../${filename}`, import.meta.url);
  const absolute = source.replaceAll(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL(path, fileUrl).href}'`);
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64')}`);
}

function assertConfig(module) {
  assert.equal(module.WORKBOOK_EXP_ADAPTER.activation, 'runtime_live');
  assert.equal(module.WORKBOOK_EXP_ADAPTER.runtimeEligible, true);
  assert.equal(module.WORKBOOK_EXP_ADAPTER.levelCapDecision, 'M7_RUNTIME_CAP_60_LIVE');
  assert.equal(module.WORKBOOK_EXP_ADAPTER.curveDecision, 'M7_WORKBOOK_CURVES_LIVE');
  assert.equal(module.BALANCE_CONFIG.level.cap, 60);
  assert.equal(module.BALANCE_CONFIG.level.defaultCurve, 'Medium');
  assert.equal(module.BALANCE_CONFIG.level.curves.MediumSlow.multiplier, 1.15);
  assert.equal(module.BALANCE_CONFIG.level.curves.Slow.multiplier, 1.35);
  assert.equal(module.BALANCE_CONFIG.battle.partyGrowthShare, 0.5);
}

function assertFormula(module) {
  assert.equal(module.cumulativeExpToLevel(20, undefined, 'Medium'), 7999);
  assert.equal(module.cumulativeExpToLevel(20, undefined, 'MediumSlow'), 9199);
  assert.equal(module.cumulativeExpToLevel(20, undefined, 'Slow'), 10799);
  assert.equal(module.expToNext(50, undefined, 'Medium'), 7651);
  assert.equal(module.expToNext(60, undefined, 'Medium'), 0);
  assert.deepEqual(module.levelFromTotalExp(216776, undefined, 'Medium'), {
    level: 60, expIntoLevel: 0, expToNext: 0, atCap: true, overflowExp: 777, curve: 'Medium',
  });
}

function assertMonster(module) {
  assert.equal(module.INSTANCE_SAVE_VERSION, 13);
  assert.equal(module.INSTANCE_EXP_SCHEMA_VERSION, 'workbook-exp/v1');
  const migrated = module.normalizeInstance({
    instanceId: 'mut-legacy', speciesId: 'emberdrake', formId: 'emberdrake', level: 20, growthExp: 14820,
  });
  assert.equal(migrated.level, 20);
  assert.equal(migrated.growthExp, 10799);
  assert.equal(migrated.growthCurve, 'Slow');
  assert.equal(module.normalizeInstance(migrated).growthExp, 10799);
  const fresh = module.createInstance({
    instanceId: 'mut-fresh', speciesId: 'rockhorn', formId: 'MON_007', canonicalFormId: 'MON_007', level: 1,
  });
  assert.equal(module.canonicalGrowthProfile(fresh).baseExpYield, 35);
  assert.equal(fresh.growthCurve, 'MediumSlow');
  const grown = module.addGrowthExp(fresh, 143749);
  assert.equal(grown.toLevel, 50);
  assert.equal(grown.growthCurve, 'MediumSlow');
  const capped = module.addGrowthExp(fresh, 248399 - 143749);
  assert.equal(capped.toLevel, 60);
  assert.equal(fresh.exp, fresh.growthExp);
}

function assertBattle(module) {
  const monster = {
    level: 20,
    growthExp: 7999,
    growthCurve: 'Medium',
    growthExpSchemaVersion: 'workbook-exp/v1',
    career: { battleWins: 0, eliteWins: 0, bossWins: 0, trials: 0, milestones: [] },
    training: { power: 0, defense: 0, speed: 0, technique: 0, spirit: 0 },
    statTraining: { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 },
    lifeHistory: [],
  };
  const result = module.resolveBattleGrowth({
    monster,
    enemy: { level: 20, tier: 'elite', baseExpYield: 100 },
    events: [{ category: 'power', amount: 1, meaningful: true }],
    outcome: 'win',
  });
  assert.equal(result.growthExp, 400);
  assert.equal(result.baseExpYield, 100);
  assert.equal(result.variant, 'Elite');
  assert.equal(result.expPreview.activation, 'runtime_live');
  assert.equal(module.resolvePartyShareGrowth({ activeGrowthExp: 400 }), 200);
}

function assertSave(module) {
  assert.equal(module.SAVE_SCHEMA_VERSION, 13);
  assert.deepEqual(module.SAVE_MIGRATION_REGISTRY.map(entry => entry.id).slice(-2), [
    'canonical-monster-stats-v12', 'canonical-monster-exp-v13',
  ]);
}

function assertGame(source) {
  const defeat = source.match(/function defeatWild\(w\)\{[\s\S]*?\n\}/)?.[0] ?? '';
  const make = source.match(/function makeInstance\(sp,level=1,opts=\{\}\)\{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(defeat, /monsterStatCatalogEntry\(w\.canonicalFormId\)/);
  assert.match(defeat, /baseExpYield:enemyForm\?\.baseExpYield/);
  assert.match(make, /spawnForm\?\.growthCurve/);
  assert.match(source, /growthExpForLevel\(\(inst\.level\|\|1\)\+1,inst\.growthCurve\)/);
}

assertConfig(await loadModule(sources.config[1], sources.config[0], 'm7-config-current'));
assertFormula(await loadModule(sources.formula[1], sources.formula[0], 'm7-formula-current'));
assertMonster(await loadModule(sources.monster[1], sources.monster[0], 'm7-monster-current'));
assertBattle(await loadModule(sources.battle[1], sources.battle[0], 'm7-battle-current'));
assertSave(await loadModule(sources.save[1], sources.save[0], 'm7-save-current'));
assertGame(sources.game[1]);

const mutations = [
  ['config', 'restore Lv50 cap', 'cap: 60,', 'cap: 50,', assertConfig],
  ['config', 'deactivate Workbook EXP', "activation: 'runtime_live',", "activation: 'calculator_only',", assertConfig],
  ['config', 'deny runtime eligibility', 'runtimeEligible: true,', 'runtimeEligible: false,', assertConfig],
  ['config', 'restore deferred curve decision', "curveDecision: 'M7_WORKBOOK_CURVES_LIVE'", "curveDecision: 'D7_LIVE_CURVE_UNCHANGED'", assertConfig],
  ['config', 'weaken MediumSlow curve', 'MediumSlow: Object.freeze({ multiplier: 1.15', 'MediumSlow: Object.freeze({ multiplier: 1.0', assertConfig],
  ['config', 'weaken Slow curve', 'Slow: Object.freeze({ multiplier: 1.35', 'Slow: Object.freeze({ multiplier: 1.0', assertConfig],
  ['config', 'restore legacy party share', 'partyGrowthShare: 0.5', 'partyGrowthShare: 0.35', assertConfig],
  ['formula', 'floor curve cumulative', 'return Math.round(((level ** definition.exponent) - 1) * definition.multiplier);', 'return Math.floor(((level ** definition.exponent) - 1) * definition.multiplier);', assertFormula],
  ['formula', 'cap at Lv50', 'if (L >= cap) return 0;', 'if (L >= 50) return 0;', assertFormula],
  ['formula', 'resolve no Lv60', 'while (level < cap && cumulativeForCurve', 'while (level < 50 && cumulativeForCurve', assertFormula],
  ['formula', 'drop overflow', 'Math.max(0, Math.round(total - threshold))', '0', assertFormula],
  ['monster', 'retain v12 schema', 'export const INSTANCE_SAVE_VERSION = 13;', 'export const INSTANCE_SAVE_VERSION = 12;', assertMonster],
  ['monster', 'change EXP schema marker', "'workbook-exp/v1'", "'legacy-exp'", assertMonster],
  ['monster', 'force Medium growth profile', 'growthCurve: form.growthCurve,', "growthCurve: 'Medium',", assertMonster],
  ['monster', 'skip legacy conversion', ': migrateLegacyGrowthExp({ level: declaredLevel, totalExp: sourceGrowthExp, growthCurve });', ': sourceGrowthExp;', assertMonster],
  ['monster', 'resolve level on default curve', 'levelFromTotalExp(growthExp, BALANCE_CONFIG, growthCurve).level', 'levelFromTotalExp(growthExp, BALANCE_CONFIG).level', assertMonster],
  ['monster', 'add EXP on default curve', 'levelFromTotalExp(instance.growthExp, config, growthCurve)', 'levelFromTotalExp(instance.growthExp, config)', assertMonster],
  ['monster', 'drop legacy exp alias sync', 'instance.exp = instance.growthExp;', 'instance.exp = 0;', assertMonster],
  ['battle', 'ignore BaseExpYield', 'enemy.baseExpYield,', 'null,', assertBattle],
  ['battle', 'drop Elite variant', "tier === 'elite' ? 'Elite'", "tier === 'elite' ? 'Normal'", assertBattle],
  ['battle', 'bypass Workbook reward', 'const growthExp = expPreview.ok ? expPreview.reward : 0;', 'const growthExp = baseExpYield;', assertBattle],
  ['save', 'retain v12 save schema', 'export const SAVE_SCHEMA_VERSION = 13;', 'export const SAVE_SCHEMA_VERSION = 12;', assertSave],
  ['save', 'drop M7 migration', "  Object.freeze({\n    id: 'canonical-monster-exp-v13',\n    targetVersion: 13,\n    migrate: migrateState,\n  }),\n", '', assertSave],
  ['game', 'drop canonical enemy EXP profile', 'monsterStatCatalogEntry(w.canonicalFormId)', 'null', assertGame],
  ['game', 'drop enemy BaseExpYield', 'baseExpYield:enemyForm?.baseExpYield', 'baseExpYield:undefined', assertGame],
  ['game', 'spawn on default curve', 'growthExpForLevel(level,spawnForm?.growthCurve)', 'growthExpForLevel(level)', assertGame],
  ['game', 'level-up on default curve', 'growthExpForLevel((inst.level||1)+1,inst.growthCurve)', 'growthExpForLevel((inst.level||1)+1)', assertGame],
];

let killed = 0;
for (const [sourceKey, name, from, to, contract] of mutations) {
  const [filename, source] = sources[sourceKey];
  const mutant = source.replace(from, to);
  assert.notEqual(mutant, source, `${name} mutation must apply`);
  try {
    const target = sourceKey === 'game'
      ? mutant
      : await loadModule(mutant, filename, `m7-mutant-${sourceKey}-${name}`);
    contract(target);
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

assert.equal(killed, mutations.length);
console.log(`V8.3 canonical EXP mutants: PASS (${killed}/${mutations.length} killed)`);
