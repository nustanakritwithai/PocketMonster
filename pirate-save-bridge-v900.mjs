export const PIRATE_SAVE_PREFIX = 'pirate-fruit:';
export const PIRATE_SAVE_MAX_KEY_LENGTH = 128;
export const PIRATE_SAVE_MAX_VALUE_BYTES = 512 * 1024;
export const PIRATE_SAVE_MAX_TOTAL_BYTES = 2 * 1024 * 1024;
export const PIRATE_SAVE_MAX_KEYS = 64;
export const PIRATE_SAVE_REQUEST_MESSAGE = 'pocketmonster:pirate-save-request-v1';
export const PIRATE_SAVE_SNAPSHOT_MESSAGE = 'pocketmonster:pirate-save-snapshot-v1';
export const PIRATE_SAVE_MUTATION_MESSAGE = 'pocketmonster:pirate-save-mutation-v1';

const encoder = new TextEncoder();

export function isPirateSaveKey(key) {
  return typeof key === 'string'
    && key.startsWith(PIRATE_SAVE_PREFIX)
    && key.length > PIRATE_SAVE_PREFIX.length
    && key.length <= PIRATE_SAVE_PREFIX.length + PIRATE_SAVE_MAX_KEY_LENGTH;
}

function validValue(value) {
  return typeof value === 'string' && encoder.encode(value).byteLength <= PIRATE_SAVE_MAX_VALUE_BYTES;
}

function validRequestId(requestId) {
  return typeof requestId === 'string' && /^[A-Za-z0-9_-]{8,96}$/.test(requestId);
}

function pirateKeys(storage) {
  const keys = [];
  const length = Math.min(Number(storage?.length) || 0, 4096);
  for (let index = 0; index < length && keys.length < PIRATE_SAVE_MAX_KEYS; index += 1) {
    let key = null;
    try { key = storage.key(index); } catch { continue; }
    if (isPirateSaveKey(key)) keys.push(key);
  }
  return keys;
}

export function readPirateSaveSnapshot(storage = globalThis.localStorage) {
  const entries = {};
  let totalBytes = 0;
  for (const key of pirateKeys(storage)) {
    let value = null;
    try { value = storage.getItem(key); } catch { continue; }
    if (!validValue(value)) continue;
    const bytes = encoder.encode(value).byteLength;
    if (totalBytes + bytes > PIRATE_SAVE_MAX_TOTAL_BYTES) break;
    entries[key] = value;
    totalBytes += bytes;
  }
  return entries;
}

export function applyPirateSaveMutation(storage, mutation) {
  if (!storage || !mutation || typeof mutation !== 'object') return false;
  try {
    if (mutation.op === 'set') {
      if (!isPirateSaveKey(mutation.key) || !validValue(mutation.value)) return false;
      const keys = pirateKeys(storage);
      const previous = storage.getItem(mutation.key);
      if (previous === null && keys.length >= PIRATE_SAVE_MAX_KEYS) return false;
      let totalBytes = 0;
      for (const key of keys) {
        const value = storage.getItem(key);
        if (typeof value === 'string') totalBytes += encoder.encode(value).byteLength;
      }
      const previousBytes = typeof previous === 'string' ? encoder.encode(previous).byteLength : 0;
      const nextBytes = encoder.encode(mutation.value).byteLength;
      if (totalBytes - previousBytes + nextBytes > PIRATE_SAVE_MAX_TOTAL_BYTES) return false;
      storage.setItem(mutation.key, mutation.value);
      return true;
    }
    if (mutation.op === 'remove') {
      if (!isPirateSaveKey(mutation.key)) return false;
      storage.removeItem(mutation.key);
      return true;
    }
    if (mutation.op === 'clear') {
      for (const key of pirateKeys(storage)) storage.removeItem(key);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function createPirateSaveMemoryStorage(initialEntries = {}, onMutation = () => {}) {
  const values = new Map();
  let totalBytes = 0;
  for (const [key, value] of Object.entries(initialEntries || {})) {
    if (!isPirateSaveKey(key) || !validValue(value) || values.size >= PIRATE_SAVE_MAX_KEYS) continue;
    const bytes = encoder.encode(value).byteLength;
    if (totalBytes + bytes > PIRATE_SAVE_MAX_TOTAL_BYTES) break;
    values.set(key, value);
    totalBytes += bytes;
  }
  const storage = Object.freeze({
    get length() { return values.size; },
    key(index) { return [...values.keys()][Number(index)] ?? null; },
    getItem(key) {
      const normalized = String(key);
      return values.has(normalized) ? values.get(normalized) : null;
    },
    setItem(key, value) {
      const normalizedKey = String(key);
      const normalizedValue = String(value);
      if (!isPirateSaveKey(normalizedKey)) throw new TypeError('Invalid Pirate save key');
      if (!validValue(normalizedValue)) throw new TypeError('Pirate save value is too large');
      const previous = values.get(normalizedKey);
      const previousBytes = previous === undefined ? 0 : encoder.encode(previous).byteLength;
      const nextBytes = encoder.encode(normalizedValue).byteLength;
      if (totalBytes - previousBytes + nextBytes > PIRATE_SAVE_MAX_TOTAL_BYTES) {
        throw new TypeError('Pirate save storage is too large');
      }
      if (!values.has(normalizedKey) && values.size >= PIRATE_SAVE_MAX_KEYS) {
        throw new TypeError('Pirate save has too many keys');
      }
      values.set(normalizedKey, normalizedValue);
      totalBytes = totalBytes - previousBytes + nextBytes;
      onMutation(Object.freeze({ op: 'set', key: normalizedKey, value: normalizedValue }));
    },
    removeItem(key) {
      const normalized = String(key);
      if (!isPirateSaveKey(normalized)) return;
      const previous = values.get(normalized);
      if (previous === undefined) return;
      totalBytes -= encoder.encode(previous).byteLength;
      values.delete(normalized);
      onMutation(Object.freeze({ op: 'remove', key: normalized }));
    },
    clear() {
      values.clear();
      totalBytes = 0;
      onMutation(Object.freeze({ op: 'clear' }));
    },
  });
  return storage;
}

export function bindPirateSaveHost(frame, {
  windowLike = globalThis.window,
  storage = globalThis.localStorage,
} = {}) {
  if (!windowLike?.addEventListener || !frame) return () => {};
  const onMessage = event => {
    if (event.source !== frame.contentWindow || event.origin !== 'null') return;
    const message = event.data;
    if (message?.type === PIRATE_SAVE_REQUEST_MESSAGE && validRequestId(message.requestId)) {
      event.source?.postMessage?.(Object.freeze({
        type: PIRATE_SAVE_SNAPSHOT_MESSAGE,
        requestId: message.requestId,
        entries: readPirateSaveSnapshot(storage),
      }), '*');
      return;
    }
    if (message?.type !== PIRATE_SAVE_MUTATION_MESSAGE) return;
    applyPirateSaveMutation(storage, message);
  };
  windowLike.addEventListener('message', onMessage);
  return () => windowLike.removeEventListener('message', onMessage);
}

function sandboxRequestId(windowLike) {
  try {
    const uuid = windowLike.crypto?.randomUUID?.();
    if (validRequestId(uuid)) return uuid;
  } catch {}
  return `save_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export async function installPirateSaveSandbox({
  windowLike = globalThis.window,
  parentOrigin = new URLSearchParams(globalThis.location?.search || '').get('parentOrigin'),
  timeoutMs = 3000,
} = {}) {
  if (!windowLike?.addEventListener || !windowLike.parent || windowLike.parent === windowLike) return false;
  if (typeof parentOrigin !== 'string' || !/^https?:\/\/[^/]+(?::\d+)?$/.test(parentOrigin)) return false;
  const requestId = sandboxRequestId(windowLike);
  const entries = await new Promise(resolve => {
    let settled = false;
    const finish = snapshot => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      windowLike.removeEventListener('message', onMessage);
      resolve(snapshot);
    };
    const onMessage = event => {
      if (event.source !== windowLike.parent || event.origin !== parentOrigin) return;
      const message = event.data;
      if (message?.type !== PIRATE_SAVE_SNAPSHOT_MESSAGE || message.requestId !== requestId) return;
      finish(message.entries && typeof message.entries === 'object' ? message.entries : {});
    };
    const timer = setTimeout(() => finish({}), Math.max(50, Math.min(Number(timeoutMs) || 3000, 10000)));
    windowLike.addEventListener('message', onMessage);
    windowLike.parent.postMessage(Object.freeze({ type: PIRATE_SAVE_REQUEST_MESSAGE, requestId }), parentOrigin);
  });
  const storage = createPirateSaveMemoryStorage(entries, mutation => {
    windowLike.parent.postMessage(Object.freeze({ type: PIRATE_SAVE_MUTATION_MESSAGE, ...mutation }), parentOrigin);
  });
  try {
    Object.defineProperty(windowLike, 'localStorage', {
      configurable: false,
      enumerable: true,
      writable: false,
      value: storage,
    });
  } catch {
    return false;
  }
  return true;
}
