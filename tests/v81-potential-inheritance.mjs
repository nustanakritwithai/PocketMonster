import assert from 'node:assert/strict';
import {
  POTENTIAL_STATS,
  breed,
  resolvePotentialInheritance,
} from '../breeding.mjs';

const holder = {
  instanceId: 'holder',
  potential: { hp: 31, atk: 30, def: 29, spAtk: 28, spDef: 27, spd: 26 },
};
const partner = {
  instanceId: 'partner',
  potential: { hp: 1, atk: 2, def: 3, spAtk: 4, spDef: 5, spd: 6 },
};

const first = resolvePotentialInheritance(holder, partner, { seed: 'inherit-42' });
const replay = resolvePotentialInheritance(holder, partner, { seed: 'inherit-42' });
assert.equal(first.ok, true);
assert.deepEqual(first, replay, 'same seed must reproduce stat identities and values');
assert.deepEqual(Object.keys(first.potential).sort(), [...POTENTIAL_STATS].sort());
assert.equal(first.inheritedStats.length, 3);
assert.equal(new Set(first.inheritedStats).size, 3, 'inherited stat identities are unique');
assert.equal(first.inheritedStats.filter(stat => first.sources[stat] === 'egg_holder').length, 2);
assert.equal(first.inheritedStats.filter(stat => first.sources[stat] === 'partner').length, 1);

for (const stat of POTENTIAL_STATS) {
  assert.ok(Number.isInteger(first.potential[stat]));
  assert.ok(first.potential[stat] >= 0 && first.potential[stat] <= 31);
  if (first.sources[stat] === 'egg_holder') assert.equal(first.potential[stat], holder.potential[stat]);
  if (first.sources[stat] === 'partner') assert.equal(first.potential[stat], partner.potential[stat]);
}

const changed = resolvePotentialInheritance(holder, partner, { seed: 'inherit-43' });
assert.equal(changed.ok, true);
assert.notDeepEqual(changed, first, 'a different seed may change selections or random values');

assert.equal(resolvePotentialInheritance(null, partner, { seed: 1 }).reason, 'invalid_parent');
assert.equal(resolvePotentialInheritance({ ...holder, potential: { ...holder.potential, hp: 32 } }, partner, { seed: 1 }).reason, 'invalid_potential');

const bred = breed(holder, partner, { species: { id: 'flameling' }, seed: 'inherit-42', now: 1000 });
assert.equal(bred.ok, true);
assert.deepEqual(bred.child.potential, first.potential, 'breed uses the same deterministic potential contract');
assert.deepEqual(holder.potential, { hp: 31, atk: 30, def: 29, spAtk: 28, spDef: 27, spd: 26 }, 'parents remain unchanged');

console.log('V8.1 seeded potential inheritance: PASS');
