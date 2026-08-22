import assert from 'node:assert/strict';
import { MONSTER_CATALOG } from '../monster-catalog.mjs';
import { normalizeInstance } from '../monster-instance.mjs';
import {
  learnSkill,
  listStage2SkillCandidates,
  resolveStage2Learnset,
} from '../skill-progression.mjs';
import {
  resolveWorkbookEvolutionStage,
  workbookEvolutionPathForSpecies,
} from '../evolution.mjs';

const base = normalizeInstance({
  instanceId: 'base', speciesId: 'flameling', formId: 'flameling', level: 30,
  secondaryType: 'Dragon', skills: [],
}, { now: 1000 });
const baseResult = resolveStage2Learnset(base);
assert.equal(baseResult.ok, true);
assert.equal(baseResult.stage2, false);
assert.deepEqual(baseResult.candidates, [], 'level and secondary type cannot bypass the evolution/form gate');
assert.equal(baseResult.entries.find(entry => entry.skillId === 'SK_FIRE_06').reason, 'evolution_required');

const displayNameSpoof = normalizeInstance({
  instanceId: 'spoof', speciesId: 'flameling', formId: 'จิ้งจอกเพลิง', level: 30, skills: [],
}, { now: 1000 });
assert.equal(resolveWorkbookEvolutionStage(displayNameSpoof).stage2, false, 'display names are never evolution identity');
assert.deepEqual(listStage2SkillCandidates(displayNameSpoof), []);

const liveStage2 = normalizeInstance({
  instanceId: 'live-stage2',
  speciesId: 'flameling',
  formId: 'flame_wolf',
  level: 2,
  secondaryType: 'Dragon',
  evolutionHistory: [{ from: 'flameling', to: 'flame_wolf', evolutionId: 'flameling_lv2', at: 2000 }],
  skills: [{ skillId: 'SK_FIRE_01', slot: 's1', masteryExp: 0 }],
}, { now: 1000 });
const liveBefore = structuredClone(liveStage2);
const liveResult = resolveStage2Learnset(liveStage2);
assert.equal(liveResult.stage2, true);
assert.equal(liveResult.stageEvidence, 'live_evolution_history');
assert.equal(liveResult.entries.find(entry => entry.skillId === 'SK_FIRE_06').eligible, true, 'locked live Lv2 evolution unlocks the evolution candidate without replacing it with Lv15');
assert.equal(liveResult.entries.find(entry => entry.skillId === 'SK_FIRE_06').referenceLearnLevel, 15);
assert.ok(liveResult.candidates.includes('SK_FIRE_06'));
assert.equal(liveResult.candidates.includes('SK_FIRE_01'), false, 'already learned native skill is excluded');
assert.equal(liveResult.candidates.includes('SK_DRAGON_01'), false, 'SecondaryLevel remains unavailable in this Stage2 native/evolution slice');
assert.deepEqual(liveStage2, liveBefore, 'Stage2 eligibility is read-only');

learnSkill(liveStage2, { skillId: 'SK_FIRE_06', slot: null });
assert.equal(listStage2SkillCandidates(liveStage2).includes('SK_FIRE_06'), false, 'known evolution skill is never duplicated');

const workbookCapturedStage2 = normalizeInstance({
  instanceId: 'captured-stage2', speciesId: 'mossbun', formId: 'MON_022', level: 20,
  skills: [],
}, { now: 1000 });
const capturedResult = resolveStage2Learnset(workbookCapturedStage2);
assert.equal(capturedResult.stage2, true);
assert.equal(capturedResult.stageEvidence, 'workbook_stage2_form');
assert.ok(capturedResult.candidates.includes('SK_GRASS_06'));
assert.ok(capturedResult.candidates.includes('SK_GRASS_05'));
assert.ok(capturedResult.entries.some(entry => entry.entry.state !== 'Active' && entry.reason === 'deferred'));
assert.ok(capturedResult.entries.some(entry => entry.method === 'Tutor' && entry.reason === 'unavailable_by_system'));

const evolvedFlameAt30 = normalizeInstance({
  instanceId: 'deferred-manual', speciesId: 'flameling', formId: 'MON_020', level: 30,
  secondaryType: 'Fighting', skills: [],
}, { now: 1000 });
const deferredManual = resolveStage2Learnset(evolvedFlameAt30).entries
  .find(entry => entry.method === 'RareManual');
assert.equal(deferredManual.reason, 'deferred');
assert.equal(deferredManual.obtainable, false, 'Deferred rows never become obtainable from level/type alone');

for (const mapping of MONSTER_CATALOG) {
  const path = workbookEvolutionPathForSpecies(mapping.runtimeSpeciesId);
  const instance = normalizeInstance({
    instanceId: `stage2-${mapping.runtimeSpeciesId}`,
    speciesId: mapping.runtimeSpeciesId,
    formId: mapping.workbookStage2MonsterId,
    level: 15,
    skills: [],
  }, { now: 1000 });
  const result = resolveStage2Learnset(instance);
  assert.equal(result.ok, true, mapping.runtimeSpeciesId);
  assert.equal(result.stage2, true, mapping.runtimeSpeciesId);
  assert.ok(result.candidates.includes(path.unlockSkillId), `${mapping.runtimeSpeciesId} exposes its evolution skill`);
  assert.equal(result.autoGrant, false);
}

const unknown = resolveStage2Learnset({ speciesId: 'unknown', level: 50, skills: [] });
assert.equal(unknown.ok, false);
assert.equal(unknown.reason, 'unknown_id');

console.log('V8.1 Stage-2/evolution learnset eligibility: PASS');
