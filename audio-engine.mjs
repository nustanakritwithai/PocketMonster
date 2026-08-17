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

  registerCaptureSFX();
  registerProgressionSFX();
  registerUISFX();
  registerTypeSFX();
}

// ── Capture SFX (4) ──────────────────────────────────────────
function registerCaptureSFX() {
  // Throw ball — whip + arc whoosh
  SFX_HANDLERS['sfx_throw_ball'] = () => {
    toneSweep(300, 900, 0, 0.12, { type: 'sawtooth', gain: 0.08 });
    noiseBurst(0.02, 0.1, { gain: 0.05, filter: 'bandpass', freq: 1200, q: 0.7 });
    tone(700, 0.1, 0.04, { type: 'sine', gain: 0.04 });
  };

  // Capture tension — wobble ticks during shake checks
  SFX_HANDLERS['sfx_capture_tension'] = () => {
    tone(600, 0, 0.05, { type: 'square', gain: 0.06 });
    tone(600, 0.12, 0.05, { type: 'square', gain: 0.06 });
    tone(600, 0.24, 0.05, { type: 'square', gain: 0.05 });
  };

  // Capture success — triumphant rising arpeggio
  SFX_HANDLERS['sfx_capture_success'] = () => {
    tone(523, 0, 0.1, { type: 'sine', gain: 0.12 });
    tone(659, 0.1, 0.1, { type: 'sine', gain: 0.12 });
    tone(784, 0.2, 0.12, { type: 'sine', gain: 0.12 });
    tone(1047, 0.32, 0.2, { type: 'sine', gain: 0.1 });
    noiseBurst(0.3, 0.08, { gain: 0.04, filter: 'highpass', freq: 4000 });
  };

  // Capture fail — ball break + escape
  SFX_HANDLERS['sfx_capture_fail'] = () => {
    noiseBurst(0, 0.08, { gain: 0.08, filter: 'bandpass', freq: 1500, q: 1 });
    toneSweep(500, 150, 0.05, 0.2, { type: 'sawtooth', gain: 0.07 });
    tone(120, 0.2, 0.1, { type: 'sine', gain: 0.05 });
  };
}

// ── Progression SFX (6) ───────────────────────────────────────
function registerProgressionSFX() {
  // Level up — ascending sparkles
  SFX_HANDLERS['sfx_levelup'] = () => {
    tone(523, 0, 0.08, { type: 'sine', gain: 0.1 });
    tone(784, 0.08, 0.08, { type: 'sine', gain: 0.1 });
    tone(1047, 0.16, 0.12, { type: 'sine', gain: 0.1 });
    noiseBurst(0.16, 0.06, { gain: 0.04, filter: 'highpass', freq: 5000 });
  };

  // Evolution — radiant sweep + shimmer
  SFX_HANDLERS['sfx_evolution'] = () => {
    toneSweep(400, 1200, 0, 0.5, { type: 'sine', gain: 0.1, attack: 0.02 });
    tone(1600, 0.3, 0.25, { type: 'sine', gain: 0.05 });
    noiseBurst(0.4, 0.15, { gain: 0.04, filter: 'bandpass', freq: 3000, q: 2 });
  };

  // Hatch — shell crack + chirp
  SFX_HANDLERS['sfx_hatch'] = () => {
    noiseBurst(0, 0.05, { gain: 0.06, filter: 'highpass', freq: 2500 });
    noiseBurst(0.08, 0.05, { gain: 0.06, filter: 'highpass', freq: 2500 });
    tone(880, 0.15, 0.12, { type: 'sine', gain: 0.08 });
    tone(1320, 0.25, 0.1, { type: 'sine', gain: 0.06 });
  };

  // Bond — warm heart tone
  SFX_HANDLERS['sfx_bond'] = () => {
    tone(440, 0, 0.15, { type: 'sine', gain: 0.08 });
    tone(554, 0.08, 0.12, { type: 'sine', gain: 0.06 });
    tone(659, 0.16, 0.15, { type: 'sine', gain: 0.05 });
  };

  // Feed — munch + swallow
  SFX_HANDLERS['sfx_feed'] = () => {
    noiseBurst(0, 0.04, { gain: 0.05, filter: 'lowpass', freq: 800 });
    noiseBurst(0.06, 0.04, { gain: 0.05, filter: 'lowpass', freq: 800 });
    tone(300, 0.12, 0.08, { type: 'sine', gain: 0.04 });
  };

  // Heal — gentle restore chime
  SFX_HANDLERS['sfx_heal'] = () => {
    tone(523, 0, 0.12, { type: 'sine', gain: 0.08 });
    tone(659, 0.1, 0.12, { type: 'sine', gain: 0.08 });
    tone(784, 0.2, 0.2, { type: 'sine', gain: 0.08 });
  };
}

// ── Type SFX (Phase 7) — 12 remaining elemental types ─────────
function registerTypeSFX() {
  const types = {
    Ice: () => {
      tone(2000, 0, 0.15, { type: 'sine', gain: 0.08 });
      tone(1500, 0.05, 0.1, { type: 'sine', gain: 0.05 });
      noiseBurst(0, 0.08, { gain: 0.04, filter: 'highpass', freq: 5000 });
    },
    Poison: () => {
      toneSweep(200, 100, 0, 0.2, { type: 'sine', gain: 0.06 });
      noiseBurst(0.05, 0.1, { gain: 0.04, filter: 'bandpass', freq: 500, q: 2 });
    },
    Ground: () => {
      noiseBurst(0, 0.15, { gain: 0.1, filter: 'lowpass', freq: 150 });
      tone(80, 0, 0.2, { type: 'sine', gain: 0.08 });
    },
    Flying: () => {
      noiseBurst(0, 0.2, { gain: 0.06, filter: 'bandpass', freq: 2000, q: 0.5 });
      toneSweep(600, 300, 0, 0.15, { type: 'sine', gain: 0.04 });
    },
    Psychic: () => {
      tone(500, 0, 0.2, { type: 'sine', gain: 0.06, attack: 0.03 });
      tone(750, 0.08, 0.15, { type: 'sine', gain: 0.04 });
    },
    Bug: () => {
      for (let i = 0; i < 4; i++) tone(1000, i * 0.03, 0.02, { type: 'square', gain: 0.03 });
    },
    Rock: () => {
      noiseBurst(0, 0.1, { gain: 0.1, filter: 'lowpass', freq: 300 });
      tone(120, 0.02, 0.12, { type: 'square', gain: 0.06 });
    },
    Ghost: () => {
      tone(150, 0, 0.3, { type: 'sine', gain: 0.06, attack: 0.05 });
      tone(100, 0.1, 0.25, { type: 'sine', gain: 0.04 });
    },
    Dragon: () => {
      tone(80, 0, 0.3, { type: 'sawtooth', gain: 0.08 });
      tone(120, 0.05, 0.25, { type: 'sawtooth', gain: 0.04 });
      noiseBurst(0, 0.15, { gain: 0.05, filter: 'lowpass', freq: 400 });
    },
    Dark: () => {
      tone(100, 0, 0.25, { type: 'sine', gain: 0.07, attack: 0.02 });
      tone(70, 0.08, 0.2, { type: 'sine', gain: 0.04 });
    },
    Steel: () => {
      tone(1500, 0, 0.08, { type: 'square', gain: 0.06 });
      tone(2000, 0.03, 0.06, { type: 'square', gain: 0.04 });
      noiseBurst(0, 0.05, { gain: 0.05, filter: 'bandpass', freq: 3000, q: 3 });
    },
    Fairy: () => {
      const notes = [1318, 1568, 1760];
      notes.forEach((f, i) => tone(f, i * 0.05, 0.1, { type: 'sine', gain: 0.05 }));
    },
  };
  for (const [type, fn] of Object.entries(types)) {
    SFX_HANDLERS[`sfx_skill_${type.toLowerCase()}`] = fn;
  }
}

// ── UI SFX (Phase 4) ──────────────────────────────────────────
function registerUISFX() {
  // Click — short tick
  SFX_HANDLERS['sfx_ui_click'] = () => {
    tone(800, 0, 0.03, { type: 'sine', gain: 0.06 });
  };

  // Tab — quick sweep up
  SFX_HANDLERS['sfx_ui_tab'] = () => {
    toneSweep(600, 900, 0, 0.05, { type: 'sine', gain: 0.06 });
  };

  // Open — rising sweep
  SFX_HANDLERS['sfx_ui_open'] = () => {
    toneSweep(400, 800, 0, 0.08, { type: 'sine', gain: 0.07 });
  };

  // Close — falling sweep
  SFX_HANDLERS['sfx_ui_close'] = () => {
    toneSweep(800, 400, 0, 0.08, { type: 'sine', gain: 0.07 });
  };
}

// ── BGM Player (Phase 2) ──────────────────────────────────────
// Procedural zone music via look-ahead scheduler + 800ms crossfade.
// 4 zone patterns: ranch (70 BPM), grassland (100 BPM), cave (85 BPM), boss (140 BPM).
// No external files; all synthesis via Web Audio API.

let bgmBus = null;          // dedicated BGM gain bus → masterGain
let bgmTimer = null;        // setInterval handle for look-ahead scheduler
let bgmNextNoteTime = 0;    // Web Audio time of next scheduled note
let bgmCurrentStep = 0;     // 0..15 step cursor within the pattern
let bgmPattern = null;      // current zone pattern object
let bgmActiveZone = null;   // current zone key ('ranch'|'grassland'|'cave'|'boss')

const BGM_LOOK_AHEAD = 0.1;   // schedule notes 100ms ahead
const BGM_INTERVAL = 25;      // 25ms scheduler tick
const BGM_CROSSFADE = 0.8;    // 800ms crossfade duration
const PATTERN_STEPS = 16;

// Map zone keys used by game-v800.js → BGM pattern ids.
// game-v800 uses 'hub' for the ranch area; we treat 'hub' as 'ranch' BGM.
const ZONE_TO_BGM = { hub: 'ranch', grassland: 'grassland', cave: 'cave', boss: 'boss' };

// Pentatonic scale degrees → semitone offsets from root.
const PENTATONIC = [0, 2, 4, 7, 9];

// Zone pattern definitions. Each pattern is 16 steps (16th notes).
// bass/lead arrays contain scale-degree indices (0-4) or null for rests.
// pad is a list of sustained chord slots. drum is per-track step hits.
const BGM_PATTERNS = {
  ranch: {
    bpm: 70,
    rootFreq: 261.63,                  // C4
    scale: PENTATONIC,                 // C major pentatonic
    bass: [0, null, null, null, 4, null, null, null, 0, null, null, null, 3, null, null, null],
    lead: [2, null, 1, null, 2, null, 4, null, 3, null, 2, null, 1, null, 0, null],
    pad: [{ step: 0, degree: 0, dur: 8 }, { step: 8, degree: 4, dur: 8 }],
    drum: {
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    leadType: 'triangle',
    bassType: 'sine',
    leadGain: 0.05,
    bassGain: 0.07,
    padGain: 0.03,
  },
  grassland: {
    bpm: 100,
    rootFreq: 174.61,                 // F3
    scale: PENTATONIC,                 // F major pentatonic
    bass: [0, null, null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null],
    lead: [2, null, 3, null, 4, null, 3, null, 2, null, 1, null, 2, null, 0, null],
    pad: [{ step: 0, degree: 0, dur: 16 }],
    drum: {
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    },
    leadType: 'sine',
    bassType: 'triangle',
    leadGain: 0.06,
    bassGain: 0.06,
    padGain: 0.025,
  },
  cave: {
    bpm: 85,
    rootFreq: 220.00,                  // A3
    scale: PENTATONIC,                 // A minor pentatonic (same intervals)
    bass: [0, null, null, null, null, null, null, null, 0, null, null, null, null, null, null, null],
    lead: [4, null, null, null, 3, null, null, null, 2, null, null, null, 1, null, null, null],
    pad: [{ step: 0, degree: 0, dur: 16 }],
    drum: {
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    leadType: 'sine',
    bassType: 'sine',
    leadGain: 0.04,
    bassGain: 0.08,
    padGain: 0.03,
  },
  boss: {
    bpm: 140,
    rootFreq: 146.83,                  // D3
    scale: PENTATONIC,                 // D minor pentatonic (same intervals)
    bass: [0, null, 0, null, 4, null, 4, null, 0, null, 0, null, 3, null, 3, null],
    lead: [2, null, 4, null, 3, null, 2, null, 4, null, 3, null, 2, null, 1, null],
    pad: [{ step: 0, degree: 0, dur: 16 }],
    drum: {
      kick:  [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    },
    leadType: 'square',
    bassType: 'sawtooth',
    leadGain: 0.05,
    bassGain: 0.07,
    padGain: 0.03,
  },
};

// ── BGM bus setup ─────────────────────────────────────────────
function ensureBgmBus() {
  if (bgmBus || !ctx) return;
  bgmBus = ctx.createGain();
  bgmBus.gain.value = 0;
  bgmBus.connect(masterGain);
}

// ── Pitch helper ──────────────────────────────────────────────
// degreeIndex is 0-4 into the pentatonic scale; octave shifts the root.
function bgmFreq(pattern, degreeIndex, octave = 0) {
  const semis = pattern.scale[degreeIndex] + octave * 12;
  return pattern.rootFreq * Math.pow(2, semis / 12);
}

// ── Note schedulers (play onto a specific destination node) ───
function bgmTone(freq, time, dur, { type = 'sine', gain = 0.1, attack = 0.005 } = {}, dest) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(dest);
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(gain, time + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.start(time);
  osc.stop(time + dur + 0.05);
}

function bgmNoise(time, dur, { gain = 0.1, filter = 'highpass', freq = 1000, q = 1 } = {}, dest) {
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
  g.connect(dest);
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.start(time);
  src.stop(time + dur + 0.02);
}

function bgmKick(time, dest) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
  osc.connect(g);
  g.connect(dest);
  g.gain.setValueAtTime(0.18, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
  osc.start(time);
  osc.stop(time + 0.14);
}

// ── Step duration (seconds per 16th note at pattern BPM) ─────
function stepDur(pattern) {
  return 60 / pattern.bpm / 4;
}

// ── Schedule one pattern step ─────────────────────────────────
function scheduleStep(pattern, step, time, dest) {
  const bDeg = pattern.bass[step];
  if (bDeg !== null && bDeg !== undefined) {
    bgmTone(bgmFreq(pattern, bDeg, -1), time, 0.18, { type: pattern.bassType, gain: pattern.bassGain }, dest);
  }
  const lDeg = pattern.lead[step];
  if (lDeg !== null && lDeg !== undefined) {
    bgmTone(bgmFreq(pattern, lDeg, 1), time, 0.22, { type: pattern.leadType, gain: pattern.leadGain }, dest);
  }
  const d = pattern.drum;
  if (d.kick[step]) bgmKick(time, dest);
  if (d.snare[step]) bgmNoise(time, 0.12, { gain: 0.08, filter: 'bandpass', freq: 1800, q: 0.8 }, dest);
  if (d.hihat[step]) bgmNoise(time, 0.04, { gain: 0.04, filter: 'highpass', freq: 6000 }, dest);
}

// ── Pad scheduling (long sustained notes when slot starts) ───
function schedulePads(pattern, step, time, dest) {
  for (const p of pattern.pad) {
    if (p.step === step) {
      bgmTone(bgmFreq(pattern, p.degree, 0), time, p.dur * stepDur(pattern), { type: 'sine', gain: pattern.padGain, attack: 0.4 }, dest);
    }
  }
}

// ── Look-ahead scheduler tick ─────────────────────────────────
function bgmTick() {
  if (!ctx || !bgmPattern) return;
  const sd = stepDur(bgmPattern);
  while (bgmNextNoteTime < ctx.currentTime + BGM_LOOK_AHEAD) {
    scheduleStep(bgmPattern, bgmCurrentStep, bgmNextNoteTime, bgmBus);
    schedulePads(bgmPattern, bgmCurrentStep, bgmNextNoteTime, bgmBus);
    bgmNextNoteTime += sd;
    bgmCurrentStep = (bgmCurrentStep + 1) % PATTERN_STEPS;
  }
}

// ── Export: playBGM(zone) ─────────────────────────────────────
export function playBGM(zone) {
  if (!ctx) return;
  ensureBgmBus();
  const bgmKey = ZONE_TO_BGM[zone] || zone;
  const pattern = BGM_PATTERNS[bgmKey];
  if (!pattern) return;
  if (bgmActiveZone === bgmKey && bgmTimer) return; // same zone, no-op

  const t = ctx.currentTime;
  // Fade existing bus out (crossfade overlap), then schedule fade-in.
  bgmBus.gain.cancelScheduledValues(t);
  bgmBus.gain.setValueAtTime(bgmBus.gain.value, t);
  bgmBus.gain.linearRampToValueAtTime(0, t + BGM_CROSSFADE);

  // Start scheduler if not running.
  if (!bgmTimer) bgmTimer = setInterval(bgmTick, BGM_INTERVAL);

  bgmPattern = pattern;
  bgmActiveZone = bgmKey;
  bgmCurrentStep = 0;
  bgmNextNoteTime = t + 0.05;

  // After the old layer fades out, ramp the bus back up for the new zone.
  bgmBus.gain.setValueAtTime(0, t + BGM_CROSSFADE);
  bgmBus.gain.linearRampToValueAtTime(1, t + BGM_CROSSFADE + BGM_CROSSFADE);
}

// ── Export: stopBGM() ─────────────────────────────────────────
export function stopBGM() {
  if (!ctx || !bgmTimer) return;
  const t = ctx.currentTime;
  bgmBus.gain.cancelScheduledValues(t);
  bgmBus.gain.setValueAtTime(bgmBus.gain.value, t);
  bgmBus.gain.linearRampToValueAtTime(0, t + BGM_CROSSFADE);
  const fadeMs = (BGM_CROSSFADE + 0.05) * 1000;
  setTimeout(() => {
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    bgmPattern = null;
    bgmActiveZone = null;
    bgmCurrentStep = 0;
    bgmNextNoteTime = 0;
  }, fadeMs);
}

// ── Export: getCurrentBGM() (for tests/debug) ─────────────────
export function getCurrentBGM() { return bgmActiveZone; }

// ── Ambient Sound (Phase 5) ───────────────────────────────────
let ambBus = null;
let ambTimer = null;
let ambActiveZone = null;

export function startAmbient(zone) {
  if (!ctx) return;
  stopAmbient();
  if (zone === 'hub') zone = 'ranch';
  if (!['ranch', 'grassland', 'cave'].includes(zone)) return;
  ambBus = ctx.createGain();
  ambBus.gain.value = 0;
  ambBus.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.8);
  ambBus.connect(masterGain);
  ambActiveZone = zone;
  const patterns = {
    ranch: () => {
      noiseBurstTo(ambBus, 0, 2, { gain: 0.02, filter: 'lowpass', freq: 500 });
      const chirp = () => {
        if (!ambBus || ambActiveZone !== 'ranch') return;
        const f = 2000 + Math.random() * 1000;
        toneTo(ambBus, f, 0, 0.08, { type: 'sine', gain: 0.03 });
        toneTo(ambBus, f * 1.2, 0.06, 0.06, { type: 'sine', gain: 0.02 });
      };
      const next = 3000 + Math.random() * 5000;
      ambTimer = setTimeout(() => { chirp(); if (ambActiveZone === 'ranch') scheduleNext(patterns.ranch); }, next);
    },
    grassland: () => {
      noiseBurstTo(ambBus, 0, 3, { gain: 0.03, filter: 'lowpass', freq: 400 });
      const cricket = () => {
        if (!ambBus || ambActiveZone !== 'grassland') return;
        for (let i = 0; i < 3; i++) {
          toneTo(ambBus, 4000, i * 0.04, 0.03, { type: 'sine', gain: 0.015 });
        }
      };
      const next = 2000 + Math.random() * 3000;
      ambTimer = setTimeout(() => { cricket(); if (ambActiveZone === 'grassland') scheduleNext(patterns.grassland); }, next);
    },
    cave: () => {
      toneTo(ambBus, 80, 0, 4, { type: 'sine', gain: 0.02, attack: 0.5 });
      const drop = () => {
        if (!ambBus || ambActiveZone !== 'cave') return;
        toneTo(ambBus, 800 + Math.random() * 400, 0, 0.3, { type: 'sine', gain: 0.04, attack: 0.005 });
        toneTo(ambBus, 400, 0.1, 0.4, { type: 'sine', gain: 0.02 });
      };
      const next = 4000 + Math.random() * 8000;
      ambTimer = setTimeout(() => { drop(); if (ambActiveZone === 'cave') scheduleNext(patterns.cave); }, next);
    },
  };
  const scheduleNext = (fn) => { if (ambActiveZone) fn(); };
  patterns[zone]();
}

export function stopAmbient() {
  if (ambTimer) { clearTimeout(ambTimer); ambTimer = null; }
  if (ambBus && ctx) {
    ambBus.gain.cancelScheduledValues(ctx.currentTime);
    ambBus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    const old = ambBus;
    setTimeout(() => old.disconnect(), 400);
  }
  ambBus = null;
  ambActiveZone = null;
}

// Helpers for routing to specific bus
function toneTo(bus, freq, start, dur, { type = 'sine', gain = 0.2, attack = 0.005 } = {}) {
  if (!ctx || !bus) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(bus);
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noiseBurstTo(bus, start, dur, { gain = 0.15, filter = 'highpass', freq = 2000, q = 1 } = {}) {
  if (!ctx || !bus) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = filter; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  src.connect(f);
  f.connect(g);
  g.connect(bus);
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.start(t);
  src.stop(t + dur + 0.02);
}