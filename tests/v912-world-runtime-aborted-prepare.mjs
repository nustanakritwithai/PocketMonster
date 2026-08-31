import assert from 'node:assert/strict';
import { createOneDocumentWorldRuntimeHost } from '../one-document-world-runtime-host-v910.mjs';
import { defineWorldRuntimeLifecycle } from '../world-runtime-lifecycle-v910.mjs';
import { createWorldRuntimeResourceScope } from '../world-runtime-resource-scope-v912.mjs';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function createScheduler() {
  let nextHandle = 1;
  const queues = {
    timeout: new Map(),
    interval: new Map(),
    animationFrame: new Map(),
  };
  const clears = {
    timeout: 0,
    interval: 0,
    animationFrame: 0,
  };
  function schedule(queue, callback) {
    const handle = nextHandle;
    nextHandle += 1;
    queues[queue].set(handle, callback);
    return handle;
  }
  function clear(queue, handle) {
    clears[queue] += 1;
    queues[queue].delete(handle);
  }
  return {
    api: {
      setTimeout: callback => schedule('timeout', callback),
      clearTimeout: handle => clear('timeout', handle),
      setInterval: callback => schedule('interval', callback),
      clearInterval: handle => clear('interval', handle),
      requestAnimationFrame: callback => schedule('animationFrame', callback),
      cancelAnimationFrame: handle => clear('animationFrame', handle),
    },
    diagnostics() {
      return Object.freeze({
        active: Object.freeze(Object.fromEntries(
          Object.entries(queues).map(([kind, queue]) => [kind, queue.size]),
        )),
        clears: Object.freeze({ ...clears }),
      });
    },
  };
}

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const owned = listeners.get(type) || new Set();
      owned.add(listener);
      listeners.set(type, owned);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
  };
}

function abortPromise(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

function passiveRuntime(id, events) {
  let state = 'registered';
  return defineWorldRuntimeLifecycle({
    async prepare() { state = 'prepared'; events.push(`${id}:prepare`); },
    async mount() { state = 'mounted'; events.push(`${id}:mount`); },
    async pause() { state = 'paused'; events.push(`${id}:pause`); },
    async resume() { state = 'mounted'; events.push(`${id}:resume`); },
    async unmount() { state = 'prepared'; events.push(`${id}:unmount`); },
    async dispose() { state = 'disposed'; events.push(`${id}:dispose`); },
    diagnostics() { return Object.freeze({ state }); },
  });
}

const events = [];
const prepareStarted = deferred();
const scheduler = createScheduler();
const target = createEventTarget();
let slowScope = null;
let observerDisconnects = 0;

const slowRuntime = defineWorldRuntimeLifecycle({
  async prepare(context) {
    events.push('slow:prepare-start');
    slowScope = createWorldRuntimeResourceScope({
      label: 'slow-prepare',
      signal: context.signal,
      scheduler: scheduler.api,
    });
    slowScope.listen(target, 'keydown', () => events.push('slow:input'));
    slowScope.setTimeout(() => events.push('slow:timeout'), 100);
    slowScope.setInterval(() => events.push('slow:interval'), 100);
    slowScope.requestAnimationFrame(() => events.push('slow:frame'));
    slowScope.observe({
      observe() {},
      disconnect() { observerDisconnects += 1; },
    }, target);
    slowScope.addCleanup(() => events.push('slow:scope-cleanup'));
    prepareStarted.resolve();
    await abortPromise(context.signal);
    events.push('slow:prepare-finished');
  },
  async mount() { events.push('slow:mount'); },
  async pause() { events.push('slow:pause'); },
  async resume() { events.push('slow:resume'); },
  async unmount() { events.push('slow:unmount'); },
  async dispose() { slowScope?.dispose('runtime-dispose'); events.push('slow:dispose'); },
  diagnostics() { return slowScope?.diagnostics() || Object.freeze({ state: 'registered' }); },
});

const host = createOneDocumentWorldRuntimeHost();
host.register('slow', slowRuntime);
host.register('winner', passiveRuntime('winner', events));

const slowSwitch = host.switchTo('slow', { route: { zone: 'slow-zone' } });
await prepareStarted.promise;
assert.equal(slowScope.diagnostics().activeTotal, 6, 'prepare owns every acquired resource');
assert.equal(target.listenerCount('keydown'), 1);

const winnerSwitch = host.switchTo('winner', { route: { zone: 'winner-zone' } });
await assert.rejects(slowSwitch, error => error?.name === 'AbortError');
assert.equal(await winnerSwitch, true);

const scopeDiagnostics = slowScope.diagnostics();
assert.equal(scopeDiagnostics.state, 'disposed');
assert.equal(scopeDiagnostics.activeTotal, 0, 'an aborted prepare releases all resource kinds');
assert.equal(scopeDiagnostics.cleanupErrors.length, 0);
assert.equal(target.listenerCount('keydown'), 0);
assert.equal(observerDisconnects, 1);
assert.deepEqual(scheduler.diagnostics().active, {
  timeout: 0,
  interval: 0,
  animationFrame: 0,
});
assert.deepEqual(scheduler.diagnostics().clears, {
  timeout: 1,
  interval: 1,
  animationFrame: 1,
});
assert.ok(events.indexOf('slow:scope-cleanup') < events.indexOf('winner:prepare'));
assert.equal(events.includes('slow:prepare-finished'), false);
assert.equal(events.includes('slow:mount'), false, 'an aborted prepare cannot proceed to mount');
assert.equal(host.diagnostics().activeRuntimeId, 'winner');

await host.dispose();
assert.equal(slowScope.diagnostics().activeTotal, 0, 'later host disposal stays idempotent');

console.log('V9.12 aborted world runtime prepare cleanup: PASS');
