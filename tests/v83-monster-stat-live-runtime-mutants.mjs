import assert from 'node:assert/strict';
import fs from 'node:fs';

const sources = Object.freeze({
  live: ['live-progression.mjs', fs.readFileSync(new URL('../live-progression.mjs', import.meta.url), 'utf8')],
  game: ['game-v800.js', fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8')],
});
const potential = { hp: 15, atk: 15, def: 15, spAtk: 15, spDef: 15, spd: 15 };
const training = { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 };

async function loadSource(source, filename, label) {
  const fileUrl = new URL(`../${filename}`, import.meta.url);
  const absolute = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(relativePath, fileUrl).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64')}`);
}

function ownedInput(overrides = {}) {
  return {
    instanceId: 'mut-owned', speciesId: 'flameling', canonicalFormId: 'MON_002', level: 15,
    potential: { ...potential }, statTraining: { ...training }, training: {},
    passiveId: 'PASS_FIRE_01', _condition: 'normal', body: {}, mind: {}, nutrition: { allocations: {} },
    ...overrides,
  };
}

function assertLive(module) {
  assert.equal(module.CANONICAL_LIVE_STAT_VERSION, 'canonical-live-stats/v1');
  const owned = ownedInput({ maxHp: 100, hp: 25 });
  const computed = module.computeCanonicalOwnedStats(owned, { hp: 3, atk: 2, def: 1, spAtk: 4, spDef: 5, spd: 6 });
  assert.equal(computed.ok, true);
  assert.deepEqual(computed.stats, { hp: 44, atk: 20, def: 18, spAtk: 27, spDef: 23, spd: 27 });
  module.refreshCanonicalOwnedStats(owned);
  assert.equal(owned.maxHp, 41);
  assert.equal(owned.hp, 10);
  assert.equal(owned.spAtk, 23);
  assert.equal(owned.spDef, 18);

  const rock = ownedInput({
    speciesId: 'rockhorn', canonicalFormId: 'MON_007', passiveId: 'PASS_ROCK_01', level: 1,
  });
  assert.equal(module.computeCanonicalOwnedStats(rock).stats.def, 7);

  const stage2 = module.calculateCanonicalWildStats({
    runtimeSpeciesId: 'flameling', stage: 2, level: 15, potential, training, variant: 'Elite',
  });
  assert.equal(stage2.ok, true);
  assert.equal(stage2.formId, 'MON_020');
  assert.deepEqual(stage2.stats, { hp: 69, atk: 30, def: 29, spAtk: 39, spDef: 30, spd: 31 });
  const boss = module.calculateCanonicalWildStats({
    runtimeSpeciesId: 'flameling', stage: 1, level: 15, potential, training, variant: 'Boss',
  });
  assert.deepEqual(boss.stats, { hp: 82, atk: 24, def: 22, spAtk: 31, spDef: 23, spd: 21 });
  assert.equal(module.calculateCanonicalWildStats({
    runtimeSpeciesId: 'flameling', stage: 1, level: 15, potential, training, variant: 'Mythic',
  }).ok, false);
}

function assertGame(source) {
  assert.match(source, /refreshCanonicalOwnedStats\(inst,getEquipmentFlat\(inst\),\{heal\}\)/);
  assert.match(source, /calculateCanonicalWildStats\(\{runtimeSpeciesId:sp\.id,stage:evolutionPath\?2:1/);
  assert.match(source, /\{hp:maxHp,atk,def,spAtk,spDef,spd\}=canonicalStats\.stats/);
  assert.match(source, /potential:w\.potential/);
  assert.match(source, /potential:opts\.potential/);
}

assertLive(await loadSource(sources.live[1], sources.live[0], 'monster-stat-live-current'));
assertGame(sources.game[1]);

const mutations = [
  ['live', 'change live version', "'canonical-live-stats/v1'", "'legacy-live-stats'", assertLive],
  ['live', 'resolve owned by species ID', 'inst?.canonicalFormId ?? canonicalFormIdForInstance(inst)', 'inst?.speciesId', assertLive],
  ['live', 'use legacy training vector', 'training: inst?.statTraining,', 'training: inst?.training,', assertLive],
  ['live', 'drop equipment modifier', 'const equipment = Number.isFinite(equipmentFlat?.[stat]) ? equipmentFlat[stat] : 0;', 'const equipment = 0;', assertLive],
  ['live', 'drop passive modifier', 'const passiveMultiplier = passiveModifiers.reduce((value, modifier) => value * modifier.multiplier, 1);', 'const passiveMultiplier = 1;', assertLive],
  ['live', 'drop owned SPATK apply', 'inst.spAtk = result.stats.spAtk;', 'inst.spAtk = inst.atk;', assertLive],
  ['live', 'reset HP instead of preserving ratio', 'Math.round(inst.maxHp * ratio)', 'inst.maxHp', assertLive],
  ['live', 'force wild Stage 1', 'monsterStatCatalogFormForStage(runtimeSpeciesId, stage)', 'monsterStatCatalogFormForStage(runtimeSpeciesId, 1)', assertLive],
  ['live', 'weaken Elite HP', 'hp: 1.3, atk: 1.12', 'hp: 1, atk: 1.12', assertLive],
  ['live', 'weaken Elite SPATK', 'spAtk: 1.12, spDef: 1.1', 'spAtk: 1, spDef: 1.1', assertLive],
  ['live', 'floor wild multipliers', 'Math.round(formula.stats[stat] * multipliers[stat])', 'Math.floor(formula.stats[stat] * multipliers[stat])', assertLive],
  ['live', 'accept unknown wild variant', 'if (!multipliers) return canonicalLiveFailure', 'if (false) return canonicalLiveFailure', assertLive],
  ['game', 'restore legacy owned refresh', 'refreshCanonicalOwnedStats(inst,getEquipmentFlat(inst),{heal})', 'refreshCoreStats(inst,sp,path,getEquipmentFlat(inst),{heal})', assertGame],
  ['game', 'drop wild special stats', '{hp:maxHp,atk,def,spAtk,spDef,spd}=canonicalStats.stats', '{hp:maxHp,atk,def,spd}=canonicalStats.stats', assertGame],
  ['game', 'reroll captured Potential', 'potential:w.potential', 'potential:randomPotential()', assertGame],
  ['game', 'drop owned Potential forwarding', 'potential:opts.potential', 'potential:undefined', assertGame],
  ['game', 'force wild Stage 1 at callsite', 'stage:evolutionPath?2:1', 'stage:1', assertGame],
];

let killed = 0;
for (const [sourceKey, name, from, to, contract] of mutations) {
  const [filename, source] = sources[sourceKey];
  const mutant = source.replace(from, to);
  assert.notEqual(mutant, source, `${name} mutation must apply`);
  try {
    const target = sourceKey === 'live' ? await loadSource(mutant, filename, `monster-stat-live-mutant-${name}`) : mutant;
    contract(target);
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

assert.equal(killed, mutations.length);
console.log(`V8.3 canonical live stat mutants: PASS (${killed}/${mutations.length} killed)`);
