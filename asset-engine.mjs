// Asset loading, caching, and fallback. Procedural meshes stay the default.
// Three.js is injected at runtime — this module must stay importable in Node tests.

export const CACHE_LIMITS = Object.freeze({
  models: 20,
  textures: 50,
});

export const MANIFEST_CATEGORIES = Object.freeze([
  'models',
  'textures',
  'audio',
  'portraits',
  'fonts',
  'icons',
  'vfx',
]);

const GLTF_LOADER_URLS = Object.freeze([
  'https://cdn.jsdelivr.net/npm/three@0.179.1/examples/jsm/loaders/GLTFLoader.js',
  'https://unpkg.com/three@0.179.1/examples/jsm/loaders/GLTFLoader.js',
]);

class LruMap {
  constructor(limit) {
    this.limit = limit;
    this.map = new Map();
  }
  get size() {
    return this.map.size;
  }
  has(key) {
    return this.map.has(key);
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key, value, onEvict) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value;
      const evicted = this.map.get(oldest);
      this.map.delete(oldest);
      onEvict?.(oldest, evicted);
    }
    return value;
  }
  clear() {
    this.map.clear();
  }
  values() {
    return this.map.values();
  }
}

function emptyEntries() {
  return Object.fromEntries(MANIFEST_CATEGORIES.map(key => [key, {}]));
}

function normalizeManifest(data) {
  const entries = emptyEntries();
  const incoming = data?.entries && typeof data.entries === 'object' ? data.entries : {};
  for (const key of MANIFEST_CATEGORIES) {
    const group = incoming[key];
    entries[key] = group && typeof group === 'object' && !Array.isArray(group) ? { ...group } : {};
  }
  return {
    version: typeof data?.version === 'string' ? data.version : '1.0.0',
    generator: typeof data?.generator === 'string' ? data.generator : 'Monster Life RPG Asset Engine',
    entries,
  };
}

function warn(scope, err, extra = '') {
  const message = err?.message || String(err);
  console.warn(`[asset-engine] ${scope} failed${extra ? ` ${extra}` : ''}:`, message);
}

function disposeGltf(gltf) {
  gltf?.scene?.traverse?.(obj => {
    obj.geometry?.dispose?.();
    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
    else obj.material?.dispose?.();
  });
}

let THREE = null;
let fetchImpl = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;
let manifest = null;
const modelCache = new LruMap(CACHE_LIMITS.models);
const textureCache = new LruMap(CACHE_LIMITS.textures);
const audioCache = new Map();
const fontCache = new Set();
let textureLoader = null;

export function bindThree(three) {
  THREE = three || null;
  textureLoader = null;
}

export function bindFetch(fn) {
  fetchImpl = typeof fn === 'function' ? fn : null;
}

export function resetEngine() {
  clearCache();
  fontCache.clear();
  manifest = null;
  textureLoader = null;
}

export function emptyManifest() {
  return normalizeManifest({ version: '1.0.0', entries: emptyEntries() });
}

export async function loadManifest(url = './assets/manifest.json') {
  try {
    if (!fetchImpl) throw new Error('fetch unavailable');
    const res = await fetchImpl(url);
    if (!res?.ok) throw new Error(`manifest ${res?.status ?? 'unavailable'}`);
    manifest = normalizeManifest(await res.json());
    return manifest;
  } catch (err) {
    warn('manifest load', err);
    manifest = emptyManifest();
    return manifest;
  }
}

export function getManifest() {
  return manifest;
}

function getTextureLoader() {
  if (!THREE?.TextureLoader) return null;
  if (!textureLoader) {
    textureLoader = new THREE.TextureLoader();
    textureLoader.crossOrigin = 'anonymous';
  }
  return textureLoader;
}

async function defaultLoadGltf(url) {
  let lastError = null;
  for (const loaderUrl of GLTF_LOADER_URLS) {
    try {
      const { GLTFLoader } = await import(loaderUrl);
      const loader = new GLTFLoader();
      return await loader.loadAsync(url);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('GLTFLoader unavailable');
}

export async function loadModel(url, loader) {
  if (!url) return null;
  if (modelCache.has(url)) return modelCache.get(url);
  try {
    const gltf = loader ? await loader(url) : await defaultLoadGltf(url);
    if (!gltf) throw new Error('empty gltf');
    modelCache.set(url, gltf, (_key, evicted) => disposeGltf(evicted));
    return gltf;
  } catch (err) {
    warn('model load', err, url);
    return null;
  }
}

export function getCachedModel(url) {
  return modelCache.get(url) ?? null;
}

export async function loadTexture(url, loader) {
  if (!url) return null;
  if (textureCache.has(url)) return textureCache.get(url);
  try {
    const texture = loader
      ? await loader(url)
      : await getTextureLoader()?.loadAsync(url);
    if (!texture) throw new Error(THREE ? 'texture load empty' : 'THREE unbound');
    if (THREE?.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(url, texture, (_key, evicted) => evicted?.dispose?.());
    return texture;
  } catch (err) {
    warn('texture load', err, url);
    return null;
  }
}

export async function loadAudio(url, AudioCtor = globalThis.Audio) {
  if (!url) return null;
  if (audioCache.has(url)) return audioCache.get(url);
  try {
    if (typeof AudioCtor !== 'function') throw new Error('Audio unavailable');
    const audio = new AudioCtor(url);
    audio.preload = 'auto';
    await new Promise((resolve, reject) => {
      const fail = () => reject(new Error('audio load error'));
      audio.addEventListener('canplaythrough', resolve, { once: true });
      audio.addEventListener('error', fail, { once: true });
      setTimeout(() => reject(new Error('audio timeout')), 5000);
    });
    audioCache.set(url, audio);
    return audio;
  } catch (err) {
    warn('audio load', err, url);
    return null;
  }
}

export function playAudio(url, { volume = 0.5, loop = false } = {}) {
  const audio = audioCache.get(url);
  if (!audio) return false;
  try {
    audio.currentTime = 0;
    audio.volume = volume;
    audio.loop = loop;
    const played = audio.play?.();
    if (played && typeof played.catch === 'function') played.catch(() => {});
    return true;
  } catch (err) {
    warn('play', err, url);
    return false;
  }
}

export function stopAudio(url) {
  const audio = audioCache.get(url);
  if (!audio) return;
  audio.pause?.();
  audio.currentTime = 0;
}

export async function loadFont(name, url) {
  if (!name || !url) return false;
  if (fontCache.has(name)) return true;
  try {
    if (typeof FontFace !== 'function' || !globalThis.document?.fonts) {
      throw new Error('FontFace unavailable');
    }
    const fontFace = new FontFace(name, `url(${url})`);
    await fontFace.load();
    document.fonts.add(fontFace);
    fontCache.add(name);
    return true;
  } catch (err) {
    warn('font load', err, name);
    return false;
  }
}

export function resolveAssetPath(category, id, fallback = null) {
  const entry = manifest?.entries?.[category]?.[id];
  if (!entry) return fallback;
  return entry.url || fallback;
}

export function hasAsset(category, id) {
  return !!(manifest?.entries?.[category]?.[id]);
}

export function getCacheStats() {
  return {
    models: modelCache.size,
    textures: textureCache.size,
    audio: audioCache.size,
    fonts: fontCache.size,
  };
}

export function clearCache(category = null) {
  if (!category || category === 'models') {
    for (const gltf of modelCache.values()) disposeGltf(gltf);
    modelCache.clear();
  }
  if (!category || category === 'textures') {
    for (const tex of textureCache.values()) tex?.dispose?.();
    textureCache.clear();
  }
  if (!category || category === 'audio') {
    for (const audio of audioCache.values()) {
      audio.pause?.();
      audio.src = '';
    }
    audioCache.clear();
  }
  if (category === 'fonts') fontCache.clear();
}

export async function resolveMonsterModel(speciesId, formId = null, loader) {
  const key = formId || speciesId;
  const url = resolveAssetPath('models', key);
  if (!url) return null;
  const gltf = await loadModel(url, loader);
  if (!gltf) return null;
  return gltf.scene?.clone?.(true) ?? null;
}

export function resolvePortrait(speciesId) {
  return resolveAssetPath('portraits', speciesId);
}
