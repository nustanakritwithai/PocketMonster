import {
  MONSTER_STAT_CONTRACT_VERSION,
  MONSTER_STAT_COVERAGE_CONTRACT,
  MONSTER_STAT_KEYS,
  validateMonsterStatCoverageContract,
} from './monster-stat-contract.mjs';
import { sourceTypeToRuntime, typeProfile } from './type-catalog.mjs';

const contractValidation = validateMonsterStatCoverageContract(MONSTER_STAT_COVERAGE_CONTRACT);
if (!contractValidation.ok) {
  throw new TypeError(`Invalid monster stat contract: ${contractValidation.issues.map(issue => issue.code).join(', ')}`);
}

export const MONSTER_STAT_CATALOG_VERSION = 'monster-stat-catalog/v1';
export const MONSTER_STAT_FORM_ACTIVATION = 'catalog_ready';

function runtimeTypePolicy(sourceType) {
  return sourceType === 'LIGHT' ? 'LIGHT_TO_FAIRY_CANONICAL' : 'DIRECT_CANONICAL';
}

function catalogRow(contract) {
  const runtimeType = sourceTypeToRuntime(contract.workbookType);
  if (!runtimeType) throw new TypeError(`Unknown source type for ${contract.workbookMonsterId}`);
  return Object.freeze({
    schemaVersion: MONSTER_STAT_CATALOG_VERSION,
    contractVersion: MONSTER_STAT_CONTRACT_VERSION,
    formId: contract.workbookMonsterId,
    workbookMonsterId: contract.workbookMonsterId,
    runtimeSpeciesId: contract.runtimeSpeciesId,
    workbookSpeciesId: contract.workbookSpeciesId,
    nameTH: contract.nameTH,
    nameEN: contract.nameEN,
    stage: contract.stage,
    sourceType: contract.workbookType,
    runtimeType,
    runtimeTypePolicy: runtimeTypePolicy(contract.workbookType),
    role: contract.role,
    baseStats: contract.baseStats,
    bst: contract.bst,
    evolution: contract.evolutionTo
      ? Object.freeze({
        toFormId: contract.evolutionTo,
        requiredLevel: contract.evolutionLevel,
        requiredBond: contract.requiredBond,
        oneWay: true,
      })
      : null,
    rarity: contract.rarity,
    growthCurve: contract.growthCurve,
    baseExpYield: contract.baseExpYield,
    captureRatePct: contract.captureRatePct,
    baseBond: contract.baseBond,
    activation: MONSTER_STAT_FORM_ACTIVATION,
    sourceWorkbookVersion: contract.sourceWorkbookVersion,
    sourceWorkbookSha256: contract.sourceWorkbookSha256,
  });
}

export function buildMonsterStatCatalog(contract = MONSTER_STAT_COVERAGE_CONTRACT) {
  if (!Array.isArray(contract)) throw new TypeError('invalid_monster_stat_contract');
  return Object.freeze(contract.map(catalogRow));
}

export const MONSTER_STAT_CATALOG = buildMonsterStatCatalog();

const FORM_BY_ID = new Map(MONSTER_STAT_CATALOG.map(row => [row.formId, row]));
const FORMS_BY_RUNTIME_SPECIES = new Map();
for (const row of MONSTER_STAT_CATALOG) {
  const forms = FORMS_BY_RUNTIME_SPECIES.get(row.runtimeSpeciesId) ?? [];
  forms.push(row);
  FORMS_BY_RUNTIME_SPECIES.set(row.runtimeSpeciesId, forms);
}

function issue(code, index, field, detail = {}) {
  return Object.freeze({ code, index, field, ...detail });
}

export function validateMonsterStatCatalog(records, contract = MONSTER_STAT_COVERAGE_CONTRACT) {
  if (!Array.isArray(records) || !Array.isArray(contract)) {
    return Object.freeze({ ok: false, issues: Object.freeze([issue('invalid_catalog', -1, 'root')]) });
  }
  const issues = [];
  if (records.length !== 36 || records.length !== contract.length) {
    issues.push(issue('catalog_count_mismatch', -1, 'length', { value: records.length }));
  }
  const contractById = new Map(contract.map(row => [row.workbookMonsterId, row]));
  const ids = new Set();
  const familyStages = new Map();

  records.forEach((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      issues.push(issue('invalid_catalog_row', index, 'root'));
      return;
    }
    if (ids.has(row.formId)) issues.push(issue('duplicate_form_id', index, 'formId', { value: row.formId }));
    ids.add(row.formId);
    const source = contractById.get(row.formId);
    if (!source) {
      issues.push(issue('unknown_form_id', index, 'formId', { value: row.formId }));
      return;
    }
    const expectedRuntimeType = sourceTypeToRuntime(source.workbookType);
    if (row.schemaVersion !== MONSTER_STAT_CATALOG_VERSION || row.contractVersion !== MONSTER_STAT_CONTRACT_VERSION) {
      issues.push(issue('schema_version_mismatch', index, 'schemaVersion'));
    }
    if (row.activation !== MONSTER_STAT_FORM_ACTIVATION) issues.push(issue('invalid_activation', index, 'activation'));
    if (row.workbookMonsterId !== source.workbookMonsterId || row.runtimeSpeciesId !== source.runtimeSpeciesId
      || row.workbookSpeciesId !== source.workbookSpeciesId || row.stage !== source.stage) {
      issues.push(issue('identity_mismatch', index, 'identity'));
    }
    if (row.sourceType !== source.workbookType || row.runtimeType !== expectedRuntimeType || !typeProfile(row.runtimeType)) {
      issues.push(issue('runtime_type_mismatch', index, 'runtimeType'));
    }
    const expectedTypePolicy = runtimeTypePolicy(source.workbookType);
    if (row.runtimeTypePolicy !== expectedTypePolicy || (row.sourceType === 'LIGHT' && row.runtimeType !== 'Fairy')) {
      issues.push(issue('source_type_policy_mismatch', index, 'runtimeTypePolicy'));
    }
    if (MONSTER_STAT_KEYS.some(stat => row.baseStats?.[stat] !== source.baseStats[stat])) {
      issues.push(issue('base_stats_mismatch', index, 'baseStats'));
    }
    if (row.bst !== source.bst || MONSTER_STAT_KEYS.reduce((sum, stat) => sum + row.baseStats[stat], 0) !== row.bst) {
      issues.push(issue('bst_mismatch', index, 'bst'));
    }
    const expectedEvolution = source.evolutionTo
      ? { toFormId: source.evolutionTo, requiredLevel: source.evolutionLevel, requiredBond: source.requiredBond, oneWay: true }
      : null;
    if (JSON.stringify(row.evolution) !== JSON.stringify(expectedEvolution)) {
      issues.push(issue('evolution_mismatch', index, 'evolution'));
    }
    if (row.nameTH !== source.nameTH || row.nameEN !== source.nameEN || row.role !== source.role
      || row.rarity !== source.rarity || row.growthCurve !== source.growthCurve
      || row.baseExpYield !== source.baseExpYield || row.captureRatePct !== source.captureRatePct
      || row.baseBond !== source.baseBond) {
      issues.push(issue('metadata_mismatch', index, 'metadata'));
    }
    if (row.sourceWorkbookVersion !== source.sourceWorkbookVersion || row.sourceWorkbookSha256 !== source.sourceWorkbookSha256) {
      issues.push(issue('source_provenance_mismatch', index, 'sourceWorkbookSha256'));
    }
    const stages = familyStages.get(row.runtimeSpeciesId) ?? [];
    stages.push(row.stage);
    familyStages.set(row.runtimeSpeciesId, stages);
    for (const forbidden of ['currentHp', 'ownerState', 'instanceId', 'potential', 'training']) {
      if (forbidden in row) issues.push(issue('instance_field_in_catalog', index, forbidden));
    }
  });

  if (familyStages.size !== 18) issues.push(issue('runtime_species_count_mismatch', -1, 'runtimeSpeciesId', { value: familyStages.size }));
  for (const [runtimeSpeciesId, stages] of familyStages) {
    if (stages.length !== 2 || stages[0] !== 1 || stages[1] !== 2) {
      issues.push(issue('runtime_family_form_mismatch', -1, 'runtimeSpeciesId', { runtimeSpeciesId }));
    }
  }
  for (const source of contract) {
    if (!ids.has(source.workbookMonsterId)) issues.push(issue('missing_form', -1, 'formId', { value: source.workbookMonsterId }));
  }
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function monsterStatCatalogEntry(formId) {
  return FORM_BY_ID.get(formId) ?? null;
}

export function monsterStatCatalogFormsForSpecies(runtimeSpeciesId) {
  return Object.freeze([...(FORMS_BY_RUNTIME_SPECIES.get(runtimeSpeciesId) ?? [])]);
}

export function monsterStatCatalogFormForStage(runtimeSpeciesId, stage) {
  if (![1, 2].includes(stage)) return null;
  return (FORMS_BY_RUNTIME_SPECIES.get(runtimeSpeciesId) ?? []).find(row => row.stage === stage) ?? null;
}
