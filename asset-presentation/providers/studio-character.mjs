import { LEGACY_FALLBACKS } from '../anchors.mjs';
import { assertAssetHandle } from '../handle-contract.mjs';
import { disposeHandle, registerOwned } from '../ownership.mjs';
import { getStudioCharacterPackage, inspectStudioCharacterMotionPack } from '../studio-character-package.mjs';

const ARRAY_TYPES = Object.freeze({
  Float32Array,
  Float64Array,
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
});

function typedArray(type, values, fallback = Float32Array) {
  const Ctor = ARRAY_TYPES[type] || fallback;
  return new Ctor(Array.isArray(values) ? values : []);
}

function setVec3(target, values, fallback = [0, 0, 0]) {
  const v = Array.isArray(values) ? values : fallback;
  target?.set?.(Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0);
}

function applyTransform(node, transform = {}) {
  setVec3(node.position, transform.position, [0, 0, 0]);
  const rotation = Array.isArray(transform.rotation) ? transform.rotation : [0, 0, 0, 'XYZ'];
  node.rotation?.set?.(
    Number(rotation[0]) || 0,
    Number(rotation[1]) || 0,
    Number(rotation[2]) || 0,
    rotation[3] || 'XYZ',
  );
  const scale = Array.isArray(transform.scale) ? transform.scale : [1, 1, 1];
  node.scale?.set?.(
    Number.isFinite(Number(scale[0])) ? Number(scale[0]) : 1,
    Number.isFinite(Number(scale[1])) ? Number(scale[1]) : 1,
    Number.isFinite(Number(scale[2])) ? Number(scale[2]) : 1,
  );
}

function buildGeometry(THREE, snapshot, resources) {
  const geometry = new THREE.BufferGeometry();
  geometry.name = snapshot?.name || '';
  for (const [name, attr] of Object.entries(snapshot?.attributes || {})) {
    const array = typedArray(attr?.arrayType, attr?.array, Float32Array);
    geometry.setAttribute(name, new THREE.BufferAttribute(array, Math.max(1, Number(attr?.itemSize) || 1), !!attr?.normalized));
  }
  if (snapshot?.index?.array) {
    const maxIndex = snapshot.index.array.reduce((max, value) => Math.max(max, Number(value) || 0), 0);
    const fallback = maxIndex > 65535 ? Uint32Array : Uint16Array;
    const index = typedArray(snapshot.index.arrayType, snapshot.index.array, fallback);
    geometry.setIndex(new THREE.BufferAttribute(index, 1, false));
  }
  geometry.clearGroups?.();
  for (const group of snapshot?.groups || []) {
    geometry.addGroup?.(Number(group.start) || 0, Number(group.count) || 0, Number(group.materialIndex) || 0);
  }
  if (snapshot?.drawRange && typeof geometry.setDrawRange === 'function') {
    geometry.setDrawRange(Number(snapshot.drawRange.start) || 0, Number(snapshot.drawRange.count) || Infinity);
  }
  resources.push(geometry);
  return geometry;
}

function materialParams(snapshot = {}) {
  const params = {};
  if (snapshot.color) params.color = snapshot.color;
  if (snapshot.emissive) params.emissive = snapshot.emissive;
  if (Number.isFinite(snapshot.emissiveIntensity)) params.emissiveIntensity = snapshot.emissiveIntensity;
  if (Number.isFinite(snapshot.roughness)) params.roughness = snapshot.roughness;
  if (Number.isFinite(snapshot.metalness)) params.metalness = snapshot.metalness;
  if (Number.isFinite(snapshot.opacity)) params.opacity = snapshot.opacity;
  params.transparent = !!snapshot.transparent;
  if (Number.isFinite(snapshot.alphaTest)) params.alphaTest = snapshot.alphaTest;
  if (snapshot.side != null) params.side = snapshot.side;
  params.vertexColors = !!snapshot.vertexColors;
  params.flatShading = !!snapshot.flatShading;
  return params;
}

function buildMaterial(THREE, snapshot, resources) {
  if (Array.isArray(snapshot)) return snapshot.map(item => buildMaterial(THREE, item, resources));
  const Material = THREE.MeshStandardMaterial || THREE.MeshBasicMaterial;
  const material = new Material(materialParams(snapshot || {}));
  material.name = snapshot?.name || '';
  material.userData ??= {};
  material.userData.studioCharacterMaterial = true;
  material.userData.externalTextureRefs = Object.fromEntries(
    Object.entries(snapshot?.maps || {})
      .filter(([, ref]) => ref?.source)
      .map(([key, ref]) => [key, ref.source]),
  );
  resources.push(material);
  return material;
}

function buildSceneNode(THREE, snapshot, resources, path = []) {
  const isMesh = snapshot?.nodeType === 'mesh';
  const node = isMesh
    ? new THREE.Mesh(
      buildGeometry(THREE, snapshot.geometry || {}, resources),
      buildMaterial(THREE, snapshot.material || {}, resources),
    )
    : new THREE.Group();
  node.name = snapshot?.name || '';
  node.visible = snapshot?.visible !== false;
  node.userData = { ...(snapshot?.userData || {}), studioScenePath: [...path] };
  applyTransform(node, snapshot?.transform);
  if (isMesh) {
    node.castShadow = !!snapshot.castShadow;
    node.receiveShadow = !!snapshot.receiveShadow;
  }
  for (const [index, child] of (snapshot?.children || []).entries()) {
    node.add(buildSceneNode(THREE, child, resources, [...path, index]));
  }
  return node;
}

function resolvePath(root, path) {
  let node = root;
  for (const index of Array.isArray(path) ? path : []) {
    node = node?.children?.[index];
    if (!node) return null;
  }
  return node || null;
}

function buildJointMap(sceneRoot, pkg) {
  const map = {};
  for (const [key, binding] of Object.entries(pkg.rig?.jointBindings || {})) {
    const node = resolvePath(sceneRoot, binding.path);
    if (node) map[key] = node;
  }
  return map;
}

function normalizeAction(action) {
  const raw = String(action || 'idle').trim();
  const aliases = {
    crouchidle: 'crouch_idle', crouchwalk: 'crouch_walk',
    dodgeleft: 'dodge_l', dodgeright: 'dodge_r',
    hitreact: 'hit_react', getup: 'get_up',
  };
  const compact = raw.replace(/[\s_-]/g, '').toLowerCase();
  if (aliases[compact]) return aliases[compact];
  return raw.replace(/[\s-]+/g, '_').toLowerCase();
}

function clipState(clip) {
  return normalizeAction(clip?.runtime?.transition?.state || clip?.runtime?.state || clip?.name || '');
}

function clipMotionClass(clip) {
  return normalizeAction(clip?.runtime?.motionClass || '');
}

const CLIP_STATE_ALIASES = Object.freeze({
  attack_melee: ['attack', 'melee', 'slash', 'swing'],
  attack_ranged: ['attack', 'ranged', 'shoot', 'gun'],
  hurt: ['hurt', 'hit_react', 'hit'],
  dead: ['dead', 'death', 'faint'],
  skill: ['skill', 'cast', 'ability'],
});

function canonicalMotionAction(action) {
  const wanted = normalizeAction(action);
  if (wanted === 'attack_melee' || wanted === 'attack_ranged') return 'attack';
  if (wanted === 'hit_react') return 'hurt';
  if (wanted === 'death' || wanted === 'faint') return 'dead';
  return wanted;
}

/**
 * Studio names authored clips descriptively (for example walk_pose_library),
 * while Pirate requests gameplay states (walk). Resolve those semantic forms
 * without inventing a pose when the package did not author one.
 */
export function findStudioCharacterClip(pkg, action) {
  const wanted = normalizeAction(action);
  const clips = Array.isArray(pkg?.animations) ? pkg.animations : [];
  const motion = inspectStudioCharacterMotionPack(pkg);
  const canonical = canonicalMotionAction(wanted);
  const canonicalId = motion.actionMap?.[canonical];
  if (canonicalId) {
    const mapped = clips.find(clip => clip?.id === canonicalId);
    if (mapped) return mapped;
  }
  const exact = clips.find(clip => clipState(clip) === wanted)
    || clips.find(clip => normalizeAction(clip?.name) === wanted);
  if (exact) return exact;

  // Templates use stable state prefixes even when their motion class predates
  // the current Studio metadata migration.
  const prefixed = clips.find(clip => clipState(clip).startsWith(`${wanted}_`))
    || clips.find(clip => normalizeAction(clip?.name).startsWith(`${wanted}_`));
  if (prefixed) return prefixed;

  const aliases = CLIP_STATE_ALIASES[wanted] || [];
  const aliased = clips.find(clip => aliases.some(alias => {
    const state = clipState(clip);
    const name = normalizeAction(clip?.name);
    return state === alias || state.startsWith(`${alias}_`)
      || name === alias || name.startsWith(`${alias}_`);
  }));
  if (aliased) return aliased;

  if (wanted === 'idle' || wanted === 'walk' || wanted === 'run') {
    return clips.find(clip => clipMotionClass(clip) === wanted) || null;
  }
  if (wanted.startsWith('attack_')) {
    return clips.find(clip => clipMotionClass(clip) === 'action') || null;
  }
  return null;
}

function transformFromPose(value) {
  if (!value || typeof value !== 'object') return {
    rotation: null, quaternion: null, position: null, scale: null,
  };
  const rotation = Array.isArray(value.rotation) ? value.rotation
    : Array.isArray(value.rot) ? value.rot
      : Array.isArray(value.r) ? value.r : null;
  const position = Array.isArray(value.position) ? value.position
    : Array.isArray(value.pos) ? value.pos
      : Array.isArray(value.p) ? value.p : null;
  const scale = Array.isArray(value.scale) ? value.scale
    : Array.isArray(value.scl) ? value.scl
      : Array.isArray(value.s) ? value.s : null;
  const quaternion = Array.isArray(value.quaternion) ? value.quaternion
    : Array.isArray(value.quat) ? value.quat
      : Array.isArray(value.q) ? value.q : null;
  return { rotation, quaternion, position, scale };
}

function lerp(a, b, t) {
  return (Number(a) || 0) + ((Number(b) || 0) - (Number(a) || 0)) * t;
}

function finiteVector(value, size) {
  return Array.isArray(value) && value.length >= size && value.slice(0, size).every(Number.isFinite);
}

function slerpQuaternion(a, b, t) {
  if (!finiteVector(a, 4) || !finiteVector(b, 4)) return null;
  let [ax, ay, az, aw] = a;
  let [bx, by, bz, bw] = b;
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) { dot = -dot; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  if (dot > 0.9995) {
    const q = [lerp(ax, bx, t), lerp(ay, by, t), lerp(az, bz, t), lerp(aw, bw, t)];
    const length = Math.hypot(...q) || 1;
    return q.map(value => value / length);
  }
  const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
  const sinTheta = Math.sin(theta) || 1;
  const left = Math.sin((1 - t) * theta) / sinTheta;
  const right = Math.sin(t * theta) / sinTheta;
  return [ax * left + bx * right, ay * left + by * right, az * left + bz * right, aw * left + bw * right];
}

function sampleClip(clip, time, joints) {
  const keys = clip?.keyframes || [];
  if (!keys.length) return;
  const duration = Math.max(0.0001, Number(clip.duration) || Number(keys.at(-1)?.time) || 0.0001);
  let localTime = Math.max(0, Number(time) || 0);
  if (clip.loop) localTime %= duration;
  else localTime = Math.min(duration, localTime);

  let left = keys[0], right = keys.at(-1);
  for (let i = 0; i < keys.length - 1; i++) {
    if (localTime >= Number(keys[i].time) && localTime <= Number(keys[i + 1].time)) {
      left = keys[i]; right = keys[i + 1]; break;
    }
  }
  const span = Math.max(0.000001, Number(right.time) - Number(left.time));
  let alpha = Math.min(1, Math.max(0, (localTime - Number(left.time)) / span));
  if (clip.interpolation === 'smooth') alpha = alpha * alpha * (3 - 2 * alpha);

  const names = new Set([...Object.keys(left.joints || {}), ...Object.keys(right.joints || {})]);
  for (const name of names) {
    const node = joints[name];
    if (!node) continue;
    const a = transformFromPose(left.joints?.[name] || right.joints?.[name]);
    const b = transformFromPose(right.joints?.[name] || left.joints?.[name]);
    const quaternion = slerpQuaternion(a.quaternion, b.quaternion, alpha);
    if (quaternion && node.quaternion?.set) {
      node.quaternion.set(...quaternion);
    } else if (finiteVector(a.rotation, 3) && finiteVector(b.rotation, 3)) {
      node.rotation?.set?.(
        lerp(a.rotation[0], b.rotation[0], alpha),
        lerp(a.rotation[1], b.rotation[1], alpha),
        lerp(a.rotation[2], b.rotation[2], alpha),
        node.rotation?.order || 'XYZ',
      );
    }
    if (a.position && b.position) {
      node.position?.set?.(
        lerp(a.position[0], b.position[0], alpha),
        lerp(a.position[1], b.position[1], alpha),
        lerp(a.position[2], b.position[2], alpha),
      );
    }
    if (finiteVector(a.scale, 3) && finiteVector(b.scale, 3)) {
      node.scale?.set?.(
        lerp(a.scale[0], b.scale[0], alpha),
        lerp(a.scale[1], b.scale[1], alpha),
        lerp(a.scale[2], b.scale[2], alpha),
      );
    }
  }
}

function copyVector(target, source) {
  if (typeof target?.copy === 'function') return target.copy(source);
  if (typeof target?.set === 'function') return target.set(source.x, source.y, source.z);
  target.x = source.x; target.y = source.y; target.z = source.z;
  return target;
}

export function createStudioCharacterProvider({ THREE } = {}) {
  if (!THREE?.Group || !THREE?.Mesh || !THREE?.BufferGeometry || !THREE?.BufferAttribute) {
    throw new Error('studio-character provider needs THREE Group/Mesh/BufferGeometry/BufferAttribute');
  }
  if (!THREE.MeshStandardMaterial && !THREE.MeshBasicMaterial) {
    throw new Error('studio-character provider needs a Three.js material constructor');
  }

  return function studioCharacterFactory({ def, request }) {
    const pkg = getStudioCharacterPackage(def.id);
    if (!pkg) throw new Error(`Studio character package ${def.id} is not registered`);

    const resources = [];
    const root = new THREE.Group();
    root.name = `studio-character:${def.id}`;
    const sceneRoot = buildSceneNode(THREE, pkg.sceneGraph.root, resources);
    sceneRoot.name ||= 'studio-character:visual';
    root.add(sceneRoot);

    const joints = buildJointMap(sceneRoot, pkg);
    const motion = inspectStudioCharacterMotionPack(pkg);
    const height = Number(pkg.manifest?.metrics?.height) || 1.8;
    const initialClip = findStudioCharacterClip(pkg, 'idle');
    const animation = {
      clip: initialClip,
      time: 0,
      action: 'idle',
      finished: false,
      lastResolveError: initialClip ? null : 'No authored Studio clip resolves idle',
    };
    const rest = Object.freeze({
      headY: height * 0.80,
      throwY: height * 0.64,
      hitTextY: height * 0.82,
      labelY: height * 1.08,
    });

    let disposed = false;
    const handle = {
      id: def.id,
      role: request.role,
      root,
      rig: Object.freeze({
        schema: pkg.rig.schema,
        rest,
        pivots: Object.freeze({ ...joints }),
        sockets: Object.freeze({ ...(pkg.rig.sockets || {}) }),
        sceneRoot,
      }),
      play(action, options = {}) {
        const next = findStudioCharacterClip(pkg, action);
        animation.action = normalizeAction(action);
        if (next) {
          const changed = next !== animation.clip;
          animation.clip = next;
          animation.finished = false;
          animation.lastResolveError = null;
          if (changed || options.restart) animation.time = Math.max(0, Number(options.time) || 0);
          sampleClip(animation.clip, animation.time, joints);
        } else {
          animation.lastResolveError = `No authored Studio clip resolves ${animation.action}`;
        }
        return handle;
      },
      update(dt) {
        if (!animation.clip || disposed) return handle;
        const duration = Math.max(0.0001, Number(animation.clip.duration) || 0.0001);
        animation.time += Math.max(0, Number(dt) || 0);
        if (!animation.clip.loop && animation.time >= duration) {
          animation.time = duration;
          animation.finished = true;
        }
        sampleClip(animation.clip, animation.time, joints);
        return handle;
      },
      anchor(name, target) {
        const out = target || (THREE.Vector3 ? new THREE.Vector3() : { x: 0, y: 0, z: 0 });
        const socketName = name === 'rightHand' ? 'rightHand'
          : name === 'throwOrigin' ? 'throwOrigin'
            : name === 'impact' ? 'attackOrigin'
              : name;
        const socket = pkg.rig?.sockets?.[socketName];
        const node = socket ? joints[socket.joint] : null;
        if (socket && node && THREE.Vector3 && typeof node.localToWorld === 'function') {
          root.updateMatrixWorld?.(true);
          const local = new THREE.Vector3(...socket.offset);
          node.localToWorld(local);
          return copyVector(out, local);
        }
        root.updateMatrixWorld?.(true);
        const base = THREE.Vector3 ? new THREE.Vector3() : { x: root.position.x, y: root.position.y, z: root.position.z };
        if (THREE.Vector3 && typeof root.getWorldPosition === 'function') root.getWorldPosition(base);
        const y = name === 'feet' ? 0
          : name === 'label' || name === 'headTop' ? rest.labelY
            : name === 'hitText' ? rest.hitTextY
              : LEGACY_FALLBACKS.throwOriginY;
        base.y += y;
        return copyVector(out, base);
      },
      bounds(target) {
        const out = target || { minY: 0, maxY: 0 };
        if (THREE.Box3) {
          root.updateMatrixWorld?.(true);
          const box = new THREE.Box3().setFromObject(root);
          if (Number.isFinite(box.min?.y) && Number.isFinite(box.max?.y)) {
            out.minY = box.min.y; out.maxY = box.max.y; return out;
          }
        }
        out.minY = root.position.y;
        out.maxY = root.position.y + height;
        return out;
      },
      setAppearance() { return handle; },
      dispose() {
        if (disposed) return handle;
        disposed = true;
        disposeHandle(handle);
        root.clear?.();
        return handle;
      },
      get animationState() {
        return Object.freeze({
          action: animation.action,
          clipId: animation.clip?.id || null,
          resolvedState: animation.clip ? clipState(animation.clip) : null,
          hasClip: Boolean(animation.clip),
          time: animation.time,
          finished: animation.finished,
          lastResolveError: animation.lastResolveError,
          motion: {
            mode: motion.mode,
            defaultAction: motion.defaultAction,
            available: motion.available,
            missing: motion.missing,
            invalid: motion.invalid,
          },
        });
      },
      get renderProfile() { return pkg.renderProfile || null; },
    };

    for (const resource of resources) registerOwned(handle, resource);
    sampleClip(animation.clip, 0, joints);
    return assertAssetHandle(handle);
  };
}
