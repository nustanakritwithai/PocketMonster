/**
 * Client seam for server-authoritative owned-monster commands.
 *
 * This adapter intentionally does not know a URL, WebSocket message name, or
 * damage rule. The host injects `send`; until a real Server ingress is wired,
 * calls fail closed with SERVER_INGRESS_UNAVAILABLE.
 */
export const MONSTER_COMMAND_CONTRACT = 'owned-monster-command/v1';
export const MONSTER_COMMAND_KINDS = Object.freeze(['summon', 'skill', 'recall', 'switch']);

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,96}$/;
const ZONE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function id(value) { return typeof value === 'string' && ID_PATTERN.test(value) ? value : null; }
function generation(value) { return Number.isSafeInteger(value) && value > 0 ? value : null; }

export function sanitizeMonsterCommand(value) {
  if (!record(value) || value.contract !== MONSTER_COMMAND_CONTRACT
    || !MONSTER_COMMAND_KINDS.includes(value.kind)
    || !id(value.commandId) || !id(value.instanceId)
    || !ZONE_PATTERN.test(value.zone ?? '')) return null;
  const command = {
    contract: MONSTER_COMMAND_CONTRACT,
    kind: value.kind,
    commandId: value.commandId,
    instanceId: value.instanceId,
    zone: value.zone,
  };
  if (value.targetPoint !== undefined) {
    if (!record(value.targetPoint) || !['x', 'y', 'z'].every(key => Number.isFinite(value.targetPoint[key]))) return null;
    command.targetPoint = Object.freeze({ x: value.targetPoint.x, y: value.targetPoint.y, z: value.targetPoint.z });
  }
  if (value.kind === 'skill') {
    if (!id(value.skillId)) return null;
    command.skillId = value.skillId;
    if (value.targetActorId !== undefined && !id(value.targetActorId)) return null;
    if (value.targetActorId !== undefined) command.targetActorId = value.targetActorId;
  }
  if (value.kind === 'recall') {
    if (value.targetPoint !== undefined || !generation(value.expectedActiveGeneration)) return null;
    command.expectedActiveGeneration = value.expectedActiveGeneration;
  }
  if (value.kind === 'switch') {
    if (!id(value.expectedActiveInstanceId) || !generation(value.expectedActiveGeneration) || value.targetPoint === undefined) return null;
    command.expectedActiveInstanceId = value.expectedActiveInstanceId;
    command.expectedActiveGeneration = value.expectedActiveGeneration;
  }
  if (value.kind === 'summon' && command.targetPoint === undefined) return null;
  return Object.freeze(command);
}

export function createMonsterCommandAdapter({ send = null, getZone = null, timeoutMs = 10000, maxPending = 64 } = {}) {
  const pending = new Map();
  const resolved = new Map();
  let sceneEpoch = 0;
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 30000) : 10000;
  const capacity = Number.isSafeInteger(maxPending) && maxPending > 0 ? Math.min(maxPending, 128) : 64;
  const currentZone = () => typeof getZone === 'function' ? getZone() : null;
  const dispatch = input => {
    const command = sanitizeMonsterCommand(input);
    if (!command) return Object.freeze({ ok: false, code: 'INVALID_COMMAND' });
    if (currentZone() !== null && currentZone() !== command.zone) return Object.freeze({ ok: false, code: 'STALE_SCENE' });
    const fingerprint = JSON.stringify(command);
    const cached = resolved.get(command.commandId);
    if (cached) return cached.fingerprint === fingerprint ? cached.result : Object.freeze({ ok: false, code: 'COMMAND_ID_REUSE' });
    const active = pending.get(command.commandId);
    if (active) return active.fingerprint === fingerprint ? active.promise : Object.freeze({ ok: false, code: 'COMMAND_ID_REUSE' });
    if (typeof send !== 'function') return Object.freeze({ ok: false, code: 'SERVER_INGRESS_UNAVAILABLE' });
    if (pending.size >= capacity) return Object.freeze({ ok: false, code: 'PENDING_CAPACITY' });
    const requestEpoch = sceneEpoch;
    const request = { fingerprint, settled: false, timerId: null, finish: null, promise: null };
    const failure = code => Object.freeze({ ok: false, code, commandId: command.commandId });
    const stale = () => requestEpoch !== sceneEpoch || (currentZone() !== null && currentZone() !== command.zone);
    request.promise = new Promise(resolve => {
      request.finish = (result, cache = false) => {
        if (request.settled) return;
        request.settled = true;
        clearTimeout(request.timerId);
        if (pending.get(command.commandId) === request) pending.delete(command.commandId);
        if (cache) {
          resolved.set(command.commandId, { fingerprint, result });
          while (resolved.size > 128) resolved.delete(resolved.keys().next().value);
        }
        resolve(result);
      };
    });
    pending.set(command.commandId, request);
    request.timerId = setTimeout(() => request.finish(failure('TRANSPORT_TIMEOUT')), timeout);
    void Promise.resolve().then(() => {
      if (request.settled) return;
      if (stale()) { request.finish(failure('STALE_SCENE')); return; }
      return send(command);
    }).then(result => {
      if (request.settled) return;
      if (stale()) { request.finish(failure('STALE_SCENE')); return; }
      if (!record(result) || typeof result.ok !== 'boolean' || result.commandId !== command.commandId
        || (result.accepted !== undefined && typeof result.accepted !== 'boolean')
        || (result.code !== undefined && (typeof result.code !== 'string' || !/^[A-Z0-9_]{1,80}$/.test(result.code)))) {
        request.finish(failure('INVALID_SERVER_RESULT'));
        return;
      }
      const normalized = Object.freeze({ ok: result.ok,
        ...(result.accepted === undefined ? {} : { accepted: result.accepted }),
        ...(result.code === undefined ? {} : { code: result.code }), commandId: command.commandId });
      request.finish(normalized, !['TRANSPORT_ERROR', 'TRANSPORT_TIMEOUT'].includes(result.code));
    }).catch(() => request.finish(failure(stale() ? 'STALE_SCENE' : 'TRANSPORT_ERROR')));
    return request.promise;
  };
  return Object.freeze({
    summon(input) { return dispatch({ ...input, kind: 'summon', contract: MONSTER_COMMAND_CONTRACT }); },
    skill(input) { return dispatch({ ...input, kind: 'skill', contract: MONSTER_COMMAND_CONTRACT }); },
    recall(input) { return dispatch({ ...input, kind: 'recall', contract: MONSTER_COMMAND_CONTRACT }); },
    switch(input) { return dispatch({ ...input, kind: 'switch', contract: MONSTER_COMMAND_CONTRACT }); },
    pendingCommandIds: () => Object.freeze([...pending.keys()]),
    clearScene() {
      sceneEpoch += 1;
      for (const [commandId, request] of pending) request.finish(Object.freeze({ ok: false, code: 'STALE_SCENE', commandId }));
      resolved.clear();
    },
  });
}
