import assert from 'node:assert/strict';
import { sanitizePirateOriginalWorld } from '../pirate-original-world-contract.mjs';
import { createPirateSnapshotMessage } from '../pirate-presence-bridge-v900.mjs';

const envelope = {
  contract: 'pirate-original-world/1', viewerId: 'server-viewer', generation: 1, sequence: 1,
  messages: [{ type: 'world-monster-snapshot', seq: 1, islandId: 'starter-island', monsters: [] }],
};
assert.deepEqual(sanitizePirateOriginalWorld(envelope), envelope);
const copied = sanitizePirateOriginalWorld(envelope);
envelope.messages[0].monsters.push({ spawnId: 'mutated-after-parse' });
assert.equal(copied.messages[0].monsters.length, 0);
assert.equal(sanitizePirateOriginalWorld({ ...envelope, generation: -1 }), null);
assert.equal(sanitizePirateOriginalWorld({ ...envelope, sequence: 1.5 }), null);
assert.equal(sanitizePirateOriginalWorld({ ...envelope, messages: Array(513).fill(envelope.messages[0]) }), null);
assert.equal(sanitizePirateOriginalWorld({ ...envelope, messages: [{ type: 'save', seq: 1 }] }), null);
assert.equal(sanitizePirateOriginalWorld({ ...envelope, messages: [{ type: 'world-monster-dead', seq: 1, data: 'x'.repeat(1048576) }] }), null);
const relayed = createPirateSnapshotMessage({ zone: 'pirate-fruit', generation: 1, players: [], pirateWorld: copied });
assert.deepEqual(relayed.payload.pirateWorld, copied, 'ผลจาก engine เดิมต้องถึง iframe โดยไม่สูญหาย');
console.log('PASS original-world envelope bounds, copy isolation, parent-to-iframe relay');
