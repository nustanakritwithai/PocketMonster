import { assertValidBundle } from './schema.mjs';

const catalogs = new Map();

export function resetCatalog() {
  catalogs.clear();
}

export function loadCatalog(data, bundleName) {
  const bundle = assertValidBundle(data);
  const name = bundleName || bundle.name || 'humanoid-core';
  const assets = new Map((bundle.assets || []).map(def => [def.id, Object.freeze({ ...def })]));
  const appearances = new Map((bundle.appearances || []).map(def => [def.id, Object.freeze({ ...def })]));
  const record = Object.freeze({
    name,
    version: bundle.version || '1.0.0',
    assets,
    appearances,
  });
  catalogs.set(name, record);
  return record;
}

export function getCatalog(bundleName = 'humanoid-core') {
  return catalogs.get(bundleName) || null;
}

function lookup(mapName, id, bundleName) {
  if (bundleName) return catalogs.get(bundleName)?.[mapName].get(id) || null;
  for (const record of catalogs.values()) {
    const found = record[mapName].get(id);
    if (found) return found;
  }
  return null;
}

export function getAssetDef(id, bundleName) {
  return lookup('assets', id, bundleName);
}

export function getAppearance(id, bundleName) {
  return lookup('appearances', id, bundleName);
}

export function listBundle(bundleName = 'humanoid-core') {
  const record = catalogs.get(bundleName);
  if (!record) return { assets: [], appearances: [] };
  return {
    assets: [...record.assets.keys()],
    appearances: [...record.appearances.keys()],
  };
}

export function upsertAppearance(def, bundleName = 'humanoid-core') {
  const record = catalogs.get(bundleName);
  if (!record) throw new Error(`catalog ${bundleName} is not loaded`);
  record.appearances.set(def.id, Object.freeze({ ...def }));
  return getAppearance(def.id, bundleName);
}

export function resolvePublicRef(id, bundleName) {
  const asset = getAssetDef(id, bundleName);
  if (asset) return { kind: 'asset', id: asset.id, style: asset.style, provider: asset.provider };
  const appearance = getAppearance(id, bundleName);
  if (appearance) return { kind: 'appearance', id: appearance.id, style: appearance.style };
  return null;
}
