import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { STAGE_CATALOG, stageLevelRange } from '../stage-catalog.mjs';

export const EXPECTED_STAGE_IDS=Object.freeze([
  'grass-meadow','ember-valley','misty-lake','storm-field',
  'frozen-pass','rocky-canyon','sky-ruins','poison-marsh',
  'dream-shrine','haunted-woods','shadow-city','steel-factory',
  'dragon-crater','fairy-garden','combat-colosseum','normal-wildlands',
]);

const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function balancedExpression(source,start,open,close){
  let depth=0,quote=null,escaped=false;
  for(let index=start;index<source.length;index++){
    const character=source[index];
    if(quote){
      if(escaped)escaped=false;
      else if(character==='\\')escaped=true;
      else if(character===quote)quote=null;
      continue;
    }
    if(character==='\''||character==='"'||character==='`'){
      quote=character;
      continue;
    }
    if(character===open)depth++;
    else if(character===close&&--depth===0)return source.slice(start,index+1);
  }
  return '';
}

export function extractStageBlock(gameSource,stageId){
  const marker=new RegExp(`(?:^|\\n)  (?:'${escapeRegExp(stageId)}'|"${escapeRegExp(stageId)}")\\s*:\\s*\\{`);
  const match=marker.exec(gameSource);
  if(!match)return '';
  const start=match.index+(match[0].startsWith('\n')?1:0);
  const tail=gameSource.slice(start);
  const next=tail.slice(1).search(/\n  (?:(?:'[^'\n]+'|"[^"\n]+")|[A-Za-z_$][\w$]*)\s*:\s*\{/);
  return next<0?tail:tail.slice(0,next+1);
}

export function extractArrayExpression(block,field){
  const match=new RegExp(`\\b${escapeRegExp(field)}\\s*:\\s*\\[`).exec(block);
  if(!match)return '';
  const start=match.index+match[0].lastIndexOf('[');
  return balancedExpression(block,start,'[',']');
}

export function extractObjectExpression(block,field){
  const match=new RegExp(`\\b${escapeRegExp(field)}\\s*:\\s*\\{`).exec(block);
  if(!match)return '';
  const start=match.index+match[0].lastIndexOf('{');
  return balancedExpression(block,start,'{','}');
}

function balanceLevel(gameSource,key){
  const match=new RegExp(`\\b${escapeRegExp(key)}\\s*:\\s*\\{[^{}]*?\\blevel\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(gameSource);
  assert.ok(match,`Runtime balance level ${key} must resolve to a numeric value`);
  return Number(match[1]);
}

function evaluateRuntimeLiteral(expression,gameSource,label){
  const resolved=expression.replace(/\bBALANCE\.([A-Za-z_$][\w$]*)\.level\b/g,(_token,key)=>String(balanceLevel(gameSource,key)));
  try{
    return vm.runInNewContext(`(${resolved})`,Object.create(null),{timeout:1000});
  }catch(error){
    assert.fail(`${label} must remain a data-only literal: ${error.message}`);
  }
}

export function parseArrayField(block,field,gameSource){
  const expression=extractArrayExpression(block,field);
  assert.ok(expression,`${field} must exist as an array`);
  const value=evaluateRuntimeLiteral(expression,gameSource,field);
  assert.ok(Array.isArray(value),`${field} must evaluate to an array`);
  return value;
}

export function parseObjectField(block,field,gameSource){
  const expression=extractObjectExpression(block,field);
  assert.ok(expression,`${field} must exist as an object`);
  const value=evaluateRuntimeLiteral(expression,gameSource,field);
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value),`${field} must evaluate to an object`);
  return value;
}

export function stringField(block,field){
  return new RegExp(`\\b${escapeRegExp(field)}\\s*:\\s*['"]([^'"]+)['"]`).exec(block)?.[1]??null;
}

export function assertStageLevelProgression({catalog=STAGE_CATALOG,gameSource,rangeResolver=stageLevelRange}={}){
  assert.equal(typeof gameSource,'string','Runtime source is required');
  assert.deepEqual(catalog.map(stage=>stage.id),EXPECTED_STAGE_IDS,'Catalog order must contain the complete 16-stage progression');
  assert.equal(new Set(catalog.map(stage=>stage.id)).size,16,'Catalog stage IDs must stay unique');

  let previous=null;
  for(const [index,stage] of catalog.entries()){
    const range=stage.recommendedLevel;
    assert.ok(range&&Number.isInteger(range.min)&&Number.isInteger(range.max),`${stage.id} owns an integer recommendedLevel range`);
    assert.ok(range.min<=range.max,`${stage.id} recommendedLevel min cannot exceed max`);
    if(previous){
      assert.ok(range.min>=previous.min,`${stage.id} minimum level cannot invert below ${catalog[index-1].id}`);
      assert.ok(range.max>=previous.max,`${stage.id} maximum level cannot invert below ${catalog[index-1].id}`);
    }
    previous=range;

    assert.deepEqual(rangeResolver(stage.id),{min:range.min,max:range.max},`${stage.id} range resolver must read the catalog`);
    const block=extractStageBlock(gameSource,stage.id);
    assert.ok(block,`${stage.id} must have a runtime zone`);
    assert.equal(stringField(block,'stageId'),stage.id,`${stage.id} runtime zone must link to its catalog ID`);
    assert.equal((block.match(/\brecommendedLevel\s*:/g)||[]).length,1,`${stage.id} runtime owns exactly one recommendedLevel field`);
    const canonicalPattern=new RegExp(`\\brecommendedLevel\\s*:\\s*stageLevelRange\\(\\s*['"]${escapeRegExp(stage.id)}['"]\\s*\\)`);
    assert.match(block,canonicalPattern,`${stage.id} runtime recommendedLevel must come from stageLevelRange`);

    for(const listName of ['spawn','rareSpawn','eliteSpawn','bossSpawn']){
      const required=listName!=='rareSpawn';
      if(!required&&!new RegExp(`\\b${listName}\\s*:`).test(block))continue;
      const records=parseArrayField(block,listName,gameSource);
      if(required)assert.ok(records.length>0,`${stage.id} ${listName} cannot be empty`);
      for(const [recordIndex,record] of records.entries()){
        assert.ok(Array.isArray(record)&&record.length>=4,`${stage.id} ${listName}[${recordIndex}] must be a spawn record`);
        const level=record[3];
        assert.ok(Number.isInteger(level),`${stage.id} ${listName}[${recordIndex}] level must be an integer`);
        assert.ok(level>=range.min&&level<=range.max,`${stage.id} ${listName}[${recordIndex}] Lv.${level} must stay within Lv.${range.min}-${range.max}`);
      }
    }
  }
}

const isDirect=Boolean(process.argv[1])&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url;
if(isDirect){
  const gameSource=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
  assertStageLevelProgression({gameSource});
  console.log('V8.11 stage level progression: PASS (16/16 catalog-linked ranges)');
}
