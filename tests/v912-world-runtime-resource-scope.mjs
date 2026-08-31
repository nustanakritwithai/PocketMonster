import assert from 'node:assert/strict';
import {
  assertWorldRuntimeResourceScopeClean,
  createWorldRuntimeResourceScope,
} from '../world-runtime-resource-scope-v912.mjs';

function createScheduler() {
  let nextHandle = 1;
  const timeouts = new Map();
  const intervals = new Map();
  const frames = new Map();
  const cleared = { timeout: [], interval: [], animationFrame: [] };

  function add(queue, callback, args = []) {
    const handle = nextHandle;
    nextHandle += 1;
    queue.set(handle, { callback, args });
    return handle;
  }

  return {
    api: {
      setTimeout(callback, _delay, ...args) { return add(timeouts, callback, args); },
      clearTimeout(handle) { cleared.timeout.push(handle); timeouts.delete(handle); },
      setInterval(callback, _delay, ...args) { return add(intervals, callback, args); },
      clearInterval(handle) { cleared.interval.push(handle); intervals.delete(handle); },
      requestAnimationFrame(callback) { return add(frames, callback); },
      cancelAnimationFrame(handle) {
        cleared.animationFrame.push(handle);
        frames.delete(handle);
      },
    },
    fireTimeout(handle) {
      const scheduled = timeouts.get(handle);
      if (!scheduled) return false;
      timeouts.delete(handle);
      scheduled.callback(...scheduled.args);
      return true;
    },
    fireInterval(handle) {
      const scheduled = intervals.get(handle);
      if (!scheduled) return false;
      scheduled.callback(...scheduled.args);
      return true;
    },
    fireAnimationFrame(handle, timestamp = 0) {
      const scheduled = frames.get(handle);
      if (!scheduled) return false;
      frames.delete(handle);
      scheduled.callback(timestamp);
      return true;
    },
    callback(queueName, handle) {
      const queues = { timeout: timeouts, interval: intervals, animationFrame: frames };
      return queues[queueName].get(handle)?.callback || null;
    },
    counts() {
      return Object.freeze({
        timeout: timeouts.size,
        interval: intervals.size,
        animationFrame: frames.size,
      });
    },
    cleared,
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
    dispatch(type, value) {
      for (const listener of listeners.get(type) || []) listener(value);
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
  };
}

const scheduler = createScheduler();
const target = createEventTarget();
const abortController = new AbortController();
const observer = {
  observing: false,
  observeCalls: 0,
  disconnectCalls: 0,
  observe(observedTarget, options) {
    assert.equal(observedTarget, target);
    assert.deepEqual(options, { subtree: true });
    this.observeCalls += 1;
    this.observing = true;
  },
  disconnect() {
    this.disconnectCalls += 1;
    this.observing = false;
  },
};

const calls = [];
const scope = createWorldRuntimeResourceScope({
  label: 'aborting-prepare',
  signal: abortController.signal,
  scheduler: scheduler.api,
});

const releaseListener = scope.listen(target, 'input', value => calls.push(`input:${value}`));
const completedTimeout = scope.setTimeout(value => calls.push(`timeout:${value}`), 20, 'done');
const pendingTimeout = scope.setTimeout(() => calls.push('late-timeout'), 40);
const pendingInterval = scope.setInterval(value => calls.push(`interval:${value}`), 10, 'tick');
const completedFrame = scope.requestAnimationFrame(value => calls.push(`frame:${value}`));
const pendingFrame = scope.requestAnimationFrame(() => calls.push('late-frame'));
scope.observe(observer, target, { subtree: true });
scope.addCleanup(() => calls.push('custom-cleanup'));

assert.deepEqual(scope.diagnostics().active, {
  listener: 1,
  timeout: 2,
  interval: 1,
  animationFrame: 2,
  observer: 1,
  cleanup: 1,
});
assert.equal(scope.diagnostics().activeTotal, 8);

target.dispatch('input', 'move');
assert.equal(scheduler.fireTimeout(completedTimeout), true);
assert.equal(scheduler.fireInterval(pendingInterval), true);
assert.equal(scheduler.fireAnimationFrame(completedFrame, 16), true);
assert.deepEqual(calls, ['input:move', 'timeout:done', 'interval:tick', 'frame:16']);
assert.equal(scope.diagnostics().active.timeout, 1, 'a fired one-shot timeout releases ownership');
assert.equal(scope.diagnostics().active.animationFrame, 1, 'a fired frame releases ownership');

const staleTimeoutCallback = scheduler.callback('timeout', pendingTimeout);
const staleIntervalCallback = scheduler.callback('interval', pendingInterval);
const staleFrameCallback = scheduler.callback('animationFrame', pendingFrame);
abortController.abort(new Error('prepare superseded'));

const diagnostics = assertWorldRuntimeResourceScopeClean(scope);
assert.equal(diagnostics.state, 'disposed');
assert.equal(diagnostics.disposeReason, 'prepare superseded');
assert.equal(target.listenerCount('input'), 0);
assert.equal(observer.observeCalls, 1);
assert.equal(observer.disconnectCalls, 1);
assert.equal(observer.observing, false);
assert.deepEqual(scheduler.counts(), { timeout: 0, interval: 0, animationFrame: 0 });
assert.ok(scheduler.cleared.timeout.includes(pendingTimeout));
assert.ok(scheduler.cleared.interval.includes(pendingInterval));
assert.ok(scheduler.cleared.animationFrame.includes(pendingFrame));
assert.equal(calls.at(-1), 'custom-cleanup');

staleTimeoutCallback();
staleIntervalCallback();
staleFrameCallback(32);
target.dispatch('input', 'ignored');
assert.deepEqual(
  calls,
  ['input:move', 'timeout:done', 'interval:tick', 'frame:16', 'custom-cleanup'],
  'callbacks already queued by the browser are inert after scope disposal',
);
assert.equal(releaseListener(), false, 'individual release is idempotent after scope disposal');
assert.equal(scope.dispose(), false, 'scope disposal is idempotent');
assert.throws(() => scope.setTimeout(() => {}), /already disposed/);

const cleanupOrder = [];
const errorScope = createWorldRuntimeResourceScope({ scheduler: createScheduler().api });
errorScope.addCleanup(() => cleanupOrder.push('first'));
errorScope.addCleanup(() => {
  cleanupOrder.push('broken');
  throw new Error('cleanup failed');
});
errorScope.addCleanup(() => cleanupOrder.push('last'));
assert.equal(errorScope.dispose('test-cleanup-errors'), true);
assert.deepEqual(cleanupOrder, ['last', 'broken', 'first'], 'cleanup is LIFO and continues after errors');
assert.equal(errorScope.diagnostics().activeTotal, 0);
assert.equal(errorScope.diagnostics().cleanupErrors.length, 1);
assert.throws(
  () => assertWorldRuntimeResourceScopeClean(errorScope, 'errorScope'),
  /cleanup was incomplete/,
);

const alreadyAborted = new AbortController();
alreadyAborted.abort('cancelled-before-prepare');
const closedScope = createWorldRuntimeResourceScope({
  signal: alreadyAborted.signal,
  scheduler: createScheduler().api,
});
assert.equal(closedScope.diagnostics().disposeReason, 'cancelled-before-prepare');
assert.throws(() => closedScope.addCleanup(() => {}), /already disposed/);

console.log('V9.12 one-document world runtime resource scope: PASS');
