import assert from 'node:assert/strict';

import { createPirateFruitRigRetargeter } from '../asset-presentation/pirate-fruit-rig-retarget.mjs';

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

console.log('V9.0 pirate-fruit rig retarget: PASS');
