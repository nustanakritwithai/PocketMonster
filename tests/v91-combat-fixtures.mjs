import {
  createCombatActionDefinition,
  createCombatProfile,
  createWorldCombatSnapshot,
} from '../combat-v91-contract.mjs';
import {
  createCombatAuthorityOutcome,
  createCombatAuthorityResponse,
  createCombatPredictionEnvelope,
} from '../combat-v91-protocol.mjs';
import { resolveCombatV91Proposal } from '../combat-v91-rules.mjs';
import { createCombatStatusSnapshot } from '../combat-v91-status.mjs';
import { createEncounterStatusState } from '../status-lifecycle.mjs';

export const TEST_RNG_SEEDS = Object.freeze({
  alpha: '1'.repeat(64),
  beta: '2'.repeat(64),
  gamma: '3'.repeat(64),
});

export const TEST_RATINGS = Object.freeze({
  accuracy: 1,
  crit: 0,
  evasion: 0,
  resistance: 0,
  penetration: 0,
});

export const TEST_STATS = Object.freeze({
  hpMax: 160,
  hpCurrent: 160,
  atk: 48,
  def: 32,
  spAtk: 42,
  spDef: 30,
  spd: 28,
  ...TEST_RATINGS,
});

export const TEST_DYNAMICS_SOURCE_PROVENANCE_FINGERPRINT = 'a'.repeat(64);

export function fixtureDirectDynamics(action, {
  definitionVersion = `${action.actionId}/test-dynamics-v1`,
} = {}) {
  return {
    actionId: action.actionId,
    definitionVersion,
    windupTicks: 1,
    castTicks: 1,
    activeTicks: 1,
    recoveryTicks: 1,
    impactWindows: [{
      windowId: `${action.actionId}:direct-contact`,
      opensAtActiveTick: 0,
      closesAtActiveTickExclusive: 1,
      hits: [{ hitOrdinal: 0, atActiveTick: 0, delivery: 'direct' }],
    }],
    comboWindow: null,
    cancelPolicy: { windows: [] },
    interruptPolicy: {
      allowedPhases: ['windup', 'cast', 'active', 'recovery'],
      allowedReasons: ['damage'],
      superArmorPhases: [],
    },
    resourceCosts: [],
    projectiles: [],
    impulses: [],
    guard: null,
    movementLocks: [],
    hitstopPresentation: null,
  };
}

export function must(result, label = 'fixture') {
  if (!result?.ok) {
    const error = new Error(`${label}: ${result?.reason ?? 'unknown failure'}`);
    error.result = result;
    throw error;
  }
  return result;
}

export function fixtureProfile({
  entityId,
  ownerDomain,
  entityKind,
  stats = TEST_STATS,
  level = 25,
  types = [],
  stateVersion = 1,
  progressionStateVersion = `${entityId}/progression-v1`,
  calculationVersion = `${ownerDomain.toLowerCase()}/calculator-v1`,
  definitionVersion = `${ownerDomain.toLowerCase()}/definition-v1`,
} = {}) {
  return must(createCombatProfile({
    entityId,
    ownerDomain,
    entityKind,
    level,
    types,
    stats,
    progressionStateVersion,
    calculationVersion,
    definitionVersion,
    stateVersion,
  }), `profile ${entityId}`).profile;
}

export function fixtureStatusSnapshot({
  combatId,
  profile,
  state = createEncounterStatusState({ encounterId: combatId, nowSec: 0 }),
  statusStateVersion = 0,
} = {}) {
  return must(createCombatStatusSnapshot({
    authority: 'server',
    combatId,
    entityId: profile.entityId,
    ownerDomain: profile.ownerDomain,
    statusStateVersion,
    state,
  }), `status snapshot ${profile.entityId}`).snapshot;
}

export function fixtureWorld({
  actor,
  target,
  tick = 50,
  combatTimeSec = 0,
  seed = TEST_RNG_SEEDS.alpha,
  ticketId = `rng:${actor.entityId}:${target.entityId}:${tick}`,
  ticketStateVersion = 1,
  expiresAtWorldTick = tick + 10,
  actorMultipliers = {},
  targetMultipliers = {},
  validation = {
    targetExists: true,
    permission: true,
    inRange: true,
    lineOfSight: true,
    safeZone: false,
  },
} = {}) {
  return must(createWorldCombatSnapshot({
    authority: 'server',
    worldSnapshotTick: tick,
    combatTimeSec,
    worldModifierVersion: 'fixture-world/v1',
    actorEntityId: actor.entityId,
    targetEntityId: target.entityId,
    actorMultipliers,
    targetMultipliers,
    validation,
    rngVersion: 'combat-rng/sha256-counter-v1',
    rngSeed: seed,
    rngTicketId: ticketId,
    rngTicketStateVersion: ticketStateVersion,
    rngExpiresAtWorldTick: expiresAtWorldTick,
  }), 'world snapshot').snapshot;
}

export function fixtureAction({
  actionId = 'shared:fixture-action',
  definitionVersion = `${actionId}/v1`,
  channel = 'physical',
  power = 40,
  accuracy = 1,
  element = null,
  hitCount = 1,
  criticalAllowed = false,
  armorPierce = 0,
  statusApplications = [],
} = {}) {
  return must(createCombatActionDefinition({
    actionId,
    definitionVersion,
    channel,
    power,
    accuracy,
    element,
    hitCount,
    criticalAllowed,
    armorPierce,
    statusApplications,
  }), `action ${actionId}`).action;
}

export function fixtureCombat({
  combatId = 'combat:fixture',
  actor = fixtureProfile({
    entityId: 'human:fixture', ownerDomain: 'Pirate', entityKind: 'Human',
  }),
  target = fixtureProfile({
    entityId: 'monster:fixture', ownerDomain: 'Pocket', entityKind: 'Monster',
    stats: { ...TEST_STATS, hpMax: 240, hpCurrent: 240 },
  }),
  actorStatus,
  targetStatus,
  action = fixtureAction(),
  actionStatProjection = null,
  world,
  tick = 50,
  combatTimeSec = 0,
  seed = TEST_RNG_SEEDS.alpha,
} = {}) {
  const attackerStatusSnapshot = actorStatus ?? fixtureStatusSnapshot({ combatId, profile: actor });
  const targetStatusSnapshot = targetStatus ?? fixtureStatusSnapshot({ combatId, profile: target });
  return Object.freeze({
    combatId,
    actor,
    target,
    actorStatus: attackerStatusSnapshot,
    targetStatus: targetStatusSnapshot,
    action,
    actionStatProjection,
    world: world ?? fixtureWorld({ actor, target, tick, combatTimeSec, seed }),
  });
}

export function fixtureProposal(fixture, { actionSequence = 1 } = {}) {
  return must(resolveCombatV91Proposal({
    combatId: fixture.combatId,
    actionSequence,
    attacker: fixture.actor,
    target: fixture.target,
    action: fixture.action,
    actionStatProjection: fixture.actionStatProjection,
    worldSnapshot: fixture.world,
    attackerStatusSnapshot: fixture.actorStatus,
    targetStatusSnapshot: fixture.targetStatus,
  }), `proposal ${fixture.combatId}/${actionSequence}`).proposal;
}

export function fixturePrediction(fixture, {
  actionSequence = 1,
  intentId = `intent:${fixture.combatId}:${actionSequence}`,
} = {}) {
  const proposal = fixtureProposal(fixture, { actionSequence });
  const envelope = must(createCombatPredictionEnvelope({ intentId, proposal }), 'prediction envelope').envelope;
  return Object.freeze({ fixture, proposal, envelope });
}

export function committedTargetProfile(target, proposal, {
  hpCurrent = proposal.predictedHp,
  stateVersion = proposal.targetStateVersionAfter,
} = {}) {
  return must(createCombatProfile({
    ...target,
    stats: { ...target.stats, hpCurrent },
    stateVersion,
    fingerprint: undefined,
  }), `committed target ${target.entityId}`).profile;
}

export function fixtureExecutionReceipt({
  fixture,
  proposal,
  dynamicsStateVersion = 0,
  actorOccupancyStateVersion = 0,
  dynamicsPermitFingerprint = 'd'.repeat(64),
  authoritativeDynamicsEffectReceipt = null,
} = {}) {
  return Object.freeze({
    actorEntityId: fixture.actor.entityId,
    actorStateVersionBefore: fixture.actor.stateVersion,
    actorStateVersionAfter: fixture.actor.stateVersion,
    resourceStateVersionBefore: 10,
    resourceStateVersionAfter: 11,
    sequenceStateVersionBefore: proposal.actionSequence,
    sequenceStateVersionAfter: proposal.actionSequence + 1,
    committedActionSequence: proposal.actionSequence,
    rngTicketId: fixture.world.rngTicketId,
    rngTicketStateVersionBefore: fixture.world.rngTicketStateVersion,
    rngTicketStateVersionAfter: fixture.world.rngTicketStateVersion + 1,
    dynamicsStateVersionBefore: dynamicsStateVersion,
    dynamicsStateVersionAfter: dynamicsStateVersion + 1,
    actorOccupancyStateVersionBefore: actorOccupancyStateVersion,
    actorOccupancyStateVersionAfter: actorOccupancyStateVersion + 1,
    dynamicsPermitFingerprint,
    authoritativeDynamicsEffectReceipt,
  });
}

export function fixtureAuthorityResponse(prediction, {
  serverProposal = prediction.proposal,
  authoritativeProfile = committedTargetProfile(prediction.fixture.target, serverProposal),
  authoritativeStatusSnapshots = serverProposal.predictedStatusSnapshots,
  status,
  effectiveConfirmed,
  commitId = `commit:${prediction.envelope.intentId}`,
  executionReceipt = fixtureExecutionReceipt({ fixture: prediction.fixture, proposal: serverProposal }),
} = {}) {
  const resolvedStatus = status ?? (
    serverProposal.predictedResultFingerprint === prediction.envelope.predictedResultFingerprint
      && serverProposal.predictedCommitFingerprint === prediction.envelope.predictedCommitFingerprint
      ? 'confirmed'
      : 'corrected'
  );
  const outcome = must(createCombatAuthorityOutcome({
    combatId: prediction.envelope.combatId,
    intentId: prediction.envelope.intentId,
    actionSequence: prediction.envelope.actionSequence,
    attackerId: prediction.fixture.actor.entityId,
    targetId: prediction.fixture.target.entityId,
    sourceDomain: prediction.fixture.actor.ownerDomain,
    abilityId: prediction.fixture.action.actionId,
    damage: prediction.fixture.target.stats.hpCurrent - authoritativeProfile.stats.hpCurrent,
    damageType: `${prediction.fixture.action.channel}:${prediction.fixture.action.element ?? 'Neutral'}`,
    statusApplied: serverProposal.predictedStatusApplied,
    statusTransitions: serverProposal.predictedStatusTransitions,
    hpBefore: prediction.fixture.target.stats.hpCurrent,
    hpAfter: authoritativeProfile.stats.hpCurrent,
    defeated: authoritativeProfile.entityKind !== 'Monster' && authoritativeProfile.stats.hpCurrent === 0,
    fainted: authoritativeProfile.entityKind === 'Monster' && authoritativeProfile.stats.hpCurrent === 0,
    stateVersionBefore: prediction.fixture.target.stateVersion,
    stateVersionAfter: authoritativeProfile.stateVersion,
    commitId,
    serverProposalFingerprint: serverProposal.predictedResultFingerprint,
    authoritativeCommitFingerprint: serverProposal.predictedCommitFingerprint,
  }), 'authority outcome').outcome;
  const confirmedStats = effectiveConfirmed ?? {
    ...serverProposal.effectiveTargetStats,
    hpMax: authoritativeProfile.stats.hpMax,
    hpCurrent: authoritativeProfile.stats.hpCurrent,
  };
  const response = must(createCombatAuthorityResponse({
    intentId: prediction.envelope.intentId,
    combatId: prediction.envelope.combatId,
    actionSequence: prediction.envelope.actionSequence,
    actorEntityId: prediction.fixture.actor.entityId,
    targetEntityId: prediction.fixture.target.entityId,
    actionId: prediction.fixture.action.actionId,
    actionDefinitionVersion: prediction.fixture.action.definitionVersion,
    status: resolvedStatus,
    reason: null,
    requestEnvelopeFingerprint: prediction.envelope.envelopeFingerprint,
    clientPredictedResultFingerprint: prediction.envelope.predictedResultFingerprint,
    clientPredictedCommitFingerprint: prediction.envelope.predictedCommitFingerprint,
    serverProposalFingerprint: serverProposal.predictedResultFingerprint,
    authoritativeCommitFingerprint: serverProposal.predictedCommitFingerprint,
    authoritativeProfile,
    resyncProfiles: [],
    effectiveConfirmed: confirmedStats,
    authoritativeStatusSnapshots,
    authoritativeOutcome: outcome,
    executionReceipt,
  }), 'authority response').response;
  return Object.freeze({ response, outcome, authoritativeProfile, serverProposal });
}

export function fixtureRejectedResponse(prediction, {
  reason = 'STALE_WORLD_SNAPSHOT',
  resyncProfiles = [],
  authoritativeStatusSnapshots = [],
} = {}) {
  return must(createCombatAuthorityResponse({
    intentId: prediction.envelope.intentId,
    combatId: prediction.envelope.combatId,
    actionSequence: prediction.envelope.actionSequence,
    actorEntityId: prediction.fixture.actor.entityId,
    targetEntityId: prediction.fixture.target.entityId,
    actionId: prediction.fixture.action.actionId,
    actionDefinitionVersion: prediction.fixture.action.definitionVersion,
    status: 'rejected',
    reason,
    requestEnvelopeFingerprint: prediction.envelope.envelopeFingerprint,
    clientPredictedResultFingerprint: prediction.envelope.predictedResultFingerprint,
    clientPredictedCommitFingerprint: prediction.envelope.predictedCommitFingerprint,
    resyncProfiles,
    authoritativeStatusSnapshots,
  }), 'rejected authority response').response;
}
