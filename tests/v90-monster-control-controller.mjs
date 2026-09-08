import assert from 'node:assert/strict';
import { createMonsterControlController, MONSTER_COMMAND_CONTRACT } from '../monster-control-controller-v900.mjs';
import { createMonsterCommandAdapter } from '../monster-command-adapter.mjs';

let zone = 'pirate-fruit';
let actors = [];
const party = { available: true, slots: [{ slot: 0, available: true, instanceId: 'mon-a' }] };
const sent = [];
let skillState = [{ skillId: 'skill-a' }];
const adapter = createMonsterCommandAdapter({ getZone: () => zone, send: async command => { sent.push(command); if (zone === 'pirate-fruit') actors = [{ instanceId: command.instanceId, zone, active: true }]; return { ok: true, accepted: true, code: 'ACCEPTED', commandId: command.commandId }; } });
const controller = createMonsterControlController({ commands: adapter, getParty: () => party, getZone: () => zone, getAim: () => ({ x: 1, y: 0, z: 2 }), getConfirmedActors: () => actors, getSkills: id => id === 'mon-a' ? skillState : [] });

const first = await controller.activatePartySlot(0);
assert.equal(first.reason, 'summon-confirmed');
assert.equal(sent[0].contract, MONSTER_COMMAND_CONTRACT);
assert.equal(sent[0].kind, 'summon');
assert.ok(sent[0].commandId);
assert.deepEqual(sent[0].targetPoint, { x: 1, y: 0, z: 2 });
assert.equal(controller.snapshot().controlPanel.mode, 'character');
assert.equal((await controller.useSkill(0)).reason, 'character-panel-active');

assert.equal((await controller.activateSlot(0)).mode, 'monster');
skillState = [{ skillId: 'skill-a', cooldownRemainingMs: 2500 }];
assert.equal((await controller.useSkill(0)).reason, 'skill-unavailable');
skillState = [{ skillId: 'skill-a' }];
const skill = await controller.useSkill(0, { targetActorId: 'wild-1', targetPoint: { x: 3, y: 0, z: 4 } });
assert.equal(skill.ok, true);
assert.equal(sent[1].kind, 'skill');
assert.equal(sent[1].skillId, 'skill-a');
assert.equal(sent[1].targetActorId, 'wild-1');

zone = 'living-world';
controller.sync();
assert.equal(controller.snapshot().controlPanel.mode, 'character');
assert.equal(controller.snapshot().instanceId, null);
actors = [];
assert.equal((await controller.activateSlot(0)).reason, 'awaiting-snapshot');
const sendCount = sent.length;
assert.equal((await controller.activateSlot(0)).reason, 'summon-pending');
assert.equal(sent.length, sendCount, 'ACK before snapshot cannot trigger another summon');
actors = [{ instanceId: 'mon-a', zone, active: true }];
controller.sync();
assert.equal(controller.snapshot().controlPanel.mode, 'character', 'late spawn confirmation keeps character panel');
assert.equal((await controller.activateSlot(0)).mode, 'monster', 'confirmed snapshot makes button a toggle');
controller.reset();
assert.equal(controller.snapshot().controlPanel.mode, 'character');

let switchActors = [{ instanceId: 'mon-a', zone: 'living-world', active: true, generation: 1 }];
const switchSent = [];
const switchCommands = {
  summon: async command => ({ ok: true, commandId: command.commandId }),
  skill: async command => ({ ok: true, commandId: command.commandId }),
  switch: async command => {
    switchSent.push(command);
    switchActors = [{ instanceId: command.instanceId, zone: command.zone, active: true, generation: 1 }];
    return { ok: true, accepted: true, commandId: command.commandId };
  },
  recall: async command => {
    switchSent.push(command);
    switchActors = [];
    return { ok: true, accepted: true, commandId: command.commandId };
  },
};
const switchController = createMonsterControlController({
  commands: switchCommands,
  getParty: () => ({ available: true, slots: [
    { slot: 0, available: true, instanceId: 'mon-a' },
    { slot: 1, available: true, instanceId: 'mon-b' },
  ] }),
  getZone: () => 'living-world',
  getCapabilities: () => ({ switch: true, recall: true }),
  getAim: () => ({ x: 5, y: 0, z: 6 }),
  getConfirmedActors: () => switchActors,
});
const switched = await switchController.activateSlot(1);
assert.equal(switched.reason, 'switch-confirmed');
assert.equal(switchSent[0].kind, 'switch');
assert.equal(switchSent[0].expectedActiveInstanceId, 'mon-a');
assert.deepEqual(switchSent[0].targetPoint, { x: 5, y: 0, z: 6 });
assert.equal(switchController.snapshot().controlPanel.mode, 'character', 'switch ACK keeps character panel');
const recalled = await switchController.recallActive();
assert.equal(recalled.ok, true);
assert.equal(switchSent[1].kind, 'recall');
assert.equal(switchController.snapshot().slots.some(slot => slot.active), false);
console.log('V9 monster control controller: PASS');
