import { createHash } from 'node:crypto';
import { MONSTER_CATALOG, validateMonsterCatalog } from './monster-catalog.mjs';
import { STAGE_CATALOG, validateZoneEncounterConfig } from './stage-catalog.mjs';
import { validateWarpRoutes } from './warp-routes.mjs';

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function safeCopy(value, depth = 0) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'bigint') return String(value);
  if (!value || typeof value !== 'object' || depth >= 5) return null;
  if (Array.isArray(value)) return value.map(entry => safeCopy(entry, depth + 1));
  const copy = {};
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) copy[key] = safeCopy(descriptor.value, depth + 1);
  }
  return copy;
}

function finiteNumberOrNull(value) {
  if (!Number.isFinite(value)) return null;
  return Object.is(value, -0) ? 0 : value;
}

function stringOrNull(value) {
  return typeof value === 'string' ? value : null;
}

function stringArrayOrNull(value) {
  return Array.isArray(value) ? value.map(entry => stringOrNull(entry)) : null;
}

const WORKBOOK_ZONE_IDS = [
  'hub', 'grass-meadow', 'ember-valley', 'misty-lake', 'storm-field', 'frozen-pass',
  'rocky-canyon', 'sky-ruins', 'poison-marsh', 'dream-shrine', 'grassland', 'cave',
];
const WORKBOOK_IMPLEMENTED_STAGE_IDS = [
  'grass-meadow', 'ember-valley', 'misty-lake', 'storm-field', 'frozen-pass',
  'rocky-canyon', 'sky-ruins', 'poison-marsh', 'dream-shrine',
];
const CANONICAL_ADDED_STAGE_IDS = ['haunted-woods', 'shadow-city', 'steel-factory'];
const WORKBOOK_ROUTE_IDS = [
  'hub-to-grass', 'grass-to-hub', 'grass-to-ember', 'ember-to-grass',
  'ember-to-misty', 'misty-to-ember', 'misty-to-storm', 'storm-to-misty',
  'storm-to-frozen', 'frozen-to-storm', 'frozen-to-rocky', 'rocky-to-frozen',
  'rocky-to-sky', 'sky-to-rocky', 'sky-to-poison', 'poison-to-sky',
  'poison-to-hub', 'poison-to-dream', 'dream-to-poison', 'storm-to-hub',
];
const CANONICAL_ADDED_ROUTE_IDS = [
  'grassland-to-hub', 'dream-to-haunted', 'haunted-to-dream', 'haunted-to-shadow',
  'shadow-to-haunted', 'shadow-to-steel', 'steel-to-shadow', 'steel-to-hub',
];
const PLANNED_NO_RUNTIME_STAGE_IDS = [
  'dragon-crater', 'fairy-garden', 'combat-colosseum', 'normal-wildlands',
];
const STAGE_CATALOG_IDS = [
  ...WORKBOOK_IMPLEMENTED_STAGE_IDS,
  ...CANONICAL_ADDED_STAGE_IDS,
  ...PLANNED_NO_RUNTIME_STAGE_IDS,
];

const LANDMARKS = [
  ['LM_PLAYER', 'hub', 'Player Start', 'Spawn', 0, 0, 5],
  ['LM_RANCH', 'hub', 'Ranch Pad', 'Service', 7, 0, 3],
  ['LM_BREED_PAD', 'hub', 'Breeding Pad', 'Service', 5.2, 0, 8.2],
  ['LM_INCUBATOR', 'hub', 'Incubator', 'Service', 5.2, 0, 8.2],
  ['LM_KEEPER', 'hub', 'Keeper NPC', 'NPC', 4, 0, 3],
  ['LM_MERCHANT', 'hub', 'Merchant NPC', 'NPC', 9, 0, 3],
  ['LM_TRAINER', 'hub', 'Trainer NPC', 'NPC', 1, 0, 10],
  ['LM_EVOLUTION', 'hub', 'Evolution NPC', 'NPC', -6, 0, 8],
  ['LM_BREED_NPC', 'hub', 'Breeding NPC', 'NPC', 7, 0, 10],
];

const WORKBOOK_ZONE_METADATA = [
  ['hub', 'Ranch Hub', null, null, [], [], null, null],
  ['grass-meadow', 'Grass Meadow • Normal + Rare + Elite + Boss', 'grass-meadow', 'grass-meadow', ['Grass'], ['Bug', 'Normal'], 'mossbun', 'normal-encounters'],
  ['ember-valley', 'Ember Valley • Fire + Rock + Ground', 'ember-valley', 'volcanic-valley', ['Fire'], ['Rock', 'Ground'], 'flameling', 'stage-ready'],
  ['misty-lake', 'Misty Lake • Water + Grass + Flying', 'misty-lake', 'misty-lake', ['Water'], ['Grass', 'Flying'], 'aquapuff', 'stage-ready'],
  ['storm-field', 'Storm Field • Electric + Flying + Steel', 'storm-field', 'storm-field', ['Electric'], ['Flying', 'Steel'], 'voltkit', 'stage-ready'],
  ['frozen-pass', 'Frozen Pass • Ice + Flying + Water', 'frozen-pass', 'frozen-pass', ['Ice'], ['Flying', 'Water'], 'frostowl', 'stage-ready'],
  ['rocky-canyon', 'Rocky Canyon • Rock + Ground + Fighting', 'rocky-canyon', 'rocky-canyon', ['Rock'], ['Ground', 'Fighting'], 'rockhorn', 'stage-ready'],
  ['sky-ruins', 'Sky Ruins • Flying + Electric + Psychic', 'sky-ruins', 'sky-ruins', ['Flying'], ['Electric', 'Psychic'], 'galebird', 'stage-ready'],
  ['poison-marsh', 'Poison Marsh • Poison + Grass + Bug', 'poison-marsh', 'poison-marsh', ['Poison'], ['Grass', 'Bug'], 'toxitoad', 'stage-ready'],
  ['dream-shrine', 'Dream Shrine • Psychic + Fairy + Normal', 'dream-shrine', 'dream-shrine', ['Psychic'], ['Fairy', 'Normal'], 'mindcoon', 'stage-ready'],
  ['grassland', 'Green Meadow', null, null, [], [], null, null],
  ['cave', 'Echo Cave', null, null, [], [], null, null],
];

const CANONICAL_ADDED_ZONE_METADATA = [
  ['haunted-woods', 'Haunted Woods • Ghost + Dark + Poison', 'haunted-woods', 'haunted-woods', ['Ghost'], ['Dark', 'Poison'], 'ghostpurr', 'stage-ready'],
  ['shadow-city', 'Shadow City • Dark + Poison + Fighting', 'shadow-city', 'shadow-city', ['Dark'], ['Poison', 'Fighting'], 'voidhorn', 'stage-ready'],
  ['steel-factory', 'Steel Factory • Steel + Electric + Rock', 'steel-factory', 'steel-factory', ['Steel'], ['Electric', 'Rock'], 'ironbug', 'stage-ready'],
];

export const WORKBOOK_WORLD_BASELINE = deepFreeze({
  validationSurface: 'ci_only_no_runtime_xlsx_read',
  workbookFile: 'PocketMonster_Detailed_v2.1_SkillButtonIcons.xlsx',
  workbookSha256: 'fdda777b1cbb0eeaacb7e02ced3c1c9df1a3af2853bfdf8d1fe902370789e39c',
  sourceCommit: 'd797e102e3305cd35c45cfcad90ffb9616a5599a',
  sourceRanges: {
    current: 'Map_Current!A1:AE13',
    planned: 'Map_Planned!A1:Q17',
    spawns: 'Map_Spawn_Placement!A1:U110',
    routes: 'Map_Warp_Routes!A1:L21',
    landmarks: 'Map_Landmarks!A1:K10',
    placementGuide: 'Map_Placement_Guide!A1:H22',
    audit: 'Map_Audit!A1:F24',
  },
  zoneIds: WORKBOOK_ZONE_IDS,
  implementedStageIds: WORKBOOK_IMPLEMENTED_STAGE_IDS,
  stageCatalogIds: STAGE_CATALOG_IDS,
  plannedNoRuntimeStageIds: PLANNED_NO_RUNTIME_STAGE_IDS,
  routeIds: WORKBOOK_ROUTE_IDS,
  zoneMetadata: WORKBOOK_ZONE_METADATA,
  spawnPlacements: {
    count: 109,
    digest: '9db9a6fde19e982db534558b2831e0d32d6a224995570921852fb186f4f8e381',
    sourceRange: 'Map_Spawn_Placement!A2:U110',
  },
  routes: {
    count: 20,
    digest: 'cd5b18b1ea4c5a6e48ecd1e04a452514b784ea194fa4a38eeb969b34300bb99b',
    sourceRange: 'Map_Warp_Routes!A2:L21',
  },
  stages: {
    count: 9,
    digest: 'add440d4971b34fddb714b7f70dc43f72e2c8d00d7952698ec9d1df60d193a93',
    sourceRanges: ['Map_Planned!A2:Q10', 'Map_Current!A3:AE11'],
  },
  plannedStages: {
    count: 4,
    digest: '78f2703a5f49c444162196d150d533b5021276d54b695fcf8cff34088ce66f40',
    sourceRange: 'Map_Planned!A14:Q17',
  },
  landmarks: LANDMARKS,
  landmarkDigest: 'ed13b6688c013d159aeed926a0905dd1b5028fdcc9ac41e2ded83666b8a9436a',
});

export const CANONICAL_MAIN_WORLD_ADDITIONS = deepFreeze({
  policyBaseCommit: '0be03c3099dbfdf089a3a66e3185e23d99cd710e',
  zoneIds: CANONICAL_ADDED_STAGE_IDS,
  implementedStageIds: CANONICAL_ADDED_STAGE_IDS,
  routeIds: CANONICAL_ADDED_ROUTE_IDS,
  zoneMetadata: CANONICAL_ADDED_ZONE_METADATA,
  spawnPlacements: {
    count: 24,
    digest: 'f197115fbacd6d0bba952228b9e0b90ef56107b92f2dcf112fe03d094fd7a2d8',
  },
  routes: {
    count: 8,
    digest: 'becea50e803e45ca6e3d39dab5dead86c33313303b3890100b8b2f76512fba96',
  },
  stages: {
    count: 3,
    digest: '5768654e398c121c45721ae113407a755207007d09736de3bf86501aba95b9e4',
  },
});

export const WORLD_WARNING_BASELINE = deepFreeze([
  { id: 'MAP-A01:ember-valley', auditId: 'MAP-A01', severity: 'HIGH', code: 'level_range_mismatch', mapId: 'ember-valley', runtimeLevel: '4-8', catalogLevel: '4-7', sourceCell: 'Map_Audit!A18:D18' },
  { id: 'MAP-A01:misty-lake', auditId: 'MAP-A01', severity: 'HIGH', code: 'level_range_mismatch', mapId: 'misty-lake', runtimeLevel: '7-12', catalogLevel: '5-8', sourceCell: 'Map_Audit!A19:D19' },
  { id: 'MAP-A01:storm-field', auditId: 'MAP-A01', severity: 'HIGH', code: 'level_range_mismatch', mapId: 'storm-field', runtimeLevel: '12-18', catalogLevel: '6-10', sourceCell: 'Map_Audit!A20:D20' },
  { id: 'MAP-A01:frozen-pass', auditId: 'MAP-A01', severity: 'HIGH', code: 'level_range_mismatch', mapId: 'frozen-pass', runtimeLevel: '16-22', catalogLevel: '10-14', sourceCell: 'Map_Audit!A21:D21' },
  { id: 'MAP-A01:rocky-canyon', auditId: 'MAP-A01', severity: 'HIGH', code: 'level_range_mismatch', mapId: 'rocky-canyon', runtimeLevel: '20-26', catalogLevel: '12-16', sourceCell: 'Map_Audit!A22:D22' },
  { id: 'MAP-A01:sky-ruins', auditId: 'MAP-A01', severity: 'HIGH', code: 'level_range_mismatch', mapId: 'sky-ruins', runtimeLevel: '24-30', catalogLevel: '14-18', sourceCell: 'Map_Audit!A23:D23' },
  { id: 'MAP-A01:poison-marsh', auditId: 'MAP-A01', severity: 'HIGH', code: 'level_range_mismatch', mapId: 'poison-marsh', runtimeLevel: '30-38', catalogLevel: '16-20', sourceCell: 'Map_Audit!A24:D24' },
  { id: 'MAP-A03', auditId: 'MAP-A03', severity: 'HIGH', code: 'fairy_light_deferred', runtimeSpeciesId: 'fairimp', runtimeType: 'Fairy', workbookTypeCandidate: 'LIGHT', sourceCell: 'Map_Audit!F6' },
  { id: 'MAP-A06', auditId: 'MAP-A06', severity: 'HIGH', code: 'poison_dream_level_inversion', fromMapId: 'poison-marsh', fromLevel: '30-38', toMapId: 'dream-shrine', toLevel: '20-24', sourceCell: 'Map_Audit!F9' },
]);

function variantFrom(listName, options) {
  if (listName === 'rareSpawn') return 'Rare';
  if (listName === 'eliteSpawn') return 'Elite';
  if (listName === 'bossSpawn') return 'Boss';
  if (options?.boss === true) return 'Boss';
  if (options?.elite === true) return 'Elite';
  if (options?.rare === true) return 'Rare';
  return 'Normal';
}

function tableIdFrom(zone, listName) {
  const key = listName === 'spawn' ? 'encounterTableId'
    : listName === 'rareSpawn' ? 'rareEncounterTableId'
      : listName === 'eliteSpawn' ? 'eliteEncounterTableId' : 'bossEncounterTableId';
  return typeof zone?.[key] === 'string' && zone[key] ? zone[key] : null;
}

function chanceFrom(zone, listName) {
  const chance = listName === 'rareSpawn' ? zone?.rareChance
    : listName === 'eliteSpawn' ? zone?.eliteChance : null;
  return Number.isFinite(chance) ? finiteNumberOrNull(chance * 100) : null;
}

function normalizeSpawnRows(zones) {
  if (!zones || typeof zones !== 'object' || Array.isArray(zones)) return [];
  const rows = [];
  for (const [mapId, zone] of Object.entries(zones)) {
    if (!zone || typeof zone !== 'object') continue;
    for (const listName of ['spawn', 'rareSpawn', 'eliteSpawn', 'bossSpawn']) {
      const records = Array.isArray(zone[listName]) ? zone[listName] : [];
      for (const record of records) {
        const values = Array.isArray(record) ? record : [];
        const options = values[4] && typeof values[4] === 'object' && !Array.isArray(values[4]) ? values[4] : {};
        const variant = variantFrom(listName, options);
        rows.push([
          mapId,
          `${zone.stageId ? '' : 'Legacy'}${variant}`,
          typeof values[0] === 'string' ? values[0] : null,
          finiteNumberOrNull(values[1]),
          finiteNumberOrNull(values[2]),
          finiteNumberOrNull(values[3]),
          chanceFrom(zone, listName),
          typeof options.evolutionPath === 'string' && options.evolutionPath ? options.evolutionPath : null,
          variant === 'Boss' ? 'disabled' : variant === 'Elite' ? 'elite' : 'normal',
          tableIdFrom(zone, listName),
        ]);
      }
    }
  }
  return rows;
}

function normalizeRouteRows(routes) {
  if (!Array.isArray(routes)) return [];
  return routes.map(route => [
    typeof route?.id === 'string' ? route.id : null,
    typeof route?.from === 'string' ? route.from : null,
    typeof route?.to === 'string' ? route.to : null,
    typeof route?.label === 'string' ? route.label : null,
    finiteNumberOrNull(route?.position?.[0]),
    finiteNumberOrNull(route?.position?.[1]),
    finiteNumberOrNull(route?.spawn?.[0]),
    finiteNumberOrNull(route?.spawn?.[1]),
    finiteNumberOrNull(route?.spawn?.[2]),
    typeof route?.kind === 'string' ? route.kind : null,
  ]);
}

function normalizeStageRows(zones, stages, stageIds) {
  const stageById = new Map((Array.isArray(stages) ? stages : []).map(stage => [stage?.id, stage]));
  return stageIds.map(mapId => {
    const stage = stageById.get(mapId);
    const zone = zones?.[mapId];
    const rule = stage?.unlockRule;
    return [
      mapId,
      typeof stage?.displayName === 'string' ? stage.displayName : null,
      typeof stage?.biomeId === 'string' ? stage.biomeId : null,
      stringArrayOrNull(stage?.primaryTypes),
      stringArrayOrNull(stage?.secondaryTypes),
      finiteNumberOrNull(stage?.recommendedLevel?.min),
      finiteNumberOrNull(stage?.recommendedLevel?.max),
      typeof rule?.type === 'string' ? rule.type : null,
      typeof rule?.stageId === 'string' ? rule.stageId : typeof rule?.setId === 'string' ? rule.setId : null,
      typeof stage?.status === 'string' ? stage.status : null,
      typeof stage?.mapLayoutId === 'string' ? stage.mapLayoutId : null,
      typeof zone?.sceneStatus === 'string' ? zone.sceneStatus : null,
      finiteNumberOrNull(zone?.recommendedLevel?.min),
      finiteNumberOrNull(zone?.recommendedLevel?.max),
      finiteNumberOrNull(zone?.bounds?.minX),
      finiteNumberOrNull(zone?.bounds?.maxX),
      finiteNumberOrNull(zone?.bounds?.minZ),
      finiteNumberOrNull(zone?.bounds?.maxZ),
      finiteNumberOrNull(zone?.playerStart?.[0]),
      finiteNumberOrNull(zone?.playerStart?.[1]),
      finiteNumberOrNull(zone?.playerStart?.[2]),
      Array.isArray(zone?.spawn) ? zone.spawn.length : 0,
      Array.isArray(zone?.rareSpawn) ? zone.rareSpawn.length : 0,
      Array.isArray(zone?.eliteSpawn) ? zone.eliteSpawn.length : 0,
      Array.isArray(zone?.bossSpawn) ? zone.bossSpawn.length : 0,
      tableIdFrom(zone, 'spawn'),
      tableIdFrom(zone, 'rareSpawn'),
      tableIdFrom(zone, 'eliteSpawn'),
      tableIdFrom(zone, 'bossSpawn'),
    ];
  });
}

export function worldContentDigest(rows) {
  const signatures = (Array.isArray(rows) ? rows : []).map(row => JSON.stringify(row)).sort();
  return createHash('sha256').update(JSON.stringify(signatures)).digest('hex');
}

export function normalizeWorldSpawnRows(zones) {
  return deepFreeze(normalizeSpawnRows(zones));
}

export function normalizeWorldRouteRows(routes) {
  return deepFreeze(normalizeRouteRows(routes));
}

export function normalizeWorldStageRows(zones, stages = STAGE_CATALOG, stageIds = WORKBOOK_IMPLEMENTED_STAGE_IDS) {
  return deepFreeze(normalizeStageRows(zones, stages, [...stageIds]));
}

function addDigestIssues(rows, policy, issues, codes) {
  const digest = worldContentDigest(rows);
  const signatures = rows.map(row => JSON.stringify(row));
  const duplicateCount = signatures.length - new Set(signatures).size;
  if (duplicateCount > 0) issues.push({ code: codes.duplicate, count: duplicateCount });
  if (rows.length < policy.count) issues.push({ code: codes.missing, count: rows.length, expected: policy.count });
  if (rows.length > policy.count) issues.push({ code: codes.unexpected, count: rows.length, expected: policy.count });
  if (digest !== policy.digest) {
    if (rows.length === policy.count) {
      issues.push({ code: codes.missing, digest, expectedDigest: policy.digest });
      issues.push({ code: codes.unexpected, digest, expectedDigest: policy.digest });
    }
    issues.push({ code: codes.mismatch, digest, expectedDigest: policy.digest });
  }
}

function rangeText(range) {
  return Number.isFinite(range?.min) && Number.isFinite(range?.max) ? `${range.min}-${range.max}` : null;
}

function validateKnownWarnings(zones, stages, mappings, issues) {
  const stageById = new Map((Array.isArray(stages) ? stages : []).map(stage => [stage?.id, stage]));
  for (const warning of WORLD_WARNING_BASELINE.filter(row => row.code === 'level_range_mismatch')) {
    const runtimeLevel = rangeText(zones?.[warning.mapId]?.recommendedLevel);
    const catalogLevel = rangeText(stageById.get(warning.mapId)?.recommendedLevel);
    if (runtimeLevel !== warning.runtimeLevel || catalogLevel !== warning.catalogLevel) {
      issues.push({ code: 'known_warning_mismatch', warningId: warning.id, runtimeLevel, catalogLevel });
    }
  }
  const fairimp = (Array.isArray(mappings) ? mappings : []).find(mapping => mapping?.runtimeSpeciesId === 'fairimp');
  if (fairimp?.runtimeType !== 'Fairy' || fairimp?.workbookTypeCandidate !== 'LIGHT' || fairimp?.typeActivation !== 'deferred') {
    issues.push({ code: 'known_warning_mismatch', warningId: 'MAP-A03' });
  }
  const poisonLevel = rangeText(zones?.['poison-marsh']?.recommendedLevel);
  const dreamLevel = rangeText(zones?.['dream-shrine']?.recommendedLevel);
  if (poisonLevel !== '30-38' || dreamLevel !== '20-24') {
    issues.push({ code: 'known_warning_mismatch', warningId: 'MAP-A06', fromLevel: poisonLevel, toLevel: dreamLevel });
  }
}

function mappingProjection(mapping) {
  return [
    stringOrNull(mapping?.runtimeSpeciesId),
    stringOrNull(mapping?.runtimeName),
    stringOrNull(mapping?.runtimeType),
    stringOrNull(mapping?.workbookTypeCandidate),
    stringOrNull(mapping?.workbookBaseMonsterId),
    stringOrNull(mapping?.workbookStage2MonsterId),
    stringOrNull(mapping?.sourceMappingStatus),
    stringOrNull(mapping?.typeDecision),
    stringOrNull(mapping?.typeActivation),
    stringOrNull(mapping?.sourceWorkbookVersion),
  ];
}

function validateMappings(mappings, issues) {
  const supplied = Array.isArray(mappings) ? mappings : [];
  try {
    for (const issue of validateMonsterCatalog(mappings).issues) issues.push(safeCopy(issue));
  } catch {
    issues.push({ code: 'invalid_species_mapping', reason: 'catalog_validator_rejected_input' });
  }
  const actualById = new Map(supplied.map(mapping => [mapping?.runtimeSpeciesId, mapping]));
  for (const expected of MONSTER_CATALOG) {
    const actual = actualById.get(expected.runtimeSpeciesId);
    if (!actual) issues.push({ code: 'missing_spawn_species_mapping', runtimeSpeciesId: expected.runtimeSpeciesId });
    else if (JSON.stringify(mappingProjection(actual)) !== JSON.stringify(mappingProjection(expected))) {
      issues.push({ code: 'species_mapping_mismatch', runtimeSpeciesId: expected.runtimeSpeciesId });
    }
  }
  for (const actual of supplied) {
    if (!MONSTER_CATALOG.some(expected => expected.runtimeSpeciesId === actual?.runtimeSpeciesId)) {
      issues.push({ code: 'unexpected_species_mapping', runtimeSpeciesId: actual?.runtimeSpeciesId ?? null });
    }
  }
}

function validateExactIds(actualIds, expectedIds, issues, missingCode, unexpectedCode, field) {
  const actual = new Set(actualIds);
  const expected = new Set(expectedIds);
  for (const id of expected) if (!actual.has(id)) issues.push({ code: missingCode, [field]: id });
  for (const id of actual) if (!expected.has(id)) issues.push({ code: unexpectedCode, [field]: id });
}

function optionalStringArray(value) {
  if (value === undefined) return [];
  return stringArrayOrNull(value) ?? [null];
}

function zoneMetadataRow(id, zone) {
  return [
    id,
    stringOrNull(zone?.label),
    stringOrNull(zone?.stageId),
    stringOrNull(zone?.biomeId),
    optionalStringArray(zone?.primaryTypes),
    optionalStringArray(zone?.secondaryTypes),
    stringOrNull(zone?.progressionBossSpeciesId),
    stringOrNull(zone?.sceneStatus),
  ];
}

function validateZoneMetadata(zones, issues) {
  for (const [partition, expectedRows] of [
    ['workbook', WORKBOOK_WORLD_BASELINE.zoneMetadata],
    ['canonical', CANONICAL_MAIN_WORLD_ADDITIONS.zoneMetadata],
  ]) {
    for (const expected of expectedRows) {
      const actual = zoneMetadataRow(expected[0], zones?.[expected[0]]);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        issues.push({ code: partition === 'workbook' ? 'workbook_zone_mismatch' : 'canonical_zone_mismatch', zoneId: expected[0] });
      }
    }
  }
}

function validateSpawnRecordShapes(zones, issues) {
  const allowedOptionKeys = new Set(['boss', 'elite', 'rare', 'evolutionPath']);
  for (const [zoneId, zone] of Object.entries(zones)) {
    if (!zone || typeof zone !== 'object') continue;
    for (const listName of ['spawn', 'rareSpawn', 'eliteSpawn', 'bossSpawn']) {
      if (zone[listName] === undefined || !Array.isArray(zone[listName])) continue;
      zone[listName].forEach((record, index) => {
        if (!Array.isArray(record) || record.length !== 5) {
          issues.push({ code: 'invalid_spawn_record_arity', zoneId, listName, index, length: Array.isArray(record) ? record.length : null });
          return;
        }
        const options = record[4];
        if (!options || typeof options !== 'object' || Array.isArray(options)) return;
        if (![Object.prototype, null].includes(Object.getPrototypeOf(options))) {
          issues.push({ code: 'invalid_spawn_options_prototype', zoneId, listName, index });
        }
        for (const key of Object.keys(options)) {
          if (!allowedOptionKeys.has(key)) issues.push({ code: 'unexpected_spawn_option', zoneId, listName, index, key });
          if (['boss', 'elite', 'rare'].includes(key) && options[key] !== true) {
            issues.push({ code: 'invalid_spawn_variant_flag', zoneId, listName, index, key });
          }
          if (key === 'evolutionPath' && (typeof options[key] !== 'string' || !options[key])) {
            issues.push({ code: 'invalid_spawn_evolution_path', zoneId, listName, index });
          }
        }
      });
    }
  }
}

function validateLegacyAndHubMetadata(zones, issues) {
  const expected = {
    hub: ['Ranch Hub', -32, 32, -32, 32, 0, 0, 5],
    grassland: ['Green Meadow', null, null, null, null, null, null, null],
    cave: ['Echo Cave', null, null, null, null, null, null, null],
  };
  for (const [id, row] of Object.entries(expected)) {
    const zone = zones?.[id];
    const actual = [
      stringOrNull(zone?.label),
      finiteNumberOrNull(zone?.bounds?.minX), finiteNumberOrNull(zone?.bounds?.maxX),
      finiteNumberOrNull(zone?.bounds?.minZ), finiteNumberOrNull(zone?.bounds?.maxZ),
      finiteNumberOrNull(zone?.playerStart?.[0]), finiteNumberOrNull(zone?.playerStart?.[1]),
      finiteNumberOrNull(zone?.playerStart?.[2]),
    ];
    if (JSON.stringify(actual) !== JSON.stringify(row)) issues.push({ code: 'workbook_zone_mismatch', zoneId: id });
  }
}

export function validateWorldContentSuperset(input = {}) {
  const root = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const zones = root.zones;
  const routes = root.routes;
  const stages = root.stages === undefined ? STAGE_CATALOG : root.stages;
  const speciesMappings = root.speciesMappings === undefined ? MONSTER_CATALOG : root.speciesMappings;
  const issues = [];
  const safeZones = zones && typeof zones === 'object' && !Array.isArray(zones) ? zones : {};
  const safeRoutes = Array.isArray(routes) ? routes : [];
  const safeStages = Array.isArray(stages) ? stages : [];

  for (const issue of validateZoneEncounterConfig(zones).issues) issues.push(safeCopy(issue));
  for (const issue of validateWarpRoutes(routes === undefined ? null : routes, { knownZoneIds: Object.keys(safeZones) }).issues) issues.push(safeCopy(issue));
  validateMappings(speciesMappings, issues);
  validateSpawnRecordShapes(safeZones, issues);

  const expectedZoneIds = [...WORKBOOK_WORLD_BASELINE.zoneIds, ...CANONICAL_MAIN_WORLD_ADDITIONS.zoneIds];
  validateExactIds(Object.keys(safeZones), expectedZoneIds, issues, 'missing_workbook_zone', 'unexpected_zone', 'zoneId');
  validateLegacyAndHubMetadata(safeZones, issues);
  validateZoneMetadata(safeZones, issues);

  if (!Array.isArray(stages)) issues.push({ code: 'invalid_stage_catalog' });
  safeStages.forEach((stage, index) => {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage) || typeof stage.id !== 'string' || !stage.id) {
      issues.push({ code: 'invalid_stage_catalog_entry', index });
    }
  });
  const stageIds = safeStages.map(stage => stage?.id).filter(id => typeof id === 'string');
  validateExactIds(stageIds, WORKBOOK_WORLD_BASELINE.stageCatalogIds, issues, 'missing_stage_catalog_entry', 'unexpected_stage_catalog_entry', 'stageId');
  if (new Set(stageIds).size !== stageIds.length) issues.push({ code: 'duplicate_stage_catalog_entry' });

  const implementedStageIds = Object.entries(safeZones)
    .filter(([id, zone]) => zone && typeof zone === 'object' && zone.stageId === id)
    .map(([id]) => id);
  const implementedSet = new Set(implementedStageIds);
  for (const id of WORKBOOK_WORLD_BASELINE.implementedStageIds) {
    if (!implementedSet.has(id)) issues.push({ code: 'missing_workbook_stage', stageId: id });
  }
  for (const id of CANONICAL_MAIN_WORLD_ADDITIONS.implementedStageIds) {
    if (!implementedSet.has(id)) issues.push({ code: 'missing_canonical_stage', stageId: id });
  }
  for (const id of implementedSet) {
    if (!WORKBOOK_WORLD_BASELINE.implementedStageIds.includes(id) && !CANONICAL_MAIN_WORLD_ADDITIONS.implementedStageIds.includes(id)) {
      issues.push({ code: 'unexpected_implemented_stage', stageId: id });
    }
  }

  const spawnRows = normalizeSpawnRows(safeZones);
  const workbookSpawnRows = spawnRows.filter(row => WORKBOOK_WORLD_BASELINE.zoneIds.includes(row[0]));
  const canonicalSpawnRows = spawnRows.filter(row => CANONICAL_MAIN_WORLD_ADDITIONS.zoneIds.includes(row[0]));
  addDigestIssues(workbookSpawnRows, WORKBOOK_WORLD_BASELINE.spawnPlacements, issues, {
    missing: 'missing_workbook_spawn', unexpected: 'unexpected_spawn', duplicate: 'duplicate_spawn_signature',
    mismatch: 'workbook_spawn_digest_mismatch',
  });
  addDigestIssues(canonicalSpawnRows, CANONICAL_MAIN_WORLD_ADDITIONS.spawnPlacements, issues, {
    missing: 'missing_canonical_spawn', unexpected: 'unexpected_spawn', duplicate: 'duplicate_spawn_signature',
    mismatch: 'canonical_spawn_digest_mismatch',
  });

  const routeRows = normalizeRouteRows(safeRoutes);
  const workbookRouteRows = routeRows.filter(row => WORKBOOK_WORLD_BASELINE.routeIds.includes(row[0]));
  const canonicalRouteRows = routeRows.filter(row => CANONICAL_MAIN_WORLD_ADDITIONS.routeIds.includes(row[0]));
  const unknownRouteRows = routeRows.filter(row => !WORKBOOK_WORLD_BASELINE.routeIds.includes(row[0]) && !CANONICAL_MAIN_WORLD_ADDITIONS.routeIds.includes(row[0]));
  if (unknownRouteRows.length > 0) issues.push({ code: 'unexpected_route', routeIds: unknownRouteRows.map(row => row[0]) });
  addDigestIssues(workbookRouteRows, WORKBOOK_WORLD_BASELINE.routes, issues, {
    missing: 'missing_workbook_route', unexpected: 'unexpected_route', duplicate: 'duplicate_route_signature',
    mismatch: 'workbook_route_digest_mismatch',
  });
  addDigestIssues(canonicalRouteRows, CANONICAL_MAIN_WORLD_ADDITIONS.routes, issues, {
    missing: 'missing_canonical_route', unexpected: 'unexpected_route', duplicate: 'duplicate_route_signature',
    mismatch: 'canonical_route_digest_mismatch',
  });

  const workbookStageRows = normalizeStageRows(safeZones, safeStages, WORKBOOK_WORLD_BASELINE.implementedStageIds);
  const canonicalStageRows = normalizeStageRows(safeZones, safeStages, CANONICAL_MAIN_WORLD_ADDITIONS.implementedStageIds);
  const plannedStageRows = normalizeStageRows({}, safeStages, WORKBOOK_WORLD_BASELINE.plannedNoRuntimeStageIds);
  if (worldContentDigest(workbookStageRows) !== WORKBOOK_WORLD_BASELINE.stages.digest) {
    issues.push({ code: 'stage_catalog_mismatch', partition: 'workbook' });
  }
  if (worldContentDigest(canonicalStageRows) !== CANONICAL_MAIN_WORLD_ADDITIONS.stages.digest) {
    issues.push({ code: 'stage_catalog_mismatch', partition: 'canonical' });
  }
  if (worldContentDigest(plannedStageRows) !== WORKBOOK_WORLD_BASELINE.plannedStages.digest) {
    issues.push({ code: 'stage_catalog_mismatch', partition: 'planned_no_runtime' });
  }
  validateKnownWarnings(safeZones, safeStages, speciesMappings, issues);

  const normalizedIssues = issues.map(issue => safeCopy(issue));
  normalizedIssues.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const frozenIssues = deepFreeze(normalizedIssues);
  const counts = deepFreeze({
    actualZoneEntries: Object.keys(safeZones).length,
    workbookZoneEntries: WORKBOOK_WORLD_BASELINE.zoneIds.length,
    canonicalAddedZoneEntries: CANONICAL_MAIN_WORLD_ADDITIONS.zoneIds.length,
    actualSpawnPlacements: spawnRows.length,
    workbookSpawnPlacements: workbookSpawnRows.length,
    canonicalAddedSpawnPlacements: canonicalSpawnRows.length,
    actualRoutes: routeRows.length,
    workbookRoutes: workbookRouteRows.length,
    canonicalAddedRoutes: canonicalRouteRows.length,
    actualImplementedStages: implementedSet.size,
    workbookImplementedStages: WORKBOOK_WORLD_BASELINE.implementedStageIds.length,
    canonicalAddedImplementedStages: CANONICAL_MAIN_WORLD_ADDITIONS.implementedStageIds.length,
    stageCatalogEntries: safeStages.length,
    landmarks: WORKBOOK_WORLD_BASELINE.landmarks.length,
  });
  return deepFreeze({ ok: frozenIssues.length === 0, issues: frozenIssues, warnings: WORLD_WARNING_BASELINE, counts });
}
