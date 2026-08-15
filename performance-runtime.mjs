function markShared(resource) {
  if (!resource || typeof resource !== 'object') throw new TypeError('shared resource factory must return an object');
  resource.userData ??= {};
  resource.userData.shared = true;
  return resource;
}

export function createSharedResourceCache() {
  const geometries = new Map();
  const materials = new Map();

  function get(store, key, factory) {
    if (store.has(key)) return store.get(key);
    if (typeof factory !== 'function') throw new TypeError('shared resource factory is required');
    const resource = markShared(factory());
    store.set(key, resource);
    return resource;
  }

  function disposeStore(store) {
    let count = 0;
    for (const resource of store.values()) {
      if (typeof resource?.dispose === 'function') {
        resource.dispose();
        count++;
      }
    }
    store.clear();
    return count;
  }

  return Object.freeze({
    geometry: (key, factory) => get(geometries, key, factory),
    material: (key, factory) => get(materials, key, factory),
    dispose() {
      return {
        geometries: disposeStore(geometries),
        materials: disposeStore(materials),
      };
    },
    stats: () => Object.freeze({ geometries: geometries.size, materials: materials.size }),
  });
}

export function createObjectPool({ create, reset = () => {}, destroy = () => {}, maxSize = 64 } = {}) {
  if (typeof create !== 'function') throw new TypeError('object pool create function is required');
  if (typeof reset !== 'function' || typeof destroy !== 'function') throw new TypeError('object pool reset/destroy must be functions');
  if (!Number.isInteger(maxSize) || maxSize < 0) throw new RangeError('object pool maxSize must be a non-negative integer');

  const free = [];
  const pooled = new WeakSet();
  let created = 0;
  let destroyed = 0;

  return Object.freeze({
    acquire() {
      const object = free.pop() ?? create();
      if (!object || (typeof object !== 'object' && typeof object !== 'function')) throw new TypeError('object pool create must return an object');
      pooled.delete(object);
      if (!Reflect.has(object, '__poolCreated')) {
        Object.defineProperty(object, '__poolCreated', { value: true, configurable: false, enumerable: false });
        created++;
      }
      return object;
    },
    release(object) {
      if (!object || pooled.has(object)) return false;
      reset(object);
      if (free.length < maxSize) {
        pooled.add(object);
        free.push(object);
      } else {
        destroy(object);
        destroyed++;
      }
      return true;
    },
    drain() {
      while (free.length) {
        const object = free.pop();
        pooled.delete(object);
        destroy(object);
        destroyed++;
      }
    },
    stats: () => Object.freeze({ free: free.length, created, destroyed, maxSize }),
  });
}

const QUALITY = Object.freeze({
  low: Object.freeze({ tier: 'low', maxDpr: 1, antialias: false, shadows: false, nearAiHz: 20, midAiHz: 10, farAiHz: 4, labelHz: 8 }),
  medium: Object.freeze({ tier: 'medium', maxDpr: 1.25, antialias: true, shadows: false, nearAiHz: 24, midAiHz: 12, farAiHz: 5, labelHz: 10 }),
  high: Object.freeze({ tier: 'high', maxDpr: 1.5, antialias: true, shadows: true, nearAiHz: 30, midAiHz: 15, farAiHz: 6, labelHz: 15 }),
});

export function selectQualityProfile({
  deviceMemory = 4,
  hardwareConcurrency = 4,
  devicePixelRatio = 1,
  saveData = false,
} = {}) {
  const memory = Number.isFinite(deviceMemory) ? deviceMemory : 4;
  const cores = Number.isFinite(hardwareConcurrency) ? hardwareConcurrency : 4;
  const dpr = Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  if (saveData || memory <= 4 || cores <= 4 || dpr > 2.5 && memory < 8) return QUALITY.low;
  if (memory >= 8 && cores >= 8) return QUALITY.high;
  return QUALITY.medium;
}
export function remainingCountdownSeconds(readyAt, now = Date.now()) {
  const target = Number(readyAt);
  const current = Number(now);
  if (!Number.isFinite(target) || !Number.isFinite(current)) return 0;
  return Math.max(0, Math.ceil((target - current) / 1000));
}
export function shouldRefreshEggCountdown(managerOpen, eggCount) {
  return Boolean(managerOpen) && Number.isInteger(eggCount) && eggCount > 0;
}



export function createDistanceTickScheduler({
  nearDistance = 12,
  midDistance = 24,
  nearHz = 30,
  midHz = 12,
  farHz = 4,
  maxStep = 0.25,
} = {}) {
  if (!(nearDistance > 0) || !(midDistance > nearDistance)) throw new RangeError('distance bands are invalid');
  for (const value of [nearHz, midHz, farHz]) if (!(value > 0)) throw new RangeError('tick frequencies must be positive');
  const elapsedById = new Map();

  function intervalFor(distance) {
    if (distance <= nearDistance) return 1 / nearHz;
    if (distance <= midDistance) return 1 / midHz;
    return 1 / farHz;
  }

  return Object.freeze({
    advance(id, distance, dt, force = false) {
      const frameDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
      if (force) {
        elapsedById.set(id, 0);
        return Math.min(maxStep, frameDt);
      }
      const elapsed = (elapsedById.get(id) ?? 0) + frameDt;
      if (elapsed + Number.EPSILON < intervalFor(Number.isFinite(distance) ? distance : Infinity)) {
        elapsedById.set(id, elapsed);
        return 0;
      }
      elapsedById.set(id, 0);
      return Math.min(maxStep, elapsed);
    },
    clear(id) { elapsedById.delete(id); },
    clearAll() { elapsedById.clear(); },
    size: () => elapsedById.size,
  });
}

export function createDirtyGate({ initial = true, minIntervalMs = 0 } = {}) {
  let dirty = Boolean(initial);
  let lastConsumedAt = -Infinity;
  return Object.freeze({
    mark() { dirty = true; },
    consume(now = performance.now()) {
      if (!dirty || now - lastConsumedAt < minIntervalMs) return false;
      dirty = false;
      lastConsumedAt = now;
      return true;
    },
    isDirty: () => dirty,
  });
}
