// Typed child-to-parent operation transport for the opaque Pirate sandbox.
// Authentication stays in the parent; this client only carries a sanitized
// operation and a request id across postMessage.
export const PIRATE_OPERATION_REQUEST_MESSAGE = 'pocketmonster:pirate-operation-request-v1';
export const PIRATE_OPERATION_REPLY_MESSAGE = 'pocketmonster:pirate-operation-reply-v1';
export const PIRATE_OPERATION_TIMEOUT_MS = 8_000;
const MAX_OPERATION_BYTES = 64 * 1024;
const SECRET_KEY = /(token|authorization|password|secret|credential)/i;

function requestId(fallback = () => `pirate-operation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`) {
  return globalThis.crypto?.randomUUID?.() || fallback();
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function containsSecret(value) {
  if (Array.isArray(value)) return value.some(containsSecret);
  if (!plainObject(value)) return false;
  return Object.entries(value).some(([key, child]) => SECRET_KEY.test(key) || containsSecret(child));
}

export function sanitizePirateOperation(operation) {
  if (!plainObject(operation) || containsSecret(operation)) return null;
  try {
    const encoded = JSON.stringify(operation);
    if (typeof encoded !== 'string' || new TextEncoder().encode(encoded).byteLength > MAX_OPERATION_BYTES) return null;
    const copy = JSON.parse(encoded);
    return plainObject(copy) ? Object.freeze(copy) : null;
  } catch { return null; }
}

function validRequestId(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

function validOrigin(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch { return false; }
}

export function createPocketOperationClient({
  parentOrigin,
  windowLike = globalThis,
  timeoutMs = PIRATE_OPERATION_TIMEOUT_MS,
  makeRequestId = requestId,
} = {}) {
  if (!validOrigin(parentOrigin)) throw new Error('PIRATE_PARENT_ORIGIN_INVALID');
  if (!windowLike?.parent?.postMessage || typeof windowLike.addEventListener !== 'function') {
    throw new Error('PIRATE_PARENT_BRIDGE_UNAVAILABLE');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > PIRATE_OPERATION_TIMEOUT_MS) {
    throw new Error('PIRATE_OPERATION_TIMEOUT_INVALID');
  }
  const pending = new Map();
  const onMessage = event => {
    if (event?.origin !== parentOrigin || event.source !== windowLike.parent) return;
    const message = event.data;
    if (!message || message.type !== PIRATE_OPERATION_REPLY_MESSAGE || !validRequestId(message.requestId)) return;
    const entry = pending.get(message.requestId);
    if (!entry) return;
    pending.delete(message.requestId);
    clearTimeout(entry.timer);
    if (message.ok !== true) {
      const error = new Error(typeof message.errorMessage === 'string' ? message.errorMessage : 'Pirate operation rejected');
      error.code = typeof message.errorCode === 'string' ? message.errorCode : 'PIRATE_OPERATION_REJECTED';
      entry.reject(error);
      return;
    }
    if (!Number.isSafeInteger(message.revision) || message.revision < 0) {
      entry.reject(new Error('PIRATE_OPERATION_REPLY_INVALID'));
      return;
    }
    entry.resolve(Object.freeze({ revision: message.revision, persisted: message.persisted, outcome: message.outcome }));
  };
  windowLike.addEventListener('message', onMessage);

  const request = operation => {
    const safeOperation = sanitizePirateOperation(operation);
    if (!safeOperation) return Promise.reject(new Error('PIRATE_OPERATION_INVALID'));
    const id = makeRequestId();
    if (!validRequestId(id) || pending.has(id)) return Promise.reject(new Error('PIRATE_OPERATION_REQUEST_ID_INVALID'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        const error = new Error('Pirate operation timed out');
        error.code = 'PIRATE_OPERATION_TIMEOUT';
        reject(error);
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        windowLike.parent.postMessage({ type: PIRATE_OPERATION_REQUEST_MESSAGE, requestId: id, operation: safeOperation }, parentOrigin);
      } catch (error) {
        clearTimeout(timer); pending.delete(id); reject(error);
      }
    });
  };
  const dispose = () => {
    windowLike.removeEventListener?.('message', onMessage);
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('PIRATE_OPERATION_CLIENT_DISPOSED')); }
    pending.clear();
  };
  return Object.freeze({ request, dispose });
}
