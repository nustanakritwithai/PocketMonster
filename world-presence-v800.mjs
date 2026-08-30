import { isRemoteWorldPlayer, selfPresenceId } from './world-presence-protocol.mjs';

export function installWorldPresence({ THREE, getCamera, getZone, getSelfId } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (typeof window.POCKETMONSTER_WORLD_PRESENCE === 'function') return () => {};
  const remoteWorldPlayers = new Map();
  let remoteWorldLayer = document.getElementById('remoteWorldPlayers');
  if (!remoteWorldLayer) {
    remoteWorldLayer = document.createElement('div');
    remoteWorldLayer.id = 'remoteWorldPlayers';
    Object.assign(remoteWorldLayer.style, { position: 'fixed', inset: '0', zIndex: '14000', pointerEvents: 'none' });
    document.body.append(remoteWorldLayer);
  }
  window.POCKETMONSTER_WORLD_PRESENCE = payload => {
    if (!payload || payload.zone !== getZone?.()) return;
    const selfId = getSelfId?.() ?? selfPresenceId(window.POCKETMONSTER_AUTH_PROFILE_BRIDGE?.profile, window.POCKETMONSTER_SELF_PRESENCE_ID);
    const seen = new Set();
    for (const item of payload.players || []) {
      if (!isRemoteWorldPlayer(item, selfId)) continue;
      seen.add(item.id);
      let marker = remoteWorldPlayers.get(item.id);
      if (!marker) {
        marker = document.createElement('div');
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
        remoteWorldLayer.append(marker);
        remoteWorldPlayers.set(item.id, marker);
      }
      marker.textContent = item.name || 'ผู้เล่นออนไลน์';
      marker.dataset.x = item.x;
      marker.dataset.z = item.z;
    }
    for (const [id, marker] of remoteWorldPlayers) {
      if (!seen.has(id)) {
        marker.remove();
        remoteWorldPlayers.delete(id);
      }
    }
  };
  const timer = setInterval(() => {
    const camera = getCamera?.();
    if (!camera || !THREE?.Vector3) return;
    for (const marker of remoteWorldPlayers.values()) {
      const x = Number(marker.dataset.x), z = Number(marker.dataset.z);
      const point = new THREE.Vector3(x, 1.8, z).project(camera);
      const visible = point.z > -1 && point.z < 1 && point.x >= -1.1 && point.x <= 1.1 && point.y >= -1.1 && point.y <= 1.1;
      marker.hidden = !visible;
      if (visible) {
        marker.style.left = ((point.x + 1) * 50) + '%';
        marker.style.top = ((1 - point.y) * 50) + '%';
      }
    }
  }, 100);
  return () => {
    clearInterval(timer);
    if (window.POCKETMONSTER_WORLD_PRESENCE) delete window.POCKETMONSTER_WORLD_PRESENCE;
    for (const marker of remoteWorldPlayers.values()) marker.remove();
    remoteWorldPlayers.clear();
    remoteWorldLayer.remove();
  };
}

export function publishWorldState({ getZone, getPosition, getDir } = {}) {
  if (typeof window === 'undefined') return;
  window.POCKETMONSTER_WORLD_STATE = () => {
    const pos = getPosition?.();
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
    const zone = getZone?.();
    const dir = Number(getDir?.());
    if (typeof zone !== 'string' || !zone || !Number.isFinite(dir)) return null;
    return { zone, x: pos.x, z: pos.z, dir };
  };
}
