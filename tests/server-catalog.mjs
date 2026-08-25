import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { catalogMutationVersion, loadServerCatalog } from '../server-catalog.mjs';

const config={apiBaseUrl:'https://server.example',apiVersion:'1.1',featureFlags:{vpsEnabled:true,vpsReads:true}};
const values=new Map();const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
const hash=value=>createHash('sha256').update(value).digest('hex');
const documents={skills:[{id:'SK_FIRE_01',revision:1,checksum:'a'.repeat(64)}],learnsets:[{id:'LE_0022',revision:1,checksum:'b'.repeat(64)}],statuses:[{id:'ST_BURN',revision:1,checksum:'c'.repeat(64)}],skill_status_links:[{id:'SL_0001',revision:1,checksum:'d'.repeat(64)}],status_interactions:[{id:'SI_0001',revision:1,checksum:'e'.repeat(64)}]};
const resources=Object.fromEntries(Object.entries(documents).map(([kind,entries])=>[kind,{revision:1,checksum:hash(entries.map(entry=>entry.checksum).join(''))}]));
const manifest={catalogVersion:'8.4.0-catalog.2',resources};
const fetchImpl=async url=>{if(url.endsWith('/manifest'))return new Response(JSON.stringify({success:true,manifest}),{status:200,headers:{ETag:'"manifest"'}});const kind=url.split('/').at(-1);return new Response(JSON.stringify({success:true,documents:documents[kind]}),{status:200,headers:{ETag:'"resource"'}});};
const fresh=await loadServerCatalog(config,{fetchImpl,storage});assert.equal(fresh.state,'fresh');assert.equal(fresh.resources.skills[0].id,'SK_FIRE_01');assert.equal(fresh.resources.learnsets[0].id,'LE_0022');assert.equal(fresh.resources.statuses[0].id,'ST_BURN');assert.equal(fresh.resources.skill_status_links[0].id,'SL_0001');assert.equal(fresh.resources.status_interactions[0].id,'SI_0001');assert.equal(catalogMutationVersion(fresh),'8.4.0-catalog.2');
const cached=await loadServerCatalog(config,{storage,fetchImpl:async()=>new Response(null,{status:304})});assert.equal(cached.state,'cached');
const stale=await loadServerCatalog(config,{storage,fetchImpl:async()=>{throw new Error('offline')}});assert.equal(stale.state,'stale-cache');assert.equal(catalogMutationVersion(stale),'');
const embedded=await loadServerCatalog({...config,featureFlags:{}},{storage:null,fetchImpl});assert.equal(embedded.state,'embedded');
console.log('MonsterLife server catalog cache contract passed');
