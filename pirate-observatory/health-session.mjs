import { PIRATE_OBSERVATORY_SCHEMA_VERSION, assertPartition } from './protocol.mjs';

function assertPollMs(value) {
  if (!Number.isFinite(value) || value < 1000) throw new TypeError('health poll interval must be at least 1000ms');
  return value;
}

export function validateObservatoryHealth(payload, partition = null) {
  const expectedPartition = partition ? assertPartition(partition) : null;
  if (!payload || payload.schemaVersion !== PIRATE_OBSERVATORY_SCHEMA_VERSION) return { ok: false, reason: 'SCHEMA_MISMATCH' };
  if (typeof payload.ready !== 'boolean') return { ok: false, reason: 'READY_REQUIRED' };
  if (typeof payload.partition !== 'string' || !payload.partition) return { ok: false, reason: 'PARTITION_REQUIRED' };
  if (expectedPartition && payload.partition !== expectedPartition) return { ok: false, reason: 'PARTITION_MISMATCH' };
  if (!Number.isSafeInteger(payload.lastObservedTick) || payload.lastObservedTick < -1) return { ok: false, reason: 'INVALID_TICK' };
  if (!Number.isSafeInteger(payload.latestSequence) || payload.latestSequence < 0
    || !Number.isSafeInteger(payload.oldestRetainedSequence) || payload.oldestRetainedSequence < 0) {
    return { ok: false, reason: 'INVALID_SEQUENCE' };
  }
  if (!Number.isSafeInteger(payload.retainedEvents) || payload.retainedEvents < 0
    || !Number.isSafeInteger(payload.retentionCapacity) || payload.retentionCapacity < 1
    || payload.retainedEvents > payload.retentionCapacity) {
    return { ok: false, reason: 'INVALID_RETENTION' };
  }
  if (!Number.isFinite(payload.journalUtilization) || payload.journalUtilization < 0 || payload.journalUtilization > 1) {
    return { ok: false, reason: 'INVALID_UTILIZATION' };
  }
  if (!Number.isSafeInteger(payload.entityCount) || payload.entityCount < 0) return { ok: false, reason: 'INVALID_ENTITY_COUNT' };
  if (typeof payload.code !== 'string' || !payload.code || typeof payload.mode !== 'string' || !payload.mode) {
    return { ok: false, reason: 'HEALTH_MODE_REQUIRED' };
  }
  return { ok: true, health: payload };
}

export function validateObservatoryWorldHealth(payload, partition = null) {
  const expectedPartition = partition ? assertPartition(partition) : null;
  if (!payload || payload.schemaVersion !== PIRATE_OBSERVATORY_SCHEMA_VERSION) return { ok: false, reason: 'SCHEMA_MISMATCH' };
  if (typeof payload.partition !== 'string' || !payload.partition) return { ok: false, reason: 'PARTITION_REQUIRED' };
  if (expectedPartition && payload.partition !== expectedPartition) return { ok: false, reason: 'PARTITION_MISMATCH' };
  if (!Number.isSafeInteger(payload.tick) || payload.tick < 0
    || !Number.isSafeInteger(payload.sequence) || payload.sequence < 0) return { ok: false, reason: 'INVALID_CURSOR' };
  if (!['ok', 'warning', 'critical'].includes(payload.status)) return { ok: false, reason: 'INVALID_WORLD_HEALTH_STATUS' };
  if (!Number.isSafeInteger(payload.issueCount) || payload.issueCount < 0 || !Array.isArray(payload.issues)
    || payload.issues.length !== payload.issueCount) return { ok: false, reason: 'INVALID_WORLD_HEALTH_ISSUES' };
  for (const issue of payload.issues) {
    if (!issue || typeof issue.code !== 'string' || !issue.code
      || !['warning', 'critical'].includes(issue.severity)
      || typeof issue.message !== 'string' || !issue.message) {
      return { ok: false, reason: 'INVALID_WORLD_HEALTH_ISSUE' };
    }
  }
  return { ok: true, worldHealth: payload };
}

export class PirateObservatoryHealthSession {
  constructor({
    transport,
    partition = 'pirate-fruit',
    pollMs = 3000,
    onHealth = () => {},
    onWorldHealth = () => {},
    onError = () => {},
    setIntervalImpl = globalThis.setInterval,
    clearIntervalImpl = globalThis.clearInterval,
  } = {}) {
    if (!transport?.getHealth) throw new TypeError('transport.getHealth is required');
    this.transport = transport;
    this.partition = assertPartition(partition);
    this.pollMs = assertPollMs(pollMs);
    this.onHealth = onHealth;
    this.onWorldHealth = onWorldHealth;
    this.onError = onError;
    this.setIntervalImpl = setIntervalImpl;
    this.clearIntervalImpl = clearIntervalImpl;
    this.timer = null;
    this.inFlight = null;
    this.stopped = true;
    this.last = null;
    this.lastWorldHealth = null;
  }

  start({ immediate = true } = {}) {
    if (this.timer) return false;
    this.stopped = false;
    if (immediate) void this.refresh();
    this.timer = this.setIntervalImpl(() => { void this.refresh(); }, this.pollMs);
    return true;
  }

  stop() {
    this.stopped = true;
    if (this.timer) this.clearIntervalImpl(this.timer);
    this.timer = null;
  }

  async refresh() {
    if (this.stopped) return { ok: false, reason: 'SESSION_STOPPED' };
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.#run();
    try { return await this.inFlight; }
    finally { this.inFlight = null; }
  }

  async #run() {
    try {
      const health = await this.transport.getHealth(this.partition);
      if (this.stopped) return { ok: false, reason: 'SESSION_STOPPED' };
      const validation = validateObservatoryHealth(health, this.partition);
      if (!validation.ok) {
        this.onError(validation);
        return validation;
      }
      this.last = health;
      await this.onHealth(health);

      let worldHealth = null;
      let worldHealthError = null;
      if (typeof this.transport.getWorldHealth === 'function') {
        try {
          const candidate = await this.transport.getWorldHealth(this.partition);
          if (!this.stopped) {
            const worldValidation = validateObservatoryWorldHealth(candidate, this.partition);
            if (worldValidation.ok) {
              worldHealth = candidate;
              this.lastWorldHealth = candidate;
              await this.onWorldHealth(candidate);
            } else {
              worldHealthError = worldValidation;
              this.onError(worldValidation);
            }
          }
        } catch (error) {
          worldHealthError = { ok: false, reason: error?.code ?? 'WORLD_HEALTH_REQUEST_FAILED', error };
          this.onError(error);
        }
      }
      return { ok: true, health, worldHealth, worldHealthError };
    } catch (error) {
      const result = { ok: false, reason: error?.code ?? 'HEALTH_REQUEST_FAILED', error };
      this.onError(error);
      return result;
    }
  }
}
