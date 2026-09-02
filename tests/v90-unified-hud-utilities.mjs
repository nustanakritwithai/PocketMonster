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
  const listeners = new Map();
  return {
    body,
    hidden: false,
    visibilityState: 'visible',
    createElement: tag => new FakeNode(tag),
    getElementById: id => body.byId(id) || (id === 'persistentFullscreenBtn' ? new FakeNode('button', id) : null),
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      listeners.set(type, (listeners.get(type) || []).filter(item => item !== handler));
    },
    emit(type) {
      for (const handler of listeners.get(type) || []) handler();
    },
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

const css = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');
assert.match(css, /\.mmorpg-utility\{[^}]*border-radius:50%/, 'right utilities are circles');
assert.match(css, /\.mmorpg-banner\{[^}]*top:10\.2%/, 'system banner sits top-center');
assert.match(css, /\.mmorpg-bottom-strip\{[^}]*bottom:0/, 'status strip hugs the bottom-left');
assert.doesNotMatch(css, /battery|GMT|device-memory/i, 'strip cannot invent device values');

const commands = [];
const document = documentLike();
const utilities = Object.assign(feature({
  revision: 1,
  items: Object.freeze([
    Object.freeze({ id: 'character', label: 'ข้อมูลตัวละคร', visualKey: 'character', enabled: true, badge: '', reason: '' }),
    Object.freeze({ id: 'save', label: 'บันทึกเกม', visualKey: 'save', enabled: true, badge: '1', reason: '' }),
    Object.freeze({ id: 'audio', label: 'ปิดเสียง', visualKey: 'audio', enabled: true, badge: '', reason: '' }),
    Object.freeze({ id: 'restart', label: 'เริ่มใหม่', visualKey: 'restart', enabled: true, badge: '', reason: '' }),
    Object.freeze({ id: 'decoy', label: 'ปุ่มปลอม', visualKey: 'decoy', enabled: true, badge: '', reason: '' }),
  ]),
}), {
  invokeUtility(id) {
    commands.push(id);
    if (id === 'save') return { ok: false, reason: 'blocked', message: 'เซฟไม่สำเร็จ' };
    return { ok: true, reason: 'invoked', message: '' };
  },
});
const banner = feature({ revision: 1, kind: 'system', text: 'Ranch เป็นพื้นที่ปลอดภัย', expiresAt: 0 });
const chat = feature({
  revision: 1, channel: 'WORLD', channels: ['WORLD', 'ZONE'], rows: Object.freeze([]),
  unread: 0, status: 'connected', canSend: true,
});
const windowLike = {
  POCKETMONSTER_CHAT_RUNTIME: { chat },
  POCKETMONSTER_POCKET_HUD: {
    player: feature({ revision: 1, available: false, buffs: Object.freeze([]) }),
    target: feature({ revision: 1, available: false, states: Object.freeze([]) }),
    actions: feature({ revision: 1, items: Object.freeze([]) }),
    utilities,
    banner,
  },
  POCKETMONSTER_SERVER_GATE: { state: 'healthy' },
};
const hud = createUnifiedMmorpgHud({ windowLike, documentLike: document });
hud.mount();

const utilityIds = document.getElementById('mmorpgUtilities').children.map(node => node.dataset.utility);
assert.deepEqual(utilityIds, ['character', 'save', 'audio'], 'unsupported/dead utilities are not rendered as controls');
assert.equal(document.getElementById('mmorpgUtilities').children[1].children[0].textContent, '1', 'badge comes from the contract');

document.getElementById('mmorpgUtilities').children[0].dispatch('click');
assert.deepEqual(commands, ['character']);

document.getElementById('mmorpgUtilities').children[1].dispatch('click');
await Promise.resolve();
await Promise.resolve();
assert.match(document.getElementById('mmorpgBanner').text(), /เซฟไม่สำเร็จ/, 'failed commands surface in the UI');
assert.equal(document.getElementById('mmorpgBanner').classList.contains('error'), true);

const extras = document.getElementById('mmorpgChatExtras');
assert.equal(extras.getAttribute('aria-hidden'), 'true');
assert.equal(extras.children.length, 3);
assert.equal(extras.children.every(node => node.tagName === 'SPAN'), true, 'mic/mail/friends stay noninteractive without a contract');

const strip = document.getElementById('mmorpgBottomStrip').text();
assert.match(strip, /connected/);
assert.match(strip, /healthy/);
assert.doesNotMatch(strip, /battery|GMT/i);
assert.match(strip, /\d+:\d{2}/);

banner.push({ revision: 2, kind: 'system', text: 'Ranch เป็นพื้นที่ปลอดภัย', expiresAt: 0 });
assert.match(document.getElementById('mmorpgBanner').text(), /Ranch/);
banner.push({ revision: 3, kind: '', text: '', expiresAt: 0 });
assert.equal(document.getElementById('mmorpgBanner').classList.contains('hidden'), true, 'clearing the snapshot hides the banner');

hud.unmount();
console.log('V9 unified HUD utilities: PASS');
