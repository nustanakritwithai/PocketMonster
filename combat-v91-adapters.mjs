import {
  COMBAT_RATIO_KEYS,
  COMBAT_V91_SAFETY_BOUNDS,
  createCombatProfile,
} from './combat-v91-contract.mjs';
import {
  MONSTER_STAT_FORMULA_VERSION,
  calculateMonsterStats,
} from './monster-stat-formula.mjs';
import {
  MONSTER_STAT_CATALOG_VERSION,
  monsterStatCatalogEntry,
} from './monster-stat-catalog.mjs';

export const COMBAT_V91_ADAPTER_VERSION = 'combat-v91-adapters/v2';
export const PIRATE_PROGRESSION_SOURCE = Object.freeze({
  repository: 'https://github.com/nustanakritwithai/Pirate-fruit-',
  commit: '4df5721de8bdb20c28e53b6a8c933616e132c96d',
  module: 'shared/src/progression/stats.ts',
  calculationVersion: 'pirate-progression-stats/4df5721',
});

export const PIRATE_STAT_RULES = Object.freeze({
  maxPlayerStat: 2_800,
  basePlayerHp: 100,
  hpPerVitality: 5,
  damageMultiplierAtMaxStat: 78.26,
  damagePerStatPoint: (78.26 - 1) / 2_800,
  categories: Object.freeze(['style', 'sword', 'gun', 'fruit']),
});

export const PIRATE_COMBAT_DEFINITION_VERSION = 'pirate-combat-definition/v1';

const PIRATE_COMBAT_DEFINITION_KEYS = Object.freeze([
  'definitionVersion', 'physicalCategory', 'physicalBaseDamage', 'specialBaseDamage',
  'def', 'spDef', 'spd', ...COMBAT_RATIO_KEYS,
]);

const PIRATE_STAT_KEYS = Object.freeze(['combat', 'vitality', 'blade', 'ranged', 'fruitPower', 'mana']);
const PHYSICAL_CATEGORIES = Object.freeze(['style', 'sword', 'gun']);
const DOMAIN_ENTITY_KINDS = Object.freeze({
  Pirate: Object.freeze(['Human', 'Npc', 'Boss', 'Ship']),
  Pocket: Object.freeze(['Monster', 'Npc', 'Boss']),
});

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function normalizedPirateStat(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(PIRATE_STAT_RULES.maxPlayerStat, Math.floor(value)));
}

function pirateStatForCategory(stats, category) {
  if (category === 'style') return normalizedPirateStat(stats.combat);
  if (category === 'sword') return normalizedPirateStat(stats.blade);
  if (category === 'gun') return normalizedPirateStat(stats.ranged);
  return normalizedPirateStat(stats.fruitPower);
}

function pirateScaledDamage(baseDamage, stats, category) {
  const safeBase = Number.isFinite(baseDamage) ? Math.max(0, baseDamage) : 0;
  if (safeBase <= 0) return 0;
  const multiplier = 1 + (pirateStatForCategory(stats, category) - 1) * PIRATE_STAT_RULES.damagePerStatPoint;
  return Math.max(1, Math.round(safeBase * multiplier));
}

function validateRatings(definition) {
  if (!isRecord(definition)) return result(false, 'authoritative_definition_required');
  for (const key of COMBAT_RATIO_KEYS) {
    if (!Number.isFinite(definition[key]) || definition[key] < 0 || definition[key] > 1) {
      return result(false, 'invalid_authoritative_rating', { field: key });
    }
  }
  return result(true, null);
}

function validCurrentHp(value, hpMax) {
  return Number.isFinite(value) && value >= 0 && value <= hpMax;
}

export function createPocketCombatProfile({
  entityId,
  entityKind = 'Monster',
  formId,
  level,
  potential,
  training,
  currentHp,
  ratings,
  progressionStateVersion,
  definitionVersion = MONSTER_STAT_CATALOG_VERSION,
  stateVersion,
} = {}) {
  if (!DOMAIN_ENTITY_KINDS.Pocket.includes(entityKind)) return result(false, 'invalid_pocket_entity_kind');
  if (definitionVersion !== MONSTER_STAT_CATALOG_VERSION) {
    return result(false, 'pocket_definition_version_mismatch');
  }
  const calculated = calculateMonsterStats({ formId, level, potential, training });
  if (!calculated.ok) return result(false, 'pocket_calculation_failed', { cause: calculated });
  const form = monsterStatCatalogEntry(formId);
  if (!form) return result(false, 'unknown_pocket_form');
  const ratingValidation = validateRatings(ratings);
  if (!ratingValidation.ok) return ratingValidation;
  if (!validCurrentHp(currentHp, calculated.stats.hp)) return result(false, 'invalid_current_hp');
  const created = createCombatProfile({
    entityId,
    ownerDomain: 'Pocket',
    entityKind,
    level,
    types: [form.runtimeType],
    stats: {
      hpMax: calculated.stats.hp,
      hpCurrent: currentHp,
      atk: calculated.stats.atk,
      def: calculated.stats.def,
      spAtk: calculated.stats.spAtk,
      spDef: calculated.stats.spDef,
      spd: calculated.stats.spd,
      accuracy: ratings.accuracy,
      crit: ratings.crit,
      evasion: ratings.evasion,
      resistance: ratings.resistance,
      penetration: ratings.penetration,
    },
    progressionStateVersion,
    calculationVersion: MONSTER_STAT_FORMULA_VERSION,
    definitionVersion,
    stateVersion,
  });
  if (!created.ok) return created;
  return result(true, null, {
    profile: created.profile,
    provenance: Object.freeze({
      adapterVersion: COMBAT_V91_ADAPTER_VERSION,
      formulaVersion: calculated.formulaVersion,
      catalogVersion: MONSTER_STAT_CATALOG_VERSION,
      formId,
      runtimeSpeciesId: calculated.runtimeSpeciesId,
    }),
  });
}

function validatePirateProgression(stats) {
  if (!exactKeys(stats, PIRATE_STAT_KEYS)) return result(false, 'invalid_pirate_progression_shape');
  for (const key of PIRATE_STAT_KEYS) {
    if (!Number.isFinite(stats[key])) return result(false, 'invalid_pirate_progression', { field: key });
  }
  return result(true, null);
}

function resolvePirateDefinition(definition) {
  if (!exactKeys(definition, PIRATE_COMBAT_DEFINITION_KEYS)) {
    return result(false, 'invalid_pirate_definition_shape');
  }
  const snapshot = Object.freeze(Object.fromEntries(
    PIRATE_COMBAT_DEFINITION_KEYS.map(field => [field, definition[field]]),
  ));
  if (snapshot.definitionVersion !== PIRATE_COMBAT_DEFINITION_VERSION) {
    return result(false, 'pirate_definition_version_mismatch');
  }
  if (!PHYSICAL_CATEGORIES.includes(snapshot.physicalCategory)) {
    return result(false, 'invalid_pirate_physical_category');
  }
  for (const field of ['physicalBaseDamage', 'specialBaseDamage', 'def', 'spDef', 'spd']) {
    if (!Number.isFinite(snapshot[field])
      || snapshot[field] < 0
      || snapshot[field] > COMBAT_V91_SAFETY_BOUNDS.statMax) {
      return result(false, 'invalid_pirate_definition', { field });
    }
  }
  const ratingValidation = validateRatings(snapshot);
  if (!ratingValidation.ok) return ratingValidation;
  return result(true, null, { definition: snapshot });
}

export function createPirateCombatProfile({
  entityId,
  entityKind = 'Human',
  level,
  progression,
  currentHp,
  types = [],
  combatDefinition,
  progressionStateVersion,
  stateVersion,
} = {}) {
  if (!DOMAIN_ENTITY_KINDS.Pirate.includes(entityKind)) return result(false, 'invalid_pirate_entity_kind');
  const progressionValidation = validatePirateProgression(progression);
  if (!progressionValidation.ok) return progressionValidation;
  const definitionValidation = resolvePirateDefinition(combatDefinition);
  if (!definitionValidation.ok) return definitionValidation;
  const authoritativeDefinition = definitionValidation.definition;
  const hpMax = PIRATE_STAT_RULES.basePlayerHp
    + (normalizedPirateStat(progression.vitality) - 1) * PIRATE_STAT_RULES.hpPerVitality;
  if (!validCurrentHp(currentHp, hpMax)) return result(false, 'invalid_current_hp');
  const created = createCombatProfile({
    entityId,
    ownerDomain: 'Pirate',
    entityKind,
    level,
    types,
    stats: {
      hpMax,
      hpCurrent: currentHp,
      atk: pirateScaledDamage(
        authoritativeDefinition.physicalBaseDamage,
        progression,
        authoritativeDefinition.physicalCategory,
      ),
      def: authoritativeDefinition.def,
      spAtk: pirateScaledDamage(authoritativeDefinition.specialBaseDamage, progression, 'fruit'),
      spDef: authoritativeDefinition.spDef,
      spd: authoritativeDefinition.spd,
      accuracy: authoritativeDefinition.accuracy,
      crit: authoritativeDefinition.crit,
      evasion: authoritativeDefinition.evasion,
      resistance: authoritativeDefinition.resistance,
      penetration: authoritativeDefinition.penetration,
    },
    progressionStateVersion,
    calculationVersion: PIRATE_PROGRESSION_SOURCE.calculationVersion,
    definitionVersion: authoritativeDefinition.definitionVersion,
    stateVersion,
  });
  if (!created.ok) return created;
  return result(true, null, {
    profile: created.profile,
    provenance: Object.freeze({
      adapterVersion: COMBAT_V91_ADAPTER_VERSION,
      source: PIRATE_PROGRESSION_SOURCE,
      physicalCategory: authoritativeDefinition.physicalCategory,
    }),
  });
}

export function createDomainCombatProfile(source = {}) {
  if (!isRecord(source) || !isRecord(source.profileInput)) return result(false, 'invalid_domain_profile_source');
  if (source.ownerDomain === 'Pirate') return createPirateCombatProfile(source.profileInput);
  if (source.ownerDomain === 'Pocket') return createPocketCombatProfile(source.profileInput);
  return result(false, 'unsupported_combat_profile_owner');
}
