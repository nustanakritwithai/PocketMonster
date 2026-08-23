import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const sourceUrl = new URL('../monster-stat-catalog.mjs', import.meta.url);
const originalSource = fs.readFileSync(sourceUrl, 'utf8');
const expectedDigest = '2ba272f0ecefa91c07584048a96adc739fd26462c3e74c193f4ccdfb342e027b';

async function loadSource(source, label) {
  const absolute = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64')}`);
}

function assertCatalog(module) {
  const rows = module.MONSTER_STAT_CATALOG;
  assert.equal(rows.length, 36);
  assert.equal(new Set(rows.map(row => row.formId)).size, 36);
  assert.equal(new Set(rows.map(row => row.runtimeSpeciesId)).size, 18);
  assert.equal(module.validateMonsterStatCatalog(rows).ok, true);
  assert.equal(rows.every(row => row.activation === 'catalog_ready'), true);
  assert.deepEqual(module.monsterStatCatalogEntry('MON_002').baseStats, { hp: 46, atk: 38, def: 34, spAtk: 54, spDef: 38, spd: 46 });
  assert.deepEqual(module.monsterStatCatalogEntry('MON_002').evolution, { toFormId: 'MON_020', requiredLevel: 15, requiredBond: 50, oneWay: true });
  assert.deepEqual(module.monsterStatCatalogFormsForSpecies('fairimp').map(row => [row.sourceType, row.runtimeType, row.runtimeTypePolicy]), [
    ['LIGHT', 'Fairy', 'LIGHT_TO_FAIRY_CANONICAL'],
    ['LIGHT', 'Fairy', 'LIGHT_TO_FAIRY_CANONICAL'],
  ]);
  assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'), expectedDigest);
}

assertCatalog(await loadSource(originalSource, 'monster-stat-catalog-current'));

const mutations = [
  ['change activation', "'catalog_ready'", "'runtime_live'"],
  ['break LIGHT policy', "sourceType === 'LIGHT' ? 'LIGHT_TO_FAIRY_CANONICAL'", "false ? 'LIGHT_TO_FAIRY_CANONICAL'"],
  ['use source type at runtime', 'const runtimeType = sourceTypeToRuntime(contract.workbookType);', 'const runtimeType = contract.workbookType;'],
  ['replace canonical form identity', 'formId: contract.workbookMonsterId,', 'formId: contract.runtimeSpeciesId,'],
  ['drop special attack', 'baseStats: contract.baseStats,', 'baseStats: Object.freeze({ ...contract.baseStats, spAtk: undefined }),'],
  ['change evolution level', 'requiredLevel: contract.evolutionLevel,', 'requiredLevel: 2,'],
  ['allow reversible evolution', 'oneWay: true,', 'oneWay: false,'],
  ['change base EXP', 'baseExpYield: contract.baseExpYield,', 'baseExpYield: contract.baseExpYield + 1,'],
  ['change source type metadata', 'sourceType: contract.workbookType,', "sourceType: 'NORMAL',"],
  ['drop first form', 'return Object.freeze(contract.map(catalogRow));', 'return Object.freeze(contract.slice(1).map(catalogRow));'],
];

let killed = 0;
for (const [name, from, to] of mutations) {
  const mutant = originalSource.replace(from, to);
  assert.notEqual(mutant, originalSource, `${name} mutation must apply`);
  await assert.rejects(async () => assertCatalog(await loadSource(mutant, `monster-stat-catalog-mutant-${name}`)), undefined, `${name} must be killed`);
  killed += 1;
}

assert.equal(killed, mutations.length);
console.log(`V8.3 monster stat catalog mutants: PASS (${killed}/${mutations.length} killed)`);
