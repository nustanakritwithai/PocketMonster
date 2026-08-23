import assert from 'node:assert/strict';
import fs from 'node:fs';

const originalSource = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

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

function mutateFunction(source, name, before, after) {
  const originalFunction = functionSource(source, name);
  assert.ok(originalFunction.includes(before), `${name} mutation target must exist`);
  const mutatedFunction = originalFunction.replace(before, after);
  return source.replace(originalFunction, mutatedFunction);
}

function liveContract(source) {
  assert.match(source, /createStandardBreedingEggTransaction/);
  assert.match(source, /hatchBreedingEggTransaction/);
  assert.match(source, /evaluateStandardBreedingCompatibility/);
  assert.match(source, /workbookBreedingProfile/);
  assert.match(source, /resolveWorkbookEvolutionStage/);

  const genderRoll = functionSource(source, 'rollGender');
  assert.match(genderRoll, /workbookBreedingProfile\(sp\?\.id\)/);
  assert.match(genderRoll, /resolveGenderFromSeed\(profile\.genderRule,Math\.floor\(Math\.random\(\)\*100\)\)/);
  assert.doesNotMatch(source, /id:'buglet'[^\n]*genderMode:'genderless'/);
  assert.doesNotMatch(source, /id:'voidhorn'[^\n]*genderMode:'genderless'/);

  const compatibility = functionSource(source, 'breedingCompatibility');
  assert.match(compatibility, /evaluateStandardBreedingCompatibility\(/);
  assert.match(compatibility, /state\.storage\.includes/);
  assert.doesNotMatch(compatibility, /adultForBreeding|\.breedingGroup!==|genderCompatible\(|\.bond<50/);

  const create = functionSource(source, 'createEgg');
  assert.match(create, /createStandardBreedingEggTransaction\(state/);
  assert.match(create, /crypto\.randomUUID\(\)/);
  assert.match(create, /crypto\.getRandomValues\(/);
  assert.match(create, /state\.collection=result\.state\.collection/);
  assert.match(create, /state\.eggs=result\.state\.eggs/);
  assert.match(create, /ฟัก 15 นาที/);
  assert.doesNotMatch(create, /makeChild\(|createEggFn\(|Math\.random\(|hatchMs|energy=clamp/);

  const hatch = functionSource(source, 'hatchEgg');
  assert.match(hatch, /hatchBreedingEggTransaction\(state/);
  assert.match(hatch, /egg\.breedingVersion==null\)\{hatchLegacyEgg\(/);
  assert.match(hatch, /egg\.breedingVersion!==BREEDING_VERSION/);
  assert.match(hatch, /state\.collection=result\.state\.collection/);
  assert.match(hatch, /state\.storage=result\.state\.storage/);
  assert.match(hatch, /state\.eggs=result\.state\.eggs/);
  assert.doesNotMatch(hatch, /state\.eggs=state\.eggs\.filter|getInst\(egg\.(?:parentAId|eggHolderOwnedMonsterId)/);

  const legacy = functionSource(source, 'hatchLegacyEgg');
  assert.match(legacy, /!egg\.child/);
  assert.match(legacy, /typeof egg\.child\.instanceId!=='string'/);
  assert.match(legacy, /!spById\[egg\.child\.speciesId\]/);
  assert.doesNotMatch(legacy, /makeChild\(/, 'malformed legacy eggs cannot reroll a guessed child');

  const adults = functionSource(source, 'breedingAdultIds');
  assert.match(adults, /resolveWorkbookEvolutionStage\(inst\)\.stage2/);
  assert.doesNotMatch(adults, /lifeStage/);
  const parentButton = functionSource(source, 'parentButtonHTML');
  assert.match(parentButton, /workbookBreedingProfile\(inst\.speciesId\)/);

  const render = functionSource(source, 'renderBreeding');
  assert.match(render, /egg\.hatchAt\?\?egg\.readyAt/);
  assert.match(render, /egg\.hatchedOwnedMonsterId/);
  assert.match(render, /Potential: สุ่มรับ 2 ค่าจาก Holder \+ 1 ค่าจาก Partner/);
  const countdown = functionSource(source, 'updateEggCountdowns');
  assert.match(countdown, /card\.dataset\.eggHatched==='true'/);
  assert.match(countdown, /hatched\|\|remain>0/);

  const saveEnvelope = functionSource(source, 'currentSaveEnvelope');
  assert.match(saveEnvelope, /sanitizeStateForPersistence\(persistableState\(state\)\)/);
  assert.match(saveEnvelope, /saveSchemaVersion:SAVE_SCHEMA_VERSION/);

  const migrate = functionSource(source, 'migrateLoadedState');
  assert.match(migrate, /state\.eggs=clean\.eggs\|\|\[\]/);
  assert.doesNotMatch(migrate, /readyAt:e\.readyAt\|\|Date\.now\(\)\+30000/);
}

liveContract(originalSource);

const mutants = [
  ['bypass canonical compatibility', 'const result=evaluateStandardBreedingCompatibility(roles.eggHolder,roles.partner,{now:Date.now()});', 'const result={ok:true,reason:null,breedingGroup:\'Field\'};'],
  ['bypass canonical live gender profile', 'const profile=workbookBreedingProfile(sp?.id);', 'const profile=null;'],
  ['collapse weighted gender roll to 50\/50', 'resolveGenderFromSeed(profile.genderRule,Math.floor(Math.random()*100))', "(Math.random()<.5?'Male':'Female')"],
  ['restore Buglet genderless drift', "id:'buglet',name:'Bug Slime'", "id:'buglet',genderMode:'genderless',name:'Bug Slime'"],
  ['restore Voidhorn genderless drift', "id:'voidhorn',name:'Shadow Slime'", "id:'voidhorn',genderMode:'genderless',name:'Shadow Slime'"],
  ['bypass Storage ownership', "if(!state.storage.includes(a.instanceId)||!state.storage.includes(b.instanceId))", 'if(false)'],
  ['bypass canonical create reducer', 'const result=createStandardBreedingEggTransaction(state,{', 'const result=legacyCreateEggTransaction(state,{'],
  ['replace UUID command identity', 'eggId=crypto.randomUUID()', "eggId='e'+Date.now()"],
  ['replace secure gender seed', 'crypto.getRandomValues(genderSeedWords);', 'genderSeedWords[0]=Math.floor(Date.now()%100);'],
  ['drop create collection commit', 'state.collection=result.state.collection;state.eggs=result.state.eggs;', 'state.eggs=result.state.eggs;'],
  ['drop create egg commit', 'state.collection=result.state.collection;state.eggs=result.state.eggs;', 'state.collection=result.state.collection;'],
  ['reintroduce create-time child roll', "const now=Date.now(),eggId=crypto.randomUUID(),genderSeedWords=new Uint32Array(1),inheritedSkillMemoryId=el('breedingSkillMemory')?.value||null;", "makeChild(a,b,compat.eggHolder);const now=Date.now(),eggId=crypto.randomUUID(),genderSeedWords=new Uint32Array(1),inheritedSkillMemoryId=el('breedingSkillMemory')?.value||null;"],
  ['reintroduce create Math.random', 'crypto.getRandomValues(genderSeedWords);', 'crypto.getRandomValues(genderSeedWords);Math.random();'],
  ['reintroduce parent energy cost', 'crypto.getRandomValues(genderSeedWords);', 'crypto.getRandomValues(genderSeedWords);a.energy=clamp(a.energy-15);'],
  ['show wrong live hatch duration', 'ฟัก 15 นาที', 'ฟัก 30 วินาที'],
  ['bypass canonical hatch reducer', 'const result=hatchBreedingEggTransaction(state,{eggId,now});', 'const result=legacyHatchEggTransaction(state,{eggId,now});'],
  ['treat future breeding version as legacy', 'if(egg.breedingVersion==null){hatchLegacyEgg(egg,now);return;}', 'if(egg.breedingVersion!==BREEDING_VERSION){hatchLegacyEgg(egg,now);return;}'],
  ['accept unsupported breeding version', 'if(egg.breedingVersion!==BREEDING_VERSION){msg(EGG_TRANSACTION_REASON_TH.unsupported_breeding_version);return;}', 'if(false)return;'],
  ['drop hatch collection commit', 'state.collection=result.state.collection;state.storage=result.state.storage;state.eggs=result.state.eggs;', 'state.storage=result.state.storage;state.eggs=result.state.eggs;'],
  ['drop hatch Storage commit', 'state.collection=result.state.collection;state.storage=result.state.storage;state.eggs=result.state.eggs;', 'state.collection=result.state.collection;state.eggs=result.state.eggs;'],
  ['drop hatch ledger commit', 'state.collection=result.state.collection;state.storage=result.state.storage;state.eggs=result.state.eggs;', 'state.collection=result.state.collection;state.storage=result.state.storage;'],
  ['delete hatch ledger in live path', 'state.collection=result.state.collection;state.storage=result.state.storage;state.eggs=result.state.eggs;', 'state.collection=result.state.collection;state.storage=result.state.storage;state.eggs=state.eggs.filter(record=>record.eggId!==eggId);'],
  ['require live canonical parent', 'const result=hatchBreedingEggTransaction(state,{eggId,now});', 'getInst(egg.eggHolderOwnedMonsterId);const result=hatchBreedingEggTransaction(state,{eggId,now});'],
  ['guess malformed legacy child', "if(!egg.child||typeof egg.child!=='object'){msg('ไข่ Legacy ไม่มี snapshot ลูก จึงไม่สร้างข้อมูลทดแทน');return;}", "if(!egg.child||typeof egg.child!=='object')makeChild(null,null,null);"],
  ['guess missing legacy identity', "if(typeof egg.child.instanceId!=='string'||!egg.child.instanceId.trim()||!spById[egg.child.speciesId]){msg('snapshot ลูกในไข่ Legacy ไม่ครบ จึงไม่เดารหัสหรือ Species ทดแทน');return;}", 'if(false)return;'],
  ['use legacy deadline first', 'readyAt=egg.hatchAt??egg.readyAt', 'readyAt=egg.readyAt??egg.hatchAt', 'renderBreeding'],
  ['ignore hatch ledger marker in render', 'hatched=!!egg.hatchedOwnedMonsterId', 'hatched=false', 'renderBreeding'],
  ['ignore hatch ledger marker in countdown', "const hatched=card.dataset.eggHatched==='true';", 'const hatched=false;'],
  ['shift deadline on every load', 'state.eggs=clean.eggs||[];', 'state.eggs=(clean.eggs||[]).map(e=>({...e,readyAt:e.readyAt||Date.now()+30000}));'],
  ['bypass Firebase persistence adapter', 'state:sanitizeStateForPersistence(persistableState(state))', 'state:persistableState(state)'],
  ['drop Firebase schema version', ',saveSchemaVersion:SAVE_SCHEMA_VERSION', ''],
  ['use display lifeStage as authority', 'return inst&&resolveWorkbookEvolutionStage(inst).stage2;', "return inst&&['Adult','Mature'].includes(inst.lifeStage);"],
  ['use runtime breeding group in parent card', 'profile=workbookBreedingProfile(inst.speciesId)', 'profile={breedingGroup:sp.breedingGroup}', 'parentButtonHTML'],
];

for (const [name, before, after, functionName] of mutants) {
  const source = functionName
    ? mutateFunction(originalSource, functionName, before, after)
    : originalSource.replace(before, after);
  assert.notEqual(source, originalSource, `${name} mutation must alter source`);
  assert.throws(() => liveContract(source), undefined, `${name} must be killed`);
}

console.log(`V8.1 A32 live wiring mutants: PASS (${mutants.length}/${mutants.length} killed)`);
