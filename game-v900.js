import { createSharedResourceCache, selectQualityProfile } from './performance-runtime.mjs';
import { requireFirebaseLogin } from './firebase-auth-ui.mjs';
import { loadRuntimeConfig } from './runtime-config.mjs';
import { loadCatalog } from './asset-presentation/catalog.mjs';
import { createAssetEngine } from './asset-presentation/engine.mjs';
import { createPirateFruitPlayerProvider } from './asset-presentation/providers/pirate-fruit-player.mjs';

export const NEW_WORLD_VERSION = '9.0.0-new-world';
export const NEW_WORLD_ID = 'pirate-fruit-new-world';
export const NEW_WORLD_LABEL = 'โลกใหม่ • Pirate Fruit';

const startup = document.getElementById('startupStatus');
function startupText(text, cls = '') {
  if (startup) {
    startup.textContent = text;
    startup.className = 'startup-status ' + cls;
  }
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

const runtimeConfig = await loadRuntimeConfig();
if (typeof window !== 'undefined') {
  window.POCKETMONSTER_RUNTIME_CONFIG = runtimeConfig;
  window.POCKETMONSTER_NEW_WORLD = Object.freeze({
    id: NEW_WORLD_ID,
    version: NEW_WORLD_VERSION,
    label: NEW_WORLD_LABEL,
    mergedWithV800: false,
  });
}
await requireFirebaseLogin(runtimeConfig);

let THREE;
try {
  THREE = await loadThree();
} catch (err) {
  startupText(err.message, 'error');
  throw err;
}
startupText('กำลังสร้างโลกใหม่ Pirate Fruit…');

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
const sphereGeometry = (...args) => cachedGeometry('sphere', args, THREE.SphereGeometry);
const boxGeometry = (...args) => cachedGeometry('box', args, THREE.BoxGeometry);
const cylinderGeometry = (...args) => cachedGeometry('cylinder', args, THREE.CylinderGeometry);
const capsuleGeometry = (...args) => cachedGeometry('capsule', args, THREE.CapsuleGeometry);
const coneGeometry = (...args) => cachedGeometry('cone', args, THREE.ConeGeometry);
const torusGeometry = (...args) => cachedGeometry('torus', args, THREE.TorusGeometry);

function mat(color, rough = .72, metal = .08) {
  const key = `standard:${color}:${rough}:${metal}`;
  return sharedResources.material(key, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
}

const el = id => document.getElementById(id);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x4f9ec9);
scene.fog = new THREE.Fog(0x3d7ea8, 28, 90);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .1, 130);
const renderer = new THREE.WebGLRenderer({ antialias: qualityProfile.antialias, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, qualityProfile.maxDpr));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = qualityProfile.shadows;
el('game').appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e3a5f, 1.2));
const sun = new THREE.DirectionalLight(0xfff1c1, 1.8);
sun.position.set(10, 16, 8);
sun.castShadow = qualityProfile.shadows;
scene.add(sun);

const water = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), mat(0x1d4e7a, .35, .12));
water.rotation.x = -Math.PI / 2;
water.position.y = -0.08;
water.receiveShadow = true;
scene.add(water);

const dock = new THREE.Group();
dock.name = 'pirate-new-world:dock';
for (let i = 0; i < 8; i++) {
  const plank = new THREE.Mesh(boxGeometry(2.4, 0.12, 0.42), mat(0x8b5a2b, .86, .04));
  plank.position.set(0, 0.06, -i * 0.46);
  plank.receiveShadow = true;
  plank.castShadow = true;
  dock.add(plank);
}
const pierPostL = new THREE.Mesh(boxGeometry(0.18, 1.1, 0.18), mat(0x5b3a1a, .9, .02));
pierPostL.position.set(-1.15, 0.5, -1.2);
const pierPostR = pierPostL.clone();
pierPostR.position.x = 1.15;
dock.add(pierPostL, pierPostR);
const crate = new THREE.Mesh(boxGeometry(0.7, 0.55, 0.7), mat(0x92400e, .84, .04));
crate.position.set(1.4, 0.34, -0.4);
crate.castShadow = true;
dock.add(crate);
scene.add(dock);

const island = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7.2, 0.55, 16), mat(0xc2a36b, .95, .02));
island.position.set(0, -0.2, 4.2);
island.receiveShadow = true;
scene.add(island);

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
const playerVisual = assets.spawn('character.human.pirate-fruit.v1', {
  role: 'player',
  appearanceId: 'appearance.human.player-orange.v1',
  quality: qualityProfile.tier,
});
await playerVisual.ready;
const player = playerVisual.root;
player.position.set(0, 0, 1.2);
scene.add(player);

if (typeof window !== 'undefined') {
  window.MLRPG_ASSETS = { diagnostics: () => assets.diagnostics() };
}

let cameraYaw = 0.2;
let cameraPitch = 0.38;
const camDrag = { active: false, pid: null, x: 0, y: 0 };
const cameraPad = el('cameraPad');
cameraPad.addEventListener('pointerdown', e => {
  camDrag.active = true; camDrag.pid = e.pointerId; camDrag.x = e.clientX; camDrag.y = e.clientY;
  cameraPad.setPointerCapture?.(e.pointerId);
});
cameraPad.addEventListener('pointermove', e => {
  if (!camDrag.active || e.pointerId !== camDrag.pid) return;
  const dx = e.clientX - camDrag.x, dy = e.clientY - camDrag.y;
  camDrag.x = e.clientX; camDrag.y = e.clientY;
  cameraYaw -= dx * .006;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch + dy * .004, .20, .84);
});
function endCam(e) { if (e.pointerId !== camDrag.pid) return; camDrag.active = false; camDrag.pid = null; }
cameraPad.addEventListener('pointerup', endCam);
cameraPad.addEventListener('pointercancel', endCam);

const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; });
addEventListener('keyup', e => { keys[e.code] = false; });
const joy = { x: 0, y: 0, active: false, pid: null };
const joyEl = el('joystick');
const stick = el('stick');
function joyPoint(e) {
  const r = joyEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = e.clientX - cx, dy = e.clientY - cy;
  const max = r.width * .34, mag = Math.hypot(dx, dy) || 1;
  if (mag > max) { dx *= max / mag; dy *= max / mag; }
  joy.x = dx / max; joy.y = dy / max;
  stick.style.transform = `translate(${dx}px,${dy}px)`;
}
joyEl.addEventListener('pointerdown', e => { joy.active = true; joy.pid = e.pointerId; joyEl.setPointerCapture(e.pointerId); joyPoint(e); });
joyEl.addEventListener('pointermove', e => { if (joy.active && e.pointerId === joy.pid) joyPoint(e); });
function joyEnd(e) {
  if (e.pointerId !== joy.pid) return;
  joy.active = false; joy.x = joy.y = 0; stick.style.transform = 'translate(0,0)';
}
joyEl.addEventListener('pointerup', joyEnd);
joyEl.addEventListener('pointercancel', joyEnd);

function forward() { return new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw)).normalize(); }
function cameraRight() { const f = forward(); return new THREE.Vector3(-f.z, 0, f.x).normalize(); }

const BOUNDS = Object.freeze({ minX: -8, maxX: 8, minZ: -6, maxZ: 10 });
const speed = 5.4;

function updatePlayer(dt) {
  let side = 0, fwd = 0;
  if (keys.KeyA) side -= 1; if (keys.KeyD) side += 1;
  if (keys.KeyW) fwd += 1; if (keys.KeyS) fwd -= 1;
  side += joy.x; fwd += -joy.y;
  const moving = Math.hypot(side, fwd) > .05;
  if (moving) {
    const dir = cameraRight().multiplyScalar(side).add(forward().multiplyScalar(fwd)).normalize();
    player.position.addScaledVector(dir, speed * dt);
    player.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
    player.position.x = THREE.MathUtils.clamp(player.position.x, BOUNDS.minX, BOUNDS.maxX);
    player.position.z = THREE.MathUtils.clamp(player.position.z, BOUNDS.minZ, BOUNDS.maxZ);
  }
  playerVisual.update(dt, { moving });
}

function updateCamera(dt) {
  const f = forward(), distance = 7.4;
  const horizontal = Math.cos(cameraPitch) * distance;
  const height = Math.sin(cameraPitch) * distance + 1.15;
  const desired = player.position.clone().add(new THREE.Vector3(0, height, 0)).add(f.clone().multiplyScalar(-horizontal));
  camera.position.lerp(desired, 1 - Math.pow(.001, dt));
  const look = player.position.clone().add(new THREE.Vector3(0, 1.1, 0)).add(f.clone().multiplyScalar(1.5));
  camera.lookAt(look);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

startupText('เข้าโลกใหม่แล้ว', 'ok');
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updatePlayer(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
