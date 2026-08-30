import { createSharedResourceCache, selectQualityProfile } from './performance-runtime.mjs';
import { requireFirebaseLogin } from './firebase-auth-ui.mjs';
import { loadRuntimeConfig } from './runtime-config.mjs';
import { loadCatalog } from './asset-presentation/catalog.mjs';
import { createAssetEngine } from './asset-presentation/engine.mjs';
import { createPirateFruitPlayerProvider } from './asset-presentation/providers/pirate-fruit-player.mjs';
import { installWorldPresence, publishWorldState } from './world-presence-v800.mjs';

export const LIVING_WORLD_VERSION = '9.0.1-living-world-portal';
export const LIVING_WORLD_ID = 'living-world';
export const LIVING_WORLD_LABEL = 'โลกกลาง • World Layer';

const startup = document.getElementById('startupStatus');
let sceneRuntimeActive = true;
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
  window.POCKETMONSTER_LIVING_WORLD = Object.freeze({
    id: LIVING_WORLD_ID,
    version: LIVING_WORLD_VERSION,
    label: LIVING_WORLD_LABEL,
    presentationOnly: true,
    combatAuthority: false,
  });
}
if (!window.POCKETMONSTER_COMBINED_BOOT) await requireFirebaseLogin(runtimeConfig);

let THREE;
try {
  THREE = await loadThree();
} catch (err) {
  startupText(err.message, 'error');
  throw err;
}
startupText('กำลังสร้างโลกกลาง…');

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
scene.background = new THREE.Color(0x2a1b3d);
scene.fog = new THREE.Fog(0x1a1028, 18, 64);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .1, 130);
const renderer = new THREE.WebGLRenderer({ antialias: qualityProfile.antialias, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, qualityProfile.maxDpr));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = qualityProfile.shadows;
el('game').replaceChildren();
el('game').appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xf3d9a8, 0x1e1030, 0.85));
const sun = new THREE.DirectionalLight(0xffb070, 1.15);
sun.position.set(-8, 12, 4);
sun.castShadow = qualityProfile.shadows;
scene.add(sun);
const lanternLight = new THREE.PointLight(0xffcc66, 1.4, 18);
lanternLight.position.set(0, 2.4, -2.2);
scene.add(lanternLight);

const plaza = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.6, 0.28, 12), mat(0x6b6570, .92, .08));
plaza.name = 'living-world:plaza';
plaza.position.y = -0.14;
plaza.receiveShadow = true;
scene.add(plaza);

const ring = new THREE.Mesh(new THREE.TorusGeometry(5.1, 0.12, 8, 24), mat(0xc4b49a, .55, .22));
ring.rotation.x = Math.PI / 2;
ring.position.y = 0.02;
scene.add(ring);

const arch = new THREE.Group();
arch.name = 'living-world:arch';
const pillarL = new THREE.Mesh(boxGeometry(0.42, 3.2, 0.42), mat(0x4b4554, .88, .06));
pillarL.position.set(-1.6, 1.6, -3.2);
const pillarR = pillarL.clone();
pillarR.position.x = 1.6;
const lintel = new THREE.Mesh(boxGeometry(4.0, 0.38, 0.5), mat(0x5a5362, .86, .08));
lintel.position.set(0, 3.28, -3.2);
arch.add(pillarL, pillarR, lintel);
scene.add(arch);

function createPirateFruitPortal() {
  const group = new THREE.Group();
  group.name = 'living-world-pirate-fruit-portal';
  group.userData.presentationOnly = true;
  group.userData.combatAuthority = false;
  group.userData.destination = 'pirate-fruit';
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.34, .12, 12, 48),
    new THREE.MeshBasicMaterial({ color: 0xfb923c, toneMapped: false }),
  );
  ring.position.y = 1.64;
  group.add(ring);
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(1.08, .045, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, toneMapped: false }),
  );
  inner.position.set(0, 1.64, .03);
  group.add(inner);
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(1.13, 48),
    new THREE.MeshBasicMaterial({ color: 0x9a3412, transparent: true, opacity: .3, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
  );
  core.position.set(0, 1.64, .06);
  group.add(core);
  const light = new THREE.PointLight(0xfb923c, 2.5, 10, 2);
  light.position.set(0, 1.7, .45);
  group.add(light);
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 144;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = 'rgba(20,9,5,.88)';
    context.strokeStyle = '#fb923c';
    context.lineWidth = 7;
    context.beginPath();
    context.roundRect(7, 7, 626, 130, 34);
    context.fill(); context.stroke();
    context.fillStyle = '#fff7ed';
    context.font = '800 42px sans-serif';
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText('PIRATE FRUIT', 320, 58);
    context.fillStyle = '#7dd3fc';
    context.font = '700 25px sans-serif';
    context.fillText('เดินเข้าประตูเพื่อกลับ', 320, 105);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  label.position.set(0, 3.45, 0); label.scale.set(5.2, 1.17, 1); label.renderOrder = 100;
  group.add(label);
  group.position.set(0, 0, -3.18);
  scene.add(group);
  return Object.freeze({ group, ring, inner, core, light });
}
const pirateFruitPortal = createPirateFruitPortal();
let pirateFruitPortalElapsed = 0;
let pirateFruitPortalWasInside = false;

function updatePirateFruitPortal(dt) {
  pirateFruitPortalElapsed += Math.min(dt, .1);
  pirateFruitPortal.ring.rotation.z = pirateFruitPortalElapsed * .48;
  pirateFruitPortal.inner.rotation.z = -pirateFruitPortalElapsed * .72;
  const pulse = .5 + .5 * Math.sin(pirateFruitPortalElapsed * 3.2);
  pirateFruitPortal.core.material.opacity = .22 + pulse * .18;
  pirateFruitPortal.light.intensity = 1.8 + pulse * 1.2;
  const dx = player.position.x - pirateFruitPortal.group.position.x;
  const dz = player.position.z - pirateFruitPortal.group.position.z;
  const inside = dx * dx + dz * dz <= 1.8 * 1.8;
  if (inside && !pirateFruitPortalWasInside) {
    window.dispatchEvent(new CustomEvent('pocketmonster:world-warp-v1', {
      detail: { type: 'pocketmonster:world-warp-v1', world: 'pirate-fruit', panel: 'human', source: 'living-world-pirate-portal' },
    }));
  }
  pirateFruitPortalWasInside = inside;
}

for (const x of [-3.4, 3.4]) {
  const post = new THREE.Mesh(boxGeometry(0.18, 1.6, 0.18), mat(0x3f3a46, .9, .04));
  post.position.set(x, 0.8, -1.1);
  const lamp = new THREE.Mesh(sphereGeometry(0.16, 10, 8), mat(0xffe08a, .35, .05));
  lamp.position.set(x, 1.68, -1.1);
  scene.add(post, lamp);
}

const steps = new THREE.Mesh(boxGeometry(3.4, 0.22, 1.4), mat(0x7a7380, .9, .05));
steps.position.set(0, 0.02, 2.4);
steps.receiveShadow = true;
scene.add(steps);

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
player.position.set(0, 0, 1.4);
scene.add(player);

if (typeof window !== 'undefined') {
  window.MLRPG_ASSETS = { diagnostics: () => assets.diagnostics() };
  publishWorldState({
    getZone: () => LIVING_WORLD_ID,
    getPosition: () => player.position,
    getDir: () => player.rotation.y,
  });
  installWorldPresence({ THREE, getCamera: () => camera, getZone: () => LIVING_WORLD_ID });
}

let cameraYaw = 0.05;
let cameraPitch = 0.42;
const camDrag = { active: false, pid: null, x: 0, y: 0 };
const cameraPad = el('cameraPad');
if (cameraPad) {
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
}

const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; });
addEventListener('keyup', e => { keys[e.code] = false; });
const joy = { x: 0, y: 0, active: false, pid: null };
const joyEl = el('joystick');
const stick = el('stick');
if (joyEl && stick) {
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
}

function forward() { return new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw)).normalize(); }
function cameraRight() { const f = forward(); return new THREE.Vector3(-f.z, 0, f.x).normalize(); }

const BOUNDS = Object.freeze({ minX: -6.4, maxX: 6.4, minZ: -5.4, maxZ: 5.8 });
const speed = 5.0;

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
  const f = forward(), distance = 7.0;
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

startupText('เข้าโลกกลางแล้ว', 'ok');
const zoneLabel = document.getElementById('zoneLabel');
if (zoneLabel) zoneLabel.textContent = 'โลกกลาง • World Layer';
const message = document.getElementById('message');
if (message) message.textContent = 'ชั้นโลกกลางใน V9.0 • พรีเซนต์เท่านั้น ยังไม่เป็น authority ของดาเมจ/HP';
let last = performance.now();
function frame(now) {
  if (!sceneRuntimeActive) { requestAnimationFrame(frame); return; }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updatePlayer(dt);
  updatePirateFruitPortal(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.POCKETMONSTER_SCENE_LIFECYCLE=Object.freeze({
  mount:()=>{sceneRuntimeActive=true;return true;},
  unmount:()=>{sceneRuntimeActive=false;return true;},
  diagnostics:()=>Object.freeze({active:sceneRuntimeActive}),
});
