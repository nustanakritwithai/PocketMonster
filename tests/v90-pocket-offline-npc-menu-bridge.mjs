import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  POCKET_OFFLINE_NPC_MENU_BRIDGE_KIND,
  POCKET_OFFLINE_NPC_MENU_MESSAGE,
  POCKET_OFFLINE_NPC_MENU_ROOT_IDS,
  hasOpenPocketOfflineNpcMenu,
  installPocketOfflineNpcMenuBridge,
} from '../pocket-offline-npc-menu-bridge-v900.mjs';

class FakeClassList {
  constructor(...names) {
    this.names = new Set(names);
  }

  contains(name) {
    return this.names.has(name);
  }

  add(name) {
    this.names.add(name);
  }

  remove(name) {
    this.names.delete(name);
  }
}

class FakeMutationObserver {
  static instances = [];

  constructor(callback) {
    this.callback = callback;
    this.connected = false;
    FakeMutationObserver.instances.push(this);
  }

  observe(target, options) {
    this.connected = true;
    this.target = target;
    this.options = options;
  }

  disconnect() {
    this.connected = false;
  }

  notify() {
    if (this.connected) this.callback();
  }
}

const roots = new Map(
  POCKET_OFFLINE_NPC_MENU_ROOT_IDS.map(id => [id, { id, classList: new FakeClassList('hidden') }]),
);
const documentLike = {
  body: { dataset: { combinedWorld: 'pocket-monster' } },
  getElementById(id) {
    return roots.get(id) || null;
  },
};
const sent = [];
const parentWindow = {
  postMessage(message, origin) {
    sent.push({ message, origin });
  },
};
const controller = new AbortController();
const windowLike = {
  MutationObserver: FakeMutationObserver,
  parent: parentWindow,
  location: { origin: 'https://game.example' },
};

assert.equal(POCKET_OFFLINE_NPC_MENU_BRIDGE_KIND, 'pocketmonster:offline-npc-menu-bridge-v1');
assert.equal(POCKET_OFFLINE_NPC_MENU_MESSAGE, 'pocketmonster:pirate-dialogue-v1');
assert.equal(hasOpenPocketOfflineNpcMenu(documentLike), false);

const bridge = installPocketOfflineNpcMenuBridge({
  documentLike,
  windowLike,
  signal: controller.signal,
});
assert.ok(Object.isFrozen(bridge));
assert.equal(bridge.kind, POCKET_OFFLINE_NPC_MENU_BRIDGE_KIND);
assert.deepEqual(sent, [{
  message: { type: POCKET_OFFLINE_NPC_MENU_MESSAGE, open: false },
  origin: 'https://game.example',
}]);
assert.deepEqual(FakeMutationObserver.instances[0].options, {
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'data-combined-world'],
});

roots.get('merchantShop').classList.remove('hidden');
FakeMutationObserver.instances[0].notify();
assert.equal(hasOpenPocketOfflineNpcMenu(documentLike), true);
assert.deepEqual(sent.at(-1), {
  message: { type: POCKET_OFFLINE_NPC_MENU_MESSAGE, open: true },
  origin: 'https://game.example',
});

roots.get('trainerPanel').classList.remove('hidden');
FakeMutationObserver.instances[0].notify();
assert.equal(sent.length, 2, 'switching between original open roots does not lower the scene');

roots.get('merchantShop').classList.add('hidden');
roots.get('trainerPanel').classList.add('hidden');
FakeMutationObserver.instances[0].notify();
assert.deepEqual(sent.at(-1), {
  message: { type: POCKET_OFFLINE_NPC_MENU_MESSAGE, open: false },
  origin: 'https://game.example',
});

roots.get('ranchServices').classList.remove('hidden');
FakeMutationObserver.instances[0].notify();
documentLike.body.dataset.combinedWorld = 'pirate-fruit';
FakeMutationObserver.instances[0].notify();
assert.deepEqual(sent.at(-1), {
  message: { type: POCKET_OFFLINE_NPC_MENU_MESSAGE, open: false },
  origin: 'https://game.example',
});

documentLike.body.dataset.combinedWorld = 'pocket-monster';
roots.get('monsterManager').classList.remove('hidden');
FakeMutationObserver.instances[0].notify();
controller.abort();
assert.equal(bridge.diagnostics().stopped, true);
assert.deepEqual(sent.at(-1), {
  message: { type: POCKET_OFFLINE_NPC_MENU_MESSAGE, open: false },
  origin: 'https://game.example',
});
assert.equal(FakeMutationObserver.instances[0].connected, false);

const read = relative => fs.readFileSync(new URL('../' + relative, import.meta.url), 'utf8');
const sceneEntry = read('scene-entry-v900.mjs');
const shell = read('online-world-shell-v900.mjs');
assert.match(
  sceneEntry,
  /installPocketOfflineNpcMenuBridge\(\{[\s\S]*documentLike: document,[\s\S]*windowLike: window,[\s\S]*signal: sceneLifetime\.signal/,
  'hosted scene observes the original offline menu roots for its full lifetime',
);
assert.match(
  shell,
  /event\.source !== sceneFrame\.contentWindow[\s\S]*pocketmonster:pirate-dialogue-v1[\s\S]*document\.body\.dataset\.pirateDialogue = 'open'/,
  'parent already raises only the active scene through the bounded modality protocol',
);

console.log('V9 Pocket offline NPC menu modality bridge: PASS');
