# Blocky Bighead — Production Blueprint

เอกสารนี้ขยาย `CHARACTER_STYLE_BIGHEAD_TH.md` จาก art direction สำหรับ Player และ Monster Keeper โดยยังไม่ใช่คำสั่งเปิดแก้ source

วิธี implementation ต้องยึด `BIGHEAD_ASSET_ENGINE_WORK_ORDER_TH.md` เป็น authority: Bighead เป็น consumer ของ Asset Engine และห้าม direct replacement ใน gameplay monolith หากข้อความด้านสถาปัตยกรรมขัดกันให้ work order ใหม่มีอำนาจเหนือกว่า

## 1. ข้อสรุปที่ล็อกสำหรับ Graybox

- Style id: `blocky-bighead-v1`
- Surface style id: `four-side-block-v1`; อ่าน `FOUR_SIDE_ASSET_STYLE_LOCK_TH.md` เป็น texture/UV authority
- ใช้กับมนุษย์เท่านั้น: Player และ Monster Keeper
- มอนสเตอร์ยังใช้ Visual Lock เดิม: Lv.1 Transparent Elemental Slime → Lv.2 Animal Form
- ตัวเลือกเป้าหมายแบบ provisional คือ **B — Head 40%**; ยังไม่ล็อกจน BH0 สร้าง A/B/C ผ่าน Asset Lab และ Codex ออก verdict
- ความสูงร่างหลักจาก gameplay root ถึงยอดหัว = `1.80` world units ไม่รวมผม/หมวก
- gameplay root อยู่ที่พื้น `y = 0` เหมือนเดิม
- ด้านหน้าของตัวละครคือแกน `-Z` ตาม convention ปัจจุบัน
- ใช้ primitive และ shared immutable geometry/material cache เดิม ไม่มี texture ใหม่ใน graybox

## 2. Proportion Sheet

### 2.1 ตัวเลือกหัวสำหรับ CH0

| ตัวเลือก | สูงหัว | กว้างหัว | ลึกหัว | จุดกึ่งกลาง Y | สัดส่วนหัว/ตัว | สถานะ |
|---|---:|---:|---:|---:|---:|---|
| A | 0.68 | 0.62 | 0.54 | 1.46 | 37.8% | comparison |
| B | 0.72 | 0.64 | 0.56 | 1.44 | 40.0% | **recommended** |
| C | 0.76 | 0.66 | 0.58 | 1.42 | 42.2% | comparison |

ทุกตัวเลือกมียอดหัวที่ `y = 1.80` เพื่อให้เปรียบเทียบโดยไม่เปลี่ยนความสูงในโลก ตัวเลือก B มี head/torso width `1.60×`; outer-shoulder ratio ต้องวัดจาก animated boundsจริงและคาดประมาณ `1.05–1.10×` ห้ามใช้เลข `1.45×` เดิมเป็น acceptance

### 2.2 Graybox target ของตัวเลือก B

| ส่วน | ขนาดเป้าหมาย W×H×D | จุดกึ่งกลาง/ตำแหน่งหลัก |
|---|---|---|
| Head | 0.64 × 0.72 × 0.56 | `(0, 1.44, 0)` |
| Torso | 0.40 × 0.46 × 0.28 | `(0, 0.88, 0)` |
| Hips | 0.38 × 0.22 × 0.28 | `(0, 0.60, 0)` |
| Upper/whole arm visual | หนา 0.09–0.11, ยาวรวม 0.42–0.48 | shoulder `x ≈ ±0.25, y ≈ 1.02` |
| Leg | หนา 0.11–0.13, ยาว 0.48–0.52 | center `y ≈ 0.31` |
| Hand | กล่องประมาณ 0.11 ต่อด้าน | ปลายแขน; ต้องอ่าน Throw pose ได้ |
| Boot | 0.16 × 0.14 × 0.22 | sole ไม่ต่ำกว่า `y = 0` |

ค่าพวกนี้เป็น visual metrics ไม่ใช่ collider metrics ยอมขยับได้ไม่เกิน `±0.02` world unit เพื่อป้องกัน mesh intersection แต่ห้ามขยับ root, movement footprint หรือ gameplay anchors

### 2.3 Silhouette checkpoints

- Front: เห็นหัวเป็นสี่เหลี่ยมกว้างกว่าลำตัว, มือแยกจากสะโพก, Player/Keeper แยกกันได้โดยไม่อ่านชื่อ
- Side: ความลึกหัวไม่ทำให้ดูเป็นทรงกลม, จมูก/หน้าไม่ยื่นจนคล้าย muzzle, backpack/staff อ่านได้
- Back: Player ต้องเห็น backpack; Keeper ต้องเห็น hat brim และ staff
- Thumbnail: ที่ความสูงตัวละครบนจอประมาณ 72–96 px ยังแยก role ได้

## 3. Geometry Contract

### 3.1 Primitive strategy

- Head ใช้ shared unit `BoxGeometry` แล้วปรับ `mesh.scale`; ห้ามใช้ `SphereGeometry` เป็นทรงหลัก
- กล่องมี 6 physical faces โดย Front/Right/Back/Left เป็น 4 editable texture sides และ Top/Bottom เป็น support faces
- ใช้ UV atlas/material เดียวตาม `four-side-block-v1`; ห้ามใช้ material แยกต่อด้านเป็นค่าเริ่มต้น
- Torso, hips, face, hair blocks, hands และ boots ใช้ unit box ร่วมกันเมื่อรูปทรงยอมได้
- แขน/ขาใช้ capsule หรือ cylinder low-poly จาก cache เดิม
- Hat brim/crown ใช้ cylinder 8–12 segments หรือ blocky box ตาม silhouette ที่เลือก
- ไม่เพิ่ม bevel library; สร้างความนุ่มด้วยสัดส่วน สี ผม และแสงแทน high-poly bevel
- ทุก geometry/material ที่ share ต้องมี lifecycle marker ตาม disposal contract เดิม ห้าม dispose จาก instance cleanup

### 3.2 Part budget

- Player และ Keeper ต้องไม่เพิ่ม visible mesh count เกิน baseline role ละ 2 ชิ้น
- hair ของ Player ไม่เกิน 5 block meshes
- graybox ใช้ fallback surface; texture pass เปลี่ยน face/detail เป็น Four-Side atlas ผ่าน Asset Engine
- Keeper hat, apron และ staff reuse primitive/material เท่าที่ทำได้
- ห้ามสร้าง geometry/material ใหม่ทุก frame หรือทุก animation state

## 4. Rig และ Hierarchy Contract

ทุก metric ในเอกสารนี้เป็น character-root local space และ Asset Engine ต้องคืน rig ผ่าน AssetHandle โครงสร้าง phase แรก:

```text
characterRoot                 gameplay transform เดิม
└─ visualRoot                 visual offset เท่านั้น
   ├─ hipsPivot
   ├─ torsoPivot              torso/chest/backpack/apron descendants
   ├─ headPivot               root-local y = 1.44
   │  ├─ headMesh
   │  ├─ faceSurface
   │  ├─ hairRoot
   │  └─ hatRoot
   ├─ leftArmRoot
   ├─ rightArmRoot            includes rightHandAnchor
   ├─ leftLegRoot
   ├─ rightLegRoot
   └─ staffRoot               hand-attached หรือ explicit constraint
```

ข้อกำหนด compatibility:

- head/torso/arms/legs เป็น sibling pivots ใต้ visualRoot เพื่อไม่ให้ root-local metrics double transform
- face/hair/hat ต้องเป็นลูกของ headPivot; backpack/apron ตาม torso; capture ball ตาม right hand
- legacy adapter map key เดิม `torso`, `chest`, `hips`, `head`, `leftArm`, `rightArm`, `leftLeg`, `rightLeg`, `staffRig` เข้ากับ AssetHandle โดย gameplay ห้ามค้น mesh เอง
- `rig.rest` และ `rig.metrics` เก็บตำแหน่งพัก; animator ทำ rest reset → locomotion overlay → action overlay ทุก frame
- action duration และ state transition ของ Throw, Skill, Summon, Recall, Hurt คงเดิม
- cleanup ผ่าน `AssetHandle.dispose()` ต้อง idempotent และไม่ทิ้ง ghost accessory

ไม่บังคับแยก upper/lower arm ใน BH1 ถ้าเพิ่มความเสี่ยง ให้รักษา arm pivot เดิมก่อน แล้วเปิด elbow articulation เป็น polish เฉพาะเมื่อ pose matrix ผ่านแล้ว

## 5. Gameplay และ Presentation Anchor Contract

Gameplay/behavior ที่ห้ามเปลี่ยน:

| Anchor/behavior | Baseline ที่ต้องคงไว้ |
|---|---:|
| Camera look target จาก player root | `y + 1.10` |
| Keeper interaction radius | `3.40` |
| Projectile duration | `0.55` |
| Throw/Skill/Hurt action duration | `0.34 / 0.28 / 0.24` |

- ห้ามเปลี่ยน camera offset/FOV, speed, collider, navigation footprint, spawn validation, projectile target/result หรือ resolver
- `throwOrigin` ต้องมาจาก right-hand anchor; legacy `y + 1.15` เป็น fallback ของ asset เก่า ไม่ใช่ค่าล็อกสำหรับ Bighead
- `hitText` และ `label` มาจาก animated bounds + clearance; legacy `y + 1.45` และ `y + 2.00` เป็น fallback ไม่ใช่ gameplay anchors
- aim line และ projectile mesh ต้องเริ่มจาก `throwOrigin` เดียวกัน ขณะที่ target/duration/ball consumption/result คงเดิม
- Keeper label ต้องมี screen-space clearance ที่ตรวจวัดได้เหนือ hat/head bounds
- ถ้าต้องชดเชย visual position ให้ทำใต้ `visualRoot`; `characterRoot` ยังเป็น authority ของ gameplay

## 6. Face, Hair และ Role Language

### 6.1 Face layout

- วาง face surface บนด้าน `-Z` ด้วยสูตร `-(headDepth / 2 + epsilon)` และ UV region; ห้าม hard-code plane ที่ `z = -0.28` จนเสี่ยง z-fighting
- eye center separation เป้าหมาย 0.26–0.30; ตากว้างประมาณ 0.06–0.08 ต่อข้าง
- คิ้ว/ปากเป็น block หรือ plane เล็กและไม่ยื่นผ่านหน้าเกิน 0.02
- Graybox ต้องอ่าน neutral face ได้ก่อน; expression animation เป็นงานเสริมหลัง silhouette ผ่าน
- Hurt ใช้ head tilt/body pose เป็นหลัก ไม่ผูก acceptance กับ facial morph

### 6.2 Player identifiers

- ผมหน้าทรง block 3–5 ชิ้น ไม่ครอบรูปทรงหัวจนกลับไปดูทรงกลม
- backpack เป็น anchor หลักด้านหลัง
- มือขวาและ ball/throw equipment ต้องไม่ถูกหัวบังใน key pose
- โทนเริ่มต้น: skin `#FFC4A3`, hair `#F97316`, shirt `#20324A`, pants `#0F172A`, bag/accent `#7C3AED`

### 6.3 Keeper identifiers

- หมวกปีกกว้างกว่าหัวอย่างน้อย 0.08 ต่อด้าน แต่ไม่ชน label ที่ `y + 2.00`
- apron และ staff ต้องสร้าง silhouette ที่ต่างจาก Player แม้ดูแบบ grayscale
- โทนเริ่มต้น: skin `#F0C8A0`, shirt `#15803D`, hat `#FACC15`, apron `#F8FAFC`, staff `#475569`

static palette/atlas/material เข้าระบบ shared immutable cache; dynamic pulse/hurt flash ใช้ instance-owned mutable resource ห้ามแก้ shared material โดยตรง

## 7. Data/Builder Contract

รูปแบบข้อมูลเป้าหมายเชิงแนวคิดอยู่ใน Asset Catalog และ spawn ผ่าน engine:

```js
const visual = assets.spawn('character.human.blocky-bighead.v1', {
  role: 'player',
  appearanceId: 'appearance.human.player-orange.v1',
  quality: qualityProfile.tier,
});
```

- ใช้ engine provider/proportion base เดียวกัน ไม่ copy ฟังก์ชัน Player/Keeper สองชุด
- role variant เปลี่ยน palette/accessory เท่านั้น ไม่เปลี่ยน gameplay userData
- AssetHandle/catalog metadata เป็น test authority; `userData` ใช้ diagnostics ได้แต่ gameplay ห้ามพึ่งชื่อ child mesh
- style config ไม่เข้า save schema และไม่เปลี่ยนข้อมูลเกมของผู้เล่น

## 8. Animation Readability Budget

- Idle head bob ไม่เกิน `±0.008`; torso bob ไม่เกิน `±0.012` world unit
- Walk body bob ไม่เกิน `0.035`; head counter-tilt ไม่เกิน `0.04 rad`
- หลีกเลี่ยง simultaneous head bob + roll แรง เพราะหัวกินพื้นที่ 40% ของ silhouette
- Throw: มือ/อุปกรณ์ต้องโผล่พ้นขอบหัวใน key release pose
- Summon/Capture: ball arc และแขนต้องอ่านได้จากมุมกล้องเล่นจริง
- Recall/Skill: accessory ไม่ตัดผ่านแก้มหรือหมวก
- Hurt: ใช้ whole-body lean เป็นหลัก; ห้ามทำ head shake ที่รบกวน camera readability
- เวลาของ action เดิมไม่เปลี่ยน การปรับข้างต้นเป็น amplitude/visual pose เท่านั้น

## 9. Performance Budget

เทียบสองฐาน: frozen post-UX1 direct parent สำหรับ delta ของงาน และ accepted Performance P0 สำหรับ cumulative regression:

- WebGL `createBuffer` ตอนเข้า Ranch เพิ่มได้ไม่เกินค่าที่มากกว่าระหว่าง `+6` หรือ `+5%`
- visible draw/mesh count ของ Player + Keeper เพิ่มรวมไม่เกิน `10%`
- geometry/material allocation หลัง warm-up ต้องคงที่เมื่อ rebuild/open scene ซ้ำ
- BH1 fallback graybox ไม่มี actual texture pack ใหม่; BH3 ใช้ preloaded/cached atlas ตาม `four-side-block-v1` ไม่โหลดแยกต่อด้านหรือทุก frame
- ไม่มี DOM mutation เพิ่มจาก character animation
- quality tier low/medium/high ต้องใช้ geometry เดียวกัน; tier ต่างกันที่ DPR/AA/shadow ตาม performance contract เดิม
- ไม่ใช้ FPS จาก SwiftShader เป็น verdict เดี่ยว ให้รายงาน allocation, mesh/draw count, frame-time distribution และ real-device smoke ประกอบ

หากงบเกิน ให้ลด face/hair parts หรือ reuse unit primitivesก่อน ห้ามแก้ gameplay tick เพื่อชดเชยงานศิลป์

## 10. Engine-First Delivery Plan และ Freeze Gates

รายละเอียดและ phase authority อยู่ใน `BIGHEAD_ASSET_ENGINE_WORK_ORDER_TH.md`; ลำดับย่อ:

### AE0 — Contracts and Testability

- AssetHandle, catalog/schema, anchors, ownership และ pure tests
- ไม่มี source integration หรือ visual change

### AE1 — Engine Core + Legacy Adapter

- wrap Player/Keeper เดิมผ่าน engine/handle โดยภาพและ behavior เท่า baseline
- ยังไม่สร้าง Bighead

### FS1/FS2 — Four-Side Provider + Asset Lab

- สร้าง UV provider, atlas ownership และ deterministic import/preview/export
- ยังไม่เปลี่ยนตัวละครในเกม

### BH0 — Proportion Decision

- สร้าง A/B/C ใน Asset Lab แล้ว Codex จึงล็อก B หรือส่ง feedback

### BH1/BH2/BH3 — Player, Keeper, Appearance Pack

- migrate ทีละ roleผ่าน engine และ freeze แยก
- texture/appearance เปลี่ยนผ่าน catalog/Asset Lab ไม่แก้ gameplay source

### BH4 — Animation/Performance/Device Acceptance

- ปรับ animation, clipping, resource/performance และ real-device gates
- real-device ต้องผ่าน joystick+camera พร้อมกัน, หมุนจอ/restore, WebGL และเล่นต่อเนื่อง 10 นาที
- Canonical/Git/deploy/release เปิดได้ต่อเมื่อมี verdict แยก

ทุก phase เป็น delivery แยก มี source/work manifest, exact changed paths, test evidence และ freeze ระหว่าง phase ห้ามรวม AE1+FS1+BH1 ใน patch เดียว

## 11. Test Matrix

### Automated contract

- gameplay สร้าง visual ผ่าน Asset Engine/AssetHandle ไม่ bypass ไป builder โดยตรง
- style/role/part metadata ครบ
- head primary geometry เป็น box และ ratio อยู่ช่วง 38–42%
- face/hair/hat เป็น descendant ของ head pivot
- root-local pivots ไม่ double transform และ accessory ตาม anchor ถูกต้อง
- Player/Keeper ใช้ shared immutable geometry/static material เมื่อชนิดเดียวกัน; mutable resources เป็น instance-owned
- camera/interaction/projectile result behaviorไม่เปลี่ยน ขณะที่ throw/hitText/label ใช้ presentation anchors จาก engine
- remove/rebuild scene แล้วไม่มี orphan mesh และไม่ dispose shared resources
- animation ทุก state reset rest pose แล้วคืนค่าได้ ไม่มี stale/cumulative drift
- deterministic Asset Lab input เดิมให้ output/content hash เดิม

### Mutation/negative proof

ต้องมี mutant ที่ทำให้ test fail อย่างน้อย:

1. bypass Asset Engine แล้วสร้าง humanoidตรงใน gameplay
2. nested head ใช้ absolute Y จน double transform
3. กลับไปใช้ hard-coded throw origin `y + 1.15`
4. aim line กับ projectileใช้คนละ origin
5. mutate shared material หรือ dispose shared resourceจาก instance
6. ใช้ material แยก 4 ด้านแทน atlas
7. กลับแกนหน้าเป็น `+Z` หรือ mirror Right/Left
8. animatorไม่ reset restก่อน action overlay

### Visual/browser matrix

| มิติ | ชุดที่ต้องตรวจ |
|---|---|
| View | front, left, right, back, gameplay camera |
| Pose | Idle, Walk, Throw Capture, Throw Summon, Recall, Skill, Hurt |
| Role | Player, Keeper |
| Viewport | 844×390, 915×412, 740×360 |
| Quality | low, medium, high |
| Scene | Hub, Grassland, Cave |

ไม่จำเป็นต้องเก็บ screenshot ทุก Cartesian combination แต่ต้องครอบคลุมทุกค่าข้างต้นและเก็บ full pose matrix ที่ gameplay camera อย่างน้อยหนึ่ง viewport

## 12. Definition of Done

- AE0/AE1/FS1/FS2 ผ่านก่อน Bighead consumer และ Codex ล็อกตัวเลือก B จาก BH0 evidence
- Player/Keeper เป็นหัวเหลี่ยมชัดเจนรอบตัว 360° และแยก role ได้แบบ grayscale
- pose matrix ผ่านโดยไม่มี clipping สำคัญหรือ detached face/accessory
- root, camera, projectile target/result/duration และ interaction behavior เท่า baseline; presentation anchors มาจาก Asset Engine และมี clearance
- ไม่มี combat/capture/summon/recall/save/collider rule เปลี่ยน
- gameplay เปลี่ยน appearance ได้ด้วย stable asset/catalog ID โดยไม่เข้าถึง internal mesh
- performance budget และ shared disposal contract ผ่าน
- automated tests + required mutants ผ่าน
- Four-Side UV orientation, atlas cache และ user-replaceable appearance contract ผ่าน
- browser และ Android real-device gates ผ่าน
- มี manifests, exact diff, screenshots และผลวัดก่อน–หลังครบ
- ยังไม่ถือว่า release ได้จนมี Project Lead verdict สำหรับ canonical/Git/deploy/release
