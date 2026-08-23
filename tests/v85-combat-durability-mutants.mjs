import assert from 'node:assert/strict';
import fs from 'node:fs';

const sources = Object.freeze({
  config: ['balance-config.mjs', fs.readFileSync(new URL('../balance-config.mjs', import.meta.url), 'utf8')],
  live: ['live-progression.mjs', fs.readFileSync(new URL('../live-progression.mjs', import.meta.url), 'utf8')],
  game: ['game-v800.js', fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8')],
});
const potential = { hp: 15, atk: 15, def: 15, spAtk: 15, spDef: 15, spd: 15 };
const training = { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 };

async function loadSource(source, filename, label) {
  const fileUrl = new URL(`../${filename}`, import.meta.url);
  const absolute = source.replaceAll(/from '(\.\/[^']+)'/g, (_, relativePath) => `from '${new URL(relativePath, fileUrl).href}'`);
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64')}`);
}

function assertConfig(module) {
  assert.equal(module.BALANCE_CONFIG.combat.liveHpMultiplier, 6);
  assert.equal(module.BALANCE_CONFIG.combat.minimumEqualLevelNeutralBasicHits, 3);
}

function assertLive(module) {
  assert.equal(module.CANONICAL_LIVE_STAT_VERSION, 'canonical-live-stats/v2');
  const normal = module.calculateCanonicalWildStats({ runtimeSpeciesId: 'flameling', stage: 1, level: 15, potential, training, variant: 'Normal' });
  const boss = module.calculateCanonicalWildStats({ runtimeSpeciesId: 'flameling', stage: 1, level: 15, potential, training, variant: 'Boss' });
  assert.deepEqual(normal.stats, { hp: 246, atk: 18, def: 17, spAtk: 23, spDef: 18, spd: 21 });
  assert.equal(boss.stats.hp, 492);
  const owned = {
    instanceId: 'durable-owned', speciesId: 'flameling', canonicalFormId: 'MON_002', level: 15,
    potential: { ...potential }, statTraining: { ...training }, training: {},
    _condition: 'normal', body: {}, mind: {}, nutrition: { allocations: {} },
  };
  assert.deepEqual(module.computeCanonicalOwnedStats(owned).stats, normal.stats);
}

function assertGame(source) {
  assert.match(source, /state\.collection=migrated\.collection\.map\(ensureInstanceShape\)/);
  assert.match(source, /function loadGame\(\)[\s\S]*?migrateLoadedState\(saved\.state\)/);
  assert.match(source, /async function syncCloudSave\(\)[\s\S]*?migrateLoadedState\(remote\.state\)/);
}

assertConfig(await loadSource(sources.config[1], sources.config[0], 'combat-durability-config-current'));
assertLive(await loadSource(sources.live[1], sources.live[0], 'combat-durability-live-current'));
assertGame(sources.game[1]);

const mutations = [
  ['config', 'disable durability scale', 'liveHpMultiplier: 6', 'liveHpMultiplier: 1', assertConfig],
  ['config', 'allow one-hit baseline', 'minimumEqualLevelNeutralBasicHits: 3', 'minimumEqualLevelNeutralBasicHits: 1', assertConfig],
  ['live', 'drop owned HP scale', 'Math.round(beforePassive * passiveMultiplier * durabilityMultiplier)', 'Math.round(beforePassive * passiveMultiplier)', assertLive],
  ['live', 'drop wild HP scale', 'Math.round(formula.stats[stat] * multipliers[stat] * durabilityMultiplier)', 'Math.round(formula.stats[stat] * multipliers[stat])', assertLive],
  ['live', 'scale every owned stat', "stat === 'hp' ? BALANCE_CONFIG.combat.liveHpMultiplier : 1", 'true ? BALANCE_CONFIG.combat.liveHpMultiplier : 1', assertLive],
  ['live', 'weaken Boss HP variant', 'Boss: Object.freeze({ hp: 2, atk: 1.35', 'Boss: Object.freeze({ hp: 1, atk: 1.35', assertLive],
  ['live', 'remove durability contract version', "'canonical-live-stats/v2'", "'canonical-live-stats/v1'", assertLive],
  ['game', 'skip loaded monster stat refresh', 'state.collection=migrated.collection.map(ensureInstanceShape);', 'state.collection=migrated.collection;', assertGame],
  ['game', 'skip local durability migration', 'migrateLoadedState(saved.state);', 'void saved.state;', assertGame],
  ['game', 'skip Firebase durability migration', 'migrateLoadedState(remote.state);', 'void remote.state;', assertGame],
];

let killed = 0;
for (const [sourceKey, name, from, to, contract] of mutations) {
  const [filename, source] = sources[sourceKey];
  const mutant = source.replace(from, to);
  assert.notEqual(mutant, source, `${name} mutation must apply`);
  try {
    const target = sourceKey === 'game' ? mutant : await loadSource(mutant, filename, `combat-durability-mutant-${name}`);
    contract(target);
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

assert.equal(killed, mutations.length);
console.log(`V8.5 combat durability mutants: PASS (${killed}/${mutations.length} killed)`);
