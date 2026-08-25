const CACHE_KEY = 'monsterlife.serverCatalog.v1';

function url(config, path) { return new URL(path.replace(/^\//, ''), `${config.apiBaseUrl.replace(/\/$/, '')}/`).href; }
function readCache(storage) { try { const value = JSON.parse(storage?.getItem?.(CACHE_KEY) || 'null'); return value?.manifest?.catalogVersion ? value : null; } catch { return null; } }
function writeCache(storage, value) { try { storage?.setItem?.(CACHE_KEY, JSON.stringify(value)); } catch { /* cache is optional */ } }
async function sha256Hex(value) {
  const cryptoImpl=globalThis.crypto;
  if(!cryptoImpl?.subtle)throw new Error('Catalog checksum verification is unavailable');
  const digest=await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function verifyResource(kind, documents, expected) {
  if(!Array.isArray(documents))throw new Error(`Invalid ${kind} catalog resource`);
  const ordered=[...documents].sort((left,right)=>String(left.id).localeCompare(String(right.id)));
  const actual=await sha256Hex(ordered.map(document=>document.checksum||'').join(''));
  if(actual!==String(expected||'').toLowerCase())throw new Error(`Catalog checksum mismatch: ${kind}`);
}

async function getJson(config, path, { fetchImpl, etag } = {}) {
  const headers = { Accept: 'application/json', 'X-API-Version': config.apiVersion };
  if (etag) headers['If-None-Match'] = etag;
  const response = await fetchImpl(url(config, path), { method: 'GET', headers, cache: 'no-store' });
  if (response.status === 304) return { notModified: true, etag };
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(`Catalog request failed (${response.status})`);
  return { payload, etag: response.headers?.get?.('ETag') || '' };
}

export async function loadServerCatalog(config, {
  fetchImpl = globalThis.fetch, storage = globalThis.localStorage,
} = {}) {
  const cached = readCache(storage);
  if (!config?.featureFlags?.vpsEnabled || !config?.featureFlags?.vpsReads || !config?.apiBaseUrl) return Object.freeze({ state: 'embedded', cache: cached });
  try {
    const manifestResult = await getJson(config, '/api/catalog/manifest', { fetchImpl, etag: cached?.manifestEtag });
    if (manifestResult.notModified && cached) return Object.freeze({ state: 'cached', ...cached });
    const manifest = manifestResult.payload.manifest;
    if (!manifest?.catalogVersion || !manifest.resources) throw new Error('Invalid catalog manifest');
    const resources = {};
    const resourceEtags = {};
    for (const kind of Object.keys(manifest.resources).sort()) {
      const result = await getJson(config, `/api/catalog/${kind}`, { fetchImpl, etag: cached?.manifest?.catalogVersion === manifest.catalogVersion ? cached?.resourceEtags?.[kind] : '' });
      if (result.notModified && cached?.resources?.[kind]) resources[kind] = cached.resources[kind];
      else { resources[kind] = result.payload.documents; await verifyResource(kind,resources[kind],manifest.resources[kind].checksum); }
      resourceEtags[kind] = result.etag || cached?.resourceEtags?.[kind] || '';
    }
    const value = { manifest, resources, manifestEtag: manifestResult.etag, resourceEtags, cachedAtUtc: new Date().toISOString() };
    writeCache(storage, value);
    return Object.freeze({ state: 'fresh', ...value });
  } catch (error) {
    if (cached) return Object.freeze({ state: 'stale-cache', ...cached, error: error.message });
    return Object.freeze({ state: 'embedded', cache: null, error: error.message });
  }
}

export function catalogMutationVersion(catalog) {
  return ['fresh', 'cached'].includes(catalog?.state) ? catalog.manifest.catalogVersion : '';
}
