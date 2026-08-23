import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const sourceUrl = new URL('../monster-stat-contract.mjs', import.meta.url);
const originalSource = fs.readFileSync(sourceUrl, 'utf8');
const expectedDigest = 'eed6e58de64951b06706cda9b0c30a745f0a263e7ba034dcea5289def84571be';

async function loadSource(source, label) {
  const absolute = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64')}`);
}

function assertContract(module) {
  const rows = module.MONSTER_STAT_COVERAGE_CONTRACT;
  assert.equal(rows.length, 36);
  assert.equal(new Set(rows.map(row => row.workbookMonsterId)).size, 36);
  assert.equal(new Set(rows.map(row => row.runtimeSpeciesId)).size, 18);
  assert.equal(module.validateMonsterStatCoverageContract(rows).ok, true);
  assert.equal(rows.every(row => row.activation === 'contract_only'), true);
  assert.deepEqual(module.MONSTER_STAT_KEYS, ['hp', 'atk', 'def', 'spAtk', 'spDef', 'spd']);
  assert.deepEqual(module.monsterStatContractEntry('MON_001').baseStats, { hp: 52, atk: 42, def: 42, spAtk: 42, spDef: 42, spd: 42 });
  assert.deepEqual(module.monsterStatContractEntry('MON_020').baseStats, { hp: 86, atk: 69, def: 63, spAtk: 95, spDef: 69, spd: 82 });
  assert.deepEqual(module.monsterStatFormsForRuntimeSpecies('flameling').map(row => row.workbookMonsterId), ['MON_002', 'MON_020']);
  assert.equal(module.monsterStatContractEntry('MON_002').evolutionLevel, 15);
  assert.equal(module.monsterStatContractEntry('MON_002').requiredBond, 50);
  assert.equal(module.monsterStatContractEntry('MON_012').workbookType, 'LIGHT');
  const digest = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  assert.equal(digest, expectedDigest);
}

assertContract(await loadSource(originalSource, 'monster-stat-contract-current'));

const mutations = [
  ['change base HP', "'Balanced',52,42,42,42,42,42,262", "'Balanced',53,42,42,42,42,42,262"],
  ['hide base HP change inside BST', "'Balanced',52,42,42,42,42,42,262", "'Balanced',53,42,42,42,42,42,263"],
  ['drop Stage 2 form', "  ['MON_019'", "  // ['MON_019'"],
  ['duplicate MonsterID', "['MON_019','normalooze'", "['MON_001','normalooze'"],
  ['change runtime family', "['MON_020','flameling'", "['MON_020','normalooze'"],
  ['change evolution level', "'MON_020',15,50", "'MON_020',2,50"],
  ['change evolution bond', "'MON_020',15,50", "'MON_020',15,0"],
  ['change growth curve', "'Common','Medium',35,70,10", "'Common','Legacy',35,70,10"],
  ['claim live activation', "activation: 'contract_only'", "activation: 'runtime_live'"],
  ['drop special attack key', "Object.freeze({ hp, atk, def, spAtk, spDef, spd })", "Object.freeze({ hp, atk, def, spDef, spd })"],
  ['change LIGHT source identity', "'MON_012','fairimp','SP_LIGHT_SLIME','สไลม์แสง','Lumen Slime',1,'LIGHT'", "'MON_012','fairimp','SP_LIGHT_SLIME','สไลม์แสง','Lumen Slime',1,'FAIRY'"],
];

let killed = 0;
for (const [name, from, to] of mutations) {
  const mutant = originalSource.replace(from, to);
  assert.notEqual(mutant, originalSource, `${name} mutation must apply`);
  await assert.rejects(async () => assertContract(await loadSource(mutant, `monster-stat-contract-mutant-${name}`)), undefined, `${name} must be killed`);
  killed += 1;
}

assert.equal(killed, mutations.length);
console.log(`V8.3 monster stat contract mutants: PASS (${killed}/${mutations.length} killed)`);
