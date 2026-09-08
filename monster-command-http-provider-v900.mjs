import { readPlayerState } from './server-player-data.mjs';

export const MONSTER_STATE_PROVIDER_KIND = 'monsterlife-owned-monster-http-provider-v1';

function endpoint(config, path) {
  if (!config?.apiBaseUrl || typeof path !== 'string' || !path.trim()) throw new Error('MonsterLife monster endpoint is not configured');
  return new URL(path.replace(/^\//, ''), `${config.apiBaseUrl.replace(/\/$/, '')}/`).href;
}

function stateFromPlayerPayload(payload) {
  const source = payload?.monsterControl || payload?.state || payload?.profile || payload || {};
  return Object.freeze({
    party: source.party || payload?.party || null,
    actors: source.actors || payload?.actors || [],
    skills: source.skills || payload?.skills || {},
    revision: Number.isSafeInteger(source.revision) ? source.revision : 0,
    available: Array.isArray(source.party || payload?.party),
  });
}

export function createMonsterHttpProvider({ config, sessionToken, commandPath = null, fetchImpl = globalThis.fetch, pollMs = 0 } = {}) {
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
      const payload = await readPlayerState(config, sessionToken, { fetchImpl });
      if (requestGeneration !== generation) return Object.freeze({ ok: false, code: 'STALE_SCENE' });
      current = stateFromPlayerPayload(payload);
      notify();
      return Object.freeze({ ok: true, state: current });
    } catch (error) {
      return Object.freeze({ ok: false, code: error?.code || 'STATE_UNAVAILABLE' });
    }
  };
  const send = async command => {
    if (!commandPath) return Object.freeze({ ok: false, code: 'SERVER_INGRESS_UNAVAILABLE', commandId: command?.commandId });
    try {
      const response = await fetchImpl(endpoint(config, commandPath), {
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
