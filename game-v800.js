import { ENCOUNTER_POLICY, selectEngagedWildIds, shouldResetEncounter, tickCooldown } from './runtime-policies.mjs';
import { disposeObject3D, removeAndDispose } from './scene-resource-lifecycle.mjs';
import { createDirtyGate, createDistanceTickScheduler, createObjectPool, createSharedResourceCache, remainingCountdownSeconds, selectQualityProfile, shouldRefreshEggCountdown } from './performance-runtime.mjs';
import { SAVE_SCHEMA_VERSION, normalizeSavedState, readStoredSave, writeStoredSave } from './save-schema.mjs';
import { createCombatHudViewModel, createPartySlotViewModel } from './combat-ui-view-model.mjs';
import { BALANCE_CONFIG, BALANCE_SCHEMA_VERSION, SKILL_MASTERY } from './balance-config.mjs';
import * as balanceFormulas from './balance-formulas.mjs';
import { combatRating, compareBuilds } from './combat-rating.mjs';
import { normalizeInstance, createInstance, migrateState, addGrowthExp, addTrainingExp, trainingUsed as instTrainingUsed, trainingRemaining as instTrainingRemaining, simulateLife, deriveCondition, appendHistory, TRAINING_LINES, CORE_GENES } from './monster-instance.mjs';
import { resolveBattleGrowth, applyBattleGrowth, resolvePartyShareGrowth } from './battle-growth.mjs';
import { resolveFeed, careRest, carePlay, nutritionUsed, nutritionRemaining, nutritionFlat, activeTrainingFoodMultiplier, FOOD_CATEGORIES } from './food-care.mjs';
import { computeSkillExp, addSkillExp, masteryRankFromExp, masteryRawPower, getSkill, learnSkill, listSkillCandidates, evaluateSkillCandidate, applyMutation, SKILL_SLOTS } from './skill-progression.mjs';
import { equipItem, unequip, equippedItems, computeEquipmentContribution, loadoutPreview, EQUIPMENT_SLOTS } from './equipment.mjs';
import { evolutionContext, evaluateEvolution, listEligibleBranches, commitEvolution, checkEvolutionBudget } from './evolution.mjs';
import { eventContext, evaluateEventTriggers, rollEvent, getChoices, applyChoice, validateEventBalance } from './raising-events.mjs';
import { canBreed as canBreedFn, breed as breedFn, createEgg as createEggFn, GENE_RANKS as BREED_GENE_RANKS } from './breeding.mjs';
import { applyComputedStats, computeCoreStats, evoDefFromPath, explainStat, formatCrReport, growthExpForLevel, liveCaptureChance, liveMoveDamage, ranchTrainingGain, STARTER_EQUIPMENT } from './live-progression.mjs';
import { derivedStats } from './combat-rating.mjs';
import {
  applySpeciesProgression,
  DEFAULT_INVENTORY,
  EQUIPMENT_CATALOG,
  FOOD_CATALOG,
  RAISING_EVENT_CATALOG,
  SKILL_CANDIDATES,
  SKILL_MUTATIONS,
  equipmentById,
  foodById,
} from './content-catalog.mjs';
import { loadCatalog } from './asset-presentation/catalog.mjs';
import { createAssetEngine } from './asset-presentation/engine.mjs';
import { resolveMonsterAssetId } from './asset-presentation/monster-ids.mjs';
import { createLegacyHumanoidProvider } from './asset-presentation/providers/legacy-humanoid.mjs';
import { createBigheadProvider } from './asset-presentation/providers/procedural-bighead.mjs';
import { createBigheadMonsterProvider } from './asset-presentation/providers/procedural-bighead-monster.mjs';
import {
  addBigheadMonsterMarks,
  applyBigheadVisualGrowth,
  isBigheadMonsterRoot,
  markRingScale,
} from './asset-presentation/monster-mark.mjs';
import { paintGroundGrid, paintSkyGradient } from './asset-presentation/blocky-ground.mjs';

// V7.2+ Progression Integration — Balance Foundation + Raising Core engine
const MLRPG_BALANCE = Object.freeze({
  schemaVersion: BALANCE_SCHEMA_VERSION,
  config: BALANCE_CONFIG,
  formulas: balanceFormulas,
  combatRating,
  compareBuilds,
});
if (typeof window !== 'undefined') window.MLRPG_BALANCE = MLRPG_BALANCE;
console.info(`Monster Life RPG V8.1.0 • Progression Core live loop v${BALANCE_SCHEMA_VERSION} loaded`);

const startup = document.getElementById('startupStatus');
function startupText(text, cls=''){ if(startup){ startup.textContent=text; startup.className='startup-status '+cls; } }

async function loadThree(){
  const urls=[
    'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js',
    'https://unpkg.com/three@0.179.1/build/three.module.js'
  ];
  let lastError=null;
  for(const url of urls){
    try{ startupText('กำลังโหลดเอนจิน 3D…'); return await import(url); }
    catch(err){ lastError=err; console.warn('Three.js load failed:',url,err); }
  }
  throw new Error('โหลด Three.js ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วรีเฟรชหน้า: '+(lastError?.message||''));
}

let THREE;
try{ THREE=await loadThree(); }
catch(err){ startupText(err.message,'error'); throw err; }
startupText('กำลังสร้าง Monster Life RPG V8.1.0…');
const qualityProfile=Object.freeze({tier:'medium',maxDpr:1.25,antialias:true,shadows:false,nearAiHz:24,midAiHz:12,farAiHz:5,labelHz:10});
const assets=createAssetEngine({THREE,quality:qualityProfile.tier});
{
  const catalogRes=await fetch(new URL('./assets/catalog/humanoid-core.json',import.meta.url));
  if(!catalogRes.ok) throw new Error('โหลด humanoid catalog ไม่สำเร็จ: '+catalogRes.status);
  loadCatalog(await catalogRes.json());
  for(const [name,file] of [['monster-slimes','monster-slimes.json'],['monster-animals','monster-animals.json']]){
    const res=await fetch(new URL('./assets/catalog/'+file,import.meta.url));
    if(!res.ok) throw new Error('โหลด '+name+' catalog ไม่สำเร็จ: '+res.status);
    await assets.preloadBundle(name,await res.json());
  }
}
const sharedResources=createSharedResourceCache();
function cachedGeometry(kind,args,Factory){
  const key=`${kind}:${args.map(value=>String(value)).join(':')}`;
  return sharedResources.geometry(key,()=>new Factory(...args));
}
const sphereGeometry=(...args)=>cachedGeometry('sphere',args,THREE.SphereGeometry);
const boxGeometry=(...args)=>cachedGeometry('box',args,THREE.BoxGeometry);
const cylinderGeometry=(...args)=>cachedGeometry('cylinder',args,THREE.CylinderGeometry);
const capsuleGeometry=(...args)=>cachedGeometry('capsule',args,THREE.CapsuleGeometry);
const coneGeometry=(...args)=>cachedGeometry('cone',args,THREE.ConeGeometry);
const torusGeometry=(...args)=>cachedGeometry('torus',args,THREE.TorusGeometry);
const dodecahedronGeometry=(...args)=>cachedGeometry('dodecahedron',args,THREE.DodecahedronGeometry);
const octahedronGeometry=(...args)=>cachedGeometry('octahedron',args,THREE.OctahedronGeometry);
const planeGeometry=(...args)=>cachedGeometry('plane',args,THREE.PlaneGeometry);
const circleGeometry=(...args)=>cachedGeometry('circle',args,THREE.CircleGeometry);
const ringGeometry=(...args)=>cachedGeometry('ring',args,THREE.RingGeometry);
const distanceTickScheduler=createDistanceTickScheduler({
  nearHz:qualityProfile.nearAiHz,
  midHz:qualityProfile.midAiHz,
  farHz:qualityProfile.farAiHz,
});
const labelTickScheduler=createDistanceTickScheduler({
  nearDistance:8,
  midDistance:14,
  nearHz:qualityProfile.labelHz,
  midHz:Math.max(4,qualityProfile.labelHz/2),
  farHz:2,
});
const managerDirty=createDirtyGate({initial:false,minIntervalMs:250});

function safeVec3(v,x=0,y=0,z=0){
  if(v && typeof v.clone==='function') return v.clone();
  if(v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) return new THREE.Vector3(v.x,v.y,v.z);
  return new THREE.Vector3(x,y,z);
}
function ensureDirection(v){
  if(v && typeof v.clone==='function' && v.lengthSq()>0.000001) return v;
  const d=new THREE.Vector3(Math.random()-.5,0,Math.random()-.5);
  if(d.lengthSq()<0.000001)d.set(0,0,-1);
  return d.normalize();
}

const el=id=>document.getElementById(id);
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const rand=a=>a[Math.floor(Math.random()*a.length)];
const nowMs=()=>Date.now();
const fmt=n=>Math.max(0,Math.round(n));
function ensureCombatHudSemantics(){
  const status=document.querySelector('#hud .topbar');
  if(status){
    status.classList.add('status-strip');
    status.setAttribute('role','group');
    status.setAttribute('aria-label','สถานะผู้เล่นและการออกล่า');
  }
  const target=el('targetCard');
  if(target){
    target.setAttribute('role','group');
    target.setAttribute('aria-labelledby','targetName');
  }
  const hpBar=el('targetHpBar');
  if(hpBar){
    hpBar.setAttribute('role','progressbar');
    hpBar.setAttribute('aria-label','HP เป้าหมาย');
    hpBar.setAttribute('aria-valuemin','0');
    hpBar.setAttribute('aria-valuemax','100');
    hpBar.setAttribute('aria-valuenow','100');
  }
  const party=el('party');
  if(party){
    party.setAttribute('role','group');
    party.setAttribute('aria-label','Party 3 ช่อง');
  }
  let reason=el('actionReason');
  if(!reason){
    reason=document.createElement('div');
    reason.id='actionReason';
    reason.className='action-reason';
    reason.setAttribute('role','status');
    reason.setAttribute('aria-live','polite');
    reason.textContent='อยู่ Ranch • ออกไป Wild Zone ก่อน';
    document.querySelector('.controls-right')?.insertAdjacentElement('afterend',reason);
  }
  for(const id of ['skill1Btn','skill2Btn','skill3Btn','captureBtn','summonBtn','recallBtn']){
    const button=el(id);
    if(!button)continue;
    button.type='button';
    button.setAttribute('aria-describedby','actionReason');
  }
}
ensureCombatHudSemantics();

// ---------- 18-Type system ----------
const TYPES=['Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];
const TYPE_TH={Normal:'ปกติ',Fire:'ไฟ',Water:'น้ำ',Electric:'สายฟ้า',Grass:'พืช',Ice:'น้ำแข็ง',Fighting:'ต่อสู้',Poison:'พิษ',Ground:'ดิน',Flying:'บิน',Psychic:'จิต',Bug:'แมลง',Rock:'หิน',Ghost:'วิญญาณ',Dragon:'มังกร',Dark:'มืด',Steel:'เหล็ก',Fairy:'ภูต'};
const TYPE_COLOR={Normal:'#8a8a78',Fire:'#ef6c32',Water:'#4f87e8',Electric:'#e8bd22',Grass:'#63b34b',Ice:'#79c9c9',Fighting:'#b9342c',Poison:'#93489e',Ground:'#cba94e',Flying:'#8d7cdb',Psychic:'#ec4d7f',Bug:'#9cab25',Rock:'#a48e38',Ghost:'#61568f',Dragon:'#6a45d3',Dark:'#584b43',Steel:'#8e8eaa',Fairy:'#dc87b8'};
const TYPE_CHART={
  Normal:{Rock:.5,Ghost:0,Steel:.5},Fire:{Fire:.5,Water:.5,Grass:2,Ice:2,Bug:2,Rock:.5,Dragon:.5,Steel:2},Water:{Fire:2,Water:.5,Grass:.5,Ground:2,Rock:2,Dragon:.5},
  Electric:{Water:2,Electric:.5,Grass:.5,Ground:0,Flying:2,Dragon:.5},Grass:{Fire:.5,Water:2,Grass:.5,Poison:.5,Ground:2,Flying:.5,Bug:.5,Rock:2,Dragon:.5,Steel:.5},
  Ice:{Fire:.5,Water:.5,Grass:2,Ice:.5,Ground:2,Flying:2,Dragon:2,Steel:.5},Fighting:{Normal:2,Ice:2,Poison:.5,Flying:.5,Psychic:.5,Bug:.5,Rock:2,Ghost:0,Dark:2,Steel:2,Fairy:.5},
  Poison:{Grass:2,Poison:.5,Ground:.5,Rock:.5,Ghost:.5,Steel:0,Fairy:2},Ground:{Fire:2,Electric:2,Grass:.5,Poison:2,Flying:0,Bug:.5,Rock:2,Steel:2},
  Flying:{Electric:.5,Grass:2,Fighting:2,Bug:2,Rock:.5,Steel:.5},Psychic:{Fighting:2,Poison:2,Psychic:.5,Dark:0,Steel:.5},Bug:{Fire:.5,Grass:2,Fighting:.5,Poison:.5,Flying:.5,Psychic:2,Ghost:.5,Dark:2,Steel:.5,Fairy:.5},
  Rock:{Fire:2,Ice:2,Fighting:.5,Ground:.5,Flying:2,Bug:2,Steel:.5},Ghost:{Normal:0,Psychic:2,Ghost:2,Dark:.5},Dragon:{Dragon:2,Steel:.5,Fairy:0},Dark:{Fighting:.5,Psychic:2,Ghost:2,Dark:.5,Fairy:.5},
  Steel:{Fire:.5,Water:.5,Electric:.5,Ice:2,Rock:2,Steel:.5,Fairy:2},Fairy:{Fire:.5,Fighting:2,Poison:.5,Dragon:2,Dark:2,Steel:.5}
};
function typeEffectiveness(moveType,defTypes){ return defTypes.filter(Boolean).reduce((m,t)=>m*(TYPE_CHART[moveType]?.[t]??1),1); }
function typeBadge(type){ return `<span class="type-badge" style="background:${TYPE_COLOR[type]||'#64748b'}">${TYPE_TH[type]||type}</span>`; }
function effectLabel(mult){ if(mult===0)return ['ไม่มีผล','none']; if(mult>=4)return [`แรงมาก ${mult}×`,'super']; if(mult>1)return [`ได้เปรียบ ${mult}×`,'super']; if(mult<1)return [`ต้าน ${mult}×`,'weak']; return ['ปกติ 1×','none']; }

// ---------- Scene ----------
const scene=new THREE.Scene();
const groundTexCache=new Map();
const skyTexCache=new Map();
function canvasTexFromRgba(img){
  const canvas=document.createElement('canvas');
  canvas.width=img.width; canvas.height=img.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const data=ctx.createImageData(img.width,img.height);
  data.data.set(img.rgba);
  ctx.putImageData(data,0,0);
  const tex=new THREE.CanvasTexture(canvas);
  tex.magFilter=THREE.NearestFilter;
  tex.minFilter=THREE.NearestFilter;
  tex.generateMipmaps=false;
  tex.needsUpdate=true;
  if(THREE.SRGBColorSpace) tex.colorSpace=THREE.SRGBColorSpace;
  return tex;
}
function makeGroundTexture(zoneColor, zoneType='grass'){
  const key=zoneColor+':'+zoneType;
  if(groundTexCache.has(key)) return groundTexCache.get(key);
  const tex=canvasTexFromRgba(paintGroundGrid(zoneColor, zoneType));
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.repeat.set(20,20);
  groundTexCache.set(key,tex);
  return tex;
}
function makeSkyTexture(zoneColor){
  if(skyTexCache.has(zoneColor)) return skyTexCache.get(zoneColor);
  const tex=canvasTexFromRgba(paintSkyGradient(zoneColor));
  tex.magFilter=THREE.LinearFilter;
  tex.minFilter=THREE.LinearFilter;
  tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;
  skyTexCache.set(zoneColor,tex);
  return tex;
}
scene.background=makeSkyTexture(0x72c7ef);
scene.fog=new THREE.Fog(0x65c9f5,30,76);
const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,130);
const renderer=new THREE.WebGLRenderer({antialias:qualityProfile.antialias,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,qualityProfile.maxDpr));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=qualityProfile.shadows;
el('game').appendChild(renderer.domElement);

const hemi=new THREE.HemisphereLight(0xffffff,0x42643d,1.55); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,2.15); sun.position.set(9,18,8); sun.castShadow=qualityProfile.shadows;
if(qualityProfile.shadows){
  sun.shadow.mapSize.set(1024,1024);
  sun.shadow.camera.near=.5; sun.shadow.camera.far=64;
  sun.shadow.camera.left=-28; sun.shadow.camera.right=28;
  sun.shadow.camera.top=28; sun.shadow.camera.bottom=-28;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
}
scene.add(sun);
const ground=new THREE.Mesh(planeGeometry(90,90),new THREE.MeshStandardMaterial({map:makeGroundTexture(0x62c96b,'grass'),color:0xffffff,roughness:1}));
ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);

const decorations=new THREE.Group(); decorations.name='worldDecorations'; scene.add(decorations);
function addDeco(mesh){
  mesh.traverse(obj=>{ if(obj.isMesh){ obj.castShadow=true; obj.receiveShadow=true; } });
  decorations.add(mesh); return mesh;
}
function makeRock(x,z,s=1,tone=0x945a38){
  const cluster=new THREE.Group();
  const main=new THREE.Mesh(boxGeometry(s,s*.8,s*.9),mat(tone,.95,.04));
  main.position.y=s*.4; main.scale.set(1,1.28,1.08); cluster.add(main);
  const side=new THREE.Mesh(boxGeometry(s*.5,s*.4,s*.5),mat(tone,.98,.02));
  side.position.set(s*.55,s*.2,s*.18); side.scale.set(1.1,.8,1); cluster.add(side);
  const pebble=new THREE.Mesh(boxGeometry(s*.25,s*.2,s*.25),mat(tone,.99,0));
  pebble.position.set(-s*.48,s*.1,-s*.22); cluster.add(pebble);
  cluster.position.set(x,0,z); cluster.rotation.y=(x*1.7+z)*.15; addDeco(cluster); return cluster;
}
function makeTree(x,z,s=1,{trunk=0x754428,leaf=0x18753a,fruit=null}={}){
  const g=new THREE.Group();
  const bole=new THREE.Mesh(boxGeometry(.22*s,1.55*s,.22*s),mat(trunk,.88,.02));
  bole.position.y=.78*s; g.add(bole);
  const mid=new THREE.Mesh(boxGeometry(1.05*s,1*s,1.05*s),mat(leaf,.78,.03));
  mid.position.y=1.65*s; g.add(mid);
  const top=new THREE.Mesh(boxGeometry(.72*s,.7*s,.72*s),mat(leaf,.7,.04));
  top.position.y=2.35*s; g.add(top);
  if(fruit){
    for(const [fx,fy,fz] of [[.35,1.5,.2],[-.28,1.7,-.15],[.1,1.95,.32]]){
      const berry=new THREE.Mesh(boxGeometry(.1*s,.1*s,.1*s),glowMat(fruit,fruit,.06,.55,.08));
      berry.position.set(fx*s,fy*s,fz*s); g.add(berry);
    }
  }
  g.position.set(x,0,z); g.rotation.y=(x*1.3+z)*.08; addDeco(g); return g;
}
function makeGrassTuft(x,z,s=1,color=0x3f9d4a){
  const g=new THREE.Group();
  for(const [dx,h,tilt] of [[-.06,.28,.18],[.05,.34,-.12],[0,.22,.04]]){
    const blade=new THREE.Mesh(boxGeometry(.05*s,h*s,.05*s),mat(color,.86,0));
    blade.position.set(dx*s,h*.5*s,0); blade.rotation.z=tilt; g.add(blade);
  }
  g.position.set(x,0,z); addDeco(g); return g;
}
function makeStalagmite(x,z,s=1){
  const g=new THREE.Group();
  const base=new THREE.Mesh(boxGeometry(.6*s,.5*s,.6*s),mat(0x64748b,.92,.08));
  base.position.y=.25*s; g.add(base);
  const mid=new THREE.Mesh(boxGeometry(.35*s,.5*s,.35*s),mat(0x94a3b8,.85,.1));
  mid.position.y=.75*s; g.add(mid);
  const tip=new THREE.Mesh(boxGeometry(.15*s,.4*s,.15*s),glowMat(0x94a3b8,0x4a90d9,.04,.78,.12));
  tip.position.y=1.2*s; g.add(tip);
  g.position.set(x,0,z); addDeco(g); return g;
}
function makeFencePost(x,z){
  const post=new THREE.Mesh(boxGeometry(.1,.7,.1),mat(0x8b5e34,.86,.02));
  post.position.set(x,.35,z); addDeco(post); return post;
}
function makeFlower(x,z,color=0xf472b6){
  const g=new THREE.Group();
  const stem=new THREE.Mesh(boxGeometry(.03,.22,.03),mat(0x4ade80,.8,0));
  stem.position.y=.11; g.add(stem);
  const bloom=new THREE.Mesh(boxGeometry(.12,.1,.12),glowMat(color,color,.08,.5,.04));
  bloom.position.y=.24; g.add(bloom);
  g.position.set(x,0,z); g.rotation.y=(x*2.1+z)*.31; addDeco(g); return g;
}
function clearDecorations(){
  while(decorations.children.length) removeAndDispose(decorations,decorations.children[0]);
}
function populateWorld(zone='hub'){
  clearDecorations();
  if(zone==='hub'){
    [[8,7,1.35],[-11,8,1.05],[16,-10,1.5],[-17,-8,1.25],[3,-19,1.7],[-5,17,1.15]].forEach(v=>makeRock(...v));
    [[-7,-12,1,{fruit:0xef4444}],[10,-16,1.15],[14,13,.95,{fruit:0xfacc15}],[-15,14,1.05],[20,3,1],[-21,-2,1.15]].forEach(([x,z,s,opt])=>makeTree(x,z,s,opt||{}));
    for(let i=0;i<10;i++){
      const a=i/10*Math.PI*2;
      makeFencePost(7+Math.cos(a)*3.55,3+Math.sin(a)*3.55);
    }
    [[6.2,1.4],[8.4,4.6],[5.1,4.8],[4.4,7.4]].forEach(([x,z])=>makeFlower(x,z));
    [[2,2],[9,5],[-3,4],[11,1]].forEach(([x,z])=>makeGrassTuft(x,z,.9));
  }else if(zone==='grassland'){
    [[-14,8,1.2],[12,-12,1.4],[18,6,1.1],[-16,-9,1.3],[7,14,1.5],[-6,-16,1.2]].forEach(v=>makeRock(...v));
    [[-9,-11,1.1,{leaf:0x22c55e}],[11,-15,1.25,{leaf:0x16a34a,fruit:0xf97316}],[15,11,1,{leaf:0x15803d}],[-13,13,1.15],[19,2,1.05],[-20,-3,1.2,{fruit:0xef4444}],[3,-18,1.3]].forEach(([x,z,s,opt])=>makeTree(x,z,s,opt||{}));
    for(const [x,z] of [[-5,-5],[2,-8],[8,-3],[-8,4],[5,6],[-2,-14],[10,3],[-12,-2]]) makeGrassTuft(x,z,1+((x+z)&1)*.2);
    makeFlower(-1,-6,0xfacc15); makeFlower(4,-11,0xfb7185); makeFlower(-7,2,0xa78bfa);
  }else if(zone==='cave'){
    [[-10,6,1.4,0x57534e],[9,-7,1.6,0x44403c],[14,4,1.2,0x78716c],[-15,-5,1.5,0x57534e],[3,-15,1.8,0x3f3f46],[-4,16,1.3,0x52525b]].forEach(v=>makeRock(...v));
    [[-8,-4,1.1],[6,-9,1.3],[-12,9,1.4],[11,8,1.2],[0,-12,1.6],[15,-2,1],[-6,12,1.25]].forEach(v=>makeStalagmite(...v));
  }
}
populateWorld('hub');
function makePad(x,z,halfSize,color,opacity=.2){
  const disk=new THREE.Mesh(boxGeometry(halfSize*2,.02,halfSize*2),new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide}));
  disk.position.set(x,.025,z); scene.add(disk);
  const ring=new THREE.Group(); ring.position.set(x,0,z);
  const edgeMat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85});
  for(const [w,d,ox,oz] of [[halfSize*2,.04,0,-halfSize],[halfSize*2,.04,0,halfSize],[.04,halfSize*2,-halfSize,0],[.04,halfSize*2,halfSize,0]]){
    const edge=new THREE.Mesh(boxGeometry(w,.04,d),edgeMat);
    edge.position.set(ox,.03,oz); ring.add(edge);
  }
  for(const [ex,ez] of [[-halfSize,-halfSize],[halfSize,-halfSize],[-halfSize,halfSize],[halfSize,halfSize]]){
    const post=new THREE.Mesh(boxGeometry(.08,.08,.08),edgeMat);
    post.position.set(ex,.04,ez); ring.add(post);
  }
  scene.add(ring); return {disk,ring};
}
const ranchCenter=new THREE.Vector3(7,0,3);
const ranchPad=makePad(7,3,3.4,0x22c55e,.42);
const breedingPad=makePad(5.2,8.2,1.6,0xec4899,.15);
const incubator=new THREE.Group();
const baseInc=new THREE.Mesh(boxGeometry(.9,.35,.9),new THREE.MeshStandardMaterial({color:0x6d28d9,metalness:.2,roughness:.6})); baseInc.position.y=.18; baseInc.castShadow=true; baseInc.receiveShadow=true; incubator.add(baseInc);
const eggVisual=new THREE.Mesh(boxGeometry(.5,.65,.45),new THREE.MeshStandardMaterial({color:0xfde68a,emissive:0x7c2d12,emissiveIntensity:.15})); eggVisual.scale.y=1.28; eggVisual.position.y=.72; eggVisual.castShadow=true; incubator.add(eggVisual);
incubator.position.set(5.2,0,8.2); scene.add(incubator);

// ---------- Monster species, skills, evolution ----------
// skill target kinds kept explicit for regression guards: targetType:'enemy' targetType:'area' targetType:'self'
function move(name,type,power,targetType='enemy',extra={}){ return Object.assign({name,type,power,targetType,range:5.5,cooldown:4},extra); }
function mkSpecies({id,name,color,types,base,capture=.5,group='Field',genderMode='mixed',allowedSecondary=[],traits=['Balanced','Curious','Healthy'],skills,evo}){
  return {id,name,color,types,base,capture,breedingGroup:group,genderMode,allowedSecondary,traitPool:traits,skills,evolutionPaths:[evo]};
}
const species=[
  mkSpecies({id:'normalooze',name:'Plain Slime',color:0xc3b7a1,types:['Normal'],base:{hp:82,atk:11,def:11,spd:10},capture:.62,group:'Field',traits:['Balanced','Friendly','Patient'],skills:[
    move('Tackle','Normal',24),move('Echo Pound','Normal',18,'area',{range:3,cooldown:6}),move('Focus Pose','Normal',0,'self',{effect:'buffAtk',value:1.20,duration:5,cooldown:8})
  ],evo:{id:'plainpup',name:'Plainpup',form:'plainpup',color:0xd9ceb8,scale:1.02,statMods:{hp:1.10,atk:1.10,def:1.08,spd:1.06},requires:{level:2}}}),
  mkSpecies({id:'flameling',name:'Flare Slime',color:0xef6c32,types:['Fire'],base:{hp:74,atk:15,def:9,spd:12},capture:.56,group:'Field',traits:['Fireborn','Quick Learner','Warm Heart'],skills:[
    move('Flame Burst','Fire',28),move('Fire Ring','Fire',20,'area',{range:2.8,cooldown:6}),move('Warm Up','Fire',0,'self',{effect:'buffAtk',value:1.28,duration:5,cooldown:8})
  ],evo:{id:'flameling_lv2',name:'Flameling',form:'flameling',color:0xff6b35,scale:1.04,statMods:{hp:1.08,atk:1.18,def:1.06,spd:1.10},requires:{level:2}}}),
  mkSpecies({id:'aquapuff',name:'Aqua Slime',color:0x4f87e8,types:['Water'],base:{hp:84,atk:12,def:12,spd:11},capture:.58,group:'Field',traits:['Water Veil','Calm Mind','Healthy'],skills:[
    move('Bubble Lance','Water',26),move('Tidal Splash','Water',19,'area',{range:3.2,cooldown:6}),move('Water Veil','Water',0,'self',{effect:'shield',value:.45,duration:5,cooldown:8})
  ],evo:{id:'aquapuff_lv2',name:'Aquapuff',form:'aquapuff',color:0x4ca8ff,scale:1.04,statMods:{hp:1.15,atk:1.10,def:1.12,spd:1.05},requires:{level:2}}}),
  mkSpecies({id:'voltkit',name:'Volt Slime',color:0xe8bd22,types:['Electric'],base:{hp:68,atk:16,def:8,spd:16},capture:.54,group:'Field',traits:['Fast Runner','Static Fur','Curious'],skills:[
    move('Volt Dash','Electric',29),move('Thunder Field','Electric',18,'area',{range:3.4,cooldown:6}),move('Overcharge','Electric',0,'self',{effect:'buffAtk',value:1.22,duration:6,cooldown:8})
  ],evo:{id:'voltkit_lv2',name:'Voltkit',form:'voltkit',color:0xffd84d,scale:1.04,statMods:{hp:1.07,atk:1.14,def:1.04,spd:1.22},requires:{level:2}}}),
  mkSpecies({id:'mossbun',name:'Moss Slime',color:0x63b34b,types:['Grass'],base:{hp:92,atk:10,def:14,spd:9},capture:.61,group:'Field',traits:['Tough Skin','Gentle','Regrowth'],skills:[
    move('Leaf Pulse','Grass',24),move('Seed Burst','Grass',17,'area',{range:3.2,cooldown:6}),move('Regrowth','Grass',0,'self',{effect:'heal',value:.28,cooldown:8})
  ],evo:{id:'mossbun_lv2',name:'Mossbun',form:'mossbun',color:0x65c466,scale:1.03,statMods:{hp:1.16,atk:1.06,def:1.17,spd:1.03},requires:{level:2}}}),
  mkSpecies({id:'frostowl',name:'Frost Slime',color:0x79c9c9,types:['Ice'],base:{hp:76,atk:13,def:10,spd:15},capture:.55,group:'Avian',traits:['Cold Blood','Sharp Eye','Patient'],skills:[
    move('Frost Wing','Ice',30),move('Hail Sweep','Ice',20,'area',{range:3.3,cooldown:6}),move('Ice Guard','Ice',0,'self',{effect:'shield',value:.48,duration:5,cooldown:8})
  ],evo:{id:'frostowl_lv2',name:'Frostowl',form:'frostowl',color:0xb8edff,scale:1.03,statMods:{hp:1.08,atk:1.10,def:1.08,spd:1.18},requires:{level:2}}}),
  mkSpecies({id:'punchcub',name:'Brawl Slime',color:0xb9342c,types:['Fighting'],base:{hp:88,atk:16,def:11,spd:11},capture:.57,group:'Field',traits:['Brave','Fierce','Persistent'],skills:[
    move('Combo Punch','Fighting',30),move('Shockwave Kick','Fighting',21,'area',{range:3,cooldown:6}),move('Battle Cry','Fighting',0,'self',{effect:'buffAtk',value:1.24,duration:5,cooldown:8})
  ],evo:{id:'punchcub_lv2',name:'Punchcub',form:'punchcub',color:0xcc5a50,scale:1.04,statMods:{hp:1.12,atk:1.16,def:1.08,spd:1.05},requires:{level:2}}}),
  mkSpecies({id:'toxitoad',name:'Venom Slime',color:0x93489e,types:['Poison'],base:{hp:80,atk:12,def:11,spd:12},capture:.58,group:'Amphibian',traits:['Toxic Skin','Tricky','Calm Mind'],skills:[
    move('Toxic Spit','Poison',25),move('Venom Cloud','Poison',19,'area',{range:3.2,cooldown:6}),move('Acid Skin','Poison',0,'self',{effect:'shield',value:.42,duration:5,cooldown:8})
  ],evo:{id:'toxitoad_lv2',name:'Toxitoad',form:'toxitoad',color:0xa855b5,scale:1.03,statMods:{hp:1.10,atk:1.08,def:1.12,spd:1.08},requires:{level:2}}}),
  mkSpecies({id:'sandmole',name:'Terra Slime',color:0xcba94e,types:['Ground'],base:{hp:90,atk:13,def:13,spd:9},capture:.59,group:'Field',traits:['Dig Fast','Sturdy','Patient'],skills:[
    move('Mud Shot','Ground',27),move('Quake Ring','Ground',20,'area',{range:3.2,cooldown:6}),move('Sand Guard','Ground',0,'self',{effect:'shield',value:.50,duration:5,cooldown:8})
  ],evo:{id:'sandmole_lv2',name:'Sandmole',form:'sandmole',color:0xd8bb73,scale:1.03,statMods:{hp:1.14,atk:1.10,def:1.15,spd:1.02},requires:{level:2}}}),
  mkSpecies({id:'galebird',name:'Aero Slime',color:0x8d7cdb,types:['Flying'],base:{hp:72,atk:12,def:9,spd:16},capture:.57,group:'Avian',traits:['Light Step','Sharp Eye','Curious'],skills:[
    move('Gust Peck','Flying',27),move('Feather Storm','Flying',19,'area',{range:3.4,cooldown:6}),move('Wind Focus','Flying',0,'self',{effect:'buffAtk',value:1.18,duration:6,cooldown:8})
  ],evo:{id:'galebird_lv2',name:'Galebird',form:'galebird',color:0xa78bfa,scale:1.03,statMods:{hp:1.05,atk:1.10,def:1.03,spd:1.22},requires:{level:2}}}),
  mkSpecies({id:'mindcoon',name:'Mind Slime',color:0xec4d7f,types:['Psychic'],base:{hp:78,atk:14,def:10,spd:13},capture:.56,group:'Field',traits:['Wise','Focused','Calm Mind'],skills:[
    move('Mind Bolt','Psychic',28),move('Psy Wave','Psychic',20,'area',{range:3.4,cooldown:6}),move('Inner Focus','Psychic',0,'self',{effect:'heal',value:.24,cooldown:8})
  ],evo:{id:'mindcoon_lv2',name:'Mindcoon',form:'mindcoon',color:0xf472b6,scale:1.03,statMods:{hp:1.08,atk:1.12,def:1.08,spd:1.12},requires:{level:2}}}),
  mkSpecies({id:'buglet',name:'Bug Slime',color:0x9cab25,types:['Bug'],base:{hp:78,atk:12,def:11,spd:13},capture:.60,group:'Bug',genderMode:'genderless',traits:['Swarm Spirit','Hard Worker','Sturdy'],skills:[
    move('Pin Bite','Bug',26),move('Swarm Spin','Bug',18,'area',{range:3,cooldown:6}),move('Carapace Boost','Bug',0,'self',{effect:'shield',value:.40,duration:5,cooldown:8})
  ],evo:{id:'buglet_lv2',name:'Beetling',form:'buglet',color:0xb6c833,scale:1.03,statMods:{hp:1.10,atk:1.10,def:1.12,spd:1.08},requires:{level:2}}}),
  mkSpecies({id:'rockhorn',name:'Rock Slime',color:0xa48e38,types:['Rock'],base:{hp:100,atk:13,def:16,spd:7},capture:.58,group:'Monster',traits:['Tough Skin','Sturdy','Patient'],skills:[
    move('Stone Crash','Rock',29),move('Pebble Burst','Rock',20,'area',{range:3,cooldown:6}),move('Rock Guard','Rock',0,'self',{effect:'shield',value:.55,duration:5,cooldown:8})
  ],evo:{id:'rockhorn_lv2',name:'Rockhorn',form:'rockhorn',color:0xb89b45,scale:1.05,statMods:{hp:1.16,atk:1.10,def:1.18,spd:1.00},requires:{level:2}}}),
  mkSpecies({id:'ghostpurr',name:'Spirit Slime',color:0x61568f,types:['Ghost'],base:{hp:70,atk:15,def:9,spd:14},capture:.55,group:'Mystic',genderMode:'genderless',traits:['Night Hunter','Quiet','Tricky'],skills:[
    move('Phantom Paw','Ghost',28),move('Haunt Pulse','Ghost',20,'area',{range:3.2,cooldown:6}),move('Fade Veil','Ghost',0,'self',{effect:'shield',value:.44,duration:5,cooldown:8})
  ],evo:{id:'ghostpurr_lv2',name:'Ghostpurr',form:'ghostpurr',color:0x8b7ad3,scale:1.03,statMods:{hp:1.06,atk:1.14,def:1.04,spd:1.16},requires:{level:2}}}),
  mkSpecies({id:'emberdrake',name:'Drake Slime',color:0x6a45d3,types:['Dragon'],base:{hp:104,atk:18,def:13,spd:12},capture:.50,group:'Dragon',traits:['Ancient Blood','Fierce','Proud'],skills:[
    move('Dragon Flame','Dragon',34),move('Scale Burst','Dragon',22,'area',{range:3.3,cooldown:6.2}),move('Ancient Rage','Dragon',0,'self',{effect:'buffAtk',value:1.30,duration:5,cooldown:9})
  ],evo:{id:'emberdrake_lv2',name:'Emberdrake',form:'emberdrake',color:0xe45236,scale:1.06,statMods:{hp:1.14,atk:1.20,def:1.10,spd:1.08},requires:{level:2}}}),
  mkSpecies({id:'voidhorn',name:'Shadow Slime',color:0x584b43,types:['Dark'],base:{hp:96,atk:16,def:12,spd:12},capture:.54,group:'Monster',genderMode:'genderless',traits:['Night Hunter','Fierce','Sharp Eye'],skills:[
    move('Night Crash','Dark',31),move('Shadow Burst','Dark',21,'area',{range:3.2,cooldown:6}),move('Void Guard','Dark',0,'self',{effect:'shield',value:.50,duration:6,cooldown:9})
  ],evo:{id:'voidhorn_lv2',name:'Voidhorn',form:'voidhorn',color:0x9b5de5,scale:1.06,statMods:{hp:1.14,atk:1.18,def:1.10,spd:1.06},requires:{level:2}}}),
  mkSpecies({id:'ironbug',name:'Metal Slime',color:0x8e8eaa,types:['Steel'],base:{hp:102,atk:12,def:18,spd:7},capture:.57,group:'Machine',genderMode:'genderless',traits:['Iron Shell','Hard Worker','Sturdy'],skills:[
    move('Steel Cutter','Steel',31),move('Metal Swarm','Steel',18,'area',{range:3,cooldown:6}),move('Iron Shell','Steel',0,'self',{effect:'shield',value:.58,duration:6,cooldown:8})
  ],evo:{id:'ironbug_lv2',name:'Ironbug',form:'ironbug',color:0x8ea0ad,scale:1.04,statMods:{hp:1.14,atk:1.08,def:1.22,spd:1.00},requires:{level:2}}}),
  mkSpecies({id:'fairimp',name:'Fairy Slime',color:0xdc87b8,types:['Fairy'],base:{hp:78,atk:12,def:10,spd:13},capture:.60,group:'Mystic',traits:['Gentle','Lucky','Warm Heart'],skills:[
    move('Fairy Spark','Fairy',26),move('Star Dust','Fairy',18,'area',{range:3.2,cooldown:6}),move('Blessing','Fairy',0,'self',{effect:'heal',value:.26,cooldown:8})
  ],evo:{id:'fairimp_lv2',name:'Fairimp',form:'fairimp',color:0xf9a8d4,scale:1.03,statMods:{hp:1.08,atk:1.08,def:1.08,spd:1.14},requires:{level:2}}})
];
applySpeciesProgression(species);
const spById=Object.fromEntries(species.map(s=>[s.id,s]));
const personalities=['Brave','Calm','Playful','Lazy','Aggressive','Curious'];
const POTENTIALS=['D','C','B','A','S'];
// V7.2 Balance Foundation gene scale: narrow 8% spread (D=0.96 → S=1.04)
const POTENTIAL_MOD={D:0.96, C:0.98, B:1.00, A:1.02, S:1.04};
const GENE_RANKS=['D','C','B','A','S'];
const TRAIN_FOCUS={power:'Power',defense:'Defense',speed:'Speed',technique:'Technique',spirit:'Spirit'};
const MASTERY_DOTS={novice:'●○○○○',familiar:'●●○○○',skilled:'●●●○○',expert:'●●●●○',master:'●●●●●'};
const MASTERY_TH={novice:'เริ่มต้น',familiar:'คุ้นเคย',skilled:'ชำนาญ',expert:'เชี่ยวชาญ',master:'ระดับปรมาจารย์'};
const MASTERY_ORDER=['novice','familiar','skilled','expert','master'];
const MASTERY_NEXT_TH={novice:'คุ้นเคย',familiar:'ชำนาญ',skilled:'เชี่ยวชาญ',expert:'ปรมาจารย์'};
// V7.2: Training line → stat bonus mapping (applied on levelUp via shared pool)
const TRAIN_STAT_MAP={power:'atk',defense:'def',speed:'spd',technique:'atk',spirit:'hp'};
const GENDER_TH={Male:'♂ Male',Female:'♀ Female',Genderless:'◇ Genderless'};
const RANCH_ACTIVE_MAX=6;
const BREEDING_RECIPES=[]; // future explicit Hybrid recipes only
const BALANCE={eliteCaptureModifier:.34,bossRespawnMs:15000,wildRespawnMs:7000,captureRange:10,captureAimRadius:1.4};

function rollGender(sp){ return sp.genderMode==='genderless'?'Genderless':(Math.random()<.5?'Male':'Female'); }
function getEvolutionPath(inst){ const sp=spById[inst?.speciesId]; return sp?.evolutionPaths?.find(p=>p.id===inst.formId||p.id===inst.evolutionPath)||null; }
function availableEvolutionPaths(inst){ const sp=spById[inst?.speciesId]; if(!sp)return []; const from=inst.formId||sp.id; return (sp.evolutionPaths||[]).filter(p=>(p.fromFormId||sp.id)===from&&p.id!==inst.formId); }
function displayName(inst){ return getEvolutionPath(inst)?.name||spById[inst.speciesId]?.name||'Monster'; }
function monsterTypes(instOrSp){
  if(!instOrSp)return ['Normal'];
  if(instOrSp.instanceId){
    const sp=spById[instOrSp.speciesId],path=getEvolutionPath(instOrSp);
    return [sp.types[0],path?.secondaryType??instOrSp.secondaryType??sp.types[1]].filter(Boolean);
  }
  return instOrSp.types.filter(Boolean);
}
function wildPath(w){ const sp=spById[w?.speciesId]; return sp?.evolutionPaths?.find(p=>p.id===w?.evolutionPath)||null; }
function wildDisplayName(w){ return wildPath(w)?.name||spById[w?.speciesId]?.name||'Monster'; }
function wildTypes(w){ const sp=spById[w?.speciesId]; const path=wildPath(w); return [sp?.types?.[0]||'Normal', path?.secondaryType??sp?.types?.[1]].filter(Boolean); }
function getMonsterSkills(inst){
  const sp=spById[inst.speciesId];
  const moves=(sp?.skills||[]).map(m=>({...m}));
  for(const rec of inst.skills||[]){
    const cand=(SKILL_CANDIDATES[inst.speciesId]||[]).find(c=>c.id===rec.skillId);
    if(cand?.replaces){
      const idx=moves.findIndex(m=>m.name===cand.replaces);
      if(idx>=0)moves[idx]={...moves[idx],...cand.move};
    }
    const mut=(SKILL_MUTATIONS[rec.skillId]||[]).find(x=>x.id===rec.mutationId);
    if(mut?.move){
      const idx=moves.findIndex(m=>m.name===rec.skillId||m.name===cand?.move?.name);
      if(idx>=0)moves[idx]={...moves[idx],...mut.move,name:mut.name||moves[idx].name};
    }
  }
  return moves;
}
function randomGenes(sp){ return {hp:rand(POTENTIALS),atk:rand(POTENTIALS),def:rand(POTENTIALS),spd:rand(POTENTIALS),trait:rand(sp.traitPool),skillGene:sp.skills[0].name,typeAffinity:sp.types[0]}; }
function lifeStageFor(inst){ if(inst.origin==='bred'&&inst.level<=1)return 'Baby'; if(inst.level<=2)return 'Juvenile'; if(inst.level<6)return 'Adult'; return 'Mature'; }
function statValue(base,level,pot,scale,bonus=0){ return Math.max(1,Math.round(base*(1+(level-1)*scale)*(POTENTIAL_MOD[pot]||1)+bonus)); }
function refreshStats(inst,heal=false){
  const sp=spById[inst.speciesId]; if(!sp)return;
  syncToBodyMind(inst);
  inst.trainingBonus=inst.trainingBonus||{hp:0,atk:0,def:0,spd:0};
  inst.training=inst.training||{power:0,defense:0,speed:0,technique:0,spirit:0};
  inst._condition=deriveCondition(inst);
  const path=getEvolutionPath(inst);
  const computed=computeCoreStats(inst,sp,path,getEquipmentFlat(inst));
  inst.statBreakdown=computed.breakdown;
  applyComputedStats(inst,computed.stats,{heal});
  inst.lifeStage=lifeStageFor(inst);
  syncFromBodyMind(inst);
}
function makeInstance(sp,level=1,opts={}){
  const personality=opts.personality||rand(personalities);
  const genes=opts.genes||randomGenes(sp);
  const inst=createInstance({
    instanceId:'m'+Date.now()+'-'+Math.floor(Math.random()*999999),
    speciesId:sp.id,
    formId:opts.evolutionPath||sp.id,
    level,
    growthExp:opts.growthExp??growthExpForLevel(level),
    origin:opts.origin||'captured',
    personality,
    personalityId:personality,
    gender:opts.gender||rollGender(sp),
    genes,
    aptitude:opts.aptitude||sp.aptitudeBase,
    speciesTags:sp.types,
    favoriteTags:sp.favoriteTags||[],
    training:opts.training,
    generation:opts.generation||1,
    parents:{a:opts.parentAId||null,b:opts.parentBId||null},
    parentAId:opts.parentAId||null,
    parentBId:opts.parentBId||null,
    motherId:opts.motherId||null,
    fatherId:opts.fatherId||null,
    secondaryType:opts.secondaryType??sp.types[1]??null,
    evolutionPath:opts.evolutionPath||null,
    evolutionProfile:opts.evolutionPath?evoDefFromPath(sp.evolutionPaths.find(p=>p.id===opts.evolutionPath)||{},sp.id).profile:undefined,
    body:{hunger:opts.hunger??78,energy:opts.energy??82,fitness:opts.fitness??50,health:100},
    mind:{mood:opts.mood??72,bond:opts.bond??24,stress:10,trust:20,discipline:20},
    createdAt:Date.now(),
    fainted:false
  });
  inst.trainingFocus=opts.trainingFocus||'power';
  inst.trainingExp=opts.trainingExp||0;
  inst.trainingBonus=opts.trainingBonus||{hp:0,atk:0,def:0,spd:0};
  inst.exp=inst.growthExp;
  syncFromBodyMind(inst);
  refreshStats(inst,true);
  return inst;
}
function ensureInstanceShape(inst){
  const sp=spById[inst.speciesId]; if(!sp)return inst;
  const normalized=normalizeInstance({
    ...inst,
    formId:inst.formId||inst.evolutionPath||sp.id,
    growthExp:Math.max(inst.growthExp||0,inst.exp||0,growthExpForLevel(inst.level||1)),
    personalityId:inst.personalityId||inst.personality,
    parents:{a:inst.parents?.a??inst.parentAId??null,b:inst.parents?.b??inst.parentBId??null}
  });
  Object.assign(inst,normalized);
  inst.origin=inst.origin||'captured';
  inst.personality=inst.personality||inst.personalityId||rand(personalities);
  inst.gender=inst.gender||rollGender(sp);
  inst.trainingFocus=inst.trainingFocus==='agility'?'speed':(inst.trainingFocus||'power');
  inst.trainingExp=inst.trainingExp||0;
  inst.trainingBonus=inst.trainingBonus||{hp:0,atk:0,def:0,spd:0};
  inst.parentAId=inst.parentAId||inst.parents?.a||null;
  inst.parentBId=inst.parentBId||inst.parents?.b||null;
  inst.secondaryType=inst.secondaryType??sp.types[1]??null;
  inst.evolutionPath=inst.evolutionPath||null;
  if(inst.level>1&&(inst.growthExp||0)<growthExpForLevel(inst.level))inst.growthExp=growthExpForLevel(inst.level);
  inst.exp=inst.growthExp;
  syncFromBodyMind(inst);
  refreshStats(inst,false);
  return inst;
}

// ---------- Monster mesh / refined animal / trainer assets ----------
function mat(color,rough=.72,metal=.08){
  const key=`standard:${color}:${rough}:${metal}`;
  return sharedResources.material(key,()=>new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal}));
}
function glowMat(color,emissive,intensity,rough=.5,metal=0){
  const key=`glow:${color}:${emissive}:${intensity}:${rough}:${metal}`;
  return sharedResources.material(key,()=>new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:intensity,roughness:rough,metalness:metal}));
}
function basicMat(color){return sharedResources.material(`basic:${color}`,()=>new THREE.MeshBasicMaterial({color}));}
function orb(color,r=0.1,seg=10){ return new THREE.Mesh(sphereGeometry(r,seg,seg),mat(color,.58,.12)); }
function blackEye(scale=.05){ return new THREE.Mesh(sphereGeometry(scale,8,6),basicMat(0x111827)); }
function addEyeSet(group,{y=1.02,z=-.34,spread=.12,size=.045,browColor=null,browTilt=.15}={}){
  for(const x of [-spread,spread]){ const eye=blackEye(size); eye.position.set(x,y,z); group.add(eye); }
  if(browColor!==null){
    for(const x of [-spread,spread]){ const brow=new THREE.Mesh(boxGeometry(.14,.025,.03),mat(browColor,.6,.1)); brow.position.set(x,y+.09,z-.01); brow.rotation.z=x<0?browTilt:-browTilt; group.add(brow); }
  }
}
function addLegs(group,color,scale=1,count=2,width=.14,height=.38,front=.12){
  const xs=count===2?[-.16,.16]:[-.18,.18,-.18,.18];
  const zs=count===2?[front,front]:[front,front,-front,-front];
  for(let i=0;i<xs.length;i++){
    const leg=new THREE.Mesh(cylinderGeometry(width*.62*scale,width*.78*scale,height*scale,7),mat(color,.82,.03));
    leg.position.set(xs[i]*scale,height*.5*scale,zs[i]*scale); leg.castShadow=true; group.add(leg);
  }
}
function addTail(group,color,{scale=1,length=.42,thick=.08,pos=[0,.72,.34],rot=[-.9,0,0],tipColor=null}={}){
  const tail=new THREE.Mesh(cylinderGeometry(thick*.55*scale,thick*scale,length*scale,8),mat(color,.72,.08));
  tail.position.set(pos[0]*scale,pos[1]*scale,pos[2]*scale); tail.rotation.set(rot[0],rot[1],rot[2]); tail.castShadow=true; group.add(tail);
  if(tipColor!==null){ const tip=orb(tipColor,thick*.95*scale,10); tip.position.set(pos[0]*scale,pos[1]*scale+(Math.sin(-rot[0])*length*.48*scale),pos[2]*scale+(Math.cos(rot[0])*length*.48*scale)); tip.castShadow=true; group.add(tip);} 
}
function addEarPair(group,color,{scale=1,height=.28,width=.12,y=1.28,z=0,style='cone',innerColor=null,tilt=.18}={}){
  for(const x of [-.2,.2]){
    let ear;
    if(style==='leaf') ear=new THREE.Mesh(coneGeometry(width*scale,height*scale,6),mat(color,.68,.06));
    else if(style==='bug') ear=new THREE.Mesh(cylinderGeometry(width*.18*scale,width*.18*scale,height*scale,5),mat(color,.75,.08));
    else ear=new THREE.Mesh(coneGeometry(width*scale,height*scale,6),mat(color,.68,.06));
    ear.position.set(x*scale,y*scale,z*scale); ear.rotation.z=x<0?tilt:-tilt; ear.castShadow=true; group.add(ear);
    if(innerColor){ const inner=new THREE.Mesh(coneGeometry(width*.55*scale,height*.72*scale,5),mat(innerColor,.75,.02)); inner.position.set(x*scale,(y+.02)*scale,(z-.01)*scale); inner.rotation.z=ear.rotation.z; group.add(inner); }
  }
}
function addWingPair(group,color,{scale=1,y=.9,z=.05,span=.65,lift=.15}={}){
  for(const x of [-1,1]){
    const wing=new THREE.Mesh(coneGeometry(.34*scale,span*scale,3,1,true),mat(color,.74,.04));
    wing.position.set(.34*x*scale,y*scale,z*scale); wing.rotation.z=x<0?Math.PI*.58:-Math.PI*.58; wing.rotation.x=lift; wing.castShadow=true; group.add(wing);
  }
}
function addFinPair(group,color,{scale=1,y=.68,z=.05,span=.3,back=.18}={}){
  for(const x of [-1,1]){
    const fin=new THREE.Mesh(coneGeometry(.14*scale,span*scale,3),mat(color,.74,.03));
    fin.position.set(.42*x*scale,y*scale,back*scale); fin.rotation.z=x<0?Math.PI*.5:-Math.PI*.5; fin.rotation.x=.3; group.add(fin);
  }
}
function addHorn(group,color,{x=0,y=1.34,z=-.05,scale=1,length=.32,tilt=0,rx=-.15}={}){
  const horn=new THREE.Mesh(coneGeometry(.08*scale,length*scale,7),mat(color,.55,.24));
  horn.position.set(x*scale,y*scale,z*scale); horn.rotation.x=rx; horn.rotation.z=tilt; horn.castShadow=true; group.add(horn); return horn;
}
function addBackSpikes(group,color,{scale=1,count=3,startY=1.0,startZ=.05,gap=.15}={}){
  for(let i=0;i<count;i++){
    const spk=new THREE.Mesh(coneGeometry(.08*scale,.2*scale,5),mat(color,.68,.1));
    spk.position.set(0,(startY+i*.1)*scale,(startZ+i*gap)*scale); spk.rotation.x=Math.PI; spk.castShadow=true; group.add(spk);
  }
}
function addShell(group,color,{scale=1}={}){
  const shell=new THREE.Mesh(sphereGeometry(.38*scale,14,10,0,Math.PI*2,0,Math.PI*.65),mat(color,.6,.25));
  shell.rotation.x=Math.PI; shell.position.set(0,.82*scale,.08*scale); shell.castShadow=true; group.add(shell);
}
function addMuzzle(group,color,{scale=1,y=.95,z=-.42,w=.18,h=.12,d=.14,noseColor=0x1f2937}={}){
  const muz=new THREE.Mesh(sphereGeometry(.14*scale,12,10),mat(color,.8,.02));
  muz.scale.set(w/.14,h/.14,d/.14); muz.position.set(0,y*scale,z*scale); muz.castShadow=true; group.add(muz);
  const nose=new THREE.Mesh(sphereGeometry(.032*scale,8,6),mat(noseColor,.5,.04)); nose.position.set(0,(y+.01)*scale,(z-.08)*scale); group.add(nose);
  return muz;
}
function addCheeks(group,color,{scale=1,y=.93,z=-.34,x=.16,r=.07}={}){ for(const sx of [-1,1]){ const c=orb(color,r*scale,10); c.position.set(sx*x*scale,y*scale,z*scale); group.add(c); } }
function addPaw(group,color,{x=0,y=.14,z=0,scale=1,r=.08}={}){ const paw=orb(color,r*scale,10); paw.position.set(x*scale,y*scale,z*scale); paw.scale.set(1,.65,1.25); paw.castShadow=true; group.add(paw); }
function addPawSet(group,color,{scale=1,count=4,spreadX=.18,frontZ=.18,backZ=-.08,y=.1,r=.075}={}){
  if(count===2){ addPaw(group,color,{x:-spreadX,y,z:frontZ,scale,r}); addPaw(group,color,{x:spreadX,y,z:frontZ,scale,r}); }
  else { addPaw(group,color,{x:-spreadX,y,z:frontZ,scale,r}); addPaw(group,color,{x:spreadX,y,z:frontZ,scale,r}); addPaw(group,color,{x:-spreadX*.92,y,z:backZ,scale,r:r*.95}); addPaw(group,color,{x:spreadX*.92,y,z:backZ,scale,r:r*.95}); }
}
function addWhiskers(group,color,{scale=1,y=.95,z=-.5,len=.16}={}){
  for(const sx of [-1,1]) for(const dy of [-.03,.03]){ const w=new THREE.Mesh(cylinderGeometry(.006*scale,.006*scale,len*scale,4),mat(color,.9,0)); w.rotation.z=sx>0?Math.PI/2.6:-Math.PI/2.6; w.position.set(sx*.17*scale,(y+dy)*scale,z*scale); group.add(w);} }
function addCaptureBall(group,{x=.46,y=.95,z=.02,scale=1}={}){
  const ball=new THREE.Group();
  const top=new THREE.Mesh(sphereGeometry(.12*scale,14,12,0,Math.PI*2,0,Math.PI/2),mat(0xef4444,.55,.08)); top.position.y=.0; ball.add(top);
  const bot=new THREE.Mesh(sphereGeometry(.12*scale,14,12,0,Math.PI*2,Math.PI/2,Math.PI/2),mat(0xf8fafc,.8,.02)); bot.position.y=.0; ball.add(bot);
  const band=new THREE.Mesh(cylinderGeometry(.12*scale,.12*scale,.03*scale,18),mat(0x111827,.45,.1)); band.rotation.z=Math.PI/2; ball.add(band);
  const btn=orb(0xf8fafc,.022*scale,8); btn.position.set(0,0,.12*scale); ball.add(btn);
  ball.position.set(x,y,z); ball.rotation.z=-.25; ball.castShadow=true; group.add(ball); return ball;
}
function addShoulderedArm(group,color,{x=.32,y=1.14,z=.03,upper=.24,lower=.2,thick=.06,handColor=null,side=1,shoulderAngle=.28,elbowAngle=.28,forward=.02,holdBall=false}={}){
  const root=new THREE.Group();
  root.position.set(side*x,y,z);
  root.rotation.x=forward;
  root.rotation.z=side*shoulderAngle;
  group.add(root);

  const shoulder=orb(color,thick*1.02,8);
  root.add(shoulder);

  const upperArm=new THREE.Mesh(capsuleGeometry(thick*.5,upper,4,8),mat(color,.78,.02));
  upperArm.position.set(0,-upper*.34,0);
  upperArm.castShadow=true;
  root.add(upperArm);

  const elbowPivot=new THREE.Group();
  elbowPivot.position.set(0,-upper*.7,.02);
  elbowPivot.rotation.z=side*elbowAngle;
  root.add(elbowPivot);

  const elbow=orb(color,thick*.84,8);
  elbowPivot.add(elbow);

  const foreArm=new THREE.Mesh(capsuleGeometry(thick*.44,lower,4,8),mat(color,.8,.02));
  foreArm.position.set(0,-lower*.34,.01);
  foreArm.castShadow=true;
  elbowPivot.add(foreArm);

  const hand=new THREE.Mesh(sphereGeometry(thick*.82,10,8),mat(handColor||color,.74,.02));
  hand.position.set(side*.008,-lower*.68,.01);
  hand.castShadow=true;
  elbowPivot.add(hand);

  if(holdBall){
    const ball=addCaptureBall(hand,{x:side*.045,y:-.01,z:-.01,scale:.78});
    ball.rotation.z=side>0?-0.5:0.5;
    ball.rotation.x=.22;
  }
  return {root,hand};
}
function makeAnimalBase(color,scale=1,{kind='quadruped',accent=null}={}){
  const g=new THREE.Group();
  let body,head;
  if(kind==='bird'){
    body=new THREE.Mesh(sphereGeometry(.36*scale,16,12),mat(color,.72,.08)); body.scale.set(1,1.06,.98); body.position.y=.58*scale;
    head=new THREE.Mesh(sphereGeometry(.24*scale,14,12),mat(accent||color,.72,.06)); head.position.set(0,.92*scale,-.1*scale);
    addLegs(g,color,scale,2,.07,.28,.1);
    addPawSet(g,0xf6ad31,{count:2,scale,r:.05,spreadX:.12,frontZ:.1,y:.03});
  }else if(kind==='serpent'){
    body=new THREE.Mesh(capsuleGeometry(.25*scale,.50*scale,6,12),mat(color,.72,.08)); body.rotation.z=Math.PI/2; body.position.set(0,.58*scale,.02*scale);
    head=new THREE.Mesh(sphereGeometry(.26*scale,14,12),mat(accent||color,.72,.06)); head.position.set(0,.92*scale,-.26*scale);
    addFinPair(g,color,{scale,y:.56,z:.06,span:.28,back:.2});
  }else{
    body=new THREE.Mesh(capsuleGeometry(.24*scale,.42*scale,6,12),mat(color,.72,.07)); body.rotation.z=Math.PI/2; body.position.set(0,.56*scale,.06*scale);
    head=new THREE.Mesh(sphereGeometry(.26*scale,14,12),mat(accent||color,.7,.06)); head.position.set(0,.88*scale,-.18*scale);
    addLegs(g,color,scale,4,.08,.28,.2);
    addPawSet(g,color,{count:4,scale,r:.07,spreadX:.18,frontZ:.22,backZ:-.02,y:.08});
  }
  body.castShadow=true; head.castShadow=true; g.add(body); g.add(head); return g;
}
function makeSlimeMesh(color,scale=1,type='Normal'){
  const g=new THREE.Group();
  const accentColor=parseInt((TYPE_COLOR[type]||'#ffffff').replace('#',''),16);
  const jelly=(c,opacity=.76)=>new THREE.MeshPhysicalMaterial({color:c,transparent:true,opacity,transmission:.24,thickness:.45*scale,roughness:.18,metalness:0,clearcoat:.45,clearcoatRoughness:.12,emissive:c,emissiveIntensity:.06});
  const body=new THREE.Mesh(sphereGeometry(.46*scale,20,16),jelly(color,.72));
  body.scale.set(1.06,1,.95); body.position.y=.56*scale; body.castShadow=true; body.receiveShadow=true; g.add(body);
  const inner=new THREE.Mesh(sphereGeometry(.28*scale,14,12),new THREE.MeshStandardMaterial({color:accentColor,transparent:true,opacity:.28,roughness:.18,metalness:0,emissive:accentColor,emissiveIntensity:.18}));
  inner.position.set(0,.5*scale,.03*scale); inner.scale.set(.9,.78,.85); g.add(inner);
  const base=new THREE.Mesh(circleGeometry(.42*scale,22),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.12,side:THREE.DoubleSide}));
  base.rotation.x=-Math.PI/2; base.position.y=.03; g.add(base);
  const shine=new THREE.Mesh(sphereGeometry(.16*scale,12,10),new THREE.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:.24,roughness:.08,metalness:0}));
  shine.position.set(-.15*scale,.84*scale,-.17*scale); shine.scale.set(.72,1.12,.5); g.add(shine);
  const sideShine=new THREE.Mesh(sphereGeometry(.09*scale,10,8),new THREE.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:.12,roughness:.08,metalness:0}));
  sideShine.position.set(.14*scale,.6*scale,-.21*scale); sideShine.scale.set(.55,.85,.45); g.add(sideShine);
  addEyeSet(g,{y:.62*scale,z:-.34*scale,spread:.11*scale,size:.04*scale,browColor:type==='Fighting'?0x6b1d1d:null,browTilt:type==='Fighting'?.26:.12});
  const mouth=new THREE.Mesh(torusGeometry(.06*scale,.012*scale,6,12,Math.PI),new THREE.MeshBasicMaterial({color:0x1f2937}));
  mouth.rotation.x=Math.PI/2; mouth.position.set(0,.46*scale,-.37*scale); g.add(mouth);
  const nub=new THREE.Mesh(sphereGeometry(.08*scale,10,8),jelly(color,.78));
  nub.position.set(0,1.0*scale,.02*scale); nub.scale.set(.8,.7,.8); nub.castShadow=true; g.add(nub);
  const crown=new THREE.Mesh(coneGeometry(.08*scale,.22*scale,6),jelly(accentColor,.84));
  crown.position.set(0,1.16*scale,-.03*scale); crown.castShadow=true; g.add(crown);

  const addOrb=(c,r,x,y,z,op=.8)=>{ const o=new THREE.Mesh(sphereGeometry(r*scale,10,8),jelly(c,op)); o.position.set(x*scale,y*scale,z*scale); o.castShadow=true; g.add(o); return o; };
  const addCone=(c,r,h,x,y,z,rx=0,ry=0,rz=0,op=.82)=>{ const o=new THREE.Mesh(coneGeometry(r*scale,h*scale,6),jelly(c,op)); o.position.set(x*scale,y*scale,z*scale); o.rotation.set(rx,ry,rz); o.castShadow=true; g.add(o); return o; };
  const addPlate=(c,w,h,d,x,y,z,rx=0,ry=0,rz=0,op=.84)=>{ const m=new THREE.Mesh(boxGeometry(w*scale,h*scale,d*scale),jelly(c,op)); m.position.set(x*scale,y*scale,z*scale); m.rotation.set(rx,ry,rz); m.castShadow=true; g.add(m); return m; };
  const addRing=(c,r,t,y,z=0,rx=Math.PI/2,op=.65)=>{ const m=new THREE.Mesh(torusGeometry(r*scale,t*scale,8,18),jelly(c,op)); m.position.set(0,y*scale,z*scale); m.rotation.x=rx; g.add(m); return m; };

  switch(type){
    case 'Normal':
      addEarPair(g,0xd6c4a5,{scale,height:.18,width:.085,y:.98,z:-.01,innerColor:0xf8e1cf,tilt:.18});
      addCheeks(g,0xf5c3b1,{scale,y:.51,z:-.31,x:.14,r:.035});
      break;
    case 'Fire':
      addCone(0xff7a2f,.07,.2,-.09,1.05,-.02,-.2,0,.18);
      addCone(0xffc14d,.06,.18,0,1.12,-.03,-.18,0,0);
      addCone(0xff7a2f,.07,.2,.09,1.05,-.02,-.2,0,-.18);
      addCheeks(g,0xff8d5b,{scale,y:.5,z:-.32,x:.14,r:.04});
      break;
    case 'Water':
      addFinPair(g,0x8ed8ff,{scale,y:.55,z:.08,span:.2,back:.02});
      addOrb(0xbfe9ff,.05,0,1.1,-.04,.72);
      break;
    case 'Electric':
      addCone(0xffef66,.055,.18,-.16,.95,-.02,0,0,.85);
      addCone(0xffef66,.055,.18,.16,.95,-.02,0,0,-.85);
      addPlate(0xf7d046,.08,.03,.02,-.21,.6,-.27,0,0,.55,.8);
      addPlate(0xf7d046,.08,.03,.02,.21,.6,-.27,0,0,-.55,.8);
      break;
    case 'Grass':
      addEarPair(g,0x7bdc63,{scale,height:.19,width:.08,y:.98,z:0,style:'leaf',innerColor:0xb8f59d,tilt:.12});
      addOrb(0xf5c542,.03,0,1.08,-.05,.72);
      break;
    case 'Ice':
      addCone(0xdafdff,.05,.14,-.1,1.03,-.02,-.1,0,.22,.76);
      addCone(0xdafdff,.05,.18,0,1.11,-.03,-.06,0,0,.76);
      addCone(0xdafdff,.05,.14,.1,1.03,-.02,-.1,0,-.22,.76);
      break;
    case 'Fighting':
      addOrb(0xd84c43,.05,-.17,.52,-.25,.82).scale.set(1.2,.75,1.2);
      addOrb(0xd84c43,.05,.17,.52,-.25,.82).scale.set(1.2,.75,1.2);
      addPlate(0xf6e7d2,.12,.03,.02,0,.92,-.14,0,0,0,.84);
      break;
    case 'Poison':
      addOrb(0xd68dff,.04,-.2,.84,-.05,.68);
      addOrb(0xb45be2,.055,.18,.98,-.02,.74);
      addOrb(0xe7b4ff,.03,.03,1.1,-.06,.68);
      break;
    case 'Ground':
      addPlate(0x8b6a37,.18,.08,.12,0,.93,-.03,.12,0,0,.82);
      addCone(0xe6d089,.05,.12,-.1,1.02,-.03,-.2,0,.18,.78);
      addCone(0xe6d089,.05,.12,.1,1.02,-.03,-.2,0,-.18,.78);
      break;
    case 'Flying':
      addWingPair(g,0xd4cbff,{scale:.62,y:.6,z:.04,span:.38,lift:.45});
      addOrb(0xf6f3ff,.04,0,1.08,-.03,.72);
      break;
    case 'Psychic':
      addRing(0xff9ac8,.13,.015,1.03,-.01,Math.PI/2,.72);
      addOrb(0xffc7de,.04,0,1.16,-.03,.75);
      break;
    case 'Bug':
      addHorn(g,0xa9ca3b,{x:-.1,y:1.04,z:-.02,scale:.8,length:.16,tilt:.25,rx:-.05});
      addHorn(g,0xa9ca3b,{x:.1,y:1.04,z:-.02,scale:.8,length:.16,tilt:-.25,rx:-.05});
      addPlate(0x6f8f1e,.2,.05,.04,0,.74,.2,.25,0,0,.8);
      break;
    case 'Rock':
      addOrb(0xc9b574,.055,-.14,.94,-.01,.78);
      addOrb(0x8a7333,.07,0,1.06,-.04,.78);
      addOrb(0xc9b574,.05,.13,.96,-.02,.78);
      break;
    case 'Ghost':
      body.scale.set(1.0,1.08,.92);
      addOrb(0xcabfff,.05,-.16,.9,-.06,.44);
      addOrb(0x9f94e8,.04,.14,1.02,-.04,.42);
      addRing(0xa89cf0,.1,.012,.38,-.14,0,.4);
      break;
    case 'Dragon':
      addHorn(g,0xa78bfa,{x:-.12,y:1.02,z:-.02,scale:.95,length:.2,tilt:.32,rx:-.18});
      addHorn(g,0xa78bfa,{x:.12,y:1.02,z:-.02,scale:.95,length:.2,tilt:-.32,rx:-.18});
      addBackSpikes(g,0x8b5cf6,{scale:.68,count:3,startY:.78,startZ:.04,gap:.09});
      break;
    case 'Dark':
      addEarPair(g,0x3a312c,{scale,height:.18,width:.08,y:.99,z:-.01,innerColor:0x6a5d55,tilt:.2});
      addPlate(0x3d3330,.18,.04,.03,0,.71,-.22,.12,0,0,.82);
      break;
    case 'Steel':
      addPlate(0xc9cfdf,.22,.08,.06,0,.94,-.04,.1,0,0,.86);
      addOrb(0xe7edf8,.022,-.07,.94,-.09,.9);
      addOrb(0xe7edf8,.022,.07,.94,-.09,.9);
      break;
    case 'Fairy':
      addWingPair(g,0xffc4e8,{scale:.46,y:.62,z:.05,span:.28,lift:.55});
      addOrb(0xfff0a8,.03,0,1.1,-.05,.82);
      addCheeks(g,0xffbfd9,{scale,y:.51,z:-.31,x:.14,r:.032});
      break;
  }
  return g;
}
function applyVisualGrowth(g,inst){
  if(!g||!inst?.training)return g;
  if(isBigheadMonsterRoot(g)){
    applyBigheadVisualGrowth(g,inst);
  }else{
    const t=inst.training;
    const power=Math.min(1,(t.power||0)/80);
    const defense=Math.min(1,(t.defense||0)/80);
    const speed=Math.min(1,(t.speed||0)/80);
    const spirit=Math.min(1,(t.spirit||0)/80);
    g.scale.x*=1+power*.06+defense*.04;
    g.scale.y*=1+power*.02+defense*.03+spirit*.01;
    g.scale.z*=1+speed*.06+spirit*.02;
    g.userData.visualGrowth={power,defense,speed,spirit};
  }
  const spirit=g.userData.visualGrowth?.spirit||0;
  if(spirit>.12 && !g.getObjectByName('spiritAura')){
    const aura=new THREE.Mesh(torusGeometry(.44+spirit*.14,.016,8,22),new THREE.MeshBasicMaterial({color:0xfde68a,transparent:true,opacity:.18+spirit*.28}));
    aura.rotation.x=Math.PI/2;aura.position.y=.07;aura.name='spiritAura';g.add(aura);
  }
  return g;
}
function makeFlameWolfMesh(color,scale=1){
  const g=makeAnimalBase(color,scale,{kind:'quadruped',accent:0xff8a3d});
  g.scale.set(.88,0.98,1.24);
  addEarPair(g,0x7c2d12,{scale,height:.48,width:.08,y:1.38,z:-.16,innerColor:0xff6a1a,tilt:.4});
  addEyeSet(g,{y:1.08*scale,z:-.48*scale,spread:.09*scale,size:.036*scale,browColor:0x431407,browTilt:.3});
  addMuzzle(g,0xffd6a5,{scale,y:.94,z:-.64,w:.15,h:.1,d:.26,noseColor:0x3b0a06});
  for(const [x,y,z,h] of [[-.18,1.14,.0,.24],[.18,1.14,.0,.24],[0,1.26,.1,.3],[-.12,1.08,.14,.2],[.12,1.08,.14,.2]]){
    const tuft=new THREE.Mesh(coneGeometry(.07*scale,h*scale,6),mat(0xff4d1a,.42,.1));
    tuft.position.set(x*scale,y*scale,z*scale);tuft.rotation.x=.42;tuft.castShadow=true;g.add(tuft);
  }
  addTail(g,0x7c2d12,{scale,length:.66,thick:.07,pos:[0,.76,.54],rot:[-1.02,0,0],tipColor:0xffc857});
  const flame=new THREE.Mesh(coneGeometry(.1*scale,.3*scale,6),new THREE.MeshStandardMaterial({color:0xff7a1a,emissive:0xff4d1a,emissiveIntensity:.5,roughness:.38}));
  flame.position.set(0,.98*scale,.76*scale);flame.rotation.x=Math.PI;flame.castShadow=true;g.add(flame);
  addCheeks(g,0xff7a3a,{scale,y:.9,z:-.42,x:.14,r:.04});
  addPawSet(g,0xff9f1c,{count:4,scale,r:.065,spreadX:.17,frontZ:.26,backZ:-.02,y:.08});
  g.userData.assetForm='flame_wolf';
  return g;
}
function makeMagmaBearMesh(color,scale=1){
  const g=makeAnimalBase(color,scale,{kind:'quadruped',accent:0xd97706});
  g.scale.set(1.28,1.06,1.08);
  addEarPair(g,0x78350f,{scale,height:.16,width:.14,y:1.18,z:-.06,innerColor:0xfbbf24,tilt:.12});
  addEyeSet(g,{y:.98*scale,z:-.4*scale,spread:.12*scale,size:.042*scale,browColor:0x431407,browTilt:.06});
  addMuzzle(g,0xfbbf24,{scale,y:.88,z:-.5,w:.22,h:.14,d:.16,noseColor:0x3b1f0a});
  addBackSpikes(g,0x78716c,{scale:1.08,count:3,startY:.88,startZ:.08,gap:.14});
  const plate=new THREE.Mesh(boxGeometry(.44*scale,.1*scale,.3*scale),mat(0x57534e,.86,.16));
  plate.position.set(0,.82*scale,.06*scale);plate.rotation.x=.18;plate.castShadow=true;g.add(plate);
  for(const [x,y,z] of [[-.12,.7,.18],[.14,.78,.02],[0,.9,-.08]]){
    const crack=new THREE.Mesh(boxGeometry(.04*scale,.16*scale,.03*scale),new THREE.MeshStandardMaterial({color:0xff6b1a,emissive:0xea580c,emissiveIntensity:.72,roughness:.28}));
    crack.position.set(x*scale,y*scale,z*scale);g.add(crack);
  }
  addTail(g,0x78350f,{scale,length:.22,thick:.12,pos:[0,.62,.4],rot:[-1.4,0,0]});
  addPaw(g,0x44403c,{x:-.28,y:.16,z:.22,scale,r:.12});
  addPaw(g,0x44403c,{x:.28,y:.16,z:.22,scale,r:.12});
  addPaw(g,0x44403c,{x:-.26,y:.16,z:-.06,scale,r:.11});
  addPaw(g,0x44403c,{x:.26,y:.16,z:-.06,scale,r:.11});
  g.userData.assetForm='magma_bear';
  return g;
}
function makeSpeciesMesh(sp,inst=null){
  const path=inst?getEvolutionPath(inst):null;
  const scaleBase=(inst?.lifeStage==='Baby')?.85:1;
  const scale=(path?.scale||1)*scaleBase;
  const color=path?.color??sp.color;
  if(!path) return applyVisualGrowth(makeSlimeMesh(color,scaleBase,sp.types[0]),inst);
  let g;
  switch(path.form){
    case 'plainpup': {
      g=makeAnimalBase(color,scale,{kind:'quadruped',accent:0xf5efe5});
      addEarPair(g,0xbfa58f,{scale,height:.34,width:.12,y:1.26,z:-.08,innerColor:0xf7d8c8,tilt:.22});
      addEyeSet(g,{y:1.02*scale,z:-.42*scale,spread:.1*scale,size:.04*scale});
      addMuzzle(g,0xf8efe4,{scale,y:.95,z:-.49,w:.17,h:.12,d:.15,noseColor:0x3b2f2f});
      addTail(g,0xbfa58f,{scale,length:.28,thick:.07,pos:[0,.72,.42],rot:[-1.2,0,0]});
      break;
    }
    case 'flameling': {
      g=makeAnimalBase(color,scale,{kind:'quadruped'});
      addEarPair(g,0xea580c,{scale,height:.34,width:.12,y:1.28,z:-.1,innerColor:0xfdb58c,tilt:.28});
      addEyeSet(g,{y:1.03*scale,z:-.41*scale,spread:.1*scale,size:.04*scale,browColor:0x7c2d12,browTilt:.18});
      addMuzzle(g,0xffd6a5,{scale,y:.95,z:-.48,w:.18,h:.12,d:.16,noseColor:0x5b1c0c});
      addTail(g,0x7c2d12,{scale,length:.44,thick:.09,pos:[0,.7,.43],rot:[-1.1,0,0],tipColor:0xffc857});
      addCheeks(g,0xf5a15f,{scale,y:.92,z:-.36,x:.16,r:.055});
      break;
    }
    case 'aquapuff': {
      g=makeAnimalBase(color,scale,{kind:'quadruped',accent:0xbde8ff});
      addEyeSet(g,{y:1.0*scale,z:-.46*scale,spread:.11*scale,size:.038*scale});
      addMuzzle(g,0xdff4ff,{scale,y:.91,z:-.54,w:.18,h:.11,d:.15,noseColor:0x1f4f6b});
      addFinPair(g,0x7dd3fc,{scale,y:.74,z:.12,span:.22,back:.16});
      addTail(g,0x60a5fa,{scale,length:.34,thick:.08,pos:[0,.68,.45],rot:[-1.25,0,0]});
      break;
    }
    case 'voltkit': {
      g=makeAnimalBase(color,scale,{kind:'quadruped',accent:0xfef3c7});
      addEarPair(g,0xca8a04,{scale,height:.34,width:.14,y:1.28,z:-.06,innerColor:0xffef9a,tilt:.24});
      addEyeSet(g,{y:1.03*scale,z:-.43*scale,spread:.1*scale,size:.04*scale,browColor:0x6b4f00,browTilt:.15});
      addMuzzle(g,0xfff7c2,{scale,y:.95,z:-.5,w:.17,h:.12,d:.15,noseColor:0x3f2b00});
      addWhiskers(g,0x8a6a00,{scale,y:.95,z:-.52,len:.12});
      const boltTail=new THREE.Group();
      const seg1=new THREE.Mesh(boxGeometry(.08*scale,.22*scale,.05*scale),mat(0xffe45c,.56,.1)); boltTail.add(seg1);
      const seg2=new THREE.Mesh(boxGeometry(.08*scale,.18*scale,.05*scale),mat(0xffe45c,.56,.1)); seg2.position.set(.09*scale,.13*scale,.0); seg2.rotation.z=.7; boltTail.add(seg2);
      const seg3=new THREE.Mesh(boxGeometry(.08*scale,.16*scale,.05*scale),mat(0xffe45c,.56,.1)); seg3.position.set(.0,.24*scale,.0); seg3.rotation.z=-.7; boltTail.add(seg3);
      boltTail.position.set(.0,.72*scale,.43*scale); boltTail.rotation.x=-1.1; g.add(boltTail);
      break;
    }
    case 'mossbun': {
      g=makeAnimalBase(color,scale,{kind:'quadruped',accent:0xa7f3a0});
      addEarPair(g,0x2f9e44,{scale,height:.58,width:.11,y:1.5,z:-.02,style:'leaf',tilt:.12});
      addEyeSet(g,{y:1.02*scale,z:-.42*scale,spread:.1*scale,size:.038*scale});
      addMuzzle(g,0xf1f5f9,{scale,y:.93,z:-.5,w:.16,h:.11,d:.13,noseColor:0x3f3f46});
      const leaf=new THREE.Mesh(coneGeometry(.15*scale,.34*scale,6),mat(0x3aa64a,.68,.03)); leaf.position.set(0,1.44*scale,.14*scale); leaf.rotation.z=.08; g.add(leaf);
      addTail(g,0xffffff,{scale,length:.2,thick:.08,pos:[0,.75,.42],rot:[-1.2,0,0]});
      break;
    }
    case 'frostowl': {
      g=makeAnimalBase(color,scale,{kind:'bird',accent:0xffffff});
      addWingPair(g,0xd6f4ff,{scale,y:.84,z:.06,span:.7,lift:.12});
      addEyeSet(g,{y:1.02*scale,z:-.43*scale,spread:.12*scale,size:.05*scale,browColor:0x5b7aa8,browTilt:.05});
      const beak=new THREE.Mesh(coneGeometry(.09*scale,.22*scale,5),mat(0xf6ad31,.7,.05)); beak.position.set(0,.98*scale,-.56*scale); beak.rotation.x=-Math.PI/2; g.add(beak);
      addEarPair(g,0xdbeafe,{scale,height:.16,width:.1,y:1.34,z:.02,tilt:.25});
      break;
    }
    case 'punchcub': {
      g=makeAnimalBase(color,scale,{kind:'quadruped',accent:0xffd6bf});
      addEarPair(g,0x8b2b23,{scale,height:.22,width:.1,y:1.24,z:-.08,innerColor:0xfcc7b8,tilt:.2});
      addEyeSet(g,{y:1.0*scale,z:-.42*scale,spread:.1*scale,size:.04*scale,browColor:0x5b1711,browTilt:.12});
      addMuzzle(g,0xffd9c8,{scale,y:.94,z:-.5,w:.18,h:.12,d:.16,noseColor:0x412020});
      addPaw(g,0xffd6bf,{x:-.25,y:.48,z:-.14,scale,r:.1}); addPaw(g,0xffd6bf,{x:.25,y:.48,z:-.14,scale,r:.1});
      break;
    }
    case 'toxitoad': {
      g=makeAnimalBase(color,scale,{kind:'quadruped',accent:0xd8b4fe});
      g.scale.set(1.08,0.92,1.08);
      addEyeSet(g,{y:1.08*scale,z:-.34*scale,spread:.16*scale,size:.045*scale});
      addMuzzle(g,0xf3d8ff,{scale,y:.9,z:-.52,w:.22,h:.1,d:.16,noseColor:0x4a174f});
      addPawSet(g,color,{count:4,scale,r:.085,spreadX:.22,frontZ:.24,backZ:.02,y:.08});
      break;
    }
    case 'sandmole': {
      g=makeAnimalBase(color,scale,{kind:'quadruped',accent:0xf0d9a7});
      addEyeSet(g,{y:.95*scale,z:-.44*scale,spread:.08*scale,size:.03*scale});
      addMuzzle(g,0xeed8b0,{scale,y:.9,z:-.53,w:.22,h:.11,d:.17,noseColor:0x5b4630});
      addPaw(g,0xf1dfc1,{x:-.24,y:.16,z:-.18,scale,r:.09}); addPaw(g,0xf1dfc1,{x:.24,y:.16,z:-.18,scale,r:.09});
      break;
    }
    case 'galebird': {
      g=makeAnimalBase(color,scale,{kind:'bird',accent:0xf3f4f6});
      addWingPair(g,0xc4b5fd,{scale,y:.84,z:.06,span:.7,lift:.2});
      addEyeSet(g,{y:1.03*scale,z:-.42*scale,spread:.12*scale,size:.045*scale});
      const beak2=new THREE.Mesh(coneGeometry(.08*scale,.2*scale,5),mat(0xf6ad31,.7,.05)); beak2.position.set(0,.99*scale,-.55*scale); beak2.rotation.x=-Math.PI/2; g.add(beak2);
      break;
    }
    case 'mindcoon': {
      g=makeAnimalBase(color,scale,{kind:'quadruped',accent:0xffd1e3});
      addEarPair(g,0xd946ef,{scale,height:.28,width:.11,y:1.28,z:-.1,innerColor:0xffd7f3,tilt:.24});
      addEyeSet(g,{y:1.03*scale,z:-.43*scale,spread:.1*scale,size:.04*scale,browColor:0x7a274c,browTilt:.08});
      addMuzzle(g,0xffe5ef,{scale,y:.95,z:-.5,w:.17,h:.12,d:.15,noseColor:0x5b2740});
      const gem=orb(0xf9a8d4,.06*scale,8); gem.position.set(0,1.32*scale,-.04*scale); g.add(gem);
      break;
    }
    case 'buglet': {
      g=makeAnimalBase(color,scale,{kind:'quadruped',accent:0xd8e673});
      addShell(g,0x7f8f19,{scale});
      addEyeSet(g,{y:.98*scale,z:-.44*scale,spread:.1*scale,size:.034*scale});
      addEarPair(g,0x4b5563,{scale,height:.24,width:.05,y:1.18,z:-.14,style:'bug'});
      addHorn(g,0xc7d84a,{x:0,y:1.08,z:-.52,scale,length:.18,tilt:0,rx:-.45});
      break;
    }
    case 'rockhorn': {
      g=makeAnimalBase(color,scale,{kind:'quadruped'}); g.scale.set(1.12,0.99,1.16);
      addHorn(g,0xf0dfb0,{x:-.16,y:1.16,z:-.3,scale:1.04*scale,length:.26,tilt:.35,rx:-.25}); addHorn(g,0xf0dfb0,{x:.16,y:1.16,z:-.3,scale:1.04*scale,length:.26,tilt:-.35,rx:-.25});
      addEyeSet(g,{y:1.0*scale,z:-.43*scale,spread:.1*scale,size:.04*scale,browColor:0x53411f,browTilt:.06});
      addMuzzle(g,0xe6d3a0,{scale,y:.94,z:-.5,w:.18,h:.12,d:.16,noseColor:0x4b3c21});
      addBackSpikes(g,0x8f7c30,{scale,count:2,startY:.96,startZ:.18,gap:.12});
      break;
    }
    case 'ghostpurr': {
      g=makeAnimalBase(color,scale,{kind:'quadruped',accent:0xe9ddff});
      addEarPair(g,0x7c67bf,{scale,height:.34,width:.13,y:1.28,z:-.1,innerColor:0xe8dcff,tilt:.26});
      addEyeSet(g,{y:1.03*scale,z:-.43*scale,spread:.1*scale,size:.04*scale,browColor:0x31224f,browTilt:.04});
      addMuzzle(g,0xf0e6ff,{scale,y:.95,z:-.5,w:.16,h:.11,d:.14,noseColor:0x36225b});
      addTail(g,0x8b7ad3,{scale,length:.42,thick:.07,pos:[0,.72,.43],rot:[-1.08,0,0],tipColor:0xf3e8ff});
      break;
    }
    case 'emberdrake': {
      g=makeAnimalBase(color,scale,{kind:'quadruped'});
      addWingPair(g,0xfb923c,{scale,y:.95,z:.12,span:.82,lift:.2});
      addHorn(g,0xfef3c7,{x:-.12,y:1.24,z:-.16,scale,length:.22,tilt:.22}); addHorn(g,0xfef3c7,{x:.12,y:1.24,z:-.16,scale,length:.22,tilt:-.22});
      addEyeSet(g,{y:1.01*scale,z:-.42*scale,spread:.1*scale,size:.04*scale,browColor:0x9a3412,browTilt:.12});
      addMuzzle(g,0xfec89a,{scale,y:.95,z:-.49,w:.17,h:.11,d:.14,noseColor:0x7c2d12});
      addTail(g,0x7c2d12,{scale,length:.52,thick:.08,pos:[0,.72,.46],rot:[-1.05,0,0],tipColor:0xffc857});
      break;
    }
    case 'voidhorn': {
      g=makeAnimalBase(color,scale,{kind:'quadruped'}); g.scale.set(1.1,0.98,1.18);
      addHorn(g,0xe7d9b5,{x:-.16,y:1.14,z:-.36,scale:1.08*scale,length:.34,tilt:.45,rx:-.3});
      addHorn(g,0xe7d9b5,{x:.16,y:1.14,z:-.36,scale:1.08*scale,length:.34,tilt:-.45,rx:-.3});
      addEyeSet(g,{y:1.0*scale,z:-.43*scale,spread:.11*scale,size:.042*scale,browColor:0x111111,browTilt:.03});
      addMuzzle(g,0xb7b0cb,{scale,y:.94,z:-.5,w:.18,h:.12,d:.16,noseColor:0x2b213a});
      addBackSpikes(g,0x6d28d9,{scale,count:3,startY:.96,startZ:.18,gap:.12});
      break;
    }
    case 'ironbug': {
      g=makeAnimalBase(color,scale,{kind:'quadruped',accent:0xa3a3c2});
      addShell(g,0x7c7ca0,{scale});
      addEyeSet(g,{y:.98*scale,z:-.44*scale,spread:.1*scale,size:.034*scale});
      addEarPair(g,0x4b5563,{scale,height:.26,width:.06,y:1.18,z:-.14,style:'bug'});
      addHorn(g,0x94a3b8,{x:0,y:1.06,z:-.52,scale,length:.22,tilt:0,rx:-.45});
      addBackSpikes(g,0x94a3b8,{scale,count:2,startY:1.0,startZ:.14,gap:.18});
      break;
    }
    case 'fairimp': {
      g=makeAnimalBase(color,scale,{kind:'quadruped',accent:0xffe6f4});
      addEarPair(g,0xf472b6,{scale,height:.28,width:.12,y:1.28,z:-.1,innerColor:0xffe2f4,tilt:.22});
      addWingPair(g,0xf9c5de,{scale,y:.9,z:.12,span:.52,lift:.14});
      addEyeSet(g,{y:1.03*scale,z:-.42*scale,spread:.1*scale,size:.04*scale});
      addMuzzle(g,0xffeff8,{scale,y:.95,z:-.5,w:.16,h:.11,d:.14,noseColor:0x8a4d70});
      break;
    }
    case 'flame_wolf': {
      g=makeFlameWolfMesh(color,scale);
      break;
    }
    case 'magma_bear': {
      g=makeMagmaBearMesh(color,scale);
      break;
    }
    default: {
      g=makeAnimalBase(color,scale,{kind:'quadruped'}); addEarPair(g,color,{scale}); addEyeSet(g,{});
    }
  }
  return applyVisualGrowth(g,inst);
}
function addMonsterRing(g,{owned=false,eliteOverride=false,boss=false,inst=null,sp}={}){
  const path=inst?getEvolutionPath(inst):null;
  const lifeScale=(inst?.lifeStage==='Baby')?.85:1;
  const elite=!!(eliteOverride||sp?.elite);
  if(isBigheadMonsterRoot(g)){
    addBigheadMonsterMarks(g,{
      THREE,
      box:boxGeometry,
      basicMaterial:color=>new THREE.MeshBasicMaterial({color}),
      material:mat,
      owned,eliteOverride,speciesElite:!!sp?.elite,boss,
      formScale:path?.scale||1,
    });
    return g;
  }
  const ringScale=markRingScale({boss,elite,formScale:path?.scale||1,lifeScale,bighead:false});
  const ringColor=owned?0x60a5fa:(boss?0xf43f5e:eliteOverride?0xfacc15:0xef4444);
  const ring=new THREE.Mesh(torusGeometry(.58*ringScale,.045,8,28),new THREE.MeshBasicMaterial({color:ringColor}));
  ring.rotation.x=Math.PI/2; ring.position.y=.06; g.add(ring);
  if(elite||boss){
    const crest=new THREE.Mesh(octahedronGeometry((boss?.18:.13)*ringScale),mat(boss?0xffd166:0xfde047,.4,.15));
    crest.position.set(0,1.55*ringScale,0); crest.castShadow=true; g.add(crest);
  }
  return g;
}
function monsterMesh(sp,owned=false,inst=null,eliteOverride=false,boss=false){
  const path=inst?getEvolutionPath(inst):null;
  const lifeScale=(inst?.lifeStage==='Baby')?.85:1;
  let g;
  try{
    const handle=assets.spawn(resolveMonsterAssetId(sp.id,path?.form||'slime'),{
      role:boss?'boss':(eliteOverride||sp.elite)?'elite':owned?'owned':'wild',
      quality:qualityProfile.tier,
      marks:{owned:!!owned,elite:!!(eliteOverride||sp.elite),boss:!!boss},
      lifeStage:inst?.lifeStage,
      formId:inst?.formId||path?.form,
    });
    g=handle.root;
    if(lifeScale!==1) g.scale.multiplyScalar(lifeScale);
  }catch(err){
    g=makeSpeciesMesh(sp,inst);
  }
  addMonsterRing(g,{owned,eliteOverride,boss,inst,sp});
  if(isBigheadMonsterRoot(g)) applyVisualGrowth(g,inst);
  return g;
}
function addBackpack(group,color=0x7c3aed){ const pack=new THREE.Mesh(boxGeometry(.24,.3,.14),mat(color,.74,.04)); pack.position.set(0,1.02,.23); pack.castShadow=true; group.add(pack); }
function addSatchel(group,color=0xb45309){ const satchel=new THREE.Mesh(boxGeometry(.18,.16,.08),mat(color,.74,.04)); satchel.position.set(-.26,.84,.18); satchel.rotation.z=.22; group.add(satchel); }
function addBoot(group,color,{x=0,y=-.04,z=0,w=.12,h=.06,d=.18}={}){ const boot=new THREE.Mesh(boxGeometry(w,h,d),mat(color,.8,.02)); boot.position.set(x,y,z); group.add(boot); }
function buildHumanoid({shirt=0x20324a,pants=0x0f172a,skin=0xffc4a3,hair=0xf97316,hat=null,apron=null,bag=0x7c3aed,ballHand=true,staff=false}={}){
  const g=new THREE.Group();
  const torso=new THREE.Mesh(capsuleGeometry(.25,.58,6,12),mat(shirt,.72,.06)); torso.position.y=1.0; torso.castShadow=true; g.add(torso);
  const chest=new THREE.Mesh(boxGeometry(.36,.36,.24),mat(shirt,.72,.06)); chest.position.set(0,1.08,.02); chest.castShadow=true; g.add(chest);
  const belt=new THREE.Mesh(boxGeometry(.37,.05,.25),mat(0x111827,.82,.02)); belt.position.set(0,.76,.04); g.add(belt);
  const hips=new THREE.Mesh(boxGeometry(.38,.24,.25),mat(pants,.8,.04)); hips.position.y=.64; hips.castShadow=true; g.add(hips);
  const neck=new THREE.Mesh(cylinderGeometry(.06,.07,.09,8),mat(skin,.72,.02)); neck.position.y=1.33; g.add(neck);
  const head=new THREE.Mesh(sphereGeometry(.22,16,12),mat(skin,.72,.02)); head.position.y=1.56; head.castShadow=true; g.add(head);
  addEyeSet(g,{y:1.59,z:-.2,spread:.075,size:.022,browColor:0x1f2937,browTilt:.04});
  addMuzzle(g,0xf8c8aa,{scale:1,y:1.48,z:-.24,w:.09,h:.06,d:.09,noseColor:0xb45309});
  const blushL=orb(0xf5a38c,.018,8); blushL.position.set(-.09,1.5,-.19); g.add(blushL);
  const blushR=orb(0xf5a38c,.018,8); blushR.position.set(.09,1.5,-.19); g.add(blushR);
  if(hat!==null){ const hatTop=new THREE.Mesh(cylinderGeometry(.24,.28,.14,14),mat(hat,.62,.08)); hatTop.position.y=1.82; g.add(hatTop); const brim=new THREE.Mesh(cylinderGeometry(.33,.35,.03,16),mat(hat,.62,.08)); brim.position.y=1.75; g.add(brim); }
  else { const hairCap=new THREE.Mesh(sphereGeometry(.23,14,10,0,Math.PI*2,0,Math.PI*.6),mat(hair,.74,.02)); hairCap.position.set(0,1.68,-.01); hairCap.castShadow=true; g.add(hairCap); const bang=new THREE.Mesh(boxGeometry(.16,.08,.06),mat(hair,.74,.02)); bang.position.set(0,1.63,-.19); bang.rotation.x=.22; g.add(bang);} 
  if(apron!==null){ const ap=new THREE.Mesh(boxGeometry(.34,.44,.04),mat(apron,.78,.02)); ap.position.set(0,.95,-.14); g.add(ap); }
  const leftArm=addShoulderedArm(g,skin,{x:.29,y:1.13,z:.03,upper:.22,lower:.18,thick:.056,side:-1,shoulderAngle:.1,elbowAngle:-.04,forward:.03,holdBall:false});
  const rightArm=addShoulderedArm(g,skin,{x:.29,y:1.12,z:.03,upper:.2,lower:.17,thick:.056,side:1,shoulderAngle:-.16,elbowAngle:.34,forward:-.04,holdBall:ballHand});
  const legL=new THREE.Mesh(cylinderGeometry(.08,.09,.6,8),mat(pants,.78,.04)); legL.position.set(-.1,.26,.02); legL.castShadow=true; g.add(legL); addBoot(g,0x111827,{x:-.1,y:-.05,z:.05});
  const legR=new THREE.Mesh(cylinderGeometry(.08,.09,.6,8),mat(pants,.78,.04)); legR.position.set(.1,.26,.02); legR.castShadow=true; g.add(legR); addBoot(g,0x111827,{x:.1,y:-.05,z:.05});
  addBackpack(g,bag); addSatchel(g,0x8b5e34);
  let staffRig=null;
  if(staff){ const rod=new THREE.Mesh(cylinderGeometry(.028,.03,.72,8),mat(0x475569,.85,.02)); rod.position.set(-.48,.8,.02); rod.rotation.z=.32; rod.castShadow=true; g.add(rod); const orbTop=new THREE.Mesh(sphereGeometry(.055,8,8),new THREE.MeshStandardMaterial({color:0xf59e0b,roughness:.58,metalness:.12,emissive:0xf59e0b,emissiveIntensity:.22})); orbTop.position.set(-.59,1.1,.03); g.add(orbTop); staffRig={rod,orbTop}; }
  g.userData.animRig={torso,chest,hips,head,leftArm,rightArm,leftLeg:legL,rightLeg:legR,staffRig,phase:Math.random()*6.28,action:'idle',actionTimer:0,actionDuration:0};
  g.userData.isHumanoid=true;
  return g;
}
function buildPlayerCharacter(){ return buildHumanoid({shirt:0x20324a,pants:0x0f172a,skin:0xffc4a3,hair:0xf97316,bag:0x7c3aed,ballHand:true,staff:false}); }
function buildKeeperCharacter(){ return buildHumanoid({shirt:0x15803d,pants:0x3f3f46,skin:0xf0c8a0,hat:0xfacc15,apron:0xf8fafc,bag:0x7c3aed,ballHand:false,staff:true}); }
assets.registerProvider('legacy',createLegacyHumanoidProvider({
  buildPlayer:buildPlayerCharacter,
  buildKeeper:buildKeeperCharacter,
  animate:animateHumanoid,
  setAction:setHumanoidAction,
}));
const humanoidProvider=createBigheadProvider({
  THREE,
  box:boxGeometry,
  cylinder:cylinderGeometry,
  material:mat,
});
const monsterProvider=createBigheadMonsterProvider({
  THREE,
  box:boxGeometry,
  cone:coneGeometry,
  torus:torusGeometry,
  material:mat,
  basicMaterial:basicMat,
});
assets.registerProvider('procedural',(ctx)=>ctx.def?.kind==='monster'?monsterProvider(ctx):humanoidProvider(ctx));
// ---------- Player / NPC ----------
const playerVisual=assets.spawn('character.human.blocky-bighead.v1',{role:'player',appearanceId:'appearance.human.player-orange.v1',quality:qualityProfile.tier});
const keeperVisual=assets.spawn('character.human.blocky-bighead.v1',{role:'keeper',appearanceId:'appearance.human.keeper-green.v1',quality:qualityProfile.tier});
await Promise.all([playerVisual.ready,keeperVisual.ready].filter(Boolean));
const player=playerVisual.root; scene.add(player); player.position.set(0,0,5);
const playerData={hp:100,maxHp:100,speed:5.7,invuln:0};
const npc=keeperVisual.root; npc.position.set(4,0,3); scene.add(npc);
const presentationScratch={throwOrigin:new THREE.Vector3(),hitText:new THREE.Vector3()};
function playerThrowOrigin(){ return playerVisual.anchor('throwOrigin',presentationScratch.throwOrigin); }
function playerHitText(){ return playerVisual.anchor('hitText',presentationScratch.hitText); }
if(typeof window!=='undefined') window.MLRPG_ASSETS={diagnostics:()=>assets.diagnostics()};
const effects=[];
const sparkPool=createObjectPool({
  maxSize:200,
  create:()=>new THREE.Mesh(
    boxGeometry(1,1,1),
    new THREE.MeshStandardMaterial({color:0xffffff,roughness:.58,metalness:.12,emissive:0xffffff,emissiveIntensity:.18,transparent:true,opacity:.9}),
  ),
  reset:mesh=>{
    mesh.removeFromParent();
    mesh.visible=false;
    mesh.position.set(0,0,0);
    mesh.scale.setScalar(1);
    mesh.rotation.set(0,0,0);
    mesh.material.opacity=0;
    mesh.material.emissiveIntensity=.18;
  },
  destroy:mesh=>disposeObject3D(mesh),
});
function setHumanoidAction(model,action='idle',duration=.32){ const rig=model?.userData?.animRig; if(!rig) return; rig.action=action; rig.actionTimer=duration; rig.actionDuration=Math.max(.001,duration); }
function animateHumanoid(model,dt,moving=false){
  const rig=model?.userData?.animRig; if(!rig) return;
  rig.phase=(rig.phase||0)+dt*(moving?9.5:2.8);
  if(rig.actionTimer>0) rig.actionTimer=Math.max(0,rig.actionTimer-dt); else rig.action='idle';
  const walk=Math.sin(rig.phase);
  const bob=moving?Math.abs(walk)*.05:Math.sin(rig.phase*.5)*.01;
  rig.torso.position.y=1.0+bob; rig.chest.position.y=1.08+bob; rig.head.position.y=1.56+bob*.7;
  rig.leftLeg.rotation.x=moving?walk*.45:0; rig.rightLeg.rotation.x=moving?-walk*.45:0;
  const leftBase={x:.03,z:-.1}, rightBase={x:-.04,z:-.16};
  let lz=leftBase.z+(moving?-walk*.2:Math.sin(rig.phase*.45)*.04), rz=rightBase.z+(moving?walk*.2:-Math.sin(rig.phase*.45)*.04);
  let lx=leftBase.x, rx=rightBase.x;
  if(rig.action==='throw' || rig.action==='skill'){
    const u=1-rig.actionTimer/rig.actionDuration;
    const punch=Math.sin(Math.min(1,u)*Math.PI);
    rz=rightBase.z-.85*punch; rx=-.18-.25*punch;
    lz=leftBase.z+.12*punch; lx=.06+.1*punch;
  }else if(rig.action==='recall'){
    const u=1-rig.actionTimer/rig.actionDuration; const wave=Math.sin(Math.min(1,u)*Math.PI);
    rz=rightBase.z-.42*wave; rx=-.12-.14*wave; lz=leftBase.z+.18*wave;
  }else if(rig.action==='hurt'){
    const u=1-rig.actionTimer/rig.actionDuration; const flinch=Math.sin(Math.min(1,u)*Math.PI);
    rz=rightBase.z+.22*flinch; lz=leftBase.z-.22*flinch; rig.torso.rotation.x=.18*flinch;
  }else{ rig.torso.rotation.x=0; }
  rig.leftArm.root.rotation.x=lx; rig.rightArm.root.rotation.x=rx;
  rig.leftArm.root.rotation.z=lz; rig.rightArm.root.rotation.z=rz;
  if(rig.staffRig){ rig.staffRig.rod.rotation.z=.32+Math.sin(rig.phase*.7)*.02; rig.staffRig.orbTop.material.emissiveIntensity=.22+.08*Math.abs(Math.sin(rig.phase)); }
}
function colorNum(type){ return parseInt((TYPE_COLOR[type]||'#8b5cf6').replace('#',''),16); }
function releaseTransientEffect(effect){
  if(!effect?.mesh)return;
  if(effect.pooled)sparkPool.release(effect.mesh);
  else removeAndDispose(scene,effect.mesh);
}
function spawnBurst(pos,color=0x8b5cf6,{count=8,life=.4,size=.06,gravity=0}={}){
  const n=Math.min(16,Math.max(0,count|0));
  for(let i=0;i<n;i++){
    const m=sparkPool.acquire();
    m.visible=true;
    m.material.color.setHex(color);
    m.material.emissive.setHex(color);
    m.material.emissiveIntensity=clampEmissive(.45);
    m.material.opacity=.9;
    m.position.copy(pos);
    m.scale.setScalar(size);
    m.rotation.set(Math.random()*6.28,Math.random()*6.28,Math.random()*6.28);
    scene.add(m);
    const a=(Math.PI*2*i)/n+Math.random()*.2;
    const speed=.8+Math.random()*1.6;
    effects.push({mesh:m,vel:new THREE.Vector3(Math.cos(a)*speed,.4+Math.random()*1.2,Math.sin(a)*speed),life,maxLife:life,kind:'spark',gravity,size,pooled:true});
  }
}
function spawnRingPulse(pos,color=0x60a5fa,{scale=.6,life=.35,y=.08}={}){
  const size=scale*1.2;
  const mesh=new THREE.Mesh(boxGeometry(size,.02,size),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,wireframe:true}));
  mesh.position.copy(pos); mesh.position.y+=y; scene.add(mesh); effects.push({mesh,life,maxLife:life,kind:'ring'});
}
const TRAIN_FX_COLOR={power:0xef6c32,defense:0x4f87e8,speed:0xe8bd22,technique:0x63b34b,spirit:0xa78bfa};
const FOOD_FX_COLOR={protein:0xf97316,healthy:0x22c55e,favorite:0xec4899,trainingChow:0xe8bd22,mineralBite:0xaab0c8,emberFruit:0xef6c32,moonFruit:0xc4b5fd};
function takeSpark(color,emissiveIntensity=.45){
  const m=sparkPool.acquire();
  m.visible=true;
  m.material.color.setHex(color);
  m.material.emissive.setHex(color);
  m.material.emissiveIntensity=clampEmissive(emissiveIntensity);
  m.material.opacity=.9;
  return m;
}
function fxWorldPos(id){
  const ranch=id!=null?ranchVisuals.get(id):null;
  if(ranch?.mesh)return ranch.mesh.position.clone();
  if(id!=null&&activeSummon?.inst?.instanceId===id&&activeSummon.mesh)return activeSummon.mesh.position.clone();
  if(id!=null&&hubCompanion?.inst?.instanceId===id&&hubCompanion.mesh)return hubCompanion.mesh.position.clone();
  return ranchCenter.clone();
}
function spawnTrainingEffect(pos,focus){
  if(!pos)return;
  const color=TRAIN_FX_COLOR[focus]||0xffffff;
  for(let i=0;i<8;i++){
    const m=takeSpark(color),angle=(i/8)*Math.PI*2;
    m.position.set(pos.x+Math.cos(angle)*0.6,pos.y+0.3+Math.random()*0.3,pos.z+Math.sin(angle)*0.6);
    m.scale.setScalar(0.04+Math.random()*0.03);
    m.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);
    scene.add(m);
    effects.push({mesh:m,life:0.4,maxLife:0.4,kind:'spark',pooled:true,vel:new THREE.Vector3(Math.cos(angle)*0.3,0.8+Math.random()*0.4,Math.sin(angle)*0.3),size:m.scale.x,gravity:0});
  }
  spawnRingPulse(pos.clone(),color,{scale:0.5,life:0.3,y:0.08});
}
function spawnEvolutionEffect(pos,oldColor,newColor){
  if(!pos)return;
  const aura=new THREE.Mesh(boxGeometry(1.2,2.0,1.2),new THREE.MeshBasicMaterial({color:newColor,transparent:true,opacity:0,wireframe:true}));
  aura.position.copy(pos); aura.position.y+=1.0; scene.add(aura);
  effects.push({mesh:aura,life:1.2,maxLife:1.2,kind:'evolution-aura',phase:0,newColor});
  for(let i=0;i<20;i++){
    const m=takeSpark(i%2?newColor:oldColor),angle=(i/20)*Math.PI*2;
    m.position.set(pos.x+Math.cos(angle)*0.8,pos.y+0.5+Math.random()*1.5,pos.z+Math.sin(angle)*0.8);
    m.scale.setScalar(0.06);
    m.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);
    scene.add(m);
    effects.push({mesh:m,life:0.8,maxLife:0.8,kind:'spark',pooled:true,vel:new THREE.Vector3(Math.cos(angle)*0.5,1.0,Math.sin(angle)*0.5),size:0.06,gravity:0.5});
  }
  spawnRingPulse(pos.clone(),newColor,{scale:1.2,life:0.4,y:0.08});
  triggerCameraShake(0.12,0.2);
}
function spawnBreedingEffect(posA,posB){
  if(!posA||!posB)return;
  const mid=posA.clone().add(posB).multiplyScalar(0.5); mid.y+=1.0;
  for(let i=0;i<6;i++){
    const m=takeSpark(0xec4899);
    m.position.set(mid.x+(Math.random()-0.5)*0.6,mid.y+i*0.15,mid.z+(Math.random()-0.5)*0.6);
    m.scale.setScalar(0.08);
    scene.add(m);
    effects.push({mesh:m,life:0.8,maxLife:0.8,kind:'spark',pooled:true,vel:new THREE.Vector3(0,0.5+Math.random()*0.3,0),size:0.08,gravity:-0.2});
  }
  spawnRingPulse(mid,0xec4899,{scale:0.8,life:0.35,y:0});
}
function spawnHatchEffect(pos){
  if(!pos)return;
  for(let i=0;i<12;i++){
    const m=takeSpark(0xfde68a);
    m.position.set(pos.x+(Math.random()-0.5)*0.4,pos.y+0.3+Math.random()*0.5,pos.z+(Math.random()-0.5)*0.4);
    m.scale.setScalar(0.05);
    m.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);
    scene.add(m);
    effects.push({mesh:m,life:0.5,maxLife:0.5,kind:'spark',pooled:true,vel:new THREE.Vector3((Math.random()-0.5)*1.5,0.8+Math.random()*0.5,(Math.random()-0.5)*1.5),size:0.05,gravity:1.0});
  }
  spawnRingPulse(pos.clone(),0xfde68a,{scale:0.8,life:0.4,y:0.1});
  triggerCameraShake(0.08,0.15);
}
function spawnFeedEffect(pos,foodColor=0x22c55e){
  if(!pos)return;
  for(let i=0;i<5;i++){
    const m=takeSpark(foodColor);
    m.position.set(pos.x+(Math.random()-0.5)*0.3,pos.y+1.5+Math.random()*0.3,pos.z+(Math.random()-0.5)*0.3);
    m.scale.setScalar(0.05);
    scene.add(m);
    effects.push({mesh:m,life:0.5,maxLife:0.5,kind:'spark',pooled:true,vel:new THREE.Vector3(0,-1.0,0),size:0.05,gravity:0});
  }
  for(let i=0;i<3;i++){
    const m=takeSpark(0xec4899);
    m.position.set(pos.x+(Math.random()-0.5)*0.4,pos.y+0.8,pos.z);
    m.scale.setScalar(0.04);
    scene.add(m);
    effects.push({mesh:m,life:0.6,maxLife:0.6,kind:'spark',pooled:true,vel:new THREE.Vector3(0,0.6,0),size:0.04,gravity:-0.1});
  }
}
function spawnRestEffect(pos){
  if(!pos)return;
  for(let i=0;i<4;i++){
    const m=takeSpark(0x60a5fa);
    m.position.set(pos.x+(Math.random()-0.5)*0.4,pos.y+1.0+i*0.2,pos.z+0.2);
    m.scale.setScalar(0.05);
    scene.add(m);
    effects.push({mesh:m,life:0.6,maxLife:0.6,kind:'spark',pooled:true,vel:new THREE.Vector3(0,0.4,0.1),size:0.05,gravity:-0.05});
  }
}
function spawnPlayEffect(pos){
  if(!pos)return;
  for(let i=0;i<8;i++){
    const m=takeSpark(0xfacc15),angle=(i/8)*Math.PI*2;
    m.position.set(pos.x+Math.cos(angle)*0.5,pos.y+0.5+Math.random()*0.8,pos.z+Math.sin(angle)*0.5);
    m.scale.setScalar(0.06);
    m.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);
    scene.add(m);
    effects.push({mesh:m,life:0.6,maxLife:0.6,kind:'spark',pooled:true,vel:new THREE.Vector3(Math.cos(angle)*0.8,0.5,Math.sin(angle)*0.8),size:0.06,gravity:0.3});
  }
}
function spawnLevelUpEffect(pos){
  if(!pos)return;
  for(let i=0;i<10;i++){
    const m=takeSpark(0xfde047);
    m.position.set(pos.x+(Math.random()-0.5)*0.3,pos.y+0.1,pos.z+(Math.random()-0.5)*0.3);
    m.scale.setScalar(0.05);
    scene.add(m);
    effects.push({mesh:m,life:0.5,maxLife:0.5,kind:'spark',pooled:true,vel:new THREE.Vector3(0,1.5+Math.random()*0.5,0),size:0.05,gravity:-0.2});
  }
  spawnRingPulse(pos.clone(),0xfde047,{scale:0.7,life:0.3,y:0.08});
}
function spawnBondUpEffect(pos){
  if(!pos)return;
  for(let i=0;i<5;i++){
    const m=takeSpark(0xec4899);
    m.position.set(pos.x+(Math.random()-0.5)*0.4,pos.y+0.8,pos.z+(Math.random()-0.5)*0.4);
    m.scale.setScalar(0.06);
    scene.add(m);
    effects.push({mesh:m,life:0.5,maxLife:0.5,kind:'spark',pooled:true,vel:new THREE.Vector3((Math.random()-0.5)*0.2,0.8,0),size:0.06,gravity:-0.1});
  }
}
function spawnMasteryUpEffect(pos){
  if(!pos)return;
  for(let i=0;i<12;i++){
    const m=takeSpark(0xfde047),angle=(i/12)*Math.PI*2;
    m.position.set(pos.x,pos.y+0.8,pos.z);
    m.scale.setScalar(0.07);
    m.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);
    scene.add(m);
    effects.push({mesh:m,life:0.6,maxLife:0.6,kind:'spark',pooled:true,vel:new THREE.Vector3(Math.cos(angle)*1.2,0.5+Math.random()*0.5,Math.sin(angle)*1.2),size:0.07,gravity:0.4});
  }
  spawnRingPulse(pos.clone().add(new THREE.Vector3(0,0.8,0)),0xfde047,{scale:0.6,life:0.3,y:0});
}
function spawnConditionBadEffect(pos){
  if(!pos)return;
  for(let i=0;i<6;i++){
    const m=takeSpark(0x64748b,0.1);
    m.position.set(pos.x+(Math.random()-0.5)*0.5,pos.y+0.5+Math.random()*0.5,pos.z+(Math.random()-0.5)*0.5);
    m.scale.setScalar(0.08);
    scene.add(m);
    effects.push({mesh:m,life:0.3,maxLife:0.3,kind:'spark',pooled:true,vel:new THREE.Vector3(0,0.2,0),size:0.08,gravity:-0.05});
  }
}
function easeOut(t){t=Math.max(0,Math.min(1,t));return 1-(1-t)*(1-t);}
function clampEmissive(v){return Math.min(.7,Math.max(.1,v));}
function fxParticleCount(mode,power,intensity){
  const base=mode==='burst'?12:mode==='summon'?14:mode==='trail'?3:7;
  return Math.max(3,Math.min(16,Math.round(base*Math.max(0,power)*intensity)));
}
function fxEmissive(mode,intensity){
  return clampEmissive((mode==='trail'?0.4:0.55)*intensity);
}
function updateSparkType(e,dt,t){
  const cfg=e.typeCfg; if(!cfg)return;
  if(cfg.speed>1.1)e.vel.y+=dt*0.5;
  if(cfg.speed<=0.95&&cfg.shape==='drop')e.vel.y-=dt*0.3;
  if(cfg.speed>1.3){e.mesh.position.x+=Math.sin(e.life*20)*0.02;e.mesh.position.z+=Math.cos(e.life*20)*0.02;}
  if(cfg.shape==='mist')e.vel.y=Math.max(e.vel.y,0);
}
function updateEffects(dt){ for(let i=effects.length-1;i>=0;i--){ const e=effects[i]; e.life-=dt; const t=Math.max(0,e.life/e.maxLife); if(e.kind==='spark'){ e.vel.y-=(e.gravity||0)*dt; updateSparkType(e,dt,t); e.mesh.position.addScaledVector(e.vel,dt); e.mesh.scale.setScalar(e.size*(.5+t)); const fade=easeOut(t); e.mesh.material.opacity=Math.max(0,fade*.9); if(e.mesh.material.emissiveIntensity!=null){ if(e.emi==null)e.emi=e.mesh.material.emissiveIntensity; e.mesh.material.emissiveIntensity=e.emi*fade; } } else if(e.kind==='ring'){ e.mesh.scale.multiplyScalar(1+dt*2.8); e.mesh.material.opacity=Math.max(0,easeOut(t)*.9); } else if(e.kind==='evolution-aura'){ const u=1-t; const fade=u<.35?u/.35:(u>.7?(1-u)/.3:1); e.mesh.material.opacity=Math.max(0,fade*.55); e.mesh.rotation.y+=dt*1.8; } if(e.life<=0){ releaseTransientEffect(e); effects.splice(i,1);} } }

const ELEMENT_FX={
  Normal:{core:0xc4b08b,accent:0xf5e2be,shape:'orb',intensity:0.95,speed:1.0},
  Fire:{core:0xff6b2c,accent:0xffc347,shape:'flame',intensity:1.18,speed:1.15},
  Water:{core:0x43a5ff,accent:0xb6efff,shape:'drop',intensity:1.08,speed:0.95},
  Electric:{core:0xffda22,accent:0xfff79c,shape:'spark',intensity:1.22,speed:1.35},
  Grass:{core:0x65c84b,accent:0xd6ff9f,shape:'leaf',intensity:1.0,speed:0.9},
  Ice:{core:0x8de9ff,accent:0xf3fdff,shape:'crystal',intensity:1.04,speed:0.9},
  Fighting:{core:0xd6493b,accent:0xffcab9,shape:'impact',intensity:1.14,speed:1.05},
  Poison:{core:0xb259db,accent:0xf3baff,shape:'bubble',intensity:1.0,speed:0.88},
  Ground:{core:0xd0a249,accent:0xf6deb4,shape:'dust',intensity:1.0,speed:0.82},
  Flying:{core:0x8e82ff,accent:0xece8ff,shape:'feather',intensity:1.02,speed:1.08},
  Psychic:{core:0xff5a98,accent:0xffd3e8,shape:'halo',intensity:1.1,speed:1.02},
  Bug:{core:0xa8c42d,accent:0xedff93,shape:'spore',intensity:0.98,speed:0.95},
  Rock:{core:0xb59b46,accent:0xf1deb0,shape:'shard',intensity:0.94,speed:0.8},
  Ghost:{core:0x8870df,accent:0xe6ddff,shape:'mist',intensity:1.06,speed:0.85},
  Dragon:{core:0x7f5cff,accent:0xdccfff,shape:'arc',intensity:1.18,speed:1.12},
  Dark:{core:0x594942,accent:0xc7b7a8,shape:'smoke',intensity:1.0,speed:0.86},
  Steel:{core:0xaab0c8,accent:0xf0f4ff,shape:'metal',intensity:1.0,speed:0.78},
  Fairy:{core:0xff8fcb,accent:0xffeff7,shape:'star',intensity:1.12,speed:1.0}
};
function typeFx(type='Normal'){ return ELEMENT_FX[type]||ELEMENT_FX.Normal; }
function fxGeom(shape='orb',size=0.06){
  switch(shape){
    case 'flame': return boxGeometry(size*0.6,size*1.8,size*0.6);
    case 'drop': return boxGeometry(size*0.8,size*1.2,size*0.8);
    case 'leaf': return boxGeometry(size*0.9,size*0.3,size*0.9);
    case 'crystal': return boxGeometry(size,size*1.4,size);
    case 'impact': return boxGeometry(size*1.5,size*0.45,size*1.2);
    case 'bubble': return boxGeometry(size*0.85,size*0.85,size*0.85);
    case 'dust': return boxGeometry(size*1.2,size*0.55,size*1.2);
    case 'feather': return boxGeometry(size*0.3,size*1.7,size*0.5);
    case 'halo': return boxGeometry(size*1.6,size*0.15,size*1.6);
    case 'spore': return boxGeometry(size*0.72,size*0.72,size*0.72);
    case 'shard': return boxGeometry(size*0.5,size*1.5,size*0.5);
    case 'mist': return boxGeometry(size*0.95,size*0.7,size*0.95);
    case 'arc': return boxGeometry(size*0.5,size*1.9,size*0.5);
    case 'smoke': return boxGeometry(size,size,size);
    case 'metal': return boxGeometry(size,size*0.52,size*1.45);
    case 'star': return boxGeometry(size*0.9,size*0.9,size*0.9);
    case 'spark': return boxGeometry(size*1.5,size*0.35,size*1.5);
    default: return boxGeometry(size,size,size);
  }
}
function spawnElementalFX(type,pos,mode='impact',power=1){
  if(!pos)return;
  const cfg=typeFx(type),base=safeVec3(pos);
  const count=fxParticleCount(mode,power,cfg.intensity);
  const c=cfg.core,a=cfg.accent;
  if(mode!=='trail') spawnRingPulse(base.clone(),c,{scale:(mode==='summon'?0.68:0.48)*Math.max(0.9,power),life:mode==='aura'?0.45:0.24,y:0.08});
  for(let i=0;i<count;i++){
    const pSize=(0.028+Math.random()*0.04)*(mode==='summon'?1.25:1);
    const mesh=new THREE.Mesh(
      fxGeom(cfg.shape,pSize),
      new THREE.MeshStandardMaterial({color:i%2?a:c,emissive:i%2?a:c,emissiveIntensity:fxEmissive(mode,cfg.intensity),transparent:true,opacity:0.92,roughness:0.25,metalness:cfg.shape==='metal'?0.45:0.02})
    );
    mesh.position.copy(base); mesh.castShadow=false;
    mesh.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);
    scene.add(mesh);
    const angle=Math.PI*2*(i/Math.max(1,count))+Math.random()*0.3;
    const vx=(mode==='trail'?0.4:(0.7+Math.random()*1.2))*cfg.speed;
    const vy=mode==='trail'?0.12:(0.35+Math.random())*cfg.speed;
    const vel=new THREE.Vector3(Math.cos(angle)*vx,vy,Math.sin(angle)*vx);
    effects.push({mesh,vel,life:mode==='trail'?0.12:(mode==='summon'?0.36:0.24),maxLife:mode==='trail'?0.12:(mode==='summon'?0.36:0.24),kind:'spark',gravity:(cfg.shape==='mist'||cfg.shape==='halo')?0:0.8,size:pSize,typeCfg:cfg});
  }
}
function setTextIfChanged(node,text){const value=String(text);if(node&&node.textContent!==value)node.textContent=value;}
function setAttributeIfChanged(node,name,value){if(node&&node.getAttribute(name)!==value)node.setAttribute(name,value);}
function setStyleIfChanged(node,name,value){if(node&&node.style.getPropertyValue(name)!==value)node.style.setProperty(name,value);}
function setClassNameIfChanged(node,value){if(node&&node.className!==value)node.className=value;}
function setClassTokenIfChanged(node,name,enabled){if(node&&node.classList.contains(name)!==enabled)node.classList.toggle(name,enabled);}
function renderTargetTypesIfChanged(node,types){
  if(!node)return;
  const key=types.join('|');
  if(node.dataset.typesKey===key)return;
  node.innerHTML=types.map(typeBadge).join('');
  node.dataset.typesKey=key;
}
function setActionStyle(btn,type,label,sub){
  if(!btn) return;
  const cfg=typeFx(type),main='#'+cfg.core.toString(16).padStart(6,'0'),accent='#'+cfg.accent.toString(16).padStart(6,'0');
  if(btn.style.getPropertyValue('--action-main')!==main)btn.style.setProperty('--action-main',main);
  if(btn.style.getPropertyValue('--action-accent')!==accent)btn.style.setProperty('--action-accent',accent);
  if(label&&btn.dataset.label!==label)btn.dataset.label=label;
  if(sub&&btn.dataset.sub!==sub)btn.dataset.sub=sub;
  if(btn.dataset.type!==type)btn.dataset.type=type;
}
function setupMonsterMotion(mesh,sp,inst=null){
  const primary=inst?.instanceId?monsterTypes(inst)[0]:(sp?.types?.[0]||'Normal');
  mesh.userData.monsterType=primary;
  mesh.userData.monsterEvolved=!!inst?.evolutionPath;
  mesh.userData.faceOffset=Math.PI;
  mesh.userData.baseScale=mesh.scale.clone();
  mesh.userData.monPhase=Math.random()*6.28;
  mesh.userData.monAction='idle';
  mesh.userData.monActionTimer=0;
}
function triggerMonsterAction(mesh,action='attack',duration=0.22){ if(!mesh?.userData) return; mesh.userData.monAction=action; mesh.userData.monActionTimer=duration; }
function animateMonster(mesh,dt,moving=false){
  if(!mesh?.userData?.baseScale) return;
  const u=mesh.userData,pType=typeFx(u.monsterType||'Normal'),p=(u.monPhase=(u.monPhase||0)+dt*(moving?5.2:2.2)*pType.speed),s=u.baseScale;
  if(u.monActionTimer>0) u.monActionTimer=Math.max(0,u.monActionTimer-dt); else u.monAction='idle';
  let sx=1,sy=1,sz=1,rx=0,rz=0;
  const pulse=Math.sin(p), pulse2=Math.cos(p*0.7), actionBoost=u.monActionTimer>0?Math.sin((1-u.monActionTimer/0.22)*Math.PI):0;
  if(!u.monsterEvolved){ sx=1+pulse*0.04; sy=1+Math.abs(pulse)*0.08; sz=1+pulse2*0.03; }
  switch(u.monsterType){
    case 'Fire': sy+=Math.abs(Math.sin(p*1.4))*0.03; sx-=0.02*Math.sin(p*1.2); rz+=Math.sin(p*1.6)*0.02; break;
    case 'Water': rx+=Math.sin(p)*0.04; sx+=Math.sin(p*0.8)*0.02; sz+=Math.cos(p*0.8)*0.02; break;
    case 'Electric': rz+=Math.sin(p*2.8)*0.04; sx+=Math.sin(p*2.4)*0.03; sy+=Math.abs(Math.cos(p*2.1))*0.03; break;
    case 'Grass': rz+=Math.sin(p*0.9)*0.03; rx+=Math.cos(p*0.6)*0.02; break;
    case 'Ice': sx+=Math.sin(p)*0.01; sy+=Math.abs(Math.sin(p))*0.02; rz+=Math.sin(p)*0.01; break;
    case 'Fighting': rx-=Math.abs(Math.sin(p))*0.04; sx+=Math.abs(Math.sin(p*0.8))*0.03; break;
    case 'Poison': rz+=Math.sin(p*0.85)*0.04; sy+=Math.sin(p*1.4)*0.02; break;
    case 'Ground': rx-=Math.abs(Math.sin(p*0.65))*0.02; sy+=Math.abs(Math.sin(p*0.65))*0.02; break;
    case 'Flying': sy+=Math.abs(Math.sin(p*1.3))*0.03; rz+=Math.sin(p)*0.02; break;
    case 'Psychic': sy+=Math.abs(Math.sin(p))*0.03; rz+=Math.sin(p*0.7)*0.02; break;
    case 'Bug': sx+=Math.sin(p*1.7)*0.02; rz+=Math.sin(p*1.7)*0.03; break;
    case 'Rock': sy+=Math.abs(Math.sin(p*0.55))*0.01; rx-=Math.abs(Math.sin(p*0.55))*0.02; break;
    case 'Ghost': sy+=Math.sin(p*1.2)*0.03; rz+=Math.sin(p*0.7)*0.03; break;
    case 'Dragon': sx+=Math.sin(p)*0.03; sy+=Math.abs(Math.sin(p*1.15))*0.03; rx+=Math.cos(p*0.7)*0.02; break;
    case 'Dark': rz+=Math.sin(p*0.6)*0.02; rx+=Math.cos(p*0.9)*0.03; break;
    case 'Steel': sy+=Math.abs(Math.sin(p*0.5))*0.01; break;
    case 'Fairy': sy+=Math.abs(Math.sin(p*1.35))*0.03; rz+=Math.sin(p)*0.03; break;
  }
  if(u.monsterEvolved){ sx=1+(sx-1)*0.45; sy=1+(sy-1)*0.4; sz=1+(sz-1)*0.4; }
  if(u.monAction==='attack'){ sx+=actionBoost*0.12; sy-=actionBoost*0.05; rx-=actionBoost*0.16; }
  if(u.monAction==='hurt'){ sx-=actionBoost*0.08; sy+=actionBoost*0.04; rz+=Math.sin(p*7)*0.1*actionBoost; }
  mesh.scale.set(s.x*sx,s.y*sy,s.z*sz);
  mesh.rotation.x += (rx-mesh.rotation.x)*Math.min(1,dt*8);
  mesh.rotation.z += (rz-mesh.rotation.z)*Math.min(1,dt*8);
}
function monsterLookYaw(dir,mesh){ return Math.atan2(dir.x,dir.z) + (mesh?.userData?.faceOffset??Math.PI); }

// ---------- V7.0 Combat feedback: floating damage, camera shake, elemental ground decals ----------
const floatingTexts=[];
const groundDecals=[];
const cameraShake={time:0,duration:0,mag:0,phase:0};
function triggerCameraShake(mag=0.08,duration=0.14){
  cameraShake.time=Math.max(cameraShake.time,duration);
  cameraShake.duration=Math.max(cameraShake.duration,duration);
  cameraShake.mag=Math.max(cameraShake.mag,mag);
}
function spawnDamageNumber(amount,pos,{type='Normal',eff=1,healing=false,label=''}={}){
  const layer=el('floatingTextLayer'); if(!layer)return;
  const d=document.createElement('div');
  const strong=eff>=2;
  d.className='damage-pop'+(strong?' super':'')+(healing?' heal':'');
  d.style.setProperty('--dmg-color',healing?'#86efac':(TYPE_COLOR[type]||'#fff'));
  const sign=healing?'+':'-';
  const effectLabelText=label||(eff>=4?'VERY EFFECTIVE':eff>1?'SUPER':eff===0?'IMMUNE':eff<1?'RESIST':'');
  d.innerHTML=`<b>${sign}${Math.round(amount)}</b>${effectLabelText?`<small>${effectLabelText}</small>`:''}`;
  layer.appendChild(d);
  floatingTexts.push({el:d,pos:safeVec3(pos),life:0.9,maxLife:0.9,rise:0,drift:(Math.random()-.5)*24});
}
function updateFloatingTexts(dt){
  for(let i=floatingTexts.length-1;i>=0;i--){
    const f=floatingTexts[i]; f.life-=dt; f.rise+=dt*1.1;
    const p=safeVec3(f.pos).add(new THREE.Vector3(0,f.rise,0));
    const s=worldToScreen(p),t=Math.max(0,f.life/f.maxLife);
    f.el.style.left=`${s.x+f.drift*(1-t)}px`; f.el.style.top=`${s.y}px`; f.el.style.opacity=s.visible?String(Math.min(1,t*1.6)):'0';
    f.el.style.transform=`translate(-50%,-50%) scale(${0.88+(1-t)*0.28})`;
    if(f.life<=0){f.el.remove();floatingTexts.splice(i,1);}
  }
}
function spawnGroundDecal(type,pos,{radius=1.1,duration=1.25,intensity=1}={}){
  if(!pos)return;
  const cfg=typeFx(type),group=new THREE.Group(),size=radius*1.4;
  const disc=new THREE.Mesh(boxGeometry(size,.02,size),new THREE.MeshBasicMaterial({color:cfg.core,transparent:true,opacity:0.13*intensity,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
  disc.position.y=.032; group.add(disc);
  const ring=new THREE.Mesh(boxGeometry(size*.78,.02,size*.78),new THREE.MeshBasicMaterial({color:cfg.accent,transparent:true,opacity:0.42*intensity,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,wireframe:true}));
  ring.position.y=.038; group.add(ring);
  const inner=new THREE.Mesh(boxGeometry(size*.24,.02,size*.24),new THREE.MeshBasicMaterial({color:cfg.core,transparent:true,opacity:0.48*intensity,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,wireframe:true}));
  inner.position.y=.041; group.add(inner);
  group.position.set(pos.x,0,pos.z); scene.add(group);
  groundDecals.push({group,disc,ring,inner,life:duration,maxLife:duration,type,spin:(Math.random()<.5?-1:1)*(.3+Math.random()*.25)});
}
function updateGroundDecals(dt){
  for(let i=groundDecals.length-1;i>=0;i--){
    const d=groundDecals[i]; d.life-=dt; const t=Math.max(0,d.life/d.maxLife);
    d.ring.rotation.y+=dt*d.spin; d.inner.rotation.y-=dt*d.spin*1.4;
    d.group.scale.setScalar(1+(1-t)*.12);
    d.disc.material.opacity=.13*t; d.ring.material.opacity=.42*t; d.inner.material.opacity=.48*t;
    if(d.life<=0){removeAndDispose(scene, d.group);groundDecals.splice(i,1);}
  }
}
function clearTransientEffects(){
  while(effects.length) releaseTransientEffect(effects.pop());
  while(groundDecals.length) removeAndDispose(scene,groundDecals.pop().group);
  while(floatingTexts.length) floatingTexts.pop().el.remove();
}


// ---------- State / save ----------
const state={collection:[],party:[null,null,null],storage:[],ranchActive:[],selectedSlot:0,exp:0,lifeLastAt:Date.now(),inventory:{...DEFAULT_INVENTORY,stash:[...DEFAULT_INVENTORY.stash]},eggs:[],breeding:{parentA:null,parentB:null},evolutionCandidate:null,crCandidate:null,trainingSelectedId:null,skillsSelectedId:null,equipSelectedId:null,currentZone:'hub',saveVersion:SAVE_SCHEMA_VERSION};
let currentManagerTab='collection';
function getInst(id){return state.collection.find(m=>m.instanceId===id)||null;}
function selectedInstance(){return getInst(state.party[state.selectedSlot]);}
function distXZ(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
function hpPct(v){return Math.max(0,Math.min(1,v));}
function msg(t){el('message').textContent=t;}
function setManagerTab(tab='collection'){
  currentManagerTab=tab;
  document.querySelectorAll('.manager-tab').forEach(b=>b.classList.toggle('active',b.dataset.managerTab===tab));
  document.querySelectorAll('[data-tab-pane]').forEach(p=>p.classList.toggle('active',p.dataset.tabPane===tab));
  if(tab==='collection')renderManager();
  if(tab==='training')renderTraining();
  if(tab==='skills')renderSkills();
  if(tab==='equipment')renderEquipment();
  if(tab==='evolution')renderEvolution();
  if(tab==='breeding')renderBreeding();
}
function ownedMonsterIds(){return [...state.party.filter(Boolean),...state.storage];}
function monsterSelectHTML(selectedId){
  return ownedMonsterIds().map(id=>{
    const m=getInst(id);
    if(!m)return '';
    return `<option value="${id}" ${id===selectedId?'selected':''}>${displayName(m)} Lv.${m.level} • ${m.lifeStage}</option>`;
  }).join('');
}
function bindMonsterSelect(panel,stateKey,renderFn){
  const select=panel.querySelector('select[data-monster-select]');
  if(select)select.onchange=()=>{state[stateKey]=select.value;renderFn();};
}
function renderTraining(){
  const panel=el('trainingPanel');
  if(!panel)return;
  const allIds=ownedMonsterIds();
  if(!allIds.length){panel.innerHTML='<div class="manager-empty">ยังไม่มีมอน — ไปจับมอนก่อน</div>';return;}
  const selectedId=allIds.includes(state.trainingSelectedId)?state.trainingSelectedId:allIds[0];
  state.trainingSelectedId=selectedId;
  const inst=getInst(selectedId);
  if(!inst){panel.innerHTML='<div class="manager-empty">เลือกมอนไม่ถูกต้อง</div>';return;}
  const used=instTrainingUsed(inst);
  const cap=BALANCE_CONFIG.training.capacity.base+BALANCE_CONFIG.training.capacity.perLevel*inst.level;
  const poolPct=cap>0?Math.round(used/cap*100):0;
  const poolFull=used>=cap;
  syncToBodyMind(inst);
  const cond=deriveCondition(inst)||'normal';
  const condMult=BALANCE_CONFIG.condition[cond]?.training??1;
  const condTH={excellent:'ดีเยี่ยม',good:'ดี',normal:'ปกติ',tired:'เหนื่อย',fatigued:'อ่อนเพลีย',bad:'แย่'};
  const hasBuff=(inst.activeBuffs||[]).some(b=>b.expiresAt>Date.now());
  const linesHTML=TRAINING_LINES.map(line=>{
    const val=inst.training?.[line]||0;
    const dim=balanceFormulas.diminishingMultiplier(val);
    const apt=inst.aptitude?.[line]||3;
    const aptMult=balanceFormulas.aptitudeMultiplier(apt);
    const stars='★'.repeat(apt)+'<span class="empty">'+'☆'.repeat(5-apt)+'</span>';
    const bands=BALANCE_CONFIG.training.diminishing;
    const currentBand=bands.find(b=>val<b.upTo)||{upTo:200,multiplier:0};
    const bandLabel=currentBand.multiplier===1?'0-50':currentBand.multiplier===0.8?'51-100':currentBand.multiplier===0.6?'101-150':currentBand.multiplier===0.4?'151-200':'200+';
    const valPct=Math.min(100,Math.round(val/Math.max(1,currentBand.upTo)*100));
    const isFocus=line===(inst.trainingFocus||'power');
    const gain=Math.round(ranchTrainingGain(inst,line,15));
    return `<div class="training-line-card ${isFocus?'focus-active':''}"><div class="training-line-header"><b>${line[0].toUpperCase()+line.slice(1)}</b>${isFocus?'<span class="focus-tag">เลือกอยู่</span>':''}</div><div class="training-line-stats"><span>ค่า: <strong>${Math.round(val)}</strong></span><span class="dim">ลดลง: ${dim}x (${bandLabel})</span><span class="apt">Apt: <span class="apt-stars">${stars}</span> (${aptMult}x)</span></div><div class="line-progress"><div class="line-progress-fill ${line}" style="width:${valPct}%"></div></div><button class="train-btn" data-train-line="${line}" ${poolFull?'disabled':''}>${poolFull?'Pool เต็ม':`ฝึก ${line} +${gain}`}</button></div>`;
  }).join('');
  panel.innerHTML=`<div class="training-panel"><div class="monster-selector"><select data-monster-select>${monsterSelectHTML(selectedId)}</select></div><div class="training-summary"><div class="pool-header"><span>Training Pool (รวม 5 สาย)</span><span class="pool-count">${Math.round(used)} / ${cap}</span></div><div class="pool-bar"><div class="pool-bar-fill" style="width:${poolPct}%"></div></div></div>${linesHTML}<div class="condition-box"><div>สภาพ: <strong class="cond-${cond}">${condTH[cond]||cond}</strong> → ${condMult}x training gain</div><div>Training Food: ${hasBuff?'<span style="color:#fde68a">มี buff ทำงาน</span>':'ไม่มี buff'}</div></div><div class="training-info">Pool = 40 + 8xLevel (รวมทุกสาย) • ค่ามาก = gain ลดลง (diminishing return) • Aptitude ดาวเยอะ = gain เพิ่ม • สภาพดี = gain เพิ่ม</div></div>`;
  bindMonsterSelect(panel,'trainingSelectedId',renderTraining);
  panel.querySelectorAll('[data-train-line]').forEach(b=>b.onclick=()=>setTraining(inst.instanceId,b.dataset.trainLine));
}
function renderSkills(){
  const panel=el('skillsPanel');
  if(!panel)return;
  const allIds=ownedMonsterIds();
  if(!allIds.length){panel.innerHTML='<div class="manager-empty">ยังไม่มีมอน — ไปจับมอนก่อน</div>';return;}
  const selectedId=allIds.includes(state.skillsSelectedId)?state.skillsSelectedId:allIds[0];
  state.skillsSelectedId=selectedId;
  const inst=getInst(selectedId);
  if(!inst){panel.innerHTML='<div class="manager-empty">เลือกมอนไม่ถูกต้อง</div>';return;}
  const speciesSkills=getMonsterSkills(inst);
  const thresholds=BALANCE_CONFIG.skill.masteryThresholds;
  const thresholdList={novice:0,familiar:thresholds.familiar,skilled:thresholds.skilled,expert:thresholds.expert,master:thresholds.master};
  const learnedHTML=(inst.skills||[]).map(s=>{
    const def=speciesSkills.find(d=>d.name===s.skillId)||(SKILL_CANDIDATES[inst.speciesId]||[]).find(d=>d.id===s.skillId)?.move||{};
    const rank=s.masteryRank||'novice';
    const exp=s.masteryExp||0;
    const orderIdx=MASTERY_ORDER.indexOf(rank);
    const isMaster=rank==='master';
    const nextRank=MASTERY_ORDER[orderIdx+1];
    const nextThresh=nextRank?thresholdList[nextRank]:null;
    const prevThresh=thresholdList[rank]||0;
    const expInBand=exp-prevThresh;
    const bandSize=nextThresh?(nextThresh-prevThresh):1;
    const pct=isMaster?100:Math.min(100,Math.round(expInBand/Math.max(1,bandSize)*100));
    const rawPowerPct=Math.round((SKILL_MASTERY[rank]?.rawPower??0)*100);
    return `<div class="skill-card"><div class="skill-card-header"><b>${def.name||s.skillId} ${typeBadge(def.type||'Normal')}</b><span class="skill-mastery-label ${rank}">${MASTERY_TH[rank]||rank} ${MASTERY_DOTS[rank]||''}</span></div><div class="skill-exp-text">EXP: <strong>${exp}</strong>${nextThresh?`/${nextThresh}`:''} ${!isMaster?`→ ${MASTERY_NEXT_TH[rank]}`:' (สูงสุด)'}</div><div class="skill-mastery-bar"><div class="skill-mastery-fill ${rank}" style="width:${pct}%"></div></div><div class="skill-detail">Power: ${def.power??'—'} • CD: ${def.cooldown??'—'}s • ${def.targetType||'enemy'}</div><div class="skill-detail"><span class="power-bonus">Raw Power bonus: +${rawPowerPct}%</span>${s.mutationId?` • Mutation: ${s.mutationId}`:''}</div></div>`;
  }).join('');
  const learnedIds=new Set((inst.skills||[]).map(s=>s.skillId));
  const lockedMoves=speciesSkills.filter(s=>!learnedIds.has(s.name)).map(s=>`<div class="skill-card skill-locked"><div class="skill-card-header"><b>${s.name} ${typeBadge(s.type)}</b></div><div class="skill-detail">Power: ${s.power??'—'} • CD: ${s.cooldown??'—'}s • ${s.targetType||'enemy'}</div><div class="skill-detail">ใช้สกิลในการต่อสู้เพื่อสะสม EXP → เรียนรู้อัตโนมัติ</div></div>`).join('');
  const candHTML=(SKILL_CANDIDATES[inst.speciesId]||[]).filter(d=>!learnedIds.has(d.id)).map(d=>{
    const ev=evaluateSkillCandidate(d,inst);
    return `<div class="skill-card ${ev.eligible?'':'skill-locked'}"><div class="skill-card-header"><b>${d.id} ${typeBadge(d.move?.type||'Fire')}</b></div><div class="skill-detail">Power: ${d.move?.power??'—'} • CD: ${d.move?.cooldown??'—'}s</div>${ev.eligible?`<button data-learn="${d.id}">เรียน</button>`:`<div class="skill-req">ล็อก: ${(ev.failedRequired||[]).map(r=>r.field+' '+r.op+' '+r.value).join(' • ')||'ยังไม่พร้อม'}</div>`}</div>`;
  }).join('');
  panel.innerHTML=`<div class="skills-panel"><div class="monster-selector"><select data-monster-select>${monsterSelectHTML(selectedId)}</select></div>${learnedHTML?`<div class="skills-section-title">สกิลที่เรียนรู้ (${(inst.skills||[]).length})</div>${learnedHTML}`:'<div class="manager-empty">ยังไม่ได้เรียนสกิล — ใช้สกิลในการต่อสู้เพื่อสะสม EXP</div>'}${lockedMoves?`<div class="skills-section-title">สกิลที่ยังไม่เรียน</div>${lockedMoves}`:''}${candHTML?`<div class="skills-section-title">สกิล candidate</div>${candHTML}`:''}<div class="skill-help"><b>ระดับ Mastery:</b> เริ่มต้น → คุ้นเคย → ชำนาญ → เชี่ยวชาญ → ปรมาจารย์<br><b>EXP สะสม:</b> 100 / 300 / 700 / 1500<br><b>Power bonus:</b> +0% / +2% / +5% / +8% / +11%<br>ใช้สกิลซ้ำๆ ใน battle เดียว = EXP ลดลง (novelty decay 0.7x)</div></div>`;
  bindMonsterSelect(panel,'skillsSelectedId',renderSkills);
  panel.querySelectorAll('[data-learn]').forEach(b=>b.onclick=()=>learnCandidateSkill(inst.instanceId,b.dataset.learn));
}
function renderEquipment(){
  const panel=el('equipmentPanel');
  if(!panel)return;
  const allIds=ownedMonsterIds();
  if(!allIds.length){panel.innerHTML='<div class="manager-empty">ยังไม่มีมอน — ไปจับมอนก่อน</div>';return;}
  const selectedId=allIds.includes(state.equipSelectedId)?state.equipSelectedId:allIds[0];
  state.equipSelectedId=selectedId;
  const inst=getInst(selectedId);
  if(!inst){panel.innerHTML='<div class="manager-empty">เลือกมอนไม่ถูกต้อง</div>';return;}
  const flat=getEquipmentFlat(inst);
  const equippedCount=equippedItems(inst).length;
  const budgetMin=BALANCE_CONFIG.equipment.budget.min*100;
  const budgetMax=BALANCE_CONFIG.equipment.budget.max*100;
  const flatTotal=(flat.hp||0)+(flat.atk||0)+(flat.def||0)+(flat.spd||0);
  const statTotal=(inst.maxHp||0)+(inst.atk||0)+(inst.def||0)+(inst.spd||0);
  const budgetPct=statTotal>0?Math.round(flatTotal/statTotal*1000)/10:0;
  const budgetClass=budgetPct<budgetMin?'under':budgetPct>budgetMax?'over':'ok';
  const budgetStatus=budgetPct<budgetMin?'น้อยไป':budgetPct>budgetMax?'มากไป':'สมดุล';
  const slotDesc={gear:'สล็อตอุปกรณ์หลัก — เกราะ/อาวุธ',charm:'สล็อตเสริม — เครื่องราง',utility:'สล็อตอาหารเสริม/ไอเทมใช้แล้วทิ้ง'};
  const stash=(state.inventory.stash||[]).map(equipmentById).filter(Boolean);
  const slotsHTML=EQUIPMENT_SLOTS.map(slot=>{
    const item=inst.equipment?.[slot];
    if(item){
      const affixes=(item.affixes||[]).map(a=>`<span class="affix-stat">${a.stat||a.derived} +${a.value??0}</span>${a.cap!=null?` (cap ${a.cap})`:''}`).join(', ');
      return `<div class="equip-slot-card"><div class="equip-slot-info"><div class="equip-slot-name">${slot}</div><div class="equip-slot-item">${item.name||item.id}</div>${affixes?`<div class="equip-affix">${affixes}</div>`:''}</div><button class="equip-btn unequip" data-unequip="${slot}">ถอด</button></div>`;
    }
    const options=stash.filter(it=>it.slot===slot).map(it=>`<button class="equip-btn equip" data-equip="${it.id}">ใส่ ${it.name}</button>`).join('');
    return `<div class="equip-slot-card"><div class="equip-slot-info"><div class="equip-slot-name">${slot}</div><div class="equip-slot-empty">ว่าง</div><div class="equip-slot-desc">${slotDesc[slot]||''}</div></div><div class="equip-slot-actions">${options||'<span class="equip-slot-empty">ไม่มีของในคลัง</span>'}</div></div>`;
  }).join('');
  const flatHTML=['hp','atk','def','spd'].map(s=>{const v=flat[s]||0;return `<span class="${v===0?'zero':''}">${s.toUpperCase()} +${v}</span>`;}).join(' • ');
  panel.innerHTML=`<div class="equipment-panel"><div class="monster-selector"><select data-monster-select>${monsterSelectHTML(selectedId)}</select></div><div class="equip-summary"><div class="equip-summary-stats">${flatHTML}</div>${equippedCount>0?`<div class="budget-label">Power Budget: ${budgetPct}% (ควร ${budgetMin}-${budgetMax}%) — ${budgetStatus}</div><div class="budget-bar"><div class="budget-fill ${budgetClass}" style="width:${Math.min(100,budgetPct*5)}%"></div></div><div class="budget-range">0% — ${budgetMin}% — ${budgetMax}% — 20%</div>`:'<div class="budget-label">ยังไม่ได้ใส่อุปกรณ์</div>'}</div>${slotsHTML}<div class="equip-help"><b>3 สล็อก:</b> Gear / Charm / Utility<br><b>ถอดได้ตลอดเวลา</b> (reversible) — ไม่ทำลายสถิติ<br><b>Affix ประเภทเดียวกัน</b> — รวมกันแล้วไม่เกิน cap<br><b>พลังรวม</b> — ควรอยู่ ${budgetMin}-${budgetMax}% ของ combat power</div></div>`;
  bindMonsterSelect(panel,'equipSelectedId',renderEquipment);
  panel.querySelectorAll('[data-unequip]').forEach(b=>b.onclick=()=>{unequipMonster(inst.instanceId,b.dataset.unequip);renderEquipment();});
  panel.querySelectorAll('[data-equip]').forEach(b=>b.onclick=()=>{toggleStarterEquip(inst.instanceId,b.dataset.equip);renderEquipment();});
}
let immersiveStarted=true;
function startGameInteraction(){
  immersiveStarted=true;
  const gate=el('immersiveGate');
  if(gate){ gate.classList.add('hidden'); gate.style.display='none'; gate.style.pointerEvents='none'; }
  syncOrientationLock();
}
function requestImmersiveMode(e){
  e?.preventDefault?.();
  e?.stopPropagation?.();
  // Do not block gameplay while waiting for browser Fullscreen/Orientation promises.
  startGameInteraction();
  try{
    const fs=document.documentElement.requestFullscreen?.();
    if(fs?.catch) fs.catch(err=>console.warn('fullscreen rejected',err));
  }catch(err){ console.warn('fullscreen rejected',err); }
  try{
    const lock=screen.orientation?.lock?.('landscape');
    if(lock?.catch) lock.catch(err=>console.warn('orientation lock rejected',err));
  }catch(err){ console.warn('orientation lock rejected',err); }
  setTimeout(syncOrientationLock,120);
}
function syncOrientationLock(){
  const portrait=window.innerHeight>window.innerWidth;
  const gate=el('immersiveGate'), rotate=el('rotateNotice');
  // V7.0.2: startup overlays must never block gameplay.
  if(gate){ gate.classList.add('hidden'); gate.style.display='none'; gate.style.pointerEvents='none'; }
  if(rotate){
    rotate.classList.toggle('hidden',!portrait);
    rotate.style.pointerEvents='none';
  }
}

function ensureStarter(){
  if(state.collection.length)return;
  const starter=makeInstance(spById.flameling,1,{origin:'starter',bond:55,gender:Math.random()<.5?'Male':'Female'});state.collection.push(starter);state.party[0]=starter.instanceId;state.selectedSlot=0;
  msg('ได้รับ Flare Slime Lv.1 • มอนทุกธาตุเริ่มจาก Slime และจะ Evolution เป็นสัตว์เมื่อถึง Lv.2');
}

// ---------- World zones / wild encounters ----------
let nextId=1,zoneGeneration=0;const wilds=[],projectiles=[];let activeSummon=null;let pendingSummon=null;let summonCooldownUntil=0;
let hubCompanion=null;
const ZONES={
  hub:{label:'Ranch Hub',bg:0x72c7ef,ground:0x62c96b,spawn:[]},
  grassland:{label:'Green Meadow',bg:0x68d2f5,ground:0x56d364,spawn:[
    ['normalooze',-4,-2,1,{}],['flameling',4,-4,1,{}],['aquapuff',8,1,1,{}],['voltkit',-8,1,1,{}],['mossbun',1,-9,1,{}],['fairimp',-2,-13,1,{}],
    ['galebird',6,-10,2,{}],['toxitoad',-10,-7,2,{}],['punchcub',10,7,2,{}]
  ]},
  cave:{label:'Echo Cave',bg:0x334155,ground:0x57606f,spawn:[
    ['frostowl',-3,-1,2,{}],['ironbug',4,-5,2,{}],['rockhorn',7,1,2,{}],['ghostpurr',-7,1,2,{}],['sandmole',1,-9,2,{}],
    ['mindcoon',-2,-13,2,{}],['buglet',10,-2,2,{}],['voidhorn',-11,-10,3,{elite:true}],['emberdrake',8,8,3,{}],['emberdrake',-2,11,4,{boss:true}],
    ['flameling',12,-8,5,{elite:true,evolutionPath:'flame_wolf'}],['flameling',-12,6,5,{evolutionPath:'magma_bear'}]
  ]}
};
function setZoneLighting(zone){
  if(zone==='cave'){
    hemi.intensity=0.6;
    sun.intensity=0.8;
    sun.color.setHex(0xb0c4de);
  }else if(zone==='grassland'){
    hemi.intensity=1.55;
    sun.intensity=2.15;
    sun.color.setHex(0xffffff);
  }else{
    hemi.intensity=1.55;
    sun.intensity=2.15;
    sun.color.setHex(0xfff4e0);
  }
}
function setZoneGround(zone){
  const z=ZONES[zone];
  if(!z)return;
  const type=zone==='cave'?'cave':'grass';
  ground.material.map=makeGroundTexture(z.ground,type);
  ground.material.color.setHex(0xffffff);
  ground.material.needsUpdate=true;
  scene.background=makeSkyTexture(z.bg);
  scene.fog.color.setHex(zone==='cave'?0x1e293b:(zone==='hub'?0x65c9f5:z.bg));
  scene.fog.near=zone==='cave'?15:30;
  scene.fog.far=zone==='cave'?50:76;
  setZoneLighting(zone);
}
function createWild(sp,x,z,level=1,opts={}){
  const boss=!!opts.boss,elite=!!opts.elite||!!sp.elite,evolutionPath=opts.evolutionPath??((level>=2)&&sp.evolutionPaths?.[0]?.id||null),renderInst=evolutionPath?{speciesId:sp.id,evolutionPath,lifeStage:level<=2?'Juvenile':'Adult'}:null,mesh=monsterMesh(sp,false,renderInst,elite,boss);
  mesh.position.set(x,0,z);
  mesh.scale.multiplyScalar(boss?1.12:1.06);
  const markerColor=boss?0xfb7185:(elite?0xfde047:0x86efac);
  const marker=new THREE.Mesh(octahedronGeometry(boss?.22:.16),new THREE.MeshStandardMaterial({color:markerColor,emissive:markerColor,emissiveIntensity:.65,roughness:.35}));
  marker.position.set(0,boss?2.45:2.05,0);marker.name='wildMarker';mesh.add(marker);
  scene.add(mesh);setupMonsterMotion(mesh,sp,renderInst);const genes=randomGenes(sp),maxHp=Math.round(statValue(sp.base.hp,level,genes.hp,.14,0)*(boss?2.0:(elite?1.3:1)));
  const capturePolicy=boss?'disabled':(elite?'elite':'normal');
  const w={id:'w'+nextId++,speciesId:sp.id,level,maxHp,hp:maxHp,capturePolicy,atk:Math.round(statValue(sp.base.atk,level,genes.atk,.08,0)*(boss?1.35:(elite?1.12:1))),def:Math.round(statValue(sp.base.def,level,genes.def,.08,0)*(boss?1.3:(elite?1.1:1))),spd:statValue(sp.base.spd,level,genes.spd,.05,0),genes,gender:rollGender(sp),mesh,home:new THREE.Vector3(x,0,z),state:'wander',wanderT:0,wanderDir:new THREE.Vector3(Math.random()-.5,0,Math.random()-.5).normalize(),dir:new THREE.Vector3(Math.random()-.5,0,Math.random()-.5).normalize(),attackCd:0,dead:false,phase:Math.random()*6.28,engaged:false,resetTimer:0,boss,elite,zone:state.currentZone,evolutionPath,renderInst};
  w.labelEl=createWildLabel(w);wilds.push(w);return w;
}
function clearWilds(){
  for(const w of wilds){removeAndDispose(scene,w.mesh);removeWildLabel(w);}
  wilds.length=0;
  distanceTickScheduler.clearAll();
  labelTickScheduler.clearAll();
}
function retireWild(w){
  distanceTickScheduler.clear(w.id);
  labelTickScheduler.clear(`label:${w.id}`);
  const index=wilds.indexOf(w);
  if(index>=0)wilds.splice(index,1);
}
function livingWilds(){return wilds.filter(w=>!w.dead);}
function spawnZone(zone){const cfg=ZONES[zone];if(!cfg)return;for(const [id,x,z,l,opts] of cfg.spawn)createWild(spById[id],x,z,l,opts);}
function resetWild(w){if(w.dead)return;w.hp=w.maxHp;w.state='wander';w.engaged=false;w.resetTimer=0;w.attackCd=0;w.mesh.position.copy(w.home);}
function nearestWild(max=12,from=player.position){let best=null,bd=max;for(const w of wilds){if(w.dead)continue;const d=distXZ(from,w.mesh.position);if(d<bd){best=w;bd=d;}}return best;}
function aimedWild(maxRange=10,radius=1.35){
  const f=forward(),start=player.position,best={w:null,score:Infinity};for(const w of wilds){if(w.dead)continue;const v=w.mesh.position.clone().sub(start);v.y=0;const along=v.dot(f);if(along<1||along>maxRange)continue;const closest=start.clone().add(f.clone().multiplyScalar(along)),lat=distXZ(closest,w.mesh.position);if(lat<=radius&&lat+along*.015<best.score){best.w=w;best.score=lat+along*.015;}}return best.w;
}
function respawnWild(w,delay=6000){
  const generation=zoneGeneration,zone=w.zone,id=w.speciesId,level=w.level,boss=w.boss,elite=w.elite,x=w.home.x,z=w.home.z,evolutionPath=w.evolutionPath;
  setTimeout(()=>{
    if(zoneGeneration!==generation||state.currentZone!==zone||!ZONES[zone])return;
    createWild(spById[id],x,z,level,{boss,elite,evolutionPath});
  },delay);
}
function clearProjectiles(){ while(projectiles.length){ const p=projectiles.pop(); removeAndDispose(scene, p.mesh); } pendingSummon=null; }
function removeSceneRole(role,instanceId=null){
  for(let i=scene.children.length-1;i>=0;i--){
    const obj=scene.children[i];
    if(obj?.userData?.worldRole!==role) continue;
    if(instanceId!==null && obj.userData.instanceId!==instanceId) continue;
    removeAndDispose(scene, obj);
  }
}
function setHubVisibility(on){npc.visible=on;ranchPad.disk.visible=ranchPad.ring.visible=on;breedingPad.disk.visible=breedingPad.ring.visible=on;incubator.visible=on;}
function clearHubCompanion(){
  if(hubCompanion) removeAndDispose(scene, hubCompanion.mesh);
  hubCompanion=null;
  removeSceneRole('hubCompanion');
}
function syncHubCompanion(){
  clearHubCompanion();
  if(state.currentZone!=='hub'||activeSummon)return;
  const inst=selectedInstance();
  if(!inst||inst.hp<=0||inst.fainted)return;
  const sp=spById[inst.speciesId],mesh=monsterMesh(sp,true,inst);
  mesh.userData.worldRole='hubCompanion';
  mesh.userData.instanceId=inst.instanceId;
  mesh.position.copy(player.position).add(new THREE.Vector3(-1.35,0,1.25));
  mesh.scale.multiplyScalar(.92);
  scene.add(mesh);
  setupMonsterMotion(mesh,sp,inst);
  hubCompanion={inst,mesh,phase:Math.random()*6.28};
}
function updateHubCompanion(dt){
  if(!hubCompanion)return;
  if(state.currentZone!=='hub'||activeSummon||hubCompanion.inst.instanceId!==selectedInstance()?.instanceId){syncHubCompanion();return;}
  const f=forward(),r=cameraRight(),desired=player.position.clone().add(r.clone().multiplyScalar(-1.35)).add(f.clone().multiplyScalar(-1.25));
  desired.y=0;
  const d=distXZ(hubCompanion.mesh.position,desired);
  if(d>.12){
    const dir=desired.clone().sub(hubCompanion.mesh.position);dir.y=0;
    if(dir.lengthSq()>0.0001){dir.normalize();hubCompanion.mesh.position.addScaledVector(dir,Math.min(d,3.1*dt));hubCompanion.mesh.rotation.y=monsterLookYaw(dir,hubCompanion.mesh);}
  }
  hubCompanion.phase+=dt;
  animateEntity(hubCompanion.mesh,dt,d>.12,.9);
  animateMonster(hubCompanion.mesh,dt,d>.12);
}

function switchZone(zone,silent=false){
  if(!ZONES[zone])return;
  if(zone!=='hub'&&healthyPartyCount()===0){msg('Party ไม่มีมอนพร้อมสู้ • กลับไป Heal ฟรีกับผู้ดูแลมอนก่อน');return;}
  const safetyBalls=zone!=='hub'&&ensureCaptureBallSafety();
  zoneGeneration++;
  if(activeSummon)recall(false,false);
  clearProjectiles();
  clearHubCompanion();
  removeSceneRole('activeSummon');
  removeSceneRole('ranchVisual');
  summonCooldownUntil=0;
  clearWilds();
  clearTransientEffects();
  el('monsterManager').classList.add('hidden');
  state.currentZone=zone;
  const cfg=ZONES[zone];
  setZoneGround(zone);
  populateWorld(zone);
  player.position.set(0,0,5);
  playerData.hp=Math.max(1,playerData.hp);
  setHubVisibility(zone==='hub');
  spawnZone(zone);
  if(zone!=='hub'&&livingWilds().length===0)spawnZone(zone);
  syncRanchVisuals();
  syncHubCompanion();
  renderZoneUI();
  if(!silent)msg(zone==='hub'?`${selectedInstance()?displayName(selectedInstance())+' เดินเป็นคู่หูใน Ranch • ':''}Ranch เป็น Safe Zone • กด “ออกล่า” เพื่อไปจับมอน`:`${safetyBalls?'Keeper Starter Kit: Capture Ball +5 • ':''}${cfg.label} • Wild ${livingWilds().length} ตัว • ปาเรียกมอนก่อนสู้`);
  saveGame(false);
}

// ---------- Camera / input ----------
let cameraYaw=0,cameraPitch=.48;
const cameraPad=el('cameraPad');
let camDrag={active:false,pid:null,x:0,y:0};
cameraPad.addEventListener('pointerdown',e=>{camDrag.active=true;camDrag.pid=e.pointerId;camDrag.x=e.clientX;camDrag.y=e.clientY;cameraPad.setPointerCapture?.(e.pointerId);});
cameraPad.addEventListener('pointermove',e=>{if(!camDrag.active||e.pointerId!==camDrag.pid)return;const dx=e.clientX-camDrag.x,dy=e.clientY-camDrag.y;camDrag.x=e.clientX;camDrag.y=e.clientY;cameraYaw-=dx*.006;cameraPitch=THREE.MathUtils.clamp(cameraPitch+dy*.004,.20,.84);});
function endCam(e){if(e.pointerId!==camDrag.pid)return;camDrag.active=false;camDrag.pid=null;}
cameraPad.addEventListener('pointerup',endCam);
cameraPad.addEventListener('pointercancel',endCam);
const keys={};
addEventListener('keydown',e=>{keys[e.code]=true;if(e.repeat)return;if(e.code==='KeyJ')useSkill(0);if(e.code==='KeyK')useSkill(1);if(e.code==='KeyL')useSkill(2);if(e.code==='KeyC')captureThrow();if(e.code==='KeyR')summonThrow();if(e.code==='KeyT')recall();if(['Digit1','Digit2','Digit3'].includes(e.code)){switchPartySlot(Number(e.code.at(-1))-1);}});
addEventListener('keyup',e=>keys[e.code]=false);
const joy={x:0,y:0,active:false,pid:null};
const joyEl=el('joystick'); if(!joyEl) throw new Error('V8.1.0 boot: #joystick not found');
const stick=el('stick'); if(!stick) throw new Error('V8.1.0 boot: #stick not found');

function joyPoint(e){const r=joyEl.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const max=r.width*.34,mag=Math.hypot(dx,dy)||1;if(mag>max){dx*=max/mag;dy*=max/mag;}joy.x=dx/max;joy.y=dy/max;stick.style.transform=`translate(${dx}px,${dy}px)`;}
joyEl.addEventListener('pointerdown',e=>{joy.active=true;joy.pid=e.pointerId;joyEl.setPointerCapture(e.pointerId);joyPoint(e);});joyEl.addEventListener('pointermove',e=>{if(joy.active&&e.pointerId===joy.pid)joyPoint(e);});
function joyEnd(e){if(e.pointerId!==joy.pid)return;joy.active=false;joy.x=joy.y=0;stick.style.transform='translate(0,0)';}joyEl.addEventListener('pointerup',joyEnd);joyEl.addEventListener('pointercancel',joyEnd);
function forward(){return new THREE.Vector3(-Math.sin(cameraYaw),0,-Math.cos(cameraYaw)).normalize();}
function cameraRight(){const f=forward();return new THREE.Vector3(-f.z,0,f.x).normalize();}
function worldToScreen(pos){
  if(!pos)return {x:-9999,y:-9999,visible:false,z:2};
  const v=safeVec3(pos).project(camera);
  const visible=v.z>-1&&v.z<1&&Math.abs(v.x)<1.18&&Math.abs(v.y)<1.18;
  return {x:(v.x*.5+.5)*innerWidth,y:(-.5*v.y+.5)*innerHeight,visible,z:v.z};
}
function animateEntity(mesh,dt,moving=false,intensity=1){
  if(!mesh)return;
  mesh.userData.animPhase=(mesh.userData.animPhase??Math.random()*6.28)+dt*(moving?8:2.2);
  const p=mesh.userData.animPhase;
  const bob=(moving?.035:.012)*intensity;
  mesh.position.y=Math.sin(p)*bob;
  mesh.rotation.z+=(Math.sin(p*.5)*(moving?.015:.006)*intensity-mesh.rotation.z)*Math.min(1,dt*7);
}
function healthyPartyCount(){return state.party.filter(Boolean).map(getInst).filter(i=>i&&i.hp>0&&!i.fainted).length;}
// regression guard: healthyPartyCount()===0 blocks departure when every monster is fainted
function ensureCaptureBallSafety(){
  if((state.inventory.captureBalls||0)>0)return false;
  state.inventory.captureBalls=5;
  renderHUD(); saveGame(false);
  return true;
}
function createWildLabel(w){
  const root=el('worldLabels'); if(!root)return null;
  const d=document.createElement('div');
  d.className='world-monster-label'+(w.elite?' elite':'')+(w.boss?' boss':'');
  d.innerHTML=`<div class="world-label-name">${w.boss?'★ BOSS ':w.elite?'★ ELITE ':''}${wildDisplayName(w)} <span>Lv.${w.level}</span></div><div class="world-hp"><i></i></div>`;
  root.appendChild(d); return d;
}
function removeWildLabel(w){ if(w?.labelEl){w.labelEl.remove();w.labelEl=null;} }
function updateWorldLabels(dt){
  for(const w of wilds){
    if(w.dead||!w.labelEl){if(w.labelEl)w.labelEl.classList.add('hidden');continue;}
    const d=distXZ(player.position,w.mesh.position);
    if(!labelTickScheduler.advance(`label:${w.id}`,d,dt,w.engaged))continue;
    const screen=worldToScreen(w.mesh.position.clone().add(new THREE.Vector3(0,w.boss?2.55:2.15,0)));
    const visible=screen.visible&&d<19;
    w.labelEl.classList.toggle('hidden',!visible);
    if(!visible)continue;
    w.labelEl.style.left=`${screen.x}px`;w.labelEl.style.top=`${screen.y}px`;w.labelEl.style.opacity=String(clamp(1-(d-12)/9,.35,1));
    const fill=w.labelEl.querySelector('.world-hp i'); if(fill)fill.style.width=`${hpPct(w.hp/w.maxHp)*100}%`;
  }
}


// ---------- Combat / capture ----------
function damageWild(w,dmg,meta={}){if(w.dead)return;w.engaged=true;w.hp-=dmg;const hitType=meta.type||wildTypes(w)[0],hitEff=meta.eff??1;triggerMonsterAction(w.mesh,'hurt',0.22);spawnElementalFX(hitType,w.mesh.position.clone().add(new THREE.Vector3(0,.8,0)),'impact',0.75);spawnDamageNumber(dmg,w.mesh.position.clone().add(new THREE.Vector3(0,1.35,0)),{type:hitType,eff:hitEff});triggerCameraShake(hitEff>1?0.11:0.065,hitEff>1?0.16:0.11);w.mesh.scale.multiplyScalar(.94);setTimeout(()=>{if(!w.dead)w.mesh.scale.multiplyScalar(1/.94);},90);if(w.hp<=0){w.hp=0;spawnRingPulse(w.mesh.position.clone(),0xffffff,{scale:.68,life:.28});defeatWild(w);}}
function monsterExpNeed(level){return 24+level*18;}
function grantMonsterExp(inst,amount){if(!inst)return 0;inst.exp=(inst.exp||0)+amount;let ups=0;while(inst.exp>=monsterExpNeed(inst.level)){inst.exp-=monsterExpNeed(inst.level);levelUpInstance(inst);ups++;}inst.bond=clamp(inst.bond+Math.min(2,amount*.04));return ups;}
// V7.3: Battle event tracking for growth/training (per-encounter, cleared on defeat)
let battleEventLog=[];
function logBattleEvent(category,amount,meaningful=true){if(TRAINING_LINES.includes(category)&&amount>0)battleEventLog.push({category,amount,meaningful});}
function getEnemyTier(w){if(w.boss)return'boss';if(w.elite)return'elite';if(w.trial)return'trial';if(w.strong)return'strong';return'normal';}
function defeatWild(w){
  if(w.dead)return;
  w.dead=true;
  removeAndDispose(scene,w.mesh);
  removeWildLabel(w);
  state.exp+=12*w.level;
  // V7.3: Use resolveBattleGrowth + applyBattleGrowth instead of legacy grantMonsterExp
  const tier=getEnemyTier(w);
  const enemy={level:w.level,tier};
  const events=battleEventLog.splice(0); // consume events for this encounter
  let monGain=0,ups=0,trainSummary='',partyShareLine='';
  if(activeSummon){
    const inst=activeSummon.inst;
    // Ensure inst has V7.2 schema fields for applyBattleGrowth
    if(!inst.career)inst.career={battleWins:0,eliteWins:0,bossWins:0,trials:0,milestones:[]};
    if(!inst.training)inst.training={power:0,defense:0,speed:0,technique:0,spirit:0};
    const result=resolveBattleGrowth({monster:inst,enemy:{...enemy,milestoneId:w.boss?'first_boss':undefined},events,outcome:'win'});
    const applied=applyBattleGrowth(inst,result);
    monGain=result.growthExp;ups=applied.growth.leveledUp?applied.growth.toLevel-applied.growth.fromLevel:0;
    refreshStats(inst,false);
    if(ups>0)spawnLevelUpEffect(activeSummon.mesh.position.clone());
    const trainLines=TRAINING_LINES.filter(l=>result.trainingExp[l]>0);
    if(trainLines.length)trainSummary=' • Training: '+trainLines.map(l=>`${l[0].toUpperCase()+l.slice(1)} +${result.trainingExp[l]}`).join(' ');
    // Party share growth (non-active members get 35% of active's growth EXP)
    const share=resolvePartyShareGrowth({enemy,activeGrowthExp:monGain});
    for(const pid of state.party){if(pid&&pid!==inst.instanceId){const pm=getInst(pid);if(pm){if(!pm.growthExp)pm.growthExp=pm.exp||0;const grown=addGrowthExp(pm,share);if(grown.leveledUp)spawnLevelUpEffect(fxWorldPos(pm.instanceId));}}}
    const partyMembers=state.party.filter(id=>id&&id!==inst.instanceId);
    if(share>0&&partyMembers.length)partyShareLine=`\n  Party Share: +${share} EXP ละ/ตัว (${partyMembers.length} ตัว)`;
  }
  const tag=w.boss?'BOSS ':w.elite?'ELITE ':'';
  let battleMsg=`${tag}${wildDisplayName(w)} ถูกปราบ\n  +${12*w.level} Player EXP`;
  if(activeSummon){
    battleMsg+=`\n  ${displayName(activeSummon.inst)}: +${monGain} Growth EXP`;
    if(ups)battleMsg+=` • Lv.Up +${ups}!`;
    if(trainSummary)battleMsg+=trainSummary;
    if(partyShareLine)battleMsg+=partyShareLine;
  }
  msg(battleMsg);
  renderAll();
  saveGame(false);
  respawnWild(w,w.boss?BALANCE.bossRespawnMs:BALANCE.wildRespawnMs);
  retireWild(w);
}
function monsterDamage(attackerInst,move,defender,atkBuff=1){
  const stab=monsterTypes(attackerInst).includes(move.type)?1.5:1;
  const defTypes=defender?.instanceId?monsterTypes(defender):wildTypes(defender);
  const eff=typeEffectiveness(move.type,defTypes);
  const skillRec=getSkill(attackerInst,move.name)||getSkill(attackerInst,move.name?.split(' • ')[0]);
  const mastery=skillRec?masteryRawPower(skillRec.masteryRank):0;
  const derived=derivedStats(instanceCombatBuildSafe(attackerInst));
  return liveMoveDamage({
    movePower:move.power||0,
    atk:attackerInst.atk||spById[attackerInst.speciesId]?.base.atk||10,
    def:defender.def||10,
    attackerLevel:attackerInst.level||1,
    defenderLevel:defender.level||1,
    stab,
    effectiveness:eff,
    atkBuff,
    masteryPower:mastery,
    traitBonus:attackerInst.genes?.trait==='Fierce'?1.08:1,
    critRate:derived.critRate,
    critDamage:derived.critDamage,
    critRoll:Math.random()
  });
}
function instanceCombatBuildSafe(inst){
  const sp=spById[inst.speciesId];
  return computeCoreStats(inst,sp,getEvolutionPath(inst),getEquipmentFlat(inst)).build;
}
function wildDamage(w,inst){
  const sp=spById[w.speciesId],move={type:sp.types[0],power:w.boss?24:18};
  const eff=typeEffectiveness(move.type,monsterTypes(inst));
  return liveMoveDamage({
    movePower:move.power,
    atk:w.atk||sp.base.atk,
    def:inst.def||10,
    attackerLevel:w.level||1,
    defenderLevel:inst.level||1,
    stab:1.5,
    effectiveness:eff,
    atkBuff:1
  });
}
function throwProjectile(type,targetPos,onHit){const color=type==='capture'?0x3b82f6:0x8b5cf6,mesh=new THREE.Mesh(boxGeometry(.14,.14,.14),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.45,transparent:true,opacity:.96}));mesh.userData.spin=true;mesh.position.copy(playerThrowOrigin());mesh.castShadow=true;scene.add(mesh);spawnBurst(mesh.position.clone(),color,{count:5,life:.18,size:.04});projectiles.push({mesh,type,color,start:mesh.position.clone(),end:targetPos.clone(),t:0,duration:.55,onHit,lastTrail:0});}
function captureChance(w){
  if(w.capturePolicy==='disabled')return 0;
  const sp=spById[w.speciesId];
  return liveCaptureChance({
    speciesRate:sp.capture,
    hpRatio:w.maxHp>0?w.hp/w.maxHp:1,
    elite:w.capturePolicy==='elite'||!!w.elite,
    uncapturable:w.boss||w.capturePolicy==='disabled',
    eliteModifier:BALANCE.eliteCaptureModifier
  });
}
let captureAimActive=false;
const captureAimMat=new THREE.LineBasicMaterial({color:0x60a5fa,transparent:true,opacity:.8});
const captureAimGeom=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
const captureAimLine=new THREE.Line(captureAimGeom,captureAimMat);captureAimLine.visible=false;scene.add(captureAimLine);
function capturePrerequisite(){if(state.currentZone==='hub'){msg('ต้องไป Wild Zone เพื่อจับมอน');return false;}if(activeSummon){msg('ต้อง Recall มอนของเราก่อนเข้าสู่ Capture Aim');return false;}if((state.inventory.captureBalls||0)<=0){msg('Capture Ball หมด • กลับ Ranch แล้ว Keeper จะเติม Starter Kit +5');return false;}return true;}
function beginCaptureAim(){if(!capturePrerequisite())return false;captureAimActive=true;captureAimLine.visible=true;el('captureBtn').classList.add('aiming');renderSkillButtons();msg('Capture Aim • ลากด้านขวาหมุนกล้อง แล้วปล่อยปุ่มเพื่อขว้าง');return true;}
function cancelCaptureAim(){captureAimActive=false;captureAimLine.visible=false;el('captureBtn').classList.remove('aiming');renderSkillButtons();}
function updateCaptureAimVisual(){if(!captureAimActive)return;const t=aimedWild(BALANCE.captureRange,BALANCE.captureAimRadius),start=playerThrowOrigin().clone(),end=t?t.mesh.position.clone().add(new THREE.Vector3(0,.65,0)):player.position.clone().add(forward().multiplyScalar(8)).add(new THREE.Vector3(0,.15,0)),pts=[];for(let i=0;i<=18;i++){const u=i/18,p=start.clone().lerp(end,u);p.y+=Math.sin(u*Math.PI)*2.2;pts.push(p);}captureAimGeom.setFromPoints(pts);}
function executeCaptureThrow(){if(!captureAimActive)return;captureAimActive=false;captureAimLine.visible=false;el('captureBtn').classList.remove('aiming');if(!capturePrerequisite())return;playerVisual.play('throw',{duration:.34});state.inventory.captureBalls--;const t=aimedWild(BALANCE.captureRange,BALANCE.captureAimRadius),end=t?t.mesh.position.clone().add(new THREE.Vector3(0,.65,0)):player.position.clone().add(forward().multiplyScalar(8)).add(new THREE.Vector3(0,.15,0));throwProjectile('capture',end,()=>{if(!t||t.dead){msg('ปาพลาด/ลูกตกพื้น • เสีย Capture Ball 1 ลูก');renderHUD();saveGame(false);return;}resolveCapture(t);});if(t){msg(`ปา Capture Ball → ${t.boss?'BOSS ':t.elite?'ELITE ':''}${wildDisplayName(t)}`);}else msg('ปา Capture Ball ตามจุดเล็ง…');renderHUD();saveGame(false);}
function captureThrow(){if(beginCaptureAim())executeCaptureThrow();}
function resolveCapture(w){
  if(w.dead)return;
  const sp=spById[w.speciesId],name=wildDisplayName(w);
  if(w.capturePolicy==='disabled'){msg(`Boss ${name} จับไม่ได้ในเวอร์ชันนี้ • บอลถูกใช้ไปแล้ว`);return;}
  const chance=captureChance(w);
  if(Math.random()<chance){
    spawnBurst(w.mesh.position.clone().add(new THREE.Vector3(0,.7,0)),0x22c55e,{count:14,life:.42,size:.06});
    spawnRingPulse(w.mesh.position.clone(),0x22c55e,{scale:.75,life:.3});
    spawnGroundDecal(wildTypes(w)[0],w.mesh.position.clone(),{radius:1.1,duration:.8,intensity:.75});
    triggerCameraShake(.08,.12);
    const inst=makeInstance(sp,w.level,{origin:'captured',genes:w.genes,gender:w.gender,bond:24,evolutionPath:w.evolutionPath,secondaryType:wildPath(w)?.secondaryType??sp.types[1]??null});
    state.collection.push(inst);
    const empty=state.party.findIndex(x=>x===null);
    if(empty>=0)state.party[empty]=inst.instanceId;
    else state.storage.push(inst.instanceId);
    w.dead=true;
    removeAndDispose(scene,w.mesh);
    removeWildLabel(w);
    state.exp+=5;
    msg(`จับ ${name} สำเร็จ! ${empty>=0?'เข้า Party ช่อง '+(empty+1):'ส่งเข้า Storage'}${w.elite?' • ELITE':''}`);
    renderAll();
    saveGame(false);
    respawnWild(w,8000);
    retireWild(w);
  }else{
    msg(`จับ ${name} ไม่สำเร็จ (${Math.round(chance*100)}%) • บอลถูกใช้ไปแล้ว`);
    w.engaged=true;
    w.state='chase';
  }
}
function summonThrow(){const inst=selectedInstance();if(Date.now()<summonCooldownUntil){msg(`Switch cooldown ${(summonCooldownUntil-Date.now())/1000|0}s`);return;}if(state.currentZone==='hub'){msg('ใน Ranch จะแสดงคู่หูอัตโนมัติ • ออกไป Wild Zone ก่อนแล้วค่อยปาเรียก');return;}if(!inst){msg('Party ช่องนี้ว่าง');return;}if(activeSummon||pendingSummon){msg('ลงสนามได้ครั้งละ 1 ตัว • Recall ตัวเดิมก่อน');return;}if(inst.hp<=0||inst.fainted){msg(`${displayName(inst)} Fainted • Heal ฟรีที่ Ranch/NPC ก่อน`);return;}const end=player.position.clone().add(forward().multiplyScalar(4));end.y=.12;playerVisual.play('throw',{duration:.34});pendingSummon={instanceId:inst.instanceId};clearHubCompanion();throwProjectile('summon',end,()=>{if(!pendingSummon||pendingSummon.instanceId!==inst.instanceId)return;pendingSummon=null;spawnOwned(inst,end);});msg(`ปาเรียก ${displayName(inst)}`);}
function spawnOwned(inst,pos){
  clearHubCompanion();
  removeSceneRole('activeSummon');
  const sp=spById[inst.speciesId],mesh=monsterMesh(sp,true,inst);
  mesh.userData.worldRole='activeSummon';
  mesh.userData.instanceId=inst.instanceId;
  mesh.position.copy(pos);mesh.position.y=0;scene.add(mesh);setupMonsterMotion(mesh,sp,inst);
  spawnElementalFX(monsterTypes(inst)[0],pos.clone().add(new THREE.Vector3(0,.45,0)),'summon',1.05);
  activeSummon={inst,mesh,target:null,attackCd:.3,skillCds:[0,0,0],attackBuff:1,buffTimer:0,shieldReduction:0,shieldTimer:0};
  inst.bond=clamp(inst.bond+.4);
  msg(`${displayName(inst)} ลงสนาม • AI จะเลือกศัตรูใกล้ที่สุดและโจมตีพื้นฐานเอง`);
  renderParty();renderSkillButtons();renderHUD();
}
function recall(show=true,setCooldown=true){
  if(pendingSummon){pendingSummon=null;clearProjectiles();}
  if(!activeSummon){removeSceneRole('activeSummon');if(show)msg('ยังไม่มีมอนในสนาม');return;}
  playerVisual.play('recall',{duration:.28});
  const name=displayName(activeSummon.inst);
  spawnRingPulse(activeSummon.mesh.position.clone(),0x60a5fa,{scale:.62,life:.26});
  spawnBurst(activeSummon.mesh.position.clone().add(new THREE.Vector3(0,.55,0)),0x60a5fa,{count:8,life:.24,size:.05});
  removeAndDispose(scene, activeSummon.mesh);
  activeSummon=null;
  removeSceneRole('activeSummon');
  syncHubCompanion();
  if(setCooldown)summonCooldownUntil=Date.now()+1000;
  if(show)msg(`Recall ${name} แล้ว • Switch cooldown 1s`);
  renderParty();renderSkillButtons();renderHUD();
}
function faintActive(){if(!activeSummon){removeSceneRole('activeSummon');return;}const inst=activeSummon.inst;inst.hp=0;inst.fainted=true;const name=displayName(inst);spawnBurst(activeSummon.mesh.position.clone().add(new THREE.Vector3(0,.6,0)),0xef4444,{count:12,life:.32,size:.06,gravity:1.2});removeAndDispose(scene, activeSummon.mesh);activeSummon=null;pendingSummon=null;removeSceneRole('activeSummon');syncHubCompanion();summonCooldownUntil=Date.now()+800;msg(`${name} Fainted • Auto Recall • ต้อง Heal ที่ Ranch/NPC หรือ Item`);renderParty();renderSkillButtons();renderHUD();saveGame(false);}
function useSkill(index){
  if(!activeSummon){msg('ต้องปาเรียกมอนออกมาก่อน');return;}const a=activeSummon,move=getMonsterSkills(a.inst)[index];if(!move)return;if((a.skillCds[index]||0)>0){msg(`${move.name} คูลดาวน์ ${a.skillCds[index].toFixed(1)}s`);return;}
  let res=null;
  if(move.targetType==='enemy'){
    const t=nearestWild(move.range||5.5,a.mesh.position);if(!t){msg(`${move.name}: ไม่มีศัตรูในระยะ`);return;}playerVisual.play('skill',{duration:.28});triggerMonsterAction(a.mesh,'attack',0.24);spawnElementalFX(move.type,a.mesh.position.clone().add(new THREE.Vector3(0,.6,0)),'burst',1);spawnElementalFX(move.type,t.mesh.position.clone().add(new THREE.Vector3(0,.5,0)),'impact',0.9);res=monsterDamage(a.inst,move,t,a.attackBuff);spawnGroundDecal(move.type,t.mesh.position.clone(),{radius:1.05,duration:1.15,intensity:res.eff>1?1.2:1});damageWild(t,res.damage,{type:move.type,eff:res.eff});triggerCameraShake(res.eff>1?0.14:0.09,0.16);a.skillCds[index]=move.cooldown;const [lab]=effectLabel(res.eff);msg(`${displayName(a.inst)} ใช้ ${move.name} [${TYPE_TH[move.type]}] -${res.damage} • ${lab}${res.stab>1?' • STAB':''}`);logBattleEvent('power',res.damage);logBattleEvent('technique',move.power||10);
  }else if(move.targetType==='area'){
    const targets=wilds.filter(w=>!w.dead&&distXZ(a.mesh.position,w.mesh.position)<=move.range);if(!targets.length){msg(`${move.name}: ไม่มีศัตรูในพื้นที่`);return;}playerVisual.play('skill',{duration:.28});triggerMonsterAction(a.mesh,'attack',0.26);spawnElementalFX(move.type,a.mesh.position.clone().add(new THREE.Vector3(0,.65,0)),'summon',0.9);spawnGroundDecal(move.type,a.mesh.position.clone(),{radius:Math.min(2.8,move.range*.7),duration:1.45,intensity:1.15});triggerCameraShake(.11,.17);let total=0;for(const t of targets){spawnElementalFX(move.type,t.mesh.position.clone().add(new THREE.Vector3(0,.45,0)),'impact',0.75);res=monsterDamage(a.inst,move,t,a.attackBuff);spawnGroundDecal(move.type,t.mesh.position.clone(),{radius:.9,duration:1.05,intensity:res.eff>1?1.15:.9});damageWild(t,res.damage,{type:move.type,eff:res.eff});total+=res.damage;}a.skillCds[index]=move.cooldown;msg(`${displayName(a.inst)} ใช้ ${move.name} แบบ Area • โดน ${targets.length} ตัว • รวม ${total} Damage`);
  }else if(move.targetType==='self'){
    triggerMonsterAction(a.mesh,'attack',0.22);spawnElementalFX(move.type,a.mesh.position.clone().add(new THREE.Vector3(0,.6,0)),'summon',0.8);spawnGroundDecal(move.type,a.mesh.position.clone(),{radius:1.2,duration:1.2,intensity:.95});
    if(move.effect==='heal'){const gain=Math.round(a.inst.maxHp*move.value);a.inst.hp=clamp(a.inst.hp+gain,0,a.inst.maxHp);spawnDamageNumber(gain,a.mesh.position.clone().add(new THREE.Vector3(0,1.25,0)),{type:move.type,healing:true,label:'HEAL'});msg(`${displayName(a.inst)} ใช้ ${move.name} • ฟื้น HP ${gain}`);logBattleEvent('spirit',move.value*10);}
    if(move.effect==='shield'){a.shieldReduction=move.value;a.shieldTimer=move.duration;msg(`${displayName(a.inst)} ใช้ ${move.name} • ลด Damage ${Math.round(move.value*100)}% ${move.duration}s`);logBattleEvent('defense',move.duration*3);}
    if(move.effect==='buffAtk'){a.attackBuff=move.value;a.buffTimer=move.duration;msg(`${displayName(a.inst)} ใช้ ${move.name} • เพิ่มพลังโจมตี ${move.duration}s`);logBattleEvent('power',move.duration*3);}a.skillCds[index]=move.cooldown;
  }
  a.inst.bond=clamp(a.inst.bond+.3);
  // V7.5: Award Skill EXP for skill usage (mastery progression)
  if(move&&a.inst){
    if(!Array.isArray(a.inst.skills))a.inst.skills=[];
    let skillRec=getSkill(a.inst,move.name);
    if(!skillRec)skillRec=learnSkill(a.inst,{skillId:move.name,slot:'s'+(index+1)});
    const hitQuality=res&&res.eff?res.eff:1;const spamCount=(a._skillSpam=a._skillSpam||{})[move.name]||0;
    a._skillSpam[move.name]=(a._skillSpam[move.name]||0)+1;
    const sExp=computeSkillExp({base:move.power||10,hitQuality,targetTier:1,spamCount,contribution:1});
    if(sExp>0){const sResult=addSkillExp(a.inst,move.name,sExp);
      if(sResult&&sResult.rankedUp){showMasteryPopup(displayName(a.inst),move.name,sResult.toRank);spawnMasteryUpEffect(a.mesh.position.clone());}}
  }
  renderParty();renderSkillButtons();
}
function updateOwned(dt){
  const a=activeSummon;if(!a)return;const sp=spById[a.inst.speciesId];a.attackCd=Math.max(0,a.attackCd-dt);a.skillCds=a.skillCds.map(x=>Math.max(0,x-dt));if(a.buffTimer>0){a.buffTimer-=dt;if(a.buffTimer<=0)a.attackBuff=1;}if(a.shieldTimer>0){a.shieldTimer-=dt;if(a.shieldTimer<=0)a.shieldReduction=0;}
  let t=a.target;if(!t||t.dead||distXZ(a.mesh.position,t.mesh.position)>12)t=nearestWild(9,a.mesh.position);a.target=t;let moving=false;if(t){const d=distXZ(a.mesh.position,t.mesh.position);if(d>1.35){moving=true;const dir=t.mesh.position.clone().sub(a.mesh.position);dir.y=0;dir.normalize();a.mesh.position.addScaledVector(dir,(a.inst.spd*.18+1.5)*dt);a.mesh.rotation.y=monsterLookYaw(dir,a.mesh);}else if(a.attackCd<=0){a.attackCd=.9;triggerMonsterAction(a.mesh,'attack',0.22);spawnElementalFX(monsterTypes(a.inst)[0],t.mesh.position.clone().add(new THREE.Vector3(0,.45,0)),'impact',0.62);const basic={name:'Basic Attack',type:sp.types[0],power:15};const res=monsterDamage(a.inst,basic,t,a.attackBuff);damageWild(t,res.damage,{type:basic.type,eff:res.eff});logBattleEvent('power',res.damage);}}
  animateEntity(a.mesh,dt,moving,1); animateMonster(a.mesh,dt,moving);
}
function selectWildAggressors(){
  const target=(activeSummon&&activeSummon.mesh)?activeSummon.mesh:player;
  if(!target?.position)return new Set();
  const candidates=wilds.map(w=>({
    id:w.id,
    dead:w.dead,
    engaged:w.engaged,
    targetValid:!!w.mesh?.position,
    distanceToTarget:w.mesh?.position?distXZ(w.mesh.position,target.position):Infinity,
    distanceFromHome:w.mesh?.position&&w.home?distXZ(w.mesh.position,w.home):Infinity
  }));
  return new Set(selectEngagedWildIds(candidates,ENCOUNTER_POLICY));
}
function updateWild(w,dt,canEngage=false){
  if(!w||w.dead||!w.mesh)return;
  w.attackCd=tickCooldown(w.attackCd,dt);
  w.wanderT=(Number.isFinite(w.wanderT)?w.wanderT:0)-dt;
  w.dir=ensureDirection(w.dir||w.wanderDir);
  w.wanderDir=w.dir;

  const target=(activeSummon&&activeSummon.mesh)?activeSummon.mesh:player;
  const targetValid=!!target?.position;
  const distanceToTarget=targetValid?distXZ(w.mesh.position,target.position):Infinity;
  const distanceFromHome=w.home?distXZ(w.mesh.position,w.home):Infinity;
  if(shouldResetEncounter({
    engaged:w.engaged,
    targetValid,
    distanceToTarget,
    distanceFromHome,
    leashRadius:ENCOUNTER_POLICY.leashRadius,
    disengageRadius:ENCOUNTER_POLICY.disengageRadius
  })) resetWild(w);

  if(!canEngage||!targetValid){
    if(w.engaged)resetWild(w);
    if(w.wanderT<=0){
      w.state='wander';
      w.wanderT=1.6+Math.random()*2.2;
      w.dir=ensureDirection(null);
      w.wanderDir=w.dir;
    }
    let moving=false;
    if(w.state==='wander'){
      const next=safeVec3(w.mesh.position).add(safeVec3(w.dir,0,0,-1).multiplyScalar(dt*.9));
      if(w.home&&distXZ(next,w.home)>2.2){w.dir.multiplyScalar(-1);w.wanderDir=w.dir;}
      w.mesh.position.addScaledVector(w.dir,dt*.9);
      w.mesh.rotation.y=monsterLookYaw(w.dir,w.mesh);
      moving=true;
    }
    animateEntity(w.mesh,dt,moving,w.boss?1.2:1);
    animateMonster(w.mesh,dt,moving);
    return;
  }

  w.engaged=true;
  w.state='chase';
  let moving=false;
  const distance=distXZ(w.mesh.position,target.position);
  if(distance>1.25){
    moving=true;
    const dir=safeVec3(target.position).sub(w.mesh.position);dir.y=0;
    if(dir.lengthSq()>0.000001)dir.normalize();else dir.set(0,0,-1);
    w.mesh.position.addScaledVector(dir,(w.spd*.16+1.2)*dt);
    w.mesh.rotation.y=monsterLookYaw(dir,w.mesh);
  }else if(w.attackCd<=0){
    w.attackCd=w.boss?.85:1.2;
    triggerMonsterAction(w.mesh,'attack',0.22);
    spawnElementalFX(wildTypes(w)[0],safeVec3(target.position).add(new THREE.Vector3(0,.55,0)),'impact',0.65);
    if(activeSummon&&activeSummon.mesh){
      const res=wildDamage(w,activeSummon.inst),reduction=activeSummon.shieldTimer>0?activeSummon.shieldReduction:0,dmg=Math.round(res.damage*(1-reduction));
      activeSummon.inst.hp-=dmg;
      spawnDamageNumber(dmg,safeVec3(activeSummon.mesh.position).add(new THREE.Vector3(0,1.25,0)),{type:wildTypes(w)[0],eff:res.eff});
      triggerCameraShake(w.boss?.15:.09,w.boss?.2:.14);
      if(activeSummon.inst.hp<=0)faintActive();
      renderParty();
    }else if(playerData.invuln<=0){
      const playerDmg=Math.round(w.atk*(w.boss?.7:.48));
      playerData.hp-=playerDmg;playerData.invuln=.5;
      spawnDamageNumber(playerDmg,safeVec3(playerHitText()),{type:wildTypes(w)[0]});
      triggerCameraShake(w.boss?.17:.1,w.boss?.22:.15);
      playerVisual.play('hurt',{duration:.24});
      spawnBurst(safeVec3(player.position).add(new THREE.Vector3(0,1,0)),0xef4444,{count:8,life:.22,size:.04,gravity:1});
      if(playerData.hp<=0){playerData.hp=playerData.maxHp;msg('ผู้เล่นหมด HP • กลับ Ranch Hub');switchZone('hub',true);}
      renderHUD();
    }
  }
  animateEntity(w.mesh,dt,moving,w.boss?1.2:1);
  animateMonster(w.mesh,dt,moving);
}
function updateProjectiles(dt){for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];if(!p?.mesh||!p.start||!p.end){if(p?.mesh)removeAndDispose(scene, p.mesh);projectiles.splice(i,1);continue;}p.t+=dt/p.duration;const t=Math.min(1,p.t);p.mesh.position.lerpVectors(p.start,p.end,t);p.mesh.position.y+=Math.sin(t*Math.PI)*2.2;if(p.mesh.userData.spin){p.mesh.rotation.x+=dt*10;p.mesh.rotation.y+=dt*14;}if(t-p.lastTrail>.08){p.lastTrail=t;if(p.type==='summon'&&pendingSummon){const inst=getInst(pendingSummon.instanceId);if(inst)spawnElementalFX(monsterTypes(inst)[0],p.mesh.position.clone(),'trail',0.55);}else{spawnBurst(p.mesh.position.clone(),p.color,{count:3,life:.12,size:.03});}}if(t>=1){spawnBurst(safeVec3(p.end),p.color,{count:6,life:.16,size:.04});removeAndDispose(scene, p.mesh);projectiles.splice(i,1);p.onHit?.();}}}

// ---------- V8.1.0 Ranch / life / training core ----------
function trainingNeed(level){return 34+level*22;}
function levelUpInstance(inst){
  const need=Math.max(1,growthExpForLevel((inst.level||1)+1)-(inst.growthExp||0));
  addGrowthExp(inst,need);
  refreshStats(inst,true);
  if(inst?.instanceId)spawnLevelUpEffect(fxWorldPos(inst.instanceId));
}
// V7.2: simulateLife adapter — syncs flat fields → body/mind, calls simulateLife, syncs back
function syncToBodyMind(inst){inst.body=inst.body||{};inst.mind=inst.mind||{};
  inst.body.hunger=inst.hunger??inst.body.hunger??80;inst.body.energy=inst.energy??inst.body.energy??82;
  inst.body.fitness=inst.fitness??inst.body.fitness??50;inst.body.health=inst.body.health??100;
  inst.mind.mood=inst.mood??inst.mind.mood??72;inst.mind.stress=inst.mind.stress??10;
  inst.mind.bond=inst.bond??inst.mind.bond??24;inst.mind.trust=inst.mind.trust??20;inst.mind.discipline=inst.mind.discipline??20;
  if(!inst.lastSimulationAt)inst.lastSimulationAt=inst.body.lastSimulationAt||Date.now();}
function syncFromBodyMind(inst){if(!inst.body||!inst.mind)return;
  inst.hunger=inst.body.hunger;inst.energy=inst.body.energy;inst.fitness=inst.body.fitness;
  inst.mood=inst.mind.mood;inst.bond=inst.mind.bond??inst.bond;inst.body.health=inst.body.health;}
function applyLifeSimulation(now=Date.now(),show=false){const last=state.lifeLastAt||now,elapsed=Math.max(0,now-last);if(elapsed<1000)return;state.lifeLastAt=now;const minutes=elapsed/60000;let trained=0;for(const id of state.storage){const inst=getInst(id);if(!inst)continue;
  syncToBodyMind(inst);
  const beforeCond=deriveCondition(inst);
  simulateLife(inst,now);
  syncFromBodyMind(inst);
  const afterCond=deriveCondition(inst);
  if(['tired','fatigued','bad'].includes(afterCond)&&afterCond!==beforeCond)spawnConditionBadEffect(fxWorldPos(id));
  const focus=inst.trainingFocus||'power';
  const baseGain=minutes*1.8;
  const trainGain=ranchTrainingGain(inst,focus,baseGain);
  const applied=addTrainingExp(inst,focus,trainGain);
  inst.trainingExp=(inst.trainingExp||0)+applied;
  if(applied>0){trained++;refreshStats(inst,false);}
  if(!pendingEvent)triggerRaisingEvent(inst);
}if(show&&trained>0)msg(`Ranch Training • เติม Training Pool ${trained} ตัว`);}
// V7.4: Food definitions mapped to resolveFeed categories
const FOOD_DEFS=FOOD_CATALOG;
function feedMonster(id,food){
  const inst=getInst(id);if(!inst)return;
  if((state.inventory[food]||0)<=0){msg('อาหารหมด • รับอาหารทดสอบจาก NPC');return;}
  state.inventory[food]--;
  // V7.4: Use resolveFeed from food-care.mjs (needs body/mind schema)
  const bondBefore=inst.bond||0;
  syncToBodyMind(inst);
  const def=FOOD_DEFS[food]||{id:food,category:'daily',effects:{}};
  const sp=spById[inst.speciesId]||{};
  const result=resolveFeed(inst,def,{species:sp,now:Date.now()});
  syncFromBodyMind(inst);
  refreshStats(inst,false);
  if(food==='healthy'){inst.hp=inst.maxHp;inst.fainted=false;}
  if(result.rejected){state.inventory[food]++;msg(`อาหาร: ${result.reason||'ใช้ไม่ได้'}`);renderManager();return;}
  spawnFeedEffect(fxWorldPos(id),FOOD_FX_COLOR[food]||0x22c55e);
  if((inst.bond||0)>bondBefore)spawnBondUpEffect(fxWorldPos(id));
  const favText=result.favorite?' (Favorite!)':'';
  const overText=result.overfull?' (Overfull -70%)':'';
  const extra=result.catalyst?' • catalyst':result.category==='nutrition'?` • Nutrition +${result.applied}`:result.category==='training'?` • Training buff ×${result.multiplier}`:'';
  msg(`ให้อาหาร ${displayName(inst)} • ${def.name||food} • Bond ${Math.round(inst.bond)}${favText}${overText}${extra}`);
  renderManager();renderParty();saveGame(false);
}
// V7.4: Care actions (rest/play) from food-care.mjs
function careAction(id,action){
  const inst=getInst(id);if(!inst)return;
  syncToBodyMind(inst);
  const result=action==='rest'?careRest(inst,{now:Date.now()}):carePlay(inst,{now:Date.now()});
  syncFromBodyMind(inst);
  refreshStats(inst,false);
  const label=action==='rest'?'พักผ่อน':'เล่นด้วย';
  if(action==='rest')spawnRestEffect(fxWorldPos(id));
  else{spawnPlayEffect(fxWorldPos(id));spawnBondUpEffect(fxWorldPos(id));}
  msg(`${displayName(inst)} • ${label} • ${action==='rest'?`พลัง ${Math.round(inst.energy)} ลดเครียด`:`อารมณ์ ${Math.round(inst.mood)} Bond ${Math.round(inst.bond)}`}`);
  renderManager();renderParty();saveGame(false);
}
// V7.6: Equipment functions (3-slot reversible loadout)
function equipMonsterItem(id,item){
  const inst=getInst(id);if(!inst)return;
  const result=equipItem(inst,item);
  if(result.ok){refreshStats(inst,false);msg(`${displayName(inst)} → Equip ${item.id} [${item.slot}]${result.previous?` (แทนที่ ${result.previous.id})`:''}`);renderManager();saveGame(false);}
  else msg('Equipment: invalid item/slot');
}
function unequipMonster(id,slot){
  const inst=getInst(id);if(!inst)return;
  const removed=unequip(inst,slot);
  if(removed){refreshStats(inst,false);msg(`${displayName(inst)} → Unequip ${slot} (${removed.id})`);renderManager();saveGame(false);}
}
function getEquipmentFlat(inst){
  if(!inst.equipment)return{hp:0,atk:0,def:0,spd:0};
  const items=equippedItems(inst);
  const contrib=computeEquipmentContribution(items);
  return contrib.flat;
}
// V7.8: Raising Events — sample event definitions
const RAISING_EVENTS=RAISING_EVENT_CATALOG;
let pendingEvent=null;
function triggerRaisingEvent(inst){
  if(!inst||pendingEvent)return;
  syncToBodyMind(inst);
  const eligible=evaluateEventTriggers(RAISING_EVENTS,inst,{now:Date.now()});
  if(!eligible.length)return;
  const picked=rollEvent(eligible,Date.now()%10000);
  if(!picked)return;
  pendingEvent={instId:inst.instanceId,eventDef:picked.def};
  const choices=getChoices(picked.def);
  const choiceText=choices.map((c,i)=>`${i+1}. ${c.label}`).join(' / ');
  msg(`★ ${displayName(inst)}: ${picked.def.id} — เลือก: ${choiceText}`);
  renderRaisingEventBanner();
  showEventPopup(inst,picked.def);
}
function showEventPopup(inst,eventDef){
  const popup=el('eventPopup');if(!popup)return;
  const title=el('eventTitle');
  if(title)title.textContent=`${displayName(inst)}: ${eventDef.id}`;
  const choices=el('eventChoices');
  if(!choices)return;
  choices.innerHTML='';
  for(const c of getChoices(eventDef)){
    const btn=document.createElement('button');
    btn.textContent=c.label;
    btn.onclick=()=>resolveRaisingEvent(c.id);
    choices.appendChild(btn);
  }
  popup.classList.remove('hidden');
}
function showMasteryPopup(monName,skillName,newRank){
  const popup=document.createElement('div');
  popup.className='mastery-popup';
  popup.innerHTML=`★ ${monName} • ${skillName} → <b>${(MASTERY_TH[newRank]||newRank).toUpperCase()}</b>!`;
  document.body.appendChild(popup);
  setTimeout(()=>{
    popup.classList.add('fade');
    setTimeout(()=>popup.remove(),500);
  },3000);
}
function resolveRaisingEvent(choiceId){
  if(!pendingEvent)return;
  const inst=getInst(pendingEvent.instId);if(!inst){pendingEvent=null;el('eventPopup')?.classList.add('hidden');return;}
  syncToBodyMind(inst);
  const result=applyChoice(inst,pendingEvent.eventDef,choiceId,{now:Date.now()});
  syncFromBodyMind(inst);
  if(result.ok){refreshStats(inst,false);msg(`${displayName(inst)} • ${pendingEvent.eventDef.id}:${choiceId}`);}
  pendingEvent=null;
  renderRaisingEventBanner();
  el('eventPopup')?.classList.add('hidden');
  renderManager();saveGame(false);
}
function renderRaisingEventBanner(){
  const box=el('raisingEventBanner');
  if(!box)return;
  if(!pendingEvent){box.classList.add('hidden');box.innerHTML='';return;}
  const inst=getInst(pendingEvent.instId);
  const choices=getChoices(pendingEvent.eventDef);
  box.classList.remove('hidden');
  box.innerHTML=`<div class="event-title">★ Event: ${displayName(inst)||'?'} • ${pendingEvent.eventDef.id}</div><div class="event-choices">${choices.map(c=>`<button data-choice="${c.id}">${c.label}</button>`).join('')}</div>`;
  box.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>resolveRaisingEvent(b.dataset.choice));
}
function setTraining(id,focus){const inst=getInst(id);if(!inst)return;inst.trainingFocus=focus;
  syncToBodyMind(inst);
  const gain=ranchTrainingGain(inst,focus,15);
  const applied=addTrainingExp(inst,focus,gain);
  if(applied>0){inst.trainingExp=(inst.trainingExp||0)+applied;refreshStats(inst,false);}
  spawnTrainingEffect(fxWorldPos(id),focus);
  msg(`${displayName(inst)} → Training: ${TRAIN_FOCUS[focus]} +${Math.round(applied)}${applied<gain?' (pool full!)':''}`);
  renderManager();if(currentManagerTab==='training')renderTraining();saveGame(false);}
function healAll(){for(const inst of state.collection){refreshStats(inst,true);inst.fainted=false;}playerData.hp=playerData.maxHp;msg('NPC Heal ฟรี • Party และ Storage ฟื้น HP เต็มทั้งหมด');renderAll();renderManager();saveGame(false);}
const ranchVisuals=new Map();
function syncRanchVisuals(){
  for(const [id,obj] of ranchVisuals){removeAndDispose(scene, obj.mesh);ranchVisuals.delete(id);}
  removeSceneRole('ranchVisual');
  if(state.currentZone!=='hub')return;
  state.ranchActive=state.ranchActive.filter(id=>state.storage.includes(id)).slice(0,RANCH_ACTIVE_MAX);
  const ids=state.ranchActive;
  ids.forEach((id,i)=>{const inst=getInst(id);if(!inst)return;const sp=spById[inst.speciesId],mesh=monsterMesh(sp,true,inst),a=(i/Math.max(1,ids.length))*Math.PI*2;mesh.userData.worldRole='ranchVisual';mesh.userData.instanceId=inst.instanceId;mesh.position.set(ranchCenter.x+Math.cos(a)*1.8,0,ranchCenter.z+Math.sin(a)*1.8);scene.add(mesh);if(typeof setupMonsterMotion==='function')setupMonsterMotion(mesh,sp,inst);ranchVisuals.set(id,{mesh,phase:Math.random()*10,home:mesh.position.clone()});});
}

function updateRanchVisuals(dt){let i=0;for(const obj of ranchVisuals.values()){obj.phase+=dt*.55;const radius=.45+(i%3)*.12,tx=obj.home.x+Math.cos(obj.phase)*radius,tz=obj.home.z+Math.sin(obj.phase*.8)*radius;const moving=Math.hypot(tx-obj.mesh.position.x,tz-obj.mesh.position.z)>.08;obj.mesh.position.x+=(tx-obj.mesh.position.x)*dt*.8;obj.mesh.position.z+=(tz-obj.mesh.position.z)*dt*.8;const dir=new THREE.Vector3(tx-obj.mesh.position.x,0,tz-obj.mesh.position.z);if(dir.lengthSq()>.0001)obj.mesh.rotation.y=monsterLookYaw(dir.normalize(),obj.mesh);animateEntity(obj.mesh,dt,true,.65);animateMonster(obj.mesh,dt,moving);i++;}}
function toggleRanchActive(id){if(!state.storage.includes(id))return;if(state.ranchActive.includes(id)){state.ranchActive=state.ranchActive.filter(x=>x!==id);msg('เก็บมอนออกจากลาน Ranch แล้ว');}else{if(state.ranchActive.length>=RANCH_ACTIVE_MAX){msg(`Ranch Active เต็ม ${RANCH_ACTIVE_MAX} ตัว`);return;}state.ranchActive.push(id);msg(`ปล่อย ${displayName(getInst(id))} ออกมาเดินใน Ranch`);}syncRanchVisuals();renderManager();renderHUD();saveGame(false);}

// ---------- Breeding / genetics ----------
function adultForBreeding(inst){return ['Adult','Mature'].includes(inst.lifeStage);}
function isCloseRelative(a,b){if(!a||!b)return false;if(a.instanceId===b.instanceId)return true;if(a.parentAId===b.instanceId||a.parentBId===b.instanceId||b.parentAId===a.instanceId||b.parentBId===a.instanceId)return true;const ap=[a.parentAId,a.parentBId].filter(Boolean),bp=[b.parentAId,b.parentBId].filter(Boolean);return ap.some(x=>bp.includes(x));}
function genderCompatible(a,b){if(!a||!b)return false;if(a.gender==='Genderless'||b.gender==='Genderless')return true;return (a.gender==='Male'&&b.gender==='Female')||(a.gender==='Female'&&b.gender==='Male');}
function breedingCompatibility(a,b){
  if(!a||!b)return{ok:false,text:'เลือก Parent A และ Parent B'};if(a.instanceId===b.instanceId)return{ok:false,text:'ต้องเป็นมอนคนละตัว'};if(!state.storage.includes(a.instanceId)||!state.storage.includes(b.instanceId))return{ok:false,text:'พ่อแม่ต้องอยู่ใน Storage/Ranch'};if(!adultForBreeding(a)||!adultForBreeding(b))return{ok:false,text:'ต้องโตถึง Adult ก่อน'};
  const sa=spById[a.speciesId],sb=spById[b.speciesId];if(sa.breedingGroup!==sb.breedingGroup)return{ok:false,text:`Breeding Group ไม่ตรง (${sa.breedingGroup}/${sb.breedingGroup})`};if(!genderCompatible(a,b))return{ok:false,text:`Gender ไม่เข้ากัน (${a.gender}/${b.gender})`};if(a.bond<50||b.bond<50)return{ok:false,text:'Bond ของทั้งสองตัวต้อง ≥ 50'};if(isCloseRelative(a,b))return{ok:false,text:'ไม่อนุญาตญาติใกล้ชิด'};return{ok:true,text:`เข้ากันได้ • ${sa.breedingGroup} • Bond ≥ 50`};
}
function eggHolder(a,b){if(a.gender==='Female')return a;if(b.gender==='Female')return b;if(a.gender==='Genderless')return a;if(b.gender==='Genderless')return b;return null;}
function resolveBreedingSpecies(a,b,holder){for(const r of BREEDING_RECIPES){const ids=[a.speciesId,b.speciesId].sort().join('+');if(ids===r.parents.slice().sort().join('+'))return spById[r.childSpeciesId];}return spById[holder.speciesId];}
function chooseInheritedPotential(a,b,key){const vals=[a.genes[key],b.genes[key]];if(Math.random()<.18)return rand(POTENTIALS);return rand(vals);}
function makeChild(a,b,holder){
  const sp=resolveBreedingSpecies(a,b,holder);
  syncToBodyMind(a);syncToBodyMind(b);
  const bred=breedFn(a,b,{species:{id:sp.id,aptitudeBase:sp.aptitudeBase||{power:3,defense:3,speed:3,technique:3,spirit:3},allowedSecondary:sp.allowedSecondary||[]},seed:`${a.instanceId}+${b.instanceId}+${Date.now()}`,now:Date.now(),personalityPool:personalities});
  if(!bred.ok)return null;
  const mother=a.gender==='Female'?a:(b.gender==='Female'?b:holder);
  const father=mother===a?b:a;
  const child=makeInstance(sp,1,{
    origin:'bred',
    genes:{...bred.child.genes,trait:Math.random()<.5?a.genes.trait:b.genes.trait,skillGene:Math.random()<.5?a.genes.skillGene:b.genes.skillGene,typeAffinity:Math.random()<.5?a.genes.typeAffinity:b.genes.typeAffinity},
    aptitude:bred.child.aptitude,
    personality:bred.child.personalityId||rand(personalities),
    bond:12,hunger:90,energy:90,mood:88,fitness:42,
    generation:bred.child.generation,
    parentAId:a.instanceId,parentBId:b.instanceId,
    motherId:mother?.instanceId||null,fatherId:father?.instanceId||null,
    secondaryType:bred.child.secondaryType??sp.types[1]??null
  });
  child.lifeStage='Baby';
  child.skillPotential=bred.child.skillPotential||[];
  return child;
}
function createEgg(){const a=getInst(state.breeding.parentA),b=getInst(state.breeding.parentB),compat=breedingCompatibility(a,b);if(!compat.ok){msg(compat.text);renderBreeding();return;}
  a.parents=a.parents||{a:a.parentAId||null,b:a.parentBId||null};
  b.parents=b.parents||{a:b.parentAId||null,b:b.parentBId||null};
  const breedCheck=canBreedFn(a,b);
  if(!breedCheck.ok){msg(`Breeding: ${breedCheck.reason}`);renderBreeding();return;}const holder=eggHolder(a,b);if(!holder){msg('ไม่พบผู้ถือไข่ที่เข้ากันได้');return;}
  const child=makeChild(a,b,holder);if(!child){msg('สร้างลูกไม่สำเร็จ');return;}
  a.energy=clamp(a.energy-15);b.energy=clamp(b.energy-15);
  const hatchMs=30000+Math.floor(Math.random()*30001);
  const wrapped=createEggFn({ok:true,child},{hatchMs,now:Date.now()});
  const egg={eggId:'e'+Date.now()+'-'+Math.floor(Math.random()*9999),parentAId:a.instanceId,parentBId:b.instanceId,eggHolderId:holder.instanceId,createdAt:Date.now(),readyAt:wrapped.egg.hatchAt,child:wrapped.egg.child};
  state.eggs.push(egg);
  let posA=fxWorldPos(a.instanceId),posB=fxWorldPos(b.instanceId);
  if(posA.distanceTo(posB)<.05){posA=incubator.position.clone().add(new THREE.Vector3(-.8,0,0));posB=incubator.position.clone().add(new THREE.Vector3(.8,0,0));}
  spawnBreedingEffect(posA,posB);
  msg(`สร้างไข่สำเร็จ • ผู้ถือไข่ ${displayName(holder)} • ฟัก ${Math.round(hatchMs/1000)} วินาที`);renderManager();saveGame(false);}
function hatchEgg(eggId){const egg=state.eggs.find(e=>e.eggId===eggId);if(!egg)return;if(Date.now()<egg.readyAt){msg('ไข่ยังไม่พร้อมฟัก');return;}const a=getInst(egg.parentAId),b=getInst(egg.parentBId),holder=getInst(egg.eggHolderId);if(!a||!b||!holder){msg('ข้อมูลพ่อแม่/ผู้ถือไข่ไม่ครบ');return;}
  const child=egg.child?ensureInstanceShape({...egg.child,origin:'bred',parentAId:a.instanceId,parentBId:b.instanceId}):makeChild(a,b,holder);
  if(!child){msg('ฟักไข่ไม่สำเร็จ');return;}
  refreshStats(child,true);
  state.collection.push(child);state.storage.push(child.instanceId);state.eggs=state.eggs.filter(e=>e.eggId!==eggId);
  appendHistory(child,{type:'birth',origin:'bred',parentA:a.instanceId,parentB:b.instanceId});
  spawnHatchEffect(incubator.position.clone());
  msg(`ฟักไข่! ได้ ${displayName(child)} Gen ${child.generation} • Species ตามผู้ถือไข่ ${displayName(holder)}`);renderAll();renderManager();saveGame(false);}

// ---------- Evolution ----------
function evoRequirementStatus(inst,path){
  const sp=spById[inst.speciesId];
  syncToBodyMind(inst);
  const def=evoDefFromPath(path,sp.id);
  const result=evaluateEvolution(def,inst);
  const items=(result.failedRequired||[]).map(r=>`✗ ${r.field} ${r.op} ${r.value}`);
  if(reqEnvironment(path)){
    const envOk=state.currentZone===path.requires.environment;
    if(!envOk)items.push(`✗ Environment ${ZONES[path.requires.environment]?.label||path.requires.environment}`);
    return {ok:result.eligible&&envOk,text:items.length?items.join(' • '):'ผ่านเงื่อนไขทั้งหมด',result};
  }
  return {ok:result.eligible,text:items.length?items.join(' • '):(result.eligible?'ผ่านเงื่อนไขทั้งหมด':'ยังไม่พร้อม'),result};
}
function reqEnvironment(path){return !!path?.requires?.environment;}
function showEvolution(id){state.evolutionCandidate=id;setManagerTab('evolution');}
function evolveMonster(id,pathId){const inst=getInst(id),sp=spById[inst?.speciesId],path=sp?.evolutionPaths?.find(p=>p.id===pathId);if(!inst||!path||inst.formId===path.id||inst.evolutionPath===path.id)return;
  syncToBodyMind(inst);
  const def=evoDefFromPath(path,sp.id);
  const st=evoRequirementStatus(inst,path);
  if(!st.ok){msg(st.text||'ยังไม่ผ่านเงื่อนไข Evolution');return;}
  if(!confirm(`Evolution ย้อนกลับไม่ได้\n${displayName(inst)} → ${path.name}\nยืนยันหรือไม่?`))return;
  const oldColor=colorNum(monsterTypes(inst)[0]);
  const committed=commitEvolution(inst,def,{now:Date.now()});
  if(!committed.ok){msg(committed.reason||'Evolution ไม่สำเร็จ');return;}
  inst.evolutionPath=path.id;
  inst.evolutionProfile=def.profile;
  if(path.secondaryType&&sp.allowedSecondary.includes(path.secondaryType))inst.secondaryType=path.secondaryType;
  const newColor=colorNum(monsterTypes(inst)[0]);
  spawnEvolutionEffect(fxWorldPos(id),oldColor,newColor);
  refreshStats(inst,true);msg(`${sp.name} Evolution → ${path.name} สำเร็จ!`);syncRanchVisuals();renderAll();renderManager();saveGame(false);}
function evoHistoryHTML(inst){
  const hist=inst.evolutionHistory||[];
  if(!hist.length)return '';
  return `<div class="evo-history"><div class="evo-history-title">ประวัติ Evolution</div>${hist.map(h=>`<div class="evo-history-item">${h.from||'base'} → ${h.to} • ${new Date(h.at||Date.now()).toLocaleDateString('th-TH',{year:'2-digit',month:'short',day:'numeric'})}</div>`).join('')}</div>`;
}
function renderEvolution(){
  const box=el('evolutionPreview'),inst=getInst(state.evolutionCandidate);
  if(!inst){box.innerHTML='เลือก “ดู Evolution” จากการ์ดมอนเพื่อดูเส้นทาง';return;}
  const sp=spById[inst.speciesId],paths=availableEvolutionPaths(inst);
  const identity=`<div class="evo-identity-lock">🔒 Gene / Parents / Generation ไม่เปลี่ยน (Identity Lock)</div>`;
  const carry=`<div class="evo-skill-carry">Skill Carry: 70-100% mastery EXP ส่งต่อ</div>`;
  const budgetMin=Math.round((BALANCE_CONFIG.powerBudget?.evolution?.min??0.05)*100);
  const budgetMax=Math.round((BALANCE_CONFIG.powerBudget?.evolution?.max??0.1)*100);
  const budget=`<span class="evo-budget-badge ok">Power Budget ${budgetMin}-${budgetMax}%</span>`;
  if(!paths.length){
    const p=getEvolutionPath(inst);
    box.innerHTML=`<div class="evo-card"><div class="evo-title"><b>${displayName(inst)}</b><span>${p?'Form ปัจจุบัน':'ยังไม่มีสาขา'}</span></div><div class="evo-details">${p?`วิวัฒนาการแล้ว • Type ${monsterTypes(inst).map(t=>TYPE_TH[t]).join('/')} • HP ${inst.maxHp} ATK ${inst.atk} DEF ${inst.def} SPD ${inst.spd}`:`${sp.name} ยังไม่มี Evolution Path จากฟอร์มนี้`}</div>${identity}${evoHistoryHTML(inst)}</div>`;
    return;
  }
  box.innerHTML='';
  for(const p of paths){
    const st=evoRequirementStatus(inst,p),types=[sp.types[0],p.secondaryType??inst.secondaryType??sp.types[1]].filter(Boolean),mods=p.statMods||{},skills=getMonsterSkills(inst).map(s=>s.name).join(', '),d=document.createElement('div');
    d.className='evo-card';
    d.innerHTML=`<div class="evo-title"><b>${displayName(inst)} → ${p.name}</b><span>${st.ok?'พร้อม':'ยังไม่พร้อม'}</span></div><div class="evo-details">รูปร่าง: ${p.name} (Form/สี/ขนาดใหม่)<br>Type: ${types.map(t=>TYPE_TH[t]).join(' / ')} — Primary ${TYPE_TH[sp.types[0]]} ล็อกตาม Species<br>Stats: HP ×${mods.hp||1} • ATK ×${mods.atk||1} • DEF ×${mods.def||1} • SPD ×${mods.spd||1}<br>Skills หลัง Evolution: ${skills}<br>เงื่อนไข: ${st.text}</div>${carry}${identity}<div style="margin-top:6px">${budget}</div><button ${st.ok?'':'disabled'} title="${st.text}">${st.ok?'ยืนยัน Evolution':st.text}</button>${evoHistoryHTML(inst)}`;
    d.querySelector('button').onclick=()=>evolveMonster(inst.instanceId,p.id);
    box.appendChild(d);
  }
}

// ---------- NPC manager ----------
function isNearNpc(){return state.currentZone==='hub'&&distXZ(player.position,npc.position)<3.4;}
function updateNpcUI(){const b=el('npcBtn');if(isNearNpc()&&state.currentZone==='hub'&&el('monsterManager').classList.contains('hidden')){const p=worldToScreen(npc.position.clone().add(new THREE.Vector3(0,2.0,0)));if(p.visible){b.classList.remove('hidden');b.textContent='คุย';b.style.left=`${p.x}px`;b.style.top=`${p.y}px`;}else b.classList.add('hidden');}else b.classList.add('hidden');}
function openManager(){if(!isNearNpc()){msg('กลับ Ranch Hub และเข้าใกล้ NPC ก่อน');return;}if(ensureCaptureBallSafety())msg('Keeper Starter Kit • Capture Ball +5');applyLifeSimulation(Date.now(),true);el('monsterManager').classList.remove('hidden');setManagerTab(currentManagerTab||'collection');renderManager();managerDirty.consume(performance.now());}
function closeManager(){el('monsterManager').classList.add('hidden');saveGame(false);renderParty();}
function depositMonster(id){if(activeSummon?.inst.instanceId===id)recall(false);const slot=state.party.findIndex(x=>x===id);if(slot<0)return;state.party[slot]=null;if(!state.storage.includes(id))state.storage.push(id);state.ranchActive=state.ranchActive.filter(x=>x!==id);state.lifeLastAt=Date.now();syncRanchVisuals();syncHubCompanion();msg('ฝากมอนเข้า Storage/Ranch แล้ว');renderManager();renderParty();saveGame(false);}
function withdrawMonster(id){const empty=state.party.findIndex(x=>x===null);if(empty<0){msg('Party เต็ม 3 ตัว');return;}applyLifeSimulation(Date.now(),true);state.storage=state.storage.filter(x=>x!==id);state.ranchActive=state.ranchActive.filter(x=>x!==id);state.party[empty]=id;state.selectedSlot=empty;syncRanchVisuals();syncHubCompanion();msg(`รับมอนเข้า Party ช่อง ${empty+1}`);renderManager();renderParty();saveGame(false);}
function needsHTML(inst){
  syncToBodyMind(inst);
  const cond=deriveCondition(inst)||'normal';
  return `<div class="need-row"><div class="need-chip">หิว <strong>${fmt(inst.hunger)}</strong></div><div class="need-chip">พลัง <strong>${fmt(inst.energy)}</strong></div><div class="need-chip">อารมณ์ <strong>${fmt(inst.mood)}</strong></div><div class="need-chip cond-${cond}">สภาพ <strong>${cond}</strong></div></div>`;
}
function trainingPoolHTML(inst){
  const used=instTrainingUsed(inst);
  const cap=BALANCE_CONFIG.training.capacity.base+BALANCE_CONFIG.training.capacity.perLevel*inst.level;
  const pct=cap>0?Math.round(used/cap*100):0;
  const focus=inst.trainingFocus||'power';
  const linesHTML=TRAINING_LINES.map(l=>{
    const val=inst.training?.[l]||0;
    const maxBand=BALANCE_CONFIG.training.diminishing.find(b=>val<b.upTo)||{upTo:200};
    const linePct=Math.min(100,Math.round(val/Math.max(1,maxBand.upTo)*100));
    return `<div class="pool-line ${l===focus?'focus':''}"><span class="line-name">${l[0].toUpperCase()+l.slice(1)}</span><div class="line-bar"><div class="line-fill line-${l}" style="width:${linePct}%"></div></div><span class="line-val">${Math.round(val)}</span></div>`;
  }).join('');
  return `<div class="training-pool"><div class="pool-header"><span>Training Pool</span><span class="pool-count">${Math.round(used)} / ${cap}</span></div><div class="pool-bar"><div class="pool-bar-fill" style="width:${pct}%"></div></div><div class="pool-lines">${linesHTML}</div></div>`;
}
function skillsMiniHTML(inst){
  if(!Array.isArray(inst.skills)||!inst.skills.length)return '';
  return `<div class="skill-mini">${inst.skills.map(s=>{
    const rank=s.masteryRank||'novice';
    return `<span class="skill-chip ${rank}" title="${MASTERY_TH[rank]||rank}">${s.skillId} ${MASTERY_DOTS[rank]||''}</span>`;
  }).join('')}</div>`;
}
function equipMiniHTML(inst){
  if(!inst.equipment)return '';
  const hasAny=EQUIPMENT_SLOTS.some(s=>inst.equipment[s]);
  if(!hasAny)return '';
  return `<div class="equip-mini">${EQUIPMENT_SLOTS.map(s=>{
    const item=inst.equipment[s];
    return `<span class="equip-slot ${item?'filled':''}">${item?item.id:'—'}</span>`;
  }).join('')}</div>`;
}
function geneHTML(inst){return `Gene HP ${inst.genes.hp} • ATK ${inst.genes.atk} • DEF ${inst.genes.def} • SPD ${inst.genes.spd} • Trait: ${inst.genes.trait||'-'}`;}
function breakdownHTML(inst){
  const br=inst.statBreakdown||{};
  const atk=br.atk,def=br.def;
  if(!atk)return '';
  return `<div class="stat-breakdown">ATK ${atk.final} = base ${Math.round(atk.speciesBase)} + lv ${Math.round(atk.levelGrowth)} + train ${Math.round(atk.training)} + eq ${Math.round(atk.equipmentFlat)} × gene ${atk.geneRank} × evo ${atk.evolutionProfile} × cond ${atk.conditionModifier.toFixed(2)} • DEF ${def?.final??'-'}</div>`;
}
function familyHTML(inst){
  const a=getInst(inst.parents?.a||inst.parentAId),b=getInst(inst.parents?.b||inst.parentBId);
  if(a||b)return `<div class="family-line">Gen ${inst.generation} • พ่อแม่ ${a?displayName(a):'?'} × ${b?displayName(b):'?'}</div>`;
  return `<div class="family-line">Gen ${inst.generation} • Origin ${inst.origin||'captured'}</div>`;
}
function skillPanelHTML(inst){
  const defs=SKILL_CANDIDATES[inst.speciesId]||[];
  const owned=inst.skills||[];
  const cand=defs.filter(d=>!getSkill(inst,d.id));
  const rows=[];
  for(const rec of owned){
    const muts=SKILL_MUTATIONS[rec.skillId]||[];
    rows.push(`<div class="skill-line">${rec.skillId} • ${rec.masteryRank}${rec.mutationId?' • '+rec.mutationId:''}${!rec.mutationId&&rec.masteryRank==='master'&&muts.length?` <button data-mutate="${rec.skillId}">Mutation</button>`:''}</div>`);
  }
  for(const d of cand){
    const ev=evaluateSkillCandidate(d,inst);
    rows.push(`<div class="skill-line">${d.id} ${ev.eligible?`<button data-learn="${d.id}">เรียน</button>`:`<span class="skill-lock">ล็อก: ${(ev.failedRequired||[]).map(r=>r.field).join(', ')||'ยังไม่พร้อม'}</span>`}</div>`);
  }
  return rows.length?`<div class="skill-panel">${rows.join('')}</div>`:'';
}
function bindManagerAction(node,handler){
  if(!node)return;
  node.addEventListener('pointerdown',event=>{
    event.preventDefault();
    event.stopPropagation();
    handler();
  },{passive:false});
}
function monsterCrValue(inst){
  try{
    return formatCrReport(inst,spById[inst.speciesId],getEvolutionPath(inst),getEquipmentFlat(inst)).rated.cr;
  }catch{
    return null;
  }
}
function monsterCard(inst,where){
  const sp=spById[inst.speciesId],types=monsterTypes(inst).map(typeBadge).join(''),wrap=document.createElement('div');wrap.className='manager-item';const active=state.ranchActive.includes(inst.instanceId),faint=inst.fainted||inst.hp<=0,cr=monsterCrValue(inst);
  const eq=inst.equipment||{};
  const stash=(state.inventory.stash||[]).map(equipmentById).filter(Boolean);
  wrap.innerHTML=`<div class="monster-main"><div class="monster-title"><b>${displayName(inst)}</b>${types}</div><div class="monster-meta">Lv.${inst.level} • ${inst.lifeStage} • Gen ${inst.generation} • ${inst.personality} • <span class="gender">${GENDER_TH[inst.gender]||inst.gender}</span> • Group ${sp.breedingGroup}<br>HP ${fmt(inst.hp)}/${inst.maxHp} • ATK ${inst.atk} • DEF ${inst.def} • SPD ${inst.spd} • CR ${cr??'—'} • Bond ${fmt(inst.bond)} ${faint?'<span class="fainted">• FAINTED</span>':''}</div>${needsHTML(inst)}${breakdownHTML(inst)}${familyHTML(inst)}<div class="gene-line">${geneHTML(inst)}</div>${where==='storage'?trainingPoolHTML(inst):''}${skillsMiniHTML(inst)}${equipMiniHTML(inst)}${skillPanelHTML(inst)}<div class="feed-actions"><button data-feed="protein">โปรตีน</button><button data-feed="healthy">สุขภาพ</button><button data-feed="favorite">ของโปรด</button><button data-feed="trainingChow">อาหารฝึก</button><button data-feed="mineralBite">แร่บำรุง</button><button data-feed="emberFruit">ผลไฟ</button><button data-feed="moonFruit">ผลจันทร์</button></div><div class="care-actions"><button data-care="rest">💤 พักผ่อน</button><button data-care="play">🎾 เล่นด้วย</button></div><div class="equip-actions">${stash.map(item=>`<button data-equip="${item.id}">${eq[item.slot]?.id===item.id?'ถอด':'ใส่'} ${item.name}</button>`).join('')}</div>${where==='storage'?`<div class="train-actions"><button data-train="power">Power</button><button data-train="defense">Defense</button><button data-train="speed">Speed</button><button data-train="technique">Technique</button><button data-train="spirit">Spirit</button></div>`:''}</div><div class="manager-actions"><button class="move-btn ${where==='storage'?'withdraw':''}">${where==='storage'?'เข้า Party':'ฝาก Storage'}</button>${where==='storage'?`<button class="ranch-toggle ${active?'active':''}">${active?'เก็บจากลาน':'ปล่อยใน Ranch'}</button>`:''}${sp.evolutionPaths?.length?'<button class="evo-btn">ดู Evolution</button>':''}<button class="cr-btn">ดู CR</button></div>`;
  wrap.querySelectorAll('[data-feed]').forEach(b=>b.onclick=()=>feedMonster(inst.instanceId,b.dataset.feed));
  wrap.querySelectorAll('[data-care]').forEach(b=>b.onclick=()=>careAction(inst.instanceId,b.dataset.care));
  wrap.querySelectorAll('[data-equip]').forEach(b=>b.onclick=()=>toggleStarterEquip(inst.instanceId,b.dataset.equip));
  wrap.querySelectorAll('[data-train]').forEach(b=>{if(b.dataset.train===inst.trainingFocus)b.classList.add('active');b.onclick=()=>setTraining(inst.instanceId,b.dataset.train);});
  wrap.querySelectorAll('[data-learn]').forEach(b=>b.onclick=()=>learnCandidateSkill(inst.instanceId,b.dataset.learn));
  wrap.querySelectorAll('[data-mutate]').forEach(b=>b.onclick=()=>mutateOwnedSkill(inst.instanceId,b.dataset.mutate));
  wrap.querySelector('.move-btn').onclick=()=>where==='storage'?withdrawMonster(inst.instanceId):depositMonster(inst.instanceId);
  const rt=wrap.querySelector('.ranch-toggle');if(rt)rt.onclick=()=>toggleRanchActive(inst.instanceId);
  const eb=wrap.querySelector('.evo-btn');if(eb)bindManagerAction(eb,()=>showEvolution(inst.instanceId));
  bindManagerAction(wrap.querySelector('.cr-btn'),()=>showCrDebug(inst.instanceId));
  return wrap;
}
function toggleStarterEquip(id,itemId){
  const inst=getInst(id);if(!inst)return;
  const item=equipmentById(itemId);if(!item)return;
  if(inst.equipment?.[item.slot]?.id===item.id)unequipMonster(id,item.slot);
  else{
    const preview=loadoutPreview(instanceCombatBuildSafe(inst),computeEquipmentContribution([{...item,affixes:item.affixes.map(a=>({...a}))}]));
    msg(`Preview ${item.name}: CR ${preview.crDelta>=0?'+':''}${Math.round(preview.crDelta)} • DPS ${preview.dpsDelta>=0?'+':''}${Math.round(preview.dpsDelta)} • EHP ${preview.ehpDelta>=0?'+':''}${Math.round(preview.ehpDelta)}`);
    equipMonsterItem(id,{...item,affixes:item.affixes.map(a=>({...a}))});
  }
}
function learnCandidateSkill(id,skillId){
  const inst=getInst(id);if(!inst)return;
  const def=(SKILL_CANDIDATES[inst.speciesId]||[]).find(d=>d.id===skillId);if(!def)return;
  const ev=evaluateSkillCandidate(def,inst);
  if(!ev.eligible){msg(`ยังเรียน ${skillId} ไม่ได้ • ${(ev.failedRequired||[]).map(r=>r.field+' '+r.op+' '+r.value).join(' • ')}`);return;}
  learnSkill(inst,{skillId:def.id,slot:def.slot||'s1'});
  msg(`${displayName(inst)} เรียน ${def.id}`);
  renderManager();if(currentManagerTab==='skills')renderSkills();saveGame(false);
}
function mutateOwnedSkill(id,skillId){
  const inst=getInst(id);if(!inst)return;
  const mut=(SKILL_MUTATIONS[skillId]||[])[0];if(!mut)return;
  const owned=getSkill(inst,skillId);
  const result=applyMutation(inst,{skillId,baseSkillDef:{id:skillId,damage:100},mutationDef:mut});
  if(!result.ok){msg(`Mutation ไม่ผ่าน: ${result.reason}`);return;}
  msg(`${displayName(inst)} • ${skillId} mutate → ${mut.name}`);
  renderManager();saveGame(false);
}
function showCrDebug(id){
  state.crCandidate=id;
  const rated=renderCrDebug();
  const box=el('crDebugPanel');
  if(box){
    box.classList.add('open');
    box.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  const inst=getInst(id);
  if(inst&&rated)msg(`${displayName(inst)} • CR ${rated.cr} • DPS ${Math.round(rated.dps)} • EHP ${Math.round(rated.ehp)}`);
}
function breedingAdultIds(){return state.storage.filter(id=>{const i=getInst(id);return i&&adultForBreeding(i);});}
let pickerTarget='parentA';
function parentButtonHTML(inst){if(!inst)return '<span class="parent-empty">＋ เลือกมอน</span>';const sp=spById[inst.speciesId];return `<span class="parent-orb" style="background:#${sp.color.toString(16).padStart(6,'0')}">${displayName(inst).slice(0,1)}</span><span><b>${displayName(inst)}</b><small>${GENDER_TH[inst.gender]||inst.gender} • Bond ${fmt(inst.bond)} • ${sp.breedingGroup}</small></span>`;}
function closeMonsterPicker(){el('monsterPicker').classList.add('hidden');}
function openMonsterPicker(target){pickerTarget=target;const list=el('monsterPickerList'),ids=breedingAdultIds();el('pickerTitle').textContent=target==='parentA'?'เลือก Parent A':'เลือก Parent B';list.innerHTML='';if(!ids.length){list.innerHTML='<div class="manager-empty">ยังไม่มีมอน Adult/Mature ใน Storage</div>';}for(const id of ids){const inst=getInst(id),sp=spById[inst.speciesId],selected=state.breeding[target]===id,d=document.createElement('button');d.className='picker-mon-card'+(selected?' selected':'');d.innerHTML=`<span class="picker-orb" style="background:#${sp.color.toString(16).padStart(6,'0')}">${displayName(inst).slice(0,1)}</span><span class="picker-info"><b>${displayName(inst)}</b><small>Lv.${inst.level} • ${inst.lifeStage} • ${GENDER_TH[inst.gender]||inst.gender}</small><small>Bond ${fmt(inst.bond)} • Group ${sp.breedingGroup}</small></span>${inst.bond>=50?'<span class="picker-ok">พร้อม</span>':'<span class="picker-warn">Bond ต่ำ</span>'}`;d.onclick=()=>{state.breeding[target]=id;closeMonsterPicker();renderBreeding();};list.appendChild(d);}el('monsterPicker').classList.remove('hidden');}
function renderBreeding(){
  const ids=breedingAdultIds();
  if(state.breeding.parentA&&!ids.includes(state.breeding.parentA))state.breeding.parentA=null;
  if(state.breeding.parentB&&!ids.includes(state.breeding.parentB))state.breeding.parentB=null;
  const a=getInst(state.breeding.parentA),b=getInst(state.breeding.parentB),compat=breedingCompatibility(a,b),c=el('compatibilityText');
  el('parentABtn').innerHTML=parentButtonHTML(a);
  el('parentBBtn').innerHTML=parentButtonHTML(b);
  c.textContent=compat.text;
  c.className='compatibility '+(a&&b?(compat.ok?'ok':'bad'):'');
  el('breedBtn').disabled=!compat.ok;
  if(a&&b){
    const holder=eggHolder(a,b);
    const genePreview=CORE_GENES.map(g=>{
      const ga=a.genes?.[g]||'B',gb=b.genes?.[g]||'B';
      return `<div class="gene-inherit-cell"><span class="gene-label">${g.toUpperCase()}</span><span class="gene-pred">${ga}/${gb}</span><span class="gene-pct">45%/45%/10%</span></div>`;
    }).join('');
    const relative=isCloseRelative(a,b);
    const relativeHTML=relative?'<div class="close-relative-warn">⚠ ญาติสนิท — ไม่สามารถผสมพันธุ์ได้</div>':'<div class="close-relative-ok">✓ ไม่ใช่ญาติสนิท — ผสมพันธุ์ได้</div>';
    const childGen=Math.max(a.generation||1,b.generation||1)+1;
    const births=(state.collection||[]).filter(m=>m.origin==='bred'||(m.lifeHistory||[]).some(h=>h.type==='birth'));
    const birthHTML=births.length?`<div class="birth-history">${births.slice(-6).map(m=>`<div class="birth-history-item">ฟัก ${displayName(m)} • Gen ${m.generation}</div>`).join('')}</div>`:'';
    el('inheritPreview').innerHTML=`ผู้ถือไข่: <b>${holder?displayName(holder):'ไม่พบ'}</b> • Species ตามผู้ถือไข่<br><div class="gen-counter">ลูกรุ่น Gen ${childGen}</div>${relativeHTML}<div class="gene-inherit-preview">${genePreview}</div><div style="font-size:8px;color:#64748b;margin-top:4px">45% จาก A • 45% จาก B • 10% mutation (70%เหมือน / 15%ดีขึ้น / 15%แย่ลง)</div>${birthHTML}`;
  }else el('inheritPreview').textContent='เลือกพ่อแม่เพื่อดูแนวโน้ม Gene ที่ส่งต่อ';
  const list=el('eggList');
  list.innerHTML='';
  if(!state.eggs.length)list.innerHTML='<div class="manager-empty">ยังไม่มีไข่ใน Incubator</div>';
  const now=Date.now();
  for(const egg of state.eggs){
    const pa=getInst(egg.parentAId),pb=getInst(egg.parentBId),holder=getInst(egg.eggHolderId);
    const remain=remainingCountdownSeconds(egg.readyAt,now),d=document.createElement('div');
    d.className='egg-card';
    d.dataset.eggReadyAt=String(egg.readyAt);
    d.innerHTML=`<div class="egg-top"><span class="egg-icon">🥚</span><b data-egg-countdown>${remain>0?remain+'s':'พร้อมฟัก!'}</b></div><div class="egg-meta">${pa?displayName(pa):'?'} × ${pb?displayName(pb):'?'}<br>ผู้ถือไข่: ${holder?displayName(holder):'?'}</div><button data-egg-hatch ${remain>0?'disabled':''}>${remain>0?'กำลังฟัก':'ฟักไข่'}</button>`;
    d.querySelector('[data-egg-hatch]').onclick=()=>hatchEgg(egg.eggId);
    list.appendChild(d);
  }
}
function updateEggCountdowns(now=Date.now()){
  const list=el('eggList');
  if(!list)return;
  for(const card of list.querySelectorAll('[data-egg-ready-at]')){
    const remain=remainingCountdownSeconds(Number(card.dataset.eggReadyAt),now);
    const status=remain>0?remain+'s':'พร้อมฟัก!',action=remain>0?'กำลังฟัก':'ฟักไข่';
    const label=card.querySelector('[data-egg-countdown]'),button=card.querySelector('[data-egg-hatch]');
    if(label&&label.textContent!==status)label.textContent=status;
    if(button){
      if(button.disabled!==(remain>0))button.disabled=remain>0;
      if(button.textContent!==action)button.textContent=action;
    }
  }
}
function renderManager(){applyLifeSimulation(Date.now());const partyBox=el('managerParty'),storageBox=el('managerStorage');partyBox.innerHTML='';storageBox.innerHTML='';const partyIds=state.party.filter(Boolean);el('partyCountLabel').textContent=`${partyIds.length}/3`;el('storageCountLabel').textContent=`${state.storage.length}`;el('ranchActiveCountLabel').textContent=`${state.ranchActive.length}/${RANCH_ACTIVE_MAX}`;if(!partyIds.length)partyBox.innerHTML='<div class="manager-empty">Party ว่าง</div>';partyIds.forEach(id=>{const i=getInst(id);if(i)partyBox.appendChild(monsterCard(i,'party'));});if(!state.storage.length)storageBox.innerHTML='<div class="manager-empty">Storage ว่าง</div>';state.storage.forEach(id=>{const i=getInst(id);if(i)storageBox.appendChild(monsterCard(i,'storage'));});el('foodProtein').textContent=state.inventory.protein||0;el('foodHealthy').textContent=state.inventory.healthy||0;el('foodFavorite').textContent=state.inventory.favorite||0;if(el('foodTraining'))el('foodTraining').textContent=state.inventory.trainingChow||0;if(el('foodMineral'))el('foodMineral').textContent=state.inventory.mineralBite||0;if(el('foodEmber'))el('foodEmber').textContent=state.inventory.emberFruit||0;if(el('foodMoon'))el('foodMoon').textContent=state.inventory.moonFruit||0;el('managerBallCount').textContent=state.inventory.captureBalls||0;renderRaisingEventBanner();renderEvolution();renderBreeding();renderCrDebug();}
function renderCrDebug(){
  const box=el('crDebugPanel');if(!box)return;
  const inst=getInst(state.crCandidate);
  if(!inst){
    box.classList.remove('open');
    box.textContent='เลือกมอนแล้วกด “ดู CR” เพื่อแยกแหล่งพลัง Base / Level / Training / Gene / Evolution / Equipment / Condition';
    return;
  }
  try{
    const report=formatCrReport(inst,spById[inst.speciesId],getEvolutionPath(inst),getEquipmentFlat(inst));
    const b=report.breakdown,d=report.derived,r=report.rated;
    box.classList.add('open');
    box.innerHTML=`<div class="event-title">CR Debug • ${displayName(inst)} Lv.${inst.level} • CR ${r.cr} • DPS ${Math.round(r.dps)} • EHP ${Math.round(r.ehp)}</div>
    <div class="cr-lines">${['hp','atk','def','spd'].map(stat=>{const s=b[stat];return `${stat.toUpperCase()} ${s.final} = base ${Math.round(s.speciesBase)} + lv ${Math.round(s.levelGrowth)} + train ${Math.round(s.training)} + nut ${Math.round(s.nutritionFlat)} + eq ${Math.round(s.equipmentFlat)} × gene ${s.geneRank}(${s.geneMultiplier}) × evo ${s.evolutionProfile} × cond ${s.conditionModifier.toFixed(2)}`;}).join('<br>')}
    <br>Derived crit ${(d.critRate*100).toFixed(1)}% / ×${d.critDamage.toFixed(2)} • tempo ${(d.attackTempo*100).toFixed(1)}% • CDR ${(d.cooldownReduction*100).toFixed(1)}%</div>`;
    return r;
  }catch(err){
    box.classList.add('open');
    box.textContent='คำนวณ CR ไม่สำเร็จ: '+(err?.message||err);
    return null;
  }
}

// ---------- HUD / rendering ----------
function combatMonsterPresentation(inst){
  return inst?{instanceId:inst.instanceId,name:displayName(inst),hp:inst.hp,maxHp:inst.maxHp,fainted:Boolean(inst.fainted||inst.hp<=0)}:null;
}
function combatHudPresentation(){
  const selected=selectedInstance(),skillOwner=activeSummon?.inst||selected;
  const skillDefs=skillOwner?getMonsterSkills(skillOwner):[];
  return createCombatHudViewModel({
    zoneIsWild:state.currentZone!=='hub',
    activeMonster:combatMonsterPresentation(activeSummon?.inst),
    pendingSummon:Boolean(pendingSummon),
    selectedMonster:combatMonsterPresentation(selected),
    captureBalls:state.inventory.captureBalls||0,
    captureAiming:activeSummon?false:captureAimActive,
    summonCooldownSeconds:Math.max(0,(summonCooldownUntil-Date.now())/1000),
    skills:Array.from({length:3},(_,index)=>skillDefs[index]?{name:skillDefs[index].name,cooldownSeconds:activeSummon?.skillCds?.[index]||0}:null),
  });
}
function applyActionPresentation(button,presentation,label){
  if(button.disabled!==presentation.disabled)button.disabled=presentation.disabled;
  if(button.dataset.state!==presentation.state)button.dataset.state=presentation.state;
  if(button.dataset.sub!==presentation.statusText)button.dataset.sub=presentation.statusText;
  button.classList.toggle('cooldown',presentation.state==='cooldown');
  setAttributeIfChanged(button,'aria-disabled',String(presentation.disabled));
  setAttributeIfChanged(button,'aria-label',`${label} • ${presentation.reason||presentation.statusText}`);
  if(button.title!==(presentation.reason||presentation.statusText))button.title=presentation.reason||presentation.statusText;
}
function renderCombatPresentation(){
  const presentation=combatHudPresentation(),skillOwner=activeSummon?.inst||selectedInstance();
  const skillDefs=skillOwner?getMonsterSkills(skillOwner):[],activeType=skillOwner?monsterTypes(skillOwner)[0]:'Normal';
  [0,1,2].forEach(index=>{
    const button=el(`skill${index+1}Btn`),skill=skillDefs[index],view=presentation.skills[index];
    let key=button.querySelector('span'),name=button.querySelector('small');
    if(!key||!name){
      key=document.createElement('span');
      name=document.createElement('small');
      button.replaceChildren(key,name);
    }
    setTextIfChanged(key,`S${index+1}`);
    setTextIfChanged(name,skill?.name||`สกิล ${index+1}`);
    setActionStyle(button,skill?.type||activeType,`S${index+1}`,view.statusText);
    applyActionPresentation(button,view,`Skill ${index+1} ${name.textContent}`);
  });
  const capture=el('captureBtn'),summon=el('summonBtn'),recallButton=el('recallBtn');
  setActionStyle(capture,'Water','CAP',presentation.actions.capture.statusText);
  setActionStyle(summon,activeType,'SUM',presentation.actions.summon.statusText);
  setActionStyle(recallButton,'Psychic','REC',presentation.actions.recall.statusText);
  applyActionPresentation(capture,presentation.actions.capture,'ปาจับ');
  applyActionPresentation(summon,presentation.actions.summon,'ปาเรียก');
  applyActionPresentation(recallButton,presentation.actions.recall,'Recall คู่หู');
  capture.classList.toggle('aiming',presentation.actions.capture.state==='aiming');
  setTextIfChanged(el('actionReason'),presentation.actionReason);
  const activeLabel=el('activeMonsterStatus');
  setTextIfChanged(activeLabel,!activeSummon&&!pendingSummon&&hubCompanion?`${displayName(hubCompanion.inst)} • Ranch`:presentation.activeLabel);
}
function renderHUD(){
  setTextIfChanged(el('playerHp'),`${fmt(playerData.hp)}/${playerData.maxHp}`);
  setTextIfChanged(el('collectionCount'),state.collection.length);
  const balls=state.inventory.captureBalls||0;
  setTextIfChanged(el('captureBallCount'),balls);
  document.querySelector('.ball-pill')?.classList.toggle('warning',balls<=2);
  setTextIfChanged(el('playerExp'),Math.floor(state.exp));
  setTextIfChanged(el('ranchCount'),`${state.ranchActive.length}/${RANCH_ACTIVE_MAX}`);
  setTextIfChanged(el('zoneLabel'),ZONES[state.currentZone]?.label||state.currentZone);
  const wildCount=el('wildCount');
  setTextIfChanged(wildCount,state.currentZone==='hub'?'0':livingWilds().length);
  renderCombatPresentation();
}
function switchPartySlot(index){
  if(index<0||index>=state.party.length)return;
  state.selectedSlot=index;
  const inst=selectedInstance();
  if(state.currentZone!=='hub'&&activeSummon&&activeSummon.inst.instanceId!==state.party[index]){
    recall(false,false);
    if(inst&&!inst.fainted&&inst.hp>0)summonThrow();
  }
  syncHubCompanion();renderParty();renderSkillButtons();renderHUD();
}
function renderParty(){
  const party=el('party'),activeInstanceId=activeSummon?.inst.instanceId||null;
  party.replaceChildren();
  state.party.forEach((id,index)=>{
    const inst=getInst(id),button=document.createElement('button');
    const monster=combatMonsterPresentation(inst);
    const presentation=createPartySlotViewModel({monster,index,selectedSlot:state.selectedSlot,activeInstanceId});
    button.type='button';
    button.className=['party-slot','compact',!inst?'empty':'',...presentation.states.map(stateName=>stateName==='active'?'active-monster':stateName==='fainted'?'fainted-slot':stateName)].filter(Boolean).join(' ');
    button.dataset.state=presentation.states.join(' ')||'idle';
    button.setAttribute('aria-pressed',String(presentation.ariaPressed));
    button.setAttribute('aria-label',presentation.ariaLabel);
    if(inst){
      const species=spById[inst.speciesId],percent=hpPct(inst.hp/inst.maxHp)*100;
      button.title=`${displayName(inst)} • Lv.${inst.level} • Bond ${fmt(inst.bond)} • HP ${fmt(inst.hp)}/${inst.maxHp}`;
      const portrait=document.createElement('span');
      portrait.className='party-portrait';
      portrait.style.background=`#${species.color.toString(16).padStart(6,'0')}`;
      portrait.textContent=displayName(inst).slice(0,1);
      const mini=document.createElement('span');
      mini.className='party-mini';
      const name=document.createElement('b'),hp=document.createElement('span'),fill=document.createElement('i'),detail=document.createElement('small'),stateLabel=document.createElement('span');
      name.textContent=`${index+1}. ${displayName(inst)}`;
      hp.className='mini-hp';
      fill.style.width=`${percent}%`;
      hp.appendChild(fill);
      detail.className=inst.fainted?'fainted':'';
      detail.textContent=inst.fainted?'FAINTED':`HP ${fmt(inst.hp)}/${inst.maxHp}`;
      stateLabel.className='party-state';
      stateLabel.textContent=presentation.stateText;
      syncToBodyMind(inst);
      const cond=deriveCondition(inst)||'normal';
      const condDot=document.createElement('span');
      condDot.className='party-cond-dot '+cond;
      condDot.title='สภาพ: '+cond;
      mini.append(name,hp,detail,stateLabel,condDot);
      button.append(portrait,mini);
    }else{
      const portrait=document.createElement('span'),mini=document.createElement('span'),name=document.createElement('b'),detail=document.createElement('small'),stateLabel=document.createElement('span');
      portrait.className='party-portrait empty-portrait';
      portrait.textContent='＋';
      mini.className='party-mini';
      name.textContent=`${index+1}. ว่าง`;
      detail.textContent='จับมอนเพิ่ม';
      stateLabel.className='party-state';
      stateLabel.textContent=presentation.stateText;
      mini.append(name,detail,stateLabel);
      button.append(portrait,mini);
    }
    button.onclick=()=>{switchPartySlot(index);};
    party.appendChild(button);
  });
}
function renderSkillButtons(){renderCombatPresentation();}
function updateTarget(){
  const target=activeSummon?.target&&!activeSummon.target.dead?activeSummon.target:(aimedWild(10,1.8)||nearestWild(10)),card=el('targetCard');
  if(!target){setClassTokenIfChanged(card,'hidden',true);return;}
  setClassTokenIfChanged(card,'hidden',false);
  const species=spById[target.speciesId],tag=target.boss?' ★ BOSS':target.elite?' ★ ELITE':'',hpPercent=hpPct(target.hp/target.maxHp)*100;
  setTextIfChanged(el('targetName'),species.name+tag);
  setTextIfChanged(el('targetLevel'),`Lv.${target.level}`);
  setTextIfChanged(el('targetHpText'),`HP ${fmt(target.hp)}/${target.maxHp}`);
  const hpBar=el('targetHpBar');
  setStyleIfChanged(hpBar,'width',`${hpPercent}%`);
  setAttributeIfChanged(hpBar,'aria-valuenow',String(Math.round(hpPercent)));
  renderTargetTypesIfChanged(el('targetTypes'),species.types);
  const hint=el('typeHint');
  let hintText,hintClass;
  if(activeSummon){
    const move=getMonsterSkills(activeSummon.inst)[0],mult=typeEffectiveness(move.type,species.types),result=effectLabel(mult);
    hintText=`S1 ${TYPE_TH[move.type]}: ${result[0]}`;
    hintClass=result[1];
  }else if(target.boss){
    hintText='BOSS • จับไม่ได้';
    hintClass='weak';
  }else{
    hintText=`${target.elite?'ELITE • ':''}จับ ~${Math.round(captureChance(target)*100)}%`;
    hintClass='none';
  }
  setTextIfChanged(hint,hintText);
  setClassNameIfChanged(hint,`tiny effect ${hintClass}`);
}
function renderZoneUI(){document.querySelectorAll('[data-zone]').forEach(button=>button.classList.toggle('active',button.dataset.zone===state.currentZone));const hunt=el('huntBtn');if(hunt){if(state.currentZone==='hub'){hunt.textContent='ออกล่า → ทุ่ง • Wild 6';hunt.classList.remove('return');}else{hunt.textContent='← กลับ Ranch';hunt.classList.add('return');}}document.body.dataset.zone=state.currentZone;renderHUD();}
function renderAll(){renderHUD();renderParty();updateTarget();renderZoneUI();}

// ---------- Save migration ----------
function migrateLoadedState(s){
  if(!s)return;
  const clean=normalizeSavedState(s,{ranchCap:RANCH_ACTIVE_MAX,now:Date.now()});
  const migrated=migrateState(clean,{now:Date.now()});
  state.collection=migrated.collection.map(ensureInstanceShape);
  state.party=clean.party;
  state.storage=clean.storage;
  state.ranchActive=clean.ranchActive;
  state.selectedSlot=clean.selectedSlot;
  state.exp=Number.isFinite(clean.exp)?clean.exp:0;
  state.lifeLastAt=clean.lifeLastAt;
  state.inventory=clean.inventory;
  state.eggs=(clean.eggs||[]).map(e=>({...e,eggHolderId:e.eggHolderId||e.parentAId,readyAt:e.readyAt||Date.now()+30000}));
  state.breeding=clean.breeding||{parentA:null,parentB:null};
  state.evolutionCandidate=null;
  state.currentZone=ZONES[clean.currentZone]?clean.currentZone:'hub';
  state.saveVersion=SAVE_SCHEMA_VERSION;
}
function saveGame(show=true){
  state.saveVersion=SAVE_SCHEMA_VERSION;
  state.lifeLastAt=Date.now();
  writeStoredSave(localStorage,{state,playerHp:playerData.hp});
  if(show)msg('บันทึกเกม V8.1.0 แล้ว');
}
function loadGame(){
  try{
    const saved=readStoredSave(localStorage);
    if(!saved)return;
    migrateLoadedState(saved.state);
    playerData.hp=Number.isFinite(saved.playerHp)?saved.playerHp:100;
    if(saved.source!=='current')state.currentZone='hub';
    applyLifeSimulation(Date.now(),true);
    if(saved.source==='backup')msg('กู้คืน Save สำรองสำเร็จ');
    else if(saved.source==='current')msg('โหลดข้อมูล V8.1.0 แล้ว');
    else msg('ย้าย Save เก่า → V8.1.0 สำเร็จ');
    if(saved.source!=='current')saveGame(false);
  }catch(error){
    console.warn('load failed',error);
  }
}

// ---------- UI events ----------
el('npcBtn').onclick=openManager;el('closeManager').onclick=closeManager;el('monsterManager').addEventListener('pointerdown',e=>{if(e.target===el('monsterManager'))closeManager();});
document.querySelectorAll('.manager-tab').forEach(b=>b.onclick=()=>setManagerTab(b.dataset.managerTab));
const enterImmersiveBtn=el('enterImmersiveBtn');
const retryImmersiveBtn=el('retryImmersiveBtn');
const fullscreenBtn=el('fullscreenBtn');
for(const b of [enterImmersiveBtn,retryImmersiveBtn,fullscreenBtn]){
  if(!b) continue;
  b.addEventListener('click',requestImmersiveMode,{passive:false});
}
el('menuBtn').onclick=()=>el('utilityMenu').classList.toggle('hidden');
window.addEventListener('resize',syncOrientationLock); window.addEventListener('orientationchange',syncOrientationLock); document.addEventListener('fullscreenchange',syncOrientationLock);
startGameInteraction(); setTimeout(syncOrientationLock,80);
el('parentABtn').onclick=()=>openMonsterPicker('parentA');el('parentBBtn').onclick=()=>openMonsterPicker('parentB');el('breedBtn').onclick=createEgg;el('closePicker').onclick=closeMonsterPicker;el('monsterPicker').addEventListener('pointerdown',e=>{if(e.target===el('monsterPicker'))closeMonsterPicker();});
el('healAllBtn').onclick=healAll;el('refillBallsBtn').onclick=()=>{state.inventory.captureBalls=(state.inventory.captureBalls||0)+5;msg('NPC มอบ Capture Ball ทดสอบ +5');renderManager();renderHUD();saveGame(false);};el('refillFoodBtn').onclick=()=>{for(const key of ['protein','healthy','favorite','trainingChow','mineralBite','emberFruit','moonFruit'])state.inventory[key]=(state.inventory[key]||0)+3;msg('NPC มอบอาหารทดสอบ +3 ทุกชนิด');renderManager();saveGame(false);};
function bindActionPress(button,handler){
  button.addEventListener('pointerdown',event=>{
    event.preventDefault();
    event.stopPropagation();
    handler();
  },{passive:false});
}
const captureBtn=el('captureBtn');
let capturePointerId=null;
captureBtn.addEventListener('pointerdown',event=>{
  if(capturePointerId!==null)return;
  event.preventDefault();
  event.stopPropagation();
  capturePointerId=event.pointerId;
  captureBtn.setPointerCapture?.(event.pointerId);
  beginCaptureAim();
},{passive:false});
captureBtn.addEventListener('pointerup',event=>{
  if(event.pointerId!==capturePointerId)return;
  event.preventDefault();
  event.stopPropagation();
  capturePointerId=null;
  executeCaptureThrow();
},{passive:false});
captureBtn.addEventListener('pointercancel',event=>{
  if(event.pointerId!==capturePointerId)return;
  capturePointerId=null;
  cancelCaptureAim();
});
bindActionPress(el('summonBtn'),summonThrow);
bindActionPress(el('recallBtn'),()=>recall(true));
bindActionPress(el('skill1Btn'),()=>useSkill(0));
bindActionPress(el('skill2Btn'),()=>useSkill(1));
bindActionPress(el('skill3Btn'),()=>useSkill(2));
el('saveBtn').onclick=()=>saveGame(true);
el('resetBtn').onclick=()=>{for(const k of [saveKey,oldV5Key,oldV4Key,'monster-capture-summon-proto-v1'])localStorage.removeItem(k);location.reload();};document.querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>switchZone(b.dataset.zone));
el('huntBtn').onclick=()=>switchZone(state.currentZone==='hub'?'grassland':'hub');

// ---------- Wild population safety ----------
let wildEmptyTimer=0;
function ensureWildPopulation(dt){
  if(state.currentZone==='hub'){wildEmptyTimer=0;return;}
  const alive=livingWilds().length;
  if(alive>0){wildEmptyTimer=0;return;}
  wildEmptyTimer+=dt;
  if(wildEmptyTimer>=1.2){wildEmptyTimer=0;clearWilds();spawnZone(state.currentZone);msg(`ระบบเติม Wild Monster อัตโนมัติ • พบ ${livingWilds().length} ตัว`);renderHUD();}
}

// ---------- Frame ----------
function updatePlayer(dt){playerData.invuln=Math.max(0,playerData.invuln-dt);let side=0,fwd=0;if(keys.KeyA)side-=1;if(keys.KeyD)side+=1;if(keys.KeyW)fwd+=1;if(keys.KeyS)fwd-=1;side+=joy.x;fwd+=-joy.y;const moving=Math.hypot(side,fwd)>.05;if(moving){const dir=cameraRight().multiplyScalar(side).add(forward().multiplyScalar(fwd)).normalize();player.position.addScaledVector(dir,playerData.speed*dt);player.rotation.y=Math.atan2(dir.x,dir.z)+Math.PI;player.position.x=THREE.MathUtils.clamp(player.position.x,-32,32);player.position.z=THREE.MathUtils.clamp(player.position.z,-32,32);}animateEntity(player,dt,moving,.8);playerVisual.update(dt,{moving});keeperVisual.update(dt,{moving:false});}
function updateCamera(dt){const f=forward(),distance=7.4,horizontal=Math.cos(cameraPitch)*distance,height=Math.sin(cameraPitch)*distance+1.15,desired=player.position.clone().add(new THREE.Vector3(0,height,0)).add(f.clone().multiplyScalar(-horizontal));camera.position.lerp(desired,1-Math.pow(.001,dt));const look=player.position.clone().add(new THREE.Vector3(0,1.1,0)).add(f.clone().multiplyScalar(1.5));if(cameraShake.time>0){cameraShake.time=Math.max(0,cameraShake.time-dt);cameraShake.phase+=dt*56;const k=cameraShake.duration>0?cameraShake.time/cameraShake.duration:0,mag=cameraShake.mag*k,sx=Math.sin(cameraShake.phase)*mag,sy=Math.cos(cameraShake.phase*1.7)*mag*.62,sz=Math.sin(cameraShake.phase*.73)*mag*.42;camera.position.add(new THREE.Vector3(sx,sy,sz));look.add(new THREE.Vector3(-sx*.28,sy*.18,-sz*.18));if(cameraShake.time<=0){cameraShake.mag=0;cameraShake.duration=0;}}camera.lookAt(look);}

loadGame();ensureStarter();const initialZone=state.currentZone;state.currentZone='hub';switchZone(initialZone,true);renderAll();saveGame(false);
let last=performance.now(),targetTick=0,lifeTick=0,eggTick=0,firstFrame=true;
function loop(now){
  try{
    const dt=Math.min(.033,(now-last)/1000);
    last=now;
    updatePlayer(dt);
    updateCamera(dt);
    updateWorldLabels(dt);
    updateFloatingTexts(dt);
    updateProjectiles(dt);
    updateEffects(dt);
    updateGroundDecals(dt);
    updateCaptureAimVisual();
    updateOwned(dt);
    updateHubCompanion(dt);
    updateRanchVisuals(dt);
    ensureWildPopulation(dt);
    const engagedWildIds=selectWildAggressors();
    for(const w of [...wilds]){
      const distance=distXZ(player.position,w.mesh.position);
      const aiDt=distanceTickScheduler.advance(w.id,distance,dt,engagedWildIds.has(w.id));
      if(aiDt>0)updateWild(w,aiDt,engagedWildIds.has(w.id));
    }
    ranchPad.ring.rotation.y+=dt*.2;
    breedingPad.ring.rotation.y-=dt*.16;
    incubator.rotation.y+=dt*.12;
    targetTick-=dt;
    lifeTick-=dt;
    if(lifeTick<=0){
      lifeTick=5;
      const previousLifeAt=state.lifeLastAt;
      applyLifeSimulation(Date.now());
      if(state.storage.length>0&&state.lifeLastAt!==previousLifeAt)managerDirty.mark();
    }
    eggTick-=dt;
    if(eggTick<=0){
      eggTick=1;
      const managerOpen=!el('monsterManager').classList.contains('hidden');
      if(shouldRefreshEggCountdown(managerOpen,state.eggs.length))updateEggCountdowns(Date.now());
    }
    if(targetTick<=0){
      targetTick=.12;
      updateTarget();
      renderHUD();
      // renderHUD() also refreshes all Combat HUD action presentation states.
      updateNpcUI();
      if(!el('monsterManager').classList.contains('hidden')&&managerDirty.consume(now))renderManager();
    }
    renderer.render(scene,camera);
    if(firstFrame){
      firstFrame=false;
      if(startup){startup.classList.add('ok');setTimeout(()=>startup.remove(),450);}
    }
    requestAnimationFrame(loop);
  }catch(err){
    console.error(err);
    startupText('เกมหยุดทำงาน: '+err.message+(err.stack?' • '+String(err.stack).split('\n')[1].trim():''),'error');
  }
}
requestAnimationFrame(loop);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
