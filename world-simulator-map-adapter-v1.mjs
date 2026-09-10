/**
 * Read-only projection of Living World Physics Simulator 20.9.4 snapshots.
 *
 * The PocketMonster client is presentation-only here. It consumes canonical
 * world/soil/vegetation/biome/fire values and never recreates hydrology,
 * ecology, weather, biome classification or simulation clocks.
 */
export const WORLD_SIMULATOR_MAP_ADAPTER_VERSION = '2.0.0-worldsim-20.9.4';
export const WORLD_MAP_FRAME_CONTRACT = 'pocketmonster.world-map-frame.v2';
export const WORLD_SIMULATOR_SOURCE_VERSION = '20.9.4';

export const WORLD_GROUND_BIOMES = Object.freeze([
  'forest', 'grassland', 'wetland', 'beach', 'rock', 'mountain',
  'lake', 'river', 'dryland', 'burned', 'ocean',
]);

export const WORLD_GROUND_MATERIALS = Object.freeze([
  'grass', 'forest-floor', 'mud', 'sand', 'rock', 'dry-soil', 'burned',
]);

export const WORLD_GROUND_CHANNELS = Object.freeze([
  'elevation', 'waterHeight', 'waterDepth', 'wetness', 'vegetation',
  'burn', 'biome', 'material', 'ocean', 'flooded',
]);

const TERRAIN_TYPES = Object.freeze([
  'deepWater', 'shallowWater', 'sand', 'grass', 'forest', 'rock',
]);
const SOIL_TYPES = Object.freeze([
  'none', 'sand', 'loam', 'clay', 'peat', 'rocky', 'wetland', 'coastal',
]);
const MATERIAL_BY_SURFACE = Object.freeze({
  forest: 1,
  grassland: 0,
  wetland: 2,
  beach: 3,
  rock: 4,
  mountain: 4,
  lake: 2,
  river: 2,
  dryland: 5,
  burned: 6,
  ocean: 3,
});

const clamp01 = value => Math.max(0, Math.min(1, value));

function finite(value, name, minimum = -Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new TypeError(`Invalid ${name}`);
  }
  return value;
}

function integer(value, name, minimum = 0) {
  finite(value, name, minimum);
  if (!Number.isSafeInteger(value)) throw new TypeError(`Invalid ${name}`);
  return value;
}

function boolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`Invalid ${name}`);
  return value;
}

function enumValue(value, values, name) {
  if (!values.includes(value)) throw new TypeError(`Unsupported ${name}: ${String(value)}`);
  return value;
}

function dimensions(world) {
  const gridWidth = integer(world.gridWidth, 'gridWidth', 1);
  const gridHeight = integer(world.gridHeight, 'gridHeight', 1);
  const count = gridWidth * gridHeight;
  if (count > 65536) throw new RangeError('World ground renderer is limited to 65536 cells');

  const cellWidth = finite(world.cellWidth, 'cellWidth', Number.MIN_VALUE);
  const cellHeight = finite(world.cellHeight, 'cellHeight', Number.MIN_VALUE);
  const worldWidth = finite(world.worldWidth, 'worldWidth', Number.MIN_VALUE);
  const worldHeight = finite(world.worldHeight, 'worldHeight', Number.MIN_VALUE);

  const widthError = Math.abs(gridWidth * cellWidth - worldWidth);
  const heightError = Math.abs(gridHeight * cellHeight - worldHeight);
  if (widthError > Math.max(1, worldWidth) * 1e-8 || heightError > Math.max(1, worldHeight) * 1e-8) {
    throw new TypeError('Inconsistent World Simulator dimensions');
  }

  return Object.freeze({
    gridWidth,
    gridHeight,
    count,
    cellWidth,
    cellHeight,
    worldWidth,
    worldHeight,
  });
}

function canonicalCells(section, count, label) {
  const cells = section?.cells;
  if (!Array.isArray(cells) || cells.length !== count) {
    throw new TypeError(`Missing or incomplete ${label}.cells; a full World Simulator snapshot is required`);
  }
  for (let i = 0; i < count; i += 1) {
    if (!cells[i] || cells[i].index !== i) {
      throw new TypeError(`${label}.cells must use canonical row-major indices (at ${i})`);
    }
  }
  return cells;
}

function freezeFrame(frame) {
  for (const name of WORLD_GROUND_CHANNELS) Object.freeze(frame.channels[name]);
  Object.freeze(frame.channels);
  Object.freeze(frame.source.versions);
  Object.freeze(frame.source);
  Object.freeze(frame.grid);
  return Object.freeze(frame);
}

/**
 * Project a RenderSnapshot / RenderWorldSnapshot from WorldSim 20.9.4.
 *
 * Optional surfaceBiome must be WorldSim's existing producer-side
 * worldSurfaceBiome selector. PocketMonster is never allowed to invent a
 * replacement biome classifier.
 */
export function adaptWorldSnapshotToMapFrame(input, {
  sourceVersion = WORLD_SIMULATOR_SOURCE_VERSION,
  surfaceBiome,
} = {}) {
  if (sourceVersion !== WORLD_SIMULATOR_SOURCE_VERSION) {
    throw new TypeError('Unverified World Simulator producer version; add an audited adapter before enabling it');
  }
  if (surfaceBiome !== undefined && typeof surfaceBiome !== 'function') {
    throw new TypeError('surfaceBiome must be a producer-owned function');
  }

  const world = input?.world ?? input;
  if (!world || typeof world !== 'object') throw new TypeError('World Simulator snapshot required');

  const grid = dimensions(world);
  const count = grid.count;
  const terrain = canonicalCells(world, count, 'world');
  const soil = canonicalCells(world.soil, count, 'soil');
  const vegetation = canonicalCells(world.vegetation, count, 'vegetation');
  const biomes = canonicalCells(world.biomes, count, 'biomes');
  const fire = canonicalCells(world.fire, count, 'fire');
  const channels = Object.fromEntries(WORLD_GROUND_CHANNELS.map(key => [key, new Array(count)]));
  const versions = {};

  for (const key of ['hydrology', 'soil', 'vegetation', 'biomes', 'fire']) {
    versions[key] = integer(world[key]?.version, `${key}.version`);
  }

  for (let i = 0; i < count; i += 1) {
    const cell = terrain[i];
    const soilCell = soil[i];
    const vegetationCell = vegetation[i];
    const biomeCell = biomes[i];
    const fireCell = fire[i];

    if (cell.column !== i % grid.gridWidth || cell.row !== Math.floor(i / grid.gridWidth)) {
      throw new TypeError(`World cell coordinate/index mismatch at ${i}`);
    }

    enumValue(cell.terrainType, TERRAIN_TYPES, 'terrainType');
    enumValue(soilCell.soilType, SOIL_TYPES, 'soilType');
    const primaryBiome = enumValue(biomeCell.primaryBiome, WORLD_GROUND_BIOMES, 'primaryBiome');
    const surface = surfaceBiome
      ? enumValue(surfaceBiome(world, i), WORLD_GROUND_BIOMES, 'producer surfaceBiome')
      : primaryBiome;

    const waterContent = finite(soilCell.waterContent, `soil[${i}].waterContent`, 0);
    const saturationCapacity = finite(soilCell.saturationCapacity, `soil[${i}].saturationCapacity`, 0);
    const soilActive = boolean(soilCell.active, `soil[${i}].active`);
    const coverage = finite(vegetationCell.coverage, `vegetation[${i}].coverage`, 0);

    channels.elevation[i] = finite(cell.elevation, `cells[${i}].elevation`);
    // totalWaterHeight already uses the same elevation datum. Never add elevation twice.
    channels.waterHeight[i] = finite(cell.totalWaterHeight, `cells[${i}].totalWaterHeight`);
    channels.waterDepth[i] = finite(cell.surfaceWater, `cells[${i}].surfaceWater`, 0);
    channels.wetness[i] = soilActive && saturationCapacity > 0
      ? clamp01(waterContent / saturationCapacity)
      : 0;
    channels.vegetation[i] = boolean(vegetationCell.active, `vegetation[${i}].active`)
      ? clamp01(coverage)
      : 0;
    channels.burn[i] = clamp01(finite(fireCell.burnSeverity, `fire[${i}].burnSeverity`, 0));
    channels.biome[i] = WORLD_GROUND_BIOMES.indexOf(primaryBiome);
    channels.material[i] = MATERIAL_BY_SURFACE[surface];
    channels.ocean[i] = Number(boolean(cell.isOceanCell, `cells[${i}].isOceanCell`));
    channels.flooded[i] = Number(boolean(cell.isFlooded, `cells[${i}].isFlooded`));
  }

  return freezeFrame({
    contract: WORLD_MAP_FRAME_CONTRACT,
    adapterVersion: WORLD_SIMULATOR_MAP_ADAPTER_VERSION,
    presentationOnly: true,
    source: {
      simulator: 'living-world-physics',
      version: WORLD_SIMULATOR_SOURCE_VERSION,
      seed: integer(world.seed, 'seed', -Number.MAX_SAFE_INTEGER),
      tick: input?.world ? integer(input.tick, 'tick') : null,
      surfacePolicy: surfaceBiome ? 'producer-worldSurfaceBiome' : 'primaryBiome',
      versions,
    },
    grid,
    channels,
  });
}

/** Validate imported presentation packets and detach their arrays from callers. */
export function readWorldMapFrame(value) {
  if (
    value?.contract !== WORLD_MAP_FRAME_CONTRACT
    || value.presentationOnly !== true
    || value.source?.version !== WORLD_SIMULATOR_SOURCE_VERSION
  ) {
    throw new TypeError('Unsupported World Simulator map frame');
  }

  const grid = dimensions(value.grid);
  const count = grid.count;
  const channels = {};
  for (const key of WORLD_GROUND_CHANNELS) {
    const source = value.channels?.[key];
    if (!Array.isArray(source) || source.length !== count) throw new TypeError(`Invalid world ground channel ${key}`);
    channels[key] = source.map((entry, index) => finite(entry, `${key}[${index}]`));

    if (['wetness', 'vegetation', 'burn', 'ocean', 'flooded'].includes(key)
      && source.some(entry => entry < 0 || entry > 1)) {
      throw new RangeError(`Invalid normalized world ground channel ${key}`);
    }
    if (['ocean', 'flooded'].includes(key) && source.some(entry => entry !== 0 && entry !== 1)) {
      throw new RangeError(`Invalid world ground flag ${key}`);
    }
    if (key === 'waterDepth' && source.some(entry => entry < 0)) throw new RangeError('Negative water depth');

    const enumCount = key === 'biome'
      ? WORLD_GROUND_BIOMES.length
      : key === 'material'
        ? WORLD_GROUND_MATERIALS.length
        : null;
    if (enumCount !== null && source.some(entry => !Number.isInteger(entry) || entry < 0 || entry >= enumCount)) {
      throw new RangeError(`Invalid enum world ground channel ${key}`);
    }
  }

  const versions = {};
  for (const key of ['hydrology', 'soil', 'vegetation', 'biomes', 'fire']) {
    versions[key] = integer(value.source?.versions?.[key], `${key}.version`);
  }
  if (!['primaryBiome', 'producer-worldSurfaceBiome'].includes(value.source?.surfacePolicy)) {
    throw new TypeError('Unknown World Simulator surface policy');
  }

  return freezeFrame({
    contract: WORLD_MAP_FRAME_CONTRACT,
    adapterVersion: WORLD_SIMULATOR_MAP_ADAPTER_VERSION,
    presentationOnly: true,
    source: {
      simulator: 'living-world-physics',
      version: WORLD_SIMULATOR_SOURCE_VERSION,
      seed: integer(value.source.seed, 'seed', -Number.MAX_SAFE_INTEGER),
      tick: value.source.tick === null ? null : integer(value.source.tick, 'tick'),
      surfacePolicy: value.source.surfacePolicy,
      versions,
    },
    grid,
    channels,
  });
}

export function buildWorldSnapshotEndpoint(baseUrl, zoneId) {
  const base = String(baseUrl ?? '').trim().replace(/\/+$/, '');
  const zone = String(zoneId ?? '').trim();
  if (!base) throw new TypeError('World Simulator baseUrl is required');
  if (!zone) throw new TypeError('World Simulator zoneId is required');
  return `${base}/world/zones/${encodeURIComponent(zone)}/snapshot`;
}

export async function fetchWorldMapFrame({
  baseUrl,
  zoneId,
  fetchImpl = globalThis.fetch,
  signal,
  adapterOptions,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  const endpoint = buildWorldSnapshotEndpoint(baseUrl, zoneId);
  const response = await fetchImpl(endpoint, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  if (!response?.ok) throw new Error(`World Simulator snapshot request failed: ${response?.status ?? 'unknown'}`);
  return adaptWorldSnapshotToMapFrame(await response.json(), adapterOptions);
}
