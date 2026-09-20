// ข้อมูลบัญชีอยู่ที่ parent เท่านั้น ไม่ส่ง session token เข้า sandbox ของเกม
const KEYS = Object.freeze({ checkpoint: 'pirate-fruit:save-v1', progression: 'pirate-fruit:progression-v1',
  inventory: 'pirate-fruit:items-v1', boats: 'pirate-fruit:boats-v1', loadout: 'pirate-fruit:loadout-v1', cargo: 'pirate-fruit:cargo-v1' });

export function pirateDocumentsFromEntries(entries) {
  const player = { schemaVersion: 1 };
  for (const [field, key] of Object.entries(KEYS)) if (field !== 'cargo') player[field] = entries[key] ?? null;
  return { player, cargo: { schemaVersion: 1, cargo: entries[KEYS.cargo] ?? null } };
}

export function pirateEntriesFromDocuments(entries, persisted) {
  if (!persisted?.player || !persisted?.cargo) throw new Error('PIRATE_STATE_INVALID');
  const result = { ...entries };
  for (const [field, key] of Object.entries(KEYS)) {
    const value = field === 'cargo' ? persisted.cargo.cargo : persisted.player[field];
    if (value === null) delete result[key];
    else if (typeof value === 'string') result[key] = value;
    else throw new Error('PIRATE_STATE_INVALID');
  }
  return result;
}

export function createPirateCentralStateClient({ config, getSessionToken, fetchImpl = globalThis.fetch, commandId = () => crypto.randomUUID() }) {
  const url = new URL('api/pirate/state', `${config.apiBaseUrl.replace(/\/$/, '')}/`).href;
  async function request(method, token, body) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 10000);
    try {
      const response = await fetchImpl(url, { method, cache: 'no-store', signal: abort.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-API-Version': config.apiVersion,
          Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (getSessionToken() !== token) throw new Error('STALE_SESSION');
      if (response.status === 404) return { unavailable: true };
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.code || 'PIRATE_STATE_UNAVAILABLE');
      return payload;
    } finally { clearTimeout(timeout); }
  }
  return Object.freeze({
    async bootstrap(entries) {
      const token = getSessionToken();
      if (!token) throw new Error('SESSION_REQUIRED');
      let state = await request('GET', token);
      if (state.unavailable) return { online: false, entries };
      if (!state.initialized) {
        const body = { commandId: commandId(), expectedRevision: state.revision, initialMigration: true,
          ...pirateDocumentsFromEntries(entries) };
        state = await request('POST', token, body);
      }
      return { online: true, revision: state.revision, entries: pirateEntriesFromDocuments(entries, state.persisted) };
    },
  });
}
