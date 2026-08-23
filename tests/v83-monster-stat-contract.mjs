import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CONTENT_PROVENANCE } from '../content-provenance.mjs';
import { MONSTER_CATALOG } from '../monster-catalog.mjs';
import {
  MONSTER_STAT_CONTRACT_VERSION,
  MONSTER_STAT_COVERAGE_CONTRACT,
  MONSTER_STAT_KEYS,
  MONSTER_STAT_MILESTONE_LEVELS,
  MONSTER_STAT_SOURCE_LIMITS,
  monsterStatContractEntry,
  monsterStatFormsForRuntimeSpecies,
  validateMonsterStatCoverageContract,
} from '../monster-stat-contract.mjs';

assert.equal(MONSTER_STAT_CONTRACT_VERSION, 'monster-stat-coverage/v1');
assert.equal(MONSTER_STAT_COVERAGE_CONTRACT.length, 36, 'all 36 workbook forms are covered');
assert.equal(new Set(MONSTER_STAT_COVERAGE_CONTRACT.map(row => row.workbookMonsterId)).size, 36, 'MonsterID coverage is one-to-one');
assert.equal(new Set(MONSTER_STAT_COVERAGE_CONTRACT.map(row => row.runtimeSpeciesId)).size, 18, 'all 18 runtime families are covered');
assert.equal(MONSTER_STAT_COVERAGE_CONTRACT.filter(row => row.stage === 1).length, 18);
assert.equal(MONSTER_STAT_COVERAGE_CONTRACT.filter(row => row.stage === 2).length, 18);
assert.equal(validateMonsterStatCoverageContract(MONSTER_STAT_COVERAGE_CONTRACT).ok, true, 'canonical contract validates');
const missingMapping = validateMonsterStatCoverageContract(MONSTER_STAT_COVERAGE_CONTRACT, MONSTER_CATALOG.slice(1));
assert.equal(missingMapping.ok, false, 'mapping coverage cannot be weakened');
assert.equal(missingMapping.issues.some(issue => issue.code === 'mapping_count_mismatch'), true);
assert.deepEqual(MONSTER_STAT_KEYS, ['hp', 'atk', 'def', 'spAtk', 'spDef', 'spd']);
assert.deepEqual(MONSTER_STAT_MILESTONE_LEVELS, [1, 5, 10, 15, 20, 30, 40, 50, 60]);
assert.deepEqual(MONSTER_STAT_SOURCE_LIMITS, {
  level: { min: 1, max: 60 },
  potential: { min: 0, max: 31, default: 15 },
  training: { perStatMax: 200, totalMax: 600, divisor: 4 },
  rounding: 'floor',
});

for (const mapping of MONSTER_CATALOG) {
  const forms = monsterStatFormsForRuntimeSpecies(mapping.runtimeSpeciesId);
  assert.deepEqual(forms.map(row => row.stage), [1, 2], `${mapping.runtimeSpeciesId} has Stage 1 and Stage 2`);
  assert.deepEqual(forms.map(row => row.workbookMonsterId), [mapping.workbookBaseMonsterId, mapping.workbookStage2MonsterId]);
  assert.equal(forms[0].evolutionTo, forms[1].workbookMonsterId);
  assert.equal(forms[0].evolutionLevel, 15);
  assert.equal(forms[0].requiredBond, 50);
  assert.equal(forms[1].evolutionTo, null);
  assert.equal(forms.every(row => MONSTER_STAT_KEYS.reduce((sum, stat) => sum + row.baseStats[stat], 0) === row.bst), true);
}

assert.deepEqual(monsterStatContractEntry('MON_001'), {
  schemaVersion: MONSTER_STAT_CONTRACT_VERSION,
  workbookMonsterId: 'MON_001',
  runtimeSpeciesId: 'normalooze',
  workbookSpeciesId: 'SP_NORMAL_SLIME',
  nameTH: 'สไลม์ปกติ',
  nameEN: 'Plain Slime',
  stage: 1,
  workbookType: 'NORMAL',
  role: 'Balanced',
  baseStats: { hp: 52, atk: 42, def: 42, spAtk: 42, spDef: 42, spd: 42 },
  bst: 262,
  evolutionTo: 'MON_019',
  evolutionLevel: 15,
  requiredBond: 50,
  rarity: 'Common',
  growthCurve: 'Medium',
  baseExpYield: 35,
  captureRatePct: 70,
  baseBond: 10,
  activation: 'contract_only',
  sourceWorkbookVersion: '2.1',
  sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
});
assert.deepEqual(monsterStatContractEntry('MON_020').baseStats, { hp: 86, atk: 69, def: 63, spAtk: 95, spDef: 69, spd: 82 });
assert.deepEqual(monsterStatContractEntry('MON_035').baseStats, { hp: 109, atk: 72, def: 98, spAtk: 59, spDef: 89, spd: 50 });
assert.equal(monsterStatContractEntry('MON_012').workbookType, 'LIGHT', 'source identity stays verbatim for later Fairy normalization');
assert.equal(monsterStatContractEntry('MON_UNKNOWN'), null, 'unknown IDs fail closed');
assert.deepEqual(monsterStatFormsForRuntimeSpecies('missing'), []);

assert.equal(Object.isFrozen(MONSTER_STAT_COVERAGE_CONTRACT), true);
assert.equal(Object.isFrozen(MONSTER_STAT_COVERAGE_CONTRACT[0]), true);
assert.equal(Object.isFrozen(MONSTER_STAT_COVERAGE_CONTRACT[0].baseStats), true);
assert.equal(Object.isFrozen(MONSTER_STAT_KEYS), true);
assert.equal(Object.isFrozen(MONSTER_STAT_SOURCE_LIMITS.training), true);
assert.equal(MONSTER_STAT_COVERAGE_CONTRACT.every(row => row.activation === 'contract_only'), true, 'M0 cannot claim live activation');

const digest = createHash('sha256').update(JSON.stringify(MONSTER_STAT_COVERAGE_CONTRACT)).digest('hex');
assert.equal(digest, 'eed6e58de64951b06706cda9b0c30a745f0a263e7ba034dcea5289def84571be', 'coverage stays tied to the reviewed Workbook v2.1 snapshot');

console.log('V8.3 36-form six-stat coverage contract: PASS');
