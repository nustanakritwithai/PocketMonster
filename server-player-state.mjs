let runtimeConfig;
let sessionToken;

function endpoint(config, path) {
  return new URL(path.replace(/^\//, ''), `${config.apiBaseUrl.replace(/\/$/, '')}/`).href;
}

export function configureServerPlayerState(config, token) {
  runtimeConfig = config;
  sessionToken = typeof token === 'string' && token ? token : undefined;
}

export async function loadServerPlayerState({ fetchImpl = globalThis.fetch } = {}) {
  if (!runtimeConfig?.featureFlags?.playerStateReads || !runtimeConfig.apiBaseUrl || !sessionToken) return null;
  const response = await fetchImpl(endpoint(runtimeConfig, '/api/player/state'), {
    headers: { Accept: 'application/json', Authorization: `Bearer ${sessionToken}` },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(payload?.message || `Player state read failed (${response.status})`);
  return payload;
}

export function mergeServerMonsterProgress(localState, snapshot) {
  if (!snapshot || !Array.isArray(snapshot.monsters)) return localState;
  const placements = Array.isArray(snapshot.placements) ? snapshot.placements : [];
  const party = [null, null, null];
  const storage = [];
  const ranchActive = [];
  for (const row of placements) {
    if (!row || typeof row.instanceId !== 'string') continue;
    if (Number.isInteger(row.partySlot) && row.partySlot >= 0 && row.partySlot < party.length) party[row.partySlot] = row.instanceId;
    if (Number.isInteger(row.storageOrder) && row.storageOrder >= 0) storage[row.storageOrder] = row.instanceId;
    if (Number.isInteger(row.ranchSlot) && row.ranchSlot >= 0) ranchActive[row.ranchSlot] = row.instanceId;
  }
  const progress = snapshot.progress && typeof snapshot.progress === 'object' ? snapshot.progress : {};
  return {
    ...localState,
    ...progress,
    collection: snapshot.monsters,
    party,
    storage: storage.filter(Boolean),
    ranchActive: ranchActive.filter(Boolean),
  };
}
