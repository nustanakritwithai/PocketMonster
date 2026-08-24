# SKILL ITEM CUSTOMIZATION PLAN V8 — ไอเทมกินเพื่อเรียนรู้สกิล

> ระบบแต่งมอนสเตอร์: ใช้ Skill Item กับมอนสเตอร์ แล้วเพิ่มสกิลนั้นเป็นความสามารถถาวรของมอนสเตอร์ พร้อมเลือกสล็อต Manual Skill `s1–s4`

## สถานะและฐานอ้างอิง

- สถานะ: **IMPLEMENTED + CODEX AUTOMATED ACCEPTANCE PASS** — ไม่อ้าง visual sign-off เพราะ Termux ไม่มี browser harness
- Repository/base ที่ใช้: `nustanakritwithai/PocketMonster` ที่ `origin/main` HEAD `e373d35` บน working branch `codex/v89-skill-item-customization`
- เอกสารหลัก: `Monster_Life_RPG_Development_Plan_TH_v4_V7.0.6_Synced.docx` (Ring 0/Ring 1 และ save/architecture gates)
- เอกสารประกอบรุ่นปัจจุบัน: `Monster_Life_RPG_Master_Development_Plan_Rebalanced_V8_Expanded.docx`
- Canonical skill content: workbook v2.1 ตาม `CONTENT_PROVENANCE` ใน `content-provenance.mjs`; `SK_FIRE_01` ต้อง resolve จาก `skill-catalog.mjs` เท่านั้น
- **Codex Gate G0-A ตัดสินแล้ว:** ใช้ Manual Skill `s1–s4` เป็น active combat slots ทั้งสี่ช่อง เพราะ base ปัจจุบันมี `skill4Btn`, `dispatchSkill(3)`, canonical loadout และ V8.8 HUD/Uses/Cooldown acceptance อยู่แล้ว การย้อน `s4` เป็น reserve จะขัดกับ owner request และ production baseline ล่าสุด

ลำดับ authority สำหรับงานนี้คือ: คำสั่งเจ้าของงานล่าสุด → คำตัดสิน G0 ที่บันทึกโดย Codex → Ring 0/Ring 1 → canonical workbook/catalog → implementation ปัจจุบัน

## Implementation Record — 2026-08-23

- เพิ่ม `SKILL_ITEM_CATALOG.emberFruit → SK_FIRE_01` และแยกเส้นทาง Skill Item ออกจาก `resolveFeed()`
- เพิ่ม pure copy-on-write transaction ใน `skill-items.mjs`: validate → candidate → local persist → publish พร้อม command replay ledger 64 รายการ
- replace สล็อต S1–S4 โดยตั้งสกิลเดิมเป็น `slot: null`; ไม่ลบ record และไม่เปลี่ยน Mastery, Uses, mutation, Body หรือ Mind
- เพิ่ม provenance `sourceKind`, `sourceItemId`, `learnedAt`, save schema/instance version 14, migration idempotency และ diagnostics
- เชื่อม Character Manager Skills tab, selector S1–S4, confirmation dialog, stale-slot guard, local-save rollback และ cloud-save follow-up
- เชื่อม runtime ผ่าน manual loadout เดิม; regression พิสูจน์ว่า Ember ที่เรียนลง S4 กดใช้ได้และ Uses ลด 28 → 27 โดยไม่กินไอเทมซ้ำ
- Targeted suite `npm run test:v82:skill-items`: PASS; transaction mutants 7/7 killed
- `npm run ci`: PASS หลัง balance audit แก้ compatibility เป็น Fire/Normal Lv.5+ เพื่อให้มี live recipient ที่ยังไม่รู้ Ember
- `npm run manifest`: PASS; เก็บ SHA จาก final command output แยกจากไฟล์นี้เพื่อไม่ให้เอกสารเปลี่ยน hash ของตัวเอง
- `cmp -s index.html v800.html`: PASS; `git diff --check`: PASS
- Browser/mobile visual smoke ยังไม่ได้รันใน Termux เพราะ environment นี้ไม่มี browser harness; ห้ามตีความ automated DOM/CSS contracts ว่าเป็น visual sign-off

## สรุปแนวคิด

ไอเทมประเภท Skill Item ทำหน้าที่เป็นสื่อเรียนรู้สกิล ไม่ใช่อาหารเพิ่ม Hunger, Bond, Mood หรือ Training

ตัวอย่าง:

```text
ผลไฟ (emberFruit)
  → สอนสกิล SK_FIRE_01
  → มอนสเตอร์เรียนรู้ Ember
  → ติดตั้งในสล็อต s1–s4
  → runtime combat resolve ด้วย canonical skillId
```

การใช้ไอเทมต้องเป็น transaction เดียว โดย local persistence เป็น commit boundary:

```text
validate แบบ read-only
→ สร้าง candidate state ที่เรียน/ติดตั้งสกิลและลดไอเทม 1 ชิ้น
→ บันทึก candidate state สำเร็จ
→ publish candidate เป็น live state
```

ถ้าตรวจสอบหรือบันทึกไม่ผ่าน ห้ามลดจำนวนไอเทมและห้ามแก้ข้อมูลมอนสเตอร์ใน live state

## Baseline Gap ก่อน implementation

รายการต่อไปนี้คือ gap ที่ตรวจพบตอนเริ่มวางแผน; Implementation Record ด้านบนเป็นสถานะล่าสุดที่ปิด gap แล้ว:

- `content-catalog.mjs`
  - `FOOD_CATALOG.emberFruit` มีอยู่แล้วในหมวด `skill`
  - แต่ `effects` ว่าง และยังไม่มี `grantsSkillId`
- `save-schema.mjs`
  - inventory รองรับจำนวน `emberFruit`
  - `inventory.stash` ปัจจุบันใช้กับ equipment เป็นหลัก
- `monster-instance.mjs`
  - `instance.skills` ถูกบันทึกถาวร
  - `normalizeOwnedSkillRecord()` รองรับ `skillId`, `slot`, mastery และ `currentUses`
- `skill-progression.mjs`
  - มี `learnSkill()`
  - มี `equipSkill()`
  - Manual Skill มี 4 สล็อต: `s1`, `s2`, `s3`, `s4`
  - เรียนสกิลแบบไม่ติดสล็อตได้ด้วย `slot: null`
  - `equipSkill()` ปัจจุบัน reject สล็อตที่ถูกใช้อยู่ด้วย `duplicate_slot`; ยังไม่มี replace transaction ที่ถอดของเดิมเป็น `slot: null`
- `game-v800.js`
  - `feedMonster()` ลดจำนวนอาหารและเรียก `resolveFeed()`
  - ยังไม่มี flow ที่เปลี่ยน Skill Item เป็นการเรียนสกิล
  - `getMonsterSkills()` ยัง resolve จาก species skills และ `SKILL_CANDIDATES` เป็นหลัก
  - `SKILL_CATALOG` ใช้ canonical IDs เช่น `SK_FIRE_01` แต่ runtime combat ยังต้องมี adapter
  - action binding ปัจจุบันมีปุ่ม `skill1Btn` ถึง `skill3Btn` ขณะที่ data contract รองรับสล็อต Manual 4 ช่อง
  - Skill Loadout ใน Character Manager ยังอ่านจาก array position/display name และแสดงเพียง Basic AI + S1–S3

## เป้าหมาย

1. ผู้เล่นใช้ Skill Item กับมอนสเตอร์ที่เลือกได้
2. ไอเทมแต่ละชนิดผูกกับ canonical `skillId` เดียวอย่างชัดเจน
3. มอนสเตอร์เรียนรู้สกิลถาวรและบันทึกข้ามการ reload ได้
4. ผู้เล่นเลือกสล็อต `s1–s4` ได้เอง
5. สล็อตเต็มสามารถแทนที่สกิลเดิมได้โดยไม่ลบสกิลเดิมออกจากคลังที่เรียนรู้แล้ว
6. สกิลที่เรียนจากไอเทมต้องปรากฏใน UI และใช้ใน combat ได้จริง
7. การใช้ Skill Item ไม่เปลี่ยนสถานะ Body/Mind โดยไม่ตั้งใจ
8. การใช้ซ้ำ, item ไม่พอ, สกิลซ้ำ, compatibility ไม่ผ่าน หรือ persistence ล้มเหลว ต้องไม่เสียไอเทม
9. double tap/callback ซ้ำด้วย command เดียวต้อง commit ได้ไม่เกินหนึ่งครั้ง

## ไม่อยู่ในขอบเขต

- ไม่เพิ่มค่าสเตตัสถาวรโดยตรง
- ไม่แก้ Gene, Training, Personality หรือ Evolution
- ไม่ทำให้ Skill Item เป็นอาหารปกติ
- ไม่ auto-grant สกิลจาก level หรือ evolution
- ไม่ลบสกิลเดิมถาวรเมื่อเปลี่ยนสล็อต
- ไม่เพิ่มระบบ mutation ใหม่ในงานนี้
- ไม่เปลี่ยน combat formula นอกจาก adapter ที่ทำให้สกิล canonical ใช้งานได้
- ไม่ใช้ชื่อสกิลภาษาอังกฤษเป็น identity หลักแทน `skillId`
- ไม่เปิดให้ Skill Item สอนสกิลที่ canonical runtime ยัง execute ไม่ได้
- ไม่ย้อน `s4` ออกจาก active combat contract ที่ G0-A อนุมัติ

## Data Contract

### Skill Item Catalog

เพิ่ม catalog แยกจาก food effect เพื่อไม่ให้ flow การกินอาหารปนกับการเรียนสกิล:

```js
export const SKILL_ITEM_CATALOG = Object.freeze({
  emberFruit: Object.freeze({
    id: 'emberFruit',
    category: 'skillItem',
    name: 'ผลเพลิง',
    grantsSkillId: 'SK_FIRE_01',
    compatibility: Object.freeze({
      allowedTypes: Object.freeze(['Fire', 'Normal']),
      minLevel: 5,
    }),
    consumeOn: 'success',
    rarity: 'Common',
    catalogVersion: 1,
  }),
});
```

กฎของ catalog:

- `id` ต้องไม่ซ้ำกับ item อื่น
- `grantsSkillId` ต้อง resolve ได้จาก `skillCatalogEntry()`
- canonical definition ต้องผ่าน `CONTENT_PROVENANCE` เดียวกับ `skill-catalog.mjs`; ห้ามสร้าง skill definition ซ้ำใน item catalog
- `category` ต้องเป็น `skillItem`
- `consumeOn` ต้องเป็น `success`
- `allowedTypes: []` หมายถึง universal เฉพาะเมื่อกำหนดอย่างชัดเจน
- Skill Item รุ่นแรกควรเป็น type-bound เพื่อคุมสมดุล
- ไอเทม universal ให้เพิ่มเป็น tier/rarity สูงในงานแยก

### Owned Skill Record

หลังใช้สำเร็จ record ต้องมีรูปแบบที่ระบบเดิมอ่านได้:

```js
{
  skillId: 'SK_FIRE_01',
  slot: 's4',
  masteryExp: 0,
  masteryRank: 'novice',
  mutationId: null,
  currentUses: 28,
  sourceKind: 'skillItem',
  sourceItemId: 'emberFruit',
  learnedAt: 1787443200000
}
```

ข้อกำหนด:

- `skillId` เป็น identity หลัก
- `slot` เป็น `null` หรือหนึ่งใน `s1–s4`
- เริ่ม mastery ที่ `novice`
- `currentUses` เริ่มจาก `skillCatalogEntry(skillId).maxUses`
- `sourceKind`, `sourceItemId`, `learnedAt` คือ acquisition provenance; ใช้แสดงประวัติ/debug แต่ไม่ใช้เป็น combat identity
- content provenance เต็ม (workbook version/hash) อยู่ที่ catalog กลาง ไม่คัดลอกซ้ำลงทุก owned record
- legacy skill ที่ไม่มี provenance ต้องคงข้อมูลเดิมและตั้ง `sourceKind: 'legacy'` หรือปล่อย `null` ตาม migration decision; ห้ามเดาว่าได้มาจาก `emberFruit`
- ห้ามสร้าง `instanceId`, cooldown หรือ runtime transient field ใน save

## กฎการเรียนและติดตั้ง

### กรณีมีสล็อตว่าง

ผู้เล่นเลือกสล็อตว่าง แล้วระบบ:

1. ตรวจ item
2. ตรวจ skill definition
3. ตรวจ content provenance และ runtime support
4. ตรวจ compatibility
5. ตรวจว่ายังไม่เคยเรียนสกิลนี้
6. สร้าง owned skill record ใน candidate state
7. ติดตั้งลงสล็อตที่เลือกใน candidate state
8. ลดจำนวน item 1 ใน candidate state
9. persist candidate สำเร็จก่อน publish live state

### กรณีสล็อตเต็ม

แสดงคำยืนยันก่อนแทนที่:

```text
สล็อตเต็ม
ต้องการถอด Ember เก็บไว้ในคลังสกิล แล้วติดตั้ง SK_FIRE_01 หรือไม่
```

เมื่อยืนยัน:

- สกิลเดิมเปลี่ยน `slot` เป็น `null`
- สกิลใหม่ติดตั้งในสล็อตที่เลือก
- สกิลเดิมยังอยู่ใน `instance.skills`
- ลด item เพียง 1 ชิ้น
- command ต้องแนบ `expectedOccupantSkillId`; ถ้าหน้าจอเก่าและ occupant เปลี่ยนแล้ว ให้ reject ด้วย `stale_slot` โดยไม่ mutate

### กรณีสกิลซ้ำ

```text
เรียนไม่สำเร็จ: มอนสเตอร์มีสกิลนี้แล้ว
```

ผลลัพธ์:

- ไม่ลด item
- ไม่เปลี่ยนสล็อต
- ไม่สร้าง duplicate skill record

### Basic AI และ System Slots

Skill Item ห้ามเขียนทับ:

- `basicAI`
- `passive`
- `evolutionTrait`

Skill Item ใช้ได้เฉพาะ `s1–s4`

## Pure Resolver API

สร้าง module แยกจาก DOM และ combat เช่น `skill-items.mjs`:

```js
export function resolveSkillItemUse({
  state,
  monsterId,
  itemId,
  slot,
  expectedOccupantSkillId,
  commandId,
  now,
} = {}) {
  // read-only validation; returns an immutable operation plan
}

export function applySkillItemUse({
  state,
  operation,
} = {}) {
  // pure copy-on-write; returns nextState and never mutates state
}
```

Controller เป็นผู้ทำ persistence transaction:

```js
const planned = resolveSkillItemUse(command);
if (!planned.ok) return planned;

const applied = applySkillItemUse({ state, operation: planned.operation });
const persisted = persistCandidateState(applied.nextState); // may throw
state = applied.nextState; // publish only after local save succeeds
return { ok: true, commandId: planned.operation.commandId, persisted };
```

ข้อกำหนด transaction:

- `resolveSkillItemUse()` และ `applySkillItemUse()` ห้ามแก้ input
- `commandId` ป้องกัน double tap/callback ซ้ำ; command เดิมต้องไม่หัก item ซ้ำ
- ปิดปุ่มยืนยันระหว่าง commit แต่ UI lock ไม่ใช่ idempotency guard หลัก
- ถ้า local persistence โยน exception ให้คืน `persistence_failed`, live state และ inventory ต้อง byte/deep-equal ก่อนกด
- backup/current save ต้องไม่เหลือ state กึ่งกลางที่ item ลดแต่ skill ยังไม่ถูกเพิ่ม หรือกลับกัน
- cloud save เป็น post-local-commit sync; ถ้า cloud ล้มเหลวให้ queue/retry และแจ้งสถานะ sync โดยไม่รายงานว่า local use ล้มเหลว

ผลลัพธ์ควรมี reason code ที่ทดสอบได้:

```js
{
  ok: false,
  reason: 'duplicate_skill'
}
```

reason code ขั้นต่ำ:

- `invalid_state`
- `invalid_command_id`
- `duplicate_command`
- `item_not_found`
- `item_empty`
- `skill_not_found`
- `catalog_provenance_invalid`
- `runtime_skill_unsupported`
- `invalid_slot`
- `incompatible_type`
- `level_required`
- `already_learned`
- `slot_locked`
- `duplicate_slot`
- `confirmation_required`
- `stale_slot`
- `persistence_failed`

ห้ามใช้ข้อความ UI เป็น logic condition

## Runtime Combat Adapter

นี่เป็น acceptance gate สำคัญที่สุด เพราะการเพิ่ม record อย่างเดียวไม่ทำให้สกิลใช้ในสนามได้

ต้องเพิ่ม resolver กลางที่เปลี่ยน canonical skill เป็น runtime move โดยไม่ผ่าน display name:

```js
resolveRuntimeSkill({ skillId, ownedSkill, instance }) → runtimeMove | null
resolveRuntimeLoadout(instance) → {
  basicAI,
  manual: { s1, s2, s3, s4 },
  passive,
  evolutionTrait
}
```

ลำดับการ resolve:

1. อ่าน `manualSkillLoadout(instance)` เพื่อคง identity ตาม slot จริง
2. resolve ด้วย `skillCatalogEntry(skillId)`
3. แปลง `runtimeType`, `power`, `accuracy`, `maxUses`, `cooldownSec`, `targetType`, effect/status และ application mode เป็น runtime command contract
4. ใช้ `mutationId`, mastery, `currentUses` และ status/effect resolver ผ่านระบบเดิม
5. คืน object keyed by `s1–s4`; ห้ามพึ่ง array index หรือชื่อแสดงผล
6. ถ้า adapter ของ `SK_FIRE_01`/Burn ยังไม่ครบ ให้ reject การใช้ item ก่อน consume ด้วย `runtime_skill_unsupported`

ห้ามใช้ชื่อแสดงผล เช่น `Ember` หรือ `Flame Bite` เป็น identity หลัก เพราะชื่ออาจซ้ำหรือเปลี่ยนภาษาได้

ต้องแก้ความไม่ตรงกันระหว่าง:

- data contract ที่รองรับ Manual Skill 4 สล็อต
- combat action UI ปัจจุบันที่ bind ปุ่มสกิล 3 ปุ่ม

**Codex Gate G0 พิจารณาสอง contract และบันทึกผลแล้ว:**

- `G0-A — Active 4`: เพิ่ม `skill4Btn`, input/touch isolation, cooldown/Uses/disabled state และ regression ให้ครบ 4 ปุ่ม; ต้องบันทึกว่า owner directive นี้แก้ Ring 0 จาก Manual Skill 1–3 เป็น 1–4
- `G0-B — Reserve 4`: `s1–s3` เป็น combat commands ตาม Ring 0 เดิม, `s4` เป็น reserve; Character Manager ต้องสลับ `s4` เข้า active slot ได้โดยไม่ใช้ item เพิ่มและไม่สูญเสีย mastery/provenance

Verdict: **G0-A — Active 4** ตาม owner directive และ base V8.8 ที่มี active S4 อยู่ก่อนงานนี้; G0-B ถูกปฏิเสธเพราะจะทำให้ behavior ถอยหลังและขัดกับ acceptance ปัจจุบัน

## UI Flow

เพิ่มส่วน `Skill Item / แต่งสกิล` ใน Character Manager:

### Skill Item List

แสดง:

- ชื่อไอเทม
- จำนวนคงเหลือ
- สกิลที่จะเรียน
- ธาตุ
- tier/rarity
- เงื่อนไขการใช้
- ปุ่ม `ใช้กับมอนสเตอร์`

### Monster Target

แสดงเฉพาะมอนสเตอร์ที่:

- อยู่ใน collection
- แก้ไขได้ตาม `assertCharacterMutable()`
- ผ่าน compatibility ของ item

### Slot Picker

แสดงสล็อตทั้ง 4:

- สล็อตว่าง: `ติดตั้ง`
- สล็อตมีสกิล: `แทนที่`
- Basic AI/System slot: disabled
- S4 ต้องมี badge `Active` หรือ `Reserve` ตามคำตัดสิน G0

### Confirmation

ต้องแสดงให้เห็นทั้งสองรายการ:

```text
มอนสเตอร์: Normalooze Lv.5+
ไอเทม: ผลเพลิง ×1
สกิลใหม่: Ember
สล็อต: S4
ผลกระทบ: ใช้ไอเทม 1 ชิ้น / เริ่ม Mastery ระดับเริ่มต้น
```

ถ้าเป็นการแทนที่ ต้องแสดงชื่อสกิลเดิมอย่างชัดเจน และยืนยันว่า “ถอดไปเก็บในคลังสกิล ไม่ได้ลบ”

### Success State

หลังสำเร็จ:

- skill card แสดงสกิลใหม่
- slot แสดงตำแหน่งใหม่
- inventory count ลดลง
- แสดงข้อความสำเร็จ
- refresh manager/party/combat presentation
- แสดง success หลัง local save commit แล้วเท่านั้น
- ถ้า cloud sync ค้าง ให้แสดงสถานะ sync แยกจากผล transaction

## Balance Rules

- รุ่นแรกล็อก `emberFruit → SK_FIRE_01` เท่านั้น เพื่อลด blast radius
- `emberFruit` ใช้ได้กับมอนที่ Primary/Secondary Type เป็น `Fire`; Type Affinity อย่างเดียวยังไม่ bypass compatibility ในรุ่นแรก
- สกิลเริ่มต้นที่ `novice` เสมอ
- ไม่เพิ่ม Skill EXP ฟรีจากการกิน
- `currentUses` เริ่มตาม catalog
- ห้ามใช้ item ซ้ำเพื่อเติม Uses
- ห้ามเรียนสกิลเดิมซ้ำเพื่อเพิ่ม mastery
- สกิลระดับ Ultimate/Epic ไม่ควรอยู่ใน item ทั่วไป
- Universal Skill Item ควรเป็น rare item ที่มีจำนวนจำกัด
- การแทนที่สล็อตไม่ควรทำลาย mastery ของสกิลเก่า
- Item rarity ไม่เปลี่ยน power/cooldown ของ canonical skill; balance อ่านจาก `skillCatalogEntry()` แห่งเดียว
- ห้ามใช้ item กับ Skill `Ultimate/Epic` จนมี owner-approved economy/drop contract แยก

## Phases

### Phase 0 — Codex Contract Gate

**สิ่งที่ต้องตัดสินและบันทึก:**

- G0 verdict สำหรับ `s4`: `Active 4` หรือ `Reserve 4`
- exact base SHA/branch และยืนยันว่าไม่มี source owner อื่นถือ lock บนไฟล์ทับซ้อน
- exact source/test allowlist ต่อ phase
- transaction commit boundary และ policy เมื่อ local/cloud persistence ล้มเหลว
- ยืนยัน compatibility รุ่นแรก: Fire primary/secondary เท่านั้น

**Exit:** Codex ส่ง `OPEN Phase 1` พร้อม G0 verdict; เอกสารแผนนี้อย่างเดียวไม่ถือเป็น OPEN

### Phase 1 — Catalog และ Contract

**ไฟล์หลัก:**

- `content-catalog.mjs`
- `skill-items.mjs` (ไฟล์ใหม่)

**สิ่งที่ต้องทำ:**

- เพิ่ม `SKILL_ITEM_CATALOG`
- ย้ายความหมาย `emberFruit` จาก food-only ให้เป็น Skill Item โดยไม่ให้ food effect ถูกเรียก
- เพิ่ม lookup ด้วย item ID
- เพิ่ม pure validation result และ reason codes
- ตรวจ canonical `grantsSkillId`
- validate mapping กับ `CONTENT_PROVENANCE`
- เพิ่ม runtime-support preflight สำหรับ `SK_FIRE_01`

**Test:**

- catalog item resolve ได้
- unknown item reject
- unknown skill reject
- invalid provenance/runtime support reject ก่อน consume
- item definition ถูก freeze/ไม่ถูกแก้ระหว่าง runtime

### Phase 2 — Learn/Equip Transaction

**ไฟล์หลัก:**

- `skill-items.mjs`
- `skill-progression.mjs`
- `monster-instance.mjs` ถ้าต้อง normalize provenance เพิ่ม

**สิ่งที่ต้องทำ:**

- เพิ่มการเรียนสกิลจาก item
- รองรับสล็อตว่าง
- รองรับ replace โดยเก็บสกิลเก่าไว้แบบ `slot: null`
- ป้องกัน duplicate
- ป้องกันการเขียน Basic AI/System slot
- ใช้ copy-on-write candidate state; ไม่ mutate live input
- persist candidate ก่อน publish live state
- ป้องกัน duplicate `commandId` และ stale replace confirmation
- ลด inventory ใน candidate หลัง validation ครบเท่านั้น
- บันทึก acquisition provenance

**Test:**

- success consumes exactly one item
- reject does not mutate instance or inventory
- persistence failure does not mutate live instance or inventory
- duplicate command consumes at most once
- duplicate rejected
- incompatible type rejected
- full slot replacement preserves previous skill
- stale replacement preview rejected
- four manual slots remain valid

### Phase 3 — Save/Migration

**ไฟล์หลัก:**

- `monster-instance.mjs`
- `save-schema.mjs`
- `tests/v82-skill-items.mjs`

**สิ่งที่ต้องทำ:**

- ตรวจว่า `sourceKind`, `sourceItemId`, `learnedAt` และ slot ถูก persistence
- reload แล้ว skill ownership เหมือนเดิม
- migration idempotent
- currentUses ไม่ถูก reset ระหว่าง save/load
- ไม่บันทึก cooldown transient
- legacy skills ต้องไม่ถูกแต่ง provenance ปลอม
- corrupted duplicate skill/slot ต้องใช้ policy fail-closed + diagnostic ที่ชัด ไม่ซ่อมเงียบจนสกิลหาย

**Test:**

- save → normalize → load คงข้อมูลเดิม
- migrate ซ้ำแล้วผลลัพธ์เท่าเดิม
- legacy save คง skill/mastery/Uses และ owner-state เดิม
- corrupted duplicate slot/skill ถูก reject หรือ diagnose ตาม policy ที่ Codex อนุมัติ
- simulated storage exception พิสูจน์ว่า live state และ item count ไม่เปลี่ยน

### Phase 4 — Combat Runtime Bridge

**ไฟล์หลัก:**

- `game-v800.js`
- skill runtime adapter ตาม pattern ที่มีอยู่
- `tests/v82-skill-items-runtime.mjs`

**สิ่งที่ต้องทำ:**

- resolve canonical skill IDs เป็น runtime moves keyed by slot
- ใช้ `manualSkillLoadout()` แทน array position/display-name matching
- ต่อ mastery/currentUses/cooldown เข้าระบบใช้สกิลเดิม
- implement `s4` ตาม verdict G0 เท่านั้น
- ไม่ทำลาย species default skill และ Basic AI

**Test:**

- item-granted skill ปรากฏใน combat presentation
- สกิลใน active command slot กดใช้ได้จริง
- currentUses ลดครั้งเดียวต่อ cast
- mastery EXP เพิ่มจากการใช้จริง
- cooldown ยังทำงาน
- reload แล้ว skill ยังใช้ได้
- Basic AI ยังถูก AI ใช้และไม่ถูก manual command แทนที่
- `s4` ผ่าน test แบบ active หรือ reserve ตาม G0 โดยไม่มี dead slot

### Phase 5 — Character Manager UI

**ไฟล์หลัก:**

- `v800.html`
- `style-v800.css`
- `game-v800.js`
- `tests/v82-character-ui-skill-items.mjs`

**สิ่งที่ต้องทำ:**

- รายการ Skill Item
- เลือก target monster
- preview skill
- slot picker 4 ช่อง
- replace confirmation
- success/error feedback
- responsive mobile layout ตาม UI contract เดิม
- เอา `emberFruit` ออกจาก food action path เพื่อไม่เรียก `resolveFeed()`
- ถ้าแก้ HTML ต้องแก้/sync `index.html` และ `v800.html` ให้เหมือนกันทุกไบต์

**Test:**

- ใช้ผ่าน UI สำเร็จ
- ปิด confirmation แล้วไม่มี mutation
- target ไม่ compatible ถูก disable/reject
- document ไม่มี horizontal overflow ใน viewport ที่รองรับ
- inventory, skill card และ combat presentation refresh ถูกต้อง
- double tap confirmation ไม่ consume ซ้ำ
- S4 label/behavior ตรง G0 verdict

### Phase 6 — Full Regression และ Smoke

**คำสั่งขั้นต่ำ:**

```bash
node tests/v82-skill-items.mjs
node tests/v82-skill-items-mutants.mjs
node tests/v82-skill-items-runtime.mjs
node tests/v82-character-ui-skill-items.mjs
npm run check
npm run ci
npm run manifest
cmp -s index.html v800.html
git diff --check
```

ถ้า browser harness ใช้ไม่ได้ ให้รายงานเป็น coverage limitation และห้ามอ้าง visual pass

## Files to Change

| ไฟล์ | ขอบเขต |
|---|---|
| `content-catalog.mjs` | Skill Item Catalog และ `emberFruit` mapping |
| `skill-items.mjs` | pure resolver และ transaction ใหม่ |
| `skill-progression.mjs` | ใช้ API เรียน/ติดตั้งเดิมหรือเพิ่ม helper ที่จำเป็น |
| `monster-instance.mjs` | normalize/persist provenance หากจำเป็น |
| `save-schema.mjs` | migration/schema เฉพาะเมื่อ contract ต้องเปลี่ยน |
| `game-v800.js` | wiring inventory, manager, runtime combat |
| `index.html`, `v800.html` | UI controls; ต้องคง byte parity |
| `style-v800.css` | Skill Item panel และ responsive layout |
| `tests/v82-skill-items.mjs` | pure contract/mutation/save tests |
| `tests/v82-skill-items-mutants.mjs` | mutation proof สำหรับ consume-on-success, idempotency และ rollback guards |
| `tests/v82-skill-items-runtime.mjs` | runtime cast/use tests |
| `tests/v82-character-ui-skill-items.mjs` | UI contract tests |
| `package.json` | เพิ่ม test script เฉพาะถ้าจำเป็น |

## Acceptance Gates

1. `emberFruit` resolve ไปยัง canonical `SK_FIRE_01` ได้
2. ใช้ item สำเร็จแล้ว item ลด 1 และ monster ได้ skill 1 record
3. validation หรือ local persistence ไม่สำเร็จแล้ว item และ live monster state ไม่เปลี่ยน
4. สกิลใหม่ติดตั้งในหนึ่งสล็อต `s1–s4` ได้
5. สล็อตเต็มแทนที่ได้โดยสกิลเดิมยังอยู่ใน `instance.skills`
6. ไม่เขียนทับ Basic AI, passive หรือ evolution trait
7. save/reload คง skill, slot, mastery, Uses และ acquisition provenance; migration ซ้ำได้ผลเดิม
8. สกิลใหม่แสดงใน Character Manager
9. สกิลใหม่ปรากฏและกดใช้ใน active combat slot ได้จริง; `s4` ทำงานตาม G0 โดยไม่มี dead slot
10. combat ใช้ canonical `skillId` ไม่ใช้ชื่อแสดงผลเป็น identity
11. การกิน Skill Item ไม่เปลี่ยน Hunger/Bond/Mood/Training โดยไม่ได้กำหนด
12. double tap/duplicate callback/duplicate command ลด item ได้ไม่เกิน 1
13. corrupted/legacy saves ไม่ทำให้ skill หรือ item หายเงียบ และมี diagnostic ตาม policy
14. `npm run ci` และ targeted tests ผ่าน
15. `cmp -s index.html v800.html`, `npm run manifest` และ `git diff --check` ผ่าน
16. ไม่มี source edit นอก exact allowlist ที่ Codex เปิด

## Ownership Gate

ผู้ใช้เปิด implementation โดยตรงด้วยคำสั่งให้ทำตามแผนให้ครบ; การแก้ไขชุดนี้จึงดำเนินการใน lane ของ Codex ตาม ownership ที่กำหนด

ตาม ownership ปัจจุบันของ PocketMonster:

- **Codex เป็น sole implementation/review/integration owner** จนกว่าจะมีคำสั่งผู้ใช้เปลี่ยน ownership อย่างชัดเจน
- OMP, Hermes และ Kimi อยู่ใน advisory/operations/read-only lane เท่านั้น ห้ามแก้ source, commit, push, PR, merge, deploy หรือ restart สำหรับงานนี้โดยไม่มี exact delegation จากผู้ใช้/Codex
- ไฟล์แผนนี้บันทึก scope/evidence แต่ไม่โอน owner lock ให้เอเจนต์อื่น
- ก่อนเริ่มแต่ละ phase Codex ต้องตรวจ fresh base SHA, worktree cleanliness, branch/PR overlap และออก exact allowlist + tests
- ห้ามทำงานบน branch ที่มี scope อื่นปะปน; implementation ใช้หนึ่งงาน/หนึ่ง branch/หนึ่ง complete commit/หนึ่ง PR
- G0-A ถูกบันทึกแล้ว: `s4` เป็น active combat slot ช่องที่ 4 ตาม base/runtime acceptance ล่าสุด
- หลัง implement ต้องมี evidence: RED/GREEN focused tests, failure-path/mutation evidence สำหรับ resource/idempotency guards, full CI, HTML parity, diff check และ browser/mobile smoke ตามที่สภาพแวดล้อมรองรับ
- Codex ห้ามประกาศ acceptance หาก browser/mobile smoke ถูกข้ามโดยไม่ระบุ coverage limitation

## Definition of Done

ระบบจะถือว่าเสร็จเมื่อผู้เล่นสามารถทำ flow นี้ได้ครบตั้งแต่ต้นจนจบ:

```text
ได้รับ emberFruit
→ เลือก Normalooze Lv.5+
→ เลือกใช้ผลเพลิง
→ เลือกสล็อต S4
→ ยืนยัน
→ item ลด 1
→ Ember แสดงใน S4
→ เข้า combat
→ กด S4 ใช้ Ember ได้ตาม G0-A
→ Uses/Mastery เปลี่ยนตามการใช้
→ reload เกม
→ Ember และความคืบหน้ายังอยู่
```

ก่อนและหลัง flow ต้องพิสูจน์ failure path อย่างน้อย: item หมด, มอนผิดธาตุ, skill ซ้ำ, ยกเลิก replace, stale slot, double tap และ local save failure — ทุกกรณีต้องไม่ทำ item/skill/mastery/provenance สูญหาย

หากทำได้เพียงเพิ่มข้อมูลใน `instance.skills` แต่กดใช้ใน combat ไม่ได้ หรือ `s4` ไม่มี behavior ที่ G0 อนุมัติ ให้ถือว่ายังไม่ผ่าน Definition of Done
