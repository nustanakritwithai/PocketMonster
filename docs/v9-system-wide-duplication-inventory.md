# PocketMonster V9 — System-wide Duplication Inventory & Reduction Roadmap

## Purpose

เอกสารนี้เป็น companion ของ `docs/v9-pr384-386-deduplication-plan.md`

ไฟล์แรกกำหนดวิธีเดิน PR #384 / #385 / #386 โดยไม่สร้าง source-of-truth ซ้ำ ส่วนไฟล์นี้ขยายมุมมองไปยัง **ความซ้ำซ้อนระดับทั้ง repository** เพื่อแยกว่า:

1. อะไรคือ duplicate จริงและควรลด
2. อะไรคือ transitional duplication จาก V8 → V9 ที่ต้องมี retirement plan
3. อะไรคือ intentional duplication เพื่อ compatibility / defense-in-depth / testing และ **ห้ามลบแบบเหมารวม**
4. หลัง #384–#386 เสถียรแล้ว ควรเก็บ technical debt ตามลำดับใด

หลักกลาง:

> **ลดหลาย implementation ของ semantic เดียวกัน ไม่ใช่ลดจำนวนไฟล์แบบสุ่ม**

และยังคงหลักจาก merge plan:

> **หนึ่งข้อมูล = หนึ่งเจ้าของ, หนึ่ง contract = หนึ่ง source-of-truth, หนึ่ง UI feature = หนึ่ง presentation owner**

---

# 1. Classification

ใช้ระดับต่อไปนี้ในเอกสารนี้

| ระดับ | ความหมาย | การจัดการ |
|---|---|---|
| 🔴 Exact / canonical duplication | เนื้อหาหรือ semantic เดียวกันมีหลาย source-of-truth | ต้องรวม/สร้าง canonical owner |
| 🟠 Transitional duplication | มีหลาย implementation เพราะ migration ยังไม่จบ | ต้องมี retirement gate |
| 🟡 Intentional boundary duplication | validation/alias ซ้ำเพื่อ safety หรือ compatibility | เก็บได้ แต่ canonical semantics ต้องมี owner เดียว |
| 🟢 Intentional test duplication | regression/mutation/acceptance overlap โดยตั้งใจ | ห้ามลบเพียงเพราะชื่อหรือ assertion คล้ายกัน |
| ⚪ Audit candidate | มีสัญญาณซ้ำ แต่ยังไม่ได้พิสูจน์ว่า semantic เหมือนกัน | ตรวจ dependency/usage ก่อนแตะ |

---

# 2. Confirmed Duplication Inventory

## 2.1 `index.html` และ `v900.html` — exact duplicate

### สถานะ

🔴 **ยืนยันแล้วว่า byte-identical**

ทั้งสองไฟล์เป็น active V9 entry และ test หลายชุดบังคับให้เหมือนกันทุก byte

ปัจจุบัน:

```text
index.html ─────┐
                ├── same V9 entry content
v900.html ──────┘
```

### เหตุผลที่ยังมีอยู่

- `index.html` เป็น live/default entry
- `v900.html` เป็น versioned entry / regression reference
- build/deployment/test contracts ปัจจุบันคาดหวังทั้งสองชื่อ

### ปัญหา

- ต้องแก้ cache-bust / markup สองชื่อ
- tests จำนวนมากต้องตรวจ equality ซ้ำ
- scripts/deployment gates ต้องรู้จักทั้งสอง alias
- documentation drift ง่าย เช่น README ยังอธิบาย lineage เก่า

### Target

ยัง **ไม่ลบไฟล์ใดใน #384–#386**

หลังสาม PR เสถียร ให้สร้าง single-source generation:

```text
V9 entry source/template
        │
        ├── build → index.html
        └── build → v900.html
```

หรือให้ `v900.html` เป็น authored source แล้ว generate `index.html` ใน build

### Acceptance สำหรับ follow-up

- live/deployment URLs ไม่เปลี่ยน
- output สอง alias ยัง byte-identical หาก contract ยังต้องการ
- source ที่มนุษย์แก้มีเพียงหนึ่งชุด
- tests ตรวจ generated artifact แทนบังคับให้แก้สอง source

---

## 2.2 Presence vocabulary / sanitizer — semantic duplicate

### สถานะ

🔴 **เป็นปัญหาหลักของ PR #384/#385**

semantic เดียวกันกระจายอยู่/กำลังจะอยู่ใน:

- `online-world-bridge-v900.mjs`
- `pirate-presence-bridge-v900.mjs`
- `world-presence-v800.mjs`
- ingress/egress handling ใน `chat-runtime.mjs`

กลุ่มข้อมูลที่เสี่ยงมีหลาย owner:

- zone format
- player id/name bounds
- max candidates / max remote players
- pose (`x`, `z`, `dir`)
- locomotion vocabulary
- combat animation vocabulary
- animation progress clamp
- world snapshot sanitization
- self-filter semantics

### Target

`world-presence-protocol.mjs` จาก #384 ต้องเป็น canonical semantic owner

```text
world-presence-protocol.mjs
    ├── vocabulary
    ├── limits
    ├── schemas
    ├── sanitizers
    └── canonical filtering
             │
      ┌──────┼────────┐
      ▼      ▼        ▼
online bridge pirate  transport
```

#385 ต้องเป็น Pirate-specific adapter เท่านั้น

---

## 2.3 Legacy V8 DOM + V9 DOM — transitional UI duplication

### สถานะ

🟠 **ยังมี UI semantic เดียวกันใน entry หลายรุ่น**

`v800.html` และ V9 entry (`index.html` / `v900.html`) ไม่ใช่ exact duplicate แต่ V9 carry legacy surfaces จำนวนมากต่อมา เช่น:

- joystick
- camera pad
- Chat
- HUD containers
- quest/target/party-related markup
- utility controls บางส่วน

นี่เป็นผลจาก architecture ที่ V9 เป็น orchestration layer เหนือ V8 runtime ไม่ใช่ rewrite ใหม่ทั้งหมด

### ห้ามทำ

ห้ามลบ V8 markup ทีเดียว เพราะ runtime/tests หลายส่วนยังอ้าง selector เดิม

### Target

ใช้ #386 เป็น migration boundary:

```text
Legacy DOM owner
      │ adapter reads state
      ▼
Unified Feature Store
      │
      ▼
Unified MMORPG HUD
```

เมื่อ feature ใด migrate เสร็จ:

1. Unified HUD เป็น presentation owner
2. legacy surface hidden/disabled
3. pointer ถูกตัด
4. state ยังมาจาก domain owner เดิม
5. follow-up ค่อยลบ markup เมื่อ dependency scan ยืนยันว่าไม่มี consumer

---

## 2.4 Chat presentation — มีหลาย owner

### สถานะ

🟠 **Confirmed transitional duplication**

Chat ปัจจุบันมีอย่างน้อย 3 presentation/layout paths:

1. Chat markup ใน active HTML / legacy HTML
2. `chat-runtime.mjs` สามารถสร้าง fallback DOM (`chatToggleBtn`, `gameChat`, `chatMessages`, ฯลฯ)
3. Chat layout/style อยู่ทั้ง stylesheet และ runtime-injected `<style>`

Transport/store และ presentation จึงยังปนกัน

### Target ownership

```text
chat-runtime.mjs
Transport + Store owner
        │
        ▼
Unified Chat Adapter
        │
        ▼
unified-mmorpg-hud-v900.mjs
Presentation owner
```

### Migration rule

ใน #386:

- fallback DOM ยังอยู่ได้เพื่อ compatibility
- Unified Dock ต้องไม่สร้าง Chat transport ใหม่
- เมื่อ Unified HUD stable ให้เปิด follow-up retire legacy HTML Chat + injected presentation CSS

### Done condition

- one Chat transport/store
- one active Chat presentation
- no duplicate unread/channel/send state
- fallback path มี explicit compatibility flag หรือถูก retire

---

## 2.5 CSS ownership — override หลายชั้น

### สถานะ

🟠 **High maintenance duplication**

V9 โหลดหลาย style ownership พร้อมกัน เช่น:

```text
style-v800.css
      ↓ legacy/base
style-v900.css
      ↓ V9 overrides
combat-v91.css
      ↓ combat-specific
runtime-injected styles
      ↓ emergency/runtime override
!important
```

ตัวอย่าง Chat มี `.chat-toggle` / `.game-chat` อยู่ใน `style-v800.css` และมี override ที่ `chat-runtime.mjs` inject เพิ่ม

### ปัญหา

- selector เดียวมีหลาย owner
-แก้ layout หนึ่งจุดอาจถูก override ภายหลัง
- mobile breakpoint ownership ไม่ชัด
- runtime JavaScript เริ่มถือ visual policy

### Target

หลัง #386:

```text
styles/
  base.css
  shared-controls.css
  hud.css
  chat.css
  combat.css
  pirate-bridge.css (เฉพาะถ้าจำเป็น)
```

**หมายเหตุ:** นี่เป็น logical target ไม่ใช่คำสั่งย้ายไฟล์ทันที

ก่อนย้าย directory ให้ทำ ownership extraction ก่อน:

1. ระบุ canonical selector owner
2. ลบ duplicate override ที่ไม่มี consumer
3. ลด `!important` ที่ใช้เพื่อชนกันเอง
4. ค่อยย้ายไฟล์ใน PR แยก

---

## 2.6 Renderer validation ซ้ำกับ protocol validation

### สถานะ

🟡 **Intentional duplication บางส่วน / semantic duplication ต้องห้าม**

`world-presence-v800.mjs` ยังตรวจ snapshot structurally ก่อน render เช่น:

- zone ตรงกับ scene
- `players` เป็น array
- `id` มีค่า
- `x/z` finite
- max remote players

สิ่งนี้มีประโยชน์เป็น defense-in-depth

### Rule

Renderer ทำได้:

- null/object guard
- finite coordinate guard
- scene-local lifecycle check
- resource limit guard

Renderer **ห้าม** มี canonical semantic rules คนละชุด เช่น:

- locomotion enum อีกชุด
- combatState enum อีกชุด
- clamp policy อีกสูตร
- zone grammar อีกแบบ

Target:

```text
Shared protocol = semantic truth
Renderer       = local safety guard
```

ดังนั้นเป้าหมายไม่ใช่ลบ validation ทุกชั้น แต่ลบ **semantic parser หลายชุด**

---

## 2.7 Cache-bust / runtime revision pins กระจายหลายไฟล์

### สถานะ

🟠 **Cross-file maintenance duplication**

runtime path แบบ versioned เช่น `game-v800.js?v=...`, `entry-preload-v900.mjs?v=...`, `style-v900.css?v=...`, Pirate offline revisions และ shell revisions ถูกอ้างในหลายที่ เช่น:

- HTML entries
- `combined-worlds-v900.mjs`
- `boot-pirate-fruit-v900.mjs`
- build scripts
- tests
- deployment verification

ทำให้ feature PR หนึ่งต้อง bump version chain หลายไฟล์ และมีความเสี่ยง stale asset หากลืมจุดหนึ่ง

### Target

ไม่ควรถอด cache-bust safety แต่ควรลด manual source-of-truth

แนวทาง follow-up:

```text
runtime-revisions.mjs / build manifest
      ├── V9_ENTRY_REV
      ├── GAME_RUNTIME_REV
      ├── STYLE_V900_REV
      ├── PIRATE_BUNDLE_REV
      └── CHAT_RUNTIME_REV
             │
        build/test consume
```

หรือ generate query revisions จาก content hashes ใน build artifact

### Constraint

ห้ามเปลี่ยนทั้งหมดใน PR #384/#385/#386 เพราะ deployment chain มี regression gates จำนวนมาก ให้ทำหลัง runtime topology เสถียร

---

## 2.8 Build/deployment knowledge ของ active entry ซ้ำหลายจุด

### สถานะ

🟠 **Config duplication**

ความรู้ว่า active V9 entries คือ `index.html` และ `v900.html` ปรากฏใน:

- build scripts
- live verification scripts
- artifact tests
- deployment gates
- feature regression tests

การมี assertion หลายจุดไม่ผิด แต่ **รายการ alias/canonical entry ไม่ควรประกาศแบบ hard-code หลายชุด**

### Target

สร้าง test/build config กลางใน follow-up เช่น:

```text
ACTIVE_V9_ENTRY_ALIASES = ['index.html', 'v900.html']
CANONICAL_V9_ENTRY = 'v900.html'
```

หรือให้ build manifest เป็น owner แล้ว tests อ่าน manifest

### Important

ยังต้องมีหลาย tests ตรวจ artifact คนละมิติได้ แต่ไม่ควร copy configuration list คนละชุด

---

## 2.9 Test assertions ซ้ำ — แยก “ซ้ำที่ควรรวม” กับ “ซ้ำที่ต้องเก็บ”

### 2.9.1 Equality/config helpers

🟠 หลาย test อ่าน `index.html` + `v900.html` แล้ว assert byte-identical ซ้ำกัน

นี่สามารถลด boilerplate ด้วย test helper เช่น:

```text
tests/helpers/v9-entry.mjs
  readActiveV9Entries()
  assertV9EntryAliasesEqual()
  resolveActiveAssetRevision()
```

แต่แต่ละ feature test ยังควร assert requirement ของตัวเอง

### 2.9.2 Mutant tests

🟢 **ห้ามถือเป็น duplicate ที่ต้องลบ**

ไฟล์เช่น:

```text
feature.mjs
feature-mutants.mjs
```

มีหน้าที่ต่างกัน:

- normal test พิสูจน์ behavior ที่ถูก
- mutant test พิสูจน์ว่า guard ตรวจ behavior ที่ผิดได้

ห้าม consolidate เพียงเพราะชื่อ/fixture ซ้ำ

### 2.9.3 Two-client tests

🟢 `v90-two-client-world-presence.mjs` และ `v90-two-client-world-lifecycle.mjs` มีช่วง join/presence overlap โดยตั้งใจ

- presence test = focused contract
- lifecycle test = warp/reconnect/leave/no-ghost end-to-end

ให้เก็บทั้งสอง แต่แชร์ harness helper ได้ใน follow-up หากลด boilerplate โดยไม่ลด coverage

---

## 2.10 Documentation drift / duplicated historical truth

### สถานะ

🔴 **Confirmed stale documentation**

README ปัจจุบันยังอธิบาย lineage ว่า:

```text
index.html = v800.html
Runtime game-v800.js?v=810
V8.1.0
```

ขณะที่ active source จริงปัจจุบันคือ V9 และ `index.html` = `v900.html`

เอกสาร historical plans หลายไฟล์ยังมีคุณค่า แต่หากไม่ระบุสถานะ อาจถูกอ่านเป็น current architecture

### Target

แยก documentation status:

```text
README.md                = current product/runtime entry
INTEGRATION-MASTER...    = current architecture baseline
.hermes/plans/...        = implementation plans
historical docs          = archived/reference + status banner
```

### Required follow-up

- update README หลัง #384–#386 stable เพื่ออธิบาย V9 current entry/runtime
- เพิ่ม `Status: historical/reference` ให้เอกสารที่ไม่ใช่ current truth เมื่อจำเป็น
- ห้ามลบ historical plans ที่ยังใช้ audit decision lineage

---

# 3. Potential Duplication Candidates Requiring Audit

รายการนี้ **ยังไม่อนุญาตให้ลบ** จนกว่าจะมี dependency/semantic audit

## 3.1 Old versioned runtimes / entries

repo มี lineage V6/V7/V8/V9 และ tests ยังอ้าง historical behavior จำนวนมาก

ก่อนลบไฟล์ version เก่า ต้องพิสูจน์:

- active entry ไม่ import
- build artifact ไม่ copy
- migration/save path ไม่ต้องใช้
- tests ไม่ใช้เป็น fixture
- docs/reference ไม่ต้องใช้ runtime file จริง

ห้ามใช้ชื่อไฟล์เก่าเป็นหลักฐานว่า dead code

## 3.2 Asset definitions / appearance aliases

`asset-presentation`, `assets/catalog`, `assets/appearances`, texture/provider adapters อาจมี definition ที่ดูคล้ายกันแต่ทำคนละ role

ต้องตรวจ:

- asset ID
- provider
- appearance ID
- runtime role
- fallback chain
- ownership

ก่อนรวม

## 3.3 Pirate offline bundle vs Pocket adapters

Pirate offline bundle intentionally encapsulates original Pirate client ขณะที่ Pocket มี presentation/action/save/presence adapters ครอบมัน

โค้ดที่ดูคล้ายกันบางส่วนอาจเป็น **trust-boundary duplication ที่จำเป็น**

ห้าม merge bundle internals เข้า parent เพียงเพื่อลดไฟล์ เพราะจะทำลาย opaque sandbox/security boundary

---

# 4. System-wide Ownership Rules

## Rule 1 — Canonical semantics live in contracts, not adapters

Adapter มีหน้าที่ map boundary ไม่ใช่นิยาม vocabulary ใหม่

## Rule 2 — Transport owner เดียวต่อ channel

Chat / Presence / Combat ใช้ authenticated shared socket owner เดิม ห้ามแต่ละ feature สร้าง socket เพื่อความสะดวก

## Rule 3 — Domain state owner ไม่เปลี่ยนเพราะมี Unified HUD

HUD อ่าน state และส่ง command ผ่าน domain API เท่านั้น

## Rule 4 — Presentation migration ต้องมี retirement gate

เพิ่ม UI ใหม่โดยไม่ปิด UI เก่า = เพิ่ม duplication debt

## Rule 5 — Compatibility aliases ต้อง generate หรือ declare จาก config กลาง

ถ้าจำเป็นต้องมีสอง filename/สอง artifact ให้ลด authored source เหลือหนึ่ง

## Rule 6 — Defense-in-depth validation อยู่ได้ แต่ semantic parser มีตัวเดียว

## Rule 7 — Tests สามารถ overlap coverage แต่แชร์ fixtures/config/helpers ได้

## Rule 8 — Documentation ต้องระบุ current truth กับ historical truth ให้แยกกัน

## Rule 9 — Cache-bust safety ต้องคงอยู่ แต่ revision ownership ควร centralize

## Rule 10 — ห้าม big-bang cleanup พร้อม feature migration

ลดความซ้ำตาม boundary ทีละชั้นและรักษา regression evidence

---

# 5. Prioritized Reduction Roadmap

## Phase 0 — Current merge train

ลำดับ:

```text
#384 → #385 → #386
```

ผลที่ต้องได้:

- canonical Presence protocol
- Pirate relay reuse protocol
- Unified HUD ลด presentation owners

นี่คือ priority สูงสุด เพราะกำลังแก้ active feature paths อยู่แล้ว

---

## Phase 1 — Current-truth cleanup

หลัง #386 stable:

1. อัปเดต README ให้ตรง V9
2. สร้าง system map/current architecture section
3. ระบุ historical docs อย่างชัดเจน

ความเสี่ยงต่ำ แต่ช่วยลดการเข้าใจผิดสูง

---

## Phase 2 — Entry alias generation

เปลี่ยน `index.html` / `v900.html` จากสอง authored copies เป็น generated aliases จาก source เดียว

ต้องรักษา:

- byte-identical output
- GitHub Pages
- Firebase launcher
- deployment verifier
- all entry artifact gates

---

## Phase 3 — Chat + HUD legacy retirement

หลัง Unified HUD browser/mobile verified:

1. retire legacy Chat markup
2. retire runtime-generated fallback presentation เมื่อไม่ต้องใช้แล้ว
3. keep transport/store API
4. retire replaced Quest/Party/Target surfaces ทีละ feature

ห้ามรวมทุก feature ใน deletion PR เดียวถ้า rollback ยาก

---

## Phase 4 — CSS ownership cleanup

1. inventory selectors ที่ override ข้าม `style-v800` / `style-v900` / runtime CSS
2. assign canonical component owner
3. remove dead overrides
4. ลด runtime-injected visual CSS
5. ค่อย split logical components

---

## Phase 5 — Runtime revision centralization

ลด manual cache-bust pins ด้วย manifest/config/build-generated revision source

เป้าหมายคือ PR feature ไม่ต้องแก้ revision string หลายสิบจุดด้วยมือ

---

## Phase 6 — Test helper deduplication

สร้าง shared helpers สำหรับ:

- V9 entry aliases
- asset revisions
- common fake DOM
- two-client relay harness (ถ้าเหมาะสม)

แต่ห้ามลด coverage/mutant independence

---

## Phase 7 — Directory/module organization

เมื่อ ownership semantic เสถียรแล้วค่อยพิจารณา:

```text
src/
  shared/
  online/
  pocket/
  pirate/
  hud/
  assets/
```

นี่เป็น **ผลลัพธ์สุดท้าย** ไม่ใช่จุดเริ่ม cleanup

ห้ามย้ายไฟล์จำนวนมากก่อนลด source-of-truth duplication เพราะจะเป็นเพียง “ย้ายความซ้ำไปอยู่โฟลเดอร์ใหม่”

---

# 6. Do-Not-Delete List Without Evidence

รายการต่อไปนี้ห้ามถูกลบเพียงเพราะดูซ้ำ:

- `*-mutants.mjs`
- focused test ที่ overlap E2E
- renderer structural safety guards
- V8 compatibility DOM ที่ #386 ยังไม่ได้ retire
- Pirate sandbox boundary checks
- versioned runtime/entry ที่ build/test/migration ยังอ้าง
- historical architecture docs ที่ยังใช้ decision audit

ทุก deletion PR ต้องตอบได้ว่า:

1. canonical replacement คืออะไร
2. consumer ทั้งหมดถูก migrate แล้วหรือไม่
3. regression test อะไรพิสูจน์
4. rollback คืออะไร

---

# 7. Repository-wide Deduplication Definition of Done

ไม่จำเป็นต้องทำทั้งหมดใน PR #387 หรือใน merge train ปัจจุบัน แต่ใช้เป็น roadmap หลัง V9 stabilization

ถือว่าระบบลด duplication สำเร็จเมื่อ:

- [ ] Presence schema/vocabulary มี canonical owner เดียว
- [ ] Pirate/Online adapters ไม่ copy semantic contract
- [ ] active HTML aliasesมี authored source เดียว
- [ ] Chat มี transport owner เดียวและ active presentation owner เดียว
- [ ] Quest/Party/Target/HUD feature ที่ migrate แล้วไม่มี legacy active presentation ซ้ำ
- [ ] CSS selector ownership ชัด ไม่มี runtime override ที่ไม่จำเป็น
- [ ] cache-bust revisions มี source/config/build owner ชัดเจน
- [ ] build/deploy config ไม่ hard-code active-entry aliases หลายชุดโดยไม่จำเป็น
- [ ] repeated test setup/config ถูกแชร์ผ่าน helpers โดยไม่ลด coverage
- [ ] mutant/acceptance/E2E tests ที่ตั้งใจ overlap ยังอยู่
- [ ] README/current docs ตรงกับ runtime ปัจจุบัน
- [ ] historical docs ถูกระบุสถานะ
- [ ] ไม่มี big-bang cleanup ที่เปลี่ยน authority หรือ security boundary โดยไม่มี acceptance evidence

---

# 8. Final Principle

การจัดระเบียบ PocketMonster V9 ไม่ควรวัดจากจำนวนไฟล์ที่ลบได้

ควรวัดจากคำถามเหล่านี้:

- semantic นี้มีเจ้าของกี่คน?
- state นี้ถูกเขียนกี่จุด?
- UI feature นี้ render พร้อมกันกี่ owner?
- contract นี้ถูก copy ไปกี่ boundary?
- version/config นี้ต้องแก้ด้วยมือกี่จุด?
- เมื่อ source-of-truth เปลี่ยน มีทางพิสูจน์ว่าทุก consumer ใช้รุ่นเดียวกันหรือไม่?

Target state:

```text
Define once
Transport once
Store once
Present once
Generate aliases
Validate at boundaries
Test at multiple levels
```

นี่คือแนวทางลดความซ้ำซ้อนโดยไม่เสีย safety, compatibility, regression coverage หรือ architecture boundaries ของ V9
