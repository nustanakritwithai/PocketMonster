import {
  WORLD_RUNTIME_LIFECYCLE_VERSION,
  assertWorldInputAdapter,
  assertWorldRuntimeLifecycle,
} from './world-runtime-lifecycle-v910.mjs';

const HOST_KIND = 'monster-life-one-document-world-runtime-host-v1';

function requireRuntimeId(runtimeId) {
  if (typeof runtimeId !== 'string' || runtimeId.trim() !== runtimeId || runtimeId.length === 0) {
    throw new TypeError('runtimeId must be a non-empty trimmed string');
  }
  return runtimeId;
}

function snapshot(value) {
  if (Array.isArray(value)) return Object.freeze([...value]);
  if (value && typeof value === 'object') return Object.freeze({ ...value });
  return value ?? null;
}

function errorSummary(error) {
  if (!error) return null;
  return Object.freeze({
    name: String(error.name || 'Error'),
    message: String(error.message || error),
  });
}

function abortError(reason = 'world runtime operation was superseded') {
  const error = new Error(String(reason));
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal) {
  if (!signal.aborted) return;
  const reason = signal.reason;
  if (reason?.name === 'AbortError') throw reason;
  throw abortError(reason?.message || reason || 'world runtime operation was aborted');
}

function contextFor({ record, generation, signal, route, reason, phase, services, rollback = false }) {
  return Object.freeze({
    contract: WORLD_RUNTIME_LIFECYCLE_VERSION,
    runtimeId: record.id,
    generation,
    signal,
    route: snapshot(route),
    reason: String(reason || phase),
    phase,
    rollback,
    services,
  });
}

function aggregate(cause, rollbackErrors, message) {
  if (rollbackErrors.length === 0) return cause;
  const error = new AggregateError([cause, ...rollbackErrors], message, { cause });
  error.name = 'WorldRuntimeRollbackError';
  return error;
}

/**
 * Creates a shadow-safe host. Creating the host does not touch the DOM, input,
 * timers, renderers, or the current iframe route. Integration is opt-in.
 */
export function createOneDocumentWorldRuntimeHost({ services = {} } = {}) {
  const records = new Map();
  const runtimeObjects = new WeakSet();
  const sharedServices = snapshot(services);
  const pendingControllers = new Set();

  let activeRuntimeId = null;
  let inputOwnerId = null;
  let requestedGeneration = 0;
  let switching = false;
  let rollingBack = false;
  let closing = false;
  let disposed = false;
  let faulted = false;
  let operationTail = Promise.resolve();
  let disposePromise = null;
  let lastTransition = null;
  let lastError = null;

  function requireOpen() {
    if (closing || disposed) throw new Error('world runtime host is disposing or disposed');
    if (faulted) throw new Error('world runtime host is faulted; dispose and recreate it');
  }

  function requireRecord(runtimeId) {
    const id = requireRuntimeId(runtimeId);
    const record = records.get(id);
    if (!record) throw new Error(`world runtime is not registered: ${id}`);
    if (record.disposed) throw new Error(`world runtime is disposed: ${id}`);
    return record;
  }

  function register(runtimeId, runtime, { inputAdapter = null } = {}) {
    requireOpen();
    const id = requireRuntimeId(runtimeId);
    if (records.has(id)) throw new Error(`world runtime already registered: ${id}`);
    assertWorldRuntimeLifecycle(runtime, `worldRuntime(${id})`);
    if (runtimeObjects.has(runtime)) throw new Error('the same world runtime cannot be registered twice');
    if (inputAdapter !== null) assertWorldInputAdapter(inputAdapter, `worldInputAdapter(${id})`);

    const record = {
      id,
      runtime,
      inputAdapter,
      prepared: false,
      mounted: false,
      paused: false,
      disposed: false,
      route: null,
      lastGeneration: 0,
      lastPhase: 'registered',
    };
    records.set(id, record);
    runtimeObjects.add(runtime);

    let registrationActive = true;
    return () => {
      if (!registrationActive) return false;
      if (record.prepared || record.mounted || activeRuntimeId === id || switching) return false;
      registrationActive = false;
      records.delete(id);
      runtimeObjects.delete(runtime);
      return true;
    };
  }

  async function invoke(record, method, operation, { route, reason, phase = method, rollback = false } = {}) {
    const lifecycleContext = contextFor({
      record,
      generation: operation.generation,
      signal: operation.signal,
      route,
      reason,
      phase,
      services: sharedServices,
      rollback,
    });
    await record.runtime[method](lifecycleContext);
    record.lastGeneration = operation.generation;
    record.lastPhase = phase;
  }

  async function activateInput(record, operation, options = {}) {
    if (!record.inputAdapter) return false;
    if (inputOwnerId && inputOwnerId !== record.id) {
      throw new Error(`input adapter is already owned by ${inputOwnerId}`);
    }
    const lifecycleContext = contextFor({
      record,
      generation: operation.generation,
      signal: operation.signal,
      route: options.route,
      reason: options.reason,
      phase: options.phase || 'input-activate',
      services: sharedServices,
      rollback: options.rollback === true,
    });
    try {
      await record.inputAdapter.activate(lifecycleContext);
      inputOwnerId = record.id;
      return true;
    } catch (error) {
      try {
        await record.inputAdapter.deactivate(lifecycleContext);
      } catch {
        // The original activation error is authoritative. Rollback diagnostics
        // still report that no adapter lease was committed by this host.
      }
      throw error;
    }
  }

  async function deactivateInput(record, operation, options = {}) {
    if (!record.inputAdapter || inputOwnerId !== record.id) return false;
    const lifecycleContext = contextFor({
      record,
      generation: operation.generation,
      signal: operation.signal,
      route: options.route,
      reason: options.reason,
      phase: options.phase || 'input-deactivate',
      services: sharedServices,
      rollback: options.rollback === true,
    });
    await record.inputAdapter.deactivate(lifecycleContext);
    inputOwnerId = null;
    return true;
  }

  function rollbackOperation(operation) {
    const controller = new AbortController();
    return Object.freeze({ generation: operation.generation, signal: controller.signal });
  }

  async function rollbackSwitch({
    cause,
    operation,
    previous,
    previousSnapshot,
    previousPausedBySwitch,
    previousInputReleased,
    previousUnmounted,
    next,
    nextMountAttempted,
    nextInputActivated,
  }) {
    rollingBack = true;
    const errors = [];
    const rollback = rollbackOperation(operation);
    const rollbackReason = `rollback:${next.id}`;

    if (nextInputActivated || inputOwnerId === next.id) {
      try {
        await deactivateInput(next, rollback, {
          route: next.route,
          reason: rollbackReason,
          phase: 'rollback-input-deactivate',
          rollback: true,
        });
      } catch (error) {
        errors.push(error);
        inputOwnerId = null;
      }
    }

    if (nextMountAttempted) {
      try {
        await invoke(next, 'unmount', rollback, {
          route: next.route,
          reason: rollbackReason,
          phase: 'rollback-unmount',
          rollback: true,
        });
        next.mounted = false;
        next.paused = false;
      } catch (error) {
        errors.push(error);
      }
    }

    if (previous) {
      try {
        if (previousUnmounted) {
          await invoke(previous, 'mount', rollback, {
            route: previousSnapshot.route,
            reason: rollbackReason,
            phase: 'rollback-mount',
            rollback: true,
          });
          previous.mounted = true;
          previous.paused = false;
        } else if (previousPausedBySwitch && !previousSnapshot.paused) {
          await invoke(previous, 'resume', rollback, {
            route: previousSnapshot.route,
            reason: rollbackReason,
            phase: 'rollback-resume',
            rollback: true,
          });
          previous.paused = false;
        }

        if (previousSnapshot.paused && previous.mounted && !previous.paused) {
          await invoke(previous, 'pause', rollback, {
            route: previousSnapshot.route,
            reason: rollbackReason,
            phase: 'rollback-pause',
            rollback: true,
          });
          previous.paused = true;
        }

        if (previousInputReleased && !previousSnapshot.paused) {
          await activateInput(previous, rollback, {
            route: previousSnapshot.route,
            reason: rollbackReason,
            phase: 'rollback-input-activate',
            rollback: true,
          });
        }
        previous.route = previousSnapshot.route;
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      activeRuntimeId = null;
      inputOwnerId = null;
      faulted = true;
    }
    rollingBack = false;
    throw aggregate(cause, errors, `world runtime switch to ${next.id} failed and rollback was incomplete`);
  }

  async function performSwitch(next, route, reason, operation) {
    if (activeRuntimeId === next.id) {
      if (next.paused) return performResume(next, reason, operation);
      return false;
    }

    const previous = activeRuntimeId ? requireRecord(activeRuntimeId) : null;
    const previousSnapshot = previous
      ? Object.freeze({ route: previous.route, paused: previous.paused })
      : null;
    let previousPausedBySwitch = false;
    let previousInputReleased = false;
    let previousUnmounted = false;
    let nextMountAttempted = false;
    let nextInputActivated = false;

    try {
      if (!next.prepared) {
        await invoke(next, 'prepare', operation, { route, reason, phase: 'prepare' });
        next.prepared = true;
        throwIfAborted(operation.signal);
      }

      if (previous) {
        if (!previous.paused) {
          await invoke(previous, 'pause', operation, {
            route: previous.route,
            reason,
            phase: 'switch-pause',
          });
          previous.paused = true;
          previousPausedBySwitch = true;
          throwIfAborted(operation.signal);
        }

        previousInputReleased = await deactivateInput(previous, operation, {
          route: previous.route,
          reason,
          phase: 'switch-input-deactivate',
        });
        throwIfAborted(operation.signal);

        await invoke(previous, 'unmount', operation, {
          route: previous.route,
          reason,
          phase: 'switch-unmount',
        });
        previous.mounted = false;
        previous.paused = false;
        previousUnmounted = true;
        throwIfAborted(operation.signal);
      }

      nextMountAttempted = true;
      await invoke(next, 'mount', operation, { route, reason, phase: 'mount' });
      next.mounted = true;
      next.paused = false;
      next.route = snapshot(route);
      throwIfAborted(operation.signal);

      nextInputActivated = await activateInput(next, operation, {
        route: next.route,
        reason,
        phase: 'input-activate',
      });
      throwIfAborted(operation.signal);

      activeRuntimeId = next.id;
      return true;
    } catch (cause) {
      return rollbackSwitch({
        cause,
        operation,
        previous,
        previousSnapshot,
        previousPausedBySwitch,
        previousInputReleased,
        previousUnmounted,
        next,
        nextMountAttempted,
        nextInputActivated,
      });
    }
  }

  async function performPause(record, reason, operation) {
    if (!record.mounted || record.paused) return false;
    let pauseCompleted = false;
    try {
      await invoke(record, 'pause', operation, {
        route: record.route,
        reason,
        phase: 'pause',
      });
      record.paused = true;
      pauseCompleted = true;
      throwIfAborted(operation.signal);
      await deactivateInput(record, operation, {
        route: record.route,
        reason,
        phase: 'pause-input-deactivate',
      });
      throwIfAborted(operation.signal);
      return true;
    } catch (cause) {
      if (pauseCompleted) {
        const rollback = rollbackOperation(operation);
        try {
          await invoke(record, 'resume', rollback, {
            route: record.route,
            reason: `rollback:${reason}`,
            phase: 'rollback-resume',
            rollback: true,
          });
          record.paused = false;
          if (inputOwnerId !== record.id) {
            await activateInput(record, rollback, {
              route: record.route,
              reason: `rollback:${reason}`,
              phase: 'rollback-input-activate',
              rollback: true,
            });
          }
        } catch (rollbackFailure) {
          activeRuntimeId = null;
          inputOwnerId = null;
          faulted = true;
          throw aggregate(cause, [rollbackFailure], 'world runtime pause rollback failed');
        }
      }
      throw cause;
    }
  }

  async function performResume(record, reason, operation) {
    if (!record.mounted || !record.paused) return false;
    let resumed = false;
    try {
      await invoke(record, 'resume', operation, {
        route: record.route,
        reason,
        phase: 'resume',
      });
      record.paused = false;
      resumed = true;
      throwIfAborted(operation.signal);
      await activateInput(record, operation, {
        route: record.route,
        reason,
        phase: 'resume-input-activate',
      });
      throwIfAborted(operation.signal);
      return true;
    } catch (cause) {
      if (resumed) {
        const rollback = rollbackOperation(operation);
        try {
          if (inputOwnerId === record.id) {
            await deactivateInput(record, rollback, {
              route: record.route,
              reason: `rollback:${reason}`,
              phase: 'rollback-input-deactivate',
              rollback: true,
            });
          }
          await invoke(record, 'pause', rollback, {
            route: record.route,
            reason: `rollback:${reason}`,
            phase: 'rollback-pause',
            rollback: true,
          });
          record.paused = true;
        } catch (rollbackFailure) {
          activeRuntimeId = null;
          inputOwnerId = null;
          faulted = true;
          throw aggregate(cause, [rollbackFailure], 'world runtime resume rollback failed');
        }
      }
      throw cause;
    }
  }

  async function performUnmount(record, reason, operation) {
    if (!record.mounted) return false;
    const wasPaused = record.paused;
    let pausedByUnmount = false;
    let inputReleased = false;
    let unmountCompleted = false;
    try {
      if (!wasPaused) {
        await invoke(record, 'pause', operation, {
          route: record.route,
          reason,
          phase: 'unmount-pause',
        });
        record.paused = true;
        pausedByUnmount = true;
        throwIfAborted(operation.signal);
      }
      inputReleased = await deactivateInput(record, operation, {
        route: record.route,
        reason,
        phase: 'unmount-input-deactivate',
      });
      throwIfAborted(operation.signal);
      await invoke(record, 'unmount', operation, {
        route: record.route,
        reason,
        phase: 'unmount',
      });
      unmountCompleted = true;
      record.mounted = false;
      record.paused = false;
      throwIfAborted(operation.signal);
      if (activeRuntimeId === record.id) activeRuntimeId = null;
      return true;
    } catch (cause) {
      const rollback = rollbackOperation(operation);
      const errors = [];
      try {
        if (unmountCompleted) {
          await invoke(record, 'mount', rollback, {
            route: record.route,
            reason: `rollback:${reason}`,
            phase: 'rollback-mount',
            rollback: true,
          });
          record.mounted = true;
          record.paused = false;
          if (wasPaused) {
            await invoke(record, 'pause', rollback, {
              route: record.route,
              reason: `rollback:${reason}`,
              phase: 'rollback-pause',
              rollback: true,
            });
            record.paused = true;
          }
        } else if (pausedByUnmount && !wasPaused) {
          await invoke(record, 'resume', rollback, {
            route: record.route,
            reason: `rollback:${reason}`,
            phase: 'rollback-resume',
            rollback: true,
          });
          record.paused = false;
        }
        if (inputReleased && !wasPaused) {
          await activateInput(record, rollback, {
            route: record.route,
            reason: `rollback:${reason}`,
            phase: 'rollback-input-activate',
            rollback: true,
          });
        }
      } catch (error) {
        errors.push(error);
      }
      if (errors.length > 0) {
        activeRuntimeId = null;
        inputOwnerId = null;
        faulted = true;
      }
      throw aggregate(cause, errors, 'world runtime unmount rollback failed');
    }
  }

  function schedule(kind, operation, { allowClosing = false } = {}) {
    if (!allowClosing) requireOpen();
    const generation = ++requestedGeneration;
    for (const pending of pendingControllers) {
      pending.abort(abortError(`superseded by ${kind} generation ${generation}`));
    }
    const controller = new AbortController();
    pendingControllers.add(controller);
    const scheduled = Object.freeze({ generation, signal: controller.signal });

    const run = operationTail.catch(() => undefined).then(async () => {
      throwIfAborted(controller.signal);
      switching = true;
      lastTransition = Object.freeze({ kind, generation, state: 'running' });
      try {
        const result = await operation(scheduled);
        throwIfAborted(controller.signal);
        lastError = null;
        lastTransition = Object.freeze({ kind, generation, state: 'committed' });
        return result;
      } catch (error) {
        lastError = errorSummary(error);
        lastTransition = Object.freeze({
          kind,
          generation,
          state: error?.name === 'AbortError' ? 'aborted' : 'rolled-back',
        });
        throw error;
      } finally {
        switching = false;
        pendingControllers.delete(controller);
      }
    });
    operationTail = run;
    return run;
  }

  function prepare(runtimeId, { route = null, reason = 'host-prepare' } = {}) {
    const record = requireRecord(runtimeId);
    return schedule(`prepare:${record.id}`, async operation => {
      if (record.mounted || record.prepared) return false;
      await invoke(record, 'prepare', operation, { route, reason, phase: 'prepare' });
      record.prepared = true;
      throwIfAborted(operation.signal);
      return true;
    });
  }

  function switchTo(runtimeId, { route = null, reason = 'host-switch' } = {}) {
    const next = requireRecord(runtimeId);
    return schedule(`switch:${next.id}`, operation => performSwitch(next, snapshot(route), reason, operation));
  }

  function mount(runtimeId, options = {}) {
    return switchTo(runtimeId, { ...options, reason: options.reason || 'host-mount' });
  }

  function pause({ reason = 'host-pause' } = {}) {
    requireOpen();
    return schedule('pause', operation => {
      if (!activeRuntimeId) return false;
      return performPause(requireRecord(activeRuntimeId), reason, operation);
    });
  }

  function resume({ reason = 'host-resume' } = {}) {
    requireOpen();
    return schedule('resume', operation => {
      if (!activeRuntimeId) return false;
      return performResume(requireRecord(activeRuntimeId), reason, operation);
    });
  }

  function unmount({ reason = 'host-unmount' } = {}) {
    requireOpen();
    return schedule('unmount', operation => {
      if (!activeRuntimeId) return false;
      return performUnmount(requireRecord(activeRuntimeId), reason, operation);
    });
  }

  function dispose({ reason = 'host-dispose' } = {}) {
    if (disposePromise) return disposePromise;
    closing = true;
    disposePromise = schedule('dispose', async operation => {
      const errors = [];
      if (activeRuntimeId) {
        const active = records.get(activeRuntimeId);
        if (active?.mounted) {
          try {
            await performUnmount(active, reason, operation);
          } catch (error) {
            errors.push(error);
            activeRuntimeId = null;
            inputOwnerId = null;
          }
        }
      }

      for (const record of records.values()) {
        if (record.disposed) continue;
        try {
          await invoke(record, 'dispose', operation, {
            route: record.route,
            reason,
            phase: 'dispose',
          });
        } catch (error) {
          errors.push(error);
        } finally {
          record.disposed = true;
          record.mounted = false;
          record.paused = false;
        }
      }

      activeRuntimeId = null;
      inputOwnerId = null;
      disposed = true;
      if (errors.length > 0) throw new AggregateError(errors, 'world runtime host disposal was incomplete');
      return true;
    }, { allowClosing: true });
    return disposePromise;
  }

  function safeRuntimeDiagnostics(record) {
    try {
      const value = record.runtime.diagnostics();
      if (value && typeof value.then === 'function') {
        return Object.freeze({ error: 'runtime diagnostics must be synchronous' });
      }
      return snapshot(value);
    } catch (error) {
      return Object.freeze({ error: String(error?.message || error) });
    }
  }

  function safeInputDiagnostics(record) {
    if (!record.inputAdapter) return null;
    try {
      const value = record.inputAdapter.diagnostics();
      if (value && typeof value.then === 'function') {
        return Object.freeze({ error: 'input diagnostics must be synchronous' });
      }
      return snapshot(value);
    } catch (error) {
      return Object.freeze({ error: String(error?.message || error) });
    }
  }

  function diagnostics() {
    const runtimeDiagnostics = [...records.values()].map(record => Object.freeze({
      runtimeId: record.id,
      prepared: record.prepared,
      mounted: record.mounted,
      paused: record.paused,
      disposed: record.disposed,
      lastGeneration: record.lastGeneration,
      lastPhase: record.lastPhase,
      runtime: safeRuntimeDiagnostics(record),
      input: safeInputDiagnostics(record),
    }));
    return Object.freeze({
      kind: HOST_KIND,
      contract: WORLD_RUNTIME_LIFECYCLE_VERSION,
      activeRuntimeId,
      inputOwnerId,
      generation: requestedGeneration,
      switching,
      rollingBack,
      closing,
      disposed,
      faulted,
      runtimeCount: records.size,
      lastTransition,
      lastError,
      runtimes: Object.freeze(runtimeDiagnostics),
    });
  }

  return Object.freeze({
    kind: HOST_KIND,
    register,
    prepare,
    mount,
    switchTo,
    pause,
    resume,
    unmount,
    dispose,
    diagnostics,
  });
}
