import { assertAssetHandle } from '../handle-contract.mjs';
import { getImg2ThreeJsModel } from '../img2threejs-registry.mjs';

const DEFAULT_ACTION_MAP = Object.freeze({
  idle: 'idle-gesture',
  walk: 'walk-forward',
  run: 'run-forward',
  jump: 'jump-in-place',
  dash: 'dash-forward',
  attack: 'strike-short',
  'attack-melee': 'strike-short',
  skill: 'strike-wide',
});

const ANCHOR_SOCKET = Object.freeze({
  throwOrigin: 'weapon-grip-r',
  weaponGripRight: 'weapon-grip-r',
  weaponGripLeft: 'weapon-grip-l',
  headTop: 'head-attachment',
  headAttachment: 'head-attachment',
  label: 'head-attachment',
  hitText: 'head-attachment',
});

function worldPosition(node, target, THREE) {
  const out = target || (THREE?.Vector3 ? new THREE.Vector3() : { x: 0, y: 0, z: 0 });
  if (node?.getWorldPosition) return node.getWorldPosition(out);
  out.x = node?.position?.x || 0;
  out.y = node?.position?.y || 0;
  out.z = node?.position?.z || 0;
  return out;
}

function disposeMaterial(material, seen) {
  for (const entry of Array.isArray(material) ? material : [material]) {
    if (!entry || seen.has(entry)) continue;
    seen.add(entry);
    for (const value of Object.values(entry)) {
      if (value?.isTexture && typeof value.dispose === 'function' && !seen.has(value)) {
        seen.add(value);
        value.dispose();
      }
    }
    entry.dispose?.();
  }
}

function collectSockets(root, runtime = {}) {
  const sockets = { ...(runtime.sockets || {}) };
  for (const name of ['weapon-grip-l', 'weapon-grip-r', 'head-attachment']) {
    if (!sockets[name] && root?.getObjectByName) sockets[name] = root.getObjectByName(name) || null;
  }
  return sockets;
}

function clipNames(root, controller) {
  if (Array.isArray(controller?.actions)) return controller.actions.map(action => action.id);
  return (root?.animations || []).map(clip => clip?.name).filter(Boolean);
}

function resolveAction(name, map, available) {
  if (!name) return null;
  const mapped = map[name] || name;
  if (available.has(mapped)) return mapped;
  if (available.has(name)) return name;
  return null;
}

export function createImg2ThreeJsProvider({ THREE } = {}) {
  if (!THREE?.Group) throw new Error('img2threejs provider needs THREE');

  return function img2threejsFactory({ request, def }) {
    const modelId = def.modelId || def.runtimeModelId || def.sourceModelId || def.id;
    const record = getImg2ThreeJsModel(modelId);
    if (!record) {
      throw new Error(`img2threejs model ${modelId} is not registered; load/register it before AssetEngine.spawn()`);
    }
    if (record.prewarmState !== 'ready') {
      throw new Error(`img2threejs model ${modelId} is ${record.prewarmState}; await prewarmImg2ThreeJsModel() before spawn`);
    }

    const root = record.build({
      castShadow: request.castShadow ?? true,
      receiveShadow: request.receiveShadow ?? true,
      wireframe: request.wireframe ?? false,
      quality: request.quality,
      ...(def.buildOptions || {}),
      ...(request.buildOptions || {}),
    });
    if (!root || typeof root !== 'object') throw new Error(`img2threejs model ${modelId} build() did not return an Object3D`);

    const runtime = root.userData?.sculptRuntime || {};
    const controller = runtime.animationController || null;
    const sockets = collectSockets(root, runtime);
    const actions = clipNames(root, controller);
    const available = new Set(actions);
    const animationMap = {
      ...DEFAULT_ACTION_MAP,
      ...(record.animationMap || {}),
      ...(def.animationMap || {}),
      ...(request.animationMap || {}),
    };
    let disposed = false;

    const rig = {
      runtime,
      controller,
      sockets,
      actions: controller?.actions || (root.animations || []).map(clip => ({ id: clip.name, label: clip.name, loop: false })),
      animationMap,
    };

    const handle = {
      root,
      rig,
      play(name, options = {}) {
        const clip = resolveAction(name, animationMap, available);
        if (clip && controller?.play) controller.play(clip);
        else if ((name === 'idle' || name === 'stop') && controller?.stop) controller.stop();
        if (options.vfxElement) runtime.strikeVfx?.setElement?.(options.vfxElement);
        return handle;
      },
      update(dt) {
        if (!Number.isFinite(dt) || dt <= 0) return handle;
        if (typeof root.userData?.tick === 'function') root.userData.tick(dt);
        else controller?.advance?.(dt);
        return handle;
      },
      anchor(name, target) {
        const socketName = runtime.actionAnchors?.[name]?.socket || ANCHOR_SOCKET[name] || name;
        const socket = sockets[socketName] || root.getObjectByName?.(socketName);
        if (socket) return worldPosition(socket, target, THREE);
        const box = handle.bounds();
        const out = target || (THREE?.Vector3 ? new THREE.Vector3() : { x: 0, y: 0, z: 0 });
        out.x = root.position?.x || 0;
        out.z = root.position?.z || 0;
        out.y = name === 'feet' ? box.minY : box.maxY;
        return out;
      },
      bounds(target) {
        const out = target || { minY: 0, maxY: 0 };
        if (THREE.Box3) {
          const box = new THREE.Box3().setFromObject(root);
          out.minY = Number.isFinite(box.min?.y) ? box.min.y : (root.position?.y || 0);
          out.maxY = Number.isFinite(box.max?.y) ? box.max.y : out.minY;
        } else {
          out.minY = root.position?.y || 0;
          out.maxY = out.minY + (def.metrics?.height || 1);
        }
        return out;
      },
      setAppearance(next = {}) {
        if (next.vfxElement) runtime.strikeVfx?.setElement?.(next.vfxElement);
        if (typeof next.wireframe === 'boolean' && root.traverse) {
          root.traverse(node => {
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
              if (material && 'wireframe' in material) material.wireframe = next.wireframe;
            }
          });
        }
        return handle;
      },
      dispose() {
        if (disposed) return handle;
        disposed = true;
        root.userData?.disposeStrikeVfx?.();
        const seen = new Set();
        root.traverse?.(node => {
          if (node.geometry && !seen.has(node.geometry)) {
            seen.add(node.geometry);
            node.geometry.dispose?.();
          }
          disposeMaterial(node.material, seen);
        });
        root.parent?.remove?.(root);
        return handle;
      },
      get disposed() { return disposed; },
      modelId,
    };

    return assertAssetHandle(handle);
  };
}
