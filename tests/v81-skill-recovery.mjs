import assert from 'node:assert/strict';
import { activeJs } from './active-assets.mjs';
import { skillCatalogEntry } from '../skill-catalog.mjs';
import {
  SKILL_RECOVERY_ROUTES,
  recoverSkillUses,
} from '../skill-recovery.mjs';

const keeperRoute = SKILL_RECOVERY_ROUTES.REC_NPC;
assert.equal(keeperRoute.owner, 'keeper');
assert.equal(keeperRoute.costPolicy, 'free');
assert.equal(keeperRoute.targetScope, 'all_owned_monsters');
assert.equal(keeperRoute.skillScope, 'all_skills_except_system_slots');
assert.equal(keeperRoute.recoveryMode, 'Full');

const collection = [{
  instanceId: 'party-mon',
  hp: 3,
  fainted: true,
  bond: 44,
  skills: [
    { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 0 },
    { skillId: 'SK_FIRE_02', slot: 's2', currentUses: 5 },
    { skillId: 'SK_FIRE_04', slot: null, currentUses: 'broken' },
    { skillId: 'SK_NORMAL_01', slot: 'basicAI', currentUses: 0 },
    { skillId: 'legacy_move', slot: 's3', currentUses: 0 },
  ],
}, {
  instanceId: 'storage-mon',
  hp: 20,
  fainted: false,
  bond: 70,
  skills: [{ skillId: 'SK_WATER_01', slot: 's1' }],
}];

const rejectedFixture = structuredClone(collection);
const rejectedBefore = structuredClone(rejectedFixture);
assert.equal(recoverSkillUses(rejectedFixture, {
  routeId: 'ITEM_FULL_CHARGE', commandId: 'blocked-item-route',
}).reason, 'unauthorized_route');
assert.deepEqual(rejectedFixture, rejectedBefore, 'an unauthorized route cannot mutate owned monsters');

const recovered = recoverSkillUses(collection, {
  routeId: 'REC_NPC', commandId: 'keeper-heal-1',
});
assert.equal(recovered.ok, true);
assert.equal(recovered.recoveredMonsters, 2);
assert.equal(recovered.recoveredSkills, 4);
assert.equal(collection[0].skills[0].currentUses, skillCatalogEntry('SK_FIRE_01').maxUses);
assert.equal(collection[0].skills[1].currentUses, skillCatalogEntry('SK_FIRE_02').maxUses);
assert.equal(collection[0].skills[2].currentUses, skillCatalogEntry('SK_FIRE_04').maxUses, 'unequipped learned skills are still AllSkills');
assert.equal(collection[1].skills[0].currentUses, skillCatalogEntry('SK_WATER_01').maxUses);
assert.equal(collection[0].skills[3].currentUses, 0, 'basicAI is never a metered manual skill');
assert.equal(collection[0].skills[4].currentUses, 0, 'unknown legacy skills are preserved without inventing MaxUses');
assert.deepEqual(
  collection.map(monster => ({ hp: monster.hp, fainted: monster.fainted, bond: monster.bond })),
  [{ hp: 3, fainted: true, bond: 44 }, { hp: 20, fainted: false, bond: 70 }],
  'the skill recovery command mutates uses only; HP/faint/bond remain separate',
);

collection[0].skills[0].currentUses = 1;
const duplicate = recoverSkillUses(collection, {
  routeId: 'REC_NPC', commandId: 'keeper-heal-1',
});
assert.equal(duplicate.reason, 'duplicate_command');
assert.equal(collection[0].skills[0].currentUses, 1, 'a replayed callback cannot refill a later-spent use');

const nextCommand = recoverSkillUses(collection, {
  routeId: 'REC_NPC', commandId: 'keeper-heal-2',
});
assert.equal(nextCommand.ok, true);
assert.equal(collection[0].skills[0].currentUses, skillCatalogEntry('SK_FIRE_01').maxUses);

const healStart = activeJs.indexOf('function healAll(');
const healEnd = activeJs.indexOf('\nfunction ', healStart + 1);
assert.notEqual(healStart, -1, 'canonical Keeper heal route exists');
const healBody = activeJs.slice(healStart, healEnd);
assert.match(healBody, /recoverSkillUses\(state\.collection,\{routeId:'REC_NPC'/, 'Keeper heal explicitly invokes the approved all-owned recovery route');
assert.match(healBody, /Uses/, 'the player-facing result states that skill Uses were recovered');

const defeatStart = activeJs.indexOf('function defeatWild(');
const defeatEnd = activeJs.indexOf('\nfunction ', defeatStart + 1);
assert.doesNotMatch(activeJs.slice(defeatStart, defeatEnd), /recoverSkillUses/, 'battle completion never auto-resets Uses');
assert.equal((activeJs.match(/recoverSkillUses\(/g) ?? []).length, 1, 'only the explicit Keeper route calls skill recovery in live runtime');

console.log('V8.1 Keeper/Ranch skill recovery contract: PASS');
