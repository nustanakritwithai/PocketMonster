import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STAGE_CATALOG, stageLevelRange } from '../stage-catalog.mjs';
import { assertStageLevelProgression, extractArrayExpression, extractStageBlock } from './v811-stage-level-progression.mjs';

const gameSource=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
const cloneCatalog=()=>structuredClone(STAGE_CATALOG);
const resolverFor=catalog=>{
  const byId=Object.fromEntries(catalog.map(stage=>[stage.id,stage]));
  return stageId=>byId[stageId]?{...byId[stageId].recommendedLevel}:null;
};

function replaceStage(source,stageId,mutate){
  const block=extractStageBlock(source,stageId);
  assert.ok(block,`${stageId} baseline block exists`);
  const mutated=mutate(block);
  assert.notEqual(mutated,block,`${stageId} mutation must apply`);
  return source.replace(block,mutated);
}

function mutateFirstEncounterLevel(source,stageId,listName,level){
  return replaceStage(source,stageId,block=>{
    const list=extractArrayExpression(block,listName);
    assert.ok(list,`${stageId} ${listName} baseline exists`);
    const mutated=list.replace(
      /(\[\s*['"][^'"]+['"]\s*,\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*,\s*)([^,\]\n]+)/,
      (_record,prefix)=>`${prefix}${level}`,
    );
    assert.notEqual(mutated,list,`${stageId} ${listName} level mutation must apply`);
    return block.replace(list,mutated);
  });
}

assertStageLevelProgression({gameSource});

const malformedRange=cloneCatalog();
malformedRange.find(stage=>stage.id==='dragon-crater').recommendedLevel={min:36,max:35};
const minimumInversion=cloneCatalog();
minimumInversion.find(stage=>stage.id==='dream-shrine').recommendedLevel.min=15;
const maximumInversion=cloneCatalog();
maximumInversion.find(stage=>stage.id==='storm-field').recommendedLevel.max=7;

const mutants=[
  {
    name:'inline runtime recommendation bypasses the catalog resolver',
    gameSource:replaceStage(gameSource,'grass-meadow',block=>block.replace("recommendedLevel:stageLevelRange('grass-meadow')",'recommendedLevel:{min:1,max:5}')),
  },
  {
    name:'runtime recommendation reads the wrong stage ID',
    gameSource:replaceStage(gameSource,'ember-valley',block=>block.replace("stageLevelRange('ember-valley')","stageLevelRange('grass-meadow')")),
  },
  {
    name:'a runtime stage is removed',
    gameSource:replaceStage(gameSource,'misty-lake',block=>block.replace("'misty-lake':{","'misty-lake-removed':{")),
  },
  {
    name:'Normal spawn exceeds its catalog range',
    gameSource:mutateFirstEncounterLevel(gameSource,'ember-valley','spawn',99),
  },
  {
    name:'Elite spawn falls below its catalog range',
    gameSource:mutateFirstEncounterLevel(gameSource,'misty-lake','eliteSpawn',1),
  },
  {
    name:'Boss spawn exceeds its catalog range',
    gameSource:mutateFirstEncounterLevel(gameSource,'storm-field','bossSpawn',99),
  },
  {
    name:'catalog range has min greater than max',
    catalog:malformedRange,
    rangeResolver:resolverFor(malformedRange),
  },
  {
    name:'catalog minimum level regresses in progression order',
    catalog:minimumInversion,
    rangeResolver:resolverFor(minimumInversion),
  },
  {
    name:'catalog maximum level regresses in progression order',
    catalog:maximumInversion,
    rangeResolver:resolverFor(maximumInversion),
  },
  {
    name:'stageLevelRange resolver drifts from the catalog',
    rangeResolver:stageId=>stageId==='grass-meadow'?{min:2,max:5}:stageLevelRange(stageId),
  },
];

for(const mutant of mutants){
  assert.throws(
    ()=>assertStageLevelProgression({
      catalog:mutant.catalog??STAGE_CATALOG,
      gameSource:mutant.gameSource??gameSource,
      rangeResolver:mutant.rangeResolver??stageLevelRange,
    }),
    undefined,
    `${mutant.name} must be killed`,
  );
}

console.log(`V8.11 stage level progression mutants: PASS (${mutants.length}/${mutants.length} killed)`);
