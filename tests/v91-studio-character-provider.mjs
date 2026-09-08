import assert from 'node:assert/strict';
import { createAssetEngine } from '../asset-presentation/engine.mjs';
import { resetCatalog } from '../asset-presentation/catalog.mjs';
import { resetOwnership } from '../asset-presentation/ownership.mjs';
import { createStudioCharacterProvider, findStudioCharacterClip } from '../asset-presentation/providers/studio-character.mjs';
import {
  installStudioCharacterPackage,
  inspectStudioCharacterMotionPack,
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
class Quaternion {
  constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
}

class Node {
  constructor() {
    this.children = [];
    this.parent = null;
    this.position = new Vec3();
    this.rotation = new Euler();
    this.quaternion = new Quaternion();
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
          material: {
            type: 'MeshStandardMaterial', color: '#ff8844', emissive: '#102030', emissiveIntensity: 0.2,
            roughness: 0.7, metalness: 0.1, opacity: 0.8, transparent: true, alphaTest: 0.1,
            side: 2, vertexColors: true, flatShading: true,
            maps: { map: { source: 'https://assets.example.test/studio-albedo.png' } },
          },
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
      id: 'idle-1', name: 'Idle_Breathing', duration: 1, loop: true, interpolation: 'smooth',
      runtime: { state: 'idle_breathing', motionClass: 'custom', transition: { schema: 'core-transition-v1', studioVersion: '1.8.10', state: 'idle_breathing', allowedNext: ['walk'] } },
      keyframes: [
        { time: 0, joints: { handR: { position: [0, 0, 0], rotation: [0, 0, 0] } }, meta: { contact: { L: true, R: true } } },
        { time: 1, joints: { handR: { position: [1, 0, 0], rotation: [0, 0.2, 0] } }, meta: { contact: { L: true, R: true } } },
      ],
    }, {
      id: 'walk-1', name: 'Walk_PoseLibrary', duration: 1, loop: true, interpolation: 'smooth',
      runtime: { state: 'walk_pose_library', motionClass: 'walk' },
      keyframes: [
        { time: 0, joints: { handR: { position: [0, 0, 0], rotation: [0, 0, 0] } } },
        { time: 1, joints: { handR: { position: [2, 0, 0], rotation: [0, 0.4, 0] } } },
      ],
    }, {
      id: 'run-1', name: 'Run_PoseLibrary', duration: 1, loop: true, interpolation: 'smooth',
      runtime: { state: 'run_poselibrary', motionClass: 'run' },
      keyframes: [{ time: 0, joints: { handR: { position: [0, 0, 0] } } }, { time: 1, joints: { handR: { position: [4, 0, 0] } } }],
    }, {
      id: 'hurt-1', name: 'Hit_React_Core', duration: 1, loop: false, interpolation: 'smooth',
      runtime: { state: 'hit_react', motionClass: 'action' },
      keyframes: [{ time: 0, joints: { handR: { position: [0, 0, 0] } } }, { time: 1, joints: { handR: { position: [-1, 0, 0] } } }],
    }, {
      id: 'skill-1', name: 'Skill_Cast_Core', duration: 1, loop: false, interpolation: 'smooth',
      runtime: { state: 'skill_cast_core', motionClass: 'action' },
      keyframes: [{ time: 0, joints: { handR: { position: [0, 0, 0] } } }, { time: 1, joints: { handR: { position: [5, 0, 0] } } }],
    }, {
      id: 'jump-1', name: 'Jump_Core', duration: 1, loop: false, interpolation: 'smooth',
      runtime: { state: 'jump_core', motionClass: 'custom' },
      keyframes: [{ time: 0, joints: { handR: { position: [0, 0, 0] } } }, { time: 1, joints: { handR: { position: [6, 0, 0] } } }],
    }, {
      id: 'attack-1', name: 'Attack_PoseLibrary', duration: 1, loop: false, interpolation: 'smooth',
      runtime: { state: 'attack_pose_library', motionClass: 'action' },
      keyframes: [
        { time: 0, joints: { handR: { position: [0, 0, 0], rotation: [0, 0, 0] } } },
        { time: 1, joints: { handR: { position: [3, 0, 0], rotation: [0, 0.6, 0] } } },
      ],
    }, {
      id: 'dead-1', name: 'Dead_Core', duration: 1, loop: false, interpolation: 'smooth',
      runtime: { state: 'dead', motionClass: 'action' },
      keyframes: [
        { time: 0, joints: { handR: { position: [0, 0, 0], scale: [1, 1, 1] } } },
        { time: 1, joints: { handR: { position: [0, -1, 0], scale: [1.2, .8, 1] } } },
      ],
    }],
    motionPack: {
      schema: 'pocket-motion-pack-v1', defaultAction: 'idle',
      actionMap: { idle: 'idle-1', walk: 'walk-1', run: 'run-1', attack: 'attack-1', skill: 'skill-1', hurt: 'hurt-1', dead: 'dead-1' },
    },
    animationIndex: [
      { id: 'idle-1', name: 'Idle_Breathing', state: 'idle_breathing', duration: 1, loop: true },
      { id: 'walk-1', name: 'Walk_PoseLibrary', state: 'walk_pose_library', duration: 1, loop: true },
      { id: 'attack-1', name: 'Attack_PoseLibrary', state: 'attack_pose_library', duration: 1, loop: false },
      { id: 'run-1', name: 'Run_PoseLibrary', state: 'run_poselibrary', duration: 1, loop: true },
      { id: 'hurt-1', name: 'Hit_React_Core', state: 'hit_react', duration: 1, loop: false },
      { id: 'skill-1', name: 'Skill_Cast_Core', state: 'skill_cast_core', duration: 1, loop: false },
      { id: 'jump-1', name: 'Jump_Core', state: 'jump_core', duration: 1, loop: false },
    ],
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
assert.equal(validation.motion.mode, 'canonical', 'fixture exports a canonical Engine-owned motion pack');
assert.equal(inspectStudioCharacterMotionPack(pkg).actionMap.attack, 'attack-1', 'attack maps to the explicit authored clip id');
const engineStateMapped = structuredClone(pkg);
engineStateMapped.motionPack = {
  schema: 'pocket-character-motion-pack-v1',
  actionMap: { idle: 'idle_breathing', walk: 'walk_pose_library', run: 'run_poselibrary', attack: 'attack_pose_library', skill: 'skill_cast_core', hurt: 'hit_react', dead: 'dead' },
};
assert.equal(validateStudioCharacterPackage(engineStateMapped).valid, true, 'current Engine state-based motion map is accepted');
assert.equal(inspectStudioCharacterMotionPack(engineStateMapped).actionMap.attack, 'attack-1', 'Engine state map resolves to the runtime clip id');
assert.equal(findStudioCharacterClip(pkg, 'idle')?.id, 'idle-1', 'idle resolves the Studio idle_breathing state');
assert.equal(findStudioCharacterClip(pkg, 'walk')?.id, 'walk-1', 'walk resolves the Studio pose-library state');
assert.equal(findStudioCharacterClip(pkg, 'run')?.id, 'run-1', 'run resolves the Studio pose-library state');
assert.equal(findStudioCharacterClip(pkg, 'attack-melee')?.id, 'attack-1', 'combat requests resolve the authored action class');
assert.equal(findStudioCharacterClip(pkg, 'hurt')?.id, 'hurt-1', 'hurt resolves the authored hit reaction');
assert.equal(findStudioCharacterClip(pkg, 'skill')?.id, 'skill-1', 'skill resolves the authored cast action');
assert.equal(findStudioCharacterClip(pkg, 'jump')?.id, 'jump-1', 'named authored custom actions resolve by state prefix');

const hpLeak = structuredClone(pkg); hpLeak.character.hpCurrent = 20;
assert.equal(validateStudioCharacterPackage(hpLeak).valid, false, 'hpCurrent leak must be rejected');
const badProvider = structuredClone(pkg); badProvider.catalogEntry.provider = 'procedural';
assert.equal(validateStudioCharacterPackage(badProvider).valid, false, 'provider mismatch must be rejected');
const noBindings = structuredClone(pkg); noBindings.rig.jointBindings = {};
assert.equal(validateStudioCharacterPackage(noBindings).valid, false, 'joint bindings are required');
const emptyMesh = structuredClone(pkg); emptyMesh.sceneGraph.root.children[0].geometry.attributes.position.array = [];
assert.equal(validateStudioCharacterPackage(emptyMesh).valid, false, 'empty geometry must not replace a visible fallback');
const badIndex = structuredClone(pkg); badIndex.sceneGraph.root.children[0].geometry.index.array = [0, 1, 99];
assert.equal(validateStudioCharacterPackage(badIndex).valid, false, 'out-of-range geometry indices must be rejected');
const hiddenByScale = structuredClone(pkg); hiddenByScale.sceneGraph.root.transform.scale = [0, 1, 1];
assert.equal(validateStudioCharacterPackage(hiddenByScale).valid, false, 'zero-scale visual roots must be rejected');
const missingJointPath = structuredClone(pkg); missingJointPath.rig.jointBindings.handR.path = [99];
assert.equal(validateStudioCharacterPackage(missingJointPath).valid, false, 'joint bindings must resolve into the scene graph');
const missingSocketJoint = structuredClone(pkg); missingSocketJoint.rig.sockets.rightHand.joint = 'not-a-joint';
assert.equal(validateStudioCharacterPackage(missingSocketJoint).valid, false, 'sockets must reference declared joint bindings');
const badCanonicalMotion = structuredClone(pkg); badCanonicalMotion.motionPack.actionMap.attack = 'missing-attack';
assert.equal(validateStudioCharacterPackage(badCanonicalMotion).valid, false, 'canonical maps may not reference a missing clip');
const incompleteLiveMotion = structuredClone(pkg);
incompleteLiveMotion.manifest.id = incompleteLiveMotion.catalogEntry.id = 'character.human.pirate.studio-live';
delete incompleteLiveMotion.motionPack.actionMap.dead;
assert.equal(validateStudioCharacterPackage(incompleteLiveMotion).valid, false, 'default live player requires every canonical action');
const legacyPackage = structuredClone(pkg); delete legacyPackage.motionPack;
assert.equal(validateStudioCharacterPackage(legacyPackage).valid, true, 'older Studio packages remain semantic-fallback compatible');
assert.match(validateStudioCharacterPackage(legacyPackage).warnings.join(' '), /legacy Studio package/, 'legacy fallback is exposed in diagnostics');

const engine = createAssetEngine({ THREE });
engine.registerProvider('studio-character', createStudioCharacterProvider({ THREE }));
await installStudioCharacterPackage(engine, pkg);
const handle = engine.spawn(pkg.manifest.id, { role: 'player' });
assert.equal(handle.root.name, `studio-character:${pkg.manifest.id}`);
assert.ok(handle.rig.pivots.handR, 'handR binding must resolve');
assert.ok(handle.rig.pivots.handR.geometry.attributes.position.array instanceof Float32Array, 'position typed array must be restored');
assert.ok(handle.rig.pivots.handR.geometry.index.array instanceof Uint16Array, 'index typed array must be restored');
assert.equal(handle.rig.pivots.handR.castShadow, true, 'Studio mesh retains authored cast-shadow flag');
assert.equal(handle.rig.pivots.handR.receiveShadow, true, 'Studio mesh retains authored receive-shadow flag');
assert.equal(handle.rig.pivots.handR.material.emissive, '#102030', 'Studio PBR emissive survives scene reconstruction');
assert.equal(handle.rig.pivots.handR.material.roughness, 0.7, 'Studio PBR roughness survives scene reconstruction');
assert.equal(handle.rig.pivots.handR.material.metalness, 0.1, 'Studio PBR metalness survives scene reconstruction');
assert.equal(handle.rig.pivots.handR.material.opacity, 0.8, 'Studio opacity survives scene reconstruction');
assert.equal(handle.rig.pivots.handR.material.side, 2, 'Studio material side survives scene reconstruction');
assert.equal(handle.rig.pivots.handR.material.vertexColors, true, 'Studio vertex-color setting survives scene reconstruction');
assert.equal(handle.rig.pivots.handR.material.flatShading, true, 'Studio flat-shading setting survives scene reconstruction');
assert.equal(handle.rig.pivots.handR.material.userData.externalTextureRefs.map, 'https://assets.example.test/studio-albedo.png', 'external texture reference remains explicit for the host renderer');

handle.play('idle', { restart: true });
handle.update(0.5);
assert.ok(handle.rig.pivots.handR.position.x > 0.45 && handle.rig.pivots.handR.position.x < 0.55, 'authored keyframe interpolation must run');
const anchor = handle.anchor('rightHand', new Vec3());
assert.ok(anchor.x > 0.45 && anchor.x < 0.55, 'socket follows animated joint');
assert.ok(anchor.y > 0.19 && anchor.y < 0.21, 'socket local offset applied');
handle.play('walk', { restart: true });
handle.update(0.5);
assert.ok(handle.rig.pivots.handR.position.x > 0.95 && handle.rig.pivots.handR.position.x < 1.05, 'Studio pose-library walk resolves and samples in the consumer');
pkg.animations.find(clip => clip.id === 'walk-1').keyframes[0].joints.handR.scale = [1, 1, 1];
pkg.animations.find(clip => clip.id === 'walk-1').keyframes[1].joints.handR.scale = [2, 3, 4];
pkg.animations.find(clip => clip.id === 'walk-1').keyframes[0].joints.handR.quaternion = [0, 0, 0, 1];
pkg.animations.find(clip => clip.id === 'walk-1').keyframes[1].joints.handR.quaternion = [0, 0, 1, 0];
handle.play('walk', { restart: true });
handle.update(0.5);
assert.ok(handle.rig.pivots.handR.scale.x > 1.45 && handle.rig.pivots.handR.scale.x < 1.55, 'Studio scale tracks sample with the authored pose');
assert.ok(handle.rig.pivots.handR.quaternion.z > .69 && handle.rig.pivots.handR.quaternion.z < .72, 'Studio quaternion tracks slerp when Engine exports them');
for (const [action, id] of [['run', 'run-1'], ['attack-melee', 'attack-1'], ['hurt', 'hurt-1'], ['skill', 'skill-1'], ['jump', 'jump-1']]) {
  handle.play(action, { restart: true });
  assert.equal(handle.animationState.clipId, id, `${action} keeps its authored Studio clip identity`);
  assert.equal(handle.animationState.hasClip, true, `${action} does not report a false-green animation state`);
  handle.update(0.5);
}
handle.play('unknown-studio-action', { restart: true });
assert.equal(handle.animationState.hasClip, true, 'an unsupported request preserves the last visible authored pose');
assert.match(handle.animationState.lastResolveError, /unknown_studio_action/, 'unsupported action is visible in diagnostics');

const geometry = handle.rig.pivots.handR.geometry;
const material = handle.rig.pivots.handR.material;
handle.dispose();
assert.equal(geometry.disposed, true, 'owned geometry disposed');
assert.equal(material.disposed, true, 'owned material disposed');

console.log('V9.1 studio-character runtime provider gate passed');
