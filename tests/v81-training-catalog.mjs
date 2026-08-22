import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BALANCE_CONFIG, WORKBOOK_GROWTH_ADAPTER } from '../balance-config.mjs';
import {
  addTrainingExp,
  migrateState,
  normalizeInstance,
  normalizeTraining,
  resolveOfflineTrainingWindow,
  trainingRemaining,
  trainingUsed,
} from '../monster-instance.mjs';

const malformed = normalizeTraining({ power: -5, defense: 999, speed: 999, technique: 999, spirit: 999 });
assert.deepEqual(malformed, { power: 0, defense: 200, speed: 200, technique: 200, spirit: 0 });
assert.deepEqual(
  BALANCE_CONFIG.training.allocationLimits,
  { perLineMax: WORKBOOK_GROWTH_ADAPTER.training.perStatMax, totalMax: WORKBOOK_GROWTH_ADAPTER.training.totalMax },
  'live hard guards share the Workbook source limits without changing training lines',
);
assert.equal(trainingUsed({ training: malformed }), 600, 'loaded training is bounded to the Workbook total cap');
for (const value of Object.values(malformed)) {
  assert.ok(value >= 0 && value <= 200, 'every loaded training line remains within 0..200');
}

const normalized = normalizeInstance({
  instanceId: 'bounded', speciesId: 'flameling', level: 50,
  training: { power: 500, defense: 500, speed: 500, technique: 500, spirit: 500 },
}, { now: 1000 });
const normalizedAgain = normalizeInstance(normalized, { now: 1000 });
assert.deepEqual(normalizedAgain, normalized, 'training load normalization is idempotent');
assert.equal(normalized.training.power, 200);
assert.equal(trainingUsed(normalized), BALANCE_CONFIG.training.allocationLimits.totalMax);
assert.equal(trainingRemaining(normalized), 0);

const highCapacityConfig = {
  ...BALANCE_CONFIG,
  training: {
    ...BALANCE_CONFIG.training,
    capacity: { base: 1000, perLevel: 0 },
  },
};
const rewarded = normalizeInstance({
  instanceId: 'rewarded', speciesId: 'flameling', level: 50,
  training: { power: 190, defense: 200, speed: 200 },
}, { now: 1000 });
assert.equal(addTrainingExp(rewarded, 'power', 50, highCapacityConfig), 10, 'reward stops at 200 on one line');
assert.equal(addTrainingExp(rewarded, 'technique', 50, highCapacityConfig), 0, 'reward stops at 600 across all lines');
assert.equal(addTrainingExp(rewarded, 'missing', 50, highCapacityConfig), 0, 'unknown line is rejected');
assert.equal(trainingUsed(rewarded), 600);

const live = normalizeInstance({ instanceId: 'live', speciesId: 'mossbun', level: 50 }, { now: 1000 });
assert.equal(addTrainingExp(live, 'power', 999), 200, 'live reward also respects the per-line cap');
assert.equal(trainingUsed(live), 200);
assert.equal(trainingRemaining(live), 240, 'existing level-based live capacity remains active below the Workbook total cap');

const hour = 3600 * 1000;
const capped = resolveOfflineTrainingWindow({ lastClaimAt: 1000, now: 1000 + 24 * hour });
assert.equal(capped.ok, true);
assert.equal(capped.hours, 10, 'offline Ranch training shares the canonical ten-hour cap');
assert.equal(capped.capped, true);

const saved = JSON.parse(JSON.stringify({ lifeLastAt: capped.nextClaimAt }));
const replay = resolveOfflineTrainingWindow({ lastClaimAt: saved.lifeLastAt, now: capped.nextClaimAt });
assert.equal(replay.reason, 'duplicate_claim');
assert.equal(replay.hours, 0, 'same timestamp cannot award twice after save/load');
assert.equal(resolveOfflineTrainingWindow({ now: 5000 }).reason, 'duplicate_claim', 'missing legacy timestamp grants no retroactive reward');
assert.equal(resolveOfflineTrainingWindow({ lastClaimAt: 1000, now: Number.NaN }).reason, 'invalid_timestamp');

const legacy = { collection: [{ instanceId: 'legacy', speciesId: 'aquapuff', training: { power: 999 } }] };
const migrated = migrateState(legacy, { now: 1000 });
assert.deepEqual(migrateState(migrated, { now: 1000 }), migrated, 'training migration remains twice-is-same');
assert.equal(migrated.collection[0].training.power, 200);

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(game, /resolveOfflineTrainingWindow\(\{lastClaimAt:state\.lifeLastAt\|\|now,now\}\)/);
assert.match(game, /const baseGain=window\.hours\*60\*1\.8/, 'live Ranch reward uses capped hours, not uncapped elapsed minutes');
assert.doesNotMatch(game, /const minutes=elapsed\/60000/, 'uncapped legacy offline reward path is removed');

console.log('V8.1 Workbook training cap adapter: PASS');
