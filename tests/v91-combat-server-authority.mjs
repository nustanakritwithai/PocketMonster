import assert from 'node:assert/strict';
import {
  PIRATE_COMBAT_DEFINITION_VERSION,
  createDomainCombatProfile,
} from '../combat-v91-adapters.mjs';
import {
  createCombatActionDefinition,
  createWorldCombatSnapshot,
  fingerprintCombatValue,
} from '../combat-v91-contract.mjs';
import {
  createCombatPredictionEnvelope,
  validateCombatAuthorityResponse,
} from '../combat-v91-protocol.mjs';
import { COMBAT_V91_RNG_VERSION } from '../combat-v91-rng.mjs';
import { resolveCombatV91Proposal } from '../combat-v91-rules.mjs';
import { createCombatStatusSnapshot } from '../combat-v91-status.mjs';
import { createEncounterStatusState } from '../status-lifecycle.mjs';
import {
  COMBAT_V91_ACTION_PERMIT_SCHEMA,
  COMBAT_V91_AUTHORITY_TRANSACTION_SCHEMA,
  COMBAT_V91_RNG_TICKET_SCHEMA,
  COMBAT_V91_SERVER_AUTHORITY_POLICY,
  COMBAT_V91_SERVER_AUTHORITY_VERSION,
  executeCombatV91AuthorityV2,
} from '../combat-v91-server-authority.mjs';

const clone = value => structuredClone(value);
const ratings = Object.freeze({
  accuracy: 1,
  crit: 0,
  evasion: 0,
  resistance: 0,
  penetration: 0,
});

function domainProfile(source) {
  const created = createDomainCombatProfile(source);
  assert.equal(created.ok, true, created.reason);
  return created.profile;
}

function makeStatusSnapshot(profile, combatId, statusStateVersion = 0) {
  const created = createCombatStatusSnapshot({
    authority: 'server',
    combatId,
    entityId: profile.entityId,
    ownerDomain: profile.ownerDomain,
    statusStateVersion,
    state: createEncounterStatusState({ encounterId: combatId, nowSec: 0 }),
  });
  assert.equal(created.ok, true, created.reason);
  return created.snapshot;
}

function makeTicket({
  combatId,
  actorEntityId,
  targetEntityId,
  actionId,
  actionSequence = 1,
  ticketId,
  seed,
  stateVersion = 0,
  expiresAtWorldTick = 100,
}) {
  const payload = {
    schemaVersion: COMBAT_V91_RNG_TICKET_SCHEMA,
    authority: 'server',
    ticketId,
    rngVersion: COMBAT_V91_RNG_VERSION,
    seed,
    combatId,
    actorEntityId,
    targetEntityId,
    actionId,
    actionSequence,
    stateVersion,
    expiresAtWorldTick,
  };
  return Object.freeze({ ...payload, fingerprint: fingerprintCombatValue(payload) });
}

function makeWorld({ actor, target, ticket, tick = 10 }) {
  const created = createWorldCombatSnapshot({
    authority: 'server',
    worldSnapshotTick: tick,
    combatTimeSec: 0,
    worldModifierVersion: `world/v2:${tick}:${ticket.stateVersion}`,
    actorEntityId: actor.entityId,
    targetEntityId: target.entityId,
    actorMultipliers: {},
    targetMultipliers: {},
    validation: {
      targetExists: true,
      permission: true,
      inRange: true,
      lineOfSight: true,
      safeZone: false,
    },
    rngVersion: ticket.rngVersion,
    rngSeed: ticket.seed,
    rngTicketId: ticket.ticketId,
    rngTicketStateVersion: ticket.stateVersion,
    rngExpiresAtWorldTick: ticket.expiresAtWorldTick,
  });
  assert.equal(created.ok, true, created.reason);
  return created.snapshot;
}

let scenarioCounter = 0;
function makeScenario({
  accuracy = 1,
  statusApplications = [],
  direction = 'PirateToPocket',
  targetCurrentHp,
  actionPower = 20,
} = {}) {
  scenarioCounter += 1;
  const suffix = String(scenarioCounter);
  const combatId = `combat:v2:${suffix}`;
  assert.ok(['PirateToPocket', 'PocketToPirate'].includes(direction));
  const pirateSource = {
    ownerDomain: 'Pirate',
    profileInput: {
      entityId: `human:v2:${suffix}`,
      entityKind: 'Human',
      level: 15,
      progression: {
        combat: 10,
        vitality: 10,
        blade: 10,
        ranged: 10,
        fruitPower: 10,
        mana: 10,
      },
      currentHp: 145,
      types: [],
      combatDefinition: {
        definitionVersion: PIRATE_COMBAT_DEFINITION_VERSION,
        physicalCategory: 'style',
        physicalBaseDamage: 10,
        specialBaseDamage: 10,
        def: 10,
        spDef: 10,
        spd: 10,
        ...ratings,
      },
      progressionStateVersion: `pirate-progression/v2:${suffix}`,
      stateVersion: 1,
    },
  };
  const pocketSource = {
    ownerDomain: 'Pocket',
    profileInput: {
      entityId: `monster:v2:${suffix}`,
      entityKind: 'Monster',
      formId: 'MON_002',
      level: 15,
      currentHp: 41,
      ratings: { ...ratings },
      progressionStateVersion: `pocket-progression/v2:${suffix}`,
      stateVersion: 2,
    },
  };
  const actorSource = direction === 'PirateToPocket' ? pirateSource : pocketSource;
  const targetSource = direction === 'PirateToPocket' ? pocketSource : pirateSource;
  if (targetCurrentHp !== undefined) targetSource.profileInput.currentHp = targetCurrentHp;
  const actor = domainProfile(actorSource);
  const target = domainProfile(targetSource);
  const actionResult = createCombatActionDefinition({
    actionId: `shared:v2-action:${suffix}`,
    definitionVersion: `shared-action/v2:${suffix}`,
    channel: 'physical',
    power: actionPower,
    accuracy,
    element: null,
    hitCount: 1,
    criticalAllowed: false,
    armorPierce: 0,
    statusApplications,
  });
  assert.equal(actionResult.ok, true, actionResult.reason);
  const action = actionResult.action;
  const seed = scenarioCounter.toString(16).padStart(64, '0');
  const ticket = makeTicket({
    combatId,
    actorEntityId: actor.entityId,
    targetEntityId: target.entityId,
    actionId: action.actionId,
    ticketId: `rng-ticket:v2:${suffix}`,
    seed,
  });
  const world = makeWorld({ actor, target, ticket });
  const actorStatus = makeStatusSnapshot(actor, combatId);
  const targetStatus = makeStatusSnapshot(target, combatId);
  const proposalResult = resolveCombatV91Proposal({
    combatId,
    actionSequence: 1,
    attacker: actor,
    target,
    action,
    worldSnapshot: world,
    attackerStatusSnapshot: actorStatus,
    targetStatusSnapshot: targetStatus,
  });
  assert.equal(proposalResult.ok, true, proposalResult.reason);
  return Object.freeze({
    combatId,
    context: Object.freeze({
      principalId: `principal:v2:${suffix}`,
      sessionId: `session:v2:${suffix}`,
      idempotencyScope: `scope:v2:${suffix}`,
    }),
    actorSource,
    targetSource,
    actor,
    target,
    action,
    ticket,
    world,
    actorStatus,
    targetStatus,
    proposal: proposalResult.proposal,
  });
}

function predictionEnvelope(scenario, intentId, mutateProposal = proposal => proposal) {
  const proposal = mutateProposal(scenario.proposal);
  const created = createCombatPredictionEnvelope({ intentId, proposal });
  assert.equal(created.ok, true, created.reason);
  return Object.freeze({ proposal, envelope: created.envelope });
}

function driftResultFingerprint(proposal) {
  const changed = {
    ...proposal,
    hitChance: proposal.hitChance === 1 ? 0.999 : Math.min(1, proposal.hitChance + 0.001),
  };
  delete changed.predictedResultFingerprint;
  return Object.freeze({
    ...changed,
    predictedResultFingerprint: fingerprintCombatValue(changed),
  });
}

function terminalKey(identity) {
  return `${identity.scope}\u0000${identity.combatId}\u0000${identity.intentId}`;
}

class AtomicHarness {
  constructor(scenario, {
    unauthorizedReason = null,
    serverWorld = scenario.world,
    serverActorStatus = scenario.actorStatus,
    serverTargetStatus = scenario.targetStatus,
    serverTicket = scenario.ticket,
    concurrentApplyBarrier = 0,
    corruptCommit = null,
    corruptDefeatSemantics = false,
    forceFinalizerFailure = false,
  } = {}) {
    this.scenario = scenario;
    this.unauthorizedReason = unauthorizedReason;
    this.corruptCommit = corruptCommit;
    this.corruptDefeatSemantics = corruptDefeatSemantics;
    this.forceFinalizerFailure = forceFinalizerFailure;
    this.profileSources = new Map([
      [scenario.actor.entityId, clone(scenario.actorSource)],
      [scenario.target.entityId, clone(scenario.targetSource)],
    ]);
    this.statusSnapshots = new Map([
      [scenario.actor.entityId, clone(serverActorStatus)],
      [scenario.target.entityId, clone(serverTargetStatus)],
    ]);
    this.world = clone(serverWorld);
    this.ticket = { ...clone(serverTicket), consumed: false };
    this.actorExecution = {
      actorStateVersion: scenario.actor.stateVersion,
      resourceStateVersion: 4,
      entitlementStateVersion: 6,
      sequenceStateVersion: 7,
    };
    this.terminal = new Map();
    this.domainMutationCount = 0;
    this.targetWriteCount = 0;
    this.targetOwnerCommitDomains = [];
    this.statusOwnerWriteCount = 0;
    this.terminalWriteCount = 0;
    this.rollbackCount = 0;
    this.transactionAttemptCount = 0;
    this._lockTail = Promise.resolve();
    this._barrierTarget = concurrentApplyBarrier;
    this._barrierArrivals = 0;
    this._barrierRelease = null;
    this._barrierPromise = concurrentApplyBarrier > 0
      ? new Promise(resolve => { this._barrierRelease = resolve; })
      : Promise.resolve();
  }

  currentSource(entityId) {
    return clone(this.profileSources.get(entityId));
  }

  currentProfile(entityId) {
    return domainProfile(this.currentSource(entityId));
  }

  currentStatus(entityId) {
    return clone(this.statusSnapshots.get(entityId));
  }

  makePermit({ authorityContext, combatId, actorProfile, targetProfile, actionId, actionSequence }) {
    assert.equal(actionId, this.scenario.action.actionId);
    const payload = {
      schemaVersion: COMBAT_V91_ACTION_PERMIT_SCHEMA,
      authority: 'server',
      permitId: `permit:${combatId}:${actionSequence}`,
      principalId: authorityContext.principalId,
      sessionId: authorityContext.sessionId,
      combatId,
      actorEntityId: actorProfile.entityId,
      targetEntityId: targetProfile.entityId,
      nextActionSequence: actionSequence,
      action: this.scenario.action,
      actorStateVersion: this.actorExecution.actorStateVersion,
      actorStateVersionAfter: this.actorExecution.actorStateVersion,
      resourceStateVersion: this.actorExecution.resourceStateVersion,
      resourceStateVersionAfter: this.actorExecution.resourceStateVersion + 1,
      entitlementStateVersion: this.actorExecution.entitlementStateVersion,
      sequenceStateVersion: this.actorExecution.sequenceStateVersion,
      sequenceStateVersionAfter: this.actorExecution.sequenceStateVersion + 1,
      resourceCommitToken: `resource-token:${combatId}:${actionSequence}:${this.actorExecution.resourceStateVersion}`,
    };
    return Object.freeze({ ...payload, fingerprint: fingerprintCombatValue(payload) });
  }

  ticketForLoad() {
    const { consumed: _consumed, ...ticket } = this.ticket;
    return clone(ticket);
  }

  dependencies() {
    return {
      readTerminalResponse: async identity => {
        await Promise.resolve();
        return this.terminal.get(terminalKey(identity))?.response ?? null;
      },
      loadProfileSource: async ({ entityId }) => this.currentSource(entityId),
      authorizeAction: async request => this.unauthorizedReason
        ? { authorized: false, reason: this.unauthorizedReason }
        : { authorized: true, permit: this.makePermit(request) },
      loadWorldSnapshot: async () => clone(this.world),
      loadStatusSnapshot: async ({ entityId }) => this.currentStatus(entityId),
      loadRngTicket: async () => this.ticketForLoad(),
      transactCombatIntent: async (command, finalize) => this.transact(command, finalize),
    };
  }

  async waitAtApplyBarrier(command) {
    if (command.mode !== 'apply' || this._barrierTarget <= 0) return;
    this._barrierArrivals += 1;
    if (this._barrierArrivals === this._barrierTarget) this._barrierRelease();
    await this._barrierPromise;
  }

  async withGlobalLock(operation) {
    const previous = this._lockTail;
    let release;
    this._lockTail = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  rejectionReceipt(command, reason) {
    const actorId = command.actorProfile?.entityId ?? this.scenario.actor.entityId;
    const targetId = command.targetProfile?.entityId ?? this.scenario.target.entityId;
    return {
      committed: false,
      reason,
      resyncProfileSources: [this.currentSource(actorId), this.currentSource(targetId)],
      authoritativeStatusSnapshots: [this.currentStatus(actorId), this.currentStatus(targetId)],
    };
  }

  async transact(command, finalize) {
    assert.equal(command.schemaVersion, COMBAT_V91_AUTHORITY_TRANSACTION_SCHEMA);
    assert.equal(command.authority, 'server');
    this.transactionAttemptCount += 1;
    await this.waitAtApplyBarrier(command);
    return this.withGlobalLock(async () => {
      const key = terminalKey(command.idempotency);
      const existing = this.terminal.get(key);
      if (existing) {
        if (existing.requestEnvelopeFingerprint !== command.idempotency.requestEnvelopeFingerprint) {
          throw Object.assign(new Error('idempotency conflict inside transaction'), {
            code: 'IDEMPOTENCY_CONFLICT',
          });
        }
        return { atomic: true, disposition: 'replayed', response: existing.response };
      }

      if (command.mode === 'reject') {
        const response = finalize(clone(command.rejectionReceipt));
        this.terminal.set(key, {
          requestEnvelopeFingerprint: command.idempotency.requestEnvelopeFingerprint,
          response,
        });
        this.terminalWriteCount += 1;
        return { atomic: true, disposition: 'rejected', response };
      }

      assert.equal(command.mode, 'apply');
      const expected = command.expected;
      const liveActorSource = this.currentSource(command.actorProfile.entityId);
      const liveTargetSource = this.currentSource(command.targetProfile.entityId);
      const liveActorStatus = this.currentStatus(command.actorProfile.entityId);
      const liveTargetStatus = this.currentStatus(command.targetProfile.entityId);
      let casReason = null;
      if (this.ticket.consumed || this.ticket.stateVersion !== expected.rngTicketStateVersion) {
        casReason = 'RNG_TICKET_ALREADY_CONSUMED';
      } else if (this.ticket.ticketId !== expected.rngTicketId) {
        casReason = 'RNG_TICKET_CAS_MISMATCH';
      } else if (fingerprintCombatValue(liveActorSource) !== expected.actorProfileSourceFingerprint
        || fingerprintCombatValue(liveTargetSource) !== expected.targetProfileSourceFingerprint) {
        casReason = 'PROFILE_SOURCE_CAS_MISMATCH';
      } else if (liveActorStatus.statusStateVersion !== expected.actorStatusStateVersion
        || liveTargetStatus.statusStateVersion !== expected.targetStatusStateVersion
        || liveActorStatus.fingerprint !== expected.actorStatusFingerprint
        || liveTargetStatus.fingerprint !== expected.targetStatusFingerprint) {
        casReason = 'STATUS_CAS_MISMATCH';
      } else if (this.actorExecution.actorStateVersion !== expected.actorProfileStateVersion
        || this.actorExecution.resourceStateVersion !== expected.actorResourceStateVersion
        || this.actorExecution.entitlementStateVersion !== expected.actionEntitlementStateVersion
        || this.actorExecution.sequenceStateVersion !== expected.combatSequenceStateVersion) {
        casReason = 'ACTOR_EXECUTION_CAS_MISMATCH';
      } else if (this.world.fingerprint !== expected.worldSnapshotFingerprint) {
        casReason = 'WORLD_SNAPSHOT_CAS_MISMATCH';
      }
      if (casReason) {
        const response = finalize(this.rejectionReceipt(command, casReason));
        this.terminal.set(key, {
          requestEnvelopeFingerprint: command.idempotency.requestEnvelopeFingerprint,
          response,
        });
        this.terminalWriteCount += 1;
        return { atomic: true, disposition: 'rejected', response };
      }

      const stagedTargetSource = clone(liveTargetSource);
      stagedTargetSource.profileInput.currentHp = command.mutation.targetHpAfter;
      stagedTargetSource.profileInput.stateVersion = command.mutation.targetStateVersionAfter;
      if (this.corruptCommit === 'base') {
        stagedTargetSource.profileInput.ratings.resistance = 0.25;
      } else if (this.corruptCommit === 'provenance') {
        stagedTargetSource.profileInput.progressionStateVersion += ':forged';
      }
      const stagedStatuses = command.mutation.authoritativeStatusSnapshots.map(clone);
      const stagedExecution = {
        actorStateVersion: command.actionPermit.actorStateVersionAfter,
        resourceStateVersion: command.actionPermit.resourceStateVersionAfter,
        entitlementStateVersion: command.actionPermit.entitlementStateVersion,
        sequenceStateVersion: command.actionPermit.sequenceStateVersionAfter,
      };
      const stagedTicket = {
        ...this.ticketForLoad(),
        stateVersion: this.ticket.stateVersion + 1,
        consumed: true,
      };
      const committedProfile = domainProfile(stagedTargetSource);
      const hpZero = committedProfile.stats.hpCurrent === 0;
      const receipt = {
        committed: true,
        commitId: `commit:${command.idempotency.intentId}`,
        authoritativeTargetSource: stagedTargetSource,
        authoritativeStatusSnapshots: stagedStatuses,
        statusApplied: clone(command.mutation.statusApplied),
        defeated: committedProfile.entityKind !== 'Monster' && hpZero,
        fainted: committedProfile.entityKind === 'Monster' && hpZero,
        executionReceipt: {
          actorEntityId: command.actorProfile.entityId,
          actorStateVersionBefore: command.actionPermit.actorStateVersion,
          actorStateVersionAfter: command.actionPermit.actorStateVersionAfter,
          resourceStateVersionBefore: command.actionPermit.resourceStateVersion,
          resourceStateVersionAfter: command.actionPermit.resourceStateVersionAfter,
          sequenceStateVersionBefore: command.actionPermit.sequenceStateVersion,
          sequenceStateVersionAfter: command.actionPermit.sequenceStateVersionAfter,
          committedActionSequence: command.mutation.committedActionSequence,
          rngTicketId: this.ticket.ticketId,
          rngTicketStateVersionBefore: this.ticket.stateVersion,
          rngTicketStateVersionAfter: this.ticket.stateVersion + 1,
        },
      };
      if (this.corruptDefeatSemantics) {
        [receipt.defeated, receipt.fainted] = [receipt.fainted, receipt.defeated];
      }
      if (this.forceFinalizerFailure) delete receipt.executionReceipt;

      let response;
      try {
        response = finalize(receipt);
      } catch (error) {
        this.rollbackCount += 1;
        throw error;
      }
      assert.equal(validateCombatAuthorityResponse(response).ok, true);

      const targetChanged = fingerprintCombatValue(liveTargetSource) !== fingerprintCombatValue(stagedTargetSource);
      this.profileSources.set(command.targetProfile.entityId, clone(stagedTargetSource));
      for (const snapshot of stagedStatuses) {
        const before = this.statusSnapshots.get(snapshot.entityId);
        if (before.fingerprint !== snapshot.fingerprint) this.statusOwnerWriteCount += 1;
        this.statusSnapshots.set(snapshot.entityId, clone(snapshot));
      }
      this.actorExecution = stagedExecution;
      this.ticket = stagedTicket;
      this.domainMutationCount += 1;
      if (targetChanged) {
        this.targetWriteCount += 1;
        this.targetOwnerCommitDomains.push(command.targetProfile.ownerDomain);
      }
      this.terminal.set(key, {
        requestEnvelopeFingerprint: command.idempotency.requestEnvelopeFingerprint,
        response,
      });
      this.terminalWriteCount += 1;
      return { atomic: true, disposition: 'committed', response };
    });
  }
}

async function execute(harness, prediction) {
  return executeCombatV91AuthorityV2({
    envelope: prediction.envelope,
    authorityContext: harness.scenario.context,
  }, harness.dependencies());
}

assert.equal(COMBAT_V91_SERVER_AUTHORITY_VERSION, 'combat-v91-server-authority/v2');
assert.equal(COMBAT_V91_SERVER_AUTHORITY_POLICY.profileAuthority, 'domain_calculator_only');
assert.equal(COMBAT_V91_SERVER_AUTHORITY_POLICY.terminalResponse, 'same_transaction_as_owner_state');
assert.equal(COMBAT_V91_SERVER_AUTHORITY_POLICY.productionWritesEnabled, false);
assert.equal(COMBAT_V91_SERVER_AUTHORITY_POLICY.networkCreation, false);

// Confirm uses real Pirate/Pocket sources and produces a durable terminal replay.
{
  const scenario = makeScenario();
  const prediction = predictionEnvelope(scenario, 'intent:confirm');
  const harness = new AtomicHarness(scenario);
  const confirmed = await execute(harness, prediction);
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.reason, 'confirmed');
  assert.equal(confirmed.response.status, 'confirmed');
  assert.equal(confirmed.response.authoritativeProfile.ownerDomain, 'Pocket');
  assert.equal(confirmed.response.authoritativeProfile.calculationVersion, scenario.target.calculationVersion);
  assert.equal(confirmed.response.authoritativeOutcome.defeated, false);
  assert.equal(confirmed.response.authoritativeOutcome.fainted, false);
  assert.equal(confirmed.response.executionReceipt.resourceStateVersionAfter, 5);
  assert.equal(validateCombatAuthorityResponse(confirmed.response).ok, true);
  assert.equal(harness.domainMutationCount, 1);
  assert.equal(harness.terminalWriteCount, 1);

  const replay = await execute(harness, prediction);
  assert.equal(replay.ok, true);
  assert.equal(replay.reason, 'IDEMPOTENT_REPLAY');
  assert.equal(replay.response.responseFingerprint, confirmed.response.responseFingerprint);
  assert.equal(harness.domainMutationCount, 1, 'durable replay cannot mutate owner state twice');

  const conflicting = predictionEnvelope(scenario, 'intent:confirm', driftResultFingerprint);
  const conflict = await execute(harness, conflicting);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, 'IDEMPOTENCY_CONFLICT');
  assert.equal(harness.domainMutationCount, 1);
}

// Lethal commits route HP to the target owner and preserve Human/Monster end-state semantics.
for (const [direction, expected] of [
  ['PirateToPocket', {
    actorOwner: 'Pirate', targetOwner: 'Pocket', defeated: false, fainted: true,
  }],
  ['PocketToPirate', {
    actorOwner: 'Pocket', targetOwner: 'Pirate', defeated: true, fainted: false,
  }],
]) {
  const scenario = makeScenario({ direction, targetCurrentHp: 1, actionPower: 1000 });
  assert.equal(scenario.proposal.predictedHp, 0, `${direction} vector must be lethal`);
  const prediction = predictionEnvelope(scenario, `intent:lethal:${direction}`);
  const harness = new AtomicHarness(scenario);
  const actorSourceBefore = harness.currentSource(scenario.actor.entityId);
  const targetSourceBefore = harness.currentSource(scenario.target.entityId);
  const settled = await execute(harness, prediction);
  assert.equal(settled.ok, true);
  assert.equal(settled.response.authoritativeOutcome.sourceDomain, expected.actorOwner);
  assert.equal(settled.response.authoritativeProfile.ownerDomain, expected.targetOwner);
  assert.equal(settled.response.authoritativeProfile.stats.hpCurrent, 0);
  assert.equal(settled.response.authoritativeOutcome.hpBefore, 1);
  assert.equal(settled.response.authoritativeOutcome.hpAfter, 0);
  assert.equal(settled.response.authoritativeOutcome.defeated, expected.defeated);
  assert.equal(settled.response.authoritativeOutcome.fainted, expected.fainted);
  assert.deepEqual(harness.targetOwnerCommitDomains, [expected.targetOwner]);
  assert.deepEqual(harness.currentSource(scenario.actor.entityId), actorSourceBefore,
    `${direction} never writes HP through the attacker owner`);
  const expectedTargetSource = clone(targetSourceBefore);
  expectedTargetSource.profileInput.currentHp = 0;
  expectedTargetSource.profileInput.stateVersion += 1;
  assert.deepEqual(harness.currentSource(scenario.target.entityId), expectedTargetSource,
    `${direction} changes only target-owner HP/state version`);
}

// A transaction adapter cannot relabel a fainted Monster as defeated or vice versa.
for (const direction of ['PirateToPocket', 'PocketToPirate']) {
  const scenario = makeScenario({ direction, targetCurrentHp: 1, actionPower: 1000 });
  const prediction = predictionEnvelope(scenario, `intent:invalid-defeat:${direction}`);
  const harness = new AtomicHarness(scenario, { corruptDefeatSemantics: true });
  const targetSourceBefore = harness.currentSource(scenario.target.entityId);
  const settled = await execute(harness, prediction);
  assert.equal(settled.ok, false);
  assert.equal(settled.reason, 'atomic_combat_transaction_failed');
  assert.equal(settled.error.code, 'invalid_defeat_commit');
  assert.deepEqual(harness.currentSource(scenario.target.entityId), targetSourceBefore);
  assert.equal(harness.ticket.consumed, false);
  assert.equal(harness.domainMutationCount, 0);
  assert.equal(harness.terminalWriteCount, 0);
  assert.equal(harness.rollbackCount, 1);
}

// A valid calculation drift is corrected while authoritative commit remains exact.
{
  const scenario = makeScenario();
  const prediction = predictionEnvelope(scenario, 'intent:correct', driftResultFingerprint);
  const harness = new AtomicHarness(scenario);
  const corrected = await execute(harness, prediction);
  assert.equal(corrected.ok, true);
  assert.equal(corrected.reason, 'corrected');
  assert.equal(corrected.response.status, 'corrected');
  assert.notEqual(corrected.response.serverProposalFingerprint, prediction.envelope.predictedResultFingerprint);
  assert.equal(corrected.response.authoritativeCommitFingerprint, prediction.envelope.predictedCommitFingerprint);
}

// Rejection is terminal, includes resync state, and remains rejected after policy changes.
{
  const scenario = makeScenario();
  const prediction = predictionEnvelope(scenario, 'intent:unauthorized');
  const harness = new AtomicHarness(scenario, { unauthorizedReason: 'ACTION_NOT_OWNED' });
  const rejected = await execute(harness, prediction);
  assert.equal(rejected.ok, true);
  assert.equal(rejected.reason, 'ACTION_NOT_OWNED');
  assert.equal(rejected.response.status, 'rejected');
  assert.equal(rejected.response.resyncProfiles.length, 2);
  assert.equal(rejected.response.authoritativeStatusSnapshots.length, 0);
  assert.equal(harness.domainMutationCount, 0);
  assert.equal(harness.terminalWriteCount, 1);
  harness.unauthorizedReason = null;
  const replay = await execute(harness, prediction);
  assert.equal(replay.reason, 'IDEMPOTENT_REPLAY');
  assert.equal(replay.response.status, 'rejected');
  assert.equal(harness.domainMutationCount, 0);
}

// Stale World, status and RNG tickets are authoritative terminal rejections with resync data.
{
  const worldScenario = makeScenario();
  const worldPrediction = predictionEnvelope(worldScenario, 'intent:stale-world');
  const newerWorld = makeWorld({
    actor: worldScenario.actor,
    target: worldScenario.target,
    ticket: worldScenario.ticket,
    tick: worldScenario.world.worldSnapshotTick + 1,
  });
  const worldHarness = new AtomicHarness(worldScenario, { serverWorld: newerWorld });
  const staleWorld = await execute(worldHarness, worldPrediction);
  assert.equal(staleWorld.reason, 'STALE_WORLD_SNAPSHOT');
  assert.equal(staleWorld.response.resyncProfiles.length, 2);
  assert.equal(staleWorld.response.authoritativeStatusSnapshots.length, 2);
  assert.equal(worldHarness.domainMutationCount, 0);

  const statusScenario = makeScenario();
  const statusPrediction = predictionEnvelope(statusScenario, 'intent:stale-status');
  const newerActorStatus = makeStatusSnapshot(statusScenario.actor, statusScenario.combatId, 1);
  const statusHarness = new AtomicHarness(statusScenario, { serverActorStatus: newerActorStatus });
  const staleStatus = await execute(statusHarness, statusPrediction);
  assert.equal(staleStatus.reason, 'STALE_STATUS_VERSION');
  assert.equal(staleStatus.response.authoritativeStatusSnapshots[0].statusStateVersion, 1);
  assert.equal(statusHarness.domainMutationCount, 0);

  const rngScenario = makeScenario();
  const rngPrediction = predictionEnvelope(rngScenario, 'intent:stale-rng');
  const newerTicket = makeTicket({
    combatId: rngScenario.combatId,
    actorEntityId: rngScenario.actor.entityId,
    targetEntityId: rngScenario.target.entityId,
    actionId: rngScenario.action.actionId,
    ticketId: rngScenario.ticket.ticketId,
    seed: 'f'.repeat(64),
    stateVersion: 1,
  });
  const newerRngWorld = makeWorld({ actor: rngScenario.actor, target: rngScenario.target, ticket: newerTicket });
  const rngHarness = new AtomicHarness(rngScenario, {
    serverWorld: newerRngWorld,
    serverTicket: newerTicket,
  });
  const staleRng = await execute(rngHarness, rngPrediction);
  assert.equal(staleRng.reason, 'RNG_TICKET_BINDING_MISMATCH');
  assert.equal(rngHarness.domainMutationCount, 0);
}

// Two simultaneous copies of the same intent share one atomic mutation and response.
{
  const scenario = makeScenario();
  const prediction = predictionEnvelope(scenario, 'intent:concurrent-duplicate');
  const harness = new AtomicHarness(scenario, { concurrentApplyBarrier: 2 });
  const [left, right] = await Promise.all([
    execute(harness, prediction),
    execute(harness, prediction),
  ]);
  assert.equal(left.ok, true);
  assert.equal(right.ok, true);
  assert.equal(left.response.responseFingerprint, right.response.responseFingerprint);
  assert.deepEqual(new Set([left.reason, right.reason]), new Set(['confirmed', 'IDEMPOTENT_REPLAY']));
  assert.equal(harness.domainMutationCount, 1);
  assert.equal(harness.terminalWriteCount, 1);
}

// Different intents racing on one RNG ticket: one commits and one fails ticket CAS.
{
  const scenario = makeScenario();
  const first = predictionEnvelope(scenario, 'intent:ticket-race:a');
  const second = predictionEnvelope(scenario, 'intent:ticket-race:b');
  const harness = new AtomicHarness(scenario, { concurrentApplyBarrier: 2 });
  const results = await Promise.all([execute(harness, first), execute(harness, second)]);
  const committed = results.find(candidate => candidate.response.status !== 'rejected');
  const rejected = results.find(candidate => candidate.response.status === 'rejected');
  assert.ok(committed);
  assert.ok(rejected);
  assert.equal(rejected.reason, 'RNG_TICKET_ALREADY_CONSUMED');
  assert.equal(harness.ticket.stateVersion, 1);
  assert.equal(harness.ticket.consumed, true);
  assert.equal(harness.domainMutationCount, 1);
}

// Miss still consumes actor resource, sequence and RNG ticket without changing target HP/version.
{
  const scenario = makeScenario({ accuracy: 0 });
  assert.equal(scenario.proposal.hit, false);
  assert.equal(scenario.proposal.totalDamage, 0);
  const prediction = predictionEnvelope(scenario, 'intent:miss');
  const harness = new AtomicHarness(scenario);
  const beforeTarget = harness.currentProfile(scenario.target.entityId);
  const settled = await execute(harness, prediction);
  const afterTarget = harness.currentProfile(scenario.target.entityId);
  assert.equal(settled.ok, true);
  assert.equal(settled.response.executionReceipt.resourceStateVersionAfter, 5);
  assert.equal(settled.response.executionReceipt.sequenceStateVersionAfter, 8);
  assert.equal(settled.response.executionReceipt.rngTicketStateVersionAfter, 1);
  assert.equal(afterTarget.stats.hpCurrent, beforeTarget.stats.hpCurrent);
  assert.equal(afterTarget.stateVersion, beforeTarget.stateVersion);
  assert.equal(harness.targetWriteCount, 0);
  assert.equal(harness.domainMutationCount, 1);
}

// One action updates Pirate-owned and Pocket-owned status snapshots atomically.
{
  const scenario = makeScenario({
    statusApplications: [
      { linkId: 'SL_0001', target: 'actor' },
      { linkId: 'SL_0016', target: 'target' },
    ],
  });
  assert.equal(scenario.proposal.predictedStatusApplied.length, 2);
  assert.equal(scenario.proposal.predictedStatusTransitions.every(transition => transition.changed), true);
  const prediction = predictionEnvelope(scenario, 'intent:two-status-owners');
  const harness = new AtomicHarness(scenario);
  const settled = await execute(harness, prediction);
  assert.equal(settled.ok, true);
  assert.equal(settled.response.authoritativeStatusSnapshots.length, 2);
  assert.deepEqual(
    settled.response.authoritativeStatusSnapshots.map(snapshot => snapshot.ownerDomain),
    ['Pirate', 'Pocket'],
  );
  assert.equal(harness.currentStatus(scenario.actor.entityId).statusStateVersion, 1);
  assert.equal(harness.currentStatus(scenario.target.entityId).statusStateVersion, 1);
  assert.equal(harness.statusOwnerWriteCount, 2);
  assert.equal(harness.domainMutationCount, 1);
}

// Base-stat or provenance mutation makes finalize throw and the transaction rolls back fully.
for (const corruptCommit of ['base', 'provenance']) {
  const scenario = makeScenario();
  const prediction = predictionEnvelope(scenario, `intent:rollback:${corruptCommit}`);
  const harness = new AtomicHarness(scenario, { corruptCommit });
  const beforeSource = harness.currentSource(scenario.target.entityId);
  const beforeExecution = clone(harness.actorExecution);
  const settled = await execute(harness, prediction);
  assert.equal(settled.ok, false);
  assert.equal(settled.reason, 'atomic_combat_transaction_failed');
  assert.equal(settled.error.code, 'committed_profile_invariant_mismatch');
  assert.deepEqual(harness.currentSource(scenario.target.entityId), beforeSource);
  assert.deepEqual(harness.actorExecution, beforeExecution);
  assert.equal(harness.ticket.consumed, false);
  assert.equal(harness.domainMutationCount, 0);
  assert.equal(harness.terminalWriteCount, 0);
  assert.equal(harness.rollbackCount, 1);
}

// Any finalizer contract failure rolls back staged owner state and terminal response.
{
  const scenario = makeScenario();
  const prediction = predictionEnvelope(scenario, 'intent:finalizer-failure');
  const harness = new AtomicHarness(scenario, { forceFinalizerFailure: true });
  const beforeSource = harness.currentSource(scenario.target.entityId);
  const settled = await execute(harness, prediction);
  assert.equal(settled.ok, false);
  assert.equal(settled.reason, 'atomic_combat_transaction_failed');
  assert.equal(settled.error.code, 'invalid_atomic_commit_receipt');
  assert.deepEqual(harness.currentSource(scenario.target.entityId), beforeSource);
  assert.equal(harness.ticket.consumed, false);
  assert.equal(harness.domainMutationCount, 0);
  assert.equal(harness.terminal.size, 0);
  assert.equal(harness.rollbackCount, 1);
}

console.log('V9.1 Server Authority V2: PASS (domain HP ownership, defeat semantics, atomic CAS/idempotency, rollback)');
