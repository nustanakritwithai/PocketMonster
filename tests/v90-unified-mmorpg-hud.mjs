import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  UNIFIED_MMORPG_HUD_KIND,
  createUnifiedMmorpgHud,
} from '../unified-mmorpg-hud-v900.mjs';

// ---------- Minimal fake DOM ----------
class FakeNode {
  constructor(tag = 'div', id = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.focused = false;
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.renderWrites = 0;
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
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    this.renderWrites += 1;
    this.children = [];
    this.append(...nodes);
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter(item => item !== handler));
  }
  dispatch(type, event = {}) {
    for (const handler of [...(this.listeners.get(type) || [])]) handler(event);
  }
  focus() {
    this.focused = true;
    this.dispatch('focus', {});
  }
  blur() {
    this.focused = false;
    this.dispatch('blur', {});
  }
  querySelector(selector) {
    if (selector.startsWith('#')) return this.byId(selector.slice(1));
    return null;
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

function createFakeDocument() {
  const body = new FakeNode('body');
  const listeners = new Map();
  const documentLike = {
    body,
    createElement(tag) { return new FakeNode(tag); },
    querySelector(selector) { return selector.startsWith('#') ? body.byId(selector.slice(1)) : null; },
    getElementById(id) { return body.byId(id); },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      listeners.set(type, (listeners.get(type) || []).filter(item => item !== handler));
    },
    dispatch(type, event = {}) {
      for (const handler of [...(listeners.get(type) || [])]) handler(event);
    },
  };
  return documentLike;
}

// ---------- Fake feature adapters ----------
function fakeFeature(initial) {
  let current = initial;
  const subscribers = new Set();
  return {
    subscribe(listener) {
      subscribers.add(listener);
      listener(current);
      return () => subscribers.delete(listener);
    },
    snapshot: () => current,
    push(next) {
      current = next;
      for (const listener of [...subscribers]) listener(current);
    },
    subscriberCount: () => subscribers.size,
  };
}

const chatCalls = { send: [], channel: [], markRead: 0 };
function fakeChatAdapter() {
  const feature = fakeFeature({
    revision: 1,
    channel: 'WORLD',
    channels: ['WORLD', 'ZONE'],
    rows: Object.freeze([
      Object.freeze({ id: 'msg-1', channel: 'WORLD', author: 'Alice', text: 'สวัสดี', timestamp: 1, kind: 'message' }),
    ]),
    unread: 2,
    status: 'connected',
    canSend: true,
  });
  return Object.assign(feature, {
    sendChat(text) { chatCalls.send.push(text); return Promise.resolve({ ok: true, reason: 'sent', message: '' }); },
    setChatChannel(channel) { chatCalls.channel.push(channel); return { ok: true, reason: 'channel-changed', message: '' }; },
    markRead() { chatCalls.markRead += 1; },
  });
}

// ---------- Harness ----------
function bootWorld() {
  const documentLike = createFakeDocument();
  const windowLike = new EventTarget();
  windowLike.POCKETMONSTER_CHAT_RUNTIME = { chat: fakeChatAdapter() };
  windowLike.POCKETMONSTER_QUEST_HUD = fakeFeature({
    revision: 1, available: true, title: 'Grass Meadow', summary: '2/3 ปราบ ELITE',
    steps: Object.freeze([
      Object.freeze({ id: 'capture-starter', label: 'จับมอน 1 ตัว', state: 'done', progress: 0, goal: 0 }),
      Object.freeze({ id: 'defeat-elite', label: 'ปราบ ELITE', state: 'current', progress: 0, goal: 0 }),
      Object.freeze({ id: 'defeat-boss', label: 'ปราบ BOSS', state: 'todo', progress: 0, goal: 0 }),
    ]),
    status: '',
  });
  windowLike.POCKETMONSTER_PARTY_HUD = fakeFeature({
    revision: 1, available: true, selectedSlot: 0, activeInstanceId: 'mon-a', canSwitch: true,
    slots: Object.freeze([
      Object.freeze({ id: 'slot-1', slot: 0, available: true, instanceId: 'mon-a', portraitKey: 'mossbun', name: 'Mossbun', level: 5, hp: 20, hpMax: 40, condition: 'normal', fainted: false, selected: true, active: true }),
      Object.freeze({ id: 'slot-2', slot: 1, available: false, instanceId: '', portraitKey: '', name: '', level: 0, hp: 0, hpMax: 0, condition: '', fainted: false, selected: false, active: false }),
      Object.freeze({ id: 'slot-3', slot: 2, available: false, instanceId: '', portraitKey: '', name: '', level: 0, hp: 0, hpMax: 0, condition: '', fainted: false, selected: false, active: false }),
    ]),
  });
  windowLike.POCKETMONSTER_PARTY_HUD.selectPartySlot = slot => { windowLike.lastPartyCommand = ['select', slot]; return { ok: true, reason: 'slot-selected', message: '' }; };
  const pocketFeatures = {
    player: fakeFeature({ revision: 1, available: true, portraitKey: 'keeper', displayName: 'ผู้ดูแล', level: 0, title: '', hp: 100, hpMax: 100, resourceKind: 'capture-balls', resource: 3, resourceMax: 3, modeLabel: 'Grass Meadow • Gold 300', modePercent: 0, buffs: Object.freeze([]) }),
    target: fakeFeature({ revision: 1, available: false, id: '', portraitKey: '', name: '', level: 0, hp: 0, hpMax: 0, states: Object.freeze([]) }),
    actions: fakeFeature({ revision: 1, items: Object.freeze([]) }),
    utilities: fakeFeature({ revision: 1, items: Object.freeze([]) }),
    banner: fakeFeature({ revision: 1, kind: '', text: '', expiresAt: 0 }),
  };
  windowLike.POCKETMONSTER_POCKET_HUD = Object.freeze({ ...pocketFeatures, resetAll() {} });
  const hud = createUnifiedMmorpgHud({ windowLike, documentLike });
  return { hud, documentLike, windowLike };
}

// ---------- 1. Single shell with every region ----------
{
  const { hud, documentLike } = bootWorld();
  assert.equal(hud.kind, UNIFIED_MMORPG_HUD_KIND);
  hud.mount();
  assert.equal(documentLike.body.classList.contains('unified-hud-active'), true, 'mount raises the legacy-retirement capability flag');
  hud.mount();
  const shell = documentLike.getElementById('mmorpgHud');
  assert.ok(shell, 'mount creates the #mmorpgHud shell');
  assert.equal(documentLike.body.children.filter(child => child.id === 'mmorpgHud').length, 1, 'a second mount cannot duplicate the shell');
  for (const id of [
    'mmorpgPlayerStatus', 'mmorpgBuffRow', 'mmorpgQuickIndicators', 'mmorpgQuestPanel', 'mmorpgMinimap',
    'mmorpgRoster', 'mmorpgCompanions', 'mmorpgUtilities', 'mmorpgBanner',
    'mmorpgDock', 'mmorpgBottomStrip', 'mmorpgSideDrawer', 'mmorpgSideTabs', 'mmorpgTabCollapse',
  ]) {
    assert.ok(shell.byId(id), `region #${id} exists exactly once`);
  }
  const tablist = shell.byId('mmorpgSideTabs');
  assert.equal(tablist?.getAttribute('role'), 'tablist', 'side window exposes เควส/Party tabs');
  for (const tabId of ['mmorpgTabQuest', 'mmorpgTabParty', 'mmorpgTabCollapse']) {
    const tab = shell.byId(tabId);
    assert.equal(tab?.getAttribute('role'), 'tab', `${tabId} is a tab`);
  }
  assert.equal(shell.byId('mmorpgTabCollapse').textContent, 'ย่อ', 'collapse control sits with เควส/Party');
  assert.equal(shell.byId('mmorpgDockTabs'), null, 'bottom dock has no chat/quest/party tab picker');
  assert.equal(shell.byId('mmorpgTabChat'), null, 'chat has no tab; the dock is chat-only');
  hud.unmount();
}

// ---------- 2. Chat tab renders adapter state and marks read ----------
{
  const { hud, documentLike, windowLike } = bootWorld();
  hud.mount();
  chatCalls.markRead = 0;
  const log = documentLike.getElementById('mmorpgChatLog');
  assert.match(log.text(), /สวัสดี/, 'chat rows render from the adapter snapshot');
  const unreadBadge = documentLike.getElementById('mmorpgChatUnread');
  assert.equal(unreadBadge.textContent, '2', 'collapsed dock shows the unread count');
  hud.setTab('chat');
  assert.equal(chatCalls.markRead, 1, 'opening chat marks chat read');
  const input = documentLike.getElementById('mmorpgChatInput');
  assert.equal(input.getAttribute('placeholder'), 'พิมพ์ข้อความ', 'chat compose is visible at the dock bottom');
  input.value = 'ตอบกลับ';
  documentLike.getElementById('mmorpgChatForm').dispatch('submit', { preventDefault() {} });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(chatCalls.send, ['ตอบกลับ'], 'dock send routes through the chat adapter command');
  windowLike.POCKETMONSTER_CHAT_RUNTIME.chat.push({
    revision: 2, channel: 'WORLD', channels: ['WORLD', 'ZONE'],
    rows: Object.freeze([Object.freeze({ id: 'msg-9', channel: 'WORLD', author: 'Bob', text: 'ข้อความใหม่', timestamp: 2, kind: 'message' })]),
    unread: 0, status: 'connected', canSend: true,
  });
  assert.match(log.text(), /ข้อความใหม่/, 'revision bumps re-render chat');
  hud.unmount();
}

{
  const { hud, documentLike } = bootWorld();
  hud.mount();
  const input = documentLike.getElementById('mmorpgChatInput');
  const dismiss = documentLike.getElementById('mmorpgChatDismiss');
  assert.ok(dismiss.classList.contains('hidden'), 'world tap catcher stays off until chat is focused');
  input.focus();
  assert.equal(dismiss.classList.contains('hidden'), false, 'focusing chat arms a tap-away keyboard dismiss');
  documentLike.dispatch('pointerdown', { target: { parentNode: null } });
  assert.equal(input.focused, false, 'tapping the play surface blurs chat and closes the keyboard');
  assert.ok(dismiss.classList.contains('hidden'), 'the tap catcher hides after blur');
  hud.unmount();
}

// ---------- 3. Quest and Party panels render adapter state ----------
{
  const { hud, documentLike, windowLike } = bootWorld();
  hud.mount();
  const questPanel = documentLike.getElementById('mmorpgQuestPanel');
  assert.match(questPanel.text(), /Grass Meadow/, 'quest title renders');
  assert.match(questPanel.text(), /ปราบ ELITE/, 'current quest step renders');
  hud.setTab('party');
  assert.equal(documentLike.getElementById('mmorpgTabParty').getAttribute('aria-selected'), 'true');
  assert.equal(documentLike.getElementById('mmorpgTabQuest').getAttribute('aria-selected'), 'false');
  const roster = documentLike.getElementById('mmorpgRoster');
  assert.match(roster.text(), /Mossbun/, 'party roster renders monster rows');
  assert.match(documentLike.getElementById('mmorpgPartyPanel').text(), /Mossbun/, 'side Party pane lists the active monster');
  const slotButtons = [];
  const collect = node => { if (node.dataset?.partySlot !== undefined) slotButtons.push(node); node.children.forEach(collect); };
  collect(documentLike.getElementById('mmorpgPartyPanel'));
  assert.ok(slotButtons.length >= 1, 'party panel exposes slot controls');
  slotButtons[0].dispatch('click', {});
  assert.deepEqual(windowLike.lastPartyCommand, ['select', 0], 'slot click routes through the party adapter command');
  documentLike.getElementById('mmorpgTabCollapse').dispatch('click', {});
  assert.equal(documentLike.getElementById('mmorpgSideDrawer').classList.contains('collapsed'), true, 'ย่อ collapses the side window');
  assert.equal(documentLike.getElementById('mmorpgSideDetail').classList.contains('hidden'), true, 'ย่อ hides the detail pane');
  assert.equal(documentLike.getElementById('mmorpgTabCollapse').getAttribute('aria-selected'), 'true');
  documentLike.getElementById('mmorpgTabQuest').dispatch('click', {});
  assert.equal(documentLike.getElementById('mmorpgSideDrawer').classList.contains('collapsed'), false, 'เควส reopens the detail pane');
  assert.equal(documentLike.getElementById('mmorpgSideDetail').classList.contains('hidden'), false);
  assert.equal(documentLike.getElementById('mmorpgQuestPanel').classList.contains('hidden'), false);
  hud.unmount();
}

// ---------- 4. Revision-gated rendering and teardown ----------
{
  const { hud, documentLike, windowLike } = bootWorld();
  hud.mount();
  const log = documentLike.getElementById('mmorpgChatLog');
  const writesBefore = log.renderWrites;
  windowLike.POCKETMONSTER_CHAT_RUNTIME.chat.push(windowLike.POCKETMONSTER_CHAT_RUNTIME.chat.snapshot());
  assert.equal(log.renderWrites, writesBefore, 'identical revisions cannot rewrite the DOM');
  const feature = windowLike.POCKETMONSTER_QUEST_HUD;
  const subscribersBefore = feature.subscriberCount();
  hud.unmount();
  assert.equal(feature.subscriberCount(), 0, 'unmount unsubscribes every feature');
  assert.equal(documentLike.getElementById('mmorpgHud'), null, 'unmount removes the shell');
  assert.equal(documentLike.body.classList.contains('unified-hud-active'), false, 'unmount lowers the capability flag');
  feature.push({ revision: 99, available: true, title: 'หลัง teardown', summary: '', steps: Object.freeze([]), status: '' });
  assert.equal(documentLike.getElementById('mmorpgQuestPanel'), null, 'no DOM resurrects after teardown');
}

// ---------- 5. Overlay monster slots paint and arm summon ----------
{
  const { hud, documentLike, windowLike } = bootWorld();
  windowLike.POCKETMONSTER_PARTY_HUD.armSummon = slot => {
    windowLike.lastPartyCommand = ['arm', slot];
    return { ok: true, reason: 'summon-aimed', message: '' };
  };
  for (const id of ['monsterSlot1Btn', 'monsterSlot2Btn', 'monsterSlot3Btn']) {
    const button = new FakeNode('button', id);
    button.classList.add('tc-btn', 'tc-monster');
    documentLike.body.append(button);
  }
  hud.mount();
  const slot1 = documentLike.getElementById('monsterSlot1Btn');
  assert.equal(slot1.textContent, 'M', 'overlay slot paints the owned monster glyph');
  assert.equal(slot1.getAttribute('data-pirate-icon'), 'M', 'pirate icon follows the owned glyph');
  slot1.dispatch('pointerdown', { preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(windowLike.lastPartyCommand, ['arm', 0], 'overlay press arms the Pocket summon for that slot');
  hud.unmount();
}

{
  const documentLike = createFakeDocument();
  for (const id of ['monsterSlot1Btn', 'monsterSlot2Btn', 'monsterSlot3Btn']) {
    const button = new FakeNode('button', id);
    button.textContent = '🐾';
    documentLike.body.append(button);
  }
  const windowLike = new EventTarget();
  windowLike.POCKETMONSTER_CHAT_RUNTIME = { chat: fakeChatAdapter() };
  const hud = createUnifiedMmorpgHud({ windowLike, documentLike });
  hud.mount();
  assert.equal(documentLike.getElementById('monsterSlot1Btn').textContent, '＋', 'empty overlay slots seed before party exists');
  windowLike.POCKETMONSTER_PARTY_HUD = fakeFeature({
    revision: 4, available: true, selectedSlot: 0, activeInstanceId: 'mon-a', canSwitch: true,
    slots: Object.freeze([
      Object.freeze({ id: 'slot-1', slot: 0, available: true, instanceId: 'mon-a', portraitKey: 'mossbun', name: 'Mossbun', level: 5, hp: 20, hpMax: 40, condition: 'normal', fainted: false, selected: true, active: true }),
      Object.freeze({ id: 'slot-2', slot: 1, available: false, instanceId: '', portraitKey: '', name: '', level: 0, hp: 0, hpMax: 0, condition: '', fainted: false, selected: false, active: false }),
      Object.freeze({ id: 'slot-3', slot: 2, available: false, instanceId: '', portraitKey: '', name: '', level: 0, hp: 0, hpMax: 0, condition: '', fainted: false, selected: false, active: false }),
    ]),
  });
  windowLike.POCKETMONSTER_PARTY_HUD.selectPartySlot = slot => { windowLike.lastPartyCommand = ['select', slot]; return { ok: true }; };
  hud.rebind();
  assert.equal(documentLike.getElementById('monsterSlot1Btn').textContent, 'M', 'rebind paints overlay slots from the scene party adapter');
  hud.unmount();
}

// ---------- 6. Entry wiring ----------
const preload = fs.readFileSync(new URL('../entry-preload.mjs', import.meta.url), 'utf8');
assert.match(preload, /unified-mmorpg-hud-v900\.mjs/, 'entry preload owns the unified HUD module');
assert.ok(
  preload.indexOf('unified-mmorpg-hud-v900.mjs') < preload.indexOf('game-v800.js'),
  'the HUD shell must bind before game overlays',
);

console.log('V9 unified MMORPG Monitor Dock: PASS');
