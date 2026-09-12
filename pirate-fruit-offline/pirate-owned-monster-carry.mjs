export const PIRATE_OWNED_MONSTER_CARRY_MESSAGE = 'pocketmonster:pirate-owned-monster-carry-v1';

function validHeld(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || typeof value.instanceId !== 'string' || value.instanceId.length < 1 || value.instanceId.length > 128) return null;
  return Object.freeze({ instanceId: value.instanceId, name: typeof value.name === 'string' ? value.name.slice(0, 80) : '' });
}

export function createPirateOwnedMonsterCarry({ THREE } = {}) {
  if (!THREE?.Group || typeof THREE.MeshStandardMaterial !== 'function') throw new Error('Pirate owned monster carry needs THREE and MeshStandardMaterial');
  let held = null, carry = null, host = null, playerHost = null;
  function findHand(root) { return root?.getObjectByName?.('socket:right-palm') || root?.getObjectByName?.('studio-socket:rightHand') || root?.getObjectByName?.('player:right-palm') || null; }
  function disposeCarry() { if (!carry) return; carry.parent?.remove?.(carry); carry.traverse?.(node => { node.geometry?.dispose?.(); node.material?.dispose?.(); }); carry = null; }
  function update() {
    if (!held) { disposeCarry(); host = null; return; }
    const hand = host || findHand(playerHost);
    if (!hand) return;
    if (carry && host === hand && carry.userData.heldMonsterInstanceId === held.instanceId) return;
    disposeCarry();
    const next = new THREE.Group();
    next.name = 'pirate-owned-monster-carry';
    next.userData.pocketVisual = true;
    next.userData.presentationOnly = true;
    next.userData.combatAuthority = false;
    next.userData.heldMonsterInstanceId = held.instanceId;
    const geometry = typeof THREE.SphereGeometry === 'function'
      ? new THREE.SphereGeometry(0.105, 12, 8)
      : new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const ball = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.4, metalness: 0.1 }));
    ball.name = 'pirate-owned-monster-carry-ball';
    ball.position.set(0, 0, -0.13);
    ball.userData.pocketVisual = true;
    next.add(ball); hand.add(next); carry = next; host = hand;
  }
  return {
    setHeld(value) { held = validHeld(value); if (!held) disposeCarry(); return held; },
    setPlayerHost(value) { if (playerHost !== value) { playerHost = value || null; if (carry) { disposeCarry(); host = null; } } },
    update,
    diagnostics: () => Object.freeze({ held: held?.instanceId || null, attached: !!carry, host: host?.name || null, playerHost: playerHost?.name || null }),
  };
}
