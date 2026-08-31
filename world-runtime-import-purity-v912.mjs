import { assertWorldRuntimeLifecycle } from './world-runtime-lifecycle-v910.mjs';

/**
 * Import contract for a world runtime that will eventually share the parent
 * document with every other world. Importing a runtime module may declare a
 * factory and immutable data only. Browser resources belong to a lifecycle
 * resource scope and therefore cannot be acquired until the host calls the
 * runtime.
 */
export const WORLD_RUNTIME_IMPORT_PURITY_VERSION = 'monster-life-world-runtime-import-purity/v1';
export const WORLD_RUNTIME_FACTORY_KIND = 'monster-life-world-runtime-factory/v1';

export const WORLD_RUNTIME_IMPORT_FORBIDDEN_EFFECTS = Object.freeze([
  'dom-read-or-write',
  'event-listener-registration',
  'timer-or-animation-scheduling',
  'observer-registration',
  'network-or-storage-access',
  'global-publication',
  'runtime-instantiation',
]);

export const WORLD_RUNTIME_IMPORT_PURITY_CONTRACT = Object.freeze({
  version: WORLD_RUNTIME_IMPORT_PURITY_VERSION,
  initialization: 'deferred-factory',
  sideEffects: 'none',
  allowed: Object.freeze([
    'module-declarations',
    'immutable-metadata',
    'factory-definition',
  ]),
  forbidden: WORLD_RUNTIME_IMPORT_FORBIDDEN_EFFECTS,
});

function requireRuntimeId(runtimeId) {
  if (typeof runtimeId !== 'string' || runtimeId.trim() !== runtimeId || runtimeId.length === 0) {
    throw new TypeError('runtimeId must be a non-empty trimmed string');
  }
  return runtimeId;
}

function assertObject(value, label) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

export function assertWorldRuntimeFactory(factory, label = 'worldRuntimeFactory') {
  assertObject(factory, label);
  if (factory.kind !== WORLD_RUNTIME_FACTORY_KIND) {
    throw new TypeError(`${label}.kind must be ${WORLD_RUNTIME_FACTORY_KIND}`);
  }
  requireRuntimeId(factory.runtimeId);
  if (factory.importPurity !== WORLD_RUNTIME_IMPORT_PURITY_CONTRACT) {
    throw new TypeError(`${label}.importPurity must use the shared import-purity contract`);
  }
  if (typeof factory.create !== 'function') {
    throw new TypeError(`${label}.create must be a function`);
  }
  return factory;
}

/**
 * Define, but do not instantiate, a runtime. `createRuntime` is intentionally
 * kept behind create() so importing a module cannot start loops, bind input,
 * inspect the document, or publish a global singleton by accident.
 */
export function defineWorldRuntimeFactory({ runtimeId, createRuntime } = {}) {
  const id = requireRuntimeId(runtimeId);
  if (typeof createRuntime !== 'function') {
    throw new TypeError('createRuntime must be a function');
  }

  const factory = Object.freeze({
    kind: WORLD_RUNTIME_FACTORY_KIND,
    runtimeId: id,
    importPurity: WORLD_RUNTIME_IMPORT_PURITY_CONTRACT,
    create(context = Object.freeze({})) {
      const runtime = createRuntime(context);
      if (runtime && typeof runtime.then === 'function') {
        throw new TypeError(`worldRuntimeFactory(${id}).create must be synchronous`);
      }
      return assertWorldRuntimeLifecycle(runtime, `worldRuntimeFactory(${id}) result`);
    },
  });

  return assertWorldRuntimeFactory(factory);
}

/**
 * Resolve the conventional export without evaluating a runtime factory. A
 * module may export either `worldRuntimeFactory`, default, or both when both
 * names refer to the same immutable factory.
 */
export function worldRuntimeFactoryFromModule(moduleNamespace, label = 'worldRuntimeModule') {
  assertObject(moduleNamespace, label);
  const named = moduleNamespace.worldRuntimeFactory;
  const fallback = moduleNamespace.default;
  if (named && fallback && named !== fallback) {
    throw new TypeError(`${label} exports conflicting runtime factories`);
  }
  const factory = named || fallback;
  if (!factory) {
    throw new TypeError(`${label} must export worldRuntimeFactory or default`);
  }
  return assertWorldRuntimeFactory(factory, `${label}.worldRuntimeFactory`);
}
