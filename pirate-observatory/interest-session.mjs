import { PIRATE_OBSERVATORY_SCHEMA_VERSION } from './protocol.mjs';

function requestSignature(request) {
  const viewport = request?.viewport ?? {};
  return JSON.stringify({
    partition: request?.partition,
    minX: viewport.minX,
    maxX: viewport.maxX,
    minZ: viewport.minZ,
    maxZ: viewport.maxZ,
    zoom: request?.zoom,
    selectedId: request?.selectedId ?? null,
    watchedIds: [...(request?.watchedIds ?? [])].sort(),
    includeTypes: [...(request?.includeTypes ?? [])].sort(),
    maxEntities: request?.maxEntities,
  });
}

export class PirateObservatoryInterestSession {
  constructor({
    transport,
    getRequest,
    onInterest = () => {},
    onError = () => {},
    pollMs = 750,
    setIntervalImpl = globalThis.setInterval,
    clearIntervalImpl = globalThis.clearInterval,
  } = {}) {
    if (!transport?.getInterest) throw new TypeError('transport.getInterest is required');
    if (typeof getRequest !== 'function') throw new TypeError('getRequest is required');
    if (!Number.isFinite(pollMs) || pollMs < 250) throw new TypeError('pollMs must be at least 250ms');
    this.transport = transport;
    this.getRequest = getRequest;
    this.onInterest = onInterest;
    this.onError = onError;
    this.pollMs = pollMs;
    this.setIntervalImpl = setIntervalImpl;
    this.clearIntervalImpl = clearIntervalImpl;
    this.timer = null;
    this.inFlight = null;
    this.stopped = true;
    this.lastAppliedSignature = null;
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
    const request = this.getRequest();
    const signature = requestSignature(request);
    this.inFlight = this.#run(request, signature);
    try { return await this.inFlight; }
    finally { this.inFlight = null; }
  }

  async #run(request, signature) {
    try {
      const response = await this.transport.getInterest(request);
      if (this.stopped) return { ok: false, reason: 'SESSION_STOPPED' };
      if (requestSignature(this.getRequest()) !== signature) return { ok: false, reason: 'STALE_VIEWPORT' };
      if (response?.schemaVersion !== PIRATE_OBSERVATORY_SCHEMA_VERSION
        || response.partition !== request.partition
        || !Number.isSafeInteger(response.tick) || response.tick < 0
        || !Number.isSafeInteger(response.sequence) || response.sequence < 0
        || !Number.isInteger(response.lod) || response.lod < 0 || response.lod > 3
        || !Array.isArray(response.entities)) {
        const error = Object.assign(new Error('Invalid Observatory interest response'), { code: 'INVALID_INTEREST_RESPONSE' });
        this.onError(error, request);
        return { ok: false, reason: error.code };
      }
      this.lastAppliedSignature = signature;
      await this.onInterest(response, request);
      return { ok: true, response, request };
    } catch (error) {
      this.onError(error, request);
      return { ok: false, reason: error?.code ?? 'INTEREST_REQUEST_FAILED', error };
    }
  }
}
