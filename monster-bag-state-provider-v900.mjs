import { resolveMonsterPartySlots } from './monster-command-http-provider-v900.mjs';

const empty = code => Object.freeze({ available: false, revision: 0, envelope: null, slots: [], code });

/** อ่านกระเป๋าจากเซิร์ฟเวอร์ และส่งเฉพาะคำขอจัดช่อง ไม่ส่งเซฟทั้งก้อน */
export function createMonsterBagStateProvider({ config, sessionToken, getSessionToken = null,
  load = null, fetchImpl = globalThis.fetch, clientVersion = '8.4.0' } = {}) {
  let current = empty('NOT_LOADED');
  let boundToken = null;
  let epoch = 0;
  let disposed = false;
  let pendingRead = null;
  let pendingAssignment = null;
  const retries = new Map();
  const requests = new Set();
  const listeners = new Set();
  const notify = () => { for (const listener of listeners) { try { listener(current); } catch {} } };
  const loadInventory = load || (async (settings, requestToken) => {
    const abort = new AbortController(); requests.add(abort);
    const timer = setTimeout(() => abort.abort(), 8000);
    try {
      const response = await fetchImpl(new URL('api/monsters/inventory', `${settings.apiBaseUrl.replace(/\/$/, '')}/`).href, {
        cache: 'no-store', signal: abort.signal,
        headers: { Accept: 'application/json', 'X-API-Version': settings.apiVersion,
          'X-Game-Version': clientVersion, Authorization: `Bearer ${requestToken}` },
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true) throw Object.assign(new Error('Inventory unavailable'), { code: payload?.code || 'INVENTORY_UNAVAILABLE' });
      const state = payload.inventory;
      if (!state || !['collection','party','storage','ranchActive'].every(key => Array.isArray(state[key])))
        throw Object.assign(new Error('Invalid inventory'), { code: 'INVENTORY_INVALID' });
      return { envelope: { state }, revision: payload.revision, migrationRequired: payload.migrationRequired === true };
    } finally { clearTimeout(timer); requests.delete(abort); }
  });
  const token = () => typeof getSessionToken === 'function' ? getSessionToken() : sessionToken;
  const bindSession = () => {
    const value = token();
    if (boundToken !== value) {
      boundToken = value; epoch += 1; current = empty('NOT_LOADED');
      retries.clear(); pendingRead = null;
      for (const request of requests) request.abort();
      notify();
    }
    return value;
  };
  const stale = (requestToken, requestEpoch) => disposed || epoch !== requestEpoch || token() !== requestToken;
  const refresh = () => {
    const requestToken = bindSession();
    if (disposed || !requestToken) { current = empty('SESSION_UNAVAILABLE'); return Promise.resolve({ ok: false, code: current.code }); }
    if (pendingRead) return pendingRead;
    const requestEpoch = epoch;
    const work = (async () => {
      try {
        const loaded = await loadInventory(config, requestToken);
        if (stale(requestToken, requestEpoch)) return { ok: false, code: 'STALE_SESSION' };
        if (!loaded?.envelope?.state || !Number.isSafeInteger(loaded.revision) || loaded.revision < 0) {
          current = empty(loaded == null ? 'SAVE_NOT_FOUND' : 'INVENTORY_INVALID'); notify(); return { ok: false, code: current.code };
        }
        const envelope = structuredClone(loaded.envelope);
        current = Object.freeze({ available: true, revision: loaded.revision, envelope,
          slots: resolveMonsterPartySlots(envelope.state), migrationRequired: loaded.migrationRequired === true, code: null });
        notify();
        return { ok: true, state: current };
      } catch (error) {
        if (stale(requestToken, requestEpoch)) return { ok: false, code: 'STALE_SESSION' };
        current = empty(error?.code || 'SERVER_READ_FAILED');
        notify();
        return { ok: false, code: current.code };
      }
    })();
    pendingRead = work;
    void work.finally(() => { if (pendingRead === work) pendingRead = null; });
    return work;
  };
  const changePlacement = (instanceId, slot, destination = null) => {
    const requestToken = bindSession();
    if (disposed || !requestToken) return Promise.resolve({ ok: false, code: 'SESSION_UNAVAILABLE' });
    if (pendingAssignment) return Promise.resolve({ ok: false, code: 'ASSIGNMENT_PENDING' });
    if (typeof instanceId !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(instanceId)
      || (destination === null ? (!Number.isInteger(slot) || slot < 0 || slot > 2) : !['storage','ranch'].includes(destination)))
      return Promise.resolve({ ok: false, code: 'INVALID_MONSTER_SLOT' });
    const requestEpoch = epoch;
    const work = (async () => {
      try {
        if (!current.available) {
          const result = await refresh();
          if (!result.ok) return result;
        }
        if (stale(requestToken, requestEpoch)) return { ok: false, code: 'STALE_SESSION' };
        if (!current.envelope.state.collection?.some(monster => monster?.instanceId === instanceId))
          return { ok: false, code: 'MONSTER_NOT_OWNED' };
        if (destination === null && current.slots[slot]?.instanceId === instanceId) return { ok: true, state: current, revision: current.revision };
        const retryKey = `${current.revision}:${instanceId}:${destination || slot}`;
        // เก็บ UUID เดิมสำหรับ retry; ห้ามใส่ session token ลง commandId
        const command = retries.get(retryKey) || Object.freeze({ instanceId, ...(destination === null ? { slot } : { destination }),
          expectedRevision: current.revision, commandId: globalThis.crypto.randomUUID() });
        retries.set(retryKey, command);
        const abort = new AbortController(); requests.add(abort);
        const timer = setTimeout(() => abort.abort(), 8000);
        let response, payload;
        try {
          response = await fetchImpl(new URL(destination === null ? 'api/monsters/party-slot' : 'api/monsters/placement', `${config.apiBaseUrl.replace(/\/$/, '')}/`).href, {
            method: 'POST', cache: 'no-store', signal: abort.signal,
            headers: { Accept: 'application/json', 'Content-Type': 'application/json',
              'X-API-Version': config.apiVersion, 'X-Game-Version': clientVersion, Authorization: `Bearer ${requestToken}` },
            body: JSON.stringify(command),
          });
          payload = await response.json().catch(() => null);
        } finally { clearTimeout(timer); requests.delete(abort); }
        if (stale(requestToken, requestEpoch)) return { ok: false, code: 'STALE_SESSION' };
        if (!response.ok || payload?.ok !== true || !Number.isSafeInteger(payload.revision)) {
          if (response.status < 500) retries.delete(retryKey);
          if (response.status === 409) await refresh();
          return { ok: false, code: payload?.code || 'SERVER_ASSIGN_FAILED' };
        }
        retries.delete(retryKey);
        // อ่านใหม่หลังคำตอบเขียน ไม่ใช้ read ก่อนบันทึกเป็นหลักฐานสำเร็จ
        if (pendingRead) await pendingRead;
        const result = await refresh();
        if (stale(requestToken, requestEpoch)) return { ok: false, code: 'STALE_SESSION' };
        const confirmed = destination === null ? result.state?.slots[slot]?.instanceId === instanceId
          : destination === 'ranch' ? result.state?.envelope.state.ranchActive.includes(instanceId)
          : result.state?.envelope.state.storage.includes(instanceId) && !result.state?.envelope.state.ranchActive.includes(instanceId);
        return result.ok && result.state.revision >= payload.revision && confirmed
          ? { ok: true, revision: result.state.revision, state: result.state }
          : { ok: false, code: 'SERVER_ASSIGN_UNCONFIRMED' };
      } catch (error) {
        return { ok: false, code: stale(requestToken, requestEpoch) ? 'STALE_SESSION'
          : error?.name === 'AbortError' ? 'SERVER_ASSIGN_TIMEOUT' : 'SERVER_ASSIGN_FAILED' };
      }
    })();
    pendingAssignment = work;
    void work.finally(() => { if (pendingAssignment === work) pendingAssignment = null; });
    return work;
  };
  const claimStarter = () => {
    const requestToken = bindSession(), requestEpoch = epoch;
    if (disposed || !requestToken) return Promise.resolve({ ok: false, code: 'SESSION_UNAVAILABLE' });
    if (pendingAssignment) return Promise.resolve({ ok: false, code: 'ASSIGNMENT_PENDING' });
    const work = (async () => {
      const abort = new AbortController(); requests.add(abort);
      const timer = setTimeout(() => abort.abort(), 8000);
      try {
        // ส่งเพียงคำขอรับตัวเริ่มต้น ให้เซิร์ฟเวอร์เลือกชนิดและค่าสถานะทั้งหมด
        const command = retries.get('starter') || { commandId: globalThis.crypto.randomUUID() };
        retries.set('starter', command);
        const response = await fetchImpl(new URL('api/monsters/starter', `${config.apiBaseUrl.replace(/\/$/, '')}/`).href, {
          method: 'POST', cache: 'no-store', signal: abort.signal,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-API-Version': config.apiVersion,
            'X-Game-Version': clientVersion, Authorization: `Bearer ${requestToken}` },
          body: JSON.stringify(command),
        });
        const payload = await response.json();
        if (stale(requestToken, requestEpoch)) return { ok: false, code: 'STALE_SESSION' };
        if (!response.ok || payload?.ok !== true) return { ok: false, code: payload?.code || 'STARTER_FAILED' };
        retries.delete('starter');
        if (pendingRead) await pendingRead;
        const result = await refresh();
        return result.ok && result.state.envelope.state.collection.length > 0
          ? result : { ok: false, code: 'STARTER_UNCONFIRMED' };
      } catch (error) { return { ok: false, code: stale(requestToken, requestEpoch) ? 'STALE_SESSION' : error?.name === 'AbortError' ? 'STARTER_TIMEOUT' : 'STARTER_FAILED' }; }
      finally { clearTimeout(timer); requests.delete(abort); }
    })();
    pendingAssignment = work;
    void work.finally(() => { if (pendingAssignment === work) pendingAssignment = null; });
    return work;
  };
  return Object.freeze({ snapshot() { bindSession(); return current; }, refresh,
    claimStarter,
    subscribe(listener) { listeners.add(listener); listener(current); return () => listeners.delete(listener); },
    assignToSlot: (instanceId, slot) => changePlacement(instanceId, slot),
    moveTo: (instanceId, destination) => changePlacement(instanceId, null, destination),
    dispose() { disposed = true; epoch += 1; current = empty('SESSION_UNAVAILABLE'); retries.clear(); for (const request of requests) request.abort(); notify(); listeners.clear(); },
  });
}
