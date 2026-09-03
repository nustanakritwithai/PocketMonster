import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PIRATE_ONBOARDING_COMPACT_CSS,
  PIRATE_ONBOARDING_STATE_MESSAGE,
  readPirateOnboardingState,
} from '../pirate-onboarding-overlay-v900.mjs';
import {
  PIRATE_NPC_NAME_MESSAGE,
  PIRATE_NPC_NAME_PROXY_ID,
  createPirateNpcNameParentProxy,
  installPirateNpcNameChild,
  readPirateNpcPromptName,
  requestOriginalPirateInteraction,
} from '../pirate-npc-name-interaction-v900.mjs';

assert.equal(PIRATE_ONBOARDING_STATE_MESSAGE, 'pocketmonster:pirate-onboarding-state-v1');
assert.deepEqual(
  readPirateOnboardingState({ type: PIRATE_ONBOARDING_STATE_MESSAGE, active: true }),
  { active: true, actions: {} },
);
assert.deepEqual(
  readPirateOnboardingState({ type: PIRATE_ONBOARDING_STATE_MESSAGE, active: false }),
  { active: false, actions: {} },
);
assert.deepEqual(
  readPirateOnboardingState({
    type: PIRATE_ONBOARDING_STATE_MESSAGE,
    active: true,
    actions: { pause: { x: 350, y: 350, width: 40, height: 24 } },
  }),
  { active: true, actions: { pause: { x: 350, y: 350, width: 40, height: 24 } } },
);
assert.equal(readPirateOnboardingState({
  type: PIRATE_ONBOARDING_STATE_MESSAGE,
  active: true,
  actions: { pause: { x: 'bad', y: 350, width: 40, height: 24 } },
}), null);
assert.equal(readPirateOnboardingState({ type: PIRATE_ONBOARDING_STATE_MESSAGE, active: 'yes' }), null);
assert.equal(readPirateOnboardingState({ type: 'other', active: true }), null);

// Standalone Pirate Fruit may still use the compact tutorial presentation.
assert.match(PIRATE_ONBOARDING_COMPACT_CSS, /max-height:\s*500px/);
assert.match(PIRATE_ONBOARDING_COMPACT_CSS, /pointer:\s*coarse/);
assert.match(PIRATE_ONBOARDING_COMPACT_CSS, /\.onboarding-root\s*\{[^}]*width:\s*min\(260px/);
assert.match(PIRATE_ONBOARDING_COMPACT_CSS, /\.onboarding-body\s*\{[^}]*-webkit-line-clamp:\s*1/);
assert.match(PIRATE_ONBOARDING_COMPACT_CSS, /\.onboarding-card\s*\{[^}]*padding:\s*5px 7px/);

const childBridge = fs.readFileSync(new URL('../pirate-fruit-offline/unified-input-bridge-v900.mjs', import.meta.url), 'utf8');
const childEntry = fs.readFileSync(new URL('../pirate-fruit-offline/index.html', import.meta.url), 'utf8');
const parentBoot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const worldCatalog = fs.readFileSync(new URL('../combined-worlds-v900.mjs', import.meta.url), 'utf8');
const pirateHud = fs.readFileSync(new URL('../pirate-fruit-control-hud-v900.mjs', import.meta.url), 'utf8');

assert.match(childEntry, /unified-input-bridge-v900\.mjs\?v=5/);
assert.match(worldCatalog, /boot-pirate-fruit-v900\.mjs\?v=925/);

// Keep the child bridge intact for standalone Pirate Fruit, but integrated V9
// owns the visible interaction UI through the parent HUD policy.
assert.match(childBridge, /MutationObserver/);
assert.match(childBridge, /\.onboarding-root/);
assert.match(childBridge, /window\.parent\.postMessage\([\s\S]*PIRATE_ONBOARDING_STATE_MESSAGE[\s\S]*allowedParentOrigin/);
assert.match(childBridge, /PIRATE_ONBOARDING_COMPACT_CSS/);
assert.doesNotMatch(childBridge, /pirate-onboarding-local/);

assert.match(parentBoot, /readPirateOnboardingState\(message\)/);
assert.match(parentBoot, /event\.source !== frame\.contentWindow \|\| event\.origin !== 'null'/);
assert.match(parentBoot, /syncPirateOnboardingActionProxies\(onboarding\)/, 'integrated shell consumes onboarding state without creating tutorial action buttons');
assert.match(parentBoot, /layer\.replaceChildren\(\)/, 'integrated onboarding proxy layer is kept empty');
assert.doesNotMatch(parentBoot, /data-onboarding-action/, 'integrated shell creates no invisible tutorial action buttons');
assert.match(parentBoot, /createPirateNpcNameParentProxy/, 'NPC-name interaction is owned by the dedicated transparent name hit target');
assert.match(parentBoot, /npcNameProxy\?\.accept\(event\)/, 'parent accepts NPC-name hit-target state from the opaque child');
assert.match(
  pirateHud,
  /\.onboarding-root,[\s\S]*\.interaction-prompt\s*\{[\s\S]*display:\s*none\s*!important/,
  'integrated Pirate HUD removes both the bottom tutorial bar and bottom interaction prompt',
);
assert.doesNotMatch(parentBoot, /allow-same-origin/, 'nested Pirate Fruit stays in an opaque iframe sandbox');
assert.match(parentBoot, /pirate-npc-name-interaction-v900\.mjs\?v=3/, 'parent cache-busts the NPC-name interaction module');
assert.match(childEntry, /pocket-presentation\.mjs\?v=8/, 'Pirate child HTML cache-busts presentation after the pointerdown fix');

const presentation = fs.readFileSync(new URL('../pirate-fruit-offline/pocket-presentation.mjs', import.meta.url), 'utf8');
assert.match(presentation, /pirate-npc-name-interaction-v900\.mjs\?v=3/, 'Pirate presentation cache-busts the NPC-name interaction module');

const source = fs.readFileSync(new URL('../pirate-npc-name-interaction-v900.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /prompt\.click\?\.\(\)/);
assert.doesNotMatch(source, /prompt\.click/);
assert.match(source, /pointerdown/);
assert.match(source, /requestOriginalPirateInteraction\(prompt, windowLike\)/, 'child activate uses the original Pirate pointerdown path');
assert.match(source, /prompt\.style\?\.display !== 'block'/, 'prompt name reads inline runtime display, not computed CSS');
assert.doesNotMatch(source, /getComputedStyle/);
assert.doesNotMatch(source, /__combat/, 'child projection must not depend on window.__combat');
assert.match(source, /opacity:\s*'0\.01'/, 'parent overlay stays slightly opaque so Safari can receive taps');
assert.doesNotMatch(source, /opacity:\s*'0'/);
assert.match(source, /addEventListener\('pointerdown', sendActivate\)/, 'parent hit target activates on pointerdown');

const pirateBundle = fs.readFileSync(new URL('../pirate-fruit-offline/assets/index-C3SJLfq8.js', import.meta.url), 'utf8');
assert.match(
  pirateBundle,
  /className="interaction-prompt",this\.element\.type="button",this\.element\.addEventListener\("pointerdown",t=>\{t\.preventDefault\(\),this\.requested=!0\}\)/,
  'original Pirate prompt only sets requested=true on pointerdown',
);
assert.match(
  pirateBundle,
  /this\.input\.consumeInteract\(\)\|\|this\.prompt\.consumeRequested\(\)/,
  'original NPC dialogue opens from consumeInteract or consumeRequested',
);

class FakeNode extends EventTarget {
  constructor(tag = 'div') {
    super();
    this.tagName = String(tag).toUpperCase();
    this._id = '';
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.textContent = '';
    this.attributes = new Map();
    this.clickCount = 0;
    this.registry = null;
  }
  get id() { return this._id; }
  set id(value) {
    this._id = value;
    if (this.registry && value) this.registry.set(value, this);
  }
  appendChild(child) { this.children.push(child); return child; }
  remove() { this.registry?.delete(this._id); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  click() {
    this.clickCount += 1;
    this.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
  }
}

class FakePointerEvent extends Event {
  constructor(type, init = {}) {
    super(type, init);
    this.pointerType = init.pointerType || '';
    this.isPrimary = init.isPrimary === true;
  }
}

function createPrompt(name = 'หัวหน้ามะลิ') {
  const strong = { textContent: name };
  const prompt = new FakeNode('button');
  prompt.style.display = 'block';
  prompt.textContent = `คุยกับ ${name}`;
  prompt.querySelectorAll = selector => (selector === 'strong' ? [strong] : []);
  prompt.requested = false;
  prompt.pointerdowns = 0;
  prompt.addEventListener('pointerdown', () => {
    prompt.pointerdowns += 1;
    prompt.requested = true;
  });
  prompt.addEventListener('click', () => {
    prompt.clickCount += 1;
  });
  return prompt;
}

{
  const hidden = createPrompt('หัวหน้ามะลิ');
  hidden.style.display = 'none';
  assert.equal(readPirateNpcPromptName(hidden), '', 'inline display:none keeps the original prompt logically inactive');
  hidden.style.display = 'block';
  assert.equal(readPirateNpcPromptName(hidden), 'หัวหน้ามะลิ', 'inline display:block is the runtime owner even if CSS hides the prompt');
}

{
  const prompt = createPrompt('เถ้าแก่เปา');
  assert.equal(requestOriginalPirateInteraction(prompt, { PointerEvent: FakePointerEvent, Event }), true);
  assert.equal(prompt.pointerdowns, 1, 'helper delivers pointerdown to the original prompt');
  assert.equal(prompt.requested, true, 'fake original prompt sets requested=true on pointerdown');
  assert.equal(prompt.clickCount, 0, 'helper does not synthesize a click');
}

{
  const posted = [];
  const frameWindow = {
    postMessage(message, origin) { posted.push({ message, origin }); },
  };
  const frame = {
    contentWindow: frameWindow,
    getBoundingClientRect() { return { left: 40, top: 10, width: 800, height: 450 }; },
  };
  const nodes = new Map();
  const body = new FakeNode('body');
  const documentLike = {
    body,
    getElementById: id => nodes.get(id) || null,
    createElement(tag) {
      const el = new FakeNode(tag);
      el.registry = nodes;
      return el;
    },
  };
  const proxy = createPirateNpcNameParentProxy({ frame, documentLike });
  assert.ok(proxy, 'parent hit-target proxy mounts');
  assert.equal(proxy.accept({
    source: frameWindow,
    origin: 'null',
    data: { type: PIRATE_NPC_NAME_MESSAGE, kind: 'state', active: true, name: 'หัวหน้ามะลิ', x: 0.5, y: 0.4, width: 0.2, height: 0.1 },
  }), true);
  const button = nodes.get(PIRATE_NPC_NAME_PROXY_ID);
  assert.ok(button, 'transparent name hit target exists');
  assert.equal(button.style.display, 'block');
  assert.equal(button.attributes.get('aria-label'), 'คุยกับ หัวหน้ามะลิ');
  assert.equal(button.style.zIndex, '40');
  assert.equal(button.style.opacity, '0.01');
  assert.notEqual(button.style.opacity, '0', 'Safari does not hit-test opacity 0 overlays');
  button.dispatchEvent(new FakePointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }));
  assert.deepEqual(posted, [{
    message: { type: PIRATE_NPC_NAME_MESSAGE, kind: 'activate', name: 'หัวหน้ามะลิ' },
    origin: '*',
  }], 'parent proxy pointerdown posts activate');
  proxy.destroy();
}

function installChild(prompt, parentOrigin = 'https://example.test') {
  class Object3D {
    constructor() {
      this.children = [];
      this.position = { x: 0, y: 0, z: 0 };
      this.visible = true;
      this.parent = null;
    }
    updateMatrixWorld() {}
    traverse() {}
    add() {}
  }
  const windowLike = new EventTarget();
  windowLike.parent = {};
  windowLike.innerWidth = 800;
  windowLike.innerHeight = 450;
  windowLike.setInterval = () => 0;
  windowLike.clearInterval = () => {};
  windowLike.PointerEvent = FakePointerEvent;
  windowLike.Event = Event;
  // Live window.__combat is the attack HUD, not the Pirate scene/player.
  windowLike.__combat = { attacking: false };
  const sprite = {
    isSprite: true,
    material: { map: { image: { width: 384, height: 96 } } },
    position: { y: 3.55 },
    getWorldPosition(point) {
      point.x = 0;
      point.y = 0;
      point.z = 0;
      return point;
    },
  };
  const npcGroup = new Object3D();
  npcGroup.children = [sprite];
  npcGroup.position = { x: 2, y: 0, z: 2 };
  const scene = new Object3D();
  scene.children = [npcGroup];
  const documentLike = {
    documentElement: { dataset: { pirateHud: 'pirate-primary-parent' } },
    querySelector: selector => (selector === '.interaction-prompt' ? prompt : null),
  };
  const child = installPirateNpcNameChild({
    three: { Object3D },
    windowLike,
    documentLike,
    parentOrigin,
    intervalMs: 10_000,
  });
  const camera = new Object3D();
  camera.isCamera = true;
  camera.parent = scene;
  camera.position = {
    x: 2,
    y: 1.6,
    z: 2,
    clone() {
      return {
        x: 0,
        y: 0,
        z: 0,
        project() {
          this.x = 0;
          this.y = 0.2;
          this.z = 0;
          return this;
        },
      };
    },
  };
  camera.updateMatrixWorld();
  assert.equal(windowLike.__combat?.controller, undefined, 'sync must not need combat.controller');
  assert.equal(child.sync().active, true, 'in-range NPC name projection is active without window.__combat.controller');
  assert.equal(child.currentName(), 'หัวหน้ามะลิ');
  return { child, windowLike };
}

function activate(windowLike, { origin, source, name } = {}) {
  const event = new Event('message');
  Object.defineProperties(event, {
    origin: { value: origin ?? 'https://example.test' },
    source: { value: source ?? windowLike.parent },
    data: { value: { type: PIRATE_NPC_NAME_MESSAGE, kind: 'activate', name: name ?? 'หัวหน้ามะลิ' } },
  });
  windowLike.dispatchEvent(event);
}

{
  const prompt = createPrompt('หัวหน้ามะลิ');
  const { child, windowLike } = installChild(prompt);
  activate(windowLike, { origin: 'https://evil.example' });
  activate(windowLike, { source: {} });
  activate(windowLike, { name: 'เถ้าแก่เปา' });
  assert.equal(prompt.pointerdowns, 0, 'child rejects wrong origin, source, or name');
  assert.equal(prompt.requested, false);
  activate(windowLike);
  assert.equal(prompt.pointerdowns, 1, 'correct activation dispatches pointerdown');
  assert.equal(prompt.requested, true, 'original-style pointerdown listener sets requested=true');
  assert.equal(prompt.clickCount, 0, 'correct activation does not dispatch click');
  child.stop();
}

console.log('V9 Pirate onboarding retirement bridge: PASS');
