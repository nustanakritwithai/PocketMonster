import assert from 'node:assert/strict';
import { createMonsterControlController, MONSTER_COMMAND_CONTRACT } from '../monster-control-controller-v900.mjs';

let actors = [];
const calls = [];
const party = { available: true, slots: [{ slot: 0, available: true, instanceId: 'mon-a' }] };
const commands = {
  async summon(command) {
    calls.push(command);
    actors = [{ instanceId: command.instanceId, slot: command.slot }];
    return { ok: true, code: 'accepted' };
  },
  async skill(command) { calls.push(command); return { ok: true, code: 'accepted' }; },
};
const controller = createMonsterControlController({ commands, getParty: () => party, getConfirmedActors: () => actors, getZone: () => 'pirate-fruit' });

const first = await controller.activateSlot(0);
assert.equal(first.reason, 'summon-confirmed');
assert.equal(calls[0].contract, MONSTER_COMMAND_CONTRACT);
assert.equal(calls[0].kind, 'summon');
assert.equal(controller.snapshot().mode, 'character');

const skillBeforeToggle = await controller.useSkill(0, { skillId: 'skill-a' });
assert.equal(skillBeforeToggle.ok, false);
assert.equal(skillBeforeToggle.reason, 'character-panel-active');

const opened = await controller.activateSlot(0);
assert.equal(opened.mode, 'monster');
const skill = await controller.useSkill(0, { skillId: 'skill-a', targetActorId: 'wild-1' });
assert.equal(skill.ok, true);
assert.equal(calls[1].kind, 'skill');
assert.equal(calls[1].targetActorId, 'wild-1');

const closed = await controller.activateSlot(0);
assert.equal(closed.mode, 'character');
assert.equal((await controller.useSkill(0)).reason, 'character-panel-active');
console.log('V9 monster control controller: PASS');
