import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  STUDIO_CHARACTER_PRIMARY_MODEL_ID,
  STUDIO_CHARACTER_PRIMARY_NAME,
  STUDIO_CHARACTER_PIVOT_CONTRACT,
  STUDIO_CHARACTER_REQUIRED_PIVOTS,
  inspectBlueExplorerPrimaryPackage,
  promoteBlueExplorerGamePackage,
} from '../asset-presentation/studio-character-live-bridge.mjs';

function group(name, joint = null, marker = false) {
  return {
    name,
    nodeType: 'group',
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0, 'XYZ'], scale: [1, 1, 1] },
    userData: {
      ...(joint ? { engineJointKey: joint } : {}),
      ...(marker ? { primaryCharacter: STUDIO_CHARACTER_PRIMARY_MODEL_ID, engineRole: 'primary-character' } : {}),
    },
    children: [],
  };
}
function add(parent, child) { parent.children.push(child); return child; }
function makeSyntheticPrimaryPackage() {
  const root = group('characterRoot');
  const blue = add(root, group('BlueExplorer', null, true));
  const pelvis = add(blue, group('pelvis', 'pelvis'));
  const chest = add(pelvis, group('torso', 'chest'));
  const neck = add(chest, group('neck', 'neck'));
  add(neck, group('head', 'head'));
  const shoulderL = add(chest, group('shoulder_right', 'shoulderL'));
  const elbowL = add(shoulderL, group('elbow_right', 'elbowL'));
  add(elbowL, group('wrist_right', 'wristL'));
  const shoulderR = add(chest, group('shoulder_left', 'shoulderR'));
  const elbowR = add(shoulderR, group('elbow_left', 'elbowR'));
  add(elbowR, group('wrist_left', 'wristR'));
  const hipL = add(pelvis, group('hip_right', 'hipL'));
  const kneeL = add(hipL, group('knee_right', 'kneeL'));
  add(kneeL, group('ankle_right', 'ankleL'));
  const hipR = add(pelvis, group('hip_left', 'hipR'));
  const kneeR = add(hipR, group('knee_left', 'kneeR'));
  add(kneeR, group('ankle_left', 'ankleR'));

  const bindings = {};
  const visit = (node, path = []) => {
    if (node.userData?.engineJointKey) bindings[node.userData.engineJointKey] = { path: [...path], nodeName: node.name };
    node.children.forEach((child, index) => visit(child, [...path, index]));
  };
  visit(root);
  return {
    manifest: { id: 'character.human.pirate.studio-live', name: 'Studio Player' },
    catalogEntry: { id: 'character.human.pirate.studio-live', name: 'Studio Player' },
    sceneGraph: { root },
    rig: {
      jointBindings: bindings,
      sockets: {
        rightHand: { joint: 'wristR', offset: [0, 0, 0] },
        leftHand: { joint: 'wristL', offset: [0, 0, 0] },
        throwOrigin: { joint: 'wristR', offset: [0, 0, -0.08] },
      },
    },
    motionPack: {
      actionMap: {
        capture_throw: 'capture_throw_r',
        capture_throw_r: 'capture_throw_r',
        summon_monster_throw: 'summon_monster_throw',
        monster_command: 'monster_command',
      },
    },
  };
}

const synthetic = makeSyntheticPrimaryPackage();
const inspected = inspectBlueExplorerPrimaryPackage(synthetic);
assert.equal(inspected.valid, true, inspected.errors.join('; '));
assert.deepEqual(Object.keys(inspected.frames).sort(), [...STUDIO_CHARACTER_REQUIRED_PIVOTS].sort());
for (const frame of Object.values(inspected.frames)) {
  assert.equal(frame.rotationOrder, 'XYZ');
  assert.equal(frame.position.length, 3);
  assert.equal(frame.rotation.length, 3);
  assert.equal(frame.scale.length, 3);
}

const promoted = promoteBlueExplorerGamePackage(synthetic);
assert.equal(promoted.manifest.name, STUDIO_CHARACTER_PRIMARY_NAME);
assert.equal(promoted.catalogEntry.name, STUDIO_CHARACTER_PRIMARY_NAME);
assert.equal(promoted.rig.primaryCharacter, STUDIO_CHARACTER_PRIMARY_MODEL_ID);
assert.equal(promoted.rig.pivotContract, STUDIO_CHARACTER_PIVOT_CONTRACT);
assert.equal(Object.keys(promoted.rig.pivotFrames).length, STUDIO_CHARACTER_REQUIRED_PIVOTS.length);
assert.equal(promoted.motionPack.actionMap.throw, 'capture_throw_r');
assert.equal(promoted.motionPack.actionMap.summon, 'summon_monster_throw');
assert.equal(promoted.motionPack.actionMap.summon_throw, 'summon_monster_throw');
assert.equal(promoted.motionPack.actionMap.command, 'monster_command');
assert.equal(promoted.motionPack.actionMap.recall, 'monster_command');

const bad = makeSyntheticPrimaryPackage();
delete bad.rig.jointBindings.wristR;
assert.equal(inspectBlueExplorerPrimaryPackage(bad).valid, false, 'missing throw wrist pivot must reject primary model');

const provider = fs.readFileSync(new URL('../asset-presentation/providers/studio-character.mjs', import.meta.url), 'utf8');
assert.match(provider, /pivots:\s*Object\.freeze\(\{ \.\.\.joints \}\)/, 'runtime handle must expose actual pivot Groups');
assert.match(provider, /rotation\?\.set\?\.[\s\S]*rotation\[3\] \|\| 'XYZ'/, 'scene reconstruction must preserve local rotation order');
assert.match(provider, /node\.localToWorld\(local\)/, 'sockets must resolve from the reconstructed joint pivot hierarchy');
assert.match(provider, /sampleClip\(next, animation\.time, joints\)/, 'animation must drive the reconstructed pivot Groups');

const game = fs.readFileSync(new URL('../game-v900.js', import.meta.url), 'utf8');
assert.match(game, /loadStudioCharacterFromEngine\(/, 'game must request the live Engine primary character');
assert.match(game, /assets\.spawn\(studioPackage\.manifest\.id/, 'live Studio package must be the spawned player visual');
assert.match(game, /playerVisualSource = 'studio-character'/, 'Studio character must remain the preferred player presentation source');

if (process.argv[2]) {
  const actual = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const actualInspection = inspectBlueExplorerPrimaryPackage(actual);
  assert.equal(actualInspection.valid, true, actualInspection.errors.join('; '));
  const actualPromoted = promoteBlueExplorerGamePackage(actual);
  assert.equal(actualPromoted.rig.primaryCharacter, STUDIO_CHARACTER_PRIMARY_MODEL_ID);
  assert.equal(actualPromoted.rig.pivotContract, STUDIO_CHARACTER_PIVOT_CONTRACT);
  assert.ok(actualPromoted.motionPack.actionMap.capture_throw);
  assert.ok(actualPromoted.motionPack.actionMap.summon_monster_throw);
}

console.log('Blue Explorer primary game rig/pivot contract passed');
