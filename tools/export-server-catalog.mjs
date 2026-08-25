import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_CATALOG, FOOD_CATALOG, SKILL_ITEM_CATALOG } from '../content-catalog.mjs';
import { SKILL_CATALOG } from '../skill-catalog.mjs';
import { MONSTER_CATALOG } from '../monster-catalog.mjs';
import { LEARNSET_CATALOG } from '../learnset-catalog.mjs';
import { SKILL_STATUS_LINKS, STATUS_CATALOG } from '../status-catalog.mjs';
import { STATUS_INTERACTIONS } from '../status-lifecycle.mjs';
import { WORKBOOK_EVOLUTION_PATHS } from '../evolution.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const output=process.argv[2]||path.resolve(here,'../../MonsterLifeEventsApp/scr/catalog/catalog-seed-v8.4.0.json');
const documents=(records,idOf=record=>record.id)=>records.map(record=>({id:idOf(record),definition:record}));
const items={...FOOD_CATALOG,...SKILL_ITEM_CATALOG,captureBalls:{id:'captureBalls',type:'CAPTURE',stackLimit:1_000_000,consumeReasons:['CAPTURE'],serverAuthoritative:true}};
const runtimeSpeciesByMonsterId=new Map(MONSTER_CATALOG.flatMap(monster=>[
  [monster.workbookBaseMonsterId,monster.runtimeSpeciesId],
  [monster.workbookStage2MonsterId,monster.runtimeSpeciesId],
]));
const learnsets=LEARNSET_CATALOG.map(entry=>({...entry,runtimeSpeciesId:runtimeSpeciesByMonsterId.get(entry.monsterId)??null,minimumLevel:entry.learnLevel,minimumBond:entry.requiredBond,allowedSlots:['s1','s2','s3','s4'],serverAuthoritative:true}));
const skills=SKILL_CATALOG.map(skill=>({...skill,allowedSlots:['s1','s2','s3','s4'],serverAuthoritative:true}));
const interactions=STATUS_INTERACTIONS.map((entry,index)=>({id:`SI_${String(index+1).padStart(4,'0')}`,...entry}));
const bundle={catalogVersion:'8.4.0-catalog.2',generatedAtUtc:new Date().toISOString(),resources:{skills:documents(skills),items:documents(Object.values(items)),equipment:documents(EQUIPMENT_CATALOG),monsters:documents(MONSTER_CATALOG,record=>record.runtimeSpeciesId),learnsets:documents(learnsets),statuses:documents(STATUS_CATALOG),skill_status_links:documents(SKILL_STATUS_LINKS),status_interactions:documents(interactions),evolutions:documents(WORKBOOK_EVOLUTION_PATHS),breeding_rules:documents([{id:'default',minimumLevel:10,minimumBond:50,hatchMinutes:15,maximumEggs:20,disallowCloseRelatives:true}])}};
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(bundle,null,2)+'\n','utf8');
console.log(`${output} resources=${Object.fromEntries(Object.entries(bundle.resources).map(([key,value])=>[key,value.length]))}`);
