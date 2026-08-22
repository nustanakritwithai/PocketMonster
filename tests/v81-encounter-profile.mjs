import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CAPTURE_POLICIES,
  ENCOUNTER_VARIANTS,
  encounterVariantFromFlags,
  resolveEncounterProfile,
} from '../stage-catalog.mjs';

assert.deepEqual(ENCOUNTER_VARIANTS, ['normal','rare','elite','boss']);
assert.deepEqual(CAPTURE_POLICIES, ['normal','elite','disabled']);
assert.equal(encounterVariantFromFlags({rare:true}), 'rare');
assert.equal(encounterVariantFromFlags({elite:true,rare:true}), 'elite', 'elite policy wins over cosmetic rarity');
assert.equal(encounterVariantFromFlags({boss:true,elite:true}), 'boss', 'boss policy has highest precedence');

const normal=resolveEncounterProfile({stageId:'grass-meadow',runtimeSpeciesId:'mossbun',variant:'normal',level:1});
assert.equal(normal.ok,true);
assert.equal(normal.capturePolicy,'normal');
assert.equal(normal.workbookMonsterId,'MON_004');
assert.equal(normal.runtimeType,'Grass');

const rare=resolveEncounterProfile({stageId:'grass-meadow',runtimeSpeciesId:'mossbun',variant:'rare',level:2});
assert.equal(rare.ok,true);
assert.equal(rare.capturePolicy,'normal','rare remains normally capturable');

const elite=resolveEncounterProfile({stageId:'grass-meadow',runtimeSpeciesId:'mossbun',variant:'elite',level:3});
assert.equal(elite.ok,true);
assert.equal(elite.capturePolicy,'elite','elite capture remains catalog/config driven');

const boss=resolveEncounterProfile({stageId:'grass-meadow',runtimeSpeciesId:'mossbun',variant:'boss',level:5});
assert.equal(boss.ok,true);
assert.equal(boss.capturePolicy,'disabled','boss capture stays disabled');
assert.equal(Object.isFrozen(boss),true);
assert.equal(Object.isFrozen(boss.issues),true);

const activeStageSpecies=[
  ['ember-valley','flameling'],['misty-lake','aquapuff'],['storm-field','voltkit'],
  ['frozen-pass','frostowl'],['rocky-canyon','rockhorn'],['sky-ruins','galebird'],
  ['poison-marsh','toxitoad'],['dream-shrine','mindcoon'],['haunted-woods','ghostpurr'],
  ['shadow-city','voidhorn'],['steel-factory','ironbug'],
];
for(const [stageId,runtimeSpeciesId] of activeStageSpecies){
  assert.equal(resolveEncounterProfile({stageId,runtimeSpeciesId,variant:'normal',level:1}).ok,true,`${stageId} resolves ${runtimeSpeciesId}`);
}

const fairy=resolveEncounterProfile({stageId:'fairy-garden',runtimeSpeciesId:'fairimp',variant:'normal',level:32});
assert.equal(fairy.ok,true);
assert.equal(fairy.runtimeType,'Fairy','LIGHT workbook source remains canonical Fairy at runtime');

assert.ok(resolveEncounterProfile({stageId:'grass-meadow',runtimeSpeciesId:'missing',variant:'normal',level:1}).issues.some(issue=>issue.code==='unknown_species'));
assert.ok(resolveEncounterProfile({stageId:'grass-meadow',runtimeSpeciesId:'flameling',variant:'normal',level:1}).issues.some(issue=>issue.code==='species_type_outside_stage'));
assert.ok(resolveEncounterProfile({stageId:'grass-meadow',runtimeSpeciesId:'mossbun',variant:'mythic',level:1}).issues.some(issue=>issue.code==='invalid_variant'));
assert.ok(resolveEncounterProfile({stageId:'grass-meadow',runtimeSpeciesId:'mossbun',variant:'boss',level:5,capturePolicy:'normal'}).issues.some(issue=>issue.code==='capture_policy_mismatch'));
assert.ok(resolveEncounterProfile({stageId:'missing-stage',runtimeSpeciesId:'mossbun',variant:'normal',level:1}).issues.some(issue=>issue.code==='unknown_stage'));

const game=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
assert.match(game,/resolveEncounterProfile\(\{stageId:STAGE_BY_ID\[state\.currentZone\]\?state\.currentZone:null/,'live wild creation validates the encounter profile');
assert.match(game,/const capturePolicy=encounterProfile\.capturePolicy/,'live capture policy comes from the central adapter');
assert.doesNotMatch(game,/const capturePolicy=boss\?'disabled'/,'live runtime no longer owns a second variant policy');

console.log('V8.1 encounter species/capture profile adapter: PASS');
