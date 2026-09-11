import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const snapshotUrl = new URL('./legacy/v90-pirate-fruit-player.offline.mjs', import.meta.url);
const snapshot = fs.readFileSync(snapshotUrl, 'utf8');
const blobSha = crypto.createHash('sha1')
  .update(`blob ${Buffer.byteLength(snapshot)}\0`)
  .update(snapshot)
  .digest('hex');
assert.equal(
  blobSha,
  'd7c9d5acfc87f2b3ed67353309f615c43e892d8a',
  'legacy Pirate regression snapshot must remain byte-identical to the reviewed offline baseline',
);

const oldRuntime = "'./boot-pirate-fruit-v900.mjs?v=953'";
const nativeRuntime = "'./world-pirate-native-v900.mjs?v=1'";
assert.equal(
  snapshot.split(oldRuntime).length - 1,
  1,
  'snapshot must contain exactly one active Pirate runtime expectation to retarget',
);

const adapted = snapshot.replace(oldRuntime, nativeRuntime);
const generatedPath = fileURLToPath(new URL('./.generated-v90-pirate-fruit-player.mjs', import.meta.url));
try {
  fs.writeFileSync(generatedPath, adapted, 'utf8');
  await import(`${pathToFileURL(generatedPath).href}?native-pirate=${Date.now()}`);
} finally {
  fs.rmSync(generatedPath, { force: true });
}
