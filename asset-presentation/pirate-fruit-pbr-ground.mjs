export const PIRATE_FRUIT_PBR_GROUND_SCHEMA = 'pocketmonster.pirate-fruit-pbr-ground.v2';
export const PIRATE_FRUIT_PBR_GROUND_PACK = '../assets/world-ground/material-pack-v1.json';

const REPEAT_WRAPPING = 1000;
const LINEAR_FILTER = 1006;
const LINEAR_MIPMAP_LINEAR_FILTER = 1008;
const TERRAIN_REPEAT = 34;
const TERRAIN_LAYERS = Object.freeze({ sand: 'sand', grass: 'grass', rock: 'rock' });

function profile() {
  return Object.freeze({
    mode: 'preserve-native-splat',
    layers: TERRAIN_LAYERS,
    repeat: TERRAIN_REPEAT,
  });
}

export const PIRATE_FRUIT_TERRAIN_PBR = Object.freeze({
  'STARTER-ISLAND': profile(),
  'MIST-JUNGLE': profile(),
  'SUNSCAR-DESERT': profile(),
  'AZURE-FROST': profile(),
  'TEMPEST-SKY': profile(),
  'EMBER-VOLCANO': profile(),
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

function configureTexture(texture, { srgb = false, repeat = TERRAIN_REPEAT, anisotropy = 1 } = {}) {
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

function preserveTerrainForGroundPresentation(mesh) {
  if (!mesh?.userData) mesh.userData = {};
  // This marker is deliberately shared with the older bridge. Setting it before
  // the bridge runs prevents paintTerrain() from replacing the real Pirate Fruit
  // sand/grass/rock shader with the four-side block grid material.
  mesh.userData.pocketTerrain = true;
  mesh.userData.worldsimPbrGround = 'loading';
  mesh.userData.surfaceStyle = 'pirate-native-splat-worldsim-pbr-v2';
  mesh.userData.surfaceBlend = 'sand-grass-rock';
  mesh.userData.presentationOnly = true;
  mesh.userData.simulationAuthority = false;
}

function wrapNativeSplatShader(material, textures) {
  const previousCompile = typeof material.onBeforeCompile === 'function'
    ? material.onBeforeCompile
    : () => {};
  const previousCacheKey = typeof material.customProgramCacheKey === 'function'
    ? material.customProgramCacheKey.bind(material)
    : () => '';

  material.map = textures.grass.albedo;
  material.normalMap = textures.grass.normal;
  material.normalScale?.set?.(0.72, 0.72);
  material.color?.set?.(0xffffff);
  material.userData = {
    ...(material.userData || {}),
    presentationOnly: true,
    simulationAuthority: false,
    materialLibrary: 'worldsim-pbr-v1',
    surfaceStyle: 'pirate-native-splat-worldsim-pbr-v2',
    preservedNativeSplat: true,
  };

  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    previousCompile.call(this, shader, renderer);

    // The real Pirate Fruit terrain already owns the correct splat weights and
    // wet-shore logic. Replace only its texture inputs; never replace the shader.
    if (shader.uniforms?.uSandMap) shader.uniforms.uSandMap.value = textures.sand.albedo;
    if (shader.uniforms?.uRockMap) shader.uniforms.uRockMap.value = textures.rock.albedo;
    if (shader.uniforms?.uSandNormal) shader.uniforms.uSandNormal.value = textures.sand.normal;
    if (shader.uniforms?.uRockNormal) shader.uniforms.uRockNormal.value = textures.rock.normal;

    const roughnessSignature = 'float terrainRoughness = dot( vSplat, vec3( 1.0, 0.95, 0.82 ) );';
    if (typeof shader.fragmentShader === 'string' && shader.fragmentShader.includes(roughnessSignature)) {
      shader.uniforms.uSandRoughness = { value: textures.sand.roughness };
      shader.uniforms.uGrassRoughness = { value: textures.grass.roughness };
      shader.uniforms.uRockRoughness = { value: textures.rock.roughness };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'uniform sampler2D uRockNormal;\n',
          'uniform sampler2D uRockNormal;\nuniform sampler2D uSandRoughness;\nuniform sampler2D uGrassRoughness;\nuniform sampler2D uRockRoughness;\n',
        )
        .replace(
          roughnessSignature,
          `float terrainRoughness = texture2D( uSandRoughness, vMapUv ).r * vSplat.x
            + texture2D( uGrassRoughness, vMapUv ).r * vSplat.y
            + texture2D( uRockRoughness, vMapUv * 0.55 ).r * vSplat.z;`,
        );
    }
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}:pirate-native-splat-worldsim-pbr-v2`;
  material.needsUpdate = true;
  return material;
}

export function createPirateFruitPbrGroundPresentation({
  THREE,
  fetchImpl = globalThis.fetch,
  manifestUrl = new URL(PIRATE_FRUIT_PBR_GROUND_PACK, import.meta.url),
  maxAnisotropy = 1,
} = {}) {
  if (!THREE?.CanvasTexture) {
    throw new TypeError('Pirate Fruit PBR ground requires CanvasTexture');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required');

  const textureCache = new Map();
  let manifestPromise = null;
  let terrainTexturesPromise = null;
  let scanned = 0;
  let upgraded = 0;
  let preserved = 0;
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

  async function sharedTexture(relativeUrl, { srgb = false } = {}) {
    const absolute = new URL(relativeUrl, manifestUrl).href;
    const key = `${absolute}:${srgb ? 'srgb' : 'linear'}`;
    if (!textureCache.has(key)) {
      textureCache.set(key, loadImage(absolute).then(image => textureFromImage(THREE, image, {
        srgb,
        repeat: TERRAIN_REPEAT,
        anisotropy: maxAnisotropy,
      })));
    }
    return textureCache.get(key);
  }

  async function loadFamily(pack, family) {
    const entry = pack.materials?.[family];
    if (!entry?.albedo || !entry?.normal || !entry?.roughness) {
      throw new Error(`Missing PBR material family: ${family}`);
    }
    const [albedo, normal, roughness] = await Promise.all([
      sharedTexture(entry.albedo, { srgb: true }),
      sharedTexture(entry.normal),
      sharedTexture(entry.roughness),
    ]);
    return Object.freeze({ albedo, normal, roughness });
  }

  async function terrainTextures() {
    if (!terrainTexturesPromise) {
      terrainTexturesPromise = manifest().then(async pack => Object.freeze({
        sand: await loadFamily(pack, TERRAIN_LAYERS.sand),
        grass: await loadFamily(pack, TERRAIN_LAYERS.grass),
        rock: await loadFamily(pack, TERRAIN_LAYERS.rock),
      }));
    }
    return terrainTexturesPromise;
  }

  function scheduleUpgrade(mesh) {
    if (!mesh?.isMesh || !String(mesh.name || '').startsWith('PF_TERRAIN_')) return false;
    if (mesh.userData?.worldsimPbrGround) return false;
    scanned += 1;
    const originalMaterial = mesh.material;
    preserveTerrainForGroundPresentation(mesh);
    preserved += 1;

    void terrainTextures().then(textures => {
      if (!originalMaterial || Array.isArray(originalMaterial)) {
        throw new Error(`Pirate terrain ${mesh.name || 'unknown'} has no preservable material`);
      }
      // Preserve the original material object and its onBeforeCompile callback so
      // vertex splat weights, terrain geometry, wet shoreline and collision stay intact.
      if (mesh.material !== originalMaterial) mesh.material = originalMaterial;
      wrapNativeSplatShader(originalMaterial, textures);
      mesh.receiveShadow = true;
      mesh.userData.worldsimPbrGround = 'ready';
      upgraded += 1;
    }).catch(error => {
      // Do not install a flat fallback: the original Pirate shader is the safe fallback.
      if (mesh.material !== originalMaterial) mesh.material = originalMaterial;
      mesh.userData.worldsimPbrGround = 'fallback-native';
      fallback += 1;
      failed += 1;
      lastError = String(error?.message || error);
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
        preserved,
        upgraded,
        fallback,
        failed,
        lastError,
        surfaceBlend: 'sand-grass-rock',
        preservesNativeSplat: true,
        preservesWetShore: true,
        waterChanged: false,
        bridgeChanged: false,
        geometryChanged: false,
        collisionChanged: false,
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

  // Create synchronously: the hook must mark PF_TERRAIN_* before the older bridge
  // gets a chance to run paintTerrain() and replace the native splat material.
  const presentation = createPirateFruitPbrGroundPresentation({ THREE });
  let scanAt = 0;

  function updateMatrixWorld(force) {
    if (this?.isScene) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now >= scanAt) {
        presentation.scan(this);
        scanAt = now + 400;
        if (typeof window !== 'undefined') window.POCKETMONSTER_PIRATE_GROUND = presentation.diagnostics();
      }
    }
    // The existing Pirate bridge is deliberately called after the terrain scan.
    // It sees userData.pocketTerrain=true and therefore leaves the native shader alone.
    return current.call(this, force);
  }

  const info = Object.freeze({
    hooked: true,
    schema: PIRATE_FRUIT_PBR_GROUND_SCHEMA,
    hook: 'object3d-updateMatrixWorld-pre-pirate-terrain',
    preservesNativeSplat: true,
    preservesWetShore: true,
    waterChanged: false,
    bridgeChanged: false,
    presentationOnly: true,
    simulationAuthority: false,
  });
  updateMatrixWorld.__pocketPiratePbrGround = info;
  if (current.__pocketPirateBridge) updateMatrixWorld.__pocketPirateBridge = current.__pocketPirateBridge;
  THREE.Object3D.prototype.updateMatrixWorld = updateMatrixWorld;
  if (typeof window !== 'undefined') window.POCKETMONSTER_PIRATE_GROUND_HOOK = info;
  return info;
}
