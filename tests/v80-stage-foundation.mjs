import assert from 'node:assert/strict';
import { STAGE_BY_ID, STAGE_CATALOG, STAGE_TYPES, createStageProgress, normalizeStageProgress, recordStageClear, stageUnlockReason } from '../stage-catalog.mjs';
import { activeJs as js } from './active-assets.mjs';

assert.equal(STAGE_TYPES.length,18,'Stage catalog uses the locked 18-type list');
assert.equal(new Set(STAGE_TYPES).size,18,'Stage type ids are unique');
assert.equal(STAGE_CATALOG.length,16,'Stage catalog covers the planned stage set');
assert.equal(new Set(STAGE_CATALOG.map(stage=>stage.id)).size,STAGE_CATALOG.length,'Stage ids are unique');
for(const stage of STAGE_CATALOG){
  assert.ok(stage.primaryTypes.length,'Every stage has a primary type');
  assert.ok(stage.primaryTypes.every(type=>STAGE_TYPES.includes(type)),'Primary types use the shared type list');
  assert.ok(stage.secondaryTypes.every(type=>STAGE_TYPES.includes(type)),'Secondary types use the shared type list');
  assert.match(stage.encounterTableId,/^encounter-.+-v1$/,'Encounter profile is explicit');
  assert.match(stage.eliteEncounterId,/^elite-.+-v1$/,'Elite profile is explicit');
  assert.match(stage.bossEncounterId,/^boss-.+-v1$/,'Boss profile is explicit');
  assert.equal(stage.capturePolicy,'normal-wild-only','Boss/capture policy remains data-driven');
}
assert.equal(STAGE_BY_ID['grass-meadow'].status,'active','Grass Meadow is the reference stage');
const initial=createStageProgress();
assert.deepEqual(initial.unlocked,['grass-meadow'],'New progress starts at Grass Meadow');
assert.equal(stageUnlockReason(initial,'grass-meadow').ok,true,'Reference stage is available');
assert.equal(stageUnlockReason(initial,'ember-valley').ok,false,'Next stage is locked before clear');
const cleared=recordStageClear(initial,'grass-meadow',{bestTime:120});
assert.equal(stageUnlockReason(cleared,'ember-valley').ok,true,'Clearing Grass Meadow unlocks Ember Valley');
assert.equal(cleared.bestTimes['grass-meadow'],120,'Best time is recorded');
assert.equal(recordStageClear(cleared,'grass-meadow',{bestTime:150}).bestTimes['grass-meadow'],120,'Best time does not regress');
const migrated=normalizeStageProgress({unlocked:['grass-meadow','unknown'],cleared:['unknown'],bestTimes:{'grass-meadow':90}});
assert.deepEqual(migrated.unlocked,['grass-meadow'],'Unknown stage ids are removed during migration');
assert.deepEqual(migrated.cleared,[],'Unknown clear ids are removed during migration');
assert.equal(migrated.bestTimes['grass-meadow'],90,'Known progress survives migration');
assert.match(js,/createStageProgress\(\)/,'Runtime state initializes Stage progress');
assert.match(js,/state\.stageProgress=normalizeStageProgress\(clean\.stageProgress\)/,'Save migration normalizes Stage progress');
console.log('V8 Stage Foundation: PASS');
