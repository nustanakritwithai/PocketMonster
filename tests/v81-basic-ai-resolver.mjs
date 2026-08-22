import assert from 'node:assert/strict';
import { OWNED_BASIC_AI_POLICY } from '../runtime-policies.mjs';
import { resolveOwnedBasicAiAction } from '../basic-ai-resolver.mjs';

const actor = Object.freeze({
  id: 'owned-1',
  speciesId: 'normalooze',
  alive: true,
  position: Object.freeze({ x: 0, z: 0 }),
});
const enemy = (id, x, z, overrides = {}) => Object.freeze({
  id,
  alive: true,
  targetable: true,
  position: Object.freeze({ x, z }),
  ...overrides,
});
const resolve = overrides => resolveOwnedBasicAiAction({
  actor,
  enemies: [],
  currentTargetId: null,
  attackReady: true,
  ...overrides,
});

assert.deepEqual(OWNED_BASIC_AI_POLICY.actionTypes, ['idle', 'move', 'basic_attack']);
assert.equal(OWNED_BASIC_AI_POLICY.commandSource, 'basicAI');
assert.equal(OWNED_BASIC_AI_POLICY.manualSkillSlots, 'never');
assert.equal(OWNED_BASIC_AI_POLICY.usesConsumed, 0);
assert.equal(OWNED_BASIC_AI_POLICY.skillPriority, 'deferred_AI_Skill_Priority_TODO');
assert.equal(OWNED_BASIC_AI_POLICY.acquireRangeM, 9);
assert.equal(OWNED_BASIC_AI_POLICY.retainRangeM, 12);
assert.equal(OWNED_BASIC_AI_POLICY.basicAttackRangeM, 1.35);
assert.equal(OWNED_BASIC_AI_POLICY.basicAttackCooldownSec, 0.9);
assert.equal(OWNED_BASIC_AI_POLICY.basicAttackPower, 15);
assert.equal(Object.isFrozen(OWNED_BASIC_AI_POLICY), true);
assert.equal(Object.isFrozen(OWNED_BASIC_AI_POLICY.actionTypes), true);

const tie = resolve({ enemies: [enemy('wild-b', 3, 4), enemy('wild-a', -3, -4)] });
assert.equal(tie.ok, true);
assert.equal(tie.action, 'move');
assert.equal(tie.targetId, 'wild-a', 'equal distance resolves by stable ID, independent of input order');
assert.equal(tie.distanceM, 5);
assert.equal(tie.profile.aiStyle, 'Adaptive');
assert.equal(Object.isFrozen(tie), true);
assert.equal(Object.isFrozen(tie.direction), true);

const reverseTie = resolve({ enemies: [enemy('wild-a', -3, -4), enemy('wild-b', 3, 4)] });
assert.equal(reverseTie.targetId, 'wild-a');

const retained = resolve({
  enemies: [enemy('current', 10, 0), enemy('closer', 2, 0)],
  currentTargetId: 'current',
});
assert.equal(retained.targetId, 'current', 'valid current target remains stable inside retain radius');
assert.equal(retained.action, 'move');

const retargeted = resolve({
  enemies: [enemy('current', 13, 0), enemy('nearest', 4, 0), enemy('dead', 1, 0, { alive: false })],
  currentTargetId: 'current',
});
assert.equal(retargeted.targetId, 'nearest', 'out-of-retain current target is replaced by nearest valid target');

const retainBoundary = resolve({
  enemies: [enemy('current', 12, 0), enemy('closer', 2, 0)],
  currentTargetId: 'current',
});
assert.equal(retainBoundary.targetId, 'current');

for (const invalidCurrent of [
  enemy('current', 1, 0, { alive: false }),
  enemy('current', 1, 0, { targetable: false }),
]) {
  const decision = resolve({
    enemies: [invalidCurrent, enemy('alternate', 2, 0)],
    currentTargetId: 'current',
  });
  assert.equal(decision.targetId, 'alternate');
}

const untargetable = resolve({
  enemies: [enemy('capturing', 1, 0, { targetable: false }), enemy('valid', 3, 0)],
});
assert.equal(untargetable.targetId, 'valid');

const attack = resolve({ enemies: [enemy('close', 1, 0)] });
assert.equal(attack.action, 'basic_attack');
assert.equal(attack.targetId, 'close');
assert.equal(attack.commandSource, 'basicAI');
assert.equal(attack.usesConsumed, 0);
assert.equal('skillId' in attack, false);
assert.equal('slot' in attack, false);

const coolingDown = resolve({ enemies: [enemy('close', 1, 0)], attackReady: false });
assert.equal(coolingDown.action, 'idle');
assert.equal(coolingDown.reason, 'basic_attack_cooldown');
assert.equal(coolingDown.targetId, 'close');

const noTarget = resolve({ enemies: [enemy('outside', 9.01, 0)] });
assert.equal(noTarget.action, 'idle');
assert.equal(noTarget.reason, 'no_valid_target');
assert.equal(noTarget.targetId, null);

const boundary = resolve({ enemies: [enemy('boundary', 9, 0)] });
assert.equal(boundary.targetId, 'boundary');

const actorUnavailable = resolve({ actor: { ...actor, alive: false }, enemies: [] });
assert.equal(actorUnavailable.ok, true);
assert.equal(actorUnavailable.action, 'idle');
assert.equal(actorUnavailable.reason, 'actor_unavailable');

for (const [request, reason] of [
  [{ enemies: [enemy('same', 1, 0), enemy('same', 2, 0)] }, 'duplicate_target_id'],
  [{ enemies: [enemy('', 1, 0)] }, 'invalid_target'],
  [{ enemies: [enemy('nan', Number.NaN, 0)] }, 'invalid_target'],
  [{ enemies: [enemy('owned-1', 1, 0)] }, 'actor_target_id_collision'],
  [{ actor: { ...actor, speciesId: 'unknown' } }, 'unknown_ai_profile'],
  [{ currentTargetId: ' ' }, 'invalid_current_target_id'],
  [{ attackReady: 1 }, 'invalid_attack_ready'],
  [{ actor: { ...actor, position: { x: Infinity, z: 0 } } }, 'invalid_actor'],
  [{ skillId: 'SK_NORMAL_01' }, 'invalid_request_shape'],
]) {
  const rejected = resolve(request);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, reason);
  assert.equal(rejected.action, 'idle');
  assert.equal(rejected.targetId, null);
}

for (const speciesId of [
  'normalooze', 'flameling', 'aquapuff', 'voltkit', 'mossbun', 'frostowl',
  'punchcub', 'toxitoad', 'sandmole', 'galebird', 'mindcoon', 'buglet',
  'rockhorn', 'ghostpurr', 'emberdrake', 'voidhorn', 'ironbug', 'fairimp',
]) {
  const decision = resolve({ actor: { ...actor, speciesId }, enemies: [enemy('same-geometry', 2, 0)] });
  assert.equal(decision.action, 'move', `AIStyle for ${speciesId} remains metadata-only`);
  assert.equal(decision.targetId, 'same-geometry');
}

let volatileIdReads = 0;
const volatileTarget = new Proxy({
  id: 'stable-proxy-id',
  alive: true,
  targetable: true,
  position: Object.freeze({ x: 1, z: 0 }),
}, {
  get(target, property, receiver) {
    if (property === 'id') {
      volatileIdReads += 1;
      return ' ';
    }
    return Reflect.get(target, property, receiver);
  },
});
const volatileDecision = resolve({ enemies: [volatileTarget] });
assert.equal(volatileDecision.ok, true);
assert.equal(volatileDecision.targetId, 'stable-proxy-id', 'candidate values are canonicalized once from data descriptors');
assert.equal(volatileIdReads, 0, 'resolver never re-reads a canonicalized Proxy property');

console.log('V8.1 A35 deterministic Basic AI resolver: PASS');
