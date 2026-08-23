import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveOwnedBasicAiAction } from '../basic-ai-resolver.mjs';

const runtimeSource=fs.readFileSync(new URL('../performance-runtime.mjs',import.meta.url),'utf8');
const lifecycleSource=fs.readFileSync(new URL('../scene-resource-lifecycle.mjs',import.meta.url),'utf8');
const activeSource=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
let serial=0;

function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`${name}: function missing`);
  const open=source.indexOf('{',start);
  let depth=0;
  for(let index=open;index<source.length;index++){
    if(source[index]==='{')depth++;
    else if(source[index]==='}')depth--;
    if(depth===0)return source.slice(start,index+1);
  }
  assert.fail(`${name}: unbalanced body`);
}

function assertLivePerformance(source){
  assert.match(source,/const qualityProfile=selectQualityProfile\(\{deviceMemory:navigator\.deviceMemory,hardwareConcurrency:navigator\.hardwareConcurrency,devicePixelRatio:window\.devicePixelRatio,saveData:navigator\.connection\?\.saveData===true\}\);/);
  for(const consumer of [
    /createAssetEngine\(\{THREE,quality:qualityProfile\.tier\}\)/,
    /new THREE\.WebGLRenderer\(\{antialias:qualityProfile\.antialias,powerPreference:'high-performance'\}\)/,
    /nearHz:qualityProfile\.nearAiHz/,
    /midHz:qualityProfile\.midAiHz/,
    /farHz:qualityProfile\.farAiHz/,
    /nearHz:qualityProfile\.labelHz/,
    /renderer\.setPixelRatio\(Math\.min\(devicePixelRatio,qualityProfile\.maxDpr\)\)/,
    /renderer\.shadowMap\.enabled=qualityProfile\.shadows/,
    /characterPreviewRenderer=new THREE\.WebGLRenderer\(\{canvas,antialias:qualityProfile\.antialias,alpha:true,powerPreference:'low-power'\}\)/,
    /characterPreviewRenderer\.setPixelRatio\(Math\.min\(devicePixelRatio\|\|1,qualityProfile\.maxDpr\)\)/,
  ])assert.match(source,consumer);
  const limitsMatch=source.match(/const VFX_LIMITS=Object\.freeze\(\{maxConcurrentEffects:(\d+),maxParticles:(\d+),maxGroundDecals:(\d+),maxFloatingTexts:(\d+)\}\);/);
  assert.ok(limitsMatch);
  const limits={maxConcurrentEffects:Number(limitsMatch[1]),maxParticles:Number(limitsMatch[2]),maxGroundDecals:Number(limitsMatch[3]),maxFloatingTexts:Number(limitsMatch[4])};
  assert.deepEqual(limits,{maxConcurrentEffects:80,maxParticles:200,maxGroundDecals:8,maxFloatingTexts:12});
  assert.equal(Object.hasOwn(limits,'maxProjectiles'),false);
  const capturePrerequisite=functionSource(source,'capturePrerequisite');
  const summonThrow=functionSource(source,'summonThrow');
  assert.equal((source.match(/throwProjectile\(/g)??[]).length,3);
  assert.match(capturePrerequisite,/pendingSummon\|\|projectiles\.some\(p=>p\.type==='summon'\)/);
  assert.match(capturePrerequisite,/activeCaptureAttempt\|\|captureSequence\|\|projectiles\.some\(p=>p\.type==='capture'\)\|\|wilds\.some\(w=>w\.capturing\)/);
  assert.match(summonThrow,/if\(activeSummon\|\|pendingSummon\)/);
  assert.match(source,/const RANCH_ACTIVE_MAX=6;/);
  const syncRanchVisuals=functionSource(source,'syncRanchVisuals');
  const toggleRanchActive=functionSource(source,'toggleRanchActive');
  const updateRanchVisuals=functionSource(source,'updateRanchVisuals');
  assert.match(syncRanchVisuals,/\.slice\(0,RANCH_ACTIVE_MAX\)/);
  assert.match(toggleRanchActive,/state\.ranchActive\.length>=RANCH_ACTIVE_MAX/);
  assert.doesNotMatch(updateRanchVisuals,/new THREE\.Vector3/);
  assert.match(updateRanchVisuals,/obj\.direction\.set\(/);
  assert.match(source,/maxSize:VFX_LIMITS\.maxParticles/);
  assert.equal((source.match(/effects\.push\(/g)??[]).length,1);
  assert.equal((source.match(/effects\.splice\(/g)??[]).length,2);
  const canSpawnSource=functionSource(source,'canSpawnVFX');
  const gateSource=functionSource(source,'addTransientEffect');
  assert.match(canSpawnSource,/for\(const evictPriority of \['P4','P3'\]\)/);
  assert.match(canSpawnSource,/return priority==='P0'/);
  const active=[],released=[];
  const rank={P0:0,P1:1,P2:2,P3:3,P4:4};
  const createGate=(effects,releases)=>Function('effects','releaseTransientEffect','VFX_LIMITS','VFX_PRIORITY_RANK',`'use strict';${canSpawnSource};${gateSource};return addTransientEffect;`)(effects,effect=>releases.push(effect),limits,rank);
  const add=createGate(active,released);
  for(let index=0;index<80;index++)assert.equal(add({mesh:{id:index}}),true);
  const overflow={mesh:{id:80}};
  assert.equal(add(overflow),false);
  assert.equal(active.length,80);
  assert.deepEqual(released,[overflow]);
  const prioritized=[],priorityReleased=[],addPrioritized=createGate(prioritized,priorityReleased);
  for(let index=0;index<79;index++)addPrioritized({mesh:{id:`p2-${index}`}},'P2');
  const trail={mesh:{id:'p4'}};addPrioritized(trail,'P4');
  assert.equal(addPrioritized({mesh:{id:'p1'}},'P1'),true);
  assert.equal(prioritized.length,80);assert.deepEqual(priorityReleased,[trail]);
  const protectedEffects=[],protectedReleased=[],addProtected=createGate(protectedEffects,protectedReleased);
  for(let index=0;index<80;index++)addProtected({mesh:{id:index}},'P2');
  const incomingP4={mesh:{id:'incoming-p4'}};
  assert.equal(addProtected(incomingP4,'P4'),false);assert.deepEqual(protectedReleased,[incomingP4]);
  const p0Effects=[],p0Released=[],addP0=createGate(p0Effects,p0Released);
  for(let index=0;index<80;index++)addP0({mesh:{id:index}},'P2');
  assert.equal(addP0({mesh:{id:'capture-p0'}},'P0'),true);assert.equal(p0Effects.length,81);assert.deepEqual(p0Released,[]);
  assert.match(functionSource(source,'spawnElementalFX'),/mode==='trail'\?'P4':mode==='aura'\?'P2':'P1'/);
  assert.match(functionSource(source,'spawnSkillTrail'),/gravity: 0\.2\}, 'P4'\)/);
  assert.match(functionSource(source,'spawnAreaWave'),/addTransientEffect\(\{mesh: wave, life: 0\.5, maxLife: 0\.5, kind: 'area-wave', expandTo: range \* 2\}, 'P1'\)/);
  assert.equal((functionSource(source,'spawnFeedEffect').match(/\},'P3'\)/g)??[]).length,2);
  assert.equal((functionSource(source,'spawnCaptureResultEffect').match(/priority:'P0'/g)??[]).length,5);
  const releaseSource=functionSource(source,'releaseTransientEffect'),releaseCalls=[];
  const release=Function('skillSpritePool','sparkPool','removeAndDispose','scene',`'use strict';${releaseSource};return releaseTransientEffect;`)(
    {release:mesh=>releaseCalls.push(['sprite',mesh])},
    {release:mesh=>releaseCalls.push(['spark',mesh])},
    (_scene,mesh)=>releaseCalls.push(['unique',mesh]),
    {},
  );
  release({mesh:{id:'sprite'},spritePool:true,pooled:true});
  release({mesh:{id:'spark'},pooled:true});
  release({mesh:{id:'unique'}});
  assert.deepEqual(releaseCalls.map(call=>call[0]),['sprite','spark','unique']);
  const addDecalSource=functionSource(source,'addGroundDecal'),decals=[],removed=[];
  const addDecal=Function('groundDecals','removeAndDispose','scene','VFX_LIMITS',`'use strict';${addDecalSource};return addGroundDecal;`)(decals,(_scene,group)=>removed.push(group),{},limits);
  for(let index=0;index<9;index++)addDecal({group:{id:index}});
  assert.equal(decals.length,8);assert.deepEqual(removed.map(group=>group.id),[0]);
  const addTextSource=functionSource(source,'addFloatingText'),texts=[],removedText=[];
  const addText=Function('floatingTexts','VFX_LIMITS',`'use strict';${addTextSource};return addFloatingText;`)(texts,limits);
  for(let index=0;index<13;index++)addText({el:{id:index,remove(){removedText.push(this.id);}}});
  assert.equal(texts.length,12);assert.deepEqual(removedText,[0]);
  const updateOwned=functionSource(source,'updateOwned');
  const materialize=functionSource(source,'materializeOwnedBasicAiTarget');
  const selectAggressors=functionSource(source,'selectWildAggressors');
  const updateWild=functionSource(source,'updateWild');
  const updateFloatingTexts=functionSource(source,'updateFloatingTexts');
  const loop=functionSource(source,'loop');
  assert.doesNotMatch(updateOwned,/a\.skillCds=a\.skillCds\.map/);
  assert.doesNotMatch(updateOwned,/new THREE\.Vector3/);
  assert.match(updateOwned,/fillOwnedBasicAiRequest\(ownedBasicAiScratch,a,wilds\)/);
  assert.match(updateOwned,/shouldRunOwnedCadence\(a,'aiDecisionElapsed',dt,qualityProfile\.nearAiHz,!a\.aiDecision\)/);
  assert.match(updateOwned,/shouldRunOwnedCadence\(a,'skillUiElapsed',dt,10\)/);
  assert.doesNotMatch(updateOwned,/querySelector|createElement|toFixed/);
  assert.doesNotMatch(materialize,/wilds\.filter/);
  assert.doesNotMatch(selectAggressors,/wilds\.map|new Set/);
  assert.doesNotMatch(updateWild,/safeVec3|new THREE\.Vector3/);
  assert.match(updateWild,/advanceEncounterEffects\(w\.statusState,statusRequest\)/);
  assert.match(updateWild,/shouldResetEncounter\(resetRequest\)/);
  assert.doesNotMatch(updateFloatingTexts,/safeVec3|new THREE\.Vector3/);
  assert.match(updateFloatingTexts,/worldToScreen\(p,floatingTextProjectionScratch\.screen,p\)/);
  assert.doesNotMatch(loop,/\[\.\.\.wilds\]/);
  assert.match(loop,/wildFrameSnapshot\.length=wilds\.length/);
  assert.match(loop,/for\(let wildIndex=0;wildIndex<wildFrameSnapshot\.length;wildIndex\+\+\)/);
  assert.doesNotMatch(loop,/wildIndex=wilds\.length-1/);
  const createSource=functionSource(source,'createOwnedBasicAiScratch');
  const fillSource=functionSource(source,'fillOwnedBasicAiRequest');
  const helpers=Function(`'use strict';${createSource};${fillSource};return {createOwnedBasicAiScratch,fillOwnedBasicAiRequest};`)();
  const scratch=helpers.createOwnedBasicAiScratch();
  const request=helpers.fillOwnedBasicAiRequest(scratch,{
    inst:{instanceId:'owned-live',speciesId:'flameling',fainted:false,hp:10},
    mesh:{position:{x:0,z:0}},target:{id:'retained'},attackCd:0,
  },[
    {id:'retained',dead:false,hp:10,capturing:false,mesh:{position:{x:8,z:0}}},
    {id:'nearest',dead:false,hp:10,capturing:false,mesh:{position:{x:2,z:0}}},
  ]);
  assert.equal(request.actor.id,'owned-live');
  assert.equal(request.actor.speciesId,'flameling');
  assert.deepEqual(request.actor.position,{x:0,z:0});
  assert.equal(request.currentTargetId,'retained');
  assert.equal(request.attackReady,true);
  assert.deepEqual(request.enemies.map(enemy=>enemy.id),['retained','nearest']);
  assert.deepEqual(request.enemies.map(enemy=>enemy.position),[{x:8,z:0},{x:2,z:0}]);
  assert.equal(resolveOwnedBasicAiAction(request).targetId,'retained');
}

function mutate(source,needle,replacement,label){
  assert.ok(source.includes(needle),`${label}: mutation target drifted`);
  return source.replace(needle,replacement);
}

async function importMutant(source,label){
  const encoded=Buffer.from(`${source}\n//# sourceURL=${label}-${++serial}.mjs`).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

async function expectKilled(label,source,probe){
  const module=await importMutant(source,label);
  let killed=false;
  try{await probe(module);}catch{killed=true;}
  assert.equal(killed,true,`${label}: regression probe survived the mutant`);
}

await expectKilled(
  'shared-cache-bypass',
  mutate(runtimeSource,'if (store.has(key)) return store.get(key);','if (false && store.has(key)) return store.get(key);','shared-cache-bypass'),
  module=>{
    const cache=module.createSharedResourceCache();
    const first=cache.geometry('same',()=>({userData:{}}));
    const second=cache.geometry('same',()=>({userData:{}}));
    assert.equal(first,second);
  },
);

await expectKilled(
  'pool-overflow-off-by-one',
  mutate(runtimeSource,'if (free.length < maxSize) {','if (free.length <= maxSize) {','pool-overflow-off-by-one'),
  module=>{
    const pool=module.createObjectPool({maxSize:1,create:()=>({})});
    const first=pool.acquire(),second=pool.acquire();
    pool.release(first);pool.release(second);
    assert.equal(pool.stats().free,1);
  },
);

await expectKilled(
  'quality-dpr-uncapped',
  mutate(runtimeSource,"maxDpr: 1.5, antialias: true","maxDpr: 3, antialias: true",'quality-dpr-uncapped'),
  module=>assert.ok(module.selectQualityProfile({deviceMemory:8,hardwareConcurrency:8}).maxDpr<=1.5),
);

await expectKilled(
  'engaged-ai-replays-throttled-backlog',
  mutate(
    runtimeSource,
    `if (force) {
        elapsedById.set(id, 0);
        return Math.min(maxStep, frameDt);
      }`,
    `if (force) {
        const elapsed = (elapsedById.get(id) ?? 0) + frameDt;
        elapsedById.set(id, 0);
        return Math.min(maxStep, elapsed);
      }`,
    'engaged-ai-replays-throttled-backlog',
  ),
  module=>{
    const scheduler=module.createDistanceTickScheduler();
    assert.equal(scheduler.advance('wild',100,.2),0);
    assert.equal(scheduler.advance('wild',100,.02,true),.02);
  },
);
await expectKilled(
  'egg-countdown-enables-early',
  mutate(runtimeSource,'Math.ceil((target - current) / 1000)','Math.floor((target - current) / 1000)','egg-countdown-enables-early'),
  module=>assert.equal(module.remainingCountdownSeconds(1001,1000),1),
);
await expectKilled(
  'egg-countdown-refresh-skipped',
  mutate(runtimeSource,'Number.isInteger(eggCount) && eggCount > 0','Number.isInteger(eggCount) && eggCount < 0','egg-countdown-refresh-skipped'),
  module=>assert.equal(module.shouldRefreshEggCountdown(true,1),true),
);


await expectKilled(
  'dirty-gate-renders-clean-state',
  mutate(runtimeSource,'if (!dirty || now - lastConsumedAt < minIntervalMs) return false;','if (now - lastConsumedAt < minIntervalMs) return false;','dirty-gate-renders-clean-state'),
  module=>assert.equal(module.createDirtyGate({initial:false}).consume(0),false),
);

await expectKilled(
  'shared-geometry-disposed-per-object',
  mutate(lifecycleSource,"node?.geometry?.userData?.shared !== true && disposeOnce(node?.geometry)","disposeOnce(node?.geometry)",'shared-geometry-disposed-per-object'),
  module=>{
    const geometry={userData:{shared:true},calls:0,dispose(){this.calls++;}};
    module.disposeObject3D({geometry});
    assert.equal(geometry.calls,0);
  },
);

assertLivePerformance(activeSource);
const liveMutants=[
  ['live-quality-hardcoded',mutate(
    activeSource,
    'const qualityProfile=selectQualityProfile({deviceMemory:navigator.deviceMemory,hardwareConcurrency:navigator.hardwareConcurrency,devicePixelRatio:window.devicePixelRatio,saveData:navigator.connection?.saveData===true});',
    "const qualityProfile=Object.freeze({tier:'medium'});",
    'live-quality-hardcoded',
  )],
  ['quality-antialias-hardcoded',mutate(activeSource,'antialias:qualityProfile.antialias','antialias:true','quality-antialias-hardcoded')],
  ['quality-asset-tier-hardcoded',mutate(activeSource,'createAssetEngine({THREE,quality:qualityProfile.tier})',"createAssetEngine({THREE,quality:'medium'})",'quality-asset-tier-hardcoded')],
  ['quality-dpr-hardcoded',mutate(activeSource,'renderer.setPixelRatio(Math.min(devicePixelRatio,qualityProfile.maxDpr))','renderer.setPixelRatio(Math.min(devicePixelRatio,1.5))','quality-dpr-hardcoded')],
  ['quality-shadows-hardcoded',mutate(activeSource,'renderer.shadowMap.enabled=qualityProfile.shadows','renderer.shadowMap.enabled=true','quality-shadows-hardcoded')],
  ['quality-preview-antialias-hardcoded',mutate(activeSource,'characterPreviewRenderer=new THREE.WebGLRenderer({canvas,antialias:qualityProfile.antialias','characterPreviewRenderer=new THREE.WebGLRenderer({canvas,antialias:true','quality-preview-antialias-hardcoded')],
  ['quality-preview-dpr-hardcoded',mutate(activeSource,'characterPreviewRenderer.setPixelRatio(Math.min(devicePixelRatio||1,qualityProfile.maxDpr))','characterPreviewRenderer.setPixelRatio(Math.min(devicePixelRatio||1,2))','quality-preview-dpr-hardcoded')],
  ['quality-ai-hz-hardcoded',mutate(activeSource,'nearHz:qualityProfile.nearAiHz','nearHz:30','quality-ai-hz-hardcoded')],
  ['quality-label-hz-hardcoded',mutate(activeSource,'nearHz:qualityProfile.labelHz','nearHz:15','quality-label-hz-hardcoded')],
  ['capture-summon-projectile-guard-removed',mutate(
    activeSource,
    "pendingSummon||projectiles.some(p=>p.type==='summon')",
    'pendingSummon',
    'capture-summon-projectile-guard-removed',
  )],
  ['capture-projectile-guard-removed',mutate(
    activeSource,
    "activeCaptureAttempt||captureSequence||projectiles.some(p=>p.type==='capture')||wilds.some(w=>w.capturing)",
    'activeCaptureAttempt||captureSequence||wilds.some(w=>w.capturing)',
    'capture-projectile-guard-removed',
  )],
  ['summon-concurrency-guard-removed',mutate(
    activeSource,
    'if(activeSummon||pendingSummon)',
    'if(false&&activeSummon&&pendingSummon)',
    'summon-concurrency-guard-removed',
  )],
  ['ranch-render-cap-raised',mutate(activeSource,'const RANCH_ACTIVE_MAX=6;','const RANCH_ACTIVE_MAX=60;','ranch-render-cap-raised')],
  ['ranch-load-cap-bypassed',mutate(activeSource,'.slice(0,RANCH_ACTIVE_MAX);','.slice(0,state.ranchActive.length);','ranch-load-cap-bypassed')],
  ['ranch-toggle-cap-bypassed',mutate(
    activeSource,
    'state.ranchActive.length>=RANCH_ACTIVE_MAX',
    'state.ranchActive.length>=999',
    'ranch-toggle-cap-bypassed',
  )],
  ['ranch-direction-allocates-per-frame',mutate(
    activeSource,
    'const dir=obj.direction.set(tx-obj.mesh.position.x,0,tz-obj.mesh.position.z);',
    'const dir=new THREE.Vector3(tx-obj.mesh.position.x,0,tz-obj.mesh.position.z);',
    'ranch-direction-allocates-per-frame',
  )],
  ['active-vfx-cap-disabled',mutate(activeSource,'maxConcurrentEffects:80','maxConcurrentEffects:800','active-vfx-cap-disabled')],
  ['particle-pool-cap-hardcoded',mutate(activeSource,'maxSize:VFX_LIMITS.maxParticles','maxSize:999','particle-pool-cap-hardcoded')],
  ['active-vfx-cap-off-by-one',mutate(activeSource,'effects.length<VFX_LIMITS.maxConcurrentEffects','effects.length<=VFX_LIMITS.maxConcurrentEffects','active-vfx-cap-off-by-one')],
  ['active-vfx-priority-eviction-disabled',mutate(
    activeSource,
    "for(const evictPriority of ['P4','P3'])",
    'for(const evictPriority of [])',
    'active-vfx-priority-eviction-disabled',
  )],
  ['active-vfx-p0-cut',mutate(activeSource,"return priority==='P0';",'return false;','active-vfx-p0-cut')],
  ['element-trail-priority-raised',mutate(activeSource,"mode==='trail'?'P4':mode==='aura'?'P2':'P1'","mode==='trail'?'P2':mode==='aura'?'P2':'P1'",'element-trail-priority-raised')],
  ['skill-trail-priority-raised',mutate(activeSource,"gravity: 0.2}, 'P4')","gravity: 0.2}, 'P2')",'skill-trail-priority-raised')],
  ['area-wave-priority-lowered',mutate(activeSource,"kind: 'area-wave', expandTo: range * 2}, 'P1')","kind: 'area-wave', expandTo: range * 2}, 'P4')",'area-wave-priority-lowered')],
  ['care-priority-raised',mutate(activeSource,"gravity:0},'P3')","gravity:0},'P2')",'care-priority-raised')],
  ['capture-p0-priority-lowered',mutate(activeSource,"priority:'P0'","priority:'P4'",'capture-p0-priority-lowered')],
  ['active-vfx-overflow-leaks',mutate(activeSource,'releaseTransientEffect(effect);return false;','return false;','active-vfx-overflow-leaks')],
  ['active-vfx-release-noop',mutate(activeSource,'if(effect.spritePool)skillSpritePool.release(effect.mesh);','if(false)skillSpritePool.release(effect.mesh);','active-vfx-release-noop')],
  ['active-vfx-producer-bypasses-gate',mutate(
    activeSource,
    "if(!addTransientEffect({mesh:sprite,life:life,maxLife:life,kind:'skill-sprite',pooled:true,spritePool:true,size:size},'P1'))return null;",
    "effects.push({mesh:sprite,life:life,maxLife:life,kind:'skill-sprite',pooled:true,spritePool:true,size:size});",
    'active-vfx-producer-bypasses-gate',
  )],
  ['active-vfx-splice-bypasses-gate',mutate(
    activeSource,
    'return sprite;\n}',
    "effects.splice(effects.length,0,{mesh:sprite,life:1,maxLife:1,kind:'test'});return sprite;\n}",
    'active-vfx-splice-bypasses-gate',
  )],
  ['active-vfx-expiry-keeps-slot',mutate(activeSource,'effects.splice(i,1);','void i;','active-vfx-expiry-keeps-slot')],
  ['ground-decal-cap-disabled',mutate(activeSource,'groundDecals.length>=VFX_LIMITS.maxGroundDecals','groundDecals.length>999','ground-decal-cap-disabled')],
  ['floating-text-cap-disabled',mutate(activeSource,'floatingTexts.length>=VFX_LIMITS.maxFloatingTexts','floatingTexts.length>999','floating-text-cap-disabled')],
  ['owned-cooldowns-allocate-per-frame',mutate(
    activeSource,
    'for(let i=0;i<a.skillCds.length;i++)a.skillCds[i]=Math.max(0,a.skillCds[i]-dt);',
    'a.skillCds=a.skillCds.map(x=>Math.max(0,x-dt));',
    'owned-cooldowns-allocate-per-frame',
  )],
  ['owned-target-filter-allocates',mutate(
    activeSource,
    "for(const wild of wilds){if(wild?.id===decision.targetId){target=wild;matchCount++;if(matchCount>1)return null;}}",
    "const matches=wilds.filter(wild=>wild?.id===decision.targetId);target=matches[0];matchCount=matches.length;",
    'owned-target-filter-allocates',
  )],
  ['owned-move-vector-allocates',mutate(
    activeSource,
    'const dir=ownedBasicAiMoveScratch.set(decision.direction.x,0,decision.direction.z);',
    'const dir=new THREE.Vector3(decision.direction.x,0,decision.direction.z);',
    'owned-move-vector-allocates',
  )],
  ['owned-request-scratch-bypassed',mutate(
    activeSource,
    'fillOwnedBasicAiRequest(ownedBasicAiScratch,a,wilds)',
    'fillOwnedBasicAiRequest(createOwnedBasicAiScratch(),a,wilds)',
    'owned-request-scratch-bypassed',
  )],
  ['owned-current-target-dropped',mutate(activeSource,'request.currentTargetId=a?.target?.id??null;','request.currentTargetId=null;','owned-current-target-dropped')],
  ['owned-actor-id-forged',mutate(activeSource,'actor.id=a?.inst?.instanceId;',"actor.id='owned-forged';",'owned-actor-id-forged')],
  ['owned-species-id-forged',mutate(activeSource,'actor.speciesId=a?.inst?.speciesId;',"actor.speciesId='normalooze';",'owned-species-id-forged')],
  ['owned-enemy-id-forged',mutate(activeSource,'target.id=wild?.id;',"target.id='wild-forged';",'owned-enemy-id-forged')],
  ['owned-enemy-position-forged',mutate(activeSource,'target.position.x=wild?.mesh?.position?.x;','target.position.x=999;','owned-enemy-position-forged')],
  ['owned-resolver-cadence-bypassed',mutate(
    activeSource,
    "if(shouldRunOwnedCadence(a,'aiDecisionElapsed',dt,qualityProfile.nearAiHz,!a.aiDecision))a.aiDecision=resolveOwnedBasicAiAction(",
    'if(true)a.aiDecision=resolveOwnedBasicAiAction(',
    'owned-resolver-cadence-bypassed',
  )],
  ['owned-ui-cadence-bypassed',mutate(
    activeSource,
    "if(shouldRunOwnedCadence(a,'skillUiElapsed',dt,10))updateOwnedSkillCooldownUi(a);",
    'updateOwnedSkillCooldownUi(a);',
    'owned-ui-cadence-bypassed',
  )],
  ['wild-aggressor-map-allocates',mutate(
    activeSource,
    'for(let index=0;index<wilds.length;index++){',
    'for(const [index,w] of wilds.map((w,index)=>[index,w])){',
    'wild-aggressor-map-allocates',
  )],
  ['wild-status-request-allocates',mutate(
    activeSource,
    'advanceEncounterEffects(w.statusState,statusRequest)',
    'advanceEncounterEffects(w.statusState,{...statusRequest})',
    'wild-status-request-allocates',
  )],
  ['wild-reset-request-allocates',mutate(
    activeSource,
    'shouldResetEncounter(resetRequest)',
    'shouldResetEncounter({...resetRequest})',
    'wild-reset-request-allocates',
  )],
  ['wild-chase-vector-allocates',mutate(
    activeSource,
    'const dir=wildUpdateScratch.direction.copy(target.position).sub(w.mesh.position);',
    'const dir=safeVec3(target.position).sub(w.mesh.position);',
    'wild-chase-vector-allocates',
  )],
  ['floating-text-vector-allocates',mutate(
    activeSource,
    'const p=floatingTextProjectionScratch.world.copy(f.pos);p.y+=f.rise;',
    'const p=safeVec3(f.pos).add(new THREE.Vector3(0,f.rise,0));',
    'floating-text-vector-allocates',
  )],
  ['wild-loop-spread-allocates',mutate(
    activeSource,
    'for(let wildIndex=0;wildIndex<wildFrameSnapshot.length;wildIndex++){',
    'for(const w of [...wilds]){const wildIndex=0;',
    'wild-loop-spread-allocates',
  )],
  ['wild-loop-order-reversed',mutate(
    activeSource,
    'for(let wildIndex=0;wildIndex<wildFrameSnapshot.length;wildIndex++){',
    'for(let wildIndex=wildFrameSnapshot.length-1;wildIndex>=0;wildIndex--){',
    'wild-loop-order-reversed',
  )],
];
let liveKilled=0;
for(const [label,source] of liveMutants){
  try{assertLivePerformance(source);}catch{liveKilled++;continue;}
  assert.fail(`${label}: live performance mutant survived`);
}
assert.equal(liveKilled,liveMutants.length);

console.log(`P0 performance mutation checks: PASS (8/8 module + ${liveKilled}/${liveMutants.length} live mutants killed)`);
