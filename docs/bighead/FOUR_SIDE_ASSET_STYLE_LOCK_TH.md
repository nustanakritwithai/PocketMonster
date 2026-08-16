# Four-Side Block — Asset Style Lock

เอกสารนี้ล็อก visual surface system สำหรับตัวละครทรงเหลี่ยมและ Asset Presentation Engine ชื่อภายใน `four-side-block-v1`

## 1. คำตัดสินที่ล็อก

- รูปร่างหลักเป็นกล่อง/cuboid อ่านเป็นตัวสี่เหลี่ยมชัดเจน
- กล่องมี 6 หน้าทางเทคนิค แต่กำหนด **4 Editable Sides** เป็นงานหลัก: Front, Right, Back, Left
- Top และ Bottom เป็น support faces ใช้สีพื้นอัตโนมัติหรือใส่ภาพเพิ่มได้
- ผู้ใช้ต้องเปลี่ยนภาพตกแต่งได้โดยไม่แก้ JavaScript หรือสร้าง geometry ใหม่
- Runtime ใช้ texture atlas และ material ร่วม ไม่สร้าง material แยก 4–6 ชิ้นต่อกล่อง
- Phase แรกใช้กับ Player และ Keeper; มอนสเตอร์ยังคง Visual Lock เดิมจนมีคำสั่งเปิดแยก

## 2. Face Convention

| ชื่อหน้า | Local axis | ความหมาย |
|---|---|---|
| Front | `-Z` | ใบหน้า/ด้านหน้าตัวละคร |
| Right | `+X` | ด้านขวาของตัวละคร |
| Back | `+Z` | ด้านหลัง |
| Left | `-X` | ด้านซ้าย |
| Top | `+Y` | ด้านบน; optional image |
| Bottom | `-Y` | ด้านล่าง; optional image |

- ห้าม mirror ภาพโดยปริยาย
- Asset Lab ต้องพิมพ์ชื่อหน้าและลูกศรแกนบน preview เพื่อป้องกันสลับ Left/Right
- UV ของทุกชิ้นใช้ convention เดียวกัน ไม่ให้ head/torso/limb กลับด้านคนละแบบ

## 3. รูปแบบภาพที่ผู้ใช้ใส่เอง

รองรับ input สามแบบ:

1. `single` — ใส่ภาพเดียวแล้วใช้กับ Front/Right/Back/Left เหมาะกับงานทดลองเร็ว
2. `four` — ใส่ PNG แยก `front/right/back/left` เพื่อแต่งแต่ละด้าน
3. `strip` — ใส่ภาพแถบเรียง `Front | Right | Back | Left`

ไฟล์ต้นทางที่แนะนำ:

```text
appearance/player-orange/
├─ appearance.json
├─ head.front.png
├─ head.right.png
├─ head.back.png
├─ head.left.png
├─ head.top.png          optional
├─ head.bottom.png       optional
├─ torso.front.png
└─ ...
```

ข้อกำหนด:

- PNG หรือ WebP, sRGB
- source panel มาตรฐาน 256×256; Asset Lab resize/crop ให้ตาม UV region ได้
- `front` เป็นไฟล์บังคับในโหมด `four`
- ถ้าขาด Left/Right ให้ใช้ด้านตรงข้ามโดยไม่ mirror; ถ้าขาด Back ให้ใช้สีพื้น ไม่คัดลอกใบหน้าไปด้านหลัง
- Top/Bottom ที่ไม่มีภาพใช้สีจาก palette เช่น hair/skin/shirt/sole ตาม part
- alpha ใช้ทำ decal/overlay ได้ แต่ Asset Lab ต้อง composite ก่อน runtime เพื่อลด material layer

## 4. Atlas และ UV Contract

- Editable source แยกเป็นภาพง่าย ๆ ได้ แต่ Asset Lab/compiler รวมเป็น padded atlas ก่อนใช้ในเกม
- ทุก tile ต้องมี edge padding/gutter อย่างน้อย 4 px เพื่อกันสีรั่วจาก mipmap
- UV ต้อง inset เข้าจากขอบ tile และห้ามใช้ค่าที่ชน tile ข้างเคียง
- geometry เป็น box ที่มี vertex แยกต่อ face เพื่อกำหนด UV ได้ แต่ clear/รวม geometry groups ให้ใช้ material เดียวเมื่อทำได้
- Head, torso, limbs และ static accessories ของ appearance เดียวกันควรอ่าน atlas เดียวกัน
- atlas เป้าหมาย: `512×512` สำหรับ low/medium และไม่เกิน `1024×1024` สำหรับ high ใน pass แรก
- ใช้ color map เดียวก่อน; normal/metalness/emissive maps ยังไม่เปิดจนกว่าจะมี budget แยก
- texture ต้องถูก cache ด้วย `appearanceKey + quality + contentHash`

หมายเหตุ: material เดียวช่วยลด material switching แต่ mesh ที่มี pivot แยกยังเป็นคนละ draw call จึงห้ามรายงานว่า atlas ทำให้ทั้งตัวเหลือหนึ่ง draw call

## 5. Appearance Layers

ลำดับ layer ที่ Asset Lab composite:

1. `base` — สีผิว/ผ้า/วัสดุหลัก
2. `outfit` — เสื้อ หมวก รองเท้า
3. `detail` — ตา ปาก ผม ลายผ้า
4. `decal` — สัญลักษณ์หรือภาพที่ผู้ใช้ใส่เอง

- Runtime รับ compiled atlas เป็น immutable texture
- appearance ที่มี layer/config เหมือนกันต้องใช้ atlas/material object เดียวกัน
- dynamic glow, hurt flash หรือ dissolve ห้ามแก้ shared material โดยตรง ให้ใช้ instance-owned overlay/uniform contract แยก
- ห้ามสร้าง CanvasTexture ใหม่ทุก frame; compose เมื่อ import/change appearance แล้ว cache ผลลัพธ์

## 6. Asset Catalog Contract

ตัวอย่าง editable definition:

```json
{
  "id": "appearance.human.player-orange.v1",
  "style": "four-side-block-v1",
  "mode": "four",
  "parts": {
    "head": {
      "front": "head.front.png",
      "right": "head.right.png",
      "back": "head.back.png",
      "left": "head.left.png",
      "topColor": "#F97316",
      "bottomColor": "#FFC4A3"
    }
  }
}
```

- gameplay อ้าง stable appearance/asset ID เท่านั้น ไม่อ้าง filename โดยตรง
- file path, UV rect, atlas hash และ quality variant เป็นข้อมูลของ Asset Engine
- เปลี่ยน procedural mesh เป็น GLTF ในอนาคตได้ถ้า provider นั้นรองรับ `four-side-block-v1` และ anchor contract เดิม
- ห้ามเก็บ PNG, atlas URL หรือ pixel data ลง save-game

## 7. Asset Lab Workflow

Asset Lab ต้องทำได้โดยไม่เปิด game source:

1. เลือก part เช่น Head/Torso/Arm/Leg
2. drag/drop ภาพเดียวหรือภาพ Front/Right/Back/Left
3. preview รอบตัว 0°/90°/180°/270° พร้อม Top/Bottom
4. ปรับ crop, rotate 90°, scale และสี fallback
5. เปิด seam/gutter/UV overlay และตรวจภาพกลับด้าน
6. preview Idle/Walk/Throw/Hurt กับกล้อง gameplay
7. แสดง atlas size, texture memory, meshes, materials และ draw calls
8. export `appearance.json`, compiled atlas และ content hash

Asset Lab เป็นเครื่องมือสร้าง asset ไม่ใช่ระบบแต่งตัวใน save-game รอบนี้

## 8. Bighead Application

- หัว Bighead ใช้ cuboid `0.64 × 0.72 × 0.56` ตาม proportion B แบบ provisional
- ใบหน้าแบบ geometry เดิมเปลี่ยนเป็น detail/decal บน Front ได้
- ผมสามารถใช้ Top + side textures หรือมี block hair accessory เพิ่มเฉพาะ silhouette ที่จำเป็น
- ด้าน Back ใช้ผม/ท้ายศีรษะ ห้ามคัดลอกตาและปากจาก Front
- Right/Left ต้องไม่ mirror อัตโนมัติ เพื่อให้ใส่ scar, hair clip หรือ accessory แบบไม่สมมาตรได้
- anchor เช่น `rightHand`, `headTop`, `label`, `hitText` มาจาก rig/bounds ไม่ฝังใน texture

## 9. Performance และ Ownership Gates

- หนึ่ง appearance ใช้ base atlas ไม่เกิน 1 ชุดใน pass แรก
- เปลี่ยนภาพแล้วต้อง dispose เฉพาะ atlas/material instance เก่าที่ engine เป็นเจ้าของ
- atlas ที่ cache/shared อยู่ห้ามถูก instance cleanup dispose
- import/export ซ้ำด้วย content เดิมต้องได้ cache key เดิมและไม่เพิ่ม GPU resources
- ห้ามใช้ 4 materials เพื่อแทน 4 ด้านเป็น default implementation
- texture load failure ต้องคืน checker/fallback appearance และเกมยังบูตได้
- zone preload ต้องโหลด appearance ก่อน spawn; ห้ามสร้าง request ซ้ำทุก frame

## 10. Validation และ Acceptance

- ภาพ Front/Right/Back/Left แสดงบนหน้าถูกต้องทั้ง gameplay camera และรอบตัว 360°
- ไม่มี face mirroring หรือ upside-down UV
- Top/Bottom ไม่เป็นสีดำเมื่อไม่ได้ส่งภาพมา
- ไม่มีรอย seam/texture bleeding ที่ low/medium/high และระยะกล้องเล่นจริง
- เปลี่ยนชุดภาพโดยแก้ catalog/ไฟล์ asset เท่านั้น ไม่แก้ builder/gameplay source
- atlas/material cache identity ผ่าน และ spawn/dispose ซ้ำไม่เพิ่ม resource
- screenshot evidence ครบ 0°/90°/180°/270°, Top และ Bottom inspection
- Android real-device WebGL ผ่านหลัง preload, หมุนจอ และเล่นต่อเนื่อง 10 นาที

## 11. Delivery Order

ให้ยึด phase authority จาก `BIGHEAD_ASSET_ENGINE_WORK_ORDER_TH.md`:

1. `AE0` — AssetHandle/catalog/ownership contracts
2. `AE1` — Engine core + legacy humanoid adapter โดยภาพยังเหมือน baseline
3. `FS1` — Four-side box UV provider และ automated orientation tests
4. `FS2` — Asset Lab import/preview/export + appearance compiler
5. `BH0` — A/B/C proportion evidence
6. `BH1/BH2` — Player และ Keeper consumers
7. `BH3` — actual appearance pack
8. `BH4` — animation/performance/device gates

ทุกช่วงเป็น delivery แยก เริ่มจาก snapshot ที่ Codex freeze หลัง UX1 และ Asset Engine foundation ผ่านแล้ว
