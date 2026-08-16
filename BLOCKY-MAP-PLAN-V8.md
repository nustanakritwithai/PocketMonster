# Monster Life RPG — V8.0 Blocky Map Theme Plan
## แผนพัฒนาแผนที่ Theme เหลี่ยม (Blocky World) — เน้นเปลี่ยนแผนที่เก่า

> สร้าง: 2026-08-16
> เวอร์ชัน: 3.0 (เพิ่มรายละเอียดความสวยงาม)
> เป้าหมาย: แปลงแผนที่เกมจาก Legacy (sphere/cone/cylinder โค้งมน) เป็น Blocky (box เหลี่ยม) ให้เข้ากับ theme Bighead Blocky ของมอนและ humanoid — **เน้นความสวยงาม**
> หลัก: เปลี่ยนของเก่า ไม่ทำเพิ่มใหม่ — คงพิกัดเดิม เปลี่ยนเฉพาะรูปทรง + เพิ่มความสวย

---

## สารบัญ

1. สถานะปัจจุบัน — แผนที่ที่มี (พร้อมพิกัดและบรรทัดโค้ด)
2. หลักการแปลง
2.5. หลักความสวยงาม (Aesthetic Principles)
3. โครงสร้าง Blocky World
4. แผนที่ทั้ง 3 Zone — พิกัดเดิมทั้งหมด
5. Blocky Ground + Grid Texture
6. Blocky Decorations — รายละเอียดทุกชิ้น
7. Blocky Structures (Pads + Incubator)
8. Blocky VFX Ground Decals
9. Sky + Fog + Lighting
10. โค้ดเต็มสำหรับแต่ละส่วน
11. ลำดับการทำ (Phases) — พร้อมเช็คลิสต์
12. ไฟล์ที่กระทบ
13. การตรวจรับ
14. ข้อควรระวัง
15. สรุป

---

## 1. สถานะปัจจุบัน — แผนที่ที่มี

### 1.1 โครงสร้างปัจจุบัน (game-v800.js)

| องค์ประกอบ | บรรทัด | ปัจจุบัน (Legacy) | ฟังก์ชัน |
|-----------|--------|------------------|----------|
| ท้องฟ้า | 183 | Color 0x65c9f5 | `scene.background` |
| Fog | 184 | Fog 0x65c9f5 30-76 | `scene.fog` |
| แสง Hemisphere | 182 | Light 1.55 | คงเดิม |
| แสง Directional | 183 | Light 2.15 | คงเดิม |
| พื้นดิน | 194 | Plane 90×90 สี 0x59cd61 | `ground` |
| ก้อนหิน | 199 | dodecahedron โค้งมน | `makeRock()` |
| ต้นไม้ | 209 | cylinder ต้น + cone พุ่ม + sphere ผล | `makeTree()` |
| หญ้า | 222 | cone เล็ก 3 ใบ | `makeGrassTuft()` |
| ดอกไม้ | 232 | cylinder ก้าน + sphere ดอก | `makeFlower()` |
| หินย้อยถ้ำ | 227 | cone แหลม | `makeStalagmite()` |
| เสารั้ว | 236 | box 0.1×0.7×0.1 | `makeFencePost()` — เหลี่ยมอยู่แล้ว |
| แท่น Ranch | 283 | circle + ring กลม r=3.4 | `makePad(7,3,3.4,...)` |
| แท่น Breeding | 284 | circle + ring กลม r=1.6 | `makePad(5.2,8.2,1.6,...)` |
| Incubator | 285-288 | cylinder ฐาน + sphere ไข่ | `incubator` |
| VFX พื้น | 1277 | circle + ring กลม | `spawnGroundDecal()` |
| VFX วงแหวน | 1112 | torus กลม | `spawnRingPulse()` |

### 1.2 Zone ทั้ง 3 — พิกัดเดิมทั้งหมด

#### Ranch Hub (บรรทัด 258-265)
```
หิน 6 ก้อน: (8,7,1.35) (-11,8,1.05) (16,-10,1.5) (-17,-8,1.25) (3,-19,1.7) (-5,17,1.15)
ต้นไม้ 6 ต้น: (-7,-12,1,fruit:red) (10,-16,1.15) (14,13,.95,fruit:yellow) (-15,14,1.05) (20,3,1) (-21,-2,1.15)
เสารั้ว 10 ต้น: วงกลมรอบ (7,3) รัศมี 3.55
ดอกไม้ 4 ดอก: (6.2,1.4) (8.4,4.6) (5.1,4.8) (4.4,7.4)
หญ้า 4 กอ: (2,2) (9,5) (-3,4) (11,1)
แท่น Ranch: จุด (7,3) รัศมี 3.4 สีเขียว
แท่น Breeding: จุด (5.2,8.2) รัศมี 1.6 สีชมพู
Incubator: จุด (5.2,0,8.2)
NPC: จุด (4,0,3)
```

#### Green Meadow (บรรทัด 267-271)
```
หิน 6 ก้อน: (-14,8,1.2) (12,-12,1.4) (18,6,1.1) (-16,-9,1.3) (7,14,1.5) (-6,-16,1.2)
ต้นไม้ 7 ต้น: (-9,-11,1.1,leaf:green) (11,-15,1.25,leaf:dark,fruit:orange) (15,11,1,leaf:darker)
             (-13,13,1.15) (19,2,1.05) (-20,-3,1.2,fruit:red) (3,-18,1.3)
หญ้า 8 กอ: (-5,-5) (2,-8) (8,-3) (-8,4) (5,6) (-2,-14) (10,3) (-12,-2)
ดอกไม้ 3 ดอก: (-1,-6,yellow) (4,-11,pink) (-7,2,purple)
```

#### Echo Cave (บรรทัด 272-274)
```
หิน 6 ก้อน (สีเทา): (-10,6,1.4,#57534e) (9,-7,1.6,#44403c) (14,4,1.2,#78716c)
                    (-15,-5,1.5,#57534e) (3,-15,1.8,#3f3f46) (-4,16,1.3,#52525b)
หินย้อย 7 ชิ้น: (-8,-4,1.1) (6,-9,1.3) (-12,9,1.4) (11,8,1.2) (0,-12,1.6) (15,-2,1) (-6,12,1.25)
```

### 1.3 ZONES object (บรรทัด 1486)
```js
hub:       { bg:0x72c7ef, ground:0x62c96b }
grassland: { bg:0x68d2f5, ground:0x56d364 }
cave:      { bg:0x334155, ground:0x57606f }
```

### 1.4 สรุป
NPC + Player = Bighead แล้ว | มอน = มีแผนแปลง (PR #45) | แผนที่ = ยัง Legacy ทั้งหมด

---

## 2. หลักการแปลง

1. **เปลี่ยนของเก่า ไม่ทำใหม่** — แปลง decorations ที่มีอยู่ ไม่เพิ่ม zone
2. **คงพิกัดเดิมทั้งหมด** — ตำแหน่ง x,z ของทุกชิ้นไม่เปลี่ยน เปลี่ยนแค่รูปทรง
3. **สไตล์ Blocky** — ทุกอย่างเป็น box ไม่มี sphere/cone/cylinder
4. **เข้ากับ Bighead** — มอนและ humanoid เป็นเหลี่ยม แผนที่ต้องเหลี่ยมด้วย
5. **คงโครงสร้าง 3 Zone** — hub/grassland/cave เหมือนเดิม
6. **Voxel-ish ไม่ใช่ Minecraft** — เหลี่ยมแต่ยังสวย มีสีสัน
7. **Performance ดีขึ้น** — box น้อย triangle กว่า sphere/cone/cylinder
8. **Texture เพิ่มได้** — พื้นผิว box ง่ายต่อการใส่ texture
9. **ไม่ลบฟังก์ชันเดิม** — เขียนทับในจุดเดิม คงชื่อฟังก์ชันเดิม
10. **เสารั้วไม่ต้องเปลี่ยน** — box อยู่แล้ว

---

## 2.5 หลักความสวยงาม (Aesthetic Principles)

### 2.5.1 Color Palette per Zone

แต่ละ zone ต้องมี mood สีชัดเจน:

#### Ranch Hub — อบอุ่น สดใส คล้ายบ้าน
```
พื้นหลัก:    #62c96b (เขียวหญ้าสด)
พื้นเข้ม:    #4ade80 → #3f9d4a (เขียวเข้ม กระเบืดี)
พื้นแก้ม:    #86efac (เขียวอ่อน จุด noise)
ท้องฟ้าบน:  #72c7ef (ฟ้าสด)
ท้องฟ้าล่าง: #bfefff (ฟ้าอ่อน)
Fog:        #65c9f5 (ฟ้า)
หิน:        #945a38 → #b67d52 (น้ำตาลอบอุ่น)
ต้นไม้ใบ:    #18753a → #22c55e (เขียวเข้ม → สด)
ต้นไม้ผล:    #ef4444 (แดง) / #facc15 (เหลือง)
ดอกไม้:     #f472b6 (ชมพู) / #facc15 (เหลือง) / #a78bfa (ม่วง)
```

#### Green Meadow — ผจญภัย สดใส กว้าง
```
พื้นหลัก:    #56d364 (เขียวสดกว่า hub)
พื้นเข้ม:    #22c55e → #16a34a (เขียวเข้ม)
ท้องฟ้าบน:  #68d2f5 (ฟ้าอ่อน)
ท้องฟ้าล่าง: #c8eeff (ฟ้าจาง)
Fog:        #68d2f5
หิน:        #945a38 (น้ำตาล)
ต้นไม้ใบ:    #22c55e / #16a34a / #15803d (3 โทนเขียว)
ต้นไม้ผล:    #f97316 (ส้ม) / #ef4444 (แดง)
ดอกไม้:     #facc15 (เหลือง) / #fb7185 (ชมพู) / #a78bfa (ม่วง)
```

#### Echo Cave — ลึกลับ มืด อันตราย
```
พื้นหลัก:    #57606f (เทาเข้ม)
พื้นเข้ม:    #334155 → #1e293b (เทาดำ กระเบืดี)
พื้นจุด:     #00000015 (จุดดำ หิน)
ท้องฟ้าบน:  #1a1a2e (ดำเข้ม)
ท้องฟ้าล่าง: #334155 (เทาเข้ม)
Fog:        #1e293b (เข้ม) ระยะ 15-50 (สั้น อึดอัด)
หิน:        5 โทนเทา (#57534e, #44403c, #78716c, #3f3f46, #52525b)
หินย้อย:    #64748b → #94a3b8 (เทา → เทาอ่อน)
แสง:        Hemisphere ลด 0.8, Directional ลด 1.5 (มืดลง)
```

### 2.5.2 Variation — ไม่จำเลียง

ทุกชิ้นต้องมีความแตกต่างเล็กๆ ไม่เหมือนกันหมด:

```js
// หิน: หมุนสุ่ม + สีเข้ม/อ่อนสุ่ม
function makeRock(x, z, s = 1, tone = 0x945a38) {
  const toneVar = tone + (Math.random() - 0.5) * 0x101010; // สีสุ่ม ±10%
  const rotVar = (x * 1.7 + z) * 0.15 + (Math.random() - 0.5) * 0.3;
  // ... ใช้ toneVar + rotVar
}

// ต้นไม้: พุ่มไม่เท่ากัน + เอียงเล็กน้อย
function makeTree(x, z, s = 1, opts = {}) {
  const leafScale = 0.9 + Math.random() * 0.2; // 0.9-1.1x
  const tilt = (Math.random() - 0.5) * 0.05; // เอียงนิดหน่อย
  // ...
}

// หญ้า: สูงไม่เท่ากัน + สีสุ่ม
function makeGrassTuft(x, z, s = 1, color = 0x3f9d4a) {
  const colorVar = color + (Math.random() - 0.5) * 0x080808;
  // ...
}
```

### 2.5.3 Bevel — ขอบเฉียบเล็กน้อย (ไม่กลม ไม่แหลม)

box เหลี่ยมจะดูแข็งเกินไป — เพิ่มความสวยด้วย:

1. **Scale ไม่เท่ากัน** — ไม่ใช่ลูกบาศก์สมบูรณ์ แต่ยาว/กว้าง/สูงต่างกัน
2. **Rotation เล็กน้อย** — หมุน 1-3 องศา ไม่ตั้งตรงเป๊ะ
3. **Material roughness ต่างกัน** — ก้อนใหญ่ rough กว่าก้อนเล็ก
4. **Color gradient บน texture** — ไม่ใช่สีทึบ มี gradient เข้ม/อ่อน

```js
// หิน: ก้อนใหญ่ rough กว่า ก้อนเล็ก
const mainMat = mat(tone, 0.95, 0.04);  // หยาบ
const pebbleMat = mat(tone, 0.99, 0);   // เรียบ

// ต้นไม้: พุ่มล่าง rough กว่า พุ่มบน
const midMat = mat(leaf, 0.78, 0.03);   // หยาบ
const topMat = mat(leaf, 0.7, 0.04);    // เรียบกว่า
```

### 2.5.4 Texture Detail — พื้นผิวละเอียด

ใช้ procedural canvas texture สำหรับ decorations ด้วย ไม่ใช่แค่พื้น:

```js
// หิน: texture มีรอยร้าว
function makeRockTexture(tone) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const hex = '#' + tone.toString(16).padStart(6, '0');
  ctx.fillStyle = hex; ctx.fillRect(0, 0, 64, 64);
  // รอยร้าว
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * 64, 0);
    ctx.lineTo(Math.random() * 64, 64);
    ctx.stroke();
  }
  // จุด
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  }
  return new THREE.CanvasTexture(canvas);
}

// ต้นไม้: texture มีลายเปลือก
function makeBarkTexture(trunkColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const hex = '#' + trunkColor.toString(16).padStart(6, '0');
  ctx.fillStyle = hex; ctx.fillRect(0, 0, 32, 64);
  // ลายเปลือกแนวตั้ง
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  for (let x = 4; x < 32; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x + Math.random() * 2, 0);
    ctx.lineTo(x + Math.random() * 2, 64);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

// ใบไม้: texture มีลายใบ
function makeLeafTexture(leafColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const hex = '#' + leafColor.toString(16).padStart(6, '0');
  ctx.fillStyle = hex; ctx.fillRect(0, 0, 64, 64);
  // ลายใบเล็กๆ
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 15; i++) {
    ctx.fillRect(Math.random() * 64, Math.random() * 64, 3, 5);
  }
  // จุดสว่าง
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 10; i++) {
    ctx.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  }
  return new THREE.CanvasTexture(canvas);
}
```

### 2.5.5 Lighting Atmosphere

แสงต่อ zone ต้องต่างกัน:

```js
function setZoneLighting(zone) {
  if (zone === 'cave') {
    // ถ้ำ: มืด แสงน้อย อบอุ่นนิดหน่อย
    scene.children.find(c => c.isHemisphereLight).intensity = 0.6;
    sun.intensity = 0.8;
    sun.color.setHex(0xb0c4de); // แสงเย็น
  } else if (zone === 'grassland') {
    // ทุ่ง: สดใส แสงเย็น
    scene.children.find(c => c.isHemisphereLight).intensity = 1.55;
    sun.intensity = 2.15;
    sun.color.setHex(0xffffff);
  } else {
    // hub: อบอุ่น แสงทอง
    scene.children.find(c => c.isHemisphereLight).intensity = 1.55;
    sun.intensity = 2.15;
    sun.color.setHex(0xfff4e0); // แสงอบอุ่น
  }
}
```

### 2.5.6 Emissive Glow — ความสว่างเล็กๆ

บางชิ้นควรมี glow เล็กๆ ให้ดูมีชีวิต:

```js
// ดอกไม้: bloom มี emissive เล็กน้อย
const bloomMat = new THREE.MeshStandardMaterial({
  color, emissive: color, emissiveIntensity: 0.08, roughness: 0.5
});

// ผลไม้: emissive เล็ก
const fruitMat = new THREE.MeshStandardMaterial({
  color: fruit, emissive: fruit, emissiveIntensity: 0.06, roughness: 0.55
});

// ไข่ Incubator: emissive อบอุ่น
const eggMat = new THREE.MeshStandardMaterial({
  color: 0xfde68a, emissive: 0x7c2d12, emissiveIntensity: 0.15
});

// หินย้อยถ้ำ: emissive เย็น (แร่)
const stalagmiteTipMat = new THREE.MeshStandardMaterial({
  color: 0x94a3b8, emissive: 0x4a90d9, emissiveIntensity: 0.04, roughness: 0.78
});
```

### 2.5.7 โครงสร้างความสวยโดยรวม

```
                 ┌──── ท้องฟ้า gradient ────┐
                 │  (สว่างบน → จางล่าง)      │
                 │                          │
           ┌──┐  │                          │  ┌──┐
           │🌳│  │                          │  │🪨│
           │  │  │       Fog (กลืนไกล)       │  │  │
           └──┘  │                          │  └──┘
                 │                          │
          ┌─┐    │                          │    ┌─┐
          │🌸│   │                          │    │🌿│
          └─┘    │                          │    └─┘
                 │                          │
   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
   ░░░░░░ พื้น grid texture + noise ░░░░░░░
   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
   
   ← แสงอบอุ่น (hub) / เย็น (grassland) / มืด (cave)
   ← Shadow ทุกชิ้น
   ← Variation: สุ่มสี/หมุน/สเกล
   ← Emissive: ดอกไม้/ผลไม้/ไข่/หินย้อย
   ← Texture: ลายเปลือก/ลายใบ/รอยร้าว
```

---

### 3.1 เปรียบเทียบ Legacy vs Blocky

```
Legacy (ปัจจุบัน)              Blocky (เป้าหมาย)
───────────────────            ──────────────────
พื้น: plane สีทึบ               พื้น: plane + grid texture
หิน: dodecahedron 12 หน้า       หิน: box ซ้อน 3 ก้อน
ต้นไม้: cylinder + cone × 2     ต้นไม้: box ต้น + box พุ่ม × 2 + box ผล
หญ้า: cone 4 เหลี่ยม × 3        หญ้า: box บาง × 3
ดอกไม้: cylinder + sphere       ดอกไม้: box ก้าน + box ดอก
หินย้อย: cone 7 หน้า × 2        หินย้อย: box ซ้อน 3 ชั้นเรียว
รั้ว: box (เหมือนเดิม)           รั้ว: box (ไม่เปลี่ยน)
แท่น: circle + ring กลม         แท่น: box สี่เหลี่ยม + ขอบ box
Incubator: cylinder + sphere   Incubator: box ฐาน + box ไข่
VFX พื้น: circle + ring × 3     VFX พื้น: box + box ขอบ + box ใน
VFX วงแหวน: torus              VFX วงแหวน: box wireframe
ท้องฟ้า: สีทึบ                   ท้องฟ้า: gradient texture
```

### 3.2 Triangle Count เปรียบเทียบ

| ชิ้น | Legacy triangles | Blocky triangles | ลดลง |
|-----|------------------|------------------|------|
| หิน 1 ก้อน | ~120 (dodecahedron × 3) | ~36 (box × 3) | 70% |
| ต้นไม้ 1 ต้น | ~200 (cylinder + cone × 2 + sphere × 3) | ~60 (box × 5) | 70% |
| หญ้า 1 กอ | ~36 (cone × 3) | ~18 (box × 3) | 50% |
| ดอกไม้ 1 ดอก | ~80 (cylinder + sphere) | ~12 (box × 2) | 85% |
| หินย้อย 1 ชิ้น | ~80 (cone × 2) | ~18 (box × 3) | 78% |
| แท่น 1 แท่น | ~1600 (circle 40 + ring 40) | ~12 (box × 1) | 99% |
| Incubator | ~600 (cylinder 16 + sphere 18×14) | ~12 (box × 2) | 98% |
| **รวม hub** | **~8000** | **~500** | **94% ลดลง** |

---

## 4. แผนที่ทั้ง 3 Zone — พิกัดเดิมทั้งหมด

### 4.1 Ranch Hub — เปลี่ยนรูปทรง คงพิกัด

```
ก้อนหินเหลี่ยม × 6 (เดิม dodecahedron → box ซ้อน):
  (8,7) s=1.35   → box 1.35×1.08×1.22  + box 0.67×0.43×0.56  + box 0.34×0.22×0.28
  (-11,8) s=1.05 → box 1.05×0.84×0.95  + box 0.53×0.34×0.45  + box 0.26×0.17×0.22
  (16,-10) s=1.5 → box 1.5×1.2×1.35    + box 0.75×0.48×0.63  + box 0.38×0.24×0.31
  (-17,-8) s=1.25→ box 1.25×1.0×1.13   + box 0.63×0.40×0.53  + box 0.31×0.20×0.26
  (3,-19) s=1.7  → box 1.7×1.36×1.53   + box 0.85×0.54×0.72  + box 0.43×0.27×0.35
  (-5,17) s=1.15 → box 1.15×0.92×1.04  + box 0.58×0.37×0.49  + box 0.29×0.19×0.24

ต้นไม้เหลี่ยม × 6 (เดิม cylinder+cone → box):
  (-7,-12) s=1, fruit=red    → box ต้น 0.22×1.55×0.22 + box พุ่ม 1.05×1.0×1.05 + box พุ่มบน 0.72×0.7×0.72 + box ผล × 3
  (10,-16) s=1.15            → เหมือนกัน สเกล 1.15
  (14,13) s=.95, fruit=yellow→ สเกล 0.95 + ผลเหลือง
  (-15,14) s=1.05            → สเกล 1.05
  (20,3) s=1                 → สเกล 1
  (-21,-2) s=1.15            → สเกล 1.15

เสารั้ว box × 10 (คงเดิม):
  วงกลมรอบ (7,3) รัศมี 3.55 — 10 ต้น

ดอกไม้เหลี่ยม × 4:
  (6.2,1.4) (8.4,4.6) (5.1,4.8) (4.4,7.4) → box ก้าน 0.03×0.22×0.03 + box ดอก 0.1×0.1×0.1

หญ้าเหลี่ยม × 4:
  (2,2) (9,5) (-3,4) (11,1) → box บาง × 3 ใบ

แท่น Ranch (เดิม circle r=3.4 → box สี่เหลี่ยม):
  จุด (7,3) → box 6.8×0.02×6.8 + ขอบ box 4 ด้าน + เสามุม 4 จุด

แท่น Breeding (เดิม circle r=1.6 → box):
  จุด (5.2,8.2) → box 3.2×0.02×3.2 + ขอบ

Incubator (เดิม cylinder+sphere → box):
  จุด (5.2,0,8.2) → box ฐาน 0.9×0.35×0.9 + box ไข่ 0.5×0.83×0.45
```

### 4.2 Green Meadow — เปลี่ยนรูปทรง คงพิกัด

```
ก้อนหินเหลี่ยม × 6:
  (-14,8,1.2) (12,-12,1.4) (18,6,1.1) (-16,-9,1.3) (7,14,1.5) (-6,-16,1.2)

ต้นไม้เหลี่ยม × 7 (ใบสีต่างกัน):
  (-9,-11) s=1.1 leaf=0x22c55e
  (11,-15) s=1.25 leaf=0x16a34a fruit=0xf97316
  (15,11) s=1 leaf=0x15803d
  (-13,13) s=1.15
  (19,2) s=1.05
  (-20,-3) s=1.2 fruit=0xef4444
  (3,-18) s=1.3

หญ้าเหลี่ยม × 8:
  (-5,-5) (2,-8) (8,-3) (-8,4) (5,6) (-2,-14) (10,3) (-12,-2)

ดอกไม้เหลี่ยม × 3:
  (-1,-6) color=0xfacc15 (เหลือง)
  (4,-11) color=0xfb7185 (ชมพู)
  (-7,2) color=0xa78bfa (ม่วง)
```

### 4.3 Echo Cave — เปลี่ยนรูปทรง คงพิกัด

```
ก้อนหินเหลี่ยม × 6 (สีเทาต่างกัน):
  (-10,6) s=1.4 tone=0x57534e
  (9,-7) s=1.6 tone=0x44403c
  (14,4) s=1.2 tone=0x78716c
  (-15,-5) s=1.5 tone=0x57534e
  (3,-15) s=1.8 tone=0x3f3f46
  (-4,16) s=1.3 tone=0x52525b

หินย้อยเหลี่ยม × 7 (box ซ้อนเรียว):
  (-8,-4) s=1.1
  (6,-9) s=1.3
  (-12,9) s=1.4
  (11,8) s=1.2
  (0,-12) s=1.6
  (15,-2) s=1
  (-6,12) s=1.25
```

---

## 5. Blocky Ground + Grid Texture

### 5.1 Ground — เดิม vs ใหม่

```js
// เดิม (บรรทัด 194):
const ground = new THREE.Mesh(planeGeometry(90,90),
  new THREE.MeshStandardMaterial({color:0x59cd61, roughness:1}));

// ใหม่:
const groundTex = makeGroundTexture(0x62c96b);
const ground = new THREE.Mesh(planeGeometry(90,90),
  new THREE.MeshStandardMaterial({map:groundTex, roughness:1, color:0xffffff}));
```

### 5.2 Grid Texture Generator

```js
const groundTexCache = {};
function makeGroundTexture(zoneColor, zoneType = 'grass') {
  const key = zoneColor + ':' + zoneType;
  if (groundTexCache[key]) return groundTexCache[key];

  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // พื้นหลัง
  const hex = '#' + zoneColor.toString(16).padStart(6, '0');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 128, 128);

  // Grid กระเบืดีๆ
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 1;
  const grid = 16;
  for (let i = 0; i <= 128; i += grid) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
  }

  // Grid ใหญ่ (เข้มกว่า)
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += grid * 4) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
  }

  // Noise จุดเล็ก
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 40; i++) {
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }

  // เพิ่มลายตาม zone type
  if (zoneType === 'cave') {
    // จุดดำหิน
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i < 20; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
    }
  } else if (zoneType === 'grass') {
    // จุดเขียวเข้ม (หญ้า)
    ctx.fillStyle = 'rgba(0,100,0,0.08)';
    for (let i = 0; i < 30; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 4);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(20, 20);
  groundTexCache[key] = tex;
  return tex;
}
```

### 5.3 เปลี่ยนพื้นตาม Zone

```js
function setZoneGround(zone) {
  const z = ZONES[zone];
  const type = zone === 'cave' ? 'cave' : 'grass';
  const tex = makeGroundTexture(z.ground, type);
  if (ground.material.map) ground.material.map.dispose();
  ground.material.map = tex;
  ground.material.needsUpdate = true;
  scene.background = makeSkyTexture(z.bg);
  scene.fog.color.setHex(zone === 'cave' ? 0x1e293b : z.bg);
}
```

---

## 6. Blocky Decorations — รายละเอียดทุกชิ้น

### 6.1 หินก้อนเหลี่ยม — makeRock()

```js
// แทนที่ฟังก์ชันเดิม (บรรทัด 199)
function makeRock(x, z, s = 1, tone = 0x945a38) {
  const cluster = new THREE.Group();
  // ก้อนใหญ่: box เหลี่ยม (เดิม dodecahedron)
  const main = new THREE.Mesh(boxGeometry(s, s * 0.8, s * 0.9), mat(tone, 0.95, 0.04));
  main.position.y = s * 0.4;
  main.scale.set(1, 1.28, 1.08);
  main.castShadow = true; main.receiveShadow = true;
  cluster.add(main);
  // ก้อนข้าง: box เล็ก
  const side = new THREE.Mesh(boxGeometry(s * 0.5, s * 0.4, s * 0.5), mat(tone, 0.98, 0.02));
  side.position.set(s * 0.55, s * 0.2, s * 0.18);
  side.scale.set(1.1, 0.8, 1);
  side.castShadow = true;
  cluster.add(side);
  // ก้อนเล็ก: box เล็กสุด
  const pebble = new THREE.Mesh(boxGeometry(s * 0.25, s * 0.2, s * 0.25), mat(tone, 0.99, 0));
  pebble.position.set(-s * 0.48, s * 0.1, -s * 0.22);
  pebble.castShadow = true;
  cluster.add(pebble);
  cluster.position.set(x, 0, z);
  cluster.rotation.y = (x * 1.7 + z) * 0.15;
  addDeco(cluster);
  return cluster;
}
```

### 6.2 ต้นไม้เหลี่ยม — makeTree()

```js
// แทนที่ฟังก์ชันเดิม (บรรทัด 209)
function makeTree(x, z, s = 1, { trunk = 0x754428, leaf = 0x18753a, fruit = null } = {}) {
  const g = new THREE.Group();
  // ต้น: box สี่เหลี่ยม (เดิม cylinder)
  const bole = new THREE.Mesh(boxGeometry(0.22 * s, 1.55 * s, 0.22 * s), mat(trunk, 0.88, 0.02));
  bole.position.y = 0.78 * s;
  bole.castShadow = true;
  g.add(bole);
  // พุ่มล่าง: box ใหญ่ (เดิม cone)
  const mid = new THREE.Mesh(boxGeometry(1.05 * s, 1.0 * s, 1.05 * s), mat(leaf, 0.78, 0.03));
  mid.position.y = 1.65 * s;
  mid.castShadow = true;
  g.add(mid);
  // พุ่มบน: box เล็ก (เดิม cone เล็ก)
  const top = new THREE.Mesh(boxGeometry(0.72 * s, 0.7 * s, 0.72 * s), mat(leaf, 0.7, 0.04));
  top.position.y = 2.35 * s;
  top.castShadow = true;
  g.add(top);
  // ผลไม้: box เล็ก (เดิม sphere)
  if (fruit) {
    for (const [fx, fy, fz] of [[0.35, 1.5, 0.2], [-0.28, 1.7, -0.15], [0.1, 1.95, 0.32]]) {
      const berry = new THREE.Mesh(boxGeometry(0.1 * s, 0.1 * s, 0.1 * s), mat(fruit, 0.55, 0.08));
      berry.position.set(fx * s, fy * s, fz * s);
      berry.castShadow = true;
      g.add(berry);
    }
  }
  g.position.set(x, 0, z);
  addDeco(g);
  return g;
}
```

### 6.3 หญ้าเหลี่ยม — makeGrassTuft()

```js
// แทนที่ฟังก์ชันเดิม (บรรทัด 222)
function makeGrassTuft(x, z, s = 1, color = 0x3f9d4a) {
  const g = new THREE.Group();
  // 3 ใบ: box บางตั้ง (เดิม cone)
  for (const [dx, h, tilt] of [[-0.06, 0.28, 0.18], [0.05, 0.34, -0.12], [0, 0.22, 0.04]]) {
    const blade = new THREE.Mesh(boxGeometry(0.05 * s, h * s, 0.05 * s), mat(color, 0.86, 0));
    blade.position.set(dx * s, h * 0.5 * s, 0);
    blade.rotation.z = tilt;
    blade.castShadow = true;
    g.add(blade);
  }
  g.position.set(x, 0, z);
  addDeco(g);
  return g;
}
```

### 6.4 ดอกไม้เหลี่ยม — makeFlower()

```js
// แทนที่ฟังก์ชันเดิม (บรรทัด 232)
function makeFlower(x, z, color = 0xf472b6) {
  const g = new THREE.Group();
  // ก้าน: box บาง (เดิม cylinder)
  const stem = new THREE.Mesh(boxGeometry(0.03, 0.22, 0.03), mat(0x4ade80, 0.8, 0));
  stem.position.y = 0.11;
  g.add(stem);
  // ดอก: box เล็ก (เดิม sphere)
  const bloom = new THREE.Mesh(boxGeometry(0.1, 0.1, 0.1), mat(color, 0.5, 0.04));
  bloom.position.y = 0.24;
  bloom.castShadow = true;
  g.add(bloom);
  g.position.set(x, 0, z);
  addDeco(g);
  return g;
}
```

### 6.5 หินย้อยเหลี่ยม — makeStalagmite()

```js
// แทนที่ฟังก์ชันเดิม (บรรทัด 227)
function makeStalagmite(x, z, s = 1) {
  const g = new THREE.Group();
  // ฐาน: box ใหญ่ (เดิม cone ฐาน)
  const base = new THREE.Mesh(boxGeometry(0.6 * s, 0.5 * s, 0.6 * s), mat(0x64748b, 0.92, 0.08));
  base.position.y = 0.25 * s;
  base.castShadow = true;
  g.add(base);
  // กลาง: box ปานกลาง (เดิม cone ปลาย)
  const mid = new THREE.Mesh(boxGeometry(0.35 * s, 0.5 * s, 0.35 * s), mat(0x94a3b8, 0.85, 0.1));
  mid.position.y = 0.75 * s;
  mid.castShadow = true;
  g.add(mid);
  // ยอด: box เล็ก (เหลี่ยมแหลม)
  const tip = new THREE.Mesh(boxGeometry(0.15 * s, 0.4 * s, 0.15 * s), mat(0x94a3b8, 0.78, 0.12));
  tip.position.y = 1.2 * s;
  tip.castShadow = true;
  g.add(tip);
  g.position.set(x, 0, z);
  addDeco(g);
  return g;
}
```

### 6.6 เสารั้ว — คงเดิม (box อยู่แล้ว)

```js
// บรรทัด 236 — ไม่เปลี่ยน
function makeFencePost(x, z) {
  const post = new THREE.Mesh(boxGeometry(0.1, 0.7, 0.1), mat(0x8b5e34, 0.86, 0.02));
  post.position.set(x, 0.35, z);
  addDeco(post);
  return post;
}
```

---

## 7. Blocky Structures (Pads + Incubator)

### 7.1 แท่นเหลี่ยม — makePad()

```js
// แทนที่ฟังก์ชันเดิม (บรรทัด 281)
// เดิม: circle + ring กลม
// ใหม่: box สี่เหลี่ยม + ขอบ
function makePad(x, z, halfSize, color, opacity = 0.2) {
  // พื้นแท่น: box บาง (เดิม circle)
  const disk = new THREE.Mesh(
    boxGeometry(halfSize * 2, 0.02, halfSize * 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide })
  );
  disk.position.set(x, 0.025, z);
  scene.add(disk);
  // ขอบ 4 ด้าน: box บาง (เดิม ring)
  const edgeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const eH = 0.04;
  for (const [w, d, ox, oz] of [
    [halfSize * 2, 0.04, 0, -halfSize],
    [halfSize * 2, 0.04, 0, halfSize],
    [0.04, halfSize * 2, -halfSize, 0],
    [0.04, halfSize * 2, halfSize, 0],
  ]) {
    const edge = new THREE.Mesh(boxGeometry(w, eH, d), edgeMat);
    edge.position.set(x + ox, 0.03, z + oz);
    scene.add(edge);
  }
  // เสามุม 4 จุด
  for (const [ex, ez] of [[-halfSize, -halfSize], [halfSize, -halfSize], [-halfSize, halfSize], [halfSize, halfSize]]) {
    const post = new THREE.Mesh(boxGeometry(0.08, 0.08, 0.08), edgeMat);
    post.position.set(x + ex, 0.04, z + ez);
    scene.add(post);
  }
  return { disk, ring: { visible: true } }; // ring.visible ใช้ใน setHubVisibility
}
```

### 7.2 Incubator เหลี่ยม

```js
// แทนที่บรรทัด 285-288
// เดิม: cylinder ฐาน + sphere ไข่
// ใหม่: box ฐาน + box ไข่
const incubator = new THREE.Group();

// ฐาน: box สี่เหลี่ยม (เดิม cylinder)
const baseInc = new THREE.Mesh(
  boxGeometry(0.9, 0.35, 0.9),
  new THREE.MeshStandardMaterial({ color: 0x6d28d9, metalness: 0.2, roughness: 0.6 })
);
baseInc.position.y = 0.18;
baseInc.castShadow = true;
incubator.add(baseInc);

// ไข่: box เหลี่ยม (เดิม sphere)
const eggVisual = new THREE.Mesh(
  boxGeometry(0.5, 0.65, 0.45),
  new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0x7c2d12, emissiveIntensity: 0.12 })
);
eggVisual.scale.y = 1.28;
eggVisual.position.y = 0.72;
eggVisual.castShadow = true;
incubator.add(eggVisual);

incubator.position.set(5.2, 0, 8.2);
scene.add(incubator);
```

### 7.3 แก้ setHubVisibility

```js
// บรรทัด 1545 — ต้องแก้เพราะ ring เปลี่ยนโครงสร้าง
function setHubVisibility(on) {
  npc.visible = on;
  ranchPad.disk.visible = on;
  breedingPad.disk.visible = on;
  incubator.visible = on;
  // ring ไม่มีแล้ว — ใช้ disk visible อย่างเดียว
  // หรือเก็บขอบไว้ใน pad object
}
```

---

## 8. Blocky VFX Ground Decals

### 8.1 spawnGroundDecal — สี่เหลี่ยม

```js
// แทนที่ฟังก์ชันเดิม (บรรทัด 1277)
// เดิม: circle + ring กลม
// ใหม่: box สี่เหลี่ยม + ขอบ box
function spawnGroundDecal(type, pos, { radius = 1.1, duration = 1.25, intensity = 1 } = {}) {
  if (!pos) return;
  const cfg = typeFx(type);
  const group = new THREE.Group();
  const size = radius * 1.4;

  // พื้น: box บาง (เดิม circle)
  const disc = new THREE.Mesh(
    boxGeometry(size, 0.02, size),
    new THREE.MeshBasicMaterial({
      color: cfg.core, transparent: true, opacity: 0.13 * intensity,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  disc.position.y = 0.032;
  group.add(disc);

  // ขอบนอก: box wireframe (เดิม ring)
  const ringSize = size * 0.78;
  const ring = new THREE.Mesh(
    boxGeometry(ringSize, 0.02, ringSize),
    new THREE.MeshBasicMaterial({
      color: cfg.accent, transparent: true, opacity: 0.42 * intensity,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      wireframe: true,
    })
  );
  ring.position.y = 0.038;
  group.add(ring);

  // ขอบใน: box wireframe เล็ก (เดิม ring เล็ก)
  const innerSize = size * 0.24;
  const inner = new THREE.Mesh(
    boxGeometry(innerSize, 0.02, innerSize),
    new THREE.MeshBasicMaterial({
      color: cfg.core, transparent: true, opacity: 0.48 * intensity,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      wireframe: true,
    })
  );
  inner.position.y = 0.041;
  group.add(inner);

  group.position.set(pos.x, 0, pos.z);
  scene.add(group);
  groundDecals.push({ group, disc, ring, inner, life: duration, maxLife: duration, type, spin: (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.25) });
}
```

### 8.2 spawnRingPulse — box wireframe

```js
// แทนที่ฟังก์ชันเดิม (บรรทัด 1112)
// เดิม: torus กลม
// ใหม่: box wireframe
function spawnRingPulse(pos, color = 0x60a5fa, { scale = 0.6, life = 0.35, y = 0.08 } = {}) {
  const size = scale * 1.2;
  const mesh = new THREE.Mesh(
    boxGeometry(size, 0.02, size),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, wireframe: true,
    })
  );
  mesh.position.copy(pos);
  mesh.position.y += y;
  scene.add(mesh);
  effects.push({ mesh, life, maxLife: life, kind: 'ring' });
}
```

---

## 9. Sky + Fog + Lighting

### 9.1 Sky Gradient

```js
const skyTexCache = {};
function makeSkyTexture(zoneColor) {
  const key = zoneColor;
  if (skyTexCache[key]) return skyTexCache[key];

  const canvas = document.createElement('canvas');
  canvas.width = 2; canvas.height = 128;
  const ctx = canvas.getContext('2d');

  const hex = '#' + zoneColor.toString(16).padStart(6, '0');
  // สีบนสว่างกว่า สีล่างเข้มกว่า
  const grad = ctx.createLinearGradient(0, 0, 0, 128);

  if (zoneColor === 0x334155) {
    // cave — มืด
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(0.5, '#1e293b');
    grad.addColorStop(1, '#334155');
  } else {
    // hub/grassland — ฟ้า
    const lightHex = '#' + Math.min(0xffffff, zoneColor + 0x404040).toString(16).padStart(6, '0');
    grad.addColorStop(0, hex);
    grad.addColorStop(1, lightHex);
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 128);

  const tex = new THREE.CanvasTexture(canvas);
  skyTexCache[key] = tex;
  return tex;
}
```

### 9.2 Zone Visual Settings

| Zone | Sky Top | Sky Bottom | Fog Color | Fog Near | Fog Far | Ground Grid |
|------|---------|-----------|-----------|----------|---------|-------------|
| hub | #72c7ef | #bfefff | 0x65c9f5 | 30 | 76 | เขียวกระเบืดี |
| grassland | #68d2f5 | #c8eeff | 0x68d2f5 | 30 | 76 | เขียวสดกระเบืดี |
| cave | #1a1a2e | #334155 | 0x1e293b | 15 | 50 | เทากระเบืดี+จุดดำ |

---

## 10. โค้ดเต็มสำหรับแต่ละส่วน

(รวมในส่วน 5-9 ข้างต้น — ทุกฟังก์ชันมีโค้ดเต็มพร้อมใช้)

---

## 11. ลำดับการทำ (Phases) — พร้อมเช็คลิสต์

### Phase 1: Blocky Ground + Grid Texture
- [ ] สร้าง `makeGroundTexture(zoneColor, zoneType)` — canvas grid
- [ ] สร้าง `makeSkyTexture(zoneColor)` — gradient
- [ ] เปลี่ยน ground material → ใช้ texture (บรรทัด 194)
- [ ] สร้าง `setZoneGround(zone)` — เปลี่ยน texture ตาม zone
- [ ] เปลี่ยน scene.background → gradient texture (บรรทัด 183)
- [ ] ทดสอบ: พื้นมี grid กระเบืดี + ท้องฟ้า gradient
- ไฟล์: game-v800.js

### Phase 2: Blocky Decorations
- [ ] แปลง `makeRock()` — dodecahedron → box ซ้อน 3 ก้อน (บรรทัด 199)
- [ ] แปลง `makeTree()` — cylinder/cone/sphere → box 5 ชิ้น (บรรทัด 209)
- [ ] แปลง `makeGrassTuft()` — cone → box บาง 3 ใบ (บรรทัด 222)
- [ ] แปลง `makeFlower()` — cylinder/sphere → box 2 ชิ้น (บรรทัด 232)
- [ ] แปลง `makeStalagmite()` — cone → box ซ้อน 3 ชั้น (บรรทัด 227)
- [ ] `makeFencePost()` — คงเดิม (box อยู่แล้ว)
- [ ] ทดสอบ: ทุก decoration เป็น box เหลี่ยม
- ไฟล์: game-v800.js

### Phase 3: Blocky Structures
- [ ] แปลง `makePad()` — circle/ring → box สี่เหลี่ยม + ขอบ (บรรทัด 281)
- [ ] แปลง Incubator — cylinder/sphere → box (บรรทัด 285-288)
- [ ] แก้ `setHubVisibility()` — รองรับ pad ใหม่ (บรรทัด 1545)
- [ ] ทดสอบ: แท่น + Incubator เหลี่ยม
- ไฟล์: game-v800.js

### Phase 4: Blocky VFX Decals
- [ ] แปลง `spawnGroundDecal()` — circle/ring → box + wireframe (บรรทัด 1277)
- [ ] แปลง `spawnRingPulse()` — torus → box wireframe (บรรทัด 1112)
- [ ] ทดสอบ: VFX พื้นเป็นสี่เหลี่ยม
- ไฟล์: game-v800.js

### Phase 5: Zone Atmosphere
- [ ] ปรับ fog ตาม zone (cave มืดกว่า)
- [ ] ปรับ grid texture แต่ละ zone (cave = จุดดำ, grass = จุดเขียว)
- [ ] ปรับแสง cave (ลด intensity)
- [ ] ทดสอบ: 3 zone ต่างกันชัด
- ไฟล์: game-v800.js

### Phase 6: Polish
- [ ] ตรวจทุก decoration ใน browser (3 zone)
- [ ] ปรับความเข้ม grid
- [ ] ปรับขนาด box ที่ดูไม่เหมาะ
- [ ] ตรวจ shadow ทุกชิ้น
- [ ] ตรวจ performance (FPS ไม่ตก)
- ไฟล์: game-v800.js

---

## 12. ไฟล์ที่กระทบ

| ไฟล์ | Phase | บรรทัดที่แก้ | ประเภท |
|------|-------|-----------|--------|
| game-v800.js | 1 | 183-184, 194 | ground + sky |
| game-v800.js | 2 | 199, 209, 222, 227, 232 | decorations |
| game-v800.js | 3 | 281, 285-288, 1545 | structures |
| game-v800.js | 4 | 1112, 1277 | VFX |
| game-v800.js | 5 | 183-184, 1486+ | zone atmosphere |
| tests/v80-blocky-*.mjs (ใหม่) | 1-6 | — | test |

---

## 13. การตรวจรับ

1. `npm run ci` → ผ่านครบ
2. `node --check game-v800.js` → SYNTAX OK
3. Browser: v800.html → 200 OK
4. พื้นมี grid texture (กระเบืดีๆ) ทุก zone
5. หิน 6 ก้อน × 3 zone = 18 ก้อน เป็น box เหลี่ยม
6. ต้นไม้ 13 ต้น เป็น box เหลี่ยม (มีผลไม้ box)
7. หญ้า 12 กอ เป็น box บาง
8. ดอกไม้ 7 ดอก เป็น box
9. หินย้อย 7 ชิ้น เป็น box ซ้อน
10. แท่น 2 แท่น เป็นสี่เหลี่ยม
11. Incubator เป็น box ฐาน + box ไข่
12. VFX พื้นเป็นสี่เหลี่ยม + wireframe
13. ท้องฟ้ามี gradient
14. 3 Zone ต่างกันชัด (สี/grid/fog/แสง)
15. Performance: FPS ไม่ตก (box ลด triangle ~94%)

---

## 14. ข้อควรระวัง

1. **Grid texture repeat** — 20×20 บน 90×90 = กระเบืดี 4.5×4.5 หน่วย — พอดี
2. **CanvasTexture dispose** — ตอนเปลี่ยน zone ต้อง `oldTex.dispose()` ไม่งั้น memory leak
3. **makePad return shape** — เดิม return `{disk, ring}` — ใหม่อาจไม่มี ring แยก — ต้องแก้ setHubVisibility
4. **groundDecals spin** — `ring.rotation.z` หมุนได้ (box หมุนได้) — แต่ box หมุนจะเห็นมุม ไม่กลม
5. **Shadow** — `castShadow = true` ทุก decoration box
6. **Fog color cave** — 0x1e293b (เข้มมาก) — ทำให้รู้สึกอึดอัด
7. **populateWorld** — ตำแหน่งเดิมทั้งหมด ไม่เปลี่ยนพิกัด
8. **ไม่ลบชื่อฟังก์ชัน** — makeRock/makeTree/makeGrassTuft/makeFlower/makeStalagmite/makePad คงชื่อเดิม
9. **Performance** — box ลด triangle ~94% — FPS ควรดีขึ้น
10. **Sky gradient** — CanvasTexture 2×128 = ~1KB ไม่กระทบ memory
11. **wireframe VFX** — ใช้ `wireframe: true` สำหรับขอบสี่เหลี่ยม — แต่ box wireframe แสดง 12 เส้น (6 ด้าน)
12. **ring.visible** — setHubVisibility เดิมใช้ `ranchPad.ring.visible` — ต้องปรับให้รองรับ

---

## 15. สรุป

- เป้าหมาย: แปลงแผนที่เก่า 3 zone จาก Legacy → Blocky
- **เน้นเปลี่ยนของเก่า ไม่ทำใหม่** — คงพิกัด คงจำนวน คง zone
- ทุก decoration: sphere/cone/cylinder/dodecahedron → box
- พื้น: สีทึบ → grid texture (procedural canvas 128×128 + 2 ชั้น grid + noise)
- ท้องฟ้า: สีทึบ → gradient (canvas 2×128)
- แท่น/Incubator: กลม → เหลี่ยม
- VFX: circle/ring/torus → box + wireframe
- **ความสวยงาม:**
  - Color palette 3 zone ชัดเจน (hub=อบอุ่น, meadow=สดใส, cave=มืด)
  - Variation: สุ่มสี/หมุน/สเกล ทุกชิ้นไม่จำเลียง
  - Bevel: scale ไม่เท่ากัน + rotation เล็กน้อย + roughness ต่างกัน
  - Texture: ลายเปลือกไม้/ลายใบ/รอยร้าวหิน (procedural canvas)
  - Lighting: 3 zone ต่างแสง (อบอุ่น/เย็น/มืด)
  - Emissive glow: ดอกไม้/ผลไม้/ไข่/หินย้อย มี glow เล็กๆ
  - Fog ต่างระยะ: cave สั้นอึดอัด, hub/meadow กว้าง
- 6 Phase = 6 PR
- Performance: ลด triangle ~94% (box vs sphere/cone)
- ทุกฟังก์ชันมีโค้ดเต็มพร้อมบรรทัดที่จะแก้
- 15 ข้อตรวจรับ + 12 ข้อควรระวัง