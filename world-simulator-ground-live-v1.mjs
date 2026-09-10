import { fetchWorldMapFrame } from './world-simulator-map-adapter-v1.mjs';
import { createWorldSimulatorGroundRenderer } from './world-simulator-ground-renderer-v1.mjs';

export const WORLD_GROUND_LIVE_SCHEMA = 'pocketmonster.world-ground-live.v1';
export const WORLD_GROUND_DEFAULT_ZONE = 'emerald-forest';
export const WORLD_GROUND_PACK_PATH = './assets/world-ground/material-pack-v1.json';

export function worldSimulatorGroundEnabled(runtimeConfig) {
  return Boolean(
    runtimeConfig?.featureFlags?.vpsEnabled
    && runtimeConfig?.featureFlags?.vpsReads
    && runtimeConfig?.featureFlags?.worldSimGround
    && runtimeConfig?.apiBaseUrl,
  );
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export function createWorldSimulatorGroundLive({
  THREE,
  scene,
  renderer,
  runtimeConfig,
  fallbackMesh = null,
  zoneId = WORLD_GROUND_DEFAULT_ZONE,
  quality = 'medium',
  fetchImpl = globalThis.fetch,
  materialPackUrl = WORLD_GROUND_PACK_PATH,
} = {}) {
  if (!THREE || !scene || !renderer) throw new TypeError('THREE, scene and renderer are required');
  const enabled = worldSimulatorGroundEnabled(runtimeConfig);
  const maxAnisotropy = Math.max(1, Number(renderer.capabilities?.getMaxAnisotropy?.()) || 1);
  const ground = createWorldSimulatorGroundRenderer({
    THREE,
    scene,
    quality,
    maxAnisotropy,
  });

  let disposed = false;
  let inFlight = null;
  let packPromise = null;
  let lastSuccessAt = null;
  let lastAttemptAt = null;
  let lastError = null;
  let refreshCount = 0;
  let packState = Object.freeze({ state: 'not-loaded', installed: false });

  function updateFallback() {
    if (!fallbackMesh) return;
    fallbackMesh.visible = !ground.getFrame();
  }
  updateFallback();

  async function loadMaterialPack() {
    if (!enabled || disposed || packPromise) return packPromise;
    if (typeof fetchImpl !== 'function') return null;
    packPromise = (async () => {
      try {
        const response = await fetchImpl(new URL(materialPackUrl, import.meta.url), {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!response?.ok) {
          packState = Object.freeze({ state: 'missing', installed: false, status: response?.status ?? null });
          return packState;
        }
        const manifest = await response.json();
        if (manifest?.installed !== true) {
          packState = Object.freeze({
            state: 'declared',
            installed: false,
            source: manifest?.source || null,
            license: manifest?.license || null,
          });
          return packState;
        }
        const result = await ground.loadMaterialPack(manifest, { baseUrl: new URL(materialPackUrl, import.meta.url) });
        packState = Object.freeze({ ...result, installed: result.loaded > 0 });
        return packState;
      } catch (error) {
        packState = Object.freeze({ state: 'fallback', installed: false, error: String(error?.message || error) });
        return packState;
      }
    })();
    return packPromise;
  }

  async function refresh() {
    if (disposed) throw new Error('World Simulator ground live controller has been disposed');
    if (!enabled) {
      updateFallback();
      return Object.freeze({ state: 'disabled', frame: ground.getFrame() });
    }
    if (inFlight) return inFlight;
    lastAttemptAt = nowMs();
    refreshCount += 1;
    inFlight = (async () => {
      try {
        const frame = await fetchWorldMapFrame({
          baseUrl: runtimeConfig.apiBaseUrl,
          zoneId,
          fetchImpl,
        });
        if (disposed) return Object.freeze({ state: 'disposed', frame: null });
        ground.setFrame(frame);
        lastSuccessAt = nowMs();
        lastError = null;
        updateFallback();
        void loadMaterialPack();
        return Object.freeze({ state: 'ready', frame });
      } catch (error) {
        lastError = String(error?.message || error);
        updateFallback();
        return Object.freeze({
          state: ground.getFrame() ? 'stale' : 'fallback',
          frame: ground.getFrame(),
          error: lastError,
        });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  function diagnostics() {
    return Object.freeze({
      schema: WORLD_GROUND_LIVE_SCHEMA,
      enabled,
      zoneId,
      apiBaseUrl: enabled ? runtimeConfig.apiBaseUrl : '',
      state: disposed
        ? 'disposed'
        : !enabled
          ? 'disabled'
          : ground.getFrame()
            ? lastError ? 'stale' : 'ready'
            : lastError ? 'fallback' : 'idle',
      refreshCount,
      inFlight: Boolean(inFlight),
      lastAttemptAt,
      lastSuccessAt,
      lastError,
      fallbackVisible: Boolean(fallbackMesh?.visible),
      materialPack: packState,
      renderer: ground.diagnostics(),
      presentationOnly: true,
    });
  }

  return Object.freeze({
    enabled,
    ground,
    refresh,
    loadMaterialPack,
    diagnostics,
    dispose() {
      if (disposed) return false;
      disposed = true;
      ground.dispose();
      if (fallbackMesh) fallbackMesh.visible = true;
      return true;
    },
  });
}
