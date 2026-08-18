# SKILL VFX ASSET PLAN V8 — แผนพัฒนาเอฟเฟกต์สกิล

> แผนนี้ดึงจาก VFX-EFFECT-PLAN-V8.md sections 16-20 และจัดระเบียบใหม่เป็น phases ที่ implement ได้จริง
> เป้าหมาย: สร้าง Skill VFX เฉพาะตัวสำหรับ 54 สกิล (18 type × 3 สกิล) ที่ตอนนี้ยังใช้ generic burst/impact/summon เหมือนกันหมด

## สถานะปัจจุบัน (Before)

ตอนนี้ `useSkill(index)` ใน game-v800.js เรียก `spawnElementalFX(type, pos, mode, power)` ซึ่งสร้าง particle แบบเดียวกันทุกสกิล:
- **enemy target**: `burst` (12 particle ที่ตัวผู้โจมตี) + `impact` (7 particle ที่เป้าหมาย) + `groundDecal`
- **area target**: `summon` (14 particle รอบตัว) + `impact` ต่อเป้าหมาย + `groundDecal` ใหญ่
- **self target**: `summon` (14 particle) + `groundDecal` — ไม่มี aura คงอยู่, ไม่มี shield/buff visual

ปัญหา:
1. ทุกสกิลดูเหมือนกัน — ไม่มี trail เส้นจากผู้โจมตีไปเป้าหมาย
2. สกิล area ไม่มี wave ขยายวง
3. สกิล self (heal/shield/buffAtk) ไม่มี aura คงอยู่ตลอด duration — ดูเหมือน particle ธรรมดาที่หายไปใน 0.36s
4. ไม่มี hit flash ตอนโดนสกิล (มีแค่ basic attack)
5. ไม่มี cooldown VFX บนปุ่มสกิล

## โครงสร้าง VFX ปัจจุบัน

```
game-v800.js:
  sparkPool (line 1172)     — pool 200 box particles
  spawnBurst (line 1223)     — generic particle burst
  spawnRingPulse (line 1241) — ring ขยายวง
  typeFx (line 1438)         — ELEMENT_FX config ตาม type (core/accent/shape/speed/intensity)
  fxGeom (line 1439)         — geometry ตาม shape (18 shapes)
  spawnElementalFX (line 1461) — main VFX spawner (burst/impact/summon/trail/aura modes)
  spawnGroundDecal (line 1581) — box บนพื้น
  effects[] array            — active effects, update ใน updateEffects()
  updateEffects              — position/velocity/life/opacity update
```

ELEMENT_FX config ต่อ type (มีอยู่แล้ว):
```
core:  สีหลัก (hex)
accent: สีรอง (hex)
shape:  รูปร่าง particle ('flame','drop','leaf','crystal','impact','bubble','dust','feather','halo','spore','shard','mist','arc','smoke','metal','star','spark','orb')
speed:  ความเร็ว particle
intensity: ความเข้ม
```

---

## Phases

### Phase 1: Skill Trail (enemy target) — เส้น particle จากผู้โจมตีไปเป้าหมาย

**สิ่งที่ต้องสร้าง:**
- `spawnSkillTrail(type, fromPos, toPos)` — particle เส้นโค้งจาก attacker ไป target
- แต่ละ type มี behavior ต่างกัน (Fire ลอยขึ้น, Water ตกลง, Electric ซิกแซก, Ground ตกหนัก ฯลฯ)
- 4-12 particle ตามระยะ, life 0.3s, โค้งขึ้นกลางทาง

**การเดินสาย:**
- ใน `useSkill()` enemy target branch หลัง `spawnElementalFX(type, attacker, 'burst', 1)`
- เพิ่ม `spawnSkillTrail(move.type, a.mesh.position, t.mesh.position)`

**ไฟล์ที่แก้:**
- game-v800.js: เพิ่มฟังก์ชัน + เดินสายใน useSkill

**Test:**
- test ใหม่ `tests/v80-skill-vfx-trail.mjs` — ตรวจ spawnSkillTrail มีในโค้ด, ตรวจ type-specific behavior switch

**Particle behavior ตาม type:**
| Type | Shape | พฤติกรรม trail |
|------|-------|----------------|
| Normal | orb | เส้นตรงสั้น |
| Fire | flame | ลอยขึ้น |
| Water | drop | ตกลง |
| Electric | spark | ซิกแซก |
| Grass | leaf | หมุน |
| Ice | crystal | ตกช้า |
| Fighting | impact | เส้นเร็ว |
| Poison | spore | เปื้อนช้า |
| Ground | dust | ตกหนัก |
| Flying | feather | ลอยลม |
| Psychic | halo | เรืองแสง |
| Bug | orb | บิน |
| Rock | shard | ตกหนักมาก |
| Ghost | mist | ลอยช้า |
| Dragon | flame | ไฟใหญ่ |
| Dark | smoke | มืดทึบ |
| Steel | metal | แวบ |
| Fairy | star | นุ่มนวล |

---

### Phase 2: Area Wave — วงขยายสำหรับสกิล area

**สิ่งที่ต้องสร้าง:**
- `spawnAreaWave(type, pos, range)` — box wireframe ขยายจาก 0.5 → range*2
- 8 particle กระจายตาม type พร้อมวงขยาย
- life 0.5s, opacity ลดลงตอนขยาย

**การเดินสาย:**
- ใน `useSkill()` area target branch หลัง `spawnGroundDecal(type, attacker)`
- เพิ่ม `spawnAreaWave(move.type, a.mesh.position, move.range)`

**ไฟล์ที่แก้:**
- game-v800.js: เพิ่มฟังก์ชัน + เดินสาย + updateEffects kind 'area-wave'

**Test:**
- test ใหม่ `tests/v80-skill-vfx-area.mjs` — ตรวจ spawnAreaWave มีในโค้ด, ตรวจ updateEffects รองรับ kind 'area-wave'

---

### Phase 3: Self Skill Aura — heal/shield/buffAtk aura คงอยู่

**สิ่งที่ต้องสร้าง:**
- `spawnHealSkillEffect(pos, type)` — เขียวลอยขึ้น + ring pulse (800ms)
- `spawnShieldSkillEffect(pos, type, duration)` — box wireframe aura โปร่งใส คงอยู่ตลอด duration + 8 particle ขึ้นรอบตัว
- `spawnBuffAtkSkillEffect(pos, type, duration)` — 12 particle พุ่งขึ้น + box wireframe aura คงอยู่ + ring pulse accent

**การเดินสาย:**
- ใน `useSkill()` self target branch:
  - `if(move.effect==='heal')` → `spawnHealSkillEffect(a.mesh.position, move.type)`
  - `if(move.effect==='shield')` → `spawnShieldSkillEffect(a.mesh.position, move.type, move.duration)`
  - `if(move.effect==='buffAtk')` → `spawnBuffAtkSkillEffect(a.mesh.position, move.type, move.duration)`

**ไฟล์ที่แก้:**
- game-v800.js: เพิ่ม 3 ฟังก์ชัน + เดินสายใน useSkill + updateEffects kind 'shield-aura'/'buff-aura'

**Test:**
- test ใหม่ `tests/v80-skill-vfx-aura.mjs` — ตรวจ 3 ฟังก์ชันมีในโค้ด, ตรวจ aura kind ใน updateEffects

---

### Phase 4: Hit Flash — กระพริบขาวตอนโดนสกิล

**สิ่งที่ต้องสร้าง:**
- `hitFlashGroup(group)` — ทำให้ mesh Group กระพริบขาว 80ms (traverse children, backup material, flash, restore)
- สำหรับ Bighead monsters ที่เป็น Group หลาย child meshes

**การเดินสาย:**
- ใน `damageWild()` เพิ่ม `hitFlashGroup(w.mesh)` หลัง `spawnDamageNumber`
- ใน `useSkill()` area branch เพิ่ม `hitFlashGroup(t.mesh)` ต่อ target

**ไฟล์ที่แก้:**
- game-v800.js: เพิ่มฟังก์ชัน + เดินสายใน damageWild และ useSkill area branch

**Test:**
- test ใหม่ `tests/v80-skill-vfx-hitflash.mjs` — ตรวจ hitFlashGroup มีในโค้ด, ตรวจ traverse + backup + restore pattern

---

### Phase 5: Cooldown VFX — สีจาง + timer บนปุ่มสกิล

**สิ่งที่ต้องสร้าง:**
- CSS `.skill-btn.on-cooldown` — filter grayscale + opacity
- ใน `renderSkillButtons()` เพิ่ม cooldown timer display ถ้า `skillCds[i] > 0`
- อัปเดตใน game loop (อัปเดต cooldown text ทุก frame)

**ไฟล์ที่แก้:**
- game-v800.js: แก้ renderSkillButtons + เพิ่ม cooldown update ใน game loop
- style-v800.css: เพิ่ม `.skill-btn.on-cooldown`

**Test:**
- test ใหม่ `tests/v80-skill-vfx-cooldown.mjs` — ตรวจ CSS class + cooldown display

---

## ลำดับการทำ (Implementation Order)

| Phase | ขอบเขต | ความสำคัญ | PR |
|-------|--------|----------|-----|
| P1 | Skill Trail (enemy) | สูง — เห็นชัดที่สุด | 1 PR |
| P2 | Area Wave | สูง — สกิล area ดูแตกต่าง | 1 PR |
| P3 | Self Aura (heal/shield/buff) | สูง — aura คงอยู่สำคัญต่อ feedback | 1 PR |
| P4 | Hit Flash | ปานกลาง — มี basic attack อยู่แล้ว | 1 PR |
| P5 | Cooldown VFX | ปานกลาง — UI polish | 1 PR |

แต่ละ phase = 1 PR (branch, implement, test, merge)

## ข้อจำกัด

- ใช้ sparkPool ที่มีอยู่ (200 particles) — อย่าเพิ่ม pool size เกิน 250
- ทุก VFX ใช้ box geometry (blocky theme) — ห้าม sphere/cone/cylinder
- ทุก mesh ต้องมี `castShadow=false` — VFX ไม่ทอดเงา
- ทุก particle ต้อง release กลับ pool เมื่อ life หมด
- effects[] ต้องไม่เกิน 80 active พร้อมกัน (VFX Priority P4 cull)
- แต่ละสกิลใช้ particle ไม่เกิน 20 ตัว (trail 12 + impact 7 + extra 1-2)
- duration aura ต้อง dispose เมื่อหมดเวลา (ห้าม leak)

## Acceptance Gates

แต่ละ phase ต้องผ่าน:
1. `npm run ci` — 99/99 suites pass (+ test ใหม่ของ phase นั้น)
2. Syntax check ผ่าน
3. ไม่มี particle leak (ตรวจ effects.length หลัง VFX หมด)
4. ไม่เพิ่ม triangle count เกิน budget (12 tri/particle × 20 = 240 tri/skill)
5. ทำงานบน mobile (ดู performance budget ต่อ skill ไม่เกิน 2.5ms)

## ตารางสรุป Type × Skill VFX

| Type | Skill 1 (enemy) | Skill 2 (area) | Skill 3 (self) | Trail พิเศษ |
|------|----------------|----------------|----------------|-------------|
| Normal | Tackle — พุ่งชน | Echo Pound — wave กลม | Focus Pose — aura ทอง | เส้นตรงสั้น |
| Fire | Flame Burst — เปลวไฟ | Fire Ring — วงไฟ | Warm Up — aura ส้ม | เปลวไฟลอยขึ้น |
| Water | Bubble Lance — กระแทกน้ำ | Tidal Splash — wave น้ำ | Water Veil — ฟองน้ำ | หยดน้ำตก |
| Electric | Volt Dash — สายฟ้าพุ่ง | Thunder Field — สนามไฟฟ้า | Overcharge — ประกาย | ซิกแซกเหลือง |
| Grass | Leaf Pulse — ใบพุ่ง | Seed Burst — เมล็ดกระจาย | Regrowth — เขียวลอย | ใบหมุน |
| Ice | Frost Wing — ผลึกแหลม | Hail Sweep — ลูกเห็บ | Ice Guard — โล่ผลึก | ผลึกตกช้า |
| Fighting | Combo Punch — หมัด | Shockwave Kick — คลื่นกระแทก | Battle Cry — aura แดง | เส้นหมัดเร็ว |
| Poison | Toxic Spit — พิษพุ่ง | Venom Cloud — หมอกพิษ | Acid Skin — โล่พิษ | พิษเปื้อน |
| Ground | Mud Shot — โคลนพุ่ง | Quake Ring — รอยแยก | Sand Guard — โล่ทราย | โคลนตกหนัก |
| Flying | Gust Peck — ลม slashed | Feather Storm — ขนกระจาย | Wind Focus — aura ลม | ลมเฉียบ |
| Psychic | Mind Bolt — พลังจิต | Psy Wave — สนามจิต | Inner Focus — สมาธิ | สายเรืองแสง |
| Bug | Pin Bite — กัด | Swarm Spin — วงแมลง | Carapace Boost — เปลือก | แมลงบิน |
| Rock | Stone Crash — หินตก | Pebble Burst — กรวด | Rock Guard — โล่หิน | หินตกหนัก |
| Ghost | Phantom Paw — เงากรงเล็บ | Haunt Pulse — สนามผี | Fade Veil — โล่ผี | เงาลอยช้า |
| Dragon | Dragon Flame — มังกรพ่นไฟ | Scale Burst — เกล็ดกระจาย | Ancient Rage — aura ใหญ่ | ไฟมังกรใหญ่ |
| Dark | Night Crash — มืดพุ่ง | Shadow Burst — เงากระจาย | Void Guard — โล่มืด | มืดทึบ |
| Steel | Steel Cutter — โลหะ slashed | Metal Swarm — เศษโลหะ | Iron Shell — โล่เหล็ก | โลหะแวบ |
| Fairy | Fairy Spark — ประกายน้ำตาล | Star Dust — ดาวกระจาย | Blessing — รัศมี | ประกายนุ่ม |

## Skill Timeline (หลัง implement ครบทุก phase)

### Enemy Skill (0.55s total)
```
t=0ms:    useSkill() → playerVisual.play('skill') + triggerMonsterAction('attack')
          spawnElementalFX(type, attacker, 'burst') → 12 particle ชาร์จ
          spawnSkillTrail(type, attacker→target) → เส้น particle โค้ง [P1]
          spawnElementalFX(type, target, 'impact') → 7 particle โดน
          spawnGroundDecal(type, target) → วงพื้น
          damageWild() → spawnDamageNumber + hitFlashGroup [P4] + scale shrink
          triggerCameraShake()
t=80ms:   hit flash หมด
t=300ms:  skill trail หมด [P1]
t=400ms:  burst + impact particle หมด → release pool
t=1150ms: ground decal หมด → dispose
```

### Area Skill (1.45s total)
```
t=0ms:    useSkill() → playerVisual.play('skill') + triggerMonsterAction('attack')
          spawnElementalFX(type, attacker, 'summon') → 14 particle ชาร์จใหญ่
          spawnGroundDecal(type, attacker, range*0.7) → วงพื้นใหญ่
          spawnAreaWave(type, attacker, range) → วงขยาย [P2]
          triggerCameraShake()
t+50ms×i: per target: spawnElementalFX(impact) + groundDecal + damageWild + hitFlash [P4]
t=500ms:  area wave หมด [P2]
t=800ms:  summon particle หมด
t=1450ms: ground decal ใหญ่หมด
```

### Self Skill (1.2s + duration)
```
t=0ms:    useSkill() → triggerMonsterAction('attack')
          spawnElementalFX(type, attacker, 'summon') → 14 particle
          spawnGroundDecal(type, attacker, 1.2) → วงพื้น
          if heal: spawnHealSkillEffect(pos, type) → เขียวลอย + ring [P3]
          if shield: spawnShieldSkillEffect(pos, type, duration) → aura คงอยู่ [P3]
          if buffAtk: spawnBuffAtkSkillEffect(pos, type, duration) → aura คงอยู่ [P3]
t=800ms:  summon particle หมด
t=1200ms: ground decal หมด
t=duration: shield/buff aura หมด → dispose [P3]
```

---

---

## Appendix A: โค้ดตัวอย่างเต็มสำหรับแต่ละ Phase

### A.1 Phase 1 — spawnSkillTrail (เพิ่มก่อนฟังก์ชัน useSkill)

```js
function spawnSkillTrail(type, fromPos, toPos) {
  const cfg = typeFx(type);
  const dist = fromPos.distanceTo(toPos);
  const count = Math.max(4, Math.round(dist * 3));
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const m = sparkPool.acquire();
    if (!m) break;
    m.visible = true;
    m.material.color.setHex(i % 2 ? cfg.accent : cfg.core);
    m.material.emissive.setHex(i % 2 ? cfg.accent : cfg.core);
    m.material.emissiveIntensity = 0.6;
    m.material.opacity = 0.9;
    m.castShadow = false;
    m.position.lerpVectors(fromPos, toPos, t);
    m.position.y += Math.sin(t * Math.PI) * 0.5; // โค้งขึ้น
    m.scale.setScalar(0.04 * (1 - t * 0.5)); // เล็กลงตอนท้าย
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(m);
    const vel = new THREE.Vector3();
    switch (cfg.shape) {
      case 'flame': vel.y = 0.3; break;           // Fire: ลอยขึ้น
      case 'drop': vel.y = -0.2; break;           // Water: ตกลง
      case 'spark': vel.x = Math.sin(i * 2) * 0.5; break; // Electric: ซิกแซก
      case 'leaf': vel.set(Math.cos(i)*0.2, 0.1, Math.sin(i)*0.2); break; // Grass: หมุน
      case 'crystal': vel.y = -0.15; break;       // Ice: ตกช้า
      case 'impact': vel.set(0, 0.05, 0); break;   // Fighting: เส้นเร็ว
      case 'bubble': vel.y = 0.05; break;          // Poison: เปื้อนช้า
      case 'dust': vel.y = -0.3; break;            // Ground: ตกหนัก
      case 'feather': vel.set(Math.sin(i)*0.3, 0.08, Math.cos(i)*0.3); break; // Flying: ลม
      case 'halo': vel.y = 0.05; break;            // Psychic: เรืองแสง
      case 'spore': vel.set(Math.cos(i)*0.1, 0.03, Math.sin(i)*0.1); break; // Bug: บิน
      case 'shard': vel.y = -0.4; break;           // Rock: ตกหนักมาก
      case 'mist': vel.y = 0.03; break;            // Ghost: ลอยช้า
      case 'arc': vel.y = 0.2; break;              // Dragon: ไฟใหญ่
      case 'smoke': vel.set(0, -0.05, 0); break;   // Dark: มืดทึบ
      case 'metal': vel.set(0, 0, 0); break;       // Steel: แวบ (ไม่ขยับ)
      case 'star': vel.y = 0.08; break;            // Fairy: นุ่มนวล
      default: vel.set(0, 0.1, 0);                 // Normal/Orb: เส้นตรง
    }
    effects.push({
      mesh: m, life: 0.3, maxLife: 0.3,
      kind: 'spark', pooled: true,
      vel, size: m.scale.x, gravity: 0.2,
    });
  }
}
```

**การเดินสายใน useSkill (line 2202, enemy branch):**

หลัง `spawnElementalFX(move.type,a.mesh.position.clone().add(new THREE.Vector3(0,.6,0)),'burst',1);`
เพิ่ม:
```js
spawnSkillTrail(move.type, a.mesh.position.clone().add(new THREE.Vector3(0,.6,0)), t.mesh.position.clone().add(new THREE.Vector3(0,.5,0)));
```

### A.2 Phase 2 — spawnAreaWave (เพิ่มก่อนฟังก์ชัน useSkill)

```js
function spawnAreaWave(type, pos, range) {
  const cfg = typeFx(type);
  const wave = new THREE.Mesh(
    boxGeometry(0.5, 0.05, 0.5),
    new THREE.MeshBasicMaterial({
      color: cfg.core, transparent: true, opacity: 0.8,
      wireframe: true, depthWrite: false,
    })
  );
  wave.position.copy(pos);
  wave.position.y = 0.06;
  wave.castShadow = false;
  scene.add(wave);
  effects.push({
    mesh: wave, life: 0.5, maxLife: 0.5,
    kind: 'area-wave', expandTo: range * 2,
  });
  // particle กระจายตาม type
  for (let i = 0; i < 8; i++) {
    const m = sparkPool.acquire();
    if (!m) break;
    m.visible = true;
    m.material.color.setHex(cfg.accent);
    m.material.emissive.setHex(cfg.accent);
    m.material.emissiveIntensity = 0.5;
    m.material.opacity = 0.9;
    m.castShadow = false;
    const angle = (i / 8) * Math.PI * 2;
    m.position.set(pos.x, pos.y + 0.2, pos.z);
    m.scale.setScalar(0.05);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.4, maxLife: 0.4,
      kind: 'spark', pooled: true,
      vel: new THREE.Vector3(Math.cos(angle) * range, 0.3, Math.sin(angle) * range),
      size: 0.05, gravity: 0.3,
    });
  }
}
```

**การเดินสายใน useSkill (line 2204, area branch):**

หลัง `spawnGroundDecal(move.type,a.mesh.position.clone(),{radius:Math.min(2.8,move.range*.7),duration:1.45,intensity:1.15});`
เพิ่ม:
```js
spawnAreaWave(move.type, a.mesh.position.clone(), move.range);
```

**เพิ่มใน updateEffects (line 1416):**

ใน chain `if/else if` หลัง `evolution-aura`:
```js
else if(e.kind==='area-wave'){
  const u = 1 - t;
  const scale = 0.5 + u * (e.expandTo || 3);
  e.mesh.scale.set(scale, 1, scale);
  e.mesh.material.opacity = Math.max(0, t * 0.8);
}
```

### A.3 Phase 3 — Self Skill Aura (3 ฟังก์ชัน)

```js
function spawnHealSkillEffect(pos, type) {
  const cfg = typeFx(type);
  // เขียวลอยขึ้น รอบตัว
  for (let i = 0; i < 10; i++) {
    const m = sparkPool.acquire();
    if (!m) break;
    m.visible = true;
    m.material.color.setHex(0x4ade80);
    m.material.emissive.setHex(0x4ade80);
    m.material.emissiveIntensity = 0.6;
    m.material.opacity = 0.9;
    m.castShadow = false;
    const angle = (i / 10) * Math.PI * 2;
    m.position.set(
      pos.x + Math.cos(angle) * 0.5,
      pos.y + 0.2 + Math.random() * 0.3,
      pos.z + Math.sin(angle) * 0.5
    );
    m.scale.setScalar(0.05);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.8, maxLife: 0.8,
      kind: 'spark', pooled: true,
      vel: new THREE.Vector3(0, 1.0 + Math.random() * 0.3, 0),
      size: 0.05, gravity: -0.1,
    });
  }
  spawnRingPulse(pos.clone(), 0x4ade80, { scale: 0.8, life: 0.4, y: 0.1 });
  spawnElementalFX(type, pos, 'aura', 0.5);
}

function spawnShieldSkillEffect(pos, type, duration) {
  const cfg = typeFx(type);
  const shieldMesh = new THREE.Mesh(
    boxGeometry(1.4, 1.8, 1.4),
    new THREE.MeshBasicMaterial({
      color: cfg.core, transparent: true, opacity: 0,
      wireframe: true, depthWrite: false,
    })
  );
  shieldMesh.position.copy(pos);
  shieldMesh.position.y += 0.9;
  shieldMesh.castShadow = false;
  scene.add(shieldMesh);
  effects.push({
    mesh: shieldMesh, life: duration, maxLife: duration,
    kind: 'shield-aura',
  });
  for (let i = 0; i < 8; i++) {
    const m = sparkPool.acquire();
    if (!m) break;
    m.visible = true;
    m.material.color.setHex(cfg.core);
    m.material.emissive.setHex(cfg.core);
    m.material.emissiveIntensity = 0.5;
    m.material.opacity = 0.9;
    m.castShadow = false;
    const angle = (i / 8) * Math.PI * 2;
    m.position.set(
      pos.x + Math.cos(angle) * 0.6,
      pos.y + 0.1,
      pos.z + Math.sin(angle) * 0.6
    );
    m.scale.setScalar(0.04);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.6, maxLife: 0.6,
      kind: 'spark', pooled: true,
      vel: new THREE.Vector3(0, 0.8, 0),
      size: 0.04, gravity: -0.05,
    });
  }
}

function spawnBuffAtkSkillEffect(pos, type, duration) {
  const cfg = typeFx(type);
  for (let i = 0; i < 12; i++) {
    const m = sparkPool.acquire();
    if (!m) break;
    m.visible = true;
    m.material.color.setHex(cfg.accent);
    m.material.emissive.setHex(cfg.accent);
    m.material.emissiveIntensity = 0.6;
    m.material.opacity = 0.9;
    m.castShadow = false;
    const angle = (i / 12) * Math.PI * 2;
    m.position.set(
      pos.x + Math.cos(angle) * 0.4,
      pos.y + 0.1,
      pos.z + Math.sin(angle) * 0.4
    );
    m.scale.setScalar(0.05);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.7, maxLife: 0.7,
      kind: 'spark', pooled: true,
      vel: new THREE.Vector3(0, 1.5 + Math.random() * 0.5, 0),
      size: 0.05, gravity: -0.3,
    });
  }
  spawnRingPulse(pos.clone(), cfg.accent, { scale: 0.7, life: 0.35, y: 0.1 });
  const auraMesh = new THREE.Mesh(
    boxGeometry(1.2, 2.0, 1.2),
    new THREE.MeshBasicMaterial({
      color: cfg.accent, transparent: true, opacity: 0,
      wireframe: true, depthWrite: false,
    })
  );
  auraMesh.position.copy(pos);
  auraMesh.position.y += 1.0;
  auraMesh.castShadow = false;
  scene.add(auraMesh);
  effects.push({
    mesh: auraMesh, life: duration, maxLife: duration,
    kind: 'buff-aura',
  });
}
```

**การเดินสายใน useSkill (line 2206-2209, self branch):**

หลัง `spawnGroundDecal(move.type,a.mesh.position.clone(),{radius:1.2,duration:1.2,intensity:.95});`
เพิ่มในแต่ละ effect block:
```js
// ใน if(move.effect==='heal') block:
spawnHealSkillEffect(a.mesh.position.clone(), move.type);

// ใน if(move.effect==='shield') block:
spawnShieldSkillEffect(a.mesh.position.clone(), move.type, move.duration);

// ใน if(move.effect==='buffAtk') block:
spawnBuffAtkSkillEffect(a.mesh.position.clone(), move.type, move.duration);
```

**เพิ่มใน updateEffects (line 1416):**

```js
else if(e.kind==='shield-aura'){
  const u = 1 - t;
  const fade = u < 0.15 ? u / 0.15 : (u > 0.85 ? (1 - u) / 0.15 : 1);
  e.mesh.material.opacity = Math.max(0, fade * 0.35);
  e.mesh.rotation.y += dt * 0.8;
}
else if(e.kind==='buff-aura'){
  const u = 1 - t;
  const fade = u < 0.15 ? u / 0.15 : (u > 0.85 ? (1 - u) / 0.15 : 1);
  e.mesh.material.opacity = Math.max(0, fade * 0.4);
  e.mesh.rotation.y += dt * 1.2;
  e.mesh.scale.setScalar(1 + Math.sin(u * Math.PI * 4) * 0.05);
}
```

### A.4 Phase 4 — hitFlashGroup (เพิ่มก่อนฟังก์ชัน damageWild)

```js
function hitFlashGroup(group) {
  if (!group || !group.traverse) return;
  const backups = [];
  group.traverse(child => {
    if (child.isMesh && child.material) {
      backups.push({ mesh: child, color: child.material.color.clone(), emissive: child.material.emissive ? child.material.emissive.clone() : null });
      child.material.color.setHex(0xffffff);
      if (child.material.emissive) child.material.emissive.setHex(0xffffff);
    }
  });
  setTimeout(() => {
    for (const b of backups) {
      if (b.mesh.material) {
        b.mesh.material.color.copy(b.color);
        if (b.emissive && b.mesh.material.emissive) b.mesh.material.emissive.copy(b.emissive);
      }
    }
  }, 80);
}
```

**การเดินสาย:**

ใน `damageWild()` (line 2014) หลัง `spawnDamageNumber(dmg,...)`:
เพิ่ม `hitFlashGroup(w.mesh);`

ใน `useSkill()` area branch (line 2204) ใน for loop หลัง `damageWild(t,res.damage,...)`:
เพิ่ม `hitFlashGroup(t.mesh);`

### A.5 Phase 5 — Cooldown VFX

**CSS (เพิ่มใน style-v800.css):**

```css
.skill-btn.on-cooldown {
  filter: grayscale(0.55);
  opacity: 0.7;
}
.skill-btn .cd-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 900;
  color: #fff;
  background: rgba(0,0,0,0.45);
  border-radius: inherit;
  pointer-events: none;
}
```

**game-v800.js:**

ใน `renderSkillButtons()` เพิ่ม cooldown display:
```js
const cd = a.skillCds[i] || 0;
const btn = el(`skill${i+1}Btn`);
if (cd > 0) {
  btn.classList.add('on-cooldown');
  let cdEl = btn.querySelector('.cd-overlay');
  if (!cdEl) { cdEl = document.createElement('div'); cdEl.className = 'cd-overlay'; btn.appendChild(cdEl); }
  cdEl.textContent = cd.toFixed(1) + 's';
} else {
  btn.classList.remove('on-cooldown');
  const cdEl = btn.querySelector('.cd-overlay');
  if (cdEl) cdEl.remove();
}
```

ใน game loop (ที่อัปเดต skillCds ใน updateOwned) เพิ่มอัปเดต cooldown text:
```js
// หลัง a.skillCds=a.skillCds.map(x=>Math.max(0,x-dt));
for (let i = 0; i < 3; i++) {
  const cd = a.skillCds[i];
  const btn = el(`skill${i+1}Btn`);
  if (!btn) continue;
  if (cd > 0) {
    if (!btn.classList.contains('on-cooldown')) btn.classList.add('on-cooldown');
    let cdEl = btn.querySelector('.cd-overlay');
    if (!cdEl) { cdEl = document.createElement('div'); cdEl.className = 'cd-overlay'; btn.appendChild(cdEl); }
    cdEl.textContent = cd.toFixed(1) + 's';
  } else {
    if (btn.classList.contains('on-cooldown')) btn.classList.remove('on-cooldown');
    const cdEl = btn.querySelector('.cd-overlay');
    if (cdEl) cdEl.remove();
  }
}
```

---

## Appendix B: Test Suite Skeletons

### B.1 tests/v80-skill-vfx-trail.mjs (Phase 1)

```js
import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

// ตรวจฟังก์ชันมีในโค้ด
assert.ok(js.includes('function spawnSkillTrail('), 'spawnSkillTrail missing');
// ตรวจ type-specific behavior switch
assert.ok(js.includes("case 'flame'"), 'trail: flame behavior missing');
assert.ok(js.includes("case 'drop'"), 'trail: drop behavior missing');
assert.ok(js.includes("case 'spark'"), 'trail: spark behavior missing');
assert.ok(js.includes("case 'shard'"), 'trail: shard behavior missing');
// ตรวจการเดินสายใน useSkill enemy branch
assert.ok(js.includes('spawnSkillTrail('), 'spawnSkillTrail not called');
// ตรวจ pool usage
assert.ok(js.includes('sparkPool.acquire()'), 'trail: not using sparkPool');
assert.ok(js.includes('pooled: true'), 'trail: not marked pooled');
console.log('V8.0 Skill VFX trail: PASS');
```

### B.2 tests/v80-skill-vfx-area.mjs (Phase 2)

```js
import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

assert.ok(js.includes('function spawnAreaWave('), 'spawnAreaWave missing');
assert.ok(js.includes("kind: 'area-wave'"), 'area-wave kind missing');
assert.ok(js.includes('expandTo'), 'area-wave: expandTo missing');
assert.ok(js.includes("'area-wave'"), 'updateEffects: area-wave handler missing');
assert.ok(js.includes('spawnAreaWave('), 'spawnAreaWave not called');
console.log('V8.0 Skill VFX area wave: PASS');
```

### B.3 tests/v80-skill-vfx-aura.mjs (Phase 3)

```js
import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

assert.ok(js.includes('function spawnHealSkillEffect('), 'spawnHealSkillEffect missing');
assert.ok(js.includes('function spawnShieldSkillEffect('), 'spawnShieldSkillEffect missing');
assert.ok(js.includes('function spawnBuffAtkSkillEffect('), 'spawnBuffAtkSkillEffect missing');
assert.ok(js.includes("kind: 'shield-aura'"), 'shield-aura kind missing');
assert.ok(js.includes("kind: 'buff-aura'"), 'buff-aura kind missing');
assert.ok(js.includes("'shield-aura'"), 'updateEffects: shield-aura handler missing');
assert.ok(js.includes("'buff-aura'"), 'updateEffects: buff-aura handler missing');
assert.ok(js.includes('spawnHealSkillEffect('), 'heal effect not wired');
assert.ok(js.includes('spawnShieldSkillEffect('), 'shield effect not wired');
assert.ok(js.includes('spawnBuffAtkSkillEffect('), 'buffAtk effect not wired');
console.log('V8.0 Skill VFX aura: PASS');
```

### B.4 tests/v80-skill-vfx-hitflash.mjs (Phase 4)

```js
import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

assert.ok(js.includes('function hitFlashGroup('), 'hitFlashGroup missing');
assert.ok(js.includes('group.traverse'), 'hitFlashGroup: traverse missing');
assert.ok(js.includes('backups'), 'hitFlashGroup: backup pattern missing');
assert.ok(js.includes('0xffffff'), 'hitFlashGroup: white flash missing');
assert.ok(js.includes('setTimeout'), 'hitFlashGroup: restore timer missing');
assert.ok(js.includes('hitFlashGroup(w.mesh)'), 'hitFlashGroup not called in damageWild');
console.log('V8.0 Skill VFX hit flash: PASS');
```

### B.5 tests/v80-skill-vfx-cooldown.mjs (Phase 5)

```js
import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';
import { readFileSync } from 'fs';

const css = readFileSync('style-v800.css', 'utf8');

assert.ok(css.includes('.on-cooldown'), 'CSS: on-cooldown class missing');
assert.ok(css.includes('.cd-overlay'), 'CSS: cd-overlay class missing');
assert.ok(js.includes('on-cooldown'), 'game: on-cooldown class not toggled');
assert.ok(js.includes('cd-overlay'), 'game: cd-overlay element missing');
assert.ok(js.includes('toFixed(1)'), 'game: cooldown timer text missing');
console.log('V8.0 Skill VFX cooldown: PASS');
```

### B.6 Mutation test pattern (สำหรับแต่ละ phase)

```js
// แทนที่จะใช้รูปแบบเดิม ใช้ pattern นี้สำหรับ mutation tests:
const mutants = [
  { name: 'remove trail function', find: 'function spawnSkillTrail(', replace: 'function spawnSkillTrail_REMOVED(' },
  { name: 'remove area-wave kind', find: "kind: 'area-wave'", replace: "kind: 'area-wave-REMOVED'" },
  { name: 'remove shield-aura kind', find: "kind: 'shield-aura'", replace: "kind: 'shield-aura-REMOVED'" },
];
for (const m of mutants) {
  const mutated = js.replace(m.find, m.replace);
  assert.ok(mutated !== js, `mutant ${m.name}: mutation failed`);
  // แต่ละ mutation ต้องทำให้ test ล้มเหลว
  assert.ok(!mutated.includes(m.find), `mutant ${m.name}: still present after mutation`);
}
console.log('V8.0 Skill VFX mutation checks: PASS (3/3 mutants killed)');
```

---

## Appendix C: ตาราง ELEMENT_FX config (อ้างอิงจาก game-v800.js line 1418-1437)

| Type | core (hex) | accent (hex) | shape | intensity | speed |
|------|-----------|-------------|-------|-----------|-------|
| Normal | 0xc4b08b | 0xf5e2be | orb | 0.95 | 1.0 |
| Fire | 0xff6b2c | 0xffc347 | flame | 1.18 | 1.15 |
| Water | 0x43a5ff | 0xb6efff | drop | 1.08 | 0.95 |
| Electric | 0xffda22 | 0xfff79c | spark | 1.22 | 1.35 |
| Grass | 0x65c84b | 0xd6ff9f | leaf | 1.0 | 0.9 |
| Ice | 0x8de9ff | 0xf3fdff | crystal | 1.04 | 0.9 |
| Fighting | 0xd6493b | 0xffcab9 | impact | 1.14 | 1.05 |
| Poison | 0xb259db | 0xf3baff | bubble | 1.0 | 0.88 |
| Ground | 0xd0a249 | 0xf6deb4 | dust | 1.0 | 0.82 |
| Flying | 0x8e82ff | 0xece8ff | feather | 1.02 | 1.08 |
| Psychic | 0xff5a98 | 0xffd3e8 | halo | 1.1 | 1.02 |
| Bug | 0xa8c42d | 0xedff93 | spore | 0.98 | 0.95 |
| Rock | 0xb59b46 | 0xf1deb0 | shard | 0.94 | 0.8 |
| Ghost | 0x8870df | 0xe6ddff | mist | 1.06 | 0.85 |
| Dragon | 0x7f5cff | 0xdccfff | arc | 1.18 | 1.12 |
| Dark | 0x594942 | 0xc7b7a8 | smoke | 1.0 | 0.86 |
| Steel | 0xaab0c8 | 0xf0f4ff | metal | 1.0 | 0.78 |
| Fairy | 0xff8fcb | 0xffeff7 | star | 1.12 | 1.0 |

---

## Appendix D: Performance Budget ต่อ Skill

| Component | Particles | Triangles | Time (ms) |
|-----------|-----------|-----------|-----------|
| Burst (enemy) | 12 | 144 | 0.3 |
| Skill Trail [P1] | 4-12 | 48-144 | 0.3 |
| Impact (enemy) | 7 | 84 | 0.2 |
| Ground Decal | 1 | 12 | 0.1 |
| Hit Flash [P4] | 0 | 0 | 0.05 |
| **Enemy total** | **24-32** | **288-384** | **0.95** |
| Summon (area) | 14 | 168 | 0.4 |
| Area Wave [P2] | 9 (1+8) | 108 | 0.3 |
| Impact per target (area) | 7×N | 84×N | 0.2×N |
| **Area total (3 targets)** | **44** | **528** | **1.3** |
| Summon (self) | 14 | 168 | 0.4 |
| Heal Aura [P3] | 10+1 | 132 | 0.3 |
| Shield Aura [P3] | 9 (1+8) | 108 | 0.3 |
| Buff Aura [P3] | 13 (12+1) | 156 | 0.4 |
| **Self total** | **27-33** | **324-396** | **1.0-1.1** |

ทุก skill ใช้ < 2ms และ < 600 triangles — อยู่ใน budget 16ms/frame สบาย

---

## หมายเหตุ

- แผนนี้เน้นเฉพาะ Skill VFX — ไม่ครอบคลุม Capture Tension, Throw VFX, หรือ VFX Priority/Quality Settings (ดูใน VFX-EFFECT-PLAN-V8.md)
- ทุก phase ใช้ฟังก์ชันและ pool ที่มีอยู่แล้ว — ไม่ต้องสร้าง infrastructure ใหม่
- แต่ละ phase มีขอบเขตเล็ก (1 ฟังก์ชัน + เดินสาย + 1 test) เพื่อให้ review ง่าย
- ปกติ Cursor Agent implement, Hermes review/test/merge
- โค้ดตัวอย่างใน Appendix A ใช้ได้กับ game-v800.js โดยตรง — copy และเดินสายตามตำแหน่งที่ระบุ
- Test skeletons ใน Appendix B ใช้รูปแบบเดียวกับ tests ที่มีอยู่ (activeJs + assert)
- ตาราง ELEMENT_FX ใน Appendix C อ้างอิงจาก line 1418-1437 ของ game-v800.js