import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applySkillItemUse, resolveSkillItemUse } from '../skill-items.mjs';
import { executeEquippedSkillCommand } from '../skill-command-runtime.mjs';
import { getSkill } from '../skill-progression.mjs';

const state = {
  collection: [{
    instanceId: 'runtime-fire', speciesId: 'normalooze', level: 20,
    skills: [
      { skillId: 'SK_NORMAL_02', slot: 's1', currentUses: 16 },
      { skillId: 'SK_NORMAL_04', slot: 's2', currentUses: 10 },
      { skillId: 'SK_NORMAL_05', slot: 's3', currentUses: 8 },
    ],
  }],
  inventory: { emberFruit: 1 },
  skillItemUseCommandIds: [],
};
const planned = resolveSkillItemUse({
  state, monsterId: 'runtime-fire', itemId: 'emberFruit', slot: 's4',
  expectedOccupantSkillId: null, commandId: 'runtime-learn', now: 1234,
});
assert.equal(planned.ok, true, planned.reason);
const learned = applySkillItemUse({ state, operation: planned.operation });
assert.equal(learned.ok, true, learned.reason);
assert.equal(learned.nextState.inventory.emberFruit, 0);
assert.deepEqual(learned.nextMonster.skills.map(skill => [skill.slot, skill.skillId]), [
  ['s1', 'SK_NORMAL_02'], ['s2', 'SK_NORMAL_04'], ['s3', 'SK_NORMAL_05'], ['s4', 'SK_FIRE_01'],
]);

const actor = { id: 'runtime-fire', alive: true, position: { x: 0, z: 0 } };
const enemy = { id: 'enemy', alive: true, targetable: true, position: { x: 1, z: 0 } };
let applications = 0;
const cast = executeEquippedSkillCommand(learned.nextMonster, {
  slot: 's4', commandId: 'runtime-cast', actor, enemies: [enemy], cooldownRemainingSec: 0,
}, {
  materializeTargets(command) { return command.targetIds.map(() => enemy); },
  canApply() { return true; },
  applyAccepted(command, targets) {
    applications += 1;
    return { skillId: command.skillId, targetIds: targets.map(target => target.id) };
  },
});
assert.equal(cast.ok, true, cast.reason);
assert.equal(cast.command.skillId, 'SK_FIRE_01');
assert.deepEqual(cast.application, { skillId: 'SK_FIRE_01', targetIds: ['enemy'] });
assert.equal(getSkill(learned.nextMonster, 'SK_FIRE_01').currentUses, 27, 'runtime uses canonical Uses after acquisition');
assert.equal(applications, 1);
assert.equal(learned.nextState.inventory.emberFruit, 0, 'casting never consumes a second item');

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(game, /return manualSkillLoadout\(inst\)\.map\(/, 'combat adapter reads learned manual loadout');
assert.match(game, /bindActionPress\(el\('skill4Btn'\),\(\)=>dispatchSkill\(3\)\)/, 'S4 reaches runtime dispatcher');
assert.match(game, /await learnMonsterSkillFromItem\(command\.monsterId,command\.itemId,command\.slot,command\.commandId\)/, 'live acquisition uses the atomic server transaction');
assert.match(game, /applyAuthoritativeMonster\(command\.monsterId,result\.monsterJson\)/, 'live acquisition applies only the authoritative monster response');
assert.match(game, /if\(skillItemById\(food\)\)\{msg\('[^']*Skill Item/, 'legacy feed path rejects Skill Items before inventory decrement');
assert.doesNotMatch(game, /data-feed="emberFruit"/, 'emberFruit is not exposed as ordinary food');
assert.match(html, /id="skill4Btn"/);

console.log('V8.9 skill item runtime adapter: PASS (S4 cast + canonical Uses)');
