import assert from 'node:assert/strict';
import {
  WORLD_RUNTIME_IMPORT_FORBIDDEN_EFFECTS,
  WORLD_RUNTIME_IMPORT_PURITY_CONTRACT,
  defineWorldRuntimeFactory,
  worldRuntimeFactoryFromModule,
} from '../world-runtime-import-purity-v912.mjs';

function installGlobalProperty(name, descriptor, restorers) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  if (original && !original.configurable) {
    throw new Error(`cannot install import-purity probe for globalThis.${name}`);
  }
  Object.defineProperty(globalThis, name, { configurable: true, ...descriptor });
  restorers.push(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  });
  return original;
}

async function importUnderAmbientEffectProbe(specifier) {
  const effects = [];
  const restorers = [];
  const originals = new Map();
  const effect = name => effects.push(name);
  const inertNode = new Proxy(Object.create(null), {
    get(_target, property) {
      effect(`dom:${String(property)}`);
      return inertNode;
    },
    set(_target, property) {
      effect(`dom-write:${String(property)}`);
      return true;
    },
  });

  function value(name, replacement) {
    originals.set(name, installGlobalProperty(name, {
      writable: true,
      enumerable: false,
      value: replacement,
    }, restorers));
  }
  function getter(name, replacement) {
    originals.set(name, installGlobalProperty(name, {
      enumerable: false,
      get: replacement,
    }, restorers));
  }

  value('addEventListener', (..._args) => effect('listener:add'));
  value('removeEventListener', (..._args) => effect('listener:remove'));
  value('setTimeout', (..._args) => { effect('timer:timeout'); return 1; });
  value('clearTimeout', (..._args) => effect('timer:clear-timeout'));
  value('setInterval', (..._args) => { effect('timer:interval'); return 2; });
  value('clearInterval', (..._args) => effect('timer:clear-interval'));
  value('requestAnimationFrame', (..._args) => { effect('animation-frame:request'); return 3; });
  value('cancelAnimationFrame', (..._args) => effect('animation-frame:cancel'));
  value('MutationObserver', class MutationObserverProbe {
    constructor() { effect('observer:construct'); }
    observe() { effect('observer:observe'); }
    disconnect() { effect('observer:disconnect'); }
  });
  value('ResizeObserver', class ResizeObserverProbe {
    constructor() { effect('resize-observer:construct'); }
    observe() { effect('resize-observer:observe'); }
    disconnect() { effect('resize-observer:disconnect'); }
  });
  getter('document', () => { effect('dom:document'); return inertNode; });
  getter('window', () => { effect('dom:window'); return inertNode; });

  let namespace;
  let importError = null;
  try {
    namespace = await import(specifier);
  } catch (error) {
    importError = error;
  } finally {
    while (restorers.length > 0) restorers.pop()();
  }

  for (const [name, descriptor] of originals) {
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(globalThis, name),
      descriptor,
      `import probe must restore globalThis.${name}`,
    );
  }
  if (importError) throw importError;
  return Object.freeze({ namespace, effects: Object.freeze([...effects]) });
}

assert.equal(Object.isFrozen(WORLD_RUNTIME_IMPORT_PURITY_CONTRACT), true);
assert.equal(Object.isFrozen(WORLD_RUNTIME_IMPORT_PURITY_CONTRACT.allowed), true);
assert.equal(Object.isFrozen(WORLD_RUNTIME_IMPORT_FORBIDDEN_EFFECTS), true);
assert.deepEqual(WORLD_RUNTIME_IMPORT_FORBIDDEN_EFFECTS, [
  'dom-read-or-write',
  'event-listener-registration',
  'timer-or-animation-scheduling',
  'observer-registration',
  'network-or-storage-access',
  'global-publication',
  'runtime-instantiation',
]);

const fixtureUrl = new URL('./fixtures/v912-pure-world-runtime.mjs', import.meta.url);
fixtureUrl.searchParams.set('purity-case', String(Date.now()));
const pureImport = await importUnderAmbientEffectProbe(fixtureUrl.href);
assert.deepEqual(
  pureImport.effects,
  [],
  'importing a conforming runtime factory cannot acquire ambient browser resources',
);

const factory = worldRuntimeFactoryFromModule(pureImport.namespace);
assert.equal(Object.isFrozen(factory), true);
assert.equal(factory.runtimeId, 'v912-pure-fixture');
assert.equal(factory.importPurity, WORLD_RUNTIME_IMPORT_PURITY_CONTRACT);
assert.equal(pureImport.namespace.fixtureCreationCount(), 0, 'import does not instantiate the runtime');
const runtime = factory.create();
assert.equal(pureImport.namespace.fixtureCreationCount(), 1, 'the factory creates only on an explicit call');
assert.equal(runtime.diagnostics().state, 'created');

const impureSource = [
  'globalThis.addEventListener("keydown", () => {});',
  'globalThis.setTimeout(() => {}, 0);',
  'globalThis.requestAnimationFrame(() => {});',
  'new globalThis.MutationObserver(() => {}).observe({}, {});',
  'void globalThis.document.body;',
  'export default {};',
].join('\n');
const impureUrl = `data:text/javascript,${encodeURIComponent(impureSource)}#${Date.now()}`;
const impureImport = await importUnderAmbientEffectProbe(impureUrl);
assert.ok(impureImport.effects.includes('listener:add'));
assert.ok(impureImport.effects.includes('timer:timeout'));
assert.ok(impureImport.effects.includes('animation-frame:request'));
assert.ok(impureImport.effects.includes('observer:observe'));
assert.ok(impureImport.effects.includes('dom:document'));

assert.throws(
  () => worldRuntimeFactoryFromModule({
    worldRuntimeFactory: factory,
    default: Object.freeze({ ...factory }),
  }),
  /conflicting runtime factories/,
);
assert.throws(
  () => defineWorldRuntimeFactory({ runtimeId: 'async', createRuntime: async () => runtime }).create(),
  /create must be synchronous/,
);
assert.throws(
  () => defineWorldRuntimeFactory({ runtimeId: 'incomplete', createRuntime: () => ({}) }).create(),
  /result\.prepare must be a function/,
);

console.log('V9.12 one-document world runtime import purity: PASS');
