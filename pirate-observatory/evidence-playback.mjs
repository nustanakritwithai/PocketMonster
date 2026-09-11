function assertSequence(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('sequence must be a non-negative safe integer');
  return value;
}

export class PirateObservatoryEvidencePlayback {
  constructor({
    historySession,
    stepMs = 500,
    onState = () => {},
    setTimeoutImpl = globalThis.setTimeout,
    clearTimeoutImpl = globalThis.clearTimeout,
  } = {}) {
    if (!historySession?.loadSequence) throw new TypeError('historySession.loadSequence is required');
    if (!Number.isFinite(stepMs) || stepMs < 100) throw new TypeError('stepMs must be at least 100ms');
    if (typeof setTimeoutImpl !== 'function' || typeof clearTimeoutImpl !== 'function') throw new TypeError('timer functions are required');
    this.historySession = historySession;
    this.stepMs = stepMs;
    this.onState = onState;
    this.setTimeoutImpl = setTimeoutImpl;
    this.clearTimeoutImpl = clearTimeoutImpl;
    this.minSequence = null;
    this.maxSequence = null;
    this.currentSequence = null;
    this.state = 'idle';
    this.timer = null;
    this.generation = 0;
  }

  configureBounds(checkpoints) {
    if (!Array.isArray(checkpoints)) throw new TypeError('checkpoints must be an array');
    if (checkpoints.length === 0) {
      this.pause();
      this.minSequence = null;
      this.maxSequence = null;
      this.currentSequence = null;
      this.#setState('idle', { reason: 'NO_HISTORY' });
      return { ok: true, empty: true };
    }
    let previous = -1;
    for (const sequence of checkpoints) {
      assertSequence(sequence);
      if (sequence <= previous) throw new TypeError('checkpoint sequences must be strictly increasing');
      previous = sequence;
    }
    this.minSequence = checkpoints[0];
    this.maxSequence = checkpoints.at(-1);
    if (this.currentSequence !== null && (this.currentSequence < this.minSequence || this.currentSequence > this.maxSequence)) {
      this.currentSequence = null;
    }
    this.#emit({ boundsChanged: true });
    return { ok: true, minSequence: this.minSequence, maxSequence: this.maxSequence };
  }

  async jump(sequence) {
    const target = assertSequence(sequence);
    if (!this.#inBounds(target)) return { ok: false, reason: 'HISTORY_OUT_OF_RANGE' };
    this.pause({ emit: false });
    return this.#load(target, 'paused');
  }

  async step(delta) {
    if (!Number.isInteger(delta) || delta === 0) throw new TypeError('delta must be a non-zero integer');
    this.pause({ emit: false });
    if (this.minSequence === null || this.maxSequence === null) return { ok: false, reason: 'NO_HISTORY' };
    const origin = this.currentSequence ?? (delta > 0 ? this.minSequence - 1 : this.maxSequence + 1);
    const target = origin + delta;
    if (!this.#inBounds(target)) {
      this.#setState(delta > 0 ? 'ended' : 'paused', { reason: 'HISTORY_BOUNDARY' });
      return { ok: false, reason: 'HISTORY_BOUNDARY' };
    }
    return this.#load(target, 'paused');
  }

  async play() {
    if (this.state === 'playing') return { ok: true, alreadyPlaying: true };
    if (this.minSequence === null || this.maxSequence === null) return { ok: false, reason: 'NO_HISTORY' };

    if (this.currentSequence === null) {
      const initial = await this.#load(this.minSequence, 'paused');
      if (!initial.ok) return initial;
    }
    if (this.currentSequence >= this.maxSequence) {
      this.#setState('ended', { reason: 'HISTORY_BOUNDARY' });
      return { ok: false, reason: 'HISTORY_BOUNDARY' };
    }

    this.generation++;
    this.#setState('playing');
    this.#schedule(this.generation);
    return { ok: true };
  }

  pause({ emit = true } = {}) {
    this.generation++;
    if (this.timer !== null) this.clearTimeoutImpl(this.timer);
    this.timer = null;
    if (emit && this.state !== 'idle' && this.state !== 'error') this.#setState('paused');
  }

  clear() {
    this.pause({ emit: false });
    this.minSequence = null;
    this.maxSequence = null;
    this.currentSequence = null;
    this.#setState('idle');
  }

  status() {
    return Object.freeze({
      state: this.state,
      minSequence: this.minSequence,
      maxSequence: this.maxSequence,
      currentSequence: this.currentSequence,
      stepMs: this.stepMs,
    });
  }

  async #load(target, successState) {
    this.#setState('loading', { targetSequence: target });
    const result = await this.historySession.loadSequence(target);
    if (!result?.ok) {
      this.#setState('error', { reason: result?.reason ?? 'HISTORY_LOAD_FAILED', targetSequence: target });
      return result ?? { ok: false, reason: 'HISTORY_LOAD_FAILED' };
    }
    this.currentSequence = target;
    this.#setState(successState, { targetSequence: target, snapshot: result.snapshot });
    return { ok: true, snapshot: result.snapshot, sequence: target };
  }

  #schedule(generation) {
    if (this.timer !== null) this.clearTimeoutImpl(this.timer);
    this.timer = this.setTimeoutImpl(() => { void this.#tick(generation); }, this.stepMs);
  }

  async #tick(generation) {
    this.timer = null;
    if (generation !== this.generation || this.state !== 'playing') return;
    const next = (this.currentSequence ?? this.minSequence - 1) + 1;
    if (!this.#inBounds(next)) {
      this.#setState('ended', { reason: 'HISTORY_BOUNDARY' });
      return;
    }

    const result = await this.historySession.loadSequence(next);
    if (generation !== this.generation || this.state !== 'playing') return;
    if (!result?.ok) {
      this.#setState('error', { reason: result?.reason ?? 'HISTORY_LOAD_FAILED', targetSequence: next });
      return;
    }
    this.currentSequence = next;
    this.#emit({ targetSequence: next, snapshot: result.snapshot });
    if (next >= this.maxSequence) {
      this.#setState('ended', { reason: 'HISTORY_BOUNDARY' });
      return;
    }
    this.#schedule(generation);
  }

  #inBounds(sequence) {
    return this.minSequence !== null && this.maxSequence !== null
      && sequence >= this.minSequence && sequence <= this.maxSequence;
  }

  #setState(state, detail = {}) {
    this.state = state;
    this.#emit(detail);
  }

  #emit(detail = {}) {
    this.onState({ ...this.status(), ...detail });
  }
}
