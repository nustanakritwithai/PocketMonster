import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCombatV91Rng } from '../combat-v91-rng.mjs';
import { COMBAT_V91_RULES_POLICY, resolveCombatV91Proposal } from '../combat-v91-rules.mjs';
import { statusCatalogEntry } from '../status-catalog.mjs';
import { applyEncounterStatus, createEncounterStatusState } from '../status-lifecycle.mjs';
import {
  TEST_RNG_SEEDS,
  TEST_STATS,
  fixtureAction,
  fixtureCombat,
  fixtureProfile,
  fixtureProposal,
  fixtureStatusSnapshot,
  fixtureWorld,
} from './v91-combat-fixtures.mjs';

function statusStateWith(combatId, statusIds) {
  let state = createEncounterStatusState({ encounterId: combatId, nowSec: 0 });
  for (const statusId of statusIds) {
    const definition = statusCatalogEntry(statusId);
    assert.ok(definition, `known test status ${statusId}`);
    const applied = applyEncounterStatus(state, {
      statusId,
      stacks: 1,
      durationSec: definition.baseDurationSec,
      sourceInstanceId: `rules-vector:${statusId}`,
    }, { nowSec: 0 });
    assert.equal(applied.ok, true, `apply ${statusId}`);
    state = applied.state;
  }
  return state;
}

function statusSnapshotWith(profile, combatId, statusIds) {
  return fixtureStatusSnapshot({
    combatId,
    profile,
    state: statusStateWith(combatId, statusIds),
    statusStateVersion: statusIds.length > 0 ? 1 : 0,
  });
}

const rngContext = {
  seed: TEST_RNG_SEEDS.alpha,
  combatId: 'combat:rng-vector',
  actionSequence: 7,
  actorEntityId: 'human:rng',
  targetEntityId: 'monster:rng',
  actionId: 'shared:rng',
  actionFingerprint: 'a'.repeat(64),
  worldSnapshotFingerprint: 'b'.repeat(64),
  rngTicketId: 'rng-ticket:vector',
};
const streamA = createCombatV91Rng(rngContext);
const streamReplay = createCombatV91Rng(rngContext);
assert.equal(streamA.ok, true);
assert.equal(streamA.streamFingerprint, streamReplay.streamFingerprint);
assert.deepEqual([streamA.rng(), streamA.rng(), streamA.rng(), streamA.rng()],
  [streamReplay.rng(), streamReplay.rng(), streamReplay.rng(), streamReplay.rng()]);
const streamB = createCombatV91Rng({ ...rngContext, seed: TEST_RNG_SEEDS.beta });
assert.notEqual(streamA.streamFingerprint, streamB.streamFingerprint);
assert.notEqual(streamA.streamFingerprint, createCombatV91Rng({
  ...rngContext, rngTicketId: 'rng-ticket:other',
}).streamFingerprint, 'the same seed cannot be replayed under another ticket');
assert.notEqual(streamA.streamFingerprint, createCombatV91Rng({
  ...rngContext, actionFingerprint: 'c'.repeat(64),
}).streamFingerprint, 'the same seed is bound to the canonical action definition');
assert.equal(createCombatV91Rng({ ...rngContext, seed: 'bad' }).reason, 'invalid_rng_seed');

const attacker = fixtureProfile({
  entityId: 'monster:rules:fire', ownerDomain: 'Pocket', entityKind: 'Monster', level: 60,
  types: ['Fire'], stateVersion: 5,
  stats: { ...TEST_STATS, hpMax: 221, hpCurrent: 221, atk: 120, spAtk: 167 },
});
const target = fixtureProfile({
  entityId: 'human:rules:target', ownerDomain: 'Pirate', entityKind: 'Human', level: 60,
  types: ['Normal'], stateVersion: 8,
  stats: { ...TEST_STATS, hpMax: 595, hpCurrent: 595, def: 80, spDef: 70, spd: 50 },
});
const action = fixtureAction({
  actionId: 'shared:fire-special', definitionVersion: 'shared-action/v1', channel: 'special',
  power: 55, element: 'Fire', hitCount: 3, criticalAllowed: true, armorPierce: 0.1,
  statusApplications: [{ linkId: 'SL_0004', target: 'target' }],
});
const combatId = 'combat:rules:shared';
const actorStatus = fixtureStatusSnapshot({ combatId, profile: attacker });
const targetStatus = fixtureStatusSnapshot({ combatId, profile: target });
const world = fixtureWorld({
  actor: attacker, target, tick: 10482, seed: TEST_RNG_SEEDS.alpha,
  actorMultipliers: { spAtk: 0.8, spd: 0.85 }, targetMultipliers: { spDef: 1.1 },
});
const fixture = fixtureCombat({ combatId, actor: attacker, target, actorStatus, targetStatus, action, world });
const first = fixtureProposal(fixture);
const replay = fixtureProposal(fixture);
assert.deepEqual(replay, first, 'same Server seed and command produce the same proposal');
assert.equal(first.committed, false);
assert.equal(first.authority, 'deterministic_proposal_only');
assert.equal(first.hit, true);
assert.equal(first.effectiveActorStats.spAtk, attacker.stats.spAtk * 0.8);
assert.equal(first.effectiveTargetStats.spDef, target.stats.spDef * 1.1);
assert.equal(attacker.stats.spAtk, 167, 'World modifier cannot mutate Pocket base stats');
assert.equal(target.stats.spDef, 70, 'World modifier cannot mutate Pirate base stats');
assert.equal(first.hitDamages.reduce((sum, damage) => sum + damage, 0), first.totalDamage);
assert.equal(first.hitDamages.length, 3);
assert.equal(first.predictedHp, Math.max(0, target.stats.hpCurrent - first.totalDamage));
assert.equal(first.predictedStatusTransitions.length, 2);
assert.deepEqual(first.predictedStatusTransitions.map(transition => transition.entityId),
  [attacker.entityId, target.entityId]);
assert.equal(first.predictedStatusSnapshots.length, 2);
assert.equal(first.actorStatusFingerprint, actorStatus.fingerprint);
assert.equal(first.targetStatusFingerprint, targetStatus.fingerprint);
assert.equal(first.rngVersion, 'combat-rng/sha256-counter-v1');
assert.equal(first.rngTicketId, world.rngTicketId);
assert.deepEqual(first.rngTrace.map(entry => entry.label).slice(0, 3), ['hit', 'critical', 'variance']);
assert.match(first.rngStreamFingerprint, /^[0-9a-f]{64}$/);
assert.match(first.predictedCommitFingerprint, /^[0-9a-f]{64}$/);
assert.match(first.predictedResultFingerprint, /^[0-9a-f]{64}$/);

const betaWorld = fixtureWorld({
  actor: attacker, target, tick: 10482, seed: TEST_RNG_SEEDS.beta,
  actorMultipliers: { spAtk: 0.8, spd: 0.85 }, targetMultipliers: { spDef: 1.1 },
});
const beta = fixtureProposal(fixtureCombat({
  combatId, actor: attacker, target, actorStatus, targetStatus, action, world: betaWorld,
}));
assert.notEqual(beta.rngStreamFingerprint, first.rngStreamFingerprint);
assert.notEqual(beta.predictedResultFingerprint, first.predictedResultFingerprint);

assert.equal(resolveCombatV91Proposal({
  combatId, actionSequence: 1, attacker, target, action, worldSnapshot: world,
  targetStatusSnapshot: targetStatus,
}).reason, 'invalid_attacker_status', 'status snapshots are mandatory even when empty');
const unsettledWorld = fixtureWorld({ actor: attacker, target, tick: 10483, combatTimeSec: 1 });
assert.equal(resolveCombatV91Proposal({
  combatId, actionSequence: 1, attacker, target, action, worldSnapshot: unsettledWorld,
  attackerStatusSnapshot: actorStatus, targetStatusSnapshot: targetStatus,
}).reason, 'unsettled_status_clock');

for (const [field, value, expected] of [
  ['targetExists', false, 'target_missing'],
  ['permission', false, 'permission_denied'],
  ['safeZone', true, 'safe_zone'],
  ['inRange', false, 'out_of_range'],
  ['lineOfSight', false, 'line_of_sight_blocked'],
]) {
  const blockedWorld = fixtureWorld({
    actor: attacker, target, tick: 10500, seed: TEST_RNG_SEEDS.gamma,
    validation: { ...world.validation, [field]: value },
  });
  const blocked = resolveCombatV91Proposal({
    combatId, actionSequence: 1, attacker, target, action, worldSnapshot: blockedWorld,
    attackerStatusSnapshot: actorStatus, targetStatusSnapshot: targetStatus,
  });
  assert.equal(blocked.reason, expected);
  assert.equal(blocked.rngDraws, 0, `${field} rejects before seeded RNG consumption`);
}

// Both damage channels use the same resolver while selecting their own shared stat pair.
{
  const channelCombatId = 'combat:rules:channel-vectors';
  const channelActor = fixtureProfile({
    entityId: 'human:rules:channel-actor', ownerDomain: 'Pirate', entityKind: 'Human', level: 40,
    stats: { ...TEST_STATS, atk: 200, spAtk: 40 },
  });
  const channelTarget = fixtureProfile({
    entityId: 'monster:rules:channel-target', ownerDomain: 'Pocket', entityKind: 'Monster', level: 40,
    stats: { ...TEST_STATS, hpMax: 1000, hpCurrent: 1000, def: 100, spDef: 10 },
  });
  const channelWorld = fixtureWorld({
    actor: channelActor, target: channelTarget, tick: 10600, seed: TEST_RNG_SEEDS.alpha,
  });
  const channelActorStatus = fixtureStatusSnapshot({ combatId: channelCombatId, profile: channelActor });
  const channelTargetStatus = fixtureStatusSnapshot({ combatId: channelCombatId, profile: channelTarget });
  const resolveChannel = channel => fixtureProposal(fixtureCombat({
    combatId: channelCombatId,
    actor: channelActor,
    target: channelTarget,
    actorStatus: channelActorStatus,
    targetStatus: channelTargetStatus,
    action: fixtureAction({
      actionId: `shared:channel:${channel}`,
      channel,
      power: 50,
      accuracy: 1,
      criticalAllowed: false,
    }),
    world: channelWorld,
  }));
  const physical = resolveChannel('physical');
  const special = resolveChannel('special');
  assert.equal(physical.hit, true);
  assert.equal(physical.attackStat, channelActor.stats.atk);
  assert.equal(physical.defenseStat, channelTarget.stats.def);
  assert.equal(special.hit, true);
  assert.equal(special.attackStat, channelActor.stats.spAtk);
  assert.equal(special.defenseStat, channelTarget.stats.spDef);
  assert.ok(special.totalDamage > physical.totalDamage,
    'special uses SPATK/SPDEF rather than silently falling back to ATK/DEF');
}

// Accuracy/evasion endpoints are closed at zero and one, independent of the RNG value.
{
  const accuracyCombatId = 'combat:rules:accuracy-boundaries';
  const accuracyActor = fixtureProfile({
    entityId: 'human:rules:accuracy-actor', ownerDomain: 'Pirate', entityKind: 'Human',
    stats: { ...TEST_STATS, accuracy: 1 },
  });
  const targetForEvasion = evasion => fixtureProfile({
    entityId: 'monster:rules:accuracy-target', ownerDomain: 'Pocket', entityKind: 'Monster',
    stats: { ...TEST_STATS, hpMax: 300, hpCurrent: 300, evasion },
  });
  const accuracyVector = ({ actionAccuracy, evasion, targetStatusIds = [] }) => {
    const vectorTarget = targetForEvasion(evasion);
    return fixtureProposal(fixtureCombat({
      combatId: accuracyCombatId,
      actor: accuracyActor,
      target: vectorTarget,
      actorStatus: fixtureStatusSnapshot({ combatId: accuracyCombatId, profile: accuracyActor }),
      targetStatus: statusSnapshotWith(vectorTarget, accuracyCombatId, targetStatusIds),
      action: fixtureAction({
        actionId: `shared:accuracy:${actionAccuracy}:${evasion}:${targetStatusIds.join('-') || 'none'}`,
        accuracy: actionAccuracy,
      }),
      world: fixtureWorld({
        actor: accuracyActor, target: vectorTarget, tick: 10610, seed: TEST_RNG_SEEDS.beta,
      }),
    }));
  };
  const guaranteed = accuracyVector({ actionAccuracy: 1, evasion: 0 });
  assert.equal(guaranteed.hitChance, 1);
  assert.equal(guaranteed.hit, true);
  const zeroAccuracy = accuracyVector({ actionAccuracy: 0, evasion: 0 });
  assert.equal(zeroAccuracy.hitChance, 0);
  assert.equal(zeroAccuracy.hit, false);
  assert.equal(zeroAccuracy.totalDamage, 0);
  const fullEvasion = accuracyVector({ actionAccuracy: 1, evasion: 1 });
  assert.equal(fullEvasion.hitChance, 0);
  assert.equal(fullEvasion.hit, false);
  const statusCappedEvasion = accuracyVector({
    actionAccuracy: 1,
    evasion: 0.9,
    targetStatusIds: ['ST_EVASION_UP'],
  });
  assert.equal(statusCappedEvasion.effectiveTargetStats.evasion, 1);
  assert.equal(statusCappedEvasion.hitChance, 0);
  assert.equal(statusCappedEvasion.hit, false);
}

// Type chart vectors prove immunity, resistance and super-effectiveness in the shared path.
{
  const typeCombatId = 'combat:rules:type-vectors';
  const typeActor = fixtureProfile({
    entityId: 'human:rules:type-actor', ownerDomain: 'Pirate', entityKind: 'Human', level: 30,
    types: [], stats: { ...TEST_STATS, spAtk: 100 },
  });
  const fireAction = fixtureAction({
    actionId: 'shared:type:fire', channel: 'special', power: 60, accuracy: 1,
    element: 'Fire', criticalAllowed: false,
  });
  const resolveFireAgainst = types => {
    const vectorTarget = fixtureProfile({
      entityId: 'monster:rules:type-target', ownerDomain: 'Pocket', entityKind: 'Monster',
      level: 30, types, stats: { ...TEST_STATS, hpMax: 1000, hpCurrent: 1000, spDef: 100 },
    });
    return fixtureProposal(fixtureCombat({
      combatId: typeCombatId,
      actor: typeActor,
      target: vectorTarget,
      action: fireAction,
      world: fixtureWorld({ actor: typeActor, target: vectorTarget, tick: 10620, seed: TEST_RNG_SEEDS.gamma }),
    }));
  };
  const resisted = resolveFireAgainst(['Water']);
  const neutral = resolveFireAgainst(['Normal']);
  const superEffective = resolveFireAgainst(['Grass']);
  assert.equal(resisted.typeMultiplier, 0.5);
  assert.equal(neutral.typeMultiplier, 1);
  assert.equal(superEffective.typeMultiplier, 2);
  assert.ok(resisted.totalDamage < neutral.totalDamage);
  assert.ok(neutral.totalDamage < superEffective.totalDamage);

  const immuneTarget = fixtureProfile({
    entityId: 'monster:rules:type-immune', ownerDomain: 'Pocket', entityKind: 'Monster',
    types: ['Flying'], stats: { ...TEST_STATS, hpMax: 1000, hpCurrent: 1000 },
  });
  const immune = fixtureProposal(fixtureCombat({
    combatId: 'combat:rules:type-immune',
    actor: typeActor,
    target: immuneTarget,
    action: fixtureAction({
      actionId: 'shared:type:ground', power: 500, accuracy: 1,
      element: 'Ground', criticalAllowed: false,
    }),
    seed: TEST_RNG_SEEDS.alpha,
  }));
  assert.equal(immune.hit, true);
  assert.equal(immune.typeMultiplier, 0);
  assert.equal(immune.totalDamage, 0);
  assert.equal(immune.predictedHp, immuneTarget.stats.hpCurrent);
}

// criticalAllowed is authoritative: even 100% Crit cannot bypass a disabled action.
{
  const criticalActor = fixtureProfile({
    entityId: 'human:rules:critical-actor', ownerDomain: 'Pirate', entityKind: 'Human',
    stats: { ...TEST_STATS, atk: 100, crit: 1 },
  });
  const criticalTarget = fixtureProfile({
    entityId: 'monster:rules:critical-target', ownerDomain: 'Pocket', entityKind: 'Monster',
    stats: { ...TEST_STATS, hpMax: 1000, hpCurrent: 1000, def: 100 },
  });
  const criticalVector = criticalAllowed => fixtureProposal(fixtureCombat({
    combatId: 'combat:rules:critical-policy',
    actor: criticalActor,
    target: criticalTarget,
    action: fixtureAction({
      actionId: `shared:critical:${criticalAllowed ? 'enabled' : 'disabled'}`,
      power: 80,
      accuracy: 1,
      criticalAllowed,
    }),
    seed: TEST_RNG_SEEDS.gamma,
  }));
  const disabled = criticalVector(false);
  const enabled = criticalVector(true);
  assert.equal(disabled.criticalChance, 0);
  assert.equal(disabled.critical, false);
  assert.equal(enabled.criticalChance, 1);
  assert.equal(enabled.critical, true);
  assert.ok(enabled.totalDamage > disabled.totalDamage);
  assert.deepEqual(disabled.rngTrace.map(entry => entry.label), ['hit', 'critical', 'variance'],
    'fixed RNG order is retained even when Crit is disabled');
}

// Active lifecycle statuses alter only effective values and application resistance.
{
  const modifierCombatId = 'combat:rules:status-modifiers';
  const modifierActor = fixtureProfile({
    entityId: 'human:rules:modifier-actor', ownerDomain: 'Pirate', entityKind: 'Human',
    stats: { ...TEST_STATS, atk: 100 },
  });
  const modifierTarget = fixtureProfile({
    entityId: 'monster:rules:modifier-target', ownerDomain: 'Pocket', entityKind: 'Monster',
    stats: { ...TEST_STATS, hpMax: 1000, hpCurrent: 1000, def: 100 },
  });
  const modifierAction = fixtureAction({
    actionId: 'shared:status-modifier-hit', power: 100, accuracy: 1, criticalAllowed: false,
  });
  const modifierWorld = fixtureWorld({
    actor: modifierActor, target: modifierTarget, tick: 10630, seed: TEST_RNG_SEEDS.alpha,
  });
  const neutralModifier = fixtureProposal(fixtureCombat({
    combatId: modifierCombatId,
    actor: modifierActor,
    target: modifierTarget,
    actorStatus: statusSnapshotWith(modifierActor, modifierCombatId, []),
    targetStatus: statusSnapshotWith(modifierTarget, modifierCombatId, []),
    action: modifierAction,
    world: modifierWorld,
  }));
  const activeModifier = fixtureProposal(fixtureCombat({
    combatId: modifierCombatId,
    actor: modifierActor,
    target: modifierTarget,
    actorStatus: statusSnapshotWith(modifierActor, modifierCombatId, ['ST_ATK_UP']),
    targetStatus: statusSnapshotWith(modifierTarget, modifierCombatId, ['ST_DEF_UP', 'ST_DAMAGE_REDUCE']),
    action: modifierAction,
    world: modifierWorld,
  }));
  assert.deepEqual(activeModifier.rngTrace, neutralModifier.rngTrace,
    'status modifiers do not replace the deterministic RNG stream');
  assert.ok(Math.abs(activeModifier.effectiveActorStats.atk - 115) < 1e-9);
  assert.equal(activeModifier.effectiveActorStats.spAtk, modifierActor.stats.spAtk);
  assert.ok(Math.abs(activeModifier.effectiveTargetStats.def - 115) < 1e-9);
  assert.ok(activeModifier.totalDamage < neutralModifier.totalDamage,
    'Damage Reduce is applied after the ATK/DEF effective-value calculation');
  assert.equal(modifierActor.stats.atk, 100, 'status modifiers never rewrite Pirate Base Stats');
  assert.equal(modifierTarget.stats.def, 100, 'status modifiers never rewrite Pocket Base Stats');

  const resistanceCombatId = 'combat:rules:status-resistance';
  const resistanceTarget = fixtureProfile({
    entityId: 'monster:rules:resistance-target', ownerDomain: 'Pocket', entityKind: 'Monster',
    types: ['Normal'], stats: { ...TEST_STATS, hpMax: 300, hpCurrent: 300, resistance: 0.25 },
  });
  const resistanceAction = fixtureAction({
    actionId: 'shared:status-resistance-poison', power: 0, accuracy: 1,
    statusApplications: [{ linkId: 'SL_0038', target: 'target' }],
  });
  const resistanceWorld = fixtureWorld({
    actor: modifierActor, target: resistanceTarget, tick: 10631, seed: TEST_RNG_SEEDS.beta,
  });
  const resolveResistance = targetStatusIds => fixtureProposal(fixtureCombat({
    combatId: resistanceCombatId,
    actor: modifierActor,
    target: resistanceTarget,
    actorStatus: fixtureStatusSnapshot({ combatId: resistanceCombatId, profile: modifierActor }),
    targetStatus: statusSnapshotWith(resistanceTarget, resistanceCombatId, targetStatusIds),
    action: resistanceAction,
    world: resistanceWorld,
  }));
  const baseResistance = resolveResistance([]);
  const poisonResistance = resolveResistance(['ST_POISON_RESIST']);
  assert.equal(baseResistance.proposedStatuses[0].finalChance, 0.75);
  assert.equal(poisonResistance.proposedStatuses[0].finalChance, 0.25);
  assert.equal(poisonResistance.effectiveTargetStats.resistance, 0.25,
    'Poison Resist is lifecycle context, not a Base Stat rewrite');

  const immuneStatusTarget = fixtureProfile({
    entityId: 'monster:rules:burn-immune', ownerDomain: 'Pocket', entityKind: 'Monster',
    types: ['Fire'], stats: { ...TEST_STATS, hpMax: 300, hpCurrent: 300 },
  });
  const immuneStatus = fixtureProposal(fixtureCombat({
    combatId: 'combat:rules:status-type-immunity',
    actor: modifierActor,
    target: immuneStatusTarget,
    action: fixtureAction({
      actionId: 'shared:status-type-immunity', power: 0, accuracy: 1,
      statusApplications: [{ linkId: 'SL_0005', target: 'target' }],
    }),
    seed: TEST_RNG_SEEDS.alpha,
  }));
  assert.equal(immuneStatus.proposedStatuses[0].reason, 'type_immune');
  assert.equal(immuneStatus.proposedStatuses[0].applied, false);
  assert.equal(immuneStatus.proposedStatuses[0].finalChance, 0);
  assert.equal(immuneStatus.rngDraws, 3, 'type immunity consumes no status RNG draw');
}

// Lethal resolution suppresses target statuses, yet preserves later self-effects and source ordering.
{
  const lethalCombatId = 'combat:rules:lethal-status-order';
  const lethalActor = fixtureProfile({
    entityId: 'human:rules:lethal-actor', ownerDomain: 'Pirate', entityKind: 'Human',
    stats: { ...TEST_STATS, atk: 500 },
  });
  const lethalTarget = fixtureProfile({
    entityId: 'monster:rules:lethal-target', ownerDomain: 'Pocket', entityKind: 'Monster',
    types: ['Normal'], stats: { ...TEST_STATS, hpMax: 1, hpCurrent: 1, def: 1 },
  });
  const lethal = fixtureProposal(fixtureCombat({
    combatId: lethalCombatId,
    actor: lethalActor,
    target: lethalTarget,
    action: fixtureAction({
      actionId: 'shared:lethal-status-order', power: 1000, accuracy: 1,
      statusApplications: [
        { linkId: 'SL_0005', target: 'target' },
        { linkId: 'SL_0001', target: 'actor' },
      ],
    }),
    seed: TEST_RNG_SEEDS.gamma,
  }));
  assert.equal(lethal.predictedHp, 0);
  assert.equal(lethal.defeatedCandidate, true);
  assert.deepEqual(lethal.proposedStatuses.map(status => ({
    applicationIndex: status.applicationIndex,
    target: status.target,
    statusId: status.statusId,
  })), [{ applicationIndex: 1, target: 'actor', statusId: 'ST_ATK_UP' }]);
  assert.deepEqual(lethal.predictedStatusTransitions[0].attempts.map(attempt => attempt.applicationIndex), [1]);
  assert.deepEqual(lethal.predictedStatusTransitions[1].attempts, []);
  assert.deepEqual(lethal.predictedStatusApplied, [{
    statusId: 'ST_ATK_UP', targetEntityId: lethalActor.entityId,
  }]);
  assert.deepEqual(lethal.rngTrace.map(entry => entry.label), ['hit', 'critical', 'variance'],
    'skipped lethal target status cannot consume a roll before the later self-buff');
}

const statusOnlyAction = fixtureAction({
  actionId: 'shared:cross-owner-status', power: 0,
  statusApplications: [
    { linkId: 'SL_0001', target: 'actor' },
    { linkId: 'SL_0005', target: 'target' },
  ],
});
const statusOnly = fixtureProposal(fixtureCombat({
  combatId: 'combat:rules:status-only', actor: fixtureProfile({
    entityId: 'human:buff-owner', ownerDomain: 'Pirate', entityKind: 'Human', types: ['Normal'],
  }), target: fixtureProfile({
    entityId: 'monster:debuff-owner', ownerDomain: 'Pocket', entityKind: 'Monster', types: ['Normal'],
  }), action: statusOnlyAction, seed: TEST_RNG_SEEDS.alpha,
}));
assert.equal(statusOnly.totalDamage, 0);
assert.equal(statusOnly.targetStateVersionAfter, statusOnly.targetStateVersion);
assert.equal(statusOnly.predictedStatusTransitions.length, 2);
assert.deepEqual(statusOnly.predictedStatusTransitions.map(transition => transition.ownerDomain), ['Pirate', 'Pocket']);
assert.equal(statusOnly.predictedStatusTransitions[0].attempts[0].statusId, 'ST_ATK_UP');
assert.deepEqual(statusOnly.predictedStatusTransitions.flatMap(transition => transition.attempts)
  .map(attempt => attempt.applicationIndex), [0, 1],
'cross-owner status attempts retain canonical action-definition order');
assert.deepEqual(statusOnly.predictedStatusApplied.map(status => status.statusId),
  ['ST_ATK_UP', 'ST_BURN']);
assert.equal(statusOnly.predictedStatusTransitions[0].changed, true, 'self-buff changes actor status only');

const duplicateAction = fixtureAction({
  actionId: 'shared:duplicate-status', power: 0,
  statusApplications: [
    { linkId: 'SL_0005', target: 'target' },
    { linkId: 'SL_0005', target: 'target' },
  ],
});
const duplicateFixture = fixtureCombat({ combatId: 'combat:rules:duplicate', action: duplicateAction });
assert.equal(resolveCombatV91Proposal({
  combatId: duplicateFixture.combatId, actionSequence: 1,
  attacker: duplicateFixture.actor, target: duplicateFixture.target,
  action: duplicateFixture.action, worldSnapshot: duplicateFixture.world,
  attackerStatusSnapshot: duplicateFixture.actorStatus,
  targetStatusSnapshot: duplicateFixture.targetStatus,
}).reason, 'duplicate_status_application');

for (const [entityKind, ownerDomain] of [
  ['Human', 'Pirate'], ['Monster', 'Pocket'], ['Npc', 'Pirate'], ['Boss', 'Pocket'], ['Ship', 'Pirate'],
]) {
  const actor = fixtureProfile({
    entityId: `${entityKind}:rules-actor`, ownerDomain, entityKind, stats: TEST_STATS,
  });
  const otherOwner = ownerDomain === 'Pirate' ? 'Pocket' : 'Pirate';
  const otherKind = otherOwner === 'Pocket' ? 'Monster' : 'Human';
  const target = fixtureProfile({
    entityId: `${entityKind}:rules-target`, ownerDomain: otherOwner, entityKind: otherKind,
    stats: TEST_STATS,
  });
  const resolved = fixtureProposal(fixtureCombat({
    combatId: `combat:kind:${entityKind}`, actor, target, action: fixtureAction({
      actionId: `shared:kind:${entityKind}`,
    }), seed: TEST_RNG_SEEDS.gamma,
  }));
  assert.equal(resolved.schemaVersion, 'combat-proposal/v9.1', `${entityKind} uses the shared path`);
}

const rulesSource = fs.readFileSync(new URL('../combat-v91-rules.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(rulesSource, /if\s*\([^)]*(ownerDomain|entityKind)/,
  'CombatRules cannot choose a damage formula by domain or entity kind');
assert.equal(COMBAT_V91_RULES_POLICY.sharedPath, 'all_entity_kinds');

console.log('V9.1 shared CombatRules: PASS (damage/type/accuracy/status/lethal vectors, deterministic transitions)');
