import { findGameplayFields, validateAssetDefinition } from './schema.mjs';

export const STUDIO_CHARACTER_PACKAGE_SCHEMA = 'pocket-character-runtime-v1';
export const STUDIO_CHARACTER_SCENE_SCHEMA = 'three-group-scenegraph-v1';
export const STUDIO_CHARACTER_PROVIDER = 'studio-character';

export const STUDIO_CHARACTER_FORBIDDEN_FIELDS = Object.freeze([
  'hp', 'hpCurrent', 'hpMax', 'atk', 'def', 'spAtk', 'spDef', 'spd',
  'vitality', 'combat', 'blade', 'ranged', 'fruitPower', 'mastery',
  'mana', 'coins', 'capture', 'save', 'level', 'exp', 'experience', 'damage',
]);

const packages = new Map();
const normalizedForbidden = new Set(
  STUDIO_CHARACTER_FORBIDDEN_FIELDS.map(key => normalizeKey(key)),
);

function normalizeKey(key) {
  return String(key || '').replace(/[_-]/g, '').toLowerCase();
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function collectStudioGameplayFields(value, prefix = '$', hits = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStudioGameplayFields(item, `${prefix}[${index}]`, hits));
    return hits;
  }
  if (!isPlainObject(value)) return hits;
  for (const [key, child] of Object.entries(value)) {
    const path = `${prefix}.${key}`;
    if (normalizedForbidden.has(normalizeKey(key))) hits.push(path);
    collectStudioGameplayFields(child, path, hits);
  }
  return hits;
}

function validSocket(socket) {
  return isPlainObject(socket)
    && typeof socket.joint === 'string'
    && Array.isArray(socket.offset)
    && socket.offset.length === 3
    && socket.offset.every(Number.isFinite);
}

function validateJointBindings(bindings) {
  if (!isPlainObject(bindings) || !Object.keys(bindings).length) {
    return ['rig.jointBindings must be a non-empty object'];
  }
  const errors = [];
  for (const [name, binding] of Object.entries(bindings)) {
    if (!isPlainObject(binding)) {
      errors.push(`rig.jointBindings.${name} must be an object`);
      continue;
    }
    if (!Array.isArray(binding.path) || !binding.path.every(Number.isInteger)) {
      errors.push(`rig.jointBindings.${name}.path must be an integer array`);
    }
  }
  return errors;
}

function nodeAtPath(root, path) {
  let node = root;
  for (const index of path) {
    node = node?.children?.[index];
    if (!node) return null;
  }
  return node || null;
}

function isFiniteNumberArray(value, minimumLength = 0) {
  return Array.isArray(value) && value.length >= minimumLength && value.every(Number.isFinite);
}

/**
 * A package is only safe to replace the existing Pirate visual when it has at
 * least one mesh that the provider can actually construct and render.  The
 * previous validator trusted producer-provided stats, so an empty scene graph
 * could be accepted, installed, and then hide the working fallback visual.
 */
function validateRenderableSceneGraph(root) {
  const errors = [];
  let renderableMeshes = 0;

  function visit(node, path, parentVisible = true) {
    if (!isPlainObject(node)) {
      errors.push(`sceneGraph.${path} must be an object`);
      return;
    }
    const visible = parentVisible && node.visible !== false;
    const scale = node.transform?.scale;
    if (visible && Array.isArray(scale) && (
      scale.length !== 3 || !scale.every(Number.isFinite) || scale.some(value => Math.abs(value) < 0.000001)
    )) {
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
        if (index?.array && (!Array.isArray(index.array)
          || index.array.length < 3
          || index.array.length % 3 !== 0
          || !index.array.every(value => Number.isInteger(value) && value >= 0 && value < vertexCount))) {
          errors.push(`sceneGraph.${path}.geometry.index must contain valid triangle indices`);
        } else {
          renderableMeshes += 1;
        }
      }
    }

    if (node.children != null && !Array.isArray(node.children)) {
      errors.push(`sceneGraph.${path}.children must be an array`);
      return;
    }
    for (const [index, child] of (node.children || []).entries()) {
      visit(child, `${path}.children[${index}]`, visible);
    }
  }

  visit(root, 'root');
  if (!renderableMeshes) errors.push('sceneGraph must contain at least one visible renderable mesh');
  return errors;
}

function validateRigReferences(pkg) {
  const errors = [];
  const bindings = pkg.rig?.jointBindings || {};
  const root = pkg.sceneGraph?.root;
  for (const [name, binding] of Object.entries(bindings)) {
    if (!Array.isArray(binding?.path) || !nodeAtPath(root, binding.path)) {
      errors.push(`rig.jointBindings.${name}.path does not resolve in sceneGraph.root`);
    }
  }
  for (const name of ['rightHand', 'leftHand', 'head', 'back', 'waist', 'vfxOrigin', 'attackOrigin', 'throwOrigin']) {
    const joint = pkg.rig?.sockets?.[name]?.joint;
    if (typeof joint === 'string' && !bindings[joint]) {
      errors.push(`rig.sockets.${name}.joint must reference a declared joint binding`);
    }
  }
  return errors;
}

export function validateStudioCharacterPackage(pkg) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(pkg)) return { valid: false, errors: ['package must be an object'], warnings };

  if (pkg.schema !== STUDIO_CHARACTER_PACKAGE_SCHEMA) {
    errors.push(`schema must be ${STUDIO_CHARACTER_PACKAGE_SCHEMA}`);
  }
  if (pkg.target?.game !== 'PocketMonster') errors.push('target.game must be PocketMonster');
  if (pkg.target?.assetEngine !== 'asset-presentation') errors.push('target.assetEngine must be asset-presentation');
  if (pkg.target?.provider !== STUDIO_CHARACTER_PROVIDER) errors.push(`target.provider must be ${STUDIO_CHARACTER_PROVIDER}`);
  if (pkg.manifest?.provider !== STUDIO_CHARACTER_PROVIDER) errors.push(`manifest.provider must be ${STUDIO_CHARACTER_PROVIDER}`);
  if (pkg.manifest?.contract !== 'presentation-only') errors.push('manifest.contract must be presentation-only');
  if (pkg.gameplayPolicy?.included !== false) errors.push('gameplayPolicy.included must be false');
  if (pkg.rig?.architecture !== 'THREE.Group') errors.push('rig.architecture must be THREE.Group');
  if (pkg.rig?.schema !== 'studio-rig-v1') errors.push('rig.schema must be studio-rig-v1');
  if (pkg.sceneGraph?.schema !== STUDIO_CHARACTER_SCENE_SCHEMA) {
    errors.push(`sceneGraph.schema must be ${STUDIO_CHARACTER_SCENE_SCHEMA}`);
  }
  if (!isPlainObject(pkg.sceneGraph?.root)) errors.push('sceneGraph.root missing');
  else errors.push(...validateRenderableSceneGraph(pkg.sceneGraph.root));

  if (!isPlainObject(pkg.catalogEntry)) errors.push('catalogEntry missing');
  else {
    errors.push(...validateAssetDefinition(pkg.catalogEntry).map(error => `catalogEntry: ${error}`));
    if (pkg.catalogEntry.provider !== STUDIO_CHARACTER_PROVIDER) {
      errors.push(`catalogEntry.provider must be ${STUDIO_CHARACTER_PROVIDER}`);
    }
    if (pkg.catalogEntry.id !== pkg.manifest?.id) errors.push('catalogEntry.id must match manifest.id');
  }

  errors.push(...validateJointBindings(pkg.rig?.jointBindings));
  errors.push(...validateRigReferences(pkg));
  for (const name of ['rightHand', 'leftHand', 'head', 'back', 'waist', 'vfxOrigin', 'attackOrigin', 'throwOrigin']) {
    if (!validSocket(pkg.rig?.sockets?.[name])) errors.push(`rig.sockets.${name} missing or invalid`);
  }

  const gameplayHits = [
    ...findGameplayFields(pkg),
    ...collectStudioGameplayFields(pkg),
  ];
  const uniqueHits = [...new Set(gameplayHits)];
  if (uniqueHits.length) {
    errors.push(`gameplay fields are forbidden in Studio package: ${uniqueHits.slice(0, 8).join(', ')}`);
  }

  if (!Array.isArray(pkg.animations)) errors.push('animations must be an array');
  if (!(pkg.sceneGraph?.stats?.meshes > 0)) warnings.push('sceneGraph reports no mesh nodes');
  if (pkg.sceneGraph?.stats?.externalTextureRefs > 0) {
    warnings.push(`${pkg.sceneGraph.stats.externalTextureRefs} external texture reference(s) will use scalar PBR fallback until loaded`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function resetStudioCharacterPackages() {
  packages.clear();
}

export function registerStudioCharacterPackage(pkg) {
  const result = validateStudioCharacterPackage(pkg);
  if (!result.valid) throw new Error(result.errors.join('; '));
  const id = pkg.manifest.id;
  packages.set(id, Object.freeze({ ...pkg }));
  return packages.get(id);
}

export function getStudioCharacterPackage(id) {
  return packages.get(id) || null;
}

export function listStudioCharacterPackages() {
  return [...packages.keys()];
}

export function createStudioCharacterBundle(pkg, bundleName) {
  const registered = registerStudioCharacterPackage(pkg);
  return {
    name: bundleName || `studio-runtime:${registered.manifest.id}`,
    version: registered.schemaVersion || '1.0.0',
    assets: [{ ...registered.catalogEntry }],
    appearances: [],
  };
}

export async function loadStudioCharacterPackage(source) {
  const data = typeof source === 'string'
    ? await (await fetch(source)).json()
    : source?.data || source;
  return registerStudioCharacterPackage(data);
}

export async function installStudioCharacterPackage(engine, source, { bundleName } = {}) {
  if (!engine || typeof engine.preloadBundle !== 'function') {
    throw new Error('installStudioCharacterPackage needs an AssetEngine');
  }
  const pkg = typeof source === 'string'
    ? await (await fetch(source)).json()
    : source?.data || source;
  const bundle = createStudioCharacterBundle(pkg, bundleName);
  await engine.preloadBundle(bundle.name, bundle);
  return { package: getStudioCharacterPackage(pkg.manifest.id), bundleName: bundle.name };
}
