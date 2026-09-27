import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bindMonsterControlScene } from '../monster-control-scene-binding-v900.mjs';

const mobileSource = fs.readFileSync(new URL('../unified-mobile-controls-v900.mjs', import.meta.url), 'utf8');
const hudSource = fs.readFileSync(new URL('../unified-mmorpg-hud-v900.mjs', import.meta.url), 'utf8');
const skillStart = mobileSource.indexOf('const reportSkillFailure = result => {');
const skillEnd = mobileSource.indexOf('\n  const monsterSkillPanel', skillStart);
assert.ok(skillStart >= 0 && skillEnd > skillStart);
const useMonsterSkill = new Function('activeWorldId', 'monsterController', 'windowLike', 'documentLike', `${mobileSource.slice(skillStart, skillEnd)}; return useMonsterSkill;`);

class FakeButton extends EventTarget {
  constructor(id) {
    super();
    this.id = id;
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
    this.attributes = new Map();
    this.title = '';
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function exerciseThrow({ world = 'pirate-fruit', snapshot, result, rejected = false, hud = true } = {}) {
  const button = new FakeButton('monsterThrowBtn');
  const local = { textContent: '' };
  const documentLike = {
    body: { dataset: { combinedWorld: world } },
    getElementById(id) { return id === 'monsterThrowBtn' ? button : id === 'actionReason' ? local : null; },
  };
  const shown = [];
  const sceneWindow = new EventTarget();
  sceneWindow.document = documentLike;
  sceneWindow.POCKETMONSTER_UNIFIED_MOBILE_CONTROLS = {
    setMonsterController() {},
    diagnostics: () => ({ pirateControlMode: 'player' }),
  };
  if (hud) sceneWindow.parent = { POCKETMONSTER_UNIFIED_HUD: { showCommandFailure(value, context) { shown.push({ value, context }); } } };
  const calls = [];
  const controller = {
    snapshot: () => snapshot,
    subscribe(listener) { listener(snapshot); return () => {}; },
    throwHeld: async () => {
      calls.push('throw');
      if (rejected) throw new Error('private transport detail');
      return result;
    },
    recallActive: async () => {
      calls.push('recall');
      if (rejected) throw new Error('private transport detail');
      return result;
    },
  };
  const detach = bindMonsterControlScene({ sceneWindow, controller });
  const click = new Event('click', { cancelable: true });
  Object.defineProperty(click, 'detail', { value: 0 });
  button.dispatchEvent(click);
  await tick();
  detach();
  return { button, local, shown, calls };
}

const failure = { ok: false, reason: 'presence-not-ready', code: 'PRESENCE_NOT_READY' };
const heldSnapshot = { pending: false, held: { instanceId: 'held-1' }, slots: [], capabilities: {} };
const failedThrow = await exerciseThrow({ snapshot: heldSnapshot, result: failure });
assert.deepEqual(failedThrow.calls, ['throw']);
assert.equal(failedThrow.shown[0].value.message, 'ปามอนสเตอร์ไม่สำเร็จ: presence-not-ready');
assert.deepEqual(failedThrow.shown[0].context, { monsterCommand: true });
assert.equal(failedThrow.local.textContent, 'ปามอนสเตอร์ไม่สำเร็จ: presence-not-ready (PRESENCE_NOT_READY)');

const noHud = await exerciseThrow({ snapshot: heldSnapshot, result: failure, hud: false });
assert.equal(noHud.local.textContent, 'ปามอนสเตอร์ไม่สำเร็จ: presence-not-ready (PRESENCE_NOT_READY)', 'local fallback retains provider reason');

const pocket = await exerciseThrow({ world: 'pocket', snapshot: heldSnapshot, result: failure });
assert.deepEqual(pocket.calls, ['throw'], 'Pocket continues using its existing held-monster throw action');
assert.equal(pocket.local.textContent, 'ปามอนสเตอร์ไม่สำเร็จ: presence-not-ready (PRESENCE_NOT_READY)');

const pending = await exerciseThrow({
  snapshot: { pending: true, pendingKind: 'summon', held: null, slots: [], capabilities: {} },
  result: failure,
});
assert.deepEqual(pending.calls, []);
assert.equal(pending.button.getAttribute('aria-label'), 'กำลังเรียกมอนสเตอร์');

const rejected = await exerciseThrow({ snapshot: heldSnapshot, rejected: true, hud: false });
assert.equal(rejected.local.textContent, 'ปามอนสเตอร์ไม่สำเร็จ: control-error (CONTROL_ERROR)');
assert.doesNotMatch(rejected.local.textContent, /private transport detail/);

const recalled = await exerciseThrow({
  snapshot: {
    pending: false,
    held: null,
    slots: [{ available: true, active: true, instanceId: 'active-1', name: 'Moss' }],
    capabilities: { recall: true },
  },
  result: failure,
});
assert.equal(recalled.button.getAttribute('data-pirate-icon'), 'Recall');
assert.deepEqual(recalled.calls, ['recall']);
assert.equal(recalled.shown[0].value.message, 'เก็บมอนสเตอร์ไม่สำเร็จ: presence-not-ready');
assert.equal(recalled.local.textContent, 'เก็บมอนสเตอร์ไม่สำเร็จ: presence-not-ready (PRESENCE_NOT_READY)');
assert.match(hudSource, /showCommandFailure,\n\s*\}\);/);

const local = { textContent: '' };
const documentLike = { getElementById(id) { return id === 'actionReason' ? local : null; } };
let shown = null;
const parentHud = { showCommandFailure(value) { shown = value; } };
const pirateWindow = { parent: { POCKETMONSTER_UNIFIED_HUD: parentHud } };
const skillFailure = { ok: false, reason: 'actor-inactive', code: 'ACTOR_INACTIVE' };
await useMonsterSkill('pirate-fruit', { useSkill: async () => skillFailure }, pirateWindow, documentLike)(0);
assert.equal(shown.message, 'ใช้สกิลมอนสเตอร์ไม่สำเร็จ: actor-inactive');
assert.equal(local.textContent, 'ใช้สกิลมอนสเตอร์ไม่สำเร็จ: actor-inactive (ACTOR_INACTIVE)');

shown = null;
local.textContent = '';
await useMonsterSkill('pirate-fruit', { useSkill: async () => { throw new Error('transport'); } }, pirateWindow, documentLike)(0);
assert.equal(shown.message, 'ใช้สกิลมอนสเตอร์ไม่สำเร็จ: control-error');
assert.equal(local.textContent, 'ใช้สกิลมอนสเตอร์ไม่สำเร็จ: control-error (CONTROL_ERROR)');

shown = null;
local.textContent = '';
await useMonsterSkill('pirate-fruit', { useSkill: async () => ({ ok: true, accepted: true }) }, pirateWindow, documentLike)(0);
assert.equal(shown, null, 'accepted skill must not show failure');
assert.equal(local.textContent, '');

console.log('Pirate throw failure visibility: PASS (scene binding, Recall, parent HUD, local fallback, Pocket unchanged)');
