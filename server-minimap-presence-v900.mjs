import { installPersistentMinimapOwner } from './persistent-minimap-owner-v900.mjs?v=2';

export const SERVER_MINIMAP_PRESENCE_KIND = 'pocketmonster:server-minimap-presence-v1';
export const SERVER_MINIMAP_PRESENCE_TTL_MS = 1500;

const TAP_KEY = Symbol.for('pocketmonster.server-minimap-presence.tap.v1');
const POSE_KEY = Symbol.for('pocketmonster.server-minimap-presence.pose.v1');
const WINDOW_METHODS = new Set(['addEventListener', 'removeEventListener', 'dispatchEvent', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout']);

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeWorldPosFrame(frame, sentAt = Date.now()) {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame) || frame.type !== 'world-pos') return null;
  if (typeof frame.zone !== 'string' || !frame.zone || !finite(frame.x) || !finite(frame.z) || !finite(frame.dir)) return null;
  const pose = {
    zone: frame.zone,
    x: frame.x,
    z: frame.z,
    dir: frame.dir,
    sentAt,
    source: 'server-presence-transport',
  };
  if (finite(frame.y)) pose.y = frame.y;
  return Object.freeze(pose);
}

export function recordServerPresencePose(windowLike, frame, sentAt = Date.now()) {
  if (!windowLike) return null;
  const pose = sanitizeWorldPosFrame(frame, sentAt);
  if (!pose) return null;
  try { windowLike[POSE_KEY] = pose; } catch { return null; }
  return pose;
}

export function readServerPresencePose({
  windowLike = globalThis.window,
  now = Date.now(),
  maxAgeMs = SERVER_MINIMAP_PRESENCE_TTL_MS,
  requireConnected = true,
} = {}) {
  if (!windowLike) return null;
  if (requireConnected && windowLike.POCKETMONSTER_WORLD_SOCKET_CONNECTED !== true) return null;
  const pose = windowLike[POSE_KEY];
  if (!pose || !finite(pose.sentAt) || now - pose.sentAt > Math.max(100, Number(maxAgeMs) || SERVER_MINIMAP_PRESENCE_TTL_MS)) return null;
  return pose;
}

function inspectOutboundWorldPos(windowLike, data) {
  if (typeof data !== 'string' || data.length > 64 * 1024 || !data.includes('"type":"world-pos"')) return null;
  try { return recordServerPresencePose(windowLike, JSON.parse(data)); } catch { return null; }
}

export function installServerPresenceTransportTap(windowLike = globalThis.window) {
  const WebSocketCtor = windowLike?.WebSocket || globalThis.WebSocket;
  const proto = WebSocketCtor?.prototype;
  if (!windowLike || !proto || typeof proto.send !== 'function') return null;
  if (proto[TAP_KEY]) return proto[TAP_KEY];

  const originalSend = proto.send;
  const tap = Object.freeze({
    kind: SERVER_MINIMAP_PRESENCE_KIND,
    stop() {
      if (proto.send === tappedSend) proto.send = originalSend;
      try { delete proto[TAP_KEY]; } catch {}
      return true;
    },
  });

  function tappedSend(data, ...args) {
    const result = originalSend.call(this, data, ...args);
    inspectOutboundWorldPos(windowLike, data);
    return result;
  }

  try {
    proto.send = tappedSend;
    Object.defineProperty(proto, TAP_KEY, { configurable: true, value: tap });
  } catch {
    try { proto.send = originalSend; } catch {}
    return null;
  }

  try {
    windowLike.POCKETMONSTER_SERVER_PRESENCE_POSE = () => readServerPresencePose({ windowLike });
  } catch {}
  return tap;
}

export function createServerBackedMinimapWindow(windowLike = globalThis.window) {
  if (!windowLike) throw new TypeError('server-backed minimap requires windowLike');
  return new Proxy(windowLike, {
    get(target, property) {
      if (property === 'POCKETMONSTER_WORLD_STATE') {
        return () => {
          const serverPose = readServerPresencePose({ windowLike: target });
          if (serverPose) return serverPose;
          try { return target.POCKETMONSTER_WORLD_STATE?.() || null; } catch { return null; }
        };
      }
      const value = Reflect.get(target, property, target);
      if (typeof value === 'function' && WINDOW_METHODS.has(property)) return value.bind(target);
      return value;
    },
    set(target, property, value) {
      return Reflect.set(target, property, value, target);
    },
    deleteProperty(target, property) {
      return Reflect.deleteProperty(target, property);
    },
  });
}

export function installPersistentMinimapOwnerFromServerPresence({
  windowLike = globalThis.window,
  documentLike = globalThis.document,
} = {}) {
  if (!windowLike) return null;
  installServerPresenceTransportTap(windowLike);
  const ownerWindow = createServerBackedMinimapWindow(windowLike);
  const owner = installPersistentMinimapOwner({ windowLike: ownerWindow, documentLike });
  try {
    windowLike.POCKETMONSTER_SERVER_MINIMAP_DIAGNOSTICS = () => Object.freeze({
      kind: SERVER_MINIMAP_PRESENCE_KIND,
      connected: windowLike.POCKETMONSTER_WORLD_SOCKET_CONNECTED === true,
      serverPose: readServerPresencePose({ windowLike }),
      minimap: owner?.api?.snapshot?.() || null,
    });
  } catch {}
  return owner;
}
