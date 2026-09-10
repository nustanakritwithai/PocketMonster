import assert from 'node:assert/strict';
import {
  SERVER_MINIMAP_PRESENCE_KIND,
  SERVER_MINIMAP_PRESENCE_TTL_MS,
  createServerBackedMinimapWindow,
  installServerPresenceTransportTap,
  readServerPresencePose,
  recordServerPresencePose,
  resolveMinimapPlayerPose,
} from '../server-minimap-presence-v900.mjs';

class FakeWebSocket {
  constructor() { this.sent = []; }
  send(data) { this.sent.push(data); }
}

let localPose = { zone: 'pirate-fruit', x: 1, z: 2, dir: 0.1 };
const windowLike = {
  WebSocket: FakeWebSocket,
  POCKETMONSTER_WORLD_SOCKET_CONNECTED: true,
  POCKETMONSTER_WORLD_STATE: () => localPose,
};

const noServerWindow = {
  POCKETMONSTER_WORLD_SOCKET_CONNECTED: false,
  POCKETMONSTER_WORLD_STATE: () => localPose,
};
assert.deepEqual(resolveMinimapPlayerPose({ windowLike: noServerWindow }), {
  pose: localPose,
  source: 'offline-world-state',
}, 'minimap must use the original offline pose when Server presence is unavailable');

const connectedButUncaptured = {
  POCKETMONSTER_WORLD_SOCKET_CONNECTED: true,
  POCKETMONSTER_WORLD_STATE: () => localPose,
};
assert.deepEqual(resolveMinimapPlayerPose({ windowLike: connectedButUncaptured }), {
  pose: localPose,
  source: 'offline-world-state',
}, 'connected socket without a captured Server pose must still show the offline player position');

const tap = installServerPresenceTransportTap(windowLike);
assert.equal(tap?.kind, SERVER_MINIMAP_PRESENCE_KIND);
const socket = new FakeWebSocket();
socket.send(JSON.stringify({ type: 'world-pos', zone: 'pirate-fruit', x: 18, y: 3, z: -7, dir: 0.75 }));
assert.equal(socket.sent.length, 1, 'tap must not duplicate or block the original WebSocket send');
const serverPose = readServerPresencePose({ windowLike });
assert.equal(serverPose?.x, 18);
assert.equal(serverPose?.y, 3);
assert.equal(serverPose?.z, -7);
assert.equal(serverPose?.dir, 0.75);
assert.equal(serverPose?.source, 'server-presence-transport');
assert.equal(windowLike.POCKETMONSTER_SERVER_PRESENCE_POSE?.()?.x, 18, 'diagnostic getter exposes the transport pose');

const backed = createServerBackedMinimapWindow(windowLike);
assert.equal(backed.POCKETMONSTER_WORLD_STATE().x, 18, 'fresh connected Server presence is the primary minimap source');
assert.equal(resolveMinimapPlayerPose({ windowLike }).source, 'server-presence-transport');

windowLike.POCKETMONSTER_WORLD_SOCKET_CONNECTED = false;
assert.deepEqual(backed.POCKETMONSTER_WORLD_STATE(), localPose, 'disconnected Server presence falls back to the original offline pose');
assert.equal(resolveMinimapPlayerPose({ windowLike }).source, 'offline-world-state');
windowLike.POCKETMONSTER_WORLD_SOCKET_CONNECTED = true;

const fixedNow = 10_000;
recordServerPresencePose(windowLike, { type: 'world-pos', zone: 'pirate-fruit', x: 22, z: 8, dir: -0.2 }, fixedNow);
assert.equal(readServerPresencePose({ windowLike, now: fixedNow + SERVER_MINIMAP_PRESENCE_TTL_MS - 1 })?.x, 22);
assert.equal(readServerPresencePose({ windowLike, now: fixedNow + SERVER_MINIMAP_PRESENCE_TTL_MS + 1 }), null,
  'stale Server transport pose must not freeze the minimap');
assert.deepEqual(resolveMinimapPlayerPose({
  windowLike,
  now: fixedNow + SERVER_MINIMAP_PRESENCE_TTL_MS + 1,
}), { pose: localPose, source: 'offline-world-state' },
'stale Server pose must immediately fall back to the original offline position');

recordServerPresencePose(windowLike, { type: 'world-pos', zone: 'pirate-fruit', x: 30, z: 40, dir: 0 }, Date.now());
localPose = { zone: 'living-world', x: -4, z: 9, dir: 0.3 };
assert.deepEqual(resolveMinimapPlayerPose({ windowLike }), {
  pose: localPose,
  source: 'offline-world-state',
}, 'a fresh Server pose from the previous world cannot override the active offline world position');

localPose = { zone: 'pirate-fruit', x: 4, z: 5, dir: 0.4 };
socket.send(JSON.stringify({ type: 'chat', message: 'hello' }));
assert.equal(readServerPresencePose({ windowLike })?.x, 30,
  'non-world WebSocket traffic cannot replace the cached Server minimap pose');
assert.equal(recordServerPresencePose(windowLike, { type: 'world-pos', zone: 'pirate-fruit', x: Number.NaN, z: 0, dir: 0 }), null,
  'invalid coordinates fail closed');

assert.equal(tap.stop(), true);
windowLike.POCKETMONSTER_WORLD_SOCKET_CONNECTED = false;
const afterStop = new FakeWebSocket();
afterStop.send(JSON.stringify({ type: 'world-pos', zone: 'pirate-fruit', x: 99, z: 99, dir: 0 }));
assert.deepEqual(resolveMinimapPlayerPose({ windowLike }), {
  pose: localPose,
  source: 'offline-world-state',
}, 'if Server capture cannot run, the minimap stays on the original offline location path');

console.log('V9 minimap Server presence with offline fallback: PASS');
