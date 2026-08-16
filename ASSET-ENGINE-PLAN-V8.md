# Monster Life RPG — V8.0 Asset Engine Master Plan
## แผนออกแบบระบบจัดการ Asset ทั้งหมด (3D Model, Texture, Audio, VFX, Animation)

> สร้าง: 2026-08-16
> เวอร์ชัน: 1.0
> สถานะ: เกม V8.0.0 live (procedural 3D เท่านั้น, ไม่มี external asset)
> เป้าหมาย: ออกแบบ Asset Engine แบบครบวงจร — load, cache, manage, swap
> ไฟล์ที่กระทบ: game-v800.js, style-v800.css, v800.html, ไฟล์ asset ใหม่

---

## สารบัญ

1. สถานะปัจจุบัน — Asset ที่มี / ที่ไม่มี
2. หลักออกแบบ Asset Engine
3. ประเภท Asset ทั้งหมด (8 ประเภท)
4. สถาปัตยกรรม Asset Engine
5. Asset Pipeline — โหลด/แคช/ใช้งาน
6. 3D Model System — Procedural → GLB
7. Texture & Material System
8. Audio System — SFX + BGM
9. VFX / Particle System
10. Animation System
11. Font / Icon System
12. Zone / Environment Visual
13. Asset Registry & Manifest
14. Fallback & Graceful Degradation
15. Performance Budget
16. Mobile Constraints
17. ลำดับการทำ (Implementation Phases)
18. ไฟล์ที่กระทบ
19. การตรวจรับ
20. ข้อควรระวัง

---

## 1. สถานะปัจจุบัน — Asset ที่มี / ที่ไม่มี

### 1.1 สิ่งที่มี (Procedural — ไม่มีไฟล์ภายนอก)

| ประเภท | วิธีการ | จำนวน |
|--------|--------|-------|
| 3D Monster Model | Three.js primitives (sphere, box, cone, cylinder, capsule) | 19 species + 19 evolution forms = 38 รูป |
| 3D Humanoid | buildHumanoid() — primitives ประกอบ | 2 ตัว (Player + Keeper NPC) |
| 3D Environment | พื้น, ต้นไม้, ก้อนหิน, บ่อน้ำ, แท่นผสมพันธุ์, Incubator | ~10 ชิ้น |
| VFX | spawnElementalFX, spawnBurst, spawnRingPulse, spawnDamageNumber, spawnGroundDecal | 18 type effect configs |
| Animation | animateMonster(), animateHumanoid(), animateEntity() — procedural rig | idle, walk, attack, hurt, skill |
| UI/CSS | style-v800.css — ปุ่ม, แท็บ, การ์ด, bar, popup | 193+ classes |
| Font | system-ui (native) — ไม่มี custom font | 1 |
| Color/Type | TYPE_COLOR map — 18 types สี | 18 |

### 1.2 สิ่งที่ไม่มี (External Asset ที่ต้องการ)

| ประเภท | สถานะ | ผลกระทบ |
|--------|--------|---------|
| Texture (PNG/WebP) | ไม่มีเลย | มอนเป็นสีทึบ ไม่มีลวดลาย/พื้นผิว |
| 3D Model (GLB/GLTF) | ไม่มี | มอนเป็นรูปทรงเรขาคณิตศาสตร์ |
| Sprite/2D Art | ไม่มี | ไม่มีรูปภาพประกอบ, portrait, icon |
| Audio (SFX) | ไม่มี | เกมเงียบ ไม่มีเสียงโจมตี/จับ/เลเวลอัป |
| Audio (BGM) | ไม่มี | ไม่มีเพลงพื้นหลัง |
| Custom Font | ไม่มี | ใช้ system-ui ของเครื่อง (ไม่สม่ำเสมอ) |
| Icon Set | ไม่มี | ใช้ emoji เท่านั้น |
| Animation Clip | ไม่มี | อนิเมชัน procedural ไม่มี clip บันทึก |
| Particle Texture | ไม่มี | VFX เป็นสีทึบ (sphere geometry) |
| Normal/Roughness Map | ไม่มี | พื้นผิวเรียบ ไม่มี detail |

---

## 2. หลักออกแบบ Asset Engine

### 2.1 ข้อจำกัด
- รันบนมือถือ (Android/Termux) — หน่วยความจำจำกัด (RAM ~2-4GB)
- Three.js โหลดจาก CDN (jsdelivr/unpkg) — ไม่มี node_modules
- ไม่มี build step — ไฟล์ JS รันตรงใน browser
- GitHub Pages hosting — ไฟล์ต้องเล็ก (Pages limit ~1GB)
- ไม่มี server-side — asset ต้องเป็น static file หรือ procedural

### 2.2 หลักออกแบบ
1. **Procedural-first** — ระบบปัจจุบันทำงานได้ดี ใช้เป็น fallback เสมอ
2. **Optional enhancement** — asset ภายนอกเสริม ไม่ใช่ทดแทน — ถ้าโหลดไม่ได้ ใช้ procedural
3. **Lazy loading** — โหลดเฉพาะที่ใช้ ไม่โหลดทุกอย่างตอนเริ่มเกม
4. **Cache & reuse** — geometry/material/object pool มีอยู่แล้ว ขยายต่อ
5. **Data-driven** — content-catalog.mjs เป็นต้นแบบ — asset registry ก็เป็น data
6. **No build step** — ทุกอย่างรันใน browser ได้โดยตรง
7. **Progressive enhancement** — เริ่มจาก procedural → เพิ่ม texture → เพิ่ม model → เพิ่ม audio
8. **Memory budget** — ไม่เกิน 150MB asset ที่โหลดพร้อมกัน

### 2.3 กติกา (จาก Master Plan)
- ห้าม hard-code content ใน runtime หลักเมื่อ data-driven layer พร้อม (P1)
- UI แสดง State แต่ไม่ใช่แหล่งความจริง (Table 121)
- 3D render มอนใน Ranch ได้สูงสุด 6 ตัว (Table 116)
- Training/Life State ต้องมี Visual Signal (Table 41)
- Zone ต่างกันต้องดูต่างกัน (Table 46)

---

## 3. ประเภท Asset ทั้งหมด (8 ประเภท)

### 3.1 ตารางรวม

| # | ประเภท | รูปแบบไฟล์ | ขนาดเป้าหมาย | จำนวน | ลำดับ |
|---|--------|-----------|------------|-------|-------|
| 1 | 3D Monster Model | .glb (GLTF Binary) | 50-200KB/ตัว | 38 รูป (19 sp + 19 evo) | Phase 3 |
| 2 | Texture | .webp/.png | 10-50KB/รูป | ~60 รูป | Phase 2 |
| 3 | Audio SFX | .ogg/.m4a | 5-20KB/เสียง | ~40 เสียง | Phase 4 |
| 4 | Audio BGM | .ogg/.m4a | 200KB-1MB/เพลง | 3-5 เพลง | Phase 4 |
| 5 | VFX Texture | .webp (sprite sheet) | 20-80KB/sheet | 5-8 sheets | Phase 5 |
| 6 | 2D Art/Portrait | .webp | 10-30KB/รูป | 38+รูป | Phase 2 |
| 7 | Font | .woff2 | 30-80KB | 1-2 ชุด | Phase 6 |
| 8 | Icon Set | .webp (sprite sheet) | 20-50KB/sheet | 2-3 sheets | Phase 6 |

รวมประมาณ: 5-15MB (ไม่เกิน GitHub Pages limit)

### 3.2 รายละเอียดแต่ละประเภท

#### 3.1 3D Monster Model
- 19 species × 2 รูป (base + evolution) = 38 model
- รูปแบบ: GLB (binary GLTF) — โหลดเร็ว, บีบอัด, Three.js รองรับ
- ถ้าไม่มี model → ใช้ procedural makeSpeciesMesh (เดิม)
- โครงสร้าง: แต่ละ model มี skeleton + animation clip (idle, walk, attack, hurt)

#### 3.2 Texture
- Monster body texture: สี + ลวดลาย (spot, stripe, scale, fur)
- Environment texture: พื้นหญ้า, พื้นถ้ำ, พื้น Ranch
- UI texture: ปุ่ม, กรอบการ์ด, พื้นหลัง panel
- Normal map: สำหรับพื้นผิวละเอียด (เกราะ, ผิวสัตว์)

#### 3.3 Audio SFX
- โจมตี: ฟัน/ชน/ปะทะ × 18 type
- จับ: บอลปา → ติด → สำเร็จ/ล้มเหลว
- เลเวลอัป: ดิง!
- Mastery rank-up: ดนตรีสั้น
- Evolution: เสียงวิเศษ
- Breeding: ฟักไข่ → แตก
- UI: แตะ, เลื่อน, แท็บ
- Raising event: pop

#### 3.4 Audio BGM
- Ranch Hub: สบาย ๆ คล้ายฟาร์ม
- Grassland: ผจญภัยเบา ๆ
- Cave: ลึกลับ
- Battle: เร่งเร้า
- Boss: มหาศาล

#### 3.5 VFX Texture
- Particle sprite: วงกลม, ดาว, เปลวไฟ, น้ำ, สายฟ้า
- ใช้แทน sphere geometry เดิม — สวยขึ้น, เบากว่า

#### 3.6 2D Art/Portrait
- Monster portrait: หน้ามอนสำหรับ UI (การ์ด, party bar, picker)
- Species icon: เล็ก ๆ สำหรับ list/minimap
- NPC portrait: Keeper NPC

#### 3.7 Font
- ภาษาไทย: Noto Sans Thai หรือ Prompt (woff2)
- ตัวเลข: อาจใช้ font เฉพาะสำหรับตัวเลข (monospace)

#### 3.8 Icon Set
- Type badge icon: 18 type → 18 ไอคอนเล็ก
- Status icon: หิว, พลัง, อารมณ์, สภาพ, เครียด
- Action icon: โปรตีน, สุขภาพ, ของโปรด, พัก, เล่น

---

## 4. สถาปัตยกรรม Asset Engine

### 4.1 โครงสร้างโมดูล

```
pocketmonster-medium/
├── assets/
│   ├── models/          # GLB files
│   │   ├── monsters/
│   │   │   ├── normalooze.glb
│   │   │   ├── plainpup.glb
│   │   │   └── ...
│   │   └── humanoids/
│   │       ├── player.glb
│   │       └── keeper.glb
│   ├── textures/
│   │   ├── monsters/    # body textures
│   │   ├── environment/ # ground, sky, walls
│   │   └── ui/          # panel, button, card
│   ├── audio/
│   │   ├── sfx/
│   │   │   ├── attack_fire.ogg
│   │   │   └── ...
│   │   └── bgm/
│   │       ├── ranch.ogg
│   │       └── ...
│   ├── vfx/
│   │   └── particles.webp
│   ├── portraits/
│   │   ├── normalooze.webp
│   │   └── ...
│   ├── fonts/
│   │   └── noto-sans-thai.woff2
│   ├── icons/
│   │   ├── type-badges.webp
│   │   └── status-icons.webp
│   └── manifest.json    # registry
├── asset-engine.mjs     # loader + cache + fallback
├── game-v800.js         # wire เข้าเกม
└── style-v800.css       # wire เข้า CSS
```

### 4.2 asset-engine.mjs — API

```js
// asset-engine.mjs — Asset loading, caching, and fallback system

import * as THREE from 'three';

// ---- Registry ----
let manifest = null;

export async function loadManifest(url = './assets/manifest.json') {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    manifest = await res.json();
    return manifest;
  } catch (err) {
    console.warn('[asset-engine] manifest load failed, running procedural-only:', err.message);
    manifest = { entries: {} };
    return manifest;
  }
}

export function getManifest() { return manifest; }

// ---- GLB Model Loader ----
const modelCache = new Map();

export async function loadModel(url) {
  if (modelCache.has(url)) return modelCache.get(url);
  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    modelCache.set(url, gltf);
    return gltf;
  } catch (err) {
    console.warn('[asset-engine] model load failed:', url, err.message);
    return null;
  }
}

export function getCachedModel(url) {
  return modelCache.get(url) ?? null;
}

// ---- Texture Loader ----
const textureCache = new Map();
let textureLoader = null;

function getTextureLoader() {
  if (!textureLoader) {
    textureLoader = new THREE.TextureLoader();
    textureLoader.crossOrigin = 'anonymous';
  }
  return textureLoader;
}

export async function loadTexture(url) {
  if (textureCache.has(url)) return textureCache.get(url);
  try {
    const texture = await getTextureLoader().loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(url, texture);
    return texture;
  } catch (err) {
    console.warn('[asset-engine] texture load failed:', url, err.message);
    return null;
  }
}

// ---- Audio Loader ----
const audioCache = new Map();

export async function loadAudio(url) {
  if (audioCache.has(url)) return audioCache.get(url);
  try {
    const audio = new Audio(url);
    audio.preload = 'auto';
    // รอจนโหลดได้
    await new Promise((resolve, reject) => {
      audio.addEventListener('canplaythrough', resolve, { once: true });
      audio.addEventListener('error', () => reject(new Error('audio load error')), { once: true });
      setTimeout(() => reject(new Error('audio timeout')), 5000);
    });
    audioCache.set(url, audio);
    return audio;
  } catch (err) {
    console.warn('[asset-engine] audio load failed:', url, err.message);
    return null;
  }
}

export function playAudio(url, { volume = 0.5, loop = false } = {}) {
  const audio = audioCache.get(url);
  if (!audio) return;
  try {
    audio.currentTime = 0;
    audio.volume = volume;
    audio.loop = loop;
    audio.play().catch(() => {}); // autoplay policy อาจบล็อก
  } catch (err) {
    console.warn('[asset-engine] play failed:', url, err.message);
  }
}

export function stopAudio(url) {
  const audio = audioCache.get(url);
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

// ---- Font Loader ----
const fontCache = new Set();

export async function loadFont(name, url) {
  if (fontCache.has(name)) return true;
  try {
    const fontFace = new FontFace(name, `url(${url})`);
    await fontFace.load();
    document.fonts.add(fontFace);
    fontCache.add(name);
    return true;
  } catch (err) {
    console.warn('[asset-engine] font load failed:', name, err.message);
    return false;
  }
}

// ---- Asset Registry Resolution ----
export function resolveAssetPath(category, id, fallback = null) {
  const entry = manifest?.entries?.[category]?.[id];
  if (!entry) return fallback;
  return entry.url || fallback;
}

export function hasAsset(category, id) {
  return !!(manifest?.entries?.[category]?.[id]);
}

// ---- Memory Management ----
export function getCacheStats() {
  return {
    models: modelCache.size,
    textures: textureCache.size,
    audio: audioCache.size,
    fonts: fontCache.size,
  };
}

export function clearCache(category = null) {
  if (!category || category === 'models') {
    for (const gltf of modelCache.values()) {
      gltf?.scene?.traverse?.(obj => {
        obj.geometry?.dispose?.();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material?.dispose?.();
      });
    }
    modelCache.clear();
  }
  if (!category || category === 'textures') {
    for (const tex of textureCache.values()) tex.dispose();
    textureCache.clear();
  }
  if (!category || category === 'audio') {
    for (const audio of audioCache.values()) { audio.pause(); audio.src = ''; }
    audioCache.clear();
  }
}

// ---- Monster Model Resolution ----
// สำหรับ monsterMesh: ถ้ามี GLB → ใช้ GLB, ถ้าไม่มี → ใช้ procedural
export async function resolveMonsterModel(speciesId, formId = null) {
  const key = formId || speciesId;
  const url = resolveAssetPath('models', key);
  if (!url) return null;
  const gltf = await loadModel(url);
  if (!gltf) return null;
  // clone เพื่อใช้ซ้ำ (แต่ละ instance ต้องมี mesh ของตัวเอง)
  const clone = gltf.scene.clone(true);
  return clone;
}

// ---- Portrait Resolution ----
export function resolvePortrait(speciesId) {
  return resolveAssetPath('portraits', speciesId);
}
```

### 4.3 manifest.json — Asset Registry

```json
{
  "version": "1.0.0",
  "entries": {
    "models": {
      "normalooze": { "url": "./assets/models/monsters/normalooze.glb" },
      "plainpup": { "url": "./assets/models/monsters/plainpup.glb" }
    },
    "textures": {
      "ground_grass": { "url": "./assets/textures/environment/grass.webp" },
      "ground_cave": { "url": "./assets/textures/environment/cave.webp" }
    },
    "audio": {
      "sfx_attack_fire": { "url": "./assets/audio/sfx/attack_fire.ogg" },
      "bgm_ranch": { "url": "./assets/audio/bgm/ranch.ogg", "loop": true }
    },
    "portraits": {
      "normalooze": { "url": "./assets/portraits/normalooze.webp" }
    },
    "fonts": {
      "noto-sans-thai": { "url": "./assets/fonts/noto-sans-thai.woff2" }
    },
    "icons": {
      "type-badges": { "url": "./assets/icons/type-badges.webp" }
    }
  }
}
```

---

## 5. Asset Pipeline — โหลด/แคช/ใช้งาน

### 5.1 ลำดับการโหลด

```
เริ่มเกม
  │
  ├─ 1. loadManifest() — อ่าน manifest.json
  │     ถ้าไม่มี → procedural-only mode
  │
  ├─ 2. loadFont('noto-sans-thai') — โหลด font
  │     ถ้าไม่ได้ → ใช้ system-ui
  │
  ├─ 3. โหลดเฉพาะ Ranch Hub assets (lazy)
  │     - bgm_ranch (preload)
  │     - ground_grass texture
  │     - ไม่โหลด monster model ที่นี่
  │
  ├─ 4. เมื่อผู้เล่นเรียกมอน (summon)
  │     - loadModel(speciesId) ครั้งแรก → แสดง procedural ก่อน
  │     - เมื่อ GLB โหลดเสร็จ → สลับ mesh แบบ seamless
  │
  ├─ 5. เมื่อเข้า Wild Zone
  │     - preload bgm ของ zone นั้น
  │     - preload texture ของ zone นั้น
  │     - ไม่โหลด monster model (ใช้ procedural สำหรับ wild)
  │
  ├─ 6. เมื่อเปิด Manager
  │     - loadPortrait(speciesId) สำหรับการ์ดมอน
  │     - ถ้าไม่มี portrait → ใช้ color orb เดิม
  │
  └─ 7. เมื่อโจมตี
        - playAudio('sfx_attack_fire') — ถ้ามี
        - ถ้าไม่มี → เงียบ
```

### 5.2 Cache Strategy

| Asset | Cache | Eviction |
|-------|-------|----------|
| Manifest | 1x (session) | ไม่ evict |
| Font | 1x (session) | ไม่ evict |
| GLB Model | per-species | LRU เมื่อเกิน 20 model |
| Texture | per-asset | LRU เมื่อเกิน 50 texture |
| Audio SFX | per-asset | ไม่ evict (เล็ก) |
| Audio BGM | per-zone | เก็บ zone ก่อนหน้า 1 เพลง |
| Portrait | per-species | LRU เมื่อเกิน 40 |

### 5.3 Loading Priority

```
Priority 0 (critical): Manifest, Font
Priority 1 (preload):  BGM ของ zone ปัจจุบัน
Priority 2 (lazy):     Monster model ของมอนที่ใช้
Priority 3 (idle):     Portrait, Icon, VFX texture
Priority 4 (demand):   SFX (โหลดเมื่อต้องเล่น)
```

---

## 6. 3D Model System — Procedural → GLB

### 6.1 การสลับระหว่าง Procedural และ GLB

```js
// ใน monsterMesh() — เพิ่มเติมจากเดิม
async function monsterMesh(sp, owned=false, inst=null, elite=false, boss=false) {
  // ลองโหลด GLB ก่อน
  const formId = inst?.evolutionPath || sp.id;
  const glbMesh = await resolveMonsterModel(sp.id, formId);
  
  if (glbMesh) {
    // ใช้ GLB model — เพิ่ม ring, scale, shadow
    applyMonsterRing(glbMesh, {owned, elite, boss, inst, sp});
    return glbMesh;
  }
  
  // Fallback: procedural mesh (เดิม)
  return makeSpeciesMesh(sp, inst);
}
```

### 6.2 GLB Model Spec

แต่ละ GLB model ต้องมี:
- **Skeleton**: root Group + body parts (สำหรับ animation)
- **Animations**: idle, walk, attack, hurt (ใน GLTF animations array)
- **Scale**: 1 unit = ~1.5m ในเกม (เท่า procedural)
- **Material**: MeshStandardMaterial (รองรับ texture + lighting)
- **Cast shadow**: true (ตั้ง `castShadow` บน mesh หลัก)

### 6.3 Animation Clip Spec

```js
// แต่ละ animation ต้องมี:
{
  name: 'idle',       // ชื่อ clip
  duration: 2.0,      // วินาที
  loop: true,         // วนซ้ำ
}
// ชื่อที่ระบบรองรับ:
// 'idle' — ยืน/นั่ง (default)
// 'walk' — เดิน (เมื่อ moving=true)
// 'attack' — โจมตี (0.24s)
// 'hurt' — ถูกตี (0.22s)
```

### 6.4 Procedural Animation Adapter

```js
// ถ้า GLB มี animation — ใช้ AnimationMixer
// ถ้าไม่มี — ใช้ procedural animateMonster() เดิม

function setupMonsterAnimation(mesh, gltf) {
  if (gltf?.animations?.length) {
    const mixer = new THREE.AnimationMixer(mesh);
    const clips = {};
    for (const clip of gltf.animations) {
      clips[clip.name] = mixer.clipAction(clip);
    }
    mesh.userData.animMixer = mixer;
    mesh.userData.animClips = clips;
    return mixer;
  }
  // Fallback: procedural rig (เดิม)
  setupMonsterMotion(mesh, /* sp, inst */);
  return null;
}

function playMonsterAnim(mesh, animName) {
  const clips = mesh?.userData?.animClips;
  if (clips?.[animName]) {
    // หยุด clip อื่น, เล่น clip ใหม่
    Object.values(clips).forEach(c => c.fadeOut(0.1));
    clips[animName].reset().fadeIn(0.1).play();
    return true;
  }
  // Fallback: ใช้ procedural triggerMonsterAction
  triggerMonsterAction(mesh, animName, 0.22);
  return false;
}
```

---

## 7. Texture & Material System

### 7.1 การเพิ่ม Texture เข้า Procedural Mesh

```js
// แทนที่ mat(color, rough, metal) ด้วยเวอร์ชันที่รองรับ texture
function texturedMat(color, textureUrl, rough = 0.72, metal = 0.08) {
  // ถ้ามี texture → ใช้ texture
  // ถ้าไม่มี → ใช้สีทึบ (เดิม)
  const texture = textureCache.get(textureUrl);
  if (texture) {
    return new THREE.MeshStandardMaterial({
      map: texture,
      color, // tint
      roughness: rough,
      metalness: metal,
    });
  }
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}
```

### 7.2 Texture Types

| ใช้กับ | Texture | ขนาด | Format |
|-------|--------|------|--------|
| พื้นดิน | grass.webp | 256×256 (repeat) | WebP |
| พื้นถ้ำ | cave.webp | 256×256 (repeat) | WebP |
| ท้องฟ้า | sky.webp | 512×256 (env map) | WebP |
| ตัวมอน | body_{species}.webp | 128×128 | WebP |
| ปุ่ม UI | btn_bg.webp | 64×64 (9-slice) | WebP |
| พื้นการ์ด | card_bg.webp | 128×128 | WebP |

### 7.3 Texture Loading Strategy

```js
// โหลด texture ของ zone เมื่อเข้า zone
async function loadZoneTextures(zone) {
  const zoneTexture = {
    hub: 'grass',
    grassland: 'grass',
    cave: 'cave',
  }[zone] || 'grass';
  await loadTexture(`./assets/textures/environment/${zoneTexture}.webp`);
}

// โหลด texture ของมอนเมื่อ summon
async function loadMonsterTexture(speciesId) {
  const url = resolveAssetPath('textures', `body_${speciesId}`);
  if (url) await loadTexture(url);
}
```

---

## 8. Audio System — SFX + BGM

### 8.1 Audio Manager

```js
// audio-manager.mjs (หรือใน asset-engine.mjs)

let bgmAudio = null;
let sfxVolume = 0.5;
let bgmVolume = 0.3;
let audioEnabled = true;

export function initAudio() {
  // ตรวจสอบว่า browser อนุญาต audio หรือไม่
  // บาง browser ต้องมี user interaction ก่อน
  document.addEventListener('touchstart', () => {
    if (audioEnabled && !bgmAudio) {
      // resume audio context ถ้ามี
    }
  }, { once: true });
}

export function playSFX(id) {
  if (!audioEnabled) return;
  const url = resolveAssetPath('audio', `sfx_${id}`);
  if (url) playAudio(url, { volume: sfxVolume });
}

export function playBGM(zone) {
  if (!audioEnabled) return;
  const url = resolveAssetPath('audio', `bgm_${zone}`);
  if (!url) return;
  // หยุดเพลงเก่า
  if (bgmAudio) stopAudio(bgmAudio);
  bgmAudio = url;
  playAudio(url, { volume: bgmVolume, loop: true });
}

export function setSFXVolume(v) { sfxVolume = clamp(v, 0, 1); }
export function setBGMVolume(v) { bgmVolume = clamp(v, 0, 1); }
export function toggleAudio() { audioEnabled = !audioEnabled; if (!audioEnabled && bgmAudio) stopAudio(bgmAudio); }
```

### 8.2 SFX Event Mapping

| เหตุการณ์ | SFX ID | ในเกม |
|----------|--------|-------|
| โจมตีปกติ | sfx_attack_normal | damageWild() |
| โจมตีไฟ | sfx_attack_fire | spawnElementalFX('Fire',...) |
| โจมตีน้ำ | sfx_attack_water | spawnElementalFX('Water',...) |
| ... | (ซ้ำสำหรับ 18 type) | |
| จับมอน | sfx_capture | captureThrow() |
| จับสำเร็จ | sfx_capture_success | captureSuccess() |
| เลเวลอัป | sfx_levelup | levelUpInstance() |
| Mastery rank-up | sfx_mastery | showMasteryPopup() |
| Evolution | sfx_evolution | evolveMonster() |
| ฟักไข่ | sfx_hatch | hatchEgg() |
| แตะปุ่ม | sfx_tap | ทุกปุ่ม (optional) |
| เปิดแท็บ | sfx_tab | setManagerTab() |
| Raising event | sfx_event | showEventPopup() |
| Faint | sfx_faint | faintActive() |

### 8.3 BGM Zone Mapping

| Zone | BGM | อารมณ์ |
|------|-----|--------|
| hub (Ranch) | bgm_ranch | สบาย, คล้ายฟาร์ม |
| grassland | bgm_grassland | ผจญภัยเบาๆ |
| cave | bgm_cave | ลึกลับ, เคร่ง |
| boss | bgm_boss | มหาศาล, ตื่นเต้น |

---

## 9. VFX / Particle System

### 9.1 การเพิ่ม Texture เข้า VFX

```js
// แทน sphere geometry เดิมด้วย textured sprite
async function spawnTexturedParticle(type, pos, mode, power) {
  const textureUrl = resolveAssetPath('vfx', `particle_${type}`);
  const texture = textureUrl ? await loadTexture(textureUrl) : null;
  
  if (texture) {
    // ใช้ SpriteMaterial + texture
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: typeFx(type).core,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(pos);
    // ... particle physics เดิม
  } else {
    // Fallback: sphere geometry เดิม
    spawnElementalFX(type, pos, mode, power);
  }
}
```

### 9.2 Particle Texture Spec

| Type | Texture | รูปร่าง |
|------|---------|---------|
| Fire | particle_fire.webp | เปลวไฟ ส้ม-แดง |
| Water | particle_water.webp | หยดน้ำ ฟ้า-ขาว |
| Electric | particle_electric.webp | สายฟ้า เหลือง-ขาว |
| Grass | particle_grass.webp | ใบไม้ เขียว |
| Ice | particle_ice.webp | ผลึก ฟ้า-ขาว |
| Normal | particle_normal.webp | วงกลม ขาว-เทา |
| Dark | particle_dark.webp | ควัน ม่วง-ดำ |
| Steel | particle_steel.webp | ประกาย เงิน |

ขนาด: 64×64 WebP แต่ละรูป (~5KB) รวม ~40KB

---

## 10. Animation System

### 10.1 Procedural Animation (เดิม — คงไว้)

เกมมี procedural animation อยู่แล้ว:
- `animateMonster(mesh, dt, moving)` — idle bob, walk bounce, attack lean
- `animateHumanoid(model, dt, moving)` — rig-based walk cycle
- `triggerMonsterAction(mesh, action, duration)` — action trigger

### 10.2 GLB Animation (เพิ่ม)

```js
// AnimationMixer update loop
function updateAnimations(dt) {
  // อัปเดต GLB mixers
  for (const obj of scene.children) {
    if (obj.userData?.animMixer) {
      obj.userData.animMixer.update(dt);
    }
  }
}
// เรียกใน main loop
```

### 10.3 Visual Signal (Table 41 — Master Plan)

| Training/Life State | Visual Signal | วิธีทำ |
|---------------------|--------------|-------|
| Power สูง | ตัวหนา/มวลเพิ่ม | scale.x/z += training.power * 0.001 |
| Defense สูง | ผิวหนา/เกราะ | material.roughness += 0.2, metalness += 0.1 |
| Speed สูง | เพรียว/ท่าทางคล่อง | scale.x/z -= 0.05, animSpeed += 0.2 |
| Technique สูง | Pattern/marking ละเอียด | texture repeat ละเอียดขึ้น |
| Spirit สูง | Aura/Glow/element trail | emissiveIntensity += 0.3, trail particle |
| Stress สูง | สีหน้า/idle กระวนกระวาย | shake offset, faster idle |
| Bond สูง | ท่าทางเป็นมิตร/เข้าใกล้ผู้เล่น | lean toward player, heart particle |

---

## 11. Font / Icon System

### 11.1 Font Loading

```js
// โหลด font ตอนเริ่มเกม (Priority 0)
await loadFont('Noto Sans Thai', './assets/fonts/noto-sans-thai.woff2');
// CSS: font-family: 'Noto Sans Thai', system-ui, sans-serif;
```

### 11.2 Icon System

```js
// Type badge icon — ใช้แทนข้อความใน typeBadge()
function typeBadgeIcon(type) {
  const iconUrl = resolveAssetPath('icons', `type-${type.toLowerCase()}`);
  if (iconUrl) {
    return `<span class="type-badge type-icon" style="background-image:url(${iconUrl})"></span>`;
  }
  // Fallback: ข้อความเดิม
  return `<span class="type-badge" style="background:${TYPE_COLOR[type]}">${TYPE_TH[type]}</span>`;
}
```

---

## 12. Zone / Environment Visual

### 12.1 Zone Visual Spec

| Zone | พื้น | ท้องฟ้า | Fog | สีพื้นหลัง | BGM |
|------|------|---------|-----|----------|-----|
| Ranch Hub | grass.webp | ฟ้าสดใส (0x65c9f5) | ฟ้า 30-76 | 0x65c9f5 | ranch |
| Grassland | grass.webp (เข้ม) | ฟ้าอ่อน | เขียว 30-76 | 0x88c9f5 | grassland |
| Cave | cave.webp | มืด (0x1a1a2e) | ม่วง 15-50 | 0x1a1a2e | cave |

### 12.2 Zone Transition

```js
async function loadZone(zone) {
  // โหลด texture ของ zone
  await loadZoneTextures(zone);
  // เปลี่ยน BGM
  playBGM(zone);
  // เปลี่ยนพื้น
  const groundTexture = textureCache.get(`./assets/textures/environment/${zone}.webp`);
  if (groundTexture) {
    ground.material.map = groundTexture;
    ground.material.needsUpdate = true;
  }
  // เปลี่ยนสีท้องฟ้า + fog
  // (จากโค้ดเดิม — scene.background, scene.fog)
}
```

---

## 13. Asset Registry & Manifest

### 13.1 manifest.json Schema

```json
{
  "version": "1.0.0",
  "generator": "Monster Life RPG Asset Engine",
  "entries": {
    "models": {
      "<speciesId>": { "url": "<path>", "animations": ["idle","walk","attack","hurt"] }
    },
    "textures": {
      "<id>": { "url": "<path>", "repeat": [1,1] }
    },
    "audio": {
      "<id>": { "url": "<path>", "type": "sfx"|"bgm", "loop": false }
    },
    "portraits": {
      "<speciesId>": { "url": "<path>" }
    },
    "fonts": {
      "<name>": { "url": "<path>" }
    },
    "icons": {
      "<id>": { "url": "<path>" }
    },
    "vfx": {
      "<type>": { "url": "<path>" }
    }
  }
}
```

### 13.2 Generation Script

```js
// scripts/generate-manifest.mjs — สร้าง manifest จากโฟลเดอร์ assets/
import { readdirSync, writeFileSync } from 'fs';
import { join, extname } from 'path';

function scanDir(dir, category) {
  const entries = {};
  try {
    for (const file of readdirSync(dir, { recursive: true })) {
      const ext = extname(file);
      if (['.glb','.webp','.png','.ogg','.m4a','.woff2'].includes(ext)) {
        const id = file.replace(ext, '').replace(/.*\//, '');
        entries[id] = { url: `./assets/${category}/${file}` };
      }
    }
  } catch {}
  return entries;
}

const manifest = {
  version: '1.0.0',
  entries: {
    models: scanDir('./assets/models/monsters', 'models'),
    textures: scanDir('./assets/textures', 'textures'),
    audio: { ...scanDir('./assets/audio/sfx', 'audio'), ...scanDir('./assets/audio/bgm', 'audio') },
    portraits: scanDir('./assets/portraits', 'portraits'),
    fonts: scanDir('./assets/fonts', 'fonts'),
    icons: scanDir('./assets/icons', 'icons'),
    vfx: scanDir('./assets/vfx', 'vfx'),
  },
};

writeFileSync('./assets/manifest.json', JSON.stringify(manifest, null, 2));
console.log('Manifest generated:', Object.entries(manifest.entries).map(([k,v]) => `${k}: ${Object.keys(v).length}`).join(', '));
```

---

## 14. Fallback & Graceful Degradation

### 14.1 Fallback Hierarchy

```
Asset ไม่มี → Procedural fallback

Model ไม่มี → makeSpeciesMesh() (procedural primitives)
Texture ไม่มี → MeshStandardMaterial({color}) (สีทึบ)
Audio ไม่มี → เงียบ (ไม่ error)
Font ไม่มี → system-ui (native font)
Icon ไม่มี → Emoji/ข้อความ (typeBadge)
Portrait ไม่มี → Color orb (เดิม)
VFX texture ไม่มี → Sphere geometry (เดิม)
Animation clip ไม่มี → Procedural rig (เดิม)
```

### 14.2 Error Handling

```js
// ทุก load function ต้อง catch error และ return null
// ไม่ throw — ไม่ทำให้เกม crash
// แสดง warning ใน console แล้วใช้ fallback

// ตัวอย่าง:
try {
  const model = await loadModel(url);
  if (model) return model;
} catch (err) {
  console.warn('[asset] model failed, using procedural:', err.message);
}
return makeSpeciesMesh(sp, inst); // fallback
```

---

## 15. Performance Budget

### 15.1 Memory Budget (mobile)

| Asset | ใช้พร้อมกัน | ขนาดรวม |
|-------|------------|---------|
| GLB Models | 20 (active + party + wild) | ~4MB |
| Textures | 50 (zone + monster + UI) | ~3MB |
| Audio SFX | 40 (all loaded) | ~0.5MB |
| Audio BGM | 2 (current + prev zone) | ~2MB |
| Portraits | 40 (all species) | ~1MB |
| Font | 1 | ~80KB |
| VFX | 8 (all types) | ~40KB |
| **รวม** | | **~10-15MB** |

เป้าหมาย: ไม่เกิน 50MB (สำหรับมือถือระดับกลาง)

### 15.2 Load Time Budget

| ขั้นตอน | เวลาเป้าหมาย | วิธี |
|---------|------------|-----|
| Manifest | <100ms | fetch + parse JSON |
| Font | <500ms | woff2 (เบา) |
| Zone texture | <200ms | WebP (เบา) |
| Monster model | <300ms | GLB (binary, บีบอัด) |
| BGM | <1s | ogg (preload) |
| SFX | <100ms | ogg (เล็ก) |
| **รวม startup** | **<2s** | lazy load ส่วนที่ไม่จำเป็น |

### 15.3 Render Budget

| องค์ประกอบ | เป้า | วิธี |
|-----------|------|-----|
| Draw calls | <100 | sharedResourceCache (เดิม) |
| Triangles | <50K | LOD หรือ low-poly model |
| Texture memory | <30MB | 256×256 max, repeat |
| Particles | <200 | objectPool (เดิม) |
| FPS | 30+ | qualityProfile (เดิม) |

---

## 16. Mobile Constraints

### 16.1 ข้อจำกัด Android/Termux

- WebGL อาจใช้ software rendering บนอุปกรณ์เก่า
- หน่วยความจำจำกัด — ไม่เกิน 50MB asset
- ไม่มี Web Audio API บาง browser (ใช้ `<audio>` tag แทน)
- CORS — GitHub Pages ต้อง set `crossOrigin = 'anonymous'`
- Autoplay policy — audio ต้องเริ่มหลัง user interaction

### 16.2 กลยุทธ์

1. **Lazy load**: โหลดเฉพาะที่ใช้ ไม่โหลดทุกอย่างตอนเริ่ม
2. **Low-poly**: GLB model ไม่เกิน 2000 triangles/model
3. **WebP**: บีบอัดดีกว่า PNG (เล็กกว่า 30-50%)
4. **OGG**: เสียงบีบอัดดี รองรับ browser ส่วนใหญ่
5. **Cache eviction**: LRU เมื่อ cache เต็ม
6. **Procedural fallback**: ทุก asset มี fallback ไม่ crash
7. **Progressive**: โหลดทีละส่วน ไม่บล็อกการเล่น

---

## 17. ลำดับการทำ (Implementation Phases)

### Phase 1: Asset Engine Core (PR)
- [ ] สร้าง `asset-engine.mjs` — loader, cache, fallback
- [ ] สร้าง `assets/manifest.json` (empty entries)
- [ ] Wire `loadManifest()` เข้า game startup
- [ ] ไม่เปลี่ยน visual เดิม — ระบบพร้อมแต่ยังไม่มี asset
- ไฟล์: asset-engine.mjs, game-v800.js

### Phase 2: Texture + Portrait (PR)
- [ ] สร้าง texture พื้น (grass.webp, cave.webp)
- [ ] สร้าง portrait มอน 38 รูป (หรือเริ่มจาก 5 รูปก่อน)
- [ ] Wire texture เข้า ground material
- [ ] Wire portrait เข้า monsterCard + party bar
- [ ] Fallback: สีทึบ / color orb เดิม
- ไฟล์: assets/textures/, assets/portraits/, game-v800.js, style-v800.css

### Phase 3: 3D Model (GLB) (PR)
- [ ] สร้าง GLB model มอน (เริ่มจาก 5 species)
- [ ] Wire GLB loader เข้า monsterMesh()
- [ ] สลับ procedural → GLB เมื่อโหลดเสร็จ
- [ ] Animation mixer + clip playback
- [ ] Fallback: makeSpeciesMesh() เดิม
- ไฟล์: assets/models/, game-v800.js

### Phase 4: Audio (SFX + BGM) (PR)
- [ ] สร้าง SFX 40 เสียง (เริ่มจาก 10 สำคัญ)
- [ ] สร้าง BGM 3 เพลง (เริ่มจาก 1: Ranch)
- [ ] Wire playSFX เข้าทุก event (attack, capture, levelup, etc.)
- [ ] Wire playBGM เข้า zone transition
- [ ] Audio settings (volume, toggle)
- [ ] Fallback: เงียบ
- ไฟล์: assets/audio/, game-v800.js, v800.html (settings UI)

### Phase 5: VFX Texture (PR)
- [ ] สร้าง particle texture 8 ชนิด
- [ ] Wire textured sprite เข้า spawnElementalFX
- [ ] Fallback: sphere geometry เดิม
- ไฟล์: assets/vfx/, game-v800.js

### Phase 6: Font + Icon + Polish (PR)
- [ ] โหลด Noto Sans Thai (woff2)
- [ ] สร้าง type badge icons (18 type)
- [ ] สร้าง status icons (หิว, พลัง, etc.)
- [ ] Wire font เข้า CSS
- [ ] Wire icon เข้า typeBadge + needsHTML
- [ ] Visual Signal (Table 41): training state → visual change
- [ ] Fallback: system-ui / emoji เดิม
- ไฟล์: assets/fonts/, assets/icons/, style-v800.css, game-v800.js

---

## 18. ไฟล์ที่กระทบ

| ไฟล์ | Phase | ประเภท |
|------|-------|--------|
| asset-engine.mjs (ใหม่) | 1 | สร้างใหม่ |
| assets/manifest.json (ใหม่) | 1 | สร้างใหม่ |
| assets/textures/*.webp (ใหม่) | 2 | Binary asset |
| assets/portraits/*.webp (ใหม่) | 2 | Binary asset |
| assets/models/*.glb (ใหม่) | 3 | Binary asset |
| assets/audio/sfx/*.ogg (ใหม่) | 4 | Binary asset |
| assets/audio/bgm/*.ogg (ใหม่) | 4 | Binary asset |
| assets/vfx/*.webp (ใหม่) | 5 | Binary asset |
| assets/fonts/*.woff2 (ใหม่) | 6 | Binary asset |
| assets/icons/*.webp (ใหม่) | 6 | Binary asset |
| game-v800.js | 1-6 | Wire loader เข้าเกม |
| style-v800.css | 2,6 | Font, icon, visual signal |
| v800.html | 4 | Audio settings UI |
| tests/v80-asset-*.mjs (ใหม่) | 1-6 | Test per phase |

---

## 19. การตรวจรับ

แต่ละ Phase ต้องผ่าน:

1. `npm run ci` → 42/42 suites PASS (ไม่ทำลายเดิม)
2. `node --check game-v800.js` → SYNTAX OK
3. Browser test: v800.html, game-v800.js, style-v800.css → 200 OK
4. **Fallback test**: ลบ manifest.json → เกมยังเล่นได้ (procedural mode)
5. **Asset test**: ใส่ asset 1 ตัว → แสดงผลเปลี่ยน
6. **Memory test**: getCacheStats() ไม่เกิน budget
7. **Load test**: startup <3s บนมือถือ
8. ไม่เพิ่ม dependency ใหม่ (Three.js จาก CDN เท่านั้น)

---

## 20. ข้อควรระวัง

1. **GLTFLoader import** — Three.js addons ต้อง import จาก CDN path `three/addons/loaders/GLTFLoader.js` — ต้องเช็คว่า CDN มี path นี้
2. **CORS** — GitHub Pages ต้อง allow cross-origin — ใช้ `crossOrigin = 'anonymous'` ใน TextureLoader
3. **Autoplay policy** — บาง browser บล็อก audio ก่อน user interaction — ต้อง init audio หลังแตะครั้งแรก
4. **GLB clone** — แต่ละ instance ต้อง clone mesh (ถ้าไม่ clone มอนทุกตัวจะแชร์ mesh เดียวกัน)
5. **Animation mixer** — ต้อง update ทุก frame — เพิ่มใน main loop
6. **Memory leak** — dispose geometry/material/texture เมื่อ evict จาก cache
7. **GLB file size** — ไม่เกิน 200KB/model — ใช้ Draco compression ถ้าได้
8. **Texture size** — ไม่เกิน 256×256 (สำหรับมือถือ) — repeat แทนขยาย
9. **Audio format** — OGG ดีที่สุดสำหรับเว็บ (เล็ก, คุณภาพดี) — แต่ iOS อาจต้อง m4a
10. **Manifest version** — เมื่อเพิ่ม asset ต้อง bump manifest version — cache busting
11. **Procedural-first** — อย่าลบ makeSpeciesMesh หรือฟังก์ชัน procedural เดิม — ใช้เป็น fallback เสมอ
12. **Test without asset** — ทุก Phase ต้องผ่านโดยไม่มี asset เลย (procedural-only)
13. **GitHub Pages limit** — ไม่เกิน 1GB total — asset ทั้งหมดต้องไม่เกิน ~15MB
14. **WebP support** — Android 4+ รองรับ WebP — แต่ถ้าเก่ามากใช้ PNG fallback
15. **SharedResourceCache** — asset-engine ใช้ cache ของตัวเอง ไม่ชนกับ sharedResources เดิม

---

## สรุป

- เกมปัจจุบันใช้ procedural 3D ทั้งหมด — ไม่มี external asset
- Asset Engine ออกแบบให้ procedural-first + optional enhancement
- 8 ประเภท asset: Model, Texture, Audio SFX, Audio BGM, VFX, Portrait, Font, Icon
- 6 Phase implementation = 6 PR
- ทุก asset มี fallback — เกมไม่ crash ถ้า asset ไม่มี
- Memory budget: ~15MB (ไม่เกิน GitHub Pages limit)
- Load time: <3s (lazy loading)
- ไม่เพิ่ม dependency — Three.js จาก CDN เท่านั้น
- manifest.json เป็น data-driven registry (เหมือน content-catalog.mjs)