import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const fixturePath = process.env.SERVER_PLAYER_AUTHORITY_FIXTURE
  ? resolve(process.env.SERVER_PLAYER_AUTHORITY_FIXTURE)
  : process.argv[2];
const expectedFixtureSha = process.env.SERVER_PLAYER_AUTHORITY_FIXTURE_SHA256;
const pirateProofPath = process.env.PIRATE_RECEIVER_PROOF
  ? resolve(process.env.PIRATE_RECEIVER_PROOF)
  : null;

assert.ok(fixturePath, 'generated Server wire fixture path is required; no inline authority fixture is allowed');
assert.ok(expectedFixtureSha, 'generated Server wire fixture SHA256 is required');
assert.ok(pirateProofPath, 'generated Pirate receiver proof path is required');

const fixtureBytes = await readFile(fixturePath);
const fixtureSha = createHash('sha256').update(fixtureBytes).digest('hex').toUpperCase();
assert.equal(fixtureSha, expectedFixtureSha.toUpperCase(), 'Server fixture provenance SHA mismatch');

const wire = JSON.parse(fixtureBytes.toString('utf8'));
assert.equal(wire.type, 'world-snapshot', 'fixture must be emitted by WorldPresenceSnapshotWire');
assert.equal(wire.payload?.zone, 'pirate-fruit', 'fixture transport zone mismatch');
assert.ok(wire.payload?.playerAuthority, 'Server serializer omitted playerAuthority');
assert.ok(Array.isArray(wire.payload.playerAuthority.players), 'authority roster missing');
assert.ok(wire.payload.playerAuthority.players.length >= 2, 'fixture must contain self and observer identities');
assert.ok(Array.isArray(wire.payload.playerAuthority.results), 'authority results missing');
assert.ok(wire.payload.playerAuthority.results.length > 0, 'fixture must contain a real committed result');

const protocol = await import(new URL('../world-presence-protocol.mjs?authority-cross-repo=' + Date.now(), import.meta.url));
const bridge = await import(new URL('../pirate-presence-bridge-v900.mjs?authority-cross-repo=' + Date.now(), import.meta.url));
const sanitized = protocol.sanitizeOnlineWorldSnapshot(wire.payload, 'pirate-fruit');
assert.ok(sanitized, 'Client world sanitizer rejected generated Server wire');
const parentMessage = bridge.createPirateSnapshotMessage(sanitized);
const received = bridge.sanitizePirateWorldSnapshot(parentMessage.payload);
assert.ok(received?.playerAuthority, 'Parent/Pirate bridge dropped playerAuthority');
assert.equal(received.playerAuthority.players.length, wire.payload.playerAuthority.players.length, 'authority roster changed at bridge');
assert.equal(received.playerAuthority.results.length, wire.payload.playerAuthority.results.length, 'authority results changed at bridge');

const proof = JSON.parse(await readFile(pirateProofPath, 'utf8'));
assert.equal(proof.sourceCommit, process.env.PIRATE_RECEIVER_COMMIT ?? 'cda05f7594adc28c4194d0f8677a45f05d44a8cf', 'Pirate receiver provenance mismatch');
assert.equal(String(proof.fixtureSha256).toUpperCase(), fixtureSha, 'Pirate proof references another fixture');
assert.equal(proof.accepted, true, 'actual Pirate receiver rejected the composed authority wire');
assert.ok(Array.isArray(proof.acceptedResults) && proof.acceptedResults.length > 0, 'Pirate proof has no accepted result');
assert.ok(proof.selfPlayerId && proof.observerPlayerId, 'Pirate proof lacks self/observer identities');

console.log('Player authority cross-repo composed proof PASS: Server wire -> Client sanitizer -> Parent bridge -> pinned Pirate receiver');
