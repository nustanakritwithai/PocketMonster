import assert from 'node:assert/strict';
import {
  STATUS_APPLICATION_POLICY,
  STATUS_TYPE_RULES,
  resolveStatusApplication,
} from '../status-resolver.mjs';

assert.equal(STATUS_APPLICATION_POLICY.activation, 'resolver_only');
assert.equal(STATUS_APPLICATION_POLICY.liveStatusMutation, 'deferred_A23');
assert.equal(STATUS_APPLICATION_POLICY.hardCcDiminishingReturns, 'deferred_A24');
assert.equal(STATUS_TYPE_RULES.length, 12, 'all Workbook immunity/resistance rows are present');

let draws = 0;
const immune = resolveStatusApplication({
  linkId: 'SL_0004',
  targetTypes: ['Fire'],
  currentStacks: 0,
}, { rng: () => { draws += 1; return 0; } });
assert.equal(immune.ok, true);
assert.equal(immune.applied, false);
assert.equal(immune.reason, 'type_immune');
assert.equal(immune.finalChancePct, 0);
assert.equal(immune.rngDraws, 0);
assert.equal(draws, 0, 'immunity short-circuits before RNG');

const rockBleedHit = resolveStatusApplication({
  linkId: 'SL_0036',
  targetTypes: ['Rock'],
  currentStacks: 0,
}, { rng: () => 0.17 });
assert.equal(rockBleedHit.resistancePct, 50);
assert.equal(rockBleedHit.finalChancePct, 17.5);
assert.equal(rockBleedHit.applied, true);
const rockBleedMiss = resolveStatusApplication({
  linkId: 'SL_0036', targetTypes: ['Rock'], currentStacks: 0,
}, { rng: () => 0.18 });
assert.equal(rockBleedMiss.applied, false);
assert.equal(rockBleedMiss.reason, 'chance_miss');

const minimumClamp = resolveStatusApplication({
  linkId: 'SL_0015', targetTypes: ['Electric'], currentStacks: 0,
}, { rng: () => 0.049 });
assert.equal(minimumClamp.finalChancePct, 5, 'positive base chance clamps to 5% after resistance');
assert.equal(minimumClamp.applied, true);
const minimumBoundary = resolveStatusApplication({
  linkId: 'SL_0015', targetTypes: ['Electric'], currentStacks: 0,
}, { rng: () => 0.05 });
assert.equal(minimumBoundary.applied, false, 'chance uses a strict roll-below boundary');

const maximumClamp = resolveStatusApplication({
  linkId: 'SL_0005', targetTypes: ['Water'], currentStacks: 0,
}, { rng: () => 0.949 });
assert.equal(maximumClamp.finalChancePct, 95);
assert.equal(maximumClamp.applied, true);

const dualTypeStrongest = resolveStatusApplication({
  linkId: 'SL_0026', targetTypes: ['Fighting', 'Rock'], currentStacks: 0,
  extraResistancePct: 20,
}, { rng: () => 0.55 });
assert.equal(dualTypeStrongest.resistancePct, 30, 'dual types use the strongest matching Workbook resistance');
assert.equal(dualTypeStrongest.finalChancePct, 56, 'extra resistance composes with type resistance using the Workbook formula');
assert.equal(dualTypeStrongest.applied, true);

draws = 0;
const positive = resolveStatusApplication({
  linkId: 'SL_0001', targetTypes: ['Normal'], currentStacks: 0,
}, { rng: () => { draws += 1; return 0.99; } });
assert.equal(positive.applied, true);
assert.equal(positive.finalChancePct, 100);
assert.equal(positive.rngDraws, 0);
assert.equal(draws, 0, 'positive self buffs ignore enemy resistance and RNG');

const stackInput = { linkId: 'SL_0042', targetTypes: ['Water'], currentStacks: 2 };
const stackBefore = structuredClone(stackInput);
const stack = resolveStatusApplication(stackInput, { rng: () => 0 });
assert.equal(stack.applied, true);
assert.equal(stack.previousStacks, 2);
assert.equal(stack.nextStacks, 3, 'potency 2 clamps to the Poison max-stack cap');
assert.equal(stack.maxStacks, 3);
assert.deepEqual(stackInput, stackBefore, 'resolver is read-only and returns a proposed encounter change');

assert.equal(resolveStatusApplication({
  linkId: 'SL_0004', targetTypes: ['LIGHT'], currentStacks: 0,
}, { rng: () => 0 }).reason, 'invalid_type', 'Workbook LIGHT never becomes an implicit runtime type');
assert.equal(resolveStatusApplication({
  linkId: 'SL_UNKNOWN', targetTypes: ['Fire'], currentStacks: 0,
}, { rng: () => 0 }).reason, 'unknown_link');
assert.equal(resolveStatusApplication({
  linkId: 'SL_0004', targetTypes: ['Water'], currentStacks: 0, extraResistancePct: 101,
}, { rng: () => 0 }).reason, 'invalid_resistance');

console.log('V8.1 status application resolver: PASS');
