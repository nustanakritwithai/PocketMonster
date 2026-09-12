import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createUnifiedMmorpgHud } from '../unified-mmorpg-hud-v900.mjs';
import { PIRATE_FRUIT_INVENTORY_MESSAGE } from '../pirate-fruit-control-hud-v900.mjs';

const hudSource = fs.readFileSync(new URL('../unified-mmorpg-hud-v900.mjs', import.meta.url), 'utf8');
const pirateHud = fs.readFileSync(new URL('../pirate-fruit-control-hud-v900.mjs', import.meta.url), 'utf8');
const presentation = fs.readFileSync(new URL('../pirate-fruit-offline/pocket-presentation.mjs', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');

assert.match(hudSource, /'inventory'/, 'inventory is a first-class utility command');
assert.match(presentation, /PIRATE_FRUIT_INVENTORY_MESSAGE/, 'Pirate child admits parent inventory toggles');
assert.match(presentation, /\.inv-open-button/, 'parent toggle clicks InventoryUI open button');
assert.match(css, /mmorpg-utility\[data-utility="inventory"\]/, 'bag utility sits in the under-minimap utility cluster');
assert.match(pirateHud, /\.inv-panel[\s\S]*max-height: min\(78vh/, 'inventory panel fits phone height');
assert.match(pirateHud, /\.inv-cards[\s\S]*grid-template-columns: 1fr/, 'inventory cards stay single-column on parent phones');

assert.equal(PIRATE_FRUIT_INVENTORY_MESSAGE, 'pocketmonster:pirate-inventory-v1');

class FakeNode {
  constructor(tag = 'div', id = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.textContent = '';
    this.style = { setProperty() {}, removeProperty() {} };
    this.listeners = new Map();
    this.attributes = new Map();
    this.disabled = false;
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle(name, force) {
        const next = force === undefined ? !classes.has(name) : force === true;
        if (next) classes.add(name); else classes.delete(name);
        return next;
      },
    };
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
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
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  dispatch(type, event = {}) {
    for (const handler of [...(this.listeners.get(type) || [])]) handler(event);
  }
  byId(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.byId?.(id);
      if (found) return found;
    }
    return null;
  }
  text() {
    return [this.textContent, ...this.children.map(child => child.text?.() || '')].join(' ');
  }
}

function documentLike() {
  const body = new FakeNode('body');
  body.dataset.combinedWorld = 'pirate-fruit';
  const posts = [];
  const frame = new FakeNode('iframe', 'pirateFruitFrame');
  frame.contentWindow = {
    postMessage(payload, target) { posts.push({ payload, target }); },
  };
  body.append(frame);
  const listeners = new Map();
  return {
    body,
    hidden: false,
    visibilityState: 'visible',
    createElement: tag => new FakeNode(tag),
    getElementById: id => body.byId(id),
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      listeners.set(type, (listeners.get(type) || []).filter(item => item !== handler));
    },
    _posts: posts,
  };
}

function feature(snapshot) {
  const subscribers = new Set();
  let current = snapshot;
  return {
    subscribe(handler) {
      subscribers.add(handler);
      handler(current);
      return () => subscribers.delete(handler);
    },
    snapshot: () => current,
    push(next) {
      current = next;
      for (const handler of subscribers) handler(current);
    },
  };
}

const document = documentLike();
const utilities = Object.assign(feature({
  revision: 1,
  items: Object.freeze([
    Object.freeze({ id: 'character', label: 'ข้อมูลตัวละคร', visualKey: 'character', enabled: true, badge: '', reason: '' }),
    Object.freeze({ id: 'audio', label: 'ปิดเสียง', visualKey: 'audio', enabled: true, badge: '', reason: '' }),
  ]),
}), {
  invokeUtility(id) {
    return { ok: true, reason: 'invoked', message: id };
  },
});

const hud = createUnifiedMmorpgHud({
  windowLike: {
    POCKETMONSTER_POCKET_HUD: {
      player: feature({ revision: 1, available: false, buffs: Object.freeze([]) }),
      target: feature({ revision: 1, available: false, states: Object.freeze([]) }),
      actions: feature({ revision: 1, items: Object.freeze([]) }),
      utilities,
      banner: feature({ revision: 1, kind: '', text: '', expiresAt: 0 }),
    },
    POCKETMONSTER_CHAT_RUNTIME: {
      chat: feature({
        revision: 1, channel: 'WORLD', channels: ['WORLD', 'ZONE'], rows: Object.freeze([]),
        unread: 0, status: 'connected', canSend: true,
      }),
    },
    POCKETMONSTER_SERVER_GATE: { state: 'healthy' },
  },
  documentLike: document,
});
hud.mount();

const utilityRoot = document.getElementById('mmorpgUtilities');
const ids = utilityRoot.children.map(node => node.dataset.utility);
assert.equal(ids[0], 'inventory', 'Pirate bag is the first under-minimap utility');
assert.ok(ids.includes('character') && ids.includes('audio'), 'existing utilities remain');

const bag = utilityRoot.children[0];
assert.equal(bag.textContent, '🎒');
bag.dispatch('click');
await Promise.resolve();
await Promise.resolve();
assert.equal(document._posts.length, 1, 'bag click posts into Pirate iframe');
assert.equal(document._posts[0].payload.type, PIRATE_FRUIT_INVENTORY_MESSAGE);
assert.equal(document._posts[0].payload.action, 'toggle');

hud.unmount();
console.log('V9 Pirate inventory under-minimap utility: PASS');
