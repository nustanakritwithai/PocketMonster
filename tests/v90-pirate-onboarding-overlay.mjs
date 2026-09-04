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
  projectPirateNpcNameAnchor,
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
assert.match(worldCatalog, /boot-pirate-fruit-v900\.mjs\?v=936/);

// Keep the child bridge intact for standalone Pirate Fruit, but integrated V9
// owns the visible interaction UI through the parent HUD policy.
assert.match(childBridge, /MutationObserver/);
assert.match(childBridge, /\.onboarding-root/);
assert.match(childBridge, /window\.parent\.postMessage\([\s\S]*PIRATE_ONBOARDING_STATE_MESSAGE[\s\S]*allowedParentOrigin/);
assert.match(childBridge, /PIRATE_ONBOARDING_COMPACT_CSS/);
assert.doesNotMatch(childBridge, /pirate-onboarding-local/);

assert.match(parentBoot, /readPirateOnboardingState\(message\)/);
assert.match(parentBoot, /event\.source !== frame\.contentWindow/);
assert.match(parentBoot, /npcNameProxy\?\.accept\(event\)/, 'NPC-name accept runs before the opaque-origin HUD/presence gate');
assert.ok(
  parentBoot.indexOf('npcNameProxy?.accept(event)') < parentBoot.indexOf("if (event.origin !== 'null') return;"),
  'same-origin hosted scene NPC-name posts are accepted before origin===null HUD filtering',
);
assert.match(parentBoot, /parentOrigin: location\.origin/, 'parent proxy trusts the hosted scene origin in addition to opaque null');
assert.match(parentBoot, /event\.origin !== 'null'/);
assert.match(parentBoot, /syncPirateOnboardingActionProxies\(onboarding\)/, 'integrated shell consumes onboarding state without creating tutorial action buttons');
assert.match(parentBoot, /layer\.replaceChildren\(\)/, 'integrated onboarding proxy layer is kept empty');
assert.doesNotMatch(parentBoot, /data-onboarding-action/, 'integrated shell creates no invisible tutorial action buttons');
assert.match(parentBoot, /createPirateNpcNameParentProxy/, 'NPC-name interaction is owned by the dedicated transparent name hit target');
assert.match(parentBoot, /npcNameProxy\?\.accept\(event\)/, 'parent accepts NPC-name hit-target state from the opaque child');
assert.match(
  pirateHud,
  /\.onboarding-root\s*\{[\s\S]*display:\s*none\s*!important/,
  'integrated Pirate HUD still removes the bottom tutorial bar',
);
assert.doesNotMatch(
  pirateHud,
  /\.interaction-prompt\s*\{[\s\S]*display:\s*none/,
  'original Pirate คุยกับ prompt stays visible',
);
assert.match(
  pirateHud,
  /\.interaction-prompt\s*\{[\s\S]*pointer-events:\s*auto/,
  'original Pirate คุยกับ prompt keeps its own hit',
);
assert.match(
  pirateHud,
  /\.interaction-prompt\s*\{[\s\S]*bottom:\s*120px/,
  'original Pirate คุยกับ prompt sits above the chat dock',
);
assert.match(pirateHud, /\.dialogue-root \{[\s\S]*inset: auto/, 'talk window is not a fullscreen overlay');
assert.match(pirateHud, /\.dialogue-card \{[\s\S]*max-height: 28vh/, 'talk card is sized for a phone');
assert.doesNotMatch(parentBoot, /allow-same-origin/, 'nested Pirate Fruit stays in an opaque iframe sandbox');
assert.match(parentBoot, /pirate-npc-name-interaction-v900\.mjs\?v=10/, 'parent cache-busts the NPC-name interaction module');
assert.match(childEntry, /pocket-presentation\.mjs\?v=18/, 'Pirate child HTML cache-busts presentation after the same-origin talk-chip fix');

const presentation = fs.readFileSync(new URL('../pirate-fruit-offline/pocket-presentation.mjs', import.meta.url), 'utf8');
assert.match(presentation, /skipVendorFullscreen/, 'talk taps skip vendor fullscreen without blocking Pirate pointerdown');
assert.doesNotMatch(presentation, /stopImmediatePropagation/, 'talk taps must reach the original Pirate prompt handler');
assert.match(presentation, /PIRATE_FRUIT_DIALOGUE_MESSAGE/, 'child publishes dialogue open so parent HUD can stand down');
assert.match(parentBoot, /pocketmonster:pirate-dialogue-v1/, 'parent lets the talk window sit in front of HUD buttons');
assert.match(presentation, /pirate-npc-name-interaction-v900\.mjs\?v=10/, 'Pirate presentation cache-busts the NPC-name interaction module');

const source = fs.readFileSync(new URL('../pirate-npc-name-interaction-v900.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /prompt\.click\?\.\(\)/);
assert.doesNotMatch(source, /prompt\.click/);
assert.match(source, /pointerdown/);
assert.match(source, /requestOriginalPirateInteraction\(prompt, windowLike\)/, 'child activate uses the original Pirate pointerdown path');
assert.match(source, /prompt\.style\?\.display !== 'block'/, 'prompt name reads inline runtime display, not computed CSS');
assert.doesNotMatch(source, /getComputedStyle/);
assert.doesNotMatch(source, /__combat/, 'child projection must not depend on window.__combat');
assert.match(source, /opacity:\s*'1'/, 'talk chip is fully visible on the projected NPC name');
assert.doesNotMatch(source, /opacity:\s*'0\.01'/);
assert.doesNotMatch(source, /color:\s*'transparent'/);
assert.match(source, /textContent = 'คุย'/, 'relocated talk control shows compact คุย text');
assert.match(source, /zIndex:\s*'80'/, 'คุย chip stacks above the parent camera pad');
assert.match(source, /minHeight:\s*'48px'/, 'คุย chip keeps a 48px touch target');
assert.match(parentBoot, /frameElement\?\.ownerDocument/, 'คุย chip mounts on the hosted scene parent so cameraPad cannot eat the tap');
assert.match(source, /addEventListener\('pointerdown', sendActivate\)/, 'parent hit target activates on pointerdown');
assert.doesNotMatch(parentBoot, /const activateHudTelemetry = reason => \{\s*frameGeneration \+= 1;\s*npcNameProxy\?\.reset\(\);/, 'HUD activate cannot clear the คุย chip');
assert.doesNotMatch(parentBoot, /frame\.addEventListener\('load', \(\) => \{\s*npcNameProxy\?\.reset\(\);/, 'iframe load cannot clear the คุย chip');
assert.match(parentBoot, /event\.detail\?\.world !== 'pirate-fruit'[\s\S]*npcNameProxy\?\.reset\(\)/, 'leaving Pirate still resets the คุย chip');
assert.match(parentBoot, /pagehide[\s\S]*npcNameProxy\?\.reset\(\)/, 'pagehide still resets the คุย chip');
assert.match(source, /serialized === lastSerialized && !rounded\.active/, 'identical active คุย state is re-posted after a parent reset');

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
  const proxy = createPirateNpcNameParentProxy({
    frame,
    documentLike,
    parentOrigin: 'https://nustanakritwithai.github.io',
  });
  assert.ok(proxy, 'parent hit-target proxy mounts');
  const activeState = { type: PIRATE_NPC_NAME_MESSAGE, kind: 'state', active: true, name: 'หัวหน้ามะลิ', x: 0.5, y: 0.4, width: 0.2, height: 0.1 };
  assert.equal(proxy.accept({
    source: frameWindow,
    origin: 'null',
    data: activeState,
  }), true, 'accept() trusts opaque sandbox origin null');
  assert.equal(proxy.accept({
    source: {},
    origin: 'https://nustanakritwithai.github.io',
    data: activeState,
  }), false, 'accept() still requires event.source === frame.contentWindow');
  assert.equal(proxy.accept({
    source: frameWindow,
    origin: 'https://evil.example',
    data: activeState,
  }), false, 'accept() rejects a foreign non-null origin');
  assert.equal(proxy.accept({
    source: frameWindow,
    origin: 'https://nustanakritwithai.github.io',
    data: activeState,
  }), true, 'accept() trusts the hosted scene/parent origin when source is the pirate frame');
  const button = nodes.get(PIRATE_NPC_NAME_PROXY_ID);
  assert.ok(button, 'visible talk chip exists on the projected NPC name');
  assert.equal(button.style.display, 'block');
  assert.equal(button.textContent, 'คุย');
  assert.equal(button.attributes.get('aria-label'), 'คุยกับ หัวหน้ามะลิ');
  assert.equal(button.style.zIndex, '80');
  assert.equal(button.style.opacity, '1');
  assert.notEqual(button.style.opacity, '0');
  assert.notEqual(button.style.opacity, '0.01');
  assert.notEqual(button.style.color, 'transparent');
  assert.equal(button.style.pointerEvents, 'auto');
  button.dispatchEvent(new FakePointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }));
  assert.deepEqual(posted, [{
    message: { type: PIRATE_NPC_NAME_MESSAGE, kind: 'activate', name: 'หัวหน้ามะลิ' },
    origin: '*',
  }], 'parent proxy pointerdown posts activate');
  assert.equal(proxy.accept({
    source: frameWindow,
    origin: 'null',
    data: { type: PIRATE_NPC_NAME_MESSAGE, kind: 'state', active: false },
  }), true);
  assert.equal(button.style.display, 'none', 'inactive proxy stays hidden');
  proxy.destroy();
}

{
  const posted = [];
  const frameWindow = {
    postMessage(message, origin) { posted.push({ message, origin }); },
  };
  const pirateFrame = {
    contentWindow: frameWindow,
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 450 }; },
  };
  const layoutFrame = {
    getBoundingClientRect() { return { left: 120, top: 40, width: 800, height: 450 }; },
  };
  const nodes = new Map();
  const body = new FakeNode('body');
  const hostDocument = {
    body,
    getElementById: id => nodes.get(id) || null,
    createElement(tag) {
      const el = new FakeNode(tag);
      el.registry = nodes;
      return el;
    },
  };
  const proxy = createPirateNpcNameParentProxy({
    frame: pirateFrame,
    documentLike: hostDocument,
    layoutFrame,
    parentOrigin: 'https://nustanakritwithai.github.io',
  });
  assert.equal(proxy.accept({
    source: frameWindow,
    origin: 'null',
    data: { type: PIRATE_NPC_NAME_MESSAGE, kind: 'state', active: true, name: 'หัวหน้ามะลิ', x: 0.25, y: 0.2, width: 0.2, height: 0.1 },
  }), true);
  const button = nodes.get(PIRATE_NPC_NAME_PROXY_ID);
  assert.ok(button, 'hosted parent still owns the same คุย proxy id');
  assert.equal(button.style.left, '320px', 'chip left follows the scene iframe plus NPC x, not the player');
  assert.equal(button.style.top, '130px', 'chip top follows the scene iframe plus NPC y, not the player');
  assert.equal(Number(button.style.zIndex) >= 80, true, 'chip sits above cameraPad z-index 1 inside HUD z-index 20');
  button.dispatchEvent(new FakePointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }));
  assert.equal(posted[0]?.message?.kind, 'activate');
  proxy.destroy();
}

function installChild(prompt, parentOrigin = 'https://example.test', { pirateHud = 'pirate-primary-parent' } = {}) {
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
    documentElement: { dataset: pirateHud ? { pirateHud } : {} },
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

function projectingCameraPosition() {
  return {
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
}

function createSpecializedCtor(flag) {
  class Specialized {
    constructor() {
      this.children = [];
      this.parent = null;
      this.position = { x: 0, y: 0, z: 0 };
      this[flag] = true;
    }
    updateMatrixWorld() {}
    traverse() {}
    add() {}
  }
  Specialized.prototype[flag] = true;
  return Specialized;
}

function installCapturedSceneChild(prompt, {
  withSprite = true,
  pirateHud = 'pirate-primary-parent',
  groupName = '',
  nested = false,
  cameraZ = 2,
  spriteWidth = 384,
  spriteHeight = 96,
  spriteY = 3.55,
  threeWorldPosition = false,
} = {}) {
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
  class Scene {
    constructor() {
      this.isScene = true;
      this.children = [];
      this.position = { x: 0, y: 0, z: 0 };
      this.visible = true;
      this.parent = null;
    }
    updateMatrixWorld() {}
  }
  const Camera = createSpecializedCtor('isCamera');
  const Mesh = createSpecializedCtor('isMesh');
  const Group = createSpecializedCtor('isGroup');
  const windowLike = new EventTarget();
  windowLike.parent = {};
  windowLike.innerWidth = 800;
  windowLike.innerHeight = 450;
  windowLike.setInterval = () => 0;
  windowLike.clearInterval = () => {};
  windowLike.PointerEvent = FakePointerEvent;
  windowLike.Event = Event;
  windowLike.__combat = { attacking: false };
  const documentLike = {
    documentElement: { dataset: pirateHud ? { pirateHud } : {} },
    querySelector: selector => (selector === '.interaction-prompt' ? prompt : null),
  };
  const child = installPirateNpcNameChild({
    three: { Camera, Mesh, Group, Object3D, Scene },
    windowLike,
    documentLike,
    parentOrigin: 'https://example.test',
    intervalMs: 10_000,
  });
  const scene = new Scene();
  if (withSprite) {
    const sprite = {
      isSprite: true,
      material: { map: { image: { width: spriteWidth, height: spriteHeight } } },
      position: { y: spriteY },
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
    if (threeWorldPosition) {
      npcGroup.getWorldPosition = function getWorldPosition(target) {
        if (typeof target?.setFromMatrixPosition !== 'function') {
          throw new TypeError('THREE.Object3D.getWorldPosition requires a Vector3');
        }
        target.x = this.position.x;
        target.y = this.position.y;
        target.z = this.position.z;
        return target;
      };
    }
    if (groupName) npcGroup.name = groupName;
    if (nested) {
      const world = new Object3D();
      world.position = { x: 0, y: 0, z: 0 };
      world.children = [npcGroup];
      scene.children = [world];
    } else {
      scene.children = [npcGroup];
    }
  }
  scene.updateMatrixWorld();
  const camera = new Object3D();
  camera.isCamera = true;
  camera.parent = null;
  camera.position = projectingCameraPosition();
  camera.position.z = cameraZ;
  camera.updateMatrixWorld();
  return { child, windowLike };
}

{
  const prompt = createPrompt('หัวหน้ามะลิ');
  const { child } = installCapturedSceneChild(prompt, { withSprite: true });
  const state = child.sync();
  assert.equal(state.active, true, 'captured isScene still finds NPC name sprites when the camera is not parented');
  assert.equal(state.name, 'หัวหน้ามะลิ');
  assert.equal(state.x, 0.5, 'projected name x comes from the captured scene sprite');
  assert.equal(state.y, 0.4, 'projected name y comes from the captured scene sprite, not the fallback');
  child.stop();
}

{
  const prompt = createPrompt('หัวหน้ามะลิ');
  const { child } = installCapturedSceneChild(prompt, { withSprite: false });
  const state = child.sync();
  assert.equal(state.active, true, 'in-range prompt still posts a visible talk chip when projection has no sprite');
  assert.equal(state.name, 'หัวหน้ามะลิ');
  assert.equal(state.x, 0.5);
  assert.equal(state.y, 0.32);
  assert.ok(state.width > 0 && state.width <= 0.5, 'fallback chip width stays inside the parent proxy contract');
  assert.ok(state.height > 0 && state.height <= 0.3, 'fallback chip height stays inside the parent proxy contract');
  child.stop();
}


{
  const prompt = createPrompt('หัวหน้ามะลิ');
  const { child } = installChild(prompt, 'https://example.test', { pirateHud: '' });
  assert.equal(child.sync().active, true, 'parentOrigin enables integrated sync before dataset.pirateHud is set');
  assert.equal(child.currentName(), 'หัวหน้ามะลิ');
  child.stop();
}

{
  const prompt = createPrompt('หัวหน้ามะลิ');
  prompt.style.display = 'none';
  const { child } = installCapturedSceneChild(prompt, { withSprite: true, pirateHud: '', groupName: 'หลิน' });
  const state = child.sync();
  assert.equal(state.active, true, 'nearest projected name sprite still posts the talk chip when the prompt is hidden');
  assert.equal(state.name, 'หลิน');
  assert.equal(state.x, 0.5);
  assert.equal(state.y, 0.4);
  child.stop();
}

{
  const prompt = createPrompt('หัวหน้ามะลิ');
  prompt.style.display = 'none';
  const { child, windowLike } = installCapturedSceneChild(prompt, { withSprite: true, pirateHud: '', groupName: 'เถ้าแก่เปา' });
  assert.equal(child.sync().active, true);
  assert.equal(child.currentName(), 'เถ้าแก่เปา');
  activate(windowLike, { name: 'เถ้าแก่เปา' });
  assert.equal(prompt.pointerdowns, 1, 'activate still pointerdowns the original prompt when present');
  assert.equal(prompt.clickCount, 0, 'activate still does not click the original prompt');
  child.stop();
}

{
  const prompt = createPrompt('หัวหน้ามะลิ');
  prompt.style.display = 'none';
  const { child } = installCapturedSceneChild(prompt, { withSprite: false, pirateHud: '' });
  assert.equal(child.sync().active, false, 'chip stays hidden when inactive: no in-range prompt and no nearby name sprite');
  child.stop();
}

{
  const prompt = createPrompt('หัวหน้ามะลิ');
  prompt.style.display = 'none';
  const { child } = installCapturedSceneChild(prompt, {
    withSprite: true,
    pirateHud: '',
    groupName: 'หลิน',
    nested: true,
    cameraZ: 8,
  });
  const state = child.sync();
  assert.equal(state.active, true, 'nested name sprite still posts when the prompt is hidden and the camera sits behind the player');
  assert.equal(state.name, 'หลิน');
  child.stop();
}

{
  const prompt = createPrompt('หัวหน้ามะลิ');
  prompt.style.display = 'none';
  const { child } = installCapturedSceneChild(prompt, {
    withSprite: true,
    pirateHud: '',
    groupName: 'หัวหน้ามะลิ',
    nested: true,
    cameraZ: 8,
    spriteWidth: 256,
    spriteHeight: 64,
    spriteY: 2.2,
  });
  const state = child.sync();
  assert.equal(state.active, true, 'live Pirate name plates are not 384x96 at y=3.55');
  assert.equal(state.name, 'หัวหน้ามะลิ');
  child.stop();
}

{
  const prompt = createPrompt('หัวหน้ามะลิ');
  prompt.style.display = 'none';
  const { child } = installCapturedSceneChild(prompt, {
    withSprite: true,
    pirateHud: '',
    groupName: 'หัวหน้ามะลิ',
    nested: true,
    cameraZ: 8,
    threeWorldPosition: true,
  });
  const state = child.sync();
  assert.equal(state.active, true, 'live THREE.Sprite name plates require Vector3.getWorldPosition, not a plain {x,y,z}');
  assert.equal(state.name, 'หัวหน้ามะลิ');
  child.stop();
}

{
  const camera = {
    position: { x: 2, y: 1.6, z: 8 },
    updateMatrixWorld() {},
  };
  camera.position.clone = function cloneCameraPoint() {
    return {
      x: this.x,
      y: this.y,
      z: this.z,
      project() {
        this.x = (this.x - 2) / 20;
        this.y = (this.y - 1.6) / 8;
        this.z = 0;
        return this;
      },
    };
  };
  const group = {
    position: { x: 12, y: 0, z: 8 },
    getWorldPosition(target) {
      if (typeof target?.setFromMatrixPosition !== 'function') {
        throw new TypeError('THREE.Object3D.getWorldPosition requires a Vector3');
      }
      target.x = 12;
      target.y = 0;
      target.z = 8;
      return target;
    },
  };
  const sprite = {
    position: { y: 3.55 },
    parent: group,
    getWorldPosition(target) {
      if (typeof target?.setFromMatrixPosition !== 'function') {
        throw new TypeError('THREE.Object3D.getWorldPosition requires a Vector3');
      }
      target.x = 12;
      target.y = 3.55;
      target.z = 8;
      return target;
    },
  };
  let projected = null;
  try {
    projected = projectPirateNpcNameAnchor({
      sprite,
      camera,
      vectorSeed: camera.position,
      width: 800,
      height: 450,
      group,
    });
  } catch {
    projected = null;
  }
  assert.ok(projected, 'NPC name still projects when live getWorldPosition requires a Vector3');
  assert.equal(projected.x, 0.75, 'คุย chip follows the NPC world x, not the camera/player center');
  assert.notEqual(projected.x, 0.5, 'คุย chip must not sit under the local player');
}

console.log('V9 Pirate onboarding retirement bridge: PASS');
