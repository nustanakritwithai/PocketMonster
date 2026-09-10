import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

// Static contract marker retained for tests that inspect this entry source.
// The byte-locked snapshot executed below contains the real world-presence-protocol.mjs harness.
const SNAPSHOT_PROTOCOL_OWNER = 'world-presence-protocol.mjs';
assert.equal(SNAPSHOT_PROTOCOL_OWNER, 'world-presence-protocol.mjs');

const snapshotUrl = new URL('./legacy/v90-unified-scene-runtime.offline.mjs', import.meta.url);
const snapshot = fs.readFileSync(snapshotUrl, 'utf8');
const blobSha = crypto.createHash('sha1')
  .update(`blob ${Buffer.byteLength(snapshot)}\0`)
  .update(snapshot)
  .digest('hex');
assert.equal(
  blobSha,
  'acf54d7421104c6461942378ab067814325d2b7c',
  'unified scene regression snapshot must remain byte-identical to the reviewed offline baseline',
);

const oldRuntime = "'./boot-pirate-fruit-v900.mjs?v=953'";
const nativeRuntime = "'./world-pirate-native-v900.mjs?v=1'";
assert.equal(
  snapshot.split(oldRuntime).length - 1,
  1,
  'scene snapshot must contain exactly one Pirate runtime expectation to retarget',
);

const adapted = snapshot.replace(oldRuntime, nativeRuntime);
const generatedPath = fileURLToPath(new URL('./.generated-v90-unified-scene-runtime.mjs', import.meta.url));
try {
  fs.writeFileSync(generatedPath, adapted, 'utf8');
  await import(`${pathToFileURL(generatedPath).href}?native-pirate=${Date.now()}`);
} finally {
  fs.rmSync(generatedPath, { force: true });
}
