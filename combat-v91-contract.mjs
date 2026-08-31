import { RUNTIME_TYPES } from './type-catalog.mjs';

export const COMBAT_V91_CONTRACT_VERSION = 'combat-v91-contract/v2';
export const COMBAT_V91_RULES_VERSION = 'combat-rules/v9.1.2';
export const COMBAT_V91_PROFILE_SCHEMA = 'combat-profile/v9.1';
export const COMBAT_V91_WORLD_SNAPSHOT_SCHEMA = 'world-combat-snapshot/v9.1';
export const COMBAT_V91_ACTION_SCHEMA = 'combat-action/v9.1';

export const COMBAT_STAT_KEYS = Object.freeze([
  'hpMax',
  'hpCurrent',
  'atk',
  'def',
  'spAtk',
  'spDef',
  'spd',
  'accuracy',
  'crit',
  'evasion',
  'resistance',
  'penetration',
]);

export const COMBAT_RATIO_KEYS = Object.freeze([
  'accuracy',
  'crit',
  'evasion',
  'resistance',
  'penetration',
]);

export const COMBAT_INTEGER_STAT_KEYS = Object.freeze([
  'hpMax',
  'hpCurrent',
  'atk',
  'def',
  'spAtk',
  'spDef',
  'spd',
]);

export const COMBAT_MULTIPLIER_KEYS = Object.freeze([
  'atk',
  'def',
  'spAtk',
  'spDef',
  'spd',
  'accuracy',
  'crit',
  'evasion',
  'resistance',
  'penetration',
]);

export const COMBAT_ENTITY_KINDS = Object.freeze(['Human', 'Monster', 'Npc', 'Boss', 'Ship']);
export const COMBAT_OWNER_DOMAINS = Object.freeze(['Pirate', 'Pocket']);
export const COMBAT_CHANNELS = Object.freeze(['physical', 'special']);
export const COMBAT_STATUS_TARGETS = Object.freeze(['actor', 'target']);
export const COMBAT_V91_SAFETY_BOUNDS = Object.freeze({
  multiplierMin: 0,
  multiplierMax: 4,
  statMax: 10_000_000,
  effectiveStatMax: 100_000_000,
  actionPowerMax: 10_000,
  hitCountMax: 32,
  // Shared combat math is Pocket-shaped and therefore uses the locked
  // Monster Life combat-level range. Domain-native progression levels (for
  // example Pirate's 1..2800 scale) are provenance only and must be
  // normalized by their authoritative domain calculator before this point.
  levelMax: 60,
});

const RUNTIME_TYPE_SET = new Set(RUNTIME_TYPES);
const STAT_KEY_SET = new Set(COMBAT_STAT_KEYS);
const MULTIPLIER_KEY_SET = new Set(COMBAT_MULTIPLIER_KEYS);
const PROFILE_METADATA_KEYS = Object.freeze([
  'schemaVersion',
  'entityId',
  'ownerDomain',
  'entityKind',
  'level',
  'types',
  'stats',
  'progressionStateVersion',
  'calculationVersion',
  'definitionVersion',
  'stateVersion',
]);

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

export function canonicalCombatJson(value) {
  return JSON.stringify(canonicalValue(value));
}

// Synchronous SHA-256 keeps fingerprinting identical in browsers, workers and Node
// without making the real-time resolver depend on an asynchronous WebCrypto call.
export function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const message = new Uint8Array(paddedLength);
  message.set(bytes);
  message[bytes.length] = 0x80;
  const view = new DataView(message.buffer);
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  view.setUint32(paddedLength - 8, high);
  view.setUint32(paddedLength - 4, low);

  const k = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const words = new Uint32Array(64);
  const rotateRight = (number, bits) => (number >>> bits) | (number << (32 - bits));

  for (let offset = 0; offset < message.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15];
      const b = words[index - 2];
      const s0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const s1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,hh] = h;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + choice + k[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      hh = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return h.map(number => number.toString(16).padStart(8, '0')).join('');
}

export function fingerprintCombatValue(value) {
  return sha256Hex(canonicalCombatJson(value));
}

function validateTypes(types) {
  return Array.isArray(types) && types.length <= 2
    && new Set(types).size === types.length && types.every(type => RUNTIME_TYPE_SET.has(type));
}

export function validateCombatStats(stats) {
  if (!exactKeys(stats, COMBAT_STAT_KEYS)) return result(false, 'invalid_stats_shape');
  for (const key of COMBAT_STAT_KEYS) {
    if (!Number.isFinite(stats[key]) || stats[key] < 0
      || stats[key] > COMBAT_V91_SAFETY_BOUNDS.statMax) return result(false, 'invalid_stat', { field: key });
  }
  for (const key of COMBAT_INTEGER_STAT_KEYS) {
    if (!Number.isSafeInteger(stats[key])) return result(false, 'invalid_integer_stat', { field: key });
  }
  if (stats.hpMax < 1) return result(false, 'invalid_stat', { field: 'hpMax' });
  for (const key of COMBAT_RATIO_KEYS) {
    if (stats[key] > 1) return result(false, 'ratio_out_of_range', { field: key });
  }
  if (stats.hpCurrent > stats.hpMax) return result(false, 'hp_out_of_range', { field: 'hpCurrent' });
  return result(true, null);
}

export function validateEffectiveCombatStats(stats) {
  if (!exactKeys(stats, COMBAT_STAT_KEYS)) return result(false, 'invalid_stats_shape');
  for (const key of COMBAT_STAT_KEYS) {
    const maximum = key === 'hpMax' || key === 'hpCurrent' || COMBAT_RATIO_KEYS.includes(key)
      ? COMBAT_V91_SAFETY_BOUNDS.statMax
      : COMBAT_V91_SAFETY_BOUNDS.effectiveStatMax;
    if (!Number.isFinite(stats[key]) || stats[key] < 0 || stats[key] > maximum) {
      return result(false, 'invalid_effective_stat', { field: key });
    }
  }
  for (const key of COMBAT_RATIO_KEYS) {
    if (stats[key] > 1) return result(false, 'ratio_out_of_range', { field: key });
  }
  if (stats.hpCurrent > stats.hpMax) return result(false, 'hp_out_of_range', { field: 'hpCurrent' });
  return result(true, null);
}

function profilePayload(input) {
  return {
    schemaVersion: COMBAT_V91_PROFILE_SCHEMA,
    entityId: input.entityId,
    ownerDomain: input.ownerDomain,
    entityKind: input.entityKind,
    level: input.level,
    types: [...input.types],
    stats: Object.fromEntries(COMBAT_STAT_KEYS.map(key => [key, input.stats[key]])),
    progressionStateVersion: input.progressionStateVersion,
    calculationVersion: input.calculationVersion,
    definitionVersion: input.definitionVersion,
    stateVersion: input.stateVersion,
  };
}

export function createCombatProfile(input = {}) {
  if (!isRecord(input)) return result(false, 'invalid_profile');
  const unknown = Object.keys(input).find(key => ![...PROFILE_METADATA_KEYS, 'fingerprint'].includes(key));
  if (unknown) return result(false, 'unknown_profile_field', { field: unknown });
  if (input.schemaVersion !== undefined && input.schemaVersion !== COMBAT_V91_PROFILE_SCHEMA) {
    return result(false, 'profile_schema_mismatch');
  }
  if (!nonEmptyString(input.entityId)) return result(false, 'invalid_entity_id');
  if (!COMBAT_OWNER_DOMAINS.includes(input.ownerDomain)) return result(false, 'invalid_owner_domain');
  if (!COMBAT_ENTITY_KINDS.includes(input.entityKind)) return result(false, 'invalid_entity_kind');
  if (!Number.isInteger(input.level) || input.level < 1 || input.level > COMBAT_V91_SAFETY_BOUNDS.levelMax) {
    return result(false, 'invalid_level');
  }
  if (!validateTypes(input.types)) return result(false, 'invalid_types');
  const statsValidation = validateCombatStats(input.stats);
  if (!statsValidation.ok) return statsValidation;
  for (const field of ['progressionStateVersion', 'calculationVersion', 'definitionVersion']) {
    if (!nonEmptyString(input[field])) return result(false, 'invalid_version', { field });
  }
  if (!Number.isInteger(input.stateVersion) || input.stateVersion < 0) return result(false, 'invalid_state_version');
  const payload = profilePayload(input);
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) {
    return result(false, 'fingerprint_mismatch', { expectedFingerprint: fingerprint });
  }
  const profile = deepFreeze({ ...payload, fingerprint });
  return result(true, null, { profile });
}

export function validateCombatProfile(profile, expected = {}) {
  const created = createCombatProfile(profile);
  if (!created.ok) return created;
  for (const [field, value] of Object.entries(expected)) {
    if (value !== undefined && created.profile[field] !== value) return result(false, 'profile_mismatch', { field });
  }
  return result(true, null, { profile: created.profile });
}

function validateMultipliers(multipliers) {
  if (!isRecord(multipliers)) return result(false, 'invalid_multipliers');
  const unknown = Object.keys(multipliers).find(key => !MULTIPLIER_KEY_SET.has(key));
  if (unknown) return result(false, 'unknown_multiplier', { field: unknown });
  for (const key of COMBAT_MULTIPLIER_KEYS) {
    const value = multipliers[key] ?? 1;
    if (!Number.isFinite(value)
      || value < COMBAT_V91_SAFETY_BOUNDS.multiplierMin
      || value > COMBAT_V91_SAFETY_BOUNDS.multiplierMax) {
      return result(false, 'multiplier_out_of_range', { field: key });
    }
  }
  return result(true, null, {
    multipliers: Object.freeze(Object.fromEntries(COMBAT_MULTIPLIER_KEYS.map(key => [key, multipliers[key] ?? 1]))),
  });
}

export function createWorldCombatSnapshot(input = {}) {
  if (!isRecord(input) || input.authority !== 'server') return result(false, 'invalid_world_authority');
  const allowedKeys = [
    'schemaVersion', 'authority', 'worldSnapshotTick', 'combatTimeSec', 'worldModifierVersion',
    'actorEntityId', 'targetEntityId', 'actorMultipliers', 'targetMultipliers',
    'validation', 'rngVersion', 'rngSeed', 'rngTicketId',
    'rngTicketStateVersion', 'rngExpiresAtWorldTick', 'fingerprint',
  ];
  const unknown = Object.keys(input).find(key => !allowedKeys.includes(key));
  if (unknown) return result(false, 'unknown_world_snapshot_field', { field: unknown });
  if (input.schemaVersion !== undefined && input.schemaVersion !== COMBAT_V91_WORLD_SNAPSHOT_SCHEMA) {
    return result(false, 'world_snapshot_schema_mismatch');
  }
  if (!Number.isInteger(input.worldSnapshotTick) || input.worldSnapshotTick < 0) return result(false, 'invalid_world_tick');
  if (!Number.isFinite(input.combatTimeSec) || input.combatTimeSec < 0) return result(false, 'invalid_combat_time');
  if (!nonEmptyString(input.worldModifierVersion)) return result(false, 'invalid_world_modifier_version');
  if (input.rngVersion !== 'combat-rng/sha256-counter-v1') return result(false, 'invalid_world_rng_version');
  if (typeof input.rngSeed !== 'string' || !/^[0-9a-f]{64}$/.test(input.rngSeed)) {
    return result(false, 'invalid_world_rng_seed');
  }
  if (!nonEmptyString(input.rngTicketId)
    || !Number.isInteger(input.rngTicketStateVersion) || input.rngTicketStateVersion < 0
    || !Number.isInteger(input.rngExpiresAtWorldTick)
    || input.rngExpiresAtWorldTick < input.worldSnapshotTick) return result(false, 'invalid_world_rng_ticket');
  if (!nonEmptyString(input.actorEntityId) || !nonEmptyString(input.targetEntityId)) return result(false, 'invalid_world_entity');
  const actor = validateMultipliers(input.actorMultipliers ?? {});
  if (!actor.ok) return actor;
  const target = validateMultipliers(input.targetMultipliers ?? {});
  if (!target.ok) return target;
  if (!isRecord(input.validation)) return result(false, 'invalid_world_validation');
  const validationKeys = ['targetExists', 'permission', 'inRange', 'lineOfSight', 'safeZone'];
  if (!exactKeys(input.validation, validationKeys)
    || validationKeys.some(key => typeof input.validation[key] !== 'boolean')) {
    return result(false, 'invalid_world_validation');
  }
  const payload = {
    schemaVersion: COMBAT_V91_WORLD_SNAPSHOT_SCHEMA,
    authority: 'server',
    worldSnapshotTick: input.worldSnapshotTick,
    combatTimeSec: input.combatTimeSec,
    worldModifierVersion: input.worldModifierVersion,
    actorEntityId: input.actorEntityId,
    targetEntityId: input.targetEntityId,
    actorMultipliers: actor.multipliers,
    targetMultipliers: target.multipliers,
    validation: { ...input.validation },
    rngVersion: input.rngVersion,
    rngSeed: input.rngSeed,
    rngTicketId: input.rngTicketId,
    rngTicketStateVersion: input.rngTicketStateVersion,
    rngExpiresAtWorldTick: input.rngExpiresAtWorldTick,
  };
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) return result(false, 'fingerprint_mismatch');
  return result(true, null, { snapshot: deepFreeze({ ...payload, fingerprint }) });
}

export function createCombatActionDefinition(input = {}) {
  if (!isRecord(input)) return result(false, 'invalid_action');
  const allowedKeys = [
    'schemaVersion', 'actionId', 'definitionVersion', 'channel', 'power', 'accuracy',
    'element', 'hitCount', 'criticalAllowed', 'armorPierce', 'statusApplications', 'fingerprint',
  ];
  const unknown = Object.keys(input).find(key => !allowedKeys.includes(key));
  if (unknown) return result(false, 'unknown_action_field', { field: unknown });
  if (input.schemaVersion !== undefined && input.schemaVersion !== COMBAT_V91_ACTION_SCHEMA) {
    return result(false, 'action_schema_mismatch');
  }
  if (!nonEmptyString(input.actionId) || !nonEmptyString(input.definitionVersion)) return result(false, 'invalid_action_identity');
  if (!COMBAT_CHANNELS.includes(input.channel)) return result(false, 'invalid_action_channel');
  if (!Number.isFinite(input.power) || input.power < 0 || input.power > COMBAT_V91_SAFETY_BOUNDS.actionPowerMax) {
    return result(false, 'invalid_action_power');
  }
  if (!Number.isFinite(input.accuracy) || input.accuracy < 0 || input.accuracy > 1) return result(false, 'invalid_action_accuracy');
  if (input.element !== null && !RUNTIME_TYPE_SET.has(input.element)) return result(false, 'invalid_action_element');
  if (!Number.isInteger(input.hitCount) || input.hitCount < 1 || input.hitCount > COMBAT_V91_SAFETY_BOUNDS.hitCountMax) {
    return result(false, 'invalid_hit_count');
  }
  if (typeof input.criticalAllowed !== 'boolean') return result(false, 'invalid_critical_policy');
  if (!Number.isFinite(input.armorPierce) || input.armorPierce < 0 || input.armorPierce > 1) {
    return result(false, 'invalid_armor_pierce');
  }
  if (!Array.isArray(input.statusApplications)) return result(false, 'invalid_status_applications');
  const statusApplications = [];
  for (const application of input.statusApplications) {
    if (!exactKeys(application, ['linkId', 'target']) || !nonEmptyString(application.linkId)
      || !COMBAT_STATUS_TARGETS.includes(application.target)) return result(false, 'invalid_status_application');
    statusApplications.push(Object.freeze({ linkId: application.linkId, target: application.target }));
  }
  const payload = {
    schemaVersion: COMBAT_V91_ACTION_SCHEMA,
    actionId: input.actionId,
    definitionVersion: input.definitionVersion,
    channel: input.channel,
    power: input.power,
    accuracy: input.accuracy,
    element: input.element,
    hitCount: input.hitCount,
    criticalAllowed: input.criticalAllowed,
    armorPierce: input.armorPierce,
    statusApplications,
  };
  const fingerprint = fingerprintCombatValue(payload);
  if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) return result(false, 'fingerprint_mismatch');
  return result(true, null, { action: deepFreeze({ ...payload, fingerprint }) });
}

export function combatStatShapeOnly(stats) {
  if (!isRecord(stats)) return null;
  if (Object.keys(stats).some(key => !STAT_KEY_SET.has(key))) return null;
  return Object.fromEntries(COMBAT_STAT_KEYS.map(key => [key, stats[key]]));
}
