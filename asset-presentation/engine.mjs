import { loadCatalog, getAssetDef, listBundle } from './catalog.mjs';
import { assertAssetHandle } from './handle-contract.mjs';
import { normalizeAssetRequest } from './requests.mjs';
import { sharedSize } from './ownership.mjs';

export function createAssetEngine({ THREE = null, quality = 'medium' } = {}) {
  const providers = new Map();
  const spawned = new Set();

  function registerProvider(name, factory) {
    if (typeof name !== 'string' || typeof factory !== 'function') {
      throw new Error('registerProvider(name, factory) required');
    }
    providers.set(name, factory);
    return engine;
  }

  async function preloadBundle(name, source) {
    const data = typeof source === 'string'
      ? await (await fetch(source)).json()
      : (source?.data || source);
    return loadCatalog(data, name);
  }

  function spawn(assetId, request = {}) {
    const req = normalizeAssetRequest({ ...request, assetId });
    const def = getAssetDef(req.assetId);
    if (!def) throw new Error(`unknown asset ${req.assetId}`);
    const factory = providers.get(def.provider);
    if (!factory) throw new Error(`no provider registered for ${def.provider}`);
    const handle = assertAssetHandle(factory({
      def,
      request: req,
      THREE,
      quality: req.quality || quality,
    }));
    spawned.add(handle);
    return handle;
  }

  function diagnostics() {
    return {
      providers: [...providers.keys()],
      spawned: spawned.size,
      shared: sharedSize(),
      bundle: listBundle(),
    };
  }

  const engine = {
    registerProvider,
    preloadBundle,
    spawn,
    diagnostics,
  };
  return engine;
}
