import { applyMonsterAnchor, MONSTER_FALLBACKS } from '../anchors.mjs';
import { assertAssetHandle } from '../handle-contract.mjs';

export function createProceduralMonsterProvider({
  buildMesh,
  animate,
  setAction,
} = {}) {
  if (typeof buildMesh !== 'function') {
    throw new Error('procedural monster provider needs buildMesh');
  }
  return function proceduralMonsterFactory({ def, request }) {
    const root = buildMesh(def, request);
    const boss = !!request?.marks?.boss;
    const handle = {
      root,
      rig: root.userData?.monsterRig || Object.freeze({ rest: { ...MONSTER_FALLBACKS } }),
      play(action, options = {}) {
        setAction?.(root, action, options.duration ?? 0.22);
        return handle;
      },
      update(dt, visualState = {}) {
        animate?.(root, dt, !!visualState.moving);
        return handle;
      },
      anchor(name, target) {
        return applyMonsterAnchor(name, root.position, target, { boss });
      },
      bounds(target) {
        const out = target || { minY: 0, maxY: 0 };
        out.minY = root.position.y;
        out.maxY = root.position.y + (boss ? MONSTER_FALLBACKS.bossLabelY : MONSTER_FALLBACKS.labelY);
        return out;
      },
      setAppearance() { return handle; },
      dispose() { return handle; },
    };
    return assertAssetHandle(handle);
  };
}
