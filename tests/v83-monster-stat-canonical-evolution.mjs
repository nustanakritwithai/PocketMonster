import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  WORKBOOK_EVOLUTION_PATHS,
  commitEvolution,
  previewWorkbookEvolution,
  resolveWorkbookEvolutionStage,
  validateWorkbookEvolutionCatalog,
  workbookEvolutionPathForSpecies,
} from '../evolution.mjs';
import { evoDefFromPath, refreshCanonicalOwnedStats } from '../live-progression.mjs';
import { MONSTER_CATALOG } from '../monster-catalog.mjs';
import { normalizeInstance, sanitizeMonsterInstanceForPersistence } from '../monster-instance.mjs';
import { calculateMonsterStats } from '../monster-stat-formula.mjs';

const POTENTIAL = Object.freeze({ hp: 17, atk: 16, def: 15, spAtk: 14, spDef: 13, spd: 12 });
const TRAINING = Object.freeze({ hp: 20, atk: 40, def: 60, spAtk: 80, spDef: 100, spd: 120 });

assert.equal(validateWorkbookEvolutionCatalog(WORKBOOK_EVOLUTION_PATHS).ok, true);
assert.equal(WORKBOOK_EVOLUTION_PATHS.length, 18);
assert.ok(WORKBOOK_EVOLUTION_PATHS.every(path => path.activation === 'runtime_live'));
assert.ok(WORKBOOK_EVOLUTION_PATHS.every(path => path.runtimeEvolutionDecision === 'M6_CANONICAL_STAGE2_LIVE'));
assert.ok(WORKBOOK_EVOLUTION_PATHS.every(path => path.requiredLevelReference === 15 && path.requiredBondReference === 50));

function liveDefinition(mapping) {
  return evoDefFromPath({
    id: `${mapping.runtimeSpeciesId}_lv2`,
    fromFormId: mapping.runtimeSpeciesId,
    toFormId: `${mapping.runtimeSpeciesId}_lv2`,
    statMods: { hp: 1.1, atk: 1.1, def: 1.1, spd: 1.1 },
    // Intentionally relaxed: the canonical transaction must still enforce the Workbook gate.
    requires: { level: 2 },
  }, mapping.runtimeSpeciesId);
}

let committedFamilies = 0;
for (const mapping of MONSTER_CATALOG) {
  const path = workbookEvolutionPathForSpecies(mapping.runtimeSpeciesId);
  const instance = normalizeInstance({
    instanceId: `evo-${mapping.runtimeSpeciesId}`,
    speciesId: mapping.runtimeSpeciesId,
    formId: mapping.runtimeSpeciesId,
    level: 15,
    potential: POTENTIAL,
    statTraining: TRAINING,
    mind: { bond: 50 },
    parents: { a: 'parent-a', b: 'parent-b' },
    generation: 3,
    genes: { hp: 'A', atk: 'B', def: 'C', spd: 'S' },
  }, { now: 1000 });
  instance._condition = 'normal';

  const previewBefore = structuredClone(instance);
  const preview = previewWorkbookEvolution(instance);
  assert.equal(preview.ok, true, mapping.runtimeSpeciesId);
  assert.equal(preview.canCommit, true, mapping.runtimeSpeciesId);
  assert.equal(preview.canonicalFormId, mapping.workbookBaseMonsterId);
  assert.deepEqual(preview.sourceStats, calculateMonsterStats({
    formId: mapping.workbookBaseMonsterId, level: 15, potential: POTENTIAL, training: TRAINING,
  }).stats);
  assert.deepEqual(preview.targetStats, calculateMonsterStats({
    formId: mapping.workbookStage2MonsterId, level: 15, potential: POTENTIAL, training: TRAINING,
  }).stats);
  for (const stat of ['hp', 'atk', 'def', 'spAtk', 'spDef', 'spd']) {
    assert.equal(preview.statDelta[stat], preview.targetStats[stat] - preview.sourceStats[stat]);
  }
  assert.deepEqual(instance, previewBefore, 'preview is pure');

  refreshCanonicalOwnedStats(instance, null, { heal: true });
  instance.hp = Math.max(1, Math.round(instance.maxHp * 0.4));
  const hpRatioBefore = instance.hp / instance.maxHp;
  const identityBefore = {
    instanceId: instance.instanceId,
    parents: structuredClone(instance.parents),
    generation: instance.generation,
    genes: structuredClone(instance.genes),
    potential: structuredClone(instance.potential),
    statTraining: structuredClone(instance.statTraining),
  };
  const committed = commitEvolution(instance, liveDefinition(mapping), { now: 2000 });
  assert.equal(committed.ok, true, `${mapping.runtimeSpeciesId}: ${committed.reason}`);
  assert.equal(committed.canonicalFromFormId, mapping.workbookBaseMonsterId);
  assert.equal(committed.canonicalToFormId, mapping.workbookStage2MonsterId);
  assert.deepEqual(committed.canonicalStats, preview.targetStats);
  assert.equal(instance.canonicalFormId, mapping.workbookStage2MonsterId);
  assert.deepEqual({
    instanceId: instance.instanceId,
    parents: instance.parents,
    generation: instance.generation,
    genes: instance.genes,
    potential: instance.potential,
    statTraining: instance.statTraining,
  }, identityBefore, 'evolution preserves identity, Potential, and Training');
  assert.deepEqual(instance.evolutionHistory.at(-1), {
    from: mapping.runtimeSpeciesId,
    to: `${mapping.runtimeSpeciesId}_lv2`,
    evolutionId: `${mapping.runtimeSpeciesId}_lv2`,
    at: 2000,
    workbookEvolutionId: path.id,
    fromWorkbookMonsterId: mapping.workbookBaseMonsterId,
    toWorkbookMonsterId: mapping.workbookStage2MonsterId,
  });
  const refreshed = refreshCanonicalOwnedStats(instance);
  assert.equal(refreshed.ok, true);
  assert.deepEqual(refreshed.formula.stats, preview.targetStats);
  assert.ok(Math.abs((instance.hp / instance.maxHp) - hpRatioBefore) <= 1 / instance.maxHp, 'HP ratio is preserved after Stage-2 refresh');
  assert.equal(resolveWorkbookEvolutionStage(instance).stageEvidence, 'canonical_evolution_history');
  assert.equal(sanitizeMonsterInstanceForPersistence(instance).canonicalFormId, mapping.workbookStage2MonsterId);

  const afterFirst = structuredClone(instance);
  const repeated = commitEvolution(instance, liveDefinition(mapping), { now: 3000 });
  assert.equal(repeated.ok, false);
  assert.equal(repeated.reason, 'already_committed');
  assert.deepEqual(instance, afterFirst, 'repeat confirm is idempotent');
  committedFamilies += 1;
}
assert.equal(committedFamilies, 18);

for (const [label, level, bond] of [['under-level', 14, 50], ['under-bond', 15, 49]]) {
  const blocked = normalizeInstance({
    instanceId: label, speciesId: 'flameling', formId: 'flameling', level, mind: { bond },
  }, { now: 1000 });
  const before = structuredClone(blocked);
  const result = commitEvolution(blocked, liveDefinition(MONSTER_CATALOG.find(row => row.runtimeSpeciesId === 'flameling')), { now: 2000 });
  assert.equal(result.reason, 'workbook_requirements_not_met');
  assert.deepEqual(blocked, before, `${label} failure is atomic`);
}

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const evolveMonster = game.match(/function evolveMonster\([\s\S]*?\n\}/)?.[0] ?? '';
const requirementStatus = game.match(/function evoRequirementStatus\([\s\S]*?\n\}/)?.[0] ?? '';
const evolutionPreview = game.match(/function renderFocusedEvolutionBuildPreview\([\s\S]*?\n\}/)?.[0] ?? '';
assert.match(game, /previewWorkbookEvolution/);
assert.match(requirementStatus, /requiredLevelReference/);
assert.match(requirementStatus, /requiredBondReference/);
assert.match(evolveMonster, /refreshStats\(inst,false\)/, 'live commit preserves current HP ratio');
assert.doesNotMatch(evolveMonster, /refreshStats\(inst,true\)/);
assert.match(evolutionPreview, /workbook\.sourceStats\[stat\]/);
assert.match(evolutionPreview, /workbook\.targetStats\[stat\]/);
assert.match(game, /canonical\?\.stage===2\?canonical\.nameTH/);

console.log('V8.3 canonical 18-family evolution runtime: PASS');
