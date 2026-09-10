export const PRODUCT_RELEASE_VERSION = '9.0.1';
export const PRODUCT_RELEASE_LABEL = 'V9.0';

// Transitional compatibility identity. The live V9 shell still hosts the
// legacy Pocket Monster gameplay runtime and the current MonsterLife server
// contract still identifies that gameplay client as 8.4.0. Do not reuse this
// value for UI/release naming.
export const LEGACY_GAMEPLAY_RUNTIME_VERSION = '8.4.0';
export const GAME_API_COMPAT_VERSION = LEGACY_GAMEPLAY_RUNTIME_VERSION;
export const LEGACY_ASSET_REVISION = '814';

export const COMBINED_RUNTIME_VERSION = `${PRODUCT_RELEASE_VERSION}-unified-online-shell`;
export const ONLINE_SHELL_RUNTIME_VERSION = `${PRODUCT_RELEASE_VERSION}-persistent-shell`;
export const LIVING_WORLD_RUNTIME_VERSION = `${PRODUCT_RELEASE_VERSION}-living-world-portal`;

// These are known migration debts, not the desired architecture. Keeping them
// in one manifest makes the remaining old/new layering explicit and searchable
// instead of letting each module invent its own meaning of "version".
export const VERSION_DEBT = Object.freeze({
  activeEntry: 'entry-preload-v900.mjs',
  legacyGameplayRuntime: 'game-v800.js',
  legacyBaseStylesheet: 'style-v800.css',
  versionedShellStylesheet: 'style-v900.css',
  legacyStandaloneEntry: 'v800.html',
  duplicateVersionedEntry: 'v900.html',
  prototypeRuntime: 'game-v900.js',
});

export const VERSION_POLICY = Object.freeze({
  releaseVersion: PRODUCT_RELEASE_VERSION,
  apiCompatibilityVersion: GAME_API_COMPAT_VERSION,
  assetRevision: LEGACY_ASSET_REVISION,
  rule: 'version-is-metadata-not-runtime-filename',
});
