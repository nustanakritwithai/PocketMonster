import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { CONTENT_ID_PATTERNS } from './content-validation.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

export const RUNTIME_TYPE_IDENTITIES = Object.freeze([
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground',
  'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
]);

const RAW_MAPPINGS = [
  ['normalooze', 'Plain Slime', 'Normal', 'NORMAL', 'MON_001', 'MON_019', 'MATCH'],
  ['flameling', 'Flare Slime', 'Fire', 'FIRE', 'MON_002', 'MON_020', 'MATCH'],
  ['aquapuff', 'Aqua Slime', 'Water', 'WATER', 'MON_003', 'MON_021', 'MATCH'],
  ['voltkit', 'Volt Slime', 'Electric', 'ELECTRIC', 'MON_005', 'MON_023', 'MATCH'],
  ['mossbun', 'Moss Slime', 'Grass', 'GRASS', 'MON_004', 'MON_022', 'MATCH'],
  ['frostowl', 'Frost Slime', 'Ice', 'ICE', 'MON_006', 'MON_024', 'MATCH'],
  ['punchcub', 'Brawl Slime', 'Fighting', 'FIGHTING', 'MON_016', 'MON_034', 'MATCH'],
  ['toxitoad', 'Venom Slime', 'Poison', 'POISON', 'MON_010', 'MON_028', 'MATCH'],
  ['sandmole', 'Terra Slime', 'Ground', 'GROUND', 'MON_008', 'MON_026', 'MATCH'],
  ['galebird', 'Aero Slime', 'Flying', 'FLYING', 'MON_009', 'MON_027', 'MATCH'],
  ['mindcoon', 'Mind Slime', 'Psychic', 'PSYCHIC', 'MON_013', 'MON_031', 'MATCH'],
  ['buglet', 'Bug Slime', 'Bug', 'BUG', 'MON_014', 'MON_032', 'MATCH'],
  ['rockhorn', 'Rock Slime', 'Rock', 'ROCK', 'MON_007', 'MON_025', 'MATCH'],
  ['ghostpurr', 'Spirit Slime', 'Ghost', 'GHOST', 'MON_018', 'MON_036', 'MATCH'],
  ['emberdrake', 'Drake Slime', 'Dragon', 'DRAGON', 'MON_015', 'MON_033', 'MATCH'],
  ['voidhorn', 'Shadow Slime', 'Dark', 'DARK', 'MON_011', 'MON_029', 'MATCH'],
  ['ironbug', 'Metal Slime', 'Steel', 'STEEL', 'MON_017', 'MON_035', 'MATCH'],
  ['fairimp', 'Fairy Slime', 'Fairy', 'LIGHT', 'MON_012', 'MON_030', 'REVIEW_FAIRY_VS_LIGHT'],
];

export const MONSTER_CATALOG = Object.freeze(RAW_MAPPINGS.map(([
  runtimeSpeciesId,
  runtimeName,
  runtimeType,
  workbookTypeCandidate,
  workbookBaseMonsterId,
  workbookStage2MonsterId,
  sourceMappingStatus,
]) => Object.freeze({
  runtimeSpeciesId,
  runtimeName,
  runtimeType,
  workbookTypeCandidate,
  workbookBaseMonsterId,
  workbookStage2MonsterId,
  sourceMappingStatus,
  typeDecision: runtimeSpeciesId === 'fairimp' ? 'D2_FAIRY_CANONICAL_LIGHT_DEFERRED' : 'D2_DIRECT_TYPE_MAPPING',
  typeActivation: runtimeSpeciesId === 'fairimp' ? 'deferred' : 'active',
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
})));

const EXPECTED_RUNTIME_TYPE_BY_SPECIES = new Map(MONSTER_CATALOG.map(entry => [entry.runtimeSpeciesId, entry.runtimeType]));
const MONSTER_BY_RUNTIME_ID = new Map(MONSTER_CATALOG.map(entry => [entry.runtimeSpeciesId, entry]));
const FORBIDDEN_RUNTIME_FIELDS = Object.freeze(['currentHp', 'ownerState', 'instanceId', 'learnedSkills', 'equippedSkills']);

function catalogIssue(code, index, field, detail = {}) {
  return Object.freeze({ code, index, field, ...detail });
}

export function validateMonsterCatalog(records) {
  if (!Array.isArray(records)) {
    return Object.freeze({ ok: false, issues: Object.freeze([catalogIssue('invalid_catalog', -1, 'root')]) });
  }
  const issues = [];
  if (records.length !== 18) issues.push(catalogIssue('runtime_species_count_mismatch', -1, 'length', { value: records.length }));
  const runtimeIds = new Set();
  const baseIds = new Set();
  const stage2Ids = new Set();

  records.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      issues.push(catalogIssue('invalid_mapping', index, 'root'));
      return;
    }
    if (runtimeIds.has(entry.runtimeSpeciesId)) issues.push(catalogIssue('duplicate_runtime_species', index, 'runtimeSpeciesId', { id: entry.runtimeSpeciesId }));
    runtimeIds.add(entry.runtimeSpeciesId);
    if (baseIds.has(entry.workbookBaseMonsterId)) issues.push(catalogIssue('duplicate_base_monster', index, 'workbookBaseMonsterId', { id: entry.workbookBaseMonsterId }));
    baseIds.add(entry.workbookBaseMonsterId);
    if (stage2Ids.has(entry.workbookStage2MonsterId)) issues.push(catalogIssue('duplicate_stage2_monster', index, 'workbookStage2MonsterId', { id: entry.workbookStage2MonsterId }));
    stage2Ids.add(entry.workbookStage2MonsterId);

    if (!CONTENT_ID_PATTERNS.monsters.test(entry.workbookBaseMonsterId) || !CONTENT_ID_PATTERNS.monsters.test(entry.workbookStage2MonsterId)) {
      issues.push(catalogIssue('invalid_workbook_monster_id', index, 'workbookMonsterId'));
    }
    const expectedType = EXPECTED_RUNTIME_TYPE_BY_SPECIES.get(entry.runtimeSpeciesId);
    if (!expectedType) {
      issues.push(catalogIssue('unknown_runtime_species', index, 'runtimeSpeciesId', { id: entry.runtimeSpeciesId }));
    } else if (entry.runtimeType !== expectedType) {
      issues.push(catalogIssue('runtime_type_identity_mismatch', index, 'runtimeType', { expected: expectedType, value: entry.runtimeType }));
    }
    if (entry.runtimeType === 'Light' || entry.runtimeType === 'LIGHT') {
      issues.push(catalogIssue('light_runtime_type_forbidden', index, 'runtimeType'));
    }
    if (entry.runtimeSpeciesId === 'fairimp' && (entry.workbookTypeCandidate !== 'LIGHT' || entry.typeActivation !== 'deferred')) {
      issues.push(catalogIssue('fairy_light_decision_missing', index, 'workbookTypeCandidate'));
    }
    for (const field of FORBIDDEN_RUNTIME_FIELDS) {
      if (field in entry) issues.push(catalogIssue('runtime_field_in_mapping', index, field));
    }
  });

  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function monsterCatalogEntry(runtimeSpeciesId) {
  return MONSTER_BY_RUNTIME_ID.get(runtimeSpeciesId) ?? null;
}

function adapterDiagnostic(code, runtimeSpeciesId, detail = {}) {
  return Object.freeze({ code, runtimeSpeciesId, ...detail });
}

export function createSpeciesCatalogAdapter(runtimeSpeciesRecords = []) {
  const records = Array.isArray(runtimeSpeciesRecords) ? runtimeSpeciesRecords : [];
  const diagnostics = [];
  const byId = Object.create(null);

  for (const species of records) {
    const runtimeSpeciesId = species?.id;
    if (typeof runtimeSpeciesId !== 'string' || runtimeSpeciesId.length === 0) {
      diagnostics.push(adapterDiagnostic('invalid_runtime_species', runtimeSpeciesId ?? null));
      continue;
    }
    if (byId[runtimeSpeciesId]) {
      diagnostics.push(adapterDiagnostic('duplicate_runtime_species', runtimeSpeciesId));
      continue;
    }
    byId[runtimeSpeciesId] = species;
    const mapping = monsterCatalogEntry(runtimeSpeciesId);
    if (!mapping) {
      diagnostics.push(adapterDiagnostic('unknown_runtime_species', runtimeSpeciesId));
      continue;
    }
    const primaryType = species?.types?.[0] ?? null;
    if (primaryType !== mapping.runtimeType) {
      diagnostics.push(adapterDiagnostic('runtime_type_mismatch', runtimeSpeciesId, {
        expected: mapping.runtimeType,
        value: primaryType,
      }));
    }
  }

  const presentIds = new Set(Object.keys(byId));
  for (const mapping of MONSTER_CATALOG) {
    if (!presentIds.has(mapping.runtimeSpeciesId)) {
      diagnostics.push(adapterDiagnostic('missing_runtime_species', mapping.runtimeSpeciesId));
    }
  }

  Object.freeze(byId);
  const frozenDiagnostics = Object.freeze(diagnostics);
  return Object.freeze({
    byId,
    diagnostics: frozenDiagnostics,
    resolve(runtimeSpeciesId) {
      const species = byId[runtimeSpeciesId] ?? null;
      const mapping = monsterCatalogEntry(runtimeSpeciesId);
      if (!species || !mapping) {
        return Object.freeze({
          ok: false,
          reason: 'unknown_species_id',
          runtimeSpeciesId,
          species: null,
          mapping: null,
        });
      }
      return Object.freeze({ ok: true, reason: null, runtimeSpeciesId, species, mapping });
    },
  });
}
