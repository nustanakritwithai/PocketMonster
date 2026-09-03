import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  UNIFIED_MOBILE_CONTROLS_KIND,
  createUnifiedMobileControls,
} from '../unified-mobile-controls-v900.mjs';

const css = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const versioned = fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8');
const controlsSource = fs.readFileSync(new URL('../unified-mobile-controls-v900.mjs', import.meta.url), 'utf8');

assert.equal(html, versioned, 'active and versioned entries keep one combat arc');
assert.match(html, /class="controls-right tc-actions mmorpg-combat-arc"/, 'the existing action cluster is the combat arc');
for (const id of ['captureBtn', 'summonBtn', 'recallBtn', 'skill1Btn', 'skill2Btn', 'skill3Btn', 'skill4Btn', 'pirateBlockBtn', 'pirateWeaponBtn', 'piratePotion1Btn', 'piratePotion2Btn']) {
  assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} exists once`);
}

assert.match(css, /#pirateUnifiedControls\{[^}]*--arc-primary:72px/, 'primary center size is a CSS variable');
assert.match(css, /#pirateUnifiedControls\{[^}]*--arc-r:60px/, 'skill polar radius is a CSS variable');
assert.match(css, /#pirateUnifiedControls \.tc-btn\{[^}]*min-width:48px[^}]*min-height:48px/, 'transparent hit rect is at least 48px');
assert.doesNotMatch(css, /\.controls-right\.tc-actions\{[^}]*transform:scale\(/, 'the action cluster cannot use parent transform:scale()');
assert.doesNotMatch(css, /@media\(max-height:420px\)\{[^}]*\.tc-actions\{[^}]*transform:scale\(/, 'compact tier cannot scale the whole arc');
assert.match(css, /\.tc-btn\.cooling::before\{[^}]*conic-gradient/, 'cooldown uses a radial mask');
assert.match(css, /#pirateOnboardingActionProxies\{[^}]*pointer-events:none/, 'onboarding proxies stay overlay-only');
assert.doesNotMatch(css, /#pirateUnifiedControls\[data-pirate-onboarding/, 'onboarding cannot hide or disable the whole arc');
assert.match(css, /#pirateUnifiedControls\[data-control-mode="travel"\] \.controls-right\{display:none/, 'Living World hides the unsupported action cluster');
assert.match(css, /#pirateUnifiedControls\[data-control-mode="capture"\] \.pirate-only/, 'Pocket hides Pirate-only actions instead of duplicating buttons');
assert.match(css, /#skill1Btn\.tc-skill1\{[^}]*right:4px!important;bottom:114px/, 'skill 1 remains the fixed arc start');
assert.match(css, /#skill2Btn\.tc-skill2\{[^}]*right:77px!important;bottom:130px/, 'skill 2 is redistributed between fixed endpoints');
assert.match(css, /#skill3Btn\.tc-skill3\{[^}]*right:129px!important;bottom:76px/, 'skill 3 is redistributed between fixed endpoints');
assert.match(css, /#skill4Btn\.tc-ult\{[^}]*right:118px!important;bottom:2px/, 'ultimate remains the fixed arc end');
assert.match(css, /@media\(max-height:420px\) and \(pointer:coarse\)\{[\s\S]*#skill1Btn\.tc-skill1\{[^}]*bottom:calc\(var\(--arc-bottom\) \+ var\(--arc-primary\)\)/, 'short coarse phones seat skill 1 on the attack top edge');
assert.match(css, /@media\(max-height:420px\) and \(pointer:coarse\)\{[\s\S]*#skill2Btn\.tc-skill2\{[^}]*right:72px!important;bottom:120px/, 'short coarse phones keep equal skill-2 chord on the packed arc');
assert.match(css, /@media\(max-height:420px\) and \(pointer:coarse\)\{[\s\S]*#skill3Btn\.tc-skill3\{[^}]*right:120px!important;bottom:70px/, 'short coarse phones keep equal skill-3 chord on the packed arc');
assert.match(css, /@media\(max-height:420px\) and \(pointer:coarse\)\{[\s\S]*#skill4Btn\.tc-ult\{[^}]*right:calc\(var\(--arc-right\) \+ var\(--arc-primary\)\)/, 'short coarse phones seat ultimate on the attack left edge');

assert.match(css, /#piratePotion2Btn\.tc-potion2\{[^}]*right:224px!important;bottom:88px/, 'desktop item 2 stays on the combat cluster');
assert.match(css, /@media\(max-width:700px\)\{[\s\S]*#piratePotion2Btn\.tc-potion2\{left:8px!important;right:auto!important;bottom:88px/, 'narrow phones pin item 2 to the bottom-left, clear of the chat dock');

function box(right, bottom, size) {
  return { x1: right, y1: bottom, x2: right + size, y2: bottom + size };
}
function center(rect) {
  return { x: (rect.x1 + rect.x2) / 2, y: (rect.y1 + rect.y2) / 2 };
}
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const y = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  return x * y;
}
const boxes = {
  capture: box(42, 42, 72),
  summon: box(2, 44, 36),
  recall: box(44, 2, 36),
  skill1: box(4, 114, 48),
  skill2: box(77, 130, 48),
  skill3: box(129, 76, 48),
  skill4: box(118, 2, 48),
  block: box(172, 132, 48),
  potion1: box(224, 148, 48),
  potion2: box(224, 88, 48),
};
const skillCenters = ['skill1', 'skill2', 'skill3', 'skill4'].map(name => center(boxes[name]));
const skillDistances = skillCenters.slice(0, -1).map((point, index) => distance(point, skillCenters[index + 1]));
assert.ok(Math.max(...skillDistances) - Math.min(...skillDistances) <= 0.3, `skill center spacing must stay equal within 0.3px; got ${skillDistances.map(value => value.toFixed(2)).join(', ')}`);
assert.ok(skillDistances.every(value => value > 74 && value < 76), 'equalized skill spacing stays near the intended 75px chord');
const names = Object.keys(boxes);
for (let i = 0; i < names.length; i += 1) {
  for (let j = i + 1; j < names.length; j += 1) {
    const area = overlapArea(boxes[names[i]], boxes[names[j]]);
    assert.ok(area <= 4, `${names[i]} vs ${names[j]} hit overlap ${area}px² exceeds 4px tolerance`);
  }
}

class FakeTarget extends EventTarget {
  constructor(id = '') {
    super();
    this.id = id;
    this.style = { setProperty() {}, removeProperty() {} };
    this.dataset = {};
    this.capturedPointers = new Set();
    this.attributes = new Map();
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
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  setPointerCapture(pointerId) { this.capturedPointers.add(pointerId); }
  releasePointerCapture(pointerId) { this.capturedPointers.delete(pointerId); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
}

function pointer(type, pointerId) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: 0 },
    clientY: { value: 0 },
  });
  return event;
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

const ids = ['pirateUnifiedControls', 'joystick', 'stick', 'pirateJoyKnob', 'cameraPad', 'skill1Btn', 'skill2Btn', 'skill3Btn', 'skill4Btn', 'captureBtn', 'summonBtn', 'recallBtn', 'pirateBlockBtn', 'pirateWeaponBtn', 'piratePotion1Btn', 'piratePotion2Btn', 'pirateZoomInBtn', 'pirateZoomOutBtn'];
const elements = new Map(ids.map(id => [id, new FakeTarget(id)]));
const windowLike = new FakeTarget('window');
const documentLike = new FakeTarget('document');
documentLike.visibilityState = 'visible';
documentLike.body = new FakeTarget('body');
documentLike.getElementById = id => elements.get(id) || null;
const actions = feature({
  revision: 1,
  items: Object.freeze([
    Object.freeze({ id: 'capture', enabled: true, pressed: true, count: 2, cooldownRemaining: 0, cooldownTotal: 0, state: 'ready' }),
    Object.freeze({ id: 'skill-1', enabled: true, pressed: false, count: 0, cooldownRemaining: 1.2, cooldownTotal: 4, state: 'cooldown' }),
    Object.freeze({ id: 'summon', enabled: false, pressed: false, reason: 'Party ช่องนี้ว่าง', cooldownRemaining: 0, cooldownTotal: 0, state: 'unavailable' }),
  ]),
});
windowLike.POCKETMONSTER_POCKET_HUD = { actions };

const controls = createUnifiedMobileControls({ windowLike, documentLike });
assert.equal(controls.kind, UNIFIED_MOBILE_CONTROLS_KIND);
const calls = [];
controls.registerAdapter('pocket-monster', {
  interceptActions: true,
  action: payload => calls.push(payload),
});
controls.activate('pocket-monster');
assert.equal(elements.get('captureBtn').classList.contains('pressed'), true);
assert.equal(elements.get('captureBtn').getAttribute('data-count'), '2');
assert.equal(elements.get('skill1Btn').classList.contains('cooling'), true);
assert.equal(elements.get('skill1Btn').getAttribute('data-cd'), '2');
assert.equal(elements.get('summonBtn').classList.contains('unavailable'), true);
assert.equal(elements.get('summonBtn').getAttribute('data-reason'), 'Party ช่องนี้ว่าง');
assert.equal(elements.get('recallBtn').classList.contains('empty'), true, 'unsupported Living/Pocket slots stay empty without a second control');

const down = pointer('pointerdown', 7);
const up = pointer('pointerup', 7);
elements.get('captureBtn').dispatchEvent(down);
elements.get('captureBtn').dispatchEvent(up);
assert.equal(down.defaultPrevented, true);
assert.deepEqual(calls.map(payload => [payload.action, payload.phase]), [['capture', 'start'], ['capture', 'end']]);

assert.equal((controlsSource.match(/addEventListener\('pointerdown'/g) || []).length, 1, 'visual-state subscription cannot add a second pointer owner');

console.log('V9 unified combat arc: PASS');
