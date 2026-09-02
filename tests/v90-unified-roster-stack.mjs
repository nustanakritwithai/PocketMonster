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

function partySlots() {
  return Object.freeze([
    Object.freeze({
      id: 'slot-1', slot: 0, available: true, instanceId: 'mon-a', portraitKey: 'mossbun',
      name: 'Mossbun', level: 5, hp: 20, hpMax: 40, condition: 'normal', fainted: false, selected: true, active: true,
    }),
    Object.freeze({
      id: 'slot-2', slot: 1, available: true, instanceId: 'wild-1', portraitKey: 'flameling',
      name: 'Flameling', level: 8, hp: 30, hpMax: 40, condition: 'healthy', fainted: false, selected: false, active: false,
    }),
    Object.freeze({
      id: 'slot-3', slot: 2, available: true, instanceId: 'mon-c', portraitKey: 'tideling',
      name: 'Tidelin', level: 3, hp: 0, hpMax: 25, condition: 'normal', fainted: true, selected: false, active: false,
    }),
  ]);
}

function boot({ party, target, commands = {} } = {}) {
  const document = documentLike();
  const partyFeature = feature(party);
  const windowLike = {
    POCKETMONSTER_PARTY_HUD: Object.assign(partyFeature, {
      selectPartySlot(slot) {
        commands.select = (commands.select || 0) + 1;
        commands.lastSelect = slot;
        return { ok: true };
      },
      openCharacter(slot) {
        commands.open = (commands.open || 0) + 1;
        commands.lastOpen = slot;
        return { ok: true };
      },
    }),
    POCKETMONSTER_POCKET_HUD: {
      player: feature({ revision: 1, available: false, buffs: Object.freeze([]) }),
      target: feature(target),
      actions: feature({ revision: 1, items: Object.freeze([]) }),
      utilities: feature({ revision: 1, items: Object.freeze([]) }),
      banner: feature({ revision: 1, text: '' }),
    },
  };
  const hud = createUnifiedMmorpgHud({ windowLike, documentLike: document });
  hud.mount();
  return { hud, document, windowLike, commands, partyFeature };
}

const css = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');
assert.match(css, /\.mmorpg-roster-row\{[^}]*height:34px/, 'roster rows stay 30-36px');
assert.match(css, /\.mmorpg-roster-row\.placeholder\{[^}]*visibility:hidden/, 'empty Pirate rows keep geometry');
assert.match(css, /\.mmorpg-companion\.selected\{/, 'selected companion ring is distinct');
assert.match(css, /\.mmorpg-companion\.active\{/, 'active/summoned companion ring is distinct');
assert.match(css, /\.mmorpg-companion\.fainted\{/, 'fainted companion ring is distinct');
assert.match(css, /\.mmorpg-companion\.empty\{/, 'unavailable companion ring is distinct');

{
  const { hud, document, commands } = boot({
    party: { revision: 1, available: true, selectedSlot: 0, slots: partySlots() },
    target: {
      revision: 1, available: true, id: 'wild-1', portraitKey: 'https://evil.example/x.png',
      name: 'Flameling', level: 8, hp: 10, hpMax: 40, states: Object.freeze(['burning']),
    },
  });
  const roster = document.getElementById('mmorpgRoster');
  assert.equal(roster.children.length, 3, 'roster is a fixed 3-row stack');
  assert.equal(roster.children[0].classList.contains('target'), true, 'selected combat target is the first row');
  assert.equal(roster.children[0].dataset.rosterKey, 'target:wild-1');
  assert.match(roster.children[0].text(), /Flameling/);
  assert.match(roster.children[0].text(), /Lv\.8/);
  assert.match(roster.children[0].text(), /burning/);
  assert.equal(roster.children[0].classList.contains('danger'), true, 'low HP target uses danger styling');
  const targetIcon = roster.children[0].collect(node => node.classList.contains('mmorpg-roster-icon'))[0];
  assert.equal(targetIcon.textContent, 'F', 'remote target portraits fall back to a sanitized initial');
  const hp = roster.children[0].collect(node => node.getAttribute('role') === 'progressbar')[0];
  assert.equal(hp.getAttribute('aria-valuenow'), '10');
  assert.equal(hp.children[0].style.width, '25%');
  const keys = roster.children.map(row => row.dataset.rosterKey);
  assert.deepEqual(keys, ['target:wild-1', 'party:0', 'party:2'], 'Party rows skip the entity already shown as the target');
  assert.match(roster.children[1].text(), /Mossbun/);
  assert.equal(roster.children[1].classList.contains('selected'), true);
  assert.equal(roster.children[2].classList.contains('danger'), true, 'fainted Party row is danger');
  const companions = document.getElementById('mmorpgCompanions').children;
  assert.equal(companions.length, 3, 'companion stack always has three slots');
  assert.equal(companions[0].classList.contains('selected'), true);
  assert.equal(companions[0].classList.contains('active'), true);
  assert.equal(companions[2].classList.contains('fainted'), true);
  companions[1].dispatch('click');
  assert.equal(commands.select, 1);
  assert.equal(commands.lastSelect, 1, 'portrait click routes selectPartySlot once');
  companions[2].dispatch('contextmenu', { preventDefault() { this.prevented = true; } });
  assert.equal(commands.open, 1);
  assert.equal(commands.lastOpen, 2, 'secondary action opens the existing character panel');
  hud.unmount();
}

{
  const { hud, document } = boot({
    party: { revision: 1, available: false, slots: Object.freeze([]) },
    target: {
      revision: 2, available: true, id: 'pirate-1', portraitKey: 'keel', name: 'Keel',
      level: 12, hp: 80, hpMax: 80, states: Object.freeze([]),
    },
  });
  const roster = document.getElementById('mmorpgRoster');
  assert.equal(roster.children.length, 3, 'Pirate keeps three roster rows');
  assert.equal(roster.children[0].classList.contains('target'), true);
  assert.match(roster.children[0].text(), /Keel/);
  assert.equal(roster.children[1].classList.contains('placeholder'), true);
  assert.equal(roster.children[2].classList.contains('placeholder'), true);
  const companions = document.getElementById('mmorpgCompanions').children;
  assert.equal(companions.length, 3);
  assert.equal(companions.every(node => node.classList.contains('empty')), true, 'Pirate without Party keeps empty companion geometry');
  hud.unmount();
}

{
  const { hud, document } = boot({
    party: { revision: 1, available: false, slots: Object.freeze([]) },
    target: { revision: 1, available: false, id: '', name: '', states: Object.freeze([]) },
  });
  const roster = document.getElementById('mmorpgRoster');
  assert.equal(roster.children.length, 3);
  assert.equal(roster.children.every(row => row.classList.contains('placeholder')), true, 'Living/Pirate with no telemetry still reserve the stack');
  hud.unmount();
}

console.log('V9 unified roster stack: PASS');
