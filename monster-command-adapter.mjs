/**
 * Client seam for server-authoritative owned-monster commands.
 *
 * This adapter intentionally does not know a URL, WebSocket message name, or
 * damage rule. The host injects `send`; until a real Server ingress is wired,
 * calls fail closed with SERVER_INGRESS_UNAVAILABLE.
 */
export const MONSTER_COMMAND_CONTRACT = 'owned-monster-command/v1';
export const MONSTER_COMMAND_KINDS = Object.freeze(['summon', 'skill']);

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,96}$/;
const ZONE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function id(value) { return typeof value === 'string' && ID_PATTERN.test(value) ? value : null; }

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
  if (value.kind === 'summon' && command.targetPoint === undefined) return null;
  return Object.freeze(command);
}

export function createMonsterCommandAdapter({ send = null, getZone = null, timeoutMs = 10000, maxPending = 64 } = {}) {
  const pending = new Map();
  const resolved = new Map();
  let sceneEpoch = 0;
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
    if (!Number.isFinite(maxPending) || maxPending < 1 || pending.size >= Math.floor(maxPending)) return Object.freeze({ ok: false, code: 'PENDING_CAPACITY' });
    const requestEpoch = sceneEpoch;
    const request = { fingerprint, epoch: requestEpoch, settled: false, resolve: null, timerId: null };
    const cleanup = () => { if (pending.get(command.commandId) === request) pending.delete(command.commandId); };
    const operation = Promise.resolve().then(() => {
      if (request.settled) return { ok: false, code: 'STALE_SCENE', commandId: command.commandId };
      if (request.epoch !== sceneEpoch || currentZone() !== null && currentZone() !== command.zone) return { ok: false, code: 'STALE_SCENE', commandId: command.commandId, skipSend: true };
      return send(command);
    }).then(result => {
      if (request.settled || request.epoch !== sceneEpoch || currentZone() !== null && currentZone() !== command.zone) { cleanup(); return Object.freeze({ ok: false, code: 'STALE_SCENE', commandId: command.commandId }); }
      const normalized = record(result) && typeof result.ok === 'boolean' && result.commandId === command.commandId
        ? Object.freeze({ ok: result.ok, ...(result.accepted === undefined ? {} : { accepted: result.accepted }), ...(result.code === undefined ? {} : { code: result.code }), commandId: command.commandId })
        : Object.freeze({ ok: false, code: 'INVALID_SERVER_RESULT', commandId: command.commandId });
      request.settled = true;
      if (request.timerId) clearTimeout(request.timerId);
      cleanup();
      if (normalized.code !== 'STALE_SCENE') {
        resolved.set(command.commandId, { fingerprint, result: normalized });
        while (resolved.size > 128) resolved.delete(resolved.keys().next().value);
      }
      return normalized;
    }, () => { request.settled = true; if (request.timerId) clearTimeout(request.timerId); cleanup(); return Object.freeze({ ok: false, code: 'TRANSPORT_ERROR', commandId: command.commandId }); });
    const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? new Promise(resolve => {
      request.resolve = resolve;
      request.timerId = setTimeout(() => { if (request.settled) return; request.settled = true; cleanup(); resolve(Object.freeze({ ok: false, code: 'TRANSPORT_TIMEOUT', commandId: command.commandId })); }, timeoutMs);
    }) : null;
    const promise = timeout ? Promise.race([operation, timeout]) : operation;
    request.promise = promise;
    pending.set(command.commandId, request);
    return promise;
  };
  return Object.freeze({
    summon(input) { return dispatch({ ...input, kind: 'summon', contract: MONSTER_COMMAND_CONTRACT }); },
    skill(input) { return dispatch({ ...input, kind: 'skill', contract: MONSTER_COMMAND_CONTRACT }); },
    pendingCommandIds: () => Object.freeze([...pending.keys()]),
    clearScene() { sceneEpoch += 1; for (const request of pending.values()) { request.settled = true; if (request.timerId) clearTimeout(request.timerId); request.resolve?.(Object.freeze({ ok: false, code: 'STALE_SCENE' })); } pending.clear(); resolved.clear(); },
  });
}
