import assert from 'node:assert/strict';
import fs from 'node:fs';

const SOURCES = Object.freeze({
  policy: ['runtime-policies.mjs', fs.readFileSync(new URL('../runtime-policies.mjs', import.meta.url), 'utf8')],
  resolver: ['wild-ai-resolver.mjs', fs.readFileSync(new URL('../wild-ai-resolver.mjs', import.meta.url), 'utf8')],
});

async function loadSource(source, filename, tag) {
  const fileUrl = new URL(`../${filename}`, import.meta.url);
  const withAbsoluteImports = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(relativePath, fileUrl).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${withAbsoluteImports}\n//# sourceURL=${tag}`).toString('base64')}`);
}

function assertPolicyContract(module) {
  const policy = module.WILD_BASIC_AI_POLICY;
  const bossPolicy = module.WILD_BOSS_BASIC_AI_POLICY;
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(policy.id, 'wild-basic-v810');
  assert.equal(policy.aggroRadiusM, 4);
  assert.equal(policy.leashRadiusM, 18);
  assert.equal(policy.disengageRadiusM, 20);
  assert.equal(policy.preferredRangeMaxM, 1.25);
  assert.equal(policy.retargetCooldownSec, 1.2);
  assert.equal(policy.targetSwitchMargin, 0.25);
  assert.equal(policy.currentTargetBonus, 0.25);
  assert.equal(policy.distanceWeight, 1);
  assert.equal(policy.threatWeight, 0);
  assert.equal(policy.rolePriorityWeight, 0);
  assert.equal(policy.alertDurationSec, 0.35);
  assert.equal(policy.windupDurationSec, 0.22);
  assert.equal(policy.recoverDurationSec, 0.12);
  assert.equal(policy.basicAttackCooldownSec, 1.2);
  assert.equal(policy.bossAttackCooldownSec, 0.85);
  assert.equal(policy.commandSource, 'wildBasicAI');
  assert.equal(policy.manualSkillSlots, 'never');
  assert.equal(policy.usesConsumed, 0);
  assert.equal(Object.isFrozen(bossPolicy), true);
  assert.equal(bossPolicy.id, 'wild-boss-basic-v810');
  assert.equal(bossPolicy.windupDurationSec, 0.65);
  assert.equal(bossPolicy.basicAttackCooldownSec, 0.85);
  assert.equal(bossPolicy.manualSkillSlots, 'never');
  assert.equal(bossPolicy.usesConsumed, 0);
  const tied = [
    { id: 'w-b', dead: false, targetValid: true, engaged: false, distanceToTarget: 2, distanceFromHome: 2 },
    { id: 'w-a', dead: false, targetValid: true, engaged: false, distanceToTarget: 2, distanceFromHome: 2 },
    { id: 'w-c', dead: false, targetValid: true, engaged: false, distanceToTarget: 2, distanceFromHome: 2 },
  ];
  assert.deepEqual(module.selectEngagedWildIds(tied), ['w-a', 'w-b']);
  assert.deepEqual(module.selectEngagedWildIds([...tied].reverse()), ['w-a', 'w-b']);
  assert.deepEqual(module.selectEngagedWildIds([
    { id: 'engaged-a', dead: false, targetValid: true, engaged: true, distanceToTarget: 10, distanceFromHome: 5 },
    { id: 'engaged-b', dead: false, targetValid: true, engaged: true, distanceToTarget: 11, distanceFromHome: 5 },
    { id: 'new-near', dead: false, targetValid: true, engaged: false, distanceToTarget: 1, distanceFromHome: 1 },
  ]), ['engaged-a', 'engaged-b']);
  assert.deepEqual(module.selectEngagedWildIds([
    { id: 'capturing', dead: false, capturing: true, targetValid: true, engaged: true, distanceToTarget: 0.5, distanceFromHome: 0.5 },
    { id: 'normal-a', dead: false, capturing: false, targetValid: true, engaged: false, distanceToTarget: 1, distanceFromHome: 1 },
    { id: 'normal-b', dead: false, capturing: false, targetValid: true, engaged: false, distanceToTarget: 2, distanceFromHome: 2 },
  ]), ['normal-a', 'normal-b']);
  const captureResumeHandoff = [
    { id: 'capture-resume', dead: false, capturing: false, targetValid: true, engaged: true, resumePriority: true, distanceToTarget: 5, distanceFromHome: 5 },
    { id: 'engaged-near', dead: false, capturing: false, targetValid: true, engaged: true, distanceToTarget: 2, distanceFromHome: 2 },
    { id: 'engaged-mid', dead: false, capturing: false, targetValid: true, engaged: true, distanceToTarget: 3, distanceFromHome: 3 },
  ];
  assert.deepEqual(module.selectEngagedWildIds(captureResumeHandoff), ['capture-resume', 'engaged-near']);
  assert.deepEqual(module.selectEngagedWildIds([...captureResumeHandoff].reverse()), ['capture-resume', 'engaged-near']);
}

function assertResolverContract(module) {
  const profile = module.DEFAULT_WILD_AI_PROFILE;
  const encounterId = 'zone:1';
  const actorId = 'wild-1';
  const self = (overrides = {}) => ({
    id: actorId,
    encounterId,
    alive: true,
    capturing: false,
    engaged: false,
    hp: 100,
    maxHp: 100,
    position: { x: 0, z: 0 },
    home: { x: 0, z: 0 },
    attackReady: true,
    canMove: true,
    canAttack: true,
    forcedRetreat: false,
    ...overrides,
  });
  const target = (id = 'player', x = 1, z = 0, overrides = {}) => ({
    id,
    encounterId,
    alive: true,
    targetable: true,
    capturing: false,
    position: { x, z },
    recentDamage: 0,
    rolePriority: 0,
    ...overrides,
  });
  const state = overrides => module.createMonsterAIState({ actorId, encounterId, ...overrides });
  const resolve = ({
    aiState = state(),
    actor = self(),
    targets = [],
    nowSec = 0,
    dtSec = 0,
    canEngage = true,
  } = {}) => module.resolveWildMonsterAI({
    state: aiState,
    snapshot: { nowSec, dtSec, self: actor, targets, profile },
    canEngage,
  });

  const validRequest = {
    state: state(),
    snapshot: { nowSec: 0, dtSec: 0, self: self(), targets: [], profile },
    canEngage: true,
  };

  assert.equal(module.validateMonsterAIProfile(profile).ok, true);
  assert.equal(module.validateMonsterAIProfile({ ...profile }).ok, true);
  assert.equal(module.validateMonsterAIProfile({ ...profile, id: 'unknown-profile' }).ok, false);
  assert.equal(module.validateMonsterAIProfile({ ...profile, threatWeight: 1 }).ok, false);
  assert.equal(module.validateMonsterAIProfile({ ...profile, rolePriorityWeight: 1 }).ok, false);
  assert.deepEqual(module.validateMonsterAIState(state()), state());
  assert.equal(module.validateMonsterAIState({ actorId, encounterId }), null);
  assert.equal(module.isCanonicalMonsterAIState(state()), true);
  assert.equal(module.isCanonicalMonsterAIState(structuredClone(state())), false);
  assert.equal(module.advanceMonsterAI(state({ stateElapsedSec: Number.MAX_VALUE }), Number.MAX_VALUE), null);
  assert.equal(state({ extra: true }), null);
  assert.equal(state({ state: 'attack_windup', targetId: 'player' }), null);
  assert.equal(state({
    state: 'attack_windup', targetId: 'player', nextActionSequence: 2,
    pendingAction: { kind: 'basic_attack', token: 'forged', targetId: 'player', issuedAtSec: null, commandSource: 'wildBasicAI' },
  }), null);
  assert.equal(state({
    state: 'attack_windup', targetId: 'player', nextActionSequence: 2,
    pendingAction: { kind: 'basic_attack', token: `${actorId}:${encounterId}:1`, targetId: 'player', issuedAtSec: null, commandSource: 'forged-source' },
  }), null);
  assert.equal(state({
    state: 'wander', targetId: 'player', nextActionSequence: 2,
    pendingAction: { kind: 'basic_attack', token: `${actorId}:${encounterId}:1`, targetId: 'player', issuedAtSec: null, commandSource: 'wildBasicAI' },
  }), null);
  assert.equal(module.resolveWildMonsterAI({ ...validRequest, extra: true }).ok, false);
  assert.equal(resolve({ targets: [target(' padded ', 1, 0)] }).ok, false);
  assert.equal(resolve({ targets: [target(actorId, 1, 0)] }).ok, false);
  assert.equal(resolve({ targets: [target('duplicate'), target('duplicate')] }).ok, false);
  assert.equal(resolve({ targets: [target('bad', Number.NaN, 0)] }).ok, false);
  assert.equal(resolve({ targets: [target('dead', 1, 0, { alive: false })] }).targetId, null);
  assert.equal(resolve({ targets: [target('blocked', 1, 0, { targetable: false })] }).targetId, null);
  assert.equal(resolve({ targets: [target('capturing', 1, 0, { capturing: true })] }).targetId, null);
  assert.equal(resolve({ targets: [target('aggro', 4, 0)] }).targetId, 'aggro');
  assert.equal(resolve({ targets: [target('outside', 4.000001, 0)] }).targetId, null);
  assert.equal(resolve({ actor: self({ engaged: true }), targets: [target('provoked', 5, 0)] }).targetId, 'provoked');
  assert.equal(resolve({ actor: self({ engaged: true }), targets: [target('escaped', 20.000001, 0)] }).action, 'reset');
  assert.equal(module.scoreMonsterTargets({
    self: self(),
    targets: [target('near', 1, 0), target('threat', 3, 0, { recentDamage: Number.MAX_SAFE_INTEGER })],
    currentTargetId: null,
    profile,
    retargetAllowed: true,
  }).targetId, 'near');
  assert.equal(module.scoreMonsterTargets({
    self: self(),
    targets: [target('near', 1, 0), target('role', 3, 0, { rolePriority: Number.MAX_SAFE_INTEGER })],
    currentTargetId: null,
    profile,
    retargetAllowed: true,
  }).targetId, 'near');
  assert.equal(resolve({ canEngage: false, targets: [target()] }).action, 'wander');
  const resetPending = resolve({ aiState: state({ state: 'reset' }), targets: [target()] });
  assert.equal(resetPending.action, 'reset');
  assert.equal(resetPending.reason, 'reset_pending');
  assert.equal(resetPending.targetId, null);
  assert.equal(resolve({
    aiState: state({ state: 'chase', targetId: 'player' }),
    actor: self({ engaged: true }),
    targets: [target()],
    canEngage: false,
  }).action, 'reset');
  assert.equal(resolve({
    aiState: state({ state: 'chase', targetId: 'player' }),
    actor: self({ engaged: true, position: { x: 18, z: 0 } }),
    targets: [target('player', 18, 0)],
  }).action, 'idle');
  assert.equal(resolve({
    aiState: state({ state: 'chase', targetId: 'player', nextActionSequence: Number.MAX_SAFE_INTEGER }),
    actor: self({ engaged: true }),
    targets: [target()],
  }).reason, 'action_sequence_exhausted');
  assert.equal(resolve({
    aiState: state({ state: 'chase', targetId: 'player' }),
    actor: self({ engaged: true, position: { x: 18.000001, z: 0 } }),
    targets: [target('player', 18.000001, 0)],
  }).action, 'reset');
  assert.notEqual(resolve({
    aiState: state({ state: 'chase', targetId: 'player' }),
    actor: self({ engaged: true }),
    targets: [target('player', 20, 0)],
  }).action, 'reset');
  assert.equal(resolve({
    aiState: state({ state: 'chase', targetId: 'player' }),
    actor: self({ engaged: true }),
    targets: [target('player', 20.000001, 0)],
  }).action, 'reset');
  assert.equal(module.perceiveMonster({
    self: self(),
    targets: [target('outside-perception', 20.000001, 0)],
    profile,
  }).validTargets.length, 0);
  assert.equal(resolve({
    aiState: state({ state: 'alert', targetId: 'player' }),
    actor: self({ engaged: true }),
    targets: [target()],
    dtSec: 0.349999,
  }).nextState.state, 'alert');
  assert.equal(resolve({
    aiState: state({ state: 'alert', targetId: 'player' }),
    actor: self({ engaged: true }),
    targets: [target()],
    dtSec: 0.35,
  }).nextState.state, 'chase');
  const move = resolve({
    aiState: state({ state: 'chase', targetId: 'player' }),
    actor: self({ engaged: true }),
    targets: [target('player', 3, 4)],
  });
  assert.equal(move.action, 'move');
  assert.deepEqual(move.direction, { x: 0.6, z: 0.8 });
  const movementBlocked = resolve({
    aiState: state({ state: 'chase', targetId: 'player' }),
    actor: self({ engaged: true, canMove: false }),
    targets: [target('player', 2, 0)],
  });
  assert.equal(movementBlocked.action, 'idle');
  assert.equal(movementBlocked.reason, 'movement_blocked_by_status');
  assert.equal(movementBlocked.nextState.state, 'chase');
  const hardActionBlockedOutsideRange = resolve({
    aiState: state({ state: 'chase', targetId: 'player' }),
    actor: self({ engaged: true, canMove: false, canAttack: false }),
    targets: [target('player', 2, 0)],
  });
  assert.equal(hardActionBlockedOutsideRange.reason, 'action_blocked_by_status');
  assert.equal(hardActionBlockedOutsideRange.nextState.state, 'recover');
  const attackBlocked = resolve({
    aiState: state({ state: 'chase', targetId: 'player' }),
    actor: self({ engaged: true, canAttack: false }),
    targets: [target()],
  });
  assert.equal(attackBlocked.reason, 'attack_blocked_by_status');
  assert.equal(attackBlocked.nextState.state, 'recover');
  const recoverWhileBlocked = resolve({
    aiState: state({ state: 'recover', targetId: 'player', stateElapsedSec: profile.recoverDurationSec }),
    actor: self({ engaged: true, canMove: false, canAttack: false }),
    targets: [target()],
  });
  assert.equal(recoverWhileBlocked.reason, 'action_blocked_by_status');
  assert.equal(recoverWhileBlocked.nextState.state, 'recover');
  const recoverWhileAttackBlocked = resolve({
    aiState: state({ state: 'recover', targetId: 'player', stateElapsedSec: profile.recoverDurationSec }),
    actor: self({ engaged: true, canMove: true, canAttack: false }),
    targets: [target()],
  });
  assert.equal(recoverWhileAttackBlocked.reason, 'attack_blocked_by_status');
  assert.equal(recoverWhileAttackBlocked.nextState.state, 'recover');
  const lockedPendingAction = {
    kind: 'basic_attack', token: `${actorId}:${encounterId}:1`, targetId: 'player',
    issuedAtSec: null, commandSource: 'wildBasicAI',
  };
  for (const aiState of [
    state(),
    state({ state: 'alert', targetId: 'player' }),
    state({ state: 'alert', targetId: 'player', stateElapsedSec: profile.alertDurationSec }),
    state({ state: 'orbit', targetId: 'player' }),
    state({ state: 'retreat', targetId: 'player' }),
    state({ state: 'attack_windup', targetId: 'player', nextActionSequence: 2, pendingAction: lockedPendingAction }),
  ]) {
    const locked = resolve({ aiState, actor: self({ engaged: true, canMove: false, canAttack: false }), targets: [target()] });
    assert.equal(locked.action, 'idle');
    assert.equal(locked.reason, 'action_blocked_by_status');
    assert.equal(locked.nextState.state, 'recover');
    assert.equal(locked.nextState.pendingAction, null);
  }
  const blockedForcedRetreat = resolve({
    aiState: state({ state: 'alert', targetId: 'player' }),
    actor: self({ engaged: true, canMove: false, canAttack: false, forcedRetreat: true }),
    targets: [target()],
  });
  assert.equal(blockedForcedRetreat.reason, 'forced_retreat_blocked');
  assert.equal(blockedForcedRetreat.nextState.state, 'retreat');
  const freshForcedRetreat = resolve({
    aiState: state(), actor: self({ engaged: true, forcedRetreat: true }), targets: [target()],
  });
  assert.equal(freshForcedRetreat.reason, 'forced_retreat');
  assert.equal(freshForcedRetreat.nextState.state, 'retreat');
  assert.equal(freshForcedRetreat.targetId, 'player');
  const retreat = resolve({
    aiState: state({ state: 'chase', targetId: 'player' }),
    actor: self({ engaged: true, canAttack: false, forcedRetreat: true }),
    targets: [target()],
  });
  assert.equal(retreat.action, 'move');
  assert.deepEqual(retreat.direction, { x: -1, z: 0 });
  assert.equal(resolve({
    aiState: state({ state: 'chase', targetId: 'player' }),
    actor: self({ engaged: true, attackReady: false }),
    targets: [target()],
  }).reason, 'basic_attack_cooldown');
  const windup = resolve({
    aiState: state({ state: 'chase', targetId: 'player' }),
    actor: self({ engaged: true }),
    targets: [target('player', 1.25, 0)],
  });
  assert.equal(windup.nextState.state, 'attack_windup');
  assert.equal(windup.action, 'idle');
  assert.equal(resolve({
    aiState: state({ state: 'chase', targetId: 'player' }),
    actor: self({ engaged: true }),
    targets: [target('player', 1.250001, 0)],
  }).action, 'move');
  assert.equal(resolve({
    aiState: windup.nextState,
    actor: self({ engaged: true }),
    targets: [target()],
    dtSec: 0.219999,
  }).action, 'idle');
  const ready = resolve({
    aiState: windup.nextState,
    actor: self({ engaged: true }),
    targets: [target()],
    dtSec: 0.22,
  });
  assert.equal(ready.action, 'basic_attack');
  assert.equal(ready.nextState.state, 'attack_windup');
  assert.equal(ready.intent.skillId, null);
  assert.equal(ready.intent.usesConsumed, 0);
  const futurePending = resolve({
    aiState: state({ ...windup.nextState, pendingAction: { ...windup.nextState.pendingAction, issuedAtSec: 999 } }),
    actor: self({ engaged: true }),
    targets: [target()],
    nowSec: 1,
    dtSec: 0.22,
  });
  assert.equal(futurePending.reason, 'pending_action_invalid');
  assert.equal(futurePending.nextState.pendingAction, null);
  assert.equal(resolve({
    aiState: windup.nextState,
    actor: self({ engaged: true, canAttack: false }),
    targets: [target()],
    dtSec: 0.22,
  }).action, 'idle');
  assert.equal(resolve({
    aiState: windup.nextState,
    actor: self({ engaged: true }),
    targets: [target('player', 1.250001, 0)],
    dtSec: 0.22,
  }).reason, 'windup_cancelled_range');
  assert.equal(resolve({
    aiState: windup.nextState,
    actor: self({ engaged: true }),
    targets: [target('player', 1, 0, { alive: false })],
    dtSec: 0.22,
  }).action, 'reset');
  assert.equal(resolve({ actor: self({ capturing: true }), targets: [target()] }).reason, 'actor_capturing');
  assert.equal(resolve({ actor: self({ alive: false, hp: 0 }), targets: [target()] }).reason, 'actor_fainted');
  assert.equal(resolve({
    targets: [target('b', 0, 4), target('a', 0, -4)],
  }).targetId, 'a');
  assert.equal(resolve({
    aiState: state({ state: 'chase', targetId: 'current', retargetRemainingSec: 1 }),
    actor: self({ engaged: true }),
    targets: [target('current', 19, 0), target('near', 1, 0)],
  }).targetId, 'current');
  const hysteresisRetained = module.scoreMonsterTargets({
    self: self(),
    targets: [target('current', 9, 0), target('new', 0, 0)],
    currentTargetId: 'current',
    profile,
    retargetAllowed: true,
  });
  assert.equal(hysteresisRetained.targetId, 'current');
  assert.equal(hysteresisRetained.reason, 'target_hysteresis');
  const hysteresisBoundary = module.scoreMonsterTargets({
    self: self(),
    targets: [target('current', 10, 0), target('new', 0, 0)],
    currentTargetId: 'current',
    profile,
    retargetAllowed: true,
  });
  assert.equal(hysteresisBoundary.targetId, 'new');
  const accepted = module.settleWildAIIntent(ready.nextState, ready.intent, true);
  const rejected = module.settleWildAIIntent(ready.nextState, ready.intent, false);
  assert.equal(accepted.nextState.state, 'recover');
  assert.equal(rejected.nextState.state, 'chase');
  assert.equal(module.settleWildAIIntent(ready.nextState, { ...ready.intent, actionToken: 'forged' }, true).ok, false);
  assert.equal(module.settleWildAIIntent(ready.nextState, { ...ready.intent, commandSource: 'forged-source' }, true).ok, false);
  assert.equal(module.settleWildAIIntent(ready.nextState, { ...ready.intent, issuedAtSec: 999 }, true).ok, false);
  assert.equal(Object.isFrozen(ready), true);
  assert.equal(Object.isFrozen(ready.intent), true);
}

assertPolicyContract(await loadSource(SOURCES.policy[1], SOURCES.policy[0], 'wild-ai-policy-current'));
assertResolverContract(await loadSource(SOURCES.resolver[1], SOURCES.resolver[0], 'wild-ai-resolver-current'));

const policyMutants = [
  ['let a capturing Wild reserve an attacker slot', 'candidate.dead || candidate.capturing || !candidate.targetValid', 'candidate.dead || !candidate.targetValid'],
  ['let a closer newcomer steal an engaged slot', '(candidate?.engaged === true) !== preserveExisting', 'false'],
  ['drop failed-capture resume handoff priority', 'const candidateResumePriority = candidate.resumePriority === true;', 'const candidateResumePriority = false;'],
  ['remove equal-distance stable tie break', '&& String(candidate.id) < String(selected.id)', '&& false'],
  ['change aggro radius', 'aggroRadiusM: ENCOUNTER_POLICY.aggroRadius,', 'aggroRadiusM: 40,'],
  ['change leash radius', 'leashRadiusM: ENCOUNTER_POLICY.leashRadius,', 'leashRadiusM: 8,'],
  ['change disengage radius', 'disengageRadiusM: ENCOUNTER_POLICY.disengageRadius,', 'disengageRadiusM: 200,'],
  ['change Basic range', 'preferredRangeMaxM: 1.25,', 'preferredRangeMaxM: 12.5,'],
  ['skip alert time', 'alertDurationSec: 0.35,', 'alertDurationSec: 0.01,'],
  ['skip windup time', 'windupDurationSec: 0.22,', 'windupDurationSec: 0.01,'],
  ['skip Boss telegraph time', 'windupDurationSec: 0.65,', 'windupDurationSec: 0.22,'],
  ['activate threat weights', 'threatWeight: 0,', 'threatWeight: 1,'],
  ['activate role weights', 'rolePriorityWeight: 0,', 'rolePriorityWeight: 1,'],
  ['claim manual slots', "commandSource: 'wildBasicAI',\n  manualSkillSlots: 'never',", "commandSource: 'wildBasicAI',\n  manualSkillSlots: 's1-s4',"],
  ['consume manual Uses', "commandSource: 'wildBasicAI',\n  manualSkillSlots: 'never',\n  usesConsumed: 0,", "commandSource: 'wildBasicAI',\n  manualSkillSlots: 'never',\n  usesConsumed: 1,"],
];

const resolverMutants = [
  ['score unlocked threat metadata', 'target.recentDamage * profile.threatWeight', 'target.recentDamage'],
  ['score unlocked role metadata', 'target.rolePriority * profile.rolePriorityWeight', 'target.rolePriority'],
  ['accept unknown profile ID', "      ? WILD_BOSS_BASIC_AI_POLICY\n      : null;", "      ? WILD_BOSS_BASIC_AI_POLICY\n      : profile;"],
  ['allow pending action outside windup', "(state.state === 'attack_windup') !== (pendingAction !== null)", 'false'],
  ['accept forged pending token', 'pendingAction.token !== `${state.actorId}:${state.encounterId}:${state.nextActionSequence - 1}`', 'false'],
  ['accept forged pending source', 'pending.commandSource !== WILD_BASIC_AI_POLICY.commandSource', 'false'],
  ['emit future-dated pending intent', 'pending.issuedAtSec !== null && pending.issuedAtSec > snapshot.nowSec', 'false'],
  ['accept unlocked profile weights', "PROFILE_FIELDS.some(field => field !== 'id' && profile[field] !== canonical[field])", 'false'],
  ['allow padded IDs', 'value.trim() === value', 'value.trim().length >= 0'],
  ['allow unexpected fields', "if (keys.length !== fields.length\n    || keys.some(key => typeof key !== 'string' || !fields.includes(key))) return null;", 'if (false) return null;'],
  ['allow actor target collision', 'candidate.id === actorId', 'false'],
  ['allow duplicate targets', 'ids.has(candidate.id)', 'false'],
  ['target dead actor', 'target.alive\n      && target.targetable', 'true\n      && target.targetable'],
  ['target untargetable actor', '&& target.targetable\n      && !target.capturing', '&& true\n      && !target.capturing'],
  ['target capturing actor', '&& !target.capturing\n      && distanceM', '&& true\n      && distanceM'],
  ['exclude aggro boundary', 'target.distanceM <= acquisitionRadiusM', 'target.distanceM < acquisitionRadiusM'],
  ['reset at leash boundary', 'perception.homeDistanceM > profile.leashRadiusM', 'perception.homeDistanceM >= profile.leashRadiusM'],
  ['retain outside disengage', 'distanceM <= profile.disengageRadiusM', 'distanceM <= profile.disengageRadiusM + 1'],
  ['drop provoked acquisition radius', 'const acquisitionRadiusM = selfEngaged ? profile.disengageRadiusM : profile.aggroRadiusM;', 'const acquisitionRadiusM = profile.aggroRadiusM;'],
  ['ignore engagement assignment', 'if (!canEngage) {', 'if (false) {'],
  ['skip alert boundary', 'advancedState.stateElapsedSec < profile.alertDurationSec', 'advancedState.stateElapsedSec <= profile.alertDurationSec'],
  ['attack at range outside boundary', 'target.distanceM > profile.preferredRangeMaxM', 'target.distanceM > profile.preferredRangeMaxM + 1'],
  ['move while blocked', 'if (!self.canMove) {', 'if (false) {'],
  ['attack while blocked', 'if (!self.canAttack) {', 'if (false) {'],
  ['bypass centralized hard lock outside chase', 'if (!self.canMove && !self.canAttack) {', 'if (false) {'],
  ['keep attack lock in chase', "const nextState = transitionState(advancedState, 'recover', 'attack_blocked_by_status', {\n      pendingAction: null,\n    });", 'const nextState = advancedState;'],
  ['leave recover while action locked', "  if (advancedState.state === 'recover') {\n    if (!self.canAttack) {", "  if (advancedState.state === 'recover') {\n    if (false) {"],
  ['ignore forced retreat', 'if (self.forcedRetreat) {', 'if (false) {'],
  ['attack during cooldown', 'if (!self.attackReady) {', 'if (false) {'],
  ['overflow action sequence', 'if (advancedState.nextActionSequence >= Number.MAX_SAFE_INTEGER) {', 'if (false) {'],
  ['skip windup boundary', 'advancedState.stateElapsedSec < profile.windupDurationSec', 'advancedState.stateElapsedSec <= profile.windupDurationSec'],
  ['ignore capturing self', 'if (self.capturing) {', 'if (false) {'],
  ['ignore fainted self', 'if (!self.alive || self.hp <= 0) {', 'if (false) {'],
  ['allow state time overflow', 'if (!Number.isFinite(stateElapsedSec) || !Number.isFinite(retargetRemainingSec)) return null;', 'if (false) return null;'],
  ['reacquire while reset is pending', "if (advancedState.state === 'reset') {", 'if (false) {'],
  ['remove stable tie break', "|| stableIdCompare(left.id, right.id)", '|| 0'],
  ['ignore retarget lock', 'if (current && !retargetAllowed) {', 'if (false) {'],
  ['remove target hysteresis', 'if (best.score < currentScore.score + profile.targetSwitchMargin) {', 'if (false) {'],
  ['include exact target-switch margin', 'if (best.score < currentScore.score + profile.targetSwitchMargin) {', 'if (best.score <= currentScore.score + profile.targetSwitchMargin) {'],
  ['settle rejected attack as accepted', "accepted ? 'recover' : 'chase'", "'recover'"],
  ['accept forged action token', 'state.pendingAction.token !== intent.actionToken', 'false'],
  ['accept forged issue time', 'state.pendingAction.issuedAtSec !== intent.issuedAtSec', 'false'],
  ['emit a manual skill', 'skillId: null,', "skillId: 'SK_NORMAL_01',"],
];

let killed = 0;
for (const [sourceKey, mutants, contract] of [
  ['policy', policyMutants, assertPolicyContract],
  ['resolver', resolverMutants, assertResolverContract],
]) {
  const [filename, original] = SOURCES[sourceKey];
  for (const [name, before, after] of mutants) {
    const mutant = original.replace(before, after);
    assert.notEqual(mutant, original, `${name} mutation target must exist`);
    try {
      contract(await loadSource(mutant, filename, `v810-${sourceKey}-mutant-${killed}`));
    } catch {
      killed += 1;
      continue;
    }
    assert.fail(`${name} mutant survived`);
  }
}

const total = policyMutants.length + resolverMutants.length;
assert.equal(killed, total);
console.log(`V8.10 AI-1 Wild AI resolver mutants: PASS (${killed}/${total} killed)`);
