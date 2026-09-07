import assert from 'node:assert/strict';

import { createPirateFruitRigRetargeter } from '../asset-presentation/pirate-fruit-rig-retarget.mjs';
import {
  hidePirateFruitOriginalMeshes,
  threeFromPirateFruitVendor,
} from '../asset-presentation/pirate-fruit-client-bridge.mjs';

function rotation(x = 0, y = 0, z = 0) {
  return {
    x, y, z,
    set(nextX, nextY, nextZ) {
      this.x = nextX;
      this.y = nextY;
      this.z = nextZ;
    },
  };
}

function node(name, angles = [0, 0, 0], children = []) {
  return {
    name,
    rotation: rotation(...angles),
    position: { x: 1, y: 2, z: 3 },
    scale: { x: 1, y: 1, z: 1 },
    children,
  };
}

function targetRig(pivots, restEntries = []) {
  return { pivots, rest: new Map(restEntries) };
}

function assertRotation(actual, expected) {
  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) < 1e-12, `${value} should equal ${expected[index]}`);
  });
}

{
  const hips = node('player-rig:hips', [0.1, 0.2, 0.3]);
  const chest = node('player-rig:chest', [0.2, 0.3, 0.4]);
  const head = node('player-rig:head', [0.3, 0.4, 0.5]);
  const leftArm = node('player-rig:left-arm', [0.4, 0.5, 0.6]);
  const rightArm = node('player-rig:right-arm', [0.5, 0.6, 0.7]);
  const leftLeg = node('player-rig:left-leg', [0.6, 0.7, 0.8]);
  const rightLeg = node('player-rig:right-leg', [0.7, 0.8, 0.9]);
  const sourceHost = node('host', [0, 0, 0], [
    node('nested', [0, 0, 0], [hips, chest, head]),
    leftArm,
    node('other-branch', [0, 0, 0], [rightArm, leftLeg, rightLeg]),
  ]);

  const hipsPivot = node('hipsPivot');
  const torsoPivot = node('torsoPivot');
  const headPivot = node('headPivot');
  const leftArmRoot = node('leftArmRoot');
  const rightArmRoot = node('rightArmRoot');
  const leftLegRoot = node('leftLegRoot');
  const rightLegRoot = node('rightLegRoot');
  const pivots = { hipsPivot, torsoPivot, headPivot, leftArmRoot, rightArmRoot, leftLegRoot, rightLegRoot };
  const rests = Object.values(pivots).map((pivot, index) => [pivot, {
    rx: index + 1,
    ry: index + 2,
    rz: index + 3,
  }]);

  const retargeter = createPirateFruitRigRetargeter(sourceHost, targetRig(pivots, rests));
  hips.rotation.x += 0.25;
  chest.rotation.y -= 0.5;
  head.rotation.z += 0.75;
  leftArm.rotation.x -= 0.2;
  rightArm.rotation.y += 0.3;
  leftLeg.rotation.z -= 0.4;
  rightLeg.rotation.x += 0.6;
  retargeter.update();

  assertRotation([hipsPivot.rotation.x, hipsPivot.rotation.y, hipsPivot.rotation.z], [1.25, 2, 3]);
  assertRotation([torsoPivot.rotation.x, torsoPivot.rotation.y, torsoPivot.rotation.z], [2, 2.5, 4]);
  assertRotation([headPivot.rotation.x, headPivot.rotation.y, headPivot.rotation.z], [3, 4, 5.75]);
  assertRotation([leftArmRoot.rotation.x, leftArmRoot.rotation.y, leftArmRoot.rotation.z], [3.8, 5, 6]);
  assertRotation([rightArmRoot.rotation.x, rightArmRoot.rotation.y, rightArmRoot.rotation.z], [5, 6.3, 7]);
  assertRotation([leftLegRoot.rotation.x, leftLegRoot.rotation.y, leftLegRoot.rotation.z], [6, 7, 7.6]);
  assertRotation([rightLegRoot.rotation.x, rightLegRoot.rotation.y, rightLegRoot.rotation.z], [7.6, 8, 9]);
  assert.deepEqual(retargeter.diagnostics(), {
    mappedCount: 7,
    missingCount: 0,
    mappedSourceNames: [
      'player-rig:hips',
      'player-rig:chest',
      'player-rig:head',
      'player-rig:left-arm',
      'player-rig:right-arm',
      'player-rig:left-leg',
      'player-rig:right-leg',
    ],
  });
}

{
  const optionalNames = [
    ['player-rig:left-forearm', 'leftForearmPivot'],
    ['player-rig:right-forearm', 'rightForearmPivot'],
    ['player-rig:left-hand', 'leftHandPivot'],
    ['player-rig:right-hand', 'rightHandPivot'],
    ['player-rig:left-lower-leg', 'leftLowerLegPivot'],
    ['player-rig:right-lower-leg', 'rightLowerLegPivot'],
    ['player-rig:left-foot', 'leftFootPivot'],
    ['player-rig:right-foot', 'rightFootPivot'],
  ];
  const sources = optionalNames.map(([name], index) => node(name, [index, index + 0.1, index + 0.2]));
  const pivots = Object.fromEntries(optionalNames.map(([, targetName]) => [targetName, node(targetName, [9, 9, 9])]));
  const retargeter = createPirateFruitRigRetargeter(node('host', [0, 0, 0], sources), { pivots });

  sources.forEach((source, index) => { source.rotation.z += (index + 1) / 10; });
  retargeter.update();

  optionalNames.forEach(([, targetName], index) => {
    assertRotation(
      [pivots[targetName].rotation.x, pivots[targetName].rotation.y, pivots[targetName].rotation.z],
      [9, 9, 9 + (index + 1) / 10],
    );
  });
  assert.deepEqual(retargeter.diagnostics(), {
    mappedCount: 8,
    missingCount: 7,
    mappedSourceNames: optionalNames.map(([name]) => name),
  });
}

{
  const leftArm = node('player-rig:left-arm');
  const leftForearm = node('player-rig:left-forearm');
  const leftHand = node('player-rig:left-hand');
  const leftLeg = node('player-rig:left-leg');
  const rightLeg = node('player-rig:right-leg');
  const leftLowerLeg = node('player-rig:left-lower-leg');
  const rightLowerLeg = node('player-rig:right-lower-leg');
  const leftArmRoot = node('leftArmRoot', [1, 2, 3]);
  const leftLegRoot = node('leftLegRoot', [4, 5, 6]);
  const rightLegRoot = node('rightLegRoot', [7, 8, 9]);
  const retargeter = createPirateFruitRigRetargeter(node('host', [0, 0, 0], [
    leftArm,
    leftForearm,
    leftHand,
    leftLeg,
    rightLeg,
    leftLowerLeg,
    rightLowerLeg,
  ]), {
    pivots: {
      leftArmRoot,
      leftForearmPivot: leftArmRoot,
      leftHandPivot: leftArmRoot,
      leftLegRoot,
      leftLowerLegPivot: leftLegRoot,
      rightLegRoot,
      rightLowerLegPivot: rightLegRoot,
    },
  });

  leftArm.rotation.x = 0.25;
  leftForearm.rotation.x = 1;
  leftHand.rotation.x = 2;
  leftLeg.rotation.y = 0.5;
  leftLowerLeg.rotation.y = 1.5;
  rightLeg.rotation.z = 0.75;
  rightLowerLeg.rotation.z = 1.75;
  retargeter.update();

  assertRotation([leftArmRoot.rotation.x, leftArmRoot.rotation.y, leftArmRoot.rotation.z], [1.25, 2, 3]);
  assertRotation([leftLegRoot.rotation.x, leftLegRoot.rotation.y, leftLegRoot.rotation.z], [4, 5.5, 6]);
  assertRotation([rightLegRoot.rotation.x, rightLegRoot.rotation.y, rightLegRoot.rotation.z], [7, 8, 9.75]);
  assert.deepEqual(retargeter.diagnostics(), {
    mappedCount: 3,
    missingCount: 4,
    mappedSourceNames: [
      'player-rig:left-arm',
      'player-rig:left-leg',
      'player-rig:right-leg',
    ],
  });
}

{
  const source = node('player-rig:hips', [0.25, -0.5, 0.75]);
  const target = node('hipsPivot', [1, 2, 3]);
  const sourcePosition = { ...source.position };
  const sourceScale = { ...source.scale };
  const targetPosition = { ...target.position };
  const targetScale = { ...target.scale };
  const retargeter = createPirateFruitRigRetargeter(node('host', [0, 0, 0], [source]), {
    pivots: { hipsPivot: target },
  });

  source.rotation.set(0.5, -0.25, 0.25);
  retargeter.update();
  assertRotation([target.rotation.x, target.rotation.y, target.rotation.z], [1.25, 2.25, 2.5]);
  target.rotation.set(100, 100, 100);
  retargeter.update();
  assertRotation([target.rotation.x, target.rotation.y, target.rotation.z], [1.25, 2.25, 2.5]);
  assertRotation([source.rotation.x, source.rotation.y, source.rotation.z], [0.5, -0.25, 0.25]);
  assert.deepEqual(source.position, sourcePosition, 'source position stays unchanged');
  assert.deepEqual(source.scale, sourceScale, 'source scale stays unchanged');
  assert.deepEqual(target.position, targetPosition, 'target position stays unchanged');
  assert.deepEqual(target.scale, targetScale, 'target scale stays unchanged');
}

{
  const source = node('player-rig:hips', [Math.PI - 0.05, -Math.PI + 0.04, Math.PI - 0.03]);
  const target = node('hipsPivot', [1, 2, 3]);
  const retargeter = createPirateFruitRigRetargeter(node('host', [0, 0, 0], [source]), {
    pivots: { hipsPivot: target },
  });

  source.rotation.set(-Math.PI + 0.05, Math.PI - 0.06, -Math.PI + 0.07);
  retargeter.update();
  assertRotation([target.rotation.x, target.rotation.y, target.rotation.z], [1.1, 1.9, 3.1]);

  retargeter.update();
  assertRotation([target.rotation.x, target.rotation.y, target.rotation.z], [1.1, 1.9, 3.1]);
  assertRotation(
    [source.rotation.x, source.rotation.y, source.rotation.z],
    [-Math.PI + 0.05, Math.PI - 0.06, -Math.PI + 0.07],
  );
}

{
  const spine = node('player-rig:spine', [0, 0.4, 0]);
  const torsoPivot = node('torsoPivot', [0, 1, 0]);
  const retargeter = createPirateFruitRigRetargeter(node('host', [0, 0, 0], [spine]), {
    pivots: { torsoPivot },
  });
  spine.rotation.y = 0.9;
  assert.doesNotThrow(() => retargeter.update());
  assertRotation([torsoPivot.rotation.x, torsoPivot.rotation.y, torsoPivot.rotation.z], [0, 1.5, 0]);
  assert.deepEqual(retargeter.diagnostics(), {
    mappedCount: 1,
    missingCount: 6,
    mappedSourceNames: ['player-rig:spine'],
  });
}

{
  const spine = node('player-rig:spine', [0, 0.4, 0]);
  const chest = node('player-rig:chest', [0, 0.8, 0]);
  const torsoPivot = node('torsoPivot', [0, 1, 0]);
  const retargeter = createPirateFruitRigRetargeter(node('host', [0, 0, 0], [chest, spine]), {
    pivots: { torsoPivot },
  });

  spine.rotation.y += 0.266;
  retargeter.update();

  assertRotation([torsoPivot.rotation.x, torsoPivot.rotation.y, torsoPivot.rotation.z], [0, 1.266, 0]);
  assert.deepEqual(retargeter.diagnostics().mappedSourceNames, ['player-rig:spine']);
}

{
  const rightHand = node('player-rig:right-hand', [0, 0, 0]);
  const rightHandAnchor = node('rightHandAnchor', [0, 0, 0]);
  const retargeter = createPirateFruitRigRetargeter(node('host', [0, 0, 0], [rightHand]), {
    pivots: { rightHandAnchor },
  });
  rightHand.rotation.x = 0.75;
  retargeter.update();
  assert.equal(rightHandAnchor.rotation.x, 0.75, 'the current right-hand anchor is a supported hand target');
}

{
  const unmappedForearm = node('player-rig:left-forearm');
  const retargeter = createPirateFruitRigRetargeter(node('host', [0, 0, 0], [unmappedForearm]), { pivots: {} });
  assert.doesNotThrow(() => retargeter.update());
  assert.deepEqual(retargeter.diagnostics(), {
    mappedCount: 0,
    missingCount: 8,
    mappedSourceNames: [],
  });
}

{
  const retargeter = createPirateFruitRigRetargeter(null, { pivots: {} });
  assert.doesNotThrow(() => retargeter.update());
  assert.deepEqual(retargeter.diagnostics(), {
    mappedCount: 0,
    missingCount: 7,
    mappedSourceNames: [],
  });
}

// Actual vendor-Three remote host/overlay regression: the source remote rig
// owns the pose, while the Pocket overlay receives it without local __combat.
{
  const vendor = await import('../pirate-fruit-offline/assets/vendor-three-Bv6LZXUZ.js');
  const kit = threeFromPirateFruitVendor(vendor);
  const probe = new kit.Group();
  const Quaternion = probe.quaternion.constructor;
  const Euler = probe.rotation.constructor;
  const Vector3 = probe.position.constructor;
  const host = new kit.Group();
  host.name = 'remote-player:remote-a';
  const original = new kit.Mesh(
    new kit.BoxGeometry(1, 1, 1),
    new kit.MeshStandardMaterial({ color: 0x334455 }),
  );
  original.name = 'remote:original-body';
  host.add(original);
  const sourceRoot = new kit.Group();
  sourceRoot.name = 'player-rig:root';
  host.add(sourceRoot);
  const source = Object.fromEntries([
    'hips', 'chest', 'head', 'left-arm', 'right-arm', 'left-leg', 'right-leg',
  ].map(part => {
    const node = new kit.Group();
    node.name = `player-rig:${part}`;
    sourceRoot.add(node);
    return [part, node];
  }));
  source['left-arm'].rotation.z = -0.08;
  source['right-arm'].rotation.z = 0.08;

  const overlayRoot = new kit.Group();
  overlayRoot.rotation.y = Math.PI;
  const expectedDeadRoot = new kit.Group();
  expectedDeadRoot.rotation.y = Math.PI;
  const pivots = Object.fromEntries([
    ['hips', 'hipsPivot'], ['chest', 'torsoPivot'], ['head', 'headPivot'],
    ['left-arm', 'leftArmRoot'], ['right-arm', 'rightArmRoot'],
    ['left-leg', 'leftLegRoot'], ['right-leg', 'rightLegRoot'],
  ].map(([, name]) => [name, new kit.Group()]));
  const retargeter = createPirateFruitRigRetargeter(host, { pivots }, {
    sourceRootName: 'player-rig:root',
    targetRoot: overlayRoot,
    sourceRestMode: 'bind',
  });
  hidePirateFruitOriginalMeshes(host);
  assert.equal(original.visible, false, 'remote original mesh is hidden beneath the overlay');

  const resetSourceBind = () => {
    sourceRoot.position.set(0, 0, 0);
    sourceRoot.rotation.set(0, 0, 0);
    for (const node of Object.values(source)) node.rotation.set(0, 0, 0);
    source['left-arm'].rotation.z = -0.08;
    source['right-arm'].rotation.z = 0.08;
  };
  const actionPoses = [
    ['attack', () => { source['right-arm'].rotation.z = -0.85; }, () => {
      assert.ok(Math.abs(pivots.rightArmRoot.rotation.z - 0.93) < 1e-12, 'attack reaches the expected right arm delta');
    }],
    ['casting', () => { source.chest.rotation.x = -0.4; source['left-arm'].rotation.z = 0.35; }, () => {
      assert.ok(Math.abs(pivots.torsoPivot.rotation.x - 0.4) < 1e-12, 'casting reaches the expected torso delta');
      assert.ok(Math.abs(pivots.leftArmRoot.rotation.z + 0.43) < 1e-12, 'casting reaches the expected left arm delta');
    }],
    ['blocking', () => { source['left-arm'].rotation.z = -0.35; source['right-arm'].rotation.z = 0.35; }, () => {
      assert.ok(Math.abs(pivots.leftArmRoot.rotation.z - 0.27) < 1e-12, 'blocking reaches the expected left guard delta');
      assert.ok(Math.abs(pivots.rightArmRoot.rotation.z + 0.27) < 1e-12, 'blocking reaches the expected right guard delta');
    }],
    ['dead', () => {
      sourceRoot.position.y = 0.24;
      sourceRoot.rotation.z = -0.9;
      source.chest.rotation.z = -1.05;
    }, () => {
      assert.ok(Math.abs(overlayRoot.position.y - 0.24) < 1e-12, 'dead root translation reaches overlay');
      const sourceDelta = new kit.Group();
      sourceDelta.rotation.z = -0.9;
      expectedDeadRoot.quaternion.copy(sourceDelta.quaternion.clone().multiply(expectedDeadRoot.quaternion.clone()));
      assert.ok(overlayRoot.quaternion.angleTo(expectedDeadRoot.quaternion) < 1e-12, 'dead root rotation reaches overlay in world quaternion space');
      assert.ok(Math.abs(pivots.torsoPivot.rotation.z - 1.05) < 1e-12, 'dead body pose reaches overlay');
    }],
  ];
  for (const [action, apply, assertPose] of actionPoses) {
    resetSourceBind();
    apply();
    retargeter.update();
    assertPose();
    assert.ok(Object.values(pivots).some(pivot => Math.abs(pivot.rotation.x) > 0.01 || Math.abs(pivot.rotation.z) > 0.01), `${action} source pose reaches overlay bones`);
  }
  assert.equal(retargeter.diagnostics().rootMapped, true, 'remote root pose is mapped for knockdown/dead');

  // Attach after a remote has already entered an action: the current pose is
  // preserved as a delta from the authored bind pose, rather than captured as
  // the new rest pose and rendered flat.
  const lateOverlayRoot = new kit.Group();
  lateOverlayRoot.rotation.y = Math.PI;
  const latePivots = Object.fromEntries(Object.values(pivots).map(pivot => [pivot.name || '', new kit.Group()]));
  const lateNames = ['hipsPivot', 'torsoPivot', 'headPivot', 'leftArmRoot', 'rightArmRoot', 'leftLegRoot', 'rightLegRoot'];
  for (const name of lateNames) if (!latePivots[name]) latePivots[name] = new kit.Group();
  const lateRetargeter = createPirateFruitRigRetargeter(host, { pivots: latePivots }, {
    sourceRootName: 'player-rig:root',
    targetRoot: lateOverlayRoot,
    sourceRestMode: 'bind',
  });
  lateRetargeter.update();
  const lateExpectedRoot = new kit.Group();
  lateExpectedRoot.rotation.y = Math.PI;
  const lateSourceDelta = new kit.Group();
  lateSourceDelta.rotation.z = -0.9;
  lateExpectedRoot.quaternion.copy(lateSourceDelta.quaternion.clone().multiply(lateExpectedRoot.quaternion.clone()));
  assert.ok(lateOverlayRoot.quaternion.angleTo(lateExpectedRoot.quaternion) < 1e-12, 'late attach keeps the in-flight root pose');
  assert.ok(Math.abs(latePivots.torsoPivot.rotation.z - 1.05) < 1e-12, 'late attach keeps the in-flight body pose');
}

// Actual hierarchical Three rig regression: flat target pivots must receive
// the source ancestor-chain quaternion delta, not only the first matching node.
{
  const vendor = await import('../pirate-fruit-offline/assets/vendor-three-Bv6LZXUZ.js');
  const kit = threeFromPirateFruitVendor(vendor);
  const probe = new kit.Group();
  const Quaternion = probe.quaternion.constructor;
  const Euler = probe.rotation.constructor;
  const Vector3 = probe.position.constructor;
  const host = new kit.Group();
  const sourceRoot = new kit.Group(); sourceRoot.name = 'player-rig:root'; host.add(sourceRoot);
  const hips = new kit.Group(); hips.name = 'player-rig:hips'; sourceRoot.add(hips);
  const spine = new kit.Group(); spine.name = 'player-rig:spine'; hips.add(spine);
  const chest = new kit.Group(); chest.name = 'player-rig:chest'; spine.add(chest);
  const head = new kit.Group(); head.name = 'player-rig:head'; chest.add(head);
  const leftArm = new kit.Group(); leftArm.name = 'player-rig:left-arm'; chest.add(leftArm);
  const rightArm = new kit.Group(); rightArm.name = 'player-rig:right-arm'; chest.add(rightArm);
  const leftLeg = new kit.Group(); leftLeg.name = 'player-rig:left-leg'; hips.add(leftLeg);
  const rightLeg = new kit.Group(); rightLeg.name = 'player-rig:right-leg'; hips.add(rightLeg);
  leftArm.rotation.z = -0.08;
  rightArm.rotation.z = 0.08;
  sourceRoot.updateMatrixWorld(true);
  const bindWorld = new Map([sourceRoot, hips, spine, chest, head, leftArm, rightArm, leftLeg, rightLeg]
    .map(node => [node, node.getWorldQuaternion(new Quaternion())]));

  const overlayRoot = new kit.Group();
  overlayRoot.rotation.y = Math.PI;
  const names = ['hipsPivot', 'torsoPivot', 'headPivot', 'leftArmRoot', 'rightArmRoot', 'leftLegRoot', 'rightLegRoot'];
  const pivots = Object.fromEntries(names.map(name => [name, new kit.Group()]));
  Object.values(pivots).forEach(pivot => overlayRoot.add(pivot));
  const rest = new Map(Object.values(pivots).map(pivot => [pivot, {
    px: pivot.position.x, py: pivot.position.y, pz: pivot.position.z,
    rx: pivot.rotation.x, ry: pivot.rotation.y, rz: pivot.rotation.z,
  }]));
  const retargeter = createPirateFruitRigRetargeter(host, { pivots, rest }, {
    sourceRootName: 'player-rig:root',
    targetRoot: overlayRoot,
    sourceRestMode: 'bind',
  });

  const applyDelta = (node, x, y, z) => {
    const euler = node.rotation.clone().set(x, y, z);
    const delta = node.quaternion.clone().set(0, 0, 0, 1).setFromEuler(euler);
    node.quaternion.multiply(delta);
  };
  sourceRoot.rotation.set(-0.3, 0.24, -0.18);
  hips.rotation.set(0.14, -0.2, 0.22);
  spine.rotation.set(-0.08, -0.5, 0.12);
  chest.rotation.set(0.22, 0.18, -0.12);
  head.rotation.set(0.12, -0.18, 0.2);
  applyDelta(leftArm, -0.76, 0.08, -0.34);
  applyDelta(rightArm, -1.16, -0.16, 0.28);
  leftLeg.rotation.set(-0.2, 0.1, -0.08);
  rightLeg.rotation.set(0.24, -0.08, 0.12);
  sourceRoot.updateMatrixWorld(true);
  const poseWorld = new Map([sourceRoot, hips, spine, chest, head, leftArm, rightArm, leftLeg, rightLeg]
    .map(node => [node, node.getWorldQuaternion(new Quaternion())]));
  // เก็บ rotation oracle ก่อน nonuniform scale จะสร้าง shear ใน world matrix
  chest.scale.y = 1.25;
  sourceRoot.scale.set(1.08, 0.94, 1.03);
  retargeter.update();

  const deltaOf = (node, restRotation) => {
    const restQuaternion = node.quaternion.clone().set(0, 0, 0, 1)
      .setFromEuler(new Euler(...restRotation));
    return restQuaternion.invert().multiply(node.quaternion.clone());
  };
  const chain = (...deltas) => deltas.reduce(
    (out, delta) => out.multiply(delta),
    new Quaternion().set(0, 0, 0, 1),
  );
  const qRoot = deltaOf(sourceRoot, [0, 0, 0]);
  const qHips = deltaOf(hips, [0, 0, 0]);
  const qSpine = deltaOf(spine, [0, 0, 0]);
  const qChest = deltaOf(chest, [0, 0, 0]);
  const qHead = deltaOf(head, [0, 0, 0]);
  const qLeftArm = deltaOf(leftArm, [0, 0, -0.08]);
  const qRightArm = deltaOf(rightArm, [0, 0, 0.08]);
  const qLeftLeg = deltaOf(leftLeg, [0, 0, 0]);
  const qRightLeg = deltaOf(rightLeg, [0, 0, 0]);
  const near = (actual, expected, message) => {
    for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      const actualAxis = new Vector3(...axis).applyQuaternion(actual);
      const expectedAxis = new Vector3(...axis).applyQuaternion(expected);
      assert.ok(actualAxis.distanceTo(expectedAxis) < 1e-9, message);
    }
  };
  const targetBasis = new Quaternion().set(0, 0, 0, 1).setFromEuler(new Euler(0, Math.PI, 0));
  const toTargetFrame = delta => targetBasis.clone().invert().multiply(delta).multiply(targetBasis);
  const worldDelta = node => {
    const currentRoot = poseWorld.get(sourceRoot);
    const bindRoot = bindWorld.get(sourceRoot);
    const currentRelative = currentRoot.clone().invert().multiply(poseWorld.get(node));
    const bindRelative = bindRoot.clone().invert().multiply(bindWorld.get(node));
    return currentRelative.multiply(bindRelative.clone().invert());
  };
  near(pivots.torsoPivot.quaternion, toTargetFrame(worldDelta(chest)), 'torso includes hips, spine, and chest deltas');
  near(pivots.headPivot.quaternion, toTargetFrame(worldDelta(head)), 'head includes the full ancestor chain');
  near(pivots.leftArmRoot.quaternion, toTargetFrame(worldDelta(leftArm)), 'left arm includes chest and bind splay');
  near(pivots.rightArmRoot.quaternion, toTargetFrame(worldDelta(rightArm)), 'right arm includes chest and bind splay');
  near(pivots.leftLegRoot.quaternion, toTargetFrame(worldDelta(leftLeg)), 'left leg includes hips delta');
  near(pivots.rightLegRoot.quaternion, toTargetFrame(worldDelta(rightLeg)), 'right leg includes hips delta');
  assert.ok(Math.abs(overlayRoot.scale.x - 1.08) < 1e-10, 'root scale follows source root');
  assert.ok(Math.abs(pivots.torsoPivot.scale.y - 1.25) < 1e-10, 'chest scale follows torso target');

  // Spatial basis proof for target Y=PI: source local +Z is target idle -Z,
  // while both front and up retain the same source-pose delta in world space.
  const sourceFront = new Vector3(0, 0, 1).applyQuaternion(qRoot);
  const sourceUp = new Vector3(0, 1, 0).applyQuaternion(qRoot);
  const targetFront = new Vector3(0, 0, -1).applyQuaternion(overlayRoot.quaternion);
  const targetUp = new Vector3(0, 1, 0).applyQuaternion(overlayRoot.quaternion);
  const expectedFront = new Vector3(0, 0, -1).applyQuaternion(qRoot.clone().multiply(targetBasis));
  const expectedUp = new Vector3(0, 1, 0).applyQuaternion(qRoot.clone().multiply(targetBasis));
  assert.ok(targetFront.distanceTo(sourceFront) < 1e-10, 'target -Z front follows source +Z front');
  assert.ok(targetFront.distanceTo(expectedFront) < 1e-10, 'target front uses sourceDelta * targetRest');
  assert.ok(targetUp.distanceTo(expectedUp) < 1e-10, 'target up uses sourceDelta * targetRest');
  assert.ok(targetFront.y > 0, 'source pitch that raises +Z raises target world front');
  assert.ok(sourceUp.y > 0.9 && targetUp.y > 0.9, 'up basis remains upright after Y=PI mapping');
  assert.equal(retargeter.diagnostics().mappedRig, true, 'hierarchical rig is source-pose driven');

  // optional forearm ต้องไม่ชดเชย head ที่หายแล้วปิด fallback ของโมเดลไม่ครบ
  chest.remove(head);
  const forearm = new kit.Group(); forearm.name = 'player-rig:left-forearm'; leftArm.add(forearm);
  const optionalTarget = new kit.Group(); pivots.leftArmRoot.add(optionalTarget);
  const incomplete = createPirateFruitRigRetargeter(host, {
    pivots: { ...pivots, leftForearmPivot: optionalTarget }, rest,
  }, { sourceRootName: 'player-rig:root', targetRoot: overlayRoot, sourceRestMode: 'bind' });
  assert.equal(incomplete.diagnostics().mappedCount, 7);
  assert.equal(incomplete.diagnostics().missingCount, 1);
  assert.equal(incomplete.diagnostics().mappedRig, false, 'optional mapping cannot replace a required head');
}

// ใช้ขอบเขต geometry จริงตรวจว่าท่าล้มพ้นพื้น โดยไม่ขยับ actor/source ของเกม
{
  const vendor = await import('../pirate-fruit-offline/assets/vendor-three-Bv6LZXUZ.js');
  const kit = threeFromPirateFruitVendor(vendor);
  const actor = new kit.Group(); actor.position.set(100, 7, 100); actor.rotation.y = 0.7;
  const source = new kit.Group(); source.name = 'player-rig:root'; actor.add(source);
  const overlay = new kit.Group(); overlay.rotation.y = Math.PI; actor.add(overlay);
  const body = new kit.Mesh(new kit.BoxGeometry(0.4, 1.8, 0.4), new kit.MeshStandardMaterial());
  body.position.y = 0.9; overlay.add(body);
  body.geometry.computeBoundingBox();
  const Bounds = body.geometry.boundingBox.constructor;
  const retargeter = createPirateFruitRigRetargeter(actor, { pivots: {} }, {
    sourceRootName: 'player-rig:root', targetRoot: overlay, sourceRestMode: 'bind', keepGroundContact: true,
  });
  source.rotation.z = -1.42; source.position.y = -0.32;
  retargeter.update();
  actor.updateMatrixWorld(true);
  const box = new Bounds().setFromObject(overlay);
  assert.ok(Math.abs(box.min.y - 7) < 1e-9, 'ร่างล้มวางบนพื้น actor แม้โลกมีพิกัดสูงและหมุนอยู่');
  assert.ok(box.max.x - box.min.x > 1, 'ร่างยังนอน ไม่ถูกยืดหรือหมุนกลับไปยืน');
  const liftedY = overlay.position.y;
  for (let frame = 0; frame < 5; frame += 1) retargeter.update();
  assert.ok(Math.abs(overlay.position.y - liftedY) < 1e-12, 'ground offset ไม่สะสมทุกเฟรม');
  assert.equal(source.position.y, -0.32, 'ไม่เขียนทับการเคลื่อนไหวต้นทาง');
  assert.deepEqual(actor.position.toArray(), [100, 7, 100], 'ไม่ขยับตำแหน่ง actor/snapshot');
  source.rotation.set(0, 0, 0); source.position.y = 0;
  retargeter.update();
  assert.equal(overlay.position.y, 0, 'กลับมายืนแล้วไม่ค้าง offset ท่าล้ม');
  source.position.y = 0.45;
  retargeter.update();
  assert.equal(overlay.position.y, 0.45, 'ความสูงกระโดดยังตาม source เดิม');
}

console.log('V9.0 pirate-fruit rig retarget: PASS');
