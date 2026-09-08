// Presentation-only consumer. Never creates a renderer, scene light or gameplay command.
export const STUDIO_CHARACTER_RENDER_PROFILE_SCHEMA = 'pocket-character-render-profile-v1';
export const STUDIO_CHARACTER_RENDER_TEXTURE_SLOTS = Object.freeze([
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap',
]);
const SLOT_SET = new Set(STUDIO_CHARACTER_RENDER_TEXTURE_SLOTS);
const MAX_TEXTURE_BYTES = 16 * 1024 * 1024;
const textureCache = new Map(); // Verified bytes only, never mutable GPU textures.
const TRUSTED_STUDIO_ORIGINS = ['https://nustanakritwithai.github.io'];
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
let cachedBytes = 0;
function plainObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function finiteArray(value, length) { return Array.isArray(value) && value.length === length && value.every(Number.isFinite); }
function sha256(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null; }
function safeUrl(source) { try { return new URL(source); } catch { return null; } }
export function validateStudioCharacterRenderProfile(profile) {
  const errors = [], warnings = [];
  if (profile == null) return Object.freeze({ present: false, valid: true, errors, warnings, textureCount: 0 });
  if (!plainObject(profile)) return Object.freeze({ present: true, valid: false, errors: ['renderProfile must be an object'], warnings, textureCount: 0 });
  if (profile.schema !== STUDIO_CHARACTER_RENDER_PROFILE_SCHEMA) errors.push(`renderProfile.schema must be ${STUDIO_CHARACTER_RENDER_PROFILE_SCHEMA}`);
  if (profile.mode !== 'metadata-only-host-applied') errors.push('renderProfile.mode must be metadata-only-host-applied');
  if (profile.lightingProfile?.createsRenderer === true || profile.lightingProfile?.createsLights === true) errors.push('renderProfile cannot request renderer or light creation');
  const allowedOrigins = profile.sourcePolicy?.allowlistedOrigins;
  if (!profile.sourcePolicy?.sameOriginHttpsOnly || !Array.isArray(allowedOrigins) || !allowedOrigins.length) errors.push('renderProfile sourcePolicy must declare same-origin HTTPS allowlist');
  const originSet = new Set();
  for (const origin of Array.isArray(allowedOrigins) ? allowedOrigins : []) {
    const url = safeUrl(origin);
    if (!url || url.protocol !== 'https:' || url.href !== `${url.origin}/`) errors.push(`invalid allowlisted origin ${String(origin)}`);
    else originSet.add(url.origin);
  }
  const textureList = Array.isArray(profile.textures) ? profile.textures : [], materialList = Array.isArray(profile.materials) ? profile.materials : [];
  if (profile.textures != null && !Array.isArray(profile.textures)) errors.push('renderProfile.textures must be an array');
  if (profile.materials != null && !Array.isArray(profile.materials)) errors.push('renderProfile.materials must be an array');
  const textureIds = new Set();
  for (const texture of textureList) {
    if (!plainObject(texture) || typeof texture.id !== 'string' || !texture.id) { errors.push('renderProfile texture requires id'); continue; }
    if (textureIds.has(texture.id)) errors.push(`duplicate renderProfile texture ${texture.id}`);
    textureIds.add(texture.id);
    const url = safeUrl(texture.source);
    if (!url || url.protocol !== 'https:' || !originSet.has(url.origin)) errors.push(`texture ${texture.id} must use an allowlisted HTTPS source`);
    if (texture.integrity != null && !sha256(texture.integrity)) errors.push(`texture ${texture.id} integrity must be SHA-256 hex`);
    for (const [name, expected] of [['repeat', 2], ['offset', 2], ['center', 2]]) {
      if (texture[name] != null && !finiteArray(texture[name], expected)) errors.push(`texture ${texture.id}.${name} must be a finite vec${expected}`);
    }
    if (texture.rotation != null && !Number.isFinite(texture.rotation)) errors.push(`texture ${texture.id}.rotation must be finite`);
  }
  for (const material of materialList) {
    if (!plainObject(material) || !Array.isArray(material.nodePath) || !material.nodePath.every(i => Number.isInteger(i) && i >= 0)
      || !Number.isInteger(material.materialIndex) || material.materialIndex < 0) {
      errors.push('renderProfile material requires nodePath and materialIndex'); continue;
    }
    for (const [slot, textureId] of Object.entries(material.textureSlots || {})) {
      if (!SLOT_SET.has(slot)) errors.push(`renderProfile material uses unsupported texture slot ${slot}`);
      else if (!textureIds.has(textureId)) errors.push(`renderProfile material ${slot} references unknown texture ${textureId}`);
    }
  }
  if (!Array.isArray(profile.textures)) warnings.push('renderProfile has no texture list; scalar material fallback remains active');
  return Object.freeze({ present: true, valid: errors.length === 0, errors, warnings, textureCount: textureIds.size });
}
function cacheKey(texture) { return `${sha256(texture.integrity) || 'unverified'}:${texture.source}`; }
async function digest(bytes, cryptoRef = globalThis.crypto) {
  if (!cryptoRef?.subtle?.digest) throw new Error('Web Crypto SHA-256 is unavailable');
  const result = await cryptoRef.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map(value => value.toString(16).padStart(2, '0')).join('');
}
function textureSourceCanvas(image, documentRef = globalThis.document, maxSize = 1024) {
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(image.width, image.height) : documentRef?.createElement?.('canvas');
  if (!canvas) throw new Error('No canvas available to bind decoded texture');
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext?.('2d');
  if (!context) throw new Error('Cannot create texture decode canvas');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}
function applyTextureSampling(texture, meta, THREE) {
  if (!texture) return;
  texture.flipY = meta.flipY !== false;
  texture.colorSpace = '';
  for (const key of ['wrapS', 'wrapT', 'minFilter', 'magFilter']) if (Number.isInteger(meta[key])) texture[key] = meta[key];
  if (typeof meta.generateMipmaps === 'boolean') texture.generateMipmaps = meta.generateMipmaps;
  if (Number.isFinite(meta.anisotropy)) texture.anisotropy = Math.max(1, Math.min(16, meta.anisotropy));
  if (finiteArray(meta.repeat, 2)) texture.repeat?.set?.(...meta.repeat);
  if (finiteArray(meta.offset, 2)) texture.offset?.set?.(...meta.offset);
  if (finiteArray(meta.center, 2)) texture.center?.set?.(...meta.center);
  if (Number.isFinite(meta.rotation)) texture.rotation = meta.rotation;
  if (meta.colorSpace === 'srgb' || meta.colorSpace === 'sRGB') texture.colorSpace = THREE?.SRGBColorSpace || 'srgb';
  texture.needsUpdate = true;
}
async function verifiedBytes(meta, options) {
  const { fetchRef = globalThis.fetch, cryptoRef, allowedOrigins = TRUSTED_STUDIO_ORIGINS } = options;
  const url = safeUrl(meta.source);
  if (!url || url.protocol !== 'https:' || url.username || url.password || !allowedOrigins.includes(url.origin)) throw new Error('texture source is not host-approved');
  const expected = sha256(meta.integrity);
  if (!expected) throw new Error('texture requires verified SHA-256');
  const key = cacheKey(meta);
  if (textureCache.has(key)) return textureCache.get(key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(100, Math.min(15000, options.timeoutMs || 10000)));
  try {
    const response = await fetchRef(meta.source, { mode: 'cors', credentials: 'omit', cache: 'force-cache', redirect: 'error', signal: controller.signal });
    if (!response?.ok) throw new Error(`texture fetch failed (${response?.status || 'network'})`);
    const length = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(length) && length > MAX_TEXTURE_BYTES) throw new Error('texture exceeds byte limit');
    let bytes;
    if (response.body?.getReader) {
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > MAX_TEXTURE_BYTES) { await reader.cancel(); throw new Error('texture exceeds byte limit'); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const joined = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
      bytes = joined.buffer;
    } else bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_TEXTURE_BYTES) throw new Error('texture exceeds byte limit');
    if (await digest(bytes, cryptoRef) !== expected) throw new Error('texture integrity mismatch');
    while (cachedBytes + bytes.byteLength > MAX_CACHE_BYTES && textureCache.size) {
      const first = textureCache.keys().next().value;
      cachedBytes -= textureCache.get(first).byteLength; textureCache.delete(first);
    }
    // Another instance may have finished the same request while it was loading.
    if (!textureCache.has(key)) { textureCache.set(key, bytes); cachedBytes += bytes.byteLength; }
    return bytes;
  } finally { clearTimeout(timer); }
}
export async function loadStudioCharacterProfileTexture(meta, options = {}) {
  const bytes = await verifiedBytes(meta, options);
  const { THREE, createImageBitmapRef = globalThis.createImageBitmap, documentRef } = options;
  if (options.isDisposed?.()) throw new Error('Studio visual disposed');
  if (typeof createImageBitmapRef !== 'function') throw new Error('image bitmap decoder unavailable');
  const image = await createImageBitmapRef(new Blob([bytes]));
  try {
    const maxSize = Math.max(256, Math.min(2048, options.maxTextureSize || 1024));
    const canvas = textureSourceCanvas(image, documentRef, maxSize);
    const texture = THREE?.CanvasTexture ? new THREE.CanvasTexture(canvas) : THREE?.Texture ? new THREE.Texture(canvas) : null;
    if (!texture) throw new Error('host Three texture constructor unavailable');
    applyTextureSampling(texture, meta, THREE);
    return texture;
  } finally { image.close?.(); }
}
export function resetStudioCharacterProfileTextureCache() { textureCache.clear(); cachedBytes = 0; }
function materialAt(node, index) { return Array.isArray(node?.material) ? node.material[index] : index === 0 ? node?.material : null; }
export async function applyStudioCharacterRenderProfile(root, profile, options = {}) {
  const validation = validateStudioCharacterRenderProfile(profile);
  const diagnostics = { state: 'skipped', assigned: 0, failed: [], validation };
  if (!validation.present) return Object.freeze({ ...diagnostics, reason: 'no-render-profile' });
  if (!validation.valid) return Object.freeze({ ...diagnostics, reason: 'invalid-render-profile' });
  const textureById = new Map((profile.textures || []).map(texture => [texture.id, texture])), nodes = new Map();
  root?.traverse?.(node => { const path = node?.userData?.studioScenePath; if (Array.isArray(path)) nodes.set(path.join('.'), node); });
  diagnostics.state = textureById.size ? 'applied' : 'scalar-only';
  const instanceTextures = new Map(), deadline = Date.now() + Math.min(30000, options.profileTimeoutMs || 20000);
  for (const entry of profile.materials || []) {
    const node = nodes.get(entry.nodePath.join('.')), material = materialAt(node, entry.materialIndex);
    if (node?.isMesh && profile.shadow) { node.castShadow = profile.shadow.cast === true; node.receiveShadow = profile.shadow.receive === true; }
    if (!material) { diagnostics.failed.push(`material host missing at ${entry.nodePath.join('.')}`); continue; }
    for (const [slot, textureId] of Object.entries(entry.textureSlots || {})) {
      const meta = textureById.get(textureId);
      if (!meta || !SLOT_SET.has(slot)) continue;
      try {
        if (options.isDisposed?.()) throw new Error('Studio visual disposed');
        if (Date.now() > deadline) throw new Error('Studio material profile deadline exceeded');
        const color = slot === 'map' || slot === 'emissiveMap', binding = { ...meta, colorSpace: color ? meta.colorSpace || 'srgb' : '' };
        const variant = JSON.stringify(binding);
        if (!instanceTextures.has(variant)) {
          const texture = await loadStudioCharacterProfileTexture(binding, options);
          if (options.isDisposed?.()) { texture.dispose?.(); throw new Error('Studio visual disposed'); }
          options.registerTexture?.(texture); instanceTextures.set(variant, texture);
        }
        material[slot] = instanceTextures.get(variant); material.needsUpdate = true; diagnostics.assigned += 1;
      } catch (error) { diagnostics.failed.push(`${textureId}:${String(error?.message || error)}`); }
    }
  }
  if (diagnostics.failed.length) diagnostics.state = diagnostics.assigned ? 'partial' : 'failed';
  diagnostics.uniqueTextures = instanceTextures.size;
  diagnostics.runtimeMaxResolution = options.maxTextureSize || 1024;
  return Object.freeze(diagnostics);
}
