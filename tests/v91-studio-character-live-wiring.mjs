import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  STUDIO_CHARACTER_BRIDGE_DEFAULT_TIMEOUT_MS,
  STUDIO_CHARACTER_BRIDGE_REQUEST,
  STUDIO_CHARACTER_BRIDGE_RESPONSE,
  STUDIO_CHARACTER_PRIMARY_MODEL_ID,
  loadStudioCharacterFromEngine,
} from '../asset-presentation/studio-character-live-bridge.mjs';

const game = fs.readFileSync(new URL('../game-v900.js', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../asset-presentation/studio-character-live-bridge.mjs', import.meta.url), 'utf8');
const packageLoader = fs.readFileSync(new URL('../asset-presentation/studio-character-package.mjs', import.meta.url), 'utf8');
const provider = fs.readFileSync(new URL('../asset-presentation/providers/studio-character.mjs', import.meta.url), 'utf8');

assert.match(game, /registerProvider\('studio-character',\s*createStudioCharacterProvider/);
assert.match(game, /loadStudioCharacterFromEngine\(/);
assert.match(game, /installStudioCharacterPackage\(assets, studioPackage/);
assert.match(game, /assets\.spawn\(studioPackage\.manifest\.id/);
assert.match(game, /playerVisualSource = 'studio-character'/);
assert.match(game, /const next = moving \? 'walk' : 'idle'/);
assert.match(game, /assets\.spawn\('character\.human\.pirate-fruit\.v1'/, 'Pirate fallback must remain available');
assert.doesNotMatch(game, /characterId\s*=\s*['"]character\.human\.pirate\.studio-live['"].*server/i, 'Studio id must not become gameplay authority');

assert.match(bridge, /POCKET_STUDIO_CHARACTER_REQUEST/);
assert.match(bridge, /POCKET_STUDIO_CHARACTER_PACKAGE/);
assert.match(bridge, /validateStudioCharacterPackage\(message\.package\)/);
assert.match(bridge, /event\.origin !== targetOrigin/);
assert.match(bridge, /readiness-retry/);
assert.match(bridge, /POCKETMONSTER_STUDIO_CHARACTER_BRIDGE_DIAGNOSTICS/);
assert.match(bridge, /studio-rigid-pivot-local-axes-v1/);
assert.equal(STUDIO_CHARACTER_BRIDGE_DEFAULT_TIMEOUT_MS, 30000, 'consumer timeout must cover Studio multi-source Three.js bootstrap');

assert.match(packageLoader, /gameplayPolicy\?\.included !== false/);
assert.match(packageLoader, /rig\?\.architecture !== 'THREE\.Group'/);
assert.match(packageLoader, /'throwOrigin'/, 'Studio package validator must require throwOrigin socket');
assert.match(provider, /buildSceneNode/);
assert.match(provider, /buildJointMap/);
assert.match(provider, /findStudioCharacterClip\(pkg, action\)/);
assert.match(packageLoader, /pocket-motion-pack-v1/);
assert.match(provider, /anchor\(name, target\)/);

function validPackage() {
  const transform = () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 'XYZ'], scale: [1, 1, 1] });
  const group = (name, joint = null, marker = false) => ({
    name, nodeType: 'group', visible: true, transform: transform(),
    userData: {
      ...(joint ? { engineJointKey: joint } : {}),
      ...(marker ? { primaryCharacter: STUDIO_CHARACTER_PRIMARY_MODEL_ID, engineRole: 'primary-character' } : {}),
    },
    children: [],
  });
  const add = (parent, child) => { parent.children.push(child); return child; };
  const mesh = {
    name: 'Body', nodeType: 'mesh', visible: true,
    transform: transform(),
    geometry: {
      attributes: { position: { itemSize: 3, array: [0, 0, 0, 1, 0, 0, 0, 1, 0] } },
      index: { array: [0, 1, 2] },
    },
    material: { color: '#ffffff', maps: {} },
    children: [],
  };
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
  chest.children.push(mesh);

  const jointBindings = { rootJoint: { path: [], nodeName: 'characterRoot' } };
  const visit = (node, path = []) => {
    if (node.userData?.engineJointKey) jointBindings[node.userData.engineJointKey] = { path: [...path], nodeName: node.name };
    node.children.forEach((child, index) => visit(child, [...path, index]));
  };
  visit(root);
  const sockets = {
    rightHand: { joint: 'wristR', offset: [0, 0, 0] },
    leftHand: { joint: 'wristL', offset: [0, 0, 0] },
    head: { joint: 'head', offset: [0, 0, 0] },
    back: { joint: 'chest', offset: [0, 0, 0] },
    waist: { joint: 'pelvis', offset: [0, 0, 0] },
    vfxOrigin: { joint: 'chest', offset: [0, 0, 0] },
    attackOrigin: { joint: 'wristR', offset: [0, 0, 0] },
    throwOrigin: { joint: 'wristR', offset: [0, 0, 0] },
  };
  const common = {
    id: 'character.human.pirate.studio-live',
    kind: 'character',
    provider: 'studio-character',
    style: 'blocky-bighead-studio-v1',
    surfaceStyle: 'pbr-studio-v1',
    rig: 'studio-three-group-v1',
    metrics: { height: 1.8 },
    roles: { player: {} },
  };
  return {
    schema: 'pocket-character-runtime-v1',
    schemaVersion: '1.0.0',
    target: { game: 'PocketMonster', assetEngine: 'asset-presentation', provider: 'studio-character' },
    manifest: { ...common, name: 'Studio Player', contract: 'presentation-only' },
    catalogEntry: { ...common },
    character: {},
    sceneGraph: { schema: 'three-group-scenegraph-v1', root, stats: { meshes: 1, externalTextureRefs: 0 } },
    rig: {
      architecture: 'THREE.Group',
      schema: 'studio-rig-v1',
      jointBindings,
      sockets,
    },
    animations: ['idle', 'walk', 'run', 'attack', 'skill', 'hurt', 'dead'].map(action => ({
      id: `${action}-clip`, name: action, duration: 1,
      loop: ['idle', 'walk', 'run'].includes(action),
      keyframes: [
        { time: 0, joints: { rootJoint: { position: [0, 0, 0] } } },
        { time: 1, joints: { rootJoint: { position: [0, 0, 0] } } },
      ],
    })),
    motionPack: {
      schema: 'pocket-motion-pack-v1', defaultAction: 'idle',
      actionMap: Object.fromEntries(['idle', 'walk', 'run', 'attack', 'skill', 'hurt', 'dead'].map(action => [action, `${action}-clip`])),
    },
    gameplayPolicy: { included: false },
  };
}

// Behavioral gate: the producer can become ready after the iframe load edge.
// The bridge must retry rather than falling back after one dropped request.
{
  const windowListeners = new Map();
  const frameListeners = new Map();
  let removed = false;
  let attempts = 0;
  const frame = {
    style: {},
    contentWindow: {
      postMessage(message, targetOrigin) {
        assert.equal(message.type, STUDIO_CHARACTER_BRIDGE_REQUEST);
        assert.equal(targetOrigin, 'https://studio.example.test');
        attempts += 1;
        if (attempts < 2) return;
        queueMicrotask(() => windowListeners.get('message')?.({
          origin: targetOrigin,
          source: frame.contentWindow,
          data: {
            type: STUDIO_CHARACTER_BRIDGE_RESPONSE,
            requestId: message.requestId,
            package: validPackage(),
          },
        }));
      },
    },
    setAttribute() {},
    addEventListener(type, listener) { frameListeners.set(type, listener); },
    remove() { removed = true; },
  };
  const windowRef = {
    location: { href: 'https://pocket.example.test/scene-v900.html' },
    addEventListener(type, listener) { windowListeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (windowListeners.get(type) === listener) windowListeners.delete(type);
    },
  };
  const documentRef = {
    createElement(tag) { assert.equal(tag, 'iframe'); return frame; },
    body: {
      appendChild(node) {
        assert.equal(node, frame);
        queueMicrotask(() => frameListeners.get('load')?.());
      },
    },
  };
  const pkg = await loadStudioCharacterFromEngine({
    sourceUrl: 'https://studio.example.test/',
    timeoutMs: 1500,
    retryMs: 25,
    documentRef,
    windowRef,
  });
  assert.equal(pkg.manifest.id, 'character.human.pirate.studio-live');
  assert.equal(pkg.manifest.name, 'Blue Explorer');
  assert.equal(pkg.rig.primaryCharacter, STUDIO_CHARACTER_PRIMARY_MODEL_ID);
  assert.ok(attempts >= 2, 'readiness retry should recover when the first request is dropped');
  assert.equal(removed, true, 'hidden Studio iframe is removed after package delivery');
  assert.equal(windowListeners.has('message'), false, 'message listener is removed after package delivery');
  const diagnostics = windowRef.POCKETMONSTER_STUDIO_CHARACTER_BRIDGE_DIAGNOSTICS();
  assert.equal(diagnostics.state, 'validated-blue-explorer');
  assert.ok(diagnostics.attempts >= 2);
}

console.log('V9.1 Studio character live bridge wiring + delayed-readiness gate passed');
