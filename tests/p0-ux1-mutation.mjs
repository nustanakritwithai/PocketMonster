import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../combat-ui-view-model.mjs', import.meta.url), 'utf8');
let serial = 0;

function mutate(needle, replacement, label) {
  assert.ok(source.includes(needle), `${label}: mutation target drifted`);
  return source.replace(needle, replacement);
}

async function importMutant(mutant, label) {
  const encoded = Buffer.from(`${mutant}\n//# sourceURL=${label}-${++serial}.mjs`).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

function presentationProbe(module) {
  const selectedMonster = { instanceId: 'selected', name: 'Aquapuff', hp: 84, maxHp: 84, fainted: false };
  const base = {
    zoneIsWild: true,
    activeMonster: selectedMonster,
    pendingSummon: false,
    selectedMonster,
    captureBalls: 5,
    captureAiming: false,
    summonCooldownSeconds: 0,
    skills: [{ name: 'Jet', cooldownSeconds: 0 }, { name: 'Shield', cooldownSeconds: 4.04 }, null],
  };
  const active = module.createCombatHudViewModel(base);
  assert.equal(active.actions.capture.disabled, true);
  assert.match(active.actions.capture.reason, /Recall/);
  assert.equal(active.skills[1].state, 'cooldown');
  assert.equal(active.skills[1].statusText, 'คูลดาวน์ 4.1s');
  const fainted = module.createCombatHudViewModel({ ...base, activeMonster: null, selectedMonster: { ...selectedMonster, hp: 0, fainted: true } });
  assert.equal(fainted.actions.summon.disabled, true);
  assert.match(fainted.actions.summon.reason, /Heal ฟรี/);
  const slot = module.createPartySlotViewModel({ monster: selectedMonster, index: 0, selectedSlot: 0, activeInstanceId: 'selected' });
  assert.deepEqual(slot.states, ['selected', 'active']);
}

async function expectKilled(label, mutant) {
  const module = await importMutant(mutant, label);
  let killed = false;
  try { presentationProbe(module); } catch { killed = true; }
  assert.equal(killed, true, `${label}: UX1 presentation regression survived the mutant`);
}

presentationProbe(await import('../combat-ui-view-model.mjs'));
await expectKilled(
  'capture-enabled-with-active',
  mutate("if (activeMonster) return disabledAction('Recall คู่หูก่อน');", "if (false && activeMonster) return disabledAction('Recall คู่หูก่อน');", 'capture-enabled-with-active'),
);
await expectKilled(
  'fainted-monster-can-summon',
  mutate("if (selectedMonster?.fainted) return disabledAction('Fainted • Heal ฟรีที่ Ranch/NPC ก่อน');", "if (false && selectedMonster?.fainted) return disabledAction('Fainted • Heal ฟรีที่ Ranch/NPC ก่อน');", 'fainted-monster-can-summon'),
);
await expectKilled(
  'cooldown-rounded-down',
  mutate('Math.ceil(cooldownSeconds * 10) / 10', 'Math.floor(cooldownSeconds * 10) / 10', 'cooldown-rounded-down'),
);
await expectKilled(
  'active-party-state-lost',
  mutate('monster.instanceId === activeInstanceId', 'false && monster.instanceId === activeInstanceId', 'active-party-state-lost'),
);

console.log('P0 UX1 mutation checks: PASS (4/4 killed)');
