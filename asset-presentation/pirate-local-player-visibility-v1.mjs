function ownProto(value, name) {
  try { return !!Object.getOwnPropertyDescriptor(value?.prototype || {}, name); } catch { return false; }
}

function findObject3D(vendor) {
  for (const value of Object.values(vendor || {})) {
    if (typeof value === 'function' && ownProto(value, 'updateMatrixWorld') && ownProto(value, 'traverse') && ownProto(value, 'add')) return value;
  }
  return null;
}

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

function hideLegacyTree(node) {
  if (!node || belongsToStudio(node)) return;
  if (node?.userData?.pocketVisual === true && node?.userData?.pocketKind === 'player'
      && node?.userData?.pocketVisualSource !== 'studio-character') {
    node.visible = false;
  }
  node?.traverse?.(child => {
    if (belongsToStudio(child)) return;
    if (child?.isMesh) child.visible = false;
  });
}

/**
 * Presentation-only first-paint guard.
 * Keeps the vendored/fallback local Pirate character invisible while the world
 * itself is free to render. Blue Explorer is explicitly exempt and can replace
 * the hidden fallback when its Studio package arrives.
 */
export function installPirateLocalPlayerVisibilityGuard(vendor) {
  const Object3D = findObject3D(vendor);
  if (!Object3D?.prototype?.add) throw new Error('Pirate Object3D.add is unavailable');
  const current = Object3D.prototype.add;
  if (current.__pocketBlueVisibilityGuard) return current.__pocketBlueVisibilityGuard;

  function guardedAdd(...objects) {
    const result = current.apply(this, objects);
    for (const object of objects) {
      if (isLocalPlayerHost(object)) {
        object.userData ??= {};
        object.userData.hideLegacyLocalPlayer = true;
        hideLegacyTree(object);
        continue;
      }
      const host = localPlayerHost(this) || localPlayerHost(object);
      if (host && !belongsToStudio(object)) hideLegacyTree(object);
      if (object?.userData?.pocketVisual === true && object?.userData?.pocketKind === 'player'
          && object?.userData?.pocketVisualSource !== 'studio-character') {
        object.visible = false;
      }
    }
    return result;
  }

  const info = Object.freeze({ installed: true, policy: 'hide-legacy-local-player-only', studioSource: 'studio-character' });
  guardedAdd.__pocketBlueVisibilityGuard = info;
  Object3D.prototype.add = guardedAdd;
  return info;
}
