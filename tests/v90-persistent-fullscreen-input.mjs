import assert from 'node:assert/strict';
import fs from 'node:fs';

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
const controlButtons = new Map(['enterImmersiveBtn', 'retryImmersiveBtn', 'fullscreenBtn', 'persistentFullscreenBtn'].map(id => [id, {
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
assert.equal(bindPersistentFullscreenControls(sceneWindow), 4, 'scene entry owns all visible fullscreen controls');
let prevented = 0;
let stopped = 0;
await controlListeners.get('fullscreenBtn:click')({
  preventDefault() { prevented += 1; },
  stopImmediatePropagation() { stopped += 1; },
});
assert.equal(prevented, 1);
assert.equal(stopped, 1, 'scene entry prevents the late Pocket runtime from issuing a duplicate request');
await controlListeners.get('persistentFullscreenBtn:click')({
  preventDefault() { prevented += 1; },
  stopImmediatePropagation() { stopped += 1; },
});
assert.equal(prevented, 2, 'persistent mobile fullscreen button uses the parent bridge');
assert.equal(stopped, 2);

const html = fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');
const pirateHud = fs.readFileSync(new URL('../pirate-fruit-control-hud-v900.mjs', import.meta.url), 'utf8');
assert.match(html, /id="persistentFullscreenBtn"[^>]*data-pirate-icon="⛶"/);
assert.match(css, /#pirateUnifiedControls #persistentFullscreenBtn\.tc-fullscreen/);
assert.match(css, /#persistentFullscreenBtn\.tc-fullscreen::after\{content:'⛶'!important/);
assert.match(pirateHud, /\.fullscreen-prompt-root/);

const standalone = createDocument();
const standaloneWindow = { document: standalone.document };
standaloneWindow.top = standaloneWindow;
standaloneWindow.parent = standaloneWindow;
assert.equal(installPersistentFullscreenBridge(standaloneWindow), null, 'standalone runtime keeps its native fullscreen owner');
await standalone.document.documentElement.requestFullscreen();
assert.equal(standalone.calls.length, 1);

console.log('V9 persistent parent fullscreen and scene input bridge: PASS');
