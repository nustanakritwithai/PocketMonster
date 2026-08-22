export const GAMEPLAY_FORBIDDEN_FIELDS = Object.freeze([
  'hp', 'atk', 'def', 'spd', 'speed', 'collider', 'capture', 'captureChance',
  'skill', 'interactionRadius', 'save', 'savePayload',
]);

export const REQUIRED_ASSET_FIELDS = Object.freeze([
  'id', 'kind', 'provider', 'style', 'surfaceStyle', 'rig', 'metrics', 'roles',
]);

export const ALLOWED_KINDS = Object.freeze(['character', 'monster']);
export const ALLOWED_PROVIDERS = Object.freeze(['procedural', 'gltf', 'legacy']);
export const CHARACTER_ROLES = Object.freeze(['player', 'keeper', 'merchant', 'trainer', 'evolution']);
export const MONSTER_ROLES = Object.freeze(['wild', 'owned', 'boss', 'elite']);
export const ALLOWED_ROLES = Object.freeze([...CHARACTER_ROLES, ...MONSTER_ROLES]);
export const ALLOWED_LIFE_STAGES = Object.freeze(['Baby', 'Juvenile', 'Adult', 'Mature']);
export const MONSTER_ID_RE = /^monster\.[a-z0-9_]+\.[a-z0-9_]+\.bighead\.v1$/;
export const CHARACTER_ID_RE = /^character\./;
export const MONSTER_EXTRA_FIELDS = Object.freeze(['speciesId', 'type', 'form', 'color']);

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
  if (def.kind && !ALLOWED_KINDS.includes(def.kind)) errors.push('kind must be character or monster');
  if (def.provider && !ALLOWED_PROVIDERS.includes(def.provider)) {
    errors.push(`unsupported provider ${def.provider}`);
  }
  if (def.kind === 'monster' && def.id && !MONSTER_ID_RE.test(def.id)) {
    errors.push('monster id must match monster.{form}.{species}.bighead.v1');
  }
  if (def.kind === 'character' && def.id && !CHARACTER_ID_RE.test(def.id)) {
    errors.push('character id must start with character.');
  }
  if (def.kind === 'monster') {
    for (const field of MONSTER_EXTRA_FIELDS) {
      if (def[field] == null) errors.push(`missing ${field}`);
    }
    if (def.color != null && !Number.isInteger(def.color)) errors.push('color must be a number');
    if (def.style && def.style !== 'blocky-bighead-v1') errors.push('monster style must be blocky-bighead-v1');
    if (def.surfaceStyle && def.surfaceStyle !== 'four-side-block-v1') {
      errors.push('monster surfaceStyle must be four-side-block-v1');
    }
    if (def.form && def.speciesId && def.id && def.id !== `monster.${def.form}.${def.speciesId}.bighead.v1`) {
      errors.push('monster id must match monster.{form}.{species}.bighead.v1');
    }
  }
  if (!isPlainObject(def.metrics)) errors.push('metrics must be an object');
  if (!isPlainObject(def.roles)) errors.push('roles must be an object');
  else {
    const rolesForKind = def.kind === 'monster' ? MONSTER_ROLES : CHARACTER_ROLES;
    for (const role of Object.keys(def.roles)) {
      if (!rolesForKind.includes(role)) errors.push(`unsupported role ${role} for ${def.kind || 'character'}`);
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
