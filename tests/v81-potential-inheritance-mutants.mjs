import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceUrl = new URL('../breeding.mjs', import.meta.url);
const originalSource = fs.readFileSync(sourceUrl, 'utf8');
const EXPECTED_STATS = Object.freeze(['hp', 'atk', 'def', 'spAtk', 'spDef', 'spd']);

async function loadSource(source, tag) {
  const withAbsoluteImports = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${withAbsoluteImports}\n//# sourceURL=${tag}`).toString('base64')}`);
}

function inheritanceContract(module) {
  assert.deepEqual(module.POTENTIAL_STATS, EXPECTED_STATS);
  assert.deepEqual(module.POTENTIAL_LIMITS, { min: 0, max: 31 });

  const holder = {
    instanceId: 'holder',
    potential: { hp: 31, atk: 30, def: 29, spAtk: 28, spDef: 27, spd: 26 },
  };
  const partner = {
    instanceId: 'partner',
    potential: { hp: 1, atk: 2, def: 3, spAtk: 4, spDef: 5, spd: 6 },
  };
  const holderSnapshot = structuredClone(holder);
  const partnerSnapshot = structuredClone(partner);
  const first = module.resolvePotentialInheritance(holder, partner, { seed: 'inherit-42' });
  const replay = module.resolvePotentialInheritance(holder, partner, { seed: 'inherit-42' });

  assert.equal(first.ok, true);
  assert.deepEqual(first, replay);
  assert.deepEqual(Object.keys(first.potential).sort(), [...EXPECTED_STATS].sort());
  assert.deepEqual(first.inheritedStats, ['spd', 'def', 'hp']);
  assert.deepEqual(first.randomStats, ['atk', 'spAtk', 'spDef']);
  assert.deepEqual(first.randomStats.map(stat => first.potential[stat]), [4, 22, 30]);
  assert.equal(first.inheritedStats.length, 3);
  assert.equal(new Set(first.inheritedStats).size, 3);
  assert.equal(first.randomStats.length, 3);
  assert.equal(Object.values(first.sources).filter(source => source === 'egg_holder').length, 2);
  assert.equal(Object.values(first.sources).filter(source => source === 'partner').length, 1);
  assert.equal(Object.values(first.sources).filter(source => source === 'random').length, 3);
  for (const stat of EXPECTED_STATS) {
    if (first.sources[stat] === 'egg_holder') assert.equal(first.potential[stat], holder.potential[stat]);
    if (first.sources[stat] === 'partner') assert.equal(first.potential[stat], partner.potential[stat]);
    assert.equal(first.randomStats.includes(stat), first.sources[stat] === 'random');
  }

  const changed = module.resolvePotentialInheritance(holder, partner, { seed: 'different-seed' });
  assert.notDeepEqual(changed, first);
  const reversed = module.resolvePotentialInheritance(partner, holder, { seed: 'inherit-42' });
  assert.deepEqual(reversed.inheritedStats, first.inheritedStats);
  for (const stat of EXPECTED_STATS) {
    if (reversed.sources[stat] === 'egg_holder') assert.equal(reversed.potential[stat], partner.potential[stat]);
    if (reversed.sources[stat] === 'partner') assert.equal(reversed.potential[stat], holder.potential[stat]);
  }

  const observedRandom = new Set();
  const holderSelections = new Set();
  const partnerSelections = new Set();
  let observedThreeDistinctRandomValues = false;
  for (let seed = 0; seed < 512; seed += 1) {
    const result = module.resolvePotentialInheritance(holder, partner, { seed: `bounds-${seed}` });
    assert.equal(result.inheritedStats.length, 3);
    assert.equal(new Set(result.inheritedStats).size, 3);
    assert.equal(Object.values(result.sources).filter(source => source === 'egg_holder').length, 2);
    assert.equal(Object.values(result.sources).filter(source => source === 'partner').length, 1);
    assert.equal(Object.values(result.sources).filter(source => source === 'random').length, 3);
    for (const stat of EXPECTED_STATS) {
      if (result.sources[stat] === 'egg_holder') holderSelections.add(stat);
      if (result.sources[stat] === 'partner') partnerSelections.add(stat);
    }
    const perChildRandomValues = result.randomStats.map(stat => result.potential[stat]);
    if (new Set(perChildRandomValues).size === 3) observedThreeDistinctRandomValues = true;
    for (const stat of result.randomStats) observedRandom.add(result.potential[stat]);
  }
  assert.equal(observedRandom.has(0), true);
  assert.equal(observedRandom.has(31), true);
  assert.deepEqual([...holderSelections].sort(), [...EXPECTED_STATS].sort());
  assert.deepEqual([...partnerSelections].sort(), [...EXPECTED_STATS].sort());
  assert.equal(observedThreeDistinctRandomValues, true);

  assert.equal(module.resolvePotentialInheritance({ ...holder, potential: { ...holder.potential, hp: -1 } }, partner).reason, 'invalid_potential');
  assert.equal(module.resolvePotentialInheritance({ ...holder, potential: { ...holder.potential, hp: 32 } }, partner).reason, 'invalid_potential');
  assert.deepEqual(holder, holderSnapshot);
  assert.deepEqual(partner, partnerSnapshot);
}

inheritanceContract(await loadSource(originalSource, 'potential-current'));

const mutants = [
  ['drop SPD', "['hp', 'atk', 'def', 'spAtk', 'spDef', 'spd']", "['hp', 'atk', 'def', 'spAtk', 'spDef']"],
  ['raise random minimum', '{ min: 0, max: 31 }', '{ min: 1, max: 31 }'],
  ['lower random maximum', '{ min: 0, max: 31 }', '{ min: 0, max: 30 }'],
  [
    'inherit one holder stat',
    'const holderStats = [takeSeededStat(rng, available), takeSeededStat(rng, available)];',
    'const holderStats = [takeSeededStat(rng, available)];',
  ],
  [
    'inherit three holder stats',
    'const holderStats = [takeSeededStat(rng, available), takeSeededStat(rng, available)];',
    'const holderStats = [takeSeededStat(rng, available), takeSeededStat(rng, available), takeSeededStat(rng, available)];',
  ],
  [
    'reuse holder stat for partner',
    'const partnerStat = takeSeededStat(rng, available);',
    'const partnerStat = holderStats[0];',
  ],
  ['fix stat selector', 'const index = rng.int(0, available.length - 1);', 'const index = 0;'],
  ['read holder value from partner', 'potential[stat] = eggHolder.potential[stat];', 'potential[stat] = partner.potential[stat];'],
  ['read partner value from holder', 'potential[stat] = partner.potential[stat];', 'potential[stat] = eggHolder.potential[stat];'],
  [
    'exclude random maximum',
    'rng.int(POTENTIAL_LIMITS.min, POTENTIAL_LIMITS.max);',
    'rng.int(POTENTIAL_LIMITS.min, POTENTIAL_LIMITS.max - 1);',
  ],
  [
    'exclude random minimum',
    'rng.int(POTENTIAL_LIMITS.min, POTENTIAL_LIMITS.max);',
    'rng.int(POTENTIAL_LIMITS.min + 1, POTENTIAL_LIMITS.max);',
  ],
  [
    'reuse one random roll',
    'potential[stat] = rng.int(POTENTIAL_LIMITS.min, POTENTIAL_LIMITS.max);',
    "potential[stat] = potential[POTENTIAL_STATS.find(key => sources[key] === 'random')] ?? rng.int(POTENTIAL_LIMITS.min, POTENTIAL_LIMITS.max);",
  ],
  [
    'ignore caller seed',
    'const rng = createRng(`${String(seed)}:potential`);',
    "const rng = createRng('fixed:potential');",
  ],
  ['allow below minimum', 'value[stat] >= POTENTIAL_LIMITS.min', 'true'],
  ['allow above maximum', 'value[stat] <= POTENTIAL_LIMITS.max', 'true'],
  ["mislabel partner source", "sources[stat] = 'partner';", "sources[stat] = 'egg_holder';"],
  ["mislabel random source", "sources[stat] = 'random';", "sources[stat] = 'partner';"],
];

for (const [name, before, after] of mutants) {
  const source = originalSource.replace(before, after);
  assert.notEqual(source, originalSource, `${name} mutation must alter source`);
  const module = await loadSource(source, `potential-mutant-${name.replaceAll(' ', '-')}`);
  assert.throws(() => inheritanceContract(module), undefined, `${name} must be killed`);
}

console.log(`V8.1 Potential inheritance mutants: PASS (${mutants.length}/${mutants.length} killed)`);
