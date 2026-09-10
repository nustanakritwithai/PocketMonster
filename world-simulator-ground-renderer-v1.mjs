import {
  WORLD_GROUND_MATERIALS,
  WORLD_MAP_FRAME_CONTRACT,
  readWorldMapFrame,
} from './world-simulator-map-adapter-v1.mjs';

export const WORLD_GROUND_RENDERER_VERSION = '1.0.0';
export const WORLD_GROUND_RENDERER_SCHEMA = 'pocketmonster.world-ground-renderer.v1';

export const WORLD_GROUND_QUALITY = Object.freeze({
  low: Object.freeze({ maxTextureSize: 512, anisotropy: 2, textureMeters: 3.2 }),
  medium: Object.freeze({ maxTextureSize: 1024, anisotropy: 4, textureMeters: 2.6 }),
  high: Object.freeze({ maxTextureSize: 2048, anisotropy: 8, textureMeters: 2.2 }),
});

const SURFACE_COLORS = Object.freeze({
  grass: 0x6f8f42,
  'forest-floor': 0x514b34,
  mud: 0x544737,
  sand: 0xc9b77f,
  rock: 0x77766f,
  'dry-soil': 0x8b6845,
  burned: 0x2c2926,
});

const TEXTURE_SLOT_TO_MATERIAL = Object.freeze({
  albedo: 'map',
  normal: 'normalMap',
  roughness: 'roughnessMap',
  ao: 'aoMap',
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function fingerprint(frame) {
  const versions = frame.source.versions;
  return [
    frame.source.tick,
    versions.hydrology,
    versions.soil,
    versions.vegetation,
    versions.biomes,
    versions.fire,
  ].join(':');
}

function installSurfaceShader(material, materialId) {
  material.onBeforeCompile = shader => {
    const requiredVertex = ['#include <common>', '#include <begin_vertex>'];
    const requiredFragment = ['#include <common>', '#include <color_fragment>', '#include <roughnessmap_fragment>'];
    for (const marker of requiredVertex) {
      if (!shader.vertexShader.includes(marker)) throw new Error(`Unsupported Three.js ground vertex shader: ${marker}`);
    }
    for (const marker of requiredFragment) {
      if (!shader.fragmentShader.includes(marker)) throw new Error(`Unsupported Three.js ground fragment shader: ${marker}`);
    }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec3 groundSurface;\nvarying vec3 vGroundSurface;\nvarying vec3 vGroundWorldPosition;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGroundSurface = groundSurface;\nvGroundWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;',
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vGroundSurface;
varying vec3 vGroundWorldPosition;
float groundHash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float groundMacro(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  float a = groundHash(cell);
  float b = groundHash(cell + vec2(1.0, 0.0));
  float c = groundHash(cell + vec2(0.0, 1.0));
  float d = groundHash(cell + vec2(1.0, 1.0));
  vec2 t = local * local * (3.0 - 2.0 * local);
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float groundWetness = clamp(vGroundSurface.x, 0.0, 1.0);
float groundBurn = clamp(vGroundSurface.y, 0.0, 1.0);
float groundVegetation = clamp(vGroundSurface.z, 0.0, 1.0);
float macroNoise = groundMacro(vGroundWorldPosition.xz * 0.11);
float macroTint = mix(0.91, 1.07, macroNoise);
diffuseColor.rgb *= macroTint;
diffuseColor.rgb *= mix(1.0, 0.70, groundWetness);
float burnLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(burnLuma * 0.34), groundBurn * 0.88);
`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * mix(1.0, 0.56, clamp(vGroundSurface.x, 0.0, 1.0)), 0.10, 1.0);',
      );
  };
  material.customProgramCacheKey = () => `worldsim-ground:${WORLD_GROUND_RENDERER_VERSION}:${materialId}`;
}

function cornerIndex(x, z, width) {
  return z * (width + 1) + x;
}

function buildCornerHeights(frame) {
  const { gridWidth: width, gridHeight: height } = frame.grid;
  const heights = new Float32Array((width + 1) * (height + 1));
  const counts = new Uint8Array((width + 1) * (height + 1));
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const cellIndex = row * width + column;
      const elevation = frame.channels.elevation[cellIndex];
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const index = cornerIndex(column + dx, row + dz, width);
        heights[index] += elevation;
        counts[index] += 1;
      }
    }
  }
  for (let i = 0; i < heights.length; i += 1) heights[i] /= Math.max(1, counts[i]);
  return heights;
}

function sampleCornerHeight(heights, x, z, width, height) {
  return heights[cornerIndex(clamp(x, 0, width), clamp(z, 0, height), width)];
}

function cornerNormal(heights, x, z, frame) {
  const { gridWidth: width, gridHeight: height, cellWidth, cellHeight } = frame.grid;
  const left = sampleCornerHeight(heights, x - 1, z, width, height);
  const right = sampleCornerHeight(heights, x + 1, z, width, height);
  const down = sampleCornerHeight(heights, x, z - 1, width, height);
  const up = sampleCornerHeight(heights, x, z + 1, width, height);
  const dxSpan = x > 0 && x < width ? 2 * cellWidth : cellWidth;
  const dzSpan = z > 0 && z < height ? 2 * cellHeight : cellHeight;
  const slopeX = (right - left) / Math.max(0.000001, dxSpan);
  const slopeZ = (up - down) / Math.max(0.000001, dzSpan);
  const nx = -slopeX;
  const ny = 1;
  const nz = -slopeZ;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

function createBatch() {
  return { position: [], normal: [], uv: [], surface: [], index: [] };
}

function appendCell(batch, frame, heights, cellIndex, textureMeters) {
  const { gridWidth: width, gridHeight: height, cellWidth, cellHeight, worldWidth, worldHeight } = frame.grid;
  const column = cellIndex % width;
  const row = Math.floor(cellIndex / width);
  const minX = -worldWidth * 0.5;
  const minZ = -worldHeight * 0.5;
  const x0 = minX + column * cellWidth;
  const x1 = x0 + cellWidth;
  const z0 = minZ + row * cellHeight;
  const z1 = z0 + cellHeight;
  const corners = [
    [column, row, x0, z0],
    [column + 1, row, x1, z0],
    [column, row + 1, x0, z1],
    [column + 1, row + 1, x1, z1],
  ];
  const base = batch.position.length / 3;
  for (const [cx, cz, x, z] of corners) {
    const y = heights[cornerIndex(cx, cz, width)];
    const normal = cornerNormal(heights, cx, cz, frame);
    batch.position.push(x, y, z);
    batch.normal.push(...normal);
    batch.uv.push(x / textureMeters, z / textureMeters);
    batch.surface.push(
      frame.channels.wetness[cellIndex],
      frame.channels.burn[cellIndex],
      frame.channels.vegetation[cellIndex],
    );
  }
  batch.index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
}

function appendWaterCell(batch, frame, cellIndex) {
  const { gridWidth: width, cellWidth, cellHeight, worldWidth, worldHeight } = frame.grid;
  const column = cellIndex % width;
  const row = Math.floor(cellIndex / width);
  const minX = -worldWidth * 0.5;
  const minZ = -worldHeight * 0.5;
  const x0 = minX + column * cellWidth;
  const x1 = x0 + cellWidth;
  const z0 = minZ + row * cellHeight;
  const z1 = z0 + cellHeight;
  const y = frame.channels.waterHeight[cellIndex] + 0.008;
  const base = batch.position.length / 3;
  batch.position.push(x0, y, z0, x1, y, z0, x0, y, z1, x1, y, z1);
  batch.normal.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
  batch.uv.push(0, 0, 1, 0, 0, 1, 1, 1);
  batch.surface.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  batch.index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
}

export function buildWorldGroundGeometry(frameInput, { textureMeters = 2.6 } = {}) {
  const frame = readWorldMapFrame(frameInput);
  const batches = WORLD_GROUND_MATERIALS.map(() => createBatch());
  const water = createBatch();
  const heights = buildCornerHeights(frame);
  const count = frame.grid.count;

  for (let cellIndex = 0; cellIndex < count; cellIndex += 1) {
    appendCell(batches[frame.channels.material[cellIndex]], frame, heights, cellIndex, textureMeters);
    if (
      frame.channels.waterDepth[cellIndex] > 0.0001
      || frame.channels.ocean[cellIndex] === 1
      || frame.channels.flooded[cellIndex] === 1
    ) {
      appendWaterCell(water, frame, cellIndex);
    }
  }

  return Object.freeze({
    frame,
    terrain: Object.freeze(batches.map(batch => Object.freeze(batch))),
    water: Object.freeze(water),
  });
}

function geometryFromBatch(THREE, batch) {
  if (!batch.position.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uv, 2));
  // Keep both aliases because AO UV channel naming changed across Three revisions.
  geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(batch.uv, 2));
  geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(batch.uv, 2));
  geometry.setAttribute('groundSurface', new THREE.Float32BufferAttribute(batch.surface, 3));
  geometry.setIndex(batch.index);
  geometry.computeBoundingSphere();
  return geometry;
}

function normalizePack(pack) {
  if (!pack || typeof pack !== 'object' || pack.schema !== 'pocketmonster.world-ground-material-pack.v1') {
    throw new TypeError('Unsupported world ground material pack');
  }
  return pack;
}

export function createWorldSimulatorGroundRenderer({
  THREE,
  scene,
  quality = 'medium',
  maxAnisotropy = 1,
} = {}) {
  if (!THREE || !scene?.add || !scene?.remove) throw new TypeError('THREE and scene are required');
  if (!WORLD_GROUND_QUALITY[quality]) throw new TypeError(`Unsupported ground quality: ${quality}`);
  if (!Number.isFinite(maxAnisotropy) || maxAnisotropy < 1) throw new RangeError('Invalid maxAnisotropy');

  const budget = WORLD_GROUND_QUALITY[quality];
  const root = new THREE.Group();
  root.name = 'WorldSimulatorGroundPresentation';
  root.userData.presentationOnly = true;
  root.userData.authority = 'living-world-physics';
  root.visible = false;
  scene.add(root);

  const materials = WORLD_GROUND_MATERIALS.map(materialId => {
    const material = new THREE.MeshStandardMaterial({
      color: SURFACE_COLORS[materialId],
      roughness: materialId === 'rock' ? 0.78 : materialId === 'mud' ? 0.72 : 0.9,
      metalness: 0,
    });
    material.name = `world-ground:${materialId}`;
    installSurfaceShader(material, materialId);
    return material;
  });
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b88a0,
    roughness: 0.18,
    metalness: 0,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  });
  waterMaterial.name = 'world-ground:authoritative-water';

  const ownedTextures = new Set();
  let disposed = false;
  let lastFingerprint = null;
  let currentFrame = null;
  let textureState = Object.freeze({ state: 'fallback', loaded: 0, failed: 0, errors: Object.freeze([]) });

  function assertAlive() {
    if (disposed) throw new Error('World Simulator ground renderer has been disposed');
  }

  function clearMeshes() {
    for (const child of [...root.children]) {
      root.remove(child);
      child.geometry?.dispose?.();
    }
  }

  function addBatch(batch, material, name) {
    const geometry = geometryFromBatch(THREE, batch);
    if (!geometry) return null;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.userData.presentationOnly = true;
    root.add(mesh);
    return mesh;
  }

  function setFrame(frameInput) {
    assertAlive();
    const frame = readWorldMapFrame(frameInput);
    const nextFingerprint = fingerprint(frame);
    if (nextFingerprint === lastFingerprint) return false;
    const built = buildWorldGroundGeometry(frame, { textureMeters: budget.textureMeters });

    clearMeshes();
    built.terrain.forEach((batch, index) => {
      addBatch(batch, materials[index], `world-ground:${WORLD_GROUND_MATERIALS[index]}`);
    });
    addBatch(built.water, waterMaterial, 'world-ground:authoritative-water');
    currentFrame = frame;
    lastFingerprint = nextFingerprint;
    root.visible = true;
    return true;
  }

  function setTexture(materialId, slot, texture, { normalConvention = 'opengl' } = {}) {
    assertAlive();
    const materialIndex = WORLD_GROUND_MATERIALS.indexOf(materialId);
    const property = TEXTURE_SLOT_TO_MATERIAL[slot];
    if (materialIndex < 0 || !property) throw new TypeError('Unknown ground material or texture slot');
    if (texture !== null && texture?.isTexture !== true) throw new TypeError('Ground texture must be THREE.Texture or null');
    if (!['opengl', 'directx'].includes(normalConvention)) throw new TypeError('Unknown normal convention');

    const material = materials[materialIndex];
    const old = material[property];
    const next = texture?.clone?.() ?? null;
    if (next) {
      next.colorSpace = slot === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      next.wrapS = THREE.RepeatWrapping;
      next.wrapT = THREE.RepeatWrapping;
      next.generateMipmaps = true;
      next.minFilter = THREE.LinearMipmapLinearFilter;
      next.magFilter = THREE.LinearFilter;
      next.anisotropy = Math.max(1, Math.min(maxAnisotropy, budget.anisotropy));
      next.needsUpdate = true;
      ownedTextures.add(next);
    }
    material[property] = next;
    if (slot === 'albedo') material.color.set(next ? 0xffffff : SURFACE_COLORS[materialId]);
    if (slot === 'normal' && material.normalScale?.set) {
      material.normalScale.set(1, normalConvention === 'directx' ? -1 : 1);
    }
    material.needsUpdate = true;
    if (old && ownedTextures.delete(old)) old.dispose?.();
    return true;
  }

  async function loadMaterialPack(packInput, {
    textureLoader = new THREE.TextureLoader(),
    baseUrl = import.meta.url,
  } = {}) {
    assertAlive();
    const pack = normalizePack(packInput);
    const errors = [];
    let loaded = 0;
    let failed = 0;

    const loadOne = url => new Promise((resolve, reject) => {
      textureLoader.load(new URL(url, baseUrl).href, resolve, undefined, reject);
    });

    for (const materialId of WORLD_GROUND_MATERIALS) {
      const entry = pack.materials?.[materialId];
      if (!entry) continue;
      for (const slot of Object.keys(TEXTURE_SLOT_TO_MATERIAL)) {
        const url = entry[slot];
        if (!url) continue;
        try {
          const texture = await loadOne(url);
          setTexture(materialId, slot, texture, { normalConvention: entry.normalConvention || 'opengl' });
          texture.dispose?.();
          loaded += 1;
        } catch (error) {
          failed += 1;
          errors.push(`${materialId}.${slot}: ${error?.message || error}`);
        }
      }
    }

    textureState = Object.freeze({
      state: failed === 0 && loaded > 0 ? 'ready' : loaded > 0 ? 'partial' : 'fallback',
      loaded,
      failed,
      errors: Object.freeze(errors),
      source: pack.source || null,
      license: pack.license || null,
    });
    return textureState;
  }

  function setVisible(value) {
    assertAlive();
    root.visible = Boolean(value) && Boolean(currentFrame);
  }

  function diagnostics() {
    return Object.freeze({
      schema: WORLD_GROUND_RENDERER_SCHEMA,
      version: WORLD_GROUND_RENDERER_VERSION,
      frameContract: WORLD_MAP_FRAME_CONTRACT,
      quality,
      budget,
      active: root.visible,
      frameTick: currentFrame?.source?.tick ?? null,
      sourceVersion: currentFrame?.source?.version ?? null,
      surfacePolicy: currentFrame?.source?.surfacePolicy ?? null,
      meshes: root.children.length,
      textures: textureState,
      presentationOnly: true,
    });
  }

  return Object.freeze({
    root,
    setFrame,
    setTexture,
    loadMaterialPack,
    setVisible,
    diagnostics,
    getFrame: () => currentFrame,
    dispose() {
      if (disposed) return;
      clearMeshes();
      for (const texture of ownedTextures) texture.dispose?.();
      ownedTextures.clear();
      for (const material of materials) material.dispose?.();
      waterMaterial.dispose?.();
      scene.remove(root);
      currentFrame = null;
      lastFingerprint = null;
      disposed = true;
    },
  });
}
