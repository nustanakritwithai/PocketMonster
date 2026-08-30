import { createSharedResourceCache, selectQualityProfile } from './performance-runtime.mjs';
import { combinedWorldLinksFrom } from './combined-worlds-v900.mjs';
import { combinedLocationQuery, defaultPanelForWorld } from './control-panels-v900.mjs';
import { loadCatalog } from './asset-presentation/catalog.mjs';
import { createAssetEngine } from './asset-presentation/engine.mjs';
import { createBigheadProvider } from './asset-presentation/providers/procedural-bighead.mjs';
import { createBigheadMonsterProvider } from './asset-presentation/providers/procedural-bighead-monster.mjs';
import {
  PIRATE_FRUIT_GROUND_STYLE,
  PIRATE_FRUIT_SCENE_BOUNDS,
  PIRATE_FRUIT_SCENE_CHARACTERS,
  PIRATE_FRUIT_SCENE_MONSTERS,
  PIRATE_FRUIT_REMOTE_APPEARANCES,
  PIRATE_FRUIT_SKY_COLOR,
  PIRATE_FRUIT_SURFACE_STYLE,
  PIRATE_FRUIT_ZONE,
  attachPirateFruitLights,
  buildPirateFruitWorld,
  makePirateFruitGroundImage,
  makePirateFruitSkyImage,
} from './asset-presentation/scenes/pirate-fruit-world.mjs';
import { installWorldPresence, publishWorldState } from './world-presence-v800.mjs';

export const PIRATE_FRUIT_OFFLINE_ENTRY = './pirate-fruit-offline/index.html';
export const POCKET_ANIMAL_CONTROL_RUNTIME = './game-v800.js?v=814&animalControl=pirate-fruit';

const startup = document.getElementById('startupStatus');
const game = document.getElementById('game');
if (!game) throw new Error('missing #game for Pirate Fruit boot');

function startupText(text, cls = '') {
  if (startup) {
    startup.textContent = text;
    startup.className = 'startup-status ' + cls;
  }
}

let throwRuntimePromise = null;

export function ensurePocketAnimalControl() {
  if (typeof window !== 'undefined' && window.POCKETMONSTER_ANIMAL_CONTROL) {
    return Promise.resolve(window.POCKETMONSTER_ANIMAL_CONTROL);
  }
  if (!throwRuntimePromise) {
    throwRuntimePromise = import('./game-v800.js?v=814&animalControl=pirate-fruit').then(() => {
      const control = window.POCKETMONSTER_ANIMAL_CONTROL;
      if (!control) throw new Error('Pocket animal control did not register');
      window.dispatchEvent(new Event('resize'));
      return control;
    });
  }
  return throwRuntimePromise;
}

function assignCombinedWorld(worldId) {
  location.assign(`${location.pathname}?${combinedLocationQuery(worldId, defaultPanelForWorld(worldId))}`);
}

async function loadThree() {
  const urls = [
    'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js',
    'https://unpkg.com/three@0.179.1/build/three.module.js',
  ];
  let lastError = null;
  for (const url of urls) {
    try {
      startupText('กำลังโหลดเอนจิน 3D…');
      return await import(url);
    } catch (err) {
      lastError = err;
      console.warn('Three.js load failed:', url, err);
    }
  }
  throw new Error('โหลด Three.js ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วรีเฟรชหน้า: ' + (lastError?.message || ''));
}

function canvasTexFromRgba(THREE, img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const data = ctx.createImageData(img.width, img.height);
  data.data.set(img.rgba);
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

if (typeof window !== 'undefined') {
  window.POCKETMONSTER_PIRATE_FRUIT = Object.freeze({
    source: 'pocket-asset-engine',
    artReference: PIRATE_FRUIT_OFFLINE_ENTRY,
    renderer: 'asset-presentation',
    zone: PIRATE_FRUIT_ZONE,
    surfaceStyle: PIRATE_FRUIT_SURFACE_STYLE,
    groundStyle: PIRATE_FRUIT_GROUND_STYLE,
    remote: false,
    mergedWithV800: false,
    presentationOnly: true,
    combatAuthority: false,
    animalControlRuntime: POCKET_ANIMAL_CONTROL_RUNTIME,
  });
  window.POCKETMONSTER_ENSURE_THROW_RUNTIME = ensurePocketAnimalControl;
}

if (startup) {
  startupText(document.body?.dataset?.controlPanel === 'throw'
    ? 'กำลังเปิดระบบควบคุมสัตว์ของ Pocket Monster…'
    : 'กำลังเปิดโลก Pirate Fruit…');
}

let THREE;
try {
  THREE = await loadThree();
} catch (err) {
  startupText(err.message, 'error');
  throw err;
}
startupText('กำลังสร้างโลก Pirate Fruit ภาษาบล็อก…');

const qualityProfile = selectQualityProfile({
  deviceMemory: navigator.deviceMemory,
  hardwareConcurrency: navigator.hardwareConcurrency,
  devicePixelRatio: window.devicePixelRatio,
  saveData: navigator.connection?.saveData === true,
});
const assets = createAssetEngine({ THREE, quality: qualityProfile.tier });
{
  const catalogRes = await fetch(new URL('./assets/catalog/humanoid-core.json', import.meta.url));
  if (!catalogRes.ok) throw new Error('โหลด humanoid catalog ไม่สำเร็จ: ' + catalogRes.status);
  loadCatalog(await catalogRes.json());
  for (const [name, file] of [['monster-slimes', 'monster-slimes.json'], ['monster-animals', 'monster-animals.json']]) {
    const res = await fetch(new URL('./assets/catalog/' + file, import.meta.url));
    if (!res.ok) throw new Error('โหลด ' + name + ' catalog ไม่สำเร็จ: ' + res.status);
    await assets.preloadBundle(name, await res.json());
  }
}

const sharedResources = createSharedResourceCache();
function cachedGeometry(kind, args, Factory) {
  const key = `${kind}:${args.map(value => String(value)).join(':')}`;
  return sharedResources.geometry(key, () => new Factory(...args));
}
const boxGeometry = (...args) => cachedGeometry('box', args, THREE.BoxGeometry);
function mat(color, rough = 0.72, metal = 0.08) {
  const key = `standard:${color}:${rough}:${metal}`;
  return sharedResources.material(key, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
}
function basicMat(color) {
  const key = `basic:${color}`;
  return sharedResources.material(key, () => new THREE.MeshBasicMaterial({ color }));
}

const scene = new THREE.Scene();
const groundTex = canvasTexFromRgba(THREE, makePirateFruitGroundImage());
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(20, 20);
const skyTex = canvasTexFromRgba(THREE, makePirateFruitSkyImage());
skyTex.magFilter = THREE.LinearFilter;
skyTex.minFilter = THREE.LinearFilter;
skyTex.wrapS = skyTex.wrapT = THREE.ClampToEdgeWrapping;
scene.background = skyTex;
scene.fog = new THREE.Fog(0x65c9f5, 30, 76);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 130);
const renderer = new THREE.WebGLRenderer({ antialias: qualityProfile.antialias, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, qualityProfile.maxDpr));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = qualityProfile.shadows;
game.replaceChildren();
game.appendChild(renderer.domElement);

const world = buildPirateFruitWorld({
  THREE,
  box: boxGeometry,
  material: mat,
  groundTexture: groundTex,
});
scene.add(world.root);
attachPirateFruitLights(THREE, scene, world.lanterns, { shadows: qualityProfile.shadows });

const { createPirateFruitPlayerProvider } = await import('./asset-presentation/providers/pirate-fruit-player.mjs');
assets.registerProvider('pirate-fruit', createPirateFruitPlayerProvider({
  THREE,
  box: boxGeometry,
  material: mat,
}));
const humanoidProvider = createBigheadProvider({ THREE, box: boxGeometry, material: mat });
const monsterProvider = createBigheadMonsterProvider({
  THREE,
  box: boxGeometry,
  material: mat,
  basicMaterial: basicMat,
});
assets.registerProvider('procedural', ctx => ctx.def?.kind === 'monster' ? monsterProvider(ctx) : humanoidProvider(ctx));

const playerVisual = assets.spawn('character.human.pirate-fruit.v1', {
  role: 'player',
  appearanceId: 'appearance.human.player-orange.v1',
  quality: qualityProfile.tier,
});
const sceneCharacters = PIRATE_FRUIT_SCENE_CHARACTERS.map(spec => {
  const visual = assets.spawn(spec.id, {
    role: spec.role,
    appearanceId: spec.appearanceId,
    quality: qualityProfile.tier,
  });
  visual.root.name = spec.name;
  visual.root.position.set(spec.x, 0, spec.z);
  visual.root.rotation.y = spec.yaw;
  visual.root.userData.presentationOnly = true;
  scene.add(visual.root);
  return visual;
});
const sceneMonsters = PIRATE_FRUIT_SCENE_MONSTERS.map(spec => {
  const visual = assets.spawn(spec.id, {
    role: spec.role,
    quality: qualityProfile.tier,
  });
  visual.root.name = spec.name;
  visual.root.position.set(spec.x, 0, spec.z);
  visual.root.userData.presentationOnly = true;
  visual.root.userData.combatAuthority = false;
  scene.add(visual.root);
  return visual;
});
await Promise.all([playerVisual.ready, ...sceneCharacters.map(v => v.ready), ...sceneMonsters.map(v => v.ready)].filter(Boolean));
const player = playerVisual.root;
player.position.set(0, 0, 2.2);
scene.add(player);

const remoteBodies = new Map();
function appearanceForRemote(id) {
  let hash = 0;
  for (let i = 0; i < String(id).length; i++) hash = (hash + String(id).charCodeAt(i) * (i + 1)) % PIRATE_FRUIT_REMOTE_APPEARANCES.length;
  return PIRATE_FRUIT_REMOTE_APPEARANCES[hash];
}
function syncRemoteCharacters(payload) {
  if (!payload || payload.zone !== PIRATE_FRUIT_ZONE) return;
  const seen = new Set();
  for (const item of payload.players || []) {
    if (!item?.id || !Number.isFinite(item.x) || !Number.isFinite(item.z)) continue;
    seen.add(item.id);
    let body = remoteBodies.get(item.id);
    if (!body) {
      const visual = assets.spawn('character.human.blocky-bighead.v1', {
        role: 'trainer',
        appearanceId: appearanceForRemote(item.id),
        quality: qualityProfile.tier,
      });
      visual.root.name = `pirate-fruit:remote:${item.id}`;
      visual.root.userData.presentationOnly = true;
      scene.add(visual.root);
      body = visual;
      remoteBodies.set(item.id, body);
    }
    body.root.position.set(item.x, 0, item.z);
    if (Number.isFinite(item.dir)) body.root.rotation.y = item.dir;
  }
  for (const [id, body] of remoteBodies) {
    if (seen.has(id)) continue;
    scene.remove(body.root);
    body.dispose?.();
    remoteBodies.delete(id);
  }
}

if (typeof window !== 'undefined') {
  window.MLRPG_ASSETS = { diagnostics: () => assets.diagnostics() };
  publishWorldState({
    getZone: () => PIRATE_FRUIT_ZONE,
    getPosition: () => player.position,
    getDir: () => player.rotation.y,
  });
  installWorldPresence({ THREE, getCamera: () => camera, getZone: () => PIRATE_FRUIT_ZONE });
  const overlayPresence = window.POCKETMONSTER_WORLD_PRESENCE;
  window.POCKETMONSTER_WORLD_PRESENCE = payload => {
    overlayPresence?.(payload);
    syncRemoteCharacters(payload);
  };
}

const el = id => document.getElementById(id);
let cameraYaw = 0.18;
let cameraPitch = 0.28;
const camDrag = { active: false, pid: null, x: 0, y: 0 };
const cameraPad = el('cameraPad');
if (cameraPad) {
  cameraPad.addEventListener('pointerdown', e => {
    camDrag.active = true;
    camDrag.pid = e.pointerId;
    camDrag.x = e.clientX;
    camDrag.y = e.clientY;
    cameraPad.setPointerCapture?.(e.pointerId);
  });
  cameraPad.addEventListener('pointermove', e => {
    if (!camDrag.active || e.pointerId !== camDrag.pid) return;
    const dx = e.clientX - camDrag.x;
    const dy = e.clientY - camDrag.y;
    camDrag.x = e.clientX;
    camDrag.y = e.clientY;
    cameraYaw -= dx * 0.006;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch + dy * 0.004, 0.20, 0.84);
  });
  function endCam(e) {
    if (e.pointerId !== camDrag.pid) return;
    camDrag.active = false;
    camDrag.pid = null;
  }
  cameraPad.addEventListener('pointerup', endCam);
  cameraPad.addEventListener('pointercancel', endCam);
}

const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; });
addEventListener('keyup', e => { keys[e.code] = false; });
const joy = { x: 0, y: 0, active: false, pid: null };
const joyEl = el('joystick');
const stick = el('stick');
if (joyEl && stick) {
  function joyPoint(e) {
    const r = joyEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const max = r.width * 0.34;
    const mag = Math.hypot(dx, dy) || 1;
    if (mag > max) { dx *= max / mag; dy *= max / mag; }
    joy.x = dx / max;
    joy.y = dy / max;
    stick.style.transform = `translate(${dx}px,${dy}px)`;
  }
  joyEl.addEventListener('pointerdown', e => {
    joy.active = true;
    joy.pid = e.pointerId;
    joyEl.setPointerCapture(e.pointerId);
    joyPoint(e);
  });
  joyEl.addEventListener('pointermove', e => { if (joy.active && e.pointerId === joy.pid) joyPoint(e); });
  function joyEnd(e) {
    if (e.pointerId !== joy.pid) return;
    joy.active = false;
    joy.x = joy.y = 0;
    stick.style.transform = 'translate(0,0)';
  }
  joyEl.addEventListener('pointerup', joyEnd);
  joyEl.addEventListener('pointercancel', joyEnd);
}

function forward() { return new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw)).normalize(); }
function cameraRight() { const f = forward(); return new THREE.Vector3(-f.z, 0, f.x).normalize(); }

const speed = 5.15;
let portalBusy = false;

function updatePlayer(dt) {
  let side = 0;
  let fwd = 0;
  if (keys.KeyA) side -= 1;
  if (keys.KeyD) side += 1;
  if (keys.KeyW) fwd += 1;
  if (keys.KeyS) fwd -= 1;
  side += joy.x;
  fwd += -joy.y;
  const moving = Math.hypot(side, fwd) > 0.05;
  if (moving) {
    const dir = cameraRight().multiplyScalar(side).add(forward().multiplyScalar(fwd)).normalize();
    player.position.addScaledVector(dir, speed * dt);
    player.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
    player.position.x = THREE.MathUtils.clamp(player.position.x, PIRATE_FRUIT_SCENE_BOUNDS.minX, PIRATE_FRUIT_SCENE_BOUNDS.maxX);
    player.position.z = THREE.MathUtils.clamp(player.position.z, PIRATE_FRUIT_SCENE_BOUNDS.minZ, PIRATE_FRUIT_SCENE_BOUNDS.maxZ);
  }
  playerVisual.update(dt, { moving });
  for (const visual of sceneCharacters) visual.update?.(dt, { moving: false });
  for (const visual of sceneMonsters) visual.update?.(dt, { moving: false });
  for (const visual of remoteBodies.values()) visual.update?.(dt, { moving: false });
}

function updateCamera(dt) {
  const f = forward();
  const distance = 5.15;
  const horizontal = Math.cos(cameraPitch) * distance;
  const height = Math.sin(cameraPitch) * distance + 1.15;
  const desired = player.position.clone().add(new THREE.Vector3(0, height, 0)).add(f.clone().multiplyScalar(-horizontal));
  camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
  const look = player.position.clone().add(new THREE.Vector3(0, 1.36, 0)).add(f.clone().multiplyScalar(1.5));
  camera.lookAt(look);
}

function updatePortals() {
  if (portalBusy) return;
  for (const portal of world.portals) {
    const dx = player.position.x - portal.position.x;
    const dz = player.position.z - portal.position.z;
    const radius = portal.userData.triggerRadius || 2.25;
    if (dx * dx + dz * dz > radius * radius) continue;
    const pocketPortal = portal.userData.destination === 'pocket-monster' && portal.userData.panel === 'throw' && portal.userData.source === 'pirate-fruit-portal';
    const livingPortal = portal.userData.destination === 'living-world' && portal.userData.panel === 'human' && portal.userData.source === 'pirate-fruit-living-portal';
    if (!pocketPortal && !livingPortal) continue;
    portalBusy = true;
    assignCombinedWorld(portal.userData.destination);
    return;
  }
}

function bindHud() {
  const zoneLabel = document.getElementById('zoneLabel');
  if (zoneLabel) zoneLabel.textContent = 'Pirate Fruit';
  const message = document.getElementById('message');
  if (message) message.textContent = 'โลก Pirate Fruit ภาษาบล็อก Pocket • เดินเข้าประตูในโลกเพื่อเดินทาง';
  const link = combinedWorldLinksFrom('pirate-fruit')[0];
  const button = document.getElementById('pocketWorldWarpBtn');
  if (button && link) {
    button.hidden = true;
    button.textContent = `วาปเข้า${link.label}`;
    button.onclick = () => assignCombinedWorld(link.to);
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

bindHud();
startupText('เข้าโลก Pirate Fruit แล้ว', 'ok');

if (document.body?.dataset?.controlPanel === 'throw') {
  await ensurePocketAnimalControl();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updatePlayer(dt);
  updatePortals();
  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
