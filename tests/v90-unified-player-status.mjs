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
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.listeners = new Map();
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
  collect(match, found = []) {
    if (match(this)) found.push(this);
    for (const child of this.children) child.collect?.(match, found);
    return found;
  }
}

function documentLike() {
  const body = new FakeNode('body');
  return {
    body,
    createElement: tag => new FakeNode(tag),
    getElementById: id => body.byId(id),
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

function boot(player, actions) {
  const document = documentLike();
  const windowLike = {
    POCKETMONSTER_POCKET_HUD: {
      player: feature(player),
      actions: feature(actions),
      target: feature({ revision: 1, available: false }),
      utilities: feature({ revision: 1, items: Object.freeze([]) }),
      banner: feature({ revision: 1, text: '' }),
    },
  };
  const hud = createUnifiedMmorpgHud({ windowLike, documentLike: document });
  hud.mount();
  return { hud, document, windowLike };
}

function eightBuffs() {
  return Object.freeze(Array.from({ length: 8 }, (_, index) => Object.freeze({
    id: `buff-${index}`, label: `B${index}`, visualKey: `b${index}`, description: `desc ${index}`, expiresAt: index,
  })));
}

const css = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');
assert.match(css, /\.mmorpg-player-portrait/, 'portrait slot is styled');
assert.match(css, /\.mmorpg-bar-fill/, 'HP/resource fill is width-clamped visually');
assert.match(css, /\.mmorpg-player-status\{[^}]*display:flex/, 'player status packs portrait beside vitals');
assert.match(css, /\.mmorpg-player-status\{[^}]*flex-wrap:nowrap/, 'player status cannot wrap out of the golden box');
assert.match(css, /\.mmorpg-player-body\{[^}]*flex-direction:column/, 'name then long tubes sit beside the portrait');
assert.match(css, /\.mmorpg-player-vitals\{[^}]*flex-direction:column/, 'HP MP energy are long tubes stacked beside the portrait');
assert.match(css, /\.mmorpg-player-vital\{[^}]*width:100%/, 'each tube fills the remaining slot width');
assert.match(css, /\.mmorpg-player-vital\{[^}]*height:6px/, 'vital tubes stay short enough to fit the golden slot');
assert.doesNotMatch(css, /\.mmorpg-player-status\{height:22%/, 'the golden slot stays short; tubes are long not tall');
assert.match(css, /\.mmorpg-player-energy\[role="progressbar"\]/, 'energy is a third vital bar');
assert.doesNotMatch(css, /\.mmorpg-player-hp-text[^}]*clear:both/, 'HP text cannot clear below the portrait');
assert.match(css, /\.mmorpg-quick-indicators\{[^}]*left:50%/, 'quick indicators sit top-center');
assert.match(css, /\.mmorpg-quick-indicator\{[^}]*pointer-events:none/, 'quick indicators do not eat game input');

{
  const { hud, document } = boot({
    revision: 1, available: false, displayName: '', hp: 100, hpMax: 100, resource: 100, resourceMax: 100,
    buffs: Object.freeze([]),
  }, { revision: 1, items: Object.freeze([]) });
  const panel = document.getElementById('mmorpgPlayerStatus');
  assert.equal(panel.classList.contains('skeleton'), true, 'unavailable Pocket player uses skeleton state');
  assert.match(panel.text(), /กำลังเชื่อมต่อ/, 'unavailable state is a connection label');
  assert.doesNotMatch(panel.text(), /100\/100/, 'unavailable player cannot show fake 100/100');
  hud.unmount();
}

{
  const { hud, document } = boot({
    revision: 1, available: true, portraitKey: 'https://evil.example/x.png', displayName: 'Keeper', title: 'ผู้ดูแล',
    level: 12, hp: 20, hpMax: 50, resourceKind: 'balls', resource: 1, resourceMax: 4, modeLabel: 'Grass Meadow',
    modePercent: 40, buffs: eightBuffs(),
  }, {
    revision: 1,
    items: Object.freeze([
      Object.freeze({ id: 'capture', label: 'ปาจับ', enabled: true, pressed: true, state: 'selected', cooldownRemaining: 0, cooldownTotal: 0 }),
      Object.freeze({ id: 'summon', label: 'ปาเรียก', enabled: false, pressed: false, state: 'unavailable', cooldownRemaining: 0, cooldownTotal: 0 }),
      Object.freeze({ id: 'skill-1', label: 'S1 Fire', enabled: true, pressed: false, state: 'ready', cooldownRemaining: 2, cooldownTotal: 4 }),
      Object.freeze({ id: 'skill-2', label: 'S2 Ice', enabled: true, pressed: false, state: 'ready', cooldownRemaining: 0, cooldownTotal: 0 }),
      Object.freeze({ id: 'skill-3', label: 'S3 Wind', enabled: true, pressed: false, state: 'ready', cooldownRemaining: 0, cooldownTotal: 0 }),
      Object.freeze({ id: 'skill-4', label: 'S4 Hidden', enabled: true, pressed: false, state: 'ready', cooldownRemaining: 0, cooldownTotal: 0 }),
    ]),
  });
  const panel = document.getElementById('mmorpgPlayerStatus');
  assert.equal(panel.classList.contains('skeleton'), false);
  assert.match(panel.text(), /Keeper/, 'name renders');
  assert.match(panel.text(), /Lv\.12/, 'level badge renders');
  assert.match(panel.text(), /ผู้ดูแล/, 'title renders');
  assert.match(panel.text(), /HP 20\/50/, 'HP current\/max stays in text');
  assert.match(panel.text(), /balls 1\/4/, 'resource current\/max stays in text');
  assert.match(panel.text(), /Grass Meadow 40%/, 'mode row includes percent');
  const portrait = panel.collect(node => node.classList.contains('mmorpg-player-portrait'))[0];
  assert.equal(portrait.textContent, 'K', 'remote portrait URLs fall back to a sanitized initial');
  const hp = panel.collect(node => node.getAttribute('role') === 'progressbar' && node.getAttribute('aria-label') === 'HP')[0];
  assert.equal(hp.getAttribute('aria-valuemin'), '0');
  assert.equal(hp.getAttribute('aria-valuemax'), '50');
  assert.equal(hp.getAttribute('aria-valuenow'), '20');
  assert.equal(hp.children[0].style.width, '40%', 'HP fill clamps visually without mutating the snapshot');
  const energy = panel.collect(node => node.classList.contains('mmorpg-player-energy'))[0];
  assert.equal(energy.getAttribute('role'), 'progressbar');
  assert.equal(energy.children[0].style.width, '40%', 'energy fill follows modePercent');
  assert.equal(panel.collect(node => node.classList.contains('mmorpg-player-body')).length, 1, 'vitals sit beside the portrait');
  assert.equal(panel.collect(node => node.classList.contains('mmorpg-player-vital')).length, 3, 'HP MP energy stay three long tubes after the name');
  assert.equal(panel.collect(node => node.classList.contains('mmorpg-player-vitals')).length, 1, 'tubes are grouped after identity');
  const buffs = document.getElementById('mmorpgBuffRow').children;
  assert.equal(buffs.length, 8, 'seven buffs plus overflow');
  assert.equal(buffs[7].textContent, '+1');
  assert.ok(buffs[0].getAttribute('aria-label'), 'buffs expose accessible detail');
  const indicators = document.getElementById('mmorpgQuickIndicators').children;
  assert.equal(indicators.length, 5, 'only the first five actions become top-center indicators');
  assert.equal(indicators[0].classList.contains('selected'), true);
  assert.equal(indicators[1].classList.contains('disabled'), true);
  assert.equal(indicators[2].classList.contains('cooling'), true);
  assert.equal(indicators.some(node => (node.listeners.get('click') || []).length > 0), false, 'indicators have no new action handlers');
  hud.unmount();
}

for (const world of ['pirate-fruit', 'living-world']) {
  const { hud, document } = boot({
    revision: 1, available: false, displayName: world, hp: 0, hpMax: 0, buffs: Object.freeze([]),
  }, { revision: 1, items: Object.freeze([]) });
  const panel = document.getElementById('mmorpgPlayerStatus');
  assert.equal(panel.classList.contains('skeleton'), true, `${world} unavailable player is skeleton`);
  assert.doesNotMatch(panel.text(), /100\/100/);
  hud.unmount();
}

console.log('V9 unified player status: PASS');
