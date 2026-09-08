import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createMonsterControlController, MONSTER_COMMAND_CONTRACT } from '../monster-control-controller-v900.mjs';
const { createMonsterCommandAdapter } = await import(pathToFileURL('C:/Users/Administrator/Desktop/เซิพจารย/.worktrees/monster-controls-integration-20260908/monster-command-adapter.mjs').href);

let zone = 'pirate-fruit';
let actors = [];
const party = { available: true, slots: [{ slot: 0, available: true, instanceId: 'mon-a' }] };
const sent = [];
const adapter = createMonsterCommandAdapter({ getZone: () => zone, send: async command => { sent.push(command); if (zone === 'pirate-fruit') actors = [{ instanceId: command.instanceId, zone, active: true }]; return { ok: true, accepted: true, code: 'ACCEPTED', commandId: command.commandId }; } });
const controller = createMonsterControlController({ commands: adapter, getParty: () => party, getZone: () => zone, getAim: () => ({ x: 1, y: 0, z: 2 }), getConfirmedActors: () => actors, getSkills: id => id === 'mon-a' ? [{ skillId: 'skill-a' }] : [] });

const first = await controller.activatePartySlot(0);
assert.equal(first.reason, 'summon-confirmed');
assert.equal(sent[0].contract, MONSTER_COMMAND_CONTRACT);
assert.equal(sent[0].kind, 'summon');
assert.ok(sent[0].commandId);
assert.deepEqual(sent[0].targetPoint, { x: 1, y: 0, z: 2 });
assert.equal(controller.snapshot().controlPanel.mode, 'character');
assert.equal((await controller.useSkill(0)).reason, 'character-panel-active');

assert.equal((await controller.activateSlot(0)).mode, 'monster');
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
assert.equal((await controller.activateSlot(0)).reason, 'ACCEPTED');
controller.reset();
assert.equal(controller.snapshot().controlPanel.mode, 'character');
console.log('V9 monster control controller: PASS');
