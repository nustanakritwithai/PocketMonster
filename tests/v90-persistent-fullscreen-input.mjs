import assert from 'node:assert/strict';

import {
  bindPersistentFullscreenControls,
  PERSISTENT_FULLSCREEN_BRIDGE_KIND,
  installPersistentFullscreenBridge,
} from '../persistent-fullscreen-v900.mjs';

function createDocument() {
  const calls = [];
  const documentElement = {
    async requestFullscreen(options) {
      calls.push(options || null);
      return true;
    },
  };
  return { calls, document: { documentElement, fullscreenElement: null } };
}

const owner = createDocument();
const ownerWindow = {
  document: owner.document,
  POCKETMONSTER_ONLINE_SHELL: Object.freeze({
    kind: 'monsterlife-online-world-shell-v1',
    async requestFullscreen(options) {
      if (owner.document.fullscreenElement) return true;
      await owner.document.documentElement.requestFullscreen(options);
      owner.document.fullscreenElement = owner.document.documentElement;
      return true;
    },
  }),
};
ownerWindow.top = ownerWindow;
ownerWindow.parent = ownerWindow;

for (const depth of ['scene', 'pirate']) {
  const local = createDocument();
  const localWindow = { document: local.document, top: ownerWindow };
  localWindow.parent = depth === 'scene' ? ownerWindow : { parent: ownerWindow };
  const bridge = installPersistentFullscreenBridge(localWindow);
  assert.equal(bridge?.kind, PERSISTENT_FULLSCREEN_BRIDGE_KIND);
  assert.equal(Object.isFrozen(bridge), true);
  await local.document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  assert.equal(local.calls.length, 0, `${depth} document must not own fullscreen`);
}

assert.equal(owner.calls.length, 1, 'scene swaps reuse one persistent parent fullscreen request');
assert.deepEqual(owner.calls[0], { navigationUI: 'hide' });

const controlListeners = new Map();
const controlButtons = new Map(['enterImmersiveBtn', 'retryImmersiveBtn', 'fullscreenBtn'].map(id => [id, {
  addEventListener(type, listener) { controlListeners.set(`${id}:${type}`, listener); },
}]));
const sceneDocument = {
  ...createDocument().document,
  getElementById(id) { return controlButtons.get(id) || null; },
};
const sceneWindow = {
  document: sceneDocument,
  screen: { orientation: { lock: async mode => mode } },
  POCKETMONSTER_PERSISTENT_FULLSCREEN: {
    async request(options) {
      assert.deepEqual(options, { navigationUI: 'hide' });
      return true;
    },
  },
};
assert.equal(bindPersistentFullscreenControls(sceneWindow), 3, 'scene entry owns all visible fullscreen controls');
let prevented = 0;
let stopped = 0;
await controlListeners.get('fullscreenBtn:click')({
  preventDefault() { prevented += 1; },
  stopImmediatePropagation() { stopped += 1; },
});
assert.equal(prevented, 1);
assert.equal(stopped, 1, 'scene entry prevents the late Pocket runtime from issuing a duplicate request');

const standalone = createDocument();
const standaloneWindow = { document: standalone.document };
standaloneWindow.top = standaloneWindow;
standaloneWindow.parent = standaloneWindow;
assert.equal(installPersistentFullscreenBridge(standaloneWindow), null, 'standalone runtime keeps its native fullscreen owner');
await standalone.document.documentElement.requestFullscreen();
assert.equal(standalone.calls.length, 1);

console.log('V9 persistent parent fullscreen and scene input bridge: PASS');
