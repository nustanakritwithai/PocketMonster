# ส่งมอบงาน Client Combat Stats และ Combat Status V9.1

เอกสารนี้เป็น handoff สำหรับผู้พัฒนาฝั่ง Client โดยยังไม่มี implementation ของ Combat V9.1 อยู่ใน PR นี้ จุดประสงค์คือทำให้ผู้รับช่วงเริ่มจาก production ล่าสุด ใช้ระบบเดิมที่พิสูจน์แล้วก่อนเขียนใหม่ และไม่สร้างเครื่องคำนวณแยกตามโลก

## ฐานที่ต้องใช้

- Repository: `nustanakritwithai/PocketMonster`
- Base commit: `382cec899fb241907b0b7b954a41686f6be3b8fa`
- Product version: `8.4.0`
- Production release ที่ตรวจแล้ว: `8.4.0-github.382cec899fb241907b0b7b954a41686f6be3b8fa`
- Production manifest ที่ตรวจแล้ว: `8.4.0.content.5f7878bcdb7b` จำนวน 194 ไฟล์
- ออนไลน์แล้วบางส่วน: Launch Ticket, Firebase authentication bridge, VPS reads/profile reads และ WebSocket world presence
- ยังไม่อนุญาตให้ Client เขียน state จริง: `vpsWrites=false`, `playerDataWrites=false`, economy mutation ปิด และ Pirate Fruit ยังแสดง `WORLD ONLINE · SAVE LOCAL`

ห้ามเริ่มจาก clone เดิมที่ HEAD `9e0a935` แม้ไฟล์ Combat/Status หลักระหว่าง `9e0a935` กับ `382cec8` จะไม่มี diff เพราะ clone เดิมขาดงาน online integration ล่าสุด

## เป้าหมายที่ล็อกแล้ว

```text
Pirate / Pocket / โลกอื่น
        ↓ Legacy domain adapters
BaseCombatProfile กลาง
        ↓ World modifiers แบบมีเวอร์ชัน
Effective CombatStats V9.1
        ↓
CombatRules V9.1 ชุดเดียว
        ↓
Client คำนวณและแสดงผลทันที
        ↓
Server คำนวณซ้ำ → Confirm / Correct / Reject
        ↓
Server commit HP / Status / แพ้ชนะ / รางวัล
```

กฎที่ห้ามเปลี่ยน:

1. Human, Monster, NPC, Boss และ Ship ใช้ CombatStats และ CombatRules ชุดเดียวกัน
2. สูตร Pirate/Pocket เดิมใช้สร้าง `BaseCombatProfile` เท่านั้น
3. ห้ามมี damage engine แยกตาม `ownerDomain` หรือ `entityKind` ในการต่อสู้จริง
4. `World modifiers` เป็นข้อมูลประกอบที่มี version เช่น terrain, weather, zone buff หรือ room rule ไม่ใช่สูตร damage ใหม่ของแต่ละโลก
5. Client เป็น prediction/presentation authority เท่านั้น Server หรือ target owner เป็น canonical writer
6. Client ห้าม commit HP จริง, Status จริง, ผลตาย/แพ้ชนะ, reward, inventory หรือ progression

## CombatStats กลาง 12 ค่า

ใช้ชื่อ JSON และตัวพิมพ์ตรงตามนี้:

```js
{
  hpMax,
  hpCurrent,
  atk,
  def,
  spAtk,
  spDef,
  spd,
  accuracy,
  crit,
  evasion,
  resistance,
  penetration
}
```

ข้อกำหนดขั้นต่ำ:

- ทุกค่าเป็น finite number และไม่ติดลบ
- `hpCurrent <= hpMax`
- `accuracy`, `crit`, `evasion`, `resistance` และ `penetration` เป็น normalized ratio ช่วง `0..1`
- Base profile ต้อง immutable
- Profile ต้องระบุ `entityId`, `ownerDomain`, `entityKind`, `level`, `types`, `progressionStateVersion`, `calculationVersion`, `definitionVersion`, `stateVersion` และ SHA-256 fingerprint
- Entity kind ที่รองรับ: `Human`, `Monster`, `Npc`, `Boss`, `Ship`

## ของเดิมที่ต้องนำกลับมาใช้

| แหล่งเดิม | บทบาทใน V9.1 |
|---|---|
| `monster-stat-contract.mjs` | สัญญา progression ของ Monster และ stat keys เดิม |
| `monster-stat-formula.mjs` | คำนวณ Monster base stats เดิม ห้ามเขียนสูตรซ้ำ |
| `monster-stat-catalog.mjs` | definition/base stat ของ Monster |
| `status-catalog.mjs` | registry ของสถานะ 26 รายการและ skill links |
| `status-resolver.mjs` | chance, immunity, resistance และ stack proposal |
| `status-lifecycle.mjs` | duration, tick, interaction, stack และ hard-CC diminishing return |
| `combat-status-runtime.mjs` | action/movement restriction และ status descriptors ที่ใช้งานจริง |
| `skill-effect-runtime.mjs` | แหล่งอ้างอิง live damage/status modifiers เดิมและ parity vectors |
| `damage-resolver.mjs` | preview/reference เท่านั้น ห้ามเลื่อนเป็น live authority โดยเงียบ ๆ |
| Pirate `shared/src/progression/stats.ts` ที่ commit `4df5721` | แปลง Pirate progression เป็น base profile |
| `PirateAuthorityDamageRule` | legacy reference/parity test เท่านั้น |
| `PocketWorkbookPreviewDamageRule` | legacy reference/parity test เท่านั้น |

สูตร Pocket ที่ต้องรักษา parity:

```text
floor(((2 * base + potential + training / 4) * level) / 100)
  + (HP ? level + 10 : 5)
```

สูตร Pirate ที่ต้องรักษา parity:

- ค่าสเตตัสสูงสุด 2,800
- HP/Energy/MP เริ่ม 100
- Vitality เพิ่ม HP 5 ต่อแต้มหลังแต้มแรก
- Damage multiplier สูงสุดอ้างอิง `78.26`
- Damage per stat point คือ `(78.26 - 1) / 2800`
- Mapping: style → combat, sword → blade, gun → ranged, fruit → fruitPower
- ใช้พฤติกรรม rounding แบบ `Math.round` ของ JavaScript ใน parity test

Adapter ห้ามแต่ง `def`, `spDef`, `spd` หรือ rating ที่ legacy progression ไม่มี ต้องรับจาก versioned definition/catalog หรือ fail closed

## Status กลาง

Registry ปัจจุบันมี 26 IDs:

```text
ST_BURN, ST_POISON, ST_BLEED, ST_SWARM, ST_SLOW, ST_FREEZE,
ST_PARALYZE, ST_STUN, ST_ROOT, ST_FEAR, ST_CONFUSE, ST_BLIND,
ST_WEAKEN, ST_ARMOR_BREAK, ST_VULNERABLE, ST_STAGGER,
ST_ATK_UP, ST_DEF_UP, ST_SPATK_UP, ST_SPD_UP,
ST_DAMAGE_REDUCE, ST_EVASION_UP, ST_CRIT_UP, ST_ATKDEF_UP,
ST_FIRE_RESIST, ST_POISON_RESIST
```

ทุกโลกต้องใช้ registry/lifecycle เดียวกันสำหรับ stack, potency, duration, tick, immunity, resistance, interaction และ hard-CC DR โดยต้องคง DR window 6 วินาทีและ multiplier เดิม `[1, 0.65, 0.4]` พร้อม minimum `0.25` จนกว่าจะมีการเปลี่ยนกฎแบบ versioned

`ST_FEAR` ใน Combat เป็น control effect เท่านั้น ต้องแยกจากระบบอารมณ์หรือจิตวิทยาของ Living World

## CombatRules V9.1

Action definition กลางควรรองรับอย่างน้อย:

- `actionId` และ `definitionVersion`
- physical/special channel
- power, accuracy, element และ hit count
- critical allowed/disabled
- armor pierce
- status applications
- injected deterministic RNG

ลำดับ RNG ต้องคงที่และทดสอบซ้ำได้ โดยผลลัพธ์เป็น proposal ที่ประกอบด้วย hit/crit/damage, predicted HP, proposed statuses, consumed RNG trace และ fingerprints ห้ามแก้ canonical profile ภายใน resolver

สูตรเดียวต้องครอบคลุม accuracy/evasion, physical หรือ special defense, penetration, resistance, STAB, type effectiveness, critical, variance และ status modifiers โดยห้าม branch เลือกสูตร Pirate/Pocket

## Prediction และ Server reconciliation

Client store ต้องแยกข้อมูลอย่างน้อย:

- `authoritativeBase`
- `effectiveConfirmed`
- `pendingOverlay`
- `displayProjection`

สถานะ intent:

- `pending`: แสดงผลคาดการณ์ทันที
- `confirmed`: Server ยืนยันผลเดียวกับ Client
- `corrected`: Server ส่งค่าที่ถูกต้องมาแทน prediction
- `rejected`: ยกเลิก overlay และคืนค่าจาก authoritative state

Prediction envelope ขั้นต่ำ:

```text
intentId, actionSequence, actorEntityId, targetEntityId,
combatRulesVersion, calculationVersion, definitionVersion,
worldSnapshotTick, actorStateVersion, targetStateVersion,
actorProfileFingerprint, targetProfileFingerprint,
predictedResultFingerprint
```

ต้องป้องกัน response เก่าเขียนทับ state ใหม่ด้วย sequence/state-version guards และต้อง reconcile แบบ idempotent

## โครงสร้างไฟล์ที่แนะนำ

```text
combat-v91-contract.mjs
combat-v91-adapters.mjs
combat-v91-status.mjs
combat-v91-rules.mjs
combat-v91-client-store.mjs
combat-v91-ui.mjs
combat-v91-entry.mjs
tests/v91-combat-contract.mjs
tests/v91-combat-adapters.mjs
tests/v91-combat-status.mjs
tests/v91-combat-rules.mjs
tests/v91-combat-client-store.mjs
tests/v91-combat-ui.mjs
```

ให้สร้างเป็นโมดูลใหม่และ dedicated tests ก่อน ห้ามแก้ `game-v800.js` ระหว่างวางแกนระบบ และต้องประสานเจ้าของงาน `V9 unified online world shell` ก่อนแก้ entry/orchestrator, HTML, world bridge หรือ socket lifecycle ที่งานนั้นถือครองอยู่

## ลำดับ implementation

1. Contract และ canonical validation/fingerprint
2. Pocket/Pirate/authoritative adapters พร้อม parity tests
3. Status projection และ lifecycle adapter
4. CombatRules V9.1 deterministic proposal
5. Prediction/reconciliation store
6. UI projection สำหรับ 12 stats, HP และ status descriptors
7. Dedicated entry adapter โดยยังไม่ต่อ monolith
8. Integration กับ online shell หลังยืนยัน ownership
9. Full Client CI/build/release checks และ cross-runtime parity กับ Server

ต้อง checkpoint หลังแต่ละขั้นที่ทดสอบผ่าน

## Acceptance vectors ขั้นต่ำ

- Pocket `MON_002`, level 15, default potential/training: `hp=41`, `atk=18`, `def=17`, `spAtk=23`, `spDef=18`, `spd=21`
- Pocket `MON_020`, level 60, potential 31 และ training 200 ใน HP/ATK/SPATK: `hp=221`, `spAtk=167`, `spDef=106`
- Pirate ขั้นต่ำ: `hpMax=100`, melee-derived `atk=7`, skill-derived `spAtk=16`
- Pirate vitality สูงสุด: `hpMax=14095`
- Pirate combat สูงสุดจาก base melee 7: `atk=548`
- Pirate skill สูงสุดจาก base skill 16: `spAtk=1252`
- Ship/NPC/Boss authoritative adapter ต้อง pass through ได้โดยไม่ใช้สูตรโลกใด
- ทุก entity kind ต้องผ่าน resolver เดียว และ test ต้องตรวจว่าไม่มี entity-kind/domain damage branch
- Status registry/lifecycle ทั้ง 26 รายการต้องผ่าน รวม interaction, immunity, stack, tick และ hard-CC DR
- Pending prediction ห้ามเปลี่ยน authoritative state
- Confirm/correct/reject ต้องทำงานแบบ deterministic และ idempotent
- Fingerprint ต้องเป็น SHA-256 lowercase hex 64 ตัว
- UI ต้องแสดงครบ 12 stats และแยก base/effective/pending อย่างชัดเจน

## สิ่งที่อยู่นอกขอบเขต

- เปิด `vpsWrites`, `playerDataWrites` หรือ economy mutation
- SQL/schema migration
- Server deploy/restart
- Production publish
- Reward/settlement จริง
- เปลี่ยน protocol world presence หรือสร้าง WebSocket เพิ่ม
- Rewrite สูตร progression/Status ที่มี implementation และ tests อยู่แล้ว
- รวม `PirateAuthorityDamageRule` หรือ `PocketWorkbookPreviewDamageRule` เป็น live engine

## Definition of Done

- มี CombatStats 12 ค่าและ Status lifecycle กลางที่ versioned
- Pirate/Pocket/โลกอื่นแปลงเข้ารูปกลางได้โดย parity ไม่ถอยหลัง
- การต่อสู้ทุกชนิดใช้ `CombatRulesV9.1` ชุดเดียว
- Client แสดง prediction realtime โดยไม่แก้ authoritative state
- Server reconciliation envelope มี contract และ deterministic parity vectors
- Focused tests, mutation/negative tests ที่เกี่ยวข้อง, full `npm run ci`, Pages build และ Firebase launcher build ผ่าน
- ไม่มีการเปิด write flags, SQL, deploy หรือ production mutation จากงาน Client core

## จุดเริ่มสำหรับผู้รับช่วง

สร้าง `combat-v91-contract.mjs` และ `tests/v91-combat-contract.mjs` ก่อน โดยล็อกชื่อ 12 stats, validation, immutability, version fields และ SHA-256 fingerprint จากนั้น checkpoint เมื่อ focused test ผ่าน แล้วจึงเริ่ม adapters
