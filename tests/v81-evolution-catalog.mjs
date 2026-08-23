import assert from 'node:assert/strict';
import { getFocusedEvolutionCatalogPresentation } from '../character-ui-controller.mjs';
import {
  WORKBOOK_EVOLUTION_PATHS,
  commitEvolution,
  previewEvolution,
  previewWorkbookEvolution,
  validateWorkbookEvolutionCatalog,
  workbookEvolutionPathForSpecies,
} from '../evolution.mjs';
import { normalizeInstance } from '../monster-instance.mjs';

const catalogValidation = validateWorkbookEvolutionCatalog(WORKBOOK_EVOLUTION_PATHS);
assert.equal(catalogValidation.ok, true, JSON.stringify(catalogValidation.issues));
assert.equal(WORKBOOK_EVOLUTION_PATHS.length, 18);
assert.equal(Object.isFrozen(WORKBOOK_EVOLUTION_PATHS), true);
assert.ok(WORKBOOK_EVOLUTION_PATHS.every(Object.isFrozen));

const flamePath = workbookEvolutionPathForSpecies('flameling');
assert.deepEqual(
  {
    from: flamePath.fromWorkbookMonsterId,
    to: flamePath.toWorkbookMonsterId,
    name: flamePath.toNameTH,
    skill: flamePath.unlockSkillId,
    sourceBST: flamePath.sourceBST,
    targetBST: flamePath.targetBST,
    gain: flamePath.bstGain,
  },
  { from: 'MON_002', to: 'MON_020', name: 'จิ้งจอกเพลิง', skill: 'SK_FIRE_06', sourceBST: 256, targetBST: 464, gain: 208 },
);
assert.equal(workbookEvolutionPathForSpecies('fairimp').unlockSkillId, 'SK_LIGHT_06');
assert.equal(workbookEvolutionPathForSpecies('fairimp').runtimeEvolutionDecision, 'M6_CANONICAL_STAGE2_LIVE');

const duplicate = structuredClone(WORKBOOK_EVOLUTION_PATHS);
duplicate[1].id = duplicate[0].id;
assert.ok(validateWorkbookEvolutionCatalog(duplicate).issues.some(issue => issue.code === 'duplicate_path_id'));
const badMapping = structuredClone(WORKBOOK_EVOLUTION_PATHS);
badMapping[0].toWorkbookMonsterId = 'MON_999';
assert.ok(validateWorkbookEvolutionCatalog(badMapping).issues.some(issue => issue.code === 'mapping_mismatch'));
const badSkill = structuredClone(WORKBOOK_EVOLUTION_PATHS);
badSkill[0].unlockSkillId = 'SK_FIRE_01';
assert.ok(validateWorkbookEvolutionCatalog(badSkill).issues.some(issue => issue.code === 'invalid_unlock_skill'));
const deactivated = structuredClone(WORKBOOK_EVOLUTION_PATHS);
deactivated[0].activation = 'preview_only';
assert.ok(validateWorkbookEvolutionCatalog(deactivated).issues.some(issue => issue.code === 'runtime_activation_mismatch'));

const source = normalizeInstance({
  instanceId: 'preview', speciesId: 'flameling', formId: 'flameling', level: 15,
  mind: { bond: 50 }, skills: [{ skillId: 'SK_FIRE_01', masteryExp: 10 }],
}, { now: 1000 });
const before = structuredClone(source);
const workbookPreview = previewWorkbookEvolution(source);
assert.equal(workbookPreview.ok, true);
assert.equal(workbookPreview.sourceEligible, true);
assert.equal(workbookPreview.canCommit, true, 'Workbook Lv.15 + Bond 50 path can commit');
assert.equal(workbookPreview.readOnly, false);
assert.equal(workbookPreview.unlockSkill.id, 'SK_FIRE_06');
assert.deepEqual(source, before, 'Workbook preview never mutates the instance');

const presentation = getFocusedEvolutionCatalogPresentation({
  focusedMonsterId: source.instanceId,
  getInst: id => id === source.instanceId ? source : null,
  resolveEvolutionPreview: previewWorkbookEvolution,
});
assert.equal(presentation.toWorkbookMonsterId, 'MON_020');
assert.equal(presentation.canCommit, true);
assert.equal(presentation.readOnly, false);
assert.equal(Object.isFrozen(presentation), true);
assert.deepEqual(source, before, 'UI presentation is read-only');
assert.equal(previewWorkbookEvolution({ speciesId: 'missing' }).reason, 'unknown_id');

const runtime = normalizeInstance({ instanceId: 'runtime', speciesId: 'flameling', formId: 'flameling', level: 15, mind: { bond: 50 } }, { now: 1000 });
const runtimeDef = {
  id: 'flameling_lv2', fromFormId: 'flameling', toFormId: 'flameling_lv2',
  requirements: { required: [{ field: 'level', op: 'gte', value: 2 }] },
  profile: { hp: 1.05, atk: 1.05, def: 1.05, spd: 1.05 },
};
const runtimeBefore = structuredClone(runtime);
assert.equal(previewEvolution(runtime, null).reason, 'invalid_evolution_path');
assert.deepEqual(runtime, runtimeBefore, 'invalid path preview is read-only');
assert.equal(commitEvolution(runtime, { id: 'bad', fromFormId: 'flameling' }).reason, 'invalid_evolution_path');
assert.deepEqual(runtime, runtimeBefore, 'invalid path cannot partially commit');

const firstCommit = commitEvolution(runtime, runtimeDef, { now: 2000 });
assert.equal(firstCommit.ok, true, 'Workbook-qualified runtime path commits');
assert.equal(runtime.canonicalFormId, 'MON_020');
assert.equal(firstCommit.canonicalFromFormId, 'MON_002');
assert.equal(firstCommit.canonicalToFormId, 'MON_020');
const afterFirst = structuredClone(runtime);
const repeated = commitEvolution(runtime, runtimeDef, { now: 3000 });
assert.equal(repeated.ok, false);
assert.equal(repeated.reason, 'already_committed');
assert.deepEqual(runtime, afterFirst, 'repeated confirm cannot mutate twice');
assert.equal(runtime.evolutionHistory.length, 1);

console.log('V8.1 evolution catalog and preview adapter: PASS');
