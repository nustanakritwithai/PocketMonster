import assert from 'node:assert/strict';
import fs from 'node:fs';

const sources = Object.freeze({
  evolution: ['evolution.mjs', fs.readFileSync(new URL('../evolution.mjs', import.meta.url), 'utf8')],
  game: ['game-v800.js', fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8')],
  controller: ['character-ui-controller.mjs', fs.readFileSync(new URL('../character-ui-controller.mjs', import.meta.url), 'utf8')],
});

async function loadModule(source, filename, label) {
  const fileUrl = new URL(`../${filename}`, import.meta.url);
  const absolute = source.replaceAll(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL(path, fileUrl).href}'`);
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64')}`);
}

function definition(speciesId = 'flameling') {
  return {
    id: `${speciesId}_lv2`, fromFormId: speciesId, toFormId: `${speciesId}_lv2`,
    requirements: { required: [{ field: 'level', op: 'gte', value: 2 }] },
    profile: { hp: 1.1, atk: 1.1, def: 1.1, spd: 1.1 },
  };
}

function instance(overrides = {}) {
  return {
    instanceId: 'mut-evo', speciesId: 'flameling', formId: 'flameling', canonicalFormId: 'MON_002',
    level: 15, bond: 50, mind: { bond: 50 }, potential: { hp: 15, atk: 15, def: 15, spAtk: 15, spDef: 15, spd: 15 },
    statTraining: { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 },
    skills: [], equipment: {}, evolutionHistory: [], lifeHistory: [], parents: { a: null, b: null }, generation: 1,
    genes: { hp: 'B', atk: 'B', def: 'B', spd: 'B' },
    ...overrides,
  };
}

function assertEvolution(module) {
  const path = module.workbookEvolutionPathForSpecies('flameling');
  assert.equal(path.activation, 'runtime_live');
  assert.equal(path.runtimeEvolutionDecision, 'M6_CANONICAL_STAGE2_LIVE');
  assert.equal(path.requiredLevelReference, 15);
  assert.equal(path.requiredBondReference, 50);
  assert.equal(module.validateWorkbookEvolutionCatalog(module.WORKBOOK_EVOLUTION_PATHS).ok, true);
  const ready = instance();
  const preview = module.previewWorkbookEvolution(ready);
  assert.equal(preview.canCommit, true);
  assert.equal(preview.readOnly, false);
  assert.equal(preview.sourceStats.hp, 41);
  assert.equal(preview.targetStats.hp, 53);
  assert.equal(preview.statDelta.hp, 12);
  const migratedStage2 = module.previewWorkbookEvolution(instance({ canonicalFormId: 'MON_020' }));
  assert.equal(migratedStage2.alreadyCommitted, true);
  assert.equal(migratedStage2.canCommit, false);
  const beforePotential = structuredClone(ready.potential);
  const committed = module.commitEvolution(ready, definition(), { now: 2000 });
  assert.equal(committed.ok, true);
  assert.equal(ready.canonicalFormId, 'MON_020');
  assert.equal(committed.canonicalFromFormId, 'MON_002');
  assert.equal(committed.canonicalToFormId, 'MON_020');
  assert.deepEqual(committed.canonicalStats, preview.targetStats);
  assert.deepEqual(ready.potential, beforePotential);
  assert.equal(ready.evolutionHistory[0].toWorkbookMonsterId, 'MON_020');
  assert.equal(module.resolveWorkbookEvolutionStage(ready).stageEvidence, 'canonical_evolution_history');
  const blocked = instance({ level: 2, bond: 0, mind: { bond: 0 } });
  const blockedBefore = structuredClone(blocked);
  assert.equal(module.commitEvolution(blocked, definition(), { now: 2000 }).reason, 'workbook_requirements_not_met');
  assert.deepEqual(blocked, blockedBefore);
  const repeatedBefore = structuredClone(ready);
  assert.equal(module.commitEvolution(ready, definition(), { now: 3000 }).reason, 'already_committed');
  assert.deepEqual(ready, repeatedBefore);
}

function assertGame(source) {
  const evolve = source.match(/function evolveMonster\([\s\S]*?\n\}/)?.[0] ?? '';
  const requirement = source.match(/function evoRequirementStatus\([\s\S]*?\n\}/)?.[0] ?? '';
  const preview = source.match(/function renderFocusedEvolutionBuildPreview\([\s\S]*?\n\}/)?.[0] ?? '';
  const display = source.match(/function displayName\(inst\)\{[^\n]+/)?.[0] ?? '';
  assert.match(requirement, /previewWorkbookEvolution\(inst\)/);
  assert.match(requirement, /requiredLevelReference/);
  assert.match(requirement, /requiredBondReference/);
  assert.match(evolve, /refreshStats\(inst,false\)/);
  assert.doesNotMatch(evolve, /refreshStats\(inst,true\)/);
  assert.match(preview, /workbook\.sourceStats\[stat\]/);
  assert.match(preview, /workbook\.targetStats\[stat\]/);
  assert.match(display, /canonical\?\.stage===2\?canonical\.nameTH/);
}

function assertController(source) {
  assert.match(source, /readOnly: preview\.readOnly/);
  assert.match(source, /canCommit: preview\.canCommit/);
  assert.match(source, /targetStats: preview\.targetStats/);
}

assertEvolution(await loadModule(sources.evolution[1], sources.evolution[0], 'canonical-evolution-current'));
assertGame(sources.game[1]);
assertController(sources.controller[1]);

const mutations = [
  ['evolution', 'deactivate runtime', "activation: 'runtime_live'", "activation: 'preview_only'", assertEvolution],
  ['evolution', 'restore old decision', "runtimeEvolutionDecision: 'M6_CANONICAL_STAGE2_LIVE'", "runtimeEvolutionDecision: 'D4_LIVE_LV2_UNCHANGED'", assertEvolution],
  ['evolution', 'weaken level gate', 'requiredLevelReference: sourceForm.evolution.requiredLevel', 'requiredLevelReference: 2', assertEvolution],
  ['evolution', 'remove bond gate', 'requiredBondReference: sourceForm.evolution.requiredBond', 'requiredBondReference: 0', assertEvolution],
  ['evolution', 'ignore canonical already-commit', '|| canonicalFormId === path.toWorkbookMonsterId', '|| false', assertEvolution],
  ['evolution', 'preview cannot commit', 'canCommit: sourceEligible && !alreadyCommitted && canonicalFormId === path.fromWorkbookMonsterId', 'canCommit: false', assertEvolution],
  ['evolution', 'preview remains read-only', 'readOnly: false', 'readOnly: true', assertEvolution],
  ['evolution', 'source uses target form', 'formId: path.fromWorkbookMonsterId,', 'formId: path.toWorkbookMonsterId,', assertEvolution],
  ['evolution', 'target uses source form', 'formId: path.toWorkbookMonsterId,', 'formId: path.fromWorkbookMonsterId,', assertEvolution],
  ['evolution', 'reverse stat delta', 'targetStats.stats[stat] - sourceStats.stats[stat]', 'sourceStats.stats[stat] - targetStats.stats[stat]', assertEvolution],
  ['evolution', 'bypass canonical transition', 'const isWorkbookStageTransition = workbookPath', 'const isWorkbookStageTransition = false && workbookPath', assertEvolution],
  ['evolution', 'bypass Workbook eligibility', 'if (!workbookPreview.canCommit) {', 'if (false) {', assertEvolution],
  ['evolution', 'retain Stage-1 canonical ID', 'instance.canonicalFormId = workbookPath.toWorkbookMonsterId', 'instance.canonicalFormId = workbookPath.fromWorkbookMonsterId', assertEvolution],
  ['evolution', 'drop canonical history target', 'historyEntry.toWorkbookMonsterId = workbookPath.toWorkbookMonsterId', 'historyEntry.toWorkbookMonsterId = null', assertEvolution],
  ['evolution', 'report wrong canonical target', 'canonicalToFormId: workbookPreview?.path.toWorkbookMonsterId ?? null', 'canonicalToFormId: workbookPreview?.path.fromWorkbookMonsterId ?? null', assertEvolution],
  ['game', 'heal on evolution', 'refreshStats(inst,false);msg(`${sp.name} Evolution', 'refreshStats(inst,true);msg(`${sp.name} Evolution', assertGame],
  ['game', 'drop Workbook requirement resolver', 'path.fromFormId===sp.id?previewWorkbookEvolution(inst):null', 'null', assertGame],
  ['game', 'preview target from current stat', 'workbook?.ok?workbook.targetStats[stat]', 'workbook?.ok?current', assertGame],
  ['game', 'drop canonical Stage-2 name', "canonical?.stage===2?canonical.nameTH", 'false', assertGame],
  ['controller', 'force preview read-only', 'readOnly: preview.readOnly', 'readOnly: true', assertController],
  ['controller', 'hide commit capability', 'canCommit: preview.canCommit', 'canCommit: false', assertController],
];

let killed = 0;
for (const [sourceKey, name, from, to, contract] of mutations) {
  const [filename, source] = sources[sourceKey];
  const mutant = source.replace(from, to);
  assert.notEqual(mutant, source, `${name} mutation must apply`);
  try {
    const target = sourceKey === 'evolution'
      ? await loadModule(mutant, filename, `canonical-evolution-mutant-${name}`)
      : mutant;
    contract(target);
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

assert.equal(killed, mutations.length);
console.log(`V8.3 canonical evolution mutants: PASS (${killed}/${mutations.length} killed)`);
