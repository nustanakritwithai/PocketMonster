export const WORLD_SIMULATOR_MAP_ADAPTER_VERSION = '1.0.0';
export const WORLD_MAP_FRAME_CONTRACT = 'pocketmonster.world-map-frame.v1';

const TERRAIN_ALIASES = Object.freeze({
  deepwater: 'water',
  shallowwater: 'water',
  ocean: 'water',
  sea: 'water',
  lake: 'water',
  river: 'water',
  stream: 'water',
  water: 'water',
  marsh: 'wetland',
  swamp: 'wetland',
  wetland: 'wetland',
  beach: 'sand',
  coast: 'sand',
  coastal: 'sand',
  sand: 'sand',
  dune: 'sand',
  cliff: 'rock',
  mountain: 'rock',
  rocky: 'rock',
  rock: 'rock',
  stone: 'rock',
  ice: 'snow',
  frozen: 'snow',
  snow: 'snow',
  tundra: 'snow',
  grassland: 'grass',
  meadow: 'grass',
  forest: 'forest',
  jungle: 'forest',
  soil: 'soil',
  dirt: 'soil',
  ground: 'soil',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(finite(value), 0, 1);
}

function normalizedScalar(value) {
  const number = Math.max(0, finite(value));
  return number <= 1 ? number : number / (1 + number);
}

function normalizedLabel(value, fallback = 'unknown') {
  const text = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  return text || fallback;
}

function normalizeTerrain(value) {
  const key = normalizedLabel(value);
  return TERRAIN_ALIASES[key] || key;
}

function arrayLike(value) {
  return Array.isArray(value) || ArrayBuffer.isView(value);
}

function readArrayValue(container, names, index) {
  if (!container || typeof container !== 'object') return undefined;
  for (const name of names) {
    const channel = container[name];
    if (arrayLike(channel) && index < channel.length) return channel[index];
  }
  return undefined;
}

function readNestedValue(snapshot, groups, names, index) {
  for (const groupName of groups) {
    const value = readArrayValue(snapshot?.[groupName], names, index);
    if (value !== undefined) return value;
  }
  return readArrayValue(snapshot, names, index);
}

function readCellValue(cell, paths, fallback) {
  for (const path of paths) {
    let value = cell;
    for (const part of path.split('.')) {
      value = value?.[part];
      if (value === undefined || value === null) break;
    }
    if (value !== undefined && value !== null) return value;
  }
  return fallback;
}

function sourceCells(snapshot) {
  if (Array.isArray(snapshot?.cells)) return snapshot.cells;
  if (Array.isArray(snapshot?.grid?.cells)) return snapshot.grid.cells;
  if (Array.isArray(snapshot?.world?.cells)) return snapshot.world.cells;
  return null;
}

function resolveDimensions(snapshot) {
  const width = Math.trunc(finite(
    snapshot?.grid?.width ?? snapshot?.world?.width ?? snapshot?.width ?? snapshot?.columns,
  ));
  const height = Math.trunc(finite(
    snapshot?.grid?.height ?? snapshot?.world?.height ?? snapshot?.height ?? snapshot?.rows,
  ));
  if (width <= 0 || height <= 0) {
    throw new TypeError('World snapshot must expose positive grid width and height.');
  }
  return { width, height };
}

function readWorldChannel(snapshot, cell, index, cellPaths, groupNames, channelNames, fallback = 0) {
  const direct = readCellValue(cell, cellPaths, undefined);
  if (direct !== undefined) return direct;
  const channel = readNestedValue(snapshot, groupNames, channelNames, index);
  return channel === undefined ? fallback : channel;
}

function classifySurface({ terrain, soilType, surfaceWater, soilMoisture, vegetationDensity, fireSeverity }) {
  if (terrain === 'water' || surfaceWater >= 0.35) return 'water';
  if (terrain === 'snow') return 'snow';
  if (terrain === 'wetland' || (surfaceWater >= 0.06 && soilMoisture >= 0.68)) return 'wetland';
  if (terrain === 'sand' || soilType === 'sand' || soilType === 'coastal') return 'sand';
  if (terrain === 'rock' || soilType === 'rocky') return 'rock';
  if (fireSeverity >= 0.45) return 'burned';
  if (terrain === 'forest' || vegetationDensity >= 0.55) return 'vegetated';
  if (terrain === 'grass') return 'grass';
  return 'soil';
}

function materialProfile(surfaceClass, state) {
  const wetness = clamp01(
    state.surfaceWater * 1.9 + state.soilMoisture * 0.58 + state.humidity * 0.12,
  );
  const moss = clamp01(state.vegetationDensity * state.soilMoisture * (0.55 + state.soilHealth * 0.45));
  const puddle = clamp01(state.surfaceWater * 3.2);
  const char = clamp01(state.fireSeverity);
  const erosion = clamp01(state.erosion);
  const deposition = clamp01(state.deposition);

  const base = {
    water:      { roughness: 0.16, normalStrength: 0.36, displacement: 0.02 },
    wetland:    { roughness: 0.48, normalStrength: 0.72, displacement: 0.08 },
    sand:       { roughness: 0.82, normalStrength: 0.54, displacement: 0.10 },
    rock:       { roughness: 0.76, normalStrength: 1.00, displacement: 0.22 },
    snow:       { roughness: 0.58, normalStrength: 0.42, displacement: 0.12 },
    burned:     { roughness: 0.88, normalStrength: 0.90, displacement: 0.11 },
    vegetated:  { roughness: 0.86, normalStrength: 0.86, displacement: 0.14 },
    grass:      { roughness: 0.84, normalStrength: 0.80, displacement: 0.12 },
    soil:       { roughness: 0.90, normalStrength: 0.74, displacement: 0.10 },
  }[surfaceClass] || { roughness: 0.86, normalStrength: 0.70, displacement: 0.10 };

  return Object.freeze({
    family: surfaceClass,
    wetness,
    puddle,
    moss,
    char,
    erosion,
    deposition,
    roughness: clamp(base.roughness - wetness * 0.34 + char * 0.08, 0.08, 1),
    normalStrength: clamp(base.normalStrength + erosion * 0.18, 0, 1.35),
    displacement: clamp(base.displacement + erosion * 0.06 + deposition * 0.04, 0, 0.35),
  });
}

function adaptCell(snapshot, cell, index, width, options) {
  const x = Number.isInteger(cell?.x) ? cell.x : index % width;
  const z = Number.isInteger(cell?.z) ? cell.z : Math.floor(index / width);

  const terrain = normalizeTerrain(readWorldChannel(
    snapshot, cell, index,
    ['terrainType', 'terrain.type', 'terrain'],
    ['world', 'terrain', 'channels'],
    ['terrainType', 'terrainTypes', 'terrain'],
    'soil',
  ));
  const soilType = normalizedLabel(readWorldChannel(
    snapshot, cell, index,
    ['soilType', 'soil.type'],
    ['soil', 'channels'],
    ['soilType', 'soilTypes', 'type'],
    'unknown',
  ));
  const biome = normalizedLabel(readWorldChannel(
    snapshot, cell, index,
    ['biome', 'biomeType', 'biome.type'],
    ['world', 'biome', 'channels'],
    ['biome', 'biomeType', 'biomes'],
    'unknown',
  ));

  const elevation = finite(readWorldChannel(
    snapshot, cell, index,
    ['elevation', 'height', 'terrain.elevation'],
    ['world', 'terrain', 'channels'],
    ['elevation', 'height', 'heights'],
  ));
  const surfaceWater = normalizedScalar(readWorldChannel(
    snapshot, cell, index,
    ['surfaceWater', 'water.surface', 'hydrology.surfaceWater'],
    ['hydrology', 'water', 'channels'],
    ['surfaceWater', 'surfaceWaterDepth', 'waterDepth'],
  ));
  const soilMoisture = clamp01(readWorldChannel(
    snapshot, cell, index,
    ['soilMoisture', 'soil.waterContent', 'waterContent'],
    ['soil', 'hydrology', 'channels'],
    ['soilMoisture', 'waterContent'],
  ));
  const humidity = clamp01(readWorldChannel(
    snapshot, cell, index,
    ['humidity', 'climate.humidity'],
    ['climate', 'channels'],
    ['humidity', 'relativeHumidity'],
  ));
  const temperature = finite(readWorldChannel(
    snapshot, cell, index,
    ['temperature', 'soil.temperature', 'climate.temperature'],
    ['climate', 'soil', 'channels'],
    ['temperature', 'airTemperature', 'soilTemperature'],
    options.defaultTemperature,
  ), options.defaultTemperature);
  const vegetationDensity = normalizedScalar(readWorldChannel(
    snapshot, cell, index,
    ['vegetationDensity', 'vegetation.cover', 'vegetation.biomass'],
    ['vegetation', 'channels'],
    ['vegetationDensity', 'cover', 'biomass', 'livingBiomass'],
  ));
  const soilHealth = clamp01(readWorldChannel(
    snapshot, cell, index,
    ['soilHealth', 'soil.health'],
    ['soil', 'channels'],
    ['soilHealth', 'health'],
    0.5,
  ));
  const fireSeverity = clamp01(readWorldChannel(
    snapshot, cell, index,
    ['fireSeverity', 'fire.severity', 'burnSeverity'],
    ['fire', 'channels'],
    ['severity', 'fireSeverity', 'burnSeverity'],
  ));
  const erosion = normalizedScalar(readWorldChannel(
    snapshot, cell, index,
    ['erosion', 'erosion.amount'],
    ['erosion', 'channels'],
    ['erosion', 'erosionAmount', 'soilLoss'],
  ));
  const deposition = normalizedScalar(readWorldChannel(
    snapshot, cell, index,
    ['deposition', 'erosion.deposition'],
    ['erosion', 'channels'],
    ['deposition', 'depositionAmount', 'sedimentDeposit'],
  ));

  const state = Object.freeze({
    terrain,
    biome,
    soilType,
    elevation,
    surfaceWater,
    soilMoisture,
    humidity,
    temperature,
    vegetationDensity,
    soilHealth,
    fireSeverity,
    erosion,
    deposition,
  });
  const surfaceClass = classifySurface(state);

  return Object.freeze({
    index,
    x,
    z,
    worldX: options.originX + x * options.cellSize,
    worldZ: options.originZ + z * options.cellSize,
    worldY: elevation * options.elevationScale,
    state,
    surfaceClass,
    material: materialProfile(surfaceClass, state),
  });
}

export function adaptWorldSnapshotToMapFrame(snapshot, options = {}) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new TypeError('World snapshot must be an object.');
  }

  const { width, height } = resolveDimensions(snapshot);
  const count = width * height;
  const cells = sourceCells(snapshot);
  if (cells && cells.length !== count) {
    throw new RangeError(`World snapshot cell count mismatch: expected ${count}, received ${cells.length}.`);
  }

  const normalizedOptions = Object.freeze({
    cellSize: Math.max(0.001, finite(options.cellSize, 1)),
    elevationScale: finite(options.elevationScale, 1),
    originX: finite(options.originX, 0),
    originZ: finite(options.originZ, 0),
    defaultTemperature: finite(options.defaultTemperature, 24),
  });

  const mapped = new Array(count);
  for (let index = 0; index < count; index++) {
    mapped[index] = adaptCell(snapshot, cells?.[index] || null, index, width, normalizedOptions);
  }

  const tick = Math.trunc(finite(
    snapshot.worldTick ?? snapshot.tick ?? snapshot.simulationTick ?? snapshot.time?.tick,
    0,
  ));
  const sourceVersion = String(
    snapshot.sourceStateVersion ?? snapshot.version ?? snapshot.buildInfo?.version ?? 'unknown',
  );

  return Object.freeze({
    contract: WORLD_MAP_FRAME_CONTRACT,
    adapterVersion: WORLD_SIMULATOR_MAP_ADAPTER_VERSION,
    source: 'living-world-physics',
    sourceVersion,
    tick,
    grid: Object.freeze({
      width,
      height,
      count,
      cellSize: normalizedOptions.cellSize,
      elevationScale: normalizedOptions.elevationScale,
      originX: normalizedOptions.originX,
      originZ: normalizedOptions.originZ,
    }),
    cells: Object.freeze(mapped),
  });
}

export function buildWorldSnapshotEndpoint(baseUrl, zoneId) {
  const base = String(baseUrl ?? '').trim().replace(/\/+$/, '');
  const zone = String(zoneId ?? '').trim();
  if (!base) throw new TypeError('World Simulator baseUrl is required.');
  if (!zone) throw new TypeError('World Simulator zoneId is required.');
  return `${base}/world/zones/${encodeURIComponent(zone)}/snapshot`;
}

export async function fetchWorldMapFrame({
  baseUrl,
  zoneId,
  fetchImpl = globalThis.fetch,
  signal,
  adapterOptions,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');
  const endpoint = buildWorldSnapshotEndpoint(baseUrl, zoneId);
  const response = await fetchImpl(endpoint, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response?.ok) {
    throw new Error(`World Simulator snapshot request failed: ${response?.status ?? 'unknown'}`);
  }
  return adaptWorldSnapshotToMapFrame(await response.json(), adapterOptions);
}
