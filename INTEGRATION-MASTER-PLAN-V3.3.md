# Pirate Fruit + Pocket Monster + World Simulator
## Integration Master Plan v3.3

**Status:** Architecture Baseline / Implementation Planning
**Architecture:** Federation of Authorities + Authoritative World/Server Computation
**Execution strategy:** Presentation First → Headless World Runtime → Unified CombatStats → Authoritative Server Combat → Persistence/Replay/Online
**GitHub:** PR #313 is **PR 0** in §19 (architecture baseline + contracts freeze)

---

## 0. Relation to this repository

เอกสารนี้เป็น architecture freeze ของ **PocketMonster** (`nustanakritwithai/PocketMonster`) เท่านั้น ไม่ใช่ใบอนุญาตให้ย้าย simulation เข้า Client และไม่แทนที่แผน Goal 1/2

| System | In this repo today? | Role in this plan |
| --- | --- | --- |
| Pocket Monster client live loop | Yes (`game-v800.js`, app `8.4.0`) | Domain owner ของ monster progression/content; ตอนนี้ยัง execute combat บน client |
| Monster six-stat contract | Yes (`monster-stat-contract.mjs` `MONSTER_STAT_KEYS`) | Vocabulary ที่ Pocket calculator ต้องฉายเข้า Canonical CombatStats |
| Goal 1 / Goal 2 VPS path | Yes (`docs/INTEGRATION-INVENTORY-GOAL1.md`, `docs/GOAL2-STAGING-READONLY.md`, `docs/POST-GOAL1-ROADMAP.md`) | Near-term server probe แบบ read-only; แผนนี้**ห้าม**เปิด writes, account migration หรือข้าม Goal 2 gate |
| MonsterLifeServer | Separate repo | API host ปัจจุบันของ health / version / launch-ticket |
| Pirate Fruit | Not in this repo | Human / Ship domain owner |
| Living World Physics Simulator 20.9.4 | Not in this repo | Future World/Server runtime baseline |

กติกาสำหรับ implementation PR ใน repository นี้:

- Presentation-First (Phase A–C / PR 1–3) แสดงผลได้อย่างเดียว ห้ามให้ Client เป็น authority ของ position, stats, damage, HP, status หรือ world state
- อย่าเปิด `vpsWrites` / `playerDataWrites` หรือ production feature flag จากงานตามแผนนี้
- Field หลักของ Canonical CombatStats ต้องใช้ชื่อเดียวกับ Pocket: `atk`, `def`, `spAtk`, `spDef`, `spd` — ห้ามใช้ `spatk` / `spdef`
- `hp` ใน `MONSTER_STAT_KEYS` คือค่า HP จากสูตร progression ของ Pocket; Canonical CombatStats แยกเป็น `hpMax` และ `hpCurrent` ที่ target owner เป็นคน commit

---

## 1. เป้าหมาย

รวม Pirate Fruit, Pocket Monster และ Living World Physics Simulator 20.9.4 ให้เป็นเกมเดียว โดยไม่ทำลาย progression, gameplay identity หรือ source-of-truth ของแต่ละโปรเจกต์

หลักสูงสุด:

- Pirate Fruit ยังคงเป็นเจ้าของ Human/Player progression, inventory, equipment, mastery, quest, trade และ rule definitions ของมนุษย์/เรือ
- Pocket Monster ยังคงเป็นเจ้าของ Monster species, progression, type, skill, passive, capture, evolution, breeding และ party/collection
- World Simulator / Game Server เป็น authoritative runtime ที่ถือความจริงของโลกและเป็นผู้ execute การคำนวณจริงของเกมรวม
- Shared Core เป็นเจ้าของเฉพาะ versioned schema, contracts, validation, serialization, replay protocol และ event vocabulary ไม่ถือ gameplay truth
- Client ส่ง Intent และแสดงผลเท่านั้น ห้ามเป็น authority ของ position, stats, damage, HP, status หรือ world state

---

## 2. Federation of Authorities

### Pirate Fruit
เจ้าของ:

- Player Account / Character
- Human progression
- Combat / Vitality / Blade / Ranged / Fruit Power
- Mastery
- Weapon / Equipment
- Inventory
- Quest
- Trade gameplay definitions
- Ship gameplay definitions
- Human/Ship rule definitions ที่ Server ใช้ execute

### Pocket Monster
เจ้าของ:

- Species
- Level / Potential / Growth / Training
- Type
- Learnset / Monster Skills
- Passive
- Capture
- Evolution
- Breeding
- Party / Collection
- Monster rule definitions ที่ Server ใช้ execute

### World Simulator / Game Server
เจ้าของ:

- WorldClock
- WorldGrid / canonical position
- Terrain / obstacle / line-of-sight / safe zone
- Weather / climate / hydrology
- Hunger / thirst / fatigue / life energy
- Injury
- Memory / knowledge
- Psychology / PsychologicalFear
- Relationship / territory
- Situation / Goal / strategic AI
- Ecology / population / resources / migration
- Materialization / LOD
- World tick snapshots
- Effective combat computation
- Hit / Miss / Crit / Defense / Damage / Status execution
- Deterministic multi-actor ordering
- World consequences หลัง CombatOutcome

### Shared Core
ถือเฉพาะ:

- EntityId / EntityKind
- CombatStats schema
- Command / Event contracts
- Combat request/result contracts
- StatusEffect lifecycle contract
- CombatClock / sequence contract
- Serialization / replay contract
- Structural validation / safety bounds

Shared Core **ห้าม** เป็นเจ้าของ progression formula, HP store, damage formula, psychology หรือ world state

---

## 3. Canonical CombatStats Architecture

Human, Monster, NPC, Boss และ Ship ใช้ CombatStats vocabulary เดียวกัน

```ts
type CombatStats = {
  hpMax: number
  hpCurrent: number
  atk: number
  def: number
  spAtk: number
  spDef: number
  spd: number
  accuracy: number
  crit: number
  evasion: number
  resistance: number
  penetration: number
}
```

### Hard Rule

**แชร์ Schema แต่ไม่แชร์ที่มาของค่า**

Pirate Fruit:

```text
HumanProgressionState
Combat / Vitality / Blade / Ranged / FruitPower
Mastery / Weapon / Equipment / Level
        ↓
HumanStatCalculator (server-side)
        ↓
Base CombatStats
```

Pocket Monster:

```text
MonsterProgressionState
Species / Level / Potential / Growth / Training
Type / Passive / Equipment
        ↓
MonsterStatCalculator (server-side)
        ↓
Base CombatStats
```

Ship:

```text
Ship progression / hull / weapon / equipment
        ↓
ShipStatCalculator (server-side)
        ↓
Base CombatStats
```

ห้ามสร้าง `UniversalStatCalculator`

ชื่อ `atk` / `def` / `spAtk` / `spDef` / `spd` เหมือนกันไม่ได้หมายความว่าสูตรสร้างค่าต้องเหมือนกัน

ใน PocketMonster วันนี้ MonsterStatCalculator อยู่ฝั่ง client (`monster-stat-contract.mjs` + formula/runtime). PR ถัดไปย้ายได้เฉพาะ **ที่ execute** ไป server โดย Pocket ยังเป็นเจ้าของสูตรและ `definitionVersion`

---

## 4. Base / Effective / Current Combat State

ต้องแยก semantic 3 ชั้น

### Base CombatStats
ผลที่ derive จาก progression และ definitions ของ Domain

```text
hpMax / atk / def / spAtk / spDef / spd
accuracy / crit / evasion / resistance / penetration
```

### Effective CombatStats
Base CombatStats หลัง World/Status/Temporary modifier ของ combat tick นั้น

```text
Base CombatStats
+ World conditions
+ Buff / Debuff
+ Runtime status
+ encounter effects
        ↓
Effective CombatStats Snapshot
```

Effective stats เป็น **immutable snapshot ต่อ combat tick**

### Current Combat State
mutable state ที่มี owner ชัดเจน

- HPCurrent
- cooldown
- skill uses
- buffs/debuffs
- runtime statuses
- combat sequence state

`CombatStats.hpCurrent` เป็น snapshot/view ที่ Domain Owner expose ให้ Combat อ่าน ไม่ใช่ Shared HP storage

---

## 5. HP Single Writer

- Human / Human NPC HP → Pirate state owner
- Monster / Wild / Owned / Boss Monster HP → Pocket state owner
- Ship HP → Pirate/Ship state owner
- Shared/World Combat Engine อ่าน snapshot และสร้าง DamageProposal
- Target owner เป็นผู้ commit HP
- CombatOutcome(committed=true) สร้างได้หลัง authoritative commit สำเร็จเท่านั้น

ตัวอย่าง:

```text
CombatStats.hpCurrent = 500
        ↓
Server calculates DamageProposal = 120
        ↓
Pocket commits Monster HP 500 → 380
        ↓
CombatOutcome
hpBefore = 500
hpAfter  = 380
committed = true
```

ห้ามมี SharedHPStore หรือ WorldCombatHP สำรอง

---

## 6. World Tick Snapshot

หนึ่ง authoritative world tick ต้องเป็นโลกชุดเดียวกันสำหรับ Actor ทุกตัว

```text
WorldTickSnapshot #10482
├ Player
├ Human NPC
├ Monster A
├ Monster B
├ Boss
└ Ship
```

ทุก actor ที่ resolve ใน tick เดียวกันต้องอ่าน world truth จาก snapshot เดียวกัน

ห้ามใช้ Client FPS, Promise order หรือ network arrival order เป็น simulation truth

ถ้า Base Stats เปลี่ยนระหว่าง encounter ให้ recalculation มีผลตั้งแต่ action/tick ถัดไป

ถ้า `hpMax` เปลี่ยนกลาง combat:

- เปลี่ยนเฉพาะ hpMax
- hpCurrent ไม่ scale ตามเปอร์เซ็นต์
- hpCurrent ห้าม derive ใหม่โดย Stat Calculator

---

## 7. World Combat Computation

World/Server Runtime เป็น authoritative computation host

World เป็นผู้คำนวณจาก:

- CombatStats
- Position
- Range
- LOS
- Safe Zone
- Terrain / Cover
- Weather
- Hunger / Fatigue
- Injury
- Psychology / Situation
- Runtime Status
- Buff / Debuff
- Ability metadata
- Domain RuleSet

จากนั้นสร้าง Effective CombatStats และ resolve:

- target validity
- range / LOS
- permission
- initiative / sequence
- hit / miss
- critical
- defense
- resistance / penetration
- damage
- status lifecycle
- multi-target / multi-actor ordering

Server ใช้ rule definitions ของ Pirate/Pocket/Ship ตาม Entity/Ability แต่ execution จริงเกิดใน authoritative server runtime

---

## 8. World Conditions และ Modifier

World เป็น source authority ของ:

- Hunger
- Fatigue
- Injury
- Weather
- Terrain
- Psychology
- Situation

ตัวอย่าง:

```text
Base ATK = 300
Injury modifier = ×0.80
Effective ATK = 240
```

Base ATK ยังคง 300

World modifier ห้าม mutate native progression หรือ Base CombatStats ถาวร

Shared ตรวจเฉพาะ structural/safety bounds ส่วน balance bounds เป็นของ Domain + `definitionVersion`

---

## 9. Status Architecture

ใช้ StatusEffect lifecycle protocol กลาง แต่ semantic เฉพาะเป็นของโดเมน และสถานะในคอมแบตเป็น **server-authoritative เสมอ** (snapshot ต้องถือ `authority: 'server'`)

### สัญญาที่ใช้จริง (V9.1)

Status snapshot ที่แลกเปลี่ยนระหว่าง Client/Server (`combat-v91-status.mjs`):

```text
authority: 'server'
combatId
entityId
ownerDomain
statusStateVersion   // CAS — เปลี่ยนผ่านแบบ atomic เท่านั้น
fingerprint
state                // encounter status state
```

Runtime status แต่ละตัว (`status-lifecycle.mjs`):

```text
statusId                                  // แคตตาล็อก ST_* (status-catalog.mjs, 26 สถานะ)
sourceSkillId / sourceLinkId / sourceInstanceId
stacks
appliedAtSec / expiresAtSec / nextTickAtSec
stackRule / category
```

### Stacking rules และ interactions

- Stack rules: `StrongestWinsRefresh`, `AddStackAndRefresh`, `ReplaceByLonger`, `Replace`
- `STATUS_INTERACTIONS` กำหนดการแทนที่/ยกเลิกข้ามสถานะ
- Hard-CC มี diminishing returns (`HARD_CC_DR_POLICY`) — ระยะเวลาถูกทอนลงเมื่อถูกควบคุมซ้ำในหน้าต่างเวลาเดียวกัน

### ผลต่อ Effective CombatStats

Status ห้ามเขียนทับ Base — ผลปรากฏเป็น modifier ในชั้น Effective เท่านั้น:

```text
ATK Up     → attackMultiplier
DEF Up     → defenseMultiplier
SPD Up     → speedMultiplier
Crit Up    → critChancePct
Evasion Up → evasionChancePct
```

Client แสดงค่ารวมจาก modifier ชุดเดียวกันกับการคำนวณคอมแบต — ทางเดียว ไม่มีค่าอีกชุดสำหรับแสดงผล

### Server authority และ correction

Client ทำนาย `predictedStatusSnapshots` ได้ แต่ commit จริงต้องมาจาก `authoritativeStatusSnapshots` ใน authority response — ผลเป็น `confirmed / corrected / rejected` ตามความตรงกันของผลสถานะและดาเมจกับการทำนาย

### Namespace เป้าหมายเมื่อรวมโลก

ตัวอย่างด้านล่างเป็นเป้าหมายเมื่อระบบโลกรวมกัน — ปัจจุบัน Pocket ใช้แคตตาล็อก `ST_*` ชุดเดียว:

```text
shared.stun
human.bleed
monster.burn
world.exhausted
world.hypothermia
```

Armor / Type / Passive / Equipment และ domain-specific semantics ยังมาจาก rule definitions ของเจ้าของโดเมน และ Server เป็นผู้ execute

### Fear Separation

`FearStatus` ใน Combat และ `PsychologicalFear` ใน World เป็นคนละข้อมูล

```text
FearStatus expires
        ↓
Committed combat/world event
        ↓
World Memory / PsychologicalFear / Situation / Goal
```

Combat ห้ามเขียน Psychology โดยลัดข้าม World state pipeline

---

## 10. Strategic AI Continuity

World Strategic AI ต้องต่อเนื่องก่อน ระหว่าง และหลัง combat

World ตัดสิน:

- WHY
- WHETHER
- WHEN

เช่น:

- protect offspring
- hunt food
- defend territory
- flee due to fear
- retaliate from memory

Domain rule definitions ให้ capability ของ Human/Monster ส่วน Server ใช้ capability นั้น execute tactical combat

หลัง combat:

```text
CombatOutcome
    ↓
Memory
PsychologicalFear
Relationship
Situation
Goal
Injury
Ecology / Population
```

Monster ที่หนีจากผู้เล่นไม่ถูกลบเชิงชีวิต แต่กลับไปเป็น World Entity เดิมและดำเนินชีวิตต่อก่อนลด LOD

---

## 11. Identity / Capture / Materialization

ทุก Entity ใช้ EntityId เดิมข้าม World / Gameplay / Combat

Combat representation เป็น view ชั่วคราวของ Entity เดิม ห้ามสร้าง Combat Entity ที่กลายเป็นตัวตนใหม่

### Capture

Capture คือ ownership transition ไม่ใช่ clone

```text
Entity W000812
Owner = WORLD
        ↓ Capture success
Owner = Player
        ↓
Pocket Collection references W000812
```

Memory / history / relationship / world identity เดิมยังอยู่

---

## 12. Materialization และ LOD

ใช้ Materialize / Dematerialize แทนการ Spawn/Delete เชิงชีวิต

- LOD A = Full Individual Simulation
- LOD B = Reduced Individual
- LOD C = Population Abstraction

Owned Monster, Boss, Named NPC และ Quest Entity ต้องรักษา individual identity ตาม policy

Combat exit ต้องคืน Entity กลับ World continuity ก่อนลด LOD

---

## 13. Persistence

แยก storage ตาม authority แต่เชื่อมด้วย EntityId

```text
WorldStore
HumanStore
MonsterStore
```

ต้องมี:

- schemaVersion
- versioned migration
- backup snapshot
- orphan link validation
- deterministic replay log
- fingerprints

---

## 14. Provenance / Determinism

ทุก Combat snapshot ต้อง trace ได้อย่างน้อย:

- entityId
- ownerDomain
- progressionStateVersion
- calculationVersion
- definitionVersion
- worldSnapshotTick
- worldModifierVersion
- combatTick
- stateVersion
- fingerprint

ห้าม silently mix calculation version ต่างกันใน deterministic replay

stale snapshot ต้องถูก reject ตาม policy เช่น:

- STALE_COMBAT_PROFILE
- STALE_COMBAT_STATE
- STALE_WORLD_SNAPSHOT

---

## 15. Presentation-First Integration Roadmap

### Phase A — Map / Presentation Integration
รวมส่วนที่ไม่เกี่ยวกับ authoritative backend ก่อน

- Map
- World regions
- Minimap
- Player/Monster/NPC representation
- Renderer
- Visual materialization

**Exit Gate:** แสดงโลกและ Entity หลายประเภทบน Client เดียวได้โดยไม่ย้าย simulation authority เข้า Client

### Phase B — Unified UI / HUD

- Player HUD
- Monster HUD
- Party
- Character
- Inventory / Equipment
- Skills
- Quest
- Map
- World Status
- Combat HUD
- Ship HUD

### Phase C — EntityView + Mock Gateway

สร้าง read-only presentation contracts เพื่อให้ UI เดินต่อได้ก่อน backend integration เสร็จ

### Phase D — Headless Living World Runtime

นำ Living World Physics Simulator 20.9.4 มาใช้เป็น headless server core

รักษา:

- fixed tick
- deterministic queue
- seeded RNG
- climate/hydrology/ecology
- needs/cognition/memory/psychology
- replay/fingerprint

### Phase E — EntityId + Spatial Authority

สร้าง:

- EntityId seam
- WorldPresence
- canonical WorldPosition
- Region/Cell
- LOS
- obstacle
- terrain
- safe zone
- materialization

### Phase F — Canonical CombatStats

เพิ่ม Shared schema และ server-side calculators:

- HumanStatCalculator
- MonsterStatCalculator
- ShipStatCalculator

### Phase G — WorldTickSnapshot + Effective Stats

- one-world snapshot per tick
- world conditions
- temporary effects
- Effective CombatStats
- version/fingerprint validation

### Phase H — Authoritative Server Combat Engine

Server resolve:

- target/range/LOS
- hit/miss/crit
- defense
- damage
- status
- deterministic sequence

### Phase I — HP / Status Commit

- target-owner commit
- committed CombatOutcome only
- no fake success

สถานะ ณ ก.ย. 2026: เส้นทางนี้พิสูจน์แล้วผ่าน **opt-in QA authority เท่านั้น** (Client PR #351 + Server PR #18 — reconnect replay, confirmed/corrected, atomic commit) — production ยังเป็น fail-closed (`combat.enabled=false`, `shadowMode=true`) จนกว่าจะเปิด commit จริง

### Phase J — World Consequences

CombatOutcome → Memory / Fear / Relationship / Situation / Goal / Injury / Ecology / Population

### Phase K — Capture / Ship / Economy

- same-EntityId capture ownership transition
- Ship integration
- world economic truth + Pirate trade rules

### Phase L — Persistence / Online Authority

- World/Human/Monster stores
- migrations
- gateway
- prediction/reconciliation
- interest management

### Phase M — PvP / Boss / Multi-Actor / Optimization

- Human vs Human
- Human vs Monster
- Monster vs Monster
- Human + Monster vs Boss
- Ship encounter
- deterministic multi-actor soak
- LOD/network optimization

---

## 16. Living World 20.9.4 Source Integration

Living World 20.9.4 เป็นฐานที่เหมาะสำหรับ World/Server Runtime เพราะมี deterministic fixed tick, ordered command queue, seeded RNG, ecosystem/resources, cognition/memory/psychology และ replay/certification infrastructure อยู่จริง

จุดที่ต้อง refactor ก่อน integrated combat:

- AnimalState legacy health/combat state ต้องไม่กลายเป็น HP authority ซ้ำ
- AnimalSystem legacy damage/death path ต้องย้ายเข้าสู่ authoritative integrated combat pipeline
- SpeciesProfile ต้องแยก ecology/biology data ออกจาก gameplay combat definitions ของ Pocket
- Renderer/UI เดิมใช้เป็น debug/inspector ได้ แต่ไม่เป็น server authority
- เพิ่ม EntityId / WorldPresence / materialization / LOD contracts ที่ยังขาด

---

## 17. Non-Negotiable Invariants

1. หนึ่ง Entity มี EntityId เดียว
2. Client ไม่เป็น authority
3. Human/Monster/Ship ใช้ CombatStats schema เดียว
4. Shared schema ไม่เท่ากับ Shared ownership
5. ไม่มี UniversalStatCalculator
6. ไม่มี SharedHPStore
7. Target owner เป็น HP single writer
8. Base CombatStats ห้ามถูก modifier เขียนทับ
9. ทุก actor ใน tick เดียวใช้ WorldTickSnapshot เดียว
10. CombatOutcome ต้องเกิดหลัง authoritative commit
11. Damage ไม่เท่ากับ Injury; World เป็นผู้ประเมินผลต่อ life state
12. FearStatus ไม่เท่ากับ PsychologicalFear
13. Capture ห้าม clone individual
14. Combat exit ห้ามลบ living entity
15. deterministic replay ต้องได้ outcome และ world fingerprint เดิมจาก state/seed/commands เดิม

---

## 18. Acceptance Gates ก่อน Combined Gameplay

ต้องผ่านอย่างน้อย:

- Human/Monster/NPC/Boss/Ship validate ด้วย CombatStats schema เดียว
- Base stats คงเดิมเมื่อ World modifier เปลี่ยน Effective stats
- hpCurrent ถูก commit โดย target owner เท่านั้น
- hpMax เปลี่ยนแล้ว hpCurrent ไม่ถูก scale/re-derive
- one tick = one WorldTickSnapshot สำหรับทุก actor
- same seed/state/commands → same CombatStats fingerprint + CombatOutcome + World fingerprint
- FearStatus หมดได้แต่ World Memory/PsychologicalFear ยังต่อเนื่อง
- สถานะคอมแบตเปลี่ยนผ่านเฉพาะผ่าน server authority (`statusStateVersion` CAS) — Client ทำนายได้อย่างเดียว ห้ามคอมมิตเอง
- ผลของสถานะปรากฏเป็น modifier ในชั้น Effective เท่านั้น ห้ามเขียนทับ Base CombatStats
- combat exit คืน Entity เดิมกลับ World runtime
- capture ใช้ EntityId เดิม
- no UI success before authoritative commit

---

## 19. PR Execution Strategy

แนะนำให้แยก implementation เป็น PR เล็กตาม boundary แทนการ merge ระบบทั้งหมดใน PR เดียว

- **PR 0:** Architecture baseline + contracts freeze — GitHub PR #313, this document
- **PR 1:** Map / World region presentation integration
- **PR 2:** Unified UI/HUD + EntityView
- **PR 3:** Mock Gateway / read-only world snapshot contracts
- **PR 4:** Headless Living World runtime baseline
- **PR 5:** EntityId / WorldPresence / spatial authority
- **PR 6:** Canonical CombatStats contract + calculators
- **PR 7:** WorldTickSnapshot / Effective CombatStats
- **PR 8:** Server Combat Engine
- **PR 9:** HP/status commit + CombatOutcome
- **PR 10:** World consequence interpretation
- **PR 11:** Capture / ownership / materialization / LOD
- **PR 12:** Ship / economy / quest integration
- **PR 13:** Persistence / online authority
- **PR 14:** PvP / Boss / multi-actor / replay soak

ทุก PR ต้องระบุ:

```text
Scope:
Domain Owner:
Affected Authority Fields:
Contracts Added/Changed:
Migration Required:
Determinism Risk:
Replay Fingerprint Before/After:
Acceptance Tests:
Rollback Plan:
Files Removed:
Cross-domain dependencies introduced:
```

### PR 0 (this PR) filled template

```text
Scope: Documentation-only architecture freeze for federation of authorities
Domain Owner: Shared Core (contracts freeze) + PocketMonster repo documentation
Affected Authority Fields: none; no runtime HP/position/combat writes
Contracts Added/Changed: Canonical CombatStats field names locked to Pocket keys
Migration Required: no
Determinism Risk: none (no executable change)
Replay Fingerprint Before/After: n/a
Acceptance Tests: document names spAtk/spDef; Goal 1/2 write gates remain closed
Rollback Plan: revert this markdown file
Files Removed: none
Cross-domain dependencies introduced: none in code; Pirate Fruit and Living World 20.9.4 remain external
```

---

## 20. Definition of Done

Architecture integration ถือว่าพร้อมเมื่อ:

- World Simulator รัน headless ได้โดยไม่มี client
- Pirate Human progression และ Pocket Monster progression ยังไม่ถูกยุบเข้าหากัน
- Human/Monster/NPC/Boss/Ship ใช้ Canonical CombatStats ได้จริง
- Server เป็น authoritative computation host
- World spatial/world-life truth เป็น canonical
- HP single writer invariant ผ่าน
- Capture same EntityId invariant ผ่าน
- World consequences ต่อเนื่องหลัง combat
- LOD ไม่ทำ identity/history หาย
- Save/migration/replay ผ่าน
- PvP/Boss/Multi-Actor ใช้ deterministic ordering เดียวกัน
- Presentation ไม่มี authority leak

---

## Final Architecture Statement

> **Pirate Fruit กำหนด progression และ gameplay rules ของมนุษย์/เรือ, Pocket Monster กำหนด progression และ gameplay rules ของมอนสเตอร์, World Simulator/Game Server ถือความจริงของโลกและ execute การคำนวณจริงทั้งหมด, Shared Core เป็นภาษากลางและ contract layer โดยไม่ยึด gameplay state ของโดเมนใด**

เป้าหมายสุดท้ายคือให้ Human, Monster, NPC, Boss และ Ship อยู่ในโลกและ encounter เดียวกันได้ โดยใช้ EntityId และ CombatStats vocabulary ร่วมกัน แต่ยังรักษา progression, definitions และ gameplay identity ของแต่ละระบบไว้ครบ
