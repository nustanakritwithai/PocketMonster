import assert from 'node:assert/strict';
import {
  WORLD_RUNTIME_LIFECYCLE_METHODS,
  WORLD_RUNTIME_LIFECYCLE_VERSION,
  defineWorldInputAdapter,
  defineWorldRuntimeLifecycle,
} from '../world-runtime-lifecycle-v910.mjs';
import { createOneDocumentWorldRuntimeHost } from '../one-document-world-runtime-host-v910.mjs';

assert.throws(
  () => defineWorldRuntimeLifecycle({}),
  /worldRuntime\.prepare must be a function/,
  'the explicit lifecycle contract rejects incomplete runtimes',
);
assert.deepEqual(WORLD_RUNTIME_LIFECYCLE_METHODS, [
  'prepare', 'mount', 'pause', 'resume', 'unmount', 'dispose', 'diagnostics',
]);

const events = [];
const activeInputs = new Set();
let maxActiveInputs = 0;

function runtime(id) {
  let state = 'registered';
  return defineWorldRuntimeLifecycle({
    async prepare(context) {
      assert.equal(context.contract, WORLD_RUNTIME_LIFECYCLE_VERSION);
      assert.equal(context.runtimeId, id);
      assert.ok(context.signal instanceof AbortSignal);
      assert.ok(Number.isSafeInteger(context.generation));
      assert.equal(Object.isFrozen(context), true);
      assert.equal(Object.isFrozen(context.services), true);
      state = 'prepared';
      events.push(`${id}:prepare:${context.generation}`);
    },
    async mount(context) {
      assert.equal(Object.isFrozen(context.route), true);
      state = 'mounted';
      events.push(`${id}:mount:${context.route.zone}`);
    },
    async pause() { state = 'paused'; events.push(`${id}:pause`); },
    async resume() { state = 'mounted'; events.push(`${id}:resume`); },
    async unmount() { state = 'prepared'; events.push(`${id}:unmount`); },
    async dispose() { state = 'disposed'; events.push(`${id}:dispose`); },
    diagnostics() { return { state }; },
  });
}

function inputAdapter(id) {
  return defineWorldInputAdapter({
    async activate(context) {
      assert.equal(context.runtimeId, id);
      assert.equal(activeInputs.size, 0, 'the host releases the previous adapter before activation');
      activeInputs.add(id);
      maxActiveInputs = Math.max(maxActiveInputs, activeInputs.size);
      events.push(`${id}:input-on`);
    },
    async deactivate(context) {
      assert.equal(context.runtimeId, id);
      activeInputs.delete(id);
      events.push(`${id}:input-off`);
    },
    diagnostics() { return { active: activeInputs.has(id) }; },
  });
}

const host = createOneDocumentWorldRuntimeHost({ services: { combat: 'shared-v91' } });
const pocket = runtime('pocket');
const pirate = runtime('pirate');
const unregisterPocket = host.register('pocket', pocket, { inputAdapter: inputAdapter('pocket') });
host.register('pirate', pirate, { inputAdapter: inputAdapter('pirate') });

assert.throws(() => host.register('pocket', runtime('duplicate')), /already registered/);
assert.throws(() => host.register('pirate-copy', pirate), /cannot be registered twice/);
assert.equal(await host.prepare('pocket', { route: { zone: 'ranch' } }), true);
assert.equal(await host.mount('pocket', { route: { zone: 'grassland' } }), true);
assert.equal(unregisterPocket(), false, 'an active runtime cannot be unregistered');
assert.equal(host.diagnostics().activeRuntimeId, 'pocket');
assert.equal(host.diagnostics().inputOwnerId, 'pocket');
assert.deepEqual([...activeInputs], ['pocket']);

assert.equal(await host.pause(), true);
assert.equal(host.diagnostics().activeRuntimeId, 'pocket', 'pause preserves runtime identity');
assert.equal(host.diagnostics().inputOwnerId, null, 'paused worlds cannot own input');
assert.equal(activeInputs.size, 0);
assert.equal(await host.resume(), true);
assert.equal(host.diagnostics().inputOwnerId, 'pocket');

assert.equal(await host.switchTo('pirate', { route: { zone: 'harbor' } }), true);
assert.equal(host.diagnostics().activeRuntimeId, 'pirate');
assert.equal(host.diagnostics().inputOwnerId, 'pirate');
assert.deepEqual([...activeInputs], ['pirate']);
assert.equal(maxActiveInputs, 1);

assert.equal(await host.unmount(), true);
assert.equal(host.diagnostics().activeRuntimeId, null);
assert.equal(host.diagnostics().inputOwnerId, null);
assert.equal(await host.dispose(), true);
assert.equal(host.diagnostics().disposed, true);
assert.equal(activeInputs.size, 0);
assert.throws(() => host.register('late', runtime('late')), /disposing or disposed/);

assert.ok(events.includes('pocket:pause'));
assert.ok(events.includes('pocket:unmount'));
assert.ok(events.includes('pirate:mount:harbor'));
assert.equal(globalThis.POCKETMONSTER_WORLD_RUNTIME_HOST, undefined, 'host never claims a global last-writer slot');

console.log('V9.10 one-document world runtime lifecycle contract: PASS');
