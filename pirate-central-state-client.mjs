// ข้อมูลบัญชีอยู่ที่ parent เท่านั้น ไม่ส่ง session token เข้า sandbox ของเกม
const KEYS = Object.freeze({ checkpoint: 'pirate-fruit:save-v1', progression: 'pirate-fruit:progression-v1',
  inventory: 'pirate-fruit:items-v1', boats: 'pirate-fruit:boats-v1', loadout: 'pirate-fruit:loadout-v1', cargo: 'pirate-fruit:cargo-v1' });
const STAT_IDS = new Set(['combat', 'vitality', 'blade', 'ranged', 'fruitPower', 'mana']);
const MAX_OPERATION_BYTES = 64 * 1024;
const MAX_OPERATION_QUEUE = 32;

function operationObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function boundedOperation(operation) {
  try {
    return new TextEncoder().encode(JSON.stringify(operation)).byteLength <= MAX_OPERATION_BYTES ? operation : null;
  } catch { return null; }
}

export function sanitizePirateStateOperation(value) {
  const source = operationObject(value);
  if (!source || typeof source.type !== 'string') return null;
  if (source.type === 'checkpoint') {
    if (typeof source.checkpoint !== 'string' || new TextEncoder().encode(source.checkpoint).byteLength > MAX_OPERATION_BYTES) return null;
    return boundedOperation({ type: 'checkpoint', checkpoint: source.checkpoint });
  }
  if (source.type === 'statAllocation') {
    const allocations = operationObject(source.allocations);
    if (!allocations) return null;
    const safe = {};
    for (const [statId, amount] of Object.entries(allocations)) {
      if (!STAT_IDS.has(statId) || !Number.isSafeInteger(amount) || amount <= 0) return null;
      safe[statId] = amount;
    }
    return Object.keys(safe).length ? boundedOperation({ type: 'statAllocation', allocations: safe }) : null;
  }
  if (source.type === 'loadout') {
    const inventoryLoadout = operationObject(source.inventoryLoadout);
    const loadout = operationObject(source.loadout);
    if (!inventoryLoadout || !loadout || (source.quickslots !== undefined
      && (!Array.isArray(source.quickslots) || source.quickslots.length > 16))) return null;
    return boundedOperation({
      type: 'loadout', inventoryLoadout, loadout,
      ...(source.quickslots === undefined ? {} : { quickslots: [...source.quickslots] }),
    });
  }
  return null;
}

export function operationFromPirateSaveMutation(mutation) {
  return sanitizePirateStateOperation(mutation?.operation);
}

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
  const baseUrl = `${config.apiBaseUrl.replace(/\/$/, '')}/`;
  const boundSessionToken = getSessionToken();
  async function request(method, token, body, path = 'api/pirate/state') {
    // คิวจากตัวละครเดิมห้ามย้ายไปบัญชีใหม่เมื่อ logout/login ระหว่างรอเครือข่าย
    if (token !== boundSessionToken || getSessionToken() !== boundSessionToken) throw new Error('STALE_SESSION');
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 10000);
    try {
      const response = await fetchImpl(new URL(path, baseUrl).href, { method, cache: 'no-store', signal: abort.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-API-Version': config.apiVersion,
          Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (getSessionToken() !== token) throw new Error('STALE_SESSION');
      if (response.status === 404 && path === 'api/pirate/state') return { unavailable: true };
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        const error = new Error(payload?.errorCode || payload?.code || 'PIRATE_STATE_UNAVAILABLE');
        error.status = response.status;
        error.code = payload?.errorCode || payload?.code;
        error.serverRevision = Number.isSafeInteger(payload?.revision) ? payload.revision : undefined;
        throw error;
      }
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
    async read() {
      const token = getSessionToken();
      if (!token) throw new Error('SESSION_REQUIRED');
      return request('GET', token);
    },
    async commitOperation(expectedRevision, operation, idempotencyKey = commandId()) {
      const token = getSessionToken();
      if (!token) throw new Error('SESSION_REQUIRED');
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('REVISION_REQUIRED');
      const safeOperation = sanitizePirateStateOperation(operation);
      if (!safeOperation) throw new Error('PIRATE_STATE_OPERATION_INVALID');
      if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) throw new Error('COMMAND_ID_INVALID');
      const result = await request('POST', token, {
        contract: 'pirate-original-state/1', commandId: idempotencyKey, expectedRevision, operation: safeOperation,
      }, 'api/pirate/state/operation');
      return { revision: result.revision, persisted: result.persisted };
    },
  });
}

export function createPirateStateOperationQueue({ client, revision = 0, onPersisted = () => {}, onError = () => {} }) {
  let currentRevision = revision;
  let pending = 0;
  let chain = Promise.resolve();
  const enqueue = operation => {
    const safeOperation = sanitizePirateStateOperation(operation);
    if (!safeOperation) return Promise.reject(new Error('PIRATE_STATE_OPERATION_INVALID'));
    if (pending >= MAX_OPERATION_QUEUE) return Promise.reject(new Error('PIRATE_STATE_OPERATION_QUEUE_FULL'));
    pending += 1;
    const run = chain.then(async () => {
      let conflictRetried = false;
      let transportRetried = false;
      let operationCommandId = globalThis.crypto?.randomUUID?.()
        || `pirate-op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      while (true) {
        try {
          const result = await client.commitOperation(currentRevision, safeOperation, operationCommandId);
          if (!Number.isSafeInteger(result.revision) || result.revision < currentRevision) throw new Error('PIRATE_STATE_REVISION_INVALID');
          currentRevision = result.revision;
          onPersisted(result.persisted);
          return result;
        } catch (error) {
          if (error?.status === undefined && !transportRetried
            && (error instanceof TypeError || error?.name === 'AbortError')) {
            transportRetried = true;
            continue;
          }
          if (conflictRetried || error?.status !== 409 || error?.code !== 'STATE_CONFLICT') { onError(error); throw error; }
          conflictRetried = true;
          const latest = await client.read();
          if (latest?.initialized !== true || !Number.isSafeInteger(latest.revision)) throw error;
          currentRevision = latest.revision;
          operationCommandId = globalThis.crypto?.randomUUID?.()
            || `pirate-op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        }
      }
    }).finally(() => { pending -= 1; });
    chain = run.catch(() => {});
    return run;
  };
  return Object.freeze({ enqueue, get revision() { return currentRevision; }, get pending() { return pending; } });
}
