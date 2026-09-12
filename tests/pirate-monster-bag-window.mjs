import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createUnifiedMmorpgHud } from '../unified-mmorpg-hud-v900.mjs';

const source = fs.readFileSync(new URL('../unified-mmorpg-hud-v900.mjs', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `${name} must remain an async HUD utility`);
  const end = source.indexOf('\n  }\n\n  async function runUtility', start);
  assert.ok(end > start, `could not extract ${name}`);
  return source.slice(start, end + 4);
}

const scene = {
  calls: 0,
  POCKETMONSTER_OPEN_MONSTER_BAG() {
    this.calls += 1;
    return { ok: true, reason: 'opened-by-scene' };
  },
};
// Run the extracted production function with its actual closure dependencies.
// The function is a closure in production; bind the dependencies by evaluating
// the same body as a small harness, without copying its implementation.
const makeOpen = Function('windowLike', 'pirateWorldActive', 'sceneDocument', `return (${extractFunction('openMonsterBag')})`);
const ready = makeOpen({}, () => true, () => ({ defaultView: scene }));
assert.deepEqual(await ready(), { ok: true, reason: 'opened', message: '' });
assert.equal(scene.calls, 1, 'Pirate scene adapter must be invoked');

const unavailable = makeOpen({}, () => true, () => ({ defaultView: {} }));
assert.deepEqual(await unavailable(), {
  ok: false,
  reason: 'unavailable',
  message: 'ยังไม่พร้อมเปิดกระเป๋ามอนสเตอร์',
});

const rejectingScene = { POCKETMONSTER_OPEN_MONSTER_BAG: () => Promise.reject(new Error('scene-not-ready')) };
const rejected = makeOpen({}, () => true, () => ({ defaultView: rejectingScene }));
assert.deepEqual(await rejected(), { ok: false, reason: 'failed', message: 'scene-not-ready' });

const legacy = { calls: 0, POCKETMONSTER_OPEN_MONSTER_BAG() { this.calls += 1; } };
const pocket = makeOpen(legacy, () => false, () => ({ defaultView: {} }));
assert.deepEqual(await pocket(), { ok: true, reason: 'opened', message: '' });
assert.equal(legacy.calls, 1, 'non-Pirate keeps the parent Pocket adapter path');

// Exercise the exported HUD utility click with the real sceneDocument and
// pirateWorldActive closures (the iframe is represented by a same-origin fixture).
class Node {
  constructor(tag = 'div', id = '') { this.tagName = tag; this.id = id; this.children = []; this.parentNode = null; this.dataset = {}; this.style = {}; this.attributes = new Map(); this.listeners = new Map(); this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false; const set = new Set(); this.classList = { add: (...x) => x.forEach(v => set.add(v)), remove: (...x) => x.forEach(v => set.delete(v)), contains: v => set.has(v), toggle: (v, force) => { const on = force === undefined ? !set.has(v) : force; on ? set.add(v) : set.delete(v); return on; } }; }
  append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) ?? null; }
  addEventListener(k, fn) { const list = this.listeners.get(k) || []; list.push(fn); this.listeners.set(k, list); }
  removeEventListener() {}
  dispatch(k, event = {}) { for (const fn of this.listeners.get(k) || []) fn(event); }
  byId(id) { if (this.id === id) return this; for (const child of this.children) { const found = child.byId?.(id); if (found) return found; } return null; }
  querySelector(selector) { return selector.startsWith('#') ? this.byId(selector.slice(1)) : null; }
}
function feature(snapshot) { return { snapshot: () => snapshot, subscribe(fn) { fn(snapshot); return () => {}; } }; }
const fixtureDoc = { body: new Node('body'), createElement: tag => new Node(tag), getElementById(id) { return this.body.byId(id); }, querySelector() { return null; }, addEventListener() {}, removeEventListener() {} };
const pirateScene = { document: { body: { dataset: { combinedWorld: 'pirate-fruit' }, attributes: {} } }, calls: 0, POCKETMONSTER_OPEN_MONSTER_BAG() { this.calls += 1; return { ok: true }; } };
pirateScene.document.defaultView = pirateScene;
const frame = new Node('iframe', 'onlineWorldSceneFrame'); frame.contentWindow = pirateScene; fixtureDoc.body.append(frame);
const actualWindow = new EventTarget(); actualWindow.POCKETMONSTER_OPEN_MONSTER_BAG = () => { throw new Error('parent API must not be selected for Pirate'); };
actualWindow.POCKETMONSTER_CHAT_RUNTIME = { chat: feature({ revision: 1, channels: ['WORLD'], rows: [], status: 'connected', unread: 0, canSend: false }) };
actualWindow.POCKETMONSTER_QUEST_HUD = feature({ revision: 1, available: false, steps: [] });
actualWindow.POCKETMONSTER_PARTY_HUD = feature({ revision: 1, available: false, slots: [] });
actualWindow.POCKETMONSTER_POCKET_HUD = Object.assign({ resetAll() {} }, { player: feature({ revision: 1 }), target: feature({ revision: 1 }), actions: feature({ revision: 1, items: [] }), utilities: feature({ revision: 1, items: [] }), banner: feature({ revision: 1 }) });
const actualHud = createUnifiedMmorpgHud({ windowLike: actualWindow, documentLike: fixtureDoc });
actualHud.mount();
const bagButton = fixtureDoc.getElementById('mmorpgUtilities').children.find(button => button.dataset.utility === 'monster-bag');
assert.ok(bagButton, 'actual exported HUD renders Pirate monster-bag utility');
bagButton.dispatch('click');
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(pirateScene.calls, 1, 'actual utility click reaches the scene-window API');
actualHud.unmount();

console.log('Pirate monster bag scene-window utility: PASS (ready/unavailable/reject/legacy)');
