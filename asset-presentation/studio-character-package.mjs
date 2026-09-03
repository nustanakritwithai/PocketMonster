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

  if (!isPlainObject(pkg.catalogEntry)) errors.push('catalogEntry missing');
  else errors.push(...validateAssetDefinition(pkg.catalogEntry).map(error => `catalogEntry: ${error}`));

  errors.push(...validateJointBindings(pkg.rig?.jointBindings));
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
