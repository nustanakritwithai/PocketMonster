import { GAMEPLAY_LOCKS } from '../anchors.mjs';
import { getAppearance } from '../catalog.mjs';
import { compileAppearance } from '../four-side/atlas.mjs';
import { applyBoxAtlasUVs, compilePartAtlas, createAtlasTexture, detachSharedGeometry } from '../four-side/apply.mjs';
import { assertAssetHandle } from '../handle-contract.mjs';
import { disposeHandle, registerOwned } from '../ownership.mjs';

/** Presentation-only pirate identity on Pocket's blocky humanoid rig. Combat/stats stay in Pirate Fruit. */
export const PIRATE_FRUIT_SOURCE = Object.freeze({
  repo: 'https://github.com/nustanakritwithai/Pirate-fruit-',
  visual: 'client/src/art/PiratePlayerVisual.ts',
  contract: 'presentation-only',
});

export const PIRATE_FRUIT_PLAYER_ID = 'character.human.pirate-fruit.v1';
export const PIRATE_FRUIT_ASSET_FORM = 'pirate-fruit';
export const PIRATE_FRUIT_ROOT_NAME = 'player:pirate-v1';

export const PIRATE_PRESENTATION_FORBIDDEN = Object.freeze([
  'hp', 'atk', 'def', 'spAtk', 'spDef', 'spd',
  'vitality', 'combat', 'blade', 'ranged', 'fruitPower',
  'mastery', 'mana', 'coins', 'capture', 'save',
]);

export const PIRATE_PLAYER_PALETTE = Object.freeze({
  coat: 0x17364b,
  trim: 0x7d2632,
  shirt: 0xe7ddc5,
  pants: 0x202a32,
  skin: 0xb97950,
  leather: 0x41271b,
  boot: 0x171514,
  brass: 0xc69a45,
  hair: 0x211713,
  eye: 0xe9e5d8,
  iris: 0x17232a,
  ball: 0x3b82f6,
});

const POCKET_HUMANOID = Object.freeze({
  height: 1.8,
  head: Object.freeze([0.64, 0.72, 0.56]),
  headY: 1.44,
  hipsY: 0.60,
  torsoY: 0.88,
  arm: Object.freeze({ x: 0.25, y: 1.02, z: -0.02 }),
  leg: Object.freeze({ x: 0.11, y: 0.31, z: -0.02 }),
  handY: -0.40,
});

async function browserLoadFace(source) {
  if (typeof document === 'undefined') throw new Error('browser face loader needs document');
  const gameBundleRoot = new URL('../../', import.meta.url);
  const url = new URL(String(source).replace(/^\.\//, ''), gameBundleRoot).href;
  const img = new Image();
  img.crossOrigin = 'anonymous';
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

function tag(mesh, part, name) {
  mesh.name = name || part;
  mesh.userData.part = part;
  mesh.castShadow = true;
  return mesh;
}

export function createPirateFruitPlayerProvider({
  THREE,
  box,
  material,
  loadFace,
} = {}) {
  if (!THREE?.Group || typeof box !== 'function' || typeof material !== 'function') {
    throw new Error('pirate-fruit player provider needs THREE, box(), and material()');
  }

  return function pirateFruitPlayerFactory({ request, def }) {
    const role = request.role;
    const palette = PIRATE_PLAYER_PALETTE;
    const head = def.metrics?.head || POCKET_HUMANOID.head;
    const headY = def.metrics?.headY ?? POCKET_HUMANOID.headY;
    const [headW, headH, headD] = head;

    const root = new THREE.Group();
    root.name = PIRATE_FRUIT_ROOT_NAME;
    const visualRoot = new THREE.Group();
    root.add(visualRoot);

    const hipsPivot = new THREE.Group(); hipsPivot.position.set(0, POCKET_HUMANOID.hipsY, 0); visualRoot.add(hipsPivot);
    const torsoPivot = new THREE.Group(); torsoPivot.position.set(0, POCKET_HUMANOID.torsoY, 0); visualRoot.add(torsoPivot);
    const headPivot = new THREE.Group(); headPivot.position.set(0, headY, 0); visualRoot.add(headPivot);
    const leftArmRoot = new THREE.Group(); leftArmRoot.position.set(-POCKET_HUMANOID.arm.x, POCKET_HUMANOID.arm.y, POCKET_HUMANOID.arm.z); visualRoot.add(leftArmRoot);
    const rightArmRoot = new THREE.Group(); rightArmRoot.position.set(POCKET_HUMANOID.arm.x, POCKET_HUMANOID.arm.y, POCKET_HUMANOID.arm.z); visualRoot.add(rightArmRoot);
    const leftLegRoot = new THREE.Group(); leftLegRoot.position.set(-POCKET_HUMANOID.leg.x, POCKET_HUMANOID.leg.y, POCKET_HUMANOID.leg.z); visualRoot.add(leftLegRoot);
    const rightLegRoot = new THREE.Group(); rightLegRoot.position.set(POCKET_HUMANOID.leg.x, POCKET_HUMANOID.leg.y, POCKET_HUMANOID.leg.z); visualRoot.add(rightLegRoot);

    const hips = new THREE.Mesh(box(0.38, 0.22, 0.28), material(palette.pants, 0.8, 0.04));
    tag(hips, 'hips', 'player:hips');
    hipsPivot.add(hips);

    const coat = new THREE.Mesh(box(0.46, 0.50, 0.32), material(palette.coat, 0.82, 0.04));
    tag(coat, 'coat', 'player:hull:torso');
    torsoPivot.add(coat);

    const shirtPanel = new THREE.Mesh(box(0.18, 0.36, 0.04), material(palette.shirt, 0.94, 0.02));
    tag(shirtPanel, 'shirt', 'player:shirt');
    shirtPanel.position.set(0, 0.04, -0.18);
    torsoPivot.add(shirtPanel);

    const leftLapel = new THREE.Mesh(box(0.08, 0.40, 0.05), material(palette.trim, 0.86, 0.02));
    tag(leftLapel, 'lapel', 'player:lapel-left');
    leftLapel.position.set(-0.10, 0.06, -0.19);
    torsoPivot.add(leftLapel);
    const rightLapel = new THREE.Mesh(box(0.08, 0.40, 0.05), material(palette.trim, 0.86, 0.02));
    tag(rightLapel, 'lapel', 'player:lapel-right');
    rightLapel.position.set(0.10, 0.06, -0.19);
    torsoPivot.add(rightLapel);

    const sash = new THREE.Mesh(box(0.48, 0.10, 0.34), material(palette.trim, 0.86, 0.02));
    tag(sash, 'sash', 'player:sash');
    sash.position.y = -0.18;
    torsoPivot.add(sash);
    const buckle = new THREE.Mesh(box(0.12, 0.10, 0.05), material(palette.brass, 0.35, 0.7));
    tag(buckle, 'buckle', 'player:buckle');
    buckle.position.set(0, -0.18, -0.20);
    torsoPivot.add(buckle);

    for (const side of [-1, 1]) {
      const coatTail = new THREE.Mesh(box(0.20, 0.42, 0.08), material(palette.coat, 0.82, 0.04));
      tag(coatTail, 'coat', side < 0 ? 'player:coat-tail-left' : 'player:coat-tail-right');
      coatTail.position.set(side * 0.14, -0.40, 0.10);
      torsoPivot.add(coatTail);
    }

    const headMesh = new THREE.Mesh(box(headW, headH, headD), material(palette.skin, 0.72, 0.02));
    tag(headMesh, 'head', 'player:head');
    headPivot.add(headMesh);

    const hairCap = new THREE.Mesh(box(headW * 1.02, 0.14, headD * 1.02), material(palette.hair, 0.94, 0.02));
    tag(hairCap, 'hair', 'player:hair');
    hairCap.position.y = headH / 2 + 0.01;
    headPivot.add(hairCap);

    const bandana = new THREE.Mesh(box(headW * 1.06, 0.14, headD * 1.08), material(palette.trim, 0.86, 0.02));
    tag(bandana, 'bandana', 'player:bandana');
    bandana.position.y = headH / 2 + 0.04;
    headPivot.add(bandana);
    const bandanaKnot = new THREE.Mesh(box(0.10, 0.10, 0.10), material(palette.trim, 0.86, 0.02));
    tag(bandanaKnot, 'bandana', 'player:bandana-knot');
    bandanaKnot.position.set(-headW * 0.42, headH * 0.22, 0.06);
    headPivot.add(bandanaKnot);
    const bandanaTail = new THREE.Mesh(box(0.08, 0.28, 0.04), material(palette.trim, 0.86, 0.02));
    tag(bandanaTail, 'bandana', 'player:bandana-tail');
    bandanaTail.position.set(-headW * 0.46, 0.02, 0.08);
    headPivot.add(bandanaTail);

    const beard = new THREE.Mesh(box(0.28, 0.16, 0.10), material(palette.hair, 0.94, 0.02));
    tag(beard, 'beard', 'player:beard');
    beard.position.set(0, -headH * 0.28, -headD / 2 - 0.02);
    headPivot.add(beard);

    const earring = new THREE.Mesh(box(0.04, 0.08, 0.04), material(palette.brass, 0.35, 0.7));
    tag(earring, 'earring', 'player:earring');
    earring.position.set(-headW / 2 - 0.02, -0.04, 0);
    headPivot.add(earring);

    function makeArm(side) {
      const upper = new THREE.Mesh(box(0.12, 0.44, 0.12), material(palette.coat, 0.82, 0.04));
      tag(upper, 'arm', side < 0 ? 'player:left-arm' : 'player:right-arm');
      upper.position.set(0, -0.16, 0);
      const cuff = new THREE.Mesh(box(0.14, 0.08, 0.14), material(palette.trim, 0.86, 0.02));
      tag(cuff, 'cuff', side < 0 ? 'player:left-cuff' : 'player:right-cuff');
      cuff.position.set(0, -0.34, 0);
      const hand = new THREE.Mesh(box(0.11, 0.11, 0.11), material(palette.skin, 0.7, 0.02));
      tag(hand, 'hand', side < 0 ? 'player:left-palm' : 'player:right-palm');
      hand.position.set(0, POCKET_HUMANOID.handY, 0);
      return { upper, cuff, hand };
    }
    const leftArm = makeArm(-1);
    leftArmRoot.add(leftArm.upper); leftArmRoot.add(leftArm.cuff); leftArmRoot.add(leftArm.hand);
    const rightArm = makeArm(1);
    rightArmRoot.add(rightArm.upper); rightArmRoot.add(rightArm.cuff); rightArmRoot.add(rightArm.hand);

    const rightHandAnchor = new THREE.Group();
    rightHandAnchor.name = 'socket:right-palm';
    rightHandAnchor.position.set(0, POCKET_HUMANOID.handY, 0);
    rightArmRoot.add(rightHandAnchor);
    if (role === 'player') {
      const ball = new THREE.Mesh(box(0.09, 0.09, 0.09), material(palette.ball, 0.4, 0.1));
      tag(ball, 'capture-ball', 'player:capture-ball');
      ball.position.set(0, 0, -0.08);
      rightHandAnchor.add(ball);
    }

    function makeLeg(side) {
      const leg = new THREE.Mesh(box(0.12, 0.50, 0.12), material(palette.pants, 0.78, 0.04));
      tag(leg, 'leg', side < 0 ? 'player:left-leg' : 'player:right-leg');
      const boot = new THREE.Mesh(box(0.16, 0.12, 0.28), material(palette.boot, 0.8, 0.02));
      tag(boot, 'boot', side < 0 ? 'player:left-boot' : 'player:right-boot');
      boot.position.set(0, -0.31, -0.10);
      boot.userData.limbForward = 'front';
      return { leg, boot };
    }
    const leftLeg = makeLeg(-1); leftLegRoot.add(leftLeg.leg); leftLegRoot.add(leftLeg.boot);
    const rightLeg = makeLeg(1); rightLegRoot.add(rightLeg.leg); rightLegRoot.add(rightLeg.boot);

    const rest = new Map();
    [hipsPivot, torsoPivot, headPivot, leftArmRoot, rightArmRoot, leftLegRoot, rightLegRoot].forEach(node => trackRest(rest, node));

    const rig = {
      rest,
      pivots: { hipsPivot, torsoPivot, headPivot, leftArmRoot, rightArmRoot, leftLegRoot, rightLegRoot, rightHandAnchor },
      metrics: { headY, head: [headW, headH, headD], height: def.metrics?.height ?? POCKET_HUMANOID.height },
    };
    root.userData.animRig = rig;
    root.userData.isHumanoid = true;
    root.userData.assetForm = PIRATE_FRUIT_ASSET_FORM;
    root.userData.pirateFruitSource = PIRATE_FRUIT_SOURCE;
    root.userData.surfaceStyle = 'four-side-block-v1';

    let action = 'idle';
    let actionTimer = 0;
    let actionDuration = 0.32;
    let phase = 0;
    let currentAppearance = compileAppearance(getAppearance(request.appearanceId) || { id: request.appearanceId, parts: {} });

    async function paintPart(mesh, part) {
      if (!mesh || !part) return;
      const loader = loadFace || (typeof document !== 'undefined' && typeof Image !== 'undefined' ? browserLoadFace : null);
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
      await paintPart(headMesh, parts.head);
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
          torsoPivot.position.y = POCKET_HUMANOID.torsoY + Math.abs(walk) * 0.03;
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
          out.y += headH / 2 + 0.08;
          return out;
        }
        if (name === 'hitText') {
          const out = worldPos(headPivot, target);
          out.y += headH / 2 + 0.16;
          return out;
        }
        if (name === 'label') {
          const out = worldPos(headPivot, target);
          out.y += headH / 2 + 0.22;
          return out;
        }
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
        const next = getAppearance(id);
        if (!next) return handle;
        currentAppearance = compileAppearance(next);
        root.userData.appearanceId = currentAppearance.id;
        root.userData.appearanceHash = currentAppearance.contentHash;
        handle.ready = applyAppearanceSurfaces();
        return handle;
      },
      appearance() { return currentAppearance; },
      dispose() {
        disposeHandle(handle);
        return handle;
      },
    };

    registerOwned(handle, { dispose() {} });
    root.userData.appearanceId = currentAppearance.id;
    root.userData.appearanceHash = currentAppearance.contentHash;
    handle.ready = applyAppearanceSurfaces();
    return assertAssetHandle(handle);
  };
}
