# Client Combat V9.1.2 — Implementation Record

เอกสารนี้บันทึกสถานะของ Shared Combat ที่รวมฐานสเตตัสแบบ Pocket Monster,
ความชำนาญและจังหวะต่อสู้จาก Pirate Fruit และ authority boundary ฝั่ง Server
โดยไม่อ้างว่า backend production หรือการถอด iframe ทั้งเกมเสร็จแล้ว

> `Server authoritative writer` ในงานนี้หมายถึง executable contract และ atomic
> transaction boundary สำหรับ HP, Status, resource, sequence, dynamics/occupancy และ outcome
> ค่า `productionWritesEnabled` ยังเป็น `false` และยังไม่มี endpoint/DB adapter จริง

## Draft PR Checkpoint Boundary

PR นี้เป็น checkpoint สำหรับ **Shared Contract + Client foundation** เพื่อให้ฝั่ง Server
นำ schema, intent/response และ acceptance vectors ไปทำ production adapter ต่อได้ ไม่ใช่
release candidate และยังไม่ควร merge จนกว่า Server handoff กับ final CI จะผ่าน

ข้อจำกัดที่ล็อกชัดเจนใน Client:

- **Client ไม่เขียน HP** — prediction เปลี่ยนได้เฉพาะ pending/display projection;
  authoritative HP เปลี่ยนเมื่อ reconcile response ที่ Server commit แล้วเท่านั้น
- **Client ไม่เขียน Runtime Status** — prediction เก็บเพียง proposed snapshot;
  authoritative Status มาจาก Server/entity-owner snapshot เท่านั้น
- **Client ไม่เขียน World position/transform** — หลังผลยืนยัน Client ทำได้เพียงส่ง
  `world.impulse_commit_requested`; World/Server spatial authority ต้องเป็นผู้ commit
- **Combat production transport ยังไม่ wire** — `networkCreation: false`, public shell ตั้ง
  `serverReconcileExposed: false` และยังไม่มี authenticated response ingress หรือ live
  World impulse consumer

Server modules ใน PR เป็น executable reference boundary/test harness และถูกกันออกจาก
Pages artifact ด้วย `combat-v91-server-*`; ค่า `productionWritesEnabled` ยังคง `false`

## Baseline ที่ล็อกแล้ว

1. Human และ Monster ใช้ Combat vocabulary เดียวกัน แต่ progression owner คำนวณ Base Stats ของตนเอง
2. Core6 ใช้ฐาน Pocket: `HP / ATK / DEF / SPATK / SPDEF / SPD`
3. CombatProfile12 ประกอบด้วย Core6, `hpCurrent` และ ratings 5 ค่า
4. Shared combat level อยู่ช่วง `1–60`; Pirate native level เป็น provenance เท่านั้น ห้ามเข้า damage formula โดยตรง
5. Pirate `Combat / Vitality / Blade / Ranged / Fruit Power / Mana` และ Mastery เป็น proficiency/resource input ไม่ใช่ Base Stats
6. Equipment และ proficiency เพิ่มค่าเฉพาะ Action ผ่าน `ActionStatProjection`; ห้ามแก้ Core6 หรือ HP
7. Pocket ใช้ Monster stat formula/catalog เดิมโดยตรง
8. World เป็นเจ้าของ spatial truth และต้นเหตุของ modifier; Combat รับ immutable snapshot และห้ามเขียนกลับ World
9. Shared resolver, Runtime Status protocol, CombatOutcome และ CombatClock ใช้ร่วมกัน
10. Pirate/Pocket owner เป็นผู้ commit HP ผ่าน Server transaction เท่านั้น

## CombatProfile12

```js
{
  hpMax, hpCurrent,
  atk, def, spAtk, spDef, spd,
  accuracy, crit, evasion, resistance, penetration
}
```

- Core6 และ `hpCurrent` เป็น safe integer
- `hpMax >= 1` และ `0 <= hpCurrent <= hpMax`
- ratings อยู่ช่วง `0..1`
- Profile เป็น immutable, exact-schema และมี SHA-256 fingerprint
- รองรับ `Human`, `Monster`, `Npc`, `Boss`, `Ship`
- Owner domain ที่สร้าง Base profile ได้มีเพียง `Pirate` และ `Pocket`

## Base Stats แยกเจ้าของ แต่ใช้ภาษากลาง

```text
Pirate progression ─ Pirate authoritative Human calculator ─ Pocket-shaped Core6 ─┐
                                                                                  ├─ CombatProfile12
Pocket progression/catalog ─ Pocket monster formula ─────────────── Core6 ────────┘
```

### Human / Pirate

`combat-v91-adapters.mjs` ไม่สร้างสูตร balance ใหม่และไม่ map `Blade = ATK` หรือ
`Vitality = DEF` ตรง ๆ แต่รับผล Core6 ที่ Pirate authoritative calculator คำนวณแล้ว
พร้อม definition/progression fingerprint แล้วจึงสร้าง CombatProfile12

Input หลักคือ:

- `humanCoreGrowthDefinition`
- `ratingsDefinition`
- `currentHpOwnerState`
- `proficiencySnapshot`

Human Core6 ใช้ level `1–60` และไม่รวม Equipment ส่วน Pirate progression เดิมที่มี
cap 2,800 ถูกเก็บใน `proficiencySnapshot` เท่านั้น ค่า proficiency ที่ไม่เกี่ยวกับ
Action ปัจจุบันจะไม่มีผลกับ Action นั้น และ Mana ไม่เปลี่ยน Core6 โดยอ้อม

### Monster / Pocket

Pocket adapter ใช้ `monster-stat-formula.mjs` และ `monster-stat-catalog.mjs` โดยตรง:

```text
floor(((2 * base + potential + training / 4) * level) / 100)
  + (HP ? level + 10 : 5)
```

สูตร/catalog/version/fingerprint ต้องตรงกัน มิฉะนั้น fail closed

## Pirate ActionStatProjection

Pirate proficiency และ Equipment ถูกคำนวณหลัง Base profile และเฉพาะ Action:

```text
Base ATK/SPATK/DEF
  × bounded proficiency multiplier (fixed-point 10,000; bonusสูงสุด +50%)
  + action equipment contribution
  = projected action stat
```

Category mapping ปัจจุบัน:

| Action | Base source | Proficiency | Mastery |
|---|---|---|---|
| style | ATK | Combat | Style |
| sword | ATK | Blade | Sword |
| gun | ATK | Ranged | Gun |
| fruit | SPATK | Fruit Power | Fruit |
| guard | DEF | Vitality | Guard |

Projection ผูก `entity/profile/action/version/fingerprint` ครบ ไม่มี HP และไม่สามารถ
แทน CombatProfile12 ได้ Server action permit เป็นผู้ส่ง projection ที่ใช้จริงเข้า
Shared CombatRules ส่วน Client ที่ยกค่าขึ้นเองโดยไม่มี permit จะถูก reject

## Shared CombatRules V9.1.2

Resolver เป็น pure deterministic proposal path เดียวสำหรับทุก entity kind รองรับ:

- physical/special
- accuracy/evasion
- defense/penetration
- critical และ deterministic variance
- multi-hit ใน pure rules/proposal layer (live authoritative path ยัง fail closed ตามข้อจำกัดด้านล่าง)
- type effectiveness `0 / 0.5 / 1 / 2`
- STAB ที่ล็อกตาม V7.0.6 เท่ากับ `1.5`
- World/status multipliers ที่เปลี่ยนเฉพาะ effective values
- target/range/line-of-sight/safe-zone/permission จาก World snapshot

RNG ใช้ SHA-256 counter stream และผูก seed, combat/action sequence, actor, target,
action, optional ActionStatProjection, World snapshot และ one-use RNG ticket
Rules version ปัจจุบันคือ `combat-rules/v9.1.2` และ calculation protocol เป็น v2

## Combat Mode Policy

Mode policy แยกกติกาการใช้ Shared Combat ออกจากสูตร damage:

- `monster-life.capture` — Human ห้ามเป็น damage source, owned Monster อ่อนกำลังเป้าหมาย, ต้อง Recall ก่อน Capture
- `monster-life.battle` — Human ห้ามเป็น damage source
- `pirate.adventure` — เปิด Human/Monster/NPC/Boss/Ship ตาม policy
- `hybrid.boss` — Human และ Monster ช่วยกันสู้ Boss
- `world.autonomous` — World strategic AI เลือกเหตุผล/เวลา ส่วน domain combat เลือกวิธีสู้
- `pvp` — fail closed จนกว่าจะผ่าน security/release gate

Server โหลด immutable mode context เอง ผูก `actionId + actionFingerprint` และ mode state
version กับ action entitlement พร้อมตรวจ permitted action ซ้ำหลัง authorize; ไม่เชื่อ mode
หรือ action classification ที่ Client ส่งมา

## Pirate Combat Dynamics บน Shared 60 Hz Clock

จังหวะต่อสู้ใช้ contract กลาง:

```text
windup → cast → active/impact → recovery → completed
```

contract/scheduler รองรับ combo/cancel/interrupt, resource reserve/commit/refund,
projectile spawn, guard window, movement lock, knockback/impulse proposal และ
presentation-only hitstop โดย transition ที่ tick เดียวกันเรียงด้วย Server
`authoritySequence` และ fixed priority; `requestId` ไม่มีสิทธิ์เปลี่ยนผลลัพธ์

`combat-v91-pirate-dynamics-adapter.mjs` อ้าง Pirate Fruit commit
`4df5721de8bdb20c28e53b6a8c933616e132c96d` และแปลงค่าจาก
`CombatData.ts`, `PlayerCombat.ts` และ skill gameplay เป็น fixed tick 60 Hz
โดยปัดเวลาเป็นจำนวน tick ขึ้นเสมอ เพื่อไม่ปล่อย hit/cast ก่อนค่า authoritative เดิม

- `windup`, `castTime`, `recovery`, combo buffer ถูกนำมาใช้
- `movementLock` แปลงเป็น basis points และ World locomotion owner ต้อง commit
- `knockback` แปลงเป็น impulse candidate และ World ต้อง commit
- projectile collision เป็น World authority
- hitstop หยุดเฉพาะ presentation ห้ามหยุด CombatClock/WorldClock
- Adapter ไม่มี HP writer, damage formula หรือ transform writer

Action math, Dynamics definition และ source-provenance fingerprint ถูกผูกด้วย binding
เดียวกัน Client shell มี `scheduleAction`, `advanceAction` และ `readActionDynamics` และ
บังคับทุก prediction ต้องมี schedule โดยตรวจ action sequence, actor, target และ one-use
impact key ตรงกัน พร้อมกัน action ซ้อนของ actor เดียวกัน

Live resolution รอบนี้จงใจ **fail closed ที่ `single direct impact`** เพื่อให้ตรงกับ
ธุรกรรม damage แบบหนึ่ง action ต่อหนึ่ง commit:

- multi-hit ยังใช้ได้ใน pure rules/definition tests แต่ Client/Server live gate ไม่อนุญาต
  จนกว่าจะมี per-impact transaction protocol
- projectile definition/spawn เป็น proposal ได้ แต่ยัง resolve damage ไม่ได้จนมี World
  collision receipt + expiry + Server verification
- impulse/knockback และ hitstop ถูกปล่อยจาก internal Client integration hook หลังได้รับ
  authoritative effect receipt ที่ binding ตรงกับ committed hit outcome เท่านั้น ปัจจุบัน
  public shell ยังไม่เปิด response ingress และยังไม่มี World transform consumer จริง

Server ใช้ `ServerDynamicsPermit` ผูก binding/provenance, start/impact/expiry CombatTick,
actor/target/action, resource reservation และ dynamics/actor-occupancy state versions
แล้ว CAS พร้อม HP/Status/resource/RNG ใน atomic transaction เดียว Client schedule เป็น
เพียง prediction/presentation และไม่ใช่หลักฐาน authority

## Shared Runtime Status

ใช้ lifecycle กลาง 26 statuses รวม Burn, Poison, Bleed, Freeze, Stun, Slow และ Fear
โดย `ST_FEAR` เป็น Combat control เท่านั้น ไม่ใช่ World PsychologicalFear/Memory

CombatClock ขับ status tick ส่วน WorldClock ขับชีวิต/สภาพโลกระยะยาว Authoritative DoT
quantize ต่อ tick เป็น integer HP (`floor`, ขั้นต่ำ 1 เมื่อ damage เป็นบวก) แล้ว lethal-clamp
ก่อน target owner commit จึงไม่ทำให้ CombatProfile12 กลับไปเป็น HP ทศนิยม

ลำดับ authority คือ:

```text
Validate → Calculate/Plan → HP Owner Commit → Status Commit
  → CombatOutcome → World Event Interpretation
```

## Client Store, UI และ HTML Boundary

Client store แยก:

- `authoritativeBase`
- authoritative Status snapshots
- `effectiveConfirmed`
- `pendingOverlay`
- `displayProjection`

รองรับ pending/confirmed/corrected/rejected พร้อม stale, duplicate, reorder และ
fingerprint guards UI เป็น read-only และ Combat ใช้ `<aside id="combatV91Shell">`
เพียงก้อนเดียวใน persistent parent document ไม่มี Combat HTML/iframe เพิ่ม

อย่างไรก็ตาม **ทั้งเกมยังไม่เป็น one-document เต็มรูปแบบ** เพราะ architecture เดิมยังมี:

- `iframe#onlineWorldSceneFrame`
- Pirate iframe ภายใน scene runtime

มี `world-runtime-lifecycle-v910.mjs`, `one-document-world-runtime-host-v910.mjs`,
`world-runtime-resource-scope-v912.mjs` และ `world-runtime-import-purity-v912.mjs`
เป็น shadow foundation ที่ทดสอบ prepare/mount/pause/resume/unmount/dispose, single input
owner, cancellation/rollback, aborted-prepare cleanup, listener/timer/RAF/observer resource
scope และ import-pure deferred runtime factory แล้ว แต่ยังไม่ wire เข้าระบบจริงและถูกกัน
ออกจาก Pages artifact เพื่อไม่อ้างสถานะเกินจริง

## Server Authority Boundary

### Action Authority V3

- โหลด trusted Pirate/Pocket source แล้ว derive profile ใหม่
- ตรวจ action permit, optional ActionStatProjection, ServerDynamicsPermit, mode entitlement,
  World/status snapshots และ RNG ticket
- atomic CAS สำหรับ target-owner HP/Status, actor resource/sequence, dynamics state,
  actor occupancy และ RNG ticket
- terminal response/outbox อยู่ transaction เดียวกับ commit
- Monster HP 0 = `fainted`; entity อื่น HP 0 = `defeated`
- client prediction ทำได้เพียง confirm/correct/reject reconciliation

### Status Tick Authority

- pure status plan จาก Server CombatClock
- exact CAS ของ profile source, Status และ clock
- Pirate nested `currentHpOwnerState` เปลี่ยนได้เฉพาะ HP/state-version/fingerprint
- Pocket เปลี่ยนได้เฉพาะ currentHp/stateVersion
- Core6, ratings, proficiency และ provenance ต้องคงเดิม
- outcome เผยแพร่หลัง commit เท่านั้น

ทั้งสอง boundary ยังตั้ง `networkCreation: false` และ
`productionWritesEnabled: false`

SHA-256 fingerprints ใน contract ใช้ตรวจ identity/drift/replay เท่านั้น **ไม่ใช่ลายเซ็น
หรือหลักฐานว่า Client เป็น Server** production transport ต้อง authenticate session,
รับ response ผ่านช่องทางที่เชื่อถือได้ และ Server ต้อง reload definition/provenance/
clock/owner state จาก storage ของตนเองก่อนออก permit ทุกครั้ง

## Browser Artifact

Pages artifact ปัจจุบันมี Combat client modules 17 ไฟล์ + `combat-v91.css` รวม 18 assets:

- adapters, Core/Profile/action projections และ mode policy
- contract, protocol, RNG, rules และ Status
- Dynamics contract/scheduler/binding, authoritative effect receipt และ Pirate dynamics adapter
- client store, entry และ UI

Build บังคับว่า `combat-v91-server-*`, tests, docs และ one-document shadow runtime
ทั้ง V9.10/V9.12 ต้องไม่ถูก publish เป็น browser assets

## Verification ล่าสุด

ผ่านแล้ว:

- `npm run ci` — full legacy + V8.x + V9.0 + V9.1 regression
- `npm run test:v91:combat`
- `npm run test:v91:runtime`
- `npm run build:pages` — 229 public files after syncing `origin/main`; Combat closure 18 assets
- `npm run test:hosting`
- `node tests/v90-unified-pages-artifact.mjs`

ชุด Combat ครอบคลุม Profile12/Core6, level 1–60, proficiency projection, Ring mode,
Status, STAB 1.5, RNG parity, mutants 21/21, fixed-tick Dynamics, mandatory entity-bound
Client impact gate, Server timing/occupancy permit, Server action/status atomic authority
และ Pirate/Pocket defeat semantics

## งานที่ยังเหลือ

1. ทำ production backend adapters สำหรับ auth/session, action/dynamics entitlement,
   profile/status/resource stores, atomic DB transaction, ticket และ outbox
2. ต่อ World spatial authority จริงสำหรับ target/range/LOS/safe-zone/terrain,
   projectile collision receipt, movement/impulse commit และ authoritative snapshot
3. ต่อ transport เดิมให้ส่ง prediction/authority response โดยไม่สร้าง connection ซ้ำ
4. ทำ latency/reorder/duplicate/replay/soak tests กับ backend และ World จริง
5. เพิ่ม per-impact transaction/receipt ก่อนเปิด multi-hit และ projectile ใน live resolver
6. แปลง Living → Pocket → Pirate เป็น import-pure runtime factory ที่คืน resource ทุกชนิด,
   แยก Pocket domain capability แบบ headless แล้วจึงถอด scene/Pirate iframe
7. ผ่าน security/balance/release review ก่อนเปิด PvP, reward settlement หรือ production writes
8. ฝั่ง Server ต้องโหลด trusted ActionStatProjection snapshot จาก Pirate domain แยกจาก
   action permit และ CAS source state/fingerprint ใน transaction เดียวกัน
9. เปลี่ยน authoritative version/tick/sequence counters ที่เหลือให้เป็น safe integer พร้อม
   MAX_SAFE regression vectors และให้ dynamics registry ยืนยัน canonical direct-hit metadata

ดังนั้นคำกล่าวอ้างที่ถูกต้องตอนนี้คือ: **Shared Combat V9.1.2 ใช้ Pocket-based
CombatProfile12, Pirate action proficiency และ Pirate fixed-tick dynamics ใน Client shell
เดียวกันแล้ว พร้อม executable Server authority V3 ที่ fail closed สำหรับ timing; live
resolution รองรับ single-direct action เท่านั้น ส่วน backend production, multi-hit/
projectile receipt และ whole-game one-document migration ยังไม่เสร็จ**
