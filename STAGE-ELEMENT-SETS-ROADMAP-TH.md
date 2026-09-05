# Monster Life RPG — แผนเพิ่มด่านครบ 18 ธาตุแบบแบ่งชุด

สถานะเอกสาร: Proposed Plan  
วันที่: 2026-08-22  
ขอบเขต: PocketMonster / Monster Life RPG prototype  
เป้าหมาย: เพิ่ม World Stage และ Wild Zone ให้ครบ 18 ธาตุ โดยทำทีละชุดเล็ก ๆ ที่เล่นจบและตรวจสอบได้

เอกสารนี้เป็นแผนการผลิตสำหรับทีมพัฒนา ไม่ใช่เพียงไอเดียคอนเทนต์ งานทุกชุดต้องผ่าน acceptance gate ของตัวเองก่อนเริ่มชุดถัดไป

---

## 1. หลักอ้างอิงและ Design Lock

แผนนี้ยึด Prototype Baseline และ Ring 0/Ring 1 จากเอกสารแม่บท Monster Life RPG Development Plan โดยเฉพาะกติกาต่อไปนี้

- เกมใช้ระบบธาตุ 18 แบบเป็น baseline เดียวกันทั้งดาเมจ, Wild encounter, Skill, VFX และ UI
- Type resolver กลางเป็น source of truth ห้ามสร้างตารางแพ้ชนะเฉพาะด่าน
- Hub/Ranch แยกจาก Wild Zone; ช่วงแรกโหลดพื้นที่เป็นโซนแยก ไม่ทำ seamless open world
- Active Monster ในสนามมีได้สูงสุด 1 ตัว และ Party มี 3 slot
- Ranch Active/Rendered Monster ในโลกมีเพดาน 6 ตัวเพื่อรักษา FPS บนมือถือ
- Boss จับไม่ได้ตามกติกาปัจจุบัน; Elite จับได้แต่มี modifier ตาม config
- Capture ต้องผ่าน flow ต่อสู้ → Recall → Capture Aim และห้ามให้ Player เป็นแหล่ง damage หลักแทนมอน
- HP = 0 ของมอนผู้เล่นคือ Fainted ไม่ใช่ตาย และต้อง Heal ที่ Ranch/NPC หรือ Item
- Evolution ต้อง preview ก่อนยืนยันและใช้ resolver/data ไม่ hard-code ด้วย level อย่างเดียว
- Reward, Boss HP, Capture rate, Skill cooldown และค่าปรับสมดุลเป็น Ring 2 ปรับได้จาก config กลาง

หากข้อกำหนดในเอกสารนี้ขัดกับ Ring 0/Ring 1 ให้ยึด Design Lock และหยุดเพื่อขอคำตัดสินก่อนแก้โค้ด

---

## 2. เป้าหมายของงาน

### 2.1 เป้าหมายหลัก

1. สร้างระบบเลือกและโหลดด่านที่รองรับหลาย Wild Zone โดยไม่ copy โค้ด combat ซ้ำ
2. แบ่งคอนเทนต์ครบ 18 ธาตุเป็น 4 ชุด เพื่อส่งมอบและทดสอบทีละชุด
3. ให้แต่ละด่านมี identity ชัดเจนจาก biome, encounter, environmental effect, Elite และ Boss
4. ให้ผู้เล่นเห็นธาตุเด่น, ระดับความยาก, counter และรางวัลก่อนเข้า
5. บันทึก progress, clear state และรางวัลอย่างปลอดภัยผ่านระบบ Save เดิม
6. รองรับมือถือแนวตั้งและแนวนอนโดยไม่ทำให้ UI ด่านบัง gameplay หรือกดปุ่มยาก
7. ทำให้เพิ่มด่านชุดใหม่ได้ด้วย catalog/data เป็นหลัก ไม่ต้องแก้ระบบหลักทุกครั้ง

### 2.2 สิ่งที่ยังไม่ทำในรอบนี้

- ไม่ทำ seamless open world
- ไม่เพิ่มระบบ multiplayer หรือ server-authoritative combat
- ไม่เพิ่ม Hybrid Species แบบสุ่มอิสระจากพ่อแม่
- ไม่เพิ่มระบบซื้อ Speed-up Egg หรือ monetization
- ไม่เปลี่ยนกฎ Type Resolver และไม่สร้างธาตุใหม่เกิน 18 แบบ
- ไม่สร้าง cinematic ขนาดใหญ่ก่อน golden path ของด่านผ่าน
- ไม่เพิ่ม procedural map ที่ทำให้ encounter และ reward ทดสอบซ้ำไม่ได้

---

## 3. รายชื่อธาตุและการแบ่งชุด

แบ่งตามลำดับความเข้าใจของผู้เล่นและความซับซ้อนของระบบ ไม่ได้หมายความว่าธาตุในชุดเดียวกันต้องมีความสัมพันธ์แพ้ชนะกันทั้งหมด

| ชุด | ด่าน/ธีม | ธาตุที่ครอบคลุม | เหตุผล |
|---|---|---|---|
| Set 1 | พื้นฐานและธรรมชาติ | Grass, Bug, Fire, Water, Electric | ทดสอบ loop หลัก, สภาพอากาศ และธาตุที่ผู้เล่นเข้าใจง่าย |
| Set 2 | ภูมิประเทศและสภาพอากาศ | Ice, Rock, Ground, Flying, Poison | เพิ่ม terrain, verticality แบบปลอดภัย และ status/environment |
| Set 3 | จิตใจ เงา และเครื่องจักร | Psychic, Ghost, Dark, Steel | เพิ่ม encounter behavior, debuff และ defensive identity |
| Set 4 | ธาตุขั้นสูงและบททดสอบสุดท้าย | Dragon, Fairy, Fighting, Normal | ปิดครบ 18 ธาตุ, ทำ challenge/boss/end-of-current-slice |

จำนวนธาตุที่เกิดในด่านอาจมากกว่าธาตุเด่นได้ แต่ต้องมี `primaryTypes` และ `secondaryTypes` ใน catalog ชัดเจน เพื่อไม่ให้ด่านกลายเป็นการสุ่มทุกอย่างปะปนกัน

---

## 4. รูปแบบด่านมาตรฐาน

ทุกด่านที่ส่งมอบต้องมีโครงขั้นต่ำเหมือนกัน เพื่อให้ผู้เล่นเรียนรู้ flow ได้และให้ QA มี test matrix เดียวกัน

### 4.1 โครงสร้างการเล่น

1. **Stage Intro** — ชื่อด่าน, ธาตุเด่น, คำแนะนำสั้น และรางวัล
2. **Entry Node** — จุดเริ่มต้นและ safe area
3. **Normal Encounter A** — ฝึกระบบ encounter ของด่าน
4. **Normal Encounter B** — encounter ที่มี composition ต่างจาก A
5. **Resource/Event Node** — จุดเก็บของ, event หรือทางเลือกสั้น ๆ
6. **Elite Node** — ศัตรู Elite พร้อม reward เพิ่ม
7. **Boss Arena** — ลาน Boss แยกจากพื้นที่ปกติ
8. **Clear/Reward Screen** — สรุปผล, เวลา, capture, reward และปุ่มกลับ Hub

ช่วง vertical slice ไม่บังคับให้ด่านยาวหลายชั่วโมง เป้าหมายเวลาต่อรอบเริ่มต้นคือ 5–12 นาทีต่อด่าน รวมการเดินและต่อสู้

### 4.2 สิ่งที่ทุกด่านต้องกำหนดใน data

- `stageId`
- `displayName`
- `shortDescription`
- `biomeId`
- `primaryTypes`
- `secondaryTypes`
- `recommendedLevel`
- `unlockRule`
- `encounterTableId`
- `eliteEncounterId`
- `bossEncounterId`
- `environmentProfileId`
- `rewardProfileId`
- `clearConditions`
- `capturePolicy`
- `mapLayoutId`
- `version`

### 4.3 กติกา encounter

- Normal encounter ต้องมีอย่างน้อย 3 composition ที่ deterministic เมื่อใช้ seed เดียวกัน
- Elite ต้องมี label, aura/visual ที่อ่านออก และ capture modifier
- Boss ต้องมี `capturePolicy: disabled`
- Wild ไม่ควรเกิดเกินจำนวนที่มือถือรองรับพร้อมกันตาม performance profile
- Encounter reset ต้องคืน HP/state ตามกติกาเดิมเมื่อจบรอบ
- Spawn table ต้องระบุ weight, level range, form และโอกาส Elite อย่างชัดเจน

---

## 5. Data Contract ที่เสนอ

ชื่อ field เป็นแนวทางสำหรับ implementation จริง ให้ตรวจชื่อกับ module ปัจจุบันก่อน merge

```js
export const STAGE_CATALOG = Object.freeze([
  {
    id: 'ember-valley',
    displayName: 'Ember Valley',
    biomeId: 'volcanic-valley',
    primaryTypes: ['Fire'],
    secondaryTypes: ['Rock', 'Ground'],
    recommendedLevel: { min: 4, max: 7 },
    unlockRule: { type: 'clearStage', stageId: 'grass-meadow' },
    mapLayoutId: 'stage-ember-valley-v1',
    encounterTableId: 'encounter-ember-valley-v1',
    eliteEncounterId: 'elite-ember-valley-v1',
    bossEncounterId: 'boss-ember-guardian-v1',
    environmentProfileId: 'heat-haze',
    rewardProfileId: 'stage-set1-fire',
    clearConditions: [{ type: 'defeatBoss' }],
    capturePolicy: 'normal-wild-only',
    version: 1,
  },
]);
```

### 5.1 Encounter table

```js
{
  id: 'encounter-ember-valley-v1',
  stageId: 'ember-valley',
  entries: [
    { speciesId: 'fire-slime', minLevel: 4, maxLevel: 5, weight: 50, formId: 'base' },
    { speciesId: 'rock-beast', minLevel: 5, maxLevel: 6, weight: 30, formId: 'base' },
    { speciesId: 'fire-bug', minLevel: 5, maxLevel: 7, weight: 20, formId: 'base' },
  ],
  elite: { enabled: true, chance: 0.08, modifierProfileId: 'elite-default' },
}
```

### 5.2 Environment profile

Environment มีผลต่อ presentation และ mechanic ที่ได้รับอนุมัติเท่านั้น ห้ามแอบเปลี่ยน type effectiveness

```js
{
  id: 'heat-haze',
  label: 'Heat Haze',
  skyProfile: 'ember-sky',
  groundProfile: 'dry-rock',
  ambientVfx: 'floating-embers',
  musicProfile: 'stage-volcanic',
  combatModifier: null,
}
```

หากจะเพิ่ม combat modifier ต้องระบุว่าเป็น Ring 2, มีคำอธิบายใน UI และมี regression test แยกจาก Type Resolver

---

## 6. รายละเอียดแต่ละชุด

## Set 1 — พื้นฐานและธรรมชาติ

ธาตุ: Grass, Bug, Fire, Water, Electric  
เป้าหมาย: ทำ golden path ของ Stage ให้ครบเป็นชุดแรก

### 6.1 Grass Meadow

- ธาตุเด่น: Grass
- ธาตุรอง: Bug, Normal
- ภาพรวม: ทุ่งหญ้า, แปลงดอกไม้ และพื้นที่ Ranch ที่ขยายออกไป
- Environment: ลมเบา, ใบไม้, แสงกลางวัน
- Encounter: มอน Grass ระดับต้น, Bug ที่มี movement เร็ว, Normal เป็นตัวสอน counter
- Elite: Grass/ใบบังตัวหรือ regeneration เล็กน้อยผ่าน profile ที่อ่านได้
- Boss: Meadow Guardian
- Reward: Grass capture material, Bond food, stage key ชุดถัดไป
- จุดทดสอบ: spawn, capture, healing, party switch, reward save

### 6.2 Ember Valley

- ธาตุเด่น: Fire
- ธาตุรอง: Rock, Ground
- ภาพรวม: หุบเขาหินร้อน, lava accent แบบตกแต่ง ไม่ทำ instant-death ในรอบแรก
- Environment: Heat Haze, ember VFX, โทนแดง/ส้ม
- Encounter: Fire Slime, Fire Animal, Rock/ Ground support
- Elite: Fire aura และ HP modifier ตาม config
- Boss: Ember Guardian
- Reward: Fire material, capture ball, training food
- ข้อจำกัด: ความร้อนเป็น presentation ก่อน ไม่ลด HP ต่อเนื่องจนกว่าจะมี design lock ใหม่

### 6.3 Misty Lake

- ธาตุเด่น: Water
- ธาตุรอง: Grass, Flying
- ภาพรวม: ทะเลสาบหมอก, ทางเดินริมฝั่ง และเกาะเล็ก
- Environment: หมอก, ripple, Water VFX
- Encounter: Water Slime, aquatic animal, Grass counter
- Elite: พื้นที่น้ำและ movement pattern ช้าลง/เร็วขึ้นเฉพาะ AI profile ไม่เปลี่ยน resolver
- Boss: Lake Warden
- Reward: Water material, heal item, storage expansion token แบบ config

### 6.4 Storm Field

- ธาตุเด่น: Electric
- ธาตุรอง: Flying, Steel
- ภาพรวม: ทุ่งพายุ, เสา conductor และพื้นที่โล่ง
- Environment: ฟ้าผ่าตกแต่ง, electric sparks, music cue
- Encounter: Electric Slime, Flying scout, Steel support
- Elite: chain visual effect และ cooldown profile ที่ระบุชัดเจน
- Boss: Storm Core
- Reward: Electric material, skill item, set completion reward

### 6.5 Set 1 Boss และการปลดล็อก

มีได้สองรูปแบบที่เลือกตอน implementation:

- แบบ A: แต่ละด่านมี Boss ของตัวเอง และครบ 4 ด่านจึงปลดล็อก Set 2
- แบบ B: ด่านที่ 5 เป็น Elemental Guardian รวมธาตุ Set 1

ค่าเริ่มต้นแนะนำ: แบบ A เพื่อให้แต่ละด่านทดสอบแยกง่าย และใช้ Elemental Guardian เป็น optional challenge ภายหลัง

### 6.6 Set 1 Acceptance Gate

- เข้าได้จาก Stage Select หรือ Hub route
- เล่นผ่าน Entry → Encounter → Elite → Boss → Reward ได้
- มีมอน Wild ครบทุกธาตุของชุดอย่างน้อย 1 species
- Capture ได้เฉพาะ Normal/Elite ตาม policy
- Boss จับไม่ได้และแสดงเหตุผลชัดเจน
- Clear state และ reward ไม่ซ้ำเมื่อ reload
- ทดสอบมือถือ portrait/landscape ผ่าน

## Set 2 — ภูมิประเทศและสภาพอากาศ

ธาตุ: Ice, Rock, Ground, Flying, Poison  
เป้าหมาย: เพิ่มความต่างของพื้นที่และ status โดยยังรักษา combat core เดิม

### 6.7 Frozen Pass

- ธาตุเด่น: Ice
- ธาตุรอง: Flying, Water
- Environment: หิมะ, น้ำแข็ง, fog เย็น
- Encounter: Ice Slime, Ice animal, Flying scout
- Elite: shield/defense profile ที่ใช้ค่ากลาง
- Boss: Frost Horn
- Reward: Ice material, status resistance food

### 6.8 Rocky Canyon

- ธาตุเด่น: Rock
- ธาตุรอง: Ground, Fighting
- Environment: canyon, ฝุ่น, ทางแคบ
- Encounter: Rock/ Ground species และตัวเร็วที่บังคับให้หลบ
- Elite: armor visual และ defense profile
- Boss: Canyon Colossus
- Reward: Rock material, equipment component

### 6.9 Sky Ruins

- ธาตุเด่น: Flying
- ธาตุรอง: Electric, Psychic
- Environment: ซากปรักหักพังลอยฟ้าแบบฉากจำลอง ไม่ทำ free-flight ในรอบแรก
- Encounter: Flying species, Electric support
- Elite: movement สูง แต่ต้องมี telegraph อ่านได้
- Boss: Ruin Roc
- Reward: Flying material, movement/skill item

### 6.10 Poison Marsh

- ธาตุเด่น: Poison
- ธาตุรอง: Grass, Bug
- Environment: บึง, หมอกพิษ, พื้นสีม่วง
- Encounter: Poison/Grass/Bug composition
- Elite: status effect ผ่าน skill/status system ที่มีอยู่ ไม่สร้าง damage loop ใหม่โดยไม่ทดสอบ
- Boss: Marsh Hydra
- Reward: Poison material, cure item, rare gene material

### 6.11 Set 2 Acceptance Gate

- มี terrain presentation อย่างน้อย 3 แบบ: หิมะ, หิน, บึง
- Encounter ไม่เกิดนอกชนิดที่ catalog อนุญาต
- Status/Environment ไม่ทำให้ player soft-lock หรือ HP ลดถาวร
- Flying/vertical presentation ยังเล่นได้บนจอเล็ก
- ทุกด่านมี reset และ clear state ที่ deterministic

## Set 3 — จิตใจ เงา และเครื่องจักร

ธาตุ: Psychic, Ghost, Dark, Steel  
เป้าหมาย: เพิ่มความหลากหลายของ behavior และ visual identity โดยไม่ทำระบบ battle ใหม่ทั้งชุด

### 6.12 Dream Shrine

- ธาตุเด่น: Psychic
- ธาตุรอง: Fairy, Normal
- Environment: shrine, particle ลอย, สีม่วง/ฟ้า
- Encounter: Psychic species ที่มี ranged/telegraph ชัดเจน
- Elite: illusion VFX แต่ state จริงต้องตรวจสอบได้
- Boss: Dream Seer
- Reward: Psychic material, skill mastery item

### 6.13 Haunted Woods

- ธาตุเด่น: Ghost
- ธาตุรอง: Dark, Poison
- Environment: ป่าเงา, fog, lantern
- Encounter: Ghost ambush แบบไม่ teleport สุ่มจนทดสอบไม่ได้
- Elite: fade/appear ต้องมี warning และ cooldown
- Boss: Hollow Tree Spirit
- Reward: Ghost material, revive/heal support item ตาม economy ที่อนุมัติ

### 6.14 Shadow City

- ธาตุเด่น: Dark
- ธาตุรอง: Poison, Fighting
- Environment: เมืองกลางคืน, neon, ทางแยก
- Encounter: Dark ambush, Poison support, Fighting counter
- Elite: stealth visual ที่มี outline/เสียงเตือน
- Boss: Night Fang
- Reward: Dark material, rare capture modifier token แบบไม่เพิ่มใน core capture โดยตรง

### 6.15 Steel Factory

- ธาตุเด่น: Steel
- ธาตุรอง: Electric, Rock
- Environment: โรงงาน, steam, conveyor เป็นฉากตกแต่ง
- Encounter: Steel defensive species, Electric support
- Elite: armor/guard profile
- Boss: Iron Engine
- Reward: Steel material, equipment component, set milestone reward

### 6.16 Set 3 Acceptance Gate

- Psychic/Ghost/Dark มี telegraph และ feedback อ่านได้บนมือถือ
- ไม่ใช้ randomness ที่ทำให้ replay เดิมให้ผลผิดกันโดยไม่มี seed
- Steel defense ไม่ทำให้ดาเมจเป็น 0 จากการซ้อน modifier ผิด
- VFX ไม่ทำให้ frame time เกิน performance budget
- Save/Load ระหว่างด่านไม่ทำให้ encounter หรือ reward ซ้ำ

## Set 4 — ธาตุขั้นสูงและบททดสอบสุดท้าย

ธาตุ: Dragon, Fairy, Fighting, Normal  
เป้าหมาย: ปิดครบ 18 ธาตุและสร้าง end-of-current-slice challenge

### 6.17 Dragon Crater

- ธาตุเด่น: Dragon
- ธาตุรอง: Fire, Rock
- Environment: crater, เถ้าถ่าน, skybox ขนาดใหญ่
- Encounter: Dragon species ต้องมี level gate ชัดเจน
- Elite: multi-skill telegraph แต่ยังใช้ Skill data เดิม
- Boss: Crater Dragon
- Reward: Dragon material, high-tier evolution material

### 6.18 Fairy Garden

- ธาตุเด่น: Fairy
- ธาตุรอง: Grass, Psychic
- Environment: สวนเรืองแสง, pollen, color shift
- Encounter: Fairy support, Grass/Psychic mix
- Elite: heal/support profile ที่ไม่ทำ infinite loop
- Boss: Bloom Queen
- Reward: Fairy material, Bond item, cosmetic seed

### 6.19 Combat Colosseum

- ธาตุเด่น: Fighting
- ธาตุรอง: Normal, Steel
- Environment: arena, crowd VFX แบบเบา
- Encounter: Fighting species ที่ทดสอบ dodge และ summon/recall
- Elite: aggressive AI profile
- Boss: Grand Brawler
- Reward: Fighting material, training item, combat title

### 6.20 Normal Wildlands

- ธาตุเด่น: Normal
- ธาตุรอง: ทุกธาตุที่ได้รับอนุญาตใน encounter table
- Environment: ทุ่งกลาง/พื้นที่ tutorial-plus
- Encounter: Normal species ที่มี pattern หลากหลายแต่ไม่มี environmental advantage
- Elite: adaptive profile ไม่สุ่ม type ใหม่
- Boss: Grand Champion หรือ Guardian of Balance
- Reward: completion reward ของ 18 ธาตุ

### 6.21 Set 4 Acceptance Gate

- Dex/Stage progress แสดงครบ 18 ธาตุ
- Dragon/Fairy/Fighting/Normal มี species และ encounter ครบตาม catalog
- Boss ทุกตัวมี preview, defeat, reward และ clear state
- ไม่มีธาตุใดถูกสร้างจาก hard-code เฉพาะ stage
- ผู้เล่นสามารถกลับไปเล่นชุดเก่าและจับ/เก็บข้อมูลได้

---

## 7. Stage Select และ World Progression

### 7.1 หน้าเลือกด่าน

แต่ละ stage card ต้องแสดง:

- ชื่อและ biome
- ธาตุเด่นพร้อม badge
- ระดับแนะนำ
- สถานะ Locked / Available / Cleared
- จำนวน Elite/Boss ที่เคยชนะ
- รางวัลครั้งแรกและรางวัล replay
- ปุ่ม Enter ที่ถูก disable พร้อมเหตุผลเมื่อยังไม่ปลดล็อก

### 7.2 กติกาปลดล็อกเริ่มต้น

- Set 1: เปิดจาก Hub เมื่อ Stage system พร้อม
- Stage ถัดไปในชุด: เคลียร์ stage ก่อนหน้า หรือใช้ explicit story gate
- Set ใหม่: เคลียร์ Boss ของชุดก่อนหน้า
- Optional challenge: ไม่บล็อก golden path
- หากต้องการ level gate ต้องแสดงระดับที่ต้องการก่อนโหลด zone

### 7.3 Progress data

ตัวอย่างข้อมูลที่เพิ่มใน save state:

```js
stageProgress: {
  unlocked: ['grass-meadow'],
  cleared: [],
  bossClears: {},
  eliteClears: {},
  firstClearRewards: {},
  bestTimes: {},
  elementDiscovery: {},
}
```

Migration ต้องให้ save เก่าที่ไม่มี `stageProgress` ได้ค่า default โดยไม่ลบ state เดิมและไม่เพิ่ม reward ย้อนหลังอัตโนมัติ

---

## 8. Reward และ Economy

### 8.1 ประเภท reward

- First-clear reward: ได้ครั้งเดียวและบันทึก atomic
- Replay reward: ได้ตาม profile แต่มีเพดาน/กติกา
- Capture reward: ได้จากการจับสำเร็จ ไม่ใช่จากการโจมตี
- Elite reward: วัตถุดิบ/เงิน/ชิ้นส่วนพิเศษ
- Boss reward: stage key, evolution material หรือ milestone
- Discovery reward: พบธาตุ/Species ใหม่ใน Dex

### 8.2 ข้อควรระวัง

- ห้ามสร้างเงินหรือ item ซ้ำเมื่อกด reward callback หลายครั้ง
- Reward ต้องอ้าง `rewardProfileId` ไม่ hard-code ใน UI
- Boss reward ต้อง commit หลังตรวจ defeat state สำเร็จ
- ถ้า save fail ต้องมี retry/feedback และไม่จ่ายซ้ำโดยไม่ตรวจ transaction id
- อย่าผูก reward กับ monetization ก่อน Economy lock

---

## 9. Mobile UI/Interaction

### 9.1 Stage Select

- ใช้ vertical card list บน portrait
- ใช้ 2-column card เฉพาะหน้าจอที่กว้างพอ
- แตะ card เพื่อเปิดรายละเอียด ไม่ใช้ hover เป็น interaction หลัก
- ปุ่ม Enter ขั้นต่ำ 44px
- แสดง type counter และ recommended level ในพื้นที่เห็นทันที

### 9.2 ระหว่างด่าน

- Stage name และธาตุเด่นอยู่ใน compact top bar
- Boss/Elite badge อ่านได้โดยไม่บัง target card
- Environmental effect ใช้ icon + short label และเข้าถึงได้ด้วย aria-label
- ปุ่มกลับ Hub ต้องมี confirmation หากมี encounter active
- Reward screen เป็น bottom sheet ที่ scroll ได้

### 9.3 Performance UI

- ลด VFX ใน quality tier ต่ำ
- ไม่ render label ของ enemy ที่อยู่นอกระยะ
- คุมจำนวน wild runtime ตาม stage profile
- ไม่ preload asset ของทุกชุดพร้อมกัน
- เปลี่ยน zone แล้ว dispose resource ที่ไม่ใช้งานตาม lifecycle module

---

## 10. แผน implementation เป็น PR

### PR 1 — Stage foundation

- สร้าง stage catalog/schema
- สร้าง stage progress state และ migration
- สร้าง resolver สำหรับ unlock/clear/reward
- ยังไม่เพิ่ม content จำนวนมาก
- Test: schema, migration, deterministic stage lookup

### PR 2 — Stage Select + route

- เพิ่มหน้าเลือกด่าน
- เพิ่ม Hub → Stage route
- เพิ่ม locked/available/cleared state
- เพิ่ม mobile bottom sheet รายละเอียดด่าน
- Test: route, back, lock reason, mobile active entry

### PR 3 — Set 1 catalog and encounters

- เพิ่ม Grass Meadow
- เพิ่ม Ember Valley
- เพิ่ม Misty Lake
- เพิ่ม Storm Field
- เพิ่ม encounter/elite/boss/reward profiles
- Test: spawn table, types, capture policy, boss policy

### PR 4 — Set 1 presentation and progression

- เพิ่ม map layout/biome/sky/ground/audio/VFX
- เพิ่ม clear/reward screen
- เพิ่ม first-clear idempotency
- Test: golden path เต็มชุดบน desktop และ mobile

### PR 5 — Set 2

- เพิ่ม Ice, Rock, Ground, Flying, Poison
- เพิ่ม terrain/status presentation ที่ผ่าน design review
- Test: environment, performance, status regression

### PR 6 — Set 3

- เพิ่ม Psychic, Ghost, Dark, Steel
- เพิ่ม behavior profile และ telegraph
- Test: deterministic replay, VFX budget, defensive modifier

### PR 7 — Set 4

- เพิ่ม Dragon, Fairy, Fighting, Normal
- เพิ่ม final current-slice challenge
- Test: 18-type discovery, final boss, backtracking

### PR 8 — Balance and polish

- ปรับ level, HP, reward และ encounter weights จาก telemetry/playtest
- ไม่เปลี่ยน Ring 0/Ring 1
- เพิ่ม regression/mutant tests สำหรับ reward และ unlock

หนึ่ง PR ควรมี scope เดียวและไม่รวมการเปลี่ยน UI NPC, Firebase หรือระบบ Breeding ที่ไม่เกี่ยวข้องกับด่าน

---

## 11. Test Plan

### 11.1 Unit tests

- stage catalog schema ผ่าน/ไม่ผ่าน
- stage ID ซ้ำต้อง fail
- primary type ต้องอยู่ใน 18-type list
- encounter entry ต้องอ้าง species ที่มีอยู่
- unlock resolver ทำงานตามเงื่อนไข
- first-clear reward จ่ายครั้งเดียว
- reward migration ไม่ทำให้ save เก่าพัง
- boss capture policy เป็น disabled
- elite capture policy ใช้ modifier กลาง

### 11.2 Integration tests

- Hub → Stage Select → Stage → Boss → Reward → Hub
- reload ระหว่าง stage แล้วกลับเข้า state ที่ถูกต้อง
- Fainted → Recall → Heal ที่ Ranch/NPC
- Capture normal/elite/boss ตาม policy
- Party 3 และ Active Monster 1 ไม่ถูก duplicate
- Ranch render cap 6 ไม่เปลี่ยนจากการเพิ่ม stage
- Stage clear ไม่ทำให้ Storage/Training/Breeding state เปลี่ยนผิด

### 11.3 Visual/mobile tests

- Android portrait 360×800
- Android portrait 412×915
- Android landscape 800×360
- desktop 1280×720
- Stage card ไม่ล้นจอ
- Boss bar, NPC button และ action button ไม่ทับกัน
- bottom sheet ปิดด้วยปุ่ม, backdrop และ drag gesture
- font/contrast/feedback อ่านได้บนทุก biome

### 11.4 Performance gates

- ไม่เพิ่ม runtime wild เกิน stage profile
- ไม่มี WebGL/resource leak เมื่อสลับ zone หลายครั้ง
- quality tier ต่ำต้องลด shadow/VFX ตาม profile
- frame time ต้องไม่ตกอย่างมีนัยสำคัญเมื่อเปิด Boss arena บนมือถือเป้าหมาย
- `git diff --check`, active entry parity และ runtime syntax ต้องผ่านทุก PR

---

## 12. Definition of Done ต่อด่าน

ด่านหนึ่งถือว่าเสร็จเมื่อครบทุกข้อ:

- มี catalog data และ schema validation
- เข้า/ออกด่านได้จาก UI จริง
- มีอย่างน้อย 2 normal encounter, 1 Elite และ 1 Boss
- มี primary/secondary types และ spawn table ที่ตรวจสอบได้
- มี biome presentation และ environment profile
- มี reward profile และ idempotent first-clear
- Save/Load progress ได้
- Boss จับไม่ได้และ Elite ใช้ policy กลาง
- เล่น golden path จบได้โดยไม่ soft-lock
- รองรับมือถือ portrait/landscape
- มี unit/integration/regression test
- ไม่มีการเปลี่ยน Ring 0/Ring 1 โดยไม่ได้รับอนุมัติ
- เอกสาร/CHANGELOG/TASKS ถูกอัปเดตเมื่อเข้าข่าย

---

## 13. ความเสี่ยงและวิธีลดความเสี่ยง

| ความเสี่ยง | ผลกระทบ | วิธีลดความเสี่ยง |
|---|---|---|
| เพิ่มด่านเร็วเกินระบบ foundation | state และ reward พัง | ทำ catalog/progress ก่อน content |
| hard-code stage logic | เพิ่มชุดถัดไปยาก | บังคับใช้ profile และ resolver |
| VFX แต่ละ biome หนักเกินมือถือ | FPS ตก | quality profile และ performance gate |
| Boss reward ซ้ำ | economy เสีย | idempotency key และ test callback ซ้ำ |
| status effect ทับกับ Type Resolver | combat ไม่สมดุล | แยก environment modifier และ Ring 2 config |
| map ใหญ่เกิน vertical slice | scope บาน | จำกัด node และเวลาเล่นต่อรอบ |
| UI หลายชั้นบนมือถือ | ผู้เล่นหลง/กดไม่ได้ | bottom sheet, back path และ touch target |
| เพิ่ม species โดยไม่เชื่อม asset | runtime fallback/โหลดไม่ครบ | catalog asset validation ก่อน PR |

---

## 14. คำตัดสินที่ต้องขอก่อนเริ่ม content ชุดแรก

ค่าเริ่มต้นที่ใช้ทำงานได้ทันที:

- ใช้ Stage Select แยกจาก Hub และโหลด zone แยก
- Set 1 มี 4 ด่าน: Grass, Fire, Water, Electric
- แต่ละด่านมี 2 normal encounter + 1 Elite + 1 Boss
- เคลียร์ Boss ของ stage ก่อนหน้าเพื่อปลดล็อก stage ถัดไป
- เคลียร์ครบ Set 1 เพื่อปลดล็อก Set 2
- ใช้ deterministic seed ต่อ run สำหรับ QA
- Environment เป็น presentation ก่อน และไม่เปลี่ยน Type Effectiveness
- Boss จับไม่ได้, Elite จับได้ตาม policy กลาง

ถ้าผู้ใช้ต้องการเปลี่ยนจำนวนด่าน, ความยาว, หรือรูปแบบ Boss ให้แก้ส่วนนี้ก่อนเริ่ม PR 1

---

## 15. ลำดับงานที่แนะนำถัดไป

1. Review และ lock ค่าในหัวข้อ 14
2. สร้าง stage schema/catalog โดยยังไม่สร้าง map ใหญ่
3. เพิ่ม migration ของ `stageProgress`
4. ทำ Stage Select แบบ mobile-first
5. ทำ Grass Meadow เป็นด่าน reference หนึ่งด่าน
6. ทดสอบ golden path และ performance
7. คัดลอก pattern ผ่าน catalog ไป Ember Valley, Misty Lake และ Storm Field
8. เปิด PR Set 1 เมื่อครบ acceptance gate

**ข้อสรุป:** เริ่มจากระบบด่านและด่าน reference หนึ่งด่านก่อน แล้วขยายเป็น Set 1 ให้ครบ 5 ธาตุ จากนั้นจึงทำ Set 2–4 ตาม contract เดียวกัน การแบ่งแบบนี้ทำให้ครบ 18 ธาตุได้โดยไม่ขยาย scope ระบบ combat, Ranch และ mobile UI เกินกว่าที่ตรวจสอบได้ในแต่ละรอบ
