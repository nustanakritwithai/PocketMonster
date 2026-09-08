import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  STUDIO_CHARACTER_BRIDGE_DEFAULT_TIMEOUT_MS,
  STUDIO_CHARACTER_BRIDGE_REQUEST,
  STUDIO_CHARACTER_BRIDGE_RESPONSE,
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
assert.equal(STUDIO_CHARACTER_BRIDGE_DEFAULT_TIMEOUT_MS, 30000, 'consumer timeout must cover Studio multi-source Three.js bootstrap');

assert.match(packageLoader, /gameplayPolicy\?\.included !== false/);
assert.match(packageLoader, /rig\?\.architecture !== 'THREE\.Group'/);
assert.match(packageLoader, /'throwOrigin'/, 'Studio package validator must require throwOrigin socket');
assert.match(provider, /buildSceneNode/);
assert.match(provider, /buildJointMap/);
assert.match(provider, /findClip\(pkg, action\)/);
assert.match(provider, /anchor\(name, target\)/);

function validPackage() {
  const mesh = {
    name: 'Body', nodeType: 'mesh', visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0, 'XYZ'], scale: [1, 1, 1] },
    geometry: {
      attributes: { position: { itemSize: 3, array: [0, 0, 0, 1, 0, 0, 0, 1, 0] } },
      index: { array: [0, 1, 2] },
    },
    material: { color: '#ffffff', maps: {} },
    children: [],
  };
  const root = {
    name: 'characterRoot', nodeType: 'group', visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0, 'XYZ'], scale: [1, 1, 1] },
    children: [mesh],
  };
  const sockets = Object.fromEntries(
    ['rightHand', 'leftHand', 'head', 'back', 'waist', 'vfxOrigin', 'attackOrigin', 'throwOrigin']
      .map(name => [name, { joint: 'rootJoint', offset: [0, 0, 0] }]),
  );
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
      jointBindings: { rootJoint: { path: [], nodeName: 'characterRoot' } },
      sockets,
    },
    animations: [],
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
  assert.ok(attempts >= 2, 'readiness retry should recover when the first request is dropped');
  assert.equal(removed, true, 'hidden Studio iframe is removed after package delivery');
  assert.equal(windowListeners.has('message'), false, 'message listener is removed after package delivery');
  const diagnostics = windowRef.POCKETMONSTER_STUDIO_CHARACTER_BRIDGE_DIAGNOSTICS();
  assert.equal(diagnostics.state, 'validated');
  assert.ok(diagnostics.attempts >= 2);
}

console.log('V9.1 Studio character live bridge wiring + delayed-readiness gate passed');
