import { loadCatalog } from './catalog.mjs';
import { createAssetEngine } from './engine.mjs';
import { GROUND_REPEAT, paintGroundGrid, paintSkyGradient } from './blocky-ground.mjs';
import { createBigheadProvider } from './providers/procedural-bighead.mjs';
import { createBigheadMonsterProvider } from './providers/procedural-bighead-monster.mjs';
import { createPirateFruitActionTracker } from './pirate-fruit-action-adapter.mjs';
import { createPirateFruitRigRetargeter } from './pirate-fruit-rig-retarget.mjs';

/** Overlay Pocket visuals on the real Pirate Fruit client. Does not replace the world. */
export const PIRATE_FRUIT_CLIENT_BRIDGE = Object.freeze({
  id: 'pirate-fruit-client-bridge-v1',
  zone: 'pirate-fruit',
  source: 'pirate-fruit-offline',
  visual: 'pocket-asset-engine',
  presentationOnly: true,
  combatAuthority: false,
  createsStage: false,
});

export const PIRATE_FRUIT_MONSTER_VISUALS = Object.freeze({
  crab: 'monster.slime.aquapuff.bighead.v1',
  grunt: 'monster.plainpup.normalooze.bighead.v1',
  boss: 'monster.emberdrake.emberdrake.bighead.v1',
  'jungle-bandit': 'monster.mossbun.mossbun.bighead.v1',
  'ruin-guardian': 'monster.rockhorn.rockhorn.bighead.v1',
  'venom-ape-boss': 'monster.toxitoad.toxitoad.bighead.v1',
  'dune-scorpion': 'monster.sandmole.sandmole.bighead.v1',
  'desert-raider': 'monster.flameling.flameling.bighead.v1',
  'sand-golem': 'monster.rockhorn.rockhorn.bighead.v1',
  'sun-guardian-boss': 'monster.flameling.flameling.bighead.v1',
  'frost-crawler': 'monster.frostowl.frostowl.bighead.v1',
  'frost-raider': 'monster.frostowl.frostowl.bighead.v1',
  'crystal-golem': 'monster.ironbug.ironbug.bighead.v1',
  'frost-king-boss': 'monster.frostowl.frostowl.bighead.v1',
  'cloud-crab': 'monster.galebird.galebird.bighead.v1',
  'sky-raider': 'monster.galebird.galebird.bighead.v1',
  'storm-golem': 'monster.voltkit.voltkit.bighead.v1',
  'tempest-lord-boss': 'monster.voltkit.voltkit.bighead.v1',
  'lava-crawler': 'monster.flameling.flameling.bighead.v1',
  'ash-cultist': 'monster.voidhorn.voidhorn.bighead.v1',
  'obsidian-golem': 'monster.ironbug.ironbug.bighead.v1',
  'magma-titan-boss': 'monster.emberdrake.emberdrake.bighead.v1',
});

const REMOTE_APPEARANCES = Object.freeze([
  'appearance.human.player-orange.v1',
  'appearance.human.keeper-green.v1',
  'appearance.human.merchant-brown.v1',
  'appearance.human.trainer-blue.v1',
]);

const TERRAIN_PAINT = Object.freeze({
  'STARTER-ISLAND': Object.freeze({ color: 0xc2a36b, type: 'pirate' }),
  'MIST-JUNGLE': Object.freeze({ color: 0x3f6212, type: 'woods' }),
  'SUNSCAR-DESERT': Object.freeze({ color: 0xc4a574, type: 'rocky' }),
  'AZURE-FROST': Object.freeze({ color: 0xdbeafe, type: 'frozen' }),
  'TEMPEST-SKY': Object.freeze({ color: 0x64748b, type: 'city' }),
  'EMBER-VOLCANO': Object.freeze({ color: 0x7f1d1d, type: 'cave' }),
});

export function classifyPirateFruitNode(name = '') {
  const id = String(name || '');
  if (id === 'player:pirate-v1' || id === 'player:gameplay-root') return 'player';
  if (id.startsWith('remote-player')) return 'remote';
  if (id === 'character:hull') return 'npc';
  if (id.startsWith('monster:')) return 'monster';
  if (id.startsWith('PF_TERRAIN_')) return 'terrain';
  if (id.startsWith('boat:')) return 'boat';
  if (
    id.startsWith('effect:')
    || id.startsWith('equipment:')
    || id.startsWith('attachment:')
    || id.startsWith('skill-')
    || id.startsWith('player-rig:')
    || id.startsWith('rig:')
    || id.startsWith('socket:')
    || (id.startsWith('player:') && id !== 'player:pirate-v1' && id !== 'player:gameplay-root')
    || /portal|water|ocean|wake|foam|wave/i.test(id)
    || id.startsWith('PF_STATIC_BATCH_')
  ) return 'skip';
  if (id.startsWith('PF_ISLAND_')) return 'prop';
  return 'other';
}

function hasNamedDescendant(root, name, maxDepth = 4) {
  const queue = [[root, 0]];
  while (queue.length) {
    const [node, depth] = queue.shift();
    if (node !== root && node?.name === name) return true;
    if (depth >= maxDepth) continue;
    for (const child of node?.children || []) queue.push([child, depth + 1]);
  }
  return false;
}

/** Classify a live node, including unnamed top-level NPC hosts in the Vite client. */
export function pirateFruitKindForNode(node) {
  const named = classifyPirateFruitNode(node?.name);
  if (named !== 'other') return named;
  const topLevel = node?.parent?.isScene || node?.parent?.type === 'Scene';
  if (topLevel && !node?.name && hasNamedDescendant(node, 'rig:root')) return 'npc';
  return 'other';
}

/** Resolve a mesh/rig node to the whole entity root used by the overlay. */
export function resolvePirateVisualHost(node) {
  let current = node;
  let top = node;
  while (current) {
    const kind = pirateFruitKindForNode(current);
    const legacyHull = current?.name === 'character:hull';
    if (!legacyHull && (kind === 'player' || kind === 'remote' || kind === 'npc' || kind === 'monster')) return current;
    top = current;
    if (current.parent?.isScene || current.parent?.type === 'Scene') break;
    current = current.parent;
  }
  return pirateFruitKindForNode(top) === 'npc' ? top : null;
}

export function pocketMonsterIdFor(name = '') {
  const raw = String(name).replace(/^monster:/, '');
  return PIRATE_FRUIT_MONSTER_VISUALS[raw] || 'monster.slime.normalooze.bighead.v1';
}

function positiveDuration(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isClearlyRangedLoadout(loadout) {
  const state = loadout?.state;
  const values = [state?.activeSet, state?.equippedWeaponKind, state?.equippedFightingStyleId];
  return values.some(value => /(?:^|[-_\s])(gun|ranged|pistol|rifle|musket|flintlock|bow|crossbow)(?:$|[-_\s])/i.test(String(value || '')));
}

/** Normalize live Pirate Fruit combat state without mutating its runtime owner. */
export function pirateFruitActionSignalFromCombat(combat) {
  if (!combat || typeof combat !== 'object') return null;
  const combatState = String(combat.combatState || '');

  if (combatState === 'dead' || (Number.isFinite(combat.controller?.hp) && combat.controller.hp <= 0)) {
    return { dead: true, action: 'dead', token: 'dead', duration: 1 };
  }

  if (
    Number.isFinite(combat.damageReactionSerial)
    && combat.damageReactionSerial > 0
    && Number.isFinite(combat.timeSinceDamaged)
    && combat.timeSinceDamaged < 0.3
  ) {
    return { action: 'hurt', token: `hurt:${combat.damageReactionSerial}`, duration: 0.3 };
  }

  if (combatState === 'casting' || combat.pendingCast) {
    return {
      action: 'skill',
      token: combat.pendingCast || 'casting',
      duration: positiveDuration(combat.skillVisualDuration, 0.8),
    };
  }

  if (/^attack/.test(combatState) || combat.swing) {
    const swing = combat.swing;
    return {
      action: isClearlyRangedLoadout(combat.loadout) ? 'attack-ranged' : 'attack-melee',
      token: swing || combatState,
      duration: positiveDuration(
        swing?.duration ?? swing?.totalDuration ?? swing?.attackDuration ?? swing?.timer,
        0.45,
      ),
    };
  }

  return null;
}

/** Apply one sampled action edge while safely unlocking a dead visual. */
export function applyPirateFruitActionTransition(handle, previousAction, sample) {
  if (previousAction === 'dead' && sample?.action !== 'dead') {
    handle?.play?.('idle', { force: true });
  }
  if (sample?.actionId != null && sample?.action != null) {
    handle?.play?.(sample.action, { duration: sample.duration });
  }
}

function srcOf(value) {
  try { return Function.prototype.toString.call(value); } catch { return ''; }
}

function ownProto(value, name) {
  try { return !!Object.getOwnPropertyDescriptor(value?.prototype || {}, name); } catch { return false; }
}

export function threeFromPirateFruitVendor(vendor) {
  const find = pred => {
    for (const value of Object.values(vendor || {})) {
      if (typeof value === 'function' && pred(value, srcOf(value))) return value;
    }
    return null;
  };
  const WebGLRenderer = find((_v, src) => src.includes('isWebGLRenderer') || src.includes('THREE.WebGLRenderer'));
  const Object3D = find((v, _src) => ownProto(v, 'updateMatrixWorld') && ownProto(v, 'traverse') && ownProto(v, 'add'));
  const Group = find((_v, src) => src.includes('isGroup=!0'));
  const Mesh = find((v, src) => src.includes('isMesh=!0') && ownProto(v, 'raycast'));
  const BoxGeometry = find((_v, src) => src.includes('BoxGeometry') && !src.includes('isWebGLRenderer'));
  const MeshStandardMaterial = find((_v, src) => src.includes('isMeshStandardMaterial') && !src.includes('isWebGLRenderer'));
  const MeshBasicMaterial = find((_v, src) => src.includes('isMeshBasicMaterial') && !src.includes('isWebGLRenderer'));
  const CanvasTexture = find((_v, src) => src.includes('isCanvasTexture'));
  const Scene = find((_v, src) => src.includes('isScene=!0'));
  if (!Object3D || !Group || !Mesh || !BoxGeometry || !MeshStandardMaterial) {
    throw new Error('Pocket bridge could not resolve Three constructors from the Pirate Fruit vendor');
  }
  return {
    WebGLRenderer,
    Object3D,
    Scene,
    Group,
    Mesh,
    BoxGeometry,
    MeshStandardMaterial,
    MeshBasicMaterial,
    CanvasTexture,
  };
}

function canvasTexFromRgba(THREE, img, { nearest = true } = {}) {
  if (!THREE.CanvasTexture || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const data = ctx.createImageData(img.width, img.height);
  data.data.set(img.rgba);
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  if (nearest) {
    tex.magFilter = 1003;
    tex.minFilter = 1003;
    tex.generateMipmaps = false;
  }
  tex.needsUpdate = true;
  tex.colorSpace = 'srgb';
  return tex;
}

export function shouldPreservePirateSubtree(node) {
  const id = String(node?.name || '');
  return !!node?.isSprite
    || /^(effect:|equipment:|attachment:|skill-|socket:)/.test(id)
    || /(?:^|[-_:])(hp|health)(?:$|[-_:])/i.test(id)
    || /portal|water|ocean|wake|foam|wave/i.test(id);
}

function hiddenMaterial(material) {
  if (Array.isArray(material)) return material.map(entry => hiddenMaterial(entry));
  const next = material?.clone?.() || material;
  if (next) next.visible = false;
  return next;
}

export function hidePirateFruitOriginalMeshes(root, keep = new Set()) {
  function hide(node, isRoot = false) {
    if (!node || keep.has(node) || node.userData?.pocketVisual) return;
    if (!isRoot && shouldPreservePirateSubtree(node)) return;
    if (node.isMesh) {
      if (isRoot) node.material = hiddenMaterial(node.material);
      else node.visible = false;
    }
    for (const child of node.children || []) hide(child, false);
  }
  hide(root, true);
}

function appearanceFor(id) {
  let hash = 0;
  const text = String(id);
  for (let i = 0; i < text.length; i++) hash = (hash + text.charCodeAt(i) * (i + 1)) % REMOTE_APPEARANCES.length;
  return REMOTE_APPEARANCES[hash];
}

function propColor(name, mesh) {
  const id = String(name || '').toLowerCase();
  if (id.includes('leaf') || id.includes('tree') || id.includes('palm') || id.includes('bush')) return 0x18753a;
  if (id.includes('rock') || id.includes('stone')) return 0x6b5344;
  if (id.includes('lantern') || id.includes('light') || id.includes('lamp')) return 0xffe08a;
  if (id.includes('fence') || id.includes('post')) return 0x5b3a1a;
  if (id.includes('wood') || id.includes('dock') || id.includes('crate') || id.includes('boat') || id.includes('plank')) return 0x8b5a2b;
  const hex = mesh.material?.color?.getHex?.();
  return Number.isFinite(hex) ? hex : 0x78716c;
}

function remoteLocomotionFor(host, moving) {
  // Some parent world controllers annotate this presentation host; Pirate's
  // own RemotePlayers does not, so movement remains the safe fallback.
  const declared = host?.userData?.remoteLocomotion;
  if (declared === 'idle' || declared === 'walk' || declared === 'run' || declared === 'swim') {
    return declared;
  }
  return moving ? 'walk' : 'idle';
}

/** Convert Pocket's -Z player front to Pirate Fruit's +Z facing convention. */
export function orientPirateFruitVisual(root, kind) {
  if ((kind === 'player' || kind === 'remote') && root?.rotation) root.rotation.y = Math.PI;
  return root;
}

export async function installPirateFruitPocketPresentation({
  THREE,
  vendor,
} = {}) {
  const kit = THREE?.Group && THREE?.Mesh && THREE?.BoxGeometry ? THREE : threeFromPirateFruitVendor(vendor);
  const boxCache = new Map();
  const matCache = new Map();
  function box(w, h, d) {
    const key = `${w}:${h}:${d}`;
    if (!boxCache.has(key)) boxCache.set(key, new kit.BoxGeometry(w, h, d));
    return boxCache.get(key);
  }
  function material(color, rough = 0.78, metal = 0.06) {
    const key = `${color}:${rough}:${metal}`;
    if (!matCache.has(key)) matCache.set(key, new kit.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
    return matCache.get(key);
  }
  const engineThree = {
    Group: kit.Group,
    Mesh: kit.Mesh,
    BoxGeometry: kit.BoxGeometry,
    MeshStandardMaterial: kit.MeshStandardMaterial,
    MeshBasicMaterial: kit.MeshBasicMaterial || kit.MeshStandardMaterial,
    CanvasTexture: kit.CanvasTexture,
    SRGBColorSpace: 'srgb',
    NearestFilter: 1003,
    RepeatWrapping: 1000,
  };

  const assets = createAssetEngine({ THREE: engineThree, quality: 'medium' });
  const humanoidRes = await fetch(new URL('../assets/catalog/humanoid-core.json', import.meta.url));
  if (!humanoidRes.ok) throw new Error('โหลด humanoid catalog ไม่สำเร็จ');
  loadCatalog(await humanoidRes.json());
  for (const file of ['monster-slimes.json', 'monster-animals.json']) {
    const res = await fetch(new URL(`../assets/catalog/${file}`, import.meta.url));
    if (!res.ok) throw new Error('โหลด monster catalog ไม่สำเร็จ');
    await assets.preloadBundle(file, await res.json());
  }
  const { createPirateFruitPlayerProvider } = await import('./providers/pirate-fruit-player.mjs');
  assets.registerProvider('pirate-fruit', createPirateFruitPlayerProvider({
    THREE: engineThree,
    box,
    material,
  }));
  const humanoidProvider = createBigheadProvider({ THREE: engineThree, box, material });
  const monsterProvider = createBigheadMonsterProvider({
    THREE: engineThree,
    box,
    material,
    basicMaterial: color => material(color, 1, 0),
  });
  assets.registerProvider('procedural', ctx => ctx.def?.kind === 'monster' ? monsterProvider(ctx) : humanoidProvider(ctx));

  const attached = new WeakSet();
  const visuals = [];

  function attachVisual(host, handle, kind) {
    handle.root.userData.pocketVisual = true;
    handle.root.userData.presentationOnly = true;
    handle.root.userData.combatAuthority = false;
    handle.root.userData.pocketKind = kind;
    orientPirateFruitVisual(handle.root, kind);
    host.add(handle.root);
    hidePirateFruitOriginalMeshes(host, new Set([handle.root]));
    attached.add(host);
    const actionTracker = kind === 'player' ? createPirateFruitActionTracker() : null;
    const rigRetargeter = kind === 'player' || kind === 'remote'
      ? createPirateFruitRigRetargeter(host, handle.rig, {
        sourceRootName: 'player-rig:root',
        targetRoot: handle.root,
        sourceRestMode: 'bind',
      })
      : null;
    visuals.push({
      host,
      handle,
      kind,
      actionTracker,
      rigRetargeter,
      lastAction: null,
      lastX: host.position.x,
      lastZ: host.position.z,
    });
    return handle;
  }

  function paintTerrain(mesh) {
    if (mesh.userData.pocketTerrain) return;
    const key = String(mesh.name || '').replace(/^PF_TERRAIN_/, '');
    const paint = TERRAIN_PAINT[key] || { color: 0xc2a36b, type: 'pirate' };
    const tex = canvasTexFromRgba(engineThree, paintGroundGrid(paint.color, paint.type));
    mesh.material = tex
      ? new kit.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 1 })
      : new kit.MeshStandardMaterial({ color: paint.color, roughness: 1 });
    if (tex) {
      tex.wrapS = tex.wrapT = 1000;
      tex.repeat?.set?.(GROUND_REPEAT, GROUND_REPEAT);
    }
    mesh.userData.pocketTerrain = true;
    mesh.userData.surfaceStyle = 'four-side-block-v1';
  }

  function boxifyProp(mesh) {
    if (mesh.userData.pocketBoxed || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox?.();
    const bb = mesh.geometry.boundingBox;
    if (!bb) return;
    const w = Math.max(0.12, Math.abs(bb.max.x - bb.min.x));
    const h = Math.max(0.12, Math.abs(bb.max.y - bb.min.y));
    const d = Math.max(0.12, Math.abs(bb.max.z - bb.min.z));
    const overlay = new kit.Mesh(box(w, h, d), material(propColor(mesh.name, mesh)));
    overlay.position.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2);
    overlay.userData.pocketVisual = true;
    overlay.userData.pocketBoxed = true;
    mesh.add(overlay);
    mesh.userData.pocketBoxed = true;
    if (mesh.isMesh) mesh.material = mesh.material?.clone?.() || mesh.material;
    if (mesh.material) mesh.material.visible = false;
  }

  function visit(root) {
    if (!root || root.userData?.pocketVisual) return;
    const kind = pirateFruitKindForNode(root);
    if (kind === 'player' && root.name === 'player:pirate-v1' && !attached.has(root)) {
      attachVisual(root, assets.spawn('character.human.pirate-fruit.v1', {
        role: 'player',
        appearanceId: 'appearance.human.player-orange.v1',
      }), 'player');
      return;
    }
    if (kind === 'remote' && !attached.has(root)) {
      attachVisual(root, assets.spawn('character.human.pirate-fruit.v1', {
        role: 'player',
        appearanceId: 'appearance.human.player-orange.v1',
      }), 'remote');
      return;
    }
    if (kind === 'npc' && !attached.has(root)) {
      attachVisual(root, assets.spawn('character.human.blocky-bighead.v1', {
        role: 'trainer',
        appearanceId: appearanceFor(root.name || 'npc'),
      }), 'npc');
      return;
    }
    if (kind === 'monster' && !attached.has(root)) {
      attachVisual(root, assets.spawn(pocketMonsterIdFor(root.name), { role: 'wild' }), 'monster');
      return;
    }
    if (kind === 'terrain' && root.isMesh) paintTerrain(root);
    else if ((kind === 'prop' || kind === 'boat') && root.isMesh) boxifyProp(root);
    for (const child of root.children || []) visit(child);
  }

  function paintSky(scene) {
    if (scene.userData.pocketSky) return;
    const tex = canvasTexFromRgba(engineThree, paintSkyGradient(0x4f9ec9), { nearest: false });
    if (tex) scene.background = tex;
    scene.userData.pocketSky = true;
  }

  let last = performance.now();
  let scanAt = 0;
  function update(scene) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    paintSky(scene);
    if (now >= scanAt) {
      visit(scene);
      scanAt = now + 400;
    }
    for (const item of visuals) {
      const dx = item.host.position.x - item.lastX;
      const dz = item.host.position.z - item.lastZ;
      const distanceSq = dx * dx + dz * dz;
      const moving = distanceSq > 0.00002;
      item.lastX = item.host.position.x;
      item.lastZ = item.host.position.z;
      if (!item.actionTracker) {
        item.handle.update?.(dt, {
          moving,
          locomotion: item.kind === 'remote' ? remoteLocomotionFor(item.host, moving) : undefined,
        });
        item.rigRetargeter?.update();
        continue;
      }

      const combat = globalThis.__combat;
      const liveSpeed = combat?.controller?.moveState?.speed;
      const speed = Number.isFinite(liveSpeed) && liveSpeed >= 0
        ? liveSpeed
        : (dt > 0 ? Math.sqrt(distanceSq) / dt : 0);
      const signal = pirateFruitActionSignalFromCombat(combat);
      const sample = item.actionTracker.sample(
        { userData: { pocketActionSignal: signal } },
        now,
        { distanceSq, speed },
      );
      applyPirateFruitActionTransition(item.handle, item.lastAction, sample);
      item.lastAction = sample.action;
      item.handle.update?.(dt, { moving, locomotion: sample.locomotion });
      item.rigRetargeter.update();
    }
  }

  return {
    assets,
    update,
    visit,
    diagnostics: () => ({
      ...PIRATE_FRUIT_CLIENT_BRIDGE,
      attached: visuals.length,
      rigRetargeted: visuals.filter(item => item.rigRetargeter).length,
      actionDriven: visuals.filter(item => item.actionTracker).length,
      providers: assets.diagnostics().providers,
    }),
  };
}

export function hookPirateFruitRenderer(vendor) {
  const kit = threeFromPirateFruitVendor(vendor);
  const original = kit.Object3D.prototype.updateMatrixWorld;
  if (original.__pocketPirateBridge) return original.__pocketPirateBridge;
  let session = null;
  let pending = null;
  function publishBridgeState() {
    if (!session || typeof window === 'undefined') return;
    window.POCKETMONSTER_PIRATE_FRUIT_BRIDGE = Object.freeze({
      ...session.diagnostics(),
      updatedAt: Date.now(),
    });
  }
  function ensureSession() {
    if (pending || session) return;
    pending = installPirateFruitPocketPresentation({ THREE: kit, vendor })
      .then(next => {
        session = next;
        publishBridgeState();
      })
      .catch(err => {
        pending = null;
        console.warn('Pocket Pirate Fruit presentation failed', err);
      });
  }
  function updateMatrixWorld(force) {
    if (this?.isScene) {
      ensureSession();
      if (session) {
        session.update(this);
        publishBridgeState();
      }
    }
    return original.call(this, force);
  }
  const info = Object.freeze({
    hooked: true,
    renderer: 'pirate-fruit-vendor-three',
    hook: 'object3d-updateMatrixWorld',
    ...PIRATE_FRUIT_CLIENT_BRIDGE,
  });
  updateMatrixWorld.__pocketPirateBridge = info;
  kit.Object3D.prototype.updateMatrixWorld = updateMatrixWorld;
  if (typeof window !== 'undefined') {
    window.POCKETMONSTER_PIRATE_FRUIT_BRIDGE_HOOK = info;
  }
  return info;
}
