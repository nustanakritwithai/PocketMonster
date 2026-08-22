import assert from 'node:assert/strict';
import {
  POTENTIAL_LIMITS,
  POTENTIAL_STATS,
  resolvePotentialInheritance,
} from '../breeding.mjs';

const EXPECTED_STATS = Object.freeze(['hp', 'atk', 'def', 'spAtk', 'spDef', 'spd']);
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

assert.deepEqual(POTENTIAL_STATS, EXPECTED_STATS, 'BRD_v1.0 owns all six Potential stat identities');
assert.deepEqual(POTENTIAL_LIMITS, { min: 0, max: 31 }, 'fresh Potential rolls use the inclusive 0..31 bounds');

const first = resolvePotentialInheritance(holder, partner, { seed: 'inherit-42' });
const replay = resolvePotentialInheritance(holder, partner, { seed: 'inherit-42' });
assert.equal(first.ok, true);
assert.deepEqual(first, replay, 'same seed must reproduce stat identities and values');
assert.deepEqual(Object.keys(first.potential).sort(), [...EXPECTED_STATS].sort());
assert.deepEqual(first.inheritedStats, ['spd', 'def', 'hp'], 'seeded stat selection is stable');
assert.deepEqual(first.randomStats, ['atk', 'spAtk', 'spDef']);
assert.deepEqual(first.randomStats.map(stat => first.potential[stat]), [4, 22, 30], 'each remaining stat consumes its own seeded roll');
assert.equal(first.inheritedStats.length, 3);
assert.equal(new Set(first.inheritedStats).size, 3, 'inherited stat identities are unique');
assert.equal(first.inheritedStats.filter(stat => first.sources[stat] === 'egg_holder').length, 2);
assert.equal(first.inheritedStats.filter(stat => first.sources[stat] === 'partner').length, 1);
assert.equal(first.randomStats.length, 3);
assert.equal(Object.isFrozen(first), true);
assert.equal(Object.isFrozen(first.potential), true);
assert.equal(Object.isFrozen(first.sources), true);
assert.equal(Object.isFrozen(first.inheritedStats), true);
assert.equal(Object.isFrozen(first.randomStats), true);

for (const stat of EXPECTED_STATS) {
  assert.ok(Number.isInteger(first.potential[stat]));
  assert.ok(first.potential[stat] >= 0 && first.potential[stat] <= 31);
  if (first.sources[stat] === 'egg_holder') assert.equal(first.potential[stat], holder.potential[stat]);
  if (first.sources[stat] === 'partner') assert.equal(first.potential[stat], partner.potential[stat]);
  assert.equal(first.randomStats.includes(stat), first.sources[stat] === 'random');
}

const changed = resolvePotentialInheritance(holder, partner, { seed: 'inherit-43' });
assert.equal(changed.ok, true);
assert.notDeepEqual(changed, first, 'a different seed may change selections or random values');

const reversed = resolvePotentialInheritance(partner, holder, { seed: 'inherit-42' });
assert.deepEqual(reversed.inheritedStats, first.inheritedStats, 'role reversal does not change seeded stat identities');
for (const stat of EXPECTED_STATS) {
  if (reversed.sources[stat] === 'egg_holder') assert.equal(reversed.potential[stat], partner.potential[stat]);
  if (reversed.sources[stat] === 'partner') assert.equal(reversed.potential[stat], holder.potential[stat]);
}

const randomValues = new Set();
const holderSelections = new Set();
const partnerSelections = new Set();
let observedThreeDistinctRandomValues = false;
for (let seed = 0; seed < 512; seed += 1) {
  const result = resolvePotentialInheritance(holder, partner, { seed: `bounds-${seed}` });
  assert.equal(result.ok, true);
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
  for (const stat of result.randomStats) randomValues.add(result.potential[stat]);
}
assert.equal(randomValues.has(0), true, 'seed corpus reaches inclusive random minimum');
assert.equal(randomValues.has(31), true, 'seed corpus reaches inclusive random maximum');
assert.deepEqual([...holderSelections].sort(), [...EXPECTED_STATS].sort(), 'every stat can be selected from the Egg Holder');
assert.deepEqual([...partnerSelections].sort(), [...EXPECTED_STATS].sort(), 'every stat can be selected from the Partner');
assert.equal(observedThreeDistinctRandomValues, true, 'fresh random stats are not one reused roll');

assert.equal(resolvePotentialInheritance(null, partner, { seed: 1 }).reason, 'invalid_parent');
assert.equal(resolvePotentialInheritance(holder, null, { seed: 1 }).reason, 'invalid_parent');
assert.equal(resolvePotentialInheritance({ ...holder, potential: { ...holder.potential, hp: -1 } }, partner, { seed: 1 }).reason, 'invalid_potential');
assert.equal(resolvePotentialInheritance({ ...holder, potential: { ...holder.potential, hp: 32 } }, partner, { seed: 1 }).reason, 'invalid_potential');
assert.equal(resolvePotentialInheritance({ ...holder, potential: { ...holder.potential, hp: 1.5 } }, partner, { seed: 1 }).reason, 'invalid_potential');
assert.equal(resolvePotentialInheritance(holder, { ...partner, potential: { ...partner.potential, spd: '6' } }, { seed: 1 }).reason, 'invalid_potential');
assert.deepEqual(holder, holderSnapshot, 'Egg Holder remains unchanged');
assert.deepEqual(partner, partnerSnapshot, 'Partner remains unchanged');

console.log('V8.1 seeded potential inheritance: PASS');
