import {
  hidePirateFruitOriginalMeshes,
  threeFromPirateFruitVendor,
} from './pirate-fruit-client-bridge.mjs?v=5';

function isLocalPlayerHost(node) {
  return node?.name === 'player:pirate-v1' || node?.name === 'player:gameplay-root';
}

function belongsToStudio(node) {
  let current = node;
  while (current) {
    if (current?.userData?.pocketVisualSource === 'studio-character') return true;
    current = current.parent;
  }
  return false;
}

function localPlayerHost(node) {
  let current = node;
  while (current) {
    if (isLocalPlayerHost(current)) return current;
    current = current.parent;
  }
  return null;
}

function suppressLegacyLocalPlayer(host, object = null) {
  if (!host) return;
  host.userData ??= {};
  host.userData.hideLegacyLocalPlayer = true;
  // Reuse the existing Pirate bridge policy so sockets/equipment/effects that
  // are intentionally preserved are not accidentally removed with the body.
  hidePirateFruitOriginalMeshes(host);
  if (object?.userData?.pocketVisual === true && object?.userData?.pocketKind === 'player'
      && object?.userData?.pocketVisualSource !== 'studio-character') {
    object.visible = false;
  }
}

/**
 * Presentation-only first-paint guard.
 * Keeps the vendored/fallback local Pirate character invisible while the world
 * itself is free to render. Blue Explorer is explicitly exempt and can replace
 * the hidden fallback when its Studio package arrives.
 */
export function installPirateLocalPlayerVisibilityGuard(vendor) {
  const Object3D = threeFromPirateFruitVendor(vendor).Object3D;
  if (!Object3D?.prototype?.add) throw new Error('Pirate Object3D.add is unavailable');
  const current = Object3D.prototype.add;
  if (current.__pocketBlueVisibilityGuard) return current.__pocketBlueVisibilityGuard;

  function guardedAdd(...objects) {
    const result = current.apply(this, objects);
    for (const object of objects) {
      if (isLocalPlayerHost(object)) {
        suppressLegacyLocalPlayer(object);
        continue;
      }
      const host = localPlayerHost(this) || localPlayerHost(object);
      if (host && !belongsToStudio(object)) suppressLegacyLocalPlayer(host, object);
    }
    return result;
  }

  const info = Object.freeze({ installed: true, policy: 'hide-legacy-local-player-only', studioSource: 'studio-character' });
  guardedAdd.__pocketBlueVisibilityGuard = info;
  Object3D.prototype.add = guardedAdd;
  return info;
}
