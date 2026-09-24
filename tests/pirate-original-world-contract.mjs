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

const vitals = { contract: 'pirate-vitals/1', revision: 15, serverTimeMs: 10000,
  hp: 60, maxHp: 100, guard: 30, guardMax: 100, guardBroken: false, hitstunUntil: 0,
  energy: 70, maxEnergy: 100, mp: 45, maxMp: 100, dead: false };
const withVitals = { ...copied, vitals };
const vitalsRelay = createPirateSnapshotMessage({ zone: 'pirate-fruit', generation: 1, players: [], pirateWorld: withVitals });
assert.deepEqual(vitalsRelay.payload.pirateWorld.vitals, vitals, 'canonical vitals must survive the actual parent iframe relay');
assert.deepEqual(sanitizePirateOriginalWorld(vitalsRelay.payload.pirateWorld).vitals, vitals);
for (const invalid of [{ hp: 101 }, { revision: 0 }, { guard: NaN }, { dead: 'false' },
  { respawn: { spawnId: 'starter', islandId: 'starter-island', x: 0, y: 1, z: 0, heading: 0, atRevision: 16 } }])
  assert.equal(sanitizePirateOriginalWorld({ ...withVitals, vitals: { ...vitals, ...invalid } }), null);
console.log('PASS vitals survives parent relay with revision, bounds and respawn validation');

// Producer -> relay -> native receiver must agree on death/cap/respawn meaning.
for (const invalid of [
  { dead: true }, { hp: 0, dead: false }, { hp: 0, maxHp: 0, dead: true },
  { respawn: null }, { respawn: false }, { respawn: [] },
  { respawn: { spawnId: '', islandId: 'starter-island', x: 0, y: 1, z: 0, heading: 0, atRevision: 15 } },
  { respawn: { spawnId: 'starter', islandId: '', x: 0, y: 1, z: 0, heading: 0, atRevision: 15 } },
]) assert.equal(sanitizePirateOriginalWorld({ ...withVitals, vitals: { ...vitals, ...invalid } }), null);
console.log('PASS vitals death/cap/respawn invariants are rejected at the parent ingress');
