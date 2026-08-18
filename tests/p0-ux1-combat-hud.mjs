import assert from 'node:assert/strict';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';
import { createCombatHudViewModel, createPartySlotViewModel } from '../combat-ui-view-model.mjs';

const selected = Object.freeze({ instanceId: 'monster-a', name: 'Aquapuff', hp: 84, maxHp: 84, fainted: false });
const skills = Object.freeze([
  Object.freeze({ name: 'Water Jet', cooldownSeconds: 0 }),
  Object.freeze({ name: 'Mist Shield', cooldownSeconds: 4.04 }),
  null,
]);
const readyInput = Object.freeze({
  zoneIsWild: true,
  activeMonster: null,
  pendingSummon: false,
  selectedMonster: selected,
  captureBalls: 5,
  captureAiming: false,
  summonCooldownSeconds: 0,
  skills,
});
const readyBefore = JSON.stringify(readyInput);
const ready = createCombatHudViewModel(readyInput);
assert.equal(JSON.stringify(readyInput), readyBefore, 'view model must not mutate domain input');
assert.deepEqual(
  [ready.actions.summon.state, ready.actions.recall.state, ready.actions.capture.state],
  ['ready', 'disabled', 'ready'],
  'no-active Wild state must allow Summon/Capture and disable Recall',
);
assert.equal(ready.skills[0].state, 'disabled', 'skills require an Active Monster');
assert.match(ready.skills[0].reason, /เรียกคู่หูก่อน/);

const active = createCombatHudViewModel({ ...readyInput, activeMonster: selected });
assert.equal(active.actions.capture.state, 'disabled');
assert.equal(active.actions.capture.disabled, true);
assert.match(active.actions.capture.reason, /Recall คู่หูก่อน/);
assert.equal(active.actions.summon.state, 'disabled');
assert.match(active.actions.summon.reason, /มีคู่หูในสนามแล้ว/);
assert.equal(active.actions.recall.state, 'ready');
assert.equal(active.skills[0].state, 'ready');
assert.equal(active.skills[1].state, 'cooldown');
assert.equal(active.skills[1].disabled, true);
assert.match(active.skills[1].statusText, /4\.1s/);
assert.match(active.actionReason, /Capture ถูกปิด.*Recall คู่หูก่อน/);

const recalled = createCombatHudViewModel({ ...readyInput, activeMonster: null });
assert.equal(recalled.actions.capture.state, 'ready', 'Capture must become ready after Recall');
assert.match(recalled.actionReason, /พร้อมปาจับ.*ใช้บอล 1 ลูก/, 'post-Recall reason must announce the now-ready Capture action');
const fainted = createCombatHudViewModel({
  ...readyInput,
  selectedMonster: { ...selected, hp: 0, fainted: true },
});
assert.equal(fainted.actions.summon.state, 'disabled');
assert.match(fainted.actions.summon.reason, /Heal ฟรีที่ Ranch\/NPC ก่อน/);
assert.match(fainted.actionReason, /Fainted.*Heal ฟรี/);

const selectedSlot = createPartySlotViewModel({ monster: selected, index: 0, selectedSlot: 0, activeInstanceId: null });
assert.deepEqual(selectedSlot.states, ['selected']);
assert.match(selectedSlot.stateText, /เลือกแล้ว/);
const activeSlot = createPartySlotViewModel({ monster: selected, index: 0, selectedSlot: 0, activeInstanceId: 'monster-a' });
assert.deepEqual(activeSlot.states, ['selected', 'active']);
assert.match(activeSlot.stateText, /กำลังต่อสู้/);
const faintedSlot = createPartySlotViewModel({ monster: { ...selected, hp: 0, fainted: true }, index: 1, selectedSlot: 0, activeInstanceId: null });
assert.deepEqual(faintedSlot.states, ['fainted']);
assert.match(faintedSlot.stateText, /Fainted.*Heal/);
const emptySelectedSlot = createPartySlotViewModel({ monster: null, index: 2, selectedSlot: 2, activeInstanceId: null });
assert.deepEqual(emptySelectedSlot.states, ['selected']);
assert.equal(emptySelectedSlot.ariaPressed, true);
assert.match(emptySelectedSlot.stateText, /เลือกช่องว่างแล้ว/);

assert.doesNotMatch(html, /id="attackBtn"|class="[^"]*\battack\b/, 'player Attack control remains forbidden');
assert.match(js, /function ensureCombatHudSemantics\(/);
for (const semantic of [
  "status.setAttribute('role','group')",
  "status.setAttribute('aria-label','สถานะผู้เล่นและการออกล่า')",
  "reason.setAttribute('role','status')",
  "reason.setAttribute('aria-live','polite')",
  "hpBar.setAttribute('role','progressbar')",
  "party.setAttribute('aria-label','Party 3 ช่อง')",
]) assert.ok(js.includes(semantic), `runtime Combat HUD semantic missing: ${semantic}`);
assert.doesNotMatch(js, /status\.setAttribute\('role','status'\)/, 'interactive topbar must not be a live status region');
assert.match(css, /--touch-min:48px/);
for (const inset of ['top', 'right', 'bottom', 'left']) assert.ok(css.includes(`env(safe-area-inset-${inset})`), `missing safe-area ${inset}`);
for (const selector of ['.party-slot.selected', '.party-slot.active-monster', '.party-slot.fainted-slot']) assert.ok(css.includes(selector), `missing non-color party state: ${selector}`);
assert.match(css, /\.action\{touch-action:none;user-select:none;-webkit-user-select:none\}/, 'multitouch action contract must remain intact');
assert.match(js, /createCombatHudViewModel\(/);
assert.match(js, /createPartySlotViewModel\(/);
assert.match(js, /function setTextIfChanged\(/, 'Combat HUD text should update only when presentation changes');
assert.match(js, /getSkillIcon\(/, 'Skill icon function should exist');

console.log('P0 UX1 Combat HUD contracts: PASS');
