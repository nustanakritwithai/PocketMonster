# Character Art Direction — Blocky Bighead

## 1. Design Intent

ปรับตัวละครมนุษย์ของ Monster Life RPG ให้เป็นสไตล์ **Bighead หัวเหลี่ยม** ที่เป็นงานต้นฉบับของเกม: อ่านง่ายบนมือถือ ดูเป็นมิตร จำ silhouette ได้เร็ว และเข้ากับโลก 3D สีสด

ขอบเขตแรก:

- Player Character
- Monster Keeper NPC
- NPC มนุษย์ในอนาคตใช้ proportion system เดียวกัน

ไม่เปลี่ยนมอนสเตอร์ในรอบนี้ เพราะ Visual Lock ยังกำหนด Lv.1 Transparent Elemental Slime → Lv.2 Animal Form และ silhouette identity แยกตาม 18 ธาตุ

## 2. Shape Language

- หัวทรงสี่เหลี่ยม/กล่อง มุมมนเพียงเล็กน้อย ไม่เป็นทรงกลม
- หัวใหญ่ประมาณ 38–42% ของความสูงตัวละครทั้งหมด
- ความกว้างหัวประมาณ 1.35–1.5 เท่าของช่วงไหล่
- ลำตัวสั้นและเป็นทรงกล่องอ่านง่าย
- แขนขาสั้น หนาพอให้เห็น animation บนจอมือถือ
- มือ/รองเท้าใหญ่กว่าความจริงเล็กน้อยเพื่อให้ Throw/Run pose อ่านออก
- รักษา overall world height และ root origin เดิม เพื่อลดผลต่อกล้องและ gameplay

ชื่อภายในของ visual direction: `Blocky Bighead`

Production target สำหรับ graybox คือ **ตัวเลือก B: หัว 40%** (`0.64 × 0.72 × 0.56`, จุดกึ่งกลาง `y = 1.44`, ยอดหัว `y = 1.80`) รายละเอียดตัวเลข, rig hierarchy, performance budget และ test matrix อยู่ใน `BIGHEAD_PRODUCTION_BLUEPRINT_TH.md` ซึ่งเป็น contract หลักเมื่อเปิด character implementation

Surface style ล็อกเป็น `four-side-block-v1`: ตัวกล่องมี Front/Right/Back/Left ให้ใส่ภาพตกแต่งเองผ่าน Asset Lab ส่วน Top/Bottom ใช้สีหรือภาพเสริม รายละเอียด authoritative อยู่ใน `FOUR_SIDE_ASSET_STYLE_LOCK_TH.md`

วิธีนำเข้าเกมล็อกเป็น engine-first: อ่าน `BIGHEAD_ASSET_ENGINE_WORK_ORDER_TH.md` เป็น architecture authority ห้ามทำ Bighead เป็น direct patch เฉพาะกิจใน gameplay monolith

## 3. Player Silhouette

- หัวเหลี่ยม + ปอยผมด้านหน้าแบบชิ้นทรงกล่อง
- Backpack เป็น silhouette anchor ด้านหลัง
- ขวามือ/อุปกรณ์ปาบอลต้องมองเห็นใน Throw pose
- เสื้อสีเข้มตัดกับผิวและฉากหญ้า
- ใบหน้าใช้ตา/คิ้วทรงสี่เหลี่ยมเรียบง่าย อ่านได้ที่ระยะกลาง

## 4. Keeper Silhouette

- ใช้ proportion เดียวกับ Player เพื่อคง art family
- หมวกมีปีกกว้างกว่าหัวและไม่จมหรือ clip กับกล่องศีรษะ
- Apron + staff เป็น silhouette anchors แยกจาก Player
- สีเขียว/เหลืองใช้ร่วมกับรูปทรงและ accessory ไม่ใช้สีเป็นตัวแยกเพียงอย่างเดียว

## 5. Technical Geometry Direction

Graybox เริ่มจาก primitive ที่ cache/reuse ได้:

- Head: `BoxGeometry` หรือ bevelled low-poly box ที่เป็น shared geometry
- Face parts: box/plane เล็ก ติด offset ด้านหน้าเดียวกัน
- Hair/Hat: box/cylinder/cone แบบ low-poly
- Torso/Hips: box หรือ capsule สั้น
- Limbs: capsule/cylinder low-poly

ห้ามเพิ่ม texture ขนาดใหญ่หรือ unique geometry ต่อ instance ในรอบ graybox การใช้ material/geometry ต้องเข้ากับ shared immutable cache และ recursive disposal contract ที่มีอยู่

## 6. Orientation และ Rig Contract

- Forward-facing convention ต้องเหมือนตัวละครปัจจุบันและ `monsterLookYaw` convention ของโลก
- เก็บ root pivot ที่พื้นและรักษา world-role/userData ที่ระบบใช้
- แยก pivot: head, torso, hips, upper/lower arms, legs, accessory
- Head bob และ tilt ต้องเบาเพื่อไม่ให้เกิด motion noise บนมือถือ
- Throw/Summon/Recall/Hurt ต้องอ่านจาก silhouette แม้ปิด facial detail
- Staff/hat/backpack ต้องผูก rig โดยไม่สร้าง detached หรือ ghost mesh หลัง cleanup

## 7. Gameplay Non-goals

การเปลี่ยนสไตล์นี้ห้ามแก้:

- movement speed หรือ camera-relative movement
- collider, navigation footprint หรือ spawn validation
- camera target/offset/FOV
- combat/capture/summon/recall timing
- HP, damage, skill, AI หรือ save schema
- Party, Active Monster หรือ Ring 0/Ring 1 rules

presentation anchor เช่น throw/hitText/label ให้ Asset Engine คำนวณจาก rig/bounds โดยไม่เปลี่ยน gameplay root, resolver หรือ interaction กล่าวโดยสรุปคือ **ไม่มี collider/gameplay/save changes**

## 8. Production Phases

### AE0/AE1 — Engine Contract และ Legacy Adapter

- AssetHandle/catalog/ownership/anchor contracts และ testability
- wrap visual เดิมผ่าน engine โดยภาพและ behavior ยังเหมือน baseline
- ยังไม่ทำ Bighead

### FS1/FS2 — Four-Side Provider และ Asset Lab

- UV/atlas/cache ตาม `four-side-block-v1`
- deterministic import/preview/export และ diagnostics
- ยังไม่เปลี่ยนตัวละครในเกม

### BH0 — Proportion Sheet

- Front/side/back silhouette ของ Player และ Keeper
- เปรียบเทียบ head ratio 38%, 40%, 42%
- เลือกหนึ่ง proportion และล็อก bounding box
- ค่าเสนอให้ล็อกคือ B = 40%; ต้องมีภาพ A/B/C จากกล้องและ scale เดียวกันก่อน Codex verdict

### BH1 — Player Bighead Consumer

- spawn blocky bighead ผ่าน Asset Engine ห้าม direct replacement ใน gameplay
- ปรับ torso/arms/legs ให้เข้ากับ proportion
- ตรวจ Idle/Walk/Throw/Summon/Recall/Hurt

### BH2 — Keeper Bighead Consumer

- ใช้ rig/proportion base เดียวกัน
- ปรับ hat/apron/staff และ interaction readability
- ตรวจ NPC world label/button ไม่ถูกหัวใหญ่บัง

### BH3 — Four-Side Appearance Pass

- เพิ่ม face/detail, hair และภาพ Front/Right/Back/Left ผ่าน Asset Lab
- ปรับสี/roughness แยก Player/Keeper
- ตรวจ contrast ใน Hub, Grassland และ Cave

### BH4 — Animation/Performance/Device Polish

- ลด clipping ทุก pose
- ตรวจ shadow/quality tiers
- ตรวจ shared resource count และ disposal
- screenshot/device smoke ก่อนรับงาน

## 9. Acceptance Criteria

- ผู้ทดสอบแยก Player กับ Keeper ได้จาก silhouette โดยไม่อาศัยชื่อ
- หัวเป็นทรงเหลี่ยมชัดทั้ง front/side/back และไม่กลับไปดูเป็นทรงกลม
- Player/Keeper ยังมองไปและเดินไปทิศถูกต้อง
- Throw Capture, Throw Summon, Recall, Skill Pose และ Hurt อ่านออก
- หมวก/ผม/หน้า/backpack/staff ไม่ clip อย่างเห็นได้ชัดใน animation หลัก
- overall world height/root position ไม่ทำให้กล้องหรือ interaction distance เปลี่ยน
- ไม่มี collider/gameplay/save changes
- GPU resources ไม่เพิ่มแบบต่อ instance; cache/disposal tests ผ่าน
- ทดสอบ 844×390, 915×412 และ Android real device

## 10. Evidence Required

- before/after front/side/back screenshots
- proportion comparison 38/40/42%
- animation pose matrix: Idle/Walk/Throw/Summon/Recall/Hurt
- GPU geometry/material allocation comparison
- CI + scene cleanup regression
- real-device smoke พร้อมหมุนกล้องรอบ Player/Keeper
