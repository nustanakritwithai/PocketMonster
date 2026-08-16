# แผนงาน Asset มอนสเตอร์ — MN0–MN3

> สถานะ: **MN0 เปิดแล้ว** — สัญญา / แคตตาล็อก / เทส Node
> ภาพเกมยังเป็น `makeSpeciesMesh()` เท่าเดิม จนกว่าจะมีคำสั่ง `OPEN MN1`

ถ้าข้อความขัดกัน ให้ยึดลำดับนี้:

1. เอกสารนี้ — สถาปัตยกรรม เกต และลำดับ PR
2. สัญญาใน `asset-presentation/` ที่เทส MN0 ล็อกไว้
3. `ASSET-ENGINE-PLAN-V8.md` **ไม่ใช่ authority** ของงานนี้ ห้ามทำ loader/manifest/GLB ตามแผนนั้น

งาน Bighead ของ Player/Keeper คนละแกน ห้ามย้าย HP จับมอน เดิน collider กล้อง หรือ save เข้าเอนจิน

---

## 0. กติกาคงที่

- หนึ่งเฟส = หนึ่งสาขา = หนึ่ง PR
- เกมส่ง `AssetRequest` แล้วได้ `AssetHandle` เท่านั้น ห้ามค้น child mesh ตามชื่อ
- ห้ามแก้ `index.html` / `v800.html` ให้ต่างกันแม้หนึ่งไบต์
- ห้าม bump `ASSET_REVISION` ถ้าไม่ได้อัปเดตทั้งสอง HTML และ `tests/p0-save-identity.mjs`
- ห้ามเพิ่ม dependency / build step / `import 'three'`
- วงแหวน owned / elite / boss และสเกล Baby เป็น **ภาพ** ส่งผ่าน `marks` / `lifeStage` ไม่ส่ง HP/เลเวล/ยีน

คำสั่งเปิดเฟส:

| คำสั่ง | ความหมาย |
|---|---|
| `OPEN MN0` | สัญญา + `monster-core.json` — ยังไม่แตะภาพเกม |
| `OPEN MN1` | wrap `monsterMesh` ผ่าน handle — ภาพเท่า baseline |
| `OPEN MN2` | Asset Lab พรีวิวทุกฟอร์ม |
| `OPEN MN3` | ซิลูเอ็ต/ผิวเฉพาะสปีชีส์ ทีละตัว |

---

## 1. เป้าหมาย

หลัง MN1 มอนทุกตัวในโลก / Ranch / สนามรบ เกิดจาก `assets.spawn(monster.{species}.{form}.v1, { role })` โดยใช้เมช procedural เดิมเป็น fallback

หลัง MN3 เปลี่ยนหน้าตาได้ด้วย catalog/appearance โดยไม่แก้สูตรเกมใน `game-v800.js`

### นอกขอบเขตทั้งชุดนี้

- GLB ภายนอก, เสียง, ฟอนต์, ไอคอน UI, VFX texture
- ต้นไม้ หิน รั้ว ของตกแต่งโซน
- แก้สูตรดาเมจ จับมอน เทรน อีโวล ผสมพันธุ์
- ระบบแต่งตัวในเซฟเกม

---

## 2. ไอดีและบทบาท

รูปแบบไอดี: `monster.{speciesId}.{formKey}.v1`

| formKey | ความหมาย | ตัวอย่าง |
|---|---|---|
| `base` | สไลม์ยังไม่อีโวล (`makeSlimeMesh`) | `monster.flameling.base.v1` |
| `path.form` | ฟอร์มอีโวลใน `makeSpeciesMesh` | `monster.flameling.flameling.v1` |
| `flame_wolf` / `magma_bear` | ฟอร์ม Raising Profile | `monster.flameling.flame_wolf.v1` |

รวม 38 ฟอร์ม: 18 สปีชีส์ × (base + อีโวลแรก) + Flame Wolf + Magma Bear

บทบาทที่แคตตาล็อกรองรับ: `wild` `owned` `companion` `ranch` `battle`

provider ของมอน: `monster` (คนละคีย์กับ Bighead `procedural`)

จุดภาพที่ล็อกจากเกมปัจจุบัน (ใช้ตอน MN1 ไม่ให้ภาพกระโดด):

| จุด | ค่า |
|---|---|
| `hitText` ป่า | y+1.35 |
| `hitText` มอนที่เรียก | y+1.25 |
| `impact` | y+0.80 |
| `label` | y+2.15 / บอส y+2.55 |

---

## 3. ลำดับ PR

| ลำดับ | สาขาที่เสนอ | งาน |
|---|---|---|
| 1 | `cursor/mn0-monster-asset-contracts-f572` | สัญญา + แคตตาล็อก + เทส — **ห้ามต่อเกม** |
| 2 | MN1 | wrap `createWild` / summon / ranch ผ่าน handle |
| 3 | MN2 | Asset Lab พรีวิว 38 ฟอร์ม |
| 4 | MN3 | ผิวหรือเมชเฉพาะสปีชีส์ ทีละตัว |

---

## 4. เกต MN0

ผ่านเมื่อ:

1. `assets/catalog/monster-core.json` validate ได้ และมีครบทุก `mkSpecies` + ทุก `case` ใน `makeSpeciesMesh`
2. แคตตาล็อกไม่มีฟิลด์เกม (`hp` `atk` `capture` …)
3. `npm run ci` ทั้งชุดเดิมผ่าน
4. `game-v800.js` ยังเรียก `monsterMesh` / `makeSpeciesMesh` ตรง ๆ — ยังไม่มี `assets.spawn('monster.`
5. `index.html` === `v800.html`
