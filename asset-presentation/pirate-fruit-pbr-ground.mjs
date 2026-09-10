export const PIRATE_FRUIT_PBR_GROUND_SCHEMA = 'pocketmonster.pirate-fruit-pbr-ground.v1';
export const PIRATE_FRUIT_PBR_GROUND_PACK = '../assets/world-ground/material-pack-v1.json';

const REPEAT_WRAPPING = 1000;
const LINEAR_FILTER = 1006;
const LINEAR_MIPMAP_LINEAR_FILTER = 1008;

export const PIRATE_FRUIT_TERRAIN_PBR = Object.freeze({
  'STARTER-ISLAND': Object.freeze({ material: 'grass', tint: 0xffffff, fallback: 0x557a32, repeat: 18 }),
  'MIST-JUNGLE': Object.freeze({ material: 'forest-floor', tint: 0xe9f2dc, fallback: 0x365126, repeat: 15 }),
  'SUNSCAR-DESERT': Object.freeze({ material: 'sand', tint: 0xfff0ce, fallback: 0xb99862, repeat: 17 }),
  'AZURE-FROST': Object.freeze({ material: 'rock', tint: 0xd7e7ef, fallback: 0x9eafb8, repeat: 13 }),
  'TEMPEST-SKY': Object.freeze({ material: 'rock', tint: 0xbec8d2, fallback: 0x697783, repeat: 14 }),
  'EMBER-VOLCANO': Object.freeze({ material: 'burned', tint: 0x7d5a50, fallback: 0x472d29, repeat: 15 }),
});

function terrainKey(mesh) {
  return String(mesh?.name || '').replace(/^PF_TERRAIN_/, '');
}

export function pirateFruitTerrainPbrProfile(meshOrName) {
  const key = typeof meshOrName === 'string'
    ? String(meshOrName).replace(/^PF_TERRAIN_/, '')
    : terrainKey(meshOrName);
  return PIRATE_FRUIT_TERRAIN_PBR[key] || PIRATE_FRUIT_TERRAIN_PBR['STARTER-ISLAND'];
}

function ensureAoUvAliases(geometry) {
  const uv = geometry?.attributes?.uv;
  if (!uv || typeof geometry?.setAttribute !== 'function') return false;
  if (!geometry.attributes.uv1) geometry.setAttribute('uv1', uv);
  if (!geometry.attributes.uv2) geometry.setAttribute('uv2', uv);
  return true;
}

function configureTexture(texture, { srgb = false, repeat = 16, anisotropy = 1 } = {}) {
  texture.wrapS = REPEAT_WRAPPING;
  texture.wrapT = REPEAT_WRAPPING;
  texture.repeat?.set?.(repeat, repeat);
  texture.generateMipmaps = true;
  texture.minFilter = LINEAR_MIPMAP_LINEAR_FILTER;
  texture.magFilter = LINEAR_FILTER;
  texture.anisotropy = Math.max(1, Math.min(4, Number(anisotropy) || 1));
  if (srgb) texture.colorSpace = 'srgb';
  texture.needsUpdate = true;
  return texture;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Ground texture failed: ${url}`));
    image.src = url;
  });
}

function textureFromImage(THREE, image, options) {
  if (!THREE?.CanvasTexture) throw new Error('Pirate Fruit vendor Three is missing CanvasTexture');
  return configureTexture(new THREE.CanvasTexture(image), options);
}

function profileCacheKey(profile, hasAo) {
  return `${profile.material}:${profile.tint}:${profile.repeat}:${hasAo ? 'ao' : 'noao'}`;
}

export function createPirateFruitPbrGroundPresentation({
  THREE,
  fetchImpl = globalThis.fetch,
  manifestUrl = new URL(PIRATE_FRUIT_PBR_GROUND_PACK, import.meta.url),
  maxAnisotropy = 1,
} = {}) {
  if (!THREE?.MeshStandardMaterial || !THREE?.CanvasTexture) {
    throw new TypeError('Pirate Fruit PBR ground requires MeshStandardMaterial and CanvasTexture');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required');

  const textureCache = new Map();
  const materialCache = new Map();
  let manifestPromise = null;
  let scanned = 0;
  let upgraded = 0;
  let fallback = 0;
  let failed = 0;
  let lastError = null;

  async function manifest() {
    if (!manifestPromise) {
      manifestPromise = fetchImpl(manifestUrl, { headers: { Accept: 'application/json' }, cache: 'force-cache' })
        .then(response => {
          if (!response?.ok) throw new Error(`Ground material manifest failed: ${response?.status ?? 'unknown'}`);
          return response.json();
        })
        .then(pack => {
          if (pack?.schema !== 'pocketmonster.world-ground-material-pack.v1' || pack?.installed !== true) {
            throw new Error('WorldSim ground material pack is not installed');
          }
          return pack;
        });
    }
    return manifestPromise;
  }

  async function sharedTexture(relativeUrl, options) {
    const absolute = new URL(relativeUrl, manifestUrl).href;
    const key = `${absolute}:${options.srgb ? 'srgb' : 'linear'}:${options.repeat}`;
    if (!textureCache.has(key)) {
      textureCache.set(key, loadImage(absolute).then(image => textureFromImage(THREE, image, options)));
    }
    return textureCache.get(key);
  }

  async function pbrMaterial(profile, geometry) {
    const hasAo = ensureAoUvAliases(geometry);
    const key = profileCacheKey(profile, hasAo);
    if (!materialCache.has(key)) {
      materialCache.set(key, (async () => {
        const pack = await manifest();
        const entry = pack.materials?.[profile.material];
        if (!entry?.albedo || !entry?.normal || !entry?.roughness) {
          throw new Error(`Missing PBR material family: ${profile.material}`);
        }
        const textureOptions = { repeat: profile.repeat, anisotropy: maxAnisotropy };
        const [map, normalMap, roughnessMap, aoMap] = await Promise.all([
          sharedTexture(entry.albedo, { ...textureOptions, srgb: true }),
          sharedTexture(entry.normal, { ...textureOptions, srgb: false }),
          sharedTexture(entry.roughness, { ...textureOptions, srgb: false }),
          hasAo && entry.ao ? sharedTexture(entry.ao, { ...textureOptions, srgb: false }) : Promise.resolve(null),
        ]);
        const material = new THREE.MeshStandardMaterial({
          color: profile.tint,
          map,
          normalMap,
          roughnessMap,
          aoMap,
          roughness: 0.92,
          metalness: 0,
        });
        material.name = `pirate-ground:worldsim-pbr:${profile.material}`;
        material.normalScale?.set?.(0.8, 0.8);
        material.userData = {
          ...(material.userData || {}),
          presentationOnly: true,
          materialLibrary: 'worldsim-pbr-v1',
          simulationAuthority: false,
        };
        return material;
      })());
    }
    return materialCache.get(key);
  }

  function flatFallback(profile) {
    const key = `fallback:${profile.material}:${profile.fallback}`;
    if (!materialCache.has(key)) {
      const material = new THREE.MeshStandardMaterial({ color: profile.fallback, roughness: 0.94, metalness: 0 });
      material.name = `pirate-ground:fallback:${profile.material}`;
      material.userData = {
        ...(material.userData || {}),
        presentationOnly: true,
        materialLibrary: 'worldsim-pbr-v1',
        simulationAuthority: false,
      };
      materialCache.set(key, Promise.resolve(material));
    }
    return materialCache.get(key);
  }

  function scheduleUpgrade(mesh) {
    if (!mesh?.isMesh || !String(mesh.name || '').startsWith('PF_TERRAIN_')) return false;
    if (mesh.userData?.worldsimPbrGround) return false;
    scanned += 1;
    const profile = pirateFruitTerrainPbrProfile(mesh);
    mesh.userData.worldsimPbrGround = 'loading';
    mesh.userData.surfaceStyle = 'worldsim-pbr-v1';
    mesh.userData.surfaceMaterialFamily = profile.material;
    mesh.userData.presentationOnly = true;
    // Remove the visibly blocky grid immediately. This material is replaced
    // asynchronously by the local PBR pack; geometry/collision stays untouched.
    void flatFallback(profile).then(material => {
      if (mesh.userData.worldsimPbrGround === 'loading') mesh.material = material;
    });
    void pbrMaterial(profile, mesh.geometry).then(material => {
      mesh.material = material;
      mesh.receiveShadow = true;
      mesh.userData.worldsimPbrGround = 'ready';
      upgraded += 1;
    }).catch(error => {
      mesh.userData.worldsimPbrGround = 'fallback';
      fallback += 1;
      failed += 1;
      lastError = String(error?.message || error);
      void flatFallback(profile).then(material => { mesh.material = material; });
    });
    return true;
  }

  function scan(scene) {
    if (!scene?.traverse) return 0;
    let scheduled = 0;
    scene.traverse(node => { if (scheduleUpgrade(node)) scheduled += 1; });
    return scheduled;
  }

  return Object.freeze({
    schema: PIRATE_FRUIT_PBR_GROUND_SCHEMA,
    scan,
    diagnostics() {
      return Object.freeze({
        schema: PIRATE_FRUIT_PBR_GROUND_SCHEMA,
        scanned,
        upgraded,
        fallback,
        failed,
        lastError,
        materialFamilies: materialCache.size,
        textures: textureCache.size,
        presentationOnly: true,
        simulationAuthority: false,
      });
    },
  });
}

export function hookPirateFruitPbrGround({ THREE } = {}) {
  if (!THREE?.Object3D?.prototype?.updateMatrixWorld) throw new TypeError('Pirate Fruit vendor Object3D is required');
  const current = THREE.Object3D.prototype.updateMatrixWorld;
  if (current.__pocketPiratePbrGround) return current.__pocketPiratePbrGround;
  let presentation = null;
  let pending = null;
  let scanAt = 0;

  function ensurePresentation() {
    if (presentation || pending) return;
    pending = Promise.resolve().then(() => createPirateFruitPbrGroundPresentation({ THREE })).then(value => {
      presentation = value;
      if (typeof window !== 'undefined') window.POCKETMONSTER_PIRATE_GROUND = presentation.diagnostics();
    }).catch(error => {
      pending = null;
      console.warn('Pirate Fruit PBR ground presentation failed', error);
    });
  }

  function updateMatrixWorld(force) {
    const result = current.call(this, force);
    if (this?.isScene) {
      ensurePresentation();
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (presentation && now >= scanAt) {
        presentation.scan(this);
        scanAt = now + 400;
        if (typeof window !== 'undefined') window.POCKETMONSTER_PIRATE_GROUND = presentation.diagnostics();
      }
    }
    return result;
  }

  const info = Object.freeze({
    hooked: true,
    schema: PIRATE_FRUIT_PBR_GROUND_SCHEMA,
    hook: 'object3d-updateMatrixWorld-post-pirate-presentation',
    presentationOnly: true,
    simulationAuthority: false,
  });
  updateMatrixWorld.__pocketPiratePbrGround = info;
  // Preserve the original Pirate bridge idempotency marker because this wrapper
  // deliberately sits on top of that hook rather than replacing it.
  if (current.__pocketPirateBridge) updateMatrixWorld.__pocketPirateBridge = current.__pocketPirateBridge;
  THREE.Object3D.prototype.updateMatrixWorld = updateMatrixWorld;
  if (typeof window !== 'undefined') window.POCKETMONSTER_PIRATE_GROUND_HOOK = info;
  return info;
}
