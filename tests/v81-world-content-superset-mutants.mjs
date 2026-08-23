import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MONSTER_CATALOG } from '../monster-catalog.mjs';
import { STAGE_CATALOG } from '../stage-catalog.mjs';
import { WARP_ROUTES } from '../warp-routes.mjs';

const moduleUrl = new URL('../world-content-superset.mjs', import.meta.url);
const originalSource = fs.readFileSync(moduleUrl, 'utf8');
const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

async function loadSource(source, tag) {
  const absolute = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(relativePath, moduleUrl).href}'`,
  );
  const encoded = Buffer.from(`${absolute}\n//# sourceURL=${tag}`).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

function liveZones() {
  const marker = 'const ZONES=';
  const start = game.indexOf(marker) + marker.length;
  const end = game.indexOf('\n};\nconst zoneContentValidation', start) + 2;
  return Function('BALANCE', `"use strict";return (${game.slice(start, end)});`)({
    grassMeadowRare: { level: 2, chance: .24 },
    grassMeadowBoss: { level: 5 },
  });
}

function inputs() {
  return {
    zones: liveZones(),
    routes: structuredClone(WARP_ROUTES),
    stages: structuredClone(STAGE_CATALOG),
    speciesMappings: structuredClone(MONSTER_CATALOG),
  };
}

function hasIssue(result, code) {
  return result.issues.some(issue => issue.code === code);
}

function assertDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

function assertContract(module) {
  assert.equal(module.WORKBOOK_WORLD_BASELINE.workbookSha256, 'fdda777b1cbb0eeaacb7e02ced3c1c9df1a3af2853bfdf8d1fe902370789e39c');
  assert.equal(module.WORKBOOK_WORLD_BASELINE.spawnPlacements.digest, '9db9a6fde19e982db534558b2831e0d32d6a224995570921852fb186f4f8e381');
  assert.equal(module.CANONICAL_MAIN_WORLD_ADDITIONS.spawnPlacements.digest, 'f197115fbacd6d0bba952228b9e0b90ef56107b92f2dcf112fe03d094fd7a2d8');
  assert.equal(module.WORKBOOK_WORLD_BASELINE.routes.digest, 'cd5b18b1ea4c5a6e48ecd1e04a452514b784ea194fa4a38eeb969b34300bb99b');
  assert.equal(module.CANONICAL_MAIN_WORLD_ADDITIONS.routes.digest, 'becea50e803e45ca6e3d39dab5dead86c33313303b3890100b8b2f76512fba96');
  assert.equal(module.WORKBOOK_WORLD_BASELINE.stages.digest, 'add440d4971b34fddb714b7f70dc43f72e2c8d00d7952698ec9d1df60d193a93');
  assert.equal(module.CANONICAL_MAIN_WORLD_ADDITIONS.stages.digest, '5768654e398c121c45721ae113407a755207007d09736de3bf86501aba95b9e4');
  assert.equal(module.WORKBOOK_WORLD_BASELINE.plannedStages.digest, '78f2703a5f49c444162196d150d533b5021276d54b695fcf8cff34088ce66f40');
  assert.equal(module.WORKBOOK_WORLD_BASELINE.landmarkDigest, 'ed13b6688c013d159aeed926a0905dd1b5028fdcc9ac41e2ded83666b8a9436a');
  assert.deepEqual(module.CANONICAL_MAIN_WORLD_ADDITIONS.implementedStageIds, ['haunted-woods', 'shadow-city', 'steel-factory']);
  assert.deepEqual(module.WORLD_WARNING_BASELINE.map(row => [row.id, row.severity, row.sourceCell]), [
    ['MAP-A01:ember-valley', 'HIGH', 'Map_Audit!A18:D18'],
    ['MAP-A01:misty-lake', 'HIGH', 'Map_Audit!A19:D19'],
    ['MAP-A01:storm-field', 'HIGH', 'Map_Audit!A20:D20'],
    ['MAP-A01:frozen-pass', 'HIGH', 'Map_Audit!A21:D21'],
    ['MAP-A01:rocky-canyon', 'HIGH', 'Map_Audit!A22:D22'],
    ['MAP-A01:sky-ruins', 'HIGH', 'Map_Audit!A23:D23'],
    ['MAP-A01:poison-marsh', 'HIGH', 'Map_Audit!A24:D24'],
    ['MAP-A03', 'HIGH', 'Map_Audit!F6'],
    ['MAP-A06', 'HIGH', 'Map_Audit!F9'],
  ]);
  assertDeepFrozen(module.WORKBOOK_WORLD_BASELINE);
  assertDeepFrozen(module.CANONICAL_MAIN_WORLD_ADDITIONS);
  assertDeepFrozen(module.WORLD_WARNING_BASELINE);

  const current = module.validateWorldContentSuperset(inputs());
  assert.equal(current.ok, true, JSON.stringify(current.issues));
  assert.equal(current.counts.actualSpawnPlacements, 133);
  assert.equal(current.counts.actualRoutes, 28);
  assert.equal(current.counts.actualImplementedStages, 12);
  assertDeepFrozen(current);

  const invalidRoot = module.validateWorldContentSuperset(null);
  assert.equal(invalidRoot.ok, false);
  assert.equal(hasIssue(invalidRoot, 'invalid_zone_catalog'), true);
  assert.equal(hasIssue(invalidRoot, 'invalid_route_catalog'), true);

  const reordered = inputs();
  reordered.zones = Object.fromEntries(Object.entries(reordered.zones).reverse().map(([id, zone]) => {
    for (const key of ['spawn', 'rareSpawn', 'eliteSpawn', 'bossSpawn']) zone[key]?.reverse();
    return [id, zone];
  }));
  reordered.routes.reverse();
  reordered.stages.reverse();
  reordered.speciesMappings.reverse();
  reordered.zones['ember-valley'].eliteSpawn[0][4] = { evolutionPath: 'flame_wolf', elite: true };
  assert.equal(module.validateWorldContentSuperset(reordered).ok, true);

  const shiftedWorkbookSpawn = inputs();
  shiftedWorkbookSpawn.zones['grass-meadow'].spawn[0][1] = -10;
  assert.equal(hasIssue(module.validateWorldContentSuperset(shiftedWorkbookSpawn), 'missing_workbook_spawn'), true);

  const shiftedExtraSpawn = inputs();
  shiftedExtraSpawn.zones['haunted-woods'].spawn[0][1] = -10;
  assert.equal(hasIssue(module.validateWorldContentSuperset(shiftedExtraSpawn), 'missing_canonical_spawn'), true);

  const duplicate = inputs();
  duplicate.zones['grass-meadow'].spawn[0] = structuredClone(duplicate.zones['grass-meadow'].spawn[1]);
  assert.equal(hasIssue(module.validateWorldContentSuperset(duplicate), 'duplicate_spawn_signature'), true);

  const oversizedTuple = inputs();
  oversizedTuple.zones['grass-meadow'].spawn[0].push('sixth');
  assert.equal(hasIssue(module.validateWorldContentSuperset(oversizedTuple), 'invalid_spawn_record_arity'), true);

  const unknownOption = inputs();
  unknownOption.zones['grass-meadow'].spawn[0][4].untracked = true;
  assert.equal(hasIssue(module.validateWorldContentSuperset(unknownOption), 'unexpected_spawn_option'), true);

  const shiftedWorkbookRoute = inputs();
  shiftedWorkbookRoute.routes.find(route => route.id === 'grass-to-ember').position[0] = 19;
  assert.equal(hasIssue(module.validateWorldContentSuperset(shiftedWorkbookRoute), 'missing_workbook_route'), true);

  const shiftedExtraRoute = inputs();
  shiftedExtraRoute.routes.find(route => route.id === 'dream-to-haunted').position[0] = 19;
  assert.equal(hasIssue(module.validateWorldContentSuperset(shiftedExtraRoute), 'missing_canonical_route'), true);

  const rogueZone = inputs();
  rogueZone.zones['rogue-zone'] = rogueZone.zones['haunted-woods'];
  delete rogueZone.zones['rogue-zone'].stageId;
  delete rogueZone.zones['haunted-woods'];
  assert.equal(hasIssue(module.validateWorldContentSuperset(rogueZone), 'unexpected_zone'), true);

  const changedLabel = inputs();
  changedLabel.zones['ember-valley'].label = 'Tampered';
  assert.equal(hasIssue(module.validateWorldContentSuperset(changedLabel), 'workbook_zone_mismatch'), true);

  const hostileLegacyLabel = inputs();
  hostileLegacyLabel.zones.hub.label = 1n;
  assert.doesNotThrow(() => module.validateWorldContentSuperset(hostileLegacyLabel));
  assert.equal(hasIssue(module.validateWorldContentSuperset(hostileLegacyLabel), 'workbook_zone_mismatch'), true);

  const cyclicLegacyLabel = inputs();
  const cyclicLabel = {};
  cyclicLabel.self = cyclicLabel;
  cyclicLegacyLabel.zones.hub.label = cyclicLabel;
  assert.doesNotThrow(() => module.validateWorldContentSuperset(cyclicLegacyLabel));
  assert.equal(hasIssue(module.validateWorldContentSuperset(cyclicLegacyLabel), 'workbook_zone_mismatch'), true);

  const changedHubStatus = inputs();
  changedHubStatus.zones.hub.sceneStatus = 'danger';
  assert.equal(hasIssue(module.validateWorldContentSuperset(changedHubStatus), 'workbook_zone_mismatch'), true);

  const plannedRoute = inputs();
  plannedRoute.routes.push({ id: 'rogue-to-planned', from: 'hub', to: 'dragon-crater', label: 'Rogue', position: [1, 1], spawn: [0, 0, 0], kind: 'forward' });
  assert.equal(hasIssue(module.validateWorldContentSuperset(plannedRoute), 'unknown_route_destination'), true);

  const missingExtraStage = inputs();
  delete missingExtraStage.zones['haunted-woods'];
  assert.equal(hasIssue(module.validateWorldContentSuperset(missingExtraStage), 'missing_canonical_stage'), true);

  const badCatalog = inputs();
  badCatalog.stages.find(stage => stage.id === 'grass-meadow').recommendedLevel.max = 6;
  assert.equal(hasIssue(module.validateWorldContentSuperset(badCatalog), 'stage_catalog_mismatch'), true);

  const malformedStages = inputs();
  malformedStages.stages.push(null);
  assert.equal(hasIssue(module.validateWorldContentSuperset(malformedStages), 'invalid_stage_catalog_entry'), true);

  const hostileStage = inputs();
  hostileStage.stages[0].primaryTypes = [1n];
  assert.doesNotThrow(() => module.validateWorldContentSuperset(hostileStage));
  assert.equal(module.validateWorldContentSuperset(hostileStage).ok, false);

  const badPlannedCatalog = inputs();
  badPlannedCatalog.stages.find(stage => stage.id === 'dragon-crater').recommendedLevel.max = 36;
  assert.equal(hasIssue(module.validateWorldContentSuperset(badPlannedCatalog), 'stage_catalog_mismatch'), true);

  const renamedMapping = inputs();
  renamedMapping.speciesMappings.find(mapping => mapping.runtimeSpeciesId === 'mossbun').runtimeName = 'Mutant Moss';
  assert.equal(hasIssue(module.validateWorldContentSuperset(renamedMapping), 'species_mapping_mismatch'), true);

  const staleMapping = inputs();
  staleMapping.speciesMappings[0].sourceWorkbookVersion = 'tampered';
  assert.equal(hasIssue(module.validateWorldContentSuperset(staleMapping), 'species_mapping_mismatch'), true);

  const spoofedMapping = inputs();
  spoofedMapping.speciesMappings[0].runtimeName = { toJSON() { return 'Plain Slime'; } };
  assert.equal(hasIssue(module.validateWorldContentSuperset(spoofedMapping), 'species_mapping_mismatch'), true);

  const symbolicMapping = inputs();
  symbolicMapping.speciesMappings[0].workbookBaseMonsterId = Symbol('hostile');
  assert.doesNotThrow(() => module.validateWorldContentSuperset(symbolicMapping));
  assert.equal(hasIssue(module.validateWorldContentSuperset(symbolicMapping), 'invalid_species_mapping'), true);

  const missingMapping = inputs();
  missingMapping.speciesMappings = missingMapping.speciesMappings.filter(mapping => mapping.runtimeSpeciesId !== 'mossbun');
  assert.equal(hasIssue(module.validateWorldContentSuperset(missingMapping), 'missing_spawn_species_mapping'), true);

  const warningRewrite = inputs();
  warningRewrite.zones['ember-valley'].recommendedLevel.max = 7;
  assert.equal(hasIssue(module.validateWorldContentSuperset(warningRewrite), 'known_warning_mismatch'), true);

  const fairyRewrite = inputs();
  fairyRewrite.speciesMappings.find(mapping => mapping.runtimeSpeciesId === 'fairimp').workbookTypeCandidate = 'FAIRY';
  assert.equal(hasIssue(module.validateWorldContentSuperset(fairyRewrite), 'known_warning_mismatch'), true);

  const inversionRewrite = inputs();
  inversionRewrite.zones['dream-shrine'].recommendedLevel.min = 39;
  assert.equal(hasIssue(module.validateWorldContentSuperset(inversionRewrite), 'known_warning_mismatch'), true);

  const plannedRuntime = inputs();
  plannedRuntime.zones['dragon-crater'] = {
    stageId: 'dragon-crater', spawn: [], bounds: { minX: -22, maxX: 22, minZ: -20, maxZ: 20 },
  };
  assert.equal(module.validateWorldContentSuperset(plannedRuntime).ok, false);
}

assertContract(await loadSource(originalSource, 'world-superset-current'));

function replaceOnce(before, after) {
  return source => {
    const mutated = source.replace(before, after);
    assert.notEqual(mutated, source, `mutation target missing: ${before}`);
    return mutated;
  };
}

const mutants = [
  ['corrupt workbook spawn oracle', replaceOnce('9db9a6fde19e982db534558b2831e0d32d6a224995570921852fb186f4f8e381', '0db9a6fde19e982db534558b2831e0d32d6a224995570921852fb186f4f8e381')],
  ['corrupt canonical spawn oracle', replaceOnce('f197115fbacd6d0bba952228b9e0b90ef56107b92f2dcf112fe03d094fd7a2d8', '0197115fbacd6d0bba952228b9e0b90ef56107b92f2dcf112fe03d094fd7a2d8')],
  ['corrupt workbook route oracle', replaceOnce('cd5b18b1ea4c5a6e48ecd1e04a452514b784ea194fa4a38eeb969b34300bb99b', '0d5b18b1ea4c5a6e48ecd1e04a452514b784ea194fa4a38eeb969b34300bb99b')],
  ['corrupt canonical route oracle', replaceOnce('becea50e803e45ca6e3d39dab5dead86c33313303b3890100b8b2f76512fba96', '0ecea50e803e45ca6e3d39dab5dead86c33313303b3890100b8b2f76512fba96')],
  ['corrupt workbook stage oracle', replaceOnce('add440d4971b34fddb714b7f70dc43f72e2c8d00d7952698ec9d1df60d193a93', '0dd440d4971b34fddb714b7f70dc43f72e2c8d00d7952698ec9d1df60d193a93')],
  ['corrupt canonical stage oracle', replaceOnce('5768654e398c121c45721ae113407a755207007d09736de3bf86501aba95b9e4', '0768654e398c121c45721ae113407a755207007d09736de3bf86501aba95b9e4')],
  ['corrupt planned stage oracle', replaceOnce('78f2703a5f49c444162196d150d533b5021276d54b695fcf8cff34088ce66f40', '08f2703a5f49c444162196d150d533b5021276d54b695fcf8cff34088ce66f40')],
  ['corrupt landmark oracle', replaceOnce('ed13b6688c013d159aeed926a0905dd1b5028fdcc9ac41e2ded83666b8a9436a', '0d13b6688c013d159aeed926a0905dd1b5028fdcc9ac41e2ded83666b8a9436a')],
  ['drop canonical stage policy', replaceOnce("const CANONICAL_ADDED_STAGE_IDS = ['haunted-woods', 'shadow-city', 'steel-factory'];", "const CANONICAL_ADDED_STAGE_IDS = ['shadow-city', 'steel-factory'];")],
  ['skip digest enforcement', replaceOnce('if (digest !== policy.digest) {', 'if (false) {')],
  ['skip duplicate detection', replaceOnce('if (duplicateCount > 0) issues.push({ code: codes.duplicate, count: duplicateCount });', 'if (false) issues.push({ code: codes.duplicate, count: duplicateCount });')],
  ['make digest order-dependent', replaceOnce('.map(row => JSON.stringify(row)).sort();', '.map(row => JSON.stringify(row));')],
  ['break boss precedence', replaceOnce("if (options?.boss === true) return 'Boss';", "if (false) return 'Boss';")],
  ['erase evolution paths', replaceOnce("typeof options.evolutionPath === 'string' && options.evolutionPath ? options.evolutionPath : null,", 'null,')],
  ['make elite normally capturable', replaceOnce("variant === 'Boss' ? 'disabled' : variant === 'Elite' ? 'elite' : 'normal',", "variant === 'Boss' ? 'disabled' : 'normal',")],
  ['erase gate chance', replaceOnce('return Number.isFinite(chance) ? finiteNumberOrNull(chance * 100) : null;', 'return null;')],
  ['erase legacy class prefix', replaceOnce("`${zone.stageId ? '' : 'Legacy'}${variant}`", '`${variant}`')],
  ['accept unexpected zone IDs', replaceOnce("for (const id of actual) if (!expected.has(id)) issues.push({ code: unexpectedCode, [field]: id });", 'for (const id of actual) if (false) issues.push({ code: unexpectedCode, [field]: id });')],
  ['accept mapping metadata drift', replaceOnce("else if (JSON.stringify(mappingProjection(actual)) !== JSON.stringify(mappingProjection(expected))) {", 'else if (false) {')],
  ['erase missing mapping diagnostic', replaceOnce("if (!actual) issues.push({ code: 'missing_spawn_species_mapping', runtimeSpeciesId: expected.runtimeSpeciesId });", 'if (!actual) {}')],
  ['erase level warning guard', replaceOnce("if (runtimeLevel !== warning.runtimeLevel || catalogLevel !== warning.catalogLevel) {", 'if (false) {')],
  ['erase Fairy LIGHT warning guard', replaceOnce("if (fairimp?.runtimeType !== 'Fairy' || fairimp?.workbookTypeCandidate !== 'LIGHT' || fairimp?.typeActivation !== 'deferred') {", 'if (false) {')],
  ['erase inversion warning guard', replaceOnce("if (poisonLevel !== '30-38' || dreamLevel !== '20-24') {", 'if (false) {')],
  ['make snapshots shallow-mutable', replaceOnce('return Object.freeze(value);', 'return value;')],
  ['always claim ok', replaceOnce('return deepFreeze({ ok: frozenIssues.length === 0, issues: frozenIssues, warnings: WORLD_WARNING_BASELINE, counts });', 'return deepFreeze({ ok: true, issues: frozenIssues, warnings: WORLD_WARNING_BASELINE, counts });')],
  ['skip workbook stage digest', replaceOnce("if (worldContentDigest(workbookStageRows) !== WORKBOOK_WORLD_BASELINE.stages.digest) {", 'if (false) {')],
  ['skip planned stage digest', replaceOnce("if (worldContentDigest(plannedStageRows) !== WORKBOOK_WORLD_BASELINE.plannedStages.digest) {", 'if (false) {')],
  ['treat planned catalog as live for route validation', replaceOnce('knownZoneIds: Object.keys(safeZones)', 'knownZoneIds: [...Object.keys(safeZones), ...PLANNED_NO_RUNTIME_STAGE_IDS]')],
  ['change frozen warning severity', replaceOnce("severity: 'HIGH', code: 'fairy_light_deferred'", "severity: 'MEDIUM', code: 'fairy_light_deferred'")],
  ['corrupt workbook provenance', replaceOnce('fdda777b1cbb0eeaacb7e02ced3c1c9df1a3af2853bfdf8d1fe902370789e39c', '0dda777b1cbb0eeaacb7e02ced3c1c9df1a3af2853bfdf8d1fe902370789e39c')],
  ['accept planned runtime zone', source => {
    let mutated = source.replace(
      "for (const id of actual) if (!expected.has(id)) issues.push({ code: unexpectedCode, [field]: id });",
      'for (const id of actual) if (false) issues.push({ code: unexpectedCode, [field]: id });',
    );
    mutated = mutated.replace(
      "if (!WORKBOOK_WORLD_BASELINE.implementedStageIds.includes(id) && !CANONICAL_MAIN_WORLD_ADDITIONS.implementedStageIds.includes(id)) {",
      'if (false) {',
    );
    assert.notEqual(mutated, source);
    return mutated;
  }],
  ['accept malformed stage entries', replaceOnce(
    "if (!stage || typeof stage !== 'object' || Array.isArray(stage) || typeof stage.id !== 'string' || !stage.id) {",
    'if (false) {',
  )],
  ['throw on null root', replaceOnce(
    "const root = input && typeof input === 'object' && !Array.isArray(input) ? input : {};",
    'const root = input;',
  )],
  ['trust validator route default on missing root', replaceOnce(
    'validateWarpRoutes(routes === undefined ? null : routes, { knownZoneIds: Object.keys(safeZones) })',
    'validateWarpRoutes(routes, { knownZoneIds: Object.keys(safeZones) })',
  )],
  ['skip exact zone metadata', replaceOnce('validateZoneMetadata(safeZones, issues);', '')],
  ['ignore mapping workbook provenance', replaceOnce('stringOrNull(mapping?.sourceWorkbookVersion),', '')],
  ['skip exact spawn tuple and option shape', replaceOnce('validateSpawnRecordShapes(safeZones, issues);', '')],
  ['trust hostile stage array values', replaceOnce(
    'return Array.isArray(value) ? value.map(entry => stringOrNull(entry)) : null;',
    'return Array.isArray(value) ? [...value] : null;',
  )],
  ['honor mapping toJSON spoof', replaceOnce('stringOrNull(mapping?.runtimeName),', 'mapping?.runtimeName ?? null,')],
  ['rethrow hostile catalog mapping', replaceOnce(
    "issues.push({ code: 'invalid_species_mapping', reason: 'catalog_validator_rejected_input' });",
    'throw new TypeError(\'mutant catalog validator crash\');',
  )],
  ['trust hostile legacy label', replaceOnce(
    'stringOrNull(zone?.label),',
    'zone?.label ?? null,',
  )],
];

let killed = 0;
for (let index = 0; index < mutants.length; index += 1) {
  const [name, mutate] = mutants[index];
  try {
    assertContract(await loadSource(mutate(originalSource), `world-superset-mutant-${index}`));
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

assert.equal(killed, mutants.length);
console.log(`V8.1 A38 workbook world superset mutants: PASS (${killed}/${mutants.length} killed)`);
