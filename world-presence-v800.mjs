import {
  MAX_REMOTE_PLAYERS,
  buildWorldPosFrame,
  currentSelfPresenceId,
  isRemoteWorldPlayer,
  sanitizeOnlineWorldSnapshot,
} from './world-presence-protocol.mjs?v=2';

const DEFAULT_REMOTE_ANIMATION = Object.freeze({
  combatState: 'idle',
  category: 'style',
  onGround: true,
  dashing: false,
  verticalVelocity: 0,
});

function actionIdentity(animation) {
  if (!animation?.actionSessionId || !Number.isInteger(animation.actionSequence)) return null;
  return `${animation.actionSessionId}:${animation.actionSequence}`;
}

function actionLifetimeMs(animation) {
  return Math.max(250, Number.isInteger(animation?.actionDurationMs) ? animation.actionDurationMs : 0);
}

function updateRemoteAnimator(remote, deltaSeconds) {
  const animator = remote.avatar?.userData?.remoteAnimator
    || remote.avatar?.userData?.animator
    || remote.avatar?.userData?.animationController;
  if (!animator) return;
  const state = Object.freeze({
    ...(remote.animation || DEFAULT_REMOTE_ANIMATION),
    locomotion: remote.locomotion,
  });
  try {
    if (typeof animator.update === 'function') animator.update(deltaSeconds, state);
    else if (typeof animator.setState === 'function') animator.setState(state);
  } catch {}
}

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
  const [body, head, leftLeg, rightLeg, leftArm, rightArm] = root.children;
  let animationTime = 0;
  root.userData.remoteAnimator = {
    update(deltaSeconds, state) {
      animationTime += Math.max(0, Number(deltaSeconds) || 0);
      const moving = state?.locomotion === 'walk'
        || state?.locomotion === 'run'
        || state?.locomotion === 'swim';
      const combatState = state?.combatState || 'idle';
      const attacking = combatState === 'attack1'
        || combatState === 'attack2'
        || combatState === 'attack3'
        || combatState === 'attack4';
      const casting = combatState === 'casting';
      const blocking = combatState === 'blocking';
      const stunned = combatState === 'stunned' || combatState === 'knockback';
      const verticalVelocity = Number(state?.verticalVelocity) || 0;
      const jumping = state?.onGround === false && verticalVelocity > .5;
      const falling = state?.onGround === false && verticalVelocity < -.5;
      const landing = state?.onGround === true && Number.isInteger(state?.hitReactionId);
      const dashing = state?.dashing === true || state?.skillAnimationType === 'dash';
      const stride = moving ? Math.sin(animationTime * (state.locomotion === 'run' ? 14 : 9)) * .45 : 0;
      leftLeg.rotation.x = jumping ? -.55 : falling ? .65 : dashing ? -.22 : stride;
      rightLeg.rotation.x = jumping ? -.55 : falling ? .65 : dashing ? -.22 : -stride;
      leftArm.rotation.x = jumping ? -.4 : falling ? .45 : dashing ? -.5 : -stride * .72;
      rightArm.rotation.x = jumping ? -.4 : falling ? .45 : dashing ? -.5 : stride * .72;
      body.rotation.x = jumping ? -.16 : falling ? .18 : landing ? .16 : dashing ? .1 : 0;
      body.rotation.z = attacking ? Math.sin(animationTime * 18) * .18 : casting ? -.14 : dashing ? .2 : 0;
      leftArm.rotation.z = attacking ? -.8 : casting ? -.55 : blocking ? -.35 : 0;
      rightArm.rotation.z = attacking ? .8 : casting ? .55 : blocking ? .35 : 0;
      head.rotation.z = stunned ? Math.sin(animationTime * 30) * .12 : 0;
      root.rotation.z = combatState === 'knockdown' || combatState === 'dead' ? -.9 : 0;
      root.rotation.x = jumping ? -.08 : falling ? .08 : 0;
      root.userData.remoteAnimationState = state;
    },
  };
  return root;
}

export function createWorldPresenceController({
  THREE,
  scene,
  getCamera,
  getZone,
  getHeightAt = () => 0,
  createAvatar = id => createDefaultRemoteAvatar(THREE, id),
  getSelfId,
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

  function clear() {
    for (const id of [...remoteWorldPlayers.keys()]) removeRemote(id);
  }

  function applyAnimation(remote, animation, now) {
    const identity = actionIdentity(animation);
    if (!identity) {
      remote.animation = animation;
      remote.actionIdentity = null;
      remote.actionExpiresAt = 0;
      return;
    }
    if (remote.expiredActionIdentity === identity) return;
    if (remote.retiredActionSessions.has(animation.actionSessionId)) return;
    if (remote.actionSessionId !== animation.actionSessionId) {
      if (remote.actionSessionId) {
        remote.retiredActionSessions.add(remote.actionSessionId);
        while (remote.retiredActionSessions.size > 8) {
          const oldest = remote.retiredActionSessions.values().next().value;
          if (!oldest) break;
          remote.retiredActionSessions.delete(oldest);
        }
      }
      remote.actionSessionId = animation.actionSessionId;
      remote.actionHighestSequence = animation.actionSequence;
    } else if (animation.actionSequence < remote.actionHighestSequence) {
      return;
    } else if (animation.actionSequence > remote.actionHighestSequence) {
      remote.actionHighestSequence = animation.actionSequence;
    }
    remote.animation = animation;
    remote.actionIdentity = identity;
    remote.actionExpiresAt = now + actionLifetimeMs(animation);
  }

  function expireAnimation(remote, now) {
    if (!remote.actionIdentity || now < remote.actionExpiresAt) return;
    remote.expiredActionIdentity = remote.actionIdentity;
    remote.actionIdentity = null;
    remote.actionExpiresAt = 0;
    remote.animation = DEFAULT_REMOTE_ANIMATION;
  }

  function acceptSnapshot(payload) {
    const snapshot = sanitizeOnlineWorldSnapshot(payload, getZone?.());
    if (!snapshot) return false;
    const selfId = getSelfId?.() ?? currentSelfPresenceId();
    const seen = new Set();
    const now = Date.now();
    for (const item of snapshot.players.slice(0, MAX_REMOTE_PLAYERS)) {
      if (!isRemoteWorldPlayer(item, selfId)) continue;
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
        remote = {
          marker,
          avatar,
          targetX: item.x,
          targetY: 0,
          targetZ: item.z,
          targetDir: 0,
          locomotion: 'idle',
          animation: null,
          actionIdentity: null,
          actionExpiresAt: 0,
          expiredActionIdentity: null,
          actionSessionId: null,
          actionHighestSequence: 0,
          retiredActionSessions: new Set(),
          animationPhase: 0,
        };
        remoteWorldPlayers.set(id, remote);
      }
      const y = Number(getHeightAt?.(item.x, item.z));
      remote.targetX = item.x;
      remote.targetY = Number.isFinite(y) ? y : 0;
      remote.targetZ = item.z;
      remote.targetDir = Number.isFinite(item.dir) ? item.dir : 0;
      remote.locomotion = typeof item.locomotion === 'string' ? item.locomotion : 'idle';
      applyAnimation(remote, item.animation, now);
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

  function update(deltaSeconds = 0.1) {
    const camera = getCamera?.();
    const now = Date.now();
    for (const remote of remoteWorldPlayers.values()) {
      expireAnimation(remote, now);
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
        updateRemoteAnimator(remote, deltaSeconds);
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
    clear();
    remoteWorldLayer?.remove?.();
    remoteWorldLayer = null;
  }

  function diagnostics() {
    return Object.freeze({
      remotePlayers: remoteWorldPlayers.size,
      avatars: [...remoteWorldPlayers.values()].filter(remote => remote.avatar).length,
    });
  }

  return Object.freeze({ acceptSnapshot, clear, update, dispose, diagnostics });
}

export function installWorldPresence(options = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (typeof window.POCKETMONSTER_WORLD_PRESENCE === 'function') return () => {};
  const controller = createWorldPresenceController(options);
  window.POCKETMONSTER_WORLD_PRESENCE = payload => controller.acceptSnapshot(payload);
  const onSocketStatus = event => {
    if (event?.detail?.connected !== true) controller.clear();
  };
  const canListenForSocketStatus = typeof window.addEventListener === 'function';
  if (canListenForSocketStatus) window.addEventListener('pocketmonster:world-socket-status', onSocketStatus);
  const timer = setInterval(() => controller.update(0.1), 100);
  return () => {
    clearInterval(timer);
    if (canListenForSocketStatus) window.removeEventListener('pocketmonster:world-socket-status', onSocketStatus);
    if (window.POCKETMONSTER_WORLD_PRESENCE) delete window.POCKETMONSTER_WORLD_PRESENCE;
    controller.dispose();
  };
}

export function publishWorldState({ getZone, getPosition, getDir } = {}) {
  if (typeof window === 'undefined') return;
  window.POCKETMONSTER_WORLD_STATE = () => {
    const pos = getPosition?.();
    const dir = getDir?.();
    return buildWorldPosFrame({
      zone: getZone?.(),
      x: pos?.x,
      y: pos?.y,
      z: pos?.z,
      dir: dir === undefined ? 0 : dir,
      locomotion: pos?.locomotion,
      animation: pos?.animation,
    });
  };
}
