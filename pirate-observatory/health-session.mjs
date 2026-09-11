import { PIRATE_OBSERVATORY_SCHEMA_VERSION, assertPartition } from './protocol.mjs';

export class PirateObservatoryHealthSession {
  constructor({
    transport,
    partition = 'pirate-fruit',
    pollMs = 2000,
    onHealth = () => {},
    onError = () => {},
    setIntervalImpl = globalThis.setInterval,
    clearIntervalImpl = globalThis.clearInterval,
  } = {}) {
    if (!transport?.getHealth) throw new TypeError('transport.getHealth is required');
    if (!Number.isFinite(pollMs) || pollMs < 500) throw new TypeError('pollMs must be at least 500ms');
    this.transport = transport;
    this.partition = assertPartition(partition);
    this.pollMs = pollMs;
    this.onHealth = onHealth;
    this.onError = onError;
    this.setIntervalImpl = setIntervalImpl;
    this.clearIntervalImpl = clearIntervalImpl;
    this.timer = null;
    this.inFlight = null;
    this.stopped = true;
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
      const valid = health?.schemaVersion === PIRATE_OBSERVATORY_SCHEMA_VERSION
        && health.partition === this.partition
        && typeof health.ready === 'boolean'
        && typeof health.code === 'string'
        && Number.isSafeInteger(health.lastObservedTick)
        && Number.isSafeInteger(health.latestSequence) && health.latestSequence >= 0
        && Number.isSafeInteger(health.oldestRetainedSequence) && health.oldestRetainedSequence >= 0
        && Number.isInteger(health.retainedEvents) && health.retainedEvents >= 0
        && Number.isInteger(health.retentionCapacity) && health.retentionCapacity > 0
        && Number.isFinite(health.journalUtilization) && health.journalUtilization >= 0 && health.journalUtilization <= 1
        && Number.isInteger(health.entityCount) && health.entityCount >= 0;
      if (!valid) {
        const error = Object.assign(new Error('Invalid Observatory health response'), { code: 'INVALID_HEALTH_RESPONSE' });
        this.onError(error);
        return { ok: false, reason: error.code };
      }
      await this.onHealth(health);
      return { ok: true, health };
    } catch (error) {
      this.onError(error);
      return { ok: false, reason: error?.code ?? 'HEALTH_REQUEST_FAILED', error };
    }
  }
}
