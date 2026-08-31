import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  getImg2ThreeJsModel,
  loadImg2ThreeJsModule,
  prewarmImg2ThreeJsModel,
} from '../../asset-presentation/img2threejs-registry.mjs';

const SEMANTIC_ACTIONS = [
  'idle', 'walk', 'run', 'jump', 'dash', 'attack', 'attack-melee', 'attack-ranged', 'skill', 'hurt', 'dead',
];
const DEFAULT_MAP = {
  idle: 'idle-gesture', walk: 'walk-forward', run: 'run-forward', jump: 'jump-in-place',
  dash: 'dash-forward', attack: 'strike-short', 'attack-melee': 'strike-short', skill: 'strike-wide',
};
const STORAGE_KEY = 'pocketmonster.img2threejs.model-manager.v1';
const $ = id => document.getElementById(id);

const viewport = $('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071019);
const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000);
camera.position.set(2.2, 1.7, 3.1);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
viewport.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.85, 0);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x18212a, 2.2));
const key = new THREE.DirectionalLight(0xffffff, 3.1);
key.position.set(2.5, 5, 3.5); key.castShadow = true; scene.add(key);
const rim = new THREE.DirectionalLight(0x65b7ff, 1.6);
rim.position.set(-4, 2.5, -3); scene.add(rim);
scene.add(new THREE.GridHelper(10, 20, 0x31526a, 0x172a38));

let root = null;
let record = null;
let controller = null;
let wireframe = false;
let lastTime = performance.now();
let modelStats = null;
let mapping = { ...DEFAULT_MAP };

function setStatus(text, state = 'idle') {
  $('status').textContent = text;
  $('status').dataset.state = state;
}
function safeText(error) { return String(error?.message || error || 'Unknown error'); }
function resolveModuleUrl(raw) {
  if (!raw) throw new Error('กรุณาใส่ ES module URL ของโมเดลที่คุณมีสิทธิ์ใช้งาน');
  return new URL(raw, document.baseURI).href;
}
function disposePreview() {
  if (!root) return;
  root.userData?.disposeStrikeVfx?.();
  root.parent?.remove(root);
  root = null; controller = null;
}
function fitCamera() {
  if (!root) return;
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const r = Math.max(0.2, sphere.radius);
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).add(new THREE.Vector3(r * 2.1, r * 1.1, r * 2.5));
  camera.near = Math.max(0.005, r / 100);
  camera.far = Math.max(100, r * 30);
  camera.updateProjectionMatrix();
  controls.update();
}
function inspectModel(object) {
  const stats = { meshes: 0, skinned: 0, bones: 0, vertices: 0, triangles: 0, clips: object.animations?.length || 0 };
  const geometries = new Set();
  object.traverse(node => {
    if (node.isBone) stats.bones += 1;
    if (!node.isMesh) return;
    stats.meshes += 1;
    if (node.isSkinnedMesh) stats.skinned += 1;
    const g = node.geometry;
    if (!g || geometries.has(g)) return;
    geometries.add(g);
    const vertices = g.attributes?.position?.count || 0;
    stats.vertices += vertices;
    stats.triangles += g.index ? Math.floor(g.index.count / 3) : Math.floor(vertices / 3);
  });
  return stats;
}
function renderStats(stats) {
  const values = [stats.meshes, stats.skinned, stats.bones, stats.vertices, stats.triangles, stats.clips];
  [...$('stats').querySelectorAll('b')].forEach((node, i) => node.textContent = (values[i] || 0).toLocaleString());
  const warning = $('perfWarning');
  const messages = [];
  if (stats.triangles > 250000) messages.push(`Triangles ${stats.triangles.toLocaleString()} สูงสำหรับมือถือ`);
  if (stats.meshes > 80) messages.push(`Meshes ${stats.meshes} อาจเพิ่ม draw-call overhead`);
  if (stats.bones > 80) messages.push(`Bones ${stats.bones} ควรทดสอบ CPU animation บน Android จริง`);
  warning.hidden = !messages.length;
  warning.textContent = messages.join(' · ');
}
function availableActions() {
  const runtimeActions = controller?.actions || [];
  if (runtimeActions.length) return runtimeActions.map(action => ({ id: action.id, label: action.label || action.id }));
  return (root?.animations || []).map(clip => ({ id: clip.name, label: `${clip.name} · ${clip.duration?.toFixed?.(2) || '?'} s` }));
}
function renderActions() {
  const box = $('actions'); box.innerHTML = '';
  const actions = availableActions();
  if (!actions.length) { box.className = 'chips empty'; box.textContent = 'ไม่พบ animation controller / clips'; }
  else {
    box.className = 'chips';
    for (const action of actions) {
      const button = document.createElement('button');
      button.textContent = action.label;
      button.onclick = () => { controller?.play?.(action.id); setStatus(`Playing ${action.id}`, 'ok'); };
      box.appendChild(button);
    }
  }
  renderMapping(actions);
}
function renderMapping(actions = availableActions()) {
  const box = $('mapping'); box.innerHTML = '';
  const ids = actions.map(a => a.id);
  for (const semantic of SEMANTIC_ACTIONS) {
    const label = document.createElement('label'); label.textContent = semantic;
    const select = document.createElement('select');
    select.dataset.semantic = semantic;
    select.innerHTML = '<option value="">— unmapped —</option>' + ids.map(id => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join('');
    const desired = mapping[semantic] || '';
    if (ids.includes(desired)) select.value = desired;
    select.onchange = () => { mapping[semantic] = select.value; updateProfileOutput(); };
    box.append(label, select);
  }
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[ch]));
}
function renderVfx(runtime) {
  const select = $('vfxSelect'); select.innerHTML = '<option value="">—</option>';
  const elements = runtime?.strikeVfx?.elements || [];
  for (const item of elements) {
    const option = document.createElement('option'); option.value = item.id; option.textContent = item.label || item.id; select.appendChild(option);
  }
  select.disabled = !elements.length;
  select.onchange = () => { if (select.value) runtime?.strikeVfx?.setElement?.(select.value); };
}
function runtimeSummary(runtime) {
  return {
    route: runtime?.route || null,
    controller: !!runtime?.animationController,
    actions: runtime?.animationController?.actions || [],
    sockets: Object.keys(runtime?.sockets || {}),
    actionAnchors: runtime?.actionAnchors || {},
    vfxElements: runtime?.strikeVfx?.elements || [],
    measuredGeometry: runtime?.measuredGeometry ? {
      nodeCount: runtime.measuredGeometry.nodeCount,
      vertexCount: runtime.measuredGeometry.vertexCount,
      triangleCount: runtime.measuredGeometry.triangleCount,
      sourceJointCount: runtime.measuredGeometry.sourceJointCount,
      sourceClipCount: runtime.measuredGeometry.sourceClipCount,
    } : null,
  };
}
function currentProfile() {
  const bounds = root ? new THREE.Box3().setFromObject(root) : null;
  const height = bounds && !bounds.isEmpty() ? Math.max(0, bounds.max.y - bounds.min.y) : 1;
  const cleanMap = Object.fromEntries(Object.entries(mapping).filter(([, value]) => value));
  return {
    version: 1,
    source: {
      type: 'img2threejs-compatible-module',
      referenceUrl: $('sourceUrl').value.trim(),
      moduleUrl: $('moduleUrl').value.trim(),
      buildExport: $('buildExport').value.trim() || record?.buildExport || null,
      prewarmExport: $('prewarmExport').value.trim() || record?.prewarmExport || null,
    },
    model: { id: $('modelId').value.trim(), stats: modelStats, animationMap: cleanMap },
    pocketAssetDefinition: {
      id: $('modelId').value.trim(),
      kind: 'character',
      provider: 'img2threejs',
      modelId: $('modelId').value.trim(),
      style: 'img2threejs-runtime-v1',
      surfaceStyle: 'source-authored',
      rig: 'sculptRuntime',
      metrics: { height: Number(height.toFixed(4)) },
      roles: { player: true },
      animationMap: cleanMap,
    },
  };
}
function updateProfileOutput() { $('profileOutput').value = JSON.stringify(currentProfile(), null, 2); }
function applyProfile(profile) {
  if (!profile) return;
  $('modelId').value = profile.model?.id || $('modelId').value;
  $('sourceUrl').value = profile.source?.referenceUrl || '';
  $('moduleUrl').value = profile.source?.moduleUrl || '';
  $('buildExport').value = profile.source?.buildExport || '';
  $('prewarmExport').value = profile.source?.prewarmExport || '';
  mapping = { ...DEFAULT_MAP, ...(profile.model?.animationMap || {}) };
  renderMapping(); updateProfileOutput();
}

async function loadPreview() {
  setStatus('กำลังโหลด module…', 'busy');
  const id = $('modelId').value.trim();
  if (!id) throw new Error('Model ID ว่าง');
  const url = resolveModuleUrl($('moduleUrl').value.trim());
  record = await loadImg2ThreeJsModule(id, url, {
    buildExport: $('buildExport').value.trim() || undefined,
    prewarmExport: $('prewarmExport').value.trim() || undefined,
    animationMap: mapping,
    metadata: { referenceUrl: $('sourceUrl').value.trim() },
  });
  setStatus('กำลัง prewarm payload…', 'busy');
  await prewarmImg2ThreeJsModel(id);
  record = getImg2ThreeJsModel(id);
  disposePreview();
  setStatus('กำลังสร้าง preview…', 'busy');
  root = record.build({ castShadow: true, receiveShadow: true, wireframe });
  if (!root?.isObject3D && !(root instanceof THREE.Object3D)) throw new Error('Model factory ต้องคืน THREE.Object3D / THREE.Group');
  scene.add(root);
  const runtime = root.userData?.sculptRuntime || {};
  controller = runtime.animationController || null;
  modelStats = inspectModel(root);
  renderStats(modelStats);
  renderActions(); renderVfx(runtime);
  $('runtimeInfo').textContent = JSON.stringify(runtimeSummary(runtime), null, 2);
  const firstIdle = mapping.idle;
  if (firstIdle && controller?.actions?.some(a => a.id === firstIdle)) controller.play(firstIdle);
  fitCamera(); updateProfileOutput();
  setStatus(`พร้อม · ${modelStats.meshes} meshes / ${modelStats.triangles.toLocaleString()} tris`, 'ok');
}

$('loadBtn').onclick = () => loadPreview().catch(error => { console.error(error); setStatus(safeText(error), 'error'); });
$('fitBtn').onclick = fitCamera;
$('wireBtn').onclick = () => {
  wireframe = !wireframe;
  root?.traverse(node => {
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material && 'wireframe' in material) material.wireframe = wireframe;
    }
  });
  $('wireBtn').textContent = wireframe ? 'Wireframe ✓' : 'Wireframe';
};
$('stopBtn').onclick = () => controller?.stop?.();
$('seek').oninput = event => {
  const active = controller?.active;
  const clip = root?.animations?.find(item => item.name === active);
  if (active && clip && controller?.seek) controller.seek(active, Number(event.target.value) * clip.duration);
};
$('saveBtn').onclick = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify(currentProfile())); setStatus('บันทึก profile ในเครื่องแล้ว', 'ok'); };
$('restoreBtn').onclick = () => {
  try { applyProfile(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); setStatus('Restore profile แล้ว', 'ok'); }
  catch (error) { setStatus(safeText(error), 'error'); }
};
$('exportBtn').onclick = () => {
  const profile = currentProfile();
  $('profileOutput').value = JSON.stringify(profile, null, 2);
  const blob = new Blob([$('profileOutput').value], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
  link.download = `${profile.model.id.replace(/[^a-z0-9._-]+/gi, '_')}.model-profile.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

function resize() {
  const width = viewport.clientWidth || 1, height = viewport.clientHeight || 1;
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport); resize(); renderMapping(); updateProfileOutput();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
  root?.userData?.tick?.(dt);
  if (root && !root.userData?.tick) controller?.advance?.(dt);
  const active = controller?.active;
  const clip = root?.animations?.find(item => item.name === active);
  if (clip && controller?.time != null) {
    $('seek').disabled = false;
    $('seek').value = String(Math.min(1, Math.max(0, controller.time / Math.max(0.001, clip.duration))));
  } else $('seek').disabled = true;
  controls.update(); renderer.render(scene, camera);
}
requestAnimationFrame(frame);
