import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createCombatV91Rng } from '../combat-v91-rng.mjs';
import { TEST_RNG_SEEDS } from './v91-combat-fixtures.mjs';

const context = Object.freeze({
  seed: TEST_RNG_SEEDS.alpha,
  combatId: 'combat:rng:cross-process',
  actionSequence: 17,
  actorEntityId: 'human:rng:cross-process',
  targetEntityId: 'monster:rng:cross-process',
  actionId: 'shared:rng:cross-process',
  actionFingerprint: 'a'.repeat(64),
  worldSnapshotFingerprint: 'b'.repeat(64),
  rngTicketId: 'rng-ticket:cross-process',
});

function vector(input) {
  const stream = createCombatV91Rng(input);
  assert.equal(stream.ok, true, stream.reason);
  return {
    contextFingerprint: stream.contextFingerprint,
    streamFingerprint: stream.streamFingerprint,
    draws: Array.from({ length: 12 }, () => stream.rng()),
  };
}

const parent = vector(context);
const moduleUrl = new URL('../combat-v91-rng.mjs', import.meta.url).href;
const childSource = `
  import { createCombatV91Rng } from ${JSON.stringify(moduleUrl)};
  const stream = createCombatV91Rng(${JSON.stringify(context)});
  if (!stream.ok) throw new Error(stream.reason);
  console.log(JSON.stringify({
    contextFingerprint: stream.contextFingerprint,
    streamFingerprint: stream.streamFingerprint,
    draws: Array.from({ length: 12 }, () => stream.rng()),
  }));
`;
const child = spawnSync(process.execPath, ['--input-type=module', '--eval', childSource], {
  encoding: 'utf8',
});
assert.equal(child.status, 0, child.stderr || 'child RNG process failed');
assert.deepEqual(JSON.parse(child.stdout), parent,
  'separate Client/Server processes produce the exact same seeded RNG vector');

assert.notEqual(vector({ ...context, rngTicketId: 'rng-ticket:cross-process:other' }).streamFingerprint,
  parent.streamFingerprint);
assert.notEqual(vector({ ...context, worldSnapshotFingerprint: 'c'.repeat(64) }).streamFingerprint,
  parent.streamFingerprint);
assert.notEqual(vector({ ...context, actionFingerprint: 'd'.repeat(64) }).streamFingerprint,
  parent.streamFingerprint);

console.log('V9.1 combat RNG parity: PASS (12 draws across isolated processes)');
