import assert from 'node:assert/strict';
import {
  PirateObservatoryHealthSession,
  validateObservatoryHealth,
  validateObservatoryWorldHealth,
} from '../pirate-observatory/index.mjs';

const valid = Object.freeze({
  schemaVersion: 1,
  ready: false,
  code: 'OBSERVATORY_NOT_READY',
  mode: 'waiting-authority',
  partition: 'pirate-fruit',
  lastObservedTick: -1,
  latestSequence: 3,
  oldestRetainedSequence: 1,
  retainedEvents: 3,
  retentionCapacity: 16,
  journalUtilization: 3 / 16,
  entityCount: 0,
  generatedAt: '2026-09-11T00:00:00Z',
});

const worldHealth = Object.freeze({
  schemaVersion: 1,
  partition: 'pirate-fruit',
  tick: 0,
  sequence: 3,
  status: 'warning',
  issueCount: 1,
  issues: Object.freeze([
    Object.freeze({
      code: 'AUTHORITY_WAITING',
      severity: 'warning',
      message: 'No authoritative Pirate WorldTickSnapshot has been observed yet.',
    }),
  ]),
  generatedAt: '2026-09-11T00:00:00Z',
});

assert.equal(validateObservatoryHealth(valid, 'pirate-fruit').ok, true);
assert.equal(validateObservatoryHealth({ ...valid, partition: 'other' }, 'pirate-fruit').reason, 'PARTITION_MISMATCH');
assert.equal(validateObservatoryHealth({ ...valid, lastObservedTick: -2 }, 'pirate-fruit').reason, 'INVALID_TICK');
assert.equal(validateObservatoryHealth({ ...valid, retainedEvents: 17 }, 'pirate-fruit').reason, 'INVALID_RETENTION');
assert.equal(validateObservatoryHealth({ ...valid, journalUtilization: 1.2 }, 'pirate-fruit').reason, 'INVALID_UTILIZATION');
assert.equal(validateObservatoryWorldHealth(worldHealth, 'pirate-fruit').ok, true);
assert.equal(validateObservatoryWorldHealth({ ...worldHealth, issueCount: 2 }, 'pirate-fruit').reason, 'INVALID_WORLD_HEALTH_ISSUES');
assert.equal(validateObservatoryWorldHealth({ ...worldHealth, status: 'mystery' }, 'pirate-fruit').reason, 'INVALID_WORLD_HEALTH_STATUS');

const healthCalls = [];
const worldHealthCalls = [];
const accepted = [];
const acceptedWorld = [];
const errors = [];
let interval = null;
let cleared = null;
const transport = {
  async getHealth(partition) {
    healthCalls.push(partition);
    return valid;
  },
  async getWorldHealth(partition) {
    worldHealthCalls.push(partition);
    return worldHealth;
  },
};

const session = new PirateObservatoryHealthSession({
  transport,
  partition: 'pirate-fruit',
  pollMs: 3000,
  onHealth: health => accepted.push(health),
  onWorldHealth: health => acceptedWorld.push(health),
  onError: error => errors.push(error),
  setIntervalImpl: (fn, ms) => { interval = { fn, ms }; return 77; },
  clearIntervalImpl: id => { cleared = id; },
});

assert.equal(session.start({ immediate: false }), true);
assert.equal(interval.ms, 3000);
const result = await session.refresh();
assert.equal(result.ok, true);
assert.equal(healthCalls.length, 1);
assert.equal(worldHealthCalls.length, 1);
assert.equal(accepted.length, 1);
assert.equal(acceptedWorld.length, 1);
assert.equal(session.last, valid);
assert.equal(session.lastWorldHealth, worldHealth);
assert.equal(result.worldHealth, worldHealth);
assert.equal(errors.length, 0);
session.stop();
assert.equal(cleared, 77);
assert.equal((await session.refresh()).reason, 'SESSION_STOPPED');

const badSession = new PirateObservatoryHealthSession({
  transport: { async getHealth() { return { ...valid, entityCount: -1 }; } },
  partition: 'pirate-fruit',
  onError: error => errors.push(error),
  setIntervalImpl: () => 1,
  clearIntervalImpl: () => {},
});
badSession.start({ immediate: false });
const bad = await badSession.refresh();
assert.equal(bad.ok, false);
assert.equal(bad.reason, 'INVALID_ENTITY_COUNT');
badSession.stop();

console.log('v90 Pirate World Observatory health session: PASS');
