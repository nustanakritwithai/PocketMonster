/**
 * Resource ownership for one-document world runtimes.
 *
 * The iframe architecture used browsing-context destruction as its final
 * cleanup boundary. A runtime hosted in the parent document cannot rely on
 * that boundary, so every listener, timer, animation frame, and observer must
 * have one explicit owner. This scope is intentionally independent from the
 * live world router and can be adopted by runtime factories incrementally.
 */
export const WORLD_RUNTIME_RESOURCE_SCOPE_VERSION = 'monster-life-world-runtime-resource-scope/v1';

export const WORLD_RUNTIME_RESOURCE_KINDS = Object.freeze([
  'listener',
  'timeout',
  'interval',
  'animationFrame',
  'observer',
  'cleanup',
]);

const EMPTY_COUNTS = Object.freeze(Object.fromEntries(
  WORLD_RUNTIME_RESOURCE_KINDS.map(kind => [kind, 0]),
));

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function`);
  return value;
}

function requireOpen(state, label) {
  if (state.value !== 'open') {
    throw new Error(`${label} is already ${state.value}`);
  }
}

function reasonText(reason, fallback) {
  if (typeof reason === 'string' && reason.trim()) return reason.trim();
  if (reason && typeof reason === 'object' && typeof reason.message === 'string' && reason.message.trim()) {
    return reason.message.trim();
  }
  return fallback;
}

function errorSummary(error, kind) {
  return Object.freeze({
    kind,
    name: String(error?.name || 'Error'),
    message: String(error?.message || error),
  });
}

function defaultScheduler(globalLike) {
  return Object.freeze({
    setTimeout: typeof globalLike?.setTimeout === 'function'
      ? globalLike.setTimeout.bind(globalLike)
      : null,
    clearTimeout: typeof globalLike?.clearTimeout === 'function'
      ? globalLike.clearTimeout.bind(globalLike)
      : null,
    setInterval: typeof globalLike?.setInterval === 'function'
      ? globalLike.setInterval.bind(globalLike)
      : null,
    clearInterval: typeof globalLike?.clearInterval === 'function'
      ? globalLike.clearInterval.bind(globalLike)
      : null,
    requestAnimationFrame: typeof globalLike?.requestAnimationFrame === 'function'
      ? globalLike.requestAnimationFrame.bind(globalLike)
      : null,
    cancelAnimationFrame: typeof globalLike?.cancelAnimationFrame === 'function'
      ? globalLike.cancelAnimationFrame.bind(globalLike)
      : null,
  });
}

function schedulerFunction(scheduler, name) {
  return requireFunction(scheduler?.[name], `scheduler.${name}`);
}

function assertAbortSignal(signal) {
  if (signal == null) return null;
  if (typeof signal.aborted !== 'boolean'
    || typeof signal.addEventListener !== 'function'
    || typeof signal.removeEventListener !== 'function') {
    throw new TypeError('signal must be an AbortSignal-compatible object');
  }
  return signal;
}

export function assertWorldRuntimeResourceScope(scope, label = 'resourceScope') {
  if (!scope || typeof scope !== 'object') throw new TypeError(`${label} must be an object`);
  for (const method of [
    'listen',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'observe',
    'addCleanup',
    'dispose',
    'diagnostics',
  ]) {
    if (typeof scope[method] !== 'function') throw new TypeError(`${label}.${method} must be a function`);
  }
  return scope;
}

/**
 * Create a synchronous cleanup scope. Cleanup primitives used here are all
 * synchronous browser APIs; async persistence/network shutdown remains the
 * owning runtime lifecycle's responsibility.
 */
export function createWorldRuntimeResourceScope({
  label = 'world-runtime',
  signal = null,
  scheduler = defaultScheduler(globalThis),
} = {}) {
  const scopeLabel = typeof label === 'string' && label.trim() ? label.trim() : 'world-runtime';
  const abortSignal = assertAbortSignal(signal);
  const state = { value: 'open' };
  const records = [];
  const activeRecords = new Set();
  const timeoutRecords = new Map();
  const intervalRecords = new Map();
  const animationFrameRecords = new Map();
  const counts = { ...EMPTY_COUNTS };
  const cleanupErrors = [];
  let disposeReason = null;
  let disposedAt = null;
  let abortListenerInstalled = false;

  function register(kind, cleanup) {
    requireOpen(state, scopeLabel);
    if (!WORLD_RUNTIME_RESOURCE_KINDS.includes(kind)) throw new TypeError(`unknown resource kind: ${kind}`);
    requireFunction(cleanup, `${kind} cleanup`);
    const record = { kind, cleanup, active: true };
    records.push(record);
    activeRecords.add(record);
    counts[kind] += 1;
    return record;
  }

  function release(record, { invoke = true, captureErrors = false } = {}) {
    if (!record?.active) return false;
    record.active = false;
    activeRecords.delete(record);
    counts[record.kind] -= 1;
    if (!invoke) return true;
    try {
      const result = record.cleanup();
      if (result && typeof result.then === 'function') {
        throw new TypeError(`${record.kind} cleanup must be synchronous`);
      }
    } catch (error) {
      if (!captureErrors) throw error;
      cleanupErrors.push(errorSummary(error, record.kind));
    }
    return true;
  }

  function listen(target, type, listener, options) {
    requireOpen(state, scopeLabel);
    if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') {
      throw new TypeError('listener target must support addEventListener/removeEventListener');
    }
    if (typeof type !== 'string' || !type) throw new TypeError('listener type must be a non-empty string');
    if (typeof listener !== 'function' && typeof listener?.handleEvent !== 'function') {
      throw new TypeError('listener must be a function or EventListener object');
    }
    target.addEventListener(type, listener, options);
    const record = register('listener', () => target.removeEventListener(type, listener, options));
    return () => release(record);
  }

  function setTimeoutScoped(callback, delay = 0, ...args) {
    requireOpen(state, scopeLabel);
    requireFunction(callback, 'timeout callback');
    const schedule = schedulerFunction(scheduler, 'setTimeout');
    const clear = schedulerFunction(scheduler, 'clearTimeout');
    let record = null;
    let handle;
    const wrapped = (...callbackArgs) => {
      if (!record?.active) return;
      timeoutRecords.delete(handle);
      release(record, { invoke: false });
      callback(...callbackArgs);
    };
    handle = schedule(wrapped, delay, ...args);
    record = register('timeout', () => {
      timeoutRecords.delete(handle);
      clear(handle);
    });
    timeoutRecords.set(handle, record);
    return handle;
  }

  function clearTimeoutScoped(handle) {
    const record = timeoutRecords.get(handle);
    return record ? release(record) : false;
  }

  function setIntervalScoped(callback, delay = 0, ...args) {
    requireOpen(state, scopeLabel);
    requireFunction(callback, 'interval callback');
    const schedule = schedulerFunction(scheduler, 'setInterval');
    const clear = schedulerFunction(scheduler, 'clearInterval');
    let record = null;
    let handle;
    const wrapped = (...callbackArgs) => {
      if (record?.active) callback(...callbackArgs);
    };
    handle = schedule(wrapped, delay, ...args);
    record = register('interval', () => {
      intervalRecords.delete(handle);
      clear(handle);
    });
    intervalRecords.set(handle, record);
    return handle;
  }

  function clearIntervalScoped(handle) {
    const record = intervalRecords.get(handle);
    return record ? release(record) : false;
  }

  function requestAnimationFrameScoped(callback) {
    requireOpen(state, scopeLabel);
    requireFunction(callback, 'animation frame callback');
    const schedule = schedulerFunction(scheduler, 'requestAnimationFrame');
    const cancel = schedulerFunction(scheduler, 'cancelAnimationFrame');
    let record = null;
    let handle;
    const wrapped = timestamp => {
      if (!record?.active) return;
      animationFrameRecords.delete(handle);
      release(record, { invoke: false });
      callback(timestamp);
    };
    handle = schedule(wrapped);
    record = register('animationFrame', () => {
      animationFrameRecords.delete(handle);
      cancel(handle);
    });
    animationFrameRecords.set(handle, record);
    return handle;
  }

  function cancelAnimationFrameScoped(handle) {
    const record = animationFrameRecords.get(handle);
    return record ? release(record) : false;
  }

  function observe(observer, target, options) {
    requireOpen(state, scopeLabel);
    if (!observer || typeof observer.observe !== 'function' || typeof observer.disconnect !== 'function') {
      throw new TypeError('observer must support observe/disconnect');
    }
    observer.observe(target, options);
    const record = register('observer', () => observer.disconnect());
    return () => release(record);
  }

  function addCleanup(cleanup) {
    const record = register('cleanup', cleanup);
    return () => release(record);
  }

  function dispose(reason = 'resource-scope-dispose') {
    if (state.value === 'disposed') return false;
    if (state.value === 'disposing') return false;
    state.value = 'disposing';
    disposeReason = reasonText(reason, 'resource-scope-dispose');
    if (abortSignal && abortListenerInstalled) {
      abortSignal.removeEventListener('abort', onAbort);
      abortListenerInstalled = false;
    }
    for (let index = records.length - 1; index >= 0; index -= 1) {
      release(records[index], { captureErrors: true });
    }
    timeoutRecords.clear();
    intervalRecords.clear();
    animationFrameRecords.clear();
    state.value = 'disposed';
    disposedAt = Date.now();
    return true;
  }

  function onAbort() {
    dispose(reasonText(abortSignal?.reason, 'operation-aborted'));
  }

  function diagnostics() {
    const active = Object.freeze({ ...counts });
    return Object.freeze({
      kind: WORLD_RUNTIME_RESOURCE_SCOPE_VERSION,
      label: scopeLabel,
      state: state.value,
      disposed: state.value === 'disposed',
      disposeReason,
      disposedAt,
      active,
      activeTotal: Object.values(active).reduce((sum, value) => sum + value, 0),
      cleanupErrors: Object.freeze([...cleanupErrors]),
    });
  }

  const scope = Object.freeze({
    kind: WORLD_RUNTIME_RESOURCE_SCOPE_VERSION,
    listen,
    setTimeout: setTimeoutScoped,
    clearTimeout: clearTimeoutScoped,
    setInterval: setIntervalScoped,
    clearInterval: clearIntervalScoped,
    requestAnimationFrame: requestAnimationFrameScoped,
    cancelAnimationFrame: cancelAnimationFrameScoped,
    observe,
    addCleanup,
    dispose,
    diagnostics,
  });

  if (abortSignal?.aborted) {
    dispose(reasonText(abortSignal.reason, 'operation-aborted'));
  } else if (abortSignal) {
    abortSignal.addEventListener('abort', onAbort, { once: true });
    abortListenerInstalled = true;
  }

  return scope;
}

export function assertWorldRuntimeResourceScopeClean(scope, label = 'resourceScope') {
  assertWorldRuntimeResourceScope(scope, label);
  const diagnostics = scope.diagnostics();
  if (diagnostics.activeTotal !== 0) {
    throw new Error(`${label} still owns ${diagnostics.activeTotal} active resource(s)`);
  }
  if (diagnostics.cleanupErrors.length !== 0) {
    throw new AggregateError(
      diagnostics.cleanupErrors.map(item => new Error(`${item.kind}: ${item.message}`)),
      `${label} cleanup was incomplete`,
    );
  }
  return diagnostics;
}
