import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { MONSTER_STAT_COVERAGE_CONTRACT } from '../monster-stat-contract.mjs';
import {
  MONSTER_STAT_CATALOG,
  MONSTER_STAT_CATALOG_VERSION,
  MONSTER_STAT_FORM_ACTIVATION,
  buildMonsterStatCatalog,
  monsterStatCatalogEntry,
  monsterStatCatalogFormForStage,
  monsterStatCatalogFormsForSpecies,
  validateMonsterStatCatalog,
} from '../monster-stat-catalog.mjs';

assert.equal(MONSTER_STAT_CATALOG_VERSION, 'monster-stat-catalog/v1');
assert.equal(MONSTER_STAT_FORM_ACTIVATION, 'catalog_ready');
assert.equal(MONSTER_STAT_CATALOG.length, 36);
assert.equal(new Set(MONSTER_STAT_CATALOG.map(row => row.formId)).size, 36);
assert.equal(new Set(MONSTER_STAT_CATALOG.map(row => row.runtimeSpeciesId)).size, 18);
assert.equal(validateMonsterStatCatalog(MONSTER_STAT_CATALOG).ok, true);
assert.deepEqual(buildMonsterStatCatalog(MONSTER_STAT_COVERAGE_CONTRACT), MONSTER_STAT_CATALOG, 'catalog build is deterministic');

for (const row of MONSTER_STAT_CATALOG) {
  assert.equal(row.formId, row.workbookMonsterId, 'Workbook MonsterID is the canonical form identity');
  assert.equal(row.activation, 'catalog_ready', 'M1 catalog is ready but not live-activated');
  assert.notEqual(row.runtimeType, 'LIGHT');
  assert.notEqual(row.runtimeType, 'Light');
  assert.equal(Object.isFrozen(row), true);
  assert.equal(Object.isFrozen(row.baseStats), true);
  if (row.evolution) assert.equal(Object.isFrozen(row.evolution), true);
}

const flameBase = monsterStatCatalogEntry('MON_002');
assert.deepEqual(flameBase.baseStats, { hp: 46, atk: 38, def: 34, spAtk: 54, spDef: 38, spd: 46 });
assert.deepEqual(flameBase.evolution, { toFormId: 'MON_020', requiredLevel: 15, requiredBond: 50, oneWay: true });
assert.equal(flameBase.runtimeType, 'Fire');
assert.equal(flameBase.runtimeTypePolicy, 'DIRECT_CANONICAL');

const flameStage2 = monsterStatCatalogFormForStage('flameling', 2);
assert.equal(flameStage2.formId, 'MON_020');
assert.deepEqual(flameStage2.baseStats, { hp: 86, atk: 69, def: 63, spAtk: 95, spDef: 69, spd: 82 });
assert.equal(flameStage2.evolution, null);
assert.deepEqual(monsterStatCatalogFormsForSpecies('flameling').map(row => row.formId), ['MON_002', 'MON_020']);

const lightForms = monsterStatCatalogFormsForSpecies('fairimp');
assert.deepEqual(lightForms.map(row => [row.sourceType, row.runtimeType, row.runtimeTypePolicy]), [
  ['LIGHT', 'Fairy', 'LIGHT_TO_FAIRY_CANONICAL'],
  ['LIGHT', 'Fairy', 'LIGHT_TO_FAIRY_CANONICAL'],
]);
assert.equal(monsterStatCatalogEntry('MON_UNKNOWN'), null);
assert.equal(monsterStatCatalogFormForStage('flameling', 3), null);
assert.deepEqual(monsterStatCatalogFormsForSpecies('missing'), []);

const duplicate = structuredClone(MONSTER_STAT_CATALOG);
duplicate[1].formId = duplicate[0].formId;
assert.equal(validateMonsterStatCatalog(duplicate).issues.some(issue => issue.code === 'duplicate_form_id'), true);
const statDrift = structuredClone(MONSTER_STAT_CATALOG);
statDrift[0].baseStats.spAtk += 1;
assert.equal(validateMonsterStatCatalog(statDrift).issues.some(issue => issue.code === 'base_stats_mismatch'), true);
const activated = structuredClone(MONSTER_STAT_CATALOG);
activated[0].activation = 'runtime_live';
assert.equal(validateMonsterStatCatalog(activated).issues.some(issue => issue.code === 'invalid_activation'), true);
const instanceLeak = structuredClone(MONSTER_STAT_CATALOG);
instanceLeak[0].currentHp = 1;
assert.equal(validateMonsterStatCatalog(instanceLeak).issues.some(issue => issue.code === 'instance_field_in_catalog'), true);

assert.equal(Object.isFrozen(MONSTER_STAT_CATALOG), true);
const digest = createHash('sha256').update(JSON.stringify(MONSTER_STAT_CATALOG)).digest('hex');
assert.equal(digest, '2ba272f0ecefa91c07584048a96adc739fd26462c3e74c193f4ccdfb342e027b');

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(game, /import\s*\{[^}]*\bcreateSpeciesCatalogAdapter\b[^}]*\}\s*from '\.\/monster-catalog\.mjs'/s, 'adapter guard accepts combined named imports');

console.log('V8.3 canonical monster stat catalog: PASS (36 forms, LIGHT → Fairy)');
