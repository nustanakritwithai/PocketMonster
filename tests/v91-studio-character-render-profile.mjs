import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  applyStudioCharacterRenderProfile,
  resetStudioCharacterProfileTextureCache,
  validateStudioCharacterRenderProfile,
} from '../asset-presentation/studio-character-render-profile.mjs';
const bytes = new TextEncoder().encode('verified-studio-texture').buffer;
const hash = [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
const profile = {
  schema: 'pocket-character-render-profile-v1', version: '1.0.0', mode: 'metadata-only-host-applied',
  sourcePolicy: { allowlistedOrigins: ['https://studio.example.test'], sameOriginHttpsOnly: true, hostMustVerifyIntegrity: true },
  textures: [{ id: 'skin', source: 'https://studio.example.test/assets/skin.webp', integrity: hash,
    colorSpace: 'srgb', flipY: false, wrapS: 1000, wrapT: 1000, minFilter: 1008, magFilter: 1006,
    generateMipmaps: false, anisotropy: 4, repeat: [2, 3], offset: [.1, .2], center: [.5, .5], rotation: .2 }],
  materials: [{ id: 'body', nodePath: [0], materialIndex: 0, textureSlots: { map: 'skin', normalMap: 'skin' } }],
  shadow: { cast: true, receive: true, requiresExistingHostRenderer: true },
  lightingProfile: { id: 'advisory', mode: 'host-advisory-no-light-objects', createsRenderer: false, createsLights: false },
};
assert.equal(validateStudioCharacterRenderProfile(profile).valid, true);
const crossOrigin = structuredClone(profile); crossOrigin.textures[0].source = 'https://other.example.test/skin.webp';
assert.equal(validateStudioCharacterRenderProfile(crossOrigin).valid, false);
const lightInjection = structuredClone(profile); lightInjection.lightingProfile.createsLights = true;
assert.equal(validateStudioCharacterRenderProfile(lightInjection).valid, false);
class Texture {
  constructor(image) {
    this.image = image;
    this.repeat = { set: (...v) => { this.repeatValue = v; } };
    this.offset = { set: (...v) => { this.offsetValue = v; } };
    this.center = { set: (...v) => { this.centerValue = v; } };
  }
  dispose() { this.disposed = true; }
}
class CanvasTexture extends Texture {}
class Node {
  constructor(path = [], material = null) { this.userData = { studioScenePath: path }; this.material = material; this.children = []; this.isMesh = !!material; }
  traverse(fn) { fn(this); for (const child of this.children) child.traverse(fn); }
}
const root = new Node([]), material = {};
root.children.push(new Node([0], material));
let fetches = 0;
const fetchRef = async (source, request) => {
  fetches++;
  assert.equal(source, profile.textures[0].source);
  assert.equal(request.credentials, 'omit'); assert.equal(request.redirect, 'error');
  return { ok: true, status: 200, headers: { get: () => String(bytes.byteLength) }, arrayBuffer: async () => bytes.slice(0) };
};
const documentRef = { createElement: () => ({ getContext: () => ({ drawImage() {} }), width: 0, height: 0 }) };
const createImageBitmapRef = async () => ({ width: 2, height: 2, close() {} });
const owned = [];
const options = { THREE: { CanvasTexture, SRGBColorSpace: 'srgb-host' }, fetchRef, createImageBitmapRef, documentRef,
  cryptoRef: webcrypto, allowedOrigins: ['https://studio.example.test'], registerTexture: texture => owned.push(texture) };
resetStudioCharacterProfileTextureCache();
const report = await applyStudioCharacterRenderProfile(root, profile, options);
assert.equal(report.state, 'applied'); assert.equal(report.assigned, 2);
assert.notEqual(material.map, material.normalMap, 'color and data must not share mutable GPU state');
assert.equal(material.normalMap.colorSpace, ''); assert.equal(fetches, 1, 'verified bytes can be shared');
assert.equal(material.map.colorSpace, 'srgb-host'); assert.deepEqual(material.map.repeatValue, [2, 3]);
assert.equal(material.needsUpdate, true); assert.equal(root.children[0].castShadow, true); assert.equal(root.children[0].receiveShadow, true);
assert.equal(owned.length, 2, 'decoded textures are owned by the visual handle');
const failedHash = structuredClone(profile); failedHash.textures[0].integrity = '0'.repeat(64);
const fallbackMaterial = { map: 'scalar-fallback' }, fallbackRoot = new Node([]);
fallbackRoot.children.push(new Node([0], fallbackMaterial));
resetStudioCharacterProfileTextureCache();
const fallback = await applyStudioCharacterRenderProfile(fallbackRoot, failedHash, options);
assert.equal(fallback.assigned, 0); assert.equal(fallbackMaterial.map, 'scalar-fallback');
const unverified = structuredClone(profile); delete unverified.textures[0].integrity;
const before = fetches;
assert.equal((await applyStudioCharacterRenderProfile(fallbackRoot, unverified, options)).assigned, 0);
assert.equal(fetches, before, 'unverified assets are rejected before network use');
assert.equal((await applyStudioCharacterRenderProfile(fallbackRoot, profile, { ...options, allowedOrigins: [] })).assigned, 0);
assert.equal(fetches, before, 'producer cannot self-authorize a new host origin');
let disposed = false, closed = false, lateTexture;
class LateTexture extends CanvasTexture { constructor(image) { super(image); lateTexture = this; } }
const late = await applyStudioCharacterRenderProfile(fallbackRoot, profile, { ...options,
  THREE: { CanvasTexture: LateTexture }, isDisposed: () => disposed,
  createImageBitmapRef: async () => { disposed = true; return { width: 2, height: 2, close() { closed = true; } }; },
});
assert.equal(late.assigned, 0); assert.equal(lateTexture.disposed, true); assert.equal(closed, true);
assert.equal(fallbackMaterial.map, 'scalar-fallback', 'late asynchronous completion never mutates a disposed visual');
console.log('V9.1 Studio render profile bounded PBR consumer: PASS');
