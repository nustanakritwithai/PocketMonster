import { createSharedResourceCache, selectQualityProfile } from './performance-runtime.mjs';
import { requireFirebaseLogin } from './firebase-auth-ui.mjs';
import { loadRuntimeConfig } from './runtime-config.mjs';
import { loadCatalog } from './asset-presentation/catalog.mjs';
import { createAssetEngine } from './asset-presentation/engine.mjs';
import { createStudioCharacterProvider } from './asset-presentation/providers/studio-character.mjs';
import { installStudioCharacterPackage } from './asset-presentation/studio-character-package.mjs';
import { loadStudioCharacterFromEngine } from './asset-presentation/studio-character-live-bridge.mjs?v=2';
import { applyStudioCharacterRenderProfile } from './asset-presentation/studio-character-render-profile.mjs';
import { installWorldPresence, publishWorldState } from './world-presence-v800.mjs?v=5';

export const PIRATE_NATIVE_WORLD_VERSION = '9.4.0-studio-first';
export const PIRATE_NATIVE_WORLD_ID = 'pirate-fruit';
export const PIRATE_NATIVE_WORLD_LABEL = 'Pirate Fruit • Native V9';
export const PIRATE_NATIVE_ACTION_EVENT = 'pocketmonster:pirate-native-action-v1';

const startup = document.getElementById('startupStatus');
let sceneRuntimeActive = true;
function startupText(text, cls = '') {
  if (!startup) return;
  startup.textContent = text;
  startup.className = 'startup-status ' + cls;
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
    } catch (error) {
      lastError = error;
      console.warn('Three.js load failed:', url, error);
    }
  }
  throw new Error('โหลด Three.js ไม่สำเร็จ: ' + (lastError?.message || 'unknown'));
}

const runtimeConfig = await loadRuntimeConfig();
if (!window.POCKETMONSTER_COMBINED_BOOT) await requireFirebaseLogin(runtimeConfig);

const THREE = await loadThree();
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
}

const sharedResources = createSharedResourceCache();
function cachedGeometry(kind, args, Factory) {
  const key = `${kind}:${args.map(value => String(value)).join(':')}`;
  return sharedResources.geometry(key, () => new Factory(...args));
}
const boxGeometry = (...args) => cachedGeometry('box', args, THREE.BoxGeometry);
const cylinderGeometry = (...args) => cachedGeometry('cylinder', args, THREE.CylinderGeometry);
const sphereGeometry = (...args) => cachedGeometry('sphere', args, THREE.SphereGeometry);
const torusGeometry = (...args) => cachedGeometry('torus', args, THREE.TorusGeometry);

function mat(color, roughness = .72, metalness = .08) {
  const key = `native-pirate:${color}:${roughness}:${metalness}`;
  return sharedResources.material(key, () => new THREE.MeshStandardMaterial({ color, roughness, metalness }));
}
function textureSizeForQuality(quality) {
  if (quality === 'low') return 512;
  if (quality === 'high' || quality === 'ultra') return 1536;
  return 1024;
}

const game = document.getElementById('game');
if (!game) throw new Error('missing #game for native Pirate world');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6db6d9);
scene.fog = new THREE.Fog(0x5594b7, 34, 120);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .1, 180);
const renderer = new THREE.WebGLRenderer({ antialias: qualityProfile.antialias, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, qualityProfile.maxDpr));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = qualityProfile.shadows;
game.replaceChildren(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xe8f6ff, 0x27364a, 1.15));
const sun = new THREE.DirectionalLight(0xfff0c7, 1.75);
sun.position.set(12, 18, 7);
sun.castShadow = qualityProfile.shadows;
scene.add(sun);

const water = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), mat(0x1d5f86, .28, .12));
water.rotation.x = -Math.PI / 2;
water.position.y = -0.18;
water.receiveShadow = true;
scene.add(water);

const island = new THREE.Mesh(cylinderGeometry(11.8, 13.2, .72, 32), mat(0xc8aa73, .95, .02));
island.position.set(0, -.32, 5.2);
island.receiveShadow = true;
scene.add(island);

const grass = new THREE.Mesh(cylinderGeometry(10.4, 11.6, .24, 32), mat(0x6f9d56, .92, .01));
grass.position.set(0, .06, 5.2);
grass.receiveShadow = true;
scene.add(grass);

const dock = new THREE.Group();
dock.name = 'pirate-native:dock';
for (let i = 0; i < 12; i += 1) {
  const plank = new THREE.Mesh(boxGeometry(3.2, .14, .48), mat(0x84552d, .86, .04));
  plank.position.set(0, .09, 1.0 - i * .48);
  plank.castShadow = qualityProfile.shadows;
  plank.receiveShadow = true;
  dock.add(plank);
}
for (const x of [-1.45, 1.45]) {
  for (const z of [-1.0, -3.9]) {
    const post = new THREE.Mesh(boxGeometry(.18, 1.35, .18), mat(0x56351e, .9, .02));
    post.position.set(x, .48, z);
    dock.add(post);
  }
}
scene.add(dock);

for (const [x, z, scale] of [[-5.4, 7.4, 1], [5.2, 8.2, .9], [-6.8, 2.6, .75]]) {
  const trunk = new THREE.Mesh(cylinderGeometry(.18 * scale, .25 * scale, 2.6 * scale, 10), mat(0x6b4326, .9, .01));
  trunk.position.set(x, 1.3 * scale, z);
  trunk.castShadow = qualityProfile.shadows;
  scene.add(trunk);
  for (let i = 0; i < 5; i += 1) {
    const leaf = new THREE.Mesh(boxGeometry(1.35 * scale, .12 * scale, .42 * scale), mat(0x287c4a, .78, .01));
    leaf.position.set(x, 2.65 * scale, z);
    leaf.rotation.y = i * Math.PI * .4;
    leaf.rotation.z = -.22;
    scene.add(leaf);
  }
}

function createPortal({ name, destination, panel, source, x, z, color }) {
  const group = new THREE.Group();
  group.name = name;
  group.userData.destination = destination;
  group.userData.presentationOnly = true;
  const ring = new THREE.Mesh(
    torusGeometry(1.05, .12, 12, 42),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  );
  ring.position.y = 1.35;
  group.add(ring);
  const inner = new THREE.Mesh(
    torusGeometry(.78, .04, 8, 36),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
  );
  inner.position.y = 1.35;
  group.add(inner);
  const light = new THREE.PointLight(color, 1.8, 8, 2);
  light.position.set(0, 1.5, .4);
  group.add(light);
  group.position.set(x, 0, z);
  scene.add(group);
  return { group, ring, inner, light, destination, panel, source, inside: false, time: 0 };
}

const portals = [
  createPortal({
    name: 'pirate-native:pocket-monster-portal',
    destination: 'pocket-monster',
    panel: 'throw',
    source: 'pirate-native-pocket-portal',
    x: -4.2,
    z: 8.0,
    color: 0xfacc15,
  }),
  createPortal({
    name: 'pirate-native:living-world-portal',
    destination: 'living-world',
    panel: 'human',
    source: 'pirate-native-living-portal',
    x: 4.2,
    z: 8.0,
    color: 0x38bdf8,
  }),
];

assets.registerProvider('studio-character', createStudioCharacterProvider({ THREE }));

let studioPackage = null;
let playerVisual = null;
let playerVisualSource = 'studio-character';
let renderProfileReport = null;
try {
  startupText('กำลังโหลดตัวละครกราฟิกใหม่…');
  studioPackage = await loadStudioCharacterFromEngine({
    characterId: 'character.human.pirate.studio-live',
    displayName: 'Studio Player',
  });
  await installStudioCharacterPackage(assets, studioPackage, { bundleName: 'studio-live-player' });
  playerVisual = assets.spawn(studioPackage.manifest.id, {
    role: 'player',
    quality: qualityProfile.tier,
  });
  await playerVisual.ready;
  if (playerVisual.renderProfile) {
    renderProfileReport = await applyStudioCharacterRenderProfile(playerVisual.root, playerVisual.renderProfile, {
      THREE,
      documentRef: document,
      maxTextureSize: textureSizeForQuality(qualityProfile.tier),
      isDisposed: () => playerVisual?.disposed === true,
      registerTexture: texture => playerVisual?.ownTexture?.(texture),
    });
  }
  playerVisual.play('idle', { restart: true });
} catch (error) {
  console.warn('[NativePirate] Studio load failed; lazy-loading legacy fallback only now', error);
  playerVisualSource = 'pirate-fallback';
  const { createPirateFruitPlayerProvider } = await import('./asset-presentation/providers/pirate-fruit-player.mjs?v=native-fallback-1');
  const capsuleGeometry = (...args) => cachedGeometry('capsule', args, THREE.CapsuleGeometry);
  const coneGeometry = (...args) => cachedGeometry('cone', args, THREE.ConeGeometry);
  assets.registerProvider('pirate-fruit', createPirateFruitPlayerProvider({
    THREE,
    box: boxGeometry,
    capsule: capsuleGeometry,
    sphere: sphereGeometry,
    cylinder: cylinderGeometry,
    cone: coneGeometry,
    torus: torusGeometry,
    material: mat,
  }));
  playerVisual = assets.spawn('character.human.pirate-fruit.v1', {
    role: 'player',
    appearanceId: 'appearance.human.player-orange.v1',
    quality: qualityProfile.tier,
  });
  await playerVisual.ready;
}

const player = playerVisual.root;
function normalizePlayerHeight(targetHeight = 1.82) {
  const bounds = playerVisual.bounds?.({ minY: 0, maxY: 0 });
  const height = Number(bounds?.maxY) - Number(bounds?.minY);
  if (!Number.isFinite(height) || height <= .01) return 1;
  const scale = THREE.MathUtils.clamp(targetHeight / height, .25, 4);
  player.scale?.setScalar?.(scale);
  player.updateMatrixWorld?.(true);
  const after = playerVisual.bounds?.({ minY: 0, maxY: 0 });
  if (Number.isFinite(after?.minY)) player.position.y -= after.minY;
  return scale;
}
const playerScale = normalizePlayerHeight();
player.position.x = 0;
player.position.z = 1.5;
scene.add(player);

publishWorldState({
  getZone: () => PIRATE_NATIVE_WORLD_ID,
  getPosition: () => player.position,
  getDir: () => player.rotation.y,
});
installWorldPresence({
  THREE,
  scene,
  getCamera: () => camera,
  getZone: () => PIRATE_NATIVE_WORLD_ID,
});

let cameraYaw = .08;
let cameraPitch = .38;
let cameraDistance = 7.1;
const keys = {};
addEventListener('keydown', event => { keys[event.code] = true; });
addEventListener('keyup', event => { keys[event.code] = false; });
const joy = { x: 0, y: 0 };
let locomotionState = 'idle';
let presentationActionUntil = 0;
let dashUntil = 0;
let nativeActionSequence = 0;

function actionPresentation(action) {
  if (action === 'capture') return { clip: 'attack', duration: .45 };
  if (/^skill[1-4]$/.test(action)) return { clip: 'skill', duration: .6 };
  if (action === 'recall') return { clip: 'jump', duration: .65 };
  if (action === 'summon') return { clip: 'run', duration: .28, dash: true };
  if (action === 'block') return { clip: 'idle', duration: .3 };
  return null;
}

function publishNativeAction(payload) {
  nativeActionSequence += 1;
  window.dispatchEvent(new CustomEvent(PIRATE_NATIVE_ACTION_EVENT, {
    detail: Object.freeze({
      ...payload,
      sequence: nativeActionSequence,
      world: PIRATE_NATIVE_WORLD_ID,
      presentationOnly: true,
      combatAuthority: false,
    }),
  }));
}

function handleNativeAction({ action, phase = 'start', pointerId = null } = {}) {
  const normalized = String(action || '');
  publishNativeAction({ action: normalized, phase, pointerId });
  if (phase !== 'start') return true;
  if (normalized === 'zoomIn') {
    cameraDistance = Math.max(4.6, cameraDistance - .55);
    return true;
  }
  if (normalized === 'zoomOut') {
    cameraDistance = Math.min(10.5, cameraDistance + .55);
    return true;
  }
  const presentation = actionPresentation(normalized);
  if (!presentation) return true;
  const now = performance.now();
  presentationActionUntil = now + presentation.duration * 1000;
  if (presentation.dash) dashUntil = presentationActionUntil;
  locomotionState = null;
  playerVisual.play?.(presentation.clip, { restart: true, duration: presentation.duration });
  return true;
}

const unifiedMobileControls = window.POCKETMONSTER_UNIFIED_MOBILE_CONTROLS;
if (unifiedMobileControls) {
  unifiedMobileControls.registerAdapter(PIRATE_NATIVE_WORLD_ID, Object.freeze({
    interceptActions: true,
    move: ({ x = 0, z = 0, active = false }) => {
      joy.x = active ? x : 0;
      joy.y = active ? z : 0;
    },
    camera: ({ phase, dx = 0, dy = 0 }) => {
      if (phase !== 'move') return;
      cameraYaw -= dx * .006;
      cameraPitch = THREE.MathUtils.clamp(cameraPitch + dy * .004, .20, .84);
    },
    action: payload => handleNativeAction(payload),
    reset: () => { joy.x = 0; joy.y = 0; },
    activate: () => { joy.x = 0; joy.y = 0; },
  }));
} else {
  const cameraPad = document.getElementById('cameraPad');
  const drag = { active: false, id: null, x: 0, y: 0 };
  cameraPad?.addEventListener('pointerdown', event => {
    drag.active = true; drag.id = event.pointerId; drag.x = event.clientX; drag.y = event.clientY;
    cameraPad.setPointerCapture?.(event.pointerId);
  });
  cameraPad?.addEventListener('pointermove', event => {
    if (!drag.active || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    drag.x = event.clientX; drag.y = event.clientY;
    cameraYaw -= dx * .006;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch + dy * .004, .20, .84);
  });
  const end = event => {
    if (drag.id !== event.pointerId) return;
    drag.active = false; drag.id = null;
  };
  cameraPad?.addEventListener('pointerup', end);
  cameraPad?.addEventListener('pointercancel', end);
}

function forward() {
  return new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw)).normalize();
}
function cameraRight() {
  const f = forward();
  return new THREE.Vector3(-f.z, 0, f.x).normalize();
}

const BOUNDS = Object.freeze({ minX: -9.8, maxX: 9.8, minZ: -5.5, maxZ: 14.2 });
const speed = 5.2;

function updatePlayer(dt) {
  let side = 0, fwd = 0;
  if (keys.KeyA) side -= 1;
  if (keys.KeyD) side += 1;
  if (keys.KeyW) fwd += 1;
  if (keys.KeyS) fwd -= 1;
  side += joy.x;
  fwd += -joy.y;
  const moving = Math.hypot(side, fwd) > .05;
  const now = performance.now();
  if (moving) {
    const dir = cameraRight().multiplyScalar(side).add(forward().multiplyScalar(fwd)).normalize();
    const currentSpeed = now < dashUntil ? speed * 1.75 : speed;
    player.position.addScaledVector(dir, currentSpeed * dt);
    player.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
    player.position.x = THREE.MathUtils.clamp(player.position.x, BOUNDS.minX, BOUNDS.maxX);
    player.position.z = THREE.MathUtils.clamp(player.position.z, BOUNDS.minZ, BOUNDS.maxZ);
  }
  if (playerVisualSource === 'studio-character' && now >= presentationActionUntil) {
    const next = moving ? 'walk' : 'idle';
    if (next !== locomotionState) {
      playerVisual.play(next);
      locomotionState = next;
    }
  }
  playerVisual.update(dt, { moving });
}

function updatePortals(dt) {
  for (const portal of portals) {
    portal.time += Math.min(dt, .1);
    portal.ring.rotation.z = portal.time * .55;
    portal.inner.rotation.z = -portal.time * .8;
    portal.light.intensity = 1.35 + (.5 + .5 * Math.sin(portal.time * 3)) * 1.0;
    const dx = player.position.x - portal.group.position.x;
    const dz = player.position.z - portal.group.position.z;
    const inside = dx * dx + dz * dz <= 1.55 * 1.55;
    if (inside && !portal.inside && sceneRuntimeActive) {
      window.dispatchEvent(new CustomEvent('pocketmonster:world-warp-v1', {
        detail: {
          type: 'pocketmonster:world-warp-v1',
          world: portal.destination,
          panel: portal.panel,
          source: portal.source,
        },
      }));
    }
    portal.inside = inside;
  }
}

function updateCamera(dt) {
  const f = forward();
  const horizontal = Math.cos(cameraPitch) * cameraDistance;
  const height = Math.sin(cameraPitch) * cameraDistance + 1.2;
  const desired = player.position.clone()
    .add(new THREE.Vector3(0, height, 0))
    .add(f.clone().multiplyScalar(-horizontal));
  camera.position.lerp(desired, 1 - Math.pow(.001, dt));
  camera.lookAt(player.position.clone().add(new THREE.Vector3(0, 1.15, 0)).add(f.clone().multiplyScalar(1.35)));
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);

const zoneLabel = document.getElementById('zoneLabel');
if (zoneLabel) zoneLabel.textContent = 'Pirate Fruit • Native V9';
const message = document.getElementById('message');
if (message) message.textContent = playerVisualSource === 'studio-character'
  ? 'Studio Character พร้อม • ไม่โหลด Pirate offline client'
  : 'Studio โหลดไม่สำเร็จ • ใช้ fallback ที่โหลดแบบ on-demand';
startupText('เข้า Pirate Fruit Native แล้ว', 'ok');

if (typeof window !== 'undefined') {
  window.POCKETMONSTER_PIRATE_NATIVE = Object.freeze({
    id: PIRATE_NATIVE_WORLD_ID,
    version: PIRATE_NATIVE_WORLD_VERSION,
    source: 'native-v9',
    studioFirst: true,
    offlineClientLoaded: false,
    playAction: action => handleNativeAction({ action, phase: 'start', pointerId: null }),
    diagnostics: () => Object.freeze({
      active: sceneRuntimeActive,
      playerVisualSource,
      playerScale,
      renderProfileState: renderProfileReport?.state || (playerVisualSource === 'studio-character' ? 'none' : 'fallback'),
      portals: portals.map(portal => portal.destination),
      cameraDistance,
      actionSequence: nativeActionSequence,
    }),
  });
  window.MLRPG_ASSETS = { diagnostics: () => ({ ...assets.diagnostics(), playerVisualSource }) };
}

let last = performance.now();
function frame(now) {
  if (!sceneRuntimeActive) {
    last = now;
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  updatePlayer(dt);
  updatePortals(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.POCKETMONSTER_SCENE_LIFECYCLE = Object.freeze({
  mount: () => {
    sceneRuntimeActive = true;
    joy.x = 0; joy.y = 0;
    last = performance.now();
    resize();
    return true;
  },
  unmount: () => {
    sceneRuntimeActive = false;
    joy.x = 0; joy.y = 0;
    presentationActionUntil = 0;
    dashUntil = 0;
    return true;
  },
  diagnostics: () => Object.freeze({
    active: sceneRuntimeActive,
    source: 'native-v9',
    playerVisualSource,
    offlineClientLoaded: false,
  }),
});