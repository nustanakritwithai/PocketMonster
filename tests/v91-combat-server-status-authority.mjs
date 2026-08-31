import assert from 'node:assert/strict';
import { createDomainCombatProfile } from '../combat-v91-adapters.mjs';
import { fingerprintCombatValue } from '../combat-v91-contract.mjs';
import {
  createCombatClockSnapshot,
  createCombatStatusSnapshot,
  planCombatStatusTick,
} from '../combat-v91-status.mjs';
import {
  COMBAT_V91_SERVER_STATUS_AUTHORITY_POLICY,
  COMBAT_V91_SERVER_STATUS_AUTHORITY_VERSION,
  COMBAT_V91_STATUS_TICK_TRANSACTION_SCHEMA,
  createCombatStatusTickRequest,
  executeCombatV91StatusTickAuthority,
  validateCombatStatusTickResponse,
} from '../combat-v91-server-status-authority.mjs';
import {
  applyEncounterStatus,
  createEncounterStatusState,
} from '../status-lifecycle.mjs';
import {
  fixturePirateProfileSource,
  withProfileSourceHp,
} from './v91-combat-source-fixtures.mjs';

const clone = value => structuredClone(value);
const ratings = Object.freeze({
  accuracy: 1,
  crit: 0,
  evasion: 0,
  resistance: 0,
  penetration: 0,
});

function must(value, label) {
  assert.equal(value?.ok, true, `${label}: ${value?.reason}`);
  return value;
}

function profileFrom(source) {
  return must(createDomainCombatProfile(source), 'derive profile').profile;
}

function pirateSource({ suffix, currentHp = 145, stateVersion = 3 } = {}) {
  return fixturePirateProfileSource({
    entityId: `human:status:${suffix}`,
    combatLevel: 15,
    currentHp,
    stateVersion,
    ratings,
    // Keep percentage-based status ticks integral under the Core6 contract.
    coreStats: { hp: 200, atk: 10, def: 10, spAtk: 10, spDef: 10, spd: 10 },
    progressionStateVersion: `pirate-progression/status:${suffix}`,
  });
}

function pocketSource({ suffix, currentHp = 100, stateVersion = 7 } = {}) {
  return {
    ownerDomain: 'Pocket',
    profileInput: {
      entityId: `monster:status:${suffix}`,
      entityKind: 'Monster',
      // MON_021 at level 29 has canonical HP 100, so 1% ticks preserve
      // integer CombatStats without changing the percentage semantics.
      formId: 'MON_021',
      level: 29,
      potential: undefined,
      training: undefined,
      currentHp,
      ratings: { ...ratings },
      progressionStateVersion: `pocket-progression/status:${suffix}`,
      stateVersion,
    },
  };
}

function statusStateWith({ combatId, statusId, durationSec, stacks = 1 } = {}) {
  const empty = createEncounterStatusState({ encounterId: combatId, nowSec: 0 });
  const applied = applyEncounterStatus(empty, {
    statusId,
    stacks,
    durationSec,
    sourceSkillId: `skill:${statusId}`,
    sourceLinkId: `link:${statusId}`,
    sourceInstanceId: `source:${statusId}`,
  }, { nowSec: 0 });
  assert.equal(applied.ok, true, applied.reason);
  assert.equal(applied.applied, true);
  return applied.state;
}

let scenarioCounter = 0;
function scenario({ ownerDomain = 'Pocket', statusId = 'ST_POISON', durationSec = 3,
  stacks = 1, currentHp, combatTimeSec = 3, ended = false } = {}) {
  scenarioCounter += 1;
  const suffix = String(scenarioCounter);
  const combatId = `combat:status:${suffix}`;
  const source = ownerDomain === 'Pocket'
    ? pocketSource({ suffix, currentHp: currentHp ?? 100 })
    : pirateSource({ suffix, currentHp: currentHp ?? 145 });
  const profile = profileFrom(source);
  const statusSnapshot = must(createCombatStatusSnapshot({
    authority: 'server',
    combatId,
    entityId: profile.entityId,
    ownerDomain: profile.ownerDomain,
    statusStateVersion: 5,
    state: statusStateWith({ combatId, statusId, durationSec, stacks }),
  }), 'status snapshot').snapshot;
  const combatClock = must(createCombatClockSnapshot({
    authority: 'server',
    combatId,
    clockTick: 30,
    combatTimeSec,
    clockStateVersion: 9,
    ended,
  }), 'combat clock').snapshot;
  const request = must(createCombatStatusTickRequest({
    authority: 'server',
    requestId: `status-request:${suffix}`,
    combatId,
    entityId: profile.entityId,
    clockTick: combatClock.clockTick,
    clockStateVersion: combatClock.clockStateVersion,
    clockFingerprint: combatClock.fingerprint,
  }), 'tick request').request;
  return Object.freeze({
    context: Object.freeze({
      principalId: `status-worker:${suffix}`,
      sessionId: `status-session:${suffix}`,
      idempotencyScope: `status-scope:${suffix}`,
    }),
    source,
    profile,
    statusSnapshot,
    combatClock,
    request,
  });
}

function terminalKey(identity) {
  return `${identity.scope}\u0000${identity.combatId}\u0000${identity.requestId}`;
}

class AtomicStatusHarness {
  constructor(input, {
    driftClockBeforeApply = false,
    mutateBaseInReceipt = false,
    corruptDefeatSemantics = false,
  } = {}) {
    this.input = input;
    this.source = clone(input.source);
    this.statusSnapshot = clone(input.statusSnapshot);
    this.combatClock = clone(input.combatClock);
    this.terminal = new Map();
    this.driftClockBeforeApply = driftClockBeforeApply;
    this.mutateBaseInReceipt = mutateBaseInReceipt;
    this.corruptDefeatSemantics = corruptDefeatSemantics;
    this.didDriftClock = false;
    this.commitCount = 0;
    this.profileWriteCount = 0;
    this.statusWriteCount = 0;
    this.clockCasCount = 0;
    this.terminalWriteCount = 0;
    this.outcomePublishCount = 0;
    this.rollbackCount = 0;
    this.ownerCommitDomains = [];
    this._lockTail = Promise.resolve();
  }

  currentProfile() {
    return profileFrom(clone(this.source));
  }

  dependencies() {
    return {
      readTerminalResponse: async identity => {
        await Promise.resolve();
        return clone(this.terminal.get(terminalKey(identity))?.response ?? null);
      },
      loadProfileSource: async () => clone(this.source),
      loadStatusSnapshot: async () => clone(this.statusSnapshot),
      loadCombatClock: async () => clone(this.combatClock),
      transactCombatStatusTick: async (command, finalize) => this.transact(command, finalize),
    };
  }

  async withLock(operation) {
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

  rejectionReceipt(reason) {
    return {
      committed: false,
      reason,
      authoritativeProfileSource: clone(this.source),
      authoritativeStatusSnapshot: clone(this.statusSnapshot),
      authoritativeCombatClock: clone(this.combatClock),
    };
  }

  persistTerminal(command, response) {
    this.terminal.set(terminalKey(command.idempotency), {
      requestFingerprint: command.idempotency.requestFingerprint,
      response: clone(response),
    });
    this.terminalWriteCount += 1;
  }

  async transact(command, finalize) {
    assert.equal(command.schemaVersion, COMBAT_V91_STATUS_TICK_TRANSACTION_SCHEMA);
    assert.equal(command.authority, 'server');
    return this.withLock(async () => {
      const key = terminalKey(command.idempotency);
      const existing = this.terminal.get(key);
      if (existing) {
        if (existing.requestFingerprint !== command.idempotency.requestFingerprint) {
          throw new Error('idempotency conflict');
        }
        return { atomic: true, disposition: 'replayed', response: clone(existing.response) };
      }
      if (command.mode === 'reject') {
        const response = finalize(clone(command.rejectionReceipt));
        this.persistTerminal(command, response);
        return { atomic: true, disposition: 'rejected', response };
      }
      assert.equal(command.mode, 'apply');
      if (this.driftClockBeforeApply && !this.didDriftClock) {
        this.didDriftClock = true;
        this.combatClock = must(createCombatClockSnapshot({
          ...this.combatClock,
          clockTick: this.combatClock.clockTick + 1,
          combatTimeSec: this.combatClock.combatTimeSec + 0.1,
          clockStateVersion: this.combatClock.clockStateVersion + 1,
          fingerprint: undefined,
        }), 'drifted clock').snapshot;
      }
      const liveProfile = this.currentProfile();
      const casMatches = command.expected.profileStateVersion === liveProfile.stateVersion
        && command.expected.profileSourceFingerprint === fingerprintCombatValue(this.source)
        && command.expected.statusStateVersion === this.statusSnapshot.statusStateVersion
        && command.expected.statusFingerprint === this.statusSnapshot.fingerprint
        && command.expected.combatClockStateVersion === this.combatClock.clockStateVersion
        && command.expected.combatClockFingerprint === this.combatClock.fingerprint;
      this.clockCasCount += 1;
      if (!casMatches) {
        const response = finalize(this.rejectionReceipt('ATOMIC_CAS_REJECTED'));
        this.persistTerminal(command, response);
        return { atomic: true, disposition: 'rejected', response };
      }

      const nextSource = withProfileSourceHp(
        this.source,
        command.mutation.hpAfter,
        command.mutation.profileStateVersionAfter,
      );
      const nextStatus = clone(command.mutation.authoritativeStatusSnapshot);
      const nextProfile = profileFrom(nextSource);
      const hpZero = nextProfile.stats.hpCurrent === 0;
      let fainted = hpZero && nextProfile.entityKind === 'Monster';
      let defeated = hpZero && nextProfile.entityKind !== 'Monster';
      let receiptSource = nextSource;
      if (this.mutateBaseInReceipt) {
        receiptSource = clone(nextSource);
        if (receiptSource.ownerDomain === 'Pirate') {
          receiptSource.profileInput.humanCoreGrowthDefinition.coreStats.atk += 1;
        }
        else receiptSource.profileInput.level += 1;
      }
      if (this.corruptDefeatSemantics) [defeated, fainted] = [fainted, defeated];
      const receipt = {
        committed: true,
        commitId: `status-commit:${command.idempotency.requestId}`,
        authoritativeProfileSource: receiptSource,
        authoritativeStatusSnapshot: nextStatus,
        authoritativeCombatClock: clone(this.combatClock),
        defeated,
        fainted,
      };
      let response;
      try {
        assert.equal(this.terminal.has(key), false, 'terminal hidden before durability');
        response = finalize(receipt);
      } catch (error) {
        this.rollbackCount += 1;
        throw error;
      }
      this.source = nextSource;
      this.statusSnapshot = nextStatus;
      this.ownerCommitDomains.push(command.profileOwnerDomain);
      this.profileWriteCount += command.mutation.hpAfter === command.mutation.hpBefore ? 0 : 1;
      this.statusWriteCount += 1;
      this.commitCount += 1;
      this.persistTerminal(command, response);
      this.outcomePublishCount += 1;
      return { atomic: true, disposition: 'committed', response };
    });
  }
}

async function execute(input, harness, request = input.request) {
  return executeCombatV91StatusTickAuthority({
    request,
    authorityContext: input.context,
  }, harness.dependencies());
}

assert.equal(COMBAT_V91_SERVER_STATUS_AUTHORITY_VERSION, 'combat-v91-server-status-authority/v2');
assert.equal(COMBAT_V91_SERVER_STATUS_AUTHORITY_POLICY.productionWritesEnabled, false);
assert.equal(COMBAT_V91_SERVER_STATUS_AUTHORITY_POLICY.networkCreation, false);
assert.equal(COMBAT_V91_SERVER_STATUS_AUTHORITY_POLICY.planner, 'pure_snapshot_transition');

{
  const input = scenario();
  const statusClone = clone(input.statusSnapshot);
  const clockClone = clone(input.combatClock);
  const planned = must(planCombatStatusTick(input.statusSnapshot, {
    combatClock: input.combatClock,
    targetHp: input.profile.stats.hpCurrent,
    targetMaxHp: input.profile.stats.hpMax,
  }), 'pure tick plan').plan;
  assert.deepEqual(input.statusSnapshot, statusClone, 'planner must not mutate status input');
  assert.deepEqual(input.combatClock, clockClone, 'planner must not mutate clock input');
  assert.equal(Object.isFrozen(planned), true);
  assert.equal(planned.ticks.length, 3);
  assert.ok(Math.abs(planned.scheduledDamage - input.profile.stats.hpMax * 0.01 * 3) < 1e-12);
  assert.ok(Math.abs(planned.appliedDamage - planned.scheduledDamage) < 1e-12);
  assert.deepEqual(planned.expiredStatusIds, ['ST_POISON']);
  assert.equal(planned.after.state.currentTimeSec, 3);
  assert.equal(planned.after.state.statuses.length, 0);
  assert.equal(planned.statusStateVersionAfter, planned.statusStateVersionBefore + 1);
}

for (const ownerDomain of ['Pirate', 'Pocket']) {
  const input = scenario({ ownerDomain, combatTimeSec: 1 });
  const harness = new AtomicStatusHarness(input);
  const settled = await execute(input, harness);
  assert.equal(settled.ok, true, settled.reason);
  assert.equal(settled.replay, false);
  assert.equal(settled.response.status, 'committed');
  assert.equal(must(validateCombatStatusTickResponse(settled.response), 'response').ok, true);
  assert.equal(settled.response.authoritativeProfile.ownerDomain, ownerDomain);
  assert.equal(settled.response.outcome.damage > 0, true);
  assert.equal(settled.response.outcome.publication, 'post_commit_only');
  assert.equal(settled.response.outcome.hpAfter,
    settled.response.authoritativeProfile.stats.hpCurrent);
  assert.equal(harness.commitCount, 1);
  assert.equal(harness.profileWriteCount, 1);
  assert.equal(harness.statusWriteCount, 1);
  assert.equal(harness.clockCasCount, 1);
  assert.deepEqual(harness.ownerCommitDomains, [ownerDomain]);
  assert.equal(harness.terminalWriteCount, 1);
  assert.equal(harness.outcomePublishCount, 1);
  const baseBefore = clone(input.profile.stats);
  delete baseBefore.hpCurrent;
  const baseAfter = clone(settled.response.authoritativeProfile.stats);
  delete baseAfter.hpCurrent;
  assert.deepEqual(baseAfter, baseBefore, 'status tick cannot mutate Base Stats');
}

for (const [ownerDomain, expected] of [
  ['Pocket', { fainted: true, defeated: false }],
  ['Pirate', { fainted: false, defeated: true }],
]) {
  const input = scenario({ ownerDomain, statusId: 'ST_POISON', durationSec: 2,
    stacks: 2, combatTimeSec: 1, currentHp: 1 });
  const harness = new AtomicStatusHarness(input);
  const settled = await execute(input, harness);
  assert.equal(settled.ok, true, settled.reason);
  assert.equal(settled.response.outcome.hpAfter, 0);
  assert.equal(settled.response.outcome.damage, 1, 'outcome reports applied, HP-clamped damage');
  assert.equal(settled.response.outcome.scheduledDamage > settled.response.outcome.damage, true);
  assert.equal(settled.response.outcome.fainted, expected.fainted);
  assert.equal(settled.response.outcome.defeated, expected.defeated);
}

{
  const input = scenario({ combatTimeSec: 1 });
  const harness = new AtomicStatusHarness(input);
  const [first, second] = await Promise.all([execute(input, harness), execute(input, harness)]);
  assert.equal(first.ok, true, first.reason);
  assert.equal(second.ok, true, second.reason);
  assert.equal(harness.commitCount, 1, 'concurrent duplicate writes once');
  assert.equal(harness.profileWriteCount, 1);
  assert.equal(harness.statusWriteCount, 1);
  assert.equal(harness.outcomePublishCount, 1);
  assert.equal(first.response.fingerprint, second.response.fingerprint);
  assert.equal([first.replay, second.replay].filter(Boolean).length, 1);
  const laterReplay = await execute(input, harness);
  assert.equal(laterReplay.ok, true);
  assert.equal(laterReplay.reason, 'IDEMPOTENT_REPLAY');
  assert.equal(harness.commitCount, 1);
}

{
  const input = scenario({ combatTimeSec: 1 });
  const firstHarness = new AtomicStatusHarness(input);
  const secondHarness = new AtomicStatusHarness(input);
  const first = await execute(input, firstHarness);
  const second = await execute(input, secondHarness);
  assert.equal(first.ok, true, first.reason);
  assert.equal(second.ok, true, second.reason);
  assert.equal(first.response.fingerprint, second.response.fingerprint,
    'same snapshots and command replay to the same deterministic terminal response');
  assert.equal(first.response.outcome.fingerprint, second.response.outcome.fingerprint);
}

{
  const input = scenario({ combatTimeSec: 1 });
  const harness = new AtomicStatusHarness(input, { driftClockBeforeApply: true });
  const rejected = await execute(input, harness);
  assert.equal(rejected.ok, true, rejected.reason);
  assert.equal(rejected.response.status, 'rejected');
  assert.equal(rejected.response.reason, 'ATOMIC_CAS_REJECTED');
  assert.equal(harness.commitCount, 0);
  assert.equal(harness.profileWriteCount, 0);
  assert.equal(harness.statusWriteCount, 0);
  assert.equal(harness.outcomePublishCount, 0);
  assert.equal(harness.terminalWriteCount, 1, 'CAS rejection is terminal and idempotent');
  const replay = await execute(input, harness);
  assert.equal(replay.ok, true);
  assert.equal(replay.reason, 'IDEMPOTENT_REPLAY');
  assert.equal(replay.response.fingerprint, rejected.response.fingerprint);
  assert.equal(harness.terminalWriteCount, 1);
}

for (const corruption of [
  { mutateBaseInReceipt: true },
  { corruptDefeatSemantics: true, lethal: true },
]) {
  const input = scenario({ ownerDomain: 'Pocket', statusId: 'ST_POISON', durationSec: 2,
    stacks: corruption.lethal ? 2 : 1,
    combatTimeSec: 1, currentHp: corruption.lethal ? 1 : 41 });
  const harness = new AtomicStatusHarness(input, corruption);
  const failed = await execute(input, harness);
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'atomic_status_tick_transaction_failed');
  assert.equal(harness.rollbackCount, 1);
  assert.equal(harness.commitCount, 0);
  assert.equal(harness.profileWriteCount, 0);
  assert.equal(harness.statusWriteCount, 0);
  assert.equal(harness.terminalWriteCount, 0);
  assert.equal(harness.outcomePublishCount, 0, 'invalid receipt cannot publish outcome');
}

{
  const input = scenario({ ended: true, combatTimeSec: 1, durationSec: 5 });
  const planned = must(planCombatStatusTick(input.statusSnapshot, {
    combatClock: input.combatClock,
    targetHp: input.profile.stats.hpCurrent,
    targetMaxHp: input.profile.stats.hpMax,
  }), 'ended clock plan').plan;
  assert.equal(planned.after.state.ended, true);
  assert.equal(planned.after.state.statuses.length, 0);
  assert.deepEqual(planned.expiredStatusIds, ['ST_POISON']);
}

console.log('Combat V9.1 server status authority tests passed.');
