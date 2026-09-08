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
  return Object.freeze(command);
}

export function createMonsterCommandAdapter({ send = null, getZone = null } = {}) {
  const pending = new Map();
  const resolved = new Map();
  const currentZone = () => typeof getZone === 'function' ? getZone() : null;
  const dispatch = input => {
    const command = sanitizeMonsterCommand(input);
    if (!command) return Object.freeze({ ok: false, code: 'INVALID_COMMAND' });
    if (currentZone() !== null && currentZone() !== command.zone) return Object.freeze({ ok: false, code: 'STALE_SCENE' });
    if (resolved.has(command.commandId)) return resolved.get(command.commandId);
    if (pending.has(command.commandId)) return pending.get(command.commandId);
    if (typeof send !== 'function') return Object.freeze({ ok: false, code: 'SERVER_INGRESS_UNAVAILABLE' });
    const operation = Promise.resolve().then(() => send(command)).then(result => {
      const normalized = record(result) && typeof result.ok === 'boolean'
        ? Object.freeze({ ...result, commandId: result.commandId ?? command.commandId })
        : Object.freeze({ ok: false, code: 'INVALID_SERVER_RESULT', commandId: command.commandId });
      pending.delete(command.commandId);
      resolved.set(command.commandId, normalized);
      return normalized;
    }, error => {
      pending.delete(command.commandId);
      const normalized = Object.freeze({ ok: false, code: 'TRANSPORT_ERROR', commandId: command.commandId, message: String(error?.message ?? error) });
      resolved.set(command.commandId, normalized);
      return normalized;
    });
    pending.set(command.commandId, operation);
    return operation;
  };
  return Object.freeze({
    summon(input) { return dispatch({ ...input, kind: 'summon' }); },
    skill(input) { return dispatch({ ...input, kind: 'skill' }); },
    pendingCommandIds: () => Object.freeze([...pending.keys()]),
    clearScene(scene) { for (const [key, value] of resolved) if (value.zone === scene) resolved.delete(key); },
  });
}
