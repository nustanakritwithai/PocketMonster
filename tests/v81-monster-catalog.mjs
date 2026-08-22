import assert from 'node:assert/strict';
import {
  MONSTER_CATALOG,
  RUNTIME_TYPE_IDENTITIES,
  monsterCatalogEntry,
  validateMonsterCatalog,
} from '../monster-catalog.mjs';

const EXPECTED_RUNTIME_IDS = [
  'normalooze', 'flameling', 'aquapuff', 'voltkit', 'mossbun', 'frostowl',
  'punchcub', 'toxitoad', 'sandmole', 'galebird', 'mindcoon', 'buglet',
  'rockhorn', 'ghostpurr', 'emberdrake', 'voidhorn', 'ironbug', 'fairimp',
];

assert.equal(MONSTER_CATALOG.length, 18, 'all 18 live runtime species have workbook mappings');
assert.deepEqual(MONSTER_CATALOG.map(entry => entry.runtimeSpeciesId), EXPECTED_RUNTIME_IDS, 'runtime mapping order stays explicit');
assert.equal(validateMonsterCatalog(MONSTER_CATALOG).ok, true, 'the reviewed mapping ledger passes');
assert.equal(new Set(MONSTER_CATALOG.map(entry => entry.runtimeSpeciesId)).size, 18, 'runtime species IDs are unique');
assert.equal(new Set(MONSTER_CATALOG.map(entry => entry.workbookBaseMonsterId)).size, 18, 'base workbook IDs are unique');
assert.equal(new Set(MONSTER_CATALOG.map(entry => entry.workbookStage2MonsterId)).size, 18, 'Stage-2 workbook IDs are unique');

assert.deepEqual(
  RUNTIME_TYPE_IDENTITIES,
  ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'],
  'the current 18 runtime type identities remain canonical',
);
assert.equal(RUNTIME_TYPE_IDENTITIES.includes('Light'), false, 'LIGHT does not become an implicit runtime type');

const fairy = monsterCatalogEntry('fairimp');
assert.equal(fairy.runtimeType, 'Fairy', 'Fairy remains the runtime identity');
assert.equal(fairy.workbookTypeCandidate, 'LIGHT', 'the workbook LIGHT candidate remains visible for audit');
assert.equal(fairy.typeDecision, 'D2_FAIRY_CANONICAL_LIGHT_DEFERRED', 'the reconciliation is explicit');
assert.equal(fairy.typeActivation, 'deferred', 'LIGHT gameplay activation remains blocked');

assert.equal(monsterCatalogEntry('flameling').workbookBaseMonsterId, 'MON_002', 'Fire maps to the reviewed base monster');
assert.equal(monsterCatalogEntry('flameling').workbookStage2MonsterId, 'MON_020', 'Fire maps to the reviewed Stage-2 monster');
assert.equal(monsterCatalogEntry('missing-species'), null, 'unknown runtime species return a diagnostic-safe null');

const duplicate = MONSTER_CATALOG.map(entry => ({ ...entry }));
duplicate[1].runtimeSpeciesId = duplicate[0].runtimeSpeciesId;
assert.ok(validateMonsterCatalog(duplicate).issues.some(issue => issue.code === 'duplicate_runtime_species'), 'duplicate runtime mappings fail');

const badWorkbookId = MONSTER_CATALOG.map(entry => ({ ...entry }));
badWorkbookId[0].workbookBaseMonsterId = 'MON001';
assert.ok(validateMonsterCatalog(badWorkbookId).issues.some(issue => issue.code === 'invalid_workbook_monster_id'), 'malformed workbook IDs fail');

const typeDrift = MONSTER_CATALOG.map(entry => ({ ...entry }));
typeDrift[17].runtimeType = 'Light';
assert.ok(validateMonsterCatalog(typeDrift).issues.some(issue => issue.code === 'runtime_type_identity_mismatch'), 'runtime type drift fails');

assert.equal(Object.isFrozen(MONSTER_CATALOG), true, 'the mapping catalog is immutable');
assert.equal(Object.isFrozen(MONSTER_CATALOG[0]), true, 'mapping entries are immutable');
assert.equal('currentHp' in MONSTER_CATALOG[0], false, 'catalog mappings contain no instance HP');
assert.equal('ownerState' in MONSTER_CATALOG[0], false, 'catalog mappings contain no ownership state');

console.log('V8.1 monster catalog mapping: PASS');
