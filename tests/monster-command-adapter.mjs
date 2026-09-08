import assert from 'node:assert/strict';
import { createMonsterCommandAdapter, MONSTER_COMMAND_CONTRACT, sanitizeMonsterCommand } from '../monster-command-adapter.mjs';

const base = { contract: MONSTER_COMMAND_CONTRACT, commandId: 'cmd-1', instanceId: 'monster-1', zone: 'pirate-fruit' };
assert.equal(sanitizeMonsterCommand({ ...base, kind: 'world-monster-hit' }), null, 'ambient hit is not an owned command');
assert.equal(sanitizeMonsterCommand({ ...base, kind: 'skill', skillId: 'Flame-Bite' }).skillId, 'Flame-Bite');
assert.equal(sanitizeMonsterCommand({ ...base, kind: 'skill' }), null, 'skill requires skillId');
assert.equal((await createMonsterCommandAdapter().summon({ ...base })).code, 'SERVER_INGRESS_UNAVAILABLE', 'missing Server ingress fails closed');

const sent = [];
const adapter = createMonsterCommandAdapter({ getZone: () => 'pirate-fruit', send: async command => { sent.push(command); return { ok: true, accepted: true, commandId: command.commandId }; } });
const first = adapter.summon({ ...base });
const second = adapter.summon({ ...base });
assert.equal(first, second, 'same command id is deduplicated while pending');
assert.deepEqual(await first, { ok: true, accepted: true, commandId: 'cmd-1' });
assert.equal(sent.length, 1, 'one transport call for duplicate summon');
const skill = await adapter.skill({ ...base, commandId: 'cmd-2', skillId: 'Flame-Bite', targetActorId: 'actor-2' });
assert.equal(skill.ok, true);
assert.equal(sent[1].instanceId, 'monster-1');
assert.equal(sent[1].skillId, 'Flame-Bite');
assert.equal((await adapter.skill({ ...base, commandId: 'cmd-3', skillId: 'Flame-Bite', zone: 'other-zone' })).code, 'STALE_SCENE');
console.log('Owned monster command adapter contract: PASS');
