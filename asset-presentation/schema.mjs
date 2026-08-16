export const GAMEPLAY_FORBIDDEN_FIELDS = Object.freeze([
  'hp', 'atk', 'def', 'spd', 'speed', 'collider', 'capture', 'captureChance',
  'skill', 'interactionRadius', 'save', 'savePayload',
]);

export const REQUIRED_ASSET_FIELDS = Object.freeze([
  'id', 'kind', 'provider', 'style', 'surfaceStyle', 'rig', 'metrics', 'roles',
]);

export const ALLOWED_ROLES = Object.freeze(['player', 'keeper']);

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function collectKeys(value, prefix = '', into = []) {
  if (!isPlainObject(value)) return into;
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    into.push(path);
    collectKeys(child, path, into);
  }
  return into;
}

export function findGameplayFields(value) {
  const hits = [];
  for (const path of collectKeys(value)) {
    const leaf = path.split('.').pop();
    if (GAMEPLAY_FORBIDDEN_FIELDS.includes(leaf)) hits.push(path);
  }
  return hits;
}

export function validateAssetDefinition(def) {
  const errors = [];
  if (!isPlainObject(def)) return ['asset definition must be an object'];
  for (const field of REQUIRED_ASSET_FIELDS) {
    if (def[field] == null) errors.push(`missing ${field}`);
  }
  if (def.kind && def.kind !== 'character') errors.push('kind must be character in this phase');
  if (def.provider && !['procedural', 'gltf', 'legacy'].includes(def.provider)) {
    errors.push(`unsupported provider ${def.provider}`);
  }
  if (!isPlainObject(def.metrics)) errors.push('metrics must be an object');
  if (!isPlainObject(def.roles)) errors.push('roles must be an object');
  else {
    for (const role of Object.keys(def.roles)) {
      if (!ALLOWED_ROLES.includes(role)) errors.push(`unsupported role ${role}`);
    }
  }
  errors.push(...findGameplayFields(def).map(path => `gameplay field not allowed: ${path}`));
  return errors;
}

export function validateAppearanceDefinition(def) {
  const errors = [];
  if (!isPlainObject(def)) return ['appearance definition must be an object'];
  if (typeof def.id !== 'string' || !def.id) errors.push('missing id');
  if (def.style && def.style !== 'four-side-block-v1') errors.push('appearance style must be four-side-block-v1');
  if (def.mode && !['single', 'four', 'strip', 'fallback'].includes(def.mode)) {
    errors.push(`unsupported appearance mode ${def.mode}`);
  }
  errors.push(...findGameplayFields(def).map(path => `gameplay field not allowed: ${path}`));
  return errors;
}

export function validateBundle(bundle) {
  const errors = [];
  if (!isPlainObject(bundle)) return ['bundle must be an object'];
  const assets = Array.isArray(bundle.assets) ? bundle.assets : [];
  const appearances = Array.isArray(bundle.appearances) ? bundle.appearances : [];
  const seen = new Set();
  for (const def of [...assets, ...appearances]) {
    const id = def?.id;
    if (typeof id === 'string' && id) {
      if (seen.has(id)) errors.push(`duplicate id ${id}`);
      seen.add(id);
    }
  }
  for (const def of assets) errors.push(...validateAssetDefinition(def).map(e => `${def?.id || 'asset'}: ${e}`));
  for (const def of appearances) errors.push(...validateAppearanceDefinition(def).map(e => `${def?.id || 'appearance'}: ${e}`));
  errors.push(...findGameplayFields(bundle).map(path => `gameplay field not allowed: ${path}`));
  return errors;
}

export function assertValidBundle(bundle) {
  const errors = validateBundle(bundle);
  if (errors.length) throw new Error(errors.join('; '));
  return bundle;
}
