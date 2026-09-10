import assert from 'node:assert/strict';
import {
  SERVER_MINIMAP_PRESENCE_KIND,
  SERVER_MINIMAP_PRESENCE_TTL_MS,
  createServerBackedMinimapWindow,
  installServerPresenceTransportTap,
  readServerPresencePose,
  recordServerPresencePose,
} from '../server-minimap-presence-v900.mjs';

class FakeWebSocket {
  constructor() { this.sent = []; }
  send(data) { this.sent.push(data); }
}

const localPose = { zone: 'pirate-fruit', x: 1, z: 2, dir: 0.1 };
const windowLike = {
  WebSocket: FakeWebSocket,
  POCKETMONSTER_WORLD_SOCKET_CONNECTED: true,
  POCKETMONSTER_WORLD_STATE: () => localPose,
};

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
assert.equal(backed.POCKETMONSTER_WORLD_STATE().x, 18, 'minimap source prefers the pose actually sent through Server presence transport');

windowLike.POCKETMONSTER_WORLD_SOCKET_CONNECTED = false;
assert.deepEqual(backed.POCKETMONSTER_WORLD_STATE(), localPose, 'disconnected Server presence falls back to the local scene pose');
windowLike.POCKETMONSTER_WORLD_SOCKET_CONNECTED = true;

const fixedNow = 10_000;
recordServerPresencePose(windowLike, { type: 'world-pos', zone: 'pirate-fruit', x: 22, z: 8, dir: -0.2 }, fixedNow);
assert.equal(readServerPresencePose({ windowLike, now: fixedNow + SERVER_MINIMAP_PRESENCE_TTL_MS - 1 })?.x, 22);
assert.equal(readServerPresencePose({ windowLike, now: fixedNow + SERVER_MINIMAP_PRESENCE_TTL_MS + 1 }), null,
  'stale Server transport pose must not freeze the minimap');

socket.send(JSON.stringify({ type: 'chat', message: 'hello' }));
assert.equal(readServerPresencePose({ windowLike, now: fixedNow + SERVER_MINIMAP_PRESENCE_TTL_MS + 1 }), null,
  'non-world WebSocket traffic cannot refresh the minimap pose');
assert.equal(recordServerPresencePose(windowLike, { type: 'world-pos', zone: 'pirate-fruit', x: Number.NaN, z: 0, dir: 0 }), null,
  'invalid coordinates fail closed');

assert.equal(tap.stop(), true);
const afterStop = new FakeWebSocket();
afterStop.send(JSON.stringify({ type: 'world-pos', zone: 'pirate-fruit', x: 99, z: 99, dir: 0 }));
assert.equal(readServerPresencePose({ windowLike, now: fixedNow + SERVER_MINIMAP_PRESENCE_TTL_MS + 1 }), null,
  'stopped tap does not observe later sends');

console.log('V9 minimap Server presence source: PASS');
