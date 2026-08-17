# Audio & Music Plan V8 — เสียงดนตรีประกอบแนวผจญภัย

> เพิ่มระบบเสียงและดนตรีประกอบให้ Monster Life RPG แนวผจญภัย
> ใช้ Web Audio API procedural synthesis — ไม่ต้องโหลดไฟล์เสียง
> Owner: Hermes (plan) → Cursor Agent (implement) → Hermes (review/merge)
> Status: DRAFT — ยังไม่ push รอผู้ใช้อนุมัติ

---

## 1. ภาพรวม

เสียงทั้งหมดสร้างด้วย Web Audio API (oscillator + filter + gain) ไม่ต้องดาวน์โหลดไฟล์ ไม่ต้องมี server เสียงเกิงจากการคำนวณในเบราว์เซอร์โดยตรง ขนาดเพิ่มเพียง ~800 บรรทัดในไฟล์ใหม่ `audio-engine.mjs`

### หลักการ
- ไม่ใช้ไฟล์เสียง (mp3/wav/ogg) — ใช้ procedural synthesis ทั้งหมด
- ทำงานบนมือถือได้ (CPU ต่ำ ไม่มี latency จากการโหลด)
- เสียงเริ่มเมื่อผู้เล่น interact ครั้งแรก (browser autoplay policy)
- มีปุ่มเปิด/ปิดเสียง + ปรับระดับเสียง
- เสียงทุกอย่างผ่านระบบเดียว ควบคุมจาก AudioContext เดียว

---

## 2. รายการเสียง (Sound Catalog)

### 2.1 ดนตรีประกอบ (BGM) — 3 โซน + 1 ห้องผู้การ

| โซน | แนวเพลง | จังหวะ | เครื่องดนตรี (synth) | อารมณ์ |
|-----|---------|--------|---------------------|--------|
| Ranch Hub | อบอุ่น สงบ | 70 BPM | acoustic guitar pluck + soft pad | บ้าน พักผ่อน |
| Green Meadow | ผจญภัยร่มรื่น | 100 BPM | flute lead + harp arpeggio + light percussion | ออกล่า สำรวจ |
| Echo Cave | ลึกลับ ตึงเครียด | 85 BPM | deep drone + bell + low percussion | ระวังอันตราย |
| Boss Battle | ตื่นเต้นเร้าใจ | 140 BPM | driving bass + brass stabs + fast drums | บอส ดุ |

### 2.2 เอฟเฟกต์เสียง (SFX) — 22 เสียง

#### 2.2.1 Combat SFX (8)

| ID | เหตุการณ์ | เสียง | ระยะ | วิธีสร้าง |
|----|---------|-------|------|---------|
| sfx_hit_normal | โจมตีปกติ | ฟันดาบชิป | 150ms | square wave sweep 800→200Hz + noise burst |
| sfx_hit_effective | โจมตีโดนจุดอ่อน | กระจางแสง | 200ms | sine sweep 400→1200Hz + shimmer |
| sfx_hit_weak | โจมตีโดนน้อย | ทือบ หนึบ | 100ms | low square 200→80Hz quick decay |
| sfx_skill_fire | สกิลไฟ | ลุกไหม้ | 300ms | noise + low sine 100Hz + crackle |
| sfx_skill_water | สกิลน้ำ | สาดน้ำ | 250ms | filtered noise sweep + sine bubble |
| sfx_skill_electric | สกิลไฟฟ้า | ปาด! | 200ms | sawtooth 1000Hz + noise zap |
| sfx_skill_grass | สกิลพืช | ใบไม้ | 250ms | soft sine 400Hz + leaf rustle noise |
| sfx_faint | มอนสลบ | ดิ่งลง | 400ms | descending sine 400→60Hz + reverb tail |

#### 2.2.2 Capture SFX (4)

| ID | เหตุการณ์ | เสียง | ระยะ | วิธีสร้าง |
|----|---------|-------|------|---------|
| sfx_throw_ball | ขว้างบอล | ปัด! | 120ms | short noise burst + sine pop |
| sfx_capture_tension | ลูกสั่นรอผล | หัวใจเต้น | 1700ms | heartbeat pattern × 5 |
| sfx_capture_success | จับสำเร็จ | แฟนแฟน! | 500ms | rising arpeggio C-E-G-C + sparkle |
| sfx_capture_fail | จับไม่สำเร็จ | เสียงหล่น | 300ms | descending tone 400→100Hz + thud |

#### 2.2.3 Progression SFX (6)

| ID | เหตุการณ์ | เสียง | ระยะ | วิธีสร้าง |
|----|---------|-------|------|---------|
| sfx_levelup | เลเวลอัป | แฟนแฟน! | 600ms | ascending arpeggio + bell + sparkle |
| sfx_evolution | วิวัฒนาการ | แสงวิ่ง | 1200ms | rising pad + chime cascade |
| sfx_hatch | ฟักไข่ | เป๊ะ! | 400ms | crack + pop + sparkle |
| sfx_bond | พันธมิตรเพิ่ม | หัวใจ | 300ms | soft heart + chime |
| sfx_feed | ให้อาหาร | เคี้ยว | 250ms | soft pop + crunch noise |
| sfx_heal | รักษา | สว่าง | 500ms | rising sine + shimmer |

#### 2.2.4 UI SFX (4)

| ID | เหตุการณ์ | เสียง | ระยะ | วิธีสร้าง |
|----|---------|-------|------|---------|
| sfx_ui_click | คลิกปุ่ม | ติ๊ก | 50ms | short sine 800Hz |
| sfx_ui_tab | เปลี่ยนแท็บ | ปั๊ว | 80ms | sine 600→900Hz |
| sfx_ui_open | เปิดเมนู | แวบ | 100ms | sine sweep 400→800Hz |
| sfx_ui_close | ปิดเมนู | แวบลง | 100ms | sine sweep 800→400Hz |

#### 2.2.5 Ambient SFX (3 แบบต่อเนื่อง)

| ID | โซน | เสียง | วิธีสร้าง |
|----|-----|-------|---------|
| amb_hub | Ranch | นกเรียก + ลม | filtered noise + periodic sine chirp |
| amb_grassland | Meadow | ลม + แมลง | low noise + cricket pattern |
| amb_cave | Cave | หยดน้ำ + echo | random sine drops + long reverb |

---

## 3. สถาปัตยกรรม

### 3.1 ไฟล์ใหม่: `audio-engine.mjs`

```
audio-engine.mjs
├── AudioContext setup (lazy init on first user gesture)
├── Master gain (volume control)
├── Music bus → BGM player (loop scheduler)
├── SFX bus → one-shot sound player
├── Ambient bus → continuous ambient player
└── Export: initAudio(), playSFX(id), playBGM(zone), stopBGM(), setVolume(v), toggleMute()
```

### 3.2 การผูกเข้ากับ game-v800.js

```js
import { initAudio, playSFX, playBGM, stopBGM, setVolume, toggleMute }
  from './audio-engine.mjs';

// Boot: init AudioContext on first user gesture
addEventListener('pointerdown', () => initAudio(), { once: true });
addEventListener('keydown', () => initAudio(), { once: true });

// Zone change → BGM switch
function switchZone(zone, silent = false) {
  // ... existing code ...
  playBGM(zone);  // เพิ่มบรรทัดนี้
}

// Combat events → SFX
function damageWild(w, dmg, meta) {
  // ... existing code ...
  if (meta.eff > 1) playSFX('sfx_hit_effective');
  else if (meta.eff < 1) playSFX('sfx_hit_weak');
  else playSFX('sfx_hit_normal');
}

function defeatWild(w) {
  // ... existing code ...
  playSFX('sfx_faint');
}

// Capture events
function executeCaptureThrow() {
  // ... existing ...
  playSFX('sfx_throw_ball');
}

// capture result
if (success) playSFX('sfx_capture_success');
else playSFX('sfx_capture_fail');

// Capture tension
playSFX('sfx_capture_tension');

// Level up
playSFX('sfx_levelup');

// Evolution
playSFX('sfx_evolution');

// Hatch
playSFX('sfx_hatch');

// Feed
playSFX('sfx_feed');

// Heal
playSFX('sfx_heal');

// UI
button.onclick = () => { playSFX('sfx_ui_click'); ... };
```

### 3.3 การควบคุมเสียงใน UI

เพิ่มปุ่ม mute + slider ระดับเสียงใน utility menu:

```html
<!-- ใน #utilityMenu -->
<div class="audio-controls">
  <button id="muteBtn" class="utility-btn">🔊 เสียงเปิด</button>
  <input id="volumeSlider" type="range" min="0" max="100" value="60">
</div>
```

---

## 4. BGM Player Design (Procedural Music)

### 4.1 Scheduler

ใช้ look-ahead scheduler มาตรฐานสำหรับ Web Audio:
- `setInterval` ทุก 25ms → ตรวจว่ามี note ถัดไปภายใน 100ms ไหม
- ถ้ามี → schedule oscillator ล่วงหน้าด้วย `audioContext.currentTime`
- ทำให้เสียงต่อเนื่องไม่มดในแม่นยำแม้ frame หลุด

### 4.2 โครงสร้างเพลง

แต่ละโซนมี:
1. **Bass line** — โน้ตต่ำซ้ำตาม pattern (root note + 5th)
2. **Lead melody** — โน้ตหลักตาม pattern หมุนเวียน (แต่งจาก pentatonic scale)
3. **Pad/chord** — chord ค้างเบา ๆ เป็นพื้นหลัง
4. **Percussion** — kick/snare/hihat ทำจาก noise + envelope

### 4.3 Pattern Format

```js
// แต่ละ pattern = 16 steps (16th notes)
const PATTERN_STEPS = 16;

const ranchBGM = {
  bpm: 70,
  scale: [0, 2, 4, 7, 9],       // C major pentatonic
  rootFreq: 261.63,              // C4
  bass:   [0, null, null, null, 7, null, null, null, 0, null, null, null, 5, null, null, null],
  lead:   [4, null, 2, null, 4, null, 7, null, 9, null, 7, null, 4, null, 2, null],
  pad:    [{ step: 0,  degree: 0, dur: 8 }, { step: 8, degree: 4, dur: 8 }],
  drum:   { kick: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0] },
};
```

### 4.4 แต่ละโซน

#### Ranch Hub (70 BPM)
- Mood: อบอุ่น สงบ คล้ายบ้านนอก
- Scale: C major pentatonic
- Instruments: acoustic guitar pluck (triangle wave + short envelope), soft pad (sine + slow attack)
- Percussion: ไม่มี หรือ soft kick เบา ๆ

#### Green Meadow (100 BPM)
- Mood: ผจญภัยร่มรื่น ออกล่า
- Scale: F major pentatonic
- Instruments: flute lead (sine + vibrato), harp arpeggio (triangle + fast decay), light percussion (noise hi-hat + kick)
- Percussion: kick on 1 & 9, snare on 5 & 13, hi-hat 8th notes

#### Echo Cave (85 BPM)
- Mood: ลึกลับ ตึงเครียด ระวังอันตราย
- Scale: A minor pentatonic
- Instruments: deep drone (sine 110Hz + slow filter), bell (sine + long decay), low percussion (kick + reverb)
- Percussion: kick on 1 & 9, rare snare, no hi-hat

#### Boss Battle (140 BPM)
- Mood: ตื่นเต้นเร้าใจ บอสดุ
- Scale: D minor pentatonic
- Instruments: driving bass (sawtooth + filter), brass stabs (square + quick env), fast drums (kick + snare + hi-hat)
- Percussion: kick on 1,4,7,10,13,16 / snare on 5,13 / hi-hat 16th notes

### 4.5 Crossfade ระหว่างโซน

เมื่อเปลี่ยนโซน:
1. BGM เดิม fade out 800ms (gain ramp จากปัจจุบัน → 0)
2. BGM ใหม่ fade in 800ms (gain ramp 0 → volume)
3. ไม่มีช่วงเงียบ — crossfade ทับซ้อน

---

## 5. SFX Synthesis Details

### 5.1 Utility Functions

```js
function tone(ctx, freq, start, dur, { type='sine', gain=0.3, attack=0.005, release=0.05 } = {}) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g).connect(ctx.destination);
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.start(t);
  osc.stop(t + dur + release);
}

function noise(ctx, start, dur, { gain=0.2, filter='bandpass', freq=1000, q=1 } = {}) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const f = ctx.createBiquadFilter();
  f.type = filter; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  src.connect(f).connect(g).connect(ctx.destination);
  g.gain.setValueAtTime(gain, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
  src.start(ctx.currentTime + start);
  src.stop(ctx.currentTime + start + dur);
}
```

### 5.2 ตัวอย่าง SFX

```js
// Hit normal — ฟันดาบชิป
function sfxHitNormal() {
  tone(ctx, 800, 0, 0.05, { type: 'square', gain: 0.15 });
  tone(ctx, 200, 0.02, 0.08, { type: 'sine', gain: 0.1 });
  noise(ctx, 0, 0.04, { gain: 0.08, filter: 'highpass', freq: 2000 });
}

// Level up — ascending arpeggio
function sfxLevelUp() {
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((f, i) => tone(ctx, f, i * 0.08, 0.2, { type: 'sine', gain: 0.15 }));
  tone(ctx, 2093, 0.32, 0.3, { type: 'sine', gain: 0.08 }); // sparkle C7
}

// Capture tension — heartbeat
function sfxCaptureTension() {
  for (let i = 0; i < 5; i++) {
    const t = i * 0.34;
    tone(ctx, 60, t, 0.08, { type: 'sine', gain: 0.2 });      // thump 1
    tone(ctx, 60, t + 0.1, 0.06, { type: 'sine', gain: 0.12 }); // thump 2
  }
}

// Evolution — rising pad + chime cascade
function sfxEvolution() {
  for (let i = 0; i < 8; i++) {
    const freq = 261.63 * Math.pow(2, i / 12); // chromatic rise
    tone(ctx, freq, i * 0.1, 0.15, { type: 'sine', gain: 0.1 });
  }
  tone(ctx, 1046.5, 0.8, 0.4, { type: 'sine', gain: 0.15 }); // final chime
}
```

---

## 6. Ambient Sound Design

แต่ละโซนมี ambient sound ต่อเนื่องเบา ๆ ข้างหลัง BGM:

```js
// Hub ambient — นกเรียก + ลม
function startHubAmbient() {
  // Low wind: filtered noise gain 0.02
  // Bird chirp: random sine 2000-3000Hz every 3-8 seconds, 80ms
}

// Grassland ambient — ลม + แมลง
function startGrasslandAmbient() {
  // Wind: noise lowpass 500Hz gain 0.03
  // Cricket: sine 4000Hz × 3 pulses every 2-5 seconds
}

// Cave ambient — หยดน้ำ + echo
function startCaveAmbient() {
  // Drop: sine 800Hz + reverb, random every 4-12 seconds
  // Background drone: sine 80Hz gain 0.02
}
```

Ambient ใช้ `setInterval` สุ่มจังหวะเสียง (ไม่ใช่ pattern ตายตัว) ทำให้ธรรมชาติกว่า

---

## 7. Performance Budget

| ส่วน | CPU | จำนวน oscillator | หน่วยความจำ |
|------|-----|-----------------|-----------|
| BGM | ~0.5% | 4-6 active | < 1MB |
| SFX | ~0.2% per shot | 1-4 per shot | < 100KB |
| Ambient | ~0.1% | 1-2 active | < 100KB |
| รวม | < 1% | max 8 concurrent | < 1.2MB |

- มือถือระดับกลาง รันได้สบาย (เปรียบเทียบกับ 3D render ที่ใช้ ~30% GPU)
- ถ้า frame ต่ำ → ลด BGM voices จาก 4 เป็น 2 อัตโนมัติ
- ไม่มีไฟล์โหลด → ไม่มี network latency

---

## 8. แผนการทำ (7 Phases — 1 Phase = 1 PR)

### Phase 1: สร้าง audio-engine.mjs + SFX พื้นฐาน (8 combat SFX)

สร้างไฟล์ `audio-engine.mjs`:
- AudioContext lazy init
- Master gain + mute
- `playSFX(id)` function
- 8 combat SFX (hit_normal, hit_effective, hit_weak, skill_fire, skill_water, skill_electric, skill_grass, faint)
- Export: initAudio, playSFX, setVolume, toggleMute

ผูกเข้า game-v800.js:
- import audio-engine
- initAudio on first pointerdown/keydown
- เรียก playSFX ใน damageWild, useSkill, defeatWild, faintActive

Test:
- `tests/v80-audio-engine.mjs` — ตรวจว่า audio-engine.mjs มี export ครบ, playSFX รับ id ถูก
- `tests/v80-audio-engine-mutants.mjs` — ตรวจว่าไม่มีการโหลดไฟล์เสียง, มี AudioContext lazy init

Acceptance: `npm run ci` ผ่าน, SFX ดังในเบราว์เซอร์

### Phase 2: BGM Player — 4 โซน + crossfade

เพิ่มใน `audio-engine.mjs`:
- BGM scheduler (look-ahead pattern player)
- 4 BGM patterns (ranch, grassland, cave, boss)
- `playBGM(zone)` + `stopBGM()`
- Crossfade 800ms ระหว่างโซน
- 4 channel buffers (bass, lead, pad, drum)

ผูกเข้า game-v800.js:
- `switchZone()` เรียก `playBGM(zone)`
- Boss battle เรียก `playBGM('boss')` แทนเพลงโซน

Test:
- ตรวจว่า playBGM รับ zone ถูก, มี crossfade, ไม่มี gap

Acceptance: `npm run ci` ผ่าน, BGM เล่นต่อเนื่องในแต่ละโซน

### Phase 3: Capture + Progression SFX (10 เสียง)

เพิ่มใน `audio-engine.mjs`:
- 4 capture SFX (throw_ball, capture_tension, capture_success, capture_fail)
- 6 progression SFX (levelup, evolution, hatch, bond, feed, heal)

ผูกเข้า game-v800.js:
- executeCaptureThrow → sfx_throw_ball
- capture tension loop → sfx_capture_tension
- capture result → sfx_capture_success / sfx_capture_fail
- spawnLevelUpEffect → sfx_levelup
- evolveMonster → sfx_evolution
- hatchEgg → sfx_hatch
- feedMonster → sfx_feed
- healAll → sfx_heal

Acceptance: `npm run ci` ผ่าน

### Phase 4: UI SFX (4 เสียง)

เพิ่มใน `audio-engine.mjs`:
- 4 UI SFX (click, tab, open, close)

ผูกเข้า game-v800.js:
- ปุ่มทุกปุ่ม → sfx_ui_click
- เปลี่ยนแท็บ → sfx_ui_tab
- เปิด/ปิด manager → sfx_ui_open / sfx_ui_close

Acceptance: `npm run ci` ผ่าน

### Phase 5: Ambient Sound (3 โซน)

เพิ่มใน `audio-engine.mjs`:
- 3 ambient generators (hub, grassland, cave)
- `startAmbient(zone)` + `stopAmbient()`
- ใช้ setInterval สุ่มจังหวะ

ผูกเข้า game-v800.js:
- `switchZone()` เรียก `startAmbient(zone)` + `stopAmbient()`

Acceptance: `npm run ci` ผ่าน

### Phase 6: UI Controls + Settings

เพิ่มใน index.html + v800.html:
- ปุ่ม mute ใน utility menu
- Volume slider
- บันทึกค่าใน localStorage (audio: { muted, volume })

เพิ่มใน game-v800.js:
- โหลด/บันทึก audio settings
- ปุ่ม mute toggle
- Volume slider → setVolume()

Acceptance: `npm run ci` ผ่าน, ปุ่มทำงาน, ค่า persist ข้าม session

### Phase 7: Type-specific Skill SFX + Combat Dynamic

เพิ่ม SFX ตามธาตุที่เหลือ (18 ธาตุ):
- Ice: หนาวเสียว (sine 2000Hz + slow decay)
- Poison: ฟองพิษ (sine 200Hz + noise bubble)
- Ground: ดินถล่ม (noise lowpass 100Hz + rumble)
- Flying: ลมหวือ (noise sweep + sine)
- Psychic: จิต (sine 500Hz + vibrato)
- Bug: แมลง (sine 1000Hz + rapid modulation)
- Rock: หินทุบ (noise burst + low thud)
- Ghost: วิญญาณ (sine 150Hz + slow wobble)
- Dragon: คำราม (sawtooth 80Hz + distortion)
- Dark: มืด (sine 100Hz + reverb)
- Steel: เหล็กกระทบ (square 1500Hz + metallic ring)
- Fairy: ภูติ (sine 1500Hz + sparkle arpeggio)
- Normal: ปกติ (square 500Hz + noise)

Combat dynamic:
- เมื่อ HP ต่ำ → BGM เพิ่ม tension layer (drum เร็วขึ้น + filter แคบลง)
- เมื่อจับบอส → BGM เปลี่ยนเป็น boss pattern
- เมื่อชนะบอส → victory jingle

Test:
- `tests/v80-audio-type-sfx.mjs` — ตรวจว่าทุกธาตุมี SFX
- `tests/v80-audio-type-sfx-mutants.mjs` — ตรวจว่าไม่ขาดธาตุ

Acceptance: `npm run ci` ผ่าน, เสียงทุกธาตุแตกต่างกัน

---

## 9. ลำดับการทำงาน

| Phase | ไฟล์ | ผู้ทำ | การตรวจ |
|-------|------|------|---------|
| 1: audio-engine + combat SFX | audio-engine.mjs (ใหม่) + game-v800.js | Cursor | Hermes + ci |
| 2: BGM player 4 zones | audio-engine.mjs + game-v800.js | Cursor | Hermes + ci |
| 3: Capture + progression SFX | audio-engine.mjs + game-v800.js | Cursor | Hermes + ci |
| 4: UI SFX | audio-engine.mjs + game-v800.js | Cursor | Hermes + ci |
| 5: Ambient sound | audio-engine.mjs + game-v800.js | Cursor | Hermes + ci |
| 6: UI controls + settings | index.html + v800.html + game-v800.js | Cursor | Hermes + ci |
| 7: Type SFX + combat dynamic | audio-engine.mjs + game-v800.js | Cursor | Hermes + ci |

---

## 10. ข้อควรระวัง

1. **Browser autoplay policy** — AudioContext ต้อง resume หลัง user gesture แรก ถ้าสร้างก่อน → suspended
2. **Mobile CPU** — oscillator 4-6 ตัวพร้อมกันใน BGM ถ้า frame ตก ลดเหลือ 2
3. **No external files** — ทุกเสียง procedural ไม่โหลดจาก URL ป้องกัน CORS/network issue
4. **Gain staging** — master gain 0.6 default, SFX 0.15-0.3, BGM 0.1, ambient 0.03 รวมไม่เกิน 0.8
5. **index.html = v800.html** — ถ้าเพิ่มปุ่ม audio ใน HTML ต้องแก้ทั้งสองไฟล์
6. **package.json test list** — เพิ่ม test ใหม่ใน test script
7. **Audio settings persist** — mute/volume บันทึกใน localStorage key แยกจาก game save
8. **Lazy init** — ไม่สร้าง AudioContext จนกว่าผู้เล่น interact ครั้งแรก
9. **Cleanup on zone change** — หยุด ambient เดิมก่อนเริ่มใหม่ ไม่ให้ซ้อนทับ
10. **BGM not in save** — เพลงเป็น runtime state ไม่ save ไม่ต้อง bump save schema

---

## 11. ผลลัพธ์ที่คาดหวัง

หลังเสร็จทุก Phase:
- เข้าเกม → ได้ยินเพลง Ranch Hub อบอุ่น + เสียงนก/ลม
- ออกล่า → เพลงเปลี่ยนเป็น Green Meadow ผจญภัย + เสียงแมลง
- เข้าถ้ำ → เพลงเปลี่ยนเป็น Echo Cave ลึกลับ + เสียงหยดน้ำ
- โจมตี → ได้ยินเสียงฟันดาบ/กระแทก
- ใช้สกิล → เสียงตามธาตุ (ไฟ/น้ำ/ไฟฟ้า/พืช)
- จับมอน → เสียงขว้างบอล + หัวใจเต้นรอผล + แฟนแฟนหรือเสียงหล่น
- เลเวลอัป/วิวัฒนาการ → เสียงแฟนแฟนตื่นเต้น
- บอส → เพลงเปลี่ยนเป็น boss battle ตื่นเต้นเร้าใจ
- ปุ่มเปิด/ปิดเสียง + ปรับระดับเสียงในเมนู
- ไม่มีไฟล์เสียงโหลด — ทุกอย่าง procedural
- เพิ่ม ~800 บรรทัดใน audio-engine.mjs + ~50 บรรทัดใน game-v800.js