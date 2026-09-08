/** ตัวควบคุมแผงกลาง: สถานะ active มาจาก snapshot เท่านั้น */
export const MONSTER_COMMAND_CONTRACT = 'owned-monster-command/v1';
const emptyPanel = () => ({ mode: 'character', slot: null, instanceId: '' });
const pointOf = value => value && ['x', 'y', 'z'].every(key => Number.isFinite(value[key]))
  ? { x: value.x, y: value.y, z: value.z } : null;

export function createMonsterControlController({ commands, getParty = () => null, getZone = () => '',
  getAim = () => null, getSkills = () => [], getConfirmedActors = () => [] } = {}) {
  if (!commands?.summon || !commands?.skill) throw new TypeError('summon and skill commands are required');
  let panel = emptyPanel();
  let revision = 0;
  let epoch = 0;
  let disposed = false;
  let waiting = null;
  const retryable = new Map();
  const listeners = new Set();
  const zone = () => getZone();
  const actors = () => Array.isArray(getConfirmedActors()) ? getConfirmedActors() : [];
  const isActive = id => actors().some(actor => actor?.active === true && actor.instanceId === id && actor.zone === zone());
  const slotOf = index => Number.isInteger(index) && index >= 0 ? getParty()?.slots?.[index] : null;
  const snapshot = () => {
    const party = getParty();
    const slots = Object.freeze((party?.slots || []).map(slot => Object.freeze({ ...slot,
      active: Boolean(slot?.instanceId) && isActive(slot.instanceId),
      pending: slot?.instanceId === waiting?.instanceId,
    })));
    return Object.freeze({ ...party, available: !disposed && party?.available === true, slots,
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
    if (waiting && isActive(waiting.instanceId)) { retryable.delete(waiting.instanceId); waiting = null; }
    if (panel.instanceId && (!isActive(panel.instanceId) || slotOf(panel.slot)?.instanceId !== panel.instanceId)) panel = emptyPanel();
    return emit();
  };
  const clear = () => {
    epoch += 1;
    waiting = null;
    retryable.clear();
    panel = emptyPanel();
    commands.clearScene?.();
    return emit();
  };
  const activateSlot = async index => {
    const requestEpoch = epoch;
    let request = null;
    try {
      const slot = slotOf(index);
      if (disposed || !slot?.available || !slot.instanceId || slot.fainted) return { ok: false, reason: 'unavailable' };
      if (isActive(slot.instanceId)) {
        waiting = null;
        panel = panel.mode === 'monster' && panel.instanceId === slot.instanceId ? emptyPanel()
          : { mode: 'monster', slot: index, instanceId: slot.instanceId };
        emit();
        return { ok: true, reason: 'panel-toggled', mode: panel.mode };
      }
      if (waiting) return { ok: false, reason: 'summon-pending' };
      // ข้อจำกัดเดิม: เรียกได้ครั้งละหนึ่งตัว; ไม่ใช้ปุ่มสลับแผงเป็น recall
      if (actors().some(actor => actor?.active === true && actor.zone === zone())) return { ok: false, reason: 'active-monster-recall-required' };
      const targetPoint = pointOf(getAim());
      if (!targetPoint) return { ok: false, reason: 'aim-unavailable' };
      const command = retryable.get(slot.instanceId) || { commandId: globalThis.crypto.randomUUID(),
        instanceId: slot.instanceId, zone: zone(), targetPoint };
      request = { instanceId: slot.instanceId, command, epoch: requestEpoch };
      waiting = request;
      emit();
      const result = await commands.summon(command);
      if (disposed || epoch !== requestEpoch || zone() !== command.zone) return { ok: false, reason: 'stale-scene' };
      if (!result?.ok) {
        if (waiting === request) waiting = null;
        if (['TRANSPORT_ERROR', 'TRANSPORT_TIMEOUT'].includes(result?.code)) retryable.set(slot.instanceId, command);
        else retryable.delete(slot.instanceId);
        emit();
        return { ok: false, reason: result?.code || 'summon-rejected' };
      }
      if (isActive(slot.instanceId)) {
        if (waiting === request) waiting = null;
        retryable.delete(slot.instanceId);
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
  return Object.freeze({ snapshot, sync, skills, useSkill, activateSlot, activatePartySlot: activateSlot,
    reset: clear, clearScene: clear,
    subscribe(listener) { if (disposed || typeof listener !== 'function') return () => {}; listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
    dispose() { disposed = true; clear(); listeners.clear(); },
  });
}
