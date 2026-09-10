import assert from 'node:assert/strict';
import {
  WORLD_GROUND_BIOMES,
  WORLD_GROUND_MATERIALS,
  WORLD_MAP_FRAME_CONTRACT,
  WORLD_SIMULATOR_SOURCE_VERSION,
  adaptWorldSnapshotToMapFrame,
  buildWorldSnapshotEndpoint,
  fetchWorldMapFrame,
  readWorldMapFrame,
} from '../world-simulator-map-adapter-v1.mjs';

function makeWorldSnapshot() {
  const gridWidth = 2;
  const gridHeight = 2;
  const terrain = [
    { terrainType: 'shallowWater', elevation: 0.10, totalWaterHeight: 0.35, surfaceWater: 0.25, isOceanCell: true, isFlooded: false },
    { terrainType: 'grass', elevation: 0.20, totalWaterHeight: 0.20, surfaceWater: 0, isOceanCell: false, isFlooded: false },
    { terrainType: 'forest', elevation: 0.30, totalWaterHeight: 0.36, surfaceWater: 0.06, isOceanCell: false, isFlooded: true },
    { terrainType: 'rock', elevation: 0.50, totalWaterHeight: 0.50, surfaceWater: 0, isOceanCell: false, isFlooded: false },
  ].map((cell, index) => ({ index, column: index % gridWidth, row: Math.floor(index / gridWidth), ...cell }));
  const indexed = rows => rows.map((cell, index) => ({ index, ...cell }));
  return {
    seed: 29051,
    gridWidth,
    gridHeight,
    cellWidth: 3,
    cellHeight: 4,
    worldWidth: 6,
    worldHeight: 8,
    cells: terrain,
    hydrology: { version: 11 },
    soil: {
      version: 12,
      cells: indexed([
        { active: false, soilType: 'none', waterContent: 0, saturationCapacity: 0 },
        { active: true, soilType: 'loam', waterContent: 0.35, saturationCapacity: 0.70 },
        { active: true, soilType: 'peat', waterContent: 0.72, saturationCapacity: 0.80 },
        { active: true, soilType: 'rocky', waterContent: 0.08, saturationCapacity: 0.40 },
      ]),
    },
    vegetation: {
      version: 13,
      cells: indexed([
        { active: false, coverage: 0 },
        { active: true, coverage: 0.62 },
        { active: true, coverage: 0.91 },
        { active: true, coverage: 0.12 },
      ]),
    },
    biomes: {
      version: 14,
      cells: indexed([
        { primaryBiome: 'ocean' },
        { primaryBiome: 'grassland' },
        { primaryBiome: 'forest' },
        { primaryBiome: 'mountain' },
      ]),
    },
    fire: {
      version: 15,
      cells: indexed([
        { burnSeverity: 0 },
        { burnSeverity: 0.10 },
        { burnSeverity: 0.35 },
        { burnSeverity: 0.82 },
      ]),
    },
  };
}

const source = { tick: 42, world: makeWorldSnapshot() };
const before = JSON.stringify(source);
const frame = adaptWorldSnapshotToMapFrame(source);

assert.equal(frame.contract, WORLD_MAP_FRAME_CONTRACT);
assert.equal(frame.contract, 'pocketmonster.world-map-frame.v2');
assert.equal(frame.source.version, WORLD_SIMULATOR_SOURCE_VERSION);
assert.equal(frame.source.version, '20.9.4');
assert.equal(frame.source.tick, 42);
assert.equal(frame.grid.gridWidth, 2);
assert.equal(frame.grid.gridHeight, 2);
assert.equal(frame.grid.count, 4);
assert.equal(frame.grid.cellWidth, 3);
assert.equal(frame.grid.cellHeight, 4);
assert.deepEqual(frame.channels.elevation, [0.10, 0.20, 0.30, 0.50]);
assert.deepEqual(frame.channels.waterHeight, [0.35, 0.20, 0.36, 0.50], 'totalWaterHeight must be used verbatim');
assert.deepEqual(frame.channels.waterDepth, [0.25, 0, 0.06, 0]);
assert.equal(frame.channels.wetness[0], 0, 'inactive/no-soil water has no soil wetness');
assert.equal(frame.channels.wetness[1], 0.5, 'wetness is waterContent/saturationCapacity');
assert.equal(frame.channels.wetness[2], 0.9);
assert.equal(frame.channels.vegetation[2], 0.91);
assert.equal(frame.channels.burn[3], 0.82);
assert.equal(frame.channels.biome[0], WORLD_GROUND_BIOMES.indexOf('ocean'));
assert.equal(frame.channels.material[0], WORLD_GROUND_MATERIALS.indexOf('sand'));
assert.equal(frame.channels.material[1], WORLD_GROUND_MATERIALS.indexOf('grass'));
assert.equal(frame.channels.material[2], WORLD_GROUND_MATERIALS.indexOf('forest-floor'));
assert.equal(frame.channels.material[3], WORLD_GROUND_MATERIALS.indexOf('rock'));
assert.deepEqual(frame.channels.ocean, [1, 0, 0, 0]);
assert.deepEqual(frame.channels.flooded, [0, 0, 1, 0]);
assert.deepEqual(frame.source.versions, { hydrology: 11, soil: 12, vegetation: 13, biomes: 14, fire: 15 });
assert.equal(frame.source.surfacePolicy, 'primaryBiome');
assert.equal(JSON.stringify(source), before, 'projection must not mutate World Simulator state');

assert.ok(Object.isFrozen(frame));
assert.ok(Object.isFrozen(frame.grid));
assert.ok(Object.isFrozen(frame.source));
assert.ok(Object.isFrozen(frame.source.versions));
assert.ok(Object.values(frame.channels).every(Object.isFrozen));

const producerSurfaceFrame = adaptWorldSnapshotToMapFrame(source, {
  surfaceBiome: (_world, index) => index === 3 ? 'burned' : source.world.biomes.cells[index].primaryBiome,
});
assert.equal(producerSurfaceFrame.source.surfacePolicy, 'producer-worldSurfaceBiome');
assert.equal(producerSurfaceFrame.channels.material[3], WORLD_GROUND_MATERIALS.indexOf('burned'));

const detached = readWorldMapFrame(JSON.parse(JSON.stringify(frame)));
assert.notEqual(detached.channels.elevation, frame.channels.elevation, 'imported channel arrays are detached');
assert.deepEqual(detached.channels.elevation, frame.channels.elevation);
assert.ok(Object.values(detached.channels).every(Object.isFrozen));

assert.equal(
  buildWorldSnapshotEndpoint('https://world.example/api/', 'emerald forest'),
  'https://world.example/api/world/zones/emerald%20forest/snapshot',
);

let requestedUrl = '';
const fetched = await fetchWorldMapFrame({
  baseUrl: 'https://world.example/api',
  zoneId: 'emerald-forest',
  fetchImpl: async (url, init) => {
    requestedUrl = url;
    assert.equal(init.method, 'GET');
    assert.equal(init.headers.Accept, 'application/json');
    assert.equal(init.cache, 'no-store');
    return { ok: true, status: 200, async json() { return source; } };
  },
});
assert.equal(requestedUrl, 'https://world.example/api/world/zones/emerald-forest/snapshot');
assert.equal(fetched.source.tick, 42);

assert.throws(
  () => adaptWorldSnapshotToMapFrame(source, { sourceVersion: '20.9.5' }),
  /Unverified World Simulator producer version/,
);
assert.throws(
  () => adaptWorldSnapshotToMapFrame(source, { surfaceBiome: 'forest' }),
  /producer-owned function/,
);

{
  const broken = makeWorldSnapshot();
  broken.cells[2].index = 99;
  assert.throws(() => adaptWorldSnapshotToMapFrame({ tick: 1, world: broken }), /canonical row-major indices/);
}
{
  const broken = makeWorldSnapshot();
  broken.cells[2].column = 9;
  assert.throws(() => adaptWorldSnapshotToMapFrame({ tick: 1, world: broken }), /coordinate\/index mismatch/);
}
{
  const broken = makeWorldSnapshot();
  broken.worldWidth = 999;
  assert.throws(() => adaptWorldSnapshotToMapFrame({ tick: 1, world: broken }), /Inconsistent World Simulator dimensions/);
}
{
  const broken = JSON.parse(JSON.stringify(frame));
  broken.channels.waterDepth[0] = -1;
  assert.throws(() => readWorldMapFrame(broken), /Negative water depth/);
}

console.log('world-simulator-map-adapter-v2: PASS');
