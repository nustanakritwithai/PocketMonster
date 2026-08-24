import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MONSTER_CATALOG } from '../monster-catalog.mjs';
import { STAGE_CATALOG, stageLevelRange } from '../stage-catalog.mjs';
import { WARP_ROUTES } from '../warp-routes.mjs';
import {
  CANONICAL_FINAL_WORLD_ADDITIONS,
  CANONICAL_LEVEL_RESOLUTION,
  CANONICAL_MAIN_WORLD_ADDITIONS,
  WORKBOOK_WORLD_BASELINE,
  WORKBOOK_WORLD_WARNING_SNAPSHOT,
  WORLD_RESOLUTION_BASELINE,
  WORLD_WARNING_BASELINE,
  normalizeWorldRouteRows,
  normalizeWorldSpawnRows,
  normalizeWorldStageRows,
  validateWorldContentSuperset,
  worldContentDigest,
} from '../world-content-superset.mjs';

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

function extractLiveZones() {
  const startMarker = 'const ZONES=';
  const start = game.indexOf(startMarker) + startMarker.length;
  const end = game.indexOf('\n};\nconst zoneContentValidation', start) + 2;
  assert.ok(start >= startMarker.length && end > start, 'live ZONES literal is extractable');
  return Function('BALANCE', 'stageLevelRange', `"use strict";return (${game.slice(start, end)});`)({
    grassMeadowRare: { level: 2, chance: .24 },
    grassMeadowBoss: { level: 5 },
  }, stageLevelRange);
}

function inputs(overrides = {}) {
  return {
    zones: extractLiveZones(),
    routes: structuredClone(WARP_ROUTES),
    stages: structuredClone(STAGE_CATALOG),
    speciesMappings: structuredClone(MONSTER_CATALOG),
    ...overrides,
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

assert.equal(WORKBOOK_WORLD_BASELINE.workbookSha256, 'fdda777b1cbb0eeaacb7e02ced3c1c9df1a3af2853bfdf8d1fe902370789e39c');
assert.equal(WORKBOOK_WORLD_BASELINE.sourceCommit, 'd797e102e3305cd35c45cfcad90ffb9616a5599a');
assert.equal(WORKBOOK_WORLD_BASELINE.spawnPlacements.count, 109);
assert.equal(WORKBOOK_WORLD_BASELINE.routes.count, 20);
assert.equal(WORKBOOK_WORLD_BASELINE.implementedStageIds.length, 9);
assert.equal(WORKBOOK_WORLD_BASELINE.stageCatalogIds.length, 16);
assert.equal(WORKBOOK_WORLD_BASELINE.landmarks.length, 9);
assert.equal(worldContentDigest(WORKBOOK_WORLD_BASELINE.landmarks), 'ed13b6688c013d159aeed926a0905dd1b5028fdcc9ac41e2ded83666b8a9436a');
assert.equal(CANONICAL_MAIN_WORLD_ADDITIONS.spawnPlacements.count, 24);
assert.equal(CANONICAL_MAIN_WORLD_ADDITIONS.routes.count, 8);
assert.deepEqual(CANONICAL_MAIN_WORLD_ADDITIONS.implementedStageIds, [
  'haunted-woods', 'shadow-city', 'steel-factory',
]);
assert.equal(CANONICAL_LEVEL_RESOLUTION.resolvedAuditIds.length, 8);
assert.equal(CANONICAL_FINAL_WORLD_ADDITIONS.spawnPlacements.count, 32);
assert.equal(CANONICAL_FINAL_WORLD_ADDITIONS.routes.count, 9);
assert.equal(CANONICAL_FINAL_WORLD_ADDITIONS.stages.count, 4);
assert.equal(WORKBOOK_WORLD_WARNING_SNAPSHOT.length, 9);
assert.equal(WORLD_RESOLUTION_BASELINE.length, 8);
assert.equal(WORLD_WARNING_BASELINE.length, 1);

const currentInput = inputs();
const beforeCurrent = structuredClone(currentInput);
const current = validateWorldContentSuperset(currentInput);
assert.equal(current.ok, true, JSON.stringify(current.issues));
assert.deepEqual(current.issues, []);
assert.equal(current.warnings.length, 1);
assert.deepEqual(current.counts, {
  actualZoneEntries: 19,
  workbookZoneEntries: 12,
  canonicalAddedZoneEntries: 3,
  finalAddedZoneEntries: 4,
  actualSpawnPlacements: 165,
  workbookSpawnPlacements: 109,
  canonicalAddedSpawnPlacements: 24,
  finalAddedSpawnPlacements: 32,
  actualRoutes: 37,
  workbookRoutes: 20,
  canonicalAddedRoutes: 8,
  finalAddedRoutes: 9,
  actualImplementedStages: 16,
  workbookImplementedStages: 9,
  canonicalAddedImplementedStages: 3,
  finalAddedImplementedStages: 4,
  stageCatalogEntries: 16,
  landmarks: 9,
});
assert.deepEqual(currentInput, beforeCurrent, 'validation is presentation/data-only and does not mutate input');
assertDeepFrozen(WORKBOOK_WORLD_BASELINE);
assertDeepFrozen(CANONICAL_MAIN_WORLD_ADDITIONS);
assertDeepFrozen(CANONICAL_LEVEL_RESOLUTION);
assertDeepFrozen(CANONICAL_FINAL_WORLD_ADDITIONS);
assertDeepFrozen(WORKBOOK_WORLD_WARNING_SNAPSHOT);
assertDeepFrozen(WORLD_RESOLUTION_BASELINE);
assertDeepFrozen(WORLD_WARNING_BASELINE);
assertDeepFrozen(current);
assert.equal(current.warnings, WORLD_WARNING_BASELINE, 'known warnings reuse the frozen evidence snapshot');
const invalidRoot = validateWorldContentSuperset(null);
assert.equal(invalidRoot.ok, false);
assert.equal(hasIssue(invalidRoot, 'invalid_zone_catalog'), true);
assert.equal(hasIssue(invalidRoot, 'invalid_route_catalog'), true);
assertDeepFrozen(invalidRoot);
const normalizedSpawns = normalizeWorldSpawnRows(currentInput.zones);
const normalizedRoutes = normalizeWorldRouteRows(currentInput.routes);
const workbookSpawnRows = normalizedSpawns.filter(row => WORKBOOK_WORLD_BASELINE.zoneIds.includes(row[0]));
const canonicalSpawnRows = normalizedSpawns.filter(row => CANONICAL_MAIN_WORLD_ADDITIONS.zoneIds.includes(row[0]));
const finalSpawnRows = normalizedSpawns.filter(row => CANONICAL_FINAL_WORLD_ADDITIONS.zoneIds.includes(row[0]));
const workbookRouteRows = normalizedRoutes.filter(row => WORKBOOK_WORLD_BASELINE.routeIds.includes(row[0]));
const canonicalRouteRows = normalizedRoutes.filter(row => CANONICAL_MAIN_WORLD_ADDITIONS.routeIds.includes(row[0]));
const finalRouteRows = normalizedRoutes.filter(row => CANONICAL_FINAL_WORLD_ADDITIONS.routeIds.includes(row[0]));
assert.equal(worldContentDigest(workbookSpawnRows), 'ffaef02fa95bdcd6d17bf258aa34b1bc9576595c20688908ed617e98a0d7a3ac');
assert.equal(worldContentDigest(canonicalSpawnRows), 'f197115fbacd6d0bba952228b9e0b90ef56107b92f2dcf112fe03d094fd7a2d8');
assert.equal(worldContentDigest(finalSpawnRows), '315af5a853a4ddd04b765828479d71e4b6cd244929be9fed65c5b076e531e656');
assert.equal(worldContentDigest(normalizedSpawns), '749d78dda7fbda36f41ad51ec965f8615889ae45c90fa65e9188a99e198f3c3a');
assert.equal(worldContentDigest(workbookRouteRows), 'cd5b18b1ea4c5a6e48ecd1e04a452514b784ea194fa4a38eeb969b34300bb99b');
assert.equal(worldContentDigest(canonicalRouteRows), 'becea50e803e45ca6e3d39dab5dead86c33313303b3890100b8b2f76512fba96');
assert.equal(worldContentDigest(finalRouteRows), '5a7aa79073481145c44b99469fcdfb50001f64aaa64f0b40c7e5ab36176ed6e4');
assert.equal(worldContentDigest(normalizedRoutes), 'cac2bf0459e7baa62bee4732770dded90e7072afe4eb16babc68b5077bcd31b9');
assert.equal(worldContentDigest(normalizeWorldStageRows(currentInput.zones, currentInput.stages, WORKBOOK_WORLD_BASELINE.implementedStageIds)), '7c16946b377095907fe8bd4d376ed9767c2534757f855a3e22cf7e93e172b2f6');
assert.equal(worldContentDigest(normalizeWorldStageRows(currentInput.zones, currentInput.stages, CANONICAL_MAIN_WORLD_ADDITIONS.implementedStageIds)), '5768654e398c121c45721ae113407a755207007d09736de3bf86501aba95b9e4');
assert.equal(worldContentDigest(normalizeWorldStageRows(currentInput.zones, currentInput.stages, CANONICAL_FINAL_WORLD_ADDITIONS.implementedStageIds)), 'ff5ac7f28d89a8304e9bd4c3141a5ae4a4b622c895ec564b0da3a2f85f9b7f9a');
assertDeepFrozen(normalizedSpawns);
assertDeepFrozen(normalizedRoutes);
assert.equal(current.warnings.some(row => row.code === 'level_range_mismatch'), false);
assert.equal(current.warnings.some(row => row.code === 'fairy_light_deferred'), true);
assert.equal(current.warnings.some(row => row.code === 'poison_dream_level_inversion'), false);
assert.deepEqual(current.warnings.map(row => [row.id, row.auditId, row.severity, row.sourceCell]), [
  ['MAP-A03', 'MAP-A03', 'HIGH', 'Map_Audit!F6'],
]);

const reorderedInput = inputs();
reorderedInput.zones = Object.fromEntries(Object.entries(reorderedInput.zones).reverse().map(([id, zone]) => {
  for (const key of ['spawn', 'rareSpawn', 'eliteSpawn', 'bossSpawn']) zone[key]?.reverse();
  return [id, zone];
}));
reorderedInput.routes.reverse();
reorderedInput.stages.reverse();
reorderedInput.speciesMappings.reverse();
reorderedInput.zones['ember-valley'].eliteSpawn[0][4] = { evolutionPath: 'flame_wolf', elite: true };
assert.equal(validateWorldContentSuperset(reorderedInput).ok, true, 'comparison is order-independent');

const workbookOnly = inputs();
for (const id of ['haunted-woods', 'shadow-city', 'steel-factory']) delete workbookOnly.zones[id];
const extraRouteIds = new Set(CANONICAL_MAIN_WORLD_ADDITIONS.routeIds);
workbookOnly.routes = workbookOnly.routes.filter(route => !extraRouteIds.has(route.id));
const workbookOnlyResult = validateWorldContentSuperset(workbookOnly);
assert.equal(workbookOnlyResult.ok, false, 'rolling back to workbook snapshot is rejected');
assert.equal(hasIssue(workbookOnlyResult, 'missing_canonical_spawn'), true);
assert.equal(hasIssue(workbookOnlyResult, 'missing_canonical_route'), true);
assert.equal(hasIssue(workbookOnlyResult, 'missing_canonical_stage'), true);

const missingWorkbook = inputs();
missingWorkbook.zones['grass-meadow'].spawn.shift();
const missingWorkbookResult = validateWorldContentSuperset(missingWorkbook);
assert.equal(hasIssue(missingWorkbookResult, 'missing_workbook_spawn'), true);
assert.equal(hasIssue(missingWorkbookResult, 'unexpected_spawn'), false, 'pure removal is not mislabeled as an unexpected row');

const countPreservingDuplicate = inputs();
countPreservingDuplicate.zones['grass-meadow'].spawn[0] = structuredClone(countPreservingDuplicate.zones['grass-meadow'].spawn[1]);
const duplicateResult = validateWorldContentSuperset(countPreservingDuplicate);
assert.equal(hasIssue(duplicateResult, 'missing_workbook_spawn'), true);
assert.equal(hasIssue(duplicateResult, 'duplicate_spawn_signature'), true, 'count-only mutant is rejected');

const validSpeciesSwap = inputs();
validSpeciesSwap.zones['grass-meadow'].spawn[0][0] = 'buglet';
assert.equal(hasIssue(validateWorldContentSuperset(validSpeciesSwap), 'missing_workbook_spawn'), true, 'valid same-stage species swap is still exact-data drift');

const shiftedWorkbookSpawn = inputs();
shiftedWorkbookSpawn.zones['grass-meadow'].spawn[0][1] = -10;
assert.equal(hasIssue(validateWorldContentSuperset(shiftedWorkbookSpawn), 'missing_workbook_spawn'), true);

const missingCanonicalSpawn = inputs();
missingCanonicalSpawn.zones['haunted-woods'].spawn.shift();
assert.equal(hasIssue(validateWorldContentSuperset(missingCanonicalSpawn), 'missing_canonical_spawn'), true);

const shiftedCanonicalSpawn = inputs();
shiftedCanonicalSpawn.zones['haunted-woods'].spawn[0][2] = 3;
assert.equal(hasIssue(validateWorldContentSuperset(shiftedCanonicalSpawn), 'missing_canonical_spawn'), true);

const unexpectedSpawn = inputs();
unexpectedSpawn.zones['haunted-woods'].spawn.push(['ghostpurr', 4, 4, 22, {}]);
const unexpectedSpawnResult = validateWorldContentSuperset(unexpectedSpawn);
assert.equal(hasIssue(unexpectedSpawnResult, 'unexpected_spawn'), true, 'unreviewed additions need an explicit canonical policy update');
assert.equal(hasIssue(unexpectedSpawnResult, 'missing_canonical_spawn'), false, 'pure addition is not mislabeled as a missing row');

const oversizedSpawnTuple = inputs();
oversizedSpawnTuple.zones['grass-meadow'].spawn[0].push('untracked-sixth-field');
assert.equal(hasIssue(validateWorldContentSuperset(oversizedSpawnTuple), 'invalid_spawn_record_arity'), true);

const unexpectedSpawnOption = inputs();
unexpectedSpawnOption.zones['grass-meadow'].spawn[0][4].untracked = true;
assert.equal(hasIssue(validateWorldContentSuperset(unexpectedSpawnOption), 'unexpected_spawn_option'), true);

const changedEvolution = inputs();
delete changedEvolution.zones.cave.spawn[16][4].evolutionPath;
assert.equal(hasIssue(validateWorldContentSuperset(changedEvolution), 'missing_workbook_spawn'), true);

const captureBypass = inputs();
captureBypass.zones['ember-valley'].bossSpawn[0][4].capturePolicy = 'normal';
assert.equal(hasIssue(validateWorldContentSuperset(captureBypass), 'capture_policy_mismatch'), true);

const missingWorkbookRoute = inputs();
missingWorkbookRoute.routes = missingWorkbookRoute.routes.filter(route => route.id !== 'hub-to-grass');
assert.equal(hasIssue(validateWorldContentSuperset(missingWorkbookRoute), 'missing_workbook_route'), true);

const shiftedWorkbookRoute = inputs();
shiftedWorkbookRoute.routes.find(route => route.id === 'grass-to-ember').position[0] = 19;
assert.equal(hasIssue(validateWorldContentSuperset(shiftedWorkbookRoute), 'missing_workbook_route'), true);

const missingCanonicalRoute = inputs();
missingCanonicalRoute.routes = missingCanonicalRoute.routes.filter(route => route.id !== 'grassland-to-hub');
assert.equal(hasIssue(validateWorldContentSuperset(missingCanonicalRoute), 'missing_canonical_route'), true);

const shiftedCanonicalRoute = inputs();
shiftedCanonicalRoute.routes.find(route => route.id === 'dream-to-haunted').spawn[0] = -18;
assert.equal(hasIssue(validateWorldContentSuperset(shiftedCanonicalRoute), 'missing_canonical_route'), true);

const unknownDestination = inputs();
unknownDestination.routes.push({
  id: 'rogue-to-missing', from: 'hub', to: 'missing-stage', label: 'Rogue',
  position: [1, 1], spawn: [0, 0, 0], kind: 'forward',
});
assert.equal(hasIssue(validateWorldContentSuperset(unknownDestination), 'unknown_route_destination'), true, 'routes remain constrained to live zones');

const missingWorkbookStage = inputs();
delete missingWorkbookStage.zones['dream-shrine'];
assert.equal(hasIssue(validateWorldContentSuperset(missingWorkbookStage), 'missing_workbook_stage'), true);

const missingCanonicalStage = inputs();
delete missingCanonicalStage.zones['haunted-woods'];
assert.equal(hasIssue(validateWorldContentSuperset(missingCanonicalStage), 'missing_canonical_stage'), true);

const missingFinalStage = inputs();
delete missingFinalStage.zones['dragon-crater'];
assert.equal(hasIssue(validateWorldContentSuperset(missingFinalStage), 'missing_final_stage'), true);

const rogueZone = inputs();
rogueZone.zones['rogue-zone'] = rogueZone.zones['haunted-woods'];
delete rogueZone.zones['rogue-zone'].stageId;
delete rogueZone.zones['haunted-woods'];
assert.equal(hasIssue(validateWorldContentSuperset(rogueZone), 'unexpected_zone'), true);

const changedWorkbookLabel = inputs();
changedWorkbookLabel.zones['ember-valley'].label = 'Tampered';
assert.equal(hasIssue(validateWorldContentSuperset(changedWorkbookLabel), 'workbook_zone_mismatch'), true);

const hostileLegacyLabel = inputs();
hostileLegacyLabel.zones.hub.label = 1n;
assert.doesNotThrow(() => validateWorldContentSuperset(hostileLegacyLabel));
assert.equal(hasIssue(validateWorldContentSuperset(hostileLegacyLabel), 'workbook_zone_mismatch'), true);

const cyclicLegacyLabel = inputs();
const cyclicLabel = {};
cyclicLabel.self = cyclicLabel;
cyclicLegacyLabel.zones.hub.label = cyclicLabel;
assert.doesNotThrow(() => validateWorldContentSuperset(cyclicLegacyLabel));
assert.equal(hasIssue(validateWorldContentSuperset(cyclicLegacyLabel), 'workbook_zone_mismatch'), true);

const changedCanonicalLabel = inputs();
changedCanonicalLabel.zones['haunted-woods'].label = 'Tampered';
assert.equal(hasIssue(validateWorldContentSuperset(changedCanonicalLabel), 'canonical_zone_mismatch'), true);

const changedHubStatus = inputs();
changedHubStatus.zones.hub.sceneStatus = 'danger';
assert.equal(hasIssue(validateWorldContentSuperset(changedHubStatus), 'workbook_zone_mismatch'), true);

const badStageCatalog = inputs();
badStageCatalog.stages.find(stage => stage.id === 'grass-meadow').recommendedLevel.max = 6;
assert.equal(hasIssue(validateWorldContentSuperset(badStageCatalog), 'stage_catalog_mismatch'), true);

for (const invalidStage of [null, {}, { id: 123 }]) {
  const malformedStages = inputs();
  malformedStages.stages.push(invalidStage);
  const malformedResult = validateWorldContentSuperset(malformedStages);
  assert.equal(malformedResult.ok, false);
  assert.equal(hasIssue(malformedResult, 'invalid_stage_catalog_entry'), true);
}

const hostileStageType = inputs();
hostileStageType.stages[0].primaryTypes = [1n];
assert.doesNotThrow(() => validateWorldContentSuperset(hostileStageType));
assert.equal(hasIssue(validateWorldContentSuperset(hostileStageType), 'stage_catalog_mismatch'), true);

const spoofedStageType = inputs();
spoofedStageType.stages[0].primaryTypes = [{ toJSON() { return 'Grass'; } }];
assert.equal(validateWorldContentSuperset(spoofedStageType).ok, false);

const badMapping = inputs();
const fairimp = badMapping.speciesMappings.find(mapping => mapping.runtimeSpeciesId === 'fairimp');
fairimp.runtimeType = 'LIGHT';
assert.equal(hasIssue(validateWorldContentSuperset(badMapping), 'light_runtime_type_forbidden'), true);

const staleMappingProvenance = inputs();
staleMappingProvenance.speciesMappings[0].sourceWorkbookVersion = 'tampered';
assert.equal(hasIssue(validateWorldContentSuperset(staleMappingProvenance), 'species_mapping_mismatch'), true);

const spoofedMappingName = inputs();
spoofedMappingName.speciesMappings[0].runtimeName = { toJSON() { return 'Plain Slime'; } };
assert.equal(hasIssue(validateWorldContentSuperset(spoofedMappingName), 'species_mapping_mismatch'), true);

const cyclicMappingName = inputs();
const cycle = {};
cycle.self = cycle;
cyclicMappingName.speciesMappings[0].runtimeName = cycle;
assert.doesNotThrow(() => validateWorldContentSuperset(cyclicMappingName));
assert.equal(hasIssue(validateWorldContentSuperset(cyclicMappingName), 'species_mapping_mismatch'), true);

const symbolicMappingId = inputs();
symbolicMappingId.speciesMappings[0].workbookBaseMonsterId = Symbol('hostile');
assert.doesNotThrow(() => validateWorldContentSuperset(symbolicMappingId));
assert.equal(hasIssue(validateWorldContentSuperset(symbolicMappingId), 'invalid_species_mapping'), true);

const danglingMapping = inputs();
danglingMapping.speciesMappings = danglingMapping.speciesMappings.filter(mapping => mapping.runtimeSpeciesId !== 'mossbun');
assert.equal(hasIssue(validateWorldContentSuperset(danglingMapping), 'missing_spawn_species_mapping'), true);

const warningRewrite = inputs();
warningRewrite.zones['ember-valley'].recommendedLevel.max = 8;
const warningRewriteResult = validateWorldContentSuperset(warningRewrite);
assert.equal(hasIssue(warningRewriteResult, 'stage_level_range_mismatch'), true, 'resolved level mismatch cannot regress');
assertDeepFrozen(warningRewriteResult);
const inversionRewrite = inputs();
inversionRewrite.zones['dream-shrine'].recommendedLevel.min = 39;
assert.equal(hasIssue(validateWorldContentSuperset(inversionRewrite), 'stage_level_range_mismatch'), true);

assert.throws(() => { WORLD_WARNING_BASELINE[0].runtimeLevel = 'mutated'; }, TypeError);
assert.throws(() => { WORKBOOK_WORLD_BASELINE.sourceRanges.audit = 'mutated'; }, TypeError);
assert.equal(WORLD_WARNING_BASELINE[0].id, 'MAP-A03');
assert.equal(WORKBOOK_WORLD_BASELINE.sourceRanges.audit, 'Map_Audit!A1:F24');

for (const pattern of [
  /const ranchCenter=new THREE\.Vector3\(7,0,3\)/,
  /const breedingPad=makePad\(5\.2,8\.2,1\.6/,
  /incubator\.position\.set\(5\.2,0,8\.2\)/,
  /player\.position\.set\(0,0,5\)/,
  /npc\.position\.set\(4,0,3\)/,
  /merchantNpc\.position\.set\(9,0,3\)/,
  /trainerNpc\.position\.set\(1,0,10\)/,
  /evolutionNpc\.position\.set\(-6,0,8\)/,
  /breedingNpc\.position\.set\(7,0,10\)/,
]) assert.match(game, pattern, 'all nine workbook hub landmark positions remain present');

console.log('V8.1 A38 workbook world superset validation: PASS');
