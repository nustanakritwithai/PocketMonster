/**
 * Audio Engine — Procedural synthesis via Web Audio API
 * No sound files loaded; all SFX and BGM generated at runtime.
 *
 * Phase 1: AudioContext setup + 8 combat SFX
 */

// ── State ─────────────────────────────────────────────────────
let ctx = null;
let masterGain = null;
let sfxBus = null;
let muted = false;
let volume = 0.6;

const SFX_HANDLERS = {};

// ── Init ──────────────────────────────────────────────────────
export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  masterGain = ctx.createGain();
  masterGain.gain.value = muted ? 0 : volume;
  masterGain.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.8;
  sfxBus.connect(masterGain);
  registerCombatSFX();
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (masterGain && !muted) masterGain.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
}

export function toggleMute() {
  muted = !muted;
  if (masterGain) masterGain.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
  return muted;
}

export function isMuted() { return muted; }
export function getVolume() { return volume; }

// ── Play SFX ──────────────────────────────────────────────────
export function playSFX(id) {
  if (!ctx || muted) return;
  const handler = SFX_HANDLERS[id];
  if (handler) handler();
}

// ── Synthesis helpers ─────────────────────────────────────────
function tone(freq, start, dur, { type = 'sine', gain = 0.2, attack = 0.005 } = {}) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(sfxBus);
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function toneSweep(freqStart, freqEnd, start, dur, { type = 'sine', gain = 0.2, attack = 0.005 } = {}) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, ctx.currentTime + start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), ctx.currentTime + start + dur);
  osc.connect(g);
  g.connect(sfxBus);
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noiseBurst(start, dur, { gain = 0.15, filter = 'highpass', freq = 2000, q = 1 } = {}) {
  if (!ctx) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  src.connect(f);
  f.connect(g);
  g.connect(sfxBus);
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.start(t);
  src.stop(t + dur + 0.02);
}

// ── Combat SFX (8) ────────────────────────────────────────────
function registerCombatSFX() {
  // Hit normal — sword chip
  SFX_HANDLERS['sfx_hit_normal'] = () => {
    toneSweep(800, 200, 0, 0.06, { type: 'square', gain: 0.12 });
    tone(200, 0.02, 0.06, { type: 'sine', gain: 0.08 });
    noiseBurst(0, 0.04, { gain: 0.06, filter: 'highpass', freq: 3000 });
  };

  // Hit effective — super effective shimmer
  SFX_HANDLERS['sfx_hit_effective'] = () => {
    toneSweep(400, 1200, 0, 0.12, { type: 'sine', gain: 0.14 });
    tone(1600, 0.06, 0.1, { type: 'sine', gain: 0.06 });
    noiseBurst(0, 0.06, { gain: 0.05, filter: 'bandpass', freq: 4000, q: 2 });
  };

  // Hit weak — not very effective thud
  SFX_HANDLERS['sfx_hit_weak'] = () => {
    toneSweep(200, 80, 0, 0.08, { type: 'square', gain: 0.1 });
    noiseBurst(0, 0.03, { gain: 0.04, filter: 'lowpass', freq: 300 });
  };

  // Skill fire — whoosh + crackle
  SFX_HANDLERS['sfx_skill_fire'] = () => {
    noiseBurst(0, 0.15, { gain: 0.08, filter: 'bandpass', freq: 800, q: 0.5 });
    toneSweep(120, 60, 0, 0.2, { type: 'sawtooth', gain: 0.06 });
    noiseBurst(0.05, 0.05, { gain: 0.04, filter: 'highpass', freq: 4000 });
  };

  // Skill water — splash + bubble
  SFX_HANDLERS['sfx_skill_water'] = () => {
    noiseBurst(0, 0.12, { gain: 0.07, filter: 'bandpass', freq: 1500, q: 1.5 });
    toneSweep(600, 300, 0.02, 0.1, { type: 'sine', gain: 0.06 });
    tone(400, 0.08, 0.06, { type: 'sine', gain: 0.04 });
  };

  // Skill electric — zap
  SFX_HANDLERS['sfx_skill_electric'] = () => {
    tone(1000, 0, 0.04, { type: 'sawtooth', gain: 0.1 });
    tone(1500, 0.03, 0.03, { type: 'square', gain: 0.06 });
    noiseBurst(0, 0.08, { gain: 0.06, filter: 'highpass', freq: 3000 });
  };

  // Skill grass — leaf rustle
  SFX_HANDLERS['sfx_skill_grass'] = () => {
    noiseBurst(0, 0.15, { gain: 0.05, filter: 'bandpass', freq: 2500, q: 2 });
    tone(400, 0, 0.2, { type: 'sine', gain: 0.06, attack: 0.02 });
    tone(600, 0.05, 0.15, { type: 'sine', gain: 0.04 });
  };

  // Faint — descending tone
  SFX_HANDLERS['sfx_faint'] = () => {
    toneSweep(400, 60, 0, 0.35, { type: 'sine', gain: 0.12, attack: 0.01 });
    tone(80, 0.25, 0.15, { type: 'sine', gain: 0.06 });
  };
}