import { findGameplayFields, validateAssetDefinition } from './schema.mjs';
import { validateStudioCharacterRenderProfile } from './studio-character-render-profile.mjs';

export const STUDIO_CHARACTER_PACKAGE_SCHEMA = 'pocket-character-runtime-v1';
export const STUDIO_CHARACTER_SCENE_SCHEMA = 'three-group-scenegraph-v1';
export const STUDIO_CHARACTER_PROVIDER = 'studio-character';
// `pocket-character-motion-pack-v1` is the Engine export. The early consumer
// spelling remains accepted for existing downloaded packages during rollout.
export const STUDIO_CHARACTER_MOTION_PACK_SCHEMA = 'pocket-character-motion-pack-v1';
const LEGACY_STUDIO_CHARACTER_MOTION_PACK_SCHEMA = 'pocket-motion-pack-v1';
export const STUDIO_CHARACTER_LIVE_PLAYER_ID = 'character.human.pirate.studio-live';
export const STUDIO_CHARACTER_REQUIRED_MOTION_ACTIONS = Object.freeze([
  'idle', 'walk', 'run', 'attack', 'skill', 'hurt', 'dead',
]);
export const STUDIO_CHARACTER_FORBIDDEN_FIELDS = Object.freeze([
  'hp', 'hpCurrent', 'hpMax', 'atk', 'def', 'spAtk', 'spDef', 'spd',
  'vitality', 'combat', 'blade', 'ranged', 'fruitPower', 'mastery',
  'mana', 'coins', 'capture', 'save', 'level', 'exp', 'experience', 'damage',
]);
const packages = new Map();
const normalizedForbidden = new Set(STUDIO_CHARACTER_FORBIDDEN_FIELDS.map(key => normalizeKey(key)));
function normalizeKey(key) { return String(key || '').replace(/[_-]/g, '').toLowerCase(); }
function isPlainObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function collectStudioGameplayFields(value, prefix = '$', hits = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStudioGameplayFields(item, `${prefix}[${index}]`, hits));
    return hits;
  }
  if (!isPlainObject(value)) return hits;
  for (const [key, child] of Object.entries(value)) {
    const path = `${prefix}.${key}`;
    // Exempt only these two string-valued labels, never the whole motion pack.
    if ((path === '$.motionPack.actionMap.skill' || path === '$.motionPack.unsupportedActions.skill') && typeof child === 'string') continue;
    if (normalizedForbidden.has(normalizeKey(key))) hits.push(path);
    collectStudioGameplayFields(child, path, hits);
  }
  return hits;
}
function validSocket(socket) {
  return isPlainObject(socket) && typeof socket.joint === 'string'
    && Array.isArray(socket.offset) && socket.offset.length === 3 && socket.offset.every(Number.isFinite);
}
function validateJointBindings(bindings) {
  if (!isPlainObject(bindings) || !Object.keys(bindings).length) return ['rig.jointBindings must be a non-empty object'];
  const errors = [];
  for (const [name, binding] of Object.entries(bindings)) {
    if (!isPlainObject(binding)) { errors.push(`rig.jointBindings.${name} must be an object`); continue; }
    if (!Array.isArray(binding.path) || !binding.path.every(index => Number.isInteger(index) && index >= 0)) {
      errors.push(`rig.jointBindings.${name}.path must be an integer array`);
    }
  }
  return errors;
}
function nodeAtPath(root, path) {
  let node = root;
  for (const index of path) { node = node?.children?.[index]; if (!node) return null; }
  return node || null;
}
function isFiniteNumberArray(value, minimumLength = 0) {
  return Array.isArray(value) && value.length >= minimumLength && value.every(Number.isFinite);
}
function normalizedMotionState(clip) {
  return String(clip?.runtime?.transition?.state || clip?.runtime?.state || clip?.name || '')
    .trim().replace(/[\s-]+/g, '_').toLowerCase();
}
function clipHasUsableKeyframes(clip) {
  if (!Array.isArray(clip?.keyframes) || clip.keyframes.length < 2) return false;
  return clip.keyframes.every(frame => Number.isFinite(frame?.time) && isPlainObject(frame?.joints) && Object.keys(frame.joints).length > 0);
}

/** Resolve every declared action against actual clips and rig bindings. */
export function inspectStudioCharacterMotionPack(pkg) {
  const pack = pkg?.motionPack;
  const clips = Array.isArray(pkg?.animations) ? pkg.animations : [];
  const report = { mode: 'legacy-semantic', schema: pack?.schema || null,
    defaultAction: pack?.defaultAction || 'idle', available: clips.map(c => c?.id).filter(Boolean),
    missing: [], invalid: [], actionMap: {}, unsupportedActions: {} };
  if (pack == null) { report.missing.push('motionPack'); return Object.freeze(report); }
  report.mode = 'canonical';
  if (!isPlainObject(pack)) { report.invalid.push('motionPack must be an object'); return Object.freeze(report); }
  if (![STUDIO_CHARACTER_MOTION_PACK_SCHEMA, LEGACY_STUDIO_CHARACTER_MOTION_PACK_SCHEMA].includes(pack.schema)) {
    report.invalid.push(`motionPack.schema must be ${STUDIO_CHARACTER_MOTION_PACK_SCHEMA}`);
  }
  if (!isPlainObject(pack.actionMap)) { report.invalid.push('motionPack.actionMap must be an object'); return Object.freeze(report); }
  const modern = /^1\.(?:[1-9]\d*)(?:\.|$)/.test(String(pack.version || ''));
  const required = modern
    ? ['idle', 'walk', 'run', 'jump', 'attack', 'hurt', 'dead', 'capture_throw', 'summon_monster_throw', 'monster_command']
    : STUDIO_CHARACTER_REQUIRED_MOTION_ACTIONS;
  const normal = value => String(value).trim().replace(/[\s-]+/g, '_').toLowerCase();
  if (pack.unsupportedActions != null && !isPlainObject(pack.unsupportedActions)) report.invalid.push('motionPack.unsupportedActions must be an object');
  for (const [action, reason] of Object.entries(isPlainObject(pack.unsupportedActions) ? pack.unsupportedActions : {})) {
    if (typeof reason !== 'string' || !reason.trim() || !/^[a-z][a-z0-9_-]{0,63}$/.test(action)) {
      report.invalid.push(`invalid unsupported action ${action}`); continue;
    }
    if (Object.keys(pack.actionMap).some(key => normal(key) === normal(action))) report.invalid.push(`unsupported action ${action} must not also be mapped`);
    report.unsupportedActions[normal(action)] = reason;
  }
  const checked = new Set();
  for (const [action, reference] of Object.entries(pack.actionMap)) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(action) || typeof reference !== 'string' || !reference.trim()) {
      report.invalid.push(`motionPack.actionMap.${action} must name a clip`); continue;
    }
    const clip = clips.find(c => c?.id === reference)
      || (pack.schema === STUDIO_CHARACTER_MOTION_PACK_SCHEMA ? clips.find(c => normalizedMotionState(c) === reference) : null);
    if (!clip) { report.invalid.push(`motionPack.actionMap.${action} references missing clip ${reference}`); continue; }
    if (!clipHasUsableKeyframes(clip)) {
      report.invalid.push(`motionPack.actionMap.${action} clip ${reference} needs at least two non-empty keyframes`); continue;
    }
    if (!checked.has(clip)) {
      checked.add(clip);
      let lastTime = -Infinity;
      for (const frame of clip.keyframes) {
        if (frame.time < lastTime || frame.time < 0 || frame.time > clip.duration) report.invalid.push(`clip ${clip.id} has invalid keyframe time`);
        lastTime = frame.time;
        for (const [joint, pose] of Object.entries(frame.joints)) {
          if (!pkg.rig?.jointBindings?.[joint]) report.invalid.push(`clip ${clip.id} references unbound joint ${joint}`);
          if (!isPlainObject(pose)) { report.invalid.push(`clip ${clip.id} has invalid pose ${joint}`); continue; }
          for (const [key, size] of [['position', 3], ['rotation', 3], ['scale', 3], ['quaternion', 4]]) {
            if (pose[key] != null && (!Array.isArray(pose[key]) || pose[key].length < size || !pose[key].slice(0, size).every(Number.isFinite))) {
              report.invalid.push(`clip ${clip.id} has invalid ${joint}.${key}`);
            }
          }
        }
      }
      if (!Number.isFinite(clip.duration) || clip.duration <= 0) report.invalid.push(`clip ${clip.id} has invalid duration`);
      if (clip.events != null && !Array.isArray(clip.events)) report.invalid.push(`clip ${clip.id} events must be an array`);
      for (const event of Array.isArray(clip.events) ? clip.events : []) {
        if (!Number.isFinite(event?.time) || event.time < 0 || event.time > clip.duration || typeof event.type !== 'string') {
          report.invalid.push(`clip ${clip.id} has invalid presentation event`);
        }
      }
    }
    if (report.actionMap[normal(action)] && report.actionMap[normal(action)] !== clip.id) report.invalid.push(`conflicting normalized action ${action}`);
    report.actionMap[action] = clip.id;
    report.actionMap[normal(action)] = clip.id;
  }
  for (const action of required) if (!report.actionMap[action]) report.missing.push(action);
  if (!report.actionMap[report.defaultAction]) report.invalid.push(`motionPack.defaultAction must name a mapped action (${report.defaultAction})`);
  return Object.freeze(report);
}

/** Validate actual mesh data, never just producer-reported statistics. */
function validateRenderableSceneGraph(root) {
  const errors = [];
  let renderableMeshes = 0;
  function visit(node, path, parentVisible = true) {
    if (!isPlainObject(node)) { errors.push(`sceneGraph.${path} must be an object`); return; }
    const visible = parentVisible && node.visible !== false;
    const scale = node.transform?.scale;
    if (visible && Array.isArray(scale) && (scale.length !== 3 || !scale.every(Number.isFinite) || scale.some(value => Math.abs(value) < 0.000001))) {
      errors.push(`sceneGraph.${path}.transform.scale must be a finite non-zero vec3 for a visible node`);
    }
    if (node.nodeType === 'mesh' && visible) {
      const position = node.geometry?.attributes?.position;
      const values = position?.array;
      const itemSize = Number(position?.itemSize);
      if (itemSize !== 3 || !isFiniteNumberArray(values, 9) || values.length % itemSize !== 0) {
        errors.push(`sceneGraph.${path}.geometry.attributes.position must contain at least three finite vec3 vertices`);
      } else {
        const vertexCount = values.length / itemSize;
        const index = node.geometry?.index;
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let offset = 0; offset < values.length; offset += itemSize) {
          for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis], values[offset + axis]);
            max[axis] = Math.max(max[axis], values[offset + axis]);
          }
        }
        const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
        if (!(extent > 0.000001)) errors.push(`sceneGraph.${path}.geometry.attributes.position must span non-zero geometry extent`);
        else if (index?.array && (!Array.isArray(index.array) || index.array.length < 3 || index.array.length % 3 !== 0
          || !index.array.every(value => Number.isInteger(value) && value >= 0 && value < vertexCount))) {
          errors.push(`sceneGraph.${path}.geometry.index must contain valid triangle indices`);
        } else renderableMeshes += 1;
      }
    }
    if (node.children != null && !Array.isArray(node.children)) { errors.push(`sceneGraph.${path}.children must be an array`); return; }
    for (const [index, child] of (node.children || []).entries()) visit(child, `${path}.children[${index}]`, visible);
  }
  visit(root, 'root');
  if (!renderableMeshes) errors.push('sceneGraph must contain at least one visible renderable mesh');
  return errors;
}
function validateRigReferences(pkg) {
  const errors = [], bindings = pkg.rig?.jointBindings || {}, root = pkg.sceneGraph?.root;
  for (const [name, binding] of Object.entries(bindings)) {
    if (!Array.isArray(binding?.path) || !nodeAtPath(root, binding.path)) errors.push(`rig.jointBindings.${name}.path does not resolve in sceneGraph.root`);
  }
  for (const name of ['rightHand', 'leftHand', 'head', 'back', 'waist', 'vfxOrigin', 'attackOrigin', 'throwOrigin']) {
    const joint = pkg.rig?.sockets?.[name]?.joint;
    if (typeof joint === 'string' && !bindings[joint]) errors.push(`rig.sockets.${name}.joint must reference a declared joint binding`);
  }
  return errors;
}
export function validateStudioCharacterPackage(pkg) {
  const errors = [], warnings = [];
  if (!isPlainObject(pkg)) return { valid: false, errors: ['package must be an object'], warnings };
  if (pkg.schema !== STUDIO_CHARACTER_PACKAGE_SCHEMA) errors.push(`schema must be ${STUDIO_CHARACTER_PACKAGE_SCHEMA}`);
  if (pkg.target?.game !== 'PocketMonster') errors.push('target.game must be PocketMonster');
  if (pkg.target?.assetEngine !== 'asset-presentation') errors.push('target.assetEngine must be asset-presentation');
  if (pkg.target?.provider !== STUDIO_CHARACTER_PROVIDER) errors.push(`target.provider must be ${STUDIO_CHARACTER_PROVIDER}`);
  if (pkg.manifest?.provider !== STUDIO_CHARACTER_PROVIDER) errors.push(`manifest.provider must be ${STUDIO_CHARACTER_PROVIDER}`);
  if (pkg.manifest?.contract !== 'presentation-only') errors.push('manifest.contract must be presentation-only');
  if (pkg.gameplayPolicy?.included !== false) errors.push('gameplayPolicy.included must be false');
  if (pkg.rig?.architecture !== 'THREE.Group') errors.push('rig.architecture must be THREE.Group');
  if (pkg.rig?.schema !== 'studio-rig-v1') errors.push('rig.schema must be studio-rig-v1');
  if (pkg.sceneGraph?.schema !== STUDIO_CHARACTER_SCENE_SCHEMA) errors.push(`sceneGraph.schema must be ${STUDIO_CHARACTER_SCENE_SCHEMA}`);
  if (!isPlainObject(pkg.sceneGraph?.root)) errors.push('sceneGraph.root missing');
  else errors.push(...validateRenderableSceneGraph(pkg.sceneGraph.root));
  if (!isPlainObject(pkg.catalogEntry)) errors.push('catalogEntry missing');
  else {
    errors.push(...validateAssetDefinition(pkg.catalogEntry).map(error => `catalogEntry: ${error}`));
    if (pkg.catalogEntry.provider !== STUDIO_CHARACTER_PROVIDER) errors.push(`catalogEntry.provider must be ${STUDIO_CHARACTER_PROVIDER}`);
    if (pkg.catalogEntry.id !== pkg.manifest?.id) errors.push('catalogEntry.id must match manifest.id');
  }
  errors.push(...validateJointBindings(pkg.rig?.jointBindings), ...validateRigReferences(pkg));
  for (const name of ['rightHand', 'leftHand', 'head', 'back', 'waist', 'vfxOrigin', 'attackOrigin', 'throwOrigin']) {
    if (!validSocket(pkg.rig?.sockets?.[name])) errors.push(`rig.sockets.${name} missing or invalid`);
  }
  const gameplayHits = [
    ...findGameplayFields(pkg).filter(path => !(['motionPack.actionMap.skill', 'motionPack.unsupportedActions.skill'].includes(path)
      && typeof (path.includes('unsupportedActions') ? pkg.motionPack?.unsupportedActions?.skill : pkg.motionPack?.actionMap?.skill) === 'string')),
    ...collectStudioGameplayFields(pkg),
  ];
  const uniqueHits = [...new Set(gameplayHits)];
  if (uniqueHits.length) errors.push(`gameplay fields are forbidden in Studio package: ${uniqueHits.slice(0, 8).join(', ')}`);
  if (!Array.isArray(pkg.animations)) errors.push('animations must be an array');
  const motion = inspectStudioCharacterMotionPack(pkg);
  const renderProfile = validateStudioCharacterRenderProfile(pkg.renderProfile);
  if (renderProfile.present && !renderProfile.valid) warnings.push(`renderProfile ignored: ${renderProfile.errors.join('; ')}`);
  const isDefaultLivePlayer = pkg.manifest?.id === STUDIO_CHARACTER_LIVE_PLAYER_ID;
  if (motion.mode === 'canonical') {
    errors.push(...motion.invalid);
    if (isDefaultLivePlayer) errors.push(...motion.missing.map(item => `default live player motionPack missing ${item}`));
    else if (motion.missing.length) warnings.push(`canonical motionPack is partial: missing ${motion.missing.join(', ')}`);
  } else if (isDefaultLivePlayer) errors.push(`default live player requires ${STUDIO_CHARACTER_MOTION_PACK_SCHEMA} with actionMap`);
  else warnings.push('legacy Studio package has no canonical motionPack; semantic clip lookup is diagnostic fallback only');
  if (!(pkg.sceneGraph?.stats?.meshes > 0)) warnings.push('sceneGraph reports no mesh nodes');
  if (pkg.sceneGraph?.stats?.externalTextureRefs > 0) warnings.push(`${pkg.sceneGraph.stats.externalTextureRefs} external texture reference(s) will use scalar PBR fallback until loaded`);
  return { valid: errors.length === 0, errors, warnings, motion, renderProfile };
}
export function resetStudioCharacterPackages() { packages.clear(); }
export function registerStudioCharacterPackage(pkg) {
  const result = validateStudioCharacterPackage(pkg);
  if (!result.valid) throw new Error(result.errors.join('; '));
  const id = pkg.manifest.id;
  packages.set(id, Object.freeze({ ...pkg }));
  return packages.get(id);
}
export function getStudioCharacterPackage(id) { return packages.get(id) || null; }
export function listStudioCharacterPackages() { return [...packages.keys()]; }
export function createStudioCharacterBundle(pkg, bundleName) {
  const registered = registerStudioCharacterPackage(pkg);
  return { name: bundleName || `studio-runtime:${registered.manifest.id}`, version: registered.schemaVersion || '1.0.0',
    assets: [{ ...registered.catalogEntry }], appearances: [] };
}
export async function loadStudioCharacterPackage(source) {
  const data = typeof source === 'string' ? await (await fetch(source)).json() : source?.data || source;
  return registerStudioCharacterPackage(data);
}
export async function installStudioCharacterPackage(engine, source, { bundleName } = {}) {
  if (!engine || typeof engine.preloadBundle !== 'function') throw new Error('installStudioCharacterPackage needs an AssetEngine');
  const pkg = typeof source === 'string' ? await (await fetch(source)).json() : source?.data || source;
  const bundle = createStudioCharacterBundle(pkg, bundleName);
  await engine.preloadBundle(bundle.name, bundle);
  return { package: getStudioCharacterPackage(pkg.manifest.id), bundleName: bundle.name };
}
