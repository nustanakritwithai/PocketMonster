import { SYNC_STATES, assertPartition } from './protocol.mjs';
import { classifyObservatoryConnectError } from './connection-state.mjs';

function assertPollMs(value, name = 'pollMs', minimum = 250) {
  if (!Number.isFinite(value) || value < minimum) throw new TypeError(`${name} must be at least ${minimum}ms`);
  return value;
}

export class PirateObservatoryRestSession {
  constructor({
    transport,
    partition = 'pirate-fruit',
    pollMs = 500,
    notReadyPollMs = 3000,
    onSnapshot = () => ({ ok: true }),
    onDelta = () => ({ ok: true }),
    onState = () => {},
    now = () => Date.now(),
    setIntervalImpl = globalThis.setInterval,
    clearIntervalImpl = globalThis.clearInterval,
  } = {}) {
    if (!transport?.getPartitionSnapshot || !transport?.getChangesAfter) {
      throw new TypeError('transport snapshot/changes methods are required');
    }
    this.transport = transport;
    this.partition = assertPartition(partition);
    this.pollMs = assertPollMs(pollMs);
    this.notReadyPollMs = assertPollMs(notReadyPollMs, 'notReadyPollMs', 1000);
    this.onSnapshot = onSnapshot;
    this.onDelta = onDelta;
    this.onState = onState;
    this.now = now;
    this.setIntervalImpl = setIntervalImpl;
    this.clearIntervalImpl = clearIntervalImpl;
    this.sequence = 0;
    this.tick = 0;
    this.timer = null;
    this.inFlight = null;
    this.stopped = false;
    this.waitingForAuthority = false;
    this.nextAuthorityCheckAt = 0;
  }

  async bootstrap() {
    this.stopped = false;
    this.onState(SYNC_STATES.SYNCING, { partition: this.partition });

    if (typeof this.transport.getStatus === 'function') {
      try {
        const status = await this.transport.getStatus();
        if (typeof status?.ready !== 'boolean') {
          this.onState(SYNC_STATES.DESYNC, { partition: this.partition, reason: 'INVALID_STATUS' });
          return { ok: false, reason: 'INVALID_STATUS', retryable: false, serverReachable: true };
        }
        if (!status.ready) return this.#waitForAuthority(status.code ?? 'OBSERVATORY_NOT_READY', status);
      } catch (error) {
        // Older compatible servers may not expose /status yet; snapshot remains the truth gate.
        if (error?.status !== 404) return this.#handleError(error);
      }
    }

    try {
      const snapshot = await this.transport.getPartitionSnapshot(this.partition);
      return this.#acceptSnapshot(snapshot, 'bootstrap');
    } catch (error) {
      return this.#handleError(error);
    }
  }

  async pollOnce() {
    if (this.stopped) return { ok: false, reason: 'SESSION_STOPPED' };
    if (this.inFlight) return this.inFlight;

    if (this.waitingForAuthority && this.now() < this.nextAuthorityCheckAt) {
      return {
        ok: false,
        reason: 'AUTHORITY_BACKOFF',
        retryable: true,
        serverReachable: true,
        backoff: true,
        nextAuthorityCheckAt: this.nextAuthorityCheckAt,
      };
    }

    this.inFlight = this.waitingForAuthority ? this.#pollAuthority() : this.#pollCore();
    try { return await this.inFlight; }
    finally { this.inFlight = null; }
  }

  start() {
    if (this.timer || this.stopped) return false;
    this.timer = this.setIntervalImpl(() => { void this.pollOnce(); }, this.pollMs);
    return true;
  }

  stop() {
    this.stopped = true;
    this.waitingForAuthority = false;
    this.nextAuthorityCheckAt = 0;
    if (this.timer) this.clearIntervalImpl(this.timer);
    this.timer = null;
    this.onState(SYNC_STATES.OFFLINE, { partition: this.partition, stopped: true });
  }

  async #pollAuthority() {
    try {
      if (typeof this.transport.getStatus === 'function') {
        const status = await this.transport.getStatus();
        if (typeof status?.ready !== 'boolean') {
          this.waitingForAuthority = false;
          this.onState(SYNC_STATES.DESYNC, { partition: this.partition, reason: 'INVALID_STATUS' });
          return { ok: false, reason: 'INVALID_STATUS', retryable: false, serverReachable: true };
        }
        if (!status.ready) return this.#waitForAuthority(status.code ?? 'OBSERVATORY_NOT_READY', status);
      }
      this.waitingForAuthority = false;
      this.nextAuthorityCheckAt = 0;
      return this.#resync('AUTHORITY_READY');
    } catch (error) {
      return this.#handleError(error);
    }
  }

  async #pollCore() {
    try {
      const response = await this.transport.getChangesAfter(this.partition, this.sequence);
      if (!response?.complete || response.code === 'RESYNC_REQUIRED') {
        return this.#resync(response?.code ?? 'RESYNC_REQUIRED');
      }

      let expected = this.sequence;
      for (const packet of response.packets ?? []) {
        if (!Number.isSafeInteger(packet?.baseSequence) || packet.baseSequence !== expected) {
          this.onState(SYNC_STATES.DESYNC, { partition: this.partition, expected, packet });
          return this.#resync('SEQUENCE_GAP');
        }
        const applied = await this.onDelta(packet);
        if (applied?.ok === false) {
          this.onState(SYNC_STATES.DESYNC, { partition: this.partition, reason: applied.reason });
          return this.#resync(applied.reason ?? 'DELTA_REJECTED');
        }
        expected = packet.sequence;
        this.sequence = packet.sequence;
        this.tick = Math.max(this.tick, packet.tick ?? 0);
      }

      if (Number.isSafeInteger(response.latestSequence) && response.latestSequence > this.sequence) {
        this.onState(SYNC_STATES.DESYNC, { partition: this.partition, reason: 'INCOMPLETE_CATCH_UP' });
        return this.#resync('INCOMPLETE_CATCH_UP');
      }

      this.onState(SYNC_STATES.LIVE, { partition: this.partition, sequence: this.sequence, tick: this.tick });
      return { ok: true, mode: 'delta', sequence: this.sequence, tick: this.tick };
    } catch (error) {
      return this.#handleError(error);
    }
  }

  async #resync(reason) {
    this.onState(SYNC_STATES.SYNCING, { partition: this.partition, reason });
    try {
      const snapshot = await this.transport.getPartitionSnapshot(this.partition);
      return this.#acceptSnapshot(snapshot, 'resync');
    } catch (error) {
      return this.#handleError(error);
    }
  }

  async #acceptSnapshot(snapshot, mode) {
    if (snapshot?.partition !== this.partition
      || !Number.isSafeInteger(snapshot?.sequence)
      || snapshot.sequence < 0
      || !Number.isSafeInteger(snapshot?.tick)
      || snapshot.tick < 0) {
      this.onState(SYNC_STATES.DESYNC, { partition: this.partition, reason: 'INVALID_SNAPSHOT' });
      return { ok: false, reason: 'INVALID_SNAPSHOT' };
    }
    const applied = await this.onSnapshot(snapshot);
    if (applied?.ok === false) {
      this.onState(SYNC_STATES.DESYNC, { partition: this.partition, reason: applied.reason });
      return { ok: false, reason: applied.reason ?? 'SNAPSHOT_REJECTED' };
    }
    this.waitingForAuthority = false;
    this.nextAuthorityCheckAt = 0;
    this.sequence = snapshot.sequence;
    this.tick = snapshot.tick;
    this.onState(SYNC_STATES.LIVE, { partition: this.partition, sequence: this.sequence, tick: this.tick });
    return { ok: true, mode, snapshot, sequence: this.sequence, tick: this.tick };
  }

  #waitForAuthority(reason, status = null) {
    this.waitingForAuthority = true;
    this.nextAuthorityCheckAt = this.now() + this.notReadyPollMs;
    this.onState(SYNC_STATES.SYNCING, {
      partition: this.partition,
      reason,
      serverReachable: true,
      retryable: true,
      waitingForAuthority: true,
      nextAuthorityCheckAt: this.nextAuthorityCheckAt,
      status,
    });
    return {
      ok: false,
      reason,
      retryable: true,
      serverReachable: true,
      waitingForAuthority: true,
      nextAuthorityCheckAt: this.nextAuthorityCheckAt,
      status,
    };
  }

  #handleError(error) {
    const classified = classifyObservatoryConnectError(error);
    if (classified.reason === 'OBSERVATORY_NOT_READY' || error?.status === 503) {
      return this.#waitForAuthority(classified.reason, null);
    }
    this.onState(classified.state, {
      partition: this.partition,
      reason: classified.reason,
      retryable: classified.retryable,
      serverReachable: classified.serverReachable,
    });
    return {
      ok: false,
      reason: classified.reason,
      retryable: classified.retryable,
      serverReachable: classified.serverReachable,
      error,
    };
  }
}
