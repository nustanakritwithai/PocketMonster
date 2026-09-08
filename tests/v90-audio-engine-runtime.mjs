import assert from 'node:assert/strict';

const timers = { intervals: new Map(), timeouts: new Map(), next: 1 };
const realTimers = {
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
};
globalThis.setInterval = (fn) => { const id = timers.next++; timers.intervals.set(id, fn); return id; };
globalThis.clearInterval = (id) => timers.intervals.delete(id);
globalThis.setTimeout = (fn) => { const id = timers.next++; timers.timeouts.set(id, fn); return id; };
globalThis.clearTimeout = (id) => timers.timeouts.delete(id);

class FakeParam {
  constructor(value = 0) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}
class FakeNode {
  constructor() { this.gain = new FakeParam(); }
  connect() { return this; }
  disconnect() {}
}
class FakeAudioContext {
  static instances = [];
  static rejectResume = false;
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.sampleRate = 1000;
    this.destination = new FakeNode();
    FakeAudioContext.instances.push(this);
  }
  resume() {
    if (FakeAudioContext.rejectResume) return Promise.reject(new Error('resume rejected'));
    this.state = 'running';
    return Promise.resolve();
  }
  createGain() { return new FakeNode(); }
  createOscillator() { return { type: 'sine', frequency: new FakeParam(), connect() {}, start() {}, stop() {} }; }
  createBuffer() { return { getChannelData: () => new Float32Array(1) }; }
  createBufferSource() { return { connect() {}, start() {}, stop() {}, buffer: null }; }
  createBiquadFilter() { return { connect() {}, frequency: new FakeParam(), Q: new FakeParam() }; }
}
globalThis.AudioContext = FakeAudioContext;
globalThis.webkitAudioContext = undefined;

const audio = await import(`../audio-engine.mjs?runtime=${Date.now()}`);
const flushMicrotasks = () => new Promise((resolve) => realTimers.setTimeout(resolve, 0));
const runTimeouts = () => {
  for (const [id, fn] of [...timers.timeouts]) { timers.timeouts.delete(id); fn(); }
};

// A boot-time zone request survives until the first gesture unlocks the graph.
audio.playBGM('grass-meadow');
audio.startAmbient('grass-meadow');
audio.initAudio();
await flushMicrotasks();
assert.equal(FakeAudioContext.instances[0].state, 'running');
assert.equal(audio.getCurrentBGM(), 'grassland');

// stop calls before init cancel both queued requests.
const queued = await import(`../audio-engine.mjs?cancel=${Date.now()}`);
queued.playBGM('grass-meadow');
queued.stopBGM();
queued.startAmbient('grass-meadow');
queued.stopAmbient();
queued.initAudio();
await flushMicrotasks();
assert.equal(queued.getCurrentBGM(), null);

// A delayed stop from an old zone cannot tear down a newly started zone.
audio.playBGM('hub');
audio.stopBGM();
audio.playBGM('poison-marsh');
runTimeouts();
assert.equal(audio.getCurrentBGM(), 'cave');

// Re-requesting the same zone cancels a pending fade-out as well.
audio.playBGM('hub');
audio.stopBGM();
audio.playBGM('hub');
runTimeouts();
assert.equal(audio.getCurrentBGM(), 'ranch');

// Rejected resume is contained and leaves the queued request available for retry.
const rejected = await import(`../audio-engine.mjs?reject=${Date.now()}`);
rejected.playBGM('storm-field');
FakeAudioContext.rejectResume = true;
rejected.initAudio();
await flushMicrotasks();
assert.equal(rejected.getCurrentBGM(), null);
FakeAudioContext.rejectResume = false;
await rejected.resumeAudio();
await flushMicrotasks();
assert.equal(rejected.getCurrentBGM(), 'grassland');

globalThis.setInterval = realTimers.setInterval;
globalThis.clearInterval = realTimers.clearInterval;
globalThis.setTimeout = realTimers.setTimeout;
globalThis.clearTimeout = realTimers.clearTimeout;
console.log('V9.0 audio engine runtime lifecycle: PASS');
