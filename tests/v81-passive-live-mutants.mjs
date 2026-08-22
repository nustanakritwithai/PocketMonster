import assert from 'node:assert/strict';
import fs from 'node:fs';

const SOURCES = Object.freeze({
  monster: ['monster-instance.mjs', fs.readFileSync(new URL('../monster-instance.mjs', import.meta.url), 'utf8')],
  save: ['save-schema.mjs', fs.readFileSync(new URL('../save-schema.mjs', import.meta.url), 'utf8')],
  rating: ['combat-rating.mjs', fs.readFileSync(new URL('../combat-rating.mjs', import.meta.url), 'utf8')],
  live: ['live-progression.mjs', fs.readFileSync(new URL('../live-progression.mjs', import.meta.url), 'utf8')],
  game: ['game-v800.js', fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8')],
});

async function loadSource(source, filename, tag) {
  const fileUrl = new URL(`../${filename}`, import.meta.url);
  const withAbsoluteImports = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(relativePath, fileUrl).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${withAbsoluteImports}\n//# sourceURL=${tag}`).toString('base64')}`);
}

function assertMonsterContract(module) {
  assert.equal(module.INSTANCE_SAVE_VERSION, 11);
  const normalized = module.normalizeInstance({
    instanceId: 'rock-mutant',
    speciesId: 'rockhorn',
    passive: '<img onerror=1>',
    passiveId: 'PASS_FORGED_99',
    passiveEventState: { processedEventIds: ['evt'] },
    passiveEventLedger: { processedEventIds: ['evt-ledger'] },
    processedEventIds: ['evt-direct'],
    eventFingerprintById: { 'evt-direct': 'fingerprint' },
  }, { now: 1000 });
  assert.equal(normalized.passiveId, 'PASS_ROCK_01');
  assert.equal('passive' in normalized, false);
  assert.equal('passiveEventState' in normalized, false);
  assert.equal('passiveEventLedger' in normalized, false);
  assert.equal('processedEventIds' in normalized, false);
  assert.equal('eventFingerprintById' in normalized, false);
  const sanitized = module.sanitizeMonsterInstanceForPersistence({
    ...normalized,
    passive: '<svg onload=1>',
    passiveEventState: { processedEventIds: ['evt'] },
    passiveEventLedger: { processedEventIds: ['evt-ledger'] },
  });
  assert.equal(sanitized.passiveId, 'PASS_ROCK_01');
  assert.equal('passive' in sanitized, false);
  assert.equal('passiveEventState' in sanitized, false);
  assert.equal('passiveEventLedger' in sanitized, false);
}

function assertSaveContract(module) {
  assert.equal(module.SAVE_SCHEMA_VERSION, 11);
  assert.deepEqual(module.SAVE_MIGRATION_REGISTRY.map(entry => entry.id), [
    'monster-instance-v9-skill-runtime',
    'breeding-egg-v10',
    'passive-instance-v11',
  ]);
  const sanitized = module.sanitizeStateForPersistence({
    collection: [],
    eggs: [],
    passiveEventState: { processedEventIds: ['evt'] },
    passiveEventLedger: { processedEventIds: ['evt-ledger'] },
    processedEventIds: ['evt-direct'],
    eventFingerprintById: { 'evt-direct': 'fingerprint' },
  });
  assert.equal('passiveEventState' in sanitized, false);
  assert.equal('passiveEventLedger' in sanitized, false);
  assert.equal('processedEventIds' in sanitized, false);
  assert.equal('eventFingerprintById' in sanitized, false);

  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  storage.setItem(module.SAVE_KEY, JSON.stringify({
    state: {
      collection: [{ instanceId: 'rock-backup', speciesId: 'rockhorn', passive: '<img onerror=1>' }],
      passiveEventLedger: { processedEventIds: ['legacy'] },
    },
  }));
  module.writeStoredSave(storage, { state: { collection: [], eggs: [] } });
  assert.doesNotMatch(storage.getItem(module.SAVE_BACKUP_KEY), /<img|passiveEventLedger|processedEventIds/);
}

function assertRatingContract(module) {
  const detail = module.statBreakdown({
    level: 1,
    species: { base: { def: 100 }, growthPerLevel: { def: 0 } },
    genes: { def: 'B' },
    training: {},
    condition: 'normal',
    passiveId: 'PASS_ROCK_01',
    passiveOwnerSpeciesId: 'rockhorn',
    passiveOwnerFainted: false,
  }, 'def');
  assert.equal(detail.prePassiveFinal, 100);
  assert.equal(detail.passiveMultiplier, 1.1);
  assert.deepEqual(detail.passiveSources, ['PASS_ROCK_01']);
  assert.equal(detail.final, 110);
  const rejected = module.statBreakdown({
    level: 1,
    species: { base: { def: 100 }, growthPerLevel: { def: 0 } },
    genes: { def: 'B' },
    training: {},
    condition: 'normal',
    passiveId: 'PASS_ROCK_01',
    passiveOwnerSpeciesId: 'normalooze',
    passiveOwnerFainted: false,
  }, 'def');
  assert.equal(rejected.final, 100);
}

function assertLiveContract(module) {
  const build = module.instanceCombatBuild({
    level: 1,
    speciesId: 'rockhorn',
    genes: {},
    training: {},
    passiveId: 'PASS_ROCK_01',
    fainted: false,
    body: {},
    mind: {},
  }, { id: 'rockhorn', base: { hp: 1, atk: 1, def: 100, spd: 1 } }, null);
  assert.equal(build.passiveId, 'PASS_ROCK_01');
  assert.equal(build.passiveOwnerSpeciesId, 'rockhorn');
  assert.equal(build.passiveOwnerFainted, false);

  const faintedBuild = module.instanceCombatBuild({
    level: 1,
    speciesId: 'rockhorn',
    genes: {},
    training: {},
    passiveId: 'PASS_ROCK_01',
    fainted: true,
    body: {},
    mind: {},
  }, { id: 'rockhorn', base: { hp: 1, atk: 1, def: 100, spd: 1 } }, null);
  assert.equal(faintedBuild.passiveOwnerFainted, true);

  const revivedRock = {
    level: 1,
    speciesId: 'rockhorn',
    genes: { def: 'B' },
    training: {},
    passiveId: 'PASS_ROCK_01',
    hp: 0,
    maxHp: 100,
    fainted: true,
    _condition: 'normal',
    body: {},
    mind: {},
  };
  const revived = module.refreshCoreStats(revivedRock, {
    id: 'rockhorn',
    base: { hp: 100, atk: 100, def: 100, spd: 100 },
    growthPerLevel: { hp: 0, atk: 0, def: 0, spd: 0 },
  }, null, null, { heal: true });
  assert.equal(revived.stats.def, 110);
  assert.equal(revivedRock.def, 110);
  assert.equal(revivedRock.fainted, false);
  assert.equal(revivedRock.hp, revivedRock.maxHp);
}

function assertGameContract(source) {
  assert.match(source, /passiveCatalogEntry\(inst\.passiveId\)/);
  assert.doesNotMatch(source, /inst\.passive\|\|inst\.genes\?\.trait/);
  assert.match(source, /refreshCoreStats\(inst,sp,path,getEquipmentFlat\(inst\),\{heal\}\)/);
}

assertMonsterContract(await loadSource(SOURCES.monster[1], SOURCES.monster[0], 'passive-live-monster-current'));
assertSaveContract(await loadSource(SOURCES.save[1], SOURCES.save[0], 'passive-live-save-current'));
assertRatingContract(await loadSource(SOURCES.rating[1], SOURCES.rating[0], 'passive-live-rating-current'));
assertLiveContract(await loadSource(SOURCES.live[1], SOURCES.live[0], 'passive-live-adapter-current'));
assertGameContract(SOURCES.game[1]);

const mutants = [
  ['monster', 'retain old save version', 'export const INSTANCE_SAVE_VERSION = 11;', 'export const INSTANCE_SAVE_VERSION = 10;', assertMonsterContract],
  ['monster', 'retain raw passive runtime fields', 'for (const field of TRANSIENT_PASSIVE_FIELDS) delete copy[field];', 'for (const field of []) delete copy[field];', assertMonsterContract],
  ['monster', 'trust forged passive ID', 'return isPassiveEligibleForSpecies(source.speciesId, source.passiveId)\n    ? source.passiveId\n    : defaultPassiveId;', 'return source.passiveId ?? defaultPassiveId;', assertMonsterContract],
  ['save', 'retain old schema version', 'export const SAVE_SCHEMA_VERSION = 11;', 'export const SAVE_SCHEMA_VERSION = 10;', assertSaveContract],
  ['save', 'persist passive event ledger', 'for (const field of TRANSIENT_PASSIVE_FIELDS) delete state[field];', 'for (const field of []) delete state[field];', assertSaveContract],
  ['save', 'copy unsafe previous payload to backup', "storage.setItem(SAVE_BACKUP_KEY, JSON.stringify({\n      ...previous,\n      state: sanitizeStateForPersistence(previous.state),\n      appVersion: APP_VERSION,\n      saveSchemaVersion: SAVE_SCHEMA_VERSION,\n    }));", 'storage.setItem(SAVE_BACKUP_KEY, previousRaw);', assertSaveContract],
  ['save', 'drop passive migration registry entry', "  Object.freeze({\n    id: 'passive-instance-v11',\n    targetVersion: 11,\n    migrate: migrateState,\n  }),\n", '', assertSaveContract],
  ['rating', 'bypass central passive multiplier', 'const passiveMultiplier = passiveModifiers.reduce((value, modifier) => value * modifier.multiplier, 1);', 'const passiveMultiplier = 1;', assertRatingContract],
  ['rating', 'bypass live species guard', 'ownerSpeciesId: build.passiveOwnerSpeciesId,', "ownerSpeciesId: 'rockhorn',", assertRatingContract],
  ['live', 'drop passive from central build', '    passiveId: inst.passiveId ?? null,\n', '', assertLiveContract],
  ['live', 'drop passive owner species from central build', '    passiveOwnerSpeciesId: inst.speciesId ?? null,\n', '', assertLiveContract],
  ['live', 'ignore fainted owner in central build', '    passiveOwnerFainted: inst.fainted === true || (Number.isFinite(inst.hp) && inst.hp <= 0),', '    passiveOwnerFainted: false,', assertLiveContract],
  ['live', 'compute revive before clearing fainted state', "  if (heal) {\n    inst.fainted = false;\n    if (Number.isFinite(inst.hp) && inst.hp <= 0) inst.hp = 1;\n  }", '', assertLiveContract],
  ['live', 'leave zero HP during revive computation', '    if (Number.isFinite(inst.hp) && inst.hp <= 0) inst.hp = 1;', '    if (false) inst.hp = 1;', assertLiveContract],
];

let killed = 0;
for (const [sourceKey, name, before, after, contract] of mutants) {
  const [filename, original] = SOURCES[sourceKey];
  const mutant = original.replace(before, after);
  assert.notEqual(mutant, original, `${name} mutation must alter source`);
  try {
    const module = await loadSource(mutant, filename, `passive-live-mutant-${killed}`);
    contract(module);
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

const unsafeGame = SOURCES.game[1].replace(
  "const passiveDefinition=passiveCatalogEntry(inst.passiveId);\n  const passive=passiveDefinition?`${passiveDefinition.nameTH} (${passiveDefinition.nameEN})`:'—';",
  "const passive=inst.passive||inst.genes?.trait||'—';",
);
assert.notEqual(unsafeGame, SOURCES.game[1]);
assert.throws(() => assertGameContract(unsafeGame));
killed += 1;

const staleReviveGame = SOURCES.game[1].replace(
  'const computed=refreshCoreStats(inst,sp,path,getEquipmentFlat(inst),{heal});',
  'const computed=computeCoreStats(inst,sp,path,getEquipmentFlat(inst));',
);
assert.notEqual(staleReviveGame, SOURCES.game[1]);
assert.throws(() => assertGameContract(staleReviveGame));
killed += 1;

const total = mutants.length + 2;
assert.equal(killed, total);
console.log(`V8.1 A34 passive live mutants: PASS (${killed}/${total} killed)`);
