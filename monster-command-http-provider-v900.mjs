export const MONSTER_STATE_PROVIDER_KIND = 'monsterlife-owned-monster-http-provider-v1';

function endpoint(config, path) {
  if (!config?.apiBaseUrl || typeof path !== 'string' || !path.trim()) throw new Error('MonsterLife monster endpoint is not configured');
  return new URL(path.replace(/^\//, ''), `${config.apiBaseUrl.replace(/\/$/, '')}/`).href;
}

function stateFromPlayerPayload(payload) {
  const source = payload?.monsterControl || {};
  const party = Array.isArray(source.party) ? { available: true, slots: source.party } : source.party;
  return Object.freeze({
    party: party || null,
    actors: source.actors || payload?.actors || [],
    skills: source.skills || payload?.skills || {},
    revision: Number.isSafeInteger(source.revision) ? source.revision : 0,
    available: Array.isArray(source.party) || Boolean(party?.available),
  });
}

export function createMonsterHttpProvider({ config, sessionToken, getZone = () => '', fetchImpl = globalThis.fetch, pollMs = 0 } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Monster HTTP provider requires fetch');
  if (typeof sessionToken !== 'string' || !sessionToken) throw new TypeError('Monster HTTP provider requires session sessionToken');
  let current = Object.freeze({ party: null, actors: [], skills: {}, revision: 0, available: false });
  let pollTimer = null;
  let generation = 0;
  const listeners = new Set();
  const notify = () => { for (const listener of listeners) { try { listener(current); } catch {} } return current; };
  const refresh = async () => {
    const requestGeneration = generation;
    try {
      const zone = getZone();
      if (typeof zone !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(zone)) return Object.freeze({ ok: false, code: 'INVALID_ZONE' });
      const url = new URL(endpoint(config, 'api/monsters/control-state'));
      url.searchParams.set('zone', zone);
      const response = await fetchImpl(url.href, { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json', 'X-API-Version': config.apiVersion, Authorization: `Bearer ${sessionToken}` } });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) return Object.freeze({ ok: false, code: payload?.code || 'STATE_UNAVAILABLE' });
      if (requestGeneration !== generation) return Object.freeze({ ok: false, code: 'STALE_SCENE' });
      current = stateFromPlayerPayload(payload);
      notify();
      return Object.freeze({ ok: true, state: current });
    } catch (error) {
      return Object.freeze({ ok: false, code: error?.code || 'STATE_UNAVAILABLE' });
    }
  };
  const send = async command => {
    try {
      const response = await fetchImpl(endpoint(config, 'api/monsters/command'), {
        method: 'POST', cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-API-Version': config.apiVersion, Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify(command),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload.ok !== 'boolean') return Object.freeze({ ok: false, code: payload?.code || 'INVALID_SERVER_RESULT', commandId: command?.commandId });
      return Object.freeze({ ...payload, commandId: payload.commandId || command?.commandId });
    } catch { return Object.freeze({ ok: false, code: 'TRANSPORT_ERROR', commandId: command?.commandId }); }
  };
  const start = () => { if (pollTimer || !(pollMs > 0)) return false; pollTimer = setInterval(() => { void refresh(); }, Math.max(1000, pollMs)); return true; };
  const stop = () => { if (!pollTimer) return false; clearInterval(pollTimer); pollTimer = null; return true; };
  return Object.freeze({ kind: MONSTER_STATE_PROVIDER_KIND, snapshot: () => current, refresh, send,
    subscribe(listener) { if (typeof listener !== 'function') return () => {}; listeners.add(listener); listener(current); return () => listeners.delete(listener); },
    start, stop, reset() { generation += 1; stop(); current = Object.freeze({ party: null, actors: [], skills: {}, revision: 0, available: false }); notify(); },
    reconnect: refresh, dispose() { generation += 1; stop(); listeners.clear(); },
  });
}
