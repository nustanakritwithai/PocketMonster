import assert from 'node:assert/strict';
import fs from 'node:fs';

const mobileSource = fs.readFileSync(new URL('../unified-mobile-controls-v900.mjs', import.meta.url), 'utf8');
const hudSource = fs.readFileSync(new URL('../unified-mmorpg-hud-v900.mjs', import.meta.url), 'utf8');
const start = mobileSource.indexOf('const throwMonster = async () => {');
const end = mobileSource.indexOf('\n  const monsterSkillPanel', start);
assert.ok(start >= 0 && end > start);
const throwMonster = new Function('activeWorldId', 'monsterController', 'windowLike', 'documentLike', `return (${mobileSource.slice(start, end).replace(/^const throwMonster = /, '').replace(/;\s*$/, '')})`);

const local = { textContent: '' };
const documentLike = { getElementById(id) { return id === 'actionReason' ? local : null; } };
let shown = null;
const parentHud = { showCommandFailure(value) { shown = value; } };
const pirateWindow = { parent: { POCKETMONSTER_UNIFIED_HUD: parentHud } };
const failure = { ok: false, reason: 'presence-not-ready', code: 'PRESENCE_NOT_READY' };
await throwMonster('pirate-fruit', { snapshot: () => ({ pending: false }), throwHeld: async () => failure }, pirateWindow, documentLike)();
assert.equal(shown.message, 'ปามอนสเตอร์ไม่สำเร็จ: presence-not-ready');
assert.equal(local.textContent, '', 'Pirate uses the visible parent HUD when available');

shown = null;
await throwMonster('pirate-fruit', { snapshot: () => ({ pending: false }), throwHeld: async () => failure }, { parent: {} }, documentLike)();
assert.equal(local.textContent, 'ปามอนสเตอร์ไม่สำเร็จ: presence-not-ready (PRESENCE_NOT_READY)', 'Pirate local fallback keeps the reason code');

local.textContent = '';
await throwMonster('pocket', { snapshot: () => ({ pending: false }), throwHeld: async () => failure }, pirateWindow, documentLike)();
assert.equal(local.textContent, 'ปามอนสเตอร์ไม่สำเร็จ: presence-not-ready', 'Pocket fallback remains unchanged');
assert.match(hudSource, /showCommandFailure,\n\s*\}\);/);

console.log('Pirate throw failure visibility: PASS (parent HUD, local fallback, Pocket unchanged)');
