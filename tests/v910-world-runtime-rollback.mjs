import assert from 'node:assert/strict';
import {
  defineWorldInputAdapter,
  defineWorldRuntimeLifecycle,
} from '../world-runtime-lifecycle-v910.mjs';
import { createOneDocumentWorldRuntimeHost } from '../one-document-world-runtime-host-v910.mjs';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const events = [];
const activeInputs = new Set();
let maxActiveInputs = 0;

function createRuntime(id, { failMount = false, prepareGate = null } = {}) {
  let state = 'registered';
  return defineWorldRuntimeLifecycle({
    async prepare(context) {
      state = 'prepared';
      events.push(`${id}:prepare:${context.generation}`);
      if (prepareGate) {
        context.signal.addEventListener('abort', () => prepareGate.resolve(), { once: true });
        await prepareGate.promise;
      }
    },
    async mount(context) {
      events.push(`${id}:mount:${context.rollback ? 'rollback' : 'normal'}`);
      if (failMount && !context.rollback) throw new Error(`${id} mount failed`);
      state = 'mounted';
    },
    async pause(context) { state = 'paused'; events.push(`${id}:pause:${context.rollback}`); },
    async resume(context) { state = 'mounted'; events.push(`${id}:resume:${context.rollback}`); },
    async unmount(context) { state = 'prepared'; events.push(`${id}:unmount:${context.rollback}`); },
    async dispose() { state = 'disposed'; },
    diagnostics() { return { state }; },
  });
}

function createInput(id) {
  return defineWorldInputAdapter({
    async activate(context) {
      assert.equal(activeInputs.size, 0, `only one adapter may be active before ${id} activation`);
      activeInputs.add(id);
      maxActiveInputs = Math.max(maxActiveInputs, activeInputs.size);
      events.push(`${id}:input-on:${context.rollback}`);
    },
    async deactivate(context) {
      activeInputs.delete(id);
      events.push(`${id}:input-off:${context.rollback}`);
    },
    diagnostics() { return { active: activeInputs.has(id) }; },
  });
}

const host = createOneDocumentWorldRuntimeHost();
host.register('pocket', createRuntime('pocket'), { inputAdapter: createInput('pocket') });
host.register('broken-pirate', createRuntime('broken-pirate', { failMount: true }), {
  inputAdapter: createInput('broken-pirate'),
});

await host.mount('pocket', { route: { zone: 'ranch' } });
await assert.rejects(
  host.switchTo('broken-pirate', { route: { zone: 'harbor' } }),
  /broken-pirate mount failed/,
);

let diagnostics = host.diagnostics();
assert.equal(diagnostics.activeRuntimeId, 'pocket', 'failed next mount restores the previous runtime');
assert.equal(diagnostics.inputOwnerId, 'pocket', 'failed next mount restores the previous input lease');
assert.deepEqual([...activeInputs], ['pocket']);
assert.equal(maxActiveInputs, 1);
assert.ok(events.includes('broken-pirate:unmount:true'), 'partially mounted next runtime is cleaned up');
assert.ok(events.includes('pocket:mount:rollback'), 'the previous runtime is remounted transactionally');
assert.ok(events.includes('pocket:input-on:true'), 'the previous input adapter is restored transactionally');
assert.equal(diagnostics.lastTransition.state, 'rolled-back');

const slowGate = deferred();
host.register('slow-world', createRuntime('slow-world', { prepareGate: slowGate }), {
  inputAdapter: createInput('slow-world'),
});
host.register('living-world', createRuntime('living-world'), {
  inputAdapter: createInput('living-world'),
});

const slowSwitch = host.switchTo('slow-world', { route: { zone: 'slow' } });
await new Promise(resolve => setImmediate(resolve));
const newestSwitch = host.switchTo('living-world', { route: { zone: 'forest' } });
await assert.rejects(slowSwitch, error => error?.name === 'AbortError');
assert.equal(await newestSwitch, true);

diagnostics = host.diagnostics();
assert.equal(diagnostics.activeRuntimeId, 'living-world', 'the newest generation owns the committed runtime');
assert.equal(diagnostics.inputOwnerId, 'living-world');
assert.deepEqual([...activeInputs], ['living-world']);
assert.equal(maxActiveInputs, 1);
assert.ok(
  diagnostics.runtimes.every(item => item.lastGeneration <= diagnostics.generation),
  'runtime diagnostics never report a future generation',
);

await host.dispose();
assert.equal(activeInputs.size, 0);

console.log('V9.10 one-document world runtime transactional rollback: PASS');
