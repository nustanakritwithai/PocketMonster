import assert from 'node:assert/strict';
import fs from 'node:fs';

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const open = source.indexOf('{', source.indexOf(')', start) + 1);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a complete body`);
}

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

assert.match(js, /createStandardBreedingEggTransaction/);
assert.match(js, /hatchBreedingEggTransaction/);
assert.match(js, /evaluateStandardBreedingCompatibility/);
assert.match(js, /workbookBreedingProfile/);

const genderRoll = functionSource(js, 'rollGender');
assert.match(genderRoll, /workbookBreedingProfile\(sp\?\.id\)/,
  'live gender generation reads the canonical workbook profile');
assert.match(genderRoll, /resolveGenderFromSeed\(profile\.genderRule,Math\.floor\(Math\.random\(\)\*100\)\)/,
  '50\/50, 75\/25, 25\/75 and Genderless all share the canonical resolver');
assert.doesNotMatch(js, /id:'buglet'[^\n]*genderMode:'genderless'/,
  'Buglet is standard 50M\/50F in the workbook');
assert.doesNotMatch(js, /id:'voidhorn'[^\n]*genderMode:'genderless'/,
  'Voidhorn is standard 50M\/50F in the workbook');

const compatibility = functionSource(js, 'breedingCompatibility');
assert.match(compatibility, /evaluateStandardBreedingCompatibility\(/,
  'live compatibility enters the canonical A30 role gate');
assert.match(compatibility, /state\.storage\.includes/,
  'Ranch UI still requires both owned parents in Storage');
assert.doesNotMatch(compatibility, /adultForBreeding|\.breedingGroup!==|genderCompatible\(|\.bond<50/,
  'live UI cannot retain a second copy of workbook breeding rules');

const create = functionSource(js, 'createEgg');
assert.match(create, /createStandardBreedingEggTransaction\(state/,
  'accepted live create uses the atomic A32 reducer');
assert.match(create, /crypto\.randomUUID\(\)/, 'one UUID is minted at the command boundary');
assert.match(create, /crypto\.getRandomValues\(/, 'gender seed is generated once at the command boundary');
assert.match(create, /state\.collection=result\.state\.collection/);
assert.match(create, /state\.eggs=result\.state\.eggs/);
assert.doesNotMatch(create, /makeChild\(|createEggFn\(|Math\.random\(|hatchMs|energy=clamp/,
  'canonical create cannot embed/reroll a child or apply legacy energy/timer rules');

const hatch = functionSource(js, 'hatchEgg');
assert.match(hatch, /hatchBreedingEggTransaction\(state/,
  'canonical live hatch uses the atomic A32 reducer');
assert.match(hatch, /egg\.breedingVersion==null\)\{hatchLegacyEgg\(/,
  'only unversioned eggs enter the legacy hatch path');
assert.match(hatch, /egg\.breedingVersion!==BREEDING_VERSION/,
  'unknown non-null breeding versions are rejected, never treated as legacy');
assert.match(hatch, /state\.collection=result\.state\.collection/);
assert.match(hatch, /state\.storage=result\.state\.storage/);
assert.match(hatch, /state\.eggs=result\.state\.eggs/);
assert.doesNotMatch(hatch, /state\.eggs=state\.eggs\.filter/,
  'canonical egg ledger is retained after hatch');

const render = functionSource(js, 'renderBreeding');
assert.match(render, /egg\.hatchAt\?\?egg\.readyAt/,
  'canonical hatchAt is primary while quarantined legacy readyAt stays readable');
assert.match(render, /egg\.hatchedOwnedMonsterId/,
  'hatched ledger entries render as completed and cannot hatch twice');

const saveEnvelope = functionSource(js, 'currentSaveEnvelope');
assert.match(saveEnvelope, /sanitizeStateForPersistence\(persistableState\(state\)\)/,
  'local and Firebase saves share the canonical v10 persistence adapter');
assert.match(saveEnvelope, /saveSchemaVersion:SAVE_SCHEMA_VERSION/,
  'Firebase envelope carries the canonical schema version');

assert.doesNotMatch(js, /readyAt:e\.readyAt\|\|Date\.now\(\)\+30000/,
  'load must never move an egg deadline');

console.log('V8.1 A32 live egg transaction wiring: PASS');
