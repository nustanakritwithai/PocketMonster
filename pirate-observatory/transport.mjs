import { assertPartition } from './protocol.mjs';

function normalizeBaseUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError('baseUrl is required');
  return text.endsWith('/') ? text : `${text}/`;
}

function assertSequence(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('sequence must be a non-negative safe integer');
  return value;
}

export class PirateObservatoryRestTransport {
  constructor({ baseUrl, fetchImpl = globalThis.fetch, headers = null } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.fetchImpl = fetchImpl;
    this.headers = headers;
  }

  async getStatus() {
    return this.#get('/api/observatory/status');
  }

  async getPartitionSnapshot(partition) {
    const target = encodeURIComponent(assertPartition(partition));
    return this.#get(`/api/observatory/regions/${target}/snapshot`);
  }

  async getChangesAfter(partition, afterSequence) {
    const target = encodeURIComponent(assertPartition(partition));
    assertSequence(afterSequence);
    return this.#get(`/api/observatory/regions/${target}/changes?afterSequence=${afterSequence}`);
  }

  async getInterest({ partition, viewport, zoom = 1, selectedId = null, watchedIds = [], includeTypes = [], maxEntities = 500 } = {}) {
    const target = encodeURIComponent(assertPartition(partition));
    if (!viewport || !['minX', 'maxX', 'minZ', 'maxZ'].every(key => Number.isFinite(viewport[key]))) {
      throw new TypeError('finite viewport bounds are required');
    }
    if (!Number.isFinite(zoom)) throw new TypeError('zoom must be finite');
    if (!Number.isSafeInteger(maxEntities) || maxEntities < 1) throw new TypeError('maxEntities must be a positive safe integer');

    const params = new URLSearchParams({
      minX: String(viewport.minX), maxX: String(viewport.maxX),
      minZ: String(viewport.minZ), maxZ: String(viewport.maxZ),
      zoom: String(zoom), maxEntities: String(maxEntities),
    });
    if (selectedId) params.set('selectedId', selectedId);
    for (const id of watchedIds) params.append('watch', id);
    for (const type of includeTypes) params.append('type', type);
    return this.#get(`/api/observatory/regions/${target}/interest?${params}`);
  }

  async #get(path) {
    const url = new URL(path, this.baseUrl);
    const dynamicHeaders = typeof this.headers === 'function' ? await this.headers() : this.headers;
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...(dynamicHeaders ?? {}) },
      cache: 'no-store',
      credentials: 'include',
    });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      const error = new Error(body?.message ?? body?.code ?? `Observatory request failed (${response.status})`);
      error.status = response.status;
      error.code = body?.code ?? 'HTTP_ERROR';
      throw error;
    }
    return body;
  }
}
