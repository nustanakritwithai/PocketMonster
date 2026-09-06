import assert from 'node:assert/strict';

import {
  NPC_OVERHEAD_ACTION_KIND,
  installNpcOverheadAction,
  watchNpcOverheadAction,
} from '../npc-overhead-action-v900.mjs';

const GAMEPLAY_LABELS = Object.freeze([
  'คุย',
  'ร้านค้า',
  'ฝึก',
  'วิวัฒนาการ',
  'ผสมพันธุ์',
]);

class FakeClassList {
  constructor(...names) {
    this.names = new Set(names);
  }

  contains(name) {
    return this.names.has(name);
  }
}

class FakeButton {
  constructor({ label = 'คุย', parentNode = null, onclick = null } = {}) {
    this.parentNode = parentNode;
    this.style = { left: '321px', top: '123px' };
    this.dataset = {};
    this.textContent = label;
    this.onclick = onclick;
    this.classList = new FakeClassList('npc-btn', 'hidden');
    this.attributes = new Map();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  click() {
    this.onclick?.({ type: 'click', target: this, currentTarget: this });
  }
}

function makeDocument(button = null) {
  const hud = { id: 'hud' };
  const documentElement = { id: 'documentElement' };
  const body = {
    children: [],
    append(node) {
      if (!this.children.includes(node)) this.children.push(node);
      node.parentNode = this;
    },
  };
  let currentButton = button;
  if (currentButton && !currentButton.parentNode) currentButton.parentNode = hud;
  return {
    body,
    documentElement,
    hud,
    getElementById(id) {
      return id === 'npcBtn' ? currentButton : null;
    },
    mountButton(nextButton) {
      currentButton = nextButton;
      if (currentButton && !currentButton.parentNode) currentButton.parentNode = hud;
    },
  };
}

function makeObserverWindow() {
  const observers = [];
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.connected = false;
      this.target = null;
      this.options = null;
      observers.push(this);
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
      if (this.connected) this.callback([], this);
    }
  }
  return {
    windowLike: { MutationObserver: FakeMutationObserver },
    observers,
    notifyConnected() {
      for (const observer of [...observers]) observer.notify();
    },
  };
}

assert.equal(
  NPC_OVERHEAD_ACTION_KIND,
  'pocketmonster:npc-overhead-action-v1',
  'Pocket NPC interaction must use the accepted v1 pill contract',
);

for (const label of GAMEPLAY_LABELS) {
  let clickCount = 0;
  const originalOnclick = () => { clickCount += 1; };
  const button = new FakeButton({ label, onclick: originalOnclick });
  const documentLike = makeDocument(button);
  const originalClassList = button.classList;

  const binding = installNpcOverheadAction(documentLike, {});

  assert.equal(binding?.kind, NPC_OVERHEAD_ACTION_KIND);
  assert.equal(binding?.button, button, `${label}: adapter reuses the gameplay-owned button`);
  assert.equal(button.parentNode, documentLike.body, `${label}: pill leaves the retired HUD`);
  assert.equal(button.textContent, label, `${label}: gameplay action label must not be renamed`);
  assert.equal(button.onclick, originalOnclick, `${label}: gameplay onclick identity must stay intact`);
  button.click();
  assert.equal(clickCount, 1, `${label}: the original gameplay click handler still runs`);
  assert.equal(button.classList, originalClassList, `${label}: class-list ownership remains with gameplay`);
  assert.equal(button.classList.contains('hidden'), true, `${label}: hidden state is preserved`);
  assert.equal(button.attributes.get('data-npc-overhead-action'), 'true');

  assert.deepEqual(
    {
      position: button.style.position,
      right: button.style.right,
      bottom: button.style.bottom,
      transform: button.style.transform,
      zIndex: button.style.zIndex,
      pointerEvents: button.style.pointerEvents,
      touchAction: button.style.touchAction,
      minHeight: button.style.minHeight,
      padding: button.style.padding,
      borderRadius: button.style.borderRadius,
      border: button.style.border,
      background: button.style.background,
      color: button.style.color,
      fontWeight: button.style.fontWeight,
      boxShadow: button.style.boxShadow,
      backdropFilter: button.style.backdropFilter,
    },
    {
      position: 'fixed',
      right: 'auto',
      bottom: 'auto',
      transform: 'translate(-50%, calc(-100% - 10px))',
      zIndex: '35',
      pointerEvents: 'auto',
      touchAction: 'manipulation',
      minHeight: '36px',
      padding: '7px 12px',
      borderRadius: '999px',
      border: '1px solid rgba(255,255,255,.72)',
      background: 'rgba(15,23,42,.88)',
      color: '#fff',
      fontWeight: '800',
      boxShadow: '0 5px 18px rgba(0,0,0,.45)',
      backdropFilter: 'blur(5px)',
    },
    `${label}: accepted v1 pill presentation remains exact`,
  );
  assert.equal(button.style.left, '321px', `${label}: gameplay-owned horizontal anchor is preserved`);
  assert.equal(button.style.top, '123px', `${label}: gameplay-owned vertical anchor is preserved`);

  binding.refresh();
  assert.equal(button.textContent, label, `${label}: refresh must not rename the gameplay action`);
  assert.equal(button.classList.contains('hidden'), true, `${label}: refresh must not reveal a hidden action`);
  assert.equal(button.onclick, originalOnclick, `${label}: refresh must not replace gameplay onclick`);
  binding.stop?.();
}

{
  const documentLike = makeDocument();
  const observerHarness = makeObserverWindow();
  const owner = watchNpcOverheadAction({
    documentLike,
    windowLike: observerHarness.windowLike,
  });

  assert.equal(owner.kind, NPC_OVERHEAD_ACTION_KIND);
  assert.equal(
    watchNpcOverheadAction({ documentLike, windowLike: observerHarness.windowLike }),
    owner,
    'watcher installation is idempotent for the same window',
  );
  assert.equal(observerHarness.observers.filter(observer => observer.connected).length, 1);
  const mountObserver = observerHarness.observers[0];
  assert.equal(mountObserver.target, documentLike.documentElement);
  assert.deepEqual(mountObserver.options, { childList: true, subtree: true });

  const delayedButton = new FakeButton({ label: 'คุย' });
  documentLike.mountButton(delayedButton);
  observerHarness.notifyConnected();
  assert.equal(delayedButton.parentNode, documentLike.body, 'watcher binds after the scene mounts npcBtn');
  assert.equal(delayedButton.textContent, 'คุย', 'delayed binding keeps the gameplay label');
  assert.equal(delayedButton.classList.contains('hidden'), true, 'delayed binding preserves hidden state');
  assert.equal(mountObserver.connected, false, 'the delayed-mount observer disconnects after binding');
  assert.equal(owner.stop(), true);
  assert.equal(observerHarness.observers.every(observer => !observer.connected), true);
}

{
  const documentLike = makeDocument();
  const observerHarness = makeObserverWindow();
  const owner = watchNpcOverheadAction({
    documentLike,
    windowLike: observerHarness.windowLike,
  });
  assert.equal(observerHarness.observers.filter(observer => observer.connected).length, 1);
  assert.equal(owner.stop(), true);
  assert.equal(observerHarness.observers.every(observer => !observer.connected), true);

  const buttonMountedAfterStop = new FakeButton({ label: 'คุย' });
  documentLike.mountButton(buttonMountedAfterStop);
  observerHarness.notifyConnected();
  assert.notEqual(
    buttonMountedAfterStop.parentNode,
    documentLike.body,
    'a stopped watcher must not bind a later scene mount',
  );
}

console.log('V9 Pocket NPC overhead v1 pill action: PASS');
