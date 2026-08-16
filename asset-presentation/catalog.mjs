import { assertValidBundle } from './schema.mjs';

const catalogs = new Map();

export function resetCatalog() {
  catalogs.clear();
}

export function loadCatalog(data, bundleName = 'humanoid-core') {
  const bundle = assertValidBundle(data);
  const assets = new Map((bundle.assets || []).map(def => [def.id, Object.freeze({ ...def })]));
  const appearances = new Map((bundle.appearances || []).map(def => [def.id, Object.freeze({ ...def })]));
  const record = Object.freeze({
    name: bundleName,
    version: bundle.version || '1.0.0',
    assets,
    appearances,
  });
  catalogs.set(bundleName, record);
  return record;
}

export function getCatalog(bundleName = 'humanoid-core') {
  return catalogs.get(bundleName) || null;
}

export function getAssetDef(id, bundleName = 'humanoid-core') {
  return catalogs.get(bundleName)?.assets.get(id) || null;
}

export function getAppearance(id, bundleName = 'humanoid-core') {
  return catalogs.get(bundleName)?.appearances.get(id) || null;
}

export function listBundle(bundleName = 'humanoid-core') {
  const record = catalogs.get(bundleName);
  if (!record) return { assets: [], appearances: [] };
  return {
    assets: [...record.assets.keys()],
    appearances: [...record.appearances.keys()],
  };
}

export function resolvePublicRef(id, bundleName = 'humanoid-core') {
  const asset = getAssetDef(id, bundleName);
  if (asset) return { kind: 'asset', id: asset.id, style: asset.style, provider: asset.provider };
  const appearance = getAppearance(id, bundleName);
  if (appearance) return { kind: 'appearance', id: appearance.id, style: appearance.style };
  return null;
}
