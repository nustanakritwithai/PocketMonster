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

## หมายเหตุ

- แผนนี้เน้นเฉพาะ Skill VFX — ไม่ครอบคลุม Capture Tension, Throw VFX, หรือ VFX Priority/Quality Settings (ดูใน VFX-EFFECT-PLAN-V8.md)
- ทุก phase ใช้ฟังก์ชันและ pool ที่มีอยู่แล้ว — ไม่ต้องสร้าง infrastructure ใหม่
- แต่ละ phase มีขอบเขตเล็ก (1 ฟังก์ชัน + เดินสาย + 1 test) เพื่อให้ review ง่าย
- ปกติ Cursor Agent implement, Hermes review/test/merge