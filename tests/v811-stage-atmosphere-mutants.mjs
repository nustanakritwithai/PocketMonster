import assert from 'node:assert/strict';
import fs from 'node:fs';

import { paintGroundGrid } from '../asset-presentation/blocky-ground.mjs';

const painterUrl = new URL('../asset-presentation/blocky-ground.mjs', import.meta.url);
const painterSource = fs.readFileSync(painterUrl, 'utf8');
const gameSource = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const zoneColor = 0x647348;
const zoneTypes = Object.freeze(['dragon', 'fairy', 'arena', 'wildlands']);

function imageSignature(img) {
  let hash = 0x811c9dc5;
  for (const byte of img.rgba) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const approved = Object.fromEntries(zoneTypes.map(zoneType => [zoneType, imageSignature(paintGroundGrid(zoneColor, zoneType))]));

function mutateOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  assert.ok(first >= 0, `${label}: mutation target drifted`);
  assert.equal(source.indexOf(needle, first + needle.length), -1, `${label}: mutation target must be unique`);
  const mutant = source.slice(0, first) + replacement + source.slice(first + needle.length);
  assert.notEqual(mutant, source, `${label}: mutation was applied`);
  return mutant;
}

let serial = 0;
async function importMutant(mutant, label) {
  const tagged = `${mutant}\n//# sourceURL=v811-stage-atmosphere-${label}-${++serial}.mjs`;
  return import(`data:text/javascript;base64,${Buffer.from(tagged).toString('base64')}`);
}

function assertApprovedPixels(module) {
  for (const zoneType of zoneTypes) {
    assert.equal(
      imageSignature(module.paintGroundGrid(zoneColor, zoneType)),
      approved[zoneType],
      `${zoneType}: approved stage atmosphere pixels changed`,
    );
  }
}

async function expectKilled(label, needle, replacement) {
  const module = await importMutant(mutateOnce(painterSource, needle, replacement, label), label.replaceAll(' ', '-'));
  let killed = false;
  try {
    assertApprovedPixels(module);
  } catch {
    killed = true;
  }
  assert.equal(killed, true, `${label}: stage atmosphere regression survived`);
}

const painterMutants = [
  ['dragon branch', '  dragon: Object.freeze({', '  dragonMuted: Object.freeze({'],
  ['fairy branch', '  fairy: Object.freeze({', '  fairyMuted: Object.freeze({'],
  ['arena branch', '  arena: Object.freeze({', '  arenaMuted: Object.freeze({'],
  ['wildlands branch', '  wildlands: Object.freeze({', '  wildlandsMuted: Object.freeze({'],
  ['dragon color', 'color: Object.freeze([251, 146, 60])', 'color: Object.freeze([0, 100, 0])'],
  ['fairy color', 'color: Object.freeze([244, 114, 182])', 'color: Object.freeze([0, 100, 0])'],
  ['arena color', 'color: Object.freeze([250, 204, 21])', 'color: Object.freeze([0, 100, 0])'],
  ['wildlands color', 'color: Object.freeze([54, 83, 20])', 'color: Object.freeze([0, 100, 0])'],
  ['dragon seed', 'seedSalt: 0xd2a60001', 'seedSalt: 0xd2a60002'],
  ['fairy seed', 'seedSalt: 0xfa170001', 'seedSalt: 0xfa170002'],
  ['arena seed', 'seedSalt: 0xa2e6a001', 'seedSalt: 0xa2e6a002'],
  ['wildlands seed', 'seedSalt: 0x71d1a001', 'seedSalt: 0x71d1a002'],
];

for (const [label, needle, replacement] of painterMutants) {
  await expectKilled(label, needle, replacement);
}

function locateFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `runtime is missing ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: i + 1, text: source.slice(start, i + 1) };
    }
  }
  assert.fail(`runtime function ${name} is not closed`);
}

function extractZoneBranch(functionSource, zone) {
  const marker = `else if(zone==='${zone}')`;
  const start = functionSource.indexOf(marker);
  assert.ok(start >= 0, `${zone}: missing dedicated runtime branch`);
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

function assertRuntimeWiring(source) {
  const ground = locateFunction(source, 'setZoneGround').text;
  const lighting = locateFunction(source, 'setZoneLighting').text;
  const populate = locateFunction(source, 'populateWorld').text;
  const lightingSignatures = new Set();
  const decorationSignatures = new Set();

  for (const [zone, profile] of Object.entries(RUNTIME_PROFILES)) {
    assert.match(ground, new RegExp(`zone\\s*===\\s*'${zone}'\\s*\\?\\s*'${profile.groundType}'`));

    const lightingBranch = extractZoneBranch(lighting, zone);
    assert.match(lightingBranch, new RegExp(`hemi\\.intensity\\s*=\\s*${profile.lighting[0].replace('.', '\\.')}\\s*;`));
    assert.match(lightingBranch, new RegExp(`sun\\.intensity\\s*=\\s*${profile.lighting[1].replace('.', '\\.')}\\s*;`));
    assert.match(lightingBranch, new RegExp(`sun\\.color\\.setHex\\(${profile.lighting[2]}\\)`));
    lightingSignatures.add(profile.lighting.join('|'));

    const environmentBranch = extractZoneBranch(populate, zone);
    for (const builder of profile.builders) assert.match(environmentBranch, new RegExp(`${builder}\\(`));
    for (const color of profile.colors) assert.match(environmentBranch, new RegExp(color));
    assert.match(environmentBranch, /makeStageBeacon\(/);
    assert.doesNotMatch(environmentBranch, /Math\.random\(/);
    decorationSignatures.add(ENVIRONMENT_BUILDERS.filter(builder => environmentBranch.includes(`${builder}(`)).sort().join('|'));
  }

  assert.equal(lightingSignatures.size, 4);
  assert.equal(decorationSignatures.size, 4);
}

function mutateRuntimeFunctionOnce(source, functionName, needle, replacement, label) {
  const located = locateFunction(source, functionName);
  const mutatedFunction = mutateOnce(located.text, needle, replacement, label);
  return source.slice(0, located.start) + mutatedFunction + source.slice(located.end);
}

function expectRuntimeKilled(label, functionName, needle, replacement) {
  const mutant = mutateRuntimeFunctionOnce(gameSource, functionName, needle, replacement, label);
  let killed = false;
  try {
    assertRuntimeWiring(mutant);
  } catch {
    killed = true;
  }
  assert.equal(killed, true, `${label}: runtime atmosphere regression survived`);
}

assertRuntimeWiring(gameSource);

const runtimeMutants = [
  ['dragon ground map', 'setZoneGround', "zone==='dragon-crater'?'dragon'", "zone==='dragon-crater'?'grass'"],
  ['fairy ground map', 'setZoneGround', "zone==='fairy-garden'?'fairy'", "zone==='fairy-garden'?'grass'"],
  ['arena ground map', 'setZoneGround', "zone==='combat-colosseum'?'arena'", "zone==='combat-colosseum'?'grass'"],
  ['wildlands ground map', 'setZoneGround', "zone==='normal-wildlands'?'wildlands'", "zone==='normal-wildlands'?'grass'"],
  ['dragon lighting branch', 'setZoneLighting', "else if(zone==='dragon-crater')", "else if(zone==='dragon-crater-muted')"],
  ['fairy lighting branch', 'setZoneLighting', "else if(zone==='fairy-garden')", "else if(zone==='fairy-garden-muted')"],
  ['arena lighting branch', 'setZoneLighting', "else if(zone==='combat-colosseum')", "else if(zone==='combat-colosseum-muted')"],
  ['wildlands lighting branch', 'setZoneLighting', "else if(zone==='normal-wildlands')", "else if(zone==='normal-wildlands-muted')"],
  ['dragon decoration builder', 'populateWorld', 'makeCanyonWall(x,z,s,0x7f1d1d)', 'makeRock(x,z,s,0x7f1d1d)'],
  ['fairy decoration builder', 'populateWorld', "[[-15,5,1],[15,5,1.05],[-15,-14,1.05],[15,-14,1]].forEach(([x,z,s])=>makeShrineLantern(x,z,s));", "[[-15,5,1],[15,5,1.05],[-15,-14,1.05],[15,-14,1]].forEach(([x,z,s])=>makeRock(x,z,s));"],
  ['arena decoration builder', 'populateWorld', 'makeRuinPillar(x,z,s,0x92400e)', 'makeRock(x,z,s,0x92400e)'],
  ['wildlands decoration builder', 'populateWorld', 'makeGrassTuft(x,z,.9+((x+z)&1)*.12)', 'makeStageBeacon(x,z,0x86efac)'],
];

for (const [label, functionName, needle, replacement] of runtimeMutants) {
  expectRuntimeKilled(label, functionName, needle, replacement);
}

console.log(`V8.1.1 stage atmosphere mutation checks: PASS (${painterMutants.length}/${painterMutants.length} paint + ${runtimeMutants.length}/${runtimeMutants.length} runtime mutants killed)`);
