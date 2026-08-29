import { GAMEPLAY_LOCKS } from '../anchors.mjs';
import { getAppearance } from '../catalog.mjs';
import { assertAssetHandle } from '../handle-contract.mjs';
import { disposeHandle, registerOwned } from '../ownership.mjs';

/** Presentation-only port of Pirate Fruit's player silhouette. Combat/stats stay in Pirate Fruit. */
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

function setScale(node, x, y, z) {
  if (node.scale?.set) node.scale.set(x, y, z);
}

export function createPirateFruitPlayerProvider({
  THREE,
  box,
  capsule,
  sphere,
  cylinder,
  cone,
  torus,
  material,
} = {}) {
  if (!THREE?.Group || typeof box !== 'function' || typeof material !== 'function') {
    throw new Error('pirate-fruit player provider needs THREE, box(), and material()');
  }

  const geo = {
    capsule(radius, length) {
      if (typeof capsule === 'function') return capsule(radius, length, 4, 8);
      if (typeof cylinder === 'function') return cylinder(radius, radius, length + radius * 2, 8);
      return box(radius * 2, length + radius * 2, radius * 2);
    },
    sphere(radius) {
      if (typeof sphere === 'function') return sphere(radius, 12, 8);
      return box(radius * 2, radius * 2, radius * 2);
    },
    cylinder(top, bottom, height, segments = 10) {
      if (typeof cylinder === 'function') return cylinder(top, bottom, height, segments);
      return box(Math.max(top, bottom) * 2, height, Math.max(top, bottom) * 2);
    },
    cone(radius, height, segments = 7) {
      if (typeof cone === 'function') return cone(radius, height, segments);
      return box(radius * 2, height, radius * 2);
    },
    torus(radius, tube) {
      if (typeof torus === 'function') return torus(radius, tube, 5, 10);
      return box(radius * 2, tube * 2, radius * 2);
    },
  };

  return function pirateFruitPlayerFactory({ request, def }) {
    const role = request.role;
    const palette = PIRATE_PLAYER_PALETTE;
    const head = def.metrics?.head || [0.50, 0.54, 0.46];
    const headY = def.metrics?.headY ?? 1.52;
    const [headW, headH, headD] = head;

    const root = new THREE.Group();
    root.name = PIRATE_FRUIT_ROOT_NAME;
    const visualRoot = new THREE.Group();
    root.add(visualRoot);

    const hipsPivot = new THREE.Group(); hipsPivot.position.set(0, 0.62, 0); visualRoot.add(hipsPivot);
    const torsoPivot = new THREE.Group(); torsoPivot.position.set(0, 0.98, 0); visualRoot.add(torsoPivot);
    const headPivot = new THREE.Group(); headPivot.position.set(0, headY, 0); visualRoot.add(headPivot);
    const leftArmRoot = new THREE.Group(); leftArmRoot.position.set(-0.38, 1.16, 0); visualRoot.add(leftArmRoot);
    const rightArmRoot = new THREE.Group(); rightArmRoot.position.set(0.38, 1.16, 0); visualRoot.add(rightArmRoot);
    const leftLegRoot = new THREE.Group(); leftLegRoot.position.set(-0.14, 0.34, 0); visualRoot.add(leftLegRoot);
    const rightLegRoot = new THREE.Group(); rightLegRoot.position.set(0.14, 0.34, 0); visualRoot.add(rightLegRoot);

    const pelvis = new THREE.Mesh(geo.capsule(0.22, 0.14), material(palette.pants, 0.9, 0.04));
    tag(pelvis, 'pelvis', 'player:hull:pelvis');
    pelvis.position.y = 0.02;
    hipsPivot.add(pelvis);

    const torso = new THREE.Mesh(geo.capsule(0.28, 0.28), material(palette.coat, 0.82, 0.04));
    tag(torso, 'coat', 'player:hull:torso');
    torso.position.y = 0.02;
    torsoPivot.add(torso);

    const shirtPanel = new THREE.Mesh(box(0.22, 0.46, 0.04), material(palette.shirt, 0.94, 0.02));
    tag(shirtPanel, 'shirt', 'player:shirt');
    shirtPanel.position.set(0, 0.04, -0.22);
    torsoPivot.add(shirtPanel);

    const leftLapel = new THREE.Mesh(box(0.10, 0.48, 0.05), material(palette.trim, 0.86, 0.02));
    tag(leftLapel, 'lapel', 'player:lapel-left');
    leftLapel.position.set(-0.10, 0.06, -0.24);
    leftLapel.rotation.z = -0.17;
    torsoPivot.add(leftLapel);
    const rightLapel = new THREE.Mesh(box(0.10, 0.48, 0.05), material(palette.trim, 0.86, 0.02));
    tag(rightLapel, 'lapel', 'player:lapel-right');
    rightLapel.position.set(0.10, 0.06, -0.24);
    rightLapel.rotation.z = 0.17;
    torsoPivot.add(rightLapel);

    const sash = new THREE.Mesh(geo.cylinder(0.26, 0.24, 0.12, 12), material(palette.trim, 0.86, 0.02));
    tag(sash, 'sash', 'player:sash');
    sash.position.y = -0.22;
    torsoPivot.add(sash);
    const buckle = new THREE.Mesh(box(0.12, 0.10, 0.05), material(palette.brass, 0.35, 0.7));
    tag(buckle, 'buckle', 'player:buckle');
    buckle.position.set(0, -0.20, -0.24);
    torsoPivot.add(buckle);

    for (const side of [-1, 1]) {
      const coatTail = new THREE.Mesh(box(0.22, 0.50, 0.07), material(palette.coat, 0.82, 0.04));
      tag(coatTail, 'coat-tail', side < 0 ? 'player:coat-tail-left' : 'player:coat-tail-right');
      coatTail.position.set(side * 0.14, -0.42, 0.10);
      coatTail.rotation.x = 0.10;
      coatTail.rotation.z = side * 0.06;
      torsoPivot.add(coatTail);
    }

    const neck = new THREE.Mesh(geo.cylinder(0.08, 0.10, 0.16, 10), material(palette.skin, 0.56, 0.02));
    tag(neck, 'neck', 'player:neck');
    neck.position.y = -0.16;
    headPivot.add(neck);

    const face = new THREE.Mesh(geo.sphere(0.22), material(palette.skin, 0.56, 0.02));
    tag(face, 'face', 'player:face');
    face.position.y = 0.04;
    setScale(face, 0.92, 1.06, 0.88);
    headPivot.add(face);

    const hairCap = new THREE.Mesh(geo.sphere(0.21), material(palette.hair, 0.94, 0.02));
    tag(hairCap, 'hair', 'player:hair');
    hairCap.position.set(0, 0.10, 0.02);
    setScale(hairCap, 1.02, 0.72, 1.02);
    headPivot.add(hairCap);

    const bandana = new THREE.Mesh(geo.cylinder(0.20, 0.22, 0.12, 12), material(palette.trim, 0.86, 0.02));
    tag(bandana, 'bandana', 'player:bandana');
    bandana.position.y = 0.20;
    headPivot.add(bandana);
    const bandanaKnot = new THREE.Mesh(geo.sphere(0.06), material(palette.trim, 0.86, 0.02));
    tag(bandanaKnot, 'bandana', 'player:bandana-knot');
    bandanaKnot.position.set(-0.20, 0.16, 0.04);
    headPivot.add(bandanaKnot);
    const bandanaTail = new THREE.Mesh(box(0.08, 0.28, 0.03), material(palette.trim, 0.86, 0.02));
    tag(bandanaTail, 'bandana', 'player:bandana-tail');
    bandanaTail.position.set(-0.22, 0.02, 0.06);
    bandanaTail.rotation.z = 0.24;
    headPivot.add(bandanaTail);

    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(geo.sphere(0.035), material(palette.eye, 0.38, 0.02));
      tag(eye, 'eye', side < 0 ? 'player:eye-left' : 'player:eye-right');
      eye.position.set(side * 0.07, 0.06, -0.18);
      setScale(eye, 1, 0.72, 0.42);
      headPivot.add(eye);
      const pupil = new THREE.Mesh(geo.sphere(0.018), material(palette.iris, 0.26, 0.02));
      tag(pupil, 'iris', side < 0 ? 'player:iris-left' : 'player:iris-right');
      pupil.position.set(side * 0.07, 0.06, -0.20);
      headPivot.add(pupil);
    }

    const nose = new THREE.Mesh(geo.cone(0.035, 0.10, 7), material(palette.skin, 0.56, 0.02));
    tag(nose, 'nose', 'player:nose');
    nose.position.set(0, 0.02, -0.22);
    nose.rotation.x = -Math.PI / 2;
    headPivot.add(nose);

    const beard = new THREE.Mesh(geo.capsule(0.09, 0.10), material(palette.hair, 0.94, 0.02));
    tag(beard, 'beard', 'player:beard');
    beard.position.set(0, -0.10, -0.16);
    setScale(beard, 1.3, 1, 0.42);
    headPivot.add(beard);

    const earring = new THREE.Mesh(geo.torus(0.045, 0.01), material(palette.brass, 0.35, 0.7));
    tag(earring, 'earring', 'player:earring');
    earring.position.set(-0.22, -0.02, 0);
    earring.rotation.y = Math.PI / 2;
    headPivot.add(earring);

    function makeArm(side) {
      const upper = new THREE.Mesh(geo.capsule(0.10, 0.18), material(palette.coat, 0.82, 0.04));
      tag(upper, 'arm', side < 0 ? 'player:left-arm' : 'player:right-arm');
      upper.position.set(0, -0.16, 0);
      const shoulder = new THREE.Mesh(geo.sphere(0.12), material(palette.trim, 0.86, 0.02));
      tag(shoulder, 'shoulder', side < 0 ? 'player:left-shoulder' : 'player:right-shoulder');
      shoulder.position.set(0, -0.02, 0);
      const hand = new THREE.Mesh(geo.capsule(0.08, 0.04), material(palette.skin, 0.56, 0.02));
      tag(hand, 'hand', side < 0 ? 'player:left-palm' : 'player:right-palm');
      hand.position.set(0, -0.38, 0);
      return { upper, shoulder, hand };
    }
    const leftArm = makeArm(-1);
    leftArmRoot.add(leftArm.upper); leftArmRoot.add(leftArm.shoulder); leftArmRoot.add(leftArm.hand);
    const rightArm = makeArm(1);
    rightArmRoot.add(rightArm.upper); rightArmRoot.add(rightArm.shoulder); rightArmRoot.add(rightArm.hand);

    const rightHandAnchor = new THREE.Group();
    rightHandAnchor.name = 'socket:right-palm';
    rightHandAnchor.position.set(0, -0.38, 0);
    rightArmRoot.add(rightHandAnchor);
    if (role === 'player') {
      const ball = new THREE.Mesh(box(0.09, 0.09, 0.09), material(palette.ball, 0.4, 0.1));
      tag(ball, 'capture-ball', 'player:capture-ball');
      ball.position.set(0, 0, -0.08);
      rightHandAnchor.add(ball);
    }

    function makeLeg(side) {
      const leg = new THREE.Mesh(geo.capsule(0.11, 0.22), material(palette.pants, 0.9, 0.04));
      tag(leg, 'leg', side < 0 ? 'player:left-leg' : 'player:right-leg');
      const boot = new THREE.Mesh(box(0.22, 0.16, 0.32), material(palette.boot, 0.78, 0.02));
      tag(boot, 'boot', side < 0 ? 'player:left-boot' : 'player:right-boot');
      boot.position.set(0, -0.30, -0.08);
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
      metrics: { headY, head: [headW, headH, headD] },
    };
    root.userData.animRig = rig;
    root.userData.isHumanoid = true;
    root.userData.assetForm = PIRATE_FRUIT_ASSET_FORM;
    root.userData.pirateFruitSource = PIRATE_FRUIT_SOURCE;

    let action = 'idle';
    let actionTimer = 0;
    let actionDuration = 0.32;
    let phase = 0;
    let currentAppearance = {
      id: request.appearanceId || null,
      contentHash: 'pirate-fruit-solid-v1',
    };

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
          torsoPivot.position.y = 0.98 + Math.abs(walk) * 0.03;
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
        const def = getAppearance(id);
        if (!def) return handle;
        currentAppearance = { id: def.id, contentHash: 'pirate-fruit-solid-v1' };
        root.userData.appearanceId = currentAppearance.id;
        root.userData.appearanceHash = currentAppearance.contentHash;
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
    handle.ready = Promise.resolve(handle);
    return assertAssetHandle(handle);
  };
}
