import { ENCOUNTER_POLICY, OWNED_BASIC_AI_POLICY, WILD_BASIC_AI_POLICY, WILD_BOSS_BASIC_AI_POLICY, fillEngagedWildIds, shouldResetEncounter, tickCooldown } from './runtime-policies.mjs';
import { acceptBossChallenge, bossCombatAuthorized, bossPromptAvailable, bossTargetable, createBossChallengeSession, declineBossChallenge, rearmBossChallenge, retreatBossChallenge } from './boss-challenge.mjs';
import { resolveOwnedBasicAiAction } from './basic-ai-resolver.mjs';
import { createMonsterAIState, isCanonicalMonsterAIState, validateMonsterAIState, resetMonsterAIState, resolveWildMonsterAI, settleWildAIIntent } from './wild-ai-resolver.mjs';
import { disposeObject3D, removeAndDispose } from './scene-resource-lifecycle.mjs';
import { createDirtyGate, createDistanceTickScheduler, createObjectPool, createSharedResourceCache, remainingCountdownSeconds, selectQualityProfile, shouldRefreshEggCountdown } from './performance-runtime.mjs';
import { SAVE_SCHEMA_VERSION, normalizeSavedState, readStoredSave, sanitizeStateForPersistence, writeStoredSave } from './save-schema.mjs';
 import { STAGE_CATALOG, STAGE_BY_ID, createStageProgress, encounterVariantFromFlags, normalizeStageProgress, recordStageClear, resolveEncounterProfile, stageCurrencyRewards, stageLevelRange, stageRewards, stageUnlockReason, validateStageLevelProgression, validateZoneEncounterConfig } from './stage-catalog.mjs';
import { nearestRoute, nextWarpPromptState, routesFrom, validateWarpRoutes, warpAvailability } from './warp-routes.mjs';
import { resolveStageObjective, runStageClearReconciliation, stageObjectiveTracker } from './stage-objectives.mjs';
import { createCombatHudViewModel, createPartySlotViewModel } from './combat-ui-view-model.mjs';
import { createCharacterSkillsViewModel } from './character-skills-view-model.mjs';
import {
  ACTIVE_SUMMON_READONLY_REASON,
  ACTIVE_SUMMON_SWITCH_REASON,
  ACTIVE_SUMMON_RECALL_REASON,
  FULL_MANAGER_NPC_REASON,
  attachCharacterUi,
  createCharacterUIController,
  getFocusedCharacterPresentation,
  persistableState,
} from './character-ui-controller.mjs?v=8.4.0-character-ui';
import { BALANCE_CONFIG, BALANCE_SCHEMA_VERSION, SKILL_MASTERY } from './balance-config.mjs';
import * as balanceFormulas from './balance-formulas.mjs';
import { resolveWorkbookCapture, snapshotCaptureReferenceLevel } from './balance-capture.mjs';
import { beginCaptureAttempt, cancelCaptureAttempt, clearCaptureAttemptLedger, commitCaptureAttempt, createCaptureAttemptLedger, resolveCaptureAttempt } from './capture-transaction.mjs';
import { combatRating, compareBuilds } from './combat-rating.mjs';
import { normalizeInstance, createInstance, migrateState, addGrowthExp, addTrainingExp, trainingUsed as instTrainingUsed, trainingRemaining as instTrainingRemaining, resolveOfflineTrainingWindow, simulateLife, deriveCondition, appendHistory, TRAINING_LINES } from './monster-instance.mjs';
import { resolveBattleGrowth, applyBattleGrowth, resolvePartyShareGrowth } from './battle-growth.mjs';
import { initAudio, playSFX, playBGM, stopBGM, startAmbient, stopAmbient, setVolume, toggleMute, isMuted, getVolume } from './audio-engine.mjs';
import { resolveFeed, careRest, carePlay, nutritionUsed, nutritionRemaining, nutritionFlat, activeTrainingFoodMultiplier, FOOD_CATEGORIES } from './food-care.mjs';
import { computeSkillExp, addSkillExp, masteryRankFromExp, masteryRawPower, getSkill, learnSkill, listSkillCandidates, evaluateSkillCandidate, applyMutation, synchronizeStage1Learnset, manualSkillLoadout, MANUAL_SKILL_SLOTS, SKILL_SLOTS, setManualSkillSlot, learnInheritedSkillMemory, listBreedingSkillMemoryCandidates, resolveInheritedSkillMemoryEligibility } from './skill-progression.mjs';
import { skillCatalogEntry } from './skill-catalog.mjs';
import { resolveSkillItemUse, SKILL_ITEM_REASONS } from './skill-items.mjs';
import { MERCHANT_PURCHASE_REASONS, commitMerchantPurchase } from './merchant-purchase.mjs';
import { MERCHANT_OFFER_IDS, merchantOffers } from './merchant-shop-catalog.mjs';
import { skillButtonIconContract } from './skill-icon-runtime.mjs';
import { enemyAreaIconProfile } from './skill-area-icon-profile.mjs';
import { passiveCatalogEntry } from './passive-catalog.mjs';
import { executeEquippedSkillCommand } from './skill-command-runtime.mjs';
import { canExecuteReviewedSkillEffect, resolveActiveSelfStatusModifiers, resolveReviewedSkillEffects, resolveWorkbookDirectDamage, skillDamageProfile, validateReviewedSkillEffectRequest } from './skill-effect-runtime.mjs';
import { recoverSkillUses } from './skill-recovery.mjs';
import { advanceEncounterEffects, createEncounterStatusState, endEncounterEffects, isEncounterStatusState } from './status-lifecycle.mjs';
import { combatStatusDescriptors, resolveCombatStatusRuntime } from './combat-status-runtime.mjs';
import { equipItem, unequip, equippedItems, computeEquipmentContribution, loadoutPreview, EQUIPMENT_SLOTS } from './equipment.mjs';
import { loadRemoteSave, saveRemoteSave } from './firebase-game-sync.mjs';
import { requireFirebaseLogin } from './firebase-auth-ui.mjs';
import { loadRuntimeConfig } from './runtime-config.mjs';
import { establishReadOnlyBridge, logoutMonsterLifeSession, readMonsterLifeProfile } from './server-auth.mjs';
import { mountServerEconomy } from './server-economy.mjs';
import { presentAuthProfileBridge } from './account-link-ui.mjs';
import { applyMonsterAction as requestMonsterAction, consumeInventory as requestConsumeInventory, healthVersionGate, learnMonsterSkill as requestLearnMonsterSkill, learnMonsterSkillFromItem as requestLearnMonsterSkillFromItem, publishServerGateTelemetry, redeemItemCode as requestRedeemItemCode, setMonsterEquipment as requestSetMonsterEquipment } from './server-sync.mjs';
import { canUseServerPlayerData, changeServerPassword, loadServerSave, readPlayerState, saveCharacterProfile, saveServerSave, syncPlayerData } from './server-player-data.mjs';
import { publishPlayerCharacterBinding, savePirateHostedCharacter } from './pirate-player-server.mjs';
import { catalogMutationVersion, loadServerCatalog } from './server-catalog.mjs';
import { evolutionContext, evaluateEvolution, listEligibleBranches, previewEvolution, previewWorkbookEvolution, commitEvolution, checkEvolutionBudget, resolveWorkbookEvolutionStage } from './evolution.mjs';
import { eventContext, evaluateEventTriggers, rollEvent, getChoices, applyChoice, validateEventBalance } from './raising-events.mjs';
import { BREEDING_VERSION, applyBreedingSkillMemoryRequestLedger, createStandardBreedingEggTransaction, evaluateStandardBreedingCompatibility, hatchBreedingEggTransaction, resolveGenderFromSeed, workbookBreedingProfile } from './breeding.mjs';
import { calculateCanonicalWildStats, computeCoreStats, evoDefFromPath, formatCrReport, growthExpForLevel, liveClassedMoveDamage, ranchTrainingGain, refreshCanonicalOwnedStats, STARTER_EQUIPMENT } from './live-progression.mjs';
import { derivedStats } from './combat-rating.mjs';
import {
  applySpeciesProgression,
  DEFAULT_INVENTORY,
  EQUIPMENT_CATALOG,
  FOOD_CATALOG,
  RAISING_EVENT_CATALOG,
  SKILL_CANDIDATES,
  SKILL_MUTATIONS,
  SKILL_ITEM_CATALOG,
  equipmentById,
  foodById,
  skillItemById,
} from './content-catalog.mjs';
import { createSpeciesCatalogAdapter, monsterCatalogEntry } from './monster-catalog.mjs';
import { monsterStatCatalogEntry } from './monster-stat-catalog.mjs';
import {
  RUNTIME_TYPES as TYPES,
  TYPE_LABEL_TH as TYPE_TH,
  TYPE_COLOR,
  TYPE_EMOJI,
  typeEffectiveness,
} from './type-catalog.mjs';
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
console.info(`Monster Life RPG V8.4.0 • PocketMonster latest progression live loop v${BALANCE_SCHEMA_VERSION} loaded`);

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
const runtimeConfig = await loadRuntimeConfig();
const serverGate = await healthVersionGate(runtimeConfig);
const serverGateObservation = publishServerGateTelemetry(serverGate);
const serverCatalog=await loadServerCatalog(runtimeConfig);
if (typeof window !== 'undefined') {
  window.POCKETMONSTER_RUNTIME_CONFIG = runtimeConfig;
  window.POCKETMONSTER_SERVER_GATE = serverGate;
  window.POCKETMONSTER_SERVER_GATE_OBSERVATION = serverGateObservation;
  window.POCKETMONSTER_SERVER_CATALOG=serverCatalog;
  window.POCKETMONSTER_SERVER_CATALOG_VERSION=catalogMutationVersion(serverCatalog);
  document.documentElement.dataset.serverGate = serverGate.state;
}
if (serverGate.state !== 'disabled' && serverGate.state !== 'healthy') {
  console.info(`Server contract gate: ${serverGate.state} (${serverGate.reason || 'read-only check'}) • Firebase fallback=${serverGate.allowFirebaseFallback}`);
}
const launchSession = runtimeConfig.featureFlags?.launchTicket ? window.POCKETMONSTER_LAUNCH_SESSION : null;
if (launchSession) document.getElementById('accountGate')?.classList.add('hidden');
const firebaseUser = launchSession ? null : await requireFirebaseLogin(runtimeConfig);
const authProfileBridge = launchSession && serverGate.state === 'healthy'
  ? Object.freeze({ state: 'linked', profile: await readMonsterLifeProfile(runtimeConfig, launchSession.sessionToken), expiresAtUtc: launchSession.expiresAtUtc, sessionToken: launchSession.sessionToken })
  : serverGate.state === 'healthy'
    ? await establishReadOnlyBridge(runtimeConfig, firebaseUser)
    : Object.freeze({
      state: runtimeConfig.featureFlags?.firebaseFallback === false ? 'offline' : 'fallback',
      errorCode: 'SERVER_GATE_UNAVAILABLE',
    });
if (typeof window !== 'undefined') {
  window.POCKETMONSTER_SERVER_SESSION_TOKEN = authProfileBridge.sessionToken || null;
  window.POCKETMONSTER_AUTH_PROFILE_BRIDGE = Object.freeze({ state: authProfileBridge.state, errorCode: authProfileBridge.errorCode, profile: authProfileBridge.profile });
  document.documentElement.dataset.authProfileBridge = authProfileBridge.state;
  window.dispatchEvent(new CustomEvent('pocketmonster:auth-profile-bridge', { detail: window.POCKETMONSTER_AUTH_PROFILE_BRIDGE }));
}
await presentAuthProfileBridge(runtimeConfig, firebaseUser, authProfileBridge);
await mountServerEconomy(runtimeConfig, authProfileBridge);
const LIVE_PRESENCE_ZONE='pirate-fruit';
function haltLiveGameEntry(reason){
  const detail=reason||'เซิร์ฟเวอร์ไม่พร้อม • หยุดเข้าเกม';
  startupText(detail,'error');
  if(typeof document!=='undefined'){
    document.documentElement.dataset.liveEntry='blocked';
    document.documentElement.dataset.liveWorld=LIVE_PRESENCE_ZONE;
  }
  if(typeof window!=='undefined'){
    window.POCKETMONSTER_LIVE_ENTRY=Object.freeze({ok:false,zone:LIVE_PRESENCE_ZONE,runtime:'pirate-fruit',monsterModule:true,offlineFrame:false,reason:detail,serverGate:serverGate.state,bridge:authProfileBridge.state});
  }
  throw new Error(detail);
}
const serverRequired=runtimeConfig.featureFlags?.vpsEnabled===true&&runtimeConfig.featureFlags?.vpsReads===true&&runtimeConfig.featureFlags?.firebaseFallback===false;
if(serverRequired&&serverGate.state!=='healthy'){
  haltLiveGameEntry(serverGate.state==='maintenance'?'เซิร์ฟเวอร์ปิดปรับปรุง • หยุดเข้าเกม':'เซิร์ฟเวอร์ออฟไลน์ • หยุดเข้าเกม');
}
if(serverRequired&&(authProfileBridge.state==='offline'||authProfileBridge.state==='fallback')){
  haltLiveGameEntry('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ • หยุดเข้าเกม');
}
if(typeof window!=='undefined'){
  window.POCKETMONSTER_LIVE_ENTRY=Object.freeze({ok:true,zone:LIVE_PRESENCE_ZONE,runtime:'pirate-fruit',monsterModule:true,offlineFrame:false,combatAuthority:false});
  document.documentElement.dataset.liveEntry='pirate-fruit';
  document.documentElement.dataset.liveWorld=LIVE_PRESENCE_ZONE;
}
const serverPlayerDataActive=canUseServerPlayerData(runtimeConfig,serverGate,authProfileBridge);
if(typeof window!=='undefined'){
  window.POCKETMONSTER_PLAYER_DATA_MODE=serverPlayerDataActive?'server':'firebase';
  window.POCKETMONSTER_ACCOUNT_ACTIONS=Object.freeze({
    logout:()=>logoutMonsterLifeSession(runtimeConfig,authProfileBridge.sessionToken),
    changePassword:credentials=>changeServerPassword(runtimeConfig,authProfileBridge.sessionToken,credentials),
    saveCharacter:character=>savePirateHostedCharacter({
      saveCharacterProfile,
      config:runtimeConfig,
      sessionToken:authProfileBridge.sessionToken,
      character,
      writesEnabled:serverPlayerDataActive,
      live:()=>({name:authProfileBridge.profile?.character?.name||authProfileBridge.profile?.displayName}),
    }),
    redeemItemCode:code=>requestRedeemItemCode(runtimeConfig,authProfileBridge.sessionToken,code),
  });
}
function requireServerMutation(){
  if(serverPlayerDataActive)return true;
  msg('เซิร์ฟเวอร์ข้อมูลผู้เล่นยังไม่พร้อม • ยังไม่เปลี่ยนข้อมูล');
  return false;
}
const setMonsterEquipment=(instanceId,itemId,slot,unequip=false)=>requestSetMonsterEquipment(runtimeConfig,authProfileBridge.sessionToken,instanceId,itemId,slot,unequip);
const learnMonsterSkill=(instanceId,skillId,slot)=>requestLearnMonsterSkill(runtimeConfig,authProfileBridge.sessionToken,instanceId,skillId,slot);
const learnMonsterSkillFromItem=(instanceId,itemId,slot,commandId)=>requestLearnMonsterSkillFromItem(runtimeConfig,authProfileBridge.sessionToken,instanceId,itemId,slot,commandId);
const applyMonsterAction=(instanceId,action,value)=>requestMonsterAction(runtimeConfig,authProfileBridge.sessionToken,instanceId,action,value);
const consumeInventory=(itemId,amount,reason)=>requestConsumeInventory(runtimeConfig,authProfileBridge.sessionToken,itemId,amount,reason);
function applyAuthoritativeMonster(instanceId,monsterJson){
  const current=getInst(instanceId);if(!current||typeof monsterJson!=='string')return null;
  const authoritative=JSON.parse(monsterJson);Object.keys(current).forEach(key=>delete current[key]);Object.assign(current,authoritative);
  refreshStats(current,false);return current;
}
try{ THREE=await loadThree(); }
catch(err){ startupText(err.message,'error'); throw err; }
startupText('กำลังสร้าง Monster Life RPG V8.4.0…');
const qualityProfile=selectQualityProfile({deviceMemory:navigator.deviceMemory,hardwareConcurrency:navigator.hardwareConcurrency,devicePixelRatio:window.devicePixelRatio,saveData:navigator.connection?.saveData===true});
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
const pirateThrowWorld=new URL(import.meta.url).searchParams.get('animalControl')==='pirate-fruit';
function pirateThrowPanelPaused(){
  return pirateThrowWorld&&(document.body?.dataset?.combinedWorld!=='pirate-fruit'||document.body?.dataset?.controlPanel!=='throw');
}
function gameMount(){return (pirateThrowWorld&&el('monsterThrowStage'))||el('game');}
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
  for(const id of ['skill1Btn','skill2Btn','skill3Btn','skill4Btn','captureBtn','summonBtn','recallBtn']){
    const button=el(id);
    if(!button)continue;
    button.type='button';
    button.setAttribute('aria-describedby','actionReason');
  }
}
ensureCombatHudSemantics();

// ---------- 18-Type system ----------
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
const camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,130);
const renderer=new THREE.WebGLRenderer({antialias:qualityProfile.antialias,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,qualityProfile.maxDpr));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=qualityProfile.shadows;
gameMount().appendChild(renderer.domElement);

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
const WORLD_STREAM=Object.freeze({
  loadRadius:22,
  unloadRadius:32,
  attachPerFrame:5,
  zoneAttachBudget:12,
  wildHideRadius:36,
  wildShowRadius:26,
});
const decoAttachQueue=[];
let decoStreaming=false;
const STREAM_HITCH={armed:false,samples:0,sumMs:0,lastMs:0,maxMs:0,over33:0,over50:0};
let lastSwitchZoneMs=0;
let lastSwitchParts={ground:0,populate:0,flush:0,spawn:0,save:0};
function resetStreamHitch(){
  STREAM_HITCH.samples=0;STREAM_HITCH.sumMs=0;STREAM_HITCH.lastMs=0;STREAM_HITCH.maxMs=0;STREAM_HITCH.over33=0;STREAM_HITCH.over50=0;STREAM_HITCH.armed=true;
}
function streamHitchSnapshot(){
  const avg=STREAM_HITCH.samples?STREAM_HITCH.sumMs/STREAM_HITCH.samples:0;
  return {
    samples:STREAM_HITCH.samples,
    fps:STREAM_HITCH.samples?Number((1000/avg).toFixed(1)):0,
    avgMs:Number(avg.toFixed(2)),
    maxMs:Number(STREAM_HITCH.maxMs.toFixed(2)),
    over33:STREAM_HITCH.over33,
    over50:STREAM_HITCH.over50,
    switchMs:Number(lastSwitchZoneMs.toFixed(2)),
    switchParts:lastSwitchParts,
    drawCalls:renderer.info.render.calls,
    triangles:renderer.info.render.triangles,
    tier:qualityProfile.tier,
  };
}
function isKeepAliveDeco(mesh){
  return !!(mesh?.userData?.warpRouteId||mesh?.userData?.stageMarker);
}
function decoDistanceSq(mesh,ox,oz){
  const dx=(mesh.userData.streamX??mesh.position.x)-ox;
  const dz=(mesh.userData.streamZ??mesh.position.z)-oz;
  return dx*dx+dz*dz;
}
function addDeco(mesh){
  mesh.userData.streamX=mesh.position.x;
  mesh.userData.streamZ=mesh.position.z;
  mesh.traverse(obj=>{ if(obj.isMesh){ obj.castShadow=true; obj.receiveShadow=true; } });
  if(decoStreaming&&!isKeepAliveDeco(mesh)){
    decoAttachQueue.push(mesh);
    return mesh;
  }
  decorations.add(mesh); return mesh;
}
function flushNearbyDecos(origin,budget=WORLD_STREAM.zoneAttachBudget){
  if(!origin)return 0;
  const ox=origin.x,oz=origin.z;
  const loadR2=WORLD_STREAM.loadRadius*WORLD_STREAM.loadRadius;
  let attached=0;
  while(attached<budget){
    let best=-1,bestD=loadR2;
    for(let i=0;i<decoAttachQueue.length;i++){
      const distance=decoDistanceSq(decoAttachQueue[i],ox,oz);
      if(distance<=bestD){bestD=distance;best=i;}
    }
    if(best<0)break;
    decorations.add(decoAttachQueue.splice(best,1)[0]);
    attached++;
  }
  return attached;
}
function updateWorldStream(){
  const ox=player.position.x,oz=player.position.z;
  flushNearbyDecos(player.position,WORLD_STREAM.attachPerFrame);
  const unloadR2=WORLD_STREAM.unloadRadius*WORLD_STREAM.unloadRadius;
  for(let i=decorations.children.length-1;i>=0;i--){
    const child=decorations.children[i];
    if(isKeepAliveDeco(child))continue;
    if(decoDistanceSq(child,ox,oz)>unloadR2){
      decorations.remove(child);
      decoAttachQueue.push(child);
    }
  }
  const hideR2=WORLD_STREAM.wildHideRadius*WORLD_STREAM.wildHideRadius;
  const showR2=WORLD_STREAM.wildShowRadius*WORLD_STREAM.wildShowRadius;
  for(let i=0;i<wilds.length;i++){
    const w=wilds[i];
    if(!w.mesh)continue;
    if(w.capturing){
      if(captureSequence?.wild===w)continue;
      w.mesh.visible=true;
      continue;
    }
    if(w.engaged){w.mesh.visible=true;continue;}
    const dx=w.mesh.position.x-ox,dz=w.mesh.position.z-oz;
    const d2=dx*dx+dz*dz;
    if(d2>hideR2)w.mesh.visible=false;
    else if(d2<showR2)w.mesh.visible=true;
  }
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
function makeIceCrystal(x,z,s=1){
  const g=new THREE.Group();
  const base=new THREE.Mesh(boxGeometry(.72*s,.12*s,.72*s),mat(0xcbd5e1,.7,.08));
  base.position.y=.06*s; g.add(base);
  for(const [dx,dz,height,rot] of [[-.22,-.06,1.15,-.12],[.12,.08,1.5,.08],[.3,-.14,.9,.18]]){
    const shard=new THREE.Mesh(coneGeometry(.18*s,height*s,5),glowMat(0xe0f2fe,0x7dd3fc,.08,.72,.08));
    shard.position.set(dx*s,height*.5*s,dz*s); shard.rotation.z=rot; g.add(shard);
  }
  g.position.set(x,0,z); addDeco(g); return g;
}
function makeCanyonWall(x,z,s=1,tone=0x92400e){
  const g=new THREE.Group();
  const base=new THREE.Mesh(boxGeometry(1.7*s,2.8*s,1.25*s),mat(tone,.96,.05));
  base.position.y=1.4*s; base.scale.set(1,.9+((Math.abs(x)+Math.abs(z))%3)*.08,1); g.add(base);
  const cap=new THREE.Mesh(boxGeometry(1.25*s,.34*s,1.05*s),mat(0xb45309,.94,.04));
  cap.position.set(.12*s,2.88*s,-.04*s); cap.rotation.y=.08; g.add(cap);
  g.position.set(x,0,z); g.rotation.y=(x-z)*.04; addDeco(g); return g;
}
function makeRuinPillar(x,z,s=1,tone=0x64748b){
  const g=new THREE.Group();
  const column=new THREE.Mesh(boxGeometry(.7*s,2.5*s,.7*s),mat(tone,.9,.08));
  column.position.y=1.25*s; g.add(column);
  const cap=new THREE.Mesh(boxGeometry(1.05*s,.22*s,1.05*s),mat(0x94a3b8,.88,.07));
  cap.position.y=2.55*s; cap.rotation.y=.12; g.add(cap);
  g.position.set(x,0,z); g.rotation.y=(x+z)*.03; addDeco(g); return g;
}
function makeMarshReed(x,z,s=1){
  const g=new THREE.Group();
  for(const [dx,h,tilt] of [[-.12,.9,.12],[.04,1.2,-.08],[.18,.72,.2]]){
    const stem=new THREE.Mesh(boxGeometry(.06*s,h*s,.06*s),mat(0x365314,.82,.03));
    stem.position.set(dx*s,h*.5*s,0); stem.rotation.z=tilt; g.add(stem);
  }
  const flower=new THREE.Mesh(boxGeometry(.16*s,.16*s,.16*s),glowMat(0xa855f7,0xa855f7,.1,.52,.04));
  flower.position.set(.04*s,1.22*s,0); g.add(flower);
  g.position.set(x,0,z); g.rotation.y=(x-z)*.2; addDeco(g); return g;
}
function makeShrineLantern(x,z,s=1){
  const g=new THREE.Group();
  const base=new THREE.Mesh(boxGeometry(.62*s,.16*s,.62*s),mat(0x7c3aed,.86,.08));
  base.position.y=.08*s; g.add(base);
  const post=new THREE.Mesh(boxGeometry(.12*s,1.25*s,.12*s),mat(0x4c1d95,.82,.06));
  post.position.y=.7*s; g.add(post);
  const light=new THREE.Mesh(boxGeometry(.34*s,.28*s,.34*s),glowMat(0xf0abfc,0xc084fc,.18,.8,.05));
  light.position.y=1.38*s; g.add(light);
  g.position.set(x,0,z); addDeco(g); return g;
}
function makeCityNeon(x,z,s=1,color=0x22d3ee){
  const g=new THREE.Group();
  const building=new THREE.Mesh(boxGeometry(1.5*s,2.2*s,1.2*s),mat(0x1e1b4b,.9,.12));
  building.position.y=1.1*s; g.add(building);
  const sign=new THREE.Mesh(boxGeometry(1.05*s,.18*s,.08*s),glowMat(color,color,.12,.72,.04));
  sign.position.set(0,1.75*s,.62*s); g.add(sign);
  const roof=new THREE.Mesh(boxGeometry(1.7*s,.12*s,1.35*s),mat(0x312e81,.82,.08));
  roof.position.y=2.25*s; g.add(roof);
  g.position.set(x,0,z); g.rotation.y=(x+z)*.04; addDeco(g); return g;
}
function makeFactoryUnit(x,z,s=1){
  const g=new THREE.Group();
  const body=new THREE.Mesh(boxGeometry(1.55*s,1.6*s,1.2*s),mat(0x475569,.9,.16));
  body.position.y=.8*s; g.add(body);
  const tower=new THREE.Mesh(boxGeometry(.42*s,2.5*s,.42*s),mat(0x64748b,.86,.12));
  tower.position.set(.5*s,1.25*s,.15*s); g.add(tower);
  const lamp=new THREE.Mesh(boxGeometry(.22*s,.22*s,.22*s),glowMat(0xf59e0b,0xf97316,.1,.78,.05));
  lamp.position.set(-.35*s,1.35*s,.62*s); g.add(lamp);
  const cap=new THREE.Mesh(boxGeometry(1.8*s,.12*s,1.35*s),mat(0x334155,.84,.12));
  cap.position.y=1.68*s; g.add(cap);
  g.position.set(x,0,z); g.rotation.y=(x-z)*.04; addDeco(g); return g;
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
function makeStageBeacon(x,z,color=0x86efac){
  const g=new THREE.Group();
  const base=new THREE.Mesh(boxGeometry(.7,.035,.7),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.22}));
  base.position.y=.03; g.add(base);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.34,.025,6,20),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9}));
  ring.rotation.x=Math.PI/2; ring.position.y=.07; g.add(ring);
  const marker=new THREE.Mesh(octahedronGeometry(.11),glowMat(color,color,.18,.7,.08));
  marker.position.y=.38; g.add(marker);
  g.position.set(x,0,z); g.userData.stageMarker=true; addDeco(g); return g;
}
function makeWarpBeacon(route){
  const color=route.kind==='return'?0x67e8f9:0xfacc15;
  const g=makeStageBeacon(route.position[0],route.position[1],color);
  const portal=new THREE.Mesh(new THREE.TorusGeometry(.82,.07,8,28),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.92}));
  portal.position.y=1.05; g.add(portal);
  const beam=new THREE.Mesh(boxGeometry(.18,1.8,.18),glowMat(color,color,.14,.62,.04));
  beam.position.y=.9; g.add(beam);
  g.userData.warpRouteId=route.id;
  g.userData.warpPulse=Math.random()*Math.PI*2;
  return g;
}
function clearDecorations(){
  while(decorations.children.length) removeAndDispose(decorations,decorations.children[0]);
  for(let i=0;i<decoAttachQueue.length;i++)disposeObject3D(decoAttachQueue[i]);
  decoAttachQueue.length=0;
}
function populateWorld(zone='hub'){
  decoStreaming=true;
  clearDecorations();
  for(const route of routesFrom(zone))makeWarpBeacon(route);
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
  }else if(zone==='grass-meadow'){
    // Scene-first layout remains the source of truth; normal encounters are layered on top.
    [[-17,10,1.2],[17,-10,1.35],[18,12,1.05],[-18,-12,1.15],[7,17,1.35],[-8,-17,1.15]].forEach(v=>makeRock(...v));
    [[-14,5,1.05,{leaf:0x22c55e}],[14,5,1.1,{leaf:0x16a34a}],[15,-14,1.25,{fruit:0xf97316}],[-15,-14,1.15],[4,15,1.1],[-5,-15,1.2]].forEach(([x,z,s,opt])=>makeTree(x,z,s,opt||{}));
    for(const [x,z] of [[-10,8],[-6,8],[-2,8],[2,8],[6,8],[10,8],[-10,-2],[-6,-2],[-2,-2],[2,-2],[6,-2],[10,-2]]) makeGrassTuft(x,z,.9+((x+z)&1)*.15);
    [[-8,12,0xfacc15],[0,12,0xfb7185],[8,12,0xa78bfa],[-8,-10,0xfde047],[8,-10,0x67e8f9]].forEach(v=>makeFlower(...v));
    [[-11,2],[0,2],[11,2],[-11,-8],[0,-8],[11,-8]].forEach(([x,z])=>makeStageBeacon(x,z,0x86efac));
    for(const z of [14,10,6,2,-2,-6,-10,-14]){
      const tile=new THREE.Mesh(boxGeometry(2.8,.018,2.2),new THREE.MeshBasicMaterial({color:0xb99a62,transparent:true,opacity:.3}));
      tile.position.set(0,.025,z); addDeco(tile);
    }
  }else if(zone==='rocky-canyon'){
    [[-19,10,1.3],[19,-10,1.35],[-19,-10,1.15],[19,10,1.25]].forEach(([x,z,s])=>makeCanyonWall(x,z,s,0x78350f));
    [[-15,5,1.15],[15,5,1.2],[15,-14,1.3],[-15,-14,1.15],[5,15,1.1],[-5,-15,1.25]].forEach(([x,z,s])=>makeRock(x,z,s,0x92400e));
    for(const z of [14,10,6,2,-2,-6,-10,-14]){
      const tile=new THREE.Mesh(boxGeometry(2.8,.018,2.2),new THREE.MeshBasicMaterial({color:0xd6a66b,transparent:true,opacity:.32}));
      tile.position.set(0,.025,z); addDeco(tile);
    }
    for(const [x,z] of [[-10,8],[-6,8],[-2,8],[2,8],[6,8],[10,8],[-10,-2],[-6,-2],[-2,-2],[2,-2],[6,-2],[10,-2]]) makeStageBeacon(x,z,0xfbbf24);
  }else if(zone==='sky-ruins'){
    [[-18,10,1.2],[18,10,1.25],[-18,-10,1.1],[18,-10,1.2]].forEach(([x,z,s])=>makeRuinPillar(x,z,s,0x64748b));
    [[-15,5,1.05],[15,5,1.1],[15,-14,1.2],[-15,-14,1.05]].forEach(([x,z,s])=>makeRock(x,z,s,0x475569));
    for(const z of [14,10,6,2,-2,-6,-10,-14]){
      const tile=new THREE.Mesh(boxGeometry(2.8,.018,2.2),new THREE.MeshBasicMaterial({color:0x94a3b8,transparent:true,opacity:.3}));
      tile.position.set(0,.025,z); addDeco(tile);
    }
    for(const [x,z] of [[-10,8],[-6,8],[-2,8],[2,8],[6,8],[10,8],[-10,-2],[-6,-2],[-2,-2],[2,-2],[6,-2],[10,-2]]) makeStageBeacon(x,z,0xc4b5fd);
  }else if(zone==='poison-marsh'){
    [[-18,10,1.2],[18,10,1.1],[-18,-10,1.3],[18,-10,1.15]].forEach(([x,z,s])=>makeRock(x,z,s,0x365314));
    [[-15,5,1.1],[15,5,1.2],[15,-14,1.3],[-15,-14,1.05],[-7,12,1],[7,-12,1.1]].forEach(([x,z,s])=>makeMarshReed(x,z,s));
    for(const z of [14,10,6,2,-2,-6,-10,-14]){
      const tile=new THREE.Mesh(boxGeometry(2.8,.018,2.2),new THREE.MeshBasicMaterial({color:0x84cc16,transparent:true,opacity:.24}));
      tile.position.set(0,.025,z); addDeco(tile);
    }
    for(const [x,z] of [[-10,8],[-6,8],[-2,8],[2,8],[6,8],[10,8],[-10,-2],[-6,-2],[-2,-2],[2,-2],[6,-2],[10,-2]]) makeStageBeacon(x,z,0xd9f99d);
  }else if(zone==='dream-shrine'){
    [[-18,10,1.15],[18,10,1.15],[-18,-10,1.1],[18,-10,1.1]].forEach(([x,z,s])=>makeRuinPillar(x,z,s,0x6d28d9));
    [[-15,5,1.1],[15,5,1.1],[15,-14,1.15],[-15,-14,1.15]].forEach(([x,z,s])=>makeShrineLantern(x,z,s));
    for(const z of [14,10,6,2,-2,-6,-10,-14]){
      const tile=new THREE.Mesh(boxGeometry(2.8,.018,2.2),new THREE.MeshBasicMaterial({color:0xc4b5fd,transparent:true,opacity:.28}));
      tile.position.set(0,.025,z); addDeco(tile);
    }
    for(const [x,z] of [[-10,8],[-6,8],[-2,8],[2,8],[6,8],[10,8],[-10,-2],[-6,-2],[-2,-2],[2,-2],[6,-2],[10,-2]]) makeStageBeacon(x,z,0xf0abfc);
  }else if(zone==='haunted-woods'){
    [[-18,10,1.2],[18,10,1.15],[-18,-10,1.25],[18,-10,1.1]].forEach(([x,z,s])=>makeTree(x,z,s,{leaf:0x312e81,fruit:0xa78bfa}));
    [[-15,5,1.1],[15,5,1.2],[15,-14,1.15],[-15,-14,1.1],[-7,12,1],[7,-12,1.05]].forEach(([x,z,s])=>makeStalagmite(x,z,s));
    for(const z of [14,10,6,2,-2,-6,-10,-14]){
      const tile=new THREE.Mesh(boxGeometry(2.8,.018,2.2),new THREE.MeshBasicMaterial({color:0x475569,transparent:true,opacity:.3}));
      tile.position.set(0,.025,z); addDeco(tile);
    }
    for(const [x,z] of [[-10,8],[-6,8],[-2,8],[2,8],[6,8],[10,8],[-10,-2],[-6,-2],[-2,-2],[2,-2],[6,-2],[10,-2]]) makeStageBeacon(x,z,0xc4b5fd);
  }else if(zone==='shadow-city'){
    [[-18,10,1.2],[18,10,1.1],[-18,-10,1.25],[18,-10,1.15]].forEach(([x,z,s])=>makeCityNeon(x,z,s,0xa78bfa));
    [[-15,5,1.1],[15,5,1.15],[15,-14,1.2],[-15,-14,1.05]].forEach(([x,z,s])=>makeCityNeon(x,z,s,0x22d3ee));
    for(const z of [14,10,6,2,-2,-6,-10,-14]){
      const tile=new THREE.Mesh(boxGeometry(2.8,.018,2.2),new THREE.MeshBasicMaterial({color:0x475569,transparent:true,opacity:.34}));
      tile.position.set(0,.025,z); addDeco(tile);
    }
    for(const [x,z] of [[-10,8],[-6,8],[-2,8],[2,8],[6,8],[10,8],[-10,-2],[-6,-2],[-2,-2],[2,-2],[6,-2],[10,-2]]) makeStageBeacon(x,z,0x67e8f9);
  }else if(zone==='steel-factory'){
    [[-18,10,1.2],[18,10,1.1],[-18,-10,1.25],[18,-10,1.15]].forEach(([x,z,s])=>makeFactoryUnit(x,z,s));
    [[-15,5,1.1],[15,5,1.15],[15,-14,1.2],[-15,-14,1.05]].forEach(([x,z,s])=>makeFactoryUnit(x,z,s));
    for(const z of [14,10,6,2,-2,-6,-10,-14]){
      const tile=new THREE.Mesh(boxGeometry(2.8,.018,2.2),new THREE.MeshBasicMaterial({color:0x94a3b8,transparent:true,opacity:.34}));
      tile.position.set(0,.025,z); addDeco(tile);
    }
    for(const [x,z] of [[-10,8],[-6,8],[-2,8],[2,8],[6,8],[10,8],[-10,-2],[-6,-2],[-2,-2],[2,-2],[6,-2],[10,-2]]) makeStageBeacon(x,z,0xfbbf24);
  }else if(zone==='dragon-crater'){
    [[-19,10,1.35],[19,10,1.25],[-19,-10,1.2],[19,-10,1.3]].forEach(([x,z,s])=>makeCanyonWall(x,z,s,0x7f1d1d));
    [[-15,5,1.15],[15,5,1.2],[-15,-14,1.3],[15,-14,1.2],[-8,14,1.05],[8,-12,1.1]].forEach(([x,z,s])=>makeRock(x,z,s,0x991b1b));
    for(const z of [14,10,6,2,-2,-6,-10,-14]){
      const tile=new THREE.Mesh(boxGeometry(2.8,.018,2.2),new THREE.MeshBasicMaterial({color:0xf97316,transparent:true,opacity:.26}));
      tile.position.set(0,.025,z); addDeco(tile);
    }
    for(const [x,z] of [[-10,8],[-5,8],[5,8],[10,8],[-10,-2],[-5,-2],[5,-2],[10,-2]]) makeStageBeacon(x,z,0xfb923c);
  }else if(zone==='fairy-garden'){
    [[-18,10,1.1],[18,10,1.05],[-18,-10,1.15],[18,-10,1.1],[-8,16,1],[8,-16,1.05]].forEach(([x,z,s])=>makeTree(x,z,s,{leaf:0xa855f7,fruit:0xf9a8d4}));
    [[-15,5,1],[15,5,1.05],[-15,-14,1.05],[15,-14,1]].forEach(([x,z,s])=>makeShrineLantern(x,z,s));
    for(const [x,z,color] of [[-10,12,0xf9a8d4],[-5,12,0xc4b5fd],[5,12,0xf0abfc],[10,12,0xfde68a],[-10,-7,0xc4b5fd],[-5,-7,0xf9a8d4],[5,-7,0xfde68a],[10,-7,0xf0abfc]]) makeFlower(x,z,color);
    for(const z of [14,10,6,2,-2,-6,-10,-14]){
      const tile=new THREE.Mesh(boxGeometry(2.8,.018,2.2),new THREE.MeshBasicMaterial({color:0xf5d0fe,transparent:true,opacity:.3}));
      tile.position.set(0,.025,z); addDeco(tile);
    }
    for(const [x,z] of [[-10,8],[-5,8],[5,8],[10,8],[-10,-2],[-5,-2],[5,-2],[10,-2]]) makeStageBeacon(x,z,0xf0abfc);
  }else if(zone==='combat-colosseum'){
    [[-19,11,1.3],[19,11,1.3],[-19,-11,1.3],[19,-11,1.3],[-12,17,1.1],[12,17,1.1],[-12,-17,1.1],[12,-17,1.1]].forEach(([x,z,s])=>makeRuinPillar(x,z,s,0x92400e));
    for(const z of [14,10,6,2,-2,-6,-10,-14]){
      const tile=new THREE.Mesh(boxGeometry(3.4,.018,2.2),new THREE.MeshBasicMaterial({color:0xfbbf24,transparent:true,opacity:.28}));
      tile.position.set(0,.025,z); addDeco(tile);
    }
    for(const [x,z] of [[-10,8],[-5,8],[5,8],[10,8],[-10,-2],[-5,-2],[5,-2],[10,-2]]) makeStageBeacon(x,z,0xfacc15);
  }else if(zone==='normal-wildlands'){
    [[-18,10,1.15],[18,-10,1.25],[-18,-10,1.05],[18,10,1.15],[-8,16,1.2],[8,-16,1.1]].forEach(([x,z,s])=>makeRock(x,z,s,0x4d7c0f));
    [[-15,5,1.05,{leaf:0x65a30d}],[15,5,1.1,{leaf:0x16a34a,fruit:0xfacc15}],[-15,-14,1.05,{leaf:0x22c55e}],[15,-14,1.15,{leaf:0x4d7c0f,fruit:0xfb7185}]].forEach(([x,z,s,opt])=>makeTree(x,z,s,opt));
    for(const [x,z] of [[-10,11],[-5,11],[5,11],[10,11],[-10,-6],[-5,-6],[5,-6],[10,-6]]) makeGrassTuft(x,z,.9+((x+z)&1)*.12);
    [[-8,14,0xfacc15],[0,14,0xfb7185],[8,14,0x67e8f9],[-8,-10,0xa78bfa],[8,-10,0xfde047]].forEach(v=>makeFlower(...v));
    for(const z of [14,10,6,2,-2,-6,-10,-14]){
      const tile=new THREE.Mesh(boxGeometry(2.8,.018,2.2),new THREE.MeshBasicMaterial({color:0xd9f99d,transparent:true,opacity:.24}));
      tile.position.set(0,.025,z); addDeco(tile);
    }
    for(const [x,z] of [[-10,8],[-5,8],[5,8],[10,8],[-10,-2],[-5,-2],[5,-2],[10,-2]]) makeStageBeacon(x,z,0x86efac);
  }else if(zone==='frozen-pass'){
    [[-17,10,1.2],[17,-10,1.35],[18,12,1.05],[-18,-12,1.15],[7,17,1.25],[-8,-17,1.15]].forEach(([x,z,s])=>makeRock(x,z,s,0x94a3b8));
    [[-15,5,1.2],[15,5,1.1],[15,-14,1.35],[-15,-14,1.2],[5,15,1.15],[-5,-15,1.2],[-4,-5,1],[8,-8,1.1]].forEach(([x,z,s])=>makeIceCrystal(x,z,s));
    for(const z of [14,10,6,2,-2,-6,-10,-14]){
      const tile=new THREE.Mesh(boxGeometry(2.8,.018,2.2),new THREE.MeshBasicMaterial({color:0xe0f2fe,transparent:true,opacity:.34}));
      tile.position.set(0,.025,z); addDeco(tile);
    }
    for(const [x,z] of [[-10,8],[-6,8],[-2,8],[2,8],[6,8],[10,8],[-10,-2],[-6,-2],[-2,-2],[2,-2],[6,-2],[10,-2]]) makeStageBeacon(x,z,0xbae6fd);
  }else if(zone==='cave'){
    [[-10,6,1.4,0x57534e],[9,-7,1.6,0x44403c],[14,4,1.2,0x78716c],[-15,-5,1.5,0x57534e],[3,-15,1.8,0x3f3f46],[-4,16,1.3,0x52525b]].forEach(v=>makeRock(...v));
    [[-8,-4,1.1],[6,-9,1.3],[-12,9,1.4],[11,8,1.2],[0,-12,1.6],[15,-2,1],[-6,12,1.25]].forEach(v=>makeStalagmite(...v));
  }
  decoStreaming=false;
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
  mkSpecies({id:'buglet',name:'Bug Slime',color:0x9cab25,types:['Bug'],base:{hp:78,atk:12,def:11,spd:13},capture:.60,group:'Bug',traits:['Swarm Spirit','Hard Worker','Sturdy'],skills:[
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
  mkSpecies({id:'voidhorn',name:'Shadow Slime',color:0x584b43,types:['Dark'],base:{hp:96,atk:16,def:12,spd:12},capture:.54,group:'Monster',traits:['Night Hunter','Fierce','Sharp Eye'],skills:[
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
const speciesCatalogAdapter=createSpeciesCatalogAdapter(species);
if(speciesCatalogAdapter.diagnostics.length)console.warn('Species catalog diagnostics',speciesCatalogAdapter.diagnostics);
const spById=speciesCatalogAdapter.byId;
const personalities=['Brave','Calm','Playful','Lazy','Aggressive','Curious'];
const POTENTIALS=['D','C','B','A','S'];
// V7.2 Balance Foundation gene scale: narrow 8% spread (D=0.96 → S=1.04)
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
const BALANCE={bossRespawnMs:15000,wildRespawnMs:7000,captureRange:10,captureAimRadius:1.4,grassMeadowBoss:{level:5,respawnMs:30000},grassMeadowNormal:{battleExpBase:8,battleExpPerLevel:4,captureExp:8,respawnMs:12000},grassMeadowRare:{chance:.24,level:2,respawnMs:18000}};

function rollGender(sp){
  const profile=workbookBreedingProfile(sp?.id);
  if(profile){
    const resolved=resolveGenderFromSeed(profile.genderRule,Math.floor(Math.random()*100));
    if(resolved)return resolved;
  }
  return sp?.genderMode==='genderless'?'Genderless':(Math.random()<.5?'Male':'Female');
}
function getEvolutionPath(inst){ const sp=spById[inst?.speciesId]; return sp?.evolutionPaths?.find(p=>p.id===inst.formId||p.id===inst.evolutionPath)||null; }
function availableEvolutionPaths(inst){ const sp=spById[inst?.speciesId]; if(!sp)return []; const from=inst.formId||sp.id; return (sp.evolutionPaths||[]).filter(p=>(p.fromFormId||sp.id)===from&&p.id!==inst.formId); }
function displayName(inst){ const canonical=monsterStatCatalogEntry(inst?.canonicalFormId);return canonical?.stage===2?canonical.nameTH:(getEvolutionPath(inst)?.name||spById[inst.speciesId]?.name||'Monster'); }
function monsterTypes(instOrSp){
  if(!instOrSp)return ['Normal'];
  if(instOrSp.instanceId){
    const sp=spById[instOrSp.speciesId],path=getEvolutionPath(instOrSp);
    return [sp.types[0],path?.secondaryType??instOrSp.secondaryType??sp.types[1]].filter(Boolean);
  }
  return instOrSp.types.filter(Boolean);
}
function wildPath(w){ const sp=spById[w?.speciesId]; return sp?.evolutionPaths?.find(p=>p.id===w?.evolutionPath)||null; }
function wildDisplayName(w){ const canonical=monsterStatCatalogEntry(w?.canonicalFormId);return canonical?.stage===2?canonical.nameTH:(wildPath(w)?.name||spById[w?.speciesId]?.name||'Monster'); }
function wildTypes(w){ const sp=spById[w?.speciesId]; const path=wildPath(w); return [sp?.types?.[0]||'Normal', path?.secondaryType??sp?.types?.[1]].filter(Boolean); }
function getMonsterSkills(inst){
  const sp=spById[inst.speciesId];
  const moves=(sp?.skills||[]).map(m=>({...m}));
  for(const rec of inst.skills||[]){
    const cand=(SKILL_CANDIDATES[inst.speciesId]||[]).find(c=>c.id===rec.skillId);
    if(cand?.replaces&&rec.slot===cand.slot){
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
// Manual combat commands use the workbook-owned four-slot loadout. The legacy
// species moves above remain a presentation/Basic-AI compatibility surface and
// must never decide a manual command's SkillID, Uses, target, or cooldown.
function canonicalCombatSkills(inst){
  if(!inst)return MANUAL_SKILL_SLOTS.map(()=>null);
  return manualSkillLoadout(inst).map(entry=>{
    const definition=entry.skillId?skillCatalogEntry(entry.skillId):null;
    if(!definition||!entry.skill)return null;
    return Object.freeze({
      skillId:definition.id,
      name:definition.nameTH||definition.nameEN,
      nameEN:definition.nameEN,
      type:definition.runtimeType,
      category:definition.category,
      power:definition.power,
      targetType:definition.targetType,
      effect:definition.effect,
      directDamage:definition.directDamage,
      effectAvailable:canExecuteReviewedSkillEffect(definition.id),
      unavailableReason:'Targeting พร้อมแล้ว • เอฟเฟกต์นี้รอระบบสกิลขั้นถัดไป',
      currentUses:entry.skill.currentUses,
      maxUses:definition.maxUses,
      cooldown:definition.cooldownSec,
      activation:definition.activation,
    });
  });
}
function randomGenes(sp){ return {hp:rand(POTENTIALS),atk:rand(POTENTIALS),def:rand(POTENTIALS),spd:rand(POTENTIALS),trait:rand(sp.traitPool),skillGene:sp.skills[0].name,typeAffinity:sp.types[0]}; }
function randomPotential(){return {hp:Math.floor(Math.random()*32),atk:Math.floor(Math.random()*32),def:Math.floor(Math.random()*32),spAtk:Math.floor(Math.random()*32),spDef:Math.floor(Math.random()*32),spd:Math.floor(Math.random()*32)};}
function lifeStageFor(inst){ if(inst.origin==='bred'&&inst.level<=1)return 'Baby'; if(inst.level<=2)return 'Juvenile'; if(inst.level<6)return 'Adult'; return 'Mature'; }
function refreshStats(inst,heal=false){
  const sp=spById[inst.speciesId]; if(!sp)return;
  syncToBodyMind(inst);
  inst.trainingBonus=inst.trainingBonus||{hp:0,atk:0,def:0,spd:0};
  inst.training=inst.training||{power:0,defense:0,speed:0,technique:0,spirit:0};
  inst._condition=deriveCondition(inst);
  const path=getEvolutionPath(inst);
  const computed=refreshCanonicalOwnedStats(inst,getEquipmentFlat(inst),{heal});
  inst.statBreakdown=computed.breakdown;
  inst.lifeStage=lifeStageFor(inst);
  syncFromBodyMind(inst);
}
function makeInstance(sp,level=1,opts={}){
  const personality=opts.personality||rand(personalities);
  const genes=opts.genes||randomGenes(sp);
  const mapping=monsterCatalogEntry(sp.id);
  const spawnForm=monsterStatCatalogEntry(opts.canonicalFormId??(opts.evolutionPath?mapping?.workbookStage2MonsterId:mapping?.workbookBaseMonsterId));
  const inst=createInstance({
    instanceId:'m'+Date.now()+'-'+Math.floor(Math.random()*999999),
    speciesId:sp.id,
    formId:opts.formId??opts.evolutionPath??sp.id,
    level,
    growthExp:opts.growthExp??growthExpForLevel(level,spawnForm?.growthCurve),
    origin:opts.origin||'captured',
    personality,
    personalityId:personality,
    gender:opts.gender||rollGender(sp),
    genes,
    potential:opts.potential,
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
  synchronizeStage1Learnset(inst);
  syncFromBodyMind(inst);
  refreshStats(inst,true);
  return inst;
}
function ensureInstanceShape(inst){
  const sp=spById[inst.speciesId]; if(!sp)return inst;
  const normalized=normalizeInstance({
    ...inst,
    formId:inst.formId||inst.evolutionPath||sp.id,
    growthExp:Math.max(inst.growthExp||0,inst.exp||0,growthExpForLevel(inst.level||1,inst.growthCurve)),
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
  if(inst.level>1&&(inst.growthExp||0)<growthExpForLevel(inst.level,inst.growthCurve))inst.growthExp=growthExpForLevel(inst.level,inst.growthCurve);
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
{
  const { createPirateFruitPlayerProvider } = await import('./asset-presentation/providers/pirate-fruit-player.mjs');
  assets.registerProvider('pirate-fruit',createPirateFruitPlayerProvider({
    THREE,
    box:boxGeometry,
    capsule:capsuleGeometry,
    sphere:sphereGeometry,
    cylinder:cylinderGeometry,
    cone:coneGeometry,
    torus:torusGeometry,
    material:mat,
  }));
}
// ---------- Player / NPC ----------
const playerVisual=assets.spawn('character.human.pirate-fruit.v1',{role:'player',appearanceId:'appearance.human.player-orange.v1',quality:qualityProfile.tier});
const keeperVisual=assets.spawn('character.human.blocky-bighead.v1',{role:'keeper',appearanceId:'appearance.human.keeper-green.v1',quality:qualityProfile.tier});
const merchantVisual=assets.spawn('character.human.blocky-bighead.v1',{role:'merchant',appearanceId:'appearance.human.merchant-brown.v1',quality:qualityProfile.tier});
const trainerVisual=assets.spawn('character.human.blocky-bighead.v1',{role:'trainer',appearanceId:'appearance.human.trainer-blue.v1',quality:qualityProfile.tier});
const evolutionVisual=assets.spawn('character.human.blocky-bighead.v1',{role:'evolution',appearanceId:'appearance.human.evolution-purple.v1',quality:qualityProfile.tier});
const breedingVisual=assets.spawn('character.human.blocky-bighead.v1',{role:'breeding',appearanceId:'appearance.human.breeding-pink.v1',quality:qualityProfile.tier});
await Promise.all([playerVisual.ready,keeperVisual.ready,merchantVisual.ready,trainerVisual.ready,evolutionVisual.ready,breedingVisual.ready].filter(Boolean));
const player=playerVisual.root; scene.add(player); player.position.set(0,0,5);
if(typeof window!=='undefined'){
  window.POCKETMONSTER_PLAYER_CHARACTER=publishPlayerCharacterBinding({writeArmed:serverPlayerDataActive,name:authProfileBridge.profile?.character?.name||authProfileBridge.profile?.displayName});
}
flushNearbyDecos(player.position,WORLD_STREAM.zoneAttachBudget);
const playerData={hp:100,maxHp:100,speed:5.7,invuln:0};
const npc=keeperVisual.root; npc.position.set(4,0,3); scene.add(npc);
const merchantNpc=merchantVisual.root; merchantNpc.position.set(9,0,3); scene.add(merchantNpc);
const trainerNpc=trainerVisual.root; trainerNpc.position.set(1,0,10); scene.add(trainerNpc);
const evolutionNpc=evolutionVisual.root; evolutionNpc.position.set(-6,0,8); scene.add(evolutionNpc);
const breedingNpc=breedingVisual.root; breedingNpc.position.set(7,0,10); scene.add(breedingNpc);
const presentationScratch={throwOrigin:new THREE.Vector3(),hitText:new THREE.Vector3()};
function playerThrowOrigin(){ return playerVisual.anchor('throwOrigin',presentationScratch.throwOrigin); }
function playerHitText(){ return playerVisual.anchor('hitText',presentationScratch.hitText); }
if(typeof window!=='undefined'){
  window.MLRPG_ASSETS={diagnostics:()=>assets.diagnostics()};
  const worldStream=()=>({
    attached:decorations.children.length,
    queued:decoAttachQueue.length,
    keepAlive:decorations.children.filter(child=>child.userData.warpRouteId||child.userData.stageMarker).length,
    loadRadius:WORLD_STREAM.loadRadius,
    unloadRadius:WORLD_STREAM.unloadRadius,
    x:+player.position.x.toFixed(2),
    z:+player.position.z.toFixed(2),
    hitch:streamHitchSnapshot(),
  });
  worldStream.resetHitch=resetStreamHitch;
  worldStream.moveTo=(x,z)=>{player.position.x=x;player.position.z=z;};
  worldStream.lookAt=(x,z)=>{cameraYaw=Math.atan2(-(x-player.position.x),-(z-player.position.z));};
  worldStream.captureProbe=()=>({
    flying:projectiles.some(p=>p.type==='capture'),
    shaking:!!captureSequence?.ballMesh,
    wildHidden:!!(captureSequence?.wild?.mesh&&captureSequence.wild.mesh.visible===false),
  });
  window.MLRPG_WORLD_STREAM=worldStream;
}
const VFX_LIMITS=Object.freeze({maxConcurrentEffects:80,maxParticles:200,maxGroundDecals:8,maxFloatingTexts:12});
const VFX_PRIORITY_RANK=Object.freeze({P0:0,P1:1,P2:2,P3:3,P4:4});
const effects=[];
function canSpawnVFX(priority='P2'){
  if(effects.length<VFX_LIMITS.maxConcurrentEffects)return true;
  const incomingRank=VFX_PRIORITY_RANK[priority]??VFX_PRIORITY_RANK.P2;
  for(const evictPriority of ['P4','P3']){
    if(VFX_PRIORITY_RANK[evictPriority]<=incomingRank)continue;
    for(let index=effects.length-1;index>=0;index--){
      if(effects[index]?.priority!==evictPriority)continue;
      releaseTransientEffect(effects[index]);effects.splice(index,1);return true;
    }
  }
  return priority==='P0';
}
function addTransientEffect(effect,priority='P2'){
  if(!effect?.mesh)return false;
  if(!canSpawnVFX(priority)){releaseTransientEffect(effect);return false;}
  effect.priority=Object.hasOwn(VFX_PRIORITY_RANK,priority)?priority:'P2';
  effects.push(effect);
  return true;
}
// Skill sprite texture cache — radial gradient glow per element type
const skillSpriteCache=new Map();
function getSkillSpriteTexture(type){
  if(skillSpriteCache.has(type))return skillSpriteCache.get(type);
  const cfg=typeFx(type);
  const c=document.createElement('canvas');
  c.width=128;c.height=128;
  const ctx=c.getContext('2d');
  const grad=ctx.createRadialGradient(64,64,0,64,64,64);
  const coreHex='#'+cfg.core.toString(16).padStart(6,'0');
  const accentHex='#'+cfg.accent.toString(16).padStart(6,'0');
  grad.addColorStop(0,accentHex);
  grad.addColorStop(0.25,coreHex);
  grad.addColorStop(0.5,coreHex+'88');
  grad.addColorStop(1,coreHex+'00');
  ctx.fillStyle=grad;
  ctx.fillRect(0,0,128,128);
  // Add type-specific motif
  ctx.save();
  ctx.translate(64,64);
  ctx.globalAlpha=0.4;
  ctx.strokeStyle=accentHex;
  ctx.lineWidth=3;
  switch(cfg.shape){
    case'flame':ctx.beginPath();for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2;ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*40,Math.sin(a)*40-10);}ctx.stroke();break;
    case'drop':ctx.beginPath();ctx.arc(0,5,35,0,Math.PI*2);ctx.stroke();break;
    case'spark':ctx.beginPath();for(let i=0;i<4;i++){const a=(i/4)*Math.PI*2;ctx.moveTo(Math.cos(a)*30,Math.sin(a)*30);ctx.lineTo(Math.cos(a+0.5)*45,Math.sin(a+0.5)*45);}ctx.stroke();break;
    case'leaf':ctx.beginPath();ctx.ellipse(0,0,40,20,0,0,Math.PI*2);ctx.stroke();break;
    case'crystal':ctx.beginPath();for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2;ctx.lineTo(Math.cos(a)*38,Math.sin(a)*38);}ctx.closePath();ctx.stroke();break;
    case'impact':ctx.beginPath();ctx.arc(0,0,38,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(0,0,25,0,Math.PI*2);ctx.stroke();break;
    case'halo':ctx.beginPath();ctx.arc(0,0,42,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(0,0,28,0,Math.PI*2);ctx.stroke();break;
    case'shard':ctx.beginPath();ctx.moveTo(0,-40);ctx.lineTo(15,0);ctx.lineTo(0,40);ctx.lineTo(-15,0);ctx.closePath();ctx.stroke();break;
    case'mist':ctx.beginPath();ctx.arc(-15,0,25,0,Math.PI*2);ctx.arc(15,0,25,0,Math.PI*2);ctx.stroke();break;
    case'star':ctx.beginPath();for(let i=0;i<10;i++){const a=(i/10)*Math.PI*2;const r=i%2?15:40;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.stroke();break;
    case'arc':ctx.beginPath();ctx.arc(0,0,40,Math.PI*0.2,Math.PI*0.8);ctx.stroke();break;
    case'smoke':ctx.beginPath();ctx.arc(-10,-10,20,0,Math.PI*2);ctx.arc(10,10,25,0,Math.PI*2);ctx.arc(0,0,30,0,Math.PI*2);ctx.stroke();break;
    case'metal':ctx.beginPath();ctx.rect(-30,-20,60,40);ctx.stroke();break;
    case'feather':ctx.beginPath();ctx.ellipse(0,0,15,40,0,0,Math.PI*2);ctx.stroke();break;
    case'bubble':ctx.beginPath();ctx.arc(0,0,35,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(-10,-10,8,0,Math.PI*2);ctx.stroke();break;
    case'dust':ctx.beginPath();ctx.arc(0,5,30,0,Math.PI*2);ctx.arc(-15,-5,18,0,Math.PI*2);ctx.arc(15,-5,18,0,Math.PI*2);ctx.stroke();break;
    case'spore':ctx.beginPath();for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2;ctx.arc(Math.cos(a)*20,Math.sin(a)*20,8,0,Math.PI*2);}ctx.stroke();break;
    default:ctx.beginPath();ctx.arc(0,0,35,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
  const tex=new THREE.CanvasTexture(c);
  tex.needsUpdate=true;
  skillSpriteCache.set(type,tex);
  return tex;
}
const skillSpritePool=createObjectPool({
  maxSize:80,
  create:()=>{
    const mat=new THREE.SpriteMaterial({map:null,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
    const sprite=new THREE.Sprite(mat);
    sprite.castShadow=false;
    return sprite;
  },
  reset:sprite=>{
    sprite.removeFromParent();
    sprite.visible=false;
    sprite.position.set(0,0,0);
    sprite.scale.setScalar(1);
    sprite.material.opacity=0;
    sprite.material.map=null;
  },
  destroy:sprite=>disposeObject3D(sprite),
});
function spawnSkillSprite(type,pos,size=0.3,life=0.4){
  const tex=getSkillSpriteTexture(type);
  const sprite=skillSpritePool.acquire();
  if(!sprite)return null;
  sprite.material.map=tex;
  sprite.visible=true;
  sprite.material.opacity=0.9;
  sprite.material.needsUpdate=true;
  sprite.position.copy(pos);
  sprite.scale.setScalar(size);
  scene.add(sprite);
  if(!addTransientEffect({mesh:sprite,life:life,maxLife:life,kind:'skill-sprite',pooled:true,spritePool:true,size:size},'P1'))return null;
  return sprite;
}
const sparkPool=createObjectPool({
  maxSize:VFX_LIMITS.maxParticles,
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
  if(effect.spritePool)skillSpritePool.release(effect.mesh);
  else if(effect.pooled)sparkPool.release(effect.mesh);
  else removeAndDispose(scene,effect.mesh);
}
function spawnBurst(pos,color=0x8b5cf6,{count=8,life=.4,size=.06,gravity=0,priority='P1'}={}){
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
    addTransientEffect({mesh:m,vel:new THREE.Vector3(Math.cos(a)*speed,.4+Math.random()*1.2,Math.sin(a)*speed),life,maxLife:life,kind:'spark',gravity,size,pooled:true},priority);
  }
}
function spawnRingPulse(pos,color=0x60a5fa,{scale=.6,life=.35,y=.08,priority='P1'}={}){
  const size=scale*1.2;
  const mesh=new THREE.Mesh(boxGeometry(size,.02,size),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,wireframe:true}));
  const effect={mesh,life,maxLife:life,kind:'ring'};
  mesh.position.copy(pos);mesh.position.y+=y;scene.add(mesh);return addTransientEffect(effect,priority)?effect:null;
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
    addTransientEffect({mesh:m,life:0.4,maxLife:0.4,kind:'spark',pooled:true,vel:new THREE.Vector3(Math.cos(angle)*0.3,0.8+Math.random()*0.4,Math.sin(angle)*0.3),size:m.scale.x,gravity:0},'P2');
  }
  spawnRingPulse(pos.clone(),color,{scale:0.5,life:0.3,y:0.08,priority:'P2'});
}
function spawnEvolutionEffect(pos,oldColor,newColor){
  if(!pos)return;
  const aura=new THREE.Mesh(boxGeometry(1.2,2.0,1.2),new THREE.MeshBasicMaterial({color:newColor,transparent:true,opacity:0,wireframe:true}));
  aura.position.copy(pos); aura.position.y+=1.0; scene.add(aura);
  addTransientEffect({mesh:aura,life:1.2,maxLife:1.2,kind:'evolution-aura',phase:0,newColor},'P2');
  for(let i=0;i<20;i++){
    const m=takeSpark(i%2?newColor:oldColor),angle=(i/20)*Math.PI*2;
    m.position.set(pos.x+Math.cos(angle)*0.8,pos.y+0.5+Math.random()*1.5,pos.z+Math.sin(angle)*0.8);
    m.scale.setScalar(0.06);
    m.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);
    scene.add(m);
    addTransientEffect({mesh:m,life:0.8,maxLife:0.8,kind:'spark',pooled:true,vel:new THREE.Vector3(Math.cos(angle)*0.5,1.0,Math.sin(angle)*0.5),size:0.06,gravity:0.5},'P2');
  }
  spawnRingPulse(pos.clone(),newColor,{scale:1.2,life:0.4,y:0.08,priority:'P2'});
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
    addTransientEffect({mesh:m,life:0.8,maxLife:0.8,kind:'spark',pooled:true,vel:new THREE.Vector3(0,0.5+Math.random()*0.3,0),size:0.08,gravity:-0.2},'P2');
  }
  spawnRingPulse(mid,0xec4899,{scale:0.8,life:0.35,y:0,priority:'P2'});
}
function spawnHatchEffect(pos){
  if(!pos)return;
  for(let i=0;i<12;i++){
    const m=takeSpark(0xfde68a);
    m.position.set(pos.x+(Math.random()-0.5)*0.4,pos.y+0.3+Math.random()*0.5,pos.z+(Math.random()-0.5)*0.4);
    m.scale.setScalar(0.05);
    m.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);
    scene.add(m);
    addTransientEffect({mesh:m,life:0.5,maxLife:0.5,kind:'spark',pooled:true,vel:new THREE.Vector3((Math.random()-0.5)*1.5,0.8+Math.random()*0.5,(Math.random()-0.5)*1.5),size:0.05,gravity:1.0},'P2');
  }
  spawnRingPulse(pos.clone(),0xfde68a,{scale:0.8,life:0.4,y:0.1,priority:'P2'});
  triggerCameraShake(0.08,0.15);
}
function spawnFeedEffect(pos,foodColor=0x22c55e){
  if(!pos)return;
  for(let i=0;i<5;i++){
    const m=takeSpark(foodColor);
    m.position.set(pos.x+(Math.random()-0.5)*0.3,pos.y+1.5+Math.random()*0.3,pos.z+(Math.random()-0.5)*0.3);
    m.scale.setScalar(0.05);
    scene.add(m);
    addTransientEffect({mesh:m,life:0.5,maxLife:0.5,kind:'spark',pooled:true,vel:new THREE.Vector3(0,-1.0,0),size:0.05,gravity:0},'P3');
  }
  for(let i=0;i<3;i++){
    const m=takeSpark(0xec4899);
    m.position.set(pos.x+(Math.random()-0.5)*0.4,pos.y+0.8,pos.z);
    m.scale.setScalar(0.04);
    scene.add(m);
    addTransientEffect({mesh:m,life:0.6,maxLife:0.6,kind:'spark',pooled:true,vel:new THREE.Vector3(0,0.6,0),size:0.04,gravity:-0.1},'P3');
  }
}
function spawnRestEffect(pos){
  if(!pos)return;
  for(let i=0;i<4;i++){
    const m=takeSpark(0x60a5fa);
    m.position.set(pos.x+(Math.random()-0.5)*0.4,pos.y+1.0+i*0.2,pos.z+0.2);
    m.scale.setScalar(0.05);
    scene.add(m);
    addTransientEffect({mesh:m,life:0.6,maxLife:0.6,kind:'spark',pooled:true,vel:new THREE.Vector3(0,0.4,0.1),size:0.05,gravity:-0.05},'P3');
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
    addTransientEffect({mesh:m,life:0.6,maxLife:0.6,kind:'spark',pooled:true,vel:new THREE.Vector3(Math.cos(angle)*0.8,0.5,Math.sin(angle)*0.8),size:0.06,gravity:0.3},'P3');
  }
}
function spawnLevelUpEffect(pos){
  if(!pos)return;
  playSFX('sfx_levelup');
  for(let i=0;i<10;i++){
    const m=takeSpark(0xfde047);
    m.position.set(pos.x+(Math.random()-0.5)*0.3,pos.y+0.1,pos.z+(Math.random()-0.5)*0.3);
    m.scale.setScalar(0.05);
    scene.add(m);
    addTransientEffect({mesh:m,life:0.5,maxLife:0.5,kind:'spark',pooled:true,vel:new THREE.Vector3(0,1.5+Math.random()*0.5,0),size:0.05,gravity:-0.2},'P2');
  }
  spawnRingPulse(pos.clone(),0xfde047,{scale:0.7,life:0.3,y:0.08,priority:'P2'});
}
function spawnBondUpEffect(pos){
  if(!pos)return;
  for(let i=0;i<5;i++){
    const m=takeSpark(0xec4899);
    m.position.set(pos.x+(Math.random()-0.5)*0.4,pos.y+0.8,pos.z+(Math.random()-0.5)*0.4);
    m.scale.setScalar(0.06);
    scene.add(m);
    addTransientEffect({mesh:m,life:0.5,maxLife:0.5,kind:'spark',pooled:true,vel:new THREE.Vector3((Math.random()-0.5)*0.2,0.8,0),size:0.06,gravity:-0.1},'P3');
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
    addTransientEffect({mesh:m,life:0.6,maxLife:0.6,kind:'spark',pooled:true,vel:new THREE.Vector3(Math.cos(angle)*1.2,0.5+Math.random()*0.5,Math.sin(angle)*1.2),size:0.07,gravity:0.4},'P2');
  }
  spawnRingPulse(pos.clone().add(new THREE.Vector3(0,0.8,0)),0xfde047,{scale:0.6,life:0.3,y:0,priority:'P2'});
}
function spawnConditionBadEffect(pos){
  if(!pos)return;
  for(let i=0;i<6;i++){
    const m=takeSpark(0x64748b,0.1);
    m.position.set(pos.x+(Math.random()-0.5)*0.5,pos.y+0.5+Math.random()*0.5,pos.z+(Math.random()-0.5)*0.5);
    m.scale.setScalar(0.08);
    scene.add(m);
    addTransientEffect({mesh:m,life:0.3,maxLife:0.3,kind:'spark',pooled:true,vel:new THREE.Vector3(0,0.2,0),size:0.08,gravity:-0.05},'P3');
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
function updateEffects(dt){ for(let i=effects.length-1;i>=0;i--){ const e=effects[i]; e.life-=dt; const t=Math.max(0,e.life/e.maxLife); if(e.kind==='spark'){ e.vel.y-=(e.gravity||0)*dt; updateSparkType(e,dt,t); e.mesh.position.addScaledVector(e.vel,dt); e.mesh.scale.setScalar(e.size*(.5+t)); const fade=easeOut(t); e.mesh.material.opacity=Math.max(0,fade*.9); if(e.mesh.material.emissiveIntensity!=null){ if(e.emi==null)e.emi=e.mesh.material.emissiveIntensity; e.mesh.material.emissiveIntensity=e.emi*fade; } } else if(e.kind==='ring'){ e.mesh.scale.multiplyScalar(1+dt*2.8); e.mesh.material.opacity=Math.max(0,easeOut(t)*.9); } else if(e.kind==='evolution-aura'){ const u=1-t; const fade=u<.35?u/.35:(u>.7?(1-u)/.3:1); e.mesh.material.opacity=Math.max(0,fade*.55); e.mesh.rotation.y+=dt*1.8; } else if(e.kind==='area-wave'){ const u=1-t; const scale=0.5+u*(e.expandTo||3); e.mesh.scale.set(scale,1,scale); e.mesh.material.opacity=Math.max(0,t*0.8); } else if(e.kind==='shield-aura'){ const u=1-t; const fade=u<.15?u/.15:(u>.85?(1-u)/.15:1); e.mesh.material.opacity=Math.max(0,fade*0.35); e.mesh.rotation.y+=dt*0.8; } else if(e.kind==='buff-aura'){ const u=1-t; const fade=u<.15?u/.15:(u>.85?(1-u)/.15:1); e.mesh.material.opacity=Math.max(0,fade*0.4); e.mesh.rotation.y+=dt*1.2; e.mesh.scale.setScalar(1+Math.sin(u*Math.PI*4)*0.05); } else if(e.kind==='skill-sprite'){ const fade=easeOut(t); e.mesh.material.opacity=Math.max(0,fade*0.9); e.mesh.scale.setScalar(e.size*(1+(1-t)*0.5)); e.mesh.material.rotation+=dt*1.5; } if(e.life<=0){ releaseTransientEffect(e); effects.splice(i,1);} } }

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
  const priority=mode==='trail'?'P4':mode==='aura'?'P2':'P1';
  const count=fxParticleCount(mode,power,cfg.intensity);
  const c=cfg.core,a=cfg.accent;
  if(mode!=='trail') spawnRingPulse(base.clone(),c,{scale:(mode==='summon'?0.68:0.48)*Math.max(0.9,power),life:mode==='aura'?0.45:0.24,y:0.08,priority});
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
    addTransientEffect({mesh,vel,life:mode==='trail'?0.12:(mode==='summon'?0.36:0.24),maxLife:mode==='trail'?0.12:(mode==='summon'?0.36:0.24),kind:'spark',gravity:(cfg.shape==='mist'||cfg.shape==='halo')?0:0.8,size:pSize,typeCfg:cfg},priority);
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
function renderCombatStatusList(node,statusState,{limit=5}={}){
  if(!node)return;
  const descriptors=combatStatusDescriptors(statusState);
  const visible=descriptors.slice(0,limit);
  const key=visible.map(status=>`${status.statusId}:${status.stacks}:${status.remainingText}`).join('|')+`|+${Math.max(0,descriptors.length-limit)}`;
  setClassTokenIfChanged(node,'hidden',descriptors.length===0);
  if(node.dataset.statusKey===key)return;
  node.replaceChildren();
  for(const status of visible){
    const chip=document.createElement('span');
    chip.className=`combat-status-chip ${status.polarity==='Positive'?'positive':'negative'}`;
    chip.title=`${status.nameTH} (${status.nameEN}) • ${status.remainingText} วินาที${status.stacks>1?` • ${status.stacks} ชั้น`:''}`;
    chip.setAttribute('aria-label',chip.title);
    const stack=status.stacks>1?`×${status.stacks}`:'';
    chip.textContent=`${status.glyph}${stack} ${status.nameTH} ${status.remainingText}s`;
    node.appendChild(chip);
  }
  if(descriptors.length>limit){
    const overflow=document.createElement('span');overflow.className='combat-status-chip overflow';overflow.textContent=`+${descriptors.length-limit}`;node.appendChild(overflow);
  }
  node.dataset.statusKey=key;
}
const skillIconCache=new Map();
function skillIconKind(skill){
  const contract=skillButtonIconContract(skill?.skillId);
  if(contract)return contract.mainKind;
  if(!skill||typeof skill==='string')return skill?'enemy':'empty';
  if(skill.targetType==='area'||skill.targetType==='EnemyArea'||skill.targetType==='GroundPoint')return 'area';
  if(skill.targetType==='self'||skill.targetType==='Self'){
    if(skill.effect==='heal')return 'heal';
    if(skill.effect==='shield')return 'shield';
    return 'buff';
  }
  return 'enemy';
}
function drawSkillIconText(ctx,text,x,y,size,align='center'){
  if(!text)return;
  ctx.save();ctx.shadowBlur=3;ctx.lineWidth=2;ctx.textAlign=align;ctx.textBaseline='middle';ctx.font=`900 ${size}px system-ui,"Noto Color Emoji",sans-serif`;ctx.strokeStyle='rgba(0,0,0,.78)';ctx.fillStyle='#fff';ctx.strokeText(text,x,y);ctx.fillText(text,x,y);ctx.restore();
}
function drawAreaSkillIcon(ctx,profile){
  ctx.beginPath();ctx.arc(0,0,21,0,Math.PI*2);ctx.lineWidth=3;ctx.stroke();
  ctx.beginPath();ctx.arc(0,0,15,0,Math.PI*2);ctx.setLineDash([3,4]);ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);
  if(!profile){ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.stroke();return;}
  drawSkillIconText(ctx,profile.familyGlyph,0,1,22);
  for(let i=0;i<3;i++){const angle=-Math.PI/2+i*Math.PI*2/3;drawSkillIconText(ctx,profile.particleGlyph,Math.cos(angle)*18,Math.sin(angle)*18,8);}
}
function drawSkillSemanticLayers(ctx,contract){
  if(!contract)return;
  drawSkillIconText(ctx,contract.typeSymbol,-25,-23,10,'left');
  drawSkillIconText(ctx,contract.categoryMarker,25,-23,10,'right');
  drawSkillIconText(ctx,contract.effectOverlay,-25,24,9,'left');
  if(contract.canCrit)drawSkillIconText(ctx,contract.critMarker||'✹',25,24,8,'right');
}
function getSkillIcon(skill){
  const kind=skillIconKind(skill);
  const contract=skillButtonIconContract(skill?.skillId),areaProfile=enemyAreaIconProfile(skill?.skillId);
  const cacheKey=areaProfile?.compositeCacheKey||contract?.cacheKey||kind;
  if(skillIconCache.has(cacheKey))return skillIconCache.get(cacheKey);
  const c=document.createElement('canvas');c.width=64;c.height=64;
  const ctx=c.getContext('2d');
  ctx.translate(32,32);
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.shadowColor='rgba(0,0,0,0.72)';ctx.shadowBlur=5;ctx.shadowOffsetY=1;
  ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineWidth=4;
  switch(kind){
    case'enemy':
      ctx.beginPath();ctx.moveTo(-18,14);ctx.lineTo(10,-14);ctx.stroke();
      ctx.beginPath();ctx.moveTo(2,-16);ctx.lineTo(16,-18);ctx.lineTo(14,-4);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.moveTo(-16,4);ctx.lineTo(-8,-4);ctx.moveTo(-8,12);ctx.lineTo(0,4);ctx.lineWidth=3;ctx.stroke();
      break;
    case'area':
      drawAreaSkillIcon(ctx,areaProfile);
      break;
    case'groundpoint':
      ctx.beginPath();ctx.arc(0,-3,18,0,Math.PI*2);ctx.lineWidth=3;ctx.stroke();
      ctx.beginPath();ctx.moveTo(-25,-3);ctx.lineTo(-11,-3);ctx.moveTo(11,-3);ctx.lineTo(25,-3);ctx.moveTo(0,-28);ctx.lineTo(0,-14);ctx.moveTo(0,8);ctx.lineTo(0,22);ctx.stroke();
      ctx.strokeRect(-9,13,18,10);
      break;
    case'heal':
      ctx.beginPath();ctx.moveTo(0,-16);ctx.lineTo(0,16);ctx.moveTo(-16,0);ctx.lineTo(16,0);ctx.lineWidth=7;ctx.stroke();
      break;
    case'shield':
      ctx.beginPath();ctx.moveTo(0,-20);ctx.lineTo(16,-10);ctx.lineTo(14,8);ctx.quadraticCurveTo(0,22,-14,8);ctx.lineTo(-16,-10);ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(0,10);ctx.lineWidth=3;ctx.stroke();
      break;
    case'buff':
      ctx.beginPath();ctx.moveTo(-14,10);ctx.lineTo(0,-4);ctx.lineTo(14,10);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-14,-2);ctx.lineTo(0,-16);ctx.lineTo(14,-2);ctx.stroke();
      break;
    default:
      ctx.setLineDash([5,5]);ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  }
  drawSkillSemanticLayers(ctx,contract);
  const url=c.toDataURL();
  skillIconCache.set(cacheKey,url);
  return url;
}
function applyButtonIcon(btn,url,size='70%'){
  if(!btn||!url)return;
  const img=`url("${url}")`;
  if(btn.style.getPropertyValue('background-image')!==img){
    btn.style.setProperty('background-image',img,'important');
    btn.style.setProperty('background-size',size,'important');
    btn.style.setProperty('background-repeat','no-repeat','important');
    btn.style.setProperty('background-position','center','important');
  }
}
const actionIconCache=new Map();
function getActionIcon(actionId){
  if(actionIconCache.has(actionId))return actionIconCache.get(actionId);
  const c=document.createElement('canvas');c.width=64;c.height=64;
  const ctx=c.getContext('2d');
  ctx.translate(32,32);ctx.lineWidth=3;ctx.lineCap='round';
  switch(actionId){
    case'capture':
      ctx.strokeStyle='#43a5ff';ctx.fillStyle='rgba(67,165,255,0.3)';
      ctx.beginPath();ctx.arc(0,0,22,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.arc(0,0,22,Math.PI*1.1,Math.PI*1.9);ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.stroke();
      ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
      break;
    case'summon':
      ctx.strokeStyle='#fbbf24';ctx.fillStyle='rgba(251,191,36,0.2)';
      ctx.beginPath();ctx.moveTo(-12,20);ctx.lineTo(-12,-8);ctx.quadraticCurveTo(0,-22,12,-8);ctx.lineTo(12,20);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,-22);ctx.lineTo(0,20);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
      for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(-12+i*5,10);ctx.lineTo(-12+i*5,20);ctx.strokeStyle='#fbbf24';ctx.lineWidth=2;ctx.stroke();}
      break;
    case'recall':
      ctx.strokeStyle='#ff5a98';ctx.lineWidth=4;
      ctx.beginPath();ctx.arc(0,0,18,-Math.PI*0.3,Math.PI*1.3);ctx.stroke();
      ctx.beginPath();ctx.moveTo(Math.cos(Math.PI*1.3)*18,Math.sin(Math.PI*1.3)*18);ctx.lineTo(Math.cos(Math.PI*1.3)*12,Math.sin(Math.PI*1.3)*18+6);ctx.lineTo(Math.cos(Math.PI*1.3)*18+6,Math.sin(Math.PI*1.3)*12);ctx.closePath();ctx.fillStyle='#ff5a98';ctx.fill();
      break;
    default:ctx.beginPath();ctx.arc(0,0,18,0,Math.PI*2);ctx.stroke();
  }
  const url=c.toDataURL();
  actionIconCache.set(actionId,url);
  return url;
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
  mesh.userData.monActionDuration=0.22;
}
function triggerMonsterAction(mesh,action='attack',duration=0.22){ if(!mesh?.userData) return; const safeDuration=Number.isFinite(duration)&&duration>0?duration:0.22;mesh.userData.monAction=action;mesh.userData.monActionTimer=safeDuration;mesh.userData.monActionDuration=safeDuration; }
function animateMonster(mesh,dt,moving=false){
  if(!mesh?.userData?.baseScale) return;
  const u=mesh.userData,pType=typeFx(u.monsterType||'Normal'),p=(u.monPhase=(u.monPhase||0)+dt*(moving?5.2:2.2)*pType.speed),s=u.baseScale;
  if(u.monActionTimer>0) u.monActionTimer=Math.max(0,u.monActionTimer-dt); else u.monAction='idle';
  let sx=1,sy=1,sz=1,rx=0,rz=0;
  const pulse=Math.sin(p), pulse2=Math.cos(p*0.7), actionDuration=Number.isFinite(u.monActionDuration)&&u.monActionDuration>0?u.monActionDuration:0.22,actionBoost=u.monActionTimer>0?Math.sin((1-u.monActionTimer/actionDuration)*Math.PI):0;
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
let characterPreviewRenderer=null;
let characterPreviewScene=null;
let characterPreviewCamera=null;
let characterPreviewMesh=null;
let characterPreviewId=null;
let characterPreviewZoom=4.2;
let characterPreviewDrag=null;
let characterPreviewSize={width:0,height:0};
function initCharacterPreview3D(){
  const canvas=el('characterPreviewCanvas');
  if(!canvas||typeof THREE==='undefined')return;
  try{
    characterPreviewRenderer=new THREE.WebGLRenderer({canvas,antialias:qualityProfile.antialias,alpha:true,powerPreference:'low-power'});
    characterPreviewRenderer.setPixelRatio(Math.min(devicePixelRatio||1,qualityProfile.maxDpr));
    characterPreviewRenderer.setClearColor(0x000000,0);
    characterPreviewScene=new THREE.Scene();
    characterPreviewCamera=new THREE.PerspectiveCamera(28,1,.1,30);
    characterPreviewCamera.position.set(0,1.05,characterPreviewZoom);
    const hemi=new THREE.HemisphereLight(0xffffff,0x172554,1.8);
    const key=new THREE.DirectionalLight(0xffffff,2.2); key.position.set(2,4,3);
    characterPreviewScene.add(hemi,key);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.72,.018,6,32),new THREE.MeshBasicMaterial({color:0x7dd3fc,transparent:true,opacity:.8}));
    ring.rotation.x=Math.PI/2; ring.position.y=.04; ring.name='characterPreviewRing';
    characterPreviewScene.add(ring);
    canvas.parentElement?.classList.add('has-3d');
    canvas.addEventListener('pointerdown',event=>{
      characterPreviewDrag={x:event.clientX,rotation:characterPreviewMesh?.rotation.y||0};
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener('pointermove',event=>{
      if(!characterPreviewDrag||!characterPreviewMesh)return;
      characterPreviewMesh.rotation.y=characterPreviewDrag.rotation+(event.clientX-characterPreviewDrag.x)*.012;
    });
    const stopDrag=()=>{characterPreviewDrag=null;};
    canvas.addEventListener('pointerup',stopDrag); canvas.addEventListener('pointercancel',stopDrag);
    canvas.addEventListener('wheel',event=>{
      event.preventDefault();
      characterPreviewZoom=THREE.MathUtils.clamp(characterPreviewZoom+event.deltaY*.002,2.8,6);
    },{passive:false});
  }catch(error){
    characterPreviewRenderer=null; characterPreviewScene=null; characterPreviewCamera=null;
    console.warn('3D character preview unavailable; using portrait fallback',error);
  }
}
function updateCharacterPreview(dt){
  if(!characterPreviewRenderer||!characterPreviewScene||!characterPreviewCamera)return;
  const canvas=el('characterPreviewCanvas');
  if(!canvas)return;
  const rect=canvas.getBoundingClientRect(),width=Math.floor(rect.width),height=Math.floor(rect.height);
  if(width<2||height<2)return;
  if(characterPreviewSize.width!==width||characterPreviewSize.height!==height){characterPreviewRenderer.setSize(Math.max(2,width),Math.max(2,height),false);characterPreviewSize={width,height};}
  characterPreviewCamera.aspect=rect.width/Math.max(1,rect.height); characterPreviewCamera.position.z+=(characterPreviewZoom-characterPreviewCamera.position.z)*Math.min(1,dt*8); characterPreviewCamera.lookAt(0,.78,0);
  const ring=characterPreviewScene.getObjectByName('characterPreviewRing'); if(ring)ring.rotation.z+=dt*.35;
  if(characterPreviewMesh){animateMonster(characterPreviewMesh,dt,false); if(!characterPreviewDrag)characterPreviewMesh.rotation.y+=dt*.22;}
  try{characterPreviewRenderer.render(characterPreviewScene,characterPreviewCamera);}catch(error){console.warn('3D character preview render failed',error);characterPreviewRenderer=null;}
}
let ranchClubPreviewRenderer=null;
let ranchClubPreviewScene=null;
let ranchClubPreviewCamera=null;
let ranchClubPreviewMesh=null;
let ranchClubPreviewId=null;
let ranchClubPreviewZoom=4.2;
let ranchClubPreviewDrag=null;
let ranchClubPreviewSize={width:0,height:0};
function initRanchClubPreview3D(){
  const canvas=el('ranchClubPreviewCanvas');
  if(!canvas||typeof THREE==='undefined')return;
  try{
    ranchClubPreviewRenderer=new THREE.WebGLRenderer({canvas,antialias:qualityProfile.antialias,alpha:true,powerPreference:'low-power'});
    ranchClubPreviewRenderer.setPixelRatio(Math.min(devicePixelRatio||1,qualityProfile.maxDpr));
    ranchClubPreviewRenderer.setClearColor(0x000000,0);
    ranchClubPreviewScene=new THREE.Scene();
    ranchClubPreviewCamera=new THREE.PerspectiveCamera(28,1,.1,30);
    ranchClubPreviewCamera.position.set(0,1.05,ranchClubPreviewZoom);
    const hemi=new THREE.HemisphereLight(0xffffff,0x14532d,1.8);
    const key=new THREE.DirectionalLight(0xfff7ed,2.2); key.position.set(2,4,3);
    ranchClubPreviewScene.add(hemi,key);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.72,.018,6,32),new THREE.MeshBasicMaterial({color:0xfacc15,transparent:true,opacity:.85}));
    ring.rotation.x=Math.PI/2; ring.position.y=.04; ring.name='ranchClubPreviewRing';
    ranchClubPreviewScene.add(ring);
    canvas.parentElement?.classList.add('has-3d');
    canvas.addEventListener('pointerdown',event=>{
      ranchClubPreviewDrag={x:event.clientX,rotation:ranchClubPreviewMesh?.rotation.y||0};
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener('pointermove',event=>{
      if(!ranchClubPreviewDrag||!ranchClubPreviewMesh)return;
      ranchClubPreviewMesh.rotation.y=ranchClubPreviewDrag.rotation+(event.clientX-ranchClubPreviewDrag.x)*.012;
    });
    const stopDrag=()=>{ranchClubPreviewDrag=null;};
    canvas.addEventListener('pointerup',stopDrag); canvas.addEventListener('pointercancel',stopDrag);
    canvas.addEventListener('wheel',event=>{
      event.preventDefault();
      ranchClubPreviewZoom=THREE.MathUtils.clamp(ranchClubPreviewZoom+event.deltaY*.002,2.8,6);
    },{passive:false});
  }catch(error){
    ranchClubPreviewRenderer=null; ranchClubPreviewScene=null; ranchClubPreviewCamera=null;
    console.warn('3D ranch club preview unavailable; using portrait fallback',error);
  }
}
function updateRanchClubPreview(dt){
  if(!ranchClubPreviewRenderer||!ranchClubPreviewScene||!ranchClubPreviewCamera)return;
  const page=el('ranchStoragePage'),canvas=el('ranchClubPreviewCanvas');
  if(!page||!canvas||page.classList.contains('hidden'))return;
  const rect=canvas.getBoundingClientRect(),width=Math.floor(rect.width),height=Math.floor(rect.height);
  if(width<2||height<2)return;
  if(ranchClubPreviewSize.width!==width||ranchClubPreviewSize.height!==height){ranchClubPreviewRenderer.setSize(Math.max(2,width),Math.max(2,height),false);ranchClubPreviewSize={width,height};}
  ranchClubPreviewCamera.aspect=rect.width/Math.max(1,rect.height); ranchClubPreviewCamera.position.z+=(ranchClubPreviewZoom-ranchClubPreviewCamera.position.z)*Math.min(1,dt*8); ranchClubPreviewCamera.lookAt(0,.78,0);
  const ring=ranchClubPreviewScene.getObjectByName('ranchClubPreviewRing'); if(ring)ring.rotation.z+=dt*.35;
  if(ranchClubPreviewMesh){animateMonster(ranchClubPreviewMesh,dt,false); if(!ranchClubPreviewDrag)ranchClubPreviewMesh.rotation.y+=dt*.22;}
  try{ranchClubPreviewRenderer.render(ranchClubPreviewScene,ranchClubPreviewCamera);}catch(error){console.warn('3D ranch club preview render failed',error);ranchClubPreviewRenderer=null;}
}
function monsterLookYaw(dir,mesh){ return Math.atan2(dir.x,dir.z) + (mesh?.userData?.faceOffset??Math.PI); }

// ---------- V7.0 Combat feedback: floating damage, camera shake, elemental ground decals ----------
const floatingTexts=[];
const groundDecals=[];
const floatingTextProjectionScratch={world:new THREE.Vector3(),screen:{x:-9999,y:-9999,visible:false,z:2}};
function addFloatingText(entry){
  if(!entry?.el)return false;
  if(floatingTexts.length>=VFX_LIMITS.maxFloatingTexts)floatingTexts.shift()?.el?.remove();
  floatingTexts.push(entry);
  return true;
}
function addGroundDecal(entry){
  if(!entry?.group)return false;
  if(groundDecals.length>=VFX_LIMITS.maxGroundDecals){const oldest=groundDecals.shift();if(oldest?.group)removeAndDispose(scene,oldest.group);}
  groundDecals.push(entry);
  return true;
}
const cameraShake={time:0,duration:0,mag:0,phase:0};
function triggerCameraShake(mag=0.08,duration=0.14){
  cameraShake.time=Math.max(cameraShake.time,duration);
  cameraShake.duration=Math.max(cameraShake.duration,duration);
  cameraShake.mag=Math.max(cameraShake.mag,mag);
}
function spawnDamageNumber(amount,pos,{type='Normal',eff=1,healing=false,label='',miss=false}={}){
  const layer=el('floatingTextLayer'); if(!layer)return;
  const d=document.createElement('div');
  const strong=eff>=2;
  d.className='damage-pop'+(strong?' super':'')+(healing?' heal':'')+(miss?' miss':'');
  d.style.setProperty('--dmg-color',healing?'#86efac':(TYPE_COLOR[type]||'#fff'));
  const sign=healing?'+':'-';
  const effectLabelText=label||(eff>=4?'VERY EFFECTIVE':eff>1?'SUPER':eff===0?'IMMUNE':eff<1?'RESIST':'');
  d.innerHTML=miss?'<b>MISS</b>':`<b>${sign}${Math.round(amount)}</b>${effectLabelText?`<small>${effectLabelText}</small>`:''}`;
  layer.appendChild(d);
  addFloatingText({el:d,pos:safeVec3(pos),life:0.9,maxLife:0.9,rise:0,drift:(Math.random()-.5)*24});
}
function updateFloatingTexts(dt){
  for(let i=floatingTexts.length-1;i>=0;i--){
    const f=floatingTexts[i]; f.life-=dt; f.rise+=dt*1.1;
    const p=floatingTextProjectionScratch.world.copy(f.pos);p.y+=f.rise;
    const s=worldToScreen(p,floatingTextProjectionScratch.screen,p),t=Math.max(0,f.life/f.maxLife);
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
  addGroundDecal({group,disc,ring,inner,life:duration,maxLife:duration,type,spin:(Math.random()<.5?-1:1)*(.3+Math.random()*.25)});
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
const state={collection:[],party:[null,null,null],storage:[],ranchActive:[],selectedSlot:0,exp:0,lifeLastAt:Date.now(),wallet:{gold:300},inventory:{...DEFAULT_INVENTORY,stash:[...DEFAULT_INVENTORY.stash]},merchantPurchaseCommandIds:[],merchantPurchaseHistory:[],eggs:[],breedingSkillMemoryRequestByEggId:{},breeding:{parentA:null,parentB:null},skillItemUseCommandIds:[],evolutionCandidate:null,crCandidate:null,trainingSelectedId:null,skillsSelectedId:null,equipSelectedId:null,currentZone:'hub',starterJourney:{version:1,grassMeadow:{entered:false,battled:false,recalled:false,captured:false}},rareCollection:{found:{},captured:{}},eliteProgress:{found:{},defeated:{},captured:{}},bossProgress:{found:{},defeated:{}},stageProgress:createStageProgress(),saveVersion:SAVE_SCHEMA_VERSION};
let updateRemoteWorldMarkers=()=>{};
if(!pirateThrowWorld){
window.POCKETMONSTER_WORLD_STATE=()=>({zone:LIVE_PRESENCE_ZONE,x:player.position.x,z:player.position.z,dir:player.rotation.y});
const remoteWorldPlayers=new Map();
const remoteWorldLayer=document.createElement('div');
remoteWorldLayer.id='remoteWorldPlayers';
Object.assign(remoteWorldLayer.style,{position:'fixed',inset:'0',zIndex:'14000',pointerEvents:'none'});
document.body.append(remoteWorldLayer);
window.POCKETMONSTER_WORLD_PRESENCE=payload=>{
  if(!payload||payload.zone!==LIVE_PRESENCE_ZONE)return;
  const seen=new Set();
  for(const item of payload.players||[]){
    if(!item?.id||!Number.isFinite(item.x)||!Number.isFinite(item.z))continue;
    seen.add(item.id); let marker=remoteWorldPlayers.get(item.id);
    if(!marker){marker=document.createElement('div');marker.className='remote-world-player';Object.assign(marker.style,{position:'absolute',transform:'translate(-50%,-100%)',padding:'3px 7px',border:'1px solid #67e8f9',borderRadius:'999px',background:'#082f49e8',color:'#e0f2fe',font:'700 11px system-ui',whiteSpace:'nowrap',textShadow:'0 1px 2px #000'});remoteWorldLayer.append(marker);remoteWorldPlayers.set(item.id,marker);}
    marker.textContent=item.name||'ผู้เล่นออนไลน์'; marker.dataset.x=item.x; marker.dataset.z=item.z;
  }
  for(const [id,marker] of remoteWorldPlayers){if(!seen.has(id)){marker.remove();remoteWorldPlayers.delete(id);}}
};
updateRemoteWorldMarkers=()=>{for(const marker of remoteWorldPlayers.values()){const x=Number(marker.dataset.x),z=Number(marker.dataset.z);const point=new THREE.Vector3(x,1.8,z).project(camera);const visible=point.z>-1&&point.z<1&&point.x>=-1.1&&point.x<=1.1&&point.y>=-1.1&&point.y<=1.1;marker.hidden=!visible;if(visible){marker.style.left=((point.x+1)*50)+'%';marker.style.top=((1-point.y)*50)+'%';}}};
}
attachCharacterUi(state);
let characterUI=null;
let currentManagerTab='collection';
let pendingSkillItemUse=null;
let skillItemCommandSequence=0;
function starterJourneyDefaults(){return{version:1,grassMeadow:{entered:false,battled:false,recalled:false,captured:false}};}
function markRareDiscovery(w,kind='found'){
  if(!w?.rare)return;
  state.rareCollection=state.rareCollection||{found:{},captured:{}};
  const bucket=state.rareCollection[kind]||(state.rareCollection[kind]={});
  const key=`${w.zone}:${w.speciesId}`;
  if(bucket[key])return;
  bucket[key]={count:1,firstAt:Date.now()};
  try{saveGame(false);}catch{}
}
function markEliteProgress(w,kind='found'){
  if(!w?.elite)return;
  state.eliteProgress=state.eliteProgress||{found:{},defeated:{},captured:{}};
  const bucket=state.eliteProgress[kind]||(state.eliteProgress[kind]={});
  const key=`${w.zone}:${w.speciesId}`;
  if(bucket[key])return;
  bucket[key]={count:1,firstAt:Date.now()};
  try{saveGame(false);}catch{}
}
function markBossProgress(w,kind='found',persist=true){
  if(!w?.boss)return;
  state.bossProgress=state.bossProgress||{found:{},defeated:{}};
  const bucket=state.bossProgress[kind]||(state.bossProgress[kind]={});
  const key=`${w.zone}:${w.speciesId}`;
  if(bucket[key])return;
  bucket[key]={count:1,firstAt:Date.now()};
  if(persist)try{saveGame(false);}catch{}
}
function markStarterJourney(step){
  if(state.currentZone!=='grass-meadow')return;
  const journey=state.starterJourney||starterJourneyDefaults();
  journey.grassMeadow=journey.grassMeadow||starterJourneyDefaults().grassMeadow;
  if(step in journey.grassMeadow&&!journey.grassMeadow[step]){journey.grassMeadow[step]=true;state.starterJourney=journey;runBestEffortCombatPresentation(()=>renderStarterJourney());try{saveGame(false);}catch{}}
}
function currentStageObjective(zoneId=state.currentZone){
  return resolveStageObjective({
    zoneId,
    zone:ZONES[zoneId],
    stageProgress:state.stageProgress,
    starterJourney:state.starterJourney,
    eliteProgress:state.eliteProgress,
    bossProgress:state.bossProgress,
  });
}
function stageObjectiveText(objective,zoneId=state.currentZone){
  const stageName=STAGE_BY_ID[zoneId]?.displayName||ZONES[zoneId]?.label||zoneId;
  const monsterName=objective.speciesId?(spById[objective.speciesId]?.displayName||spById[objective.speciesId]?.name||objective.speciesId):'';
  if(objective.phase==='capture-starter')return '1/3 จับมอนสเตอร์ 1 ตัว • Recall คู่หูก่อนใช้ Capture Ball';
  if(objective.phase==='defeat-elite'){
    const step=zoneId==='grass-meadow'?'2/3':'1/2';
    return `${step} ปราบ ELITE ${monsterName} ที่ปรากฏในด่าน`;
  }
  if(objective.phase==='defeat-boss'){
    const step=zoneId==='grass-meadow'?'3/3':'2/2';
    return `${step} ปราบ BOSS ${monsterName} • เลือกเข้าสู้เมื่อพร้อม`;
  }
  if(objective.phase==='stage-clear-pending')return `กำลังบันทึกผลการเคลียร์ ${stageName}`;
  if(objective.phase==='stage-cleared')return `✓ เคลียร์ ${stageName} แล้ว • จุดวาปด่านถัดไปเปิดแล้ว`;
  return 'สำรวจพื้นที่และเตรียมทีมสำหรับด่านถัดไป';
}
function renderStarterJourney(){
  const panel=el('stageObjective'),stepEl=el('stageObjectiveStep'),listEl=el('stageObjectiveList'),titleEl=el('stageObjectiveTitle');
  if(!panel||!stepEl)return;
  if(!STAGE_BY_ID[state.currentZone]){
    panel.classList.remove('hidden');
    if(stepEl)setTextIfChanged(stepEl,'เดินไปที่ประตูวาปเพื่อเข้าสู่ Grass Meadow และเริ่มเควส');
    if(titleEl)setTextIfChanged(titleEl,'เริ่มการผจญภัย');
    if(listEl){
      const item=document.createElement('li');
      item.className='quest-step current';
      const mark=document.createElement('i'); mark.setAttribute('aria-hidden','true');
      const text=document.createElement('span'); text.textContent='1/3 ไป Grass Meadow';
      item.append(mark,text); listEl.replaceChildren(item);
    }
    return;
  }
  const objective=currentStageObjective();
  const zoneId=state.currentZone;
  const stageName=STAGE_BY_ID[zoneId]?.displayName||ZONES[zoneId]?.label||zoneId;
  const speciesId=objective.speciesId||ZONES[zoneId]?.progressionBossSpeciesId;
  const monsterName=speciesId?(spById[speciesId]?.displayName||spById[speciesId]?.name||speciesId):'';
  const tracker=stageObjectiveTracker(objective,{stageId:zoneId,stageName,monsterName});
  panel.classList.remove('hidden');
  setTextIfChanged(stepEl,stageObjectiveText(objective));
  if(titleEl)setTextIfChanged(titleEl,tracker.title);
  if(!listEl)return;
  listEl.replaceChildren(...tracker.steps.map(step=>{
    const item=document.createElement('li');
    item.className=`quest-step ${step.state}`;
    const mark=document.createElement('i');
    mark.setAttribute('aria-hidden','true');
    const text=document.createElement('span');
    text.textContent=`${step.mark} ${step.label}`;
    item.append(mark,text);
    return item;
  }));
  if(tracker.status){
    const status=document.createElement('li');
    status.className='quest-step status';
    status.textContent=tracker.status;
    listEl.append(status);
  }
}
function getInst(id){return state.collection.find(m=>m.instanceId===id)||null;}
function selectedInstance(){return getInst(state.party[state.selectedSlot]);}
function distXZ(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
function hpPct(v){return Math.max(0,Math.min(1,v));}
function msg(t){el('message').textContent=t;}
function setManagerTab(tab='collection'){
  if(tab==='breeding'&&!(isNearNpc()||isNearBreeding())){
    msg(FULL_MANAGER_NPC_REASON);
    return;
  }
  if(['skills','equipment'].includes(tab)&&characterUI?.snapshot().characterPanel==='full'){
    currentManagerTab='collection';
    document.querySelectorAll('.manager-tab').forEach(b=>b.classList.toggle('active',b.dataset.managerTab==='collection'));
    document.querySelectorAll('[data-tab-pane]').forEach(p=>p.classList.toggle('active',p.dataset.tabPane==='collection'));
    setFullCharacterInfoTab(tab);
    return;
  }
  currentManagerTab=tab;
  characterUI?.setTab(tab);
  playSFX('sfx_ui_tab');
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
  if(select)select.onchange=()=>{
    state[stateKey]=select.value;
    characterUI?.focusMonster(select.value);
    renderFn();
    renderParty();
    renderCharacterAccess();
  };
}
function liveCharacterTabPanel(tab){
  if(!characterUI)return null;
  const snap=characterUI.snapshot();
  if(snap.characterPanel==='tab'&&snap.characterTab===tab)return el('characterQuickTabBody');
  return null;
}
function liveFullCharacterTabPanel(tab){
  const manager=el('monsterManager');
  const collectionPane=manager?.querySelector('[data-tab-pane="collection"]');
  const snap=characterUI?.snapshot?.();
  if(!manager||manager.classList.contains('hidden')||!collectionPane?.classList.contains('active'))return null;
  const activeTab=snap?.characterTab==='collection'||!snap?.characterTab?'info':snap.characterTab;
  return activeTab===tab?el('characterInfoBody'):null;
}
function characterSystemPanel(tab,fallbackId){
  return liveCharacterTabPanel(tab)||liveFullCharacterTabPanel(tab)||el(fallbackId);
}
function syncFullCharacterInfoTabA11y(tab){
  const body=el('characterInfoBody');
  let activeTabId='';
  document.querySelectorAll('.character-info-tabs .character-info-tab').forEach(btn=>{
    const key=btn.dataset.characterTab;
    const selected=key===tab;
    const tabId=`characterInfoTab-${key}`;
    if(btn.id!==tabId)btn.id=tabId;
    btn.setAttribute('role','tab');
    btn.setAttribute('aria-controls','characterInfoBody');
    btn.setAttribute('aria-selected',String(selected));
    btn.tabIndex=selected?0:-1;
    btn.classList.toggle('active',selected);
    if(selected)activeTabId=tabId;
  });
  if(body){
    body.setAttribute('role','tabpanel');
    body.setAttribute('aria-labelledby',activeTabId);
    body.tabIndex=0;
  }
}
function setFullCharacterInfoTab(tab){
  if(!['info','skills','equipment','training','evolution'].includes(tab))return;
  characterUI?.setTab(tab);
  syncFullCharacterInfoTabA11y(tab);
  if(tab==='info')renderFullCharacterStatus();
  if(tab==='skills')renderSkills(el('characterInfoBody'));
  if(tab==='equipment')renderEquipment(el('characterInfoBody'));
  if(tab==='training')renderTraining(el('characterInfoBody'));
  if(tab==='evolution')renderEvolution(el('characterInfoBody'));
}
function renderFocusedGrowthSummary(){
  const presentation=focusedCharacterPresentation();
  const inst=presentation.id?getInst(presentation.id):null;
  if(!inst)return '<div class="manager-empty">เลือกมอนเพื่อดู Growth</div>';
  const used=instTrainingUsed(inst);
  const cap=BALANCE_CONFIG.training.capacity.base+BALANCE_CONFIG.training.capacity.perLevel*inst.level;
  const body=inst.body||{};
  const mind=inst.mind||{};
  const training=TRAINING_LINES.map(line=>{
    const value=inst.training?.[line]||0;
    const aptitude=inst.aptitude?.[line]||3;
    const dim=balanceFormulas.diminishingMultiplier(value);
    return `<div class="skill-detail"><b>${line[0].toUpperCase()+line.slice(1)}</b>: ${Math.round(value)} • Aptitude ${'★'.repeat(aptitude)}${'☆'.repeat(5-aptitude)} • ลดลง ${dim}x</div>`;
  }).join('');
  const gene=['hp','atk','def','spd'].map(stat=>`${stat.toUpperCase()} ${inst.genes?.[stat]??'—'}`).join(' • ');
  const needs=[['Hunger',body.hunger??inst.hunger],['Energy',body.energy??inst.energy],['Fitness',body.fitness],['Health',body.health],['Mood',mind.mood??inst.mood],['Stress',mind.stress??inst.stress],['Bond',mind.bond??inst.bond],['Trust',mind.trust??inst.trust],['Discipline',mind.discipline]].map(([label,value])=>`${label} ${value??'—'}`).join(' • ');
  return `<section class="focused-growth-summary"><div class="skills-section-title">Growth • ${presentation.name}</div><div class="training-summary"><b>Capacity</b> ${Math.round(used)} / ${cap}</div><div class="growth-lines">${training}</div><div class="skill-detail"><b>Gene HP</b> ${gene}</div><div class="skill-detail"><b>Body / Mind</b>: ${needs}</div></section>`;
}
function renderTraining(targetPanel=null){
  const panel=targetPanel||characterSystemPanel('training','trainingPanel');
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
  panel.innerHTML=`${renderFocusedGrowthSummary()}<div class="training-panel"><div class="monster-selector"><select data-monster-select>${monsterSelectHTML(selectedId)}</select></div><div class="training-summary"><div class="pool-header"><span>Training Pool (รวม 5 สาย)</span><span class="pool-count">${Math.round(used)} / ${cap}</span></div><div class="pool-bar"><div class="pool-bar-fill" style="width:${poolPct}%"></div></div></div>${linesHTML}<div class="condition-box"><div>สภาพ: <strong class="cond-${cond}">${condTH[cond]||cond}</strong> → ${condMult}x training gain</div><div>Training Food: ${hasBuff?'<span style="color:#fde68a">มี buff ทำงาน</span>':'ไม่มี buff'}</div></div><div class="training-info">Pool = 40 + 8xLevel (รวมทุกสาย) • ค่ามาก = gain ลดลง (diminishing return) • Aptitude ดาวเยอะ = gain เพิ่ม • สภาพดี = gain เพิ่ม</div></div>`;
  bindMonsterSelect(panel,'trainingSelectedId',renderTraining);
  panel.querySelectorAll('[data-train-line]').forEach(b=>b.onclick=()=>setTraining(inst.instanceId,b.dataset.trainLine));
}
const characterSkillsRightTabTrees=new WeakMap();
function characterSkillsDataSnapshot(value,keys){
  try{
    if(value===null||typeof value!=='object'||Array.isArray(value))return null;
    const prototype=Object.getPrototypeOf(value);
    if(prototype!==Object.prototype&&prototype!==null)return null;
    const snapshot=Object.create(null);
    for(const key of keys){
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if(!descriptor)continue;
      if(!Object.prototype.hasOwnProperty.call(descriptor,'value'))return null;
      snapshot[key]=descriptor.value;
    }
    return Object.freeze(snapshot);
  }catch{return null;}
}
function characterSkillsElement(documentRef,tag,className,text=''){
  const node=documentRef.createElement(tag);
  if(className)node.className=className;
  if(text)node.textContent=text;
  return node;
}
function createCharacterSkillsManualCard(documentRef,slot){
  const root=characterSkillsElement(documentRef,'article','character-skill-slot-card');
  root.setAttribute('data-character-skill-slot',slot);
  root.setAttribute('role','group');
  const header=characterSkillsElement(documentRef,'div','character-skill-card-head');
  const slotLabel=characterSkillsElement(documentRef,'span','character-skill-slot-label',slot.toUpperCase());
  const name=characterSkillsElement(documentRef,'strong','character-skill-name','ยังไม่มีสกิล');
  const state=characterSkillsElement(documentRef,'span','character-skill-state','Locked');
  header.append(slotLabel,name,state);
  const icons=characterSkillsElement(documentRef,'div','character-skill-icons');
  icons.setAttribute('aria-hidden','true');
  const mainIcon=characterSkillsElement(documentRef,'span','character-skill-main-icon','🔒');
  const typeIcon=characterSkillsElement(documentRef,'span','character-skill-type-icon');
  const categoryIcon=characterSkillsElement(documentRef,'span','character-skill-category-icon');
  const effectIcon=characterSkillsElement(documentRef,'span','character-skill-effect-icon');
  icons.append(mainIcon,typeIcon,categoryIcon,effectIcon);
  const meta=characterSkillsElement(documentRef,'div','character-skill-meta','ยังไม่มีสกิลในสล็อตนี้');
  const resources=characterSkillsElement(documentRef,'div','character-skill-resources','Uses — • CD —');
  const mastery=characterSkillsElement(documentRef,'div','character-skill-mastery','Mastery —');
  root.append(header,icons,meta,resources,mastery);
  return Object.freeze({root,slotLabel,name,state,mainIcon,typeIcon,categoryIcon,effectIcon,meta,resources,mastery});
}
function createCharacterSkillsSystemCard(documentRef,key,label){
  const root=characterSkillsElement(documentRef,'article','character-skill-system-card');
  root.setAttribute('data-character-skill-system',key);
  root.setAttribute('role','group');
  const heading=characterSkillsElement(documentRef,'strong','character-skill-system-label',label);
  const state=characterSkillsElement(documentRef,'span','character-skill-state');
  const value=characterSkillsElement(documentRef,'div','character-skill-system-value');
  const detail=characterSkillsElement(documentRef,'div','character-skill-system-detail');
  root.append(heading,state,value,detail);
  return Object.freeze({root,heading,state,value,detail});
}
function ensureCharacterSkillsRightTabTree(panel,documentRef=document){
  const cached=characterSkillsRightTabTrees.get(panel);
  if(cached?.root?.parentNode===panel)return cached;
  const root=characterSkillsElement(documentRef,'section','character-skills-a37');
  root.setAttribute('aria-live','polite');
  const title=characterSkillsElement(documentRef,'h4','character-skills-title','Skill Loadout');
  const notice=characterSkillsElement(documentRef,'p','character-skills-notice','ดูสถานะการต่อสู้แบบอ่านอย่างเดียว • จัด Loadout ได้ที่ Keeper > Skills');
  const empty=characterSkillsElement(documentRef,'div','character-info-empty','เลือกมอนสเตอร์จากรายการเพื่อดู Skill Loadout');
  const manualHeading=characterSkillsElement(documentRef,'h5','character-skills-group-title','Manual Skills • S1–S4');
  const manualGrid=characterSkillsElement(documentRef,'div','character-skills-manual-grid');
  const manual=new Map();
  for(const slot of ['s1','s2','s3','s4']){
    const card=createCharacterSkillsManualCard(documentRef,slot);
    manual.set(slot,card);
    manualGrid.append(card.root);
  }
  const systemHeading=characterSkillsElement(documentRef,'h5','character-skills-group-title','System Skills');
  const systemGrid=characterSkillsElement(documentRef,'div','character-skills-system-grid');
  const system=new Map();
  for(const [key,label] of [['basicAI','Basic AI'],['passive','Passive'],['evolutionTrait','Evolution Trait']]){
    const card=createCharacterSkillsSystemCard(documentRef,key,label);
    system.set(key,card);
    systemGrid.append(card.root);
  }
  root.append(title,notice,empty,manualHeading,manualGrid,systemHeading,systemGrid);
  panel.replaceChildren(root);
  const tree=Object.freeze({root,title,notice,empty,manualHeading,manualGrid,systemHeading,systemGrid,manual,system});
  characterSkillsRightTabTrees.set(panel,tree);
  return tree;
}
function setCharacterSkillsText(node,value){
  const text=value==null?'—':String(value);
  if(node.textContent!==text)node.textContent=text;
}
function updateCharacterSkillsManualCard(card,row){
  const stateClass={Ready:'ready','No Uses':'no-uses','Locked/Not Learned':'locked',Invalid:'invalid'}[row.state]||'invalid';
  card.root.className=`character-skill-slot-card is-${stateClass}`;
  card.root.dataset.skillState=stateClass;
  card.root.setAttribute('aria-label',row.accessibilityLabelTH);
  setCharacterSkillsText(card.slotLabel,row.label);
  setCharacterSkillsText(card.name,row.nameEN?`${row.nameTH} (${row.nameEN})`:row.nameTH);
  setCharacterSkillsText(card.state,row.state);
  setCharacterSkillsText(card.mainIcon,row.documentedMainSymbol);
  setCharacterSkillsText(card.typeIcon,row.typeSymbol);
  setCharacterSkillsText(card.categoryIcon,row.categoryMarker);
  setCharacterSkillsText(card.effectIcon,row.effectOverlay);
  const typeText=row.sourceType?`${row.sourceType}${row.runtimeType&&row.runtimeType!==row.sourceType?` / runtime ${row.runtimeType}`:''}`:'—';
  const coverage=row.documentedRuntimeCoverage==='CURRENT_GAP'?' • documented fallback / CURRENT_GAP':'';
  setCharacterSkillsText(card.meta,row.equipped?`${typeText} • ${row.category} • ${row.targetType} • ระยะ ${row.rangeText}${coverage}`:(row.reason||'ยังไม่มีสกิลในสล็อตนี้'));
  setCharacterSkillsText(card.resources,`Uses ${row.usesText} • CD ${row.cooldownText}`);
  const mutation=row.mutationId?` • Mutation ${row.mutationId}`:'';
  setCharacterSkillsText(card.mastery,row.equipped?`Mastery ${row.masteryRank} • EXP ${row.masteryExp}${mutation}`:'Mastery —');
}
function updateCharacterSkillsSystemCard(card,row){
  const stateClass=row.state==='Ready'?'ready':row.state==='Invalid'?'invalid':'locked';
  card.root.className=`character-skill-system-card is-${stateClass}`;
  card.root.dataset.skillState=stateClass;
  card.root.setAttribute('aria-label',row.accessibilityLabelTH);
  setCharacterSkillsText(card.heading,row.label);
  setCharacterSkillsText(card.state,row.state);
  setCharacterSkillsText(card.value,row.value);
  if(row.key==='basicAI'){
    setCharacterSkillsText(card.detail,`Power ${row.power} • CD ${row.cooldownSec}s • ${row.usesText}`);
  }else{
    setCharacterSkillsText(card.detail,'System slot • ไม่ใช่ manual command');
  }
}
function renderFocusedSkillLoadoutV2(panel,inst,presentation,documentRef=document){
  const instanceContext=characterSkillsDataSnapshot(inst,['speciesId','formId','evolutionPath','passiveId']);
  const presentationContext=characterSkillsDataSnapshot(presentation,['id','name']);
  const evolutionContext=typeof instanceContext?.speciesId==='string'
    ?Object.freeze({
      speciesId:instanceContext.speciesId,
      formId:typeof instanceContext.formId==='string'?instanceContext.formId:null,
      evolutionPath:typeof instanceContext.evolutionPath==='string'?instanceContext.evolutionPath:null,
    })
    :null;
  const rawPath=evolutionContext?getEvolutionPath(evolutionContext):null;
  const path=characterSkillsDataSnapshot(rawPath,['trait','evolutionTrait']);
  const rawPassiveDefinition=typeof instanceContext?.passiveId==='string'
    ?passiveCatalogEntry(instanceContext.passiveId)
    :null;
  const passiveDefinition=characterSkillsDataSnapshot(rawPassiveDefinition,['id','nameTH','nameEN']);
  const passive=typeof passiveDefinition?.nameTH==='string'&&typeof passiveDefinition?.nameEN==='string'
    ?`${passiveDefinition.nameTH} (${passiveDefinition.nameEN})`
    :'—';
  const model=createCharacterSkillsViewModel(inst,{
    monsterId:typeof presentationContext?.id==='string'?presentationContext.id:null,
    monsterName:typeof presentationContext?.name==='string'&&presentationContext.name.length>0?presentationContext.name:'มอนสเตอร์',
    passiveId:typeof passiveDefinition?.id==='string'?passiveDefinition.id:(typeof instanceContext?.passiveId==='string'?instanceContext.passiveId:null),
    passiveLabel:passive,
    evolutionTrait:path?.trait||path?.evolutionTrait||'—',
  });
  const tree=ensureCharacterSkillsRightTabTree(panel,documentRef);
  setCharacterSkillsText(tree.title,model.available?`Skill Loadout • ${model.monster.name}`:'Skill Loadout');
  tree.empty.hidden=model.available;
  tree.manualHeading.hidden=!model.available;
  tree.manualGrid.hidden=!model.available;
  tree.systemHeading.hidden=!model.available;
  tree.systemGrid.hidden=!model.available;
  setCharacterSkillsText(tree.empty,model.reason==='no_focused_monster'?'เลือกมอนสเตอร์จากรายการเพื่อดู Skill Loadout':'ข้อมูล Skill Loadout ไม่ถูกต้อง');
  for(const row of model.manualSlots)updateCharacterSkillsManualCard(tree.manual.get(row.slot),row);
  for(const row of model.systemRows)updateCharacterSkillsSystemCard(tree.system.get(row.key),row);
  tree.root.dataset.modelState=model.ok?'ready':model.available?'invalid':'empty';
  return model;
}
const SKILL_ITEM_REASON_TH=Object.freeze({
  [SKILL_ITEM_REASONS.ITEM_EMPTY]:'ผลไฟหมด',
  [SKILL_ITEM_REASONS.INCOMPATIBLE_TYPE]:'ธาตุของมอนสเตอร์ไม่ตรงเงื่อนไข Skill Item',
  [SKILL_ITEM_REASONS.LEVEL_REQUIRED]:'เลเวลของมอนสเตอร์ยังไม่ถึงเงื่อนไข',
  [SKILL_ITEM_REASONS.ALREADY_LEARNED]:'มอนสเตอร์ตัวนี้เรียน Ember แล้ว',
  [SKILL_ITEM_REASONS.INVALID_SLOT]:'กรุณาเลือกสล็อต S1–S4',
  [SKILL_ITEM_REASONS.SLOT_LOCKED]:'สล็อตระบบไม่รับสกิลจากไอเทม',
  [SKILL_ITEM_REASONS.INVALID_SLOT_STATE]:'Loadout ปัจจุบันไม่ถูกต้อง กรุณาจัดสล็อตใหม่',
  [SKILL_ITEM_REASONS.CONFIRMATION_REQUIRED]:'สล็อตนี้มีสกิลอยู่ ต้องยืนยันการแทนที่',
  [SKILL_ITEM_REASONS.STALE_SLOT]:'สล็อตเปลี่ยนไปแล้ว กรุณาตรวจสอบอีกครั้ง',
  [SKILL_ITEM_REASONS.DUPLICATE_COMMAND]:'คำสั่งนี้ถูกบันทึกไปแล้ว',
  [SKILL_ITEM_REASONS.PERSISTENCE_FAILED]:'บันทึกไม่สำเร็จ — ไอเทมยังไม่ถูกใช้',
});
function skillItemReasonText(reason){return SKILL_ITEM_REASON_TH[reason]||`ใช้ Skill Item ไม่สำเร็จ • ${reason||'unknown'}`;}
function skillNameLabel(skillId){const def=skillCatalogEntry(skillId);return def?`${def.nameTH} (${def.nameEN})`:skillId;}
function renderSkillItemPanel(inst){
  const item=SKILL_ITEM_CATALOG.emberFruit,skill=skillCatalogEntry(item.grantsSkillId),quantity=state.inventory[item.id]||0;
  const options=MANUAL_SKILL_SLOTS.map(slot=>{const occupant=(inst.skills||[]).find(owned=>owned.slot===slot);return `<option value="${slot}">${slot.toUpperCase()}${occupant?` • แทนที่ ${skillNameLabel(occupant.skillId)}`:' • ว่าง'}</option>`;}).join('');
  const preview=resolveSkillItemUse({state,monsterId:inst.instanceId,itemId:item.id,slot:'s1',commandId:`preview:${inst.instanceId}:${quantity}`});
  const available=preview.ok||preview.reason===SKILL_ITEM_REASONS.CONFIRMATION_REQUIRED;
  const reason=available?'':skillItemReasonText(preview.reason);
  return `<section class="skill-item-panel" data-skill-item-panel="emberFruit"><div class="skill-item-head"><div><b>🍎 ${item.name} ×${quantity}</b><span>เรียนถาวร: ${skillNameLabel(skill.id)} ${typeBadge(skill.runtimeType)}</span></div><span class="skill-item-rarity">${item.rarity}</span></div><div class="skill-detail">Power ${skill.power} • CD ${skill.cooldownSec}s • Uses ${skill.maxUses} • ใช้ได้กับธาตุ ${item.compatibility.allowedTypes.join('/')}</div><div class="skill-item-controls"><label>ติดตั้งช่อง <select data-skill-item-slot="${item.id}" ${available?'':'disabled'}>${options}</select></label><button data-use-skill-item="${item.id}" ${available?'':'disabled'}>กินเพื่อเรียนสกิล</button></div>${reason?`<div class="skill-req" data-skill-item-reason>${reason}</div>`:'<div class="skill-item-warning">ยืนยันก่อนใช้ทุกครั้ง • ถ้าแทนที่ สกิลเดิมยังอยู่และคง Mastery/Uses</div>'}</section>`;
}
function closeSkillItemConfirmation(){
  pendingSkillItemUse=null;
  el('skillItemConfirm')?.classList.add('hidden');
}
function showSkillItemConfirmation(command,resolution){
  const inst=getInst(command.monsterId),item=skillItemById(command.itemId),skill=skillCatalogEntry(item?.grantsSkillId);
  if(!inst||!item||!skill)return;
  const oldSkillId=resolution.occupantSkillId||resolution.operation?.expectedOccupantSkillId||null;
  const body=el('skillItemConfirmBody');
  if(body)body.innerHTML=`<div class="skill-item-confirm-summary"><b>${displayName(inst)}</b><div>🍎 ${item.name} ×1 → ${skillNameLabel(skill.id)}</div><div>ติดตั้งที่ <strong>${command.slot.toUpperCase()}</strong></div>${oldSkillId?`<div class="skill-item-replace-note">แทนที่ ${skillNameLabel(oldSkillId)} ในสล็อตนี้<br><small>สกิลเดิมไม่ถูกลบ และค่า Mastery/Uses ยังคงเดิม</small></div>`:'<div class="skill-item-empty-note">สล็อตนี้ว่าง</div>'}<div class="skill-item-warning">ไอเทมจะลดลงเมื่อบันทึกสำเร็จเท่านั้น</div></div>`;
  if(el('skillItemConfirmAccept'))el('skillItemConfirmAccept').disabled=false;
  el('skillItemConfirm')?.classList.remove('hidden');
}
function startSkillItemUse(monsterId,itemId,slot){
  if(!assertCharacterMutable(monsterId))return;
  const now=Date.now(),commandId=`skill-item:${now}:${++skillItemCommandSequence}`;
  let command={monsterId,itemId,slot,commandId,now};
  const resolution=resolveSkillItemUse({state,...command});
  if(!resolution.ok&&resolution.reason!==SKILL_ITEM_REASONS.CONFIRMATION_REQUIRED){msg(skillItemReasonText(resolution.reason));renderSkills();return;}
  command={...command,expectedOccupantSkillId:resolution.reason===SKILL_ITEM_REASONS.CONFIRMATION_REQUIRED?resolution.occupantSkillId:null};
  pendingSkillItemUse=Object.freeze(command);
  showSkillItemConfirmation(command,resolution);
}
async function confirmSkillItemUse(){
  const command=pendingSkillItemUse;
  if(!command)return;
  const accept=el('skillItemConfirmAccept');if(accept)accept.disabled=true;
  try{
    if(!requireServerMutation()){if(accept)accept.disabled=false;return;}
    const result=await learnMonsterSkillFromItem(command.monsterId,command.itemId,command.slot,command.commandId);
    applyAuthoritativeMonster(command.monsterId,result.monsterJson);
    if(Number.isInteger(result.quantity))state.inventory[command.itemId]=result.quantity;
    closeSkillItemConfirmation();
    spawnFeedEffect(fxWorldPos(command.monsterId),FOOD_FX_COLOR.emberFruit);
    playSFX('sfx_feed');
    msg(`${displayName(getInst(command.monsterId))} เรียน ${skillNameLabel(result.skillId)} ที่ ${command.slot.toUpperCase()} สำเร็จ`);
    saveGame(false);renderManager();renderSkills();renderParty();renderHUD();
  }catch(error){
    if(accept)accept.disabled=false;
    msg(error?.message||'ใช้ Skill Item ไม่สำเร็จ');renderSkills();
  }
}
function renderSkills(targetPanel=null){
  const panel=targetPanel||characterSystemPanel('skills','skillsPanel');
  if(!panel)return;
  if(targetPanel===el('characterInfoBody')){
    const presentation=focusedCharacterPresentation();
    const inst=presentation.id?getInst(presentation.id):null;
    renderFocusedSkillLoadoutV2(panel,inst,presentation);
    return;
  }
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
    const canonical=skillCatalogEntry(s.skillId);
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
    const skillName=canonical?`${canonical.nameTH} (${canonical.nameEN})`:def.name||s.skillId;
    const skillType=canonical?.runtimeType||def.type||'Normal';
    const equippedSlot=MANUAL_SKILL_SLOTS.includes(s.slot)?s.slot:'';
    const slotControl=canonical?`<label class="skill-loadout-control">ติดตั้งช่อง <select data-skill-loadout="${s.skillId}" aria-label="เลือกสล็อตสำหรับ ${skillName}"><option value="" ${equippedSlot?'':'selected'}>ยังไม่ติดตั้ง</option>${MANUAL_SKILL_SLOTS.map(slot=>`<option value="${slot}" ${equippedSlot===slot?'selected':''}>${slot.toUpperCase()}</option>`).join('')}</select></label>`:'';
    return `<div class="skill-card"><div class="skill-card-header"><b>${skillName} ${typeBadge(skillType)}</b><span class="skill-mastery-label ${rank}">${MASTERY_TH[rank]||rank} ${MASTERY_DOTS[rank]||''}</span></div><div class="skill-exp-text">EXP: <strong>${exp}</strong>${nextThresh?`/${nextThresh}`:''} ${!isMaster?`→ ${MASTERY_NEXT_TH[rank]}`:' (สูงสุด)'}</div><div class="skill-mastery-bar"><div class="skill-mastery-fill ${rank}" style="width:${pct}%"></div></div><div class="skill-detail">Power: ${canonical?.power??def.power??'—'} • CD: ${canonical?.cooldownSec??def.cooldown??'—'}s • ${canonical?.targetType||def.targetType||'enemy'}</div><div class="skill-detail"><span class="power-bonus">Raw Power bonus: +${rawPowerPct}%</span>${s.mutationId?` • Mutation: ${s.mutationId}`:''}</div>${slotControl}</div>`;
  }).join('');
  const learnedIds=new Set((inst.skills||[]).map(s=>s.skillId));
  const lockedMoves=speciesSkills.filter(s=>!learnedIds.has(s.name)).map(s=>`<div class="skill-card skill-locked"><div class="skill-card-header"><b>${s.name} ${typeBadge(s.type)}</b></div><div class="skill-detail">Power: ${s.power??'—'} • CD: ${s.cooldown??'—'}s • ${s.targetType||'enemy'}</div><div class="skill-detail">ใช้สกิลในการต่อสู้เพื่อสะสม EXP → เรียนรู้อัตโนมัติ</div></div>`).join('');
  const candHTML=(SKILL_CANDIDATES[inst.speciesId]||[]).filter(d=>!learnedIds.has(d.id)).map(d=>{
    const ev=evaluateSkillCandidate(d,inst);
    return `<div class="skill-card ${ev.eligible?'':'skill-locked'}"><div class="skill-card-header"><b>${d.id} ${typeBadge(d.move?.type||'Fire')}</b></div><div class="skill-detail">Power: ${d.move?.power??'—'} • CD: ${d.move?.cooldown??'—'}s</div>${ev.eligible?`<button data-learn="${d.id}">เรียน</button>`:`<div class="skill-req">ล็อก: ${(ev.failedRequired||[]).map(r=>r.field+' '+r.op+' '+r.value).join(' • ')||'ยังไม่พร้อม'}</div>`}</div>`;
  }).join('');
  const memoryEligibility=resolveInheritedSkillMemoryEligibility(inst);
  const memoryHTML=inst.inheritedSkillMemoryId?`<div class="skills-section-title">Skill Memory จากการผสมพันธุ์</div><div class="skill-card ${memoryEligibility.eligible?'':'skill-locked'}"><div class="skill-card-header"><b>${memoryEligibility.definition?.nameTH||inst.inheritedSkillMemoryId} • ${inst.inheritedSkillMemoryId}</b><span class="skill-mastery-label">${memoryEligibility.method||'Memory'}</span></div><div class="skill-detail">บันทึกจาก Partner • ไม่ติดตั้งสล็อตอัตโนมัติ</div>${memoryEligibility.eligible?`<button data-learn-memory="${inst.instanceId}">เรียนจาก Memory</button>`:`<div class="skill-req">${SKILL_MEMORY_REASON_TH[memoryEligibility.reason]||memoryEligibility.reason}</div>`}</div>`:'';
  panel.innerHTML=`<div class="skills-panel"><div class="monster-selector"><select data-monster-select>${monsterSelectHTML(selectedId)}</select></div>${renderSkillItemPanel(inst)}<div class="skill-help"><b>จัด Loadout:</b> เลือก S1–S4 จากสกิลที่เรียนแล้ว • ถ้าช่องมีสกิลอยู่ ระบบจะสลับหรือถอดตัวเดิมโดยไม่รีเซ็ต Uses/Cooldown/Mastery</div>${learnedHTML?`<div class="skills-section-title">สกิลที่เรียนรู้ (${(inst.skills||[]).length})</div>${learnedHTML}`:'<div class="manager-empty">ยังไม่ได้เรียนสกิล — ใช้สกิลในการต่อสู้เพื่อสะสม EXP</div>'}${memoryHTML}${lockedMoves?`<div class="skills-section-title">สกิลที่ยังไม่เรียน</div>${lockedMoves}`:''}${candHTML?`<div class="skills-section-title">สกิล candidate</div>${candHTML}`:''}<div class="skill-help"><b>ระดับ Mastery:</b> เริ่มต้น → คุ้นเคย → ชำนาญ → เชี่ยวชาญ → ปรมาจารย์<br><b>EXP สะสม:</b> 100 / 300 / 700 / 1500<br><b>Power bonus:</b> +0% / +2% / +5% / +8% / +11%<br>ใช้สกิลซ้ำๆ ใน battle เดียว = EXP ลดลง (novelty decay 0.7x)</div></div>`;
  bindMonsterSelect(panel,'skillsSelectedId',renderSkills);
  panel.querySelectorAll('[data-learn]').forEach(b=>b.onclick=()=>learnCandidateSkill(inst.instanceId,b.dataset.learn));
  panel.querySelectorAll('[data-learn-memory]').forEach(b=>b.onclick=()=>learnSkillMemory(b.dataset.learnMemory));
  panel.querySelectorAll('[data-skill-loadout]').forEach(select=>select.onchange=()=>setMonsterSkillLoadout(inst.instanceId,select.dataset.skillLoadout,select.value||null));
  panel.querySelectorAll('[data-use-skill-item]').forEach(button=>button.onclick=()=>{const slot=panel.querySelector(`[data-skill-item-slot="${button.dataset.useSkillItem}"]`)?.value;startSkillItemUse(inst.instanceId,button.dataset.useSkillItem,slot);});
}
function renderFocusedEquipmentLoadout(){
  const presentation=focusedCharacterPresentation();
  const inst=presentation.id?getInst(presentation.id):null;
  if(!inst)return '<div class="manager-empty">เลือกมอนเพื่อดู Equipment Loadout</div>';
  const flat=getEquipmentFlat(inst);
  const contribution=computeEquipmentContribution(equippedItems(inst));
  const preview=loadoutPreview(instanceCombatBuildSafe(inst),contribution);
  const active=activeSummon?.inst?.instanceId===inst.instanceId;
  const slots=EQUIPMENT_SLOTS.map(slot=>{
    const item=inst.equipment?.[slot];
    return `<div class="equip-slot-card"><b>${slot[0].toUpperCase()+slot.slice(1)}</b><div>${item?.name||item?.id||'ว่าง'}</div></div>`;
  }).join('');
  const stats=['hp','atk','def','spd'].map(stat=>`${stat.toUpperCase()} +${flat[stat]||0}`).join(' • ');
  const deltas=['hp','atk','def','spd'].map(stat=>`${stat.toUpperCase()} ${preview.statDelta[stat]>=0?'+':''}${Math.round(preview.statDelta[stat])}`).join(' • ');
  return `<section class="focused-equipment-loadout"><div class="skills-section-title">Equipment Loadout • ${presentation.name}</div><div class="equipment-slots">${slots}</div><div class="equip-summary-stats">${stats}</div><div class="skill-detail">Preview: ${deltas} • CR ${preview.crDelta>=0?'+':''}${Math.round(preview.crDelta)}</div>${active?`<div class="skill-req">${ACTIVE_SUMMON_READONLY_REASON}</div>`:''}</section>`;
}
function renderEquipment(targetPanel=null){
  const panel=targetPanel||characterSystemPanel('equipment','equipmentPanel');
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
  panel.innerHTML=`<div class="equipment-panel">${renderFocusedEquipmentLoadout()}<div class="monster-selector"><select data-monster-select>${monsterSelectHTML(selectedId)}</select></div><div class="equip-summary"><div class="equip-summary-stats">${flatHTML}</div>${equippedCount>0?`<div class="budget-label">Power Budget: ${budgetPct}% (ควร ${budgetMin}-${budgetMax}%) — ${budgetStatus}</div><div class="budget-bar"><div class="budget-fill ${budgetClass}" style="width:${Math.min(100,budgetPct*5)}%"></div></div><div class="budget-range">0% — ${budgetMin}% — ${budgetMax}% — 20%</div>`:'<div class="budget-label">ยังไม่ได้ใส่อุปกรณ์</div>'}</div>${slotsHTML}<div class="equip-help"><b>3 สล็อก:</b> Gear / Charm / Utility<br><b>ถอดได้ตลอดเวลา</b> (reversible) — ไม่ทำลายสถิติ<br><b>Affix ประเภทเดียวกัน</b> — รวมกันแล้วไม่เกิน cap<br><b>พลังรวม</b> — ควรอยู่ ${budgetMin}-${budgetMax}% ของ combat power</div></div>`;
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
function requestLandscapeOrientation(){
  try{
    const lock=screen.orientation?.lock?.('landscape');
    if(lock?.catch)lock.catch(err=>console.warn('orientation lock rejected',err));
  }catch(err){console.warn('orientation lock rejected',err);}
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
  requestLandscapeOrientation();
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
let nextId=1,zoneGeneration=0,summonRuntimeEpoch=0,wildPopulationRecoveryPending=false;const wilds=[],projectiles=[],wildRespawnTimers=new Set();let activeSummon=null;let pendingSummon=null;let summonCooldownUntil=0;let stageRunStartedAt=0;
let bossChallengeSession=createBossChallengeSession(),nearbyBossChallengeId=null;
let nearbyWarp=null,warpBusy=false,warpPromptCooldown=0,warpSpawnOverride=null,dismissedWarpId=null;
characterUI=createCharacterUIController({
  getState:()=>state,
  getActiveSummonId:()=>activeSummon?.inst?.instanceId||pendingSummon?.instanceId||null,
  getZone:()=>state.currentZone,
  syncLegacySelection(id){
    if(!id)return;
    state.trainingSelectedId=id;
    state.skillsSelectedId=id;
    state.equipSelectedId=id;
    state.evolutionCandidate=id;
  },
});
let hubCompanion=null;
const ZONES={
  hub:{label:'Ranch Hub',bg:0x72c7ef,ground:0x62c96b,spawn:[],bounds:{minX:-32,maxX:32,minZ:-32,maxZ:32},playerStart:[0,0,5]},
  'grass-meadow':{label:'Grass Meadow • Normal + Rare + Elite + Boss',stageId:'grass-meadow',biomeId:'grass-meadow',bg:0x7bcf9a,ground:0x62b96b,spawn:[
    ['mossbun',-11,2,1,{}],['mossbun',11,2,1,{}],['buglet',-11,-8,1,{}],['buglet',11,-8,1,{}],['normalooze',-6,-14,1,{}],['normalooze',6,-14,1,{}],['mossbun',-16,14,2,{}],['buglet',16,14,2,{}]
  ],rareSpawn:[['mossbun',0,-2,BALANCE.grassMeadowRare.level,{rare:true}]],rareChance:BALANCE.grassMeadowRare.chance,eliteSpawn:[['mossbun',0,-18,3,{elite:true}]],eliteChance:.18,bossSpawn:[['mossbun',0,-18,BALANCE.grassMeadowBoss.level,{boss:true}]],progressionBossSpeciesId:'mossbun',bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},playerStart:[0,0,17],primaryTypes:['Grass'],secondaryTypes:['Bug','Normal'],encounterTableId:'grass-meadow-normal-v1',rareEncounterTableId:'grass-meadow-rare-v1',eliteEncounterTableId:'grass-meadow-elite-v1',bossEncounterTableId:'grass-meadow-boss-v1',balanceProfileId:'grass-meadow-normal-v1',recommendedLevel:stageLevelRange('grass-meadow'),sceneStatus:'normal-encounters'},
  'ember-valley':{label:'Ember Valley • Fire + Rock + Ground',stageId:'ember-valley',biomeId:'volcanic-valley',bg:0xc2410c,ground:0x7c2d12,spawn:[
    ['flameling',-11,2,4,{}],['flameling',11,2,4,{}],['rockhorn',-11,-8,4,{}],['rockhorn',11,-8,4,{}],['sandmole',-7,-14,5,{}],['sandmole',7,-14,5,{}]
  ],eliteSpawn:[['flameling',0,-16,6,{elite:true,evolutionPath:'flame_wolf'}]],eliteChance:.16,bossSpawn:[['flameling',0,-18,7,{boss:true,evolutionPath:'magma_bear'}]],progressionBossSpeciesId:'flameling',bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},playerStart:[0,0,17],primaryTypes:['Fire'],secondaryTypes:['Rock','Ground'],encounterTableId:'encounter-ember-valley-v1',eliteEncounterTableId:'elite-ember-valley-v1',bossEncounterTableId:'boss-ember-valley-v1',balanceProfileId:'stage-ember-valley-v1',recommendedLevel:stageLevelRange('ember-valley'),sceneStatus:'stage-ready'},
  'misty-lake':{label:'Misty Lake • Water + Grass + Flying',stageId:'misty-lake',biomeId:'misty-lake',bg:0x38bdf8,ground:0x0e7490,spawn:[
    ['aquapuff',-11,2,5,{}],['aquapuff',11,2,5,{}],['mossbun',-11,-8,5,{}],['mossbun',11,-8,5,{}],['galebird',-7,-14,6,{}],['galebird',7,-14,6,{}]
  ],eliteSpawn:[['aquapuff',0,-16,7,{elite:true}]],eliteChance:.16,bossSpawn:[['aquapuff',0,-18,8,{boss:true}]],progressionBossSpeciesId:'aquapuff',bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},playerStart:[0,0,17],primaryTypes:['Water'],secondaryTypes:['Grass','Flying'],encounterTableId:'encounter-misty-lake-v1',eliteEncounterTableId:'elite-misty-lake-v1',bossEncounterTableId:'boss-misty-lake-v1',balanceProfileId:'stage-misty-lake-v1',recommendedLevel:stageLevelRange('misty-lake'),sceneStatus:'stage-ready'},
  'storm-field':{label:'Storm Field • Electric + Flying + Steel',stageId:'storm-field',biomeId:'storm-field',bg:0x1e40af,ground:0x1e3a8a,spawn:[
    ['voltkit',-11,2,6,{}],['voltkit',11,2,6,{}],['galebird',-11,-8,6,{}],['galebird',11,-8,6,{}],['ironbug',-7,-14,7,{}],['ironbug',7,-14,7,{}]
  ],eliteSpawn:[['voltkit',0,-16,9,{elite:true}]],eliteChance:.16,bossSpawn:[['voltkit',0,-18,10,{boss:true}]],progressionBossSpeciesId:'voltkit',bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},playerStart:[0,0,17],primaryTypes:['Electric'],secondaryTypes:['Flying','Steel'],encounterTableId:'encounter-storm-field-v1',eliteEncounterTableId:'elite-storm-field-v1',bossEncounterTableId:'boss-storm-field-v1',balanceProfileId:'stage-storm-field-v1',recommendedLevel:stageLevelRange('storm-field'),sceneStatus:'stage-ready'},
  'poison-marsh':{label:'Poison Marsh • Poison + Grass + Bug',stageId:'poison-marsh',biomeId:'poison-marsh',bg:0x6b7f4a,ground:0x365314,spawn:[
    ['toxitoad',-11,2,16,{}],['toxitoad',11,2,16,{}],['mossbun',-11,-8,16,{}],['mossbun',11,-8,16,{}],['buglet',-7,-14,17,{}],['toxitoad',7,-14,17,{}]
  ],eliteSpawn:[['toxitoad',0,-16,19,{elite:true}]],eliteChance:.16,bossSpawn:[['toxitoad',0,-18,20,{boss:true}]],progressionBossSpeciesId:'toxitoad',bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},playerStart:[0,0,17],primaryTypes:['Poison'],secondaryTypes:['Grass','Bug'],encounterTableId:'encounter-poison-marsh-v1',eliteEncounterTableId:'elite-poison-marsh-v1',bossEncounterTableId:'boss-poison-marsh-v1',balanceProfileId:'stage-poison-marsh-v1',recommendedLevel:stageLevelRange('poison-marsh'),sceneStatus:'stage-ready'},
  'dream-shrine':{label:'Dream Shrine • Psychic + Fairy + Normal',stageId:'dream-shrine',biomeId:'dream-shrine',bg:0x312e81,ground:0x6d28d9,spawn:[
    ['mindcoon',-11,2,20,{}],['mindcoon',11,2,20,{}],['fairimp',-11,-8,20,{}],['fairimp',11,-8,20,{}],['normalooze',-7,-14,21,{}],['mindcoon',7,-14,21,{}]
  ],eliteSpawn:[['mindcoon',0,-16,23,{elite:true}]],eliteChance:.16,bossSpawn:[['mindcoon',0,-18,24,{boss:true}]],progressionBossSpeciesId:'mindcoon',bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},playerStart:[0,0,17],primaryTypes:['Psychic'],secondaryTypes:['Fairy','Normal'],encounterTableId:'encounter-dream-shrine-v1',eliteEncounterTableId:'elite-dream-shrine-v1',bossEncounterTableId:'boss-dream-shrine-v1',balanceProfileId:'stage-dream-shrine-v1',recommendedLevel:stageLevelRange('dream-shrine'),sceneStatus:'stage-ready'},
  'haunted-woods':{label:'Haunted Woods • Ghost + Dark + Poison',stageId:'haunted-woods',biomeId:'haunted-woods',bg:0x1e293b,ground:0x334155,spawn:[
    ['ghostpurr',-11,2,22,{}],['ghostpurr',11,2,22,{}],['toxitoad',-11,-8,22,{}],['toxitoad',11,-8,22,{}],['voidhorn',-7,-14,23,{}],['ghostpurr',7,-14,23,{}]
  ],eliteSpawn:[['ghostpurr',0,-16,25,{elite:true}]],eliteChance:.16,bossSpawn:[['ghostpurr',0,-18,26,{boss:true}]],progressionBossSpeciesId:'ghostpurr',bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},playerStart:[0,0,17],primaryTypes:['Ghost'],secondaryTypes:['Dark','Poison'],encounterTableId:'encounter-haunted-woods-v1',eliteEncounterTableId:'elite-haunted-woods-v1',bossEncounterTableId:'boss-haunted-woods-v1',balanceProfileId:'stage-haunted-woods-v1',recommendedLevel:stageLevelRange('haunted-woods'),sceneStatus:'stage-ready'},
  'shadow-city':{label:'Shadow City • Dark + Poison + Fighting',stageId:'shadow-city',biomeId:'shadow-city',bg:0x111827,ground:0x312e81,spawn:[
    ['voidhorn',-11,2,24,{}],['voidhorn',11,2,24,{}],['toxitoad',-11,-8,24,{}],['toxitoad',11,-8,24,{}],['punchcub',-7,-14,25,{}],['voidhorn',7,-14,25,{}]
  ],eliteSpawn:[['voidhorn',0,-16,27,{elite:true}]],eliteChance:.16,bossSpawn:[['voidhorn',0,-18,28,{boss:true}]],progressionBossSpeciesId:'voidhorn',bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},playerStart:[0,0,17],primaryTypes:['Dark'],secondaryTypes:['Poison','Fighting'],encounterTableId:'encounter-shadow-city-v1',eliteEncounterTableId:'elite-shadow-city-v1',bossEncounterTableId:'boss-shadow-city-v1',balanceProfileId:'stage-shadow-city-v1',recommendedLevel:stageLevelRange('shadow-city'),sceneStatus:'stage-ready'},
  'steel-factory':{label:'Steel Factory • Steel + Electric + Rock',stageId:'steel-factory',biomeId:'steel-factory',bg:0x64748b,ground:0x475569,spawn:[
    ['ironbug',-11,2,26,{}],['ironbug',11,2,26,{}],['voltkit',-11,-8,26,{}],['voltkit',11,-8,26,{}],['rockhorn',-7,-14,27,{}],['ironbug',7,-14,27,{}]
  ],eliteSpawn:[['ironbug',0,-16,29,{elite:true}]],eliteChance:.16,bossSpawn:[['ironbug',0,-18,30,{boss:true}]],progressionBossSpeciesId:'ironbug',bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},playerStart:[0,0,17],primaryTypes:['Steel'],secondaryTypes:['Electric','Rock'],encounterTableId:'encounter-steel-factory-v1',eliteEncounterTableId:'elite-steel-factory-v1',bossEncounterTableId:'boss-steel-factory-v1',balanceProfileId:'stage-steel-factory-v1',recommendedLevel:stageLevelRange('steel-factory'),sceneStatus:'stage-ready'},
  'dragon-crater':{label:'Dragon Crater • Dragon + Fire + Rock',stageId:'dragon-crater',biomeId:'dragon-crater',bg:0x7f1d1d,ground:0x431407,spawn:[
    ['emberdrake',-11,2,30,{}],['emberdrake',11,2,30,{}],['flameling',-11,-8,30,{}],['flameling',11,-8,30,{}],['rockhorn',-7,-14,31,{}],['emberdrake',7,-14,31,{}]
  ],eliteSpawn:[['emberdrake',0,-16,34,{elite:true}]],eliteChance:.16,bossSpawn:[['emberdrake',0,-18,35,{boss:true}]],progressionBossSpeciesId:'emberdrake',bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},playerStart:[0,0,17],primaryTypes:['Dragon'],secondaryTypes:['Fire','Rock'],encounterTableId:'encounter-dragon-crater-v1',eliteEncounterTableId:'elite-dragon-crater-v1',bossEncounterTableId:'boss-dragon-crater-v1',balanceProfileId:'stage-dragon-crater-v1',recommendedLevel:stageLevelRange('dragon-crater'),sceneStatus:'stage-ready'},
  'fairy-garden':{label:'Fairy Garden • Fairy + Grass + Psychic',stageId:'fairy-garden',biomeId:'fairy-garden',bg:0xc084fc,ground:0x4d7c0f,spawn:[
    ['fairimp',-11,2,32,{}],['fairimp',11,2,32,{}],['mossbun',-11,-8,32,{}],['mossbun',11,-8,32,{}],['mindcoon',-7,-14,33,{}],['fairimp',7,-14,33,{}]
  ],eliteSpawn:[['fairimp',0,-16,35,{elite:true}]],eliteChance:.16,bossSpawn:[['fairimp',0,-18,36,{boss:true}]],progressionBossSpeciesId:'fairimp',bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},playerStart:[0,0,17],primaryTypes:['Fairy'],secondaryTypes:['Grass','Psychic'],encounterTableId:'encounter-fairy-garden-v1',eliteEncounterTableId:'elite-fairy-garden-v1',bossEncounterTableId:'boss-fairy-garden-v1',balanceProfileId:'stage-fairy-garden-v1',recommendedLevel:stageLevelRange('fairy-garden'),sceneStatus:'stage-ready'},
  'combat-colosseum':{label:'Combat Colosseum • Fighting + Normal + Steel',stageId:'combat-colosseum',biomeId:'combat-colosseum',bg:0xf59e0b,ground:0x92400e,spawn:[
    ['punchcub',-11,2,34,{}],['punchcub',11,2,34,{}],['normalooze',-11,-8,34,{}],['normalooze',11,-8,34,{}],['ironbug',-7,-14,35,{}],['punchcub',7,-14,35,{}]
  ],eliteSpawn:[['punchcub',0,-16,37,{elite:true}]],eliteChance:.16,bossSpawn:[['punchcub',0,-18,38,{boss:true}]],progressionBossSpeciesId:'punchcub',bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},playerStart:[0,0,17],primaryTypes:['Fighting'],secondaryTypes:['Normal','Steel'],encounterTableId:'encounter-combat-colosseum-v1',eliteEncounterTableId:'elite-combat-colosseum-v1',bossEncounterTableId:'boss-combat-colosseum-v1',balanceProfileId:'stage-combat-colosseum-v1',recommendedLevel:stageLevelRange('combat-colosseum'),sceneStatus:'stage-ready'},
  'normal-wildlands':{label:'Normal Wildlands • Normal + All Types',stageId:'normal-wildlands',biomeId:'normal-wildlands',bg:0x60a5fa,ground:0x65a30d,spawn:[
    ['normalooze',-11,2,38,{}],['normalooze',11,2,38,{}],['emberdrake',-11,-8,38,{}],['fairimp',11,-8,38,{}],['ironbug',-7,-14,39,{}],['normalooze',7,-14,39,{}]
  ],eliteSpawn:[['normalooze',0,-16,41,{elite:true}]],eliteChance:.16,bossSpawn:[['normalooze',0,-18,42,{boss:true}]],progressionBossSpeciesId:'normalooze',bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},playerStart:[0,0,17],primaryTypes:['Normal'],secondaryTypes:['Grass','Bug','Fire','Water','Electric','Ice','Rock','Ground','Flying','Poison','Psychic','Ghost','Dark','Steel','Dragon','Fairy','Fighting'],bossEncounterTableId:'boss-normal-wildlands-v1',eliteEncounterTableId:'elite-normal-wildlands-v1',encounterTableId:'encounter-normal-wildlands-v1',balanceProfileId:'stage-normal-wildlands-v1',recommendedLevel:stageLevelRange('normal-wildlands'),sceneStatus:'stage-ready'},
  'sky-ruins':{label:'Sky Ruins • Flying + Electric + Psychic',stageId:'sky-ruins',biomeId:'sky-ruins',bg:0x8da4c7,ground:0x64748b,spawn:[
    ['galebird',-11,2,14,{}],['galebird',11,2,14,{}],['voltkit',-11,-8,14,{}],['voltkit',11,-8,14,{}],['mindcoon',-7,-14,15,{}],['galebird',7,-14,15,{}]
  ],eliteSpawn:[['galebird',0,-16,17,{elite:true}]],eliteChance:.16,bossSpawn:[['galebird',0,-18,18,{boss:true}]],progressionBossSpeciesId:'galebird',bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},playerStart:[0,0,17],primaryTypes:['Flying'],secondaryTypes:['Electric','Psychic'],encounterTableId:'encounter-sky-ruins-v1',eliteEncounterTableId:'elite-sky-ruins-v1',bossEncounterTableId:'boss-sky-ruins-v1',balanceProfileId:'stage-sky-ruins-v1',recommendedLevel:stageLevelRange('sky-ruins'),sceneStatus:'stage-ready'},
  'rocky-canyon':{label:'Rocky Canyon • Rock + Ground + Fighting',stageId:'rocky-canyon',biomeId:'rocky-canyon',bg:0xd6a66b,ground:0x9a6b3f,spawn:[
    ['rockhorn',-11,2,12,{}],['rockhorn',11,2,12,{}],['sandmole',-11,-8,12,{}],['sandmole',11,-8,12,{}],['punchcub',-7,-14,13,{}],['rockhorn',7,-14,13,{}]
  ],eliteSpawn:[['rockhorn',0,-16,15,{elite:true}]],eliteChance:.16,bossSpawn:[['rockhorn',0,-18,16,{boss:true}]],progressionBossSpeciesId:'rockhorn',bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},playerStart:[0,0,17],primaryTypes:['Rock'],secondaryTypes:['Ground','Fighting'],encounterTableId:'encounter-rocky-canyon-v1',eliteEncounterTableId:'elite-rocky-canyon-v1',bossEncounterTableId:'boss-rocky-canyon-v1',balanceProfileId:'stage-rocky-canyon-v1',recommendedLevel:stageLevelRange('rocky-canyon'),sceneStatus:'stage-ready'},
  'frozen-pass':{label:'Frozen Pass • Ice + Flying + Water',stageId:'frozen-pass',biomeId:'frozen-pass',bg:0xbfe8ff,ground:0xdbeafe,spawn:[
    ['frostowl',-11,2,10,{}],['frostowl',11,2,10,{}],['aquapuff',-11,-8,10,{}],['aquapuff',11,-8,10,{}],['frostowl',-7,-14,11,{}],['aquapuff',7,-14,11,{}]
  ],eliteSpawn:[['frostowl',0,-16,13,{elite:true}]],eliteChance:.16,bossSpawn:[['frostowl',0,-18,14,{boss:true}]],progressionBossSpeciesId:'frostowl',bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},playerStart:[0,0,17],primaryTypes:['Ice'],secondaryTypes:['Flying','Water'],encounterTableId:'encounter-frozen-pass-v1',eliteEncounterTableId:'elite-frozen-pass-v1',bossEncounterTableId:'boss-frozen-pass-v1',balanceProfileId:'stage-frozen-pass-v1',recommendedLevel:stageLevelRange('frozen-pass'),sceneStatus:'stage-ready'},
  grassland:{label:'Green Meadow',bg:0x68d2f5,ground:0x56d364,spawn:[
    ['normalooze',-4,-2,1,{}],['normalooze',18,16,1,{}],['flameling',8,-10,1,{}],['flameling',-18,14,1,{}],['aquapuff',16,-4,1,{}],['aquapuff',-16,-16,1,{}],['voltkit',-12,6,1,{}],['voltkit',10,18,1,{}],['mossbun',4,-18,1,{}],['mossbun',-20,4,1,{}],['fairimp',-6,-20,1,{}],['fairimp',18,-16,1,{}],
    ['galebird',14,-20,2,{}],['toxitoad',-20,-10,2,{}],['punchcub',20,10,2,{}],['punchcub',-10,20,2,{}]
  ]},
  cave:{label:'Echo Cave',bg:0x334155,ground:0x57606f,spawn:[
    ['frostowl',-6,-4,2,{}],['frostowl',18,8,2,{}],['ironbug',8,-12,2,{}],['ironbug',-16,14,2,{}],['rockhorn',14,4,2,{}],['rockhorn',-20,-8,2,{}],['ghostpurr',-14,6,2,{}],['ghostpurr',10,18,2,{}],['sandmole',4,-18,2,{}],['sandmole',-20,10,2,{}],
    ['mindcoon',-6,-20,2,{}],['buglet',18,-6,2,{}],['buglet',-8,20,2,{}],['voidhorn',-20,-16,3,{elite:true}],['emberdrake',16,16,3,{}],['emberdrake',-6,18,4,{boss:true}],
    ['flameling',20,-12,5,{elite:true,evolutionPath:'flame_wolf'}],['flameling',-20,12,5,{evolutionPath:'magma_bear'}]
  ]}
};
const zoneContentValidation=validateZoneEncounterConfig(ZONES);
const stageLevelValidation=validateStageLevelProgression(ZONES);
const warpContentValidation=validateWarpRoutes();
if(!zoneContentValidation.ok||!stageLevelValidation.ok||!warpContentValidation.ok){
  throw new Error(`World content validation failed: ${JSON.stringify([...zoneContentValidation.issues,...stageLevelValidation.issues,...warpContentValidation.issues])}`);
}
function setZoneLighting(zone){
  if(zone==='cave'){
    hemi.intensity=0.6;
    sun.intensity=0.8;
    sun.color.setHex(0xb0c4de);
  }else if(zone==='grassland'||zone==='grass-meadow'){
    hemi.intensity=1.55;
    sun.intensity=2.15;
    sun.color.setHex(0xffffff);
  }else if(zone==='ember-valley'){
    hemi.intensity=1.1;
    sun.intensity=1.7;
    sun.color.setHex(0xffc078);
  }else if(zone==='misty-lake'){
    hemi.intensity=1.35;
    sun.intensity=1.8;
    sun.color.setHex(0xd9f7ff);
  }else if(zone==='storm-field'){
    hemi.intensity=1.05;
    sun.intensity=1.45;
    sun.color.setHex(0x9db8ff);
  }else if(zone==='frozen-pass'){
    hemi.intensity=1.45;
    sun.intensity=1.55;
    sun.color.setHex(0xe0f2fe);
  }else if(zone==='rocky-canyon'){
    hemi.intensity=1.2;
    sun.intensity=1.75;
    sun.color.setHex(0xffd29a);
  }else if(zone==='sky-ruins'){
    hemi.intensity=1.25;
    sun.intensity=1.65;
    sun.color.setHex(0xc7d2fe);
  }else if(zone==='poison-marsh'){
    hemi.intensity=1.05;
    sun.intensity=1.35;
    sun.color.setHex(0xb7d48a);
  }else if(zone==='dream-shrine'){
    hemi.intensity=1.35;
    sun.intensity=1.4;
    sun.color.setHex(0xd8b4fe);
  }else if(zone==='haunted-woods'){
    hemi.intensity=0.7;
    sun.intensity=0.9;
    sun.color.setHex(0x94a3b8);
  }else if(zone==='shadow-city'){
    hemi.intensity=0.85;
    sun.intensity=1.15;
    sun.color.setHex(0x93c5fd);
  }else if(zone==='steel-factory'){
    hemi.intensity=1.15;
    sun.intensity=1.55;
    sun.color.setHex(0xfde68a);
  }else if(zone==='dragon-crater'){
    hemi.intensity=0.9;
    sun.intensity=1.45;
    sun.color.setHex(0xfdba74);
  }else if(zone==='fairy-garden'){
    hemi.intensity=1.5;
    sun.intensity=1.75;
    sun.color.setHex(0xf5d0fe);
  }else if(zone==='combat-colosseum'){
    hemi.intensity=1.3;
    sun.intensity=1.85;
    sun.color.setHex(0xfef3c7);
  }else if(zone==='normal-wildlands'){
    hemi.intensity=1.55;
    sun.intensity=2;
    sun.color.setHex(0xe0f2fe);
  }else{
    hemi.intensity=1.55;
    sun.intensity=2.15;
    sun.color.setHex(0xfff4e0);
  }
}
function setZoneGround(zone){
  const z=ZONES[zone];
  if(!z)return;
  const type=zone==='cave'?'cave':zone==='ember-valley'?'ember':zone==='misty-lake'?'lake':zone==='storm-field'?'storm':zone==='frozen-pass'?'frozen':zone==='sky-ruins'?'ruins':zone==='poison-marsh'?'marsh':zone==='dream-shrine'?'shrine':zone==='haunted-woods'?'woods':zone==='shadow-city'?'city':zone==='steel-factory'?'factory':zone==='dragon-crater'?'dragon':zone==='fairy-garden'?'fairy':zone==='combat-colosseum'?'arena':zone==='normal-wildlands'?'wildlands':zone==='rocky-canyon'?'rocky':'grass';
  ground.material.map=makeGroundTexture(z.ground,type);
  ground.material.color.setHex(0xffffff);
  ground.material.needsUpdate=true;
  scene.background=makeSkyTexture(z.bg);
  scene.fog.color.setHex(zone==='cave'?0x1e293b:(zone==='hub'?0x65c9f5:z.bg));
  scene.fog.near=zone==='cave'?15:zone==='frozen-pass'?18:zone==='rocky-canyon'?24:zone==='sky-ruins'?22:zone==='poison-marsh'?18:zone==='dream-shrine'?20:zone==='haunted-woods'?14:zone==='shadow-city'?16:zone==='steel-factory'?18:30;
  scene.fog.far=zone==='cave'?50:zone==='frozen-pass'?62:zone==='rocky-canyon'?68:zone==='sky-ruins'?80:zone==='poison-marsh'?58:zone==='dream-shrine'?64:zone==='haunted-woods'?48:zone==='shadow-city'?60:zone==='steel-factory'?66:76;
  setZoneLighting(zone);
}
const MONSTER_AI_DEBUG=new URLSearchParams(location.search).get('debugAI')==='1';
const MONSTER_AI_TRACE_LIMIT=48;
const MONSTER_AI_SESSION_TRACE_LIMIT=160;
const MONSTER_AI_SESSION_ACTOR_LIMIT=32;
const monsterAiDebugSession=MONSTER_AI_DEBUG?{version:'v8.10',events:[],actors:[]}:null;
if(monsterAiDebugSession)globalThis.__MONSTER_AI_DEBUG__=monsterAiDebugSession;
function wildAiEncounterId(zone=state.currentZone,generation=zoneGeneration){return`zone:${generation}:${zone}`;}
function ownedWildAiTargetId(summon=activeSummon){return summon?.inst?.instanceId&&Number.isSafeInteger(summon.runtimeEpoch)?`owned:${summon.inst.instanceId}:${summon.runtimeEpoch}`:null;}
function playerWildAiTargetId(generation=zoneGeneration){return`player:${generation}`;}
function wildAiPolicy(w){return w?.boss===true?WILD_BOSS_BASIC_AI_POLICY:WILD_BASIC_AI_POLICY;}
function appendMonsterAiSessionTrace(event){
  if(!monsterAiDebugSession||!event)return;
  monsterAiDebugSession.events.push(event);
  if(monsterAiDebugSession.events.length>MONSTER_AI_SESSION_TRACE_LIMIT)monsterAiDebugSession.events.shift();
}
function publishMonsterAiMetrics(actorId,kind,metrics){
  if(!monsterAiDebugSession||typeof actorId!=='string'||!actorId||!metrics)return;
  const actors=monsterAiDebugSession.actors;
  let index=actors.findIndex(entry=>entry.actorId===actorId),entry=index>=0?actors.splice(index,1)[0]:null;
  if(!entry)entry={actorId,kind};
  entry.kind=kind;
  entry.decisionCount=metrics.decisionCount;
  entry.transitionCount=metrics.transitionCount;
  entry.targetSwitchCount=metrics.targetSwitchCount;
  entry.rejectedIntentCount=metrics.rejectedIntentCount;
  entry.resetCount=metrics.resetCount;
  entry.avgDecisionMs=metrics.avgDecisionMs;
  entry.maxDecisionMs=metrics.maxDecisionMs;
  if(Number.isFinite(metrics.attackCount))entry.attackCount=metrics.attackCount;
  actors.push(entry);
  if(actors.length>MONSTER_AI_SESSION_ACTOR_LIMIT)actors.shift();
}
function runBestEffortCombatPresentation(callback){try{callback();return true;}catch{return false;}}
function recordWildAiTrace(w,options={}){
  if(!MONSTER_AI_DEBUG||!w)return;
  try{
  const {fromState=w?.state??null,toState=w?.state??null,targetId=w?.aiState?.targetId??null,action='idle',reason='unknown',timeSec=w?.statusState?.currentTimeSec??0,durationMs=0,rejected=false,decision=false,reset=false}=options??{};
  if(!w.aiDebug)w.aiDebug={eventCount:0,decisionCount:0,transitionCount:0,targetSwitchCount:0,rejectedIntentCount:0,resetCount:0,avgDecisionMs:0,maxDecisionMs:0,trace:[]};
  const metrics=w.aiDebug;
  metrics.eventCount++;
  if(decision){metrics.decisionCount++;metrics.avgDecisionMs+=((Number.isFinite(durationMs)?durationMs:0)-metrics.avgDecisionMs)/metrics.decisionCount;metrics.maxDecisionMs=Math.max(metrics.maxDecisionMs,Number.isFinite(durationMs)?durationMs:0);}
  if(fromState!==toState)metrics.transitionCount++;
  if(rejected)metrics.rejectedIntentCount++;
  if(reset)metrics.resetCount++;
  const previous=metrics.trace[metrics.trace.length-1];
  if(previous?.targetId!==undefined&&previous.targetId!==targetId)metrics.targetSwitchCount++;
  const event={actorId:w.id,fromState,toState,targetId,action,reason,time:timeSec};
  metrics.trace.push(event);
  if(metrics.trace.length>MONSTER_AI_TRACE_LIMIT)metrics.trace.shift();
  appendMonsterAiSessionTrace(event);
  publishMonsterAiMetrics(w.id,'wild',metrics);
  }catch{}
}
function recordOwnedAiTrace(a,options={}){
  if(!MONSTER_AI_DEBUG||!a)return;
  try{
  const {fromState=a?.aiDecision?.action??'idle',toState=a?.aiDecision?.action??'idle',targetId=a?.aiDecision?.targetId??null,action=toState,reason='unknown',timeSec=a?.statusState?.currentTimeSec??0,durationMs=0,rejected=false,decision=false}=options??{};
  if(!a.aiDebug)a.aiDebug={decisionCount:0,transitionCount:0,targetSwitchCount:0,rejectedIntentCount:0,resetCount:0,attackCount:0,avgDecisionMs:0,maxDecisionMs:0,trace:[]};
  const metrics=a.aiDebug;
  if(decision){metrics.decisionCount++;metrics.avgDecisionMs+=((Number.isFinite(durationMs)?durationMs:0)-metrics.avgDecisionMs)/metrics.decisionCount;metrics.maxDecisionMs=Math.max(metrics.maxDecisionMs,Number.isFinite(durationMs)?durationMs:0);}
  if(fromState!==toState)metrics.transitionCount++;
  if(rejected)metrics.rejectedIntentCount++;
  if(action==='basic_attack'&&reason==='runtime_commit'&&!rejected)metrics.attackCount++;
  const previous=metrics.trace[metrics.trace.length-1];
  if(previous?.targetId!==undefined&&previous.targetId!==targetId)metrics.targetSwitchCount++;
  const actorId=ownedWildAiTargetId(a),event={actorId,fromState,toState,targetId,action,reason,time:timeSec};
  metrics.trace.push(event);
  if(metrics.trace.length>MONSTER_AI_TRACE_LIMIT)metrics.trace.shift();
  appendMonsterAiSessionTrace(event);
  publishMonsterAiMetrics(actorId,'owned',metrics);
  }catch{}
}
function cancelOwnedAIAction(a,reason){
  if(!a)return false;
  const previous=a.aiDecision;
  a.target=null;a.aiDecision=null;a.aiDecisionElapsed=0;
  recordOwnedAiTrace(a,{fromState:previous?.action??'idle',toState:'idle',targetId:previous?.targetId??null,action:'idle',reason,timeSec:a.statusState?.currentTimeSec??0,rejected:previous?.targetId!==null&&previous?.targetId!==undefined});
  return true;
}
function cancelOwnedAITarget(targetId,reason){
  if(!targetId||activeSummon?.aiDecision?.targetId!==targetId)return false;
  return cancelOwnedAIAction(activeSummon,reason);
}
function clearWildAiTelegraph(w){
  if(!w)return false;
  const effect=w?.aiTelegraphEffect;
  const index=effect?effects.indexOf(effect):-1;
  if(index>=0){effect.life=0;if(effect.mesh)effect.mesh.visible=false;}
  w.aiTelegraphEffect=null;
  w.aiTelegraphTargetId=null;
  w.aiTelegraphYOffset=0;
  if(w.mesh?.userData){w.mesh.userData.monAction='idle';w.mesh.userData.monActionTimer=0;}
  return !!effect;
}
function setWildAiTelegraph(w,effect,target=null){
  clearWildAiTelegraph(w);
  if(!w||!effect)return false;
  w.aiTelegraphEffect=effect;
  w.aiTelegraphTargetId=target?.id??null;
  w.aiTelegraphYOffset=target&&Number.isFinite(effect.mesh?.position?.y)&&Number.isFinite(target.position?.y)?effect.mesh.position.y-target.position.y:0;
  return true;
}
function createWildAiTelegraph(w,position,color,options,target=null){
  try{
    const effect=spawnRingPulse(position,color,options);
    if(!effect?.mesh||!effects.includes(effect))return false;
    return setWildAiTelegraph(w,effect,target);
  }catch{return false;}
}
function syncWildAiTelegraphs(target){
  for(const w of wilds){
    const effect=w?.aiTelegraphEffect;
    if(!effect)continue;
    if(!effects.includes(effect)){w.aiTelegraphEffect=null;w.aiTelegraphTargetId=null;w.aiTelegraphYOffset=0;continue;}
    if(!w.aiTelegraphTargetId)continue;
    if(!wildAiTargetAvailable(target)||target.id!==w.aiTelegraphTargetId||!effect.mesh?.position)continue;
    effect.mesh.position.x=target.position.x;
    effect.mesh.position.y=(Number.isFinite(target.position.y)?target.position.y:0)+w.aiTelegraphYOffset;
    effect.mesh.position.z=target.position.z;
  }
}
function commitWildAIState(w,nextState){
  const floor=w?.aiActionSequenceFloor,canonical=validateMonsterAIState(nextState);
  if(!w||!canonical||canonical.actorId!==w.id||canonical.encounterId!==w.aiEncounterId
    ||!Number.isSafeInteger(floor)||floor<1||canonical.nextActionSequence<floor)return false;
  w.aiState=canonical;
  w.aiActionSequenceFloor=canonical.nextActionSequence;
  w.state=canonical.state;
  return true;
}
function finiteWildVector(value){return Number.isFinite(value?.x)&&Number.isFinite(value?.y)&&Number.isFinite(value?.z);}
function finiteNonNegativeWildValue(value){return Number.isFinite(value)&&value>=0;}
function knownWildMonsterAction(value){return value==='idle'||value==='attack'||value==='hurt';}
function knownWildMotionAction(value){return value==='idle'||value==='wander'||value==='move';}
let wildRuntimeFrameToken=0;
const wildRuntimeActorIdsScratch=new Set();
const wildFrameRuntimeCache=new WeakMap();
function ensureWildFrameRuntime(w){
  let runtime=wildFrameRuntimeCache.get(w);
  if(!runtime){runtime={actor:w,validationToken:0,statusState:null,control:null,selfModifiers:null};wildFrameRuntimeCache.set(w,runtime);}
  return runtime;
}
function markWildRuntimeValidated(w){
  const runtime=ensureWildFrameRuntime(w);
  runtime.validationToken=wildRuntimeFrameToken;runtime.statusState=w.statusState;runtime.control=null;runtime.selfModifiers=null;
  return runtime;
}
function wildFrameRuntimeUsable(w,runtime){
  return !!w&&runtime?.actor===w&&runtime.validationToken===wildRuntimeFrameToken&&runtime.statusState===w.statusState
    &&w.dead===false&&w.retired===false&&w.runtimeGeneration===zoneGeneration&&Number.isFinite(w.hp)&&w.hp>0&&!!w.mesh;
}
function validateWildRuntimeActor(w){
  const aiState=w?.aiState;
  const motion=w?.aiMotion;
  return !!w&&typeof w.id==='string'&&w.id.length>0&&!!spById[w.speciesId]
    &&w.dead===false&&w.retired===false&&typeof w.capturing==='boolean'&&typeof w.engaged==='boolean'
    &&typeof w.combatEnabled==='boolean'&&typeof w.boss==='boolean'&&typeof w.elite==='boolean'&&typeof w.rare==='boolean'
    &&Number.isInteger(w.level)&&w.level>=1&&Number.isFinite(w.maxHp)&&w.maxHp>0
    &&Number.isFinite(w.hp)&&w.hp>0&&w.hp<=w.maxHp
    &&finiteNonNegativeWildValue(w.atk)&&finiteNonNegativeWildValue(w.def)&&finiteNonNegativeWildValue(w.spAtk)&&finiteNonNegativeWildValue(w.spDef)&&finiteNonNegativeWildValue(w.spd)
    &&Number.isFinite(w.attackCd)&&w.attackCd>=0&&Number.isFinite(w.wanderT)
    &&finiteWildVector(w.mesh?.position)&&typeof w.mesh.position.copy==='function'&&typeof w.mesh.position.clone==='function'&&typeof w.mesh.position.add==='function'
    &&finiteWildVector(w.mesh.rotation)&&finiteWildVector(w.mesh.scale)&&typeof w.mesh.scale.set==='function'&&typeof w.mesh.scale.multiplyScalar==='function'
    &&!!w.mesh.userData&&typeof w.mesh.userData==='object'&&finiteWildVector(w.mesh.userData.baseScale)
    &&(w.mesh.userData.animPhase===undefined||Number.isFinite(w.mesh.userData.animPhase))
    &&Number.isFinite(w.mesh.userData.monPhase)&&knownWildMonsterAction(w.mesh.userData.monAction)
    &&Number.isFinite(w.mesh.userData.monActionTimer)&&w.mesh.userData.monActionTimer>=0
    &&Number.isFinite(w.mesh.userData.monActionDuration)&&w.mesh.userData.monActionDuration>0
    &&w.mesh.userData.monActionTimer<=w.mesh.userData.monActionDuration&&finiteWildVector(w.home)
    &&finiteWildVector(w.dir)&&typeof w.dir.clone==='function'&&typeof w.dir.lengthSq==='function'&&typeof w.dir.multiplyScalar==='function'
    &&finiteWildVector(w.wanderDir)&&typeof w.wanderDir.clone==='function'&&typeof w.wanderDir.lengthSq==='function'
    &&!!motion&&knownWildMotionAction(motion.action)
    &&(motion.targetId===null||typeof motion.targetId==='string')&&finiteWildVector(motion.direction)&&typeof motion.direction.set==='function'
    &&w.runtimeGeneration===zoneGeneration&&w.aiEncounterId===wildAiEncounterId()
    &&isCanonicalMonsterAIState(aiState)&&aiState.actorId===w.id&&aiState.encounterId===w.aiEncounterId&&aiState.state===w.state
    &&Number.isSafeInteger(w.aiActionSequenceFloor)&&w.aiActionSequenceFloor===aiState.nextActionSequence
    &&isEncounterStatusState(w.statusState)&&w.statusState.ended===false&&w.statusState.encounterId===w.id;
}
function quarantineWildAIActor(w){
  if(!w)return false;
  const id=typeof w.id==='string'?w.id:null,mesh=w.mesh??null,label=w.labelEl??null;
  try{abortCaptureSequence(w);}catch{}
  try{cancelOwnedAITarget(id,'actor_quarantined');}catch{}
  try{discardBattleEventsForTarget(id);}catch{}
  try{clearWildAiTelegraph(w);}catch{}
  if(id!==null){try{distanceTickScheduler.clear(id);}catch{}try{labelTickScheduler.clear(`label:${id}`);}catch{}}
  if(mesh){try{mesh.visible=false;}catch{}try{removeAndDispose(scene,mesh);}catch{}}
  try{removeWildLabel(w);}catch{try{label?.remove?.();}catch{}}
  const index=wilds.indexOf(w);if(index>=0)wilds.splice(index,1);
  try{w.dead=true;w.retired=true;w.engaged=false;w.capturing=false;}catch{}
  try{w.mesh=null;}catch{}
  wildPopulationRecoveryPending=true;
  return true;
}
function quarantineInvalidWildActors(){
  wildRuntimeActorIdsScratch.clear();
  let quarantined=0;
  for(let index=0;index<wilds.length;){
    const w=wilds[index];
    if(!w||(typeof w!=='object'&&typeof w!=='function')){
      wilds.splice(index,1);wildPopulationRecoveryPending=true;quarantined++;continue;
    }
    const duplicateId=typeof w?.id==='string'&&wildRuntimeActorIdsScratch.has(w.id);
    if(!duplicateId&&validateWildRuntimeActor(w)){
      wildRuntimeActorIdsScratch.add(w.id);markWildRuntimeValidated(w);index++;continue;
    }
    try{
      try{recordWildAiTrace(w,{fromState:w?.state??null,toState:'fainted',targetId:null,action:'idle',reason:duplicateId?'duplicate_runtime_actor_id':'invalid_runtime_actor',timeSec:w?.statusState?.currentTimeSec??0,rejected:true});}catch{}
      try{quarantineWildAIActor(w);}catch{}
    }finally{
      let staleIndex=wilds.indexOf(w);while(staleIndex>=0){wilds.splice(staleIndex,1);staleIndex=wilds.indexOf(w);}
      wildPopulationRecoveryPending=true;quarantined++;
    }
  }
  return quarantined;
}
function cancelWildAIAction(w,reason,{retire=false,clearEngagement=false,encounterReset=false}={}){
  if(!w)return false;
  const previousState=w.aiState?.state??w.state??'wander';
  clearWildAiTelegraph(w);
  const floor=Number.isSafeInteger(w.aiActionSequenceFloor)&&w.aiActionSequenceFloor>=1?w.aiActionSequenceFloor:null;
  let reset=resetMonsterAIState(w.aiState);
  if(reset&&floor!==null&&reset.nextActionSequence<floor)reset=null;
  reset=reset??(floor===null?null:createMonsterAIState({actorId:w.id,encounterId:w.aiEncounterId,nextActionSequence:floor}));
  if(!reset||!commitWildAIState(w,reset)){w.aiState=null;w.state='fainted';quarantineWildAIActor(w);recordWildAiTrace(w,{fromState:previousState,toState:'fainted',targetId:null,reason:`${reason}:invalid_state`,timeSec:w.statusState?.currentTimeSec??0,rejected:true});return false;}
  if(clearEngagement)w.engaged=false;
  if(retire)w.retired=true;
  if(w.aiMotion){w.aiMotion.action='idle';w.aiMotion.targetId=null;}
  recordWildAiTrace(w,{fromState:previousState,toState:w.state,targetId:null,reason,timeSec:w.statusState?.currentTimeSec??0,reset:encounterReset});
  return true;
}
function cancelWildAITarget(targetId,reason){
  if(!targetId)return 0;
  let cancelled=0;
  for(let index=wilds.length-1;index>=0;index--){const w=wilds[index];if(w?.aiState?.targetId===targetId){cancelWildAIAction(w,reason);cancelled++;}}
  return cancelled;
}
function createWild(sp,x,z,level=1,opts={}){
  const boss=!!opts.boss,elite=!!opts.elite||!!sp?.elite,rare=!!opts.rare;
  const encounterProfile=resolveEncounterProfile({stageId:STAGE_BY_ID[state.currentZone]?state.currentZone:null,runtimeSpeciesId:sp?.id,variant:encounterVariantFromFlags({boss,elite,rare}),level});
  if(!encounterProfile.ok){console.warn('Encounter profile rejected',encounterProfile.issues);return null;}
  const evolutionPath=opts.evolutionPath??((level>=2)&&sp.evolutionPaths?.[0]?.id||null),potential=opts.potential??randomPotential(),variant=boss?'Boss':elite?'Elite':rare?'Rare':'Normal';
  const canonicalStats=calculateCanonicalWildStats({runtimeSpeciesId:sp.id,stage:evolutionPath?2:1,level,potential,training:{hp:0,atk:0,def:0,spAtk:0,spDef:0,spd:0},variant});
  if(!canonicalStats.ok){console.warn('Canonical wild stats rejected',canonicalStats);return null;}
  const renderInst=evolutionPath?{speciesId:sp.id,evolutionPath,lifeStage:level<=2?'Juvenile':'Adult'}:null,mesh=monsterMesh(sp,false,renderInst,elite,boss);
  mesh.position.set(x,0,z);
  mesh.scale.multiplyScalar(boss?1.12:(rare?1.1:1.06));
  const markerColor=boss?0xfb7185:(elite?0xfde047:(rare?0xf0abfc:0x86efac));
  const markerSize=boss?.22:(rare?.19:.16);
  const marker=new THREE.Mesh(octahedronGeometry(markerSize),new THREE.MeshStandardMaterial({color:markerColor,emissive:markerColor,emissiveIntensity:rare?.9:.65,roughness:.35}));
  marker.position.set(0,boss?2.45:(rare?2.2:2.05),0);marker.name='wildMarker';mesh.add(marker);
  scene.add(mesh);setupMonsterMotion(mesh,sp,renderInst);const genes=randomGenes(sp),{hp:maxHp,atk,def,spAtk,spDef,spd}=canonicalStats.stats;
  const capturePolicy=encounterProfile.capturePolicy;
  const wildId='w'+nextId++,aiEncounterId=wildAiEncounterId(),aiState=createMonsterAIState({actorId:wildId,encounterId:aiEncounterId});
  if(!aiState){removeAndDispose(scene,mesh);return null;}
  const w={id:wildId,speciesId:sp.id,canonicalFormId:canonicalStats.formId,level,maxHp,hp:maxHp,capturePolicy,captureReferenceLevel:null,atk,def,spAtk,spDef,spd,potential,genes,gender:rollGender(sp),mesh,home:new THREE.Vector3(x,0,z),state:aiState.state,aiState,aiEncounterId,aiActionSequenceFloor:aiState.nextActionSequence,aiTelegraphEffect:null,aiTelegraphTargetId:null,aiTelegraphYOffset:0,runtimeGeneration:zoneGeneration,retired:false,lastCommittedAiActionToken:null,wanderT:0,wanderDir:new THREE.Vector3(Math.random()-.5,0,Math.random()-.5).normalize(),dir:new THREE.Vector3(Math.random()-.5,0,Math.random()-.5).normalize(),aiMotion:{action:'wander',targetId:null,direction:new THREE.Vector3(0,0,-1)},attackCd:0,dead:false,capturing:false,captureEngagementResumePending:false,phase:Math.random()*6.28,engaged:false,resetTimer:0,combatEnabled:!boss,boss,elite,rare,zone:state.currentZone,evolutionPath,renderInst,statusState:createEncounterStatusState({encounterId:wildId,nowSec:0})};
  if(rare)markRareDiscovery(w,'found');
  if(elite)markEliteProgress(w,'found');
  if(boss)markBossProgress(w,'found');
  w.labelEl=createWildLabel(w);wilds.push(w);return w;
}
function clearWilds(){
  clearWildRespawnTimers();
  abortCaptureSequence();
  clearCaptureAttemptLedger(captureAttemptLedger);
  for(let index=wilds.length-1;index>=0;index--){const w=wilds[index];cancelOwnedAITarget(w?.id,'zone_clear');cancelWildAIAction(w,'zone_clear',{retire:true,clearEngagement:true});w.statusState=endEncounterEffects(w.statusState,{nowSec:w.statusState.currentTimeSec});removeAndDispose(scene,w.mesh);removeWildLabel(w);}
  wilds.length=0;
  battleEventLog.length=0;
  distanceTickScheduler.clearAll();
  labelTickScheduler.clearAll();
}
function retireWild(w){
  cancelOwnedAITarget(w?.id,'actor_retired');
  discardBattleEventsForTarget(w?.id);
  cancelWildAIAction(w,'actor_retired',{retire:true,clearEngagement:true});
  distanceTickScheduler.clear(w.id);
  labelTickScheduler.clear(`label:${w.id}`);
  const index=wilds.indexOf(w);
  if(index>=0)wilds.splice(index,1);
}
function livingWilds(){return wilds.filter(w=>!w.dead&&!w.retired);}
function spawnRecords(records=[]){for(const [id,x,z,l,opts] of records)createWild(spById[id],x,z,l,opts);}
function ensureProgressionEncounter(zone=state.currentZone){
  if(zone!==state.currentZone)return null;
  const cfg=ZONES[zone],objective=currentStageObjective(zone);
  runBestEffortCombatPresentation(()=>renderStarterJourney());
  if(!cfg||!objective.encounter)return null;
  if(livingWilds().some(w=>w[objective.encounter]))return objective.encounter;
  const records=objective.encounter==='boss'?cfg.bossSpawn:cfg.eliteSpawn;
  if(!records?.length)return null;
  spawnRecords(records);
  runBestEffortCombatPresentation(()=>renderStarterJourney());
  return objective.encounter;
}
function reconcilePendingStageClear(zone,objective){
  if(!runStageClearReconciliation({objective,stageId:zone,completeStageClear:stageId=>completeStageClear(stageId,{recovered:true})}))return objective;
  return currentStageObjective(zone);
}
function spawnZone(zone){
  const cfg=ZONES[zone];if(!cfg)return;
  let objective=currentStageObjective(zone);
  objective=reconcilePendingStageClear(zone,objective);
  spawnRecords(cfg.spawn);
  if(objective.encounter==='boss'){ensureProgressionEncounter(zone);return;}
  if(objective.encounter!=='elite'&&cfg.rareSpawn?.length&&Math.random()<cfg.rareChance)spawnRecords(cfg.rareSpawn);
  if(objective.encounter==='elite')ensureProgressionEncounter(zone);
  else if(objective.complete&&cfg.eliteSpawn?.length&&!livingWilds().some(w=>w.rare||w.elite)&&Math.random()<cfg.eliteChance)spawnRecords(cfg.eliteSpawn);
}
function resetWild(w,cause='unspecified'){
  if(w.dead||w.retired)return false;
  const resetReason=`encounter_reset:${typeof cause==='string'&&cause?cause:'unspecified'}`;
  cancelOwnedAITarget(w.id,resetReason);
  if(!cancelWildAIAction(w,resetReason,{clearEngagement:true,encounterReset:true}))return false;
  discardBattleEventsForTarget(w.id);
  w.statusState=endEncounterEffects(w.statusState,{nowSec:w.statusState.currentTimeSec});
  w.statusState=createEncounterStatusState({encounterId:w.id,nowSec:0});
  w.captureReferenceLevel=null;w.captureEngagementResumePending=false;w.hp=w.maxHp;w.state='wander';w.engaged=false;w.resetTimer=0;w.attackCd=0;
  if(w.aiMotion){w.aiMotion.action='wander';w.aiMotion.targetId=null;}
  if(w.boss)w.combatEnabled=false;
  w.mesh.position.copy(w.home);
  return true;
}
function canCombatTargetWild(w){return bossTargetable(w,bossChallengeSession);}
function bossChallengeWild(id=bossChallengeSession.activeBossId){return id?wilds.find(w=>w?.id===id&&w.boss&&!w.dead&&!w.retired)||null:null;}
function closeBossChallengeUi({clearSession=false}={}){
  if(clearSession)bossChallengeSession=createBossChallengeSession();
  nearbyBossChallengeId=null;
  runBestEffortCombatPresentation(()=>{el('bossChallenge')?.classList.add('hidden');el('bossRetreatBtn')?.classList.add('hidden');});
}
function updateBossChallengePrompt(){
  const active=bossChallengeWild();
  if(bossChallengeSession.activeBossId){
    if(!active){closeBossChallengeUi({clearSession:true});return;}
    nearbyBossChallengeId=null;
    runBestEffortCombatPresentation(()=>{el('bossChallenge')?.classList.add('hidden');el('bossRetreatBtn')?.classList.remove('hidden');});
    return;
  }
  runBestEffortCombatPresentation(()=>el('bossRetreatBtn')?.classList.add('hidden'));
  const boss=wilds.find(w=>w?.boss&&!w.dead&&!w.retired&&w.mesh?.position)||null;
  if(!boss){nearbyBossChallengeId=null;runBestEffortCombatPresentation(()=>el('bossChallenge')?.classList.add('hidden'));return;}
  const distanceM=distXZ(player.position,boss.mesh.position);
  bossChallengeSession=rearmBossChallenge(bossChallengeSession,boss.id,distanceM);
  if(!bossPromptAvailable({session:bossChallengeSession,bossId:boss.id,alive:!boss.dead,distanceM})){
    nearbyBossChallengeId=null;runBestEffortCombatPresentation(()=>el('bossChallenge')?.classList.add('hidden'));return;
  }
  nearbyBossChallengeId=boss.id;
  runBestEffortCombatPresentation(()=>{setTextIfChanged(el('bossChallengeTitle'),`ท้าสู้ BOSS ${wildDisplayName(boss)}?`);setTextIfChanged(el('bossChallengeDetail'),`Lv.${boss.level} • จะยังไม่โจมตีจนกว่าจะกดเข้าสู้`);el('bossChallenge')?.classList.remove('hidden');});
}
function startBossChallenge(){
  const boss=bossChallengeWild(nearbyBossChallengeId);
  if(!boss||!bossPromptAvailable({session:bossChallengeSession,bossId:boss.id,alive:!boss.dead,distanceM:distXZ(player.position,boss.mesh.position)}))return false;
  const combatTarget=resolveWildAiTarget();
  const combatTargetDistance=wildAiTargetAvailable(combatTarget)?distXZ(boss.mesh.position,combatTarget.position):Infinity;
  if(!Number.isFinite(combatTargetDistance)||combatTargetDistance>ENCOUNTER_POLICY.disengageRadius){
    msg(activeSummon&&activeSummon.mesh?'เริ่มการต่อสู้ BOSS ไม่ได้ • พามอนที่ Summon เข้าใกล้ BOSS ก่อน':'เริ่มการต่อสู้ BOSS ไม่ได้ • เป้าหมายต่อสู้ไม่พร้อม');
    return false;
  }
  if(!cancelWildAIAction(boss,'boss_challenge_start',{clearEngagement:true})){
    nearbyBossChallengeId=null;
    el('bossChallenge')?.classList.add('hidden');
    msg('เริ่มการต่อสู้ BOSS ไม่ได้ • Wild AI state ไม่สมบูรณ์');
    return false;
  }
  bossChallengeSession=acceptBossChallenge(bossChallengeSession,boss.id);
  nearbyBossChallengeId=null;
  ensureCaptureReferenceLevel(boss);
  boss.combatEnabled=true;boss.engaged=true;boss.state=boss.aiState.state;
  if(activeSummon)cancelOwnedAIAction(activeSummon,'boss_challenge_start');
  runBestEffortCombatPresentation(()=>{el('bossChallenge')?.classList.add('hidden');el('bossRetreatBtn')?.classList.remove('hidden');playBGM('boss');msg(`เริ่มการต่อสู้ BOSS ${wildDisplayName(boss)} • กด “ออกจากไฟต์” ได้ทุกเมื่อ`);});
  return true;
}
function declineNearbyBossChallenge(){
  const boss=bossChallengeWild(nearbyBossChallengeId);
  if(!boss)return false;
  bossChallengeSession=declineBossChallenge(bossChallengeSession,boss.id);
  nearbyBossChallengeId=null;
  runBestEffortCombatPresentation(()=>{el('bossChallenge')?.classList.add('hidden');msg(`ยังไม่เข้าสู้ BOSS ${wildDisplayName(boss)} • เดินออกแล้วกลับมาใหม่เมื่อพร้อม`);});
  return true;
}
function exitBossChallenge(reason='player'){
  const boss=bossChallengeWild();
  if(!boss)return false;
  const resetCause=reason==='player'?'boss_challenge_exit':typeof reason==='string'&&reason?reason:'boss_challenge_exit';
  abortCaptureSequence(boss);
  bossChallengeSession=retreatBossChallenge(bossChallengeSession,boss.id);
  resetWild(boss,resetCause);
  clearBossChallengeCombatEffects();discardBattleEventsForTarget(boss.id);
  if(activeSummon){
    cancelOwnedAIAction(activeSummon,'boss_challenge_exit');
    resetActiveBossChallengeStatus();
  }
  runBestEffortCombatPresentation(()=>{el('bossRetreatBtn')?.classList.add('hidden');playBGM(state.currentZone);msg(reason!=='player'?'ออกนอกเงื่อนไขสนามบอส • ยุติการต่อสู้โดยไม่มีโทษ':`ออกจากไฟต์ BOSS ${wildDisplayName(boss)} • ไม่มีโทษและยังกลับมาท้าใหม่ได้`);});
  return true;
}
function finishBossChallenge(w){
  if(!w?.boss||!bossCombatAuthorized(bossChallengeSession,w.id))return;
  closeBossChallengeUi({clearSession:true});
  runBestEffortCombatPresentation(()=>playBGM(state.currentZone));
}
function nearestWild(max=12,from=player.position){let best=null,bd=max;for(const w of wilds){if(w.dead||!canCombatTargetWild(w))continue;const d=distXZ(from,w.mesh.position);if(d<bd){best=w;bd=d;}}return best;}
function aimedWild(maxRange=10,radius=1.35){
  const f=forward(),start=player.position,best={w:null,score:Infinity};for(const w of wilds){if(w.dead||w.capturing||!canCombatTargetWild(w))continue;const v=w.mesh.position.clone().sub(start);v.y=0;const along=v.dot(f);if(along<1||along>maxRange)continue;const closest=start.clone().add(f.clone().multiplyScalar(along)),lat=distXZ(closest,w.mesh.position);if(lat<=radius&&lat+along*.015<best.score){best.w=w;best.score=lat+along*.015;}}return best.w;
}
function respawnWild(w,delay=6000){
  const generation=zoneGeneration,zone=w.zone,id=w.speciesId,level=w.level,boss=w.boss,elite=w.elite,rare=w.rare,x=w.home.x,z=w.home.z,evolutionPath=w.evolutionPath;
  let timer=null;
  timer=setTimeout(()=>{
    wildRespawnTimers.delete(timer);
    if(zoneGeneration!==generation||state.currentZone!==zone||!ZONES[zone])return;
    createWild(spById[id],x,z,level,{boss,elite,rare,evolutionPath});
  },delay);
  wildRespawnTimers.add(timer);
  return timer;
}
function clearWildRespawnTimers(){for(const timer of wildRespawnTimers)try{clearTimeout(timer);}catch{}wildRespawnTimers.clear();}
function clearProjectiles(){try{abortCaptureSequence();}catch{}while(projectiles.length){const p=projectiles.pop();if(p?.mesh)try{removeAndDispose(scene,p.mesh);}catch{}}pendingSummon=null;}
function removeSceneRole(role,instanceId=null){
  for(let i=scene.children.length-1;i>=0;i--){
    const obj=scene.children[i];
    if(obj?.userData?.worldRole!==role) continue;
    if(instanceId!==null && obj.userData.instanceId!==instanceId) continue;
    removeAndDispose(scene, obj);
  }
}
function setHubVisibility(on){npc.visible=on;merchantNpc.visible=on;trainerNpc.visible=on;evolutionNpc.visible=on;breedingNpc.visible=on;ranchPad.disk.visible=ranchPad.ring.visible=on;breedingPad.disk.visible=breedingPad.ring.visible=on;incubator.visible=on;}
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
  if(!ZONES[zone])return false;
  if(STAGE_BY_ID[zone]&&!stageUnlockReason(state.stageProgress,zone).ok){msg(`${STAGE_BY_ID[zone].displayName} ยังล็อกอยู่ • เคลียร์ด่านก่อนหน้า`);return false;}
  if(zone!=='hub'&&healthyPartyCount()===0){msg('Party ไม่มีมอนพร้อมสู้ • กลับไป Heal ฟรีกับผู้ดูแลมอนก่อน');return false;}
  const safetyBalls=zone!=='hub'&&ensureCaptureBallSafety();
  const switchStarted=performance.now();
  zoneGeneration++;
  abortCaptureSequence();
  if(activeSummon)recall(false,false);
  clearProjectiles();
  clearHubCompanion();
  removeSceneRole('activeSummon');
  removeSceneRole('ranchVisual');
  summonCooldownUntil=0;
  clearWilds();
  clearTransientEffects();
  closeBossChallengeUi({clearSession:true});
  clearSkillFields();
  clearSkillSwarms();
  closeWarpPrompt();
  dismissedWarpId=null;
  closeStageSelect();
  closeStageReward();
  el('monsterManager').classList.add('hidden');
  characterUI.closeAll();
  state.currentZone=zone;
  if(zone==='grass-meadow'){
    const journey=state.starterJourney||starterJourneyDefaults();
    journey.grassMeadow=journey.grassMeadow||starterJourneyDefaults().grassMeadow;
    journey.grassMeadow.entered=true;
    state.starterJourney=journey;
  }
  if(STAGE_BY_ID[zone])stageRunStartedAt=Date.now();
  playBGM(zone);
  startAmbient(zone);
  const cfg=ZONES[zone];
  let mark=performance.now();
  setZoneGround(zone);
  const groundMs=performance.now()-mark;mark=performance.now();
  populateWorld(zone);
  const populateMs=performance.now()-mark;mark=performance.now();
  const start=warpSpawnOverride||cfg.playerStart||[0,0,5];
  warpSpawnOverride=null;
  player.position.set(...start);
  flushNearbyDecos(player.position,WORLD_STREAM.zoneAttachBudget);
  const flushMs=performance.now()-mark;mark=performance.now();
  playerData.hp=Math.max(1,playerData.hp);
  setHubVisibility(zone==='hub');
  spawnZone(zone);
  if(zone!=='hub'&&livingWilds().length===0)spawnZone(zone);
  const spawnMs=performance.now()-mark;mark=performance.now();
  syncRanchVisuals();
  syncHubCompanion();
  renderZoneUI();
  renderStarterJourney();
  if(!silent)msg(zone==='hub'?`${selectedInstance()?displayName(selectedInstance())+' เดินเป็นคู่หูใน Ranch • ':''}Ranch เป็น Safe Zone • กด “ออกล่า” เพื่อไปจับมอน`:cfg.sceneStatus==='blockout'?`${cfg.label} • Scene blockout พร้อมสำรวจ • ยังไม่มี Wild Monster`: `${safetyBalls?'Keeper Starter Kit: Capture Ball +5 • ':''}${cfg.label} • Wild ${livingWilds().length} ตัว • ปาเรียกมอนก่อนสู้`);
  saveGame(false);
  lastSwitchParts={ground:Number(groundMs.toFixed(2)),populate:Number(populateMs.toFixed(2)),flush:Number(flushMs.toFixed(2)),spawn:Number(spawnMs.toFixed(2)),save:Number((performance.now()-mark).toFixed(2))};
  lastSwitchZoneMs=performance.now()-switchStarted;
  return true;
}
function clearBossChallengeCombatEffects(){clearSkillFields();clearSkillSwarms();}

// ---------- Camera / input ----------
let cameraYaw=0,cameraPitch=.48;
cameraPitch=.28;
const cameraPad=el('cameraPad');
let camDrag={active:false,pid:null,x:0,y:0};
cameraPad.addEventListener('pointerdown',e=>{camDrag.active=true;camDrag.pid=e.pointerId;camDrag.x=e.clientX;camDrag.y=e.clientY;cameraPad.setPointerCapture?.(e.pointerId);});
cameraPad.addEventListener('pointermove',e=>{if(!camDrag.active||e.pointerId!==camDrag.pid)return;const dx=e.clientX-camDrag.x,dy=e.clientY-camDrag.y;camDrag.x=e.clientX;camDrag.y=e.clientY;cameraYaw-=dx*.006;cameraPitch=THREE.MathUtils.clamp(cameraPitch+dy*.004,.12,.55);});
function endCam(e){if(e.pointerId!==camDrag.pid)return;camDrag.active=false;camDrag.pid=null;}
cameraPad.addEventListener('pointerup',endCam);
cameraPad.addEventListener('pointercancel',endCam);
const keys={};
addEventListener('pointerdown',()=>initAudio(),{once:true});
addEventListener('keydown',()=>initAudio(),{once:true});
addEventListener('keydown',e=>{if(pirateThrowPanelPaused())return;keys[e.code]=true;if(e.repeat)return;if(e.code==='KeyJ')useSkill(0);if(e.code==='KeyK')useSkill(1);if(e.code==='KeyL')useSkill(2);if(e.code==='KeyC')captureThrow();if(e.code==='KeyR')summonThrow();if(e.code==='KeyT')recall();if(['Digit1','Digit2','Digit3'].includes(e.code)){switchPartySlot(Number(e.code.at(-1))-1);}});
addEventListener('keyup',e=>keys[e.code]=false);
const joy={x:0,y:0,active:false,pid:null};
const joyEl=el('joystick'); if(!joyEl) throw new Error('V8.4.0 boot: #joystick not found');
const stick=el('stick'); if(!stick) throw new Error('V8.4.0 boot: #stick not found');

function joyPoint(e){const r=joyEl.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const max=r.width*.34,mag=Math.hypot(dx,dy)||1;if(mag>max){dx*=max/mag;dy*=max/mag;}joy.x=dx/max;joy.y=dy/max;stick.style.transform=`translate(${dx}px,${dy}px)`;}
joyEl.addEventListener('pointerdown',e=>{joy.active=true;joy.pid=e.pointerId;joyEl.setPointerCapture(e.pointerId);joyPoint(e);});joyEl.addEventListener('pointermove',e=>{if(joy.active&&e.pointerId===joy.pid)joyPoint(e);});
function joyEnd(e){if(e.pointerId!==joy.pid)return;joy.active=false;joy.x=joy.y=0;stick.style.transform='translate(0,0)';}joyEl.addEventListener('pointerup',joyEnd);joyEl.addEventListener('pointercancel',joyEnd);
function forward(){return new THREE.Vector3(-Math.sin(cameraYaw),0,-Math.cos(cameraYaw)).normalize();}
function cameraRight(){const f=forward();return new THREE.Vector3(-f.z,0,f.x).normalize();}
function worldToScreen(pos,output=null,vectorScratch=null){
  const result=output||{x:-9999,y:-9999,visible:false,z:2};
  if(!pos){result.x=-9999;result.y=-9999;result.visible=false;result.z=2;return result;}
  const v=vectorScratch?vectorScratch.copy(pos):safeVec3(pos);v.project(camera);
  const visible=v.z>-1&&v.z<1&&Math.abs(v.x)<1.18&&Math.abs(v.y)<1.18;
  result.x=(v.x*.5+.5)*innerWidth;result.y=(-.5*v.y+.5)*innerHeight;result.visible=visible;result.z=v.z;
  return result;
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
function playerExpReward(source,w){
  if(state.currentZone==='grass-meadow'&&!w.elite&&!w.boss){
    const cfg=BALANCE.grassMeadowNormal;
    return source==='capture'?cfg.captureExp:cfg.battleExpBase+(w.level||1)*cfg.battleExpPerLevel;
  }
  return source==='capture'?5:12*(w.level||1);
}
function wildRespawnDelay(w){if(state.currentZone==='grass-meadow'&&w.rare)return BALANCE.grassMeadowRare.respawnMs;if(state.currentZone==='grass-meadow'&&w.boss)return BALANCE.grassMeadowBoss.respawnMs;return state.currentZone==='grass-meadow'&&!w.elite?BALANCE.grassMeadowNormal.respawnMs:BALANCE.wildRespawnMs;}
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
  d.className='world-monster-label'+(w.elite?' elite':'')+(w.boss?' boss':'')+(w.rare?' rare':'');
  d.innerHTML=`<div class="world-label-name">${w.boss?'★ BOSS ':w.elite?'★ ELITE ':w.rare?'✦ RARE ':''}${wildDisplayName(w)} <span>Lv.${w.level}</span></div><div class="world-hp"><i></i></div>`;
  root.appendChild(d); return d;
}
function removeWildLabel(w){ if(w?.labelEl){w.labelEl.remove();w.labelEl=null;} }
function updateWorldLabels(dt){
  for(const w of wilds){
    if(w.dead||!w.labelEl||(w.capturing&&captureSequence?.wild===w)){if(w.labelEl)w.labelEl.classList.add('hidden');continue;}
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
function hitFlashGroup(group){if(!group||!group.traverse)return;const backups=[];group.traverse(child=>{if(child.isMesh&&child.material){backups.push({mesh:child,color:child.material.color.clone(),emissive:child.material.emissive?child.material.emissive.clone():null});child.material.color.setHex(0xffffff);if(child.material.emissive)child.material.emissive.setHex(0xffffff);}});setTimeout(()=>{for(const b of backups){if(b.mesh.material){b.mesh.material.color.copy(b.color);if(b.emissive&&b.mesh.material.emissive)b.mesh.material.emissive.copy(b.emissive);}}},80);}
const captureAttemptLedger=createCaptureAttemptLedger();
let captureAttemptSequence=0,activeCaptureAttempt=null;
function nextCaptureAttemptId(){captureAttemptSequence+=1;return`capture:${Date.now()}:${captureAttemptSequence}`;}
function currentCaptureReferenceLevel(){return snapshotCaptureReferenceLevel((state.party||[]).map(id=>getInst(id)?.level));}
function ensureCaptureReferenceLevel(w){if(!w)return null;if(Number.isInteger(w.captureReferenceLevel)&&w.captureReferenceLevel>=1)return w.captureReferenceLevel;const referenceLevel=currentCaptureReferenceLevel();if(referenceLevel!==null)w.captureReferenceLevel=referenceLevel;return referenceLevel;}
function captureWorkbookType(runtimeType){if(!TYPES.includes(runtimeType))return undefined;return runtimeType==='Fairy'?'LIGHT':runtimeType.toUpperCase();}
function captureIdentityForWild(w){const mapping=monsterCatalogEntry(w?.speciesId);if(!mapping)return null;if(w?.evolutionPath!==null&&w?.evolutionPath!==undefined&&(typeof w.evolutionPath!=='string'||!w.evolutionPath))return null;const stage=w?.evolutionPath?2:1,path=stage===2?wildPath(w):null;const runtimeSecondary=stage===2?(path?.secondaryType??spById[w.speciesId]?.types?.[1]??null):null;const targetSecondaryType=runtimeSecondary===null?null:captureWorkbookType(runtimeSecondary);if(targetSecondaryType===undefined)return null;return Object.freeze({stage,monsterId:stage===2?mapping.workbookStage2MonsterId:mapping.workbookBaseMonsterId,runtimeSecondary,targetSecondaryType});}
function captureWorkbookMonsterId(w){return captureIdentityForWild(w)?.monsterId??null;}
function captureWorkbookVariant(w){return encounterVariantFromFlags({boss:!!w?.boss,elite:!!w?.elite,rare:!!w?.rare});}
function validCapturePolicyForWild(w){const variant=captureWorkbookVariant(w),expected=variant==='elite'?'elite':variant==='boss'?'disabled':'normal';return w?.capturePolicy===expected;}
function captureActiveStatusIds(w){const status=w?.statusState;if(!status||status.ended||!Array.isArray(status.statuses)||!Number.isFinite(status.currentTimeSec))return null;return status.statuses.filter(entry=>entry&&typeof entry.statusId==='string'&&Number.isFinite(entry.expiresAtSec)&&entry.expiresAtSec>status.currentTimeSec).map(entry=>entry.statusId);}
function captureCalculatorInput(w,{referenceLevel=w?.captureReferenceLevel??currentCaptureReferenceLevel(),projectileHit=true}={}){const identity=captureIdentityForWild(w),activeStatusIds=captureActiveStatusIds(w);if(!identity||!activeStatusIds||!validCapturePolicyForWild(w))return null;return{targetId:w.id,monsterId:captureWorkbookMonsterId(w),currentHp:w.hp,maxHp:w.maxHp,activeStatusIds,ballClass:'Basic',ballTargetType:null,targetSecondaryType:identity.targetSecondaryType,targetLevel:w.level,referenceLevel,variant:captureWorkbookVariant(w),ownedMonsterActive:!!(activeSummon||pendingSummon),ballQuantity:state.inventory.captureBalls,projectileHit,targetAlive:!w.dead&&w.hp>0};}
function isWildDamageReady(w){
  if(!validateWildRuntimeActor(w)||w.capturing||!canCombatTargetWild(w))return false;
  const distanceFromHome=distXZ(w.mesh.position,w.home);
  return Number.isFinite(distanceFromHome)&&distanceFromHome<=ENCOUNTER_POLICY.leashRadius;
}
function wildDamageTargetAvailable(w){
  if(!w||w.dead||w.retired||w.capturing)return false;
  if(!validateWildRuntimeActor(w)){quarantineWildAIActor(w);return false;}
  if(distXZ(w.mesh.position,w.home)>ENCOUNTER_POLICY.leashRadius){
    if(w.boss&&bossCombatAuthorized(bossChallengeSession,w.id))exitBossChallenge('outside_leash');
    else resetWild(w,'outside_leash');
    return false;
  }
  return canCombatTargetWild(w);
}
function stableCombatIdCompare(left,right){const a=String(left),b=String(right);return a<b?-1:a>b?1:0;}
function damageWild(w,dmg,meta={}){
  if(!Number.isFinite(dmg)||dmg<=0||!wildDamageTargetAvailable(w))return false;
  const commitReceipt=meta.commitReceipt&&typeof meta.commitReceipt==='object'?meta.commitReceipt:null;
  if(commitReceipt){commitReceipt.committed=false;commitReceipt.damage=0;}
  ensureCaptureReferenceLevel(w);w.engaged=true;
  const hpBefore=w.hp;w.hp=Math.max(0,w.hp-dmg);
  if(commitReceipt){commitReceipt.committed=true;commitReceipt.damage=Math.max(0,hpBefore-w.hp);}
  const hitType=meta.type||wildTypes(w)[0],hitEff=meta.eff??1;
  runBestEffortCombatPresentation(()=>{
    triggerMonsterAction(w.mesh,'hurt',0.22);
    spawnElementalFX(hitType,w.mesh.position.clone().add(new THREE.Vector3(0,.8,0)),'impact',0.75);
    spawnDamageNumber(dmg,w.mesh.position.clone().add(new THREE.Vector3(0,1.35,0)),{type:hitType,eff:hitEff});
    hitFlashGroup(w.mesh);triggerCameraShake(hitEff>1?0.11:0.065,hitEff>1?0.16:0.11);
    if(hitEff>1)playSFX('sfx_hit_effective');else if(hitEff<1)playSFX('sfx_hit_weak');else playSFX('sfx_hit_normal');
    w.mesh.scale.multiplyScalar(.94);setTimeout(()=>{if(!w.dead&&w.mesh)w.mesh.scale.multiplyScalar(1/.94);},90);
    if(w.hp<=0)spawnRingPulse(w.mesh.position.clone(),0xffffff,{scale:.68,life:.28});
  });
  if(w.hp<=0&&meta.deferDefeat!==true)finalizePendingWildDefeat(w,meta.rewardOwnerInstanceId??null);
  return true;
}
function commitAttributedWildDamage(w,dmg,meta,sourceInstanceId){
  const commitReceipt={committed:false,damage:0};
  const ownerId=typeof sourceInstanceId==='string'&&sourceInstanceId?sourceInstanceId:null;
  try{return damageWild(w,dmg,{...meta,deferDefeat:true,commitReceipt});}
  finally{if(commitReceipt.committed){try{logBattleEvent('power',commitReceipt.damage,true,w.id,ownerId);}finally{finalizePendingWildDefeat(w,ownerId);}}}
}
function commitAttributedStatusDamage(w,dmg,meta,ticks){
  const commitReceipt={committed:false,damage:0};
  try{return damageWild(w,dmg,{...meta,deferDefeat:true,commitReceipt});}
  finally{if(commitReceipt.committed){
    const ordered=[...(Array.isArray(ticks)?ticks:[])].sort((left,right)=>(left.atSec??0)-(right.atSec??0)||stableCombatIdCompare(left.sourceInstanceId,right.sourceInstanceId)||stableCombatIdCompare(left.statusId,right.statusId));
    const bySource=new Map();let remaining=commitReceipt.damage,lethalOwnerInstanceId=null,lastSourceInstanceId=null;
    for(const tick of ordered){
      if(!(remaining>0))break;
      const sourceInstanceId=typeof tick?.sourceInstanceId==='string'&&tick.sourceInstanceId?tick.sourceInstanceId:null;
      const applied=Math.min(remaining,Math.max(0,tick?.damage??0));
      if(applied>0&&sourceInstanceId){bySource.set(sourceInstanceId,(bySource.get(sourceInstanceId)||0)+applied);lastSourceInstanceId=sourceInstanceId;}
      remaining-=applied;
      if(!(remaining>0))lethalOwnerInstanceId=sourceInstanceId;
    }
    if(remaining>0&&lastSourceInstanceId){bySource.set(lastSourceInstanceId,(bySource.get(lastSourceInstanceId)||0)+remaining);lethalOwnerInstanceId=lastSourceInstanceId;}
    try{for(const [sourceInstanceId,amount] of [...bySource].sort(([left],[right])=>stableCombatIdCompare(left,right)))logBattleEvent('power',amount,true,w.id,sourceInstanceId);}
    finally{finalizePendingWildDefeat(w,lethalOwnerInstanceId);}
  }}
}
function finalizePendingWildDefeat(w,rewardOwnerInstanceId=null){if(!w||w.dead||!(w.hp<=0))return false;defeatWild(w,rewardOwnerInstanceId);return true;}
function finalizeCommittedWildDefeats(targets,targetDamageCommitted,rewardOwnerInstanceId=null){
  const pending=[];
  for(let index=0;index<targets.length;index++){
    const target=targets[index];
    if(targetDamageCommitted[index]===true&&target&&!target.dead&&target.hp<=0)pending.push({target,index});
  }
  pending.sort((left,right)=>stableCombatIdCompare(left.target.id,right.target.id)||left.index-right.index);
  let firstFailure=null,hasFailure=false;
  for(const {target} of pending){try{finalizePendingWildDefeat(target,rewardOwnerInstanceId);}catch(error){if(!hasFailure){firstFailure=error;hasFailure=true;}}}
  if(hasFailure)throw firstFailure;
}
function monsterExpNeed(level){return 24+level*18;}
function grantMonsterExp(inst,amount){if(!inst)return 0;inst.exp=(inst.exp||0)+amount;let ups=0;while(inst.exp>=monsterExpNeed(inst.level)){inst.exp-=monsterExpNeed(inst.level);levelUpInstance(inst);ups++;}inst.bond=clamp(inst.bond+Math.min(2,amount*.04));return ups;}
// V7.3: Battle event tracking for growth/training (per-encounter, cleared on defeat)
let battleEventLog=[];
function battleEventTargetId(event){return typeof event?.targetId==='string'&&event.targetId?event.targetId:null;}
function battleEventSourceInstanceId(event){return typeof event?.sourceInstanceId==='string'&&event.sourceInstanceId?event.sourceInstanceId:null;}
function logBattleEvent(category,amount,meaningful=true,targetId=null,sourceInstanceId=null){if(TRAINING_LINES.includes(category)&&amount>0&&typeof targetId==='string'&&targetId&&typeof sourceInstanceId==='string'&&sourceInstanceId)battleEventLog.push({category,amount,meaningful,targetId,sourceInstanceId});}
function consumeBattleEventsForTarget(targetId,sourceInstanceId=null){
  if(typeof targetId!=='string'||!targetId)return[];
  const sourceId=typeof sourceInstanceId==='string'&&sourceInstanceId?sourceInstanceId:null;
  const consumed=[],retained=[];
  for(const event of battleEventLog){if(battleEventTargetId(event)===targetId&&battleEventSourceInstanceId(event)===sourceId)consumed.push(event);else retained.push(event);}
  battleEventLog.splice(0,battleEventLog.length,...retained);
  return consumed;
}
function discardBattleEventsForTarget(targetId){
  if(typeof targetId!=='string'||!targetId)return 0;
  const retained=[];let discarded=0;
  for(const event of battleEventLog){if(battleEventTargetId(event)===targetId)discarded++;else retained.push(event);}
  battleEventLog.splice(0,battleEventLog.length,...retained);return discarded;
}
function discardBattleEventsForSource(sourceInstanceId){
  if(typeof sourceInstanceId!=='string'||!sourceInstanceId)return 0;
  const retained=[];let discarded=0;
  for(const event of battleEventLog){if(battleEventSourceInstanceId(event)===sourceInstanceId)discarded++;else retained.push(event);}
  battleEventLog.splice(0,battleEventLog.length,...retained);return discarded;
}
function logCommittedSkillTargetEvents(targets,targetDamageCommitted,targetCommittedDamage,techniqueBudget,sourceInstanceId,additionalEvents=[]){
  let committedCount=0;
  for(let index=0;index<targets.length;index++){if(targetDamageCommitted[index]===true&&targetCommittedDamage[index]>0)committedCount++;}
  if(committedCount===0)return 0;
  const techniqueShare=Math.max(0,techniqueBudget)/committedCount;
  for(let index=0;index<targets.length;index++){
    const target=targets[index],damage=targetCommittedDamage[index];
    if(targetDamageCommitted[index]!==true||!(damage>0)||!target)continue;
    logBattleEvent('power',damage,true,target.id,sourceInstanceId);
    if(techniqueShare>0)logBattleEvent('technique',techniqueShare,true,target.id,sourceInstanceId);
    for(const event of additionalEvents){if(event?.amount>0)logBattleEvent(event.category,event.amount/committedCount,event.meaningful!==false,target.id,sourceInstanceId);}
  }
  return committedCount;
}
function settleCommittedSkillBattleTransaction(targets,targetDamageCommitted,targetCommittedDamage,techniqueBudget,sourceInstanceId,additionalEvents){
  let firstFailure=null,hasFailure=false;
  try{logCommittedSkillTargetEvents(targets,targetDamageCommitted,targetCommittedDamage,techniqueBudget,sourceInstanceId,additionalEvents);}catch(error){firstFailure=error;hasFailure=true;}
  try{finalizeCommittedWildDefeats(targets,targetDamageCommitted,sourceInstanceId);}catch(error){if(!hasFailure){firstFailure=error;hasFailure=true;}}
  if(hasFailure)throw firstFailure;
}
function getEnemyTier(w){if(w.boss)return'boss';if(w.elite)return'elite';if(w.trial)return'trial';if(w.strong)return'strong';return'normal';}
function completeStageClear(stageId,{recovered=false}={}){
  const definition=STAGE_BY_ID[stageId];
  if(!definition)return '';
  const elapsed=!recovered&&stageRunStartedAt?Math.max(1,Math.round((Date.now()-stageRunStartedAt)/1000)):null;
  const next=recordStageClear(state.stageProgress,stageId,{bestTime:elapsed});
  const first=!next.firstClearRewards[stageId];
  const rewards=stageRewards(stageId);
  const currencyRewards=stageCurrencyRewards(stageId);
  if(first){
    for(const [key,value] of Object.entries(rewards))state.inventory[key]=(state.inventory[key]||0)+value;
    const gold=Number.isSafeInteger(currencyRewards.gold)?currencyRewards.gold:0;
    state.wallet={...state.wallet,gold:Math.max(0,state.wallet?.gold||0)+gold};
    next.firstClearRewards[stageId]={grantedAt:Date.now(),rewards};
  }
  state.stageProgress=next;
  try{saveGame(false);}catch{}
  runBestEffortCombatPresentation(()=>{renderStageSelect();renderWarpPrompt();renderStageReward({definition,first,rewards,elapsed});});
  const goldText=first&&currencyRewards.gold?` +${currencyRewards.gold} Gold`:'';
  return first?` • รางวัลครั้งแรก +${Object.entries(rewards).map(([key,value])=>`${key} ${value}`).join(' +')}${goldText}`:' • เคลียร์ด่านแล้ว';
}
function defeatWild(w,rewardOwnerInstanceId=null){
  if(w.dead)return;
  finishBossChallenge(w);
  w.statusState=endEncounterEffects(w.statusState,{nowSec:w.statusState.currentTimeSec});
  w.dead=true;
  try{if(state.currentZone==='grass-meadow')markStarterJourney('battled');}catch{}
  try{if(w.elite)markEliteProgress(w,'defeated');}catch{}
  try{if(w.boss)markBossProgress(w,'defeated',false);}catch{}
  try{removeAndDispose(scene,w.mesh);}catch{}
  try{removeWildLabel(w);}catch{}
  const playerExp=playerExpReward('battle',w);
  state.exp+=playerExp;
  // V7.3: Use resolveBattleGrowth + applyBattleGrowth instead of legacy grantMonsterExp
  const tier=getEnemyTier(w);
  const enemyForm=monsterStatCatalogEntry(w.canonicalFormId);
  const enemy={level:w.level,tier,baseExpYield:enemyForm?.baseExpYield};
  const requestedOwnerId=typeof rewardOwnerInstanceId==='string'&&rewardOwnerInstanceId?rewardOwnerInstanceId:null;
  const rewardOwnerId=requestedOwnerId;
  const rewardInst=rewardOwnerId?getInst(rewardOwnerId):null;
  const rewardSummon=rewardInst&&activeSummon?.inst?.instanceId===rewardInst.instanceId?activeSummon:null;
  const events=consumeBattleEventsForTarget(w.id,rewardOwnerId);
  discardBattleEventsForTarget(w.id);
  let monGain=0,ups=0,trainSummary='',partyShareLine='';
  if(rewardInst){
    const inst=rewardInst;
    // Ensure inst has V7.2 schema fields for applyBattleGrowth
    if(!inst.career)inst.career={battleWins:0,eliteWins:0,bossWins:0,trials:0,milestones:[]};
    if(!inst.training)inst.training={power:0,defense:0,speed:0,technique:0,spirit:0};
    const result=resolveBattleGrowth({monster:inst,enemy:{...enemy,milestoneId:w.boss?'first_boss':undefined},events,outcome:'win'});
    const applied=applyBattleGrowth(inst,result);
    monGain=result.growthExp;ups=applied.growth.leveledUp?applied.growth.toLevel-applied.growth.fromLevel:0;
    synchronizeStage1Learnset(inst);
    refreshStats(inst,false);
    if(ups>0&&rewardSummon)runBestEffortCombatPresentation(()=>spawnLevelUpEffect(rewardSummon.mesh.position.clone()));
    const trainLines=TRAINING_LINES.filter(l=>result.trainingExp[l]>0);
    if(trainLines.length)trainSummary=' • Training: '+trainLines.map(l=>`${l[0].toUpperCase()+l.slice(1)} +${result.trainingExp[l]}`).join(' ');
    // Party share growth (non-active members get 35% of active's growth EXP)
    const share=resolvePartyShareGrowth({enemy,activeGrowthExp:monGain});
    for(const pid of state.party){if(pid&&pid!==inst.instanceId){const pm=getInst(pid);if(pm){if(!pm.growthExp)pm.growthExp=pm.exp||0;const grown=addGrowthExp(pm,share);synchronizeStage1Learnset(pm);if(grown.leveledUp)runBestEffortCombatPresentation(()=>spawnLevelUpEffect(fxWorldPos(pm.instanceId)));}}}
    const partyMembers=state.party.filter(id=>id&&id!==inst.instanceId);
    if(share>0&&partyMembers.length)partyShareLine=`\n  Party Share: +${share} EXP ละ/ตัว (${partyMembers.length} ตัว)`;
  }
  const clearSummary=w.boss&&STAGE_BY_ID[w.zone]?completeStageClear(w.zone):'';
  const tag=w.boss?'BOSS ':w.elite?'ELITE ':w.rare?'RARE ':'';
  let battleMsg=`${tag}${wildDisplayName(w)} ถูกปราบ\n  +${playerExp} Player EXP`;
  if(rewardInst){
    battleMsg+=`\n  ${displayName(rewardInst)}: +${monGain} Growth EXP`;
    if(ups)battleMsg+=` • Lv.Up +${ups}!`;
    if(trainSummary)battleMsg+=trainSummary;
    if(partyShareLine)battleMsg+=partyShareLine;
  }
  runBestEffortCombatPresentation(()=>{msg(battleMsg+clearSummary);renderAll();});
  try{saveGame(false);}catch{}
  const progressionBossSpeciesId=ZONES[w.zone]?.progressionBossSpeciesId,progressionKey=progressionBossSpeciesId?`${w.zone}:${progressionBossSpeciesId}`:null;
  const stageEliteCleared=Boolean(w.elite&&progressionBossSpeciesId&&!state.bossProgress?.defeated?.[progressionKey]);
  const progressionBossCleared=Boolean(w.boss&&w.speciesId===progressionBossSpeciesId&&state.bossProgress?.defeated?.[progressionKey]);
  if(!stageEliteCleared&&!progressionBossCleared)respawnWild(w,wildRespawnDelay(w));
  retireWild(w);
  ensureProgressionEncounter(w.zone);
}
function monsterDamage(attackerInst,move,defender,atkBuff=1,{allowSkillMastery=true,critBonusPct=0}={}){
  const stab=monsterTypes(attackerInst).includes(move.type)?1.5:1;
  const defTypes=defender?.instanceId?monsterTypes(defender):wildTypes(defender);
  const eff=typeEffectiveness(move.type,defTypes);
  const skillRec=allowSkillMastery?(getSkill(attackerInst,move.skillId)||getSkill(attackerInst,move.name)||getSkill(attackerInst,move.name?.split(' • ')[0])):null;
  const mastery=skillRec?masteryRawPower(skillRec.masteryRank):0;
  const derived=derivedStats(instanceCombatBuildSafe(attackerInst));
  const guard=resolveActiveSelfStatusModifiers(defender?.statusState,{incomingType:move.type});
  const defenseMultiplier=guard.ok?guard.defenseMultiplier:1;
  const resolved=liveClassedMoveDamage({
    category:move.category||'Physical',
    movePower:move.power||0,
    attackerStats:{atk:attackerInst.atk||spById[attackerInst.speciesId]?.base.atk||10,spAtk:attackerInst.spAtk||attackerInst.atk||spById[attackerInst.speciesId]?.base.atk||10},
    defenderStats:{def:(defender.def||10)*defenseMultiplier,spDef:(defender.spDef||defender.def||10)*defenseMultiplier},
    attackerLevel:attackerInst.level||1,
    defenderLevel:defender.level||1,
    stab,
    effectiveness:eff,
    atkBuff,
    masteryPower:mastery,
    traitBonus:attackerInst.genes?.trait==='Fierce'?1.08:1,
    critRate:derived.critRate+critBonusPct/100,
    critDamage:derived.critDamage,
    critRoll:Math.random()
  });
  const finalMultiplier=guard.ok?guard.damageTakenMultiplier*guard.elementDamageTakenMultiplier:1;
  return {...resolved,damage:resolved.damage>0?Math.max(1,Math.round(resolved.damage*finalMultiplier)):0};
}
function instanceCombatBuildSafe(inst){
  const sp=spById[inst.speciesId];
  return computeCoreStats(inst,sp,getEvolutionPath(inst),getEquipmentFlat(inst)).build;
}
function wildDamage(w,inst,defenseMultiplier=1,attackMultiplier=1){
  const sp=spById[w.speciesId],move={type:sp.types[0],category:'Physical',power:w.boss?24:18};
  const eff=typeEffectiveness(move.type,monsterTypes(inst));
  return liveClassedMoveDamage({
    category:move.category,
    movePower:move.power,
    attackerStats:{atk:w.atk||sp.base.atk,spAtk:w.spAtk||w.atk||sp.base.atk},
    defenderStats:{def:(inst.def||10)*defenseMultiplier,spDef:(inst.spDef||inst.def||10)*defenseMultiplier},
    attackerLevel:w.level||1,
    defenderLevel:inst.level||1,
    stab:1.5,
    effectiveness:eff,
    atkBuff:attackMultiplier
  });
}
function throwProjectile(type,targetPos,onHit){const color=type==='capture'?0x3b82f6:0x8b5cf6;let mesh=null,projectile=null;try{mesh=new THREE.Mesh(boxGeometry(.14,.14,.14),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.45,transparent:true,opacity:.96}));mesh.userData.spin=true;mesh.position.copy(playerThrowOrigin());mesh.castShadow=true;scene.add(mesh);projectile={mesh,type,color,start:mesh.position.clone(),end:targetPos.clone(),t:0,duration:.55,onHit,lastTrail:0};projectiles.push(projectile);runBestEffortCombatPresentation(()=>spawnBurst(mesh.position.clone(),color,{count:5,life:.18,size:.04,priority:type==='capture'?'P0':'P1'}));return true;}catch{const index=projectile?projectiles.indexOf(projectile):-1;if(index>=0)projectiles.splice(index,1);if(mesh)try{removeAndDispose(scene,mesh);}catch{}return false;}}
function captureChance(w){
  const input=captureCalculatorInput(w,{referenceLevel:w?.captureReferenceLevel??currentCaptureReferenceLevel(),projectileHit:true});
  if(!input)return 0;
  const result=resolveWorkbookCapture(input);
  return result.ok?result.finalChancePct/100:0;
}
let captureAimActive=false;
const captureAimMat=new THREE.LineBasicMaterial({color:0x60a5fa,transparent:true,opacity:.8});
const captureAimGeom=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
const captureAimLine=new THREE.Line(captureAimGeom,captureAimMat);captureAimLine.visible=false;scene.add(captureAimLine);
function capturePrerequisite(){if(state.currentZone==='hub'){msg('ต้องไป Wild Zone เพื่อจับมอน');return false;}if(activeSummon){msg('ต้อง Recall มอนของเราก่อนเข้าสู่ Capture Aim');return false;}if(pendingSummon||projectiles.some(p=>p.type==='summon')){msg('รอ Summon ให้ลงสนามแล้ว Recall ก่อน Capture');return false;}if(activeCaptureAttempt||captureSequence||projectiles.some(p=>p.type==='capture')||wilds.some(w=>w.capturing)){msg('รอผลจับก่อน');return false;}if((state.inventory.captureBalls||0)<=0){msg('Capture Ball หมด • กลับ Ranch แล้ว Keeper จะเติม Starter Kit +5');return false;}return true;}
function beginCaptureAim(){if(!capturePrerequisite())return false;captureAimActive=true;captureAimLine.visible=true;el('captureBtn').classList.add('aiming');renderSkillButtons();msg('Capture Aim • ลากด้านขวาหมุนกล้อง แล้วปล่อยปุ่มเพื่อขว้าง');return true;}
function cancelCaptureAim(){captureAimActive=false;captureAimLine.visible=false;el('captureBtn').classList.remove('aiming');renderSkillButtons();}
function updateCaptureAimVisual(){if(!captureAimActive)return;const t=aimedWild(BALANCE.captureRange,BALANCE.captureAimRadius),start=playerThrowOrigin().clone(),end=t?t.mesh.position.clone().add(new THREE.Vector3(0,.65,0)):player.position.clone().add(forward().multiplyScalar(8)).add(new THREE.Vector3(0,.15,0)),pts=[];for(let i=0;i<=18;i++){const u=i/18,p=start.clone().lerp(end,u);p.y+=Math.sin(u*Math.PI)*2.2;pts.push(p);}captureAimGeom.setFromPoints(pts);}
function executeCaptureThrow(){if(!captureAimActive)return;captureAimActive=false;captureAimLine.visible=false;runBestEffortCombatPresentation(()=>el('captureBtn').classList.remove('aiming'));if(!capturePrerequisite())return;const t=aimedWild(BALANCE.captureRange,BALANCE.captureAimRadius),referenceLevel=t?ensureCaptureReferenceLevel(t):null,targetMonsterId=t?captureWorkbookMonsterId(t):null,attemptId=nextCaptureAttemptId();const begun=beginCaptureAttempt(captureAttemptLedger,{attemptId:attemptId,inventory:state.inventory,targetId:t?.id??null,targetMonsterId,ballClass:'Basic',ballTargetType:null,referenceLevel,ownedMonsterActive:!!(activeSummon||pendingSummon)});if(!begun.ok){runBestEffortCombatPresentation(()=>{msg(begun.reason==='no_capture_ball'?'Capture Ball หมด':'เริ่มการจับไม่ได้ • ข้อมูล encounter ไม่สมบูรณ์');renderHUD();});return;}activeCaptureAttempt={attemptId,wild:t};let targetReady=true;if(t){try{cancelOwnedAITarget(t.id,'capture_started');if(!cancelWildAIAction(t,'capture_started'))targetReady=false;else{t.captureEngagementResumePending=t.engaged===true;t.capturing=true;}}catch{targetReady=false;}}if(!targetReady){abortCaptureSequence(t);runBestEffortCombatPresentation(()=>{msg('ยกเลิกการจับ • Wild AI state ไม่สมบูรณ์');renderHUD();});try{saveGame(false);}catch{}return;}runBestEffortCombatPresentation(()=>{playerVisual.play('throw',{duration:.34});playSFX('sfx_throw_ball');});let end=null,projectileStarted=false;try{end=t?t.mesh.position.clone().add(new THREE.Vector3(0,.65,0)):player.position.clone().add(forward().multiplyScalar(8)).add(new THREE.Vector3(0,.15,0));projectileStarted=throwProjectile('capture',end,ballMesh=>resolveCapture(t,ballMesh,attemptId,end));}catch{}if(!projectileStarted){abortCaptureSequence(t);runBestEffortCombatPresentation(()=>{msg('ยกเลิกการจับ • สร้าง Capture Ball ไม่สำเร็จ');renderHUD();});try{saveGame(false);}catch{}return;}runBestEffortCombatPresentation(()=>{if(t)msg(`ปา Capture Ball → ${t.boss?'BOSS ':t.elite?'ELITE ':''}${wildDisplayName(t)}`);else msg('ปา Capture Ball ตามจุดเล็ง…');renderHUD();});try{saveGame(false);}catch{}}
function captureThrow(){if(pirateThrowPanelPaused())return;if(beginCaptureAim())executeCaptureThrow();}
let captureSequence=null;
function spawnCaptureResultEffect(pos,success){
  if(!pos)return;
  if(success){
    spawnBurst(pos.clone().add(new THREE.Vector3(0,.5,0)),0x22c55e,{count:16,life:.5,size:.06,priority:'P0'});
    spawnRingPulse(pos.clone(),0x22c55e,{scale:.9,life:.4,y:.1,priority:'P0'});
    spawnRingPulse(pos.clone(),0x22c55e,{scale:1.2,life:.5,y:.1,priority:'P0'});
  }else{
    spawnBurst(pos.clone().add(new THREE.Vector3(0,.45,0)),0xef4444,{count:8,life:.3,size:.05,gravity:1,priority:'P0'});
    spawnRingPulse(pos.clone(),0xef4444,{scale:.5,life:.22,y:.1,priority:'P0'});
  }
}
function abortCaptureSequence(targetWild=null){
  const cs=captureSequence,active=activeCaptureAttempt;
  const w=cs?.wild??active?.wild??targetWild;
  if(targetWild&&w!==targetWild)return false;
  if(!cs&&!active&&!targetWild?.capturing)return false;
  captureSequence=null;
  activeCaptureAttempt=null;
  const attemptId=cs?.attemptId??active?.attemptId;
  if(attemptId)try{cancelCaptureAttempt(captureAttemptLedger,attemptId);}catch{}
  if(cs?.ballMesh)try{removeAndDispose(scene,cs.ballMesh);}catch{}
  for(let index=projectiles.length-1;index>=0;index--){const projectile=projectiles[index];if(projectile?.type!=='capture')continue;if(projectile.mesh)try{removeAndDispose(scene,projectile.mesh);}catch{}projectiles.splice(index,1);}
  if(w?.mesh){
    try{w.capturing=false;}catch{}
    if(!w.dead)try{w.mesh.visible=true;}catch{}
  }
  return true;
}
function startCaptureSequence(w,ballMesh,attemptId,resolution){
  if(!w||w.dead||!resolution){if(ballMesh)try{removeAndDispose(scene,ballMesh);}catch{}try{cancelCaptureAttempt(captureAttemptLedger,attemptId);}catch{}if(w)try{w.capturing=false;}catch{}activeCaptureAttempt=null;runBestEffortCombatPresentation(()=>{msg('ปาพลาด/ลูกตกพื้น • เสีย Capture Ball 1 ลูก');renderHUD();});try{saveGame(false);}catch{}return false;}
  const sp=spById[w.speciesId],name=wildDisplayName(w);
  let pos=null;
  try{pos=w.mesh.position.clone();}catch{abortCaptureSequence(w);if(ballMesh)try{removeAndDispose(scene,ballMesh);}catch{}return false;}
  const chance=resolution.finalChancePct/100;
  const cs={attemptId,wild:w,ballMesh:null,pos,sp,name,chance,resolution,success:resolution.captureSucceeded,phaseTime:0,phase:'tension'};
  captureSequence=cs;
  try{
    w.capturing=true;w.mesh.visible=false;
    if(!ballMesh){ballMesh=new THREE.Mesh(boxGeometry(.28,.28,.28),new THREE.MeshStandardMaterial({color:0x3b82f6,emissive:0x3b82f6,emissiveIntensity:clampEmissive(.35),roughness:.2,metalness:.6,transparent:true,opacity:.96}));scene.add(ballMesh);ballMesh.scale.setScalar(1.85);}
    else ballMesh.scale.setScalar(3.6);
    cs.ballMesh=ballMesh;ballMesh.position.copy(pos);ballMesh.position.y=.7;
  }catch{abortCaptureSequence(w);if(ballMesh&&cs.ballMesh!==ballMesh)try{removeAndDispose(scene,ballMesh);}catch{}return false;}
  runBestEffortCombatPresentation(()=>{playSFX('sfx_capture_tension');spawnBurst(pos.clone().add(new THREE.Vector3(0,.7,0)),0xffffff,{count:10,life:.3,size:.05,priority:'P0'});spawnRingPulse(pos.clone(),0x3b82f6,{scale:.55,life:.25,y:.1,priority:'P0'});});
  return true;
}
function finishCaptureSuccess(cs){
  const w=cs.wild,captureProfile=cs.resolution?.captureProfile,identity=captureIdentityForWild(w);
  if(!captureProfile||!identity||captureProfile.monsterId!==identity.monsterId||captureProfile.stage!==identity.stage)throw new Error('capture identity drift');
  const inst=makeInstance(cs.sp,w.level,{origin:'captured',genes:w.genes,potential:w.potential,gender:w.gender,bond:captureProfile.baseBond,formId:captureProfile.stage===2?captureProfile.monsterId:undefined,evolutionPath:w.evolutionPath,secondaryType:identity.runtimeSecondary});
  w.statusState=endEncounterEffects(w.statusState,{nowSec:w.statusState.currentTimeSec});
  try{if(w.rare)markRareDiscovery(w,'captured');}catch{}
  try{if(w.elite)markEliteProgress(w,'captured');}catch{}
  try{if(state.currentZone==='grass-meadow')markStarterJourney('captured');}catch{}
  state.collection.push(inst);
  const empty=state.party.findIndex(x=>x===null);
  if(empty>=0)state.party[empty]=inst.instanceId;
  else state.storage.push(inst.instanceId);
  w.dead=true;
  w.capturing=false;
  const playerExp=playerExpReward('capture',w);
  state.exp+=playerExp;
  const progressionSpeciesId=ZONES[w.zone]?.progressionBossSpeciesId;
  const progressionKey=progressionSpeciesId?`${w.zone}:${progressionSpeciesId}`:null;
  const replacesProgressionElite=Boolean(w.elite&&w.speciesId===progressionSpeciesId&&progressionKey&&!state.eliteProgress?.defeated?.[progressionKey]);
  if(!replacesProgressionElite)respawnWild(w,wildRespawnDelay(w));
  retireWild(w);
  ensureProgressionEncounter(state.currentZone);
  if(cs.ballMesh)try{removeAndDispose(scene,cs.ballMesh);}catch{}
  if(w.mesh)try{removeAndDispose(scene,w.mesh);}catch{}
  try{removeWildLabel(w);}catch{}
  runBestEffortCombatPresentation(()=>{playSFX('sfx_capture_success');spawnCaptureResultEffect(cs.pos,true);spawnGroundDecal(wildTypes(w)[0],cs.pos.clone(),{radius:1.2,duration:.8,intensity:.85});triggerCameraShake(.1,.2);msg(`จับ ${cs.name} สำเร็จ! ${empty>=0?'เข้า Party ช่อง '+(empty+1):'ส่งเข้า Storage'}${w.elite?' • ELITE':w.rare?' • RARE':''} • +${playerExp} Player EXP (${Math.round(cs.chance*100)}%)`);renderAll();});
  try{saveGame(false);}catch{}
  return{ownedMonsterId:inst.instanceId,destination:empty>=0?'party':'storage',playerExp};
}
function finishCaptureFail(cs){
  if(cs.ballMesh)try{removeAndDispose(scene,cs.ballMesh);}catch{}
  const w=cs.wild;if(w)try{w.capturing=false;}catch{}
  if(w?.mesh&&!w.dead){
    let resumed=false;try{resumed=cancelWildAIAction(w,'capture_failed_resume');}catch{}
    if(resumed){try{w.mesh.visible=true;}catch{}try{w.mesh.position.copy(cs.pos);}catch{}try{w.mesh.rotation.z=0;}catch{}try{w.engaged=true;w.state=w.aiState.state;}catch{}}
  }
  const reason=cs.resolution?.reason;
  runBestEffortCombatPresentation(()=>{playSFX('sfx_capture_fail');spawnCaptureResultEffect(cs.pos,false);if(reason==='projectile_miss')msg('ปาพลาด/ลูกตกพื้น • เสีย Capture Ball 1 ลูก');else if(reason==='capture_disabled')msg(`Boss ${cs.name} จับไม่ได้ในเวอร์ชันนี้ • บอลถูกใช้ไปแล้ว`);else if(reason==='invalid_roll')msg('ผลสุ่มจับไม่ถูกต้อง • การจับล้มเหลวแบบปลอดภัย');else msg(`จับ ${cs.name} ไม่สำเร็จ (${Math.round(cs.chance*100)}%) • บอลแตก!`);renderHUD();});
  try{saveGame(false);}catch{}
  return{ownedMonsterId:null,destination:null,playerExp:0};
}
function updateCaptureSequence(dt){
  if(!captureSequence)return;
  const cs=captureSequence;
  if(!cs.wild||cs.wild.dead||!cs.ballMesh){
    abortCaptureSequence();
    if(cs.wild?.dead)runBestEffortCombatPresentation(()=>msg(`${cs.name} หนีไปแล้ว • เสีย Capture Ball 1 ลูก`));
    return;
  }
  cs.phaseTime+=dt;
  const t=Math.min(1,cs.phaseTime/1.7);
  runBestEffortCombatPresentation(()=>{const drop=Math.min(1,cs.phaseTime/.25),shake=.01+t*.04;cs.ballMesh.position.x=cs.pos.x+(Math.random()-.5)*shake;cs.ballMesh.position.z=cs.pos.z+(Math.random()-.5)*shake;cs.ballMesh.position.y=.7-drop*.52;cs.ballMesh.rotation.y+=dt*10;cs.ballMesh.rotation.z=(Math.random()-.5)*.18;const flashColor=t<.5?0x3b82f6:(t<.8?0xfacc15:0xef4444),flashRate=.12+t*.12;if(Math.floor(cs.phaseTime/flashRate)!==Math.floor((cs.phaseTime-dt)/flashRate)){cs.ballMesh.material.color.setHex(flashColor);cs.ballMesh.material.emissive.setHex(flashColor);cs.ballMesh.material.emissiveIntensity=clampEmissive(.35+Math.random()*.25);}});
  if(cs.phaseTime>=1.7){
    captureSequence=null;
    const committed=commitCaptureAttempt(captureAttemptLedger,{attemptId:cs.attemptId,onSuccess:()=>finishCaptureSuccess(cs),onFailure:()=>finishCaptureFail(cs)});
    if(activeCaptureAttempt?.attemptId===cs.attemptId)activeCaptureAttempt=null;
    if(!committed.ok){
      console.warn('Capture commit failed closed',committed.reason);
      if(cs.ballMesh)try{removeAndDispose(scene,cs.ballMesh);}catch{}
      if(cs.wild?.mesh&&!cs.wild.dead){try{cs.wild.capturing=false;}catch{}try{cs.wild.mesh.visible=true;}catch{}}
    }
  }
}
function resolveCapture(w,ballMesh,attemptId,end){
  const projectileHit=!!w&&!w.dead;
  let calculatorInput=null;
  try{calculatorInput=projectileHit?captureCalculatorInput(w,{referenceLevel:w.captureReferenceLevel,projectileHit:true}):null;}catch{}
  if(projectileHit&&!calculatorInput){abortCaptureSequence(w);if(ballMesh)try{removeAndDispose(scene,ballMesh);}catch{}runBestEffortCombatPresentation(()=>{msg('ข้อมูลมอนหรือ encounter ไม่ตรง Workbook • ยกเลิกผลจับแบบปลอดภัย');renderHUD();});try{saveGame(false);}catch{}return;}
  let resolved=null;
  try{resolved=resolveCaptureAttempt(captureAttemptLedger,{attemptId,projectileHit,calculatorInput,rng:Math.random});}catch{}
  if(!resolved?.ok){abortCaptureSequence(w);if(ballMesh)try{removeAndDispose(scene,ballMesh);}catch{}if(resolved?.reason!=='attempt_cancelled')runBestEffortCombatPresentation(()=>msg('ผลจับถูกปฏิเสธ • '+(resolved?.reason??'invalid_state')));return;}
  if(resolved.replay)return;
  const resolution=resolved.attempt.resolution;
  let pos=safeVec3(end),name='เป้าหมาย';
  try{pos=w?.mesh?.position?.clone?.()??pos;}catch{}
  try{if(w)name=wildDisplayName(w);}catch{}
  const cs={attemptId,wild:w,ballMesh,pos,sp:w?spById[w.speciesId]:null,name,chance:resolution.finalChancePct/100,resolution,success:resolution.captureSucceeded};
  if(!projectileHit||!resolution.shouldRoll){
    const committed=commitCaptureAttempt(captureAttemptLedger,{attemptId,onSuccess:()=>finishCaptureSuccess(cs),onFailure:()=>finishCaptureFail(cs)});
    if(activeCaptureAttempt?.attemptId===attemptId)activeCaptureAttempt=null;
    if(!committed.ok){if(ballMesh)try{removeAndDispose(scene,ballMesh);}catch{}if(w?.mesh&&!w.dead){try{w.capturing=false;}catch{}try{w.mesh.visible=true;}catch{}}console.warn('Capture rejection commit failed closed',committed.reason);}
    return;
  }
  startCaptureSequence(w,ballMesh,attemptId,resolution);
}
function summonThrow(){if(pirateThrowPanelPaused())return;const inst=selectedInstance();if(activeCaptureAttempt||captureSequence){msg('รอผล Capture ให้จบก่อนปาเรียกมอน');return;}if(Date.now()<summonCooldownUntil){msg(`Switch cooldown ${(summonCooldownUntil-Date.now())/1000|0}s`);return;}if(state.currentZone==='hub'){msg('ใน Ranch จะแสดงคู่หูอัตโนมัติ • ออกไป Wild Zone ก่อนแล้วค่อยปาเรียก');return;}if(!inst){msg('Party ช่องนี้ว่าง');return;}if(activeSummon||pendingSummon){msg('ลงสนามได้ครั้งละ 1 ตัว • Recall ตัวเดิมก่อน');return;}if(inst.hp<=0||inst.fainted){msg(`${displayName(inst)} Fainted • Heal ฟรีที่ Ranch/NPC ก่อน`);return;}const end=player.position.clone().add(forward().multiplyScalar(4));end.y=.12;pendingSummon={instanceId:inst.instanceId};runBestEffortCombatPresentation(()=>{playerVisual.play('throw',{duration:.34});clearHubCompanion();});const started=throwProjectile('summon',end,()=>{if(!pendingSummon||pendingSummon.instanceId!==inst.instanceId)return false;let spawned=false;try{spawned=spawnOwned(inst,end);}finally{pendingSummon=null;}if(!spawned)runBestEffortCombatPresentation(()=>msg(`เรียก ${displayName(inst)} ไม่สำเร็จ`));return spawned;});if(!started){pendingSummon=null;runBestEffortCombatPresentation(()=>msg(`ปาเรียก ${displayName(inst)} ไม่สำเร็จ`));return;}runBestEffortCombatPresentation(()=>msg(`ปาเรียก ${displayName(inst)}`));}
function spawnOwned(inst,pos){
  try{clearHubCompanion();}catch{}
  try{removeSceneRole('activeSummon');}catch{}
  const sp=spById[inst.speciesId];let mesh=null,summon=null;
  try{
    mesh=monsterMesh(sp,true,inst);
    mesh.userData.worldRole='activeSummon';mesh.userData.instanceId=inst.instanceId;
    mesh.position.copy(pos);mesh.position.y=0;scene.add(mesh);setupMonsterMotion(mesh,sp,inst);
    summon={inst,mesh,target:null,runtimeEpoch:++summonRuntimeEpoch,attackCd:.3,skillCds:MANUAL_SKILL_SLOTS.map(()=>0),skillUiElapsed:.1,aiDecision:null,aiDecisionElapsed:0,statusState:createEncounterStatusState({encounterId:`owned:${inst.instanceId}`,nowSec:0})};
  }catch{if(mesh)try{removeAndDispose(scene,mesh);}catch{}return false;}
  activeSummon=summon;
  try{inst.bond=clamp(inst.bond+.4);}catch{}
  runBestEffortCombatPresentation(()=>{spawnElementalFX(monsterTypes(inst)[0],pos.clone().add(new THREE.Vector3(0,.45,0)),'summon',1.05);msg(`${displayName(inst)} ลงสนาม • AI จะเลือกศัตรูใกล้ที่สุดและโจมตีพื้นฐานเอง`);renderParty();renderSkillButtons();renderHUD();});
  return true;
}
function recall(show=true,setCooldown=true){
  if(pirateThrowPanelPaused())return;
  if(pendingSummon){pendingSummon=null;clearProjectiles();}
  if(!activeSummon){removeSceneRole('activeSummon');if(show)msg('ยังไม่มีมอนในสนาม');return;}
  const summon=activeSummon,inst=summon.inst,mesh=summon.mesh,name=displayName(inst);
  clearSkillSwarms();
  discardBattleEventsForSource(inst.instanceId);
  try{cancelOwnedAIAction(summon,'owned_recall');}catch{}
  try{cancelWildAITarget(ownedWildAiTargetId(summon),'owned_recall');}catch{}
  summon.statusState=endEncounterEffects(summon.statusState,{nowSec:summon.statusState.currentTimeSec});
  try{removeAndDispose(scene,mesh);}catch{}
  activeSummon=null;
  try{removeSceneRole('activeSummon');}catch{}
  if(state.currentZone==='grass-meadow')markStarterJourney('recalled');
  runBestEffortCombatPresentation(()=>syncHubCompanion());
  if(setCooldown)summonCooldownUntil=Date.now()+1000;
  runBestEffortCombatPresentation(()=>{playerVisual.play('recall',{duration:.28});spawnRingPulse(mesh.position.clone(),0x60a5fa,{scale:.62,life:.26});spawnBurst(mesh.position.clone().add(new THREE.Vector3(0,.55,0)),0x60a5fa,{count:8,life:.24,size:.05});if(show)msg(`Recall ${name} แล้ว • Switch cooldown 1s`);renderParty();renderSkillButtons();renderHUD();});
}
function resetActiveBossChallengeStatus(){
  if(!activeSummon)return;
  activeSummon.statusState=endEncounterEffects(activeSummon.statusState,{nowSec:activeSummon.statusState.currentTimeSec});
  activeSummon.statusState=createEncounterStatusState({encounterId:activeSummon.inst.instanceId,nowSec:0});
}
function faintActive(){
  if(!activeSummon){removeSceneRole('activeSummon');return;}
  const summon=activeSummon,inst=summon.inst,mesh=summon.mesh,name=displayName(inst);
  clearSkillSwarms();discardBattleEventsForSource(inst.instanceId);
  inst.hp=0;inst.fainted=true;
  try{cancelOwnedAIAction(summon,'owned_fainted');}catch{}
  try{cancelWildAITarget(ownedWildAiTargetId(summon),'owned_fainted');}catch{}
  summon.statusState=endEncounterEffects(summon.statusState,{nowSec:summon.statusState.currentTimeSec});
  try{removeAndDispose(scene,mesh);}catch{}
  activeSummon=null;pendingSummon=null;summonCooldownUntil=Date.now()+800;
  try{removeSceneRole('activeSummon');}catch{}
  try{syncHubCompanion();}catch{}
  try{saveGame(false);}catch{}
  runBestEffortCombatPresentation(()=>{playSFX('sfx_faint');spawnBurst(mesh.position.clone().add(new THREE.Vector3(0,.6,0)),0xef4444,{count:12,life:.32,size:.06,gravity:1.2});msg(`${name} Fainted • Auto Recall • ต้อง Heal ที่ Ranch/NPC หรือ Item`);renderParty();renderSkillButtons();renderHUD();});
}
function spawnSkillTrail(type, fromPos, toPos) {
  const cfg = typeFx(type);
  const dist = fromPos.distanceTo(toPos);
  const count = Math.max(4, Math.round(dist * 3));
  spawnSkillSprite(type, fromPos.clone(), 0.5, 0.35);
  spawnSkillSprite(type, toPos.clone(), 0.6, 0.4);
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const m = sparkPool.acquire();
    if (!m) break;
    m.visible = true;
    m.material.color.setHex(i % 2 ? cfg.accent : cfg.core);
    m.material.emissive.setHex(i % 2 ? cfg.accent : cfg.core);
    m.material.emissiveIntensity = 0.6;
    m.material.opacity = 0.9;
    m.castShadow = false;
    m.position.lerpVectors(fromPos, toPos, t);
    m.position.y += Math.sin(t * Math.PI) * 0.5;
    m.scale.setScalar(0.04 * (1 - t * 0.5));
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(m);
    const vel = new THREE.Vector3();
    switch (cfg.shape) {
      case 'flame': vel.y = 0.3; break;
      case 'drop': vel.y = -0.2; break;
      case 'spark': vel.x = Math.sin(i * 2) * 0.5; break;
      case 'leaf': vel.set(Math.cos(i)*0.2, 0.1, Math.sin(i)*0.2); break;
      case 'crystal': vel.y = -0.15; break;
      case 'impact': vel.set(0, 0.05, 0); break;
      case 'bubble': vel.y = 0.05; break;
      case 'dust': vel.y = -0.3; break;
      case 'feather': vel.set(Math.sin(i)*0.3, 0.08, Math.cos(i)*0.3); break;
      case 'halo': vel.y = 0.05; break;
      case 'spore': vel.set(Math.cos(i)*0.1, 0.03, Math.sin(i)*0.1); break;
      case 'shard': vel.y = -0.4; break;
      case 'mist': vel.y = 0.03; break;
      case 'arc': vel.y = 0.2; break;
      case 'smoke': vel.set(0, -0.05, 0); break;
      case 'metal': vel.set(0, 0, 0); break;
      case 'star': vel.y = 0.08; break;
      default: vel.set(0, 0.1, 0);
    }
    addTransientEffect({mesh: m, life: 0.3, maxLife: 0.3, kind: 'spark', pooled: true, vel, size: m.scale.x, gravity: 0.2}, 'P4');
  }
}
function spawnAreaWave(type, pos, range) {
  const cfg = typeFx(type);
  spawnSkillSprite(type, pos.clone(), 0.8 + range * 0.1, 0.5);
  const wave = new THREE.Mesh(
    boxGeometry(0.5, 0.05, 0.5),
    new THREE.MeshBasicMaterial({color: cfg.core, transparent: true, opacity: 0.8, wireframe: true, depthWrite: false})
  );
  wave.position.copy(pos);
  wave.position.y = 0.06;
  wave.castShadow = false;
  scene.add(wave);
  addTransientEffect({mesh: wave, life: 0.5, maxLife: 0.5, kind: 'area-wave', expandTo: range * 2}, 'P1');
  for (let i = 0; i < 8; i++) {
    const m = sparkPool.acquire();
    if (!m) break;
    m.visible = true;
    m.material.color.setHex(cfg.accent);
    m.material.emissive.setHex(cfg.accent);
    m.material.emissiveIntensity = 0.5;
    m.material.opacity = 0.9;
    m.castShadow = false;
    const angle = (i / 8) * Math.PI * 2;
    m.position.set(pos.x, pos.y + 0.2, pos.z);
    m.scale.setScalar(0.05);
    scene.add(m);
    addTransientEffect({mesh: m, life: 0.4, maxLife: 0.4, kind: 'spark', pooled: true, vel: new THREE.Vector3(Math.cos(angle) * range, 0.3, Math.sin(angle) * range), size: 0.05, gravity: 0.3}, 'P1');
  }
}
function spawnHealSkillEffect(pos, type) {
  const cfg = typeFx(type);
  for (let i = 0; i < 10; i++) {
    const m = sparkPool.acquire();
    if (!m) break;
    m.visible = true;
    m.material.color.setHex(0x4ade80);
    m.material.emissive.setHex(0x4ade80);
    m.material.emissiveIntensity = 0.6;
    m.material.opacity = 0.9;
    m.castShadow = false;
    const angle = (i / 10) * Math.PI * 2;
    m.position.set(pos.x + Math.cos(angle) * 0.5, pos.y + 0.2 + Math.random() * 0.3, pos.z + Math.sin(angle) * 0.5);
    m.scale.setScalar(0.05);
    scene.add(m);
    addTransientEffect({mesh: m, life: 0.8, maxLife: 0.8, kind: 'spark', pooled: true, vel: new THREE.Vector3(0, 1.0 + Math.random() * 0.3, 0), size: 0.05, gravity: -0.1}, 'P2');
  }
  spawnRingPulse(pos.clone(), 0x4ade80, {scale: 0.8, life: 0.4, y: 0.1, priority: 'P2'});
  spawnElementalFX(type, pos, 'aura', 0.5);
}
function spawnShieldSkillEffect(pos, type, duration) {
  const cfg = typeFx(type);
  const shieldMesh = new THREE.Mesh(boxGeometry(1.4, 1.8, 1.4), new THREE.MeshBasicMaterial({color: cfg.core, transparent: true, opacity: 0, wireframe: true, depthWrite: false}));
  shieldMesh.position.copy(pos);
  shieldMesh.position.y += 0.9;
  shieldMesh.castShadow = false;
  scene.add(shieldMesh);
  addTransientEffect({mesh: shieldMesh, life: duration, maxLife: duration, kind: 'shield-aura'}, 'P2');
  for (let i = 0; i < 8; i++) {
    const m = sparkPool.acquire();
    if (!m) break;
    m.visible = true;
    m.material.color.setHex(cfg.core);
    m.material.emissive.setHex(cfg.core);
    m.material.emissiveIntensity = 0.5;
    m.material.opacity = 0.9;
    m.castShadow = false;
    const angle = (i / 8) * Math.PI * 2;
    m.position.set(pos.x + Math.cos(angle) * 0.6, pos.y + 0.1, pos.z + Math.sin(angle) * 0.6);
    m.scale.setScalar(0.04);
    scene.add(m);
    addTransientEffect({mesh: m, life: 0.6, maxLife: 0.6, kind: 'spark', pooled: true, vel: new THREE.Vector3(0, 0.8, 0), size: 0.04, gravity: -0.05}, 'P2');
  }
}
function spawnBuffAtkSkillEffect(pos, type, duration) {
  const cfg = typeFx(type);
  for (let i = 0; i < 12; i++) {
    const m = sparkPool.acquire();
    if (!m) break;
    m.visible = true;
    m.material.color.setHex(cfg.accent);
    m.material.emissive.setHex(cfg.accent);
    m.material.emissiveIntensity = 0.6;
    m.material.opacity = 0.9;
    m.castShadow = false;
    const angle = (i / 12) * Math.PI * 2;
    m.position.set(pos.x + Math.cos(angle) * 0.4, pos.y + 0.1, pos.z + Math.sin(angle) * 0.4);
    m.scale.setScalar(0.05);
    scene.add(m);
    addTransientEffect({mesh: m, life: 0.7, maxLife: 0.7, kind: 'spark', pooled: true, vel: new THREE.Vector3(0, 1.5 + Math.random() * 0.5, 0), size: 0.05, gravity: -0.3}, 'P2');
  }
  spawnRingPulse(pos.clone(), cfg.accent, {scale: 0.7, life: 0.35, y: 0.1, priority: 'P2'});
  const auraMesh = new THREE.Mesh(boxGeometry(1.2, 2.0, 1.2), new THREE.MeshBasicMaterial({color: cfg.accent, transparent: true, opacity: 0, wireframe: true, depthWrite: false}));
  auraMesh.position.copy(pos);
  auraMesh.position.y += 1.0;
  auraMesh.castShadow = false;
  scene.add(auraMesh);
  addTransientEffect({mesh: auraMesh, life: duration, maxLife: duration, kind: 'buff-aura'}, 'P2');
}
let skillCommandSequence=0;
const skillGroundRaycaster=new THREE.Raycaster();
const skillGroundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
function reticleGroundPoint(){
  const point=new THREE.Vector3();
  skillGroundRaycaster.setFromCamera({x:0,y:0},camera);
  return skillGroundRaycaster.ray.intersectPlane(skillGroundPlane,point)
    ?Object.freeze({x:point.x,z:point.z})
    :null;
}
function createSkillDispatchIntent(index,overrides={}){
  const move=activeSummon?canonicalCombatSkills(activeSummon.inst)[index]:null;
  const suppliedId=Object.prototype.hasOwnProperty.call(overrides,'commandId');
  const commandId=suppliedId?overrides.commandId:`${activeSummon?.inst?.instanceId||'no-active'}:${++skillCommandSequence}`;
  const suppliedGround=Object.prototype.hasOwnProperty.call(overrides,'groundPoint');
  const groundPoint=suppliedGround?overrides.groundPoint:(move?.targetType==='GroundPoint'?reticleGroundPoint():null);
  return Object.freeze({commandId,groundPoint});
}
function dispatchSkill(index,overrides={}){return useSkill(index,createSkillDispatchIntent(index,overrides));}
function skillActorSnapshot(a){
  return Object.freeze({
    id:a.inst.instanceId,
    alive:!a.inst.fainted&&a.inst.hp>0,
    position:Object.freeze({x:a.mesh.position.x,z:a.mesh.position.z}),
  });
}
function skillEnemySnapshots(){
  const snapshots=[];
  for(const wild of wilds){
    if(typeof wild?.id!=='string'||!wild.mesh?.position)continue;
    snapshots.push(Object.freeze({
      id:wild.id,
      alive:wild.dead===false&&Number.isFinite(wild.hp)&&wild.hp>0,
      targetable:isWildDamageReady(wild),
      position:Object.freeze({x:wild.mesh.position.x,z:wild.mesh.position.z}),
    }));
  }
  return Object.freeze(snapshots);
}
function materializeSkillTargets(a,command){
  if(command.targetKind==='Self'){
    if(command.targetIds.length!==1||command.targetIds[0]!==a.inst.instanceId)return [];
    return [Object.freeze({id:a.inst.instanceId,alive:!a.inst.fainted&&a.inst.hp>0,targetable:true,world:a})];
  }
  const byId=new Map();
  for(const wild of wilds){
    if(typeof wild?.id==='string')byId.set(wild.id,wild);
  }
  const targets=[];
  for(const targetId of command.targetIds){
    const wild=byId.get(targetId);
    if(!wild||wild.dead||wild.capturing||!wild.mesh?.position)return [];
    if(!isWildDamageReady(wild))return [];
    targets.push(Object.freeze({id:targetId,alive:true,targetable:true,world:wild}));
  }
  return targets;
}
function canonicalSkillEffectAttacker(a,move){
  const profile=skillDamageProfile(move.skillId),sp=spById[a.inst.speciesId];
  if(!profile||!sp)return null;
  const attack=Number.isFinite(a.inst.atk)?a.inst.atk:(sp.base.atk||10);
  const specialAttack=Number.isFinite(a.inst.spAtk)?a.inst.spAtk:(Number.isFinite(a.inst.spatk)?a.inst.spatk:attack);
  const skillRec=getSkill(a.inst,move.skillId),derived=derivedStats(instanceCombatBuildSafe(a.inst));
  return Object.freeze({
    id:a.inst.instanceId,
    level:a.inst.level,
    types:Object.freeze([...monsterTypes(a.inst)]),
    position:Object.freeze({x:a.mesh.position.x,z:a.mesh.position.z}),
    stats:Object.freeze({ATK:attack,SPATK:specialAttack}),
    hp:a.inst.hp,
    maxHp:a.inst.maxHp,
    statusState:a.statusState,
    critChancePct:derived.critRate*100,
    powerBonusPct:skillRec?masteryRawPower(skillRec.masteryRank)*100:0,
    damageDealtPct:a.inst.genes?.trait==='Fierce'?8:0,
  });
}
function canonicalSkillEffectTargets(materialized){
  return Object.freeze(materialized.map(entry=>{
    const w=entry.world,defense=Number.isFinite(w.def)?w.def:10;
    const specialDefense=Number.isFinite(w.spDef)?w.spDef:(Number.isFinite(w.spdef)?w.spdef:defense);
    return Object.freeze({
      id:w.id,
      level:w.level,
      types:Object.freeze([...wildTypes(w)]),
      position:Object.freeze({x:w.mesh.position.x,z:w.mesh.position.z}),
      stats:Object.freeze({DEF:defense,SPDEF:specialDefense}),
      hp:w.hp,
      maxHp:w.maxHp,
      statusState:w.statusState,
      nowSec:w.statusState?.currentTimeSec??0,
      statusResistancePct:0,
      damageTakenPct:0,
      elementResistPct:0,
    });
  }));
}
function canonicalSkillEffectRequest(a,move,command,materialized){
  return Object.freeze({
    command,
    attacker:canonicalSkillEffectAttacker(a,move),
    targets:command.targetKind==='Self'?Object.freeze([]):canonicalSkillEffectTargets(materialized),
    nowSec:a.statusState.currentTimeSec,
  });
}
const liveSkillFields=[];
function clearSkillFields(){
  for(const field of liveSkillFields)if(field.mesh)removeAndDispose(scene,field.mesh);
  liveSkillFields.length=0;
}
function activateSkillField(a,move,fieldResult,attackerSnapshot=canonicalSkillEffectAttacker(a,move),attackerNowSec=a.statusState.currentTimeSec){
  if(!fieldResult)return;
  const field={
    ...fieldResult,
    mesh:null,
    ageSec:0,
    nextTickSec:fieldResult.tickIntervalSec??Infinity,
    attacker:attackerSnapshot,
    attackerNowSec,
    runtimeType:move.type,
  };
  liveSkillFields.push(field);
  runBestEffortCombatPresentation(()=>{
    let mesh;
    if(fieldResult.kind==='wall'){
      mesh=new THREE.Mesh(new THREE.BoxGeometry(fieldResult.lengthM,1.8,fieldResult.thicknessM),new THREE.MeshStandardMaterial({color:0x93c5fd,emissive:0x2563eb,emissiveIntensity:.35,transparent:true,opacity:.78,roughness:.55,metalness:.05}));
      mesh.position.set(fieldResult.center.x,.9,fieldResult.center.z);
      mesh.rotation.y=Math.atan2(fieldResult.normal.x,fieldResult.normal.z);
      mesh.castShadow=true;scene.add(mesh);
    }else{
      mesh=new THREE.Mesh(new THREE.RingGeometry(fieldResult.radiusM*.72,fieldResult.radiusM,32),new THREE.MeshBasicMaterial({color:0xf59e0b,transparent:true,opacity:.48,side:THREE.DoubleSide,depthWrite:false}));
      mesh.position.set(fieldResult.center.x,.035,fieldResult.center.z);mesh.rotation.x=-Math.PI/2;scene.add(mesh);
    }
    field.mesh=mesh;
  });
}
function fieldBlocksPosition(point){
  for(const field of liveSkillFields){
    if(field.kind!=='wall'||field.ageSec>=field.durationSec)continue;
    const dx=point.x-field.center.x,dz=point.z-field.center.z;
    const along=dx*field.tangent.x+dz*field.tangent.z;
    const across=dx*field.normal.x+dz*field.normal.z;
    if(Math.abs(along)<=field.lengthM/2+.35&&Math.abs(across)<=field.thicknessM/2+.35)return true;
  }
  return false;
}
function moveWildWithFieldCollision(w,direction,distance){
  const next=wildUpdateScratch.next.copy(w.mesh.position).addScaledVector(direction,distance);
  if(fieldBlocksPosition(next))return false;
  w.mesh.position.copy(next);return true;
}
function updateSkillFields(dt){
  for(let index=liveSkillFields.length-1;index>=0;index--){
    const field=liveSkillFields[index];field.ageSec+=dt;
    if(field.kind==='hazard'){
      while(field.nextTickSec<=Math.min(field.ageSec,field.durationSec)+Number.EPSILON){
        for(let wildIndex=wilds.length-1;wildIndex>=0;wildIndex--){
          const w=wilds[wildIndex];
          if(w.dead||w.capturing||!canCombatTargetWild(w)||distXZ(field.center,w.mesh.position)>field.radiusM)continue;
          const defense=Number.isFinite(w.def)?w.def:10,specialDefense=Number.isFinite(w.spDef)?w.spDef:(Number.isFinite(w.spdef)?w.spdef:defense);
          const target={id:w.id,level:w.level,types:[...wildTypes(w)],stats:{DEF:defense,SPDEF:specialDefense},hp:w.hp,maxHp:w.maxHp,statusState:w.statusState};
          const resolved=resolveWorkbookDirectDamage({skillId:field.skillId,attacker:field.attacker,defender:target,attackerNowSec:field.attackerNowSec,defenderNowSec:w.statusState.currentTimeSec},{rng:Math.random});
          if(!resolved.ok||!resolved.hit||resolved.damage<=0)continue;
          const damage=Math.max(1,Math.round(resolved.damage*field.tickDamageRatio));
          commitAttributedWildDamage(w,damage,{type:field.runtimeType,eff:resolved.typeMultiplier??1,statusDamage:true},field.attacker?.id??null);
        }
        field.nextTickSec+=field.tickIntervalSec;
      }
    }
    if(field.ageSec+Number.EPSILON>=field.durationSec){if(field.mesh)removeAndDispose(scene,field.mesh);liveSkillFields.splice(index,1);}
  }
}
const liveSkillSwarms=[];
function clearSkillSwarms(){liveSkillSwarms.length=0;}
function activateSkillSwarm(a,move,summonResult,attackerSnapshot=canonicalSkillEffectAttacker(a,move),attackerNowSec=a.statusState.currentTimeSec){
  if(!summonResult?.applied)return;
  liveSkillSwarms.push({
    ...summonResult,
    ageSec:0,
    nextTickSec:summonResult.tickIntervalSec,
    attacker:attackerSnapshot,
    attackerNowSec,
    runtimeType:move.type,
  });
  const center=new THREE.Vector3(summonResult.center.x,.45,summonResult.center.z);
  runBestEffortCombatPresentation(()=>spawnBurst(center,typeFx(move.type).accent,{count:summonResult.summonCount*3,life:.5,size:.055,gravity:-.15,priority:'P0'}));
}
function updateSkillSwarms(dt){
  for(let index=liveSkillSwarms.length-1;index>=0;index--){
    const swarm=liveSkillSwarms[index];swarm.ageSec+=dt;
    while(swarm.nextTickSec<=Math.min(swarm.ageSec,swarm.durationSec)+Number.EPSILON){
      let target=null,nearestDistance=Infinity;
      for(let wildIndex=0;wildIndex<wilds.length;wildIndex++){
        const candidate=wilds[wildIndex];
        if(candidate.dead||candidate.capturing||!canCombatTargetWild(candidate)||!candidate.mesh?.position)continue;
        const distance=distXZ(swarm.center,candidate.mesh.position);
        if(distance>swarm.radiusM||distance>nearestDistance)continue;
        if(distance===nearestDistance&&target&&stableCombatIdCompare(candidate.id,target.id)>=0)continue;
        target=candidate;nearestDistance=distance;
      }
      if(target){
        const defense=Number.isFinite(target.def)?target.def:10,specialDefense=Number.isFinite(target.spDef)?target.spDef:(Number.isFinite(target.spdef)?target.spdef:defense);
        const defender={id:target.id,level:target.level,types:[...wildTypes(target)],stats:{DEF:defense,SPDEF:specialDefense},hp:target.hp,maxHp:target.maxHp,statusState:target.statusState};
        const resolved=resolveWorkbookDirectDamage({skillId:swarm.skillId,attacker:swarm.attacker,defender,attackerNowSec:swarm.attackerNowSec,defenderNowSec:target.statusState.currentTimeSec},{rng:Math.random});
        if(resolved.ok&&resolved.hit&&resolved.damage>0){
          const damage=Math.max(1,Math.round(resolved.damage*swarm.tickDamageRatio));
          const committed=commitAttributedWildDamage(target,damage,{type:swarm.runtimeType,eff:resolved.typeMultiplier??1,statusDamage:true},swarm.attacker?.id??null);
          if(committed)runBestEffortCombatPresentation(()=>spawnElementalFX(swarm.runtimeType,target.mesh.position.clone().add(new THREE.Vector3(0,.5,0)),'impact',.65));
        }
      }
      swarm.nextTickSec+=swarm.tickIntervalSec;
    }
    if(swarm.ageSec+Number.EPSILON>=swarm.durationSec)liveSkillSwarms.splice(index,1);
  }
}
function canApplyLiveSkill(a,move,command,materialized){
  if(!canExecuteReviewedSkillEffect(command.skillId))return false;
  if(command.targetKind!=='Self'&&materialized.some(target=>!isWildDamageReady(target.world)))return false;
  return validateReviewedSkillEffectRequest(canonicalSkillEffectRequest(a,move,command,materialized)).ok;
}
function awardAcceptedSkillMastery(a,move,res){
  const skillRec=getSkill(a.inst,move.skillId);
  const hitQuality=res&&Number.isFinite(res.eff)?res.eff:1;
  const spam=(a._skillSpam=a._skillSpam||{}),spamCount=spam[move.skillId]||0;
  spam[move.skillId]=spamCount+1;
  const sExp=computeSkillExp({base:move.power||10,hitQuality,targetTier:1,spamCount,contribution:1});
  if(sExp>0&&skillRec){
    const sResult=addSkillExp(a.inst,move.skillId,sExp);
    if(sResult?.rankedUp)runBestEffortCombatPresentation(()=>{showMasteryPopup(displayName(a.inst),move.name,sResult.toRank);spawnMasteryUpEffect(a.mesh.position.clone());});
  }
}
function applyPlannedActorEffect(a,move,actorResult,contributionEvents=[]){
  if(!actorResult)return 0;
  a.inst.hp=actorResult.predictedHp;
  a.statusState=actorResult.nextStatusState;
  const appliedStatusIds=actorResult.statusResults.filter(result=>result.applied).map(result=>result.statusId);
  const activeStatuses=a.statusState.statuses.filter(status=>appliedStatusIds.includes(status.statusId));
  const duration=Math.max(0,...activeStatuses.map(status=>status.expiresAtSec-a.statusState.currentTimeSec));
  if(actorResult.healing>0){
    contributionEvents.push({category:'spirit',amount:actorResult.healing,meaningful:true});
    runBestEffortCombatPresentation(()=>{spawnDamageNumber(actorResult.healing,a.mesh.position.clone().add(new THREE.Vector3(0,1.25,0)),{type:move.type,healing:true,label:'HEAL'});spawnHealSkillEffect(a.mesh.position.clone(),move.type);});
  }
  if(appliedStatusIds.length){
    const shieldStatus=appliedStatusIds.some(statusId=>['ST_DEF_UP','ST_DAMAGE_REDUCE','ST_FIRE_RESIST','ST_POISON_RESIST'].includes(statusId));
    contributionEvents.push({category:shieldStatus?'defense':'power',amount:Math.max(1,duration*3),meaningful:true});
    runBestEffortCombatPresentation(()=>{if(shieldStatus)spawnShieldSkillEffect(a.mesh.position.clone(),move.type,duration);else spawnBuffAtkSkillEffect(a.mesh.position.clone(),move.type,duration);});
  }
  const details=[];
  if(actorResult.requestedHealing>0)details.push(`ฟื้น HP ${actorResult.healing}`);
  if(appliedStatusIds.length)details.push(`Status ${appliedStatusIds.join(', ')} ${duration}s`);
  if(details.length)runBestEffortCombatPresentation(()=>msg(`${displayName(a.inst)} ใช้ ${move.name} • ${details.join(' • ')}`));
  return appliedStatusIds.length;
}
function clampSkillEffectDestination(destination){
  const bounds=ZONES[state.currentZone]?.bounds||{minX:-32,maxX:32,minZ:-32,maxZ:32};
  return{x:THREE.MathUtils.clamp(destination.x,bounds.minX,bounds.maxX),z:THREE.MathUtils.clamp(destination.z,bounds.minZ,bounds.maxZ)};
}
function applyPlannedMobilityEffects(a,move,movementResult,displacementResults,targets,targetDamageCommitted,actualHitCount){
  let appliedCount=0;
  if(movementResult?.applied&&actualHitCount>0){
    const destination=clampSkillEffectDestination(movementResult.destination);
    const from=a.mesh.position.clone(),dx=destination.x-from.x,dz=destination.z-from.z;
    a.mesh.position.x=destination.x;a.mesh.position.z=destination.z;
    if(Math.hypot(dx,dz)>Number.EPSILON)a.mesh.rotation.y=Math.atan2(dx,dz)+Math.PI;
    a.aiDecision=null;
    appliedCount++;
    runBestEffortCombatPresentation(()=>{spawnSkillTrail(move.type,from.clone().add(new THREE.Vector3(0,.5,0)),a.mesh.position.clone().add(new THREE.Vector3(0,.5,0)));spawnBurst(a.mesh.position.clone().add(new THREE.Vector3(0,.45,0)),typeFx(move.type).core,{count:8,life:.22,size:.045,priority:'P0'});});
  }
  for(let index=0;index<displacementResults.length;index++){
    const result=displacementResults[index],target=targets[index];
    if(targetDamageCommitted[index]!==true||!result?.applied||!target||target.dead||!(target.hp>0)||!target.mesh?.position)continue;
    const destination=clampSkillEffectDestination(result.destination);
    if(fieldBlocksPosition(destination))continue;
    const from=target.mesh.position.clone();
    target.mesh.position.x=destination.x;target.mesh.position.z=destination.z;
    appliedCount++;
    runBestEffortCombatPresentation(()=>{spawnSkillTrail(move.type,from.clone().add(new THREE.Vector3(0,.45,0)),target.mesh.position.clone().add(new THREE.Vector3(0,.45,0)));spawnBurst(target.mesh.position.clone().add(new THREE.Vector3(0,.4,0)),typeFx(move.type).accent,{count:6,life:.2,size:.04,priority:'P0'});});
  }
  return appliedCount;
}
function applyPlannedClosureEffects(a,move,healModifierResult,summonResult,committedDamage,attackerSnapshot,attackerNowSec,contributionEvents=[]){
  let appliedCount=0;
  if(!(committedDamage>0))return appliedCount;
  if(healModifierResult?.applied){
    const requestedHealing=Math.max(1,Math.round(committedDamage*healModifierResult.healRatio));
    const healing=Math.max(0,Math.min(a.inst.maxHp-a.inst.hp,requestedHealing));
    if(healing>0){
      a.inst.hp+=healing;
      contributionEvents.push({category:'spirit',amount:healing,meaningful:true});
      appliedCount++;
      runBestEffortCombatPresentation(()=>{spawnDamageNumber(healing,a.mesh.position.clone().add(new THREE.Vector3(0,1.25,0)),{type:move.type,healing:true,label:'DRAIN'});spawnHealSkillEffect(a.mesh.position.clone(),move.type);});
    }
  }
  if(summonResult?.applied){activateSkillSwarm(a,move,summonResult,attackerSnapshot,attackerNowSec);appliedCount++;}
  return appliedCount;
}
function applyAcceptedSkillCommand(a,index,move,command,materialized){
  // Uses has already committed. Cooldown is the first live mutation here; all
  // presentation, damage, bond, mastery, and logs follow the acceptance guard.
  const effectRequest=canonicalSkillEffectRequest(a,move,command,materialized);
  const planned=resolveReviewedSkillEffects(effectRequest,{rng:Math.random});
  if(!planned.ok)throw new Error(`canonical skill effect failed: ${planned.reason}`);
  a.skillCds[index]=command.startCooldownSec;
  const targets=materialized.map(target=>target.world);
  const targetDamageCommitted=new Array(targets.length).fill(false);
  const targetCommittedDamage=new Array(targets.length).fill(0);
  const targetDamageReceipts=targets.map(()=>({committed:false,damage:0}));
  const contributionEvents=[];
  let res=null,actualHitCount=0,actualTotalDamage=0,actualStatusAppliedCount=0;
  let receipt;
  try{
    runBestEffortCombatPresentation(()=>playSFX(`sfx_skill_${move.type.toLowerCase()}`));
  if(command.targetKind==='Self'){
    runBestEffortCombatPresentation(()=>{playerVisual.play('skill',{duration:.28});triggerMonsterAction(a.mesh,'attack',0.22);spawnElementalFX(move.type,a.mesh.position.clone().add(new THREE.Vector3(0,.6,0)),'summon',0.8);spawnSkillSprite(move.type,a.mesh.position.clone().add(new THREE.Vector3(0,.6,0)),0.8,0.6);spawnGroundDecal(move.type,a.mesh.position.clone(),{radius:1.2,duration:1.2,intensity:.95});});
  }else if(command.targetKind==='NearestEnemy'){
    const target=targets[0],effect=planned.targetResults[0],damageResult=effect.damageResult;
    const plannedRes={damage:effect.damage,eff:damageResult.typeMultiplier??1,stab:damageResult.stab??1,crit:damageResult.critical===true};
    runBestEffortCombatPresentation(()=>{playerVisual.play('skill',{duration:.28});triggerMonsterAction(a.mesh,'attack',0.24);spawnElementalFX(move.type,a.mesh.position.clone().add(new THREE.Vector3(0,.6,0)),'burst',1);spawnSkillTrail(move.type,a.mesh.position.clone().add(new THREE.Vector3(0,.6,0)),target.mesh.position.clone().add(new THREE.Vector3(0,.5,0)));});
    if(effect.hit){
      const damageReceipt=targetDamageReceipts[0];
      damageWild(target,plannedRes.damage,{type:move.type,eff:plannedRes.eff,deferDefeat:true,commitReceipt:damageReceipt});
      if(damageReceipt.committed){
        targetDamageCommitted[0]=true;
        const committedDamage=damageReceipt.damage;
        targetCommittedDamage[0]=committedDamage;
        res={...plannedRes,damage:committedDamage};actualHitCount++;actualTotalDamage+=committedDamage;
        if(!target.dead&&target.hp>0&&effect.nextStatusState){
          target.statusState=effect.nextStatusState;
          actualStatusAppliedCount+=(effect.statusResults||[]).filter(result=>result.applied).length;
        }
        const [label]=effectLabel(res.eff);
        runBestEffortCombatPresentation(()=>{spawnSkillSprite(move.type,target.mesh.position.clone().add(new THREE.Vector3(0,.5,0)),0.7,0.45);spawnElementalFX(move.type,target.mesh.position.clone().add(new THREE.Vector3(0,.5,0)),'impact',0.9);spawnGroundDecal(move.type,target.mesh.position.clone(),{radius:1.05,duration:1.15,intensity:plannedRes.eff>1?1.2:1});triggerCameraShake(res.eff>1?0.14:0.09,0.16);msg(`${displayName(a.inst)} ใช้ ${move.name} [${TYPE_TH[move.type]}] -${committedDamage} • ${label}${res.stab>1?' • STAB':''}${actualStatusAppliedCount?` • Status ${actualStatusAppliedCount}`:''}`);});
      }else runBestEffortCombatPresentation(()=>msg(`${displayName(a.inst)} ใช้ ${move.name} • โดน 0/1 ตัว • รวม 0 Damage`));
    }else runBestEffortCombatPresentation(()=>msg(`${displayName(a.inst)} ใช้ ${move.name} • MISS`));
  }else if(command.targetKind==='GroundPoint'){
    const anchor=new THREE.Vector3(command.targetPoint.x,0,command.targetPoint.z);
    runBestEffortCombatPresentation(()=>{playerVisual.play('skill',{duration:.28});triggerMonsterAction(a.mesh,'attack',0.26);spawnElementalFX(move.type,a.mesh.position.clone().add(new THREE.Vector3(0,.65,0)),'summon',0.9);spawnGroundDecal(move.type,anchor,{radius:1.6,duration:1.45,intensity:1.15});msg(`${displayName(a.inst)} ใช้ ${move.name} • สร้างกำแพงที่จุดเล็ง`);});
  }else{
    const anchor=new THREE.Vector3(command.targetPoint.x,0,command.targetPoint.z);
    runBestEffortCombatPresentation(()=>{playerVisual.play('skill',{duration:.28});triggerMonsterAction(a.mesh,'attack',0.26);spawnElementalFX(move.type,a.mesh.position.clone().add(new THREE.Vector3(0,.65,0)),'summon',0.9);spawnGroundDecal(move.type,anchor,{radius:Math.min(2.8,command.radiusM),duration:1.45,intensity:1.15});spawnAreaWave(move.type,anchor,command.radiusM);triggerCameraShake(.11,.17);});
    for(let targetIndex=0;targetIndex<targets.length;targetIndex++){
      const target=targets[targetIndex],effect=planned.targetResults[targetIndex],damageResult=effect.damageResult;
      const plannedRes={damage:effect.damage,eff:damageResult.typeMultiplier??1,stab:damageResult.stab??1,crit:damageResult.critical===true};
      if(!effect.hit)continue;
      const damageReceipt=targetDamageReceipts[targetIndex];
      damageWild(target,plannedRes.damage,{type:move.type,eff:plannedRes.eff,deferDefeat:true,commitReceipt:damageReceipt});
      if(!damageReceipt.committed)continue;
      targetDamageCommitted[targetIndex]=true;
      const committedDamage=damageReceipt.damage;
      targetCommittedDamage[targetIndex]=committedDamage;
      res={...plannedRes,damage:committedDamage};actualHitCount++;actualTotalDamage+=committedDamage;
      if(!target.dead&&target.hp>0&&effect.nextStatusState){
        target.statusState=effect.nextStatusState;
        actualStatusAppliedCount+=(effect.statusResults||[]).filter(result=>result.applied).length;
      }
      runBestEffortCombatPresentation(()=>{spawnElementalFX(move.type,target.mesh.position.clone().add(new THREE.Vector3(0,.45,0)),'impact',0.75);spawnGroundDecal(move.type,target.mesh.position.clone(),{radius:.9,duration:1.05,intensity:plannedRes.eff>1?1.15:.9});});
    }
    runBestEffortCombatPresentation(()=>msg(`${displayName(a.inst)} ใช้ ${move.name} แบบ Area • โดน ${actualHitCount}/${targets.length} ตัว • รวม ${actualTotalDamage} Damage${actualStatusAppliedCount?` • Status ${actualStatusAppliedCount}`:''}`));
  }
  actualStatusAppliedCount+=applyPlannedActorEffect(a,move,planned.actorResult,contributionEvents);
  activateSkillField(a,move,planned.fieldResult,effectRequest.attacker,effectRequest.nowSec);
  const mobilityAppliedCount=applyPlannedMobilityEffects(a,move,planned.movementResult,planned.displacementResults,targets,targetDamageCommitted,actualHitCount);
  const closureAppliedCount=applyPlannedClosureEffects(a,move,planned.healModifierResult,planned.summonResult,actualTotalDamage,effectRequest.attacker,effectRequest.nowSec,contributionEvents);
  const requiresTargetDamage=planned.targetResults.length>0;
  if(!requiresTargetDamage||planned.hitCount===0||actualHitCount>0)a.inst.bond=clamp(a.inst.bond+.3);
  if(!requiresTargetDamage||actualHitCount>0)awardAcceptedSkillMastery(a,move,res);
  receipt=Object.freeze({effectMode:planned.effectMode,hitCount:actualHitCount,totalDamage:actualTotalDamage,statusAppliedCount:actualStatusAppliedCount,mobilityAppliedCount,closureAppliedCount,rngDraws:planned.rngDraws});
  }finally{
    for(let targetIndex=0;targetIndex<targetDamageReceipts.length;targetIndex++){
      const damageReceipt=targetDamageReceipts[targetIndex];
      if(!damageReceipt.committed||targetDamageCommitted[targetIndex]===true)continue;
      targetDamageCommitted[targetIndex]=true;targetCommittedDamage[targetIndex]=damageReceipt.damage;
      actualHitCount++;actualTotalDamage+=damageReceipt.damage;
    }
    settleCommittedSkillBattleTransaction(targets,targetDamageCommitted,targetCommittedDamage,move.power||10,a.inst.instanceId,contributionEvents);
  }
  runBestEffortCombatPresentation(()=>{renderParty();renderSkillButtons();});
  return receipt;
}
function skillFailureMessage(move,result){
  const reasons={
    cooldown_active:`${move?.name||'สกิล'} ยังติดคูลดาวน์`,
    no_uses:`${move?.name||'สกิล'} Uses หมด • กลับ Ranch เพื่อฟื้นฟู`,
    no_valid_target:`${move?.name||'สกิล'}: ไม่มีศัตรูในระยะ`,
    ground_point_required:`${move?.name||'สกิล'}: เล็งพื้นไม่สำเร็จ`,
    ground_point_out_of_range:`${move?.name||'สกิล'}: จุดเล็งอยู่นอกระยะ`,
    status_controlled:`${move?.name||'สกิล'}: ใช้ไม่ได้ขณะติดสถานะควบคุม`,
    invalid_status_context:`${move?.name||'สกิล'}: สถานะการต่อสู้ไม่สมบูรณ์ • ยกเลิกเพื่อความปลอดภัย`,
    not_equipped:'ยังไม่มีสกิลช่องนี้',
    not_ready:'Targeting พร้อมแล้ว • เอฟเฟกต์สกิลนี้รอระบบขั้นถัดไป',
    duplicate_cast:'คำสั่งซ้ำถูกปฏิเสธ',
    target_count_mismatch:'เป้าหมายเปลี่ยนก่อนใช้สกิล • ยกเลิกคำสั่ง',
    apply_failed:'คำสั่งถูกยืนยันและใช้ Uses แล้ว • เอฟเฟกต์ขัดข้องและจะไม่ลองซ้ำ',
  };
  return reasons[result.reason]||`${move?.name||'สกิล'} ใช้ไม่ได้ (${result.reason})`;
}
let combatReasonHoldText='';
let combatReasonHoldUntil=0;
function announceCombatReason(text){
  if(!text)return;
  msg(text);
  combatReasonHoldText=text;
  combatReasonHoldUntil=Date.now()+2500;
  setTextIfChanged(el('actionReason'),text);
}
function visibleCombatReason(fallback){
  return Date.now()<combatReasonHoldUntil&&combatReasonHoldText?combatReasonHoldText:fallback;
}
function statusDamageType(ticks,fallback='Normal'){
  const statusId=Array.isArray(ticks)?ticks[0]?.statusId:null;
  return ({ST_BURN:'Fire',ST_POISON:'Poison',ST_BLEED:'Normal',ST_SWARM:'Bug'})[statusId]||fallback;
}
function useSkill(index,intent={}){
  if(pirateThrowPanelPaused())return Object.freeze({ok:false,reason:'panel_paused'});
  if(!activeSummon){announceCombatReason('ต้องปาเรียกมอนออกมาก่อน');return Object.freeze({ok:false,reason:'no_active_monster'});}
  const a=activeSummon,slot=MANUAL_SKILL_SLOTS[index],move=canonicalCombatSkills(a.inst)[index];
  if(!slot||!move){const result=Object.freeze({ok:false,reason:slot?'not_equipped':'slot_locked'});announceCombatReason(skillFailureMessage(move,result));return result;}
  const control=resolveCombatStatusRuntime(a.statusState);
  if(!control.ok||!control.canUseSkill){
    const result=Object.freeze({ok:false,reason:control.ok?'status_controlled':'invalid_status_context'});
    announceCombatReason(skillFailureMessage(move,result));
    return result;
  }
  const result=executeEquippedSkillCommand(a.inst,{
    slot,
    commandId:intent.commandId,
    actor:skillActorSnapshot(a),
    enemies:skillEnemySnapshots(),
    groundPoint:intent.groundPoint??null,
    cooldownRemainingSec:a.skillCds[index]||0,
  },{
    materializeTargets:command=>materializeSkillTargets(a,command),
    canApply:(command,targets)=>canApplyLiveSkill(a,move,command,targets),
    applyAccepted:(command,targets)=>applyAcceptedSkillCommand(a,index,move,command,targets),
  });
  if(!result.ok){
    const text=skillFailureMessage(move,result);
    renderSkillButtons();
    announceCombatReason(text);
  }
  return result;
}
function createOwnedBasicAiScratch(){
  const actor={id:null,speciesId:null,alive:false,position:{x:0,z:0}};
  return {request:{actor,enemies:[],currentTargetId:null,attackReady:false},enemyPool:[]};
}
function fillOwnedBasicAiRequest(scratch,a,liveWilds){
  const request=scratch.request,actor=request.actor;
  actor.id=a?.inst?.instanceId;
  actor.speciesId=a?.inst?.speciesId;
  actor.alive=(a?.inst?.fainted===undefined||a.inst.fainted===false)&&Number.isFinite(a?.inst?.hp)&&a.inst.hp>0;
  actor.position.x=a?.mesh?.position?.x;
  actor.position.z=a?.mesh?.position?.z;
  const count=Array.isArray(liveWilds)?liveWilds.length:0;let targetCount=0;
  for(let index=0;index<count;index++){
    const wild=liveWilds[index];
    if(!wild||wild.dead===true||wild.retired===true||!Number.isFinite(wild.mesh?.position?.x)||!Number.isFinite(wild.mesh?.position?.z))continue;
    let target=scratch.enemyPool[targetCount];
    if(!target){target={id:null,alive:false,targetable:false,position:{x:0,z:0}};scratch.enemyPool[targetCount]=target;}
    target.id=wild?.id;
    target.alive=wild?.dead===false&&Number.isFinite(wild?.hp)&&wild.hp>0;
    target.targetable=(wild?.capturing===undefined||wild.capturing===false)&&isWildDamageReady(wild);
    if(wild?.combatEnabled===false)target.targetable=false;
    target.position.x=wild?.mesh?.position?.x;
    target.position.z=wild?.mesh?.position?.z;
    request.enemies[targetCount++]=target;
  }
  request.enemies.length=targetCount;
  request.currentTargetId=a?.target?.id??null;
  request.attackReady=a?.attackCd<=0;
  return request;
}
const ownedBasicAiScratch=createOwnedBasicAiScratch();
const ownedBasicAiMoveScratch=new THREE.Vector3();
const ownedBasicAiImpactScratch=new THREE.Vector3();
function shouldRunOwnedCadence(state,elapsedField,dt,hz,force=false){
  const interval=Number.isFinite(hz)&&hz>0?1/hz:Infinity;
  const elapsed=(Number.isFinite(state?.[elapsedField])?state[elapsedField]:0)+(Number.isFinite(dt)&&dt>0?dt:0);
  if(force||elapsed+Number.EPSILON>=interval){state[elapsedField]=force?0:Math.max(0,elapsed-interval);return true;}
  state[elapsedField]=elapsed;
  return false;
}
function updateOwnedSkillCooldownUi(a){
  const skills=canonicalCombatSkills(a?.inst);
  for(let i=0;i<MANUAL_SKILL_SLOTS.length;i++){
    const cd=a.skillCds[i],btn=el(`skill${i+1}Btn`);if(!btn)continue;
    syncSkillButtonResourceUi(btn,skills[i],cd);
  }
}
function materializeOwnedBasicAiTarget(a,decision){
  if(!decision?.ok||decision.targetId===null)return null;
  let target=null,matchCount=0;
  for(const wild of wilds){if(wild?.id===decision.targetId){target=wild;matchCount++;if(matchCount>1)return null;}}
  if(matchCount!==1)return null;
  const actorPosition=a?.mesh?.position,targetPosition=target?.mesh?.position;
  if(target.dead!==false||!Number.isFinite(target.hp)||target.hp<=0
    ||!(target.capturing===undefined||target.capturing===false)||target.combatEnabled===false
    ||!isWildDamageReady(target)
    ||!Number.isFinite(actorPosition?.x)||!Number.isFinite(actorPosition?.z)
    ||!Number.isFinite(targetPosition?.x)||!Number.isFinite(targetPosition?.z))return null;
  const distanceM=distXZ(actorPosition,targetPosition);
  if(!Number.isFinite(distanceM)||distanceM>OWNED_BASIC_AI_POLICY.retainRangeM)return null;
  if(decision.action==='basic_attack'&&distanceM>OWNED_BASIC_AI_POLICY.basicAttackRangeM)return null;
  return target;
}
function commitOwnedBasicDamage(liveTarget,res,basic){
  const commitReceipt={committed:false,damage:0};
  try{return damageWild(liveTarget,res.damage,{type:basic.type,eff:res.eff,deferDefeat:true,commitReceipt});}
  finally{if(commitReceipt.committed){try{logBattleEvent('power',commitReceipt.damage,true,liveTarget.id,basic.sourceInstanceId);}finally{finalizePendingWildDefeat(liveTarget,basic.sourceInstanceId);}}}
}
function updateOwned(dt){
  const a=activeSummon;if(!a)return;const sp=spById[a.inst.speciesId];
  if(!isEncounterStatusState(a.statusState)||a.statusState.ended){cancelOwnedAIAction(a,'invalid_status_context');return;}
  const statusAdvance=advanceEncounterEffects(a.statusState,{toSec:a.statusState.currentTimeSec+dt,targetHp:a.inst.hp,targetMaxHp:a.inst.maxHp});
  if(statusAdvance.ok){a.statusState=statusAdvance.state;if(statusAdvance.damage>0){const tickDamage=Math.max(1,Math.round(statusAdvance.damage));a.inst.hp=statusAdvance.targetHp;const tickType=statusDamageType(statusAdvance.ticks,monsterTypes(a.inst)[0]);ownedBasicAiImpactScratch.copy(a.mesh.position);ownedBasicAiImpactScratch.y+=1.25;if(statusAdvance.fainted){faintActive();runBestEffortCombatPresentation(()=>spawnDamageNumber(tickDamage,ownedBasicAiImpactScratch,{type:tickType,label:'STATUS'}));return;}runBestEffortCombatPresentation(()=>{spawnDamageNumber(tickDamage,ownedBasicAiImpactScratch,{type:tickType,label:'STATUS'});triggerMonsterAction(a.mesh,'hurt',0.16);renderParty();});}}
  const selfModifiers=resolveActiveSelfStatusModifiers(a.statusState);
  const control=resolveCombatStatusRuntime(a.statusState);
  const attackMultiplier=selfModifiers.ok?selfModifiers.attackMultiplier:1;
  const speedMultiplier=selfModifiers.ok?selfModifiers.speedMultiplier:1;
  const critBonusPct=selfModifiers.ok?selfModifiers.critChancePct:0;
  const cooldownElapsed=dt*(control.ok?control.cooldownRecoveryMultiplier:1);
  a.attackCd=tickCooldown(a.attackCd,cooldownElapsed);for(let i=0;i<a.skillCds.length;i++)a.skillCds[i]=Math.max(0,a.skillCds[i]-cooldownElapsed);if(shouldRunOwnedCadence(a,'skillUiElapsed',dt,10))updateOwnedSkillCooldownUi(a);
  if(shouldRunOwnedCadence(a,'aiDecisionElapsed',dt,qualityProfile.nearAiHz,!a.aiDecision)){
    const previousDecision=a.aiDecision,decisionStarted=MONSTER_AI_DEBUG?performance.now():0;
    a.aiDecision=resolveOwnedBasicAiAction(fillOwnedBasicAiRequest(ownedBasicAiScratch,a,wilds));
    recordOwnedAiTrace(a,{fromState:previousDecision?.action??'idle',toState:a.aiDecision?.action??'idle',targetId:a.aiDecision?.targetId??null,action:a.aiDecision?.action??'idle',reason:a.aiDecision?.reason??'resolver_rejected',timeSec:a.statusState.currentTimeSec,durationMs:MONSTER_AI_DEBUG?performance.now()-decisionStarted:0,rejected:a.aiDecision?.ok!==true,decision:true});
  }
  const decision=a.aiDecision;
  const t=materializeOwnedBasicAiTarget(a,decision);a.target=t;if(!t&&decision?.targetId!==null)cancelOwnedAIAction(a,'runtime_revalidation_rejected');let moving=false;
  if(t&&control.ok&&control.forcedRetreat&&control.canMove){
    moving=true;const dir=ownedBasicAiMoveScratch.copy(a.mesh.position).sub(t.mesh.position);dir.y=0;if(dir.lengthSq()>0.000001)dir.normalize();else dir.set(0,0,-1);a.mesh.position.addScaledVector(dir,(a.inst.spd*.18+1.5)*speedMultiplier*dt);a.mesh.rotation.y=monsterLookYaw(dir,a.mesh);
  }else if(t&&decision.action==='move'&&control.ok&&control.canMove){
    moving=true;const dir=ownedBasicAiMoveScratch.set(decision.direction.x,0,decision.direction.z);a.mesh.position.addScaledVector(dir,(a.inst.spd*.18+1.5)*speedMultiplier*dt);a.mesh.rotation.y=monsterLookYaw(dir,a.mesh);
  }else if(t&&decision.action==='basic_attack'&&a.attackCd<=0&&!a.inst.fainted&&a.inst.hp>0&&control.ok&&control.canAttack){
    const liveTarget=materializeOwnedBasicAiTarget(a,decision);
    if(liveTarget){
      a.attackCd=OWNED_BASIC_AI_POLICY.basicAttackCooldownSec;
      recordOwnedAiTrace(a,{fromState:decision.action,toState:decision.action,targetId:liveTarget.id,action:'basic_attack',reason:'runtime_commit',timeSec:a.statusState.currentTimeSec});
      runBestEffortCombatPresentation(()=>triggerMonsterAction(a.mesh,'attack',0.22));
      ownedBasicAiImpactScratch.copy(liveTarget.mesh.position);ownedBasicAiImpactScratch.y+=.45;
      if(control.ok&&Math.random()>=control.accuracyMultiplier){
        runBestEffortCombatPresentation(()=>{spawnDamageNumber(0,ownedBasicAiImpactScratch,{miss:true});msg(`${displayName(a.inst)} โจมตีพลาดเพราะสถานะ`);});
      }else{
        const basic={name:'Basic Attack',type:sp.types[0],category:'Physical',power:OWNED_BASIC_AI_POLICY.basicAttackPower,commandSource:OWNED_BASIC_AI_POLICY.commandSource,sourceInstanceId:a.inst.instanceId};
        const res=monsterDamage(a.inst,basic,liveTarget,attackMultiplier,{allowSkillMastery:false,critBonusPct});
        const committed=commitOwnedBasicDamage(liveTarget,res,basic);
        if(committed)runBestEffortCombatPresentation(()=>spawnElementalFX(monsterTypes(a.inst)[0],ownedBasicAiImpactScratch,'impact',0.62));
      }
    }
    else cancelOwnedAIAction(a,'pre_damage_revalidation_rejected');
  }
  animateEntity(a.mesh,dt,moving,1); animateMonster(a.mesh,dt,moving);
}
const wildAggressorCandidates=[];
const wildAggressorCandidatePool=[];
const engagedWildIdsScratch=new Set();
let wildAiFrameTarget=null;
function currentWildAiTargetKey(){return activeSummon&&activeSummon.mesh?ownedWildAiTargetId(activeSummon):playerWildAiTargetId();}
function resolveWildAiTarget(){
  const encounterId=wildAiEncounterId();
  if(activeSummon&&activeSummon.mesh){
    const summon=activeSummon,id=ownedWildAiTargetId(summon),position=summon.mesh?.position;
    return{id,kind:'owned',encounterId,runtimeGeneration:zoneGeneration,entity:summon,position,alive:(summon.inst?.fainted===undefined||summon.inst.fainted===false)&&Number.isFinite(summon.inst?.hp)&&summon.inst.hp>0,targetable:!!id&&Number.isFinite(position?.x)&&Number.isFinite(position?.z)};
  }
  const position=player?.position;
  return{id:playerWildAiTargetId(),kind:'player',encounterId,runtimeGeneration:zoneGeneration,entity:player,position,alive:Number.isFinite(playerData?.hp)&&playerData.hp>0,targetable:Number.isFinite(position?.x)&&Number.isFinite(position?.z)};
}
function wildAiTargetAvailable(target){
  if(!target||target.runtimeGeneration!==zoneGeneration||target.id!==currentWildAiTargetKey()||!target.alive||!target.targetable||!Number.isFinite(target.position?.x)||!Number.isFinite(target.position?.z))return false;
  if(target.kind==='owned')return target.entity===activeSummon&&ownedWildAiTargetId(activeSummon)===target.id&&(activeSummon.inst?.fainted===undefined||activeSummon.inst.fainted===false)&&Number.isFinite(activeSummon.inst?.hp)&&activeSummon.inst.hp>0;
  return target.kind==='player'&&target.entity===player&&Number.isFinite(playerData?.hp)&&playerData.hp>0;
}
function selectWildAggressors(){
  wildAiFrameTarget=resolveWildAiTarget();
  const target=wildAiFrameTarget;
  if(!wildAiTargetAvailable(target)){engagedWildIdsScratch.clear();return engagedWildIdsScratch;}
  for(let index=0;index<wilds.length;index++){
    const w=wilds[index];
    let candidate=wildAggressorCandidatePool[index];
    if(!candidate){candidate={id:null,dead:true,capturing:false,engaged:false,resumePriority:false,targetValid:false,distanceToTarget:Infinity,distanceFromHome:Infinity};wildAggressorCandidatePool[index]=candidate;}
    candidate.id=w?.id;
    candidate.dead=w?.dead;
    candidate.capturing=w?.capturing;
    candidate.engaged=w?.engaged;
    candidate.resumePriority=w?.captureEngagementResumePending===true;
    candidate.targetValid=!!w?.mesh?.position&&canCombatTargetWild(w);
    if(w?.retired||w?.runtimeGeneration!==zoneGeneration)candidate.targetValid=false;
    candidate.distanceToTarget=w?.mesh?.position?distXZ(w.mesh.position,target.position):Infinity;
    candidate.distanceFromHome=w?.mesh?.position&&w?.home?distXZ(w.mesh.position,w.home):Infinity;
    wildAggressorCandidates[index]=candidate;
  }
  wildAggressorCandidates.length=wilds.length;
  return fillEngagedWildIds(wildAggressorCandidates,ENCOUNTER_POLICY,engagedWildIdsScratch,bossChallengeSession.activeBossId);
}
function wildEncounterResetCause({assigned=true,targetAvailable=true,combatAuthorized=true,distanceToTarget=Infinity,distanceFromHome=Infinity}={}){
  if(!Number.isFinite(distanceFromHome)||distanceFromHome>ENCOUNTER_POLICY.leashRadius)return'outside_leash';
  if(!targetAvailable||!combatAuthorized)return'target_invalid';
  if(!Number.isFinite(distanceToTarget)||distanceToTarget>ENCOUNTER_POLICY.disengageRadius)return'outside_disengage';
  if(!assigned)return'engagement_slot_lost';
  return'policy_reset';
}
function preflightWildEncounterBoundaries(){
  const engagedWildIds=selectWildAggressors(),target=wildAiFrameTarget;
  const targetAvailable=wildAiTargetAvailable(target);
  for(let index=wilds.length-1;index>=0;index--){
    const w=wilds[index];
    if(!w||w.dead||w.retired||w.capturing||!w.engaged)continue;
    const assigned=engagedWildIds.has(w.id);
    const combatAuthorized=canCombatTargetWild(w),targetValid=assigned&&targetAvailable&&combatAuthorized;
    const resetRequest=wildUpdateScratch.resetRequest;
    resetRequest.engaged=true;
    resetRequest.targetValid=targetValid;
    resetRequest.distanceToTarget=targetAvailable?distXZ(w.mesh.position,target.position):Infinity;
    resetRequest.distanceFromHome=distXZ(w.mesh.position,w.home);
    if(!shouldResetEncounter(resetRequest))continue;
    const resetCause=wildEncounterResetCause({assigned,targetAvailable,combatAuthorized,distanceToTarget:resetRequest.distanceToTarget,distanceFromHome:resetRequest.distanceFromHome});
    if(w.boss&&bossCombatAuthorized(bossChallengeSession,w.id))exitBossChallenge(resetCause);
    else resetWild(w,resetCause);
  }
  for(let index=0;index<wilds.length;index++){const w=wilds[index];if(w?.captureEngagementResumePending===true&&engagedWildIds.has(w.id))w.captureEngagementResumePending=false;}
  return engagedWildIds;
}
const wildUpdateScratch={
  statusRequest:{toSec:0,targetHp:0,targetMaxHp:1},
  resetRequest:{engaged:false,targetValid:false,distanceToTarget:Infinity,distanceFromHome:Infinity,leashRadius:ENCOUNTER_POLICY.leashRadius,disengageRadius:ENCOUNTER_POLICY.disengageRadius},
  collision:new THREE.Vector3(),
  next:new THREE.Vector3(),
  direction:new THREE.Vector3(),
  impact:new THREE.Vector3(),
};
function createWildAiScratch(){
  const self={id:null,encounterId:null,alive:false,capturing:false,engaged:false,hp:0,maxHp:1,position:{x:0,z:0},home:{x:0,z:0},attackReady:false,canMove:false,canAttack:false,forcedRetreat:false};
  const target={id:null,encounterId:null,alive:false,targetable:false,capturing:false,position:{x:0,z:0},recentDamage:0,rolePriority:0};
  return{request:{state:null,snapshot:{nowSec:0,dtSec:0,self,targets:[],profile:WILD_BASIC_AI_POLICY},canEngage:false},target};
}
const wildAiScratch=createWildAiScratch();
function fillWildAiRequest(scratch,w,dt,canEngage,control,target){
  const request=scratch.request,snapshot=request.snapshot,self=snapshot.self;
  request.state=w?.aiState;
  request.canEngage=canEngage===true;
  snapshot.profile=wildAiPolicy(w);
  snapshot.nowSec=Number.isFinite(w?.statusState?.currentTimeSec)?w.statusState.currentTimeSec:0;
  snapshot.dtSec=Number.isFinite(dt)&&dt>0?dt:0;
  self.id=w?.id;
  self.encounterId=w?.aiEncounterId;
  self.alive=w?.dead===false&&w?.retired===false&&Number.isFinite(w?.hp)&&w.hp>0;
  self.capturing=w?.capturing===true;
  self.engaged=w?.engaged===true;
  self.hp=w?.hp;
  self.maxHp=w?.maxHp;
  self.position.x=w?.mesh?.position?.x;
  self.position.z=w?.mesh?.position?.z;
  self.home.x=w?.home?.x;
  self.home.z=w?.home?.z;
  self.attackReady=Number.isFinite(w?.attackCd)&&w.attackCd<=0;
  self.canMove=control?.ok===true&&control.canMove===true;
  self.canAttack=control?.ok===true&&control.canAttack===true;
  self.forcedRetreat=control?.ok===true&&control.forcedRetreat===true;
  if(wildAiTargetAvailable(target)){
    const targetSnapshot=scratch.target;
    targetSnapshot.id=target.id;
    targetSnapshot.encounterId=w.aiEncounterId;
    targetSnapshot.alive=target.alive===true;
    targetSnapshot.targetable=target.targetable===true;
    targetSnapshot.capturing=false;
    targetSnapshot.position.x=target.position?.x;
    targetSnapshot.position.z=target.position?.z;
    targetSnapshot.recentDamage=0;
    targetSnapshot.rolePriority=0;
    snapshot.targets[0]=targetSnapshot;
    snapshot.targets.length=1;
  }else snapshot.targets.length=0;
  return request;
}
function materializeWildAiIntentTarget(w,intent,canEngage,frameTargetKey,frameRuntime=null){
  const policy=wildAiPolicy(w);
  if(!w||w.dead||w.retired||w.capturing||!Number.isFinite(w.hp)||w.hp<=0||!w.mesh||w.runtimeGeneration!==zoneGeneration||w.aiEncounterId!==wildAiEncounterId()
    ||!intent||intent.actorId!==w.id||intent.encounterId!==w.aiEncounterId||intent.actionToken===w.lastCommittedAiActionToken
    ||intent.kind!=='basic_attack'||intent.skillId!==null||intent.commandSource!==policy.commandSource||intent.usesConsumed!==0
    ||!Number.isFinite(intent.issuedAtSec)||!Number.isFinite(w.statusState?.currentTimeSec)||intent.issuedAtSec>w.statusState.currentTimeSec
    ||!canEngage||!canCombatTargetWild(w)||currentWildAiTargetKey()!==frameTargetKey
    ||w.aiState?.state!=='attack_windup'||w.aiState?.targetId!==intent.targetId
    ||w.aiState?.pendingAction?.token!==intent.actionToken||!Number.isFinite(w.attackCd)||w.attackCd>0)return null;
  const target=resolveWildAiTarget();
  if(!wildAiTargetAvailable(target)||target.id!==intent.targetId)return null;
  const distance=distXZ(w.mesh.position,target.position);
  if(!Number.isFinite(distance)||distance>policy.preferredRangeMaxM)return null;
  const control=frameRuntime?.actor===w&&frameRuntime.statusState===w.statusState?frameRuntime.control:resolveCombatStatusRuntime(w.statusState);
  if(!control.ok||!control.canAttack||!Number.isFinite(control.accuracyMultiplier)||control.accuracyMultiplier<0||control.accuracyMultiplier>1)return null;
  return{target,control};
}
function cacheWildAiMotion(w,decision){
  const motion=w?.aiMotion;
  if(!motion)return false;
  motion.action=decision?.action==='wander'?'wander':decision?.action==='move'?'move':'idle';
  motion.targetId=motion.action==='move'?decision.targetId:null;
  if(motion.action==='move'&&Number.isFinite(decision.direction?.x)&&Number.isFinite(decision.direction?.z))motion.direction.set(decision.direction.x,0,decision.direction.z);
  else if(motion.action==='move'){motion.action='idle';motion.targetId=null;}
  return true;
}
function advanceWildLifecycle(w,dt,frameRuntime=null){
  if(w?.capturing)return false;
  let runtime=frameRuntime??wildFrameRuntimeCache.get(w)??null;
  if(!wildFrameRuntimeUsable(w,runtime)&&!validateWildRuntimeActor(w)){
    if(w&&!w.dead&&!w.retired)quarantineWildAIActor(w);
    return false;
  }
  if(!wildFrameRuntimeUsable(w,runtime))runtime=markWildRuntimeValidated(w);
  const statusRequest=wildUpdateScratch.statusRequest;
  statusRequest.toSec=w.statusState.currentTimeSec+dt;statusRequest.targetHp=w.hp;statusRequest.targetMaxHp=w.maxHp;
  const statusAdvance=advanceEncounterEffects(w.statusState,statusRequest);
  if(!statusAdvance.ok){quarantineWildAIActor(w);return false;}
  w.statusState=statusAdvance.state;
  if(statusAdvance.damage>0){
    if(!commitAttributedStatusDamage(w,Math.max(1,Math.round(statusAdvance.damage)),{type:statusDamageType(statusAdvance.ticks,wildTypes(w)[0]),eff:1,statusDamage:true},statusAdvance.ticks))return false;
    if(w.dead||w.retired)return false;
  }
  const control=resolveCombatStatusRuntime(w.statusState);
  const selfModifiers=resolveActiveSelfStatusModifiers(w.statusState);
  if(!control.ok||!selfModifiers.ok){quarantineWildAIActor(w);return false;}
  runtime.statusState=w.statusState;runtime.control=control;runtime.selfModifiers=selfModifiers;
  const cooldownElapsed=dt*(control.ok?control.cooldownRecoveryMultiplier:1);
  w.attackCd=tickCooldown(w.attackCd,cooldownElapsed);
  w.wanderT=(Number.isFinite(w.wanderT)?w.wanderT:0)-dt;
  w.dir=ensureDirection(w.dir||w.wanderDir);w.wanderDir=w.dir;
  return runtime;
}
function applyWildMotionAndPresentation(w,dt,target=wildAiFrameTarget,frameTargetKey=target?.id??null,frameRuntime=null){
  if(!wildFrameRuntimeUsable(w,frameRuntime)||w.capturing)return false;
  const {control,selfModifiers}=frameRuntime;
  const motion=w.aiMotion;
  let moving=false;
  if(motion?.action==='wander'){
    for(const other of wilds){if(other===w||other?.dead||!other?.mesh)continue;const d=distXZ(w.mesh.position,other.mesh.position);if(d<1.2&&d>0.001){const push=wildUpdateScratch.collision.copy(w.mesh.position).sub(other.mesh.position);push.y=0;push.normalize().multiplyScalar((1.2-d)*dt*2);w.mesh.position.add(push);}}
    if(w.wanderT<=0){w.wanderT=1.6+Math.random()*2.2;w.dir=ensureDirection(null);w.wanderDir=w.dir;}
    if(control.ok&&control.canMove){
      const next=wildUpdateScratch.next.copy(w.mesh.position).addScaledVector(w.dir,dt*.9);
      if(distXZ(next,w.home)>2.2){w.dir.multiplyScalar(-1);w.wanderDir=w.dir;}
      moving=moveWildWithFieldCollision(w,w.dir,dt*.9);w.mesh.rotation.y=monsterLookYaw(w.dir,w.mesh);
    }
  }else if(motion?.action==='move'&&wildAiTargetAvailable(target)&&target.id===frameTargetKey&&motion.targetId===target.id&&control.ok&&control.canMove){
    const dir=wildUpdateScratch.direction.copy(motion.direction);
    moving=moveWildWithFieldCollision(w,dir,(w.spd*.16+1.2)*(selfModifiers.ok?selfModifiers.speedMultiplier:1)*dt);
    w.mesh.rotation.y=monsterLookYaw(dir,w.mesh);
  }
  animateEntity(w.mesh,dt,moving,w.boss?1.2:1);animateMonster(w.mesh,dt,moving);
  return true;
}
function updateWild(w,dt,canEngage=false,target=wildAiFrameTarget,frameTargetKey=target?.id??null,frameRuntime=null){
  if(!wildFrameRuntimeUsable(w,frameRuntime)||w.capturing)return false;
  const {control}=frameRuntime;
  const targetValid=wildAiTargetAvailable(target)&&target.id===frameTargetKey;
  const resetRequest=wildUpdateScratch.resetRequest;
  resetRequest.engaged=w.engaged;resetRequest.targetValid=targetValid&&canEngage;resetRequest.distanceToTarget=targetValid?distXZ(w.mesh.position,target.position):Infinity;resetRequest.distanceFromHome=distXZ(w.mesh.position,w.home);
  if(shouldResetEncounter(resetRequest)){
    const resetCause=wildEncounterResetCause({assigned:canEngage,targetAvailable:targetValid,combatAuthorized:canCombatTargetWild(w),distanceToTarget:resetRequest.distanceToTarget,distanceFromHome:resetRequest.distanceFromHome});
    if(w.boss&&bossCombatAuthorized(bossChallengeSession,w.id)){exitBossChallenge(resetCause);return false;}
    resetWild(w,resetCause);return false;
  }
  const previousState=w.aiState,decisionStarted=MONSTER_AI_DEBUG?performance.now():0;
  const decision=resolveWildMonsterAI(fillWildAiRequest(wildAiScratch,w,dt,canEngage,control,target));
  const decisionDuration=MONSTER_AI_DEBUG?performance.now()-decisionStarted:0;
  if(!decision.ok){recordWildAiTrace(w,{fromState:w.state,toState:w.state,targetId:null,reason:decision.reason,durationMs:decisionDuration,rejected:true,decision:true});if(decision.reason==='action_sequence_exhausted')quarantineWildAIActor(w);else cancelWildAIAction(w,'resolver_rejected',{clearEngagement:true});return false;}
  if(previousState?.pendingAction&&!decision.nextState?.pendingAction)clearWildAiTelegraph(w);
  if(!commitWildAIState(w,decision.nextState)){cancelWildAIAction(w,'invalid_resolver_state',{clearEngagement:true});return false;}
  cacheWildAiMotion(w,decision);
  if(decision.targetId!==null){ensureCaptureReferenceLevel(w);w.engaged=true;}
  recordWildAiTrace(w,{fromState:previousState.state,toState:w.state,targetId:decision.targetId,action:decision.action,reason:decision.reason,timeSec:w.statusState.currentTimeSec,durationMs:decisionDuration,decision:true});
  const aiPolicy=wildAiPolicy(w);
  if(decision.transition?.toState==='alert')createWildAiTelegraph(w,w.mesh.position,0xfacc15,{scale:w.boss?.8:.46,life:aiPolicy.alertDurationSec,y:.08,priority:'P0'});
  if(decision.transition?.toState==='attack_windup'){
    const telegraphReady=targetValid&&createWildAiTelegraph(w,target.position,w.boss?0xfb7185:0xf97316,{scale:w.boss?.72:.42,life:aiPolicy.windupDurationSec,y:.08,priority:'P0'},target);
    if(w.boss&&!telegraphReady){cancelWildAIAction(w,'boss_attack_telegraph_unavailable');return false;}
    runBestEffortCombatPresentation(()=>triggerMonsterAction(w.mesh,'attack',aiPolicy.windupDurationSec));
  }
  if(decision.action==='reset'){
    if(w.boss&&bossCombatAuthorized(bossChallengeSession,w.id)){exitBossChallenge(decision.reason);return false;}
    resetWild(w,decision.reason);return false;
  }
  if(decision.action==='basic_attack')executeWildAiIntent(w,decision,canEngage,frameTargetKey,frameRuntime);
  return !w.retired&&w.runtimeGeneration===zoneGeneration&&!!w.mesh;
}
function wildAiStateOwnsIntent(w,intent){return !!w&&!!intent&&w.aiState?.state==='attack_windup'&&w.aiState.actorId===intent.actorId&&w.aiState.encounterId===intent.encounterId&&w.aiState.targetId===intent.targetId&&w.aiState.pendingAction?.targetId===intent.targetId&&w.aiState.pendingAction?.token===intent.actionToken&&w.aiState.pendingAction?.issuedAtSec===intent.issuedAtSec&&w.aiState.pendingAction?.commandSource===intent.commandSource;}
function rejectWildAiIntent(w,decision,reason='runtime_revalidation_rejected'){
  clearWildAiTelegraph(w);
  const rejected=settleWildAIIntent(w?.aiState,decision?.intent,false);
  if(rejected.ok){if(!commitWildAIState(w,rejected.nextState))cancelWildAIAction(w,'invalid_rejected_intent_state',{clearEngagement:true});}
  else cancelWildAIAction(w,'invalid_rejected_intent_settlement',{clearEngagement:true});
  recordWildAiTrace(w,{fromState:'attack_windup',toState:w?.state??'chase',targetId:decision?.targetId??null,action:'idle',reason,timeSec:w?.statusState?.currentTimeSec??0,rejected:true});
  return false;
}
function executeWildAiIntent(w,decision,canEngage,frameTargetKey,frameRuntime=null){
  if(!wildAiStateOwnsIntent(w,decision?.intent)){recordWildAiTrace(w,{fromState:w?.state??null,toState:w?.state??null,targetId:decision?.targetId??null,action:'idle',reason:'stale_intent_ignored',timeSec:w?.statusState?.currentTimeSec??0,rejected:true});return false;}
  const live=materializeWildAiIntentTarget(w,decision?.intent,canEngage,frameTargetKey,frameRuntime);
  if(!live)return rejectWildAiIntent(w,decision);
  const {target,control}=live,incomingType=wildTypes(w)[0],selfModifiers=frameRuntime?.actor===w&&frameRuntime.statusState===w.statusState?frameRuntime.selfModifiers:resolveActiveSelfStatusModifiers(w.statusState);
  if(!selfModifiers.ok||!Number.isFinite(selfModifiers.attackMultiplier))return rejectWildAiIntent(w,decision,'attacker_status_invalid');
  const guard=target.kind==='owned'?resolveActiveSelfStatusModifiers(target.entity?.statusState,{incomingType}):null;
  if(target.kind==='owned'&&(!guard?.ok||!Number.isFinite(guard.defenseMultiplier)||!Number.isFinite(guard.evasionChancePct)||!Number.isFinite(guard.damageTakenMultiplier)||!Number.isFinite(guard.elementDamageTakenMultiplier)))return rejectWildAiIntent(w,decision,'defender_status_invalid');
  const settled=settleWildAIIntent(w.aiState,decision.intent,true);
  if(!settled.ok){cancelWildAIAction(w,'invalid_accepted_intent_settlement',{clearEngagement:true});recordWildAiTrace(w,{fromState:'attack_windup',toState:w.state,targetId:decision.targetId,reason:settled.reason,rejected:true});return false;}
  if(!commitWildAIState(w,settled.nextState)){cancelWildAIAction(w,'invalid_accepted_intent_state',{clearEngagement:true});return false;}
  w.lastCommittedAiActionToken=decision.intent.actionToken;
  w.attackCd=wildAiPolicy(w).basicAttackCooldownSec;
  runBestEffortCombatPresentation(()=>clearWildAiTelegraph(w));
  recordWildAiTrace(w,{fromState:'attack_windup',toState:w.state,targetId:target.id,action:'basic_attack',reason:settled.reason,timeSec:w.statusState.currentTimeSec});
  const impact=wildUpdateScratch.impact.copy(target.position);impact.y+=.55;
  const statusMissed=Math.random()>=control.accuracyMultiplier;
  if(target.kind==='owned'){
    const summon=target.entity;
    const evaded=!statusMissed&&guard.evasionChancePct>0&&Math.random()<guard.evasionChancePct/100;
    if(statusMissed)runBestEffortCombatPresentation(()=>{spawnElementalFX(incomingType,impact,'impact',0.65);spawnDamageNumber(0,impact,{miss:true});msg(`${spById[w.speciesId].name} โจมตีพลาดเพราะสถานะ`);});
    else if(evaded)runBestEffortCombatPresentation(()=>{spawnElementalFX(incomingType,impact,'impact',0.65);msg(`${displayName(summon.inst)} หลบการโจมตีได้`);});
    else{
      const res=wildDamage(w,summon.inst,guard.ok?guard.defenseMultiplier:1,selfModifiers.ok?selfModifiers.attackMultiplier:1);
      const finalMultiplier=guard.ok?guard.damageTakenMultiplier*guard.elementDamageTakenMultiplier:1;
      const dmg=Math.max(1,Math.round(res.damage*finalMultiplier));
      impact.copy(summon.mesh.position);impact.y+=1.25;
      summon.inst.hp-=dmg;
      if(summon===activeSummon&&summon.inst.hp<=0)faintActive();
      runBestEffortCombatPresentation(()=>{spawnElementalFX(incomingType,impact,'impact',0.65);spawnDamageNumber(dmg,impact,{type:incomingType,eff:res.eff});triggerCameraShake(w.boss?.15:.09,w.boss?.2:.14);});
    }
    runBestEffortCombatPresentation(()=>renderParty());
  }else if(target.kind==='player'&&statusMissed){
    runBestEffortCombatPresentation(()=>{spawnElementalFX(incomingType,impact,'impact',0.65);spawnDamageNumber(0,impact,{miss:true});msg(`${spById[w.speciesId].name} โจมตีพลาดเพราะสถานะ`);});
  }else if(target.kind==='player'&&playerData.invuln<=0){
    const playerDmg=Math.round(w.atk*(w.boss?.7:.48)*selfModifiers.attackMultiplier);
    playerData.hp-=playerDmg;playerData.invuln=.5;
    impact.copy(player.position);impact.y+=1;
    runBestEffortCombatPresentation(()=>{spawnElementalFX(incomingType,impact,'impact',0.65);spawnDamageNumber(playerDmg,playerHitText(),{type:wildTypes(w)[0]});triggerCameraShake(w.boss?.17:.1,w.boss?.22:.15);playerVisual.play('hurt',{duration:.24});spawnBurst(impact,0xef4444,{count:8,life:.22,size:.04,gravity:1});});
    if(playerData.hp<=0){playerData.hp=playerData.maxHp;msg('ผู้เล่นหมด HP • กลับ Ranch Hub');switchZone('hub',true);}
    runBestEffortCombatPresentation(()=>renderHUD());
  }else if(target.kind==='player')runBestEffortCombatPresentation(()=>spawnElementalFX(incomingType,impact,'impact',0.65));
  return true;
}
function updateProjectiles(dt){
  for(let i=projectiles.length-1;i>=0;i--){
    const p=projectiles[i];
    if(!p?.mesh||!p.start||!p.end){if(p?.mesh)try{removeAndDispose(scene,p.mesh);}catch{}projectiles.splice(i,1);if(p?.type==='capture')abortCaptureSequence();continue;}
    let t=0;
    try{p.t+=dt/p.duration;t=Math.min(1,p.t);p.mesh.position.lerpVectors(p.start,p.end,t);p.mesh.position.y+=Math.sin(t*Math.PI)*2.2;if(p.mesh.userData.spin){p.mesh.rotation.x+=dt*10;p.mesh.rotation.y+=dt*14;}}
    catch{try{removeAndDispose(scene,p.mesh);}catch{}projectiles.splice(i,1);if(p.type==='capture')abortCaptureSequence();continue;}
    if(t-p.lastTrail>.08){p.lastTrail=t;runBestEffortCombatPresentation(()=>{if(p.type==='summon'&&pendingSummon){const inst=getInst(pendingSummon.instanceId);if(inst)spawnElementalFX(monsterTypes(inst)[0],p.mesh.position.clone(),'trail',0.55);}else spawnBurst(p.mesh.position.clone(),p.color,{count:3,life:.12,size:.03,priority:p.type==='capture'?'P0':'P1'});});}
    if(t<1)continue;
    const mesh=p.mesh;projectiles.splice(i,1);
    if(p.type==='capture'){try{p.onHit?.(mesh);}catch{try{removeAndDispose(scene,mesh);}catch{}abortCaptureSequence();}continue;}
    try{removeAndDispose(scene,mesh);}catch{}
    try{p.onHit?.();}catch{}
    runBestEffortCombatPresentation(()=>spawnBurst(safeVec3(p.end),p.color,{count:6,life:.16,size:.04,priority:'P1'}));
  }
}

// ---------- V8.4.0 PocketMonster Ranch / life / training core ----------
function trainingNeed(level){return 34+level*22;}
function levelUpInstance(inst){
  const need=Math.max(1,growthExpForLevel((inst.level||1)+1,inst.growthCurve)-(inst.growthExp||0));
  addGrowthExp(inst,need);
  synchronizeStage1Learnset(inst);
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
function applyLifeSimulation(now=Date.now(),show=false){const window=resolveOfflineTrainingWindow({lastClaimAt:state.lifeLastAt||now,now});if(!window.ok||window.elapsedMs<1000)return window;state.lifeLastAt=window.nextClaimAt;let trained=0;for(const id of state.storage){const inst=getInst(id);if(!inst)continue;
  syncToBodyMind(inst);
  const beforeCond=deriveCondition(inst);
  simulateLife(inst,now);
  syncFromBodyMind(inst);
  const afterCond=deriveCondition(inst);
  if(['tired','fatigued','bad'].includes(afterCond)&&afterCond!==beforeCond)spawnConditionBadEffect(fxWorldPos(id));
  const focus=inst.trainingFocus||'power';
  const baseGain=window.hours*60*1.8;
  const trainGain=ranchTrainingGain(inst,focus,baseGain);
  const applied=addTrainingExp(inst,focus,trainGain);
  inst.trainingExp=(inst.trainingExp||0)+applied;
  if(applied>0){trained++;refreshStats(inst,false);}
  if(!pendingEvent)triggerRaisingEvent(inst);
}if(show&&trained>0)msg(`Ranch Training • เติม Training Pool ${trained} ตัว`);return {...window,trained};}
// V7.4: Food definitions mapped to resolveFeed categories
const FOOD_DEFS=FOOD_CATALOG;
async function feedMonster(id,food){
  const inst=getInst(id);if(!inst)return;
  if(!assertCharacterMutable(id))return;
  if(skillItemById(food)){msg('ผลไฟเป็น Skill Item • ใช้จากแท็บ Skills และยืนยันสล็อต S1–S4');return;}
  if(!requireServerMutation())return;
  try{
    const bondBefore=Number(inst.bond||0);
    const result=await applyMonsterAction(id,'FEED',food);
    if(result.rejected){
      if(Number.isInteger(result.quantity))state.inventory[food]=result.quantity;
      msg(result.message||`อาหารไม่ส่งผลกับ ${displayName(inst)}`);renderManager();return;
    }
    applyAuthoritativeMonster(id,result.monsterJson);
    if(Number.isInteger(result.quantity))state.inventory[food]=result.quantity;
    spawnFeedEffect(fxWorldPos(id),FOOD_FX_COLOR[food]||0x22c55e);playSFX('sfx_feed');
    if(Number(getInst(id)?.bond||0)>bondBefore)spawnBondUpEffect(fxWorldPos(id));
    msg(result.message||`ให้อาหาร ${displayName(inst)} สำเร็จ`);renderManager();renderParty();saveGame(false);
  }catch(error){msg(`อาหาร: ${error.message}`);}
}
// V7.4: Care actions (rest/play) from food-care.mjs
async function careAction(id,action){
  const inst=getInst(id);if(!inst)return;
  if(!assertCharacterMutable(id))return;
  if(!requireServerMutation())return;
  try{
    // Keep client presentation forecasting without mutating authoritative state.
    const preview=JSON.parse(JSON.stringify(inst));
    if(action==='rest')careRest(preview,{now:Date.now()});else carePlay(preview,{now:Date.now()});
    const result=await applyMonsterAction(id,action.toUpperCase());
    applyAuthoritativeMonster(id,result.monsterJson);
    if(action==='rest')spawnRestEffect(fxWorldPos(id));else{spawnPlayEffect(fxWorldPos(id));spawnBondUpEffect(fxWorldPos(id));}
    msg(result.message||`${displayName(inst)} • ${action==='rest'?'พักผ่อน':'เล่นด้วย'}`);renderManager();renderParty();saveGame(false);
  }catch(error){msg(`กิจกรรม: ${error.message}`);}
}
// V7.6: Equipment functions (3-slot reversible loadout)
async function equipMonsterItem(id,item){
  const inst=getInst(id);if(!inst)return;
  if(!assertCharacterMutable(id))return;
  if(!requireServerMutation())return;
  try{
    const result=await setMonsterEquipment(id,item.id,item.slot,false);
    applyAuthoritativeMonster(id,result.monsterJson);
    msg(`${displayName(inst)} → Equip ${item.id} [${item.slot}]`);renderManager();saveGame(false);
  }catch(error){msg(`Equipment: ${error.message}`);}
}
async function unequipMonster(id,slot){
  const inst=getInst(id);if(!inst)return;
  if(!assertCharacterMutable(id))return;
  if(!requireServerMutation())return;
  try{
    const result=await setMonsterEquipment(id,null,slot,true);
    applyAuthoritativeMonster(id,result.monsterJson);
    msg(`${displayName(inst)} → Unequip ${slot}`);renderManager();saveGame(false);
  }catch(error){msg(`Equipment: ${error.message}`);}
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
  if(result.ok){synchronizeStage1Learnset(inst);refreshStats(inst,false);msg(`${displayName(inst)} • ${pendingEvent.eventDef.id}:${choiceId}`);}
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
async function setTraining(id,focus){const inst=getInst(id);if(!inst)return;if(!assertCharacterMutable(id))return;if(!requireServerMutation())return;
  try{const result=await applyMonsterAction(id,'TRAIN',focus);applyAuthoritativeMonster(id,result.monsterJson);spawnTrainingEffect(fxWorldPos(id),focus);msg(result.message||`${displayName(inst)} → Training: ${TRAIN_FOCUS[focus]}`);renderManager();if(currentManagerTab==='training')renderTraining();if(!el('trainerPanel').classList.contains('hidden'))renderTrainerPanel();saveGame(false);}
  catch(error){msg(`Training: ${error.message}`);}}
let keeperRecoveryCommandSequence=0;
function healAll(){if(!assertRanchOperation())return;const recovery=recoverSkillUses(state.collection,{routeId:'REC_NPC',commandId:'keeper-heal-'+Date.now()+'-'+(++keeperRecoveryCommandSequence)});if(!recovery.ok){msg('Keeper Recovery ไม่สำเร็จ • '+recovery.reason);return;}for(const inst of state.collection){refreshStats(inst,true);inst.fainted=false;}playerData.hp=playerData.maxHp;playSFX('sfx_heal');msg('NPC Heal ฟรี • มอนทั้งหมดฟื้น HP และ Uses เต็ม');renderAll();renderManager();saveGame(false);}
const ranchVisuals=new Map();
function syncRanchVisuals(){
  for(const [id,obj] of ranchVisuals){removeAndDispose(scene, obj.mesh);ranchVisuals.delete(id);}
  removeSceneRole('ranchVisual');
  if(state.currentZone!=='hub')return;
  state.ranchActive=state.ranchActive.filter(id=>state.storage.includes(id)).slice(0,RANCH_ACTIVE_MAX);
  const ids=state.ranchActive;
  ids.forEach((id,i)=>{const inst=getInst(id);if(!inst)return;const sp=spById[inst.speciesId],mesh=monsterMesh(sp,true,inst),a=(i/Math.max(1,ids.length))*Math.PI*2;mesh.userData.worldRole='ranchVisual';mesh.userData.instanceId=inst.instanceId;mesh.position.set(ranchCenter.x+Math.cos(a)*1.8,0,ranchCenter.z+Math.sin(a)*1.8);scene.add(mesh);if(typeof setupMonsterMotion==='function')setupMonsterMotion(mesh,sp,inst);ranchVisuals.set(id,{mesh,phase:Math.random()*10,home:mesh.position.clone(),direction:new THREE.Vector3()});});
}

function updateRanchVisuals(dt){let i=0;for(const obj of ranchVisuals.values()){obj.phase+=dt*.55;const radius=.45+(i%3)*.12,tx=obj.home.x+Math.cos(obj.phase)*radius,tz=obj.home.z+Math.sin(obj.phase*.8)*radius;const moving=Math.hypot(tx-obj.mesh.position.x,tz-obj.mesh.position.z)>.08;obj.mesh.position.x+=(tx-obj.mesh.position.x)*dt*.8;obj.mesh.position.z+=(tz-obj.mesh.position.z)*dt*.8;const dir=obj.direction.set(tx-obj.mesh.position.x,0,tz-obj.mesh.position.z);if(dir.lengthSq()>.0001)obj.mesh.rotation.y=monsterLookYaw(dir.normalize(),obj.mesh);animateEntity(obj.mesh,dt,true,.65);animateMonster(obj.mesh,dt,moving);i++;}}
function toggleRanchActive(id){if(!assertRanchOperation())return;if(!state.storage.includes(id))return;if(state.ranchActive.includes(id)){state.ranchActive=state.ranchActive.filter(x=>x!==id);msg('เก็บมอนออกจากลาน Ranch แล้ว');}else{if(state.ranchActive.length>=RANCH_ACTIVE_MAX){msg(`Ranch Active เต็ม ${RANCH_ACTIVE_MAX} ตัว`);return;}state.ranchActive.push(id);msg(`ปล่อย ${displayName(getInst(id))} ออกมาเดินใน Ranch`);}syncRanchVisuals();renderManager();renderRanchStoragePage();renderHUD();saveGame(false);}

// ---------- Breeding / genetics ----------
const BREEDING_REASON_TH=Object.freeze({
  breeding_same_instance:'ต้องเป็นมอนคนละตัว',
  breeding_relative_gate:'ไม่อนุญาตญาติใกล้ชิด',
  breeding_recipe_only:'มอน Genderless/Special Recipe ผสมได้ผ่านสูตรเฉพาะเท่านั้น',
  breeding_stage_gate:'ทั้งสองตัวต้องเป็น Stage 2',
  breeding_level_gate:'ทั้งสองตัวต้องมี Level 20 ขึ้นไป',
  breeding_bond_gate:'Bond ของทั้งสองตัวต้อง ≥ 50',
  breeding_gender_gate:'Standard Breeding ต้องเป็น Female Egg Holder × Male Partner',
  breeding_group_gate:'Breeding Group ตาม Workbook ต้องตรงกัน',
  breeding_eligibility_gate:'สายพันธุ์นี้ไม่เปิด Standard Breeding',
  breeding_cooldown:'พ่อแม่อย่างน้อยหนึ่งตัวยังติดคูลดาวน์ 30 นาที',
  unknown_id:'ไม่พบ Species ID ใน Workbook catalog',
  invalid_state:'ข้อมูลผสมพันธุ์ไม่ถูกต้อง',
});
const EGG_TRANSACTION_REASON_TH=Object.freeze({
  egg_id_conflict:'รหัสไข่ซ้ำกับธุรกรรมอื่น',
  egg_schema_invalid:'ข้อมูลไข่ไม่ครบตาม BRD_v1.0',
  child_species_unresolved:'หา Stage 1 Species ของลูกไม่พบ',
  invalid_hatch_time:'เวลาฟักไข่ไม่ถูกต้อง',
  unsupported_breeding_version:'ไข่นี้เป็นคนละเวอร์ชันและถูกกักไว้แบบ Legacy',
  egg_not_found:'ไม่พบไข่',
  egg_not_ready:'ไข่ยังไม่พร้อมฟัก',
  egg_already_hatched:'ไข่นี้ฟักแล้ว',
  hatch_owned_id_conflict:'รหัสมอนที่ฟักชนกับมอนที่มีอยู่',
  hatch_state_conflict:'สถานะไข่กับมอนที่ฟักแล้วไม่สอดคล้องกัน',
  unknown_id:'ไม่พบพ่อแม่ใน Collection',
  invalid_state:'ข้อมูลธุรกรรมไข่ไม่ถูกต้อง',
});
const SKILL_MEMORY_REASON_TH=Object.freeze({
  no_skill_memory:'ไม่มี Skill Memory',
  already_learned:'เรียนสกิลนี้แล้ว',
  stage_required:'ต้องถึง Stage ที่กำหนด',
  level_required:'Level ยังไม่ถึง',
  secondary_required:'Secondary Type ยังไม่ตรง',
  bond_required:'Bond ยังไม่ถึง',
  family_skill_not_found:'สกิลไม่อยู่ในสาย Stage 2 นี้',
  ultimate_excluded:'Ultimate ส่งต่อไม่ได้',
  rare_manual_excluded:'Rare Manual ส่งต่อไม่ได้',
});
function standardBreedingRoles(a,b){
  if(a?.gender==='Female'&&b?.gender==='Male')return{eggHolder:a,partner:b};
  if(b?.gender==='Female'&&a?.gender==='Male')return{eggHolder:b,partner:a};
  if(a?.gender==='Female')return{eggHolder:a,partner:b};
  if(b?.gender==='Female')return{eggHolder:b,partner:a};
  return{eggHolder:a,partner:b};
}
function breedingReasonText(result){
  if(result.ok)return`เข้ากันได้ • ${result.breedingGroup} • Stage 2 / Lv.20 / Bond 50`;
  return BREEDING_REASON_TH[result.reason]||`Breeding: ${result.reason||'ไม่พร้อม'}`;
}
function breedingCompatibility(a,b){
  if(!a||!b)return{ok:false,text:'เลือก Parent A และ Parent B',eggHolder:null,partner:null};
  if(!state.storage.includes(a.instanceId)||!state.storage.includes(b.instanceId))return{ok:false,text:'พ่อแม่ต้องอยู่ใน Storage/Ranch',eggHolder:null,partner:null};
  syncToBodyMind(a);syncToBodyMind(b);
  const roles=standardBreedingRoles(a,b);
  const result=evaluateStandardBreedingCompatibility(roles.eggHolder,roles.partner,{now:Date.now()});
  return{...result,...roles,text:breedingReasonText(result)};
}
function createEgg(){if(!assertRanchOperation())return;const a=getInst(state.breeding.parentA),b=getInst(state.breeding.parentB),compat=breedingCompatibility(a,b);if(!compat.ok){msg(compat.text);renderBreeding();return;}
  const now=Date.now(),eggId=crypto.randomUUID(),genderSeedWords=new Uint32Array(1),inheritedSkillMemoryId=el('breedingSkillMemory')?.value||null;
  crypto.getRandomValues(genderSeedWords);
  const result=createStandardBreedingEggTransaction(state,{eggId,eggHolderOwnedMonsterId:compat.eggHolder.instanceId,partnerOwnedMonsterId:compat.partner.instanceId,genderSeed:genderSeedWords[0],inheritedSkillMemoryId,now});
  if(!result.ok){msg(EGG_TRANSACTION_REASON_TH[result.reason]||`สร้างไข่ไม่สำเร็จ: ${result.reason}`);renderBreeding();return;}
  state.collection=result.state.collection;state.eggs=result.state.eggs;applyBreedingSkillMemoryRequestLedger(state,result.state);
  let posA=fxWorldPos(a.instanceId),posB=fxWorldPos(b.instanceId);
  if(posA.distanceTo(posB)<.05){posA=incubator.position.clone().add(new THREE.Vector3(-.8,0,0));posB=incubator.position.clone().add(new THREE.Vector3(.8,0,0));}
  spawnBreedingEffect(posA,posB);
  const memoryText=result.egg.inheritedSkillMemoryId?` • Memory ${result.egg.inheritedSkillMemoryId}`:'';
  msg(`สร้างไข่สำเร็จ • ผู้ถือไข่ ${displayName(compat.eggHolder)} • ฟัก 15 นาที${memoryText}`);renderManager();saveGame(false);}
function prepareHatchedChildForLive(child){
  child.origin='bred';child.lifeStage='Baby';child.createdAt=child.createdAt||Date.now();child.fainted=false;
  child.personality=child.personality||child.personalityId||'balanced';
  child.trainingFocus=child.trainingFocus||'power';child.trainingExp=child.trainingExp||0;child.trainingBonus=child.trainingBonus||{hp:0,atk:0,def:0,spd:0};
  child.parentAId=child.parentAId||child.parents?.a||null;child.parentBId=child.parentBId||child.parents?.b||null;child.exp=child.growthExp||0;
  syncFromBodyMind(child);
  synchronizeStage1Learnset(child);
  refreshStats(child,true);
  return child;
}
function hatchLegacyEgg(egg,now=Date.now()){
  const readyAt=egg?.readyAt??egg?.hatchAt;
  if(!Number.isFinite(readyAt)){msg('ไข่ Legacy นี้ไม่มีเวลาฟักที่เชื่อถือได้');return;}
  if(now<readyAt){msg('ไข่ยังไม่พร้อมฟัก');return;}
  if(!egg.child||typeof egg.child!=='object'){msg('ไข่ Legacy ไม่มี snapshot ลูก จึงไม่สร้างข้อมูลทดแทน');return;}
  if(typeof egg.child.instanceId!=='string'||!egg.child.instanceId.trim()||!spById[egg.child.speciesId]){msg('snapshot ลูกในไข่ Legacy ไม่ครบ จึงไม่เดารหัสหรือ Species ทดแทน');return;}
  const parentAId=egg.parentAId||egg.eggHolderId||null,parentBId=egg.parentBId||null;
  const child=prepareHatchedChildForLive(ensureInstanceShape({...egg.child,origin:'bred',parentAId,parentBId}));
  if(!child?.instanceId||state.collection.some(monster=>monster.instanceId===child.instanceId)){msg('รหัสมอนจากไข่ Legacy ซ้ำหรือไม่ถูกต้อง');return;}
  state.collection.push(child);if(!state.storage.includes(child.instanceId))state.storage.push(child.instanceId);state.eggs=state.eggs.filter(record=>record!==egg);
  appendHistory(child,{type:'birth',origin:'bred',parentA:parentAId,parentB:parentBId,legacyEgg:true});
  spawnHatchEffect(incubator.position.clone());
  playSFX('sfx_hatch');
  msg(`ฟักไข่ Legacy! ได้ ${displayName(child)}`);renderAll();renderManager();saveGame(false);
}
function hatchEgg(eggId){if(!assertRanchOperation())return;const egg=state.eggs.find(record=>record?.eggId===eggId);if(!egg){msg('ไม่พบไข่');return;}const now=Date.now();if(egg.breedingVersion==null){hatchLegacyEgg(egg,now);return;}if(egg.breedingVersion!==BREEDING_VERSION){msg(EGG_TRANSACTION_REASON_TH.unsupported_breeding_version);return;}
  const result=hatchBreedingEggTransaction(state,{eggId,now});
  if(!result.ok){msg(EGG_TRANSACTION_REASON_TH[result.reason]||`ฟักไข่ไม่สำเร็จ: ${result.reason}`);renderBreeding();return;}
  state.collection=result.state.collection;state.storage=result.state.storage;state.eggs=result.state.eggs;
  const child=prepareHatchedChildForLive(result.child);
  appendHistory(child,{type:'birth',origin:'bred',parentA:result.egg.eggHolderOwnedMonsterId,parentB:result.egg.partnerOwnedMonsterId,eggId:result.egg.eggId});
  spawnHatchEffect(incubator.position.clone());
  playSFX('sfx_hatch');
  msg(`ฟักไข่! ได้ ${displayName(child)} • Stage 1 • Bond 10`);renderAll();renderManager();saveGame(false);}

// ---------- Evolution ----------
function evoRequirementStatus(inst,path){
  const sp=spById[inst.speciesId];
  syncToBodyMind(inst);
  const workbook=path.fromFormId===sp.id?previewWorkbookEvolution(inst):null;
  if(workbook?.ok){
    const items=[];
    if(workbook.level<workbook.path.requiredLevelReference)items.push(`✗ level gte ${workbook.path.requiredLevelReference}`);
    if(workbook.bond<workbook.path.requiredBondReference)items.push(`✗ bond gte ${workbook.path.requiredBondReference}`);
    return {ok:workbook.canCommit,text:items.length?items.join(' • '):(workbook.canCommit?'ผ่านเงื่อนไขทั้งหมด':'วิวัฒนาการแล้ว'),result:workbook};
  }
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
function evolveMonster(id,pathId){if(!assertCharacterMutable(id))return;const inst=getInst(id),sp=spById[inst?.speciesId],path=sp?.evolutionPaths?.find(p=>p.id===pathId);if(!inst||!path||inst.formId===path.id||inst.evolutionPath===path.id)return;
  syncToBodyMind(inst);
  const def=evoDefFromPath(path,sp.id);
  const st=evoRequirementStatus(inst,path);
  if(!st.ok){msg(st.text||'ยังไม่ผ่านเงื่อนไข Evolution');return;}
  const workbookPreview=path.fromFormId===sp.id?previewWorkbookEvolution(inst):null,targetName=workbookPreview?.ok?workbookPreview.path.toNameTH:path.name;
  if(!confirm(`Evolution ย้อนกลับไม่ได้\n${displayName(inst)} → ${targetName}\nยืนยันหรือไม่?`))return;
  const oldColor=colorNum(monsterTypes(inst)[0]);
  const committed=commitEvolution(inst,def,{now:Date.now()});
  if(!committed.ok){msg(committed.reason||'Evolution ไม่สำเร็จ');return;}
  inst.evolutionPath=path.id;
  inst.evolutionProfile=def.profile;
  if(path.secondaryType&&sp.allowedSecondary.includes(path.secondaryType))inst.secondaryType=path.secondaryType;
  const newColor=colorNum(monsterTypes(inst)[0]);
  spawnEvolutionEffect(fxWorldPos(id),oldColor,newColor);
  playSFX('sfx_evolution');
  const unlocked=committed.unlockedSkill?.newlyLearned?skillCatalogEntry(committed.unlockedSkill.skillId):null;
  const unlockText=unlocked?` • เรียน ${unlocked.nameTH} แล้ว (ยังไม่ติดตั้ง)` : '';
  refreshStats(inst,false);msg(`${sp.name} Evolution → ${targetName} สำเร็จ!${unlockText}`);syncRanchVisuals();renderAll();renderManager();if(!el('evolutionPanel').classList.contains('hidden'))renderEvolutionGuide();saveGame(false);}
function evoHistoryHTML(inst){
  const hist=inst.evolutionHistory||[];
  if(!hist.length)return '';
  return `<div class="evo-history"><div class="evo-history-title">ประวัติ Evolution</div>${hist.map(h=>`<div class="evo-history-item">${h.from||'base'} → ${h.to} • ${new Date(h.at||Date.now()).toLocaleDateString('th-TH',{year:'2-digit',month:'short',day:'numeric'})}</div>`).join('')}</div>`;
}
function renderFocusedEvolutionBuildPreview(){
  const presentation=focusedCharacterPresentation();
  const inst=presentation.id?getInst(presentation.id):null;
  if(!inst)return '<div class="manager-empty">เลือกมอนเพื่อดู Evolution Build</div>';
  const sp=spById[inst.speciesId];
  const paths=availableEvolutionPaths(inst);
  if(!paths.length)return `<section class="focused-evolution-preview"><div class="skills-section-title">Evolution Build • ${presentation.name}</div><div class="skill-detail">ไม่มี Candidate Form จากฟอร์มปัจจุบัน</div></section>`;
  const build=instanceCombatBuildSafe(inst);
  const candidates=paths.map(path=>{
    const def=evoDefFromPath(path,sp.id);
    const requirement=evoRequirementStatus(inst,path);
    const preview=previewEvolution(inst,def,build),workbook=path.fromFormId===sp.id?previewWorkbookEvolution(inst):null;
    const mods=path.statMods||{};
    const delta=['hp','atk','def','spAtk','spDef','spd'].map(stat=>{
      const current=workbook?.ok?workbook.sourceStats[stat]:(stat==='hp'?inst.maxHp:inst[stat]);
      const next=workbook?.ok?workbook.targetStats[stat]:Math.round((current||0)*(mods[stat]||1));
      const label=stat==='spAtk'?'SP.ATK':stat==='spDef'?'SP.DEF':stat.toUpperCase();
      return `${label} ${next-current>=0?'+':''}${next-current}`;
    }).join(' • ');
    const types=[sp.types[0],preview.secondaryType||path.secondaryType||inst.secondaryType].filter(Boolean).map(type=>TYPE_TH[type]||type).join(' / ');
    const carry=preview.skillCarry.map(skill=>`${skill.from} → ${skill.to} ${Math.round(skill.carry*100)}%`).join(', ')||'ไม่มี Skill Carry';
    const trait=path.evolutionTrait||path.trait||'—';
    return `<div class="evo-card"><div class="evo-title"><b>${displayName(inst)} → ${workbook?.ok?workbook.path.toNameTH:path.name}</b><span>${requirement.ok?'พร้อม':'ยังไม่พร้อม'}</span></div><div class="evo-details">Form: ${workbook?.ok?workbook.path.toWorkbookMonsterId:path.id} • Type: ${types}<br>${delta}<br>Skill Carry: ${carry}<br>Passive / Evolution Trait: ${trait}<br>Requirement: ${requirement.text}</div></div>`;
  }).join('');
  return `<section class="focused-evolution-preview"><div class="skills-section-title">Evolution Build • ${presentation.name}</div>${candidates}</section>`;
}
function renderEvolution(targetPanel=null){
  const box=targetPanel||el('evolutionPreview'),inst=getInst(state.evolutionCandidate||state.ui?.focusedMonsterId);
  if(!inst){box.innerHTML='เลือก “ดู Evolution” จากการ์ดมอนเพื่อดูเส้นทาง';return;}
  const sp=spById[inst.speciesId],paths=availableEvolutionPaths(inst);
  const identity=`<div class="evo-identity-lock">🔒 Gene / Parents / Generation ไม่เปลี่ยน (Identity Lock)</div>`;
  const carry=`<div class="evo-skill-carry">Skill Carry: 70-100% mastery EXP ส่งต่อ</div>`;
  const budgetMin=Math.round((BALANCE_CONFIG.powerBudget?.evolution?.min??0.05)*100);
  const budgetMax=Math.round((BALANCE_CONFIG.powerBudget?.evolution?.max??0.1)*100);
  const budget=`<span class="evo-budget-badge ok">Power Budget ${budgetMin}-${budgetMax}%</span>`;
  if(!paths.length){
    const p=getEvolutionPath(inst);
    box.innerHTML=`<div class="evo-card"><div class="evo-title"><b>${displayName(inst)}</b><span>${p?'Form ปัจจุบัน':'ยังไม่มีสาขา'}</span></div><div class="evo-details">${p?`วิวัฒนาการแล้ว • Type ${monsterTypes(inst).map(t=>TYPE_TH[t]).join('/')} • HP ${inst.maxHp} ATK ${inst.atk} DEF ${inst.def} SP.ATK ${inst.spAtk} SP.DEF ${inst.spDef} SPD ${inst.spd}`:`${sp.name} ยังไม่มี Evolution Path จากฟอร์มนี้`}</div>${identity}${evoHistoryHTML(inst)}</div>`;
    return;
  }
  box.innerHTML=renderFocusedEvolutionBuildPreview();
  for(const p of paths){
    const st=evoRequirementStatus(inst,p),types=[sp.types[0],p.secondaryType??inst.secondaryType??sp.types[1]].filter(Boolean),mods=p.statMods||{},workbook=p.fromFormId===sp.id?previewWorkbookEvolution(inst):null,skills=getMonsterSkills(inst).map(s=>s.name).join(', '),d=document.createElement('div');
    d.className='evo-card';
    const statText=workbook?.ok?['hp','atk','def','spAtk','spDef','spd'].map(stat=>`${stat==='spAtk'?'SP.ATK':stat==='spDef'?'SP.DEF':stat.toUpperCase()} ${workbook.targetStats[stat]}`).join(' • '):`HP ×${mods.hp||1} • ATK ×${mods.atk||1} • DEF ×${mods.def||1} • SP.ATK ×${mods.spAtk||1} • SP.DEF ×${mods.spDef||1} • SPD ×${mods.spd||1}`;
    d.innerHTML=`<div class="evo-title"><b>${displayName(inst)} → ${workbook?.ok?workbook.path.toNameTH:p.name}</b><span>${st.ok?'พร้อม':'ยังไม่พร้อม'}</span></div><div class="evo-details">รูปร่าง: ${workbook?.ok?workbook.path.toNameTH:p.name} (Form/สี/ขนาดใหม่)<br>Type: ${types.map(t=>TYPE_TH[t]).join(' / ')} — Primary ${TYPE_TH[sp.types[0]]} ล็อกตาม Species<br>Stats: ${statText}<br>Skills หลัง Evolution: ${skills}<br>เงื่อนไข: ${st.text}</div>${carry}${identity}<div style="margin-top:6px">${budget}</div><button ${st.ok?'':'disabled'} title="${st.text}">${st.ok?'ยืนยัน Evolution':st.text}</button>${evoHistoryHTML(inst)}`;
    d.querySelector('button').onclick=()=>evolveMonster(inst.instanceId,p.id);
    box.appendChild(d);
  }
}

// ---------- NPC manager ----------
function isNearNpc(){return state.currentZone==='hub'&&distXZ(player.position,npc.position)<3.4;}
function isNearMerchant(){return state.currentZone==='hub'&&distXZ(player.position,merchantNpc.position)<3.4;}
function isNearTrainer(){return state.currentZone==='hub'&&distXZ(player.position,trainerNpc.position)<3.4;}
function isNearEvolution(){return state.currentZone==='hub'&&distXZ(player.position,evolutionNpc.position)<3.4;}
function isNearBreeding(){return state.currentZone==='hub'&&distXZ(player.position,breedingNpc.position)<3.4;}
function updateNpcUI(){
  const b=el('npcBtn');
  if(!el('monsterManager').classList.contains('hidden')||!el('merchantShop').classList.contains('hidden')||!el('trainerPanel').classList.contains('hidden')||!el('evolutionPanel').classList.contains('hidden')||!el('breedingPanel').classList.contains('hidden')){b.classList.add('hidden');return;}
  const target=isNearMerchant()?merchantNpc:isNearTrainer()?trainerNpc:isNearEvolution()?evolutionNpc:isNearBreeding()?breedingNpc:isNearNpc()?npc:null;
  if(target){const p=worldToScreen(target.position.clone().add(new THREE.Vector3(0,2.0,0)));if(p.visible){b.classList.remove('hidden');b.textContent=target===merchantNpc?'ร้านค้า':target===trainerNpc?'ฝึก':target===evolutionNpc?'วิวัฒนาการ':target===breedingNpc?'ผสมพันธุ์':'คุย';b.classList.toggle('merchant-btn',target===merchantNpc);b.classList.toggle('trainer-btn',target===trainerNpc);b.classList.toggle('evolution-btn',target===evolutionNpc);b.classList.toggle('breeding-btn',target===breedingNpc);b.style.left=`${p.x}px`;b.style.top=`${p.y}px`;return;}}
  b.classList.add('hidden');
}
let merchantPurchaseSequence=0;
let merchantPurchasePending=false;
const MERCHANT_PURCHASE_REASON_TH=Object.freeze({
  [MERCHANT_PURCHASE_REASONS.INSUFFICIENT_FUNDS]:'Gold ไม่พอสำหรับสินค้านี้',
  [MERCHANT_PURCHASE_REASONS.INVENTORY_FULL]:'ช่องเก็บไอเทมเต็ม',
  [MERCHANT_PURCHASE_REASONS.DUPLICATE_COMMAND]:'คำสั่งซื้อนี้ถูกบันทึกแล้ว',
  [MERCHANT_PURCHASE_REASONS.STALE_PRICE]:'ราคาสินค้าเปลี่ยนแล้ว กรุณาเปิดร้านใหม่',
  [MERCHANT_PURCHASE_REASONS.STALE_CATALOG]:'รายการสินค้าล้าสมัย กรุณาเปิดร้านใหม่',
  [MERCHANT_PURCHASE_REASONS.STALE_STATE]:'ข้อมูลกระเป๋าเปลี่ยนแล้ว กรุณาลองใหม่',
  [MERCHANT_PURCHASE_REASONS.PERSISTENCE_FAILED]:'ซื้อไม่สำเร็จ — Gold และไอเทมไม่เปลี่ยน',
});
function merchantPurchaseReasonText(reason){return MERCHANT_PURCHASE_REASON_TH[reason]||`ซื้อไม่สำเร็จ • ${reason||'unknown'}`;}
function openMerchant(){
  if(!isNearMerchant()){msg('เข้าใกล้พ่อค้าก่อน');return;}
  el('merchantShop').classList.remove('hidden');
  renderMerchantShop();
  playSFX('sfx_ui_open');
}
function closeMerchant(){el('merchantShop').classList.add('hidden');playSFX('sfx_ui_close');}
function beginMerchantPurchase(offerId){
  if(merchantPurchasePending)return;
  const offer=merchantOffers().find(entry=>entry.offerId===offerId);
  if(!offer)return;
  if(offer.requiresConfirmation&&typeof window.confirm==='function'&&!window.confirm(`${offer.name}\nราคา ${offer.price.amount} Gold\nซื้อเข้ากระเป๋า 1 ครั้งหรือไม่?`))return;
  merchantPurchasePending=true;
  renderMerchantShop();
  const now=Date.now();
  const command={
    commandId:`merchant-purchase:${now}:${++merchantPurchaseSequence}`,
    offerId:offer.offerId,
    quantity:offer.quantity,
    expectedCatalogVersion:offer.catalogVersion,
    expectedUnitPrice:offer.price.amount,
    expectedCurrencyId:offer.price.currencyId,
    expectedGoldBefore:state.wallet?.gold,
    expectedItemQuantityBefore:state.inventory?.[offer.itemId],
    purchasedAt:now,
  };
  let candidateForPublish=null;
  const committed=commitMerchantPurchase({
    state,
    command,
    persistCandidate(nextState){
      candidateForPublish={...nextState,saveVersion:SAVE_SCHEMA_VERSION,lifeLastAt:now};
      const envelope={state:sanitizeStateForPersistence(persistableState(candidateForPublish)),playerHp:playerData.hp,saveSchemaVersion:SAVE_SCHEMA_VERSION};
      const written=writeStoredSave(localStorage,envelope);
      return {ok:true,envelope:written};
    },
  });
  merchantPurchasePending=false;
  if(!committed.ok){
    msg(merchantPurchaseReasonText(committed.reason));
    renderMerchantShop();
    return;
  }
  Object.assign(state,candidateForPublish);
  msg(`${offer.name} เข้ากระเป๋าแล้ว • -${offer.price.amount} Gold`);
  renderMerchantShop();renderManager();renderHUD();
  if(remoteSaveReady)void saveRemoteSave(committed.persisted.envelope).catch(error=>console.warn('cloud save failed',error));
  else if(remoteSaveSyncing)remoteSavePending=true;
}
function openTrainer(){
  if(!isNearTrainer()){msg('เข้าใกล้ครูฝึกก่อน');return;}
  el('trainerPanel').classList.remove('hidden');
  renderTrainerPanel();
  playSFX('sfx_ui_open');
}
function closeTrainer(){el('trainerPanel').classList.add('hidden');playSFX('sfx_ui_close');}
function renderTrainerPanel(){renderTraining(el('trainerBody'));}
function openEvolutionGuide(){
  if(!isNearEvolution()){msg('เข้าใกล้นักวิจัยวิวัฒนาการก่อน');return;}
  el('evolutionPanel').classList.remove('hidden');
  renderEvolutionGuide();
  playSFX('sfx_ui_open');
}
function closeEvolutionGuide(){el('evolutionPanel').classList.add('hidden');playSFX('sfx_ui_close');}
function openBreedingCaretaker(){
  if(!isNearBreeding()){msg('เข้าใกล้ผู้ดูแลเพาะพันธุ์ก่อน');return;}
  el('breedingPanel').classList.remove('hidden');
  renderBreedingSalon();
  playSFX('sfx_ui_open');
}
function closeBreedingCaretaker(){el('breedingPanel').classList.add('hidden');playSFX('sfx_ui_close');}
function salonParentPodHTML(label,inst){
  if(!inst)return `<span>${label}</span><strong>แตะเพื่อเลือก</strong><small>มอน Stage 2 ในคลัง</small>`;
  const sp=spById[inst.speciesId],profile=workbookBreedingProfile(inst.speciesId);
  return `<span>${label}</span><span class="breeding-salon-orb" style="background:#${sp.color.toString(16).padStart(6,'0')}">${displayName(inst).slice(0,1)}</span><strong>${displayName(inst)}</strong><small>Lv.${inst.level} • ${GENDER_TH[inst.gender]||inst.gender} • Bond ${fmt(inst.mind?.bond??inst.bond)} • ${profile?.breedingGroup||'Unknown'}</small>`;
}
function renderBreedingSalon(){
  const ids=breedingAdultIds();
  const a=getInst(state.breeding.parentA),b=getInst(state.breeding.parentB),compat=breedingCompatibility(a,b);
  const adults=el('breedingSalonAdults');if(adults)adults.textContent=`พร้อมผสม ${ids.length}`;
  const eggsChip=el('breedingSalonEggs');if(eggsChip)eggsChip.textContent=`ไข่ ${state.eggs.length}`;
  const podA=el('breedingSalonParentA');if(podA){podA.innerHTML=salonParentPodHTML('Parent A',a);podA.classList.toggle('filled',!!a);}
  const podB=el('breedingSalonParentB');if(podB){podB.innerHTML=salonParentPodHTML('Parent B',b);podB.classList.toggle('filled',!!b);}
  const chip=el('breedingSalonCompat');
  if(chip){
    chip.textContent=compat.text;
    chip.className='breeding-salon-compat'+(a&&b?(compat.ok?' ok':' bad'):'');
  }
  const start=el('breedingOpenManager');if(start)start.disabled=!compat.ok;
  const nest=el('breedingSalonIncubator');if(!nest)return;
  if(!state.eggs.length){nest.innerHTML='<div class="breeding-salon-empty">Incubator ว่าง • เลือกคู่แล้วกดเริ่มผสมพันธุ์</div>';return;}
  const now=Date.now();
  nest.innerHTML=state.eggs.slice(-3).map(egg=>{
    if(!egg||typeof egg!=='object')return '';
    const holderId=egg.eggHolderOwnedMonsterId||egg.eggHolderId||egg.parentAId,partnerId=egg.partnerOwnedMonsterId||egg.parentBId;
    const holder=getInst(holderId),partner=getInst(partnerId),readyAt=egg.hatchAt??egg.readyAt,hasDeadline=Number.isFinite(readyAt),hatched=!!egg.hatchedOwnedMonsterId;
    const remain=hasDeadline?remainingCountdownSeconds(readyAt,now):Infinity;
    const status=hatched?'ฟักแล้ว':(!hasDeadline?'ข้อมูลเวลาไม่ถูกต้อง':(remain>0?remain+'s':'พร้อมฟัก!'));
    const canHatch=!hatched&&hasDeadline&&remain<=0;
    return `<div class="breeding-salon-egg"><span class="breeding-salon-egg-icon">🥚</span><span><b>${status}</b><small>${holder?displayName(holder):'?'} × ${partner?displayName(partner):'?'}</small></span>${canHatch?`<button type="button" data-salon-hatch="${egg.eggId}">ฟักไข่</button>`:''}</div>`;
  }).join('');
}
function renderEvolutionGuide(){
  const ids=[...state.party.filter(Boolean),...state.storage];
  const selected=ids.includes(state.evolutionCandidate)?state.evolutionCandidate:ids[0]||null;
  state.evolutionCandidate=selected;
  const select=el('evolutionMonsterSelect');
  if(select){select.innerHTML=ids.map(id=>{const inst=getInst(id);return inst?`<option value="${id}" ${id===selected?'selected':''}>${displayName(inst)} • Lv.${inst.level}</option>`:''}).join('');select.onchange=()=>{state.evolutionCandidate=select.value;renderEvolutionGuide();};}
  renderEvolution(el('evolutionBody'));
}
function renderMerchantShop(){
  const box=el('merchantProducts');if(!box)return;
  const gold=state.wallet?.gold??0;
  const balance=el('merchantGold');if(balance)balance.textContent=`${gold}`;
  box.innerHTML=merchantOffers().map(offer=>{
    const owned=state.inventory?.[offer.itemId]||0;
    const canAfford=gold>=offer.price.amount;
    return `<div class="merchant-item" data-offer-id="${offer.offerId}"><div class="merchant-icon">${offer.icon}</div><div class="merchant-info"><b>${offer.name}</b><small>${offer.note}</small><span>${offer.price.amount} Gold • มี ${owned}</span></div><button data-buy-offer="${offer.offerId}" ${merchantPurchasePending||!canAfford?'disabled':''}>ซื้อ ${offer.quantity}</button></div>`;
  }).join('');
  box.querySelectorAll('[data-buy-offer]').forEach(button=>button.onclick=()=>beginMerchantPurchase(button.dataset.buyOffer));
}
function assertCharacterMutable(id){
  const gate=characterUI.requestMutate(id);
  if(!gate.ok){msg(gate.reasonText);return false;}
  return true;
}
function assertRanchOperation(){
  if(isNearNpc()||isNearBreeding())return true;
  msg(FULL_MANAGER_NPC_REASON);
  return false;
}
function revealMonsterManager(tab){
  if(ensureCaptureBallSafety())msg('Keeper Starter Kit • Capture Ball +5');
  applyLifeSimulation(Date.now(),true);
  const manager=el('monsterManager');
  manager.classList.remove('hidden');
  manager.classList.toggle('character-manager-mode',characterUI.snapshot().source==='character');
  const close=el('closeManager');
  if(close){
    close.textContent='✕';
    close.setAttribute('aria-label',characterUI.snapshot().source==='character'?'กลับแผงตัวละคร':'ปิดหน้าต่างผู้ดูแล');
  }
  setManagerTab(tab||currentManagerTab||'collection');
  if((tab||currentManagerTab||'collection')==='collection'){
    const focused=el('monsterManager')?.querySelector('.manager-item.focused-monster');
    focused?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  managerDirty.consume(performance.now());
  playSFX('sfx_ui_open');
}
function showRanchServices(){const result=characterUI.requestOpenRanchServices({isNearNpc:isNearNpc()});if(!result.ok){msg(result.reasonText);return result;}el('ranchServices').classList.remove('hidden');el('ranchStoragePage').classList.add('hidden');return result;}
function showRanchStorageShell(){const result=characterUI.requestOpenRanchStorage({isNearNpc:isNearNpc()});if(!result.ok){msg(result.reasonText);return result;}el('ranchServices').classList.add('hidden');el('ranchStoragePage').classList.remove('hidden');renderRanchStoragePage();return result;}
function closeRanchSurface(){characterUI.backRanch();const panel=characterUI.snapshot().ranchPanel;el('ranchServices').classList.toggle('hidden',panel!=='services');el('ranchStoragePage').classList.toggle('hidden',panel!=='storage');}
function openRanchBreeding(){if(!assertRanchOperation())return;el('ranchServices').classList.add('hidden');openManager({source:'npc'});setManagerTab('breeding');}
function openManager(options={}){
  const source=options.source==='character'?'character':'npc';
  const focused=options.monsterId||state.ui.focusedMonsterId||state.party[state.selectedSlot];
  const tab=options.tab||currentManagerTab||'collection';
  const gate=characterUI.requestOpenFull({
    isNearNpc:isNearNpc()||isNearBreeding(),
    monsterId:focused,
    tab,
    source,
  });
  if(!gate.ok){if(gate.reasonText)msg(gate.reasonText);return gate;}
  revealMonsterManager(tab);
  renderParty();
  renderCharacterAccess();
  return gate;
}
function closeManager(){
  const snap=characterUI.snapshot();
  const returnToQuick=snap.source==='character'&&snap.characterStack.some(frame=>frame.resumePanel==='quick'||frame.resumePanel==='tab'||frame.returnTo==='quick');
  if(returnToQuick){
    characterUI.back();
    el('monsterManager').classList.add('hidden');
    saveGame(false);
    renderParty();
    renderCharacterAccess();
    playSFX('sfx_ui_close');
    return;
  }
  characterUI.closeAll();
  dismissCharacterAccessHistory();
  el('monsterManager').classList.add('hidden');
  saveGame(false);
  renderParty();
  renderCharacterAccess();
  playSFX('sfx_ui_close');
}
function depositMonster(id){if(!assertRanchOperation())return;if(state.party.filter(Boolean).length<=1){msg('ต้องเหลือมอนอย่างน้อย 1 ตัวใน Party');return;}if(activeSummon?.inst.instanceId===id)recall(false);const slot=state.party.findIndex(x=>x===id);if(slot<0)return;state.party[slot]=null;if(!state.storage.includes(id))state.storage.push(id);state.ranchActive=state.ranchActive.filter(x=>x!==id);state.lifeLastAt=Date.now();syncRanchVisuals();syncHubCompanion();msg('ฝากมอนเข้า Storage/Ranch แล้ว');renderManager();renderRanchStoragePage();renderParty();saveGame(false);}
function withdrawMonster(id){if(!assertRanchOperation())return;const empty=state.party.findIndex(x=>x===null);if(empty<0){msg('Party เต็ม 3 ตัว');return;}applyLifeSimulation(Date.now(),true);state.storage=state.storage.filter(x=>x!==id);state.ranchActive=state.ranchActive.filter(x=>x!==id);state.party[empty]=id;syncRanchVisuals();syncHubCompanion();msg(`รับมอนเข้า Party ช่อง ${empty+1}`);renderManager();renderRanchStoragePage();renderParty();saveGame(false);}
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
  const labels={hp:'HP',atk:'ATK',def:'DEF',spAtk:'SP.ATK',spDef:'SP.DEF',spd:'SPD'};
  const lines=['hp','atk','def','spAtk','spDef','spd'].map(stat=>{
    const detail=br[stat];if(!detail)return '';
    return `${labels[stat]} ${detail.final} = floor((2×${detail.baseStat} + Pot ${detail.potential} + Train ${detail.training}/4) × Lv.${detail.level}/100) + ${detail.flatBonus} + Nut ${detail.nutritionFlat} + Eq ${detail.equipmentFlat} × Cond ${detail.conditionMultiplier.toFixed(2)} × Passive ${detail.passiveMultiplier.toFixed(2)}`;
  }).filter(Boolean);
  return lines.length?`<div class="stat-breakdown">${lines.join('<br>')}</div>`:'';
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
function bindRosterFocus(wrap,inst){
  wrap.addEventListener('pointerdown',event=>{
    if(event.target.closest('button'))return;
    event.preventDefault();
    event.stopPropagation();
    characterUI.focusMonster(inst.instanceId);
    renderManager();
    if(currentManagerTab==='training')renderTraining();
    if(currentManagerTab==='skills')renderSkills();
    if(currentManagerTab==='equipment')renderEquipment();
  },{passive:false});
}
function monsterCard(inst,where){
  const sp=spById[inst.speciesId],types=monsterTypes(inst).map(typeBadge).join(''),wrap=document.createElement('div');wrap.className='manager-item';if(state.ui?.focusedMonsterId===inst.instanceId)wrap.classList.add('focused-monster');const active=state.ranchActive.includes(inst.instanceId),faint=inst.fainted||inst.hp<=0,cr=monsterCrValue(inst);
  const eq=inst.equipment||{};
  const stash=(state.inventory.stash||[]).map(equipmentById).filter(Boolean);
  wrap.innerHTML=`<div class="monster-main"><div class="monster-title"><b>${displayName(inst)}</b>${types}</div><div class="monster-meta">Lv.${inst.level} • ${inst.lifeStage} • Gen ${inst.generation} • ${inst.personality} • <span class="gender">${GENDER_TH[inst.gender]||inst.gender}</span> • Group ${sp.breedingGroup}<br>HP ${fmt(inst.hp)}/${inst.maxHp} • ATK ${inst.atk} • DEF ${inst.def} • SP.ATK ${inst.spAtk} • SP.DEF ${inst.spDef} • SPD ${inst.spd} • CR ${cr??'—'} • Bond ${fmt(inst.bond)} ${faint?'<span class="fainted">• FAINTED</span>':''}</div>${needsHTML(inst)}${breakdownHTML(inst)}${familyHTML(inst)}<div class="gene-line">${geneHTML(inst)}</div>${where==='storage'?trainingPoolHTML(inst):''}${skillsMiniHTML(inst)}${equipMiniHTML(inst)}${skillPanelHTML(inst)}<div class="feed-actions"><button data-feed="protein">โปรตีน</button><button data-feed="healthy">สุขภาพ</button><button data-feed="favorite">ของโปรด</button><button data-feed="trainingChow">อาหารฝึก</button><button data-feed="mineralBite">แร่บำรุง</button><button data-feed="moonFruit">ผลจันทร์</button></div><div class="care-actions"><button data-care="rest">💤 พักผ่อน</button><button data-care="play">🎾 เล่นด้วย</button></div><div class="equip-actions">${stash.map(item=>`<button data-equip="${item.id}">${eq[item.slot]?.id===item.id?'ถอด':'ใส่'} ${item.name}</button>`).join('')}</div>${where==='storage'?`<div class="train-actions"><button data-train="power">Power</button><button data-train="defense">Defense</button><button data-train="speed">Speed</button><button data-train="technique">Technique</button><button data-train="spirit">Spirit</button></div>`:''}</div><div class="manager-actions"><button class="move-btn ${where==='storage'?'withdraw':''}">${where==='storage'?'เข้า Party':'ฝาก Storage'}</button>${where==='storage'?`<button class="ranch-toggle ${active?'active':''}">${active?'เก็บจากลาน':'ปล่อยใน Ranch'}</button>`:''}${sp.evolutionPaths?.length?'<button class="evo-btn">ดู Evolution</button>':''}<button class="cr-btn">ดู CR</button></div>`;
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
  bindRosterFocus(wrap,inst);
  return wrap;
}
function toggleStarterEquip(id,itemId){
  const inst=getInst(id);if(!inst)return;
  if(!assertCharacterMutable(id))return;
  const item=equipmentById(itemId);if(!item)return;
  if(inst.equipment?.[item.slot]?.id===item.id)unequipMonster(id,item.slot);
  else{
    const preview=loadoutPreview(instanceCombatBuildSafe(inst),computeEquipmentContribution([{...item,affixes:item.affixes.map(a=>({...a}))}]));
    msg(`Preview ${item.name}: CR ${preview.crDelta>=0?'+':''}${Math.round(preview.crDelta)} • DPS ${preview.dpsDelta>=0?'+':''}${Math.round(preview.dpsDelta)} • EHP ${preview.ehpDelta>=0?'+':''}${Math.round(preview.ehpDelta)}`);
    equipMonsterItem(id,{...item,affixes:item.affixes.map(a=>({...a}))});
  }
}
async function learnCandidateSkill(id,skillId){
  const inst=getInst(id);if(!inst)return;
  if(!assertCharacterMutable(id))return;
  const def=(SKILL_CANDIDATES[inst.speciesId]||[]).find(d=>d.id===skillId);if(!def)return;
  const ev=evaluateSkillCandidate(def,inst);
  if(!ev.eligible){msg(`ยังเรียน ${skillId} ไม่ได้ • ${(ev.failedRequired||[]).map(r=>r.field+' '+r.op+' '+r.value).join(' • ')}`);return;}
  if(!requireServerMutation())return;
  try{
    const result=await learnMonsterSkill(id,def.id,null);
    applyAuthoritativeMonster(id,result.monsterJson);
    msg(`${displayName(inst)} เรียน ${def.id} สำเร็จ`);
    renderManager();if(currentManagerTab==='skills')renderSkills();saveGame(false);
  }catch(error){msg(`Skill: ${error.message}`);}
}
function learnSkillMemory(id){
  const inst=getInst(id);if(!inst)return;
  if(!assertCharacterMutable(id))return;
  const result=learnInheritedSkillMemory(inst);
  if(!result.ok){msg(`Skill Memory ยังเรียนไม่ได้ • ${SKILL_MEMORY_REASON_TH[result.reason]||result.reason}`);return;}
  msg(`${displayName(inst)} เรียน ${result.skill.skillId} จาก Skill Memory • ยังไม่ติดตั้งในสล็อต`);
  renderManager();if(currentManagerTab==='skills')renderSkills();saveGame(false);
}
function setMonsterSkillLoadout(id,skillId,requestedSlot){
  const inst=getInst(id);if(!inst)return;
  if(!assertCharacterMutable(id)){renderSkills();return;}
  const learned=getSkill(inst,skillId);
  if(!learned){msg(`ติดตั้ง ${skillId} ไม่ได้ • มอนยังไม่ได้เรียนสกิลนี้`);renderSkills();return;}
  const currentSlot=MANUAL_SKILL_SLOTS.includes(learned.slot)?learned.slot:null;
  if(requestedSlot===currentSlot)return;
  const result=requestedSlot
    ?setManualSkillSlot(inst,{skillId,slot:requestedSlot})
    :currentSlot?setManualSkillSlot(inst,{skillId:null,slot:currentSlot}):{ok:true};
  if(!result.ok){msg(`จัด Loadout ไม่สำเร็จ • ${result.reason}`);renderSkills();return;}
  const definition=skillCatalogEntry(skillId),name=definition?.nameTH||skillId;
  if(requestedSlot){
    const displaced=result.displacedSkillId?` • ${result.swapped?'สลับกับ':'ถอด'} ${result.displacedSkillId}`:'';
    msg(`${displayName(inst)} ติดตั้ง ${name} ที่ ${requestedSlot.toUpperCase()}${displaced}`);
  }else msg(`${displayName(inst)} ถอด ${name} ออกจาก ${currentSlot.toUpperCase()}`);
  renderManager();renderSkills();saveGame(false);
}
function mutateOwnedSkill(id,skillId){
  const inst=getInst(id);if(!inst)return;
  if(!assertCharacterMutable(id))return;
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
function breedingAdultIds(){return state.storage.filter(id=>{const inst=getInst(id);return inst&&resolveWorkbookEvolutionStage(inst).stage2;});}
let pickerTarget='parentA';
function parentButtonHTML(inst){if(!inst)return '<span class="parent-empty">＋ เลือกมอน</span>';const sp=spById[inst.speciesId],profile=workbookBreedingProfile(inst.speciesId);return `<span class="parent-orb" style="background:#${sp.color.toString(16).padStart(6,'0')}">${displayName(inst).slice(0,1)}</span><span><b>${displayName(inst)}</b><small>${GENDER_TH[inst.gender]||inst.gender} • Bond ${fmt(inst.mind?.bond??inst.bond)} • ${profile?.breedingGroup||'Unknown'}</small></span>`;}
function closeMonsterPicker(){el('monsterPicker').classList.add('hidden');}
function openMonsterPicker(target){if(!assertRanchOperation())return;pickerTarget=target;const list=el('monsterPickerList'),ids=breedingAdultIds();el('pickerTitle').textContent=target==='parentA'?'เลือก Parent A':'เลือก Parent B';list.innerHTML='';if(!ids.length){list.innerHTML='<div class="manager-empty">ยังไม่มีมอน Stage 2 ใน Storage</div>';}for(const id of ids){const inst=getInst(id),sp=spById[inst.speciesId],profile=workbookBreedingProfile(inst.speciesId),bond=inst.mind?.bond??inst.bond??0,cooldown=inst.breedingCooldownUntil??0,eligible=profile?.breedingEligibility==='Yes'&&inst.level>=20&&bond>=50&&cooldown<=Date.now(),selected=state.breeding[target]===id,d=document.createElement('button');d.className='picker-mon-card'+(selected?' selected':'');d.innerHTML=`<span class="picker-orb" style="background:#${sp.color.toString(16).padStart(6,'0')}">${displayName(inst).slice(0,1)}</span><span class="picker-info"><b>${displayName(inst)}</b><small>Lv.${inst.level} • Stage 2 • ${GENDER_TH[inst.gender]||inst.gender}</small><small>Bond ${fmt(bond)} • Group ${profile?.breedingGroup||'Unknown'}</small></span>${eligible?'<span class="picker-ok">พร้อม</span>':'<span class="picker-warn">ยังไม่พร้อม</span>'}`;d.onclick=()=>{state.breeding[target]=id;closeMonsterPicker();renderBreeding();};list.appendChild(d);}el('monsterPicker').classList.remove('hidden');}
function renderBreedingSkillMemoryChoices(eggHolder,partner,enabled){
  const select=el('breedingSkillMemory');if(!select)return[];
  const previous=select.value,candidates=enabled?listBreedingSkillMemoryCandidates(eggHolder,partner):[];
  select.replaceChildren();
  const emptyOption=document.createElement('option');emptyOption.value='';emptyOption.textContent='ไม่ส่งต่อ Skill Memory';select.appendChild(emptyOption);
  for(const candidate of candidates){const option=document.createElement('option');option.value=candidate.skillId;option.textContent=`${candidate.preferred?'★ ':''}${candidate.definition.nameTH} • ${candidate.skillId} (${candidate.method})`;select.appendChild(option);}
  select.value=candidates.some(candidate=>candidate.skillId===previous)?previous:'';
  select.disabled=!enabled;
  const hint=el('breedingSkillMemoryHint');if(hint)hint.textContent=enabled?(candidates.length?`เลือกได้ ${candidates.length} สกิล • ★ = BreedingCandidate ที่แนะนำ`:'คู่นี้ไม่มี Skill Memory ที่ผ่านกฎ'):'เลือกคู่ที่ผ่านกฎก่อน';
  return candidates;
}
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
  const memoryCandidates=renderBreedingSkillMemoryChoices(compat.eggHolder,compat.partner,compat.ok);
  if(a&&b){
    const holder=compat.eggHolder,partner=compat.partner,childProfile=workbookBreedingProfile(holder?.speciesId);
    const potentialPreview=[['hp','HP'],['atk','ATK'],['def','DEF'],['spAtk','SP.ATK'],['spDef','SP.DEF'],['spd','SPD']].map(([key,label])=>{
      const holderValue=holder?.potential?.[key]??'?',partnerValue=partner?.potential?.[key]??'?';
      return `<div class="gene-inherit-cell"><span class="gene-label">${label}</span><span class="gene-pred">${holderValue}/${partnerValue}</span><span class="gene-pct">0–31</span></div>`;
    }).join('');
    const births=(state.collection||[]).filter(m=>m.origin==='bred'||(m.lifeHistory||[]).some(h=>h.type==='birth'));
    const birthHTML=births.length?`<div class="birth-history">${births.slice(-6).map(m=>`<div class="birth-history-item">ฟัก ${displayName(m)} • Stage 1</div>`).join('')}</div>`:'';
    el('inheritPreview').innerHTML=`Egg Holder: <b>${holder?displayName(holder):'ไม่พบ'}</b> • ลูกเป็น ${childProfile?.childMonsterId||'Stage 1 ของ Holder'} • Skill Memory ที่เลือกได้ ${memoryCandidates.length}<br><div class="gene-inherit-preview">${potentialPreview}</div><div style="font-size:8px;color:#64748b;margin-top:4px">Potential: สุ่มรับ 2 ค่าจาก Holder + 1 ค่าจาก Partner แบบ exact และสุ่มอีก 3 ค่าในช่วง 0–31 ตอนสร้างไข่เพียงครั้งเดียว • Skill Memory ไม่สุ่ม</div>${birthHTML}`;
  }else el('inheritPreview').textContent='เลือกพ่อแม่เพื่อดู Potential ที่จะส่งต่อ';
  const list=el('eggList');
  list.innerHTML='';
  if(!state.eggs.length)list.innerHTML='<div class="manager-empty">ยังไม่มีไข่ใน Incubator</div>';
  const now=Date.now();
  for(const egg of state.eggs){
    if(!egg||typeof egg!=='object')continue;
    const holderId=egg.eggHolderOwnedMonsterId||egg.eggHolderId||egg.parentAId,partnerId=egg.partnerOwnedMonsterId||egg.parentBId;
    const holder=getInst(holderId),partner=getInst(partnerId),readyAt=egg.hatchAt??egg.readyAt,hasDeadline=Number.isFinite(readyAt),hatched=!!egg.hatchedOwnedMonsterId;
    const remain=hasDeadline?remainingCountdownSeconds(readyAt,now):Infinity,d=document.createElement('div');
    d.className='egg-card';
    if(hasDeadline)d.dataset.eggReadyAt=String(readyAt);
    d.dataset.eggHatched=hatched?'true':'false';
    const countdown=hatched?'ฟักแล้ว':(!hasDeadline?'ข้อมูลเวลาไม่ถูกต้อง':(remain>0?remain+'s':'พร้อมฟัก!'));
    const action=hatched?'ฟักแล้ว':(!hasDeadline?'ฟักไม่ได้':(remain>0?'กำลังฟัก':'ฟักไข่'));
    const disabled=hatched||!hasDeadline||remain>0;
    d.innerHTML=`<div class="egg-top"><span class="egg-icon">🥚</span><b data-egg-countdown>${countdown}</b></div><div class="egg-meta">${holder?displayName(holder):holderId||'?'} × ${partner?displayName(partner):partnerId||'?'}<br>ผู้ถือไข่: ${holder?displayName(holder):holderId||'?'}<br>Skill Memory: ${egg.inheritedSkillMemoryId||'ไม่มี'}</div><button data-egg-hatch ${disabled?'disabled':''}>${action}</button>`;
    d.querySelector('[data-egg-hatch]').onclick=()=>hatchEgg(egg.eggId);
    list.appendChild(d);
  }
  renderBreedingSalon();
}
function updateEggCountdowns(now=Date.now()){
  const list=el('eggList');
  if(!list)return;
  for(const card of list.querySelectorAll('[data-egg-ready-at]')){
    const hatched=card.dataset.eggHatched==='true';
    const remain=remainingCountdownSeconds(Number(card.dataset.eggReadyAt),now);
    const status=hatched?'ฟักแล้ว':(remain>0?remain+'s':'พร้อมฟัก!'),action=hatched?'ฟักแล้ว':(remain>0?'กำลังฟัก':'ฟักไข่');
    const label=card.querySelector('[data-egg-countdown]'),button=card.querySelector('[data-egg-hatch]');
    if(label&&label.textContent!==status)label.textContent=status;
    if(button){
      if(button.disabled!==(hatched||remain>0))button.disabled=hatched||remain>0;
      if(button.textContent!==action)button.textContent=action;
    }
  }
}
function focusedCharacterPresentation(){
  return getFocusedCharacterPresentation({
    getInst,
    focusedMonsterId:state.ui?.focusedMonsterId,
    describeRoster:id=>characterUI?.describeRoster(id),
    displayName,
    getTypes:monsterTypes,
    getCr:monsterCrValue,
  });
}
function renderFullCharacterPreview(){
  if(!characterPreviewScene&&!characterPreviewRenderer)initCharacterPreview3D();
  const presentation=focusedCharacterPresentation();
  const inst=presentation.id?getInst(presentation.id):null;
  const species=inst?spById[inst.speciesId]:null;
  const previewId=inst?.instanceId||null;
  if(previewId!==characterPreviewId){
    if(characterPreviewMesh&&characterPreviewScene)removeAndDispose(characterPreviewScene,characterPreviewMesh);
    characterPreviewMesh=null; characterPreviewId=previewId;
    if(inst&&species&&characterPreviewScene){
      characterPreviewMesh=monsterMesh(species,true,inst);
      characterPreviewMesh.scale.multiplyScalar(.86);
      characterPreviewMesh.position.y=.02;
      setupMonsterMotion(characterPreviewMesh,species,inst);
      characterPreviewScene.add(characterPreviewMesh);
    }
  }
  const portrait=el('characterPreviewPortrait');
  const portraitColor=species?`#${species.color.toString(16).padStart(6,'0')}`:'#334155';
  setTextIfChanged(portrait,presentation.isEmpty?'?':presentation.name.slice(0,1));
  if(portrait&&portrait.dataset.color!==portraitColor){portrait.dataset.color=portraitColor;portrait.style.backgroundColor=portraitColor;}
  setTextIfChanged(el('characterPreviewName'),presentation.isEmpty?'เลือกมอนสเตอร์':presentation.name);
  setTextIfChanged(el('characterPreviewMeta'),presentation.isEmpty?'Lv.— · EXP — · CR —':`Lv.${presentation.level??'—'} · EXP ${fmt(presentation.exp??0)} · CR ${presentation.cr??'—'}`);
  setTextIfChanged(el('characterPreviewTypes'),presentation.isEmpty?'เลือก Party ด้านซ้ายเพื่อดูรายละเอียด':presentation.types.map(type=>`${TYPE_EMOJI[type]||'•'} ${type}`).join('  '));
  setTextIfChanged(el('characterPreviewPlace'),presentation.isEmpty?'—':presentation.placeLabel);
  const growth=presentation.growth&&typeof presentation.growth==='object'?Object.values(presentation.growth).reduce((sum,value)=>sum+(Number(value)||0),0):presentation.growth;
  setTextIfChanged(el('characterPreviewGrowth'),presentation.isEmpty?'Bond — · Growth —':`HP ${fmt(presentation.hp??0)}/${fmt(presentation.maxHp??0)} · Bond ${fmt(presentation.bond??0)} · Growth ${growth??'—'}`);
}
function renderFullCharacterStatBreakdown(){
  const presentation=focusedCharacterPresentation();
  const inst=presentation.id?getInst(presentation.id):null;
  if(!inst)return '';
  const labels={hp:'HP',atk:'ATK',def:'DEF',spAtk:'SP.ATK',spDef:'SP.DEF',spd:'SPD'};
  const details=['hp','atk','def','spAtk','spDef','spd'].map(stat=>[labels[stat],inst.statBreakdown?.[stat]]).filter(([,detail])=>detail);
  const source=(label,value)=>`<span><b>${label}</b> ${value}</span>`;
  return `<details class="character-stat-breakdown"><summary>Stat Breakdown</summary>${details.map(([label,detail])=>`<section class="character-stat-source"><h4>${label} ${fmt(detail.final)}</h4><div>${[
    source('Workbook Base',fmt(detail.baseStat)),source('Level',fmt(detail.level)),source('Potential',fmt(detail.potential)),
    source('Training',fmt(detail.training)),source('Nutrition',fmt(detail.nutritionFlat)),
    source('Equipment',fmt(detail.equipmentFlat)),source('Condition',detail.conditionMultiplier.toFixed(2)),
    source('Passive',detail.passiveMultiplier.toFixed(2)),
  ].join('')}</div></section>`).join('')}</details>`;
}
function renderFullCharacterStatus(){
  const body=el('characterInfoBody');
  if(!body)return;
  const presentation=focusedCharacterPresentation();
  const inst=presentation.id?getInst(presentation.id):null;
  if(presentation.isEmpty||!inst){
    body.innerHTML='<div class="character-info-empty">เลือกมอนสเตอร์จากรายการเพื่อแสดง HP, Stats, CR และ Condition</div>';
    return;
  }
  const condition=deriveCondition(inst)||'normal';
  body.innerHTML=`<div class="character-status-grid">
    <div class="character-status-hp"><b>HP</b><span>${fmt(presentation.hp??0)}/${fmt(presentation.maxHp??0)}</span></div>
    <div class="character-status-atk"><b>ATK</b><span>${fmt(presentation.atk??0)}</span></div>
    <div class="character-status-def"><b>DEF</b><span>${fmt(presentation.def??0)}</span></div>
    <div class="character-status-spatk"><b>SP.ATK</b><span>${fmt(inst.spAtk??0)}</span></div>
    <div class="character-status-spdef"><b>SP.DEF</b><span>${fmt(inst.spDef??0)}</span></div>
    <div class="character-status-spd"><b>SPD</b><span>${fmt(presentation.spd??0)}</span></div>
    <div class="character-status-cr"><b>CR</b><span>${presentation.cr??'—'}</span></div>
    <div class="character-status-condition"><b>Condition</b><span>${condition}</span></div>
    ${renderFullCharacterStatBreakdown()}
  </div>`;
}
function renderFullCharacterInfoTab(){
  const snap=characterUI?.snapshot?.();
  const tab=snap?.characterTab==='collection'||!snap?.characterTab?'info':snap.characterTab;
  syncFullCharacterInfoTabA11y(tab);
  if(tab==='skills')return renderSkills(el('characterInfoBody'));
  if(tab==='equipment')return renderEquipment(el('characterInfoBody'));
  if(tab==='training')return renderTraining(el('characterInfoBody'));
  if(tab==='evolution')return renderEvolution(el('characterInfoBody'));
  return renderFullCharacterStatus();
}
let ranchStorageFocusId=null;
function syncRanchClubPreview(inst){
  if(!ranchClubPreviewScene&&!ranchClubPreviewRenderer)initRanchClubPreview3D();
  const species=inst?spById[inst.speciesId]:null;
  const previewId=inst?.instanceId||null;
  if(previewId!==ranchClubPreviewId){
    if(ranchClubPreviewMesh&&ranchClubPreviewScene)removeAndDispose(ranchClubPreviewScene,ranchClubPreviewMesh);
    ranchClubPreviewMesh=null; ranchClubPreviewId=previewId;
    if(inst&&species&&ranchClubPreviewScene){
      ranchClubPreviewMesh=monsterMesh(species,true,inst);
      ranchClubPreviewMesh.scale.multiplyScalar(.9);
      ranchClubPreviewMesh.position.y=.02;
      setupMonsterMotion(ranchClubPreviewMesh,species,inst);
      ranchClubPreviewScene.add(ranchClubPreviewMesh);
    }
  }
  const portrait=el('ranchClubPreviewPortrait');
  const portraitColor=species?`#${species.color.toString(16).padStart(6,'0')}`:'#14532d';
  setTextIfChanged(portrait,inst?displayName(inst).slice(0,1):'♣');
  if(portrait&&portrait.dataset.color!==portraitColor){portrait.dataset.color=portraitColor;portrait.style.backgroundColor=portraitColor;}
  el('ranchClubStage')?.classList.toggle('ranch-club-empty-stage',!inst);
  el('ranchClubStageArt')?.classList.toggle('has-3d',Boolean(ranchClubPreviewMesh));
  setTextIfChanged(el('ranchClubPreviewName'),inst?displayName(inst):'Monster Club');
  setTextIfChanged(el('ranchClubPreviewMeta'),inst?`Lv.${inst.level} • HP ${fmt(inst.hp)}/${fmt(inst.maxHp)}`:'ฝากมอนจาก Party เพื่อเข้าคลับ');
  const hpPct=inst?.maxHp?Math.max(0,Math.min(100,Math.round(100*inst.hp/inst.maxHp))):0;
  const hpBar=el('ranchClubPreviewHp'),hpFill=el('ranchClubPreviewHpFill');
  hpBar?.classList.toggle('hidden',!inst);
  if(hpFill)hpFill.style.width=`${hpPct}%`;
  const typesBox=el('ranchClubPreviewTypes');
  if(typesBox)typesBox.innerHTML=inst?monsterTypes(inst).map(typeBadge).join(''):'';
}
function renderRanchStoragePage(){
  const roster=el('ranchStorageRoster'),vault=el('ranchClubVault'),preview=el('ranchStoragePreview'),details=el('ranchStorageDetails');
  if(!roster||!preview||!details)return;
  const ids=state.storage.filter(Boolean);
  const partyIds=state.party.filter(Boolean);
  const selectableIds=[...partyIds,...ids];
  el('ranchStorageCount').textContent=`Storage ${ids.length}`;
  el('ranchActiveCount').textContent=`Ranch Active ${state.ranchActive.length}/${RANCH_ACTIVE_MAX}`;
  const clubTint=(inst)=>{const sp=inst&&spById[inst.speciesId];return sp?`#${sp.color.toString(16).padStart(6,'0')}`:'#166534';};
  const clubCardHTML=(inst,kind)=>{
    const ranch=state.ranchActive.includes(inst.instanceId);
    const faint=inst.fainted||inst.hp<=0;
    const chip=kind==='party'?'พกอยู่':ranch?'Ranch':'คลัง';
    return `<span class="ranch-club-avatar" style="background:${clubTint(inst)}">${displayName(inst).slice(0,1)}</span><span class="ranch-club-card-copy"><b>${displayName(inst)}</b><small>Lv.${inst.level}${faint?' • FAINT':''}</small></span><span class="ranch-club-chip">${chip}</span>`;
  };
  const fillColumn=(mount,title,group,kind,emptyText)=>{
    if(!mount)return;
    mount.innerHTML='';
    const head=document.createElement('div');
    head.className='manager-empty ranch-club-group';
    head.textContent=title;
    mount.appendChild(head);
    if(!group.length){
      const empty=document.createElement('div');
      empty.className='manager-empty ranch-club-empty';
      empty.textContent=emptyText;
      mount.appendChild(empty);
      return;
    }
    group.forEach(id=>{
      const i=getInst(id);
      if(!i)return;
      const card=document.createElement('button');
      card.type='button';
      card.className='manager-item ranch-club-card';
      card.dataset.storageId=id;
      card.innerHTML=clubCardHTML(i,kind);
      card.classList.toggle('focused-monster',id===ranchStorageFocusId);
      card.classList.toggle('is-party',kind==='party');
      card.classList.toggle('is-ranch',state.ranchActive.includes(id));
      card.onclick=()=>{ranchStorageFocusId=id;renderRanchStoragePage();};
      mount.appendChild(card);
    });
  };
  if(!selectableIds.includes(ranchStorageFocusId))ranchStorageFocusId=ids[0]||partyIds[0]||null;
  fillColumn(roster,'พกอยู่',partyIds,'party','ยังไม่มีมอนที่พก');
  fillColumn(vault,'ในคลัง',ids,'storage','Storage ว่าง');
  if(!selectableIds.length){
    syncRanchClubPreview(null);
    details.innerHTML='';
    return;
  }
  const focused=getInst(ranchStorageFocusId),inParty=focused&&state.party.includes(focused.instanceId);
  if(!focused){
    syncRanchClubPreview(null);
    details.innerHTML='';
    return;
  }
  syncRanchClubPreview(focused);
  const ranchOn=state.ranchActive.includes(focused.instanceId);
  details.innerHTML=`<div class="manager-empty ranch-club-status">${inParty?'อยู่ Party • ฝากเข้าคลังได้':'อยู่ Storage • รับเข้า Party ได้เมื่อมีช่องว่าง'}</div><div class="ranch-club-dossier"><span><b>Lv.${focused.level}</b>ระดับ</span><span><b>${fmt(focused.hp)}/${fmt(focused.maxHp)}</b>HP</span><span><b>${monsterCrValue(focused)??'—'}</b>CR</span><span><b>${fmt(focused.bond)}</b>Bond</span><span><b>${GENDER_TH[focused.gender]||focused.gender||'—'}</b>เพศ</span><span><b>${focused.personality||'—'}</b>นิสัย</span><span><b>${focused.lifeStage||'—'}</b>ช่วงชีวิต</span><span><b>${ranchOn?'ในลาน':'พักคลับ'}</b>Ranch</span></div><div class="storage-actions">${inParty?'<button type="button" data-storage-deposit>ฝากเข้าคลัง</button>':'<button type="button" data-storage-withdraw>รับเข้า Party</button><button type="button" data-storage-ranch>'+ (ranchOn?'เก็บจาก Ranch':'ปล่อย Ranch Active')+'</button>'}</div>`;
  details.querySelector('[data-storage-deposit]')?.addEventListener('click',()=>depositMonster(focused.instanceId));
  details.querySelector('[data-storage-withdraw]')?.addEventListener('click',()=>withdrawMonster(focused.instanceId));
  details.querySelector('[data-storage-ranch]')?.addEventListener('click',()=>toggleRanchActive(focused.instanceId));
}

function renderManager(){applyLifeSimulation(Date.now());const partyBox=el('managerParty');partyBox.innerHTML='';const partyIds=state.party.filter(Boolean);el('partyCountLabel').textContent=`${partyIds.length}/3`;if(!partyIds.length)partyBox.innerHTML='<div class="manager-empty">Party ว่าง</div>';partyIds.forEach(id=>{const i=getInst(id);if(i)partyBox.appendChild(monsterCard(i,'party'));});renderFullCharacterPreview();renderFullCharacterInfoTab();el('foodProtein').textContent=state.inventory.protein||0;el('foodHealthy').textContent=state.inventory.healthy||0;el('foodFavorite').textContent=state.inventory.favorite||0;if(el('foodTraining'))el('foodTraining').textContent=state.inventory.trainingChow||0;if(el('foodMineral'))el('foodMineral').textContent=state.inventory.mineralBite||0;if(el('foodEmber'))el('foodEmber').textContent=state.inventory.emberFruit||0;if(el('foodMoon'))el('foodMoon').textContent=state.inventory.moonFruit||0;el('managerBallCount').textContent=state.inventory.captureBalls||0;renderRaisingEventBanner();renderEvolution();renderBreeding();renderCrDebug();el('monsterManager')?.querySelector('.manager-item.focused-monster')?.scrollIntoView({block:'nearest'});renderParty();renderHUD();}
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
    const b=inst.statBreakdown||{},d=report.derived,r=report.rated,labels={hp:'HP',atk:'ATK',def:'DEF',spAtk:'SP.ATK',spDef:'SP.DEF',spd:'SPD'};
    box.classList.add('open');
    box.innerHTML=`<div class="event-title">Stat Debug • ${displayName(inst)} Lv.${inst.level} • Legacy CR ${r.cr} • DPS ${Math.round(r.dps)} • EHP ${Math.round(r.ehp)}</div>
    <div class="cr-lines">${['hp','atk','def','spAtk','spDef','spd'].map(stat=>{const s=b[stat];return s?`${labels[stat]} ${s.final} = base ${s.baseStat} + potential ${s.potential} + training ${s.training}/4 + nutrition ${s.nutritionFlat} + equipment ${s.equipmentFlat} × condition ${s.conditionMultiplier.toFixed(2)} × passive ${s.passiveMultiplier.toFixed(2)}`:`${labels[stat]} —`;}).join('<br>')}
    <br>Legacy Derived crit ${(d.critRate*100).toFixed(1)}% / ×${d.critDamage.toFixed(2)} • tempo ${(d.attackTempo*100).toFixed(1)}% • CDR ${(d.cooldownReduction*100).toFixed(1)}%</div>`;
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
  const skillDefs=skillOwner?canonicalCombatSkills(skillOwner):[];
  return createCombatHudViewModel({
    zoneIsWild:state.currentZone!=='hub',
    activeMonster:combatMonsterPresentation(activeSummon?.inst),
    pendingSummon:Boolean(pendingSummon),
    selectedMonster:combatMonsterPresentation(selected),
    captureBalls:state.inventory.captureBalls||0,
    captureAiming:activeSummon?false:captureAimActive,
    summonCooldownSeconds:Math.max(0,(summonCooldownUntil-Date.now())/1000),
    skills:MANUAL_SKILL_SLOTS.map((_,index)=>skillDefs[index]?{
      name:skillDefs[index].name,
      cooldownSeconds:activeSummon?.skillCds?.[index]||0,
      currentUses:skillDefs[index].currentUses,
      maxUses:skillDefs[index].maxUses,
      effectAvailable:skillDefs[index].effectAvailable,
      unavailableReason:skillDefs[index].unavailableReason,
    }:null),
  });
}
function applyActionPresentation(button,presentation,label){
  const skillButton=button.classList.contains('skill');
  if(skillButton){
    if(button.disabled)button.disabled=false;
  }else if(button.disabled!==presentation.disabled)button.disabled=presentation.disabled;
  if(button.dataset.state!==presentation.state)button.dataset.state=presentation.state;
  if(button.dataset.sub!==presentation.statusText)button.dataset.sub=presentation.statusText;
  button.classList.toggle('cooldown',presentation.state==='cooldown');
  setAttributeIfChanged(button,'aria-disabled',String(presentation.disabled));
  setAttributeIfChanged(button,'aria-label',`${label} • ${presentation.reason||presentation.statusText}`);
  if(button.title!==(presentation.reason||presentation.statusText))button.title=presentation.reason||presentation.statusText;
}
function skillButtonOverlay(button,className){
  let node=button.querySelector(`.${className}`);
  if(!node){node=document.createElement('span');node.className=className;node.setAttribute('aria-hidden','true');button.appendChild(node);}
  return node;
}
function syncSkillButtonResourceUi(button,skill,cooldownSeconds=0){
  if(!button)return;
  const uses=skillButtonOverlay(button,'uses-overlay'),cooldown=skillButtonOverlay(button,'cd-overlay');
  const hasSkill=Boolean(skill),current=Number.isFinite(skill?.currentUses)?skill.currentUses:0,max=Number.isFinite(skill?.maxUses)?skill.maxUses:0;
  setTextIfChanged(uses,hasSkill?`${current}/${max}`:'');
  setClassTokenIfChanged(uses,'hidden',!hasSkill);
  setClassTokenIfChanged(button,'no-uses',hasSkill&&current<=0);
  const remaining=Number.isFinite(cooldownSeconds)?Math.max(0,cooldownSeconds):0;
  setTextIfChanged(cooldown,remaining>0?`${remaining.toFixed(1)}s`:'');
  setClassTokenIfChanged(cooldown,'hidden',remaining<=0);
  setClassTokenIfChanged(button,'on-cooldown',remaining>0);
}
function renderCombatPresentation(){
  const presentation=combatHudPresentation(),skillOwner=activeSummon?.inst||selectedInstance();
  const skillDefs=skillOwner?canonicalCombatSkills(skillOwner):[],activeType=skillOwner?monsterTypes(skillOwner)[0]:'Normal';
  const statusControl=activeSummon?resolveCombatStatusRuntime(activeSummon.statusState):null;
  const skillStatusLocked=!!activeSummon&&(!statusControl?.ok||!statusControl.canUseSkill);
  MANUAL_SKILL_SLOTS.forEach((_,index)=>{
    const button=el(`skill${index+1}Btn`),skill=skillDefs[index],view=presentation.skills[index];
    const iconUrl=getSkillIcon(skill);
    applyButtonIcon(button,iconUrl,'86%');
    syncSkillButtonResourceUi(button,skill,activeSummon?.skillCds?.[index]||0);
    const skillName=skill?.name||`สกิล ${index+1}`;
    setActionStyle(button,skill?.type||activeType,`S${index+1}`,view.statusText);
    const iconContract=skillButtonIconContract(skill?.skillId);
    const accessibility=iconContract?`${iconContract.accessibilityLabelTH} • คงเหลือ ${skill.currentUses}/${skill.maxUses}`:`Skill ${index+1} ${skillName}`;
    applyActionPresentation(button,view,accessibility);
    if(skillStatusLocked){button.dataset.state='disabled';button.dataset.sub='ติดสถานะ';setAttributeIfChanged(button,'aria-disabled','true');setAttributeIfChanged(button,'aria-label',`Skill ${index+1} ${skillName} • ใช้ไม่ได้ขณะติดสถานะควบคุม`);button.title='ใช้ไม่ได้ขณะติดสถานะควบคุม';}
  });
  const capture=el('captureBtn'),summon=el('summonBtn'),recallButton=el('recallBtn');
  setActionStyle(capture,'Water','CAP',presentation.actions.capture.statusText);
  setActionStyle(summon,activeType,'SUM',presentation.actions.summon.statusText);
  setActionStyle(recallButton,'Psychic','REC',presentation.actions.recall.statusText);
  applyButtonIcon(capture,getActionIcon('capture'),'60%');
  applyButtonIcon(summon,getActionIcon('summon'),'60%');
  applyButtonIcon(recallButton,getActionIcon('recall'),'60%');
  applyActionPresentation(capture,presentation.actions.capture,'ปาจับ');
  applyActionPresentation(summon,presentation.actions.summon,'ปาเรียก');
  applyActionPresentation(recallButton,presentation.actions.recall,'Recall คู่หู');
  capture.classList.toggle('aiming',presentation.actions.capture.state==='aiming');
  setTextIfChanged(el('actionReason'),visibleCombatReason(skillStatusLocked?'คู่หูติดสถานะควบคุม • ใช้สกิลไม่ได้':presentation.actionReason));
  const activeLabel=el('activeMonsterStatus');
  setTextIfChanged(activeLabel,!activeSummon&&!pendingSummon&&hubCompanion?`${displayName(hubCompanion.inst)} • Ranch`:presentation.activeLabel);
}
function renderHUD(){
  setTextIfChanged(el('playerHp'),`${fmt(playerData.hp)}/${playerData.maxHp}`);
  setTextIfChanged(el('collectionCount'),state.collection.length);
  const balls=state.inventory.captureBalls||0;
  setTextIfChanged(el('captureBallCount'),balls);
  setTextIfChanged(el('goldCount'),state.wallet?.gold??0);
  document.querySelector('.ball-pill')?.classList.toggle('warning',balls<=2);
  setTextIfChanged(el('playerExp'),Math.floor(state.exp));
  setTextIfChanged(el('ranchCount'),`${state.ranchActive.length}/${RANCH_ACTIVE_MAX}`);
  setTextIfChanged(el('zoneLabel'),(!pirateThrowWorld&&state.currentZone==='hub')?'Pirate Fruit':(ZONES[state.currentZone]?.label||state.currentZone));
  const wildCount=el('wildCount');
  setTextIfChanged(wildCount,state.currentZone==='hub'?'0':livingWilds().length);
  renderCombatStatusList(el('ownedStatusStrip'),activeSummon?.statusState,{limit:4});
  renderCombatPresentation();
  renderCharacterAccess();
  renderStarterJourney();
}
function switchPartySlot(index){
  if(pirateThrowPanelPaused())return;
  if(index<0||index>=state.party.length)return;
  const gate=characterUI.requestSwitchParty(index);
  if(!gate.ok){if(gate.reasonText)msg(gate.reasonText);return;}
  const leftoverPanel=characterUI.snapshot().characterPanel;
  if(leftoverPanel==='quick'||leftoverPanel==='tab'){
    characterUI.closeAll();
    dismissCharacterAccessHistory();
  }
  state.selectedSlot=index;
  syncHubCompanion();renderParty();renderSkillButtons();renderHUD();renderCharacterAccess();
}
function renderParty(){
  const party=el('party'),activeInstanceId=activeSummon?.inst.instanceId||null;
  party.replaceChildren();
  state.party.forEach((id,index)=>{
    const inst=getInst(id),button=document.createElement('div');
    const monster=combatMonsterPresentation(inst);
    const presentation=createPartySlotViewModel({monster,index,selectedSlot:state.selectedSlot,activeInstanceId});
    button.setAttribute('role','button');
    button.tabIndex=0;
    button.className=['party-slot','compact',!inst?'empty':'',...presentation.states.map(stateName=>stateName==='active'?'active-monster':stateName==='fainted'?'fainted-slot':stateName)].filter(Boolean).join(' ');
    if(characterUI.isPeekedSlot(index))button.classList.add('peeked');
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
      const sw=document.createElement('button');
      sw.type='button';
      sw.className='party-switch';
      sw.dataset.partySwitch=String(index);
      sw.textContent='สลับ';
      sw.disabled=!characterUI.canSwitchParty();
      sw.title=sw.disabled?ACTIVE_SUMMON_SWITCH_REASON:'สลับตัวใน Party';
      sw.setAttribute('aria-label',`สลับเป็นช่อง ${index+1}`);
      sw.addEventListener('pointerdown',event=>{
        event.preventDefault();event.stopPropagation();
        switchPartySlot(index);
      },{passive:false});
      sw.addEventListener('click',event=>{if(event.detail!==0)return;event.preventDefault();event.stopPropagation();switchPartySlot(index);});
      button.append(sw);
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
    button.addEventListener('pointerdown',event=>{
      event.preventDefault();event.stopPropagation();
      switchPartySlot(index);
    },{passive:false});
    button.addEventListener('click',event=>{if(event.detail!==0)return;event.preventDefault();event.stopPropagation();switchPartySlot(index);});
    button.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;event.preventDefault();button.click();});
    party.appendChild(button);
  });
}
function focusedPartyMonsterId(){
  const focused=state.ui?.focusedMonsterId;
  if(focused&&getInst(focused))return focused;
  return state.party[state.selectedSlot]||state.party.find(Boolean)||null;
}
let characterAccessHistoryOpen=false;
let characterAccessIgnorePop=false;
function rememberCharacterAccessHistory(){
  if(characterAccessHistoryOpen)return;
  if(typeof history==='undefined'||typeof history.pushState!=='function')return;
  try{
    history.pushState({characterAccess:true},'');
    characterAccessHistoryOpen=true;
  }catch{
    characterAccessHistoryOpen=false;
  }
}
function dismissCharacterAccessHistory(){
  if(!characterAccessHistoryOpen)return;
  characterAccessHistoryOpen=false;
  if(typeof history==='undefined'||typeof history.back!=='function')return;
  characterAccessIgnorePop=true;
  try{history.back();}catch{characterAccessIgnorePop=false;}
}
function closeCharacterAccess(playClose=true){
  characterUI.closeAll();
  dismissCharacterAccessHistory();
  renderCharacterAccess();
  renderParty();
  if(playClose)playSFX('sfx_ui_close');
}
function typeLineFromInst(inst){
  if(!inst)return '';
  return monsterTypes(inst).map(type=>`${TYPE_EMOJI[type]||'•'} ${type}`).join('  ');
}
function renderCharacterAccess(){
  const button=el('globalCharacterBtn'),entry=el('characterAccessEntry');
  if(!button||!entry||!characterUI)return;
  const snap=characterUI.snapshot();
  const open=snap.characterPanel==='quick'||snap.characterPanel==='tab';
  button.classList.toggle('open',open);
  button.classList.toggle('readonly',snap.readOnly);
  setAttributeIfChanged(button,'aria-pressed',String(open));
  const inst=getInst(snap.focusedMonsterId);
  const roster=characterUI.describeRoster(snap.focusedMonsterId);
  const portrait=el('characterAccessPortrait');
  const species=inst?spById[inst.speciesId]:null;
  const portraitColor=species?`#${species.color.toString(16).padStart(6,'0')}`:'#334155';
  setTextIfChanged(portrait,inst?displayName(inst).slice(0,1):'?');
  if(portrait&&portrait.dataset.color!==portraitColor){
    portrait.dataset.color=portraitColor;
    portrait.style.backgroundColor=portraitColor;
  }
  setTextIfChanged(el('characterAccessName'),inst?displayName(inst):'ยังไม่ได้เลือกมอน');
  setTextIfChanged(el('characterAccessMeta'),inst?`Lv.${inst.level} · HP ${fmt(inst.hp)}/${inst.maxHp}`:'Lv.— · HP —');
  const typeNode=el('characterAccessType');
  const typeLine=typeLineFromInst(inst);
  if(typeNode&&typeNode.dataset.typeLine!==typeLine){
    typeNode.dataset.typeLine=typeLine;
    typeNode.textContent=typeLine;
  }
  const cr=inst?monsterCrValue(inst):null;
  setTextIfChanged(el('characterAccessCr'),inst?`CR ${cr??'—'}`:'CR —');
  setTextIfChanged(el('characterAccessPlace'),inst?roster.label:'');
  setTextIfChanged(el('characterAccessStats'),inst?`ATK ${inst.atk} · DEF ${inst.def} · SP.ATK ${inst.spAtk} · SP.DEF ${inst.spDef} · SPD ${inst.spd}`:'ATK — · DEF — · SP.ATK — · SP.DEF — · SPD —');
  const reason=el('characterAccessReason');
  const showReason=Boolean(open&&snap.readOnly);
  setClassTokenIfChanged(reason,'hidden',!showReason);
  setTextIfChanged(reason,showReason?ACTIVE_SUMMON_RECALL_REASON:'');
  const actions=el('characterAccessActions');
  setClassTokenIfChanged(actions,'hidden',!open||!inst);
  if(actions){
    actions.querySelectorAll('[data-character-tab]').forEach(btn=>{
      const mutate=['skills','equipment','training'].includes(btn.dataset.characterTab);
      setClassTokenIfChanged(btn,'hidden',Boolean(snap.readOnly&&mutate));
      btn.classList.toggle('active',snap.characterPanel==='tab'?btn.dataset.characterTab===snap.characterTab:btn.dataset.characterTab==='collection');
    });
  }
  const tabBody=el('characterQuickTabBody');
  setClassTokenIfChanged(tabBody,'hidden',snap.characterPanel!=='tab');
  setClassTokenIfChanged(entry,'hidden',!open);
  setClassTokenIfChanged(entry,'readonly',snap.readOnly);
}
function openCharacterAccess(source='global-button'){
  requestLandscapeOrientation();
  const zoneDropdown=el('zoneDropdown');
  zoneDropdown?.classList.add('hidden');
  const result=characterUI.requestGlobalAccess({
    source,
    monsterId:focusedPartyMonsterId(),
    partySlot:Number.isInteger(state.ui?.selectedPartySlot)?state.ui.selectedPartySlot:state.selectedSlot,
  });
  if(!result.ok){if(result.reasonText)msg(result.reasonText);renderCharacterAccess();return result;}
  rememberCharacterAccessHistory();
  revealMonsterManager('collection');
  renderParty();
  return result;
}
function openCharacterQuickTab(tab){
  const focused=state.ui.focusedMonsterId||focusedPartyMonsterId();
  const result=characterUI.requestOpenFromQuick({tab,monsterId:focused});
  if(!result.ok){
    if(result.reasonText)msg(result.reasonText);
    renderCharacterAccess();
    return result;
  }
  revealMonsterManager(tab==='collection'?'collection':tab);
  renderParty();
  renderCharacterAccess();
  return result;
}
function toggleCharacterAccess(){
  if(el('monsterManager')&&!el('monsterManager').classList.contains('hidden')){
    if(characterUI.snapshot().source==='character'){
      closeManager();
      return;
    }
    msg('ปิดหน้าต่างผู้ดูแลก่อนใช้ทางเข้าตัวละคร');
    return;
  }
  const panel=characterUI.snapshot().characterPanel;
  if(panel==='quick'||panel==='tab'){
    closeCharacterAccess(true);
    return;
  }
  const result=openCharacterAccess('global-button');
  if(!result.ok)return;
  playSFX('sfx_ui_open');
  const inst=getInst(result.monsterId);
  if(result.readOnly)msg(ACTIVE_SUMMON_RECALL_REASON);
  else if(inst)msg(`ตัวละคร • ${displayName(inst)}`);
  else msg('ตัวละคร • ยังไม่ได้เลือกมอน');
}
function handleCharacterUiHardwareBack(event){
  if(characterAccessIgnorePop){
    characterAccessIgnorePop=false;
    return false;
  }
  const panel=characterUI?.snapshot?.().characterPanel;
  if(!panel||panel==='closed')return false;
  event?.preventDefault?.();
  if(panel==='full'){
    if(event?.type==='popstate'){
      characterAccessHistoryOpen=false;
      closeManager();
      const next=characterUI.snapshot().characterPanel;
      if(next==='quick'||next==='tab')rememberCharacterAccessHistory();
    }else{
      closeManager();
    }
    return true;
  }
  if(event?.type==='popstate'){
    characterAccessHistoryOpen=false;
    characterUI.closeAll();
    el('monsterManager').classList.add('hidden');
    renderCharacterAccess();
    renderParty();
    playSFX('sfx_ui_close');
  }else{
    closeCharacterAccess(true);
  }
  return true;
}
function renderSkillButtons(){renderCombatPresentation();}
function updateTarget(){
  const target=activeSummon?.target&&!activeSummon.target.dead?activeSummon.target:(aimedWild(10,1.8)||nearestWild(10)),card=el('targetCard');
  if(!target){setClassTokenIfChanged(card,'hidden',true);renderCombatStatusList(el('targetStatusStrip'),null);return;}
  setClassTokenIfChanged(card,'hidden',false);
  const species=spById[target.speciesId],tag=target.boss?' ★ BOSS':target.elite?' ★ ELITE':'',hpPercent=hpPct(target.hp/target.maxHp)*100;
  setTextIfChanged(el('targetName'),species.name+tag);
  setTextIfChanged(el('targetLevel'),`Lv.${target.level}`);
  setTextIfChanged(el('targetHpText'),`HP ${fmt(target.hp)}/${target.maxHp}`);
  const hpBar=el('targetHpBar');
  setStyleIfChanged(hpBar,'width',`${hpPercent}%`);
  setAttributeIfChanged(hpBar,'aria-valuenow',String(Math.round(hpPercent)));
  renderTargetTypesIfChanged(el('targetTypes'),species.types);
  renderCombatStatusList(el('targetStatusStrip'),target.statusState,{limit:5});
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
function stageRouteState(definition){
  const active=Boolean(ZONES[definition.id]);
  if(!active)return {key:'planned',label:'กำลังเตรียมด่าน',enabled:false};
  const unlocked=stageUnlockReason(state.stageProgress,definition.id).ok;
  if(!unlocked)return {key:'locked',label:'ล็อกอยู่',enabled:false};
  if(state.stageProgress?.cleared?.includes(definition.id))return {key:'cleared',label:'เคลียร์แล้ว',enabled:true};
  return {key:'available',label:'พร้อมเข้า',enabled:true};
}
function renderStageSelect(){
  const list=el('stageList');
  if(!list)return;
  list.replaceChildren();
  for(const definition of STAGE_CATALOG){
    const status=stageRouteState(definition),card=document.createElement('article');
    card.className=`stage-card ${status.key}${state.currentZone===definition.id?' active':''}`;
    const body=document.createElement('div'),title=document.createElement('h3'),desc=document.createElement('p'),meta=document.createElement('div');
    title.textContent=definition.displayName;
    desc.textContent=`${definition.primaryTypes.join(' / ')} • แนะนำ Lv.${definition.recommendedLevel.min}–${definition.recommendedLevel.max}`;
    meta.className='stage-card-meta';
    for(const text of [`ธาตุรอง ${definition.secondaryTypes.slice(0,3).join(' / ')}`,definition.id==='grass-meadow'?'Normal • Rare • Elite • Boss':'Elite • Boss']){const chip=document.createElement('span');chip.className='stage-chip';chip.textContent=text;meta.append(chip);}
    body.append(title,desc,meta);
    const action=document.createElement('button');action.type='button';action.className='stage-enter';action.textContent=status.key==='planned'?'เร็วๆ นี้':status.key==='locked'?'🔒 ล็อก':status.enabled?'จุดวาปในฉาก':'ดูข้อมูล';action.disabled=!status.enabled;action.setAttribute('aria-label',`${action.textContent} ${definition.displayName}`);
    if(status.enabled)action.onclick=()=>{playSFX('sfx_ui_click');closeStageSelect();msg(state.currentZone===definition.id?'เดินไปยังจุดวาปที่มีสัญลักษณ์ WARP POINT เพื่อเดินทาง':'ต้องเดินทางผ่านจุดวาปในฉากตามเส้นทาง');};
    const statusText=document.createElement('small');statusText.className=`stage-status ${status.key}`;statusText.textContent=status.label;body.append(statusText);
    card.append(body,action);list.append(card);
  }
}
function openStageSelect(){
  el('zoneDropdown')?.classList.add('hidden');
  renderStageSelect();
  el('stageSelect')?.classList.remove('hidden');
}
function closeStageSelect(){el('stageSelect')?.classList.add('hidden');}
function renderStageReward({definition,first,rewards,elapsed}){
  const title=el('stageRewardTitle'),summary=el('stageRewardSummary'),list=el('stageRewardList');
  if(!title||!summary||!list)return;
  title.textContent=`${definition.displayName} เคลียร์แล้ว!`;
  summary.textContent=`Boss ถูกปราบ • เวลา ${elapsed?`${elapsed} วินาที`:'—'} • ${first?'ได้รับรางวัลครั้งแรก':'รางวัลครั้งแรกได้รับไปแล้ว'}`;
  list.replaceChildren();
  const labels={captureBalls:'🔴 Capture Ball',healthy:'💚 อาหารฟื้นฟู',mineralBite:'🪨 แร่บำรุง',protein:'🥩 โปรตีน',emberFruit:'🔥 ผลไฟ',moonFruit:'🌙 ผลจันทร์',trainingChow:'⚡ อาหารฝึก'};
  for(const [key,value] of Object.entries(rewards)){const item=document.createElement('div');item.className='stage-reward-item';item.textContent=`${labels[key]||key} +${value}`;list.append(item);}
  el('stageReward')?.classList.remove('hidden');
}
function closeStageReward(){el('stageReward')?.classList.add('hidden');}
function warpLockText(availability){
  if(availability.ok)return '';
  if(availability.reason==='requires-stage-clear'&&availability.requires){
    if(availability.requires===state.currentZone)return stageObjectiveText(currentStageObjective());
    return `ต้องเคลียร์ ${STAGE_BY_ID[availability.requires]?.displayName||availability.requires} ก่อน`;
  }
  return 'เส้นทางนี้ยังล็อกอยู่';
}
function renderWarpPrompt(){
  const panel=el('warpPrompt');
  if(!panel)return;
  if(!nearbyWarp){panel.classList.add('hidden');return;}
  const availability=warpAvailability(state.stageProgress,nearbyWarp,stageUnlockReason);
  const title=el('warpPromptTitle'),detail=el('warpPromptDetail'),action=el('warpPromptAction');
  if(title)title.textContent=`ไป ${nearbyWarp.label}`;
  if(detail)detail.textContent=availability.ok?'เดินทางไปพื้นที่ถัดไปได้ทันที':warpLockText(availability);
  if(action){action.disabled=!availability.ok||warpBusy;action.textContent=availability.ok?'เดินทาง':'ยังล็อกอยู่';}
  panel.classList.remove('hidden');
}
function closeWarpPrompt(){nearbyWarp=null;el('warpPrompt')?.classList.add('hidden');}
function startWarp(route=nearbyWarp){
  if(warpBusy||!route)return;
  const availability=warpAvailability(state.stageProgress,route,stageUnlockReason);
  if(!availability.ok){msg(warpLockText(availability));renderWarpPrompt();return;}
  if(activeSummon?.target&&!activeSummon.target.dead||pendingSummon){msg('จบการต่อสู้หรือ Recall มอนก่อนเดินทาง');return;}
  warpBusy=true;closeWarpPrompt();playSFX('sfx_ui_click');
  warpSpawnOverride=route.spawn;
  const moved=switchZone(route.to,false);
  warpSpawnOverride=null;
  warpBusy=false;warpPromptCooldown=1.2;saveGame(false);
  if(!moved)renderWarpPrompt();
}
function updateWarpPrompt(dt){
  warpPromptCooldown=Math.max(0,warpPromptCooldown-dt);
  if(warpBusy||warpPromptCooldown>0){return;}
  const found=nearestRoute(routesFrom(state.currentZone),player.position,3.2).route;
  const next=nextWarpPromptState({foundId:found?.id||null,dismissedId:dismissedWarpId});
  dismissedWarpId=next.dismissedId;
  if(next.open){
    if(nearbyWarp?.id!==next.nearbyId){nearbyWarp=found;renderWarpPrompt();}
    return;
  }
  if(nearbyWarp)closeWarpPrompt();
}
function renderZoneUI(){document.querySelectorAll('[data-zone]').forEach(button=>button.classList.toggle('active',button.dataset.zone===state.currentZone));const hunt=el('huntBtn');if(hunt){if(state.currentZone==='hub'){hunt.textContent='ประตูวาป → Grass Meadow';hunt.classList.remove('return');}else{hunt.textContent='← กลับ Pirate Fruit';hunt.classList.add('return');}}document.body.dataset.zone=pirateThrowWorld?state.currentZone:LIVE_PRESENCE_ZONE;if(!pirateThrowWorld)document.body.dataset.homeZone=LIVE_PRESENCE_ZONE;renderStageSelect();renderHUD();}
function renderAll(){renderHUD();renderParty();updateTarget();renderZoneUI();}

// ---------- Save migration ----------
function migrateLoadedState(s){
  if(!s)return;
  const clean=normalizeSavedState(s,{ranchCap:RANCH_ACTIVE_MAX,now:Date.now()});
  const migrated=migrateState(clean,{now:Date.now()});
  state.collection=migrated.collection.map(ensureInstanceShape);
  state.collection.forEach(synchronizeStage1Learnset);
  state.party=clean.party;
  state.storage=clean.storage;
  state.ranchActive=clean.ranchActive;
  state.selectedSlot=clean.selectedSlot;
  state.exp=Number.isFinite(clean.exp)?clean.exp:0;
  state.lifeLastAt=clean.lifeLastAt;
  state.wallet=clean.wallet||{gold:0};
  state.inventory=clean.inventory;
  state.merchantPurchaseCommandIds=clean.merchantPurchaseCommandIds||[];
  state.merchantPurchaseHistory=clean.merchantPurchaseHistory||[];
  state.eggs=clean.eggs||[];
  state.skillItemUseCommandIds=clean.skillItemUseCommandIds||[];
  applyBreedingSkillMemoryRequestLedger(state,clean);
  state.breeding=clean.breeding||{parentA:null,parentB:null};
  state.evolutionCandidate=null;
  state.starterJourney=clean.starterJourney||starterJourneyDefaults();
  state.rareCollection=clean.rareCollection||{found:{},captured:{}};
  state.eliteProgress=clean.eliteProgress||{found:{},defeated:{},captured:{}};
  state.bossProgress=clean.bossProgress||{found:{},defeated:{}};
  state.stageProgress=normalizeStageProgress(clean.stageProgress);
  state.currentZone=ZONES[clean.currentZone]?clean.currentZone:'hub';
  state.saveVersion=SAVE_SCHEMA_VERSION;
  attachCharacterUi(state);
  characterUI?.closeAll();
}
let remoteSaveReady=false,remoteSaveSyncing=false,remoteSavePending=false,serverSaveRevision=0;
function currentSaveEnvelope(){
  return {state:sanitizeStateForPersistence(persistableState(state)),playerHp:playerData.hp,saveSchemaVersion:SAVE_SCHEMA_VERSION};
}
async function loadPrimaryRemoteSave(){
  if(!serverPlayerDataActive)return loadRemoteSave();
  const [saved,playerState]=await Promise.all([
    loadServerSave(runtimeConfig,authProfileBridge.sessionToken),
    readPlayerState(runtimeConfig,authProfileBridge.sessionToken),
  ]);
  if(typeof window!=='undefined'){
    window.POCKETMONSTER_SERVER_PLAYER_STATE=playerState;
    window.POCKETMONSTER_PLAYER_CHARACTER=publishPlayerCharacterBinding({writeArmed:serverPlayerDataActive,playerState});
  }
  serverSaveRevision=saved?.revision??0;
  return saved?.envelope??null;
}
async function savePrimaryRemoteSave(envelope){
  if(!serverPlayerDataActive)return saveRemoteSave(envelope);
  const result=await saveServerSave(runtimeConfig,authProfileBridge.sessionToken,envelope,{revision:serverSaveRevision,clientVersion:'8.4.0'});
  serverSaveRevision=result.revision;
  return result;
}
function saveGame(show=true){
  state.saveVersion=SAVE_SCHEMA_VERSION;
  state.lifeLastAt=Date.now();
  const envelope=currentSaveEnvelope();
  writeStoredSave(localStorage,envelope);
  if(remoteSaveReady){
    remoteSaveReady=false;
    remoteSaveSyncing=true;
    void flushRemoteSaveUntilSettled().catch(error=>{
      remoteSaveReady=false;remoteSaveSyncing=false;remoteSavePending=false;
      console.warn('remote save failed',error);
    });
  }
  else if(remoteSaveSyncing)remoteSavePending=true;
  const si=el('saveIndicator');
  if(si){si.style.opacity='1';setTimeout(()=>{si.style.opacity='0';},800);}
  if(show)msg('บันทึกเกม V8.4.0 แล้ว');
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
    else if(saved.source==='current')msg('โหลดข้อมูล V8.4.0 แล้ว');
    else msg('ย้าย Save เก่า → V8.4.0 สำเร็จ');
    if(saved.source!=='current')saveGame(false);
  }catch(error){
    console.warn('load failed',error);
  }
}

// ---------- UI events ----------
function bindCharacterAccessControl(node,handler){
  if(!node)return;
  let lastAt=0;
  const run=event=>{
    event.preventDefault();
    event.stopPropagation();
    const now=typeof performance!=='undefined'?performance.now():Date.now();
    if(now-lastAt<350)return;
    lastAt=now;
    handler();
  };
  node.addEventListener('pointerdown',run,{passive:false});
  node.addEventListener('click',run);
}
function bindMobileNpcSheet(panel,close,dragTarget=panel?.querySelector(':scope > *')){
  const handle=panel?.querySelector('[data-npc-sheet-handle]');
  if(!handle||!dragTarget)return;
  let startY=0,dragging=false;
  handle.addEventListener('pointerdown',event=>{
    startY=event.clientY; dragging=true; handle.setPointerCapture?.(event.pointerId);
    dragTarget.style.setProperty('transition','none');
  });
  handle.addEventListener('pointermove',event=>{
    if(!dragging)return;
    const delta=Math.max(0,event.clientY-startY);
    dragTarget.style.setProperty('transform',`translateY(${delta}px)`);
  });
  const end=event=>{
    if(!dragging)return;
    dragging=false;
    const delta=Math.max(0,event.clientY-startY);
    if(delta>72){dragTarget.style.removeProperty('transform');close();return;}
    dragTarget.style.removeProperty('transform');dragTarget.style.removeProperty('transition');
  };
  handle.addEventListener('pointerup',end); handle.addEventListener('pointercancel',end);
}
el('npcBtn').onclick=()=>{playSFX('sfx_ui_click');if(isNearMerchant())openMerchant();else if(isNearTrainer())openTrainer();else if(isNearEvolution())openEvolutionGuide();else if(isNearBreeding())openBreedingCaretaker();else showRanchServices();};el('closeManager').onclick=()=>{playSFX('sfx_ui_click');closeManager();};el('merchantClose').onclick=()=>{playSFX('sfx_ui_click');closeMerchant();};el('trainerClose').onclick=()=>{playSFX('sfx_ui_click');closeTrainer();};el('evolutionClose').onclick=()=>{playSFX('sfx_ui_click');closeEvolutionGuide();};el('breedingClose').onclick=()=>{playSFX('sfx_ui_click');closeBreedingCaretaker();};el('breedingOpenManager').onclick=()=>{playSFX('sfx_ui_click');createEgg();};el('merchantShop').addEventListener('pointerdown',e=>{if(e.target===el('merchantShop'))closeMerchant();});el('trainerPanel').addEventListener('pointerdown',e=>{if(e.target===el('trainerPanel'))closeTrainer();});el('evolutionPanel').addEventListener('pointerdown',e=>{if(e.target===el('evolutionPanel'))closeEvolutionGuide();});el('breedingPanel').addEventListener('pointerdown',e=>{if(e.target===el('breedingPanel'))closeBreedingCaretaker();});el('monsterManager').addEventListener('pointerdown',e=>{if(e.target===el('monsterManager'))closeManager();});
bindMobileNpcSheet(el('merchantShop'),closeMerchant);
bindMobileNpcSheet(el('trainerPanel'),closeTrainer);
bindMobileNpcSheet(el('evolutionPanel'),closeEvolutionGuide);
bindMobileNpcSheet(el('breedingPanel'),closeBreedingCaretaker);
el('breedingSalonParentA')?.addEventListener('click',()=>{playSFX('sfx_ui_click');openMonsterPicker('parentA');});
el('breedingSalonParentB')?.addEventListener('click',()=>{playSFX('sfx_ui_click');openMonsterPicker('parentB');});
el('breedingSalonIncubator')?.addEventListener('click',e=>{
  const btn=e.target.closest('[data-salon-hatch]');
  if(!btn)return;
  playSFX('sfx_ui_click');
  hatchEgg(btn.dataset.salonHatch);
});
bindMobileNpcSheet(el('ranchServices'),closeRanchSurface);
bindMobileNpcSheet(el('ranchStoragePage'),closeRanchSurface,el('ranchStoragePage'));
document.querySelector('[data-ranch-service="storage"]')?.addEventListener('click',()=>{playSFX('sfx_ui_click');showRanchStorageShell();});
document.querySelector('[data-ranch-service="heal"]')?.addEventListener('click',()=>{playSFX('sfx_ui_click');healAll();});
document.querySelector('[data-ranch-service="breeding"]')?.addEventListener('click',()=>{playSFX('sfx_ui_click');openRanchBreeding();});
document.querySelector('[data-ranch-back]')?.addEventListener('click',()=>{playSFX('sfx_ui_click');closeRanchSurface();});
document.querySelector('[data-ranch-close]')?.addEventListener('click',()=>{playSFX('sfx_ui_close');closeRanchSurface();});
bindCharacterAccessControl(el('globalCharacterBtn'),()=>{
  playSFX('sfx_ui_click');
  toggleCharacterAccess();
});
bindCharacterAccessControl(el('characterAccessClose'),()=>{
  closeCharacterAccess(true);
});
el('characterAccessActions')?.querySelectorAll('[data-character-tab]').forEach(btn=>{
  bindCharacterAccessControl(btn,()=>{
    playSFX('sfx_ui_click');
    openCharacterQuickTab(btn.dataset.characterTab);
  });
});
addEventListener('popstate',event=>{
  handleCharacterUiHardwareBack(event);
});
addEventListener('keydown',event=>{
  if(event.code!=='Escape'&&event.key!=='Escape')return;
  if(handleCharacterUiHardwareBack(event))event.preventDefault();
});
document.querySelectorAll('.manager-tab').forEach(b=>b.onclick=()=>{playSFX('sfx_ui_click');setManagerTab(b.dataset.managerTab);});
const characterInfoTabActivationGuard=new WeakMap();
const characterInfoTabSuppressedClicks=new WeakMap();
function suppressFullCharacterInfoTabClick(button,now){
  if(button===null||(typeof button!=='object'&&typeof button!=='function'))return false;
  const pending=characterInfoTabSuppressedClicks.get(button);
  const count=pending&&now-pending.at>=0&&now-pending.at<750?pending.count+1:1;
  characterInfoTabSuppressedClicks.set(button,Object.freeze({at:now,count}));
  return true;
}
function shouldActivateFullCharacterInfoTab(button,source,now,pointerGenerated=true){
  if(button===null||(typeof button!=='object'&&typeof button!=='function'))return false;
  if(source==='pointerup'){
    const pending=characterInfoTabActivationGuard.get(button);
    const count=pending&&now-pending.pointerAt>=0&&now-pending.pointerAt<750?pending.count+1:1;
    characterInfoTabActivationGuard.set(button,Object.freeze({pointerAt:now,count}));
    return true;
  }
  if(source==='click'&&pointerGenerated){
    const suppressed=characterInfoTabSuppressedClicks.get(button);
    const suppressedAge=suppressed?now-suppressed.at:Infinity;
    if(suppressed&&suppressedAge>=0&&suppressedAge<750&&suppressed.count>0){
      if(suppressed.count===1)characterInfoTabSuppressedClicks.delete(button);
      else characterInfoTabSuppressedClicks.set(button,Object.freeze({at:suppressed.at,count:suppressed.count-1}));
      return false;
    }
    if(suppressed)characterInfoTabSuppressedClicks.delete(button);
    const pending=characterInfoTabActivationGuard.get(button);
    const age=pending?now-pending.pointerAt:Infinity;
    if(pending&&age>=0&&age<750&&pending.count>0){
      if(pending.count===1)characterInfoTabActivationGuard.delete(button);
      else characterInfoTabActivationGuard.set(button,Object.freeze({pointerAt:pending.pointerAt,count:pending.count-1}));
      return false;
    }
    if(pending)characterInfoTabActivationGuard.delete(button);
  }
  return true;
}
const characterInfoTabPointerStarts=new Map();
function beginFullCharacterInfoTabPointer(event,tab){
  const pointerId=event?.pointerId;
  if(!tab||!Number.isInteger(pointerId)||event?.isPrimary===false||event?.button!==0)return false;
  const x=Number.isFinite(event.clientX)?event.clientX:0;
  const y=Number.isFinite(event.clientY)?event.clientY:0;
  characterInfoTabPointerStarts.set(pointerId,Object.freeze({tab,x,y,canceled:false}));
  return true;
}
function moveFullCharacterInfoTabPointer(event,maxDistance=12){
  const pointerId=event?.pointerId;
  const start=characterInfoTabPointerStarts.get(pointerId);
  if(!start)return false;
  const x=Number.isFinite(event.clientX)?event.clientX:start.x;
  const y=Number.isFinite(event.clientY)?event.clientY:start.y;
  const limit=Number.isFinite(maxDistance)&&maxDistance>=0?maxDistance:12;
  if((x-start.x)**2+(y-start.y)**2>limit**2){
    characterInfoTabPointerStarts.set(pointerId,Object.freeze({...start,canceled:true}));
    return false;
  }
  return true;
}
function cancelFullCharacterInfoTabPointer(event){
  return characterInfoTabPointerStarts.delete(event?.pointerId);
}
function finishFullCharacterInfoTabPointer(event,tab,maxDistance=12){
  const pointerId=event?.pointerId;
  const start=characterInfoTabPointerStarts.get(pointerId);
  characterInfoTabPointerStarts.delete(pointerId);
  if(!start||!tab||start.tab!==tab||event?.isPrimary===false||event?.button!==0)return false;
  const x=Number.isFinite(event.clientX)?event.clientX:start.x;
  const y=Number.isFinite(event.clientY)?event.clientY:start.y;
  const limit=Number.isFinite(maxDistance)&&maxDistance>=0?maxDistance:12;
  if(start.canceled||(x-start.x)**2+(y-start.y)**2>limit**2){
    suppressFullCharacterInfoTabClick(start.tab,Number.isFinite(event?.timeStamp)?event.timeStamp:0);
    return false;
  }
  return true;
}
function resolveFullCharacterInfoTabKey(button,key,tabs){
  if(!Array.isArray(tabs)||tabs.length===0)return null;
  const current=tabs.indexOf(button);
  if(current<0)return null;
  if(key==='Home')return tabs[0];
  if(key==='End')return tabs[tabs.length-1];
  if(key==='ArrowRight'||key==='ArrowDown')return tabs[(current+1)%tabs.length];
  if(key==='ArrowLeft'||key==='ArrowUp')return tabs[(current-1+tabs.length)%tabs.length];
  return null;
}
document.querySelectorAll('.character-info-tab').forEach(btn=>{
  btn.onclick=event=>{
    if(!shouldActivateFullCharacterInfoTab(btn,'click',event.timeStamp,event.detail>0))return;
    playSFX('sfx_ui_click');
    setFullCharacterInfoTab(btn.dataset.characterTab);
  };
  btn.onkeydown=event=>{
    const tabs=[...document.querySelectorAll('.character-info-tabs .character-info-tab')];
    const next=resolveFullCharacterInfoTabKey(btn,event.key,tabs);
    if(!next)return;
    event.preventDefault();
    event.stopPropagation();
    next.focus();
    playSFX('sfx_ui_click');
    setFullCharacterInfoTab(next.dataset.characterTab);
  };
});
el('monsterManager')?.addEventListener('pointerdown',event=>{
  const tab=event.target.closest?.('.character-info-tab');
  beginFullCharacterInfoTabPointer(event,tab);
},{capture:true});
el('monsterManager')?.addEventListener('pointermove',event=>{
  moveFullCharacterInfoTabPointer(event);
},{capture:true});
el('monsterManager')?.addEventListener('pointercancel',event=>{
  cancelFullCharacterInfoTabPointer(event);
},{capture:true});
el('monsterManager')?.addEventListener('pointerup',event=>{
  const tab=event.target.closest?.('.character-info-tab');
  if(!finishFullCharacterInfoTabPointer(event,tab))return;
  event.preventDefault();
  event.stopPropagation();
  if(!shouldActivateFullCharacterInfoTab(tab,'pointerup',event.timeStamp))return;
  playSFX('sfx_ui_click');
  setFullCharacterInfoTab(tab.dataset.characterTab);
},{capture:true,passive:false});
const enterImmersiveBtn=el('enterImmersiveBtn');
const retryImmersiveBtn=el('retryImmersiveBtn');
const fullscreenBtn=el('fullscreenBtn');
for(const b of [enterImmersiveBtn,retryImmersiveBtn,fullscreenBtn]){
  if(!b) continue;
  b.addEventListener('click',requestImmersiveMode,{passive:false});
}
el('menuBtn').onclick=()=>{playSFX('sfx_ui_click');el('utilityMenu').classList.toggle('hidden');};
window.addEventListener('resize',syncOrientationLock); window.addEventListener('orientationchange',syncOrientationLock); document.addEventListener('fullscreenchange',syncOrientationLock);
startGameInteraction(); setTimeout(syncOrientationLock,80);
el('parentABtn').onclick=()=>{playSFX('sfx_ui_click');openMonsterPicker('parentA');};el('parentBBtn').onclick=()=>{playSFX('sfx_ui_click');openMonsterPicker('parentB');};el('breedBtn').onclick=()=>{playSFX('sfx_ui_click');createEgg();};el('closePicker').onclick=()=>{playSFX('sfx_ui_click');closeMonsterPicker();};el('monsterPicker').addEventListener('pointerdown',e=>{if(e.target===el('monsterPicker'))closeMonsterPicker();});
el('healAllBtn').onclick=()=>{playSFX('sfx_ui_click');healAll();};el('refillBallsBtn').onclick=()=>{playSFX('sfx_ui_click');if(!assertRanchOperation())return;const balls=state.inventory.captureBalls||0;if(balls>0){msg('ยังมี Capture Ball อยู่ — safety floor จะทำงานเมื่อหมดเท่านั้น');return;}state.inventory.captureBalls=5;msg('NPC มอบ Capture Ball ฉุกเฉิน +5');renderManager();renderHUD();saveGame(false);};
function bindActionPress(button,handler){
  button.addEventListener('pointerdown',event=>{
    event.preventDefault();
    event.stopPropagation();
    playSFX('sfx_ui_click');
    handler();
  },{passive:false});
}
const captureBtn=el('captureBtn');
let capturePointerId=null;
captureBtn.addEventListener('pointerdown',event=>{
  if(capturePointerId!==null)return;
  event.preventDefault();
  event.stopPropagation();
  playSFX('sfx_ui_click');
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
bindActionPress(el('skill1Btn'),()=>dispatchSkill(0));
bindActionPress(el('skill2Btn'),()=>dispatchSkill(1));
bindActionPress(el('skill3Btn'),()=>dispatchSkill(2));
bindActionPress(el('skill4Btn'),()=>dispatchSkill(3));
el('skillItemConfirmCancel').onclick=()=>closeSkillItemConfirmation();
el('skillItemConfirmAccept').onclick=()=>confirmSkillItemUse();
el('skillItemConfirm').addEventListener('pointerdown',event=>{if(event.target===el('skillItemConfirm'))closeSkillItemConfirmation();});
addEventListener('keydown',event=>{if(event.key==='Escape'&&!el('skillItemConfirm').classList.contains('hidden'))closeSkillItemConfirmation();});
el('saveBtn').onclick=()=>saveGame(true);
el('muteBtn').onclick=()=>{const m=toggleMute();el('muteBtn').textContent=m?'🔇 เสียงปิด':'🔊 เสียงเปิด';localStorage.setItem('mlr-audio-muted',String(m));};
{const savedVol=localStorage.getItem('mlr-audio-volume');if(savedVol){setVolume(parseFloat(savedVol));el('volumeSlider').value=Math.round(parseFloat(savedVol)*100);}const savedMute=localStorage.getItem('mlr-audio-muted');if(savedMute==='true'){toggleMute();el('muteBtn').textContent='🔇 เสียงปิด';}}
el('volumeSlider').oninput=(e)=>{const v=parseFloat(e.target.value)/100;setVolume(v);localStorage.setItem('mlr-audio-volume',String(v));};
el('resetBtn').onclick=()=>{playSFX('sfx_ui_click');for(const k of [saveKey,oldV5Key,oldV4Key,'monster-capture-summon-proto-v1'])localStorage.removeItem(k);location.reload();};
el('stageRewardClose').onclick=()=>{playSFX('sfx_ui_click');closeStageReward();};
el('stageRewardDone').onclick=()=>{playSFX('sfx_ui_click');closeStageReward();};
el('warpPromptAction').onclick=()=>startWarp();
el('warpPromptCancel').onclick=()=>{playSFX('sfx_ui_click');dismissedWarpId=nearbyWarp?.id||null;closeWarpPrompt();};
el('bossChallengeAccept').onclick=()=>{playSFX('sfx_ui_click');startBossChallenge();};
el('bossChallengeDecline').onclick=()=>{playSFX('sfx_ui_click');declineNearbyBossChallenge();};
el('bossRetreatBtn').onclick=()=>{playSFX('sfx_ui_click');exitBossChallenge();};
el('huntBtn').onclick=()=>{playSFX('sfx_ui_click');state.currentZone==='hub'?msg('เดินไปที่ประตูวาปสีทองด้านหน้าของ Ranch เพื่อเข้าสู่ Grass Meadow'):switchZone('hub');};

// ---------- Wild population safety ----------
let wildEmptyTimer=0;
let autoSaveTick=30;
function ensureWildPopulation(dt){
  if(state.currentZone==='hub'){wildEmptyTimer=0;wildPopulationRecoveryPending=false;return;}
  if(wildPopulationRecoveryPending){wildPopulationRecoveryPending=false;ensureProgressionEncounter(state.currentZone);}
  const alive=livingWilds().length;
  if(alive>0){wildEmptyTimer=0;return;}
  wildEmptyTimer+=dt;
  if(wildEmptyTimer>=1.2){wildEmptyTimer=0;clearWilds();spawnZone(state.currentZone);runBestEffortCombatPresentation(()=>{msg(`ระบบเติม Wild Monster อัตโนมัติ • พบ ${livingWilds().length} ตัว`);renderHUD();});}
}

// ---------- Frame ----------
function updatePlayer(dt){if(pirateThrowPanelPaused()){playerData.invuln=Math.max(0,playerData.invuln-dt);playerVisual.update(dt,{moving:false});keeperVisual.update(dt,{moving:false});merchantVisual.update(dt,{moving:false});trainerVisual.update(dt,{moving:false});evolutionVisual.update(dt,{moving:false});breedingVisual.update(dt,{moving:false});return;}playerData.invuln=Math.max(0,playerData.invuln-dt);let side=0,fwd=0;if(keys.KeyA)side-=1;if(keys.KeyD)side+=1;if(keys.KeyW)fwd+=1;if(keys.KeyS)fwd-=1;side+=joy.x;fwd+=-joy.y;const moving=Math.hypot(side,fwd)>.05;if(moving){const dir=cameraRight().multiplyScalar(side).add(forward().multiplyScalar(fwd)).normalize(),bounds=ZONES[state.currentZone]?.bounds||{minX:-32,maxX:32,minZ:-32,maxZ:32};player.position.addScaledVector(dir,playerData.speed*dt);player.rotation.y=Math.atan2(dir.x,dir.z)+Math.PI;player.position.x=THREE.MathUtils.clamp(player.position.x,bounds.minX,bounds.maxX);player.position.z=THREE.MathUtils.clamp(player.position.z,bounds.minZ,bounds.maxZ);}animateEntity(player,dt,moving,.8);playerVisual.update(dt,{moving});keeperVisual.update(dt,{moving:false});merchantVisual.update(dt,{moving:false});trainerVisual.update(dt,{moving:false});evolutionVisual.update(dt,{moving:false});breedingVisual.update(dt,{moving:false});}
function updateCamera(dt){const f=forward(),distance=5.15,heightLift=.95,lookAhead=2.05,horizontal=Math.cos(cameraPitch)*distance,height=Math.sin(cameraPitch)*distance+heightLift,desired=player.position.clone().add(new THREE.Vector3(0,height,0)).add(f.clone().multiplyScalar(-horizontal));if(!updateCamera.ready){camera.position.copy(desired);updateCamera.ready=true;}else camera.position.lerp(desired,1-Math.pow(.001,dt));const look=player.position.clone().add(new THREE.Vector3(0,1.36,0)).add(f.clone().multiplyScalar(lookAhead));if(cameraShake.time>0){cameraShake.time=Math.max(0,cameraShake.time-dt);cameraShake.phase+=dt*56;const k=cameraShake.duration>0?cameraShake.time/cameraShake.duration:0,mag=cameraShake.mag*k,sx=Math.sin(cameraShake.phase)*mag,sy=Math.cos(cameraShake.phase*1.7)*mag*.62,sz=Math.sin(cameraShake.phase*.73)*mag*.42;camera.position.add(new THREE.Vector3(sx,sy,sz));look.add(new THREE.Vector3(-sx*.28,sy*.18,-sz*.18));if(cameraShake.time<=0){cameraShake.mag=0;cameraShake.duration=0;}}camera.lookAt(look);}

loadGame();ensureStarter();
if(pirateThrowWorld){const initialZone=state.currentZone;state.currentZone='hub';switchZone(initialZone,true);}
else {state.currentZone='hub';switchZone('hub',true);}
renderAll();saveGame(false);
function reloadWorldFromLoadedState(){
  if(pirateThrowWorld){
    const loadedZone=state.currentZone;
    state.currentZone='hub';
    return switchZone(loadedZone,true)||switchZone('hub',true);
  }
  state.currentZone='hub';
  return switchZone('hub',true);
}
async function flushRemoteSaveUntilSettled(){
  do{
    remoteSavePending=false;
    await savePrimaryRemoteSave(currentSaveEnvelope());
  }while(remoteSavePending);
  remoteSaveReady=true;
  remoteSaveSyncing=false;
}
async function syncCloudSave(){
  if(launchSession&&!serverPlayerDataActive){
    remoteSaveReady=false;remoteSaveSyncing=false;remoteSavePending=false;
    return;
  }
  remoteSaveSyncing=true;
  try{
    const remote=await loadPrimaryRemoteSave();
    let successMessage='สร้างข้อมูลผู้เล่นบน Cloud สำเร็จ';
    if(remote?.state){
      migrateLoadedState(remote.state);
      playerData.hp=Number.isFinite(remote.playerHp)?remote.playerHp:100;
      applyLifeSimulation(Date.now(),true);
      reloadWorldFromLoadedState();
      renderAll();
      successMessage='โหลดข้อมูล Cloud สำเร็จ';
    }
    await flushRemoteSaveUntilSettled();
    if(serverPlayerDataActive){
      await syncPlayerData(runtimeConfig,authProfileBridge.sessionToken,{playerHp:String(playerData.hp),playerExp:String(state.exp??0),actionLog:'CLIENT_BOOT_SYNC'});
      try{
        const savedCharacter=await window.POCKETMONSTER_ACCOUNT_ACTIONS.saveCharacter();
        if(savedCharacter?.character)window.POCKETMONSTER_PLAYER_CHARACTER=publishPlayerCharacterBinding({writeArmed:true,name:savedCharacter.character.name});
      }catch(error){console.warn('pirate character profile sync failed',error);}
    }
    msg(successMessage);
  }catch(error){
    remoteSaveSyncing=false;
    remoteSavePending=false;
    console.warn('cloud sync unavailable; using local save',error);
    msg('Cloud ยังไม่พร้อม • ใช้ Save ในเครื่องชั่วคราว');
  }
}
void syncCloudSave();
let last=performance.now(),targetTick=0,lifeTick=0,eggTick=0,firstFrame=true;
const wildFrameSnapshot=[];
function loop(now){
  try{
    const frameMs=now-last;
    const dt=Math.min(.033,frameMs/1000);
    last=now;
    if(STREAM_HITCH.armed){
      STREAM_HITCH.samples++;STREAM_HITCH.sumMs+=frameMs;STREAM_HITCH.lastMs=frameMs;
      if(frameMs>STREAM_HITCH.maxMs)STREAM_HITCH.maxMs=frameMs;
      if(frameMs>33.4)STREAM_HITCH.over33++;
      if(frameMs>50)STREAM_HITCH.over50++;
    }
    updatePlayer(dt);
    wildRuntimeFrameToken=wildRuntimeFrameToken>=Number.MAX_SAFE_INTEGER?1:wildRuntimeFrameToken+1;
    quarantineInvalidWildActors();
    updateWorldStream();
    preflightWildEncounterBoundaries();
    updateWarpPrompt(dt);
    updateBossChallengePrompt();
    updateCamera(dt);
    updateWorldLabels(dt);
    updateFloatingTexts(dt);
    updateProjectiles(dt);
    updateCaptureSequence(dt);
    updateEffects(dt);
    updateGroundDecals(dt);
    updateSkillFields(dt);
    updateSkillSwarms(dt);
    updateCaptureAimVisual();
    updateOwned(dt);
    updateHubCompanion(dt);
    updateRanchVisuals(dt);
    ensureWildPopulation(dt);
    const engagedWildIds=selectWildAggressors();
    syncWildAiTelegraphs(wildAiFrameTarget);
    const wildLoopGeneration=zoneGeneration,wildLoopTargetKey=wildAiFrameTarget?.id??null;
    wildFrameSnapshot.length=wilds.length;
    for(let wildIndex=0;wildIndex<wilds.length;wildIndex++)wildFrameSnapshot[wildIndex]=wilds[wildIndex];
    for(let wildIndex=0;wildIndex<wildFrameSnapshot.length;wildIndex++){
      const w=wildFrameSnapshot[wildIndex];
      if(zoneGeneration!==wildLoopGeneration||currentWildAiTargetKey()!==wildLoopTargetKey)break;
      if(!w||w.retired||w.runtimeGeneration!==wildLoopGeneration)continue;
      const frameRuntime=advanceWildLifecycle(w,dt);
      if(!frameRuntime)continue;
      const targetAvailable=wildAiTargetAvailable(wildAiFrameTarget);
      const aiDistance=targetAvailable?distXZ(w.mesh.position,wildAiFrameTarget.position):Infinity;
      const urgentCancel=!!w.aiState?.pendingAction&&(!engagedWildIds.has(w.id)||w.aiState.targetId!==wildLoopTargetKey||!targetAvailable);
      const aiDt=distanceTickScheduler.advance(w.id,aiDistance,dt,urgentCancel);
      if(aiDt>0)updateWild(w,aiDt,engagedWildIds.has(w.id),wildAiFrameTarget,wildLoopTargetKey,frameRuntime);
      if(zoneGeneration!==wildLoopGeneration||currentWildAiTargetKey()!==wildLoopTargetKey)break;
      if(!w.retired&&w.runtimeGeneration===wildLoopGeneration)applyWildMotionAndPresentation(w,dt,wildAiFrameTarget,wildLoopTargetKey,frameRuntime);
    }
    ranchPad.ring.rotation.y+=dt*.2;
    breedingPad.ring.rotation.y-=dt*.16;
    incubator.rotation.y+=dt*.12;
    autoSaveTick-=dt;
    if(autoSaveTick<=0){autoSaveTick=30;saveGame(false);}
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
      updateRemoteWorldMarkers();
      if(!el('monsterManager').classList.contains('hidden')&&managerDirty.consume(now))renderManager();
    }
    updateCharacterPreview(dt);
    updateRanchClubPreview(dt);
    if(!pirateThrowPanelPaused()) renderer.render(scene,camera);
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
if(typeof window!=='undefined'){
  window.POCKETMONSTER_ANIMAL_CONTROL=Object.freeze({
    source:'pocket-monster',
    hostCharacter:'pirate-fruit',
    hostWorld:'pirate-fruit',
    playerCharacterServer:'pirate-fruit',
    capture:captureThrow,
    summon:summonThrow,
    recall,
    useSkill,
    switchPartySlot,
    functions:Object.freeze(['captureThrow','summonThrow','recall','useSkill','switchPartySlot']),
  });
}
