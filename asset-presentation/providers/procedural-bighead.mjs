import { GAMEPLAY_LOCKS } from '../anchors.mjs';
import { getAppearance } from '../catalog.mjs';
import { compileAppearance } from '../four-side/atlas.mjs';
import { applyBoxAtlasUVs, compilePartAtlas, createAtlasTexture, detachSharedGeometry } from '../four-side/apply.mjs';
import { assertAssetHandle } from '../handle-contract.mjs';
import { registerOwned } from '../ownership.mjs';

async function browserLoadFace(source) {
  if (typeof document === 'undefined') throw new Error('browser face loader needs document');
  const url = new URL(source, document.baseURI).href;
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height);
  return { width: img.width, height: img.height, rgba: new Uint8Array(data.data) };
}

export const PLAYER_PALETTE = Object.freeze({
  skin: 0xffc4a3, hair: 0xf97316, shirt: 0x20324a, pants: 0x0f172a, bag: 0x7c3aed, boot: 0x111827, ball: 0x3b82f6,
});
export const KEEPER_PALETTE = Object.freeze({
  skin: 0xf0c8a0, hair: 0xfacc15, shirt: 0x15803d, pants: 0x3f3f46, bag: 0x7c3aed, boot: 0x111827, hat: 0xfacc15, apron: 0xf8fafc, staff: 0x475569, orb: 0xf59e0b,
});

function trackRest(map, node) {
  map.set(node, {
    px: node.position.x, py: node.position.y, pz: node.position.z,
    rx: node.rotation.x, ry: node.rotation.y, rz: node.rotation.z,
  });
}

function applyRest(map) {
  for (const [node, rest] of map) {
    node.position.set(rest.px, rest.py, rest.pz);
    node.rotation.set(rest.rx, rest.ry, rest.rz);
  }
}

function createWorldScratch() {
  return {
    x: 0, y: 0, z: 0,
    set(x, y, z) {
      this.x = x; this.y = y; this.z = z;
      return this;
    },
    setFromMatrixPosition(m) {
      const e = m?.elements || m;
      this.x = e[12];
      this.y = e[13];
      this.z = e[14];
      return this;
    },
  };
}

function worldPos(node, target) {
  const out = target || { x: 0, y: 0, z: 0 };
  if (typeof node.getWorldPosition === 'function') {
    const scratch = node._worldScratch || (node._worldScratch = createWorldScratch());
    const vec = node.getWorldPosition(scratch);
    out.x = vec.x; out.y = vec.y; out.z = vec.z;
    return out;
  }
  out.x = node.position.x; out.y = node.position.y; out.z = node.position.z;
  let parent = node.parent;
  while (parent) {
    out.x += parent.position.x;
    out.y += parent.position.y;
    out.z += parent.position.z;
    parent = parent.parent;
  }
  return out;
}

export function createBigheadProvider({ THREE, box, cylinder, material, loadFace } = {}) {
  if (!THREE?.Group || typeof box !== 'function' || typeof material !== 'function') {
    throw new Error('bighead provider needs THREE, box(), and material()');
  }

  return function bigheadFactory({ request, def }) {
    const role = request.role;
    const palette = role === 'keeper' ? KEEPER_PALETTE : PLAYER_PALETTE;
    const head = def.metrics?.head || [0.64, 0.72, 0.56];
    const headY = def.metrics?.headY ?? 1.44;
    const [headW, headH, headD] = head;

    const root = new THREE.Group();
    const visualRoot = new THREE.Group();
    root.add(visualRoot);

    const hipsPivot = new THREE.Group(); hipsPivot.position.set(0, 0.60, 0); visualRoot.add(hipsPivot);
    const torsoPivot = new THREE.Group(); torsoPivot.position.set(0, 0.88, 0); visualRoot.add(torsoPivot);
    const headPivot = new THREE.Group(); headPivot.position.set(0, headY, 0); visualRoot.add(headPivot);
    const leftArmRoot = new THREE.Group(); leftArmRoot.position.set(-0.25, 1.02, -0.02); visualRoot.add(leftArmRoot);
    const rightArmRoot = new THREE.Group(); rightArmRoot.position.set(0.25, 1.02, -0.02); visualRoot.add(rightArmRoot);
    const leftLegRoot = new THREE.Group(); leftLegRoot.position.set(-0.11, 0.31, -0.02); visualRoot.add(leftLegRoot);
    const rightLegRoot = new THREE.Group(); rightLegRoot.position.set(0.11, 0.31, -0.02); visualRoot.add(rightLegRoot);

    const hips = new THREE.Mesh(box(0.38, 0.22, 0.28), material(palette.pants, 0.8, 0.04));
    hips.castShadow = true; hipsPivot.add(hips);
    const torso = new THREE.Mesh(box(0.40, 0.46, 0.28), material(palette.shirt, 0.72, 0.06));
    torso.castShadow = true; torsoPivot.add(torso);
    const backpack = new THREE.Mesh(box(0.22, 0.26, 0.12), material(palette.bag, 0.74, 0.04));
    backpack.position.set(0, 0.02, 0.22); torsoPivot.add(backpack);

    const headMesh = new THREE.Mesh(box(headW, headH, headD), material(palette.skin, 0.72, 0.02));
    headMesh.castShadow = true;
    headMesh.userData.assetForm = 'blocky-bighead';
    headPivot.add(headMesh);

    const hairRoot = new THREE.Group(); headPivot.add(hairRoot);
    const hatRoot = new THREE.Group(); headPivot.add(hatRoot);
    if (role === 'keeper') {
      const brim = new THREE.Mesh(cylinder ? cylinder(0.42, 0.44, 0.03, 12) : box(0.84, 0.03, 0.84), material(palette.hat, 0.62, 0.08));
      brim.position.y = headH / 2;
      hatRoot.add(brim);
      const crown = new THREE.Mesh(box(0.50, 0.16, 0.42), material(palette.hat, 0.62, 0.08));
      crown.position.y = headH / 2 + 0.10;
      hatRoot.add(crown);
      const apron = new THREE.Mesh(box(0.34, 0.36, 0.04), material(palette.apron, 0.78, 0.02));
      apron.position.set(0, -0.04, -0.16);
      torsoPivot.add(apron);
    } else {
      const hairCap = new THREE.Mesh(box(headW * 1.02, 0.14, headD * 1.02), material(palette.hair, 0.74, 0.02));
      hairCap.position.y = headH / 2 + 0.01;
      hairRoot.add(hairCap);
      const tuft = new THREE.Mesh(box(0.10, 0.12, 0.10), material(palette.hair, 0.74, 0.02));
      tuft.position.set(0.16, headH * 0.28, -0.08);
      hairRoot.add(tuft);
    }

    function makeArm(side) {
      const arm = new THREE.Mesh(box(0.10, 0.44, 0.10), material(palette.skin, 0.72, 0.02));
      arm.position.set(0, -0.16, 0);
      const hand = new THREE.Mesh(box(0.11, 0.11, 0.11), material(palette.skin, 0.7, 0.02));
      hand.position.set(0, -0.40, 0);
      return { arm, hand, side };
    }
    const leftArm = makeArm(-1); leftArmRoot.add(leftArm.arm); leftArmRoot.add(leftArm.hand);
    const rightArm = makeArm(1); rightArmRoot.add(rightArm.arm); rightArmRoot.add(rightArm.hand);
    const rightHandAnchor = new THREE.Group();
    rightHandAnchor.position.set(0, -0.40, 0);
    rightArmRoot.add(rightHandAnchor);
    if (role === 'player') {
      const ball = new THREE.Mesh(box(0.09, 0.09, 0.09), material(palette.ball, 0.4, 0.1));
      ball.position.set(0, 0, -0.08);
      rightHandAnchor.add(ball);
    }

    function makeLeg() {
      const leg = new THREE.Mesh(box(0.12, 0.50, 0.12), material(palette.pants, 0.78, 0.04));
      const boot = new THREE.Mesh(box(0.16, 0.12, 0.28), material(palette.boot, 0.8, 0.02));
      boot.position.set(0, -0.31, -0.10);
      boot.userData.limbForward = 'front';
      return { leg, boot };
    }
    const leftLeg = makeLeg(); leftLegRoot.add(leftLeg.leg); leftLegRoot.add(leftLeg.boot);
    const rightLeg = makeLeg(); rightLegRoot.add(rightLeg.leg); rightLegRoot.add(rightLeg.boot);

    let staffTip = null;
    if (role === 'keeper') {
      const staffRoot = new THREE.Group();
      staffRoot.position.set(0, -0.10, 0);
      rightHandAnchor.add(staffRoot);
      const rod = new THREE.Mesh(box(0.05, 0.72, 0.05), material(palette.staff, 0.85, 0.02));
      staffRoot.add(rod);
      const orb = new THREE.Mesh(box(0.10, 0.10, 0.10), material(palette.orb, 0.58, 0.12));
      orb.position.y = 0.40;
      staffRoot.add(orb);
      staffTip = orb;
    }

    const rest = new Map();
    [hipsPivot, torsoPivot, headPivot, leftArmRoot, rightArmRoot, leftLegRoot, rightLegRoot].forEach(node => trackRest(rest, node));

    const rig = {
      rest,
      pivots: { hipsPivot, torsoPivot, headPivot, leftArmRoot, rightArmRoot, leftLegRoot, rightLegRoot, rightHandAnchor, hairRoot, hatRoot },
      metrics: { headY, head: [headW, headH, headD] },
    };
    root.userData.animRig = rig;
    root.userData.isHumanoid = true;
    root.userData.assetForm = 'blocky-bighead';

    let action = 'idle';
    let actionTimer = 0;
    let actionDuration = 0.32;
    let phase = 0;
    let currentAppearance = compileAppearance(getAppearance(request.appearanceId) || { id: request.appearanceId, parts: {} });

    async function paintPart(mesh, part) {
      if (!mesh || !part) return;
      const loader = loadFace || (typeof document !== 'undefined' ? browserLoadFace : null);
      if (!loader) return;
      try {
        const atlas = await compilePartAtlas(part, currentAppearance.layout, loader);
        detachSharedGeometry(mesh);
        applyBoxAtlasUVs(mesh.geometry, currentAppearance.layout);
        const next = createAtlasTexture(THREE, atlas);
        const prev = mesh.material;
        mesh.material = next;
        mesh.userData.atlasApplied = true;
        if (prev && prev !== next && typeof prev.dispose === 'function') {
          prev.map?.dispose?.();
          prev.dispose();
        }
      } catch (err) {
        console.warn('four-side atlas apply failed', currentAppearance.id, err);
      }
    }

    async function applyAppearanceSurfaces() {
      const parts = getAppearance(currentAppearance.id)?.parts || {};
      await Promise.all([
        paintPart(headMesh, parts.head),
        paintPart(torso, parts.torso),
      ]);
      return handle;
    }

    const handle = {
      root,
      rig,
      play(name, options = {}) {
        action = name || 'idle';
        actionDuration = options.duration ?? GAMEPLAY_LOCKS.throwDuration;
        actionTimer = actionDuration;
        return handle;
      },
      update(dt, visualState = {}) {
        applyRest(rest);
        const moving = !!visualState.moving;
        phase += dt * (moving ? 9.5 : 2.8);
        if (actionTimer > 0) actionTimer = Math.max(0, actionTimer - dt);
        else action = 'idle';
        const walk = Math.sin(phase);
        if (moving) {
          torsoPivot.position.y = 0.88 + Math.abs(walk) * 0.03;
          headPivot.rotation.z = -walk * 0.03;
          leftLegRoot.rotation.x = -walk * 0.45;
          rightLegRoot.rotation.x = walk * 0.45;
          leftArmRoot.rotation.x = walk * 0.25;
          rightArmRoot.rotation.x = -walk * 0.25;
        } else {
          headPivot.position.y = headY + Math.sin(phase * 0.5) * 0.006;
        }
        if (action === 'throw' || action === 'skill') {
          const u = 1 - actionTimer / actionDuration;
          const punch = Math.sin(Math.min(1, u) * Math.PI);
          rightArmRoot.rotation.x = -0.85 * punch;
          rightArmRoot.rotation.z = -0.25 * punch;
        } else if (action === 'recall') {
          const wave = Math.sin((1 - actionTimer / actionDuration) * Math.PI);
          rightArmRoot.rotation.x = -0.42 * wave;
        } else if (action === 'hurt') {
          const flinch = Math.sin((1 - actionTimer / actionDuration) * Math.PI);
          torsoPivot.rotation.x = 0.16 * flinch;
          headPivot.rotation.x = 0.08 * flinch;
        }
        return handle;
      },
      anchor(name, target) {
        if (name === 'throwOrigin' || name === 'rightHand') return worldPos(rightHandAnchor, target);
        if (name === 'headTop') {
          const out = worldPos(headPivot, target);
          out.y += headH / 2 + 0.04;
          return out;
        }
        if (name === 'hitText') {
          const out = worldPos(headPivot, target);
          out.y += headH / 2 + 0.12;
          return out;
        }
        if (name === 'label') {
          const out = worldPos(headPivot, target);
          out.y += headH / 2 + (role === 'keeper' ? 0.28 : 0.18);
          return out;
        }
        if (name === 'backpack') return worldPos(backpack, target);
        if (name === 'staffTip' && staffTip) return worldPos(staffTip, target);
        if (name === 'feet') {
          const out = target || { x: 0, y: 0, z: 0 };
          out.x = root.position.x; out.y = root.position.y; out.z = root.position.z;
          return out;
        }
        return worldPos(root, target);
      },
      bounds(target) {
        const feet = handle.anchor('feet', { x: 0, y: 0, z: 0 });
        const top = handle.anchor('headTop', { x: 0, y: 0, z: 0 });
        const out = target || { minY: 0, maxY: 0 };
        out.minY = feet.y;
        out.maxY = top.y;
        return out;
      },
      setAppearance(id) {
        const def = getAppearance(id);
        if (!def) return handle;
        currentAppearance = compileAppearance(def);
        root.userData.appearanceId = currentAppearance.id;
        root.userData.appearanceHash = currentAppearance.contentHash;
        handle.ready = applyAppearanceSurfaces();
        return handle;
      },
      appearance() { return currentAppearance; },
      dispose() {
        disposeOwned(handle);
        return handle;
      },
    };

    function disposeOwned() {}
    registerOwned(handle, { dispose() {} });
    root.userData.appearanceId = currentAppearance.id;
    root.userData.appearanceHash = currentAppearance.contentHash;
    handle.ready = applyAppearanceSurfaces();
    return assertAssetHandle(handle);
  };
}
