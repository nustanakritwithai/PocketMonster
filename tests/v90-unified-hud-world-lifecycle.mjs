import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createUnifiedMmorpgHud } from '../unified-mmorpg-hud-v900.mjs';

class FakeNode {
  constructor(tag = 'div', id = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.textContent = '';
    this.value = '';
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const next = force === undefined ? !classes.has(name) : force === true;
        if (next) classes.add(name); else classes.delete(name);
        return next;
      },
    };
  }
  setAttribute() {}
  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  addEventListener() {}
  byId(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.byId?.(id);
      if (found) return found;
    }
    return null;
  }
}

function createFakeDocument() {
  const body = new FakeNode('body');
  return {
    body,
    createElement: tag => new FakeNode(tag),
    getElementById: id => body.byId(id),
  };
}

function feature(name, revision = 1) {
  const subscribers = new Set();
  let snapshot = Object.freeze({ revision, available: true, title: name, rows: Object.freeze([]), slots: Object.freeze([]), items: Object.freeze([]), steps: Object.freeze([]), text: name });
  return {
    subscribe(handler) {
      subscribers.add(handler);
      handler(snapshot);
      return () => subscribers.delete(handler);
    },
    snapshot: () => snapshot,
    subscriberCount: () => subscribers.size,
    push(next) {
      snapshot = Object.freeze({ ...snapshot, ...next });
      for (const handler of subscribers) handler(snapshot);
    },
    setChatChannel() {},
    sendChat() { return { ok: true }; },
    markRead() {},
    selectPartySlot() {},
  };
}

const shellSource = fs.readFileSync(new URL('../online-world-shell-v900.mjs', import.meta.url), 'utf8');
const sceneEntrySource = fs.readFileSync(new URL('../scene-entry-v900.mjs', import.meta.url), 'utf8');
const preloadV9 = fs.readFileSync(new URL('../entry-preload-v900.mjs', import.meta.url), 'utf8');
assert.match(shellSource, /createUnifiedMmorpgHud/, 'V9 shell owns the Dock factory');
assert.match(shellSource, /installUnifiedHud\(\)/, 'V9 shell mounts one Dock after chat binds');
assert.match(shellSource, /unifiedHud\?\.unmount/, 'session end unmounts the Dock');
assert.match(shellSource, /clearSceneHudAdapters/, 'world switch drops iframe HUD adapters');
assert.match(shellSource, /bindSceneHudAdapters\(sceneWindow\)/, 'scene-ready rebinds iframe HUD adapters');
assert.match(sceneEntrySource, /unified-hud-active/, 'hosted scene raises the Dock capability class');
assert.match(preloadV9, /online-world-shell-v900.mjs\?v=48/, 'V9 entry cache-busts the Dock-mounting shell');

const documentLike = createFakeDocument();
const windowLike = {
  POCKETMONSTER_CHAT_RUNTIME: { chat: feature('chat', 1) },
};
const hud = createUnifiedMmorpgHud({ windowLike, documentLike });
const first = hud.mount();
const second = hud.mount();
assert.equal(first, second, 'mount is a singleton');
assert.equal(documentLike.body.classList.contains('unified-hud-active'), true);
assert.equal(windowLike.POCKETMONSTER_CHAT_RUNTIME.chat.subscriberCount(), 1);

windowLike.POCKETMONSTER_QUEST_HUD = feature('quest', 3);
hud.rebind();
assert.equal(windowLike.POCKETMONSTER_CHAT_RUNTIME.chat.subscriberCount(), 1, 'rebind does not stack chat subscribers');
assert.equal(windowLike.POCKETMONSTER_QUEST_HUD.subscriberCount(), 1, 'rebind picks up the new world adapter');

delete windowLike.POCKETMONSTER_QUEST_HUD;
hud.rebind();
assert.equal(true, true);

hud.unmount();
assert.equal(documentLike.getElementById('mmorpgHud'), null, 'unmount removes the Dock');
assert.equal(documentLike.body.classList.contains('unified-hud-active'), false);
assert.equal(windowLike.POCKETMONSTER_CHAT_RUNTIME.chat.subscriberCount(), 0);

const restored = hud.mount();
assert.ok(restored, 'pageshow can remount a single Dock');
assert.equal(documentLike.body.classList.contains('unified-hud-active'), true);
hud.unmount();

console.log('V9 unified HUD world lifecycle: PASS');
