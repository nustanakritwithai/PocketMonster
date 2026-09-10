import assert from 'node:assert/strict';
import {
  WORLD_MAP_FRAME_CONTRACT,
  adaptWorldSnapshotToMapFrame,
  buildWorldSnapshotEndpoint,
  fetchWorldMapFrame,
} from '../world-simulator-map-adapter-v1.mjs';

const frame = adaptWorldSnapshotToMapFrame({
  width: 2,
  height: 2,
  worldTick: 42,
  version: 'living-world-test',
  cells: [
    { x: 0, z: 0, terrainType: 'RIVER', surfaceWater: 0.8, soilMoisture: 1 },
    { x: 1, z: 0, terrainType: 'MOUNTAIN', soil: { type: 'rocky', health: 0.3 }, erosion: 0.4 },
    { x: 0, z: 1, terrainType: 'FOREST', vegetation: { cover: 0.9 }, soilMoisture: 0.7, humidity: 0.8 },
    { x: 1, z: 1, terrainType: 'GRASSLAND', fire: { severity: 0.8 }, soilMoisture: 0.2 },
  ],
}, { cellSize: 2, elevationScale: 3, originX: -1, originZ: 5 });

assert.equal(frame.contract, WORLD_MAP_FRAME_CONTRACT);
assert.equal(frame.tick, 42);
assert.equal(frame.grid.width, 2);
assert.equal(frame.grid.height, 2);
assert.equal(frame.cells.length, 4);
assert.equal(frame.cells[0].surfaceClass, 'water');
assert.equal(frame.cells[1].surfaceClass, 'rock');
assert.equal(frame.cells[2].surfaceClass, 'vegetated');
assert.equal(frame.cells[3].surfaceClass, 'burned');
assert.equal(frame.cells[0].worldX, -1);
assert.equal(frame.cells[0].worldZ, 5);
assert.equal(frame.cells[1].worldX, 1);
assert.ok(frame.cells[0].material.wetness > 0.9);
assert.ok(frame.cells[2].material.moss > 0.4);
assert.ok(frame.cells[3].material.char > 0.7);
assert.ok(Object.isFrozen(frame));
assert.ok(Object.isFrozen(frame.cells));
assert.ok(Object.isFrozen(frame.cells[0]));
assert.ok(Object.isFrozen(frame.cells[0].state));
assert.ok(Object.isFrozen(frame.cells[0].material));

const channelFrame = adaptWorldSnapshotToMapFrame({
  grid: { width: 2, height: 1 },
  simulationTick: 9,
  terrain: {
    terrainTypes: ['beach', 'marsh'],
    elevation: [0.1, 0.2],
  },
  hydrology: {
    surfaceWater: [0.01, 0.1],
  },
  soil: {
    soilTypes: ['coastal', 'wetland'],
    waterContent: [0.25, 0.9],
    health: [0.5, 0.8],
  },
  vegetation: {
    cover: [0.1, 0.5],
  },
});

assert.equal(channelFrame.cells[0].surfaceClass, 'sand');
assert.equal(channelFrame.cells[1].surfaceClass, 'wetland');
assert.equal(channelFrame.cells[1].state.soilMoisture, 0.9);

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
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          width: 1,
          height: 1,
          tick: 3,
          cells: [{ terrainType: 'soil', soilMoisture: 0.4 }],
        };
      },
    };
  },
});
assert.equal(requestedUrl, 'https://world.example/api/world/zones/emerald-forest/snapshot');
assert.equal(fetched.tick, 3);
assert.equal(fetched.cells[0].surfaceClass, 'soil');

assert.throws(
  () => adaptWorldSnapshotToMapFrame({ width: 2, height: 2, cells: [{}] }),
  /cell count mismatch/,
);
assert.throws(
  () => adaptWorldSnapshotToMapFrame({ width: 0, height: 1 }),
  /positive grid width and height/,
);

console.log('world-simulator-map-adapter-v1: PASS');
