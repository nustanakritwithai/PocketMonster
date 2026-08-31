import assert from 'node:assert/strict';
import {
  COMBAT_V91_ADAPTER_VERSION,
  PIRATE_COMBAT_DEFINITION_VERSION,
  PIRATE_PROGRESSION_SOURCE,
  createDomainCombatProfile,
  createPirateCombatProfile,
  createPocketCombatProfile,
} from '../combat-v91-adapters.mjs';
import { MONSTER_STAT_CATALOG_VERSION } from '../monster-stat-catalog.mjs';

const ratings = Object.freeze({
  accuracy: 0.95, crit: 0.05, evasion: 0.02, resistance: 0.1, penetration: 0,
});
const minimumProgression = Object.freeze({
  combat: 1, vitality: 1, blade: 1, ranged: 1, fruitPower: 1, mana: 1,
});
const pirateDefinition = Object.freeze({
  definitionVersion: PIRATE_COMBAT_DEFINITION_VERSION, physicalCategory: 'style',
  physicalBaseDamage: 7, specialBaseDamage: 16, def: 10, spDef: 12, spd: 20,
  ...ratings,
});

assert.equal(COMBAT_V91_ADAPTER_VERSION, 'combat-v91-adapters/v2');
assert.equal(PIRATE_PROGRESSION_SOURCE.commit, '4df5721de8bdb20c28e53b6a8c933616e132c96d');
assert.equal(PIRATE_COMBAT_DEFINITION_VERSION, 'pirate-combat-definition/v1');

const pocketInput = {
  entityId: 'monster:ember:1', formId: 'MON_002', level: 15, currentHp: 41, ratings,
  progressionStateVersion: 'monster-save/15:1', stateVersion: 1,
};
const pocket = createPocketCombatProfile(pocketInput);
assert.equal(pocket.ok, true);
assert.equal(pocket.profile.ownerDomain, 'Pocket');
assert.equal(pocket.profile.entityKind, 'Monster');
assert.deepEqual(pocket.profile.types, ['Fire']);
assert.deepEqual(pocket.profile.stats, {
  hpMax: 41, hpCurrent: 41, atk: 18, def: 17, spAtk: 23, spDef: 18, spd: 21, ...ratings,
});
assert.equal(pocket.profile.definitionVersion, MONSTER_STAT_CATALOG_VERSION);

const routedPocket = createDomainCombatProfile({ ownerDomain: 'Pocket', profileInput: pocketInput });
assert.equal(routedPocket.ok, true);
assert.equal(routedPocket.profile.fingerprint, pocket.profile.fingerprint);

const maxPotential = { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, spd: 31 };
const maxTraining = { hp: 200, atk: 200, def: 0, spAtk: 200, spDef: 0, spd: 0 };
const pocketBoss = createPocketCombatProfile({
  ...pocketInput, entityId: 'boss:blaze:60', entityKind: 'Boss', formId: 'MON_020', level: 60,
  potential: maxPotential, training: maxTraining, currentHp: 221, stateVersion: 5,
});
assert.equal(pocketBoss.ok, true);
assert.equal(pocketBoss.profile.stats.hpMax, 221);
assert.equal(pocketBoss.profile.stats.spAtk, 167);
assert.equal(pocketBoss.profile.stats.spDef, 106);

assert.equal(createPocketCombatProfile({
  ...pocketInput, definitionVersion: 'monster-stat-catalog/stale',
}).reason, 'pocket_definition_version_mismatch');
assert.equal(createPocketCombatProfile({ ...pocketInput, entityKind: 'Human' }).reason, 'invalid_pocket_entity_kind');
assert.equal(createPocketCombatProfile({ ...pocketInput, ratings: undefined }).reason, 'authoritative_definition_required');
assert.equal(createPocketCombatProfile({ ...pocketInput, currentHp: 42 }).reason, 'invalid_current_hp');

const pirateInput = {
  entityId: 'human:1', level: 1, progression: minimumProgression, currentHp: 100,
  combatDefinition: pirateDefinition, progressionStateVersion: 'pirate-save/v1:1', stateVersion: 2,
};
const pirate = createPirateCombatProfile(pirateInput);
assert.equal(pirate.ok, true);
assert.equal(pirate.profile.ownerDomain, 'Pirate');
assert.equal(pirate.profile.entityKind, 'Human');
assert.equal(pirate.profile.stats.hpMax, 100);
assert.equal(pirate.profile.stats.atk, 7);
assert.equal(pirate.profile.stats.spAtk, 16);
assert.equal(pirate.profile.definitionVersion, PIRATE_COMBAT_DEFINITION_VERSION);

const routedPirate = createDomainCombatProfile({ ownerDomain: 'Pirate', profileInput: pirateInput });
assert.equal(routedPirate.ok, true);
assert.equal(routedPirate.profile.fingerprint, pirate.profile.fingerprint);

const maxProgression = Object.freeze({
  combat: 2800, vitality: 2800, blade: 2800, ranged: 2800, fruitPower: 2800, mana: 2800,
});
const pirateMax = createPirateCombatProfile({
  ...pirateInput, entityId: 'human:max', level: 2800, progression: maxProgression,
  currentHp: 14095, progressionStateVersion: 'pirate-save/v1:max', stateVersion: 10,
});
assert.equal(pirateMax.ok, true);
assert.equal(pirateMax.profile.stats.hpMax, 14095);
assert.equal(pirateMax.profile.stats.atk, 548);
assert.equal(pirateMax.profile.stats.spAtk, 1252);
assert.equal(maxProgression.combat, 2800, 'Pirate progression input stays immutable');

const asymmetricProgression = Object.freeze({
  combat: 2, vitality: 1, blade: 20, ranged: 100, fruitPower: 50, mana: 1,
});
for (const [physicalCategory, expectedAtk] of [['style', 7], ['sword', 11], ['gun', 26]]) {
  const categoryProfile = createPirateCombatProfile({
    ...pirateInput,
    entityId: `human:${physicalCategory}`,
    progression: asymmetricProgression,
    combatDefinition: { ...pirateDefinition, physicalCategory },
  });
  assert.equal(categoryProfile.ok, true);
  assert.equal(categoryProfile.profile.stats.atk, expectedAtk, `${physicalCategory} keeps Pirate source parity`);
  assert.equal(categoryProfile.profile.stats.spAtk, 38, 'Fruit Power remains the special attack source');
}

for (const entityKind of ['Npc', 'Boss', 'Ship']) {
  const profile = createPirateCombatProfile({
    ...pirateInput, entityId: `pirate:${entityKind}`, entityKind,
  });
  assert.equal(profile.ok, true, `Pirate owns ${entityKind} progression when explicitly routed`);
}
assert.equal(createPirateCombatProfile({ ...pirateInput, entityKind: 'Monster' }).reason, 'invalid_pirate_entity_kind');
assert.equal(createPirateCombatProfile({ ...pirateInput, combatDefinition: undefined }).reason, 'invalid_pirate_definition_shape');
assert.equal(createPirateCombatProfile({
  ...pirateInput, combatDefinition: { ...pirateDefinition, def: undefined },
}).reason, 'invalid_pirate_definition');
assert.equal(createPirateCombatProfile({
  ...pirateInput,
  combatDefinition: { ...pirateDefinition, definitionVersion: 'pirate-loadout/forged-v999' },
}).reason, 'pirate_definition_version_mismatch');
assert.equal(createPirateCombatProfile({
  ...pirateInput,
  combatDefinition: { ...pirateDefinition, physicalBaseDamage: 10_000_001 },
}).reason, 'invalid_pirate_definition');
assert.equal(createPirateCombatProfile({
  ...pirateInput,
  combatDefinition: { ...pirateDefinition, physicalCategory: 'fruit' },
}).reason, 'invalid_pirate_physical_category');
assert.equal(createPirateCombatProfile({
  ...pirateInput,
  combatDefinition: { ...pirateDefinition, crit: 1.01 },
}).reason, 'invalid_authoritative_rating');
assert.equal(createPirateCombatProfile({
  ...pirateInput,
  combatDefinition: { ...pirateDefinition, injectedPower: 999 },
}).reason, 'invalid_pirate_definition_shape');
assert.equal(createDomainCombatProfile({ ownerDomain: 'World', profileInput: pirateInput }).reason,
  'unsupported_combat_profile_owner');
assert.equal(createDomainCombatProfile({ ownerDomain: 'Pocket' }).reason, 'invalid_domain_profile_source');

console.log('V9.1 combat adapters: PASS (domain ownership, strict definitions, Pirate/Pocket parity)');
