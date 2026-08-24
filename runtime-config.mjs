/**
 * Goal 1 runtime configuration.
 *
 * The checked-in values are deliberately safe defaults.  A deployment may
 * provide runtime-config.json (or window.__POCKETMONSTER_RUNTIME_MANIFEST__)
 * to override URLs and release metadata without rebuilding the client.
 */
export const BUILD_RUNTIME_CONFIG = Object.freeze({
  configVersion: 1,
  environment: 'firebase-only',
  apiBaseUrl: '',
  webSocketUrl: '',
  healthPath: '/api/health',
  versionPath: '/api/version',
  apiVersion: '1.1',
  minimumClientVersion: '8.3.0',
  saveSchemaVersion: 1,
  deployedRelease: '',
  manifestPath: './runtime-config.json',
  featureFlags: Object.freeze({
    vpsEnabled: false,
    vpsReads: false,
    vpsWrites: false,
    playerDataWrites: false,
    accountMigration: false,
    saveMigration: false,
    economyMutation: false,
    firebaseFallback: true,
    firebaseAuthBridge: false,
    accountLinking: false,
    profileReads: false,
  }),
});

const URL_KEYS = new Set(['apiBaseUrl', 'webSocketUrl']);
const FLAG_KEYS = Object.keys(BUILD_RUNTIME_CONFIG.featureFlags);

function cleanUrl(value, key) {
  if (typeof value !== 'string') return BUILD_RUNTIME_CONFIG[key];
  if (!value) return '';
  try {
    const parsed = new URL(value, 'https://runtime.invalid');
    if (key === 'webSocketUrl' && !['ws:', 'wss:', 'https:'].includes(parsed.protocol)) return BUILD_RUNTIME_CONFIG[key];
    if (key === 'apiBaseUrl' && !['http:', 'https:'].includes(parsed.protocol) && parsed.origin !== 'https://runtime.invalid') return BUILD_RUNTIME_CONFIG[key];
    return value.replace(/\/$/, '');
  } catch { return BUILD_RUNTIME_CONFIG[key]; }
}

function normalizeManifest(manifest = {}) {
  const source = manifest && typeof manifest === 'object' ? manifest : {};
  const config = { ...BUILD_RUNTIME_CONFIG };
  for (const key of ['configVersion', 'environment', 'apiVersion', 'minimumClientVersion', 'saveSchemaVersion', 'deployedRelease', 'manifestPath', 'healthPath', 'versionPath']) {
    if (source[key] !== undefined) config[key] = source[key];
  }
  for (const key of URL_KEYS) config[key] = cleanUrl(source[key], key);
  config.firebase = source.firebase && typeof source.firebase === 'object' ? Object.freeze({ ...source.firebase }) : undefined;
  config.featureFlags = { ...BUILD_RUNTIME_CONFIG.featureFlags };
  if (source.featureFlags && typeof source.featureFlags === 'object') {
    for (const key of FLAG_KEYS) if (typeof source.featureFlags[key] === 'boolean') config.featureFlags[key] = source.featureFlags[key];
  }
  // Goal 1 is read-only.  A future goal must explicitly change this contract.
  config.featureFlags.vpsWrites = false;
  config.featureFlags.playerDataWrites = false;
  config.featureFlags.accountMigration = false;
  config.featureFlags.saveMigration = false;
  config.featureFlags.economyMutation = false;
  config.featureFlags.firebaseFallback = true;
  if (!config.featureFlags.vpsEnabled || !config.featureFlags.vpsReads) {
    config.featureFlags.firebaseAuthBridge = false;
    config.featureFlags.accountLinking = false;
    config.featureFlags.profileReads = false;
  }
  config.canWritePlayerData = false;
  return Object.freeze({ ...config, featureFlags: Object.freeze(config.featureFlags) });
}

export function validateRuntimeManifest(manifest) {
  const config = normalizeManifest(manifest);
  const errors = [];
  if (config.configVersion !== 1) errors.push('unsupported configVersion');
  if (!['firebase-only', 'hybrid', 'vps-readonly'].includes(config.environment)) errors.push('invalid environment');
  if (!Number.isInteger(config.saveSchemaVersion) || config.saveSchemaVersion < 1) errors.push('invalid saveSchemaVersion');
  if (!config.healthPath || !config.versionPath) errors.push('health/version path is required');
  return { valid: errors.length === 0, errors, config };
}

export async function loadRuntimeConfig({ fetchImpl = globalThis.fetch, manifest, manifestUrl, locationHref } = {}) {
  let source = manifest;
  if (source === undefined && globalThis.window?.__POCKETMONSTER_RUNTIME_MANIFEST__) source = globalThis.window.__POCKETMONSTER_RUNTIME_MANIFEST__;
  if (source === undefined && typeof fetchImpl === 'function') {
    const path = manifestUrl || BUILD_RUNTIME_CONFIG.manifestPath;
    try {
      const base = locationHref || globalThis.location?.href || 'https://runtime.invalid/';
      const response = await fetchImpl(new URL(path, base), { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (response.ok) source = await response.json();
    } catch { /* checked-in defaults are the safe fallback */ }
  }
  const result = validateRuntimeManifest(source || {});
  return Object.freeze({ ...result.config, manifestValid: result.valid, manifestErrors: Object.freeze(result.errors) });
}

export function runtimeWritePolicy(config) {
  return Object.freeze({ playerDataWrites: false, accountMigration: false, saveMigration: false, economyMutation: false, enabled: Boolean(config?.featureFlags?.vpsWrites && config?.canWritePlayerData) });
}
