import assert from 'node:assert/strict';
import fs from 'node:fs';

const catalogUrl = new URL('../passive-catalog.mjs', import.meta.url);
const resolverUrl = new URL('../passive-resolver.mjs', import.meta.url);
const originalCatalogSource = fs.readFileSync(catalogUrl, 'utf8');
const originalResolverSource = fs.readFileSync(resolverUrl, 'utf8');

async function loadSource(source, filename, tag) {
  const fileUrl = new URL(`../${filename}`, import.meta.url);
  const withAbsoluteImports = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(relativePath, fileUrl).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${withAbsoluteImports}\n//# sourceURL=${tag}`).toString('base64')}`);
}

function assertCatalogContract(module) {
  assert.equal(module.PASSIVE_CATALOG.length, 36);
  assert.deepEqual(module.PASSIVE_RUNTIME_POLICY.resolverReadyPassiveIds, ['PASS_ROCK_01']);
  const stoneHide = module.passiveCatalogEntry('PASS_ROCK_01');
  assert.equal(stoneHide.value, 10);
  assert.equal(stoneHide.activation, 'resolver_ready');
  assert.equal(module.passiveCatalogEntry('PASS_FLYING_01').activation, 'catalog_only');
  assert.equal(module.defaultPassiveIdForSpecies('rockhorn'), 'PASS_ROCK_01');
  assert.equal(module.isPassiveEligibleForSpecies('rockhorn', 'PASS_ROCK_01'), true);
  assert.equal(module.isPassiveEligibleForSpecies('rockhorn', 'PASS_ROCK_02'), false);
  assert.equal(module.validatePassiveSpeciesProfiles(module.PASSIVE_SPECIES_PROFILES).ok, true);

  const duplicate = module.PASSIVE_CATALOG.map(passive => ({ ...passive }));
  duplicate[1].id = duplicate[0].id;
  assert.ok(module.validatePassiveCatalog(duplicate).issues.some(issue => issue.code === 'duplicate_passive_id'));

  const wrongStage = module.PASSIVE_CATALOG.map(passive => ({ ...passive }));
  wrongStage[0].unlockStage = 'Stage2';
  assert.ok(module.validatePassiveCatalog(wrongStage).issues.some(issue => issue.code === 'passive_stage_mismatch'));

  const runtimeLeak = module.PASSIVE_CATALOG.map(passive => ({ ...passive }));
  runtimeLeak[0].processedEventIds = ['evt'];
  assert.ok(module.validatePassiveCatalog(runtimeLeak).issues.some(issue => issue.code === 'runtime_field_in_passive_master'));

  const unauthorized = module.PASSIVE_CATALOG.map(passive => ({ ...passive }));
  unauthorized.find(passive => passive.id === 'PASS_LIGHT_01').activation = 'resolver_ready';
  assert.ok(module.validatePassiveCatalog(unauthorized).issues.some(issue => issue.code === 'unauthorized_runtime_activation'));

  const swappedTypes = module.PASSIVE_CATALOG.map(passive => ({ ...passive }));
  for (const passive of swappedTypes) {
    if (passive.sourceType === 'NORMAL') passive.sourceType = 'FIRE';
    else if (passive.sourceType === 'FIRE') passive.sourceType = 'NORMAL';
  }
  assert.ok(module.validatePassiveCatalog(swappedTypes).issues.some(issue => issue.code === 'passive_source_type_mismatch'));

  const wrongFamily = module.PASSIVE_SPECIES_PROFILES.map(profile => ({ ...profile }));
  const rock = wrongFamily.find(profile => profile.runtimeSpeciesId === 'rockhorn');
  rock.passive1Id = 'PASS_NORMAL_01';
  assert.ok(module.validatePassiveSpeciesProfiles(wrongFamily).issues.some(
    issue => issue.code === 'profile_species_passive_type_mismatch'));
}

function assertResolverContract(module) {
  const state = module.createPassiveEventState({ encounterId: 'enc-mutant' });
  const event = {
    eventId: 'evt-1',
    encounterId: 'enc-mutant',
    type: 'stat-modifiers-requested',
    ownerInstanceId: 'rock-owner',
    ownerSpeciesId: 'rockhorn',
    passiveId: 'PASS_ROCK_01',
    ownerFainted: false,
  };
  const applied = module.resolvePassiveEvent(state, event);
  assert.equal(applied.applied, true);
  assert.deepEqual(applied.modifiers, [{
    kind: 'stat_multiplier',
    stat: 'DEF',
    multiplier: 1.1,
    sourcePassiveId: 'PASS_ROCK_01',
  }]);
  assert.deepEqual(applied.state.processedEventIds, ['evt-1']);
  assert.equal(typeof applied.state.eventFingerprintById['evt-1'], 'string');

  const duplicate = module.resolvePassiveEvent(applied.state, event);
  assert.equal(duplicate.reason, 'duplicate_event');
  assert.equal(duplicate.replay, true);
  assert.deepEqual(duplicate.modifiers, []);
  assert.equal(duplicate.state, applied.state);

  const conflict = module.resolvePassiveEvent(applied.state, { ...event, passiveId: 'PASS_FLYING_01' });
  assert.equal(conflict.reason, 'event_id_conflict');
  assert.equal(conflict.state, applied.state);

  const injectedReplay = module.resolvePassiveEvent(applied.state, { ...event, injectedPayload: 'different' });
  assert.equal(injectedReplay.reason, 'event_id_conflict');

  const fainted = module.resolvePassiveEvent(state, { ...event, eventId: 'evt-2', ownerFainted: true });
  assert.equal(fainted.reason, 'owner_fainted');
  assert.deepEqual(fainted.modifiers, []);
  assert.deepEqual(fainted.state.processedEventIds, ['evt-2']);

  const deferred = module.resolvePassiveEvent(state, {
    ...event,
    eventId: 'evt-3',
    ownerSpeciesId: 'galebird',
    passiveId: 'PASS_FLYING_01',
  });
  assert.equal(deferred.reason, 'passive_deferred');
  assert.deepEqual(deferred.modifiers, []);

  assert.equal(module.resolvePassiveEvent(state, { ...event, encounterId: 'other' }).reason, 'encounter_mismatch');
  assert.equal(module.resolvePassiveEvent(state, { ...event, type: 'damage-resolved' }).reason, 'unsupported_event_type');
  assert.equal(module.resolvePassiveEvent(state, { ...event, passiveId: 'PASS_UNKNOWN_99' }).reason, 'unknown_passive');
  assert.equal(module.resolvePassiveEvent(state, { ...event, ownerSpeciesId: 'normalooze' }).reason, 'passive_not_eligible');
  assert.equal(module.resolvePassiveEvent(state, { ...event, extra: true }).reason, 'invalid_event_shape');
  assert.doesNotThrow(() => module.resolvePassiveEvent(state, { ...event, ownerInstanceId: 1n }));
  assert.equal(module.resolvePassiveEvent(state, { ...event, ownerInstanceId: 1n }).reason, 'invalid_owner_instance_id');

  const inheritedState = Object.create({
    version: 'PASSIVE_EVENT_v1',
    encounterId: 'enc-mutant',
    processedEventIds: [],
    eventFingerprintById: {},
  });
  assert.equal(module.resolvePassiveEvent(inheritedState, event).reason, 'invalid_state');

  assert.deepEqual(module.resolvePassiveStaticModifier({
    passiveId: 'PASS_ROCK_01',
    ownerSpeciesId: 'normalooze',
    ownerFainted: false,
  }), []);
  assert.deepEqual(module.resolvePassiveStaticModifier({
    passiveId: 'PASS_ROCK_01',
    ownerSpeciesId: 'rockhorn',
    ownerFainted: true,
  }), []);

  const ended = module.endPassiveEncounter(applied.state);
  assert.equal(module.resolvePassiveEvent(ended, { ...event, encounterId: null }).reason, 'encounter_inactive');
}

const currentCatalog = await loadSource(originalCatalogSource, 'passive-catalog.mjs', 'passive-catalog-current');
assertCatalogContract(currentCatalog);
const currentResolver = await loadSource(originalResolverSource, 'passive-resolver.mjs', 'passive-resolver-current');
assertResolverContract(currentResolver);

const catalogMutants = [
  ['change workbook Stone Hide value', "['PASS_ROCK_01','ผิวศิลา','Stone Hide','ROCK','หิน','ตลอดเวลา','เพิ่ม DEF',10,'Percent','Always','Stage1']", "['PASS_ROCK_01','ผิวศิลา','Stone Hide','ROCK','หิน','ตลอดเวลา','เพิ่ม DEF',11,'Percent','Always','Stage1']"],
  ['activate a second passive', "resolverReadyPassiveIds: Object.freeze(['PASS_ROCK_01'])", "resolverReadyPassiveIds: Object.freeze(['PASS_ROCK_01', 'PASS_FLYING_01'])"],
  ['accept duplicate passive IDs', "} else if (ids.has(passive.id)) {", "} else if (false && ids.has(passive.id)) {"],
  ['accept suffix stage mismatch', "if (expectedStage !== passive.unlockStage)", "if (false && expectedStage !== passive.unlockStage)"],
  ['accept runtime fields in catalog', "if (field in passive) issues.push(issue('runtime_field_in_passive_master', index, field));", "if (false && field in passive) issues.push(issue('runtime_field_in_passive_master', index, field));"],
  ['accept unauthorized activation', "if (passive.activation !== expectedActivation)", "if (false && passive.activation !== expectedActivation)"],
  ['accept passive ID/source-type mismatch', 'if (passive.id !== `PASS_${passive.sourceType}_${passive.unlockStage === \'Stage1\' ? \'01\' : \'02\'}`)', 'if (false && passive.id !== `PASS_${passive.sourceType}_${passive.unlockStage === \'Stage1\' ? \'01\' : \'02\'}`)'],
  ['accept species/passive type mismatch', 'if (expected && passive1 && passive1.sourceType !== expected.workbookTypeCandidate)', 'if (false && expected && passive1 && passive1.sourceType !== expected.workbookTypeCandidate)'],
  ['allow deferred Passive2 selection', 'return Boolean(profile && passiveId === profile.passive1Id);', 'return Boolean(profile && (passiveId === profile.passive1Id || passiveId === profile.passive2Id));'],
];

const resolverMutants = [
  ['remove Stone Hide multiplier', 'multiplier: 1.1', 'multiplier: 1'],
  ['disable event dedupe', 'if (state.processedEventIds.includes(eventId)) {', 'if (false && state.processedEventIds.includes(eventId)) {'],
  ['forget processed event ID', '[...state.processedEventIds, eventId]', '[...state.processedEventIds]'],
  ['allow fainted owner', 'if (ownerFainted) return result', 'if (false && ownerFainted) return result'],
  ['activate deferred passives', "if (passive.activation !== 'resolver_ready' || modifiers.length === 0) {", "if (false && passive.activation !== 'resolver_ready' || false && modifiers.length === 0) {"],
  ['ignore encounter identity', "if (encounterId !== state.encounterId) return result(false, 'encounter_mismatch', state);", "if (false) return result(false, 'encounter_mismatch', state);"],
  ['reactivate ended encounter', "if (state.encounterId === null) return result(false, 'encounter_inactive', state);", "if (false) return result(false, 'encounter_inactive', state);"],
  ['ignore typed event contract', "if (type !== EVENT_TYPE) return result(false, 'unsupported_event_type', state);", "if (false) return result(false, 'unsupported_event_type', state);"],
  ['accept unknown passive', "if (!passive) return result(false, 'unknown_passive', state);", "if (false) return result(false, 'unknown_passive', state);"],
  ['accept event ID payload conflict', 'state.eventFingerprintById[eventId] === fingerprint', 'true'],
  ['ignore exact typed event shape', "if (!validEventShape(event)) return result(false, 'invalid_event_shape', state);", "if (false) return result(false, 'invalid_event_shape', state);"],
  ['ignore species passive eligibility', "if (!isPassiveEligibleForSpecies(ownerSpeciesId, passive.id)) {", "if (false && !isPassiveEligibleForSpecies(ownerSpeciesId, passive.id)) {"],
  ['trust inherited event state', 'if (!isPlainRecord(state) || !hasExactOwnStringKeys(state, STATE_KEYS)) return false;', "if (!state || typeof state !== 'object') return false;"],
  ['ignore static species guard', 'ownerFainted !== false || !isPassiveEligibleForSpecies(ownerSpeciesId, passiveId)', 'ownerFainted !== false'],
  ['ignore static fainted guard', 'ownerFainted !== false || !isPassiveEligibleForSpecies(ownerSpeciesId, passiveId)', '!isPassiveEligibleForSpecies(ownerSpeciesId, passiveId)'],
];

let killed = 0;
for (const [name, before, after] of catalogMutants) {
  const mutant = originalCatalogSource.replace(before, after);
  assert.notEqual(mutant, originalCatalogSource, `${name} mutation must alter source`);
  try {
    const module = await loadSource(mutant, 'passive-catalog.mjs', `passive-catalog-mutant-${killed}`);
    assertCatalogContract(module);
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

for (const [name, before, after] of resolverMutants) {
  const mutant = originalResolverSource.replace(before, after);
  assert.notEqual(mutant, originalResolverSource, `${name} mutation must alter source`);
  try {
    const module = await loadSource(mutant, 'passive-resolver.mjs', `passive-resolver-mutant-${killed}`);
    assertResolverContract(module);
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

const total = catalogMutants.length + resolverMutants.length;
assert.equal(killed, total);
console.log(`V8.1 A34 passive mutants: PASS (${killed}/${total} killed)`);
