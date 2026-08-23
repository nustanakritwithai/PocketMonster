import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { pixelDiffRatio } from '../asset-presentation/four-side/apply.mjs';
import {
  GROUND_TILE,
  STAGE_GROUND_PROFILES,
  paintGroundGrid,
} from '../asset-presentation/blocky-ground.mjs';

const painterUrl = new URL('../asset-presentation/blocky-ground.mjs', import.meta.url);
const check = spawnSync(process.execPath, ['--check', fileURLToPath(painterUrl)], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr || 'stage atmosphere painter syntax failed');

const gameUrl = new URL('../game-v800.js', import.meta.url);
const gameSource = fs.readFileSync(gameUrl, 'utf8');
const gameCheck = spawnSync(process.execPath, ['--check', fileURLToPath(gameUrl)], { encoding: 'utf8' });
assert.equal(gameCheck.status, 0, gameCheck.stderr || 'stage atmosphere runtime syntax failed');

const EXPECTED_PROFILES = Object.freeze({
  dragon: Object.freeze({
    seedSalt: 0xd2a60001,
    colors: Object.freeze([[127, 29, 29], [251, 146, 60]]),
  }),
  fairy: Object.freeze({
    seedSalt: 0xfa170001,
    colors: Object.freeze([[244, 114, 182], [216, 180, 254]]),
  }),
  arena: Object.freeze({
    seedSalt: 0xa2e6a001,
    colors: Object.freeze([[120, 53, 15], [250, 204, 21]]),
  }),
  wildlands: Object.freeze({
    seedSalt: 0x71d1a001,
    colors: Object.freeze([[101, 163, 13], [54, 83, 20]]),
  }),
});

const EXPECTED_SIGNATURES = Object.freeze({
  dragon: '540c8f69',
  fairy: 'b555fef1',
  arena: '3cae4880',
  wildlands: 'a3f65061',
});

// These signatures were captured from the pre-change painter at the same fill.
// They prevent a new stage profile from silently changing an established biome.
const LEGACY_SIGNATURES = Object.freeze({
  grass: 'c87fdbe6',
  cave: 'ab46c7a4',
  frozen: 'b8d3e506',
  rocky: 'f91afb0b',
  ruins: '4481a46d',
  marsh: '51958c90',
  shrine: '0979762e',
  woods: 'cc807503',
  city: '18359e6b',
  factory: '1a9bad53',
});

function imageSignature(img) {
  let hash = 0x811c9dc5;
  for (const byte of img.rgba) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `runtime is missing ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`runtime function ${name} is not closed`);
}

function extractZoneBranch(functionSource, zone) {
  const marker = `else if(zone==='${zone}')`;
  const start = functionSource.indexOf(marker);
  assert.ok(start >= 0, `${zone}: missing dedicated branch`);
  const brace = functionSource.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < functionSource.length; i++) {
    if (functionSource[i] === '{') depth += 1;
    else if (functionSource[i] === '}') {
      depth -= 1;
      if (depth === 0) return functionSource.slice(start, i + 1);
    }
  }
  assert.fail(`${zone}: runtime branch is not closed`);
}

const RUNTIME_PROFILES = Object.freeze({
  'dragon-crater': Object.freeze({
    groundType: 'dragon',
    lighting: Object.freeze(['0.9', '1.45', '0xfdba74']),
    builders: Object.freeze(['makeCanyonWall', 'makeRock']),
    colors: Object.freeze(['0x7f1d1d', '0x991b1b', '0xf97316']),
  }),
  'fairy-garden': Object.freeze({
    groundType: 'fairy',
    lighting: Object.freeze(['1.5', '1.75', '0xf5d0fe']),
    builders: Object.freeze(['makeTree', 'makeShrineLantern', 'makeFlower']),
    colors: Object.freeze(['0xa855f7', '0xf9a8d4', '0xf5d0fe']),
  }),
  'combat-colosseum': Object.freeze({
    groundType: 'arena',
    lighting: Object.freeze(['1.3', '1.85', '0xfef3c7']),
    builders: Object.freeze(['makeRuinPillar']),
    colors: Object.freeze(['0x92400e', '0xfbbf24', '0xfacc15']),
  }),
  'normal-wildlands': Object.freeze({
    groundType: 'wildlands',
    lighting: Object.freeze(['1.55', '2', '0xe0f2fe']),
    builders: Object.freeze(['makeRock', 'makeTree', 'makeGrassTuft', 'makeFlower']),
    colors: Object.freeze(['0x4d7c0f', '0x65a30d', '0xd9f99d']),
  }),
});

const ENVIRONMENT_BUILDERS = Object.freeze([
  'makeCanyonWall',
  'makeRock',
  'makeTree',
  'makeShrineLantern',
  'makeFlower',
  'makeRuinPillar',
  'makeGrassTuft',
]);

assert.equal(Object.isFrozen(STAGE_GROUND_PROFILES), true, 'stage profile catalog is immutable');
assert.deepEqual(Object.keys(STAGE_GROUND_PROFILES), Object.keys(EXPECTED_PROFILES), 'stage profile catalog contains the four late-game biomes');

const zoneColor = 0x647348;
const grass = paintGroundGrid(zoneColor, 'grass');
const painted = {};

for (const [zoneType, expected] of Object.entries(EXPECTED_PROFILES)) {
  const profile = STAGE_GROUND_PROFILES[zoneType];
  assert.equal(Object.isFrozen(profile), true, `${zoneType}: profile is immutable`);
  assert.equal(Object.isFrozen(profile.marks), true, `${zoneType}: marks are immutable`);
  assert.equal(profile.seedSalt, expected.seedSalt, `${zoneType}: deterministic seed salt stays intentional`);
  assert.deepEqual(profile.marks.map(mark => [...mark.color]), expected.colors, `${zoneType}: palette stays biome-specific`);

  const first = paintGroundGrid(zoneColor, zoneType);
  const second = paintGroundGrid(zoneColor, zoneType);
  painted[zoneType] = first;
  assert.equal(first.width, GROUND_TILE, `${zoneType}: ground width`);
  assert.equal(first.height, GROUND_TILE, `${zoneType}: ground height`);
  assert.equal(pixelDiffRatio(first, second), 0, `${zoneType}: painter is deterministic`);
  assert.ok(pixelDiffRatio(first, grass) > 0.03, `${zoneType}: profile is visibly different from grass at the same fill`);
  assert.equal(imageSignature(first), EXPECTED_SIGNATURES[zoneType], `${zoneType}: branch, colors, and seeds produce the approved pixels`);
}

const zoneTypes = Object.keys(EXPECTED_PROFILES);
for (let i = 0; i < zoneTypes.length; i++) {
  for (let j = i + 1; j < zoneTypes.length; j++) {
    const left = zoneTypes[i];
    const right = zoneTypes[j];
    assert.ok(pixelDiffRatio(painted[left], painted[right]) > 0.03, `${left} and ${right} remain visually distinct`);
  }
}

for (const [zoneType, signature] of Object.entries(LEGACY_SIGNATURES)) {
  assert.equal(imageSignature(paintGroundGrid(zoneColor, zoneType)), signature, `${zoneType}: established painter output is preserved`);
}

const groundRuntime = extractFunction(gameSource, 'setZoneGround');
const lightingRuntime = extractFunction(gameSource, 'setZoneLighting');
const populateRuntime = extractFunction(gameSource, 'populateWorld');
const lightingSignatures = new Set();
const decorationSignatures = new Set();

for (const [zone, profile] of Object.entries(RUNTIME_PROFILES)) {
  const mappingPattern = new RegExp(`zone\\s*===\\s*'${zone}'\\s*\\?\\s*'${profile.groundType}'`);
  assert.match(groundRuntime, mappingPattern, `${zone}: setZoneGround maps to ${profile.groundType}`);

  const lightingBranch = extractZoneBranch(lightingRuntime, zone);
  assert.match(lightingBranch, new RegExp(`hemi\\.intensity\\s*=\\s*${profile.lighting[0].replace('.', '\\.')}\\s*;`), `${zone}: hemisphere intensity stays intentional`);
  assert.match(lightingBranch, new RegExp(`sun\\.intensity\\s*=\\s*${profile.lighting[1].replace('.', '\\.')}\\s*;`), `${zone}: sun intensity stays intentional`);
  assert.match(lightingBranch, new RegExp(`sun\\.color\\.setHex\\(${profile.lighting[2]}\\)`), `${zone}: sun palette stays intentional`);
  lightingSignatures.add(profile.lighting.join('|'));

  const environmentBranch = extractZoneBranch(populateRuntime, zone);
  for (const builder of profile.builders) {
    assert.match(environmentBranch, new RegExp(`${builder}\\(`), `${zone}: environment uses ${builder}`);
  }
  for (const color of profile.colors) {
    assert.match(environmentBranch, new RegExp(color), `${zone}: environment keeps ${color} in its palette`);
  }
  assert.match(environmentBranch, /makeStageBeacon\(/, `${zone}: objective route keeps deterministic stage beacons`);
  assert.doesNotMatch(environmentBranch, /Math\.random\(/, `${zone}: environment placement is deterministic`);
  decorationSignatures.add(ENVIRONMENT_BUILDERS.filter(builder => environmentBranch.includes(`${builder}(`)).sort().join('|'));
}

assert.equal(lightingSignatures.size, 4, 'late-game stages have four distinct lighting profiles');
assert.equal(decorationSignatures.size, 4, 'late-game stages have four distinct environment builder signatures');

console.log('V8.1.1 stage atmosphere profiles: PASS (paint + runtime wiring + four distinct environments)');
