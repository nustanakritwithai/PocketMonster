import assert from 'node:assert/strict';
import { MONSTER_CATALOG, validateMonsterCatalog } from '../monster-catalog.mjs';

const clone = () => MONSTER_CATALOG.map(entry => ({ ...entry }));
const mutants = [
  {
    name: 'removed mapping',
    records: clone().slice(0, -1),
    code: 'runtime_species_count_mismatch',
  },
  {
    name: 'duplicated runtime mapping',
    records: (() => {
      const records = clone();
      records[1].runtimeSpeciesId = records[0].runtimeSpeciesId;
      return records;
    })(),
    code: 'duplicate_runtime_species',
  },
  {
    name: 'mis-typed runtime identity',
    records: (() => {
      const records = clone();
      records[0].runtimeType = 'Fire';
      return records;
    })(),
    code: 'runtime_type_identity_mismatch',
  },
  {
    name: 'activated LIGHT as a runtime type',
    records: (() => {
      const records = clone();
      records[17].runtimeType = 'Light';
      records[17].typeActivation = 'active';
      return records;
    })(),
    code: 'light_runtime_type_forbidden',
  },
  {
    name: 'duplicated workbook Stage-2 identity',
    records: (() => {
      const records = clone();
      records[1].workbookStage2MonsterId = records[0].workbookStage2MonsterId;
      return records;
    })(),
    code: 'duplicate_stage2_monster',
  },
];

for (const mutant of mutants) {
  const result = validateMonsterCatalog(mutant.records);
  assert.equal(result.ok, false, `${mutant.name} must be killed`);
  assert.ok(result.issues.some(issue => issue.code === mutant.code), `${mutant.name} exposes ${mutant.code}`);
}

console.log(`V8.1 monster catalog mutants: PASS (${mutants.length}/${mutants.length} killed)`);
