import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { catalogMutationVersion, loadServerCatalog } from '../server-catalog.mjs';

const config={apiBaseUrl:'https://server.example',apiVersion:'1.1',featureFlags:{vpsEnabled:true,vpsReads:true}};
const values=new Map();const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
const hash=value=>createHash('sha256').update(value).digest('hex');
const documents={skills:[{id:'Flame Bite',revision:1,checksum:'a'.repeat(64)}],items:[{id:'healthy',revision:1,checksum:'b'.repeat(64)}]};
const manifest={catalogVersion:'8.4.0-catalog.1',resources:{skills:{revision:1,checksum:hash(documents.skills[0].checksum)},items:{revision:1,checksum:hash(documents.items[0].checksum)}}};
const fetchImpl=async url=>url.endsWith('/manifest')?new Response(JSON.stringify({success:true,manifest}),{status:200,headers:{ETag:'"manifest"'}}):new Response(JSON.stringify({success:true,documents:url.endsWith('/skills')?documents.skills:documents.items}),{status:200,headers:{ETag:'"resource"'}});
const fresh=await loadServerCatalog(config,{fetchImpl,storage});assert.equal(fresh.state,'fresh');assert.equal(fresh.resources.skills[0].id,'Flame Bite');assert.equal(catalogMutationVersion(fresh),'8.4.0-catalog.1');
const cached=await loadServerCatalog(config,{storage,fetchImpl:async()=>new Response(null,{status:304})});assert.equal(cached.state,'cached');
const stale=await loadServerCatalog(config,{storage,fetchImpl:async()=>{throw new Error('offline')}});assert.equal(stale.state,'stale-cache');assert.equal(catalogMutationVersion(stale),'');
const embedded=await loadServerCatalog({...config,featureFlags:{}},{storage:null,fetchImpl});assert.equal(embedded.state,'embedded');
console.log('MonsterLife server catalog cache contract passed');
