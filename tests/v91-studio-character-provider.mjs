import assert from 'node:assert/strict';
import { createAssetEngine } from '../asset-presentation/engine.mjs';
import { resetCatalog } from '../asset-presentation/catalog.mjs';
import { resetOwnership } from '../asset-presentation/ownership.mjs';
import { createStudioCharacterProvider } from '../asset-presentation/providers/studio-character.mjs';
import {
  installStudioCharacterPackage,
  resetStudioCharacterPackages,
  validateStudioCharacterPackage,
} from '../asset-presentation/studio-character-package.mjs';

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
}

class Euler {
  constructor() { this.x = 0; this.y = 0; this.z = 0; this.order = 'XYZ'; }
  set(x, y, z, order = this.order) { this.x = x; this.y = y; this.z = z; this.order = order; return this; }
}

class Node {
  constructor() {
    this.children = [];
    this.parent = null;
    this.position = new Vec3();
    this.rotation = new Euler();
    this.scale = new Vec3(1, 1, 1);
    this.userData = {};
    this.name = '';
    this.visible = true;
  }
  add(child) { child.parent = this; this.children.push(child); return this; }
  clear() { for (const child of this.children) child.parent = null; this.children = []; }
  updateMatrixWorld() {}
  getWorldPosition(out) {
    out.set(this.position.x, this.position.y, this.position.z);
    let p = this.parent;
    while (p) { out.x += p.position.x; out.y += p.position.y; out.z += p.position.z; p = p.parent; }
    return out;
  }
  localToWorld(out) {
    out.x += this.position.x; out.y += this.position.y; out.z += this.position.z;
    let p = this.parent;
    while (p) { out.x += p.position.x; out.y += p.position.y; out.z += p.position.z; p = p.parent; }
    return out;
  }
}

class Group extends Node {}
class Mesh extends Node {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; this.isMesh = true; }
}
class BufferAttribute {
  constructor(array, itemSize, normalized = false) { this.array = array; this.itemSize = itemSize; this.normalized = normalized; this.count = array.length / itemSize; }
}
class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; this.groups = []; this.userData = {}; this.disposed = false; }
  setAttribute(name, attr) { this.attributes[name] = attr; return this; }
  setIndex(attr) { this.index = attr; return this; }
  clearGroups() { this.groups = []; }
  addGroup(start, count, materialIndex) { this.groups.push({ start, count, materialIndex }); }
  setDrawRange(start, count) { this.drawRange = { start, count }; }
  dispose() { this.disposed = true; }
}
class MeshStandardMaterial {
  constructor(params = {}) { Object.assign(this, params); this.userData = {}; this.disposed = false; }
  dispose() { this.disposed = true; }
}

const THREE = { Group, Mesh, BufferGeometry, BufferAttribute, MeshStandardMaterial, Vector3: Vec3 };

function packageFixture() {
  const id = 'character.human.pirate.teststudio';
  const asset = {
    id,
    kind: 'character',
    provider: 'studio-character',
    style: 'blocky-bighead-studio-v1',
    surfaceStyle: 'pbr-studio-v1',
    rig: 'studio-three-group-v1',
    metrics: { height: 1.8 },
    roles: { player: {} },
  };
  const sockets = Object.fromEntries(
    ['rightHand', 'leftHand', 'head', 'back', 'waist', 'vfxOrigin', 'attackOrigin', 'throwOrigin']
      .map(name => [name, { joint: 'handR', offset: [0, 0.2, 0] }]),
  );
  return {
    schema: 'pocket-character-runtime-v1',
    schemaVersion: '1.0.0',
    generatedBy: { product: 'fixture', studioVersion: '1.9.0', generatorVersion: '1.9.0', generatedAt: '2026-09-04T00:00:00Z' },
    target: { game: 'PocketMonster', assetEngine: 'asset-presentation', provider: 'studio-character', assetHandleContract: ['root', 'rig', 'play', 'update', 'anchor', 'bounds', 'setAppearance', 'dispose'] },
    manifest: { ...asset, name: 'Studio Test', contract: 'presentation-only' },
    catalogEntry: { ...asset },
    character: { look: { quality: 'high' } },
    sceneGraph: {
      schema: 'three-group-scenegraph-v1',
      root: {
        name: 'characterRoot', nodeType: 'group', visible: true,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0, 'XYZ'], scale: [1, 1, 1] },
        userData: {},
        children: [{
          name: 'right-hand-mesh', nodeType: 'mesh', visible: true,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0, 'XYZ'], scale: [1, 1, 1] },
          userData: { part: 'hand' }, castShadow: true, receiveShadow: true,
          geometry: {
            type: 'BufferGeometry',
            attributes: { position: { itemSize: 3, normalized: false, count: 3, arrayType: 'Float32Array', array: [0, 0, 0, 1, 0, 0, 0, 1, 0] } },
            index: { itemSize: 1, count: 3, arrayType: 'Uint16Array', array: [0, 1, 2] },
            groups: [], drawRange: { start: 0, count: 3 },
          },
          material: { type: 'MeshStandardMaterial', color: '#ff8844', roughness: 0.7, metalness: 0.1, opacity: 1, transparent: false, maps: {} },
          children: [],
        }],
      },
      stats: { nodes: 2, meshes: 1, vertices: 3, triangles: 1, externalTextureRefs: 0 },
    },
    rig: {
      architecture: 'THREE.Group', schema: 'studio-rig-v1', root: 'characterRoot',
      jointNames: ['handR'], jointBindings: { handR: { path: [0], nodeName: 'right-hand-mesh' } }, sockets,
    },
    animations: [{
      id: 'idle-1', name: 'Idle_Core', duration: 1, loop: true, interpolation: 'smooth',
      runtime: { state: 'idle', transition: { schema: 'core-transition-v1', studioVersion: '1.8.10', state: 'idle', allowedNext: ['walk'] } },
      keyframes: [
        { time: 0, joints: { handR: { position: [0, 0, 0], rotation: [0, 0, 0] } }, meta: { contact: { L: true, R: true } } },
        { time: 1, joints: { handR: { position: [1, 0, 0], rotation: [0, 0.2, 0] } }, meta: { contact: { L: true, R: true } } },
      ],
    }],
    animationIndex: [{ id: 'idle-1', name: 'Idle_Core', state: 'idle', duration: 1, loop: true }],
    acceptance: { coreAnimationQa: { version: '1.8.10', hard: 0, warn: 0, pass: 4, contracts: 1, total: 1 } },
    gameplayPolicy: { included: false, authority: 'server', forbiddenKeys: ['hp', 'atk'], strippedFields: 0 },
    transport: { format: 'single-json-envelope', extension: '.pocket-character.json', encoding: 'utf-8' },
    integrity: { algorithm: 'SHA-256', sha256: 'fixture', canonicalBytes: 100 },
    validation: { valid: true, errors: [], warnings: [] },
  };
}

resetCatalog(); resetOwnership(); resetStudioCharacterPackages();
const pkg = packageFixture();
const validation = validateStudioCharacterPackage(pkg);
assert.equal(validation.valid, true, validation.errors.join('; '));

const hpLeak = structuredClone(pkg); hpLeak.character.hpCurrent = 20;
assert.equal(validateStudioCharacterPackage(hpLeak).valid, false, 'hpCurrent leak must be rejected');
const badProvider = structuredClone(pkg); badProvider.catalogEntry.provider = 'procedural';
assert.equal(validateStudioCharacterPackage(badProvider).valid, false, 'provider mismatch must be rejected');
const noBindings = structuredClone(pkg); noBindings.rig.jointBindings = {};
assert.equal(validateStudioCharacterPackage(noBindings).valid, false, 'joint bindings are required');

const engine = createAssetEngine({ THREE });
engine.registerProvider('studio-character', createStudioCharacterProvider({ THREE }));
await installStudioCharacterPackage(engine, pkg);
const handle = engine.spawn(pkg.manifest.id, { role: 'player' });
assert.equal(handle.root.name, `studio-character:${pkg.manifest.id}`);
assert.ok(handle.rig.pivots.handR, 'handR binding must resolve');
assert.ok(handle.rig.pivots.handR.geometry.attributes.position.array instanceof Float32Array, 'position typed array must be restored');
assert.ok(handle.rig.pivots.handR.geometry.index.array instanceof Uint16Array, 'index typed array must be restored');

handle.play('idle', { restart: true });
handle.update(0.5);
assert.ok(handle.rig.pivots.handR.position.x > 0.45 && handle.rig.pivots.handR.position.x < 0.55, 'authored keyframe interpolation must run');
const anchor = handle.anchor('rightHand', new Vec3());
assert.ok(anchor.x > 0.45 && anchor.x < 0.55, 'socket follows animated joint');
assert.ok(anchor.y > 0.19 && anchor.y < 0.21, 'socket local offset applied');

const geometry = handle.rig.pivots.handR.geometry;
const material = handle.rig.pivots.handR.material;
handle.dispose();
assert.equal(geometry.disposed, true, 'owned geometry disposed');
assert.equal(material.disposed, true, 'owned material disposed');

console.log('V9.1 studio-character runtime provider gate passed');
