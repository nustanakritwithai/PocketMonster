import { createSharedResourceCache, selectQualityProfile } from './performance-runtime.mjs';
import { GROUND_REPEAT, paintGroundGrid, paintSkyGradient } from './asset-presentation/blocky-ground.mjs';
import { loadCatalog } from './asset-presentation/catalog.mjs';
import { createAssetEngine } from './asset-presentation/engine.mjs';
import { createPirateFruitPlayerProvider } from './asset-presentation/providers/pirate-fruit-player.mjs';

export const PIRATE_FRUIT_WORLD_VERSION = '9.0.0-pirate-block-world';
export const PIRATE_FRUIT_WORLD_ID = 'pirate-fruit';
export const PIRATE_FRUIT_WORLD_LABEL = 'เกาะโจรสลัด • Pocket block';
export const PIRATE_ISLAND_GROUND = 0xc2a36b;
export const PIRATE_ISLAND_SKY = 0x4f9ec9;

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

if (typeof window !== 'undefined') {
  window.POCKETMONSTER_PIRATE_BLOCK_WORLD = Object.freeze({
    id: PIRATE_FRUIT_WORLD_ID,
    version: PIRATE_FRUIT_WORLD_VERSION,
    label: PIRATE_FRUIT_WORLD_LABEL,
    surfaceStyle: 'four-side-block-v1',
    groundStyle: 'blocky-ground-v1',
    presentationOnly: true,
    combatAuthority: false,
  });
}

let THREE;
try {
  THREE = await loadThree();
} catch (err) {
  startupText(err.message, 'error');
  throw err;
}
startupText('กำลังสร้างเกาะโจรสลัดภาษาบล็อก…');

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

function mat(color, rough = .72, metal = .08) {
  const key = `standard:${color}:${rough}:${metal}`;
  return sharedResources.material(key, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
}

function canvasTexFromRgba(img) {
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

function makeGroundTexture(zoneColor, zoneType = 'rocky') {
  const tex = canvasTexFromRgba(paintGroundGrid(zoneColor, zoneType));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(GROUND_REPEAT, GROUND_REPEAT);
  return tex;
}

function makeSkyTexture(zoneColor) {
  const tex = canvasTexFromRgba(paintSkyGradient(zoneColor));
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

const el = id => document.getElementById(id);
const scene = new THREE.Scene();
scene.background = makeSkyTexture(PIRATE_ISLAND_SKY);
scene.fog = new THREE.Fog(0x65c9f5, 30, 76);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .1, 130);
const renderer = new THREE.WebGLRenderer({ antialias: qualityProfile.antialias, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, qualityProfile.maxDpr));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = qualityProfile.shadows;
el('game').replaceChildren();
el('game').appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x42643d, 1.55));
const sun = new THREE.DirectionalLight(0xffffff, 2.15);
sun.position.set(9, 18, 8);
sun.castShadow = qualityProfile.shadows;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(90, 90),
  new THREE.MeshStandardMaterial({ map: makeGroundTexture(PIRATE_ISLAND_GROUND, 'rocky'), color: 0xffffff, roughness: 1 }),
);
ground.name = 'pirate-fruit:ground';
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function addBox(parent, w, h, d, color, x, y, z, name) {
  const mesh = new THREE.Mesh(boxGeometry(w, h, d), mat(color, .86, .04));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

const island = new THREE.Group();
island.name = 'pirate-fruit:island';

addBox(island, 2.4, 0.12, 3.6, 0x8b5a2b, 0, 0.06, -2.4, 'pirate-fruit:dock');
addBox(island, 0.18, 1.1, 0.18, 0x5b3a1a, -1.15, 0.55, -1.2, 'pirate-fruit:pier-post');
addBox(island, 0.18, 1.1, 0.18, 0x5b3a1a, 1.15, 0.55, -1.2);
addBox(island, 0.7, 0.55, 0.7, 0x92400e, 1.5, 0.34, -0.6, 'pirate-fruit:crate');
addBox(island, 0.7, 0.55, 0.7, 0x78350f, 1.5, 0.90, -0.6);
addBox(island, 0.42, 0.50, 0.42, 0x7d2632, -1.6, 0.28, -0.2, 'pirate-fruit:barrel');

function makePalm(x, z, s = 1) {
  const g = new THREE.Group();
  g.name = 'pirate-fruit:palm';
  addBox(g, 0.18 * s, 1.7 * s, 0.18 * s, 0x754428, 0, 0.85 * s, 0);
  addBox(g, 1.15 * s, 0.22 * s, 0.42 * s, 0x18753a, 0, 1.72 * s, 0);
  addBox(g, 0.42 * s, 0.22 * s, 1.15 * s, 0x15803d, 0, 1.72 * s, 0);
  addBox(g, 0.55 * s, 0.28 * s, 0.55 * s, 0x166534, 0, 1.92 * s, 0);
  g.position.set(x, 0, z);
  island.add(g);
  return g;
}
makePalm(-4.2, 3.2, 1.1);
makePalm(5.1, 2.4, 0.95);
makePalm(-5.6, -1.8, 1.2);
makePalm(4.4, -3.6, 0.85);

const hut = new THREE.Group();
hut.name = 'pirate-fruit:hut';
addBox(hut, 2.4, 1.4, 2.0, 0x17364b, 0, 0.7, 0);
addBox(hut, 2.7, 0.22, 2.3, 0x7d2632, 0, 1.48, 0);
addBox(hut, 0.46, 0.72, 0.08, 0x41271b, 0, 0.42, -1.04);
hut.position.set(-3.2, 0, 5.4);
island.add(hut);

const mast = new THREE.Group();
mast.name = 'pirate-fruit:mast';
addBox(mast, 0.16, 3.2, 0.16, 0x5b3a1a, 0, 1.6, 0);
addBox(mast, 1.1, 0.55, 0.08, 0x7d2632, 0.55, 2.55, 0, 'pirate-fruit:flag');
mast.position.set(3.6, 0, 4.8);
island.add(mast);

scene.add(island);

assets.registerProvider('pirate-fruit', createPirateFruitPlayerProvider({
  THREE,
  box: boxGeometry,
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
}

let cameraYaw = 0.18;
let cameraPitch = .28;
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

const BOUNDS = Object.freeze({ minX: -12, maxX: 12, minZ: -10, maxZ: 12 });
const speed = 5.7;

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
  const f = forward();
  const distance = 5.15;
  const heightLift = .95;
  const lookAhead = 2.05;
  const horizontal = Math.cos(cameraPitch) * distance;
  const height = Math.sin(cameraPitch) * distance + heightLift;
  const desired = player.position.clone().add(new THREE.Vector3(0, height, 0)).add(f.clone().multiplyScalar(-horizontal));
  if (!updateCamera.ready) {
    camera.position.copy(desired);
    updateCamera.ready = true;
  } else {
    camera.position.lerp(desired, 1 - Math.pow(.001, dt));
  }
  const look = player.position.clone().add(new THREE.Vector3(0, 1.36, 0)).add(f.clone().multiplyScalar(lookAhead));
  camera.lookAt(look);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

startupText('เข้าเกาะโจรสลัดแล้ว', 'ok');
const zoneLabel = document.getElementById('zoneLabel');
if (zoneLabel) zoneLabel.textContent = 'เกาะโจรสลัด • Pirate Fruit';
const message = document.getElementById('message');
if (message) message.textContent = 'โลก Pirate Fruit ใช้ภาษาบล็อกของ Pocket • พรีเซนต์เท่านั้น โหมดปายังเป็นระบบจับมอนของเกมเดิม';
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
