const MAX_REMOTE_PLAYERS = 100;

function disposeAvatar(root) {
  const geometries = new Set();
  const materials = new Set();
  root?.traverse?.(node => {
    if (node.geometry) geometries.add(node.geometry);
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of nodeMaterials) {
      if (material) materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
  root?.parent?.remove?.(root);
}

function avatarColor(id) {
  let hash = 2166136261;
  for (const character of String(id)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return 0x38bdf8 ^ (hash >>> 8 & 0x3f3f3f);
}

function createDefaultRemoteAvatar(THREE, id) {
  if (!THREE?.Group || !THREE?.Mesh || !THREE?.BoxGeometry || !THREE?.MeshStandardMaterial) return null;
  const root = new THREE.Group();
  root.name = `remote-world-player:${id}`;
  root.userData.remoteWorldPlayerId = id;
  const primary = new THREE.MeshStandardMaterial({ color: avatarColor(id), roughness: .72, metalness: .04 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c7a5, roughness: .86, metalness: 0 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x172033, roughness: .82, metalness: .02 });
  const parts = [
    [new THREE.BoxGeometry(.64, .78, .36), primary, [0, 1.08, 0]],
    [new THREE.BoxGeometry(.46, .46, .42), skin, [0, 1.72, 0]],
    [new THREE.BoxGeometry(.18, .72, .2), dark, [-.18, .38, 0]],
    [new THREE.BoxGeometry(.18, .72, .2), dark, [.18, .38, 0]],
    [new THREE.BoxGeometry(.18, .72, .2), primary, [-.44, 1.08, 0]],
    [new THREE.BoxGeometry(.18, .72, .2), primary, [.44, 1.08, 0]],
  ];
  for (const [geometry, material, position] of parts) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}

export function createWorldPresenceController({
  THREE,
  scene,
  getCamera,
  getZone,
  getHeightAt = () => 0,
  createAvatar = id => createDefaultRemoteAvatar(THREE, id),
} = {}) {
  const remoteWorldPlayers = new Map();
  let remoteWorldLayer = null;
  if (typeof document !== 'undefined') {
    remoteWorldLayer = document.getElementById('remoteWorldPlayers');
    if (!remoteWorldLayer) {
      remoteWorldLayer = document.createElement('div');
      remoteWorldLayer.id = 'remoteWorldPlayers';
      Object.assign(remoteWorldLayer.style, { position: 'fixed', inset: '0', zIndex: '14000', pointerEvents: 'none' });
      document.body.append(remoteWorldLayer);
    }
  }

  function removeRemote(id) {
    const remote = remoteWorldPlayers.get(id);
    if (!remote) return;
    remote.marker?.remove?.();
    disposeAvatar(remote.avatar);
    remoteWorldPlayers.delete(id);
  }

  function acceptSnapshot(payload) {
    if (!payload || payload.zone !== getZone?.() || !Array.isArray(payload.players)) return false;
    const seen = new Set();
    for (const item of payload.players.slice(0, MAX_REMOTE_PLAYERS)) {
      if (!item?.id || !Number.isFinite(item.x) || !Number.isFinite(item.z)) continue;
      const id = String(item.id);
      seen.add(id);
      let remote = remoteWorldPlayers.get(id);
      if (!remote) {
        const marker = typeof document !== 'undefined' ? document.createElement('div') : null;
        if (marker) {
          marker.className = 'remote-world-player';
          Object.assign(marker.style, {
            position: 'absolute',
            transform: 'translate(-50%,-100%)',
            padding: '3px 7px',
            border: '1px solid #67e8f9',
            borderRadius: '999px',
            background: '#082f49e8',
            color: '#e0f2fe',
            font: '700 11px system-ui',
            whiteSpace: 'nowrap',
            textShadow: '0 1px 2px #000',
          });
          remoteWorldLayer?.append(marker);
        }
        const avatar = scene ? createAvatar(id, item) : null;
        if (avatar) scene.add(avatar);
        remote = { marker, avatar, targetX: item.x, targetY: 0, targetZ: item.z, targetDir: 0, locomotion: 'idle', animation: null, animationPhase: 0 };
        remoteWorldPlayers.set(id, remote);
      }
      const y = Number(getHeightAt?.(item.x, item.z));
      remote.targetX = item.x;
      remote.targetY = Number.isFinite(y) ? y : 0;
      remote.targetZ = item.z;
      remote.targetDir = Number.isFinite(item.dir) ? item.dir : 0;
      remote.locomotion = typeof item.locomotion === 'string' ? item.locomotion : 'idle';
      remote.animation = item.animation && typeof item.animation === 'object' ? item.animation : null;
      if (remote.marker) {
        remote.marker.textContent = item.name || 'ผู้เล่นออนไลน์';
        remote.marker.dataset.x = item.x;
        remote.marker.dataset.y = remote.targetY;
        remote.marker.dataset.z = item.z;
      }
      if (remote.avatar && remote.avatar.userData?.presenceInitialized !== true) {
        remote.avatar.position.set(remote.targetX, remote.targetY, remote.targetZ);
        remote.avatar.rotation.y = remote.targetDir;
        remote.avatar.userData.presenceInitialized = true;
      }
    }
    for (const id of [...remoteWorldPlayers.keys()]) if (!seen.has(id)) removeRemote(id);
    return true;
  }

  function update() {
    const camera = getCamera?.();
    for (const remote of remoteWorldPlayers.values()) {
      const avatar = remote.avatar;
      if (avatar) {
        avatar.position.x += (remote.targetX - avatar.position.x) * .35;
        avatar.position.y += (remote.targetY - avatar.position.y) * .35;
        avatar.position.z += (remote.targetZ - avatar.position.z) * .35;
        const turn = Math.atan2(Math.sin(remote.targetDir - avatar.rotation.y), Math.cos(remote.targetDir - avatar.rotation.y));
        avatar.rotation.y += turn * .35;
        remote.animationPhase += .1;
        const moving = remote.locomotion === 'walk' || remote.locomotion === 'run' || remote.locomotion === 'swim' || remote.locomotion === 'dash';
        const combatState = remote.animation?.combatState || 'idle';
        avatar.userData.remoteLocomotion = remote.locomotion;
        avatar.userData.remoteAnimation = remote.animation;
        const bob = moving ? Math.sin(remote.animationPhase * 8) * .035 : 0;
        avatar.position.y += (remote.targetY + bob - avatar.position.y) * .35;
        const actionLean = combatState === 'attack' || combatState === 'skill' ? Math.sin(remote.animationPhase * 12) * .12 : combatState === 'hurt' ? -.12 : 0;
        avatar.rotation.z += (actionLean - avatar.rotation.z) * .35;
      }
      if (!remote.marker || !camera || !THREE?.Vector3) continue;
      const x = avatar?.position?.x ?? remote.targetX;
      const y = (avatar?.position?.y ?? remote.targetY) + 2.05;
      const z = avatar?.position?.z ?? remote.targetZ;
      const point = new THREE.Vector3(x, y, z).project(camera);
      const visible = point.z > -1 && point.z < 1 && point.x >= -1.1 && point.x <= 1.1 && point.y >= -1.1 && point.y <= 1.1;
      remote.marker.hidden = !visible;
      if (visible) {
        remote.marker.style.left = ((point.x + 1) * 50) + '%';
        remote.marker.style.top = ((1 - point.y) * 50) + '%';
      }
    }
  }

  function dispose() {
    for (const id of [...remoteWorldPlayers.keys()]) removeRemote(id);
    remoteWorldLayer?.remove?.();
    remoteWorldLayer = null;
  }

  function diagnostics() {
    return Object.freeze({
      remotePlayers: remoteWorldPlayers.size,
      avatars: [...remoteWorldPlayers.values()].filter(remote => remote.avatar).length,
    });
  }

  return Object.freeze({ acceptSnapshot, update, dispose, diagnostics });
}

export function installWorldPresence(options = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (typeof window.POCKETMONSTER_WORLD_PRESENCE === 'function') return () => {};
  const controller = createWorldPresenceController(options);
  window.POCKETMONSTER_WORLD_PRESENCE = payload => controller.acceptSnapshot(payload);
  const timer = setInterval(() => controller.update(), 100);
  return () => {
    clearInterval(timer);
    if (window.POCKETMONSTER_WORLD_PRESENCE) delete window.POCKETMONSTER_WORLD_PRESENCE;
    controller.dispose();
  };
}

export function publishWorldState({ getZone, getPosition, getDir } = {}) {
  if (typeof window === 'undefined') return;
  window.POCKETMONSTER_WORLD_STATE = () => {
    const zone = getZone?.();
    const pos = getPosition?.();
    const dir = getDir?.();
    if (!zone || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
    if (dir !== undefined && !Number.isFinite(dir)) return null;
    return { zone, x: pos.x, z: pos.z, dir: dir ?? 0 };
  };
}
