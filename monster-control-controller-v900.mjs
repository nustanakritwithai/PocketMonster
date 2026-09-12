/** ตัวควบคุมแผงกลาง: สถานะ active มาจาก snapshot เท่านั้น */
export const MONSTER_COMMAND_CONTRACT = 'owned-monster-command/v1';
const emptyPanel = () => ({ mode: 'character', slot: null, instanceId: '' });
const pointOf = value => value && ['x', 'y', 'z'].every(key => Number.isFinite(value[key]))
  ? { x: value.x, y: value.y, z: value.z } : null;

export function createMonsterControlController({ commands, getParty = () => null, getZone = () => '',
  getAim = () => null, getSkills = () => [], getConfirmedActors = () => [], getCapabilities = () => null } = {}) {
  if (!commands?.summon || !commands?.skill) throw new TypeError('summon and skill commands are required');
  let panel = emptyPanel();
  let revision = 0;
  let epoch = 0;
  let disposed = false;
  let waiting = null;
  let held = null;
  const retryable = new Map();
  const listeners = new Set();
  const zone = () => getZone();
  const actors = () => Array.isArray(getConfirmedActors()) ? getConfirmedActors() : [];
  const capabilities = () => getCapabilities() || {};
  const supports = kind => capabilities()[kind] === true;
  const isActive = id => actors().some(actor => actor?.active === true && actor.instanceId === id && actor.zone === zone());
  const slotOf = index => Number.isInteger(index) && index >= 0 ? getParty()?.slots?.[index] : null;
  const activeActor = () => actors().find(actor => actor?.active === true && actor.zone === zone()) || null;
  const snapshot = () => {
    const party = getParty();
    const slots = Object.freeze((party?.slots || []).map(slot => Object.freeze({ ...slot,
      active: Boolean(slot?.instanceId) && isActive(slot.instanceId),
      pending: slot?.instanceId === waiting?.instanceId,
      held: slot?.instanceId === held?.instanceId,
    })));
    return Object.freeze({ ...party, available: !disposed && party?.available === true, slots,
      capabilities: Object.freeze({ recall: supports('recall'), switch: supports('switch') }),
      pending: waiting !== null, pendingKind: waiting?.kind || null,
      held: held ? Object.freeze({ ...held }) : null,
      revision, mode: panel.mode, slot: panel.slot, instanceId: panel.instanceId || null,
      controlPanel: Object.freeze({ ...panel }) });
  };
  const emit = () => {
    revision += 1;
    const value = snapshot();
    for (const listener of listeners) { try { listener(value); } catch {} }
    return value;
  };
  const sync = () => {
    if (disposed) return snapshot();
    if (waiting && getParty()?.available === true && (waiting.kind === 'recall'
      ? !actors().some(actor => actor.active === true && actor.zone === zone() && actor.instanceId === waiting.instanceId && actor.generation === waiting.command.expectedActiveGeneration)
      : isActive(waiting.instanceId))) {
      retryable.delete(waiting.retryKey); waiting = null;
    }
    if (held && (held.zone !== zone() || slotOf(held.index)?.instanceId !== held.instanceId || slotOf(held.index)?.available !== true)) held = null;
    if (panel.instanceId && (!isActive(panel.instanceId) || slotOf(panel.slot)?.instanceId !== panel.instanceId)) panel = emptyPanel();
    return emit();
  };
  const clear = () => {
    epoch += 1;
    waiting = null;
    held = null;
    retryable.clear();
    panel = emptyPanel();
    commands.clearScene?.();
    return emit();
  };
  const activateSlot = async (index, options = {}) => {
    const requestEpoch = epoch;
    let request = null;
    try {
      const slot = slotOf(index);
      if (disposed || !slot?.available || !slot.instanceId || slot.fainted) return { ok: false, reason: 'unavailable' };
      if (isActive(slot.instanceId)) {
        held = null;
        panel = panel.mode === 'monster' && panel.instanceId === slot.instanceId ? emptyPanel()
          : { mode: 'monster', slot: index, instanceId: slot.instanceId };
        emit();
        return { ok: true, reason: 'panel-toggled', mode: panel.mode };
      }
      if (waiting) return { ok: false, reason: 'summon-pending' };
      if (!options.throw) {
        if (held?.instanceId === slot.instanceId && held?.index === index) {
          return { ok: true, reason: 'already-prepared', mode: 'character', slot: index, instanceId: slot.instanceId };
        }
        held = { index, instanceId: slot.instanceId, zone: zone() };
        panel = emptyPanel();
        emit();
        return { ok: true, reason: 'prepared', mode: 'character', slot: index, instanceId: slot.instanceId };
      }
      const current = activeActor();
      if (current && !supports('switch')) return { ok: false, reason: 'switch-unavailable' };
      if (current && (!Number.isSafeInteger(current.generation) || current.generation < 1)) return { ok: false, reason: 'generation-unavailable' };
      const targetPoint = pointOf(getAim());
      if (!targetPoint) return { ok: false, reason: 'aim-unavailable' };
      const retryKey = `deployment:${slot.instanceId}`;
      const retryCommand = retryable.get(retryKey);
      const command = retryCommand || { commandId: globalThis.crypto.randomUUID(),
        kind: current ? 'switch' : 'summon',
        instanceId: slot.instanceId, zone: zone(), targetPoint,
        ...(current ? { expectedActiveInstanceId: current.instanceId, expectedActiveGeneration: current.generation } : {}) };
      const commandKind = command.kind;
      request = { instanceId: slot.instanceId, command, retryKey, kind: commandKind, epoch: requestEpoch };
      waiting = request;
      emit();
      const result = commandKind === 'switch'
        ? (typeof commands.switch === 'function' ? await commands.switch({ ...command, contract: MONSTER_COMMAND_CONTRACT, kind: 'switch' }) : { ok: false, code: 'SWITCH_UNAVAILABLE' })
        : await commands.summon(command);
      if (disposed || epoch !== requestEpoch || zone() !== command.zone) return { ok: false, reason: 'stale-scene' };
      if (!result?.ok) {
        if (waiting === request) waiting = null;
        if (['TRANSPORT_ERROR', 'TRANSPORT_TIMEOUT'].includes(result?.code)) retryable.set(retryKey, command);
        else retryable.delete(retryKey);
        emit();
        return { ok: false, reason: result?.code || 'summon-rejected' };
      }
      held = null;
      panel = emptyPanel();
      if (current && isActive(slot.instanceId)) {
        if (waiting === request) waiting = null;
        retryable.delete(retryKey);
        panel = emptyPanel();
        emit();
        return { ok: true, reason: 'switch-confirmed', mode: panel.mode };
      }
      if (isActive(slot.instanceId)) {
        if (waiting === request) waiting = null;
        retryable.delete(retryKey);
        emit();
        return { ok: true, reason: 'summon-confirmed', mode: panel.mode };
      }
      // ACK อาจมาถึงก่อน snapshot: คง pending ไว้ ไม่ส่ง summon ตัวใหม่
      emit();
      return { ok: true, reason: 'awaiting-snapshot', mode: panel.mode };
    } catch {
      if (request && waiting === request) waiting = null;
      if (epoch === requestEpoch) emit();
      return { ok: false, reason: 'control-error' };
    }
  };
  const throwHeld = async () => {
    if (!held) return { ok: false, reason: 'nothing-held' };
    const slot = slotOf(held.index);
    if (held.zone !== zone() || slot?.instanceId !== held.instanceId || slot?.available !== true || slot.fainted) {
      held = null;
      emit();
      return { ok: false, reason: 'held-unavailable' };
    }
    return activateSlot(held.index, { throw: true });
  };
  const recall = async () => {
    const requestEpoch = epoch;
    const current = activeActor();
    if (disposed || !current) return { ok: false, reason: 'actor-inactive' };
    if (typeof commands.recall !== 'function') return { ok: false, reason: 'recall-unavailable' };
    if (!supports('recall')) return { ok: false, reason: 'recall-unavailable' };
    if (waiting) return { ok: false, reason: 'command-pending' };
    if (!Number.isSafeInteger(current.generation) || current.generation < 1) return { ok: false, reason: 'generation-unavailable' };
    const retryKey = `recall:${current.instanceId}`;
    const command = retryable.get(retryKey) || { commandId: globalThis.crypto.randomUUID(), instanceId: current.instanceId, zone: zone(), expectedActiveGeneration: current.generation };
    waiting = { instanceId: current.instanceId, command, retryKey, kind: 'recall', epoch: requestEpoch };
    emit();
    try {
      const result = await commands.recall({ ...command, contract: MONSTER_COMMAND_CONTRACT, kind: 'recall' });
      if (disposed || epoch !== requestEpoch || zone() !== command.zone) return { ok: false, reason: 'stale-scene' };
      if (!result?.ok) {
        if (waiting?.command === command) waiting = null;
        if (['TRANSPORT_ERROR', 'TRANSPORT_TIMEOUT'].includes(result?.code)) retryable.set(retryKey, command);
        else retryable.delete(retryKey);
        emit(); return { ok: false, reason: result?.code || 'recall-rejected' };
      }
      if (!isActive(current.instanceId)) {
        if (waiting?.command === command) waiting = null;
        retryable.delete(retryKey);
        panel = emptyPanel();
        emit();
        return result;
      }
      emit();
      return { ok: true, reason: 'awaiting-snapshot' };
    } catch { if (waiting?.command === command) waiting = null; emit(); return { ok: false, reason: 'control-error' }; }
  };
  const skills = () => Object.freeze((panel.instanceId ? getSkills(panel.instanceId) || [] : [])
    .map(skill => Object.freeze({ ...skill })));
  const useSkill = async (index, target = {}) => {
    try {
      if (disposed || panel.mode !== 'monster') return { ok: false, reason: 'character-panel-active' };
      const instanceId = panel.instanceId;
      const requestEpoch = epoch;
      const requestZone = zone();
      if (!isActive(instanceId) || slotOf(panel.slot)?.instanceId !== instanceId) { sync(); return { ok: false, reason: 'actor-inactive' }; }
      const skill = Number.isInteger(index) && index >= 0 ? skills()[index] : null;
      const cooldownMs = Number.isFinite(skill?.cooldownRemainingMs)
        ? skill.cooldownRemainingMs
        : (Number.isFinite(skill?.cooldownRemaining) ? skill.cooldownRemaining * 1000 : 0);
      if (!skill?.skillId || skill.disabled || skill.disabledReason || cooldownMs > 0) return { ok: false, reason: 'skill-unavailable' };
      const targetPoint = pointOf(target.targetPoint || getAim());
      const result = await commands.skill({ commandId: globalThis.crypto.randomUUID(), instanceId,
        zone: requestZone, skillId: skill.skillId,
        ...(target.targetActorId ? { targetActorId: target.targetActorId } : {}), ...(targetPoint ? { targetPoint } : {}) });
      if (disposed || epoch !== requestEpoch || zone() !== requestZone) return { ok: false, reason: 'stale-scene' };
      return result?.ok ? result : { ok: false, reason: result?.code || 'skill-rejected' };
    } catch { return { ok: false, reason: 'control-error' }; }
  };
  return Object.freeze({ snapshot, sync, skills, useSkill, recall, recallActive: recall, activateSlot, activatePartySlot: activateSlot, throwHeld,
    reset: clear, clearScene: clear,
    subscribe(listener) { if (disposed || typeof listener !== 'function') return () => {}; listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
    dispose() { disposed = true; clear(); listeners.clear(); },
  });
}
