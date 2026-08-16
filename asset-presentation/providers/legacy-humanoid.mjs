import { applyLegacyAnchor, LEGACY_FALLBACKS } from '../anchors.mjs';
import { assertAssetHandle } from '../handle-contract.mjs';

export function createLegacyHumanoidProvider({
  buildPlayer,
  buildKeeper,
  animate,
  setAction,
} = {}) {
  if (typeof buildPlayer !== 'function' || typeof buildKeeper !== 'function') {
    throw new Error('legacy humanoid provider needs buildPlayer and buildKeeper');
  }
  return function legacyHumanoidFactory({ request }) {
    const root = request.role === 'keeper' ? buildKeeper() : buildPlayer();
    const handle = {
      root,
      rig: root.userData?.animRig || Object.freeze({ rest: { ...LEGACY_FALLBACKS } }),
      play(action, options = {}) {
        setAction?.(root, action, options.duration ?? 0.32);
        return handle;
      },
      update(dt, visualState = {}) {
        animate?.(root, dt, !!visualState.moving);
        return handle;
      },
      anchor(name, target) {
        return applyLegacyAnchor(name, root.position, target);
      },
      bounds(target) {
        const out = target || { minY: 0, maxY: 0 };
        out.minY = root.position.y;
        out.maxY = root.position.y + LEGACY_FALLBACKS.labelY;
        return out;
      },
      setAppearance() { return handle; },
      dispose() { return handle; },
    };
    return assertAssetHandle(handle);
  };
}
