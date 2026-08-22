import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  RUNTIME_TYPES,
  TYPE_CHART,
  sourceTypeToRuntime,
  typeEffectiveness,
  typeProfile,
  validateTypeCatalog,
} from '../type-catalog.mjs';

assert.equal(RUNTIME_TYPES.length, 18, 'current runtime keeps 18 type identities');
assert.equal(new Set(RUNTIME_TYPES).size, 18, 'runtime type identities are unique');
assert.equal(RUNTIME_TYPES.includes('Fairy'), true, 'Fairy remains canonical');
assert.equal(RUNTIME_TYPES.includes('Light'), false, 'Light is not a new runtime type');
assert.equal(sourceTypeToRuntime('LIGHT'), 'Fairy', 'workbook LIGHT maps explicitly to Fairy');
assert.equal(sourceTypeToRuntime('FAIRY'), 'Fairy', 'canonical Fairy input stays Fairy');
assert.equal(sourceTypeToRuntime('UNKNOWN'), null, 'unknown source types do not invent identities');
assert.equal(typeProfile('Light'), null, 'Light cannot be resolved as a runtime profile');
assert.equal(validateTypeCatalog().ok, true, 'the current 18x18 runtime chart passes');

for (const attackType of RUNTIME_TYPES) {
  assert.ok(TYPE_CHART[attackType], `${attackType} has an attack row`);
  for (const defenseType of RUNTIME_TYPES) {
    const multiplier = typeEffectiveness(attackType, [defenseType]);
    assert.ok([0, 0.25, 0.5, 1, 2, 4].includes(multiplier), `${attackType} -> ${defenseType} has a bounded multiplier`);
  }
}

assert.equal(typeEffectiveness('Fire', ['Grass']), 2);
assert.equal(typeEffectiveness('Electric', ['Ground']), 0);
assert.equal(typeEffectiveness('Dragon', ['Fairy']), 0);
assert.equal(typeEffectiveness('Fire', ['Grass', 'Ice']), 4, 'dual-type multipliers compose deterministically');
assert.equal(typeEffectiveness('Unknown', ['Grass']), 1, 'unknown attack input is neutral and diagnostic-safe');

const missingType = RUNTIME_TYPES.filter(type => type !== 'Fairy');
assert.ok(validateTypeCatalog({ runtimeTypes: missingType }).issues.some(issue => issue.code === 'runtime_type_count_mismatch'), 'missing runtime types fail');

const lightIdentity = [...RUNTIME_TYPES.slice(0, -1), 'Light'];
assert.ok(validateTypeCatalog({ runtimeTypes: lightIdentity }).issues.some(issue => issue.code === 'light_runtime_type_forbidden'), 'Light runtime identity fails');

const badChart = Object.fromEntries(RUNTIME_TYPES.map(type => [type, { ...TYPE_CHART[type] }]));
badChart.Fire.Grass = 3;
assert.ok(validateTypeCatalog({ chart: badChart }).issues.some(issue => issue.code === 'invalid_type_multiplier'), 'unsupported multipliers fail');

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(game, /from '\.\/type-catalog\.mjs'/, 'live runtime imports the central type catalog');
assert.doesNotMatch(game, /const TYPE_CHART=\{/, 'live runtime no longer owns a second type chart');

console.log('V8.1 type catalog: PASS');
