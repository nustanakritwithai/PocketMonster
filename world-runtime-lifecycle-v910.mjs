/**
 * One-document world runtime lifecycle contract.
 *
 * A runtime is a guest of the host. It must receive all shared capabilities
 * through the lifecycle context and must not publish itself through globals.
 * Input is registered separately so the host can keep a single input owner.
 */
export const WORLD_RUNTIME_LIFECYCLE_VERSION = 'monster-life-world-runtime-v1';

export const WORLD_RUNTIME_LIFECYCLE_METHODS = Object.freeze([
  'prepare',
  'mount',
  'pause',
  'resume',
  'unmount',
  'dispose',
  'diagnostics',
]);

export const WORLD_INPUT_ADAPTER_METHODS = Object.freeze([
  'activate',
  'deactivate',
  'diagnostics',
]);

function assertObject(value, label) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    throw new TypeError(`${label} must be an object`);
  }
}

function assertMethods(value, methods, label) {
  assertObject(value, label);
  for (const method of methods) {
    if (typeof value[method] !== 'function') {
      throw new TypeError(`${label}.${method} must be a function`);
    }
  }
  return value;
}

export function assertWorldRuntimeLifecycle(runtime, label = 'worldRuntime') {
  return assertMethods(runtime, WORLD_RUNTIME_LIFECYCLE_METHODS, label);
}

export function assertWorldInputAdapter(adapter, label = 'worldInputAdapter') {
  return assertMethods(adapter, WORLD_INPUT_ADAPTER_METHODS, label);
}

function bindFacade(implementation, methods, assertion, label) {
  assertion(implementation, label);
  const facade = {};
  for (const method of methods) {
    facade[method] = (...args) => implementation[method](...args);
  }
  return Object.freeze(facade);
}

export function defineWorldRuntimeLifecycle(implementation) {
  return bindFacade(
    implementation,
    WORLD_RUNTIME_LIFECYCLE_METHODS,
    assertWorldRuntimeLifecycle,
    'worldRuntime',
  );
}

export function defineWorldInputAdapter(implementation) {
  return bindFacade(
    implementation,
    WORLD_INPUT_ADAPTER_METHODS,
    assertWorldInputAdapter,
    'worldInputAdapter',
  );
}
