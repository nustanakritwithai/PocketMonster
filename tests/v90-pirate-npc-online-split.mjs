import assert from 'node:assert/strict';

class FakePointerEvent extends Event {
  constructor(type, init = {}) {
    super(type, init);
    for (const [key, value] of Object.entries(init)) {
      if (!(key in this)) Object.defineProperty(this, key, { value });
    }
  }
}

class FakeMutationObserver {
  static instances = new Set();
  constructor(callback) { this.callback = callback; }
  observe() { FakeMutationObserver.instances.add(this); }
  disconnect() { FakeMutationObserver.instances.delete(this); }
  static flush() { for (const item of [...this.instances]) item.callback([]); }
}

class FakeElement extends EventTarget {
  constructor(id = '') {
    super();
    this.id = id;
    this.type = '';
    this.dataset = {};
    this.style = {};
    this.attrs = new Map();
    this.rect = { left: 100, top: 200, width: 140, height: 48 };
    this.textContent = '';
  }
  getBoundingClientRect() { return this.rect; }
  setAttribute(key, value) { this.attrs.set(key, String(value)); }
  removeAttribute(key) { this.attrs.delete(key); }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
  remove() { this.removed = true; }
}

// Child: Pirate's visible prompt is only a presentation signal. Activation must
// become the original Pirate pointerdown handler rather than a Pocket NPC click.
{
  FakeMutationObserver.instances.clear();
  const prompt = new FakeElement('prompt');
  prompt.style.display = 'block';
  prompt.textContent = '💬 คุยกับ กะลาสี';
  let requested = 0;
  prompt.addEventListener('pointerdown', () => { requested += 1; });
  const parentMessages = [];
  const parentWindow = { postMessage(message, origin) { parentMessages.push({ message, origin }); } };
  const windowLike = new EventTarget();
  Object.assign(windowLike, {
    parent: parentWindow,
    innerWidth: 800,
    innerHeight: 600,
    PointerEvent: FakePointerEvent,
    MutationObserver: FakeMutationObserver,
    setInterval() { return 1; },
    clearInterval() {},
    getComputedStyle() { return { display: 'block', visibility: 'visible' }; },
  });
  const documentLike = {
    documentElement: new FakeElement('html'),
    querySelector(selector) { return selector === '.interaction-prompt' ? prompt : null; },
  };
  Object.assign(globalThis, {
    window: windowLike,
    document: documentLike,
    location: { search: '?parentOrigin=https%3A%2F%2Fscene.example' },
    MutationObserver: FakeMutationObserver,
    PointerEvent: FakePointerEvent,
    getComputedStyle: windowLike.getComputedStyle,
  });

  const mod = await import(`../pirate-npc-online-bridge-v900.mjs?child=${Date.now()}`);
  assert.equal(windowLike.POCKETMONSTER_PIRATE_NPC_ONLINE_BRIDGE.role, 'child');
  assert.equal(parentMessages.at(-1).origin, 'https://scene.example');
  assert.equal(parentMessages.at(-1).message.type, mod.PIRATE_NPC_ONLINE_MESSAGE);
  assert.equal(parentMessages.at(-1).message.active, true);

  const activation = new Event('message');
  Object.defineProperties(activation, {
    source: { value: parentWindow },
    origin: { value: 'https://scene.example' },
    data: { value: {
      type: mod.PIRATE_NPC_ONLINE_MESSAGE,
      kind: 'activate',
      label: '💬 คุยกับ กะลาสี',
    } },
  });
  windowLike.dispatchEvent(activation);
  assert.equal(requested, 1, 'Pirate online bridge must dispatch the original Pirate pointerdown');

  prompt.textContent = '☸ ปล่อยพวงมาลัย';
  FakeMutationObserver.flush();
  assert.equal(parentMessages.at(-1).message.active, false, 'helm prompt is never treated as NPC dialogue');
  windowLike.POCKETMONSTER_PIRATE_NPC_ONLINE_BRIDGE.stop();
}

// Parent: the online proxy is strictly Pirate-only. Pocket Monster keeps its
// original offline #npcBtn/menu path with no cross-world interaction owner.
{
  FakeMutationObserver.instances.clear();
  const sentToChild = [];
  const childWindow = { postMessage(message, origin) { sentToChild.push({ message, origin }); } };
  const childFrame = new FakeElement('pirateFruitFrame');
  childFrame.contentWindow = childWindow;
  childFrame.rect = { left: 0, top: 0, width: 800, height: 600 };
  const hostBody = {
    children: [],
    appendChild(node) { this.children.push(node); },
  };
  const hostDocument = {
    body: hostBody,
    createElement() { return new FakeElement(); },
    getElementById(id) { return hostBody.children.find(node => node.id === id) || null; },
  };
  const sceneBody = new FakeElement('body');
  sceneBody.dataset.combinedWorld = 'pocket-monster';
  sceneBody.dataset.controlPanel = 'human';
  const documentLike = {
    body: sceneBody,
    getElementById(id) { return id === 'pirateFruitFrame' ? childFrame : null; },
  };
  const layoutFrame = new FakeElement('sceneFrame');
  layoutFrame.ownerDocument = hostDocument;
  layoutFrame.rect = { left: 0, top: 0, width: 800, height: 600 };
  const windowLike = new EventTarget();
  Object.assign(windowLike, {
    parent: {},
    frameElement: layoutFrame,
    innerWidth: 800,
    innerHeight: 600,
    MutationObserver: FakeMutationObserver,
  });
  Object.assign(globalThis, {
    window: windowLike,
    document: documentLike,
    location: { search: '' },
    MutationObserver: FakeMutationObserver,
  });

  const mod = await import(`../pirate-npc-online-bridge-v900.mjs?parent=${Date.now()}`);
  const bridge = windowLike.POCKETMONSTER_PIRATE_NPC_ONLINE_BRIDGE;
  const stateMessage = () => {
    const event = new Event('message');
    Object.defineProperties(event, {
      source: { value: childWindow },
      origin: { value: 'null' },
      data: { value: {
        type: mod.PIRATE_NPC_ONLINE_MESSAGE,
        kind: 'state',
        active: true,
        label: '💬 คุยกับ กะลาสี',
        x: .5,
        y: .5,
        width: .2,
        height: .1,
      } },
    });
    return event;
  };

  windowLike.dispatchEvent(stateMessage());
  assert.equal(bridge.diagnostics().proxyVisible, false, 'Pocket Monster must not expose Pirate online interaction');

  sceneBody.dataset.combinedWorld = 'pirate-fruit';
  FakeMutationObserver.flush();
  windowLike.dispatchEvent(stateMessage());
  assert.equal(bridge.diagnostics().proxyVisible, true, 'Pirate world gets the online parent touch proxy');
  const proxy = hostBody.children.find(node => node.id === mod.PIRATE_NPC_ONLINE_PROXY_ID);
  proxy.dispatchEvent(new FakePointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  assert.equal(sentToChild.length, 1);
  assert.equal(sentToChild[0].message.kind, 'activate');

  sceneBody.dataset.combinedWorld = 'pocket-monster';
  FakeMutationObserver.flush();
  assert.equal(bridge.diagnostics().proxyVisible, false, 'returning to Pocket Monster removes Pirate proxy immediately');
  bridge.stop();
}

console.log('Pirate online NPC / Monster offline split: PASS');
