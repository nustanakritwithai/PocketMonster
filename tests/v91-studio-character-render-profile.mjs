import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  applyStudioCharacterRenderProfile,
  resetStudioCharacterProfileTextureCache,
  validateStudioCharacterRenderProfile,
} from '../asset-presentation/studio-character-render-profile.mjs';

const bytes = new TextEncoder().encode('verified-studio-texture').buffer;
const hash = [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes))]
  .map(value => value.toString(16).padStart(2, '0')).join('');
const profile = {
  schema: 'pocket-character-render-profile-v1', version: '1.0.0', mode: 'metadata-only-host-applied',
  sourcePolicy: { allowlistedOrigins: ['https://studio.example.test'], sameOriginHttpsOnly: true, hostMustVerifyIntegrity: true },
  textures: [{
    id: 'skin', source: 'https://studio.example.test/assets/skin.webp', integrity: hash,
    colorSpace: 'srgb', flipY: false, wrapS: 1000, wrapT: 1000, minFilter: 1008, magFilter: 1006,
    generateMipmaps: false, anisotropy: 4, repeat: [2, 3], offset: [.1, .2], center: [.5, .5], rotation: .2,
  }],
  materials: [{ id: 'body', nodePath: [0], materialIndex: 0, textureSlots: { map: 'skin', normalMap: 'skin' } }],
  shadow: { cast: true, receive: true, requiresExistingHostRenderer: true },
  lightingProfile: { id: 'advisory', mode: 'host-advisory-no-light-objects', createsRenderer: false, createsLights: false },
};

assert.equal(validateStudioCharacterRenderProfile(profile).valid, true, 'allowlisted profile is valid');
const crossOrigin = structuredClone(profile); crossOrigin.textures[0].source = 'https://other.example.test/skin.webp';
assert.equal(validateStudioCharacterRenderProfile(crossOrigin).valid, false, 'cross-origin texture is rejected before fetch');
const lightInjection = structuredClone(profile); lightInjection.lightingProfile.createsLights = true;
assert.equal(validateStudioCharacterRenderProfile(lightInjection).valid, false, 'Studio may not request host lights');

class Texture {
  constructor(image) { this.image = image; this.repeat = { set: (...v) => { this.repeatValue = v; } }; this.offset = { set: (...v) => { this.offsetValue = v; } }; this.center = { set: (...v) => { this.centerValue = v; } }; }
}
class CanvasTexture extends Texture {}
class Node {
  constructor(path = [], material = null) { this.userData = { studioScenePath: path }; this.material = material; this.children = []; }
  traverse(fn) { fn(this); for (const child of this.children) child.traverse(fn); }
}
const root = new Node([]); const material = {}; root.children.push(new Node([0], material));
let fetches = 0;
const fetchRef = async source => {
  fetches += 1;
  assert.equal(source, profile.textures[0].source);
  return { ok: true, status: 200, headers: { get: () => String(bytes.byteLength) }, arrayBuffer: async () => bytes.slice(0) };
};
const documentRef = { createElement: () => ({
  getContext: () => ({ drawImage() {} }), width: 0, height: 0,
}) };
const createImageBitmapRef = async () => ({ width: 2, height: 2, close() {} });
resetStudioCharacterProfileTextureCache();
const report = await applyStudioCharacterRenderProfile(root, profile, {
  THREE: { CanvasTexture, SRGBColorSpace: 'srgb-host' }, fetchRef, createImageBitmapRef, documentRef, cryptoRef: webcrypto,
});
assert.equal(report.state, 'applied');
assert.equal(report.assigned, 2, 'supported PBR slots bind to the existing material');
assert.equal(material.map, material.normalMap, 'cache deduplicates a texture used by multiple map slots');
assert.equal(fetches, 1, 'texture is fetched once');
assert.equal(material.map.colorSpace, 'srgb-host');
assert.deepEqual(material.map.repeatValue, [2, 3]);
assert.equal(material.needsUpdate, true);
const failedHash = structuredClone(profile); failedHash.textures[0].integrity = '0'.repeat(64);
const fallbackMaterial = { map: 'scalar-fallback' };
const fallbackRoot = new Node([]); fallbackRoot.children.push(new Node([0], fallbackMaterial));
resetStudioCharacterProfileTextureCache();
const fallback = await applyStudioCharacterRenderProfile(fallbackRoot, failedHash, {
  THREE: { CanvasTexture }, fetchRef, createImageBitmapRef, documentRef, cryptoRef: webcrypto,
});
assert.equal(fallback.assigned, 0, 'bad integrity never binds a remote map');
assert.equal(fallbackMaterial.map, 'scalar-fallback', 'failed texture leaves scalar fallback material untouched');

console.log('V9.1 Studio render profile bounded PBR consumer: PASS');
