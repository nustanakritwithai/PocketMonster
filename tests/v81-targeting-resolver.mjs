import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  commandTargetKind,
  resolveSkillCommand,
} from '../targeting-resolver.mjs';

const actor = { id: 'player-mon', alive: true, position: { x: 0, z: 0 } };
const enemies = [
  { id: 'far', alive: true, targetable: true, position: { x: 4, z: 0 } },
  { id: 'near', alive: true, targetable: true, position: { x: 2, z: 0 } },
  { id: 'dead', alive: false, targetable: true, position: { x: 1, z: 0 } },
];
const resources = { currentUses: 5, cooldownRemainingSec: 0 };

assert.equal(commandTargetKind('SK_NORMAL_03'), 'Self');
assert.equal(commandTargetKind('SK_FIRE_01'), 'NearestEnemy');
assert.equal(commandTargetKind('SK_FIRE_05'), 'EnemyArea');
assert.equal(commandTargetKind('SK_ICE_04'), 'GroundPoint');

const self = resolveSkillCommand({ commandId: 'cmd-self', skillId: 'SK_NORMAL_03', actor, enemies, ...resources });
assert.equal(self.ok, true);
assert.deepEqual(self.targetIds, ['player-mon']);

const nearest = resolveSkillCommand({ commandId: 'cmd-near', skillId: 'SK_FIRE_01', actor, enemies, range: 5, ...resources });
assert.equal(nearest.ok, true);
assert.deepEqual(nearest.targetIds, ['near']);

const area = resolveSkillCommand({ commandId: 'cmd-area', skillId: 'SK_FIRE_05', actor, enemies, range: 5, ...resources });
assert.equal(area.ok, true);
assert.deepEqual(area.targetIds, ['near', 'far'], 'area targets are deterministic and exclude invalid enemies');

const ground = resolveSkillCommand({
  commandId: 'cmd-ground', skillId: 'SK_ICE_04', actor, enemies,
  groundPoint: { x: 3, z: 4 }, range: 5, ...resources,
});
assert.equal(ground.ok, true);
assert.deepEqual(ground.groundPoint, { x: 3, z: 4 });
assert.deepEqual(ground.targetIds, [], 'GroundPoint validates a command point but never resolves hits');

assert.equal(resolveSkillCommand({ commandId: 'no-target', skillId: 'SK_FIRE_01', actor, enemies: [], range: 5, ...resources }).reason, 'no_valid_target');
assert.equal(resolveSkillCommand({ commandId: 'too-far', skillId: 'SK_ICE_04', actor, groundPoint: { x: 6, z: 0 }, range: 5, ...resources }).reason, 'ground_point_out_of_range');
assert.equal(resolveSkillCommand({ commandId: 'cooldown', skillId: 'SK_FIRE_01', actor, enemies, range: 5, currentUses: 5, cooldownRemainingSec: 0.1 }).reason, 'cooldown_active');
assert.equal(resolveSkillCommand({ commandId: 'uses', skillId: 'SK_FIRE_01', actor, enemies, range: 5, currentUses: 0, cooldownRemainingSec: 0 }).reason, 'no_uses');

assert.equal(nearest.consumeUses, 1);
assert.equal(nearest.hitResolution, 'deferred_to_gameplay_resolver');
assert.equal('damage' in nearest, false, 'target command never resolves damage');

const uiSource = readFileSync(new URL('../combat-ui-view-model.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(uiSource, /resolveSkillCommand\s*\(/, 'UI presentation cannot resolve gameplay targets or hits');

console.log('V8.1 targeting command resolver: PASS');
