/** View-only overlay: party combat vitals come from live control-state, never bag/save HP. */
export function overlayPiratePartyVitals(monster, { partyIds = [], controlState = null } = {}) {
  if (!monster || typeof monster.instanceId !== 'string' || !partyIds.includes(monster.instanceId)) return monster;
  if (controlState?.available !== true) {
    return { ...monster, hp: null, maxHp: null, fainted: false, combatVitalsUnavailable: true };
  }
  const party = controlState.party;
  const partySlot = party?.available === true && Array.isArray(party.slots)
    ? party.slots.find(slot => slot?.instanceId === monster.instanceId) : null;
  const actor = Array.isArray(controlState.actors)
    ? controlState.actors.find(item => item?.instanceId === monster.instanceId) : null;
  // Actor combat HP is the live authority; party projection is fallback if actor vitals are absent.
  const live = actor && (Number.isFinite(actor.hp) || actor.fainted === true) ? actor : partySlot;
  if (!live) return { ...monster, hp: null, maxHp: null, fainted: false, combatVitalsUnavailable: true };
  const hp = Number.isFinite(live.hp) ? Math.max(0, live.hp) : null;
  const maxHp = Number.isFinite(live.maxHp) ? Math.max(0, live.maxHp)
    : Number.isFinite(partySlot?.maxHp) ? Math.max(0, partySlot.maxHp) : null;
  return {
    ...monster,
    hp,
    maxHp: maxHp ?? null,
    fainted: live.fainted === true || hp === 0,
    combatVitalsUnavailable: hp === null,
  };
}
