/** Server-owned monster control state for the parent MMORPG HUD.
 * The controller never mutates a local monster or runs combat. `transport.send`
 * must return the server confirmation before state is advanced. */
export const MONSTER_COMMAND_CONTRACT = 'owned-monster-command/v1';

export function createMonsterControlController({ commands, getParty = () => null, getZone = () => '', getConfirmedActors = () => [] } = {}) {
  if (!commands || typeof commands.summon !== 'function' || typeof commands.skill !== 'function') throw new TypeError('monster control requires summon and skill commands');
  let state = Object.freeze({ mode: 'character', slot: null, instanceId: null, revision: 0, available: false, slots: Object.freeze([]) });
  const listeners = new Set();
  const emit = () => { for (const listener of listeners) { try { listener(state); } catch {} } return state; };
  const snapshot = () => Object.freeze({ ...state, available: getParty()?.available === true, slots: getParty()?.slots || state.slots });
  const subscribe = listener => { if (typeof listener !== 'function') return () => {}; listeners.add(listener); listener(state); return () => listeners.delete(listener); };
  const slotOf = slot => {
    const entry = getParty()?.slots?.[slot];
    return entry?.available === true && typeof entry.instanceId === 'string' ? entry : null;
  };
  const confirmed = (instanceId, slotIndex) => getConfirmedActors()?.some(actor => actor?.instanceId === instanceId && (actor.slot === undefined || actor.slot === slotIndex));
  return Object.freeze({
    snapshot, subscribe,
    async activateSlot(slotIndex) {
      const slot = slotOf(slotIndex);
      if (!slot) return { ok: false, reason: 'unavailable' };
      if (state.instanceId === slot.instanceId && state.slot === slotIndex) {
        state = Object.freeze({ ...state, mode: state.mode === 'monster' ? 'character' : 'monster', revision: state.revision + 1 });
        emit();
        return { ok: true, reason: 'panel-toggled', mode: state.mode };
      }
      if (state.instanceId && state.instanceId !== slot.instanceId) return { ok: false, reason: 'active-monster-recall-required' };
      const accepted = await Promise.resolve(commands.summon({ contract: MONSTER_COMMAND_CONTRACT, kind: 'summon', instanceId: slot.instanceId, slot: slot.slot, zone: getZone() }));
      if (!accepted?.ok || !confirmed(slot.instanceId, slot.slot)) return { ok: false, reason: accepted?.reason || 'server-not-confirmed' };
      state = Object.freeze({ ...state, mode: 'character', slot: slotIndex, instanceId: slot.instanceId, revision: state.revision + 1 });
      emit();
      return { ok: true, reason: 'summon-confirmed', mode: state.mode, slot: slotIndex, instanceId: slot.instanceId };
    },
    async useSkill(skillIndex, target = {}) {
      if (state.mode !== 'monster' || !state.instanceId) return { ok: false, reason: 'character-panel-active' };
      const slot = slotOf(state.slot);
      if (!slot) return { ok: false, reason: 'unavailable' };
      const result = await Promise.resolve(commands.skill({ contract: MONSTER_COMMAND_CONTRACT, kind: 'skill', instanceId: slot.instanceId, slot: slot.slot, zone: getZone(), skillIndex, skillId: target.skillId, targetActorId: target.targetActorId, targetPoint: target.targetPoint }));
      return result?.ok ? result : { ok: false, reason: result?.reason || 'server-not-confirmed' };
    },
  });
}
