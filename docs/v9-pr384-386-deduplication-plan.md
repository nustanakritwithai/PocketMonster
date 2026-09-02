# PocketMonster V9 — Deduplication & Ownership Plan for PR #384 / #385 / #386

## Purpose

เอกสารนี้กำหนดแผนเดินต่อของ PR #384, #385 และ #386 โดยมีเป้าหมาย 2 ข้อพร้อมกัน:

1. ทำให้ฟีเจอร์ Presence / Animation Relay / Unified MMORPG HUD เดินหน้าต่อได้
2. ห้ามเพิ่ม source-of-truth ซ้ำ และใช้การ merge รอบนี้ลด technical debt ที่เกิดจากช่วงเปลี่ยนผ่าน V8 → V9

หลักกลางของแผนนี้คือ:

> **หนึ่งข้อมูล = หนึ่งเจ้าของ, หนึ่ง contract = หนึ่ง source-of-truth, หนึ่ง UI feature = หนึ่ง presentation owner**

แผนนี้เป็น architecture/merge baseline สำหรับสาม PR เท่านั้น ยังไม่ใช่คำสั่งให้ refactor ทั้ง repo แบบ big-bang

---

## 1. Current Duplication Problems

### 1.1 Presence protocol ถูกนิยามหลายจุด

ปัจจุบัน logic ที่เกี่ยวกับ World Presence กระจายอยู่หลายชั้น เช่น:

- `online-world-bridge-v900.mjs`
- `pirate-presence-bridge-v900.mjs`
- `world-presence-v800.mjs`
- `chat-runtime.mjs`

มีข้อมูล/กฎที่ซ้ำกันบางส่วน เช่น:

- จำนวน remote players สูงสุด
- player id/name bounds
- zone validation
- pose validation (`x`, `z`, `dir`)
- locomotion vocabulary
- combat animation vocabulary
- snapshot sanitization

ความเสี่ยงคือ เมื่อเพิ่ม field ใหม่ เช่น `jump`, `skill`, `onGround`, `dashing`, `attackProgress`, `skillAnimationProgress` แต่ละ bridge อาจตีความไม่เหมือนกัน และเกิดอาการ “Server ส่งได้ แต่ Client บาง boundary ตัด field ทิ้ง”

### 1.2 Transport / Adapter เริ่มถือ protocol rules เอง

PR #385 แก้ปัญหา animation state ถูกตัดใน Pirate bridge ได้ตรงจุด แต่ draft ปัจจุบันมีแนวโน้มเพิ่ม:

- locomotion constants อีกชุด
- combat-state constants อีกชุด
- animation sanitizer อีกชุด
- snapshot rules อีกชุด

ถ้า merge แบบนี้โดยไม่อิง shared protocol จะทำให้ feature ใช้งานได้ แต่เพิ่ม duplication debt

### 1.3 HUD มีหลาย presentation owner

ช่วง migration V8 → V9 ยังมี UI/state presentation กระจายอยู่หลายจุด เช่น:

- HTML legacy HUD
- `game-v800.js`
- `chat-runtime.mjs`
- `style-v800.css`
- `style-v900.css`
- Pirate iframe UI
- V9 parent shell

ตัวอย่างชัดคือ Chat สามารถมีทั้ง markup เดิมใน HTML และ fallback DOM ที่ runtime สร้างขึ้นเอง

PR #386 กำลังแก้ปัญหานี้โดยสร้าง Unified HUD contracts, feature stores, adapters และ MMORPG Dock แต่ต้องล็อก ownership ให้ชัดเพื่อไม่ให้ “HUD ใหม่” กลายเป็น presentation owner ตัวที่สองถาวร

### 1.4 Active entry ซ้ำโดยตั้งใจ

`index.html` และ `v900.html` เป็น active V9 entry ที่ถูกบังคับให้ byte-identical

นี่เป็น intentional compatibility duplication แต่เพิ่มภาระการแก้ไฟล์และทำให้เอกสารเก่าล้าหลังได้ง่าย

**Out of scope ของสาม PR นี้:** ยังไม่เปลี่ยน entry build model ในรอบนี้ ให้เก็บเป็น follow-up หลัง #384–#386 เสถียร

---

## 2. Target Ownership Architecture

หลังสาม PR นี้ ownership ต้องเป็นดังนี้:

```text
                    world-presence-protocol.mjs
                              │
                    Shared Presence Contract
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
 online-world bridge   Pirate presence bridge   renderer guard
          │                   │
          └───────────┬───────┘
                      ▼
                Shared Socket
                      │
                    Server
                      │
                      ▼
                 Runtime State
                      │
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
     Chat            Quest          Party / Pocket
       └──────────────┼──────────────┘
                      ▼
             Unified Feature Stores
                      │
                      ▼
              Unified MMORPG HUD
```

### Ownership locks

| Layer | Owner | Must NOT own |
|---|---|---|
| Presence schema / vocabulary / sanitizer | `world-presence-protocol.mjs` (#384) | Rendering, socket lifecycle, Pirate-specific iframe messaging |
| Online/Pirate transport adapters | #385 + existing bridges | Duplicate vocabulary, independent schema definitions, gameplay authority |
| Remote avatar presentation | `world-presence-v800.mjs` / Pirate renderer | Canonical protocol definitions |
| Chat transport | `chat-runtime.mjs` | Permanent duplicate HUD markup ownership |
| Feature snapshots/stores | Unified HUD adapters (#386) | Gameplay authority, server truth generation |
| HUD presentation | `unified-mmorpg-hud-v900.mjs` (#386) | Presence protocol parsing, Combat authority |

---

## 3. Required Merge Order

Recommended order:

```text
PR #384  →  PR #385  →  PR #386
Protocol    Transport    Presentation
```

เหตุผล:

- #384 สร้าง source-of-truth กลางก่อน
- #385 ใช้ contract กลางเพื่อส่ง animation/presence โดยไม่สร้างกฎใหม่
- #386 รวม presentation/state adapters หลัง transport foundation เสถียร

#386 สามารถพัฒนาคู่ขนานได้ เพราะไฟล์ของ #385 และ #386 ปัจจุบันไม่ชนกันโดยตรง แต่ **final merge ควรทำหลัง #385** เพื่อให้ regression suite ตรวจบน runtime topology ล่าสุด

---

# 4. PR #384 — Shared Presence Protocol

## Role

**#384 = Protocol Owner**

หน้าที่หลักคือทำให้ `world-presence-protocol.mjs` เป็น canonical source-of-truth ของ presence data ที่ข้าม online boundary

## Required responsibilities

`world-presence-protocol.mjs` ควรถืออย่างน้อย:

- zone schema / zone validation
- max remote players / max candidates
- player id/name bounds
- locomotion vocabulary
- combat animation vocabulary
- pose validation
- animation sanitization
- snapshot player sanitization
- snapshot validation
- self-filter semantics ที่จำเป็นใน ingress

ตัวอย่าง vocabulary กลาง:

```text
locomotion:
idle | walk | run | swim | jump | dash

combatState:
idle | attack | skill | hurt | dead | guard
```

## Required refactor

หลัง #384:

- `online-world-bridge-v900.mjs` ต้องเรียก shared protocol แทนการมี parser/vocabulary ของตัวเอง
- `world-presence-v800.mjs` คง structural guard ได้ แต่ไม่ควรสร้าง canonical vocabulary ชุดใหม่
- `chat-runtime.mjs` ต้องส่ง/รับ validated presence frame ผ่าน contract เดียวกัน

## Must NOT do

#384 ห้าม:

- เพิ่ม Pirate iframe-specific behavior
- เพิ่ม HUD presentation
- เพิ่ม gameplay logic
- เพิ่ม second WebSocket
- เปิด production write flags

## Acceptance gates

- [ ] มี protocol test โดยตรง (`tests/world-presence-protocol.mjs`)
- [ ] malformed zone / id / numeric payload fail closed
- [ ] duplicate/self entries ไม่รั่วผ่าน ingress ตาม contract
- [ ] locomotion/animation field ใหม่ไม่ถูกทำให้หายโดย shared sanitizer
- [ ] existing two-client presence tests ผ่าน
- [ ] existing world lifecycle tests ผ่าน
- [ ] no gameplay/save/write flag changes

---

# 5. PR #385 — Pirate Presence Action Relay

## Role

**#385 = Adapter / Transport only**

เป้าหมายคือแก้ boundary ของ Pirate Fruit ให้ `locomotion` และ `animation` เดินทางครบทั้งขาออกและขาเข้า

## Required change after #384 merges

ก่อน merge #385 ให้ rebase onto latest `main` หลัง #384 แล้ว refactor draft ปัจจุบัน

### Remove duplicated protocol definitions

ถ้า #385 branch ยังมีสิ่งต่อไปนี้ ให้ถอดออกหรือเปลี่ยนเป็น import จาก shared protocol:

- `PIRATE_PRESENCE_LOCOMOTION_VALUES`
- `PIRATE_PRESENCE_COMBAT_STATES`
- independent locomotion vocabulary
- independent combat-state vocabulary
- independent animation field-clamping policy
- duplicate snapshot player validation ที่ shared protocol ครอบคลุมแล้ว

### Keep Pirate-specific adapter behavior

#385 ควรเหลือเฉพาะสิ่งที่เป็น Pirate boundary จริง เช่น:

- ตรวจ message type เฉพาะ iframe
- ตรวจ exact iframe WindowProxy / opaque origin ที่ layer boot เป็นเจ้าของ
- map Pirate local pose → shared presence pose
- map shared world snapshot → Pirate iframe snapshot envelope
- forward connection/status message เข้า iframe
- maintain pose-only fallback เมื่อ optional action state ไม่มี

## Target flow

ขาออก:

```text
Pirate iframe
   │
   │ local presence message
   ▼
Pirate adapter
   │
   ▼
Shared Presence Protocol validation
   │
   ▼
WORLD_STATE
   │
   ▼
Shared Socket
```

ขาเข้า:

```text
Server world-snapshot
   │
   ▼
Shared Presence Protocol validation
   │
   ▼
Pirate adapter
   │
   ▼
Pirate iframe
```

## Companion dependency

Pirate-fruit PR #145 ยังคงเป็น companion work สำหรับ:

- publish local jump/skill state จาก iframe
- consume remote locomotion/animation
- render airborne lift / remote action presentation

หลัง #145 พร้อม ต้อง rebuild/re-vendor offline Pirate bundle ตาม dependency/hash rules ของ PocketMonster

## Must NOT do

#385 ห้าม:

- นิยาม shared protocol รุ่นที่สอง
- duplicate server relay rules
- parse HUD feature state
- เพิ่ม gameplay damage/HP authority
- ผูก animation transport กับ Unified HUD โดยตรง

## Acceptance gates

- [ ] #385 rebased on #384/main
- [ ] no duplicate locomotion/combat vocabulary remains in Pirate bridge
- [ ] local jump survives iframe → parent → WORLD_STATE
- [ ] local skill survives iframe → parent → WORLD_STATE
- [ ] inbound snapshot forwards validated jump/skill state back to iframe
- [ ] malformed optional animation fields drop safely without dropping valid pose
- [ ] `v90-pirate-presence-readonly` PASS
- [ ] `v90-two-client-world-presence` PASS
- [ ] `v90-two-client-world-lifecycle` PASS
- [ ] `v90-unified-online-world` PASS
- [ ] browser two-client evidence required before claiming jump/skill visually fixed in production

---

# 6. PR #386 — Unified MMORPG HUD

## Role

**#386 = Presentation Consolidation Owner**

เป้าหมายของ #386 ไม่ใช่เพียงสร้าง HUD ใหม่ แต่ต้องลดจำนวน presentation owners ของ V8/V9

## Ownership model

Runtime/domain เดิมยังเป็นเจ้าของข้อมูลจริง:

```text
Chat Runtime ─────┐
Pocket Quest ─────┤
Pocket Party ─────┤
Pocket HUD State ─┤
Pirate Telemetry ─┤
                  ▼
          Feature Adapters / Stores
                  │
                  ▼
           Unified MMORPG HUD
```

## Required rules

### 6.1 Adapter reads, does not become authority

Adapters ต้อง:

- read/present bounded immutable snapshots
- expose commands ผ่าน existing domain API
- return normalized command results

Adapters ห้าม:

- commit gameplay state โดยตรง
- duplicate quest/party/combat formulas
- parse raw presence frames
-สร้าง parallel save model

### 6.2 One presentation owner after mount

เมื่อ Unified HUD mount สำเร็จ:

- legacy Pocket HUD surfaces ที่ถูกแทนที่ต้อง hidden/disabled
- legacy surfaces ต้องไม่รับ pointer
- ห้าม render state เดียวกันพร้อมกันสอง UI ถาวร
- shared controls ที่ยังจำเป็นกับ Pirate input ต้องไม่ถูก retire โดยผิดพลาด

### 6.3 Chat migration

ระหว่าง migration `chat-runtime.mjs` อาจยังมี fallback mount ได้ แต่ target architecture คือ:

```text
Chat transport/store
       │
       ▼
Unified Chat Adapter
       │
       ▼
Unified MMORPG HUD
```

หลัง migration complete ให้มี follow-up retire legacy HTML/runtime-injected Chat presentation

### 6.4 Presence boundary

#386 ไม่ควร import หรือ reimplement presence protocol เพื่อวาด HUD

ถ้าอนาคต HUD ต้องแสดง online player count / zone presence ให้สร้าง feature adapter จาก already-validated runtime state แทนการ parse `world-snapshot` ซ้ำ

## Acceptance gates

- [ ] one feature store per HUD feature
- [ ] semantic payload dedupe prevents meaningless revision bumps
- [ ] teardown unsubscribes all feature stores
- [ ] leaving world/session resets stale Quest/Party/Target data
- [ ] legacy UI retirement capability flag works
- [ ] shared Pirate touch controls remain usable
- [ ] Chat/Quest/Party command path uses adapters, not direct DOM mutation
- [ ] no raw world-snapshot parser added to HUD files
- [ ] `test:v90:pirate-player` PASS
- [ ] full `npm test` PASS on latest main after #384/#385 merge
- [ ] browser/mobile verification before production deploy

---

# 7. Cross-PR Rules to Prevent New Duplication

## Rule A — No copied enums/contracts

ก่อนเพิ่ม constant/schema ใหม่ ให้ค้น repo ก่อนเสมอ

หากมี source-of-truth แล้วต้อง import/reuse ห้าม copy list เดียวกันไปประกาศใหม่เพียงเพราะอยู่คนละ domain adapter

## Rule B — Boundary-specific checks are allowed; canonical parsing is not duplicated

อนุญาตให้แต่ละ boundary ทำ structural safety guard เพิ่มได้ เช่น:

- exact iframe source
- origin
- object/null check
- mounted lifecycle generation

แต่ canonical semantics เช่น locomotion values, combat state values, zone format, player limits ต้องมาจาก protocol owner

## Rule C — No second transport

Presence, Chat และ Combat ใช้ authenticated shared socket owner เดิม

สาม PR นี้ห้ามสร้าง WebSocket owner เพิ่ม

## Rule D — No second gameplay authority

Shared protocol / HUD / presence adapters เป็น transport/presentation เท่านั้น

HP, status commit, combat outcome, persistence ownership ต้องคง authority contract เดิม

## Rule E — Migration must include retirement

เมื่อ Unified HUD รับ presentation ownership ของ feature แล้ว ต้องมี acceptance gate สำหรับ retire/hide legacy surface ไม่ใช่เก็บทั้งสอง UI แบบถาวร

## Rule F — Avoid big-bang file relocation

ยังไม่ย้ายทั้ง repo เข้า `src/` ในสาม PR นี้ เพราะ test/build/cache-bust path ปัจจุบันผูกกับ root modules จำนวนมาก

ให้ลด duplication ตาม ownership boundary ก่อน แล้วทำ directory migration เป็น follow-up แยก

---

# 8. Test Matrix After All Three PRs

ขั้นต่ำต้องตรวจร่วมกัน:

## Presence protocol

- protocol unit tests
- malformed frames
- self-filter
- wrong-zone snapshot
- max candidates / remote players

## Two-client lifecycle

1. join same zone
2. mutual visibility
3. warp Pirate → Pocket
4. no cross-world leakage
5. warp back
6. reconnect/replay
7. session end
8. no ghost players

## Pirate action state

- walk/run
- jump
- dash
- attack
- skill
- malformed action state fail-closed

## HUD

- Chat
- Quest
- Party
- Target
- Player status
- Minimap
- world/session teardown
- legacy retirement
- mobile touch ownership

## Regression

```bash
npm run check
npm run test:v90:pirate-player
npm run test:v91:combat
npm test
npm run build:pages
node tests/v90-unified-pages-artifact.mjs
node tests/v90-deployment-gates.mjs
```

ถ้า branch ใดมี known baseline failure ต้องแสดงว่า reproduce ได้บน base เดียวกัน และห้ามใช้ baseline failure เป็นเหตุผลข้าม regression ใหม่

---

# 9. Merge / Rebase Playbook

## Step 1 — Finish #384

- review shared protocol ownership
- ensure `world-presence-protocol.mjs` is canonical
- merge #384

## Step 2 — Rebase #385

- rebase `qwen/v9-presence-action-relay` on new main
- replace duplicated vocabulary/sanitizer with shared imports
- rerun targeted + two-client tests
- require browser two-client evidence for visual jump/skill claim
- merge #385

## Step 3 — Rebase #386

- rebase Unified HUD branch on main containing #384 + #385
- resolve only runtime/cache-bust changes required by latest main
- do not absorb presence parser into HUD
- run full V9 + full repo tests
- browser/mobile verify Unified Dock
- merge #386

---

# 10. Deferred Follow-ups After #384–#386

สิ่งต่อไปนี้ควรทำหลังสาม PR เสถียร ไม่ควรยัดรวมในรอบนี้:

### A. Active entry generation

ปัจจุบัน `index.html` และ `v900.html` ต้อง byte-identical

เป้าหมาย follow-up:

```text
v900 source/template
      │ build
      ▼
index.html generated alias
```

ลด manual duplicate editing โดยไม่ทำลาย deployment contract

### B. Chat presentation retirement

หลัง Unified HUD เป็น owner จริง:

- remove legacy Chat markup จาก active HTML หากไม่จำเป็น
- retire runtime-injected Chat layout CSS
- keep `chat-runtime.mjs` เป็น transport/store owner

### C. CSS ownership cleanup

ค่อยแยก legacy/V9 styles เป็น component ownership เช่น HUD/Chat/Combat/Pirate โดยไม่ทำ big-bang ในสาม PR

### D. Directory migration

หลัง architecture ownership ชัดแล้ว ค่อยพิจารณา `src/shared`, `src/pirate`, `src/pocket`, `src/online`, `src/hud`

---

# 11. Definition of Done

สาม PR ถือว่าปิดรอบนี้สำเร็จเมื่อ:

- [ ] Presence vocabulary/schema มี source-of-truth เดียว
- [ ] Pirate bridge ไม่มี duplicate shared protocol definitions
- [ ] jump/skill state เดินทาง end-to-end และมี browser evidence
- [ ] Shared socket ยังคงเป็น transport owner เดียว
- [ ] Unified HUD เป็น presentation owner ของ feature ที่ migrate แล้ว
- [ ] legacy HUD ที่ถูกแทนที่ไม่รับ pointer/ไม่ render ซ้ำ
- [ ] HUD ไม่ parse raw presence protocol
- [ ] gameplay/server authority boundaries ไม่เปลี่ยน
- [ ] two-client warp/reconnect/no-ghost tests ผ่าน
- [ ] V9/Combat/full regression gates ผ่าน
- [ ] production write flags ไม่ถูกเปิดโดยสาม PR นี้

---

## Final architecture principle

การลดความซ้ำซ้อนไม่ได้หมายถึงลบ validation ทุกชั้นหรือรวมทุกไฟล์เป็นไฟล์เดียว

สิ่งที่ต้องลดคือ **หลาย implementation ของ semantic เดียวกัน**

ให้คง defense-in-depth ที่ boundary ได้ แต่ต้องมี canonical owner เพียงหนึ่งเดียวสำหรับ schema/rules และ presentation state

```text
#384 = Define once
#385 = Transport/reuse
#386 = Present once
```

นี่คือ baseline ที่ควรใช้ review และ merge PR #384, #385 และ #386 ต่อจากนี้
