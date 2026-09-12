import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../unified-mmorpg-hud-v900.mjs', import.meta.url), 'utf8');

function extract(name, next) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`\n  }\n\n  function ${next}`, start);
  assert.ok(start >= 0 && end > start, `${name} must remain present`);
  return source.slice(start, end + 4);
}

class Button {
  constructor() {
    this.dataset = { held: 'true' };
    this.attributes = new Map([['aria-pressed', 'true']]);
    this.listeners = new Map();
    this.classList = { toggle() {} };
    this.textContent = 'old';
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
}

function documentWith(buttons, world) {
  return {
    body: { dataset: { combinedWorld: world } },
    defaultView: null,
    getElementById(id) { return buttons[id] || null; },
  };
}

const sceneButtons = {
  monsterSlot1Btn: new Button(),
  monsterSlot2Btn: new Button(),
  monsterSlot3Btn: new Button(),
};
let sceneActivations = 0;
sceneButtons.monsterSlot1Btn.addEventListener('click', () => { sceneActivations += 1; });
const sceneWindow = { POCKETMONSTER_MONSTER_CONTROL_CONTROLLER: null };
const sceneDocument = documentWith(sceneButtons, 'pirate-fruit');
sceneDocument.defaultView = sceneWindow;
const parentButtons = { monsterSlot1Btn: new Button() };
const parentDocument = documentWith(parentButtons, '');
const frame = { contentWindow: sceneWindow };
parentDocument.getElementById = id => id === 'onlineWorldSceneFrame' ? frame : parentButtons[id] || null;

const party = {
  snapshot: () => ({
    held: { index: 0, instanceId: 'mon-a' },
    capabilities: { recall: false },
    pending: false,
    controlPanel: { mode: 'character', slot: null },
  }),
};
sceneWindow.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER = party;
const slots = [
  { slot: 0, available: true, instanceId: 'mon-a', name: 'Mossbun', portraitKey: 'mossbun', level: 5, hp: 2, hpMax: 5, active: true, selected: false, fainted: false },
  { slot: 1, available: false, name: '', active: false, selected: false, fainted: false },
  { slot: 2, available: false, name: '', active: false, selected: false, fainted: false },
];
const body = new Function('documentLike', 'pirateWorldActive', 'sceneDocument', 'partyAdapter', 'rosterGlyph', `return (${extract('paintOverlayMonsterSlots', 'renderParty')})`)(
  parentDocument,
  () => true,
  () => sceneDocument,
  () => party,
  entity => entity?.available === true ? String(entity.name || '?').slice(0, 1).toUpperCase() : '?',
);
body(slots);

assert.equal(sceneButtons.monsterSlot1Btn.textContent, 'M');
assert.equal(sceneButtons.monsterSlot1Btn.getAttribute('data-pirate-icon'), 'M\nMossbun');
assert.equal(sceneButtons.monsterSlot1Btn.getAttribute('aria-pressed'), 'true', 'HUD preserves scene held state');
assert.equal(sceneButtons.monsterSlot1Btn.dataset.held, 'true', 'HUD preserves scene held dataset');
assert.equal(parentButtons.monsterSlot1Btn.textContent, 'old', 'Pirate HUD paints scene buttons, not parent duplicates');
assert.equal(sceneButtons.monsterSlot1Btn.listeners.get('click').length, 1, 'HUD does not add a second scene activation listener');
sceneButtons.monsterSlot1Btn.dispatch('click', { preventDefault() {}, stopPropagation() {} });
assert.equal(sceneActivations, 1, 'scene slot click activates once');

assert.match(source, /buildRosterEntries\(snapshot, \{ includeParty: !pirateActive \}\)/);
assert.match(source, /if \(companions && !pirateActive\)/);
assert.match(source, /if \(partyPanel && !pirateActive\)/);

console.log('Pirate HUD canonical scene slots: PASS (scene paint, held state, no duplicate click, target roster)');

// ตรวจ HUD ที่ export จริงร่วมกับ scene binding และ controller จริง
import { createUnifiedMmorpgHud } from '../unified-mmorpg-hud-v900.mjs';
import { createMonsterControlController } from '../monster-control-controller-v900.mjs';
import { bindMonsterControlScene } from '../monster-control-scene-binding-v900.mjs';
class Node {
  constructor(tag = 'div', id = '') { this.tagName = tag; this.id = id; this.children = []; this.parentNode = null; this.dataset = {}; this.style = {}; this.attributes = new Map(); this.listeners = new Map(); this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false; const set = new Set(); this.classList = { add: (...x) => x.forEach(v => set.add(v)), remove: (...x) => x.forEach(v => set.delete(v)), contains: v => set.has(v), toggle: (v, force) => { const on = force === undefined ? !set.has(v) : force; on ? set.add(v) : set.delete(v); return on; } }; }
  append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) ?? null; }
  addEventListener(k, fn) { const list = this.listeners.get(k) || []; list.push(fn); this.listeners.set(k, list); }
  removeAttribute(k) { this.attributes.delete(k); }
  removeEventListener() {}
  dispatch(k, event = {}) { for (const fn of this.listeners.get(k) || []) fn(event); }
  byId(id) { if (this.id === id) return this; for (const child of this.children) { const found = child.byId?.(id); if (found) return found; } return null; }
  querySelector(selector) { return selector.startsWith('#') ? this.byId(selector.slice(1)) : null; }
}
function feature(snapshot) { return { snapshot: () => snapshot, subscribe(fn) { fn(snapshot); return () => {}; } }; }

const realParentDoc = { body: new Node('body'), createElement: tag => new Node(tag), getElementById(id) { return this.body.byId(id); }, querySelector() { return null; }, addEventListener() {}, removeEventListener() {} };
const realSceneDoc = { ...realParentDoc, body: new Node('body') };
realSceneDoc.body.dataset.combinedWorld = 'pirate-fruit';
const realScene = { document: realSceneDoc };
realSceneDoc.defaultView = realScene;
const realFrame = new Node('iframe', 'onlineWorldSceneFrame');
realFrame.contentWindow = realScene;
realParentDoc.body.append(realFrame);
const originalButtons = [1,2,3].map(i => new Node('button', `monsterSlot${i}Btn`));
realSceneDoc.body.append(...originalButtons);
let realSlots = [{slot:0, available:true, instanceId:'owned:one', name:'Alpha', icon:'🐾'}];
const realController = createMonsterControlController({
 commands: {summon(){throw new Error('ไม่ควรปาระหว่างเลือกช่อง');},skill(){throw new Error('ไม่ควรใช้สกิลระหว่างเลือกช่อง');}}, getParty: () => ({available:true, slots:realSlots}),
 getZone: () => 'pirate-fruit', getCapabilities: () => ({}),
 getConfirmedActors: () => [], getSkills: () => [],
});
const unbind = bindMonsterControlScene({sceneWindow:realScene, controller:realController});
const realWindow = new EventTarget();
realWindow.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER = realController;
realWindow.POCKETMONSTER_CHAT_RUNTIME = {chat:feature({revision:1,channels:['WORLD'],rows:[],status:'connected',unread:0,canSend:false})};
realWindow.POCKETMONSTER_QUEST_HUD = feature({revision:1,available:false,steps:[]});
realWindow.POCKETMONSTER_POCKET_HUD = {resetAll(){}, player:feature({revision:1}),target:feature({revision:1,available:true,id:'enemy:1',name:'Enemy',hp:10,hpMax:10}),actions:feature({revision:1,items:[]}),utilities:feature({revision:1,items:[]}),banner:feature({revision:1})};
const realHud = createUnifiedMmorpgHud({windowLike:realWindow,documentLike:realParentDoc,monsterController:realController});
realHud.mount();
assert.match(originalButtons[0].getAttribute('data-pirate-icon'), /Alpha/);
assert.equal(realParentDoc.getElementById('mmorpgCompanions').children.length,0);
assert.deepEqual(realParentDoc.getElementById('mmorpgPartyPanel').children.map(n=>n.id),['monsterRecallBtn']);
assert.equal(realParentDoc.getElementById('mmorpgRoster').children.length,1);
assert.equal(realParentDoc.getElementById('mmorpgRoster').children[0].dataset.rosterKey,'target:enemy:1');
assert.equal(originalButtons[0].listeners.get('click').length,1,'HUD ไม่เพิ่ม click ทับ scene binding จริง');
originalButtons[0].dispatch('pointerdown',{button:0,preventDefault(){},stopImmediatePropagation(){}});
assert.equal(realController.snapshot().held?.instanceId,'owned:one');
assert.equal(originalButtons[0].getAttribute('aria-pressed'),'true');
realSlots = [{slot:0,available:true,instanceId:'owned:two',name:'Beta',icon:'🐾'}];
realController.sync();
assert.match(originalButtons[0].getAttribute('data-pirate-icon'),/Beta/,'เปลี่ยนมอนแล้วปุ่มเดิมอัปเดตทันที');
assert.equal(realSceneDoc.getElementById('monsterSlot1Btn'),originalButtons[0]);
realHud.unmount(); unbind();
console.log('Exported Pirate HUD + real scene controller: PASS (original slots, immediate refresh, no duplicate views)');
