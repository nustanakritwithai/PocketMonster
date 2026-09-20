import assert from 'node:assert/strict';
import fs from 'node:fs';

const mobileSource = fs.readFileSync(new URL('../unified-mobile-controls-v900.mjs', import.meta.url), 'utf8');
const hudSource = fs.readFileSync(new URL('../unified-mmorpg-hud-v900.mjs', import.meta.url), 'utf8');
const start = mobileSource.indexOf('const reportThrowFailure = result => {');
const end = mobileSource.indexOf('\n  const monsterSkillPanel', start);
assert.ok(start >= 0 && end > start);
const throwMonster = new Function('activeWorldId', 'monsterController', 'windowLike', 'documentLike', `${mobileSource.slice(start, end)}; return throwMonster;`);
const skillStart = mobileSource.indexOf('const reportSkillFailure = result => {');
const skillEnd = mobileSource.indexOf('\n  const throwMonster = async () => {', skillStart);
assert.ok(skillStart >= 0 && skillEnd > skillStart);
const useMonsterSkill = new Function('activeWorldId', 'monsterController', 'windowLike', 'documentLike', `${mobileSource.slice(skillStart, skillEnd)}; return useMonsterSkill;`);

const local = { textContent: '' };
const documentLike = { getElementById(id) { return id === 'actionReason' ? local : null; } };
let shown = null;
const parentHud = { showCommandFailure(value) { shown = value; } };
const pirateWindow = { parent: { POCKETMONSTER_UNIFIED_HUD: parentHud } };
const failure = { ok: false, reason: 'presence-not-ready', code: 'PRESENCE_NOT_READY' };
await throwMonster('pirate-fruit', { snapshot: () => ({ pending: false }), throwHeld: async () => failure }, pirateWindow, documentLike)();
assert.equal(shown.message, 'ปามอนสเตอร์ไม่สำเร็จ: presence-not-ready');
assert.equal(local.textContent, 'ปามอนสเตอร์ไม่สำเร็จ: presence-not-ready (PRESENCE_NOT_READY)', 'Pirate also leaves a local status for hidden HUD layouts');

shown = null;
await throwMonster('pirate-fruit', { snapshot: () => ({ pending: false }), throwHeld: async () => failure }, { parent: {} }, documentLike)();
assert.equal(local.textContent, 'ปามอนสเตอร์ไม่สำเร็จ: presence-not-ready (PRESENCE_NOT_READY)', 'Pirate local fallback keeps the reason code');

local.textContent = '';
await throwMonster('pocket', { snapshot: () => ({ pending: false }), throwHeld: async () => failure }, pirateWindow, documentLike)();
assert.equal(local.textContent, 'ปามอนสเตอร์ไม่สำเร็จ: presence-not-ready (PRESENCE_NOT_READY)', 'Pocket fallback keeps the provider code');
local.textContent = '';
await throwMonster('pirate-fruit', { snapshot: () => ({ pending: true }), throwHeld: async () => failure }, { parent: {} }, documentLike)();
assert.equal(local.textContent, 'ปามอนสเตอร์ไม่สำเร็จ: summon-pending (SUMMON_PENDING)');
local.textContent = '';
await throwMonster('pirate-fruit', { snapshot: () => ({ pending: false }), throwHeld: async () => { throw new Error('transport'); } }, { parent: {} }, documentLike)();
assert.equal(local.textContent, 'ปามอนสเตอร์ไม่สำเร็จ: control-error (CONTROL_ERROR)');
assert.match(hudSource, /showCommandFailure,\n\s*\}\);/);

shown = null;
local.textContent = '';
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

console.log('Pirate throw failure visibility: PASS (parent HUD, local fallback, Pocket unchanged)');
