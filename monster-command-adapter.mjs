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
  if (value.kind === 'skill') {
    if (!id(value.skillId)) return null;
    command.skillId = value.skillId;
    if (value.targetActorId !== undefined && !id(value.targetActorId)) return null;
    if (value.targetActorId !== undefined) command.targetActorId = value.targetActorId;
    if (value.targetPoint !== undefined) {
      if (!record(value.targetPoint) || !['x', 'y', 'z'].every(key => Number.isFinite(value.targetPoint[key]))) return null;
      command.targetPoint = Object.freeze({ x: value.targetPoint.x, y: value.targetPoint.y, z: value.targetPoint.z });
    }
  }
  if (value.targetPoint !== undefined) {
    if (!record(value.targetPoint) || !['x', 'y', 'z'].every(key => Number.isFinite(value.targetPoint[key]))) return null;
    command.targetPoint = Object.freeze({ x: value.targetPoint.x, y: value.targetPoint.y, z: value.targetPoint.z });
  } else if (value.kind === 'summon') return null;
  return Object.freeze(command);
}

export function createMonsterCommandAdapter({ send = null, getZone = null } = {}) {
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
    const requestEpoch = sceneEpoch;
    const operation = Promise.resolve().then(() => send(command)).then(result => {
      if (requestEpoch !== sceneEpoch || currentZone() !== null && currentZone() !== command.zone) return Object.freeze({ ok: false, code: 'STALE_SCENE', commandId: command.commandId });
      const normalized = record(result) && typeof result.ok === 'boolean' && result.commandId === command.commandId
        ? Object.freeze({ ...result })
        : Object.freeze({ ok: false, code: 'INVALID_SERVER_RESULT', commandId: command.commandId });
      pending.delete(command.commandId);
      if (normalized.code !== 'STALE_SCENE') {
        resolved.set(command.commandId, { fingerprint, result: normalized });
        while (resolved.size > 128) resolved.delete(resolved.keys().next().value);
      }
      return normalized;
    }, error => {
      pending.delete(command.commandId);
      return Object.freeze({ ok: false, code: 'TRANSPORT_ERROR', commandId: command.commandId });
    });
    pending.set(command.commandId, { fingerprint, promise: operation });
    return operation;
  };
  return Object.freeze({
    summon(input) { return dispatch({ ...input, kind: 'summon' }); },
    skill(input) { return dispatch({ ...input, kind: 'skill' }); },
    pendingCommandIds: () => Object.freeze([...pending.keys()]),
    clearScene() { sceneEpoch += 1; pending.clear(); resolved.clear(); },
  });
}
