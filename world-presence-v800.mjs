import {
  MAX_REMOTE_PLAYERS,
  MAX_REMOTE_ACTORS,
  buildWorldPosFrame,
  currentSelfPresenceId,
  isRemoteWorldPlayer,
  sanitizeOnlineWorldSnapshot,
} from './world-presence-protocol.mjs?v=4';

const DEFAULT_REMOTE_ANIMATION = Object.freeze({
  combatState: 'idle',
  category: 'style',
  onGround: true,
  dashing: false,
  verticalVelocity: 0,
});
function boundedApproach(current, target, factor = .35, maxStep = 5) {
  const delta = (target - current) * factor;
  return current + Math.max(-maxStep, Math.min(maxStep, delta));
}

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
  now = () => Date.now(),
  interpolationDelayMs = 100,
  createActor = null,
  onMonsterVisual = null,
} = {}) {
  const remoteWorldPlayers = new Map();
  const remoteActors = new Map();
  let remoteWorldLayer = null;
  let routeGenerationHighWater = null;
  const clockNow = () => {
    const value = typeof now === 'function' ? now() : Date.now();
    return Number.isFinite(value) ? value : Date.now();
  };
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
    for (const id of [...remoteActors.keys()]) removeActor(id);
    routeGenerationHighWater = null;
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

  function removeActor(actorId) {
    const actor = remoteActors.get(actorId);
    if (!actor) return;
    actor.handle?.dispose?.();
    actor.root?.parent?.remove?.(actor.root);
    remoteActors.delete(actorId);
  }

  function syncRemoteActors(items, selfId) {
    const incoming = Array.isArray(items) ? items.slice(0, MAX_REMOTE_ACTORS) : [];
    const seen = new Set();
    for (const item of incoming) {
      const id = String(item.actorId);
      if (selfId != null && selfId !== '' && String(item.ownerId || '').toLowerCase() === String(selfId).toLowerCase()) continue;
      seen.add(id);
      let actor = remoteActors.get(id);
      if (actor && item.spawnSequence < actor.spawnSequence) continue;
      if (actor && item.spawnSequence === actor.spawnSequence && item.stateSequence <= actor.stateSequence) continue;
      if (item.lifecycle === 'despawn') {
        removeActor(id);
        continue;
      }
      if (!actor && typeof createActor === 'function') {
        const created = createActor(item);
        const root = created?.root || created;
        if (root) {
          root.userData = root.userData || {};
          root.userData.remoteActorId = id;
          root.userData.remoteActorKind = item.kind;
          root.userData.presentationOnly = true;
          root.position?.set?.(item.pose.x, item.pose.y, item.pose.z);
          if (root.rotation) root.rotation.y = item.pose.dir || 0;
          scene?.add?.(root);
          actor = { root, handle: created?.root ? created : null, actionIdentity: null, target: item, spawnSequence: item.spawnSequence, stateSequence: item.stateSequence };
          remoteActors.set(id, actor);
        }
      }
      if (!actor) continue;
      actor.target = item;
      actor.spawnSequence = item.spawnSequence;
      actor.stateSequence = item.stateSequence;
      actor.root.position?.set?.(item.pose.x, item.pose.y, item.pose.z);
      if (actor.root.rotation) actor.root.rotation.y = item.pose.dir || 0;
      const identity = actionIdentity(item.animation);
      if (identity && identity !== actor.actionIdentity) {
        actor.actionIdentity = identity;
        const combatState = item.animation.combatState || 'idle';
        const action = combatState === 'stunned' || combatState === 'knockback' ? 'hurt'
          : combatState === 'casting' || item.animation.skillAnimationType ? 'skill'
            : /^attack/.test(combatState) ? 'attack' : 'idle';
        actor.handle?.play?.(action, { duration: Math.max(.08, (item.animation.actionDurationMs || 220) / 1000) });
      }
      if (item.presentation) onMonsterVisual?.(item.presentation, item);
    }
    for (const [id] of remoteActors) {
      if (seen.has(id)) continue;
      removeActor(id);
    }
  }

  function acceptSnapshot(payload) {
    const snapshot = sanitizeOnlineWorldSnapshot(payload, getZone?.());
    if (!snapshot) return false;
    if (snapshot.generation !== undefined) {
      if (routeGenerationHighWater !== null && snapshot.generation < routeGenerationHighWater) return false;
      routeGenerationHighWater = snapshot.generation;
    }
    const selfId = getSelfId?.() ?? currentSelfPresenceId();
    const seen = new Set();
    const receivedAt = clockNow();
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
          samples: [],
        };
        remoteWorldPlayers.set(id, remote);
      }
      const y = Number(getHeightAt?.(item.x, item.z));
      remote.targetX = item.x;
      remote.targetY = Number.isFinite(y) ? y : 0;
      remote.targetZ = item.z;
      remote.targetDir = Number.isFinite(item.dir) ? item.dir : 0;
      remote.locomotion = typeof item.locomotion === 'string' ? item.locomotion : 'idle';
      applyAnimation(remote, item.animation, receivedAt);
      const sample = Object.freeze({ x: remote.targetX, y: remote.targetY, z: remote.targetZ, dir: remote.targetDir, at: receivedAt });
      remote.samples.push(sample);
      while (remote.samples.length > 8) remote.samples.shift();
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
    syncRemoteActors(snapshot.actors, selfId);
    for (const id of [...remoteWorldPlayers.keys()]) if (!seen.has(id)) removeRemote(id);
    return true;
  }

  function update(deltaSeconds = 0.1) {
    const camera = getCamera?.();
    const currentTime = clockNow();
    for (const remote of remoteWorldPlayers.values()) {
      expireAnimation(remote, currentTime);
      const avatar = remote.avatar;
      if (avatar) {
        const renderAt = currentTime - Math.max(0, Number(interpolationDelayMs) || 0);
        const samples = remote.samples;
        let rendered = samples.at(-1) || { x: remote.targetX, y: remote.targetY, z: remote.targetZ, dir: remote.targetDir, at: currentTime };
        if (samples.length > 1) {
          const first = samples[0];
          const last = samples.at(-1);
          if (last.at <= first.at) {
            avatar.position.x = boundedApproach(avatar.position.x, last.x);
            avatar.position.y = boundedApproach(avatar.position.y, last.y);
            avatar.position.z = boundedApproach(avatar.position.z, last.z);
            rendered = { x: avatar.position.x, y: avatar.position.y, z: avatar.position.z, dir: last.dir, at: currentTime };
          } else if (renderAt <= first.at) rendered = first;
          else if (renderAt < last.at) {
            let rightIndex = samples.findIndex(sample => sample.at >= renderAt);
            if (rightIndex < 1) rightIndex = 1;
            const left = samples[rightIndex - 1];
            const right = samples[rightIndex];
            const span = Math.max(1, right.at - left.at);
            const alpha = Math.max(0, Math.min(1, (renderAt - left.at) / span));
            const turn = Math.atan2(Math.sin(right.dir - left.dir), Math.cos(right.dir - left.dir));
            rendered = {
              x: left.x + (right.x - left.x) * alpha,
              y: left.y + (right.y - left.y) * alpha,
              z: left.z + (right.z - left.z) * alpha,
              dir: left.dir + turn * alpha,
              at: renderAt,
            };
          }
        }
        // Approach the delayed sample instead of assigning it in one frame.
        // This bounds the first correction after a long packet gap while the
        // sample buffer still follows the authoritative target exactly.
        const previousSample = samples.at(-2);
        const latestSample = samples.at(-1);
        const normalCadence = latestSample && previousSample
          && latestSample.at > previousSample.at
          && latestSample.at - previousSample.at <= 300;
        if (normalCadence) {
          avatar.position.x = rendered.x;
          avatar.position.y = rendered.y;
          avatar.position.z = rendered.z;
        } else {
          avatar.position.x = boundedApproach(avatar.position.x, rendered.x);
          avatar.position.y = boundedApproach(avatar.position.y, rendered.y);
          avatar.position.z = boundedApproach(avatar.position.z, rendered.z);
        }
        const turn = Math.atan2(Math.sin(rendered.dir - avatar.rotation.y), Math.cos(rendered.dir - avatar.rotation.y));
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
      for (const actor of remoteActors.values()) {
        actor.handle?.update?.(deltaSeconds, {
          moving: actor.target?.locomotion !== 'idle',
          locomotion: actor.target?.locomotion,
          animation: actor.target?.animation,
        });
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

let externalPose = null;

export function registerExternalPose(pose) {
  externalPose = pose && typeof pose === 'object' ? pose : null;
  return externalPose;
}

export function publishWorldState({ getZone, getPosition, getDir, getPresentation, getVisual, getActors } = {}) {
  if (typeof window === 'undefined') return;
  window.POCKETMONSTER_WORLD_STATE = () => {
    const pos = getPosition?.() ?? externalPose;
    const dir = getDir?.() ?? pos?.dir;
    return buildWorldPosFrame({
      zone: getZone?.(),
      x: pos?.x,
      y: pos?.y,
      z: pos?.z,
      dir: dir === undefined ? 0 : dir,
      locomotion: pos?.locomotion,
      animation: pos?.animation,
      presentation: getPresentation?.() ?? pos?.presentation,
      visual: getVisual?.() ?? pos?.visual,
      actors: getActors?.() ?? pos?.actors,
    });
  };
}
