export const MONSTER_STATE_PROVIDER_KIND = 'monsterlife-owned-monster-http-provider-v1';

function endpoint(config, path) {
  if (!config?.apiBaseUrl || typeof path !== 'string' || !path.trim()) throw new Error('MonsterLife monster endpoint is not configured');
  return new URL(path.replace(/^\//, ''), `${config.apiBaseUrl.replace(/\/$/, '')}/`).href;
}

const DEFAULT_MONSTER_SLOT_ICON = '🐾';

/** แปลง Party จากเซิร์ฟเวอร์เป็น 3 ช่องเรียกของ Pirate โดยใช้ instanceId เป็นตัวอ้างอิงหลัก */
export function normalizeMonsterPartySlots(party) {
  const source = Array.isArray(party) ? party : [];
  return Array.from({ length: 3 }, (_, index) => {
    const raw = source[index];
    const instanceId = typeof raw?.instanceId === 'string' ? raw.instanceId : '';
    const name = typeof raw?.name === 'string' ? raw.name : '';
    const portraitKey = typeof raw?.portraitKey === 'string' && raw.portraitKey
      ? raw.portraitKey
      : (typeof raw?.speciesId === 'string' ? raw.speciesId : '');
    const icon = typeof raw?.icon === 'string' && raw.icon ? raw.icon
      : (typeof raw?.emoji === 'string' && raw.emoji ? raw.emoji : DEFAULT_MONSTER_SLOT_ICON);
    const occupied = Boolean(instanceId);
    return Object.freeze({
      ...(raw && typeof raw === 'object' ? raw : {}),
      slot: index,
      id: `slot-${index + 1}`,
      label: occupied ? (name || `มอนช่อง ${index + 1}`) : `ช่อง ${index + 1} ว่าง`,
      instanceId,
      name,
      portraitKey,
      icon,
      occupied,
      available: occupied && raw?.fainted !== true,
    });
  });
}

/** จับคู่ party IDs ใน save กับ collection ของเซิร์ฟเวอร์ โดยไม่สร้างข้อมูลมอนใหม่ฝั่งไคลเอนต์ */
export function resolveMonsterPartySlots({ collection, party } = {}) {
  const byId = new Map((Array.isArray(collection) ? collection : [])
    .filter(monster => typeof monster?.instanceId === 'string')
    .map(monster => [monster.instanceId, monster]));
  const records = (Array.isArray(party) ? party : []).map(instanceId =>
    typeof instanceId === 'string' ? (byId.get(instanceId) || { instanceId }) : null);
  return normalizeMonsterPartySlots(records);
}

function stateFromPlayerPayload(payload) {
  const source = payload?.monsterControl || {};
  const slots = Array.isArray(source.party)
    ? normalizeMonsterPartySlots(source.party).map(slot => ({ ...slot,
      available: slot.occupied && /^[A-Za-z0-9._:-]{1,96}$/.test(slot.instanceId) && slot.fainted !== true,
    }))
    : null;
  const party = Array.isArray(slots) ? { available: true, slots } : source.party;
  const actors = Array.isArray(source.actors || payload?.actors) ? (source.actors || payload.actors).map(actor => {
    const { generation, ...rest } = actor || {};
    return { ...rest, ...(Number.isSafeInteger(generation) && generation > 0 ? { generation } : {}) };
  }) : [];
  return Object.freeze({
    party: party || null,
    actors,
    skills: source.skills || payload?.skills || {},
    capabilities: Object.freeze({ recall: source.capabilities?.recall === true, switch: source.capabilities?.switch === true }),
    revision: Number.isSafeInteger(source.revision) ? source.revision : 0,
    available: Array.isArray(source.party) || Boolean(party?.available),
  });
}

export function createMonsterHttpProvider({ config, sessionToken, getSessionToken = null, isSessionActive = () => true, getZone = () => '', fetchImpl = globalThis.fetch, pollMs = 0 } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Monster HTTP provider requires fetch');
  if (typeof sessionToken !== 'string' || !sessionToken) throw new TypeError('Monster HTTP provider requires session sessionToken');
  let current = Object.freeze({ party: null, actors: [], skills: {}, capabilities: {}, revision: 0, available: false });
  let pollTimer = null;
  let generation = 0;
  let disposed = false;
  let pendingRefresh = null;
  const requests = new Set();
  const listeners = new Set();
  const notify = () => { for (const listener of listeners) { try { listener(current); } catch {} } return current; };
  const tokenForRequest = () => typeof getSessionToken === 'function' ? getSessionToken() : sessionToken;
  const sessionReady = token => (typeof isSessionActive !== 'function' || isSessionActive() === true)
    && typeof token === 'string' && token.length > 0;
  const stale = requestGeneration => disposed || requestGeneration !== generation;
  const clearState = () => { current = Object.freeze({ party: null, actors: [], skills: {}, capabilities: {}, revision: 0, available: false }); notify(); };
  const fetchBounded = async (url, init) => {
    const abort = new AbortController();
    requests.add(abort);
    const timer = setTimeout(() => abort.abort(), 8000);
    try {
      const response = await fetchImpl(url, { ...init, signal: abort.signal });
      const payload = await response.json().catch(() => null);
      return { response, payload };
    }
    finally { clearTimeout(timer); requests.delete(abort); }
  };
  const requestState = async () => {
    const requestGeneration = generation;
    const requestToken = tokenForRequest();
    if (stale(requestGeneration) || !sessionReady(requestToken)) { clearState(); return Object.freeze({ ok: false, code: 'SESSION_UNAVAILABLE' }); }
    try {
      const zone = getZone();
      if (typeof zone !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(zone)) return Object.freeze({ ok: false, code: 'INVALID_ZONE' });
      const url = new URL(endpoint(config, 'api/monsters/control-state'));
      url.searchParams.set('zone', zone);
      const { response, payload } = await fetchBounded(url.href, { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json', 'X-API-Version': config.apiVersion, Authorization: `Bearer ${requestToken}` } });
      if (stale(requestGeneration) || tokenForRequest() !== requestToken || !sessionReady(requestToken) || getZone() !== zone) return Object.freeze({ ok: false, code: 'STALE_SCENE' });
      if (!response.ok || !payload?.ok || !Array.isArray(payload?.monsterControl?.party)) { clearState(); return Object.freeze({ ok: false, code: payload?.code || 'STATE_UNAVAILABLE' }); }
      current = stateFromPlayerPayload(payload);
      notify();
      return Object.freeze({ ok: true, state: current });
    } catch (error) {
      if (!stale(requestGeneration)) clearState();
      return Object.freeze({ ok: false, code: error?.code || 'STATE_UNAVAILABLE' });
    }
  };
  const refresh = () => {
    if (pendingRefresh) return pendingRefresh;
    const request = requestState();
    pendingRefresh = request;
    void request.finally(() => { if (pendingRefresh === request) pendingRefresh = null; });
    return request;
  };
  const send = async command => {
    const requestGeneration = generation;
    const requestToken = tokenForRequest();
    if (stale(requestGeneration) || !sessionReady(requestToken)) return Object.freeze({ ok: false, code: 'SESSION_UNAVAILABLE', commandId: command?.commandId });
    try {
      const { response, payload } = await fetchBounded(endpoint(config, 'api/monsters/command'), {
        method: 'POST', cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-API-Version': config.apiVersion, Authorization: `Bearer ${requestToken}` },
        body: JSON.stringify(command),
      });
      if (stale(requestGeneration) || tokenForRequest() !== requestToken || !sessionReady(requestToken)) return Object.freeze({ ok: false, code: 'STALE_SESSION', commandId: command?.commandId });
      if (!response.ok || !payload || typeof payload.ok !== 'boolean') return Object.freeze({ ok: false, code: payload?.code || 'INVALID_SERVER_RESULT', commandId: command?.commandId });
      if (payload.ok) void (pendingRefresh || Promise.resolve()).then(() => { if (!stale(requestGeneration)) return refresh(); });
      return Object.freeze({ ...payload, commandId: payload.commandId || command?.commandId });
    } catch { return Object.freeze({ ok: false, code: 'TRANSPORT_ERROR', commandId: command?.commandId }); }
  };
  const start = () => { if (disposed || pollTimer || !(pollMs > 0)) return false; pollTimer = setInterval(() => { void refresh(); }, Math.max(1000, pollMs)); return true; };
  const stop = () => { if (!pollTimer) return false; clearInterval(pollTimer); pollTimer = null; return true; };
  return Object.freeze({ kind: MONSTER_STATE_PROVIDER_KIND, snapshot: () => current, refresh, send,
    subscribe(listener) { if (typeof listener !== 'function') return () => {}; listeners.add(listener); listener(current); return () => listeners.delete(listener); },
    start, stop, reset() { generation += 1; stop(); for (const request of requests) request.abort(); pendingRefresh = null; clearState(); },
    reconnect: refresh, dispose() { disposed = true; generation += 1; stop(); for (const request of requests) request.abort(); pendingRefresh = null; listeners.clear(); },
  });
}
