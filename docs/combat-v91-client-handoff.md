# ส่งมอบงาน Client Combat V9.1

เอกสารนี้บันทึกสถาปัตยกรรมและสถานะหลัง implementation commit `e5e432a`, parent-shell commit `223b57a` และ latest-main merge checkpoint `6022bbf` เป้าหมายคือให้ Human, Monster, NPC, Boss และ Ship ต่อสู้ด้วย `CombatStats` 12 ค่า, `CombatRules` และ Status lifecycle ชุดเดียวกัน โดยฝั่ง Client ทำ domain calculation, prediction และ presentation แต่ไม่เป็น authoritative writer

> คำว่า “Server authoritative writer” ในเอกสารนี้หมายถึง contract และ transaction boundary ที่ต้องใช้ฝั่ง Server ไม่ได้หมายความว่ามี production endpoint หรือฐานข้อมูลที่ deploy แล้ว ปัจจุบัน production writes ยังคงปิด

## Design Lock

1. Combat vocabulary ใช้ร่วมกัน 12 ค่า แต่ที่มาของ Base Stats แยกตาม Domain
2. `Pirate` เป็นเจ้าของ Human progression, definition และการคำนวณ Human base profile
3. `Pocket` เป็นเจ้าของ Monster progression/catalog และการคำนวณ Monster base profile
4. รองรับ owner domain เฉพาะ `Pirate` และ `Pocket`; ไม่มี generic authoritative passthrough และ World ไม่สร้าง Combat profile
5. Combat resolver ใช้ rules path เดียว ห้ามเลือกสูตร damage จาก `ownerDomain` หรือ `entityKind`
6. `WorldCombatSnapshot` contract กำหนด modifier และ spatial/permission fields แบบ immutable, bounded และ deterministic; truth จริงต้องมาจาก trusted World/Server adapter ซึ่งยังไม่มี live implementation ใน repository นี้ และ Combat ห้ามแก้ Base Stats หรือ World state
7. Client แสดง prediction ได้ แต่ห้าม commit HP, Status, resource, defeat/faint, reward, inventory หรือ progression
8. HP/Status/resource/sequence ต้องถูก commit ใน authoritative transaction ก่อนเผยแพร่ committed outcome
9. Runtime Status ใช้ protocol/lifecycle กลาง ส่วน `ST_FEAR` เป็น Combat control และไม่ใช่ PsychologicalFear/Memory ของ World
10. Ring 0/Ring 1 และ live gameplay flow เดิมยังไม่ถูกเปิดหรือเปลี่ยนโดย Combat foundation นี้

## CombatStats กลาง 12 ค่า

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

Contract ปัจจุบันบังคับ exact schema, finite/non-negative values, `hpCurrent <= hpMax`, normalized ratios ช่วง `0..1`, safety bounds, deep immutability, canonical serialization และ lowercase SHA-256 fingerprint 64 ตัว Profile เก็บ `entityId`, `ownerDomain`, `entityKind`, `level`, `types`, progression/calculation/definition/state versions และ provenance ที่ตรวจสอบได้

Entity kind ที่ contract รองรับคือ `Human`, `Monster`, `Npc`, `Boss`, `Ship` โดย mapping ที่ adapter อนุญาตคือ:

- Pirate: `Human`, `Npc`, `Boss`, `Ship`
- Pocket: `Monster`, `Npc`, `Boss`

Entity kind เป็นข้อมูลประกอบ profile ไม่ใช่ตัวเลือก damage engine

## Ownership และการไหลของข้อมูล

```text
Pirate progression + Pirate definition ─┐
                                        ├─ Domain calculator ─ BaseCombatProfile
Pocket progression + Pocket catalog ───┘
                                                       │
World snapshot / modifiers / spatial truth ────────────┤
                                                       ▼
                                         Shared CombatRules V9.1
                                                       │
                                  Client proposal + pending overlay
                                                       │
        Server authority harness: reload trusted inputs → recalculate
                          → atomic owner-commit contract (not a live endpoint)
                                                       │
                                   Confirm / Correct / Reject / Outcome
```

### Pirate calculator

`combat-v91-adapters.mjs` อ้าง provenance จาก Pirate Fruit commit `4df5721de8bdb20c28e53b6a8c933616e132c96d` (`shared/src/progression/stats.ts`) และใช้ Pirate progression เป็น input เท่านั้น:

- stat cap 2,800
- HP เริ่ม 100 และ Vitality เพิ่ม HP 5 ต่อแต้มหลังแต้มแรก
- damage scaling อ้าง multiplier สูงสุด `78.26`
- style/sword/gun/fruit map เข้าความชำนาญ combat/blade/ranged/fruitPower ตามสูตร Pirate
- `def`, `spDef`, `spd` และ ratings ต้องมาจาก Pirate authoritative combat definition ที่มี version ตรงกัน; adapter ไม่แต่งค่าขึ้นเอง

### Pocket calculator

Pocket adapter reuse `monster-stat-formula.mjs`, `monster-stat-contract.mjs` และ `monster-stat-catalog.mjs` โดยตรง พร้อมบังคับ catalog/formula version และ authoritative ratings สูตร progression เดิมยังเป็น:

```text
floor(((2 * base + potential + training / 4) * level) / 100)
  + (HP ? level + 10 : 5)
```

`createDomainCombatProfile()` dispatch ได้เฉพาะ Pirate/Pocket calculator และ fail closed สำหรับ owner, definition, shape หรือ version ที่ไม่รองรับ

## Shared CombatRules และ RNG

`combat-v91-rules.mjs` เป็น pure proposal resolver ชุดเดียว รองรับ:

- physical/special channel
- accuracy/evasion
- defense/penetration
- resistance และ Status immunity
- STAB และ type effectiveness `0`, `0.5`, `1`, `2`
- critical allowed/disabled
- deterministic variance และ multi-hit
- active buffs/debuffs และ proposed statuses
- target, range, line-of-sight และ permission จาก World snapshot contract

RNG ใช้ SHA-256 counter stream และผูก seed, combat/action sequence, actor, target, action fingerprint, world snapshot และ `rngTicketId` เข้าด้วยกัน Input เดิมกับ seed/command เดิมต้องให้ proposal และ fingerprint เดิมข้าม process ส่วน Action Authority V2 harness เป็นผู้ตรวจและ consume one-use ticket ใน atomic transaction; production ticket store ยังไม่มี

Resolver ไม่ mutate profile, HP, Status หรือ World state และไม่มี branch เลือกสูตร Pirate/Pocket

## Shared Runtime Status

`combat-v91-status.mjs` reuse registry/resolver/lifecycle/runtime เดิมครบ 26 IDs:

```text
ST_BURN, ST_POISON, ST_BLEED, ST_SWARM, ST_SLOW, ST_FREEZE,
ST_PARALYZE, ST_STUN, ST_ROOT, ST_FEAR, ST_CONFUSE, ST_BLIND,
ST_WEAKEN, ST_ARMOR_BREAK, ST_VULNERABLE, ST_STAGGER,
ST_ATK_UP, ST_DEF_UP, ST_SPATK_UP, ST_SPD_UP,
ST_DAMAGE_REDUCE, ST_EVASION_UP, ST_CRIT_UP, ST_ATKDEF_UP,
ST_FIRE_RESIST, ST_POISON_RESIST
```

Snapshot เป็น immutable และ exact-schema lifecycle ยังคง stack, potency, duration, tick, interaction, immunity และ hard-CC diminishing return เดิม: window 6 วินาที, multiplier `[1, 0.65, 0.4]` และ minimum `0.25`

CombatClock แยกจาก WorldClock โดย `planCombatStatusTick()` คำนวณ transition แบบ pure function ส่วนการลด HP, tick/expiry Status และเลื่อน clock ต้องเกิดใน Server transaction

## Client Prediction, Store และ UI

Client store แยกข้อมูลเป็น:

- `authoritativeBase`
- authoritative Status snapshots
- `effectiveConfirmed`
- `pendingOverlay`
- `displayProjection`

รองรับ `pending`, `confirmed`, `corrected`, `rejected` พร้อม intent/action sequence, state-version และ fingerprint guards เพื่อกัน duplicate, stale, out-of-order และ cross-encounter response การ reject ยกเลิกเฉพาะ pending overlay และไม่กิน authoritative sequence

UI เป็น read-only projection แสดง Base/Effective/Pending ครบ 12 stats, HP, pending damage/count และ Status รองรับ mobile breakpoint และ touch target 44px โดยไม่มี network, storage หรือ state writer

## Single Combat Host ใน Persistent Parent Shell

Combat V9.1 ต้องไม่เพิ่มหน้า `.html`, iframe หรือ standalone document ของตัวเอง การเชื่อม live shell ใช้หลักนี้:

- มี Combat container/controller เพียงหนึ่ง instance ใน parent shell ที่ active
- `createCombatV91Shell({ container })` ใช้ container/controller instance เดิม; public facade เปิดเฉพาะ `openSession`, `predict`, `focus`, `closeSession` และ read-only state/diagnostics โดยไม่เปิด raw `reconcile`
- scene/world switch ต้องไม่สร้าง Combat container, controller หรือ session ซ้ำ
- Combat ใช้งานได้เฉพาะเมื่อ scene ปัจจุบันอยู่สถานะ `ready` และถือ active lease; การเปลี่ยน scene หรือ scene error ต้อง clear/hide state ส่วน logout จึงถอด host ออก
- stylesheet และ module ถูกโหลดจาก parent shell เดิม
- UI ใช้ `container.ownerDocument` และไม่สร้าง document/iframe/network writer

`online-world-shell-v900.mjs` import Combat entry เพียงครั้งเดียวหลังผ่าน auth/Server gate แล้วสร้าง `<aside id="combatV91Shell">` และ controller เพียงหนึ่ง instance ใน parent document เดิม การเปลี่ยน scene ปิด session ที่ค้างแต่รักษา identity ของ container/controller ไว้ การ logout จึงค่อยปิดและถอด container ออก

Public shell เปิดเฉพาะ prediction facade ผ่าน `POCKETMONSTER_ONLINE_SHELL.combat`; raw `reconcile` และ authoritative writer ไม่ถูกเปิดให้ scene/client เรียกเอง `index.html` กับ deploy mirror `v900.html` เป็น compatibility entry aliases ที่ byte-identical ไม่ใช่สอง shell ที่ทำงานพร้อมกัน และโหลด stylesheet/module จาก parent entry โดย Combat ไม่เพิ่มไฟล์ HTML, iframe, socket หรือ document ใหม่

ข้อจำกัดที่ต้องสื่อสารตรงกัน: V9 โดยรวมยังมี scene/Pirate iframe ในสถาปัตยกรรมเดิม การ lock นี้รับประกันว่า **Combat ไม่เพิ่ม HTML/iframe อีกก้อน** และมี Combat UI instance เดียวใน parent shell เท่านั้น การย้ายทั้งเกมให้เป็น one-document อย่างเคร่งครัดเป็น migration แยก ไม่ใช่สิ่งที่ควรซ่อนใน Combat V9.1

## Server Authority Boundary ที่สร้างแล้ว

### Action Authority V2

`combat-v91-server-authority.mjs` เป็น transport-neutral transaction harness ที่กำหนด:

- Server action permit และ one-use RNG ticket
- โหลด native Pirate/Pocket source แล้วคำนวณ base profile ซ้ำด้วย domain calculator
- ตรวจ version/fingerprint/world snapshot/action entitlement แบบ fail closed
- atomic compare-and-swap สำหรับ owner HP/Status, actor resource/sequence และ RNG ticket
- terminal response/outbox ใน transaction เดียวกับ commit
- idempotency ด้วย authority scope + combat + intent
- Monster HP เป็นศูนย์ให้ `fainted`; non-Monster HP เป็นศูนย์ให้ `defeated`

### Server Status Tick Authority

`combat-v91-server-status-authority.mjs` กำหนด transaction harness สำหรับ CombatClock status tick:

- pure status-tick plan
- exact CAS ของ profile, Status snapshot และ CombatClock
- owner HP commit, Status tick/expiry และ clock commit ใน transaction เดียว
- idempotent terminal response และ post-commit outcome
- base-stat invariant: status damage เปลี่ยน HP/state version แต่ห้ามเปลี่ยน base stats

ทั้งสองโมดูลตั้ง `networkCreation: false` และ `productionWritesEnabled: false` โดยตั้งใจ เป็น executable contract/test harness สำหรับ backend adapter ไม่ใช่ endpoint ที่ deploy แล้ว

## Browser Artifact Boundary

ในส่วนของ Combat V9.1, Pages artifact ส่ง client assets ต่อไปนี้:

- client modules 9 ไฟล์: adapters, contract, protocol, RNG, rules, Status, store, UI และ entry
- `combat-v91.css`

Build และ artifact test บังคับว่าไฟล์ prefix `combat-v91-server-`, V9.1 tests และเอกสารนี้ต้องไม่อยู่ใน public browser artifact พร้อมตรวจ static import closure ของ client modules

## สถานะ Slice

| Slice | สถานะ | ผลลัพธ์ |
|---|---|---|
| C0 | DONE | regression baseline ที่เคยค้างถูกแก้ก่อน implementation และ merge main ล่าสุดแล้ว |
| C1 Contract | DONE | 12 stats, exact validation, immutability, bounds, canonical SHA-256 |
| C2 Calculators | DONE | Pirate/Pocket calculators เท่านั้น, parity/provenance/version guards, ไม่มี generic passthrough |
| C3 Status | DONE | shared 26-status lifecycle, immutable snapshots, CombatClock plan |
| C4 Rules/RNG | DONE | domain-independent resolver, deterministic cross-process RNG, vectors และ mutants 19/19 |
| C5 Store/Protocol | DONE | pending/confirm/correct/reject, stale/idempotency guards, authority envelopes |
| C6 UI/Shell API | DONE | read-only Base/Effective/Pending UI และ reusable single-shell controller |
| C7A Action authority | DONE AS HARNESS | authoritative action/HP/Status/resource/sequence atomic boundary |
| C7B Status authority | DONE AS HARNESS | atomic status tick/expiry/HP/clock boundary |
| C7C Live backend | DEFERRED | ยังไม่มี endpoint, DB adapter, live spatial authority หรือ production writes |
| C7D Parent-shell wiring | DONE | container/controller เดียวใน parent, prediction-only facade, reuse ข้าม scene และ teardown ตอน logout โดยไม่เพิ่ม Combat HTML/iframe |
| C8 Client acceptance | DONE | focused V9.1, unified V9 regressions, full CI, Pages/Firebase artifact gates และ static boundary checks ผ่าน |

## หลักฐาน Final Acceptance

- `npm run ci` ผ่านบน merged working head ครบทั้ง typecheck, lint, integration, legacy/full regressions, V8.1–V8.11, V9.0 และ V9.1
- `npm run test:v91:combat` ผ่าน contract, RNG parity, protocol, adapters, Status, rules, mutants `19/19`, store, UI, single Combat host/controller contract, Action Authority V2 และ Server Status Authority
- V9 unified shell/scene/mobile/chat tests ผ่าน โดย runtime test พิสูจน์ว่า world switch 3 ครั้งยังใช้ Combat container/controller identity เดิม, Combat ไม่สร้าง global หรือ iframe เพิ่มจาก scene iframe เดิม, child เปิด Combat ซ้ำระหว่าง teardown/error ไม่ได้, เปิดใหม่ได้เมื่อ scene พร้อม และ logout ถอด container
- `npm run build:pages` ผ่าน: public artifact 218 ไฟล์, V9.1 client closure 10 assets และไม่มี `combat-v91-server-*`
- `node tests/v90-unified-pages-artifact.mjs`, `npm run test:hosting`, `npm run build:launcher` และ `node tests/production-launch-workflows.mjs` ผ่าน
- `npm run check`, focused `oxlint --deny-warnings`, syntax/static boundary audit และ `git diff --check` ผ่าน

หลักฐานนี้ปิด C8 เฉพาะ Client Combat foundation และ browser artifact เท่านั้น ไม่ตีความ transaction harness ว่าเป็น production server หรือถือว่า live writes ถูกเปิดแล้ว

## Acceptance หลัก

- CombatStats มี 12 ค่าตรง contract และ Base profile immutable
- Pirate/Pocket progression ให้ parity เดิมและไม่ถูก mutate
- ไม่มี World profile, generic passthrough หรือ domain/entity damage branch
- Human/Monster/NPC/Boss/Ship ที่ผ่าน domain calculator ใช้ resolver เดียวกัน
- World modifiers เปลี่ยนเฉพาะ effective values ไม่เขียนทับ base stats
- Status ทั้ง 26 รายการใช้ lifecycle เดียว รวม stack/tick/expiry/interaction/immunity/DR
- Client prediction ไม่เปลี่ยน authoritative HP/Status/resource/progression
- confirm/correct/reject deterministic, idempotent และกัน stale/out-of-order response
- Authority harness tests พิสูจน์ว่า outcome เกิดหลัง owner transaction commit เท่านั้น
- Authority harness tests พิสูจน์ว่า status tick ทำให้ HP เปลี่ยนผ่าน owner transaction โดย base stats คงเดิม
- Pirate/Pocket ใช้ defeat/faint semantics ถูกต้อง
- Combat มี parent container/controller active เพียงหนึ่ง instance และไม่เพิ่ม HTML/iframe
- public artifact มีเฉพาะ browser-safe Combat modules และไม่มี server authority code

## งานที่ยังเหลือและอยู่นอกคำกล่าวอ้าง

1. ทำ Combat V9.1 backend adapter จริงสำหรับ auth/session, action entitlement, profile/status/resource stores, atomic DB transaction, one-use ticket, terminal outbox และ replay storage
2. ต่อ World spatial authority จริงสำหรับ target/range/LOS/safe-zone/terrain/permission และ authoritative world snapshot
3. ต่อ Combat V9.1 เข้ากับ socket/HTTP transport เดิมให้ส่ง prediction envelope และคืน confirm/correct/reject โดยไม่สร้าง connection ซ้ำ
4. ทำ Combat V9.1 latency/reorder/duplicate/cross-runtime integration tests กับ backend จริง
5. ผ่าน security/release review ก่อนเปิด production writes, reward settlement, PvP หรือ publish
6. หากต้องการให้ **ทั้งเกม** เป็น one-document จริง ให้ทำ migration แยกเพื่อถอด scene iframe และ Pirate iframe เดิม โดยสร้าง mount/unmount API, แยก CSS/input lifecycle และทดสอบ world switch ใหม่ งาน V9.1 รอบนี้รับประกันเฉพาะว่า Combat ใช้ parent container เดียวและไม่เพิ่ม HTML/iframe ก้อนใหม่

สิ่งเหล่านี้ยังไม่มีใน repository ณ checkpoint นี้ จึงห้ามอ้างว่า Server writer ถูก deploy, spatial validation เป็น live authority หรือ writes เปิดใช้งานแล้ว

## จุดรับช่วงถัดไป

Client Combat V9.1 พร้อมส่งมอบบน persistent parent shell แล้ว จุดรับช่วงมีสองทางที่ต้องแยก scope: (1) live backend authority/World spatial adapter สำหรับเปิด confirm/correct/reject จริง หรือ (2) whole-game one-document migration เพื่อถอด iframe เดิมของ scene/Pirate โดยห้ามปะปนงานทั้งสองใน patch เดียว
