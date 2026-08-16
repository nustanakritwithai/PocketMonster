export const APP_VERSION = '8.0.0';
export const ASSET_REVISION = '710';
export const SAVE_SCHEMA_VERSION = 8;
export const SAVE_KEY = 'monster-life-rpg-proto-v6';
export const SAVE_BACKUP_KEY = `${SAVE_KEY}:backup`;
export const LEGACY_SAVE_KEYS = Object.freeze([
  'monster-life-rpg-proto-v5',
  'monster-capture-summon-proto-v4',
]);

function parseEnvelope(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const envelope = JSON.parse(raw);
    return envelope && typeof envelope === 'object' && envelope.state && typeof envelope.state === 'object'
      ? envelope
      : null;
  } catch {
    return null;
  }
}

function uniqueKnownIds(values, knownIds, excluded = new Set()) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value !== 'string' || !knownIds.has(value) || excluded.has(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function normalizeSavedState(input, { ranchCap = 6, now = Date.now() } = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const collection = [];
  const knownIds = new Set();
  for (const monster of Array.isArray(source.collection) ? source.collection : []) {
    if (!monster || typeof monster !== 'object' || typeof monster.instanceId !== 'string' || knownIds.has(monster.instanceId)) continue;
    knownIds.add(monster.instanceId);
    collection.push(monster);
  }

  const partySeen = new Set();
  const sourceParty = Array.isArray(source.party) ? source.party : [];
  const party = Array.from({ length: 3 }, (_, index) => {
    const id = sourceParty[index];
    if (typeof id !== 'string' || !knownIds.has(id) || partySeen.has(id)) return null;
    partySeen.add(id);
    return id;
  });
  const storage = uniqueKnownIds(source.storage, knownIds, partySeen);
  const storageIds = new Set(storage);
  const ranchActive = uniqueKnownIds(source.ranchActive, storageIds).slice(0, Math.max(0, ranchCap));
  const selectedSlot = Number.isInteger(source.selectedSlot)
    ? Math.max(0, Math.min(2, source.selectedSlot))
    : 0;

  return {
    ...source,
    collection,
    party,
    storage,
    ranchActive,
    selectedSlot,
    lifeLastAt: Number.isFinite(source.lifeLastAt)
      ? source.lifeLastAt
      : Number.isFinite(source.trainingLastAt) ? source.trainingLastAt : now,
    inventory: {
      captureBalls: source.inventory?.captureBalls ?? 12,
      protein: source.inventory?.protein ?? 6,
      healthy: source.inventory?.healthy ?? 6,
      favorite: source.inventory?.favorite ?? 6,
    },
    saveVersion: SAVE_SCHEMA_VERSION,
  };
}

export function readStoredSave(storage) {
  const current = parseEnvelope(storage.getItem(SAVE_KEY));
  if (current) return { ...current, source: 'current' };

  const backup = parseEnvelope(storage.getItem(SAVE_BACKUP_KEY));
  if (backup) return { ...backup, source: 'backup' };

  for (const key of LEGACY_SAVE_KEYS) {
    const legacy = parseEnvelope(storage.getItem(key));
    if (legacy) return { ...legacy, source: key };
  }
  return null;
}

export function writeStoredSave(storage, envelope) {
  if (!envelope?.state || typeof envelope.state !== 'object') throw new TypeError('save envelope state is required');
  const previousRaw = storage.getItem(SAVE_KEY);
  if (parseEnvelope(previousRaw)) storage.setItem(SAVE_BACKUP_KEY, previousRaw);
  const next = {
    ...envelope,
    appVersion: APP_VERSION,
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
  };
  storage.setItem(SAVE_KEY, JSON.stringify(next));
  return next;
}
