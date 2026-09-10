import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  WORLD_GROUND_MATERIALS,
  adaptWorldSnapshotToMapFrame,
} from '../world-simulator-map-adapter-v1.mjs';
import {
  WORLD_GROUND_RENDERER_SCHEMA,
  WORLD_GROUND_QUALITY,
  buildWorldGroundGeometry,
} from '../world-simulator-ground-renderer-v1.mjs';

function makeFrame() {
  const width = 2;
  const indexed = rows => rows.map((cell, index) => ({ index, ...cell }));
  const cells = [
    { terrainType: 'shallowWater', elevation: 0.10, totalWaterHeight: 0.35, surfaceWater: 0.25, isOceanCell: true, isFlooded: false },
    { terrainType: 'grass', elevation: 0.20, totalWaterHeight: 0.20, surfaceWater: 0, isOceanCell: false, isFlooded: false },
    { terrainType: 'forest', elevation: 0.30, totalWaterHeight: 0.36, surfaceWater: 0.06, isOceanCell: false, isFlooded: true },
    { terrainType: 'rock', elevation: 0.50, totalWaterHeight: 0.50, surfaceWater: 0, isOceanCell: false, isFlooded: false },
  ].map((cell, index) => ({ index, column: index % width, row: Math.floor(index / width), ...cell }));
  const world = {
    seed: 29051,
    gridWidth: width,
    gridHeight: 2,
    cellWidth: 3,
    cellHeight: 4,
    worldWidth: 6,
    worldHeight: 8,
    cells,
    hydrology: { version: 1 },
    soil: { version: 2, cells: indexed([
      { active: false, soilType: 'none', waterContent: 0, saturationCapacity: 0 },
      { active: true, soilType: 'loam', waterContent: 0.35, saturationCapacity: 0.7 },
      { active: true, soilType: 'peat', waterContent: 0.72, saturationCapacity: 0.8 },
      { active: true, soilType: 'rocky', waterContent: 0.08, saturationCapacity: 0.4 },
    ]) },
    vegetation: { version: 3, cells: indexed([
      { active: false, coverage: 0 }, { active: true, coverage: 0.6 },
      { active: true, coverage: 0.9 }, { active: true, coverage: 0.1 },
    ]) },
    biomes: { version: 4, cells: indexed([
      { primaryBiome: 'ocean' }, { primaryBiome: 'grassland' },
      { primaryBiome: 'forest' }, { primaryBiome: 'mountain' },
    ]) },
    fire: { version: 5, cells: indexed([
      { burnSeverity: 0 }, { burnSeverity: 0.1 }, { burnSeverity: 0.3 }, { burnSeverity: 0.8 },
    ]) },
  };
  return adaptWorldSnapshotToMapFrame({ tick: 7, world });
}

const frame = makeFrame();
const frozenBefore = JSON.stringify(frame);
const geometry = buildWorldGroundGeometry(frame, { textureMeters: 2.5 });

assert.equal(WORLD_GROUND_RENDERER_SCHEMA, 'pocketmonster.world-ground-renderer.v1');
assert.equal(WORLD_GROUND_QUALITY.low.maxTextureSize, 512);
assert.equal(WORLD_GROUND_QUALITY.medium.maxTextureSize, 1024);
assert.equal(WORLD_GROUND_QUALITY.high.maxTextureSize, 2048);
assert.equal(geometry.terrain.length, WORLD_GROUND_MATERIALS.length);

const vertexCount = batch => batch.position.length / 3;
const indexCount = batch => batch.index.length;
const materialBatch = name => geometry.terrain[WORLD_GROUND_MATERIALS.indexOf(name)];

assert.equal(vertexCount(materialBatch('sand')), 4, 'ocean surface is one batched sand cell');
assert.equal(vertexCount(materialBatch('grass')), 4, 'grassland is one batched cell');
assert.equal(vertexCount(materialBatch('forest-floor')), 4, 'forest is one batched cell');
assert.equal(vertexCount(materialBatch('rock')), 4, 'mountain is one batched rock cell');
assert.equal(indexCount(materialBatch('sand')), 6);
assert.equal(vertexCount(geometry.water), 8, 'water mesh includes authoritative waterDepth/ocean/flooded cells');
assert.equal(indexCount(geometry.water), 12);

const sand = materialBatch('sand');
assert.deepEqual(sand.position.slice(0, 3), [-3, 0.1, -4], 'WorldSim map is centered without changing authoritative coordinates');
assert.deepEqual(sand.position.slice(3, 6), [0, 0.15000000596046448, -4], 'shared border height blends adjacent cell elevations visually');
assert.ok(Math.abs(geometry.water.position[1] - 0.358) < 1e-6, 'water surface uses totalWaterHeight plus tiny presentation-only z-fighting offset');
assert.equal(sand.uv[0], -3 / 2.5);
assert.equal(sand.uv[1], -4 / 2.5);
assert.deepEqual(sand.surface.slice(0, 3), [0, 0, 0], 'surface vertex data comes from WorldSim wetness/burn/vegetation channels');

for (const batch of [...geometry.terrain, geometry.water]) {
  for (const number of [...batch.position, ...batch.normal, ...batch.uv, ...batch.surface]) {
    assert.ok(Number.isFinite(number), 'ground geometry may not contain NaN/Infinity');
  }
  for (let i = 0; i < batch.normal.length; i += 3) {
    const length = Math.hypot(batch.normal[i], batch.normal[i + 1], batch.normal[i + 2]);
    assert.ok(Math.abs(length - 1) < 1e-5, 'ground normals must remain normalized');
  }
}
assert.equal(JSON.stringify(frame), frozenBefore, 'geometry generation must not mutate the immutable map frame');

const source = fs.readFileSync(new URL('../world-simulator-ground-renderer-v1.mjs', import.meta.url), 'utf8');
assert.match(source, /new THREE\.MeshStandardMaterial/, 'ground uses Three.js PBR-ready MeshStandardMaterial');
assert.match(source, /map['"]?:?\s*['"]?map|albedo:\s*'map'/, 'albedo map slot is supported');
assert.match(source, /normal:\s*'normalMap'/, 'normal map slot is supported');
assert.match(source, /roughness:\s*'roughnessMap'/, 'roughness map slot is supported');
assert.match(source, /ao:\s*'aoMap'/, 'AO map slot is supported');
assert.match(source, /macroNoise/, 'shader includes macro-scale anti-tiling variation');
assert.match(source, /groundWetness/, 'shader consumes presentation wetness');
assert.match(source, /groundBurn/, 'shader consumes authoritative burn presentation channel');
assert.match(source, /frame\.channels\.waterHeight\[cellIndex\]/, 'water uses authoritative total water height');
assert.doesNotMatch(source, /new THREE\.WebGLRenderer|SimulationClock|setInterval\(|setTimeout\(|fetch\(/,
  'renderer must not own renderer loop, simulation clock or network polling');
assert.doesNotMatch(source, /waterContent\s*=|surfaceWater\s*=|burnSeverity\s*=|primaryBiome\s*=/,
  'renderer must not mutate World Simulator truth');

console.log('world-simulator-ground-renderer-v1: PASS');
