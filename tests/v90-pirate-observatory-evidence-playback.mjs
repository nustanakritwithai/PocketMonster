import assert from 'node:assert/strict';
import { PirateObservatoryEvidencePlayback } from '../pirate-observatory/index.mjs';

function snapshot(sequence) {
  return { schemaVersion: 1, partition: 'pirate-fruit', tick: 100 + sequence, sequence, entities: [] };
}

const loaded = [];
const states = [];
const timers = new Map();
let nextTimerId = 1;
const historySession = {
  async loadSequence(sequence) {
    loaded.push(sequence);
    return { ok: true, snapshot: snapshot(sequence) };
  },
};

const playback = new PirateObservatoryEvidencePlayback({
  historySession,
  stepMs: 500,
  onState: state => states.push(state),
  setTimeoutImpl: fn => { const id = nextTimerId++; timers.set(id, fn); return id; },
  clearTimeoutImpl: id => timers.delete(id),
});

assert.deepEqual(playback.configureBounds([1, 3, 5]), { ok: true, minSequence: 1, maxSequence: 5 });
assert.equal(playback.status().state, 'idle');
assert.equal((await playback.jump(3)).ok, true);
assert.equal(playback.status().currentSequence, 3);
assert.deepEqual(loaded, [3]);

assert.equal((await playback.step(-1)).ok, true);
assert.equal(playback.status().currentSequence, 2);
assert.equal((await playback.step(1)).ok, true);
assert.equal(playback.status().currentSequence, 3);
assert.deepEqual(loaded, [3, 2, 3]);
assert.equal((await playback.jump(6)).reason, 'HISTORY_OUT_OF_RANGE');

const started = await playback.play();
assert.equal(started.ok, true);
assert.equal(playback.status().state, 'playing');
assert.equal(timers.size, 1);

// Fire one scheduled playback tick. It must finish loading #4 before scheduling
// another timer, so history requests never overlap.
const firstTimer = [...timers.entries()][0];
timers.delete(firstTimer[0]);
firstTimer[1]();
await new Promise(resolve => setImmediate(resolve));
assert.equal(playback.status().currentSequence, 4);
assert.equal(playback.status().state, 'playing');
assert.equal(timers.size, 1);

const secondTimer = [...timers.entries()][0];
timers.delete(secondTimer[0]);
secondTimer[1]();
await new Promise(resolve => setImmediate(resolve));
assert.equal(playback.status().currentSequence, 5);
assert.equal(playback.status().state, 'ended');
assert.equal(timers.size, 0);
assert.deepEqual(loaded, [3, 2, 3, 4, 5]);
assert.equal((await playback.play()).reason, 'HISTORY_BOUNDARY');

// Reverse stepping remains manual and detached after reaching the end.
assert.equal((await playback.step(-1)).ok, true);
assert.equal(playback.status().currentSequence, 4);
playback.clear();
assert.deepEqual(playback.status(), {
  state: 'idle', minSequence: null, maxSequence: null, currentSequence: null, stepMs: 500,
});

// A missing/gapped sequence must stop playback; it is never skipped.
const errorTimers = new Map();
let errorTimerId = 1;
const gapPlayback = new PirateObservatoryEvidencePlayback({
  stepMs: 500,
  historySession: {
    async loadSequence(sequence) {
      return sequence === 2 ? { ok: false, reason: 'HISTORY_GAP' } : { ok: true, snapshot: snapshot(sequence) };
    },
  },
  setTimeoutImpl: fn => { const id = errorTimerId++; errorTimers.set(id, fn); return id; },
  clearTimeoutImpl: id => errorTimers.delete(id),
});
gapPlayback.configureBounds([1, 3]);
assert.equal((await gapPlayback.play()).ok, true); // loads #1, schedules #2
const gapTimer = [...errorTimers.entries()][0];
errorTimers.delete(gapTimer[0]);
gapTimer[1]();
await new Promise(resolve => setImmediate(resolve));
assert.equal(gapPlayback.status().currentSequence, 1);
assert.equal(gapPlayback.status().state, 'error');
assert.equal(errorTimers.size, 0);

assert.ok(states.some(state => state.state === 'playing'));
assert.ok(states.some(state => state.state === 'ended'));
console.log('v90 Pirate World Observatory Evidence Playback: PASS');
