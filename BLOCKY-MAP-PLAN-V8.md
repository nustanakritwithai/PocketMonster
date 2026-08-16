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
2.6. ประสบการณ์ผู้เล่น (Player Experience)
2.7. รายละเอียด Asset Model (Model Spec)
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

---

## 2.6 ประสบการณ์ผู้เล่น (Player Experience)

### 2.6.1 การเดินทางของผู้เล่น (Player Journey)

แผนที่ต้องรองรับการเดินทางของผู้เล่นตามลำดับ:

```
เริ่มเกม → Ranch Hub (บ้าน)
    │
    ├─ เดินชมรอบ → เห็นหิน/ต้นไม้/ดอกไม้ (ความประทับใจแรก)
    ├─ เข้าใกล้ NPC → ปุ่ม "คุย" ปรากฏ
    ├─ เปิด Manager → จัดการมอน/ฝึก/อาหาร/care
    ├─ ฝากมอนใน Ranch → เห็นมอนเดินในลาน (สูงสุด 6 ตัว)
    │
    ├─ กด "ออกล่า" → เดินทางไป Green Meadow
    │   ├─ เห็นทุ่งหญ้ากว้าง → ต้นไม้/หิน/ดอกไม้กระจาย
    │   ├─ เจอ Wild Monster → ปาเรียก → ต่อสู้ → จับ/ปราบ
    │   ├─ ใช้สกิล → VFX พื้นเห็นชัด
    │   └─ มอน Faint → Auto Recall → กลับไป Heal
    │
    ├─ กด zone "ถ้ำ" → เดินทางไป Echo Cave
    │   ├─ เห็นถ้ำมืด → หินเทา/หินย้อย → บรรยากาศอึดอัด
    │   ├─ เจอมอนระดับสูง → Boss/Elite
    │   └─ ลำบากกว่า → ต้องเตรียมตัว
    │
    └─ กลับ Ranch → Heal → ฝึก → ผสมพันธุ์ → ฟักไข่ → วิวัฒนาการ
```

### 2.6.2 ความรู้สึกต่อ Zone (Zone Feel)

แต่ละ zone ต้องทำให้ผู้เล่นรู้สึกต่างกัน:

#### Ranch Hub — ปลอดภัย อบอุ่น เป็นบ้าน
- สีสดใส เขียว/ฟ้า → รู้สึกผ่อนคลาย
- ต้นไม้มีผลไม้สีแดง/เหลือง → ดูมีชีวิต
- ดอกไม้หลายสี → ความสุข
- รั้วล้อมรอบลาน → ขอบเขตปลอดภัย
- NPC ยืนรอ → จุดศูนย์กลาง
- Incubator เรืองแสง → ความคาดหวัง (ไข่กำลังฟัก)
- แท่น Ranch/Breeding สีเขียว/ชมพู → เชิญให้เข้าไป
- **Blocky**: ทุกอย่างเหลี่ยมแต่สีสด → เหมือนของเล่นน่ารัก

#### Green Meadow — ผจญภัย กว้าง ตื่นเต้นเบาๆ
- สีสดกว่า hub → รู้สึกออกไปข้างนอก
- ต้นไม้หนาแน่นกว่า → รู้สึกเป็นป่า
- หญ้าเยอะกว่า → รู้สึกเป็นทุ่ง
- ไม่มีรั้ว → กว้าง ไม่จำกัด
- มอนเดินป่า → ตื่นเต้นเบาๆ
- VFX สกิลเห็นชัดบนพื้นเขียว → สนุก
- **Blocky**: กระเบืดีพื้นเขียวสด → เหมือนกระดานเกมผจญภัย

#### Echo Cave — ลึกลับ อันตราย ตึงเครียด
- สีมืด เทา/ดำ → รู้สึกอันตราย
- Fog สั้น → มองไม่ไกล อึดอัด
- หินเทาไม่มีสีสัน → เย็น ไม่เป็นมิตร
- หินย้อยแหลม → ขู่อันตราย
- ไม่มีต้นไม้/ดอกไม้ → ไม่มีชีวิต
- มอนระดับสูง/Boss → ต้องระวัง
- แสงน้อย → เงามืด ลึกลับ
- **Blocky**: กระเบืดีเทาดำ + หินย้อยเหลี่ยมแหลม → เหมือนดันเจี้ยนบล็อก

### 2.6.3 จุดสังเกตของผู้เล่น (Visual Landmarks)

ผู้เล่นต้องเห็นจุดสำคัญจากระยะไกล:

| จุด | Zone | สิ่งที่ผู้เล่นเห็น | สีที่โดดเด่น | บล็อก? |
|-----|------|-----------------|------------|--------|
| NPC | hub | ตัวละครยืน | เขียว+หมวกเหลือง | Bighead แล้ว |
| Incubator | hub | แท่น+ไข่เรืองแสง | ม่วง+ทอง | ต้องเปลี่ยน box |
| ลาน Ranch | hub | วงกลมเขียวใหญ่ | เขียวสด | ต้องเปลี่ยนสี่เหลี่ยม |
| ลาน Breeding | hub | วงกลมชมพูเล็ก | ชมพู | ต้องเปลี่ยนสี่เหลี่ยม |
| รั้ว | hub | เสาไม้ล้อมรอบ | น้ำตาล | box อยู่แล้ว |
| Boss | cave | มอนใหญ่+วงแหวนแดง | แดง | วงแหวน → box wireframe แดง |

### 2.6.4 การตอบสนองต่อการกระทำ (Action Feedback)

แผนที่ต้องตอบสนองเมื่อผู้เล่นทำอะไร:

| การกระทำ | สิ่งที่เกิดขึ้นบนแผนที่ | ต้องเปลี่ยน? |
|---------|----------------------|------------|
| เดิน | เดินบน grid texture → เห็นกระเบืดีเลื่อน | grid texture ใหม่ |
| ปาเรียกมอน | กระสุนบิน → มอนโผล่ → เงากระทบพื้น | เงา box ไม่กลม |
| ใช้สกิล | VFX พื้นกระจาย → สีตาม type | box + wireframe |
| จับมอน | บอลบิน → วงแหวน → สำเร็จ/ล้มเหลว | วงแหวน box wireframe |
| ปราบมอน | มอนหาย → วงแหวนกระจาย → damage number | วงแหวน box |
| เปลี่ยน Zone | พื้นเปลี่ยนสี + ท้องฟ้าเปลี่ยน + decorations เปลี่ยน | grid + sky |
| ปาบอลจับ | วงเล็งแสดง → บอลบินโค้ง → วงแหวน | วงเล็ง box |
| Evolution | แสงเรือง → สลับรูป → วงแหวนกระจาย | วงแหวน box |
| ฟักไข่ | ไข่สั่น → แตก → มอนโผล่ | Incubator box |

### 2.6.5 ความต่อเนื่องระหว่าง Zone (Zone Transition)

การเปลี่ยน zone ต้องราบรื่น ไม่กระตุก:

```
ขั้นตอน:
1. เลือก zone ใหม่
2. ลบ decorations เก่า (clearDecorations)
3. เปลี่ยนพื้น texture (setZoneGround) — preload/cache
4. เปลี่ยนท้องฟ้า (scene.background) — gradient
5. เปลี่ยน fog (scene.fog) — สี + ระยะ
6. เปลี่ยนแสง (setZoneLighting) — intensity + color
7. สร้าง decorations ใหม่ (populateWorld) — box สร้างเร็ว
8. สร้าง wild monsters ใหม่
9. อัปเดต UI (renderZoneUI)

ความราบรื่น:
- ไม่กระตุก (texture preload/cache)
- สีเปลี่ยนนุ่มนวล (fade 0.3s ถ้าได้)
- ไม่โหลดนาน (box น้อย triangle สร้างใน <16ms)
```

### 2.6.6 มุมมองกล้อง (Camera Perspective)

กล้องเป็น third-person ตามผู้เล่น:
- ระยะ: 7.4 หน่วย มุมสูง 1.15 มองไปข้างหน้า 1.5
- กระเบืดีพื้นเห็นชัดจากมุมเอียง → grid ต้องไม่มอเซอร์
- ต้นไม้/หิน ดูมีมิติจากมุมสูง → box ต้องไม่แบนเกิน
- เงาตกกระทบชัด → แสง Directional สร้างเงา box ชัดเจน

### 2.6.7 การรับรู้พื้นที่ (Spatial Awareness)

- Grid texture → บอกทิศทางและระยะ (กระเบืดีเลื่อนตอนเดิน)
- Decorations กระจาย → จุดอ้างอิง (ต้นไม้ใหญ่ = จุดสังเกต)
- ขอบเขตแผนที่ → คลุม 90×90 ผู้เล่นติดขอบ -32 ถึง +32
- Fog → กลืนวัตถุไกล → รู้สึกขอบเขต
- Zone ต่างสี → รู้ทันทีว่าอยู่ zone ไหน

### 2.6.8 การเข้าถึง (Accessibility)

- กระเบืดีพื้นไม่เล็กเกิน → มองเห็นจากไกล
- สีต่างกันพอ → ไม่งง (hub เขียว, cave เทา)
- คอนทราสต์สูง → ต้นไม้เขียวตัดกับท้องฟ้าฟ้า
- ไม่พึ่งสีเพียงอย่างเดียว → รูปทรงต่างกัน (ต้นไม้สูง, หินเตี้ย)
- ขนาดปุ่ม ≥ 44px → แตะง่ายบนมือถือ

### 2.6.9 ความรู้สึก "มีชีวิต" (Living World)

แผนที่ต้องไม่ดูตาย:

| องค์ประกอบ | วิธีทำให้มีชีวิต | Blocky? |
|-----------|----------------|---------|
| ต้นไม้ | โยนเอียงเบาๆ ตอนลม (procedural sway) | box เอียงได้ |
| หญ้า | สั่นเบาๆ ตอนเดินผ่าน | box สั่นได้ |
| ดอกไม้ | emissive glow เล็กๆ | box + emissive |
| ไข่ Incubator | หมุนเบาๆ + สั่น | box หมุนได้ |
| มอนใน Ranch | เดินวน + idle animation | Bighead monster |
| หินย้อยถ้ำ | emissive แร่เล็กๆ | box + emissive |
| เงา | ขยับตามแสง | box shadow ชัด |

### 2.6.10 Performance บนมือถือ

| ความกังวล | วิธีแก้ | Blocky ช่วย? |
|----------|--------|-------------|
| กระเบืดีพื้นมอเซอร์ | grid 16px + repeat 20× | ใช่ (canvas เล็ก) |
| decorations เยอะ triangle | box ลด 94% | ใช่ (12 tri vs 300) |
| texture memory | canvas 128×128 = 64KB | ใช่ (เล็ก) |
| shadow หนัก | box shadow ง่ายกว่า sphere | ใช่ (flat face) |
| draw calls | sharedResourceCache (มีอยู่) | ใช่ (box cache) |

---

```
---

## 2.7 รายละเอียด Asset Model (Model Spec)

### 2.7.1 หินก้อนเหลี่ยม (Rock) — Model Spec

```
โครงสร้าง: Group 3 ชิ้น (main + side + pebble)

main (ก้อนใหญ่):
  Geometry: BoxGeometry(s, s*0.8, s*0.9)
  Position: (0, s*0.4, 0)
  Scale: (1, 1.28, 1.08) — สูงกว่ากว้าง
  Rotation: Y = (x*1.7+z)*0.15 + random ±0.3
  Material: MeshStandardMaterial(tone, rough=0.95, metal=0.04)
  Texture: makeRockTexture(tone) — รอยร้าว + จุดดำ (canvas 64×64)
  Shadow: castShadow=true, receiveShadow=true

side (ก้อนข้าง):
  Geometry: BoxGeometry(s*0.5, s*0.4, s*0.5)
  Position: (s*0.55, s*0.2, s*0.18)
  Scale: (1.1, 0.8, 1) — แบนกว่า
  Material: เดียวกับ main (แชร์)
  Shadow: castShadow=true

pebble (ก้อนเล็ก):
  Geometry: BoxGeometry(s*0.25, s*0.2, s*0.25)
  Position: (-s*0.48, s*0.1, -s*0.22)
  Material: mat(tone, rough=0.99, metal=0) — เรียบกว่า
  Shadow: castShadow=true

สีตาม zone:
  hub/grassland: 0x945a38 (น้ำตาล) ±10% random
  cave: 5 โทนเทา (0x57534e, 0x44403c, 0x78716c, 0x3f3f46, 0x52525b)

Triangle: 36 (12×3)
Memory: ~2KB geometry + ~4KB texture (shared)
```

### 2.7.2 ต้นไม้เหลี่ยม (Tree) — Model Spec

```
โครงสร้าง: Group 3-6 ชิ้น (bole + mid + top + fruit×0-3)

bole (ต้น):
  Geometry: BoxGeometry(0.22*s, 1.55*s, 0.22*s) — สี่เหลี่ยมเรียว
  Position: (0, 0.78*s, 0)
  Material: MeshStandardMaterial(trunk=0x754428, rough=0.88, metal=0.02)
  Texture: makeBarkTexture(trunk) — ลายเปลือกแนวตั้ง (canvas 32×64)
  Shadow: castShadow=true

mid (พุ่มล่าง):
  Geometry: BoxGeometry(1.05*s, 1.0*s, 1.05*s) — ใหญ่
  Position: (0, 1.65*s, 0)
  Scale: (0.9+rand*0.2, 1, 0.9+rand*0.2) — ไม่สมมาตร
  Rotation: Y = rand*0.1 — หมุนเล็กน้อย
  Material: MeshStandardMaterial(leaf, rough=0.78, metal=0.03)
  Texture: makeLeafTexture(leaf) — ลายใบ + จุดสว่าง (canvas 64×64)
  Shadow: castShadow=true

top (พุ่มบน):
  Geometry: BoxGeometry(0.72*s, 0.7*s, 0.72*s) — เล็กกว่า
  Position: (0, 2.35*s, 0)
  Material: mat(leaf, rough=0.7, metal=0.04) — เรียบกว่า mid
  Shadow: castShadow=true

fruit (ผลไม้) × 0-3:
  Geometry: BoxGeometry(0.1*s, 0.1*s, 0.1*s)
  Position: ตำแหน่งสุ่มในพุ่ม
  Material: MeshStandardMaterial(fruit, emissive=fruit, emissiveIntensity=0.06, rough=0.55)
  Shadow: castShadow=true

สีใบตาม zone:
  hub: 0x18753a → 0x22c55e (เขียวเข้ม → สด)
  meadow: 0x22c55e, 0x16a34a, 0x15803d (3 โทน)
  cave: ไม่มีต้นไม้

สีผลไม้: 0xef4444 (แดง), 0xfacc15 (เหลือง), 0xf97316 (ส้ม)

Triangle: 60 (12×5) — ไม่มีผล / 96 (12×8) — มีผล 3
Memory: ~3KB geometry + ~8KB texture (shared)
```

### 2.7.3 หญ้าเหลี่ยม (Grass Tuft) — Model Spec

```
โครงสร้าง: Group 3 ชิ้น (blade × 3)

blade (ใบหญ้า):
  Geometry: BoxGeometry(0.05*s, h*s, 0.05*s) — บางสูง
  Position: (dx*s, h*0.5*s, 0) — ต่างกัน 3 ตำแหน่ง
  Rotation: Z = tilt — เอียงต่างกัน
  Material: mat(color+rand±0x080808, rough=0.86, metal=0)
  Shadow: castShadow=true (เล็ก)

ค่าตามใบ:
  ใบ 1: dx=-0.06, h=0.28, tilt=0.18
  ใบ 2: dx=0.05, h=0.34, tilt=-0.12
  ใบ 3: dx=0, h=0.22, tilt=0.04

สี: 0x3f9d4a ±10% random

Triangle: 18 (12×3) — น้อยมาก
Memory: ~1KB geometry
```

### 2.7.4 ดอกไม้เหลี่ยม (Flower) — Model Spec

```
โครงสร้าง: Group 2 ชิ้น (stem + bloom)

stem (ก้าน):
  Geometry: BoxGeometry(0.03, 0.22, 0.03) — บางเล็ก
  Position: (0, 0.11, 0)
  Material: mat(0x4ade80, rough=0.8, metal=0) — เขียว

bloom (ดอก):
  Geometry: BoxGeometry(0.1, 0.1, 0.1) — เล็ก
  Position: (0, 0.24, 0)
  Material: MeshStandardMaterial(color, emissive=color, emissiveIntensity=0.08, rough=0.5)
  Shadow: castShadow=true

สีดอก: 0xf472b6 (ชมพู), 0xfacc15 (เหลือง), 0xa78bfa (ม่วง), 0xfb7185 (ชมพูแดง)

Triangle: 12 (12×2) — น้อยสุด
Memory: ~0.5KB geometry
```

### 2.7.5 หินย้อยเหลี่ยม (Stalagmite) — Model Spec

```
โครงสร้าง: Group 3 ชิ้น (base + mid + tip)

base (ฐาน):
  Geometry: BoxGeometry(0.6*s, 0.5*s, 0.6*s) — ใหญ่
  Position: (0, 0.25*s, 0)
  Material: mat(0x64748b, rough=0.92, metal=0.08)
  Shadow: castShadow=true

mid (กลาง):
  Geometry: BoxGeometry(0.35*s, 0.5*s, 0.35*s) — ปานกลาง
  Position: (0, 0.75*s, 0)
  Material: mat(0x94a3b8, rough=0.85, metal=0.1)
  Shadow: castShadow=true

tip (ยอด):
  Geometry: BoxGeometry(0.15*s, 0.4*s, 0.15*s) — เล็กเรียว
  Position: (0, 1.2*s, 0)
  Material: MeshStandardMaterial(0x94a3b8, emissive=0x4a90d9, emissiveIntensity=0.04, rough=0.78)
  Shadow: castShadow=true

ใช้เฉพาะ cave

Triangle: 18 (12×3)
Memory: ~1.5KB geometry
```

### 2.7.6 เสารั้ว (Fence Post) — Model Spec

```
โครงสร้าง: Mesh 1 ชิ้น

post:
  Geometry: BoxGeometry(0.1, 0.7, 0.1) — แท่งเหลี่ยม
  Position: (x, 0.35, z)
  Material: mat(0x8b5e34, rough=0.86, metal=0.02) — น้ำตาลไม้
  Shadow: castShadow=true

คงเดิม — box อยู่แล้ว

Triangle: 12
Memory: ~0.3KB geometry
```

### 2.7.7 แท่นเหลี่ยม (Pad) — Model Spec

```
โครงสร้าง: 9 ชิ้น (disk + ขอบ 4 + เสามุม 4)

disk (พื้นแท่น):
  Geometry: BoxGeometry(halfSize*2, 0.02, halfSize*2) — บาง
  Position: (x, 0.025, z)
  Material: MeshBasicMaterial(color, transparent, opacity=0.2)
  ไม่มี shadow

ขอบ 4 ด้าน:
  Geometry: BoxGeometry(ขนาดตามด้าน, 0.04, 0.04) — บาง
  Position: รอบแท่น 4 ด้าน
  Material: MeshBasicMaterial(color, transparent, opacity=0.85)

เสามุม 4 จุด:
  Geometry: BoxGeometry(0.08, 0.08, 0.08) — เล็ก
  Position: 4 มุม
  Material: เดียวกับขอบ

ขนาด:
  Ranch: halfSize=3.4 → box 6.8×0.02×6.8
  Breeding: halfSize=1.6 → box 3.2×0.02×3.2

สี:
  Ranch: 0x22c55e (เขียว)
  Breeding: 0xec4899 (ชมพู)

Triangle: 108 (12×9)
Memory: ~3KB geometry
```

### 2.7.8 Incubator เหลี่ยม — Model Spec

```
โครงสร้าง: Group 2 ชิ้น (base + egg)

base (ฐาน):
  Geometry: BoxGeometry(0.9, 0.35, 0.9) — สี่เหลี่ยม
  Position: (0, 0.18, 0) — ใน group
  Material: MeshStandardMaterial(0x6d28d9, metal=0.2, rough=0.6) — ม่วง
  Shadow: castShadow=true

egg (ไข่):
  Geometry: BoxGeometry(0.5, 0.65, 0.45) — สี่เหลี่ยมผืนผ้า
  Scale: (1, 1.28, 1) — สูงกว่ากว้าง (คล้ายไข่)
  Position: (0, 0.72, 0) — ใน group
  Material: MeshStandardMaterial(0xfde68a, emissive=0x7c2d12, emissiveIntensity=0.15)
  Shadow: castShadow=true

Group Position: (5.2, 0, 8.2)
Animation: rotation.y += dt*0.12 (หมุนเบาๆ)

Triangle: 24 (12×2)
Memory: ~1KB geometry
```

### 2.7.9 VFX Ground Decal — Model Spec

```
โครงสร้าง: Group 3 ชิ้น (disc + ring + inner)

disc (พื้น):
  Geometry: BoxGeometry(size, 0.02, size) — สี่เหลี่ยมบาง
  Position: (0, 0.032, 0) — ใน group
  Material: MeshBasicMaterial(cfg.core, transparent, opacity=0.13, additive)
  size = radius * 1.4

ring (ขอบนอก):
  Geometry: BoxGeometry(ringSize, 0.02, ringSize)
  Position: (0, 0.038, 0)
  Material: MeshBasicMaterial(cfg.accent, transparent, opacity=0.42, wireframe=true)
  ringSize = size * 0.78

inner (ขอบใน):
  Geometry: BoxGeometry(innerSize, 0.02, innerSize)
  Position: (0, 0.041, 0)
  Material: MeshBasicMaterial(cfg.core, transparent, opacity=0.48, wireframe=true)
  innerSize = size * 0.24

Animation: ring.rotation.z += dt*spin, inner.rotation.z -= dt*spin*1.4
กลุ่ม: scale เพิ่มขึ้นเล็กน้อยตอน fade

สีตาม type: ดู typeFx() — 18 type แต่ละสี core + accent

Triangle: 36 (12×3) + wireframe lines
Memory: ~2KB
```

### 2.7.10 VFX Ring Pulse — Model Spec

```
โครงสร้าง: Mesh 1 ชิ้น

mesh:
  Geometry: BoxGeometry(size, 0.02, size) — สี่เหลี่ยมบาง
  Position: copy(pos) + y offset
  Material: MeshBasicMaterial(color, transparent, opacity=0.9, wireframe=true)
  size = scale * 1.2

Animation: scale ขยาย + opacity ลด (ใน update effects)

สี: ดูผู้เรียก (summon=ฟ้า, defeat=ขาว, hurt=แดง, etc.)

Triangle: 12 + wireframe lines (12 edges)
Memory: ~0.5KB
```

### 2.7.11 ตารางสรุป Asset Model ทั้งหมด

| Model | ชิ้นย่อย | Triangle | Texture | Memory | Shadow | Emissive |
|-------|---------|---------|---------|--------|--------|----------|
| หิน (Rock) | 3 box | 36 | crack 64² | ~6KB | ใช่ | ไม่ |
| ต้นไม้ (Tree) | 3-6 box | 60-96 | bark+leaf | ~11KB | ใช่ | ผลไม้ |
| หญ้า (Grass) | 3 box | 18 | ไม่มี | ~1KB | เล็ก | ไม่ |
| ดอกไม้ (Flower) | 2 box | 12 | ไม่มี | ~0.5KB | เล็ก | ใช่ |
| หินย้อย (Stalagmite) | 3 box | 18 | ไม่มี | ~1.5KB | ใช่ | ยอด |
| เสารั้ว (Fence) | 1 box | 12 | ไม่มี | ~0.3KB | ใช่ | ไม่ |
| แท่น (Pad) | 9 box | 108 | ไม่มี | ~3KB | ไม่ | ไม่ |
| Incubator | 2 box | 24 | ไม่มี | ~1KB | ใช่ | ไข่ |
| VFX Decal | 3 box | 36 | ไม่มี | ~2KB | ไม่ | additive |
| VFX Ring | 1 box | 12 | ไม่มี | ~0.5KB | ไม่ | additive |
| **พื้น (Ground)** | 1 plane | 2 | grid 128² | ~65KB | receive | ไม่ |

รวมต่อ zone:
- Hub: 6 rock + 6 tree + 10 fence + 4 flower + 4 grass + 2 pad + incubator = ~530 triangles
- Meadow: 6 rock + 7 tree + 8 grass + 3 flower = ~420 triangles
- Cave: 6 rock + 7 stalagmite = ~270 triangles

### 2.7.12 Material ที่ใช้ทั้งหมด

| Material Type | ใช้กับ | Properties |
|--------------|--------|-----------|
| MeshStandardMaterial | หิน, ต้นไม้, หินย้อย, Incubator | color, roughness, metalness, map (texture) |
| MeshBasicMaterial | แท่น, VFX | color, transparent, opacity, wireframe, additive |
| MeshStandardMaterial + emissive | ดอกไม้, ผลไม้, ไข่, หินย้อยยอด | emissive color + intensity |

### 2.7.13 Texture ทั้งหมด

| Texture | ขนาด | ใช้กับ | เนื้อหา |
|---------|------|--------|--------|
| Ground Grid | 128×128 | พื้น | grid 2 ชั้น + noise + zone-specific |
| Rock Crack | 64×64 | หิน | รอยร้าว + จุดดำ |
| Tree Bark | 32×64 | ต้นไม้ต้น | ลายเปลือกแนวตั้ง |
| Leaf Pattern | 64×64 | ต้นไม้พุ่ม | จุดใบ + จุดสว่าง |
| Sky Gradient | 2×128 | ท้องฟ้า | gradient บน→ล่าง |

รวม: 5 texture ~85KB (กระจาย: ground 65KB + rock 4KB + bark 2KB + leaf 4KB + sky 1KB + cache 9KB)

### 2.7.14 Geometry Cache Strategy

```js
// ทุก box ใช้ cachedGeometry (มีอยู่แล้วใน game-v800.js)
const boxGeometry = (w, h, d) => cachedGeometry('box', [w, h, d], THREE.BoxGeometry);

// แต่ละขนาดแคชครั้งเดียว — ใช้ซ้ำได้
// หิน 6 ก้อน ขนาดต่างกัน → 6 geometry cache entries
// ต้นไม้ 6 ต้น ขนาดต่างกัน → 6 geometry cache entries
// แต่ละ entry: BoxGeometry = 24 vertices, 12 triangles ≈ 288 bytes
// รวม: ~20 entries × 288 bytes ≈ 6KB geometry cache
```

---
```

### 3.0 ภาพรวมโครงสร้าง Blocky World

โครงสร้าง Blocky World แบ่งเป็น 5 ชั้น:

```
ชั้น 1: Sky Dome (ท้องฟ้า)
  └─ gradient texture (canvas 2×128) — สีต่างกันตาม zone
  └─ Fog — กลืนวัตถุไกล ระยะต่างกันตาม zone

ชั้น 2: Ground Plane (พื้นดิน)
  └─ Plane 90×90 หน่วย — คลุมทั้งแผนที่
  └─ Grid texture (canvas 128×128 repeat 20×) — กระเบืดีๆ
  └─ receiveShadow — รับเงาจากทุกชิ้นบน

ชั้น 3: Decorations Layer (ของตกแต่ง)
  └─ Group "worldDecorations" — ลบ/สร้างใหม่ตอนเปลี่ยน zone
  └─ หิน (box ซ้อน) / ต้นไม้ (box) / หญ้า (box บาง)
  └─ ดอกไม้ (box) / หินย้อย (box ซ้อนเรียว) / รั้ว (box)
  └─ ทุกชิ้น: castShadow=true

ชั้น 4: Structures Layer (โครงสร้าง)
  └─ แท่น Ranch (box สี่เหลี่ยม + ขอบ)
  └─ แท่น Breeding (box สี่เหลี่ยม + ขอบ)
  └─ Incubator (box ฐาน + box ไข่)
  └─ NPC (Bighead แล้ว) / Player (Bighead แล้ว)
  └─ มอนใน Ranch (Bighead ตามแผน)

ชั้น 5: Effects Layer (VFX)
  └─ VFX พื้น (box + wireframe) — สีตาม type
  └─ VFX วงแหวน (box wireframe) — สีตามเหตุการณ์
  └─ Damage numbers / Floating text
  └─ Particle sparks (sphere เล็ก หรือ sprite)
```

### 3.1 แผนที่จากมุมมองโครงสร้าง

```
                    ┌─── ชั้น 1: Sky + Fog ───┐
                    │  gradient + fog color    │
                    │  (zone-specific)         │
                    └──────────────────────────┘
                    
     ┌──┐                        ┌──┐
     │🌳│  ชั้น 3: Decorations   │🪨│
     │  │  (worldDecorations)    │  │
     └──┘                        └──┘
          ┌─┐    ┌───┐    ┌─┐
          │🌿│    │🥚│    │🌸│  ชั้น 4: Structures
          └─┘    └───┘    └─┘  (pads/incubator/NPC)
     ═══════════════════════════════════════
     ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  ชั้น 2: Ground
     ░░░░░░ grid texture 128² repeat 20× ░░░  (plane 90×90)
     ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
                    ↓                        ชั้น 5: VFX
              ┌──────────┐                    (box wireframe
              │ VFX box  │                     สีตาม type)
              └──────────┘
```

### 3.2 ระบบพิกัด (Coordinate System)

```
แกน X: -32 ถึง +32 (ซ้าย-ขวา) — ผู้เล่นติดขอบที่ ±32
แกน Z: -32 ถึง +32 (หน้า-หลัง) — ผู้เล่นติดขอบที่ ±32
แกน Y: 0 = พื้น — ทุกชิ้นวางบน Y=0 ยกเว้นลอย (ghost)

จุดสำคัญ:
  (0,0) = จุดเริ่มต้นผู้เล่น
  (4,3) = NPC (Keeper)
  (7,3) = ลาน Ranch (ranchCenter)
  (5.2,8.2) = ลาน Breeding + Incubator

ขอบเขต:
  พื้น: 90×90 (ใหญ่กว่าขอบเขตผู้เล่น ±32)
  ขอบเขตผู้เล่น: ±32 (ติดขอบไม่ออก)
  Decorations: กระจายใน ±21 (ไม่เกินขอบ)
  Wild Monster: กระจายใน ±15
```

### 3.3 ระบบ Scene Graph

```js
// โครงสร้าง Three.js Scene ปัจจุบัน:
scene
├── HemisphereLight      // แสงจากทุกทิศ
├── DirectionalLight     // แสงดวงอาทิตย์ (sun)
├── Mesh (ground)        // พื้น 90×90
├── Group (decorations)  // worldDecorations — ลบ/สร้างตอนเปลี่ยน zone
│   ├── Group (rock1)    // หินก้อนที่ 1
│   │   ├── Mesh (main)  // ก้อนใหญ่
│   │   ├── Mesh (side)  // ก้อนข้าง
│   │   └── Mesh (pebble)// ก้อนเล็ก
│   ├── Group (tree1)    // ต้นไม้ต้นที่ 1
│   │   ├── Mesh (bole)  // ต้น
│   │   ├── Mesh (mid)   // พุ่มล่าง
│   │   ├── Mesh (top)   // พุ่มบน
│   │   └── Mesh×3 (fruit)// ผลไม้ (ถ้ามี)
│   ├── Mesh (fence1)    // เสารั้ว
│   ├── Mesh (fence2)
│   └── ... 
├── Mesh (ranchPad disk) // แท่น Ranch
├── Mesh (breedingPad)   // แท่น Breeding
├── Group (incubator)    // Incubator
│   ├── Mesh (baseInc)   // ฐาน
│   └── Mesh (eggVisual) // ไข่
├── Group (player)       // ผู้เล่น (Bighead)
├── Group (npc)          // NPC (Bighead)
├── Group (wild monsters)// มอนป่า
├── Group (ranch visuals)// มอนในลาน
└── effects[]            // VFX ชั่วคราว
```

### 3.4 ระบบเปลี่ยน Zone (Zone Switching)

```js
// populateWorld(zone) — สลับ decorations ตาม zone
function populateWorld(zone) {
  // 1. ลบ decorations เก่าทั้งหมด
  clearDecorations(); // dispose geometry + material
  
  // 2. สร้าง decorations ใหม่ตาม zone
  if (zone === 'hub') {
    // หิน 6 + ต้นไม้ 6 + รั้ว 10 + ดอก 4 + หญ้า 4
  } else if (zone === 'grassland') {
    // หิน 6 + ต้นไม้ 7 + หญ้า 8 + ดอก 3
  } else if (zone === 'cave') {
    // หิน 6 + หินย้อย 7
  }
  
  // 3. เปลี่ยนพื้น texture + ท้องฟ้า + fog + แสง
  setZoneGround(zone);
  setZoneLighting(zone);
}

// ความเร็ว: box สร้าง ~30 ชิ้น ใน <16ms (1 frame)
// เพราะ: cachedGeometry + shared material + น้อย triangle
```

### 3.5 ระบบ Cache ที่เกี่ยวข้อง

| Cache | ฟังก์ชัน | ขนาด | ใช้ซ้ำ |
|-------|----------|------|--------|
| Geometry Cache | `cachedGeometry()` | ~20 entries | ทุก box ขนาดเดียวกัน |
| Material Cache | `sharedResources.material()` | ~10 entries | สีเดียวกัน = material เดียวกัน |
| Texture Cache | `groundTexCache{}` | 3 entries (3 zones) | พื้น texture ต่อ zone |
| Sky Cache | `skyTexCache{}` | 3 entries | gradient ต่อ zone |
| Rock Texture | `rockTexCache{}` | ~5 entries | ต่อโทนสี |
| Bark Texture | `barkTexCache{}` | ~3 entries | ต่อสีต้น |
| Leaf Texture | `leafTexCache{}` | ~5 entries | ต่อสีใบ |

### 3.6 ระบบ Shadow

```
แสงดวงอาทิตย์ (DirectionalLight):
  - ตำแหน่ง: (9, 18, 8) — สูงเฉียง
  - castShadow: true (ถ้า qualityProfile.shadows)
  - สร้างเงา: ทุกชิ้นที่ castShadow=true

พื้น (ground):
  - receiveShadow: true — รับเงาจากทุกชิ้น

Decorations:
  - หิน: castShadow=true (เงาเหลี่ยมชัด)
  - ต้นไม้: castShadow=true (เงายาว)
  - หญ้า: castShadow=true (เงาเล็ก)
  - ดอกไม้: castShadow=true (เงาจุด)
  - หินย้อย: castShadow=true (เงาแหลม)

Box shadow vs Sphere shadow:
  - Box: เงาเหลี่ยมชัดเจน — ดูเป็น blocky
  - Sphere: เงากลมเลือน — ดูนุ่ม
  - Blocky shadow เข้ากับ theme

Cave:
  - แสงน้อย → เงาสั้น + มืด
  - แสงเย็น (0xb0c4de) → เงาเย็น
```

### 3.7 ระบบ LOD (Level of Detail)

ไม่มี LOD ในปัจจุบัน แต่ box ไม่จำเป็นเพราะ:
- 12 triangle/box — น้อยมาก ไม่กระทบแม้ไกล
- Fog กลืนวัตถุไกลอยู่แล้ว
- sharedResourceCache ลด draw calls

ถ้าอนาคตต้องการ LOD:
```
ใกล้ (0-20):  box เต็ม (3 ก้อน)
กลาง (20-50): box 2 ก้อน (ตัด pebble)
ไกล (50+):   box 1 ก้อน (ตัด side+pebble)
→ แต่ไม่จำเป็นตอนนี้ เพราะ 12 tri ไม่กระทบ
```

### 3.8 ระบบ Dispose (การทำลาย resource)

```js
// ตอนเปลี่ยน zone: ลบ decorations เก่า
function clearDecorations() {
  while (decorations.children.length) {
    const child = decorations.children[0];
    // dispose geometry (ไม่ dispose cache แชร์!)
    // dispose material (ไม่ dispose cache แชร์!)
    // dispose texture (ไม่ dispose cache แชร์!)
    removeAndDispose(decorations, child);
  }
}

// สำคัญ: ใช้ cachedGeometry + sharedResources.material
// → ไม่ dispose cache เพราะใช้ซ้ำได้
// → dispose เฉพาะที่ไม่ได้ cache
```

### 3.9 ขนาดแผนที่ (World Bounds)

```
พื้น: 90×90 หน่วย (ใหญ่กว่าขอบเขตผู้เล่น)
ขอบเขตผู้เล่น: ±32 = 64×64 หน่วย
Decorations: กระจายใน ±21 = 42×42 หน่วย
Wild: กระจายใน ±15 = 30×30 หน่วย
Ranch: ศูนย์กลาง (7,3) รัศมี 3.55
Breeding: (5.2, 8.2) รัศมี 1.6
Incubator: (5.2, 0, 8.2)

กล้อง: ระยะ 7.4 สูง 1.15 มองไกล 1.5
  → ผู้เล่นเห็นรอบตัว ~15 หน่วย
  → ขอบเขตมองเห็น ~30 หน่วย
  → Fog 30-76 กลืนขอบ
  → Cave fog 15-50 กลืนใกล้กว่า
```

### 3.10 Performance Budget ต่อ Frame

| งาน | เวลาต่อ frame | หมายเหตุ |
|-----|---------------|---------|
| Render scene | ~3-5ms | ~500-1000 triangles + shadows |
| Update wilds AI | ~1-2ms | distance tick scheduler |
| Update effects | ~0.5ms | effects + groundDecals |
| Update animations | ~0.5ms | animateMonster + animateHumanoid |
| Update camera | ~0.1ms | lerp + shake |
| **รวม** | **~5-8ms** | **60 FPS = 16ms budget** |

Blocky ช่วย: ลด triangle 94% → render เร็วขึ้น → เหลือเวลาสำหรับ AI/effect

### 3.11 โครงสร้าง Mesh Hierarchy (Mesh Tree)

แต่ละ decoration มีโครงสร้างภายในที่ซ้อนกัน:

```
หิน (Rock) — Group
├── main: Mesh
│   ├── geometry: BoxGeometry(s, s*0.8, s*0.9) [cached]
│   ├── material: MeshStandardMaterial [cached by color]
│   ├── position: (0, s*0.4, 0)
│   ├── scale: (1, 1.28, 1.08)
│   ├── rotation: Y = deterministic + random
│   └── castShadow: true
├── side: Mesh
│   ├── geometry: BoxGeometry(s*0.5, s*0.4, s*0.5) [cached]
│   ├── material: แชร์กับ main [same cache entry]
│   ├── position: (s*0.55, s*0.2, s*0.18)
│   └── castShadow: true
└── pebble: Mesh
    ├── geometry: BoxGeometry(s*0.25, s*0.2, s*0.25) [cached]
    ├── material: MeshStandardMaterial (rough=0.99) [cached]
    ├── position: (-s*0.48, s*0.1, -s*0.22)
    └── castShadow: true

ต้นไม้ (Tree) — Group
├── bole: Mesh (ต้น)
│   ├── geometry: BoxGeometry(0.22*s, 1.55*s, 0.22*s) [cached per scale]
│   ├── material: MeshStandardMaterial(trunk) [cached by color]
│   ├── map: barkTexture [cached by trunk color]
│   └── castShadow: true
├── mid: Mesh (พุ่มล่าง)
│   ├── geometry: BoxGeometry(1.05*s, 1.0*s, 1.05*s) [cached per scale]
│   ├── material: MeshStandardMaterial(leaf) [cached by color]
│   ├── map: leafTexture [cached by leaf color]
│   ├── scale: (0.9+rand, 1, 0.9+rand) — ไม่สมมาตร
│   └── castShadow: true
├── top: Mesh (พุ่มบน)
│   ├── geometry: BoxGeometry(0.72*s, 0.7*s, 0.72*s) [cached per scale]
│   ├── material: mat(leaf, rough=0.7) [cached — เรียบกว่า mid]
│   └── castShadow: true
└── fruit×0-3: Mesh (ผลไม้)
    ├── geometry: BoxGeometry(0.1*s, 0.1*s, 0.1*s) [cached]
    ├── material: MeshStandardMaterial(fruit, emissive) [cached]
    └── castShadow: true

Incubator — Group
├── baseInc: Mesh
│   ├── geometry: BoxGeometry(0.9, 0.35, 0.9) [cached]
│   ├── material: MeshStandardMaterial(0x6d28d9) [cached]
│   └── castShadow: true
└── eggVisual: Mesh
    ├── geometry: BoxGeometry(0.5, 0.65, 0.45) [cached]
    ├── material: MeshStandardMaterial(0xfde68a, emissive) [cached]
    ├── scale: (1, 1.28, 1)
    └── castShadow: true
```

### 3.12 โครงสร้าง Material Pipeline

วิธีที่ material ถูกสร้าง แคช และใช้ซ้ำ:

```
สร้าง Material
    │
    ├─ mat(color, rough, metal)
    │   └─ key = `${color}:${rough}:${metal}`
    │   └─ ถ้า cache มี → คืน cache
    │   └─ ถ้าไม่มี → new MeshStandardMaterial → cache → คืน
    │
    ├─ mat(color, rough, metal, texture)
    │   └─ key = `tex:${color}:${texture.uuid}`
    │   └─ ถ้า cache มี → คืน cache
    │   └─ ถ้าไม่มี → new MeshStandardMaterial({map:texture}) → cache → คืน
    │
    └─ MeshBasicMaterial (แท่น/VFX)
        └─ key = `basic:${color}:${opacity}`
        └─ ถ้า cache มี → คืน cache
        └─ ถ้าไม่มี → new → cache → คืน

การแชร์:
  หิน 6 ก้อน สีเดียวกัน → 1 material (แชร์)
  ต้นไม้ 6 ต้น ใบสีเดียวกัน → 1 material (แชร์)
  แต่ถ้าสีต่างกัน ±10% → material ต่างกัน (ไม่แชร่)
  → สุ่ม ±10% ทำให้ material เพิ่ม ~2-3 entries ต่อ type
```

### 3.13 โครงสร้าง Texture Pipeline

วิธีที่ texture ถูกสร้าง แคช และใช้:

```
Ground Texture
    │
    ├─ makeGroundTexture(zoneColor, zoneType)
    │   ├─ key = zoneColor + ':' + zoneType
    │   ├─ ถ้า cache มี → คืน cache
    │   ├─ ถ้าไม่มี:
    │   │   ├─ Canvas 128×128
    │   │   ├─ พื้นหลัง: zoneColor
    │   │   ├─ Grid ชั้น 1: 16px สีดำโปร่งใส 10%
    │   │   ├─ Grid ชั้น 2: 64px สีดำโปร่งใส 6% (ใหญ่กว่า)
    │   │   ├─ Noise: จุดขาว 40 จุด
    │   │   ├─ Zone-specific:
    │   │   │   ├─ cave: จุดดำ 20 จุด (หิน)
    │   │   │   └─ grass: จุดเขียวเข้ม 30 จุด (หญ้า)
    │   │   ├─ CanvasTexture → cache → คืน
    │   │   └─ repeat: (20, 20) — กระเบืดีเล็ก
    │   └─ Dispose: ตอนเปลี่ยน zone (ไม่ใช้แล้ว)

Decoration Texture
    │
    ├─ makeRockTexture(tone)
    │   ├─ key = tone
    │   ├─ Canvas 64×64
    │   ├─ พื้นหลัง: tone
    │   ├─ รอยร้าว: เส้นดำ 4 เส้น
    │   ├─ จุดดำ: 8 จุด
    │   └─ cache → คืน (ใช้ซ้ำทุกหินสีเดียวกัน)
    │
    ├─ makeBarkTexture(trunkColor)
    │   ├─ key = trunkColor
    │   ├─ Canvas 32×64
    │   ├─ พื้นหลัง: trunkColor
    │   ├─ ลายเปลือก: เส้นดำแนวตั้ง 4 เส้น
    │   └─ cache → คืน
    │
    └─ makeLeafTexture(leafColor)
        ├─ key = leafColor
        ├─ Canvas 64×64
        ├─ พื้นหลัง: leafColor
        ├─ จุดใบ: 15 จุดดำ
        ├─ จุดสว่าง: 10 จุดขาว
        └─ cache → คืน

Sky Texture
    │
    └─ makeSkyTexture(zoneColor)
        ├─ key = zoneColor
        ├─ Canvas 2×128 (เล็กมาก)
        ├─ Gradient:
        │   ├─ hub/grassland: สีเข้มบน → สีสว่างล่าง
        │   └─ cave: ดำบน → เทาล่าง (3 stops)
        └─ cache → คืน
```

### 3.14 โครงสร้าง Render Pipeline

ลำดับการ render ในแต่ละ frame:

```
requestAnimationFrame(loop)
    │
    ├─ 1. Update dt (delta time)
    │
    ├─ 2. Update input
    │   ├─ joystick / keys / touch
    │   └─ player movement
    │
    ├─ 3. Update game logic
    │   ├─ updatePlayer(dt)
    │   ├─ updateWilds(dt) — distance tick scheduler
    │   ├─ updateOwned(dt) — active summon AI
    │   ├─ updateProjectiles(dt)
    │   ├─ updateEffects(dt) — sparks + rings
    │   ├─ updateGroundDecals(dt)
    │   ├─ updateFloatingTexts(dt)
    │   ├─ updateRanchVisuals(dt)
    │   ├─ updateNpcUI()
    │   └─ applyLifeSimulation() — if manager open
    │
    ├─ 4. Update camera
    │   ├─ updateCamera(dt) — lerp follow + shake
    │   └─ updateWorldLabels() — position labels
    │
    ├─ 5. Update animations
    │   ├─ animateHumanoid(player, dt, moving)
    │   ├─ animateHumanoid(npc, dt, false)
    │   └─ animateMonster(mesh, dt, moving) — per wild + ranch
    │
    ├─ 6. Render
    │   ├─ renderer.render(scene, camera)
    │   ├─ Three.js pipeline:
    │   │   ├─ Frustum cull (ไม่ render ของนอกจอ)
    │   │   ├─ Opaque pass (ground + decorations + structures)
    │   │   ├─ Transparent pass (VFX + pads)
    │   │   └─ Shadow pass (ถ้า shadows enabled)
    │   └─ ผลลัพธ์: canvas แสดงบนจอ
    │
    └─ 7. managerDirty check — re-render UI ถ้าจำเป็น
```

### 3.15 โครงสร้าง Event System (ในแผนที่)

เหตุการณ์ที่เกิดบนแผนที่และการตอบสนอง:

```
เหตุการณ์                    → การตอบสนองของแผนที่
────────────────────────    ────────────────────────────
ผู้เล่นเดิน                   → grid texture เลื่อน (visual cue)
ผู้เล่นปาเรียกมอน             → projectile บิน → spawnOwned → mesh + shadow
มอนโจมตี (useSkill)          → spawnElementalFX → spawnGroundDecal (box)
มอนถูกตี (damageWild)        → spawnDamageNumber → spawnRingPulse (box wireframe)
มอนปราบ (defeatWild)        → removeAndDispose mesh → spawnRingPulse → respawn
ผู้เล่นจับมอน (captureThrow)  → captureAim → projectile → spawnRingPulse → success/fail
มอน Faint (faintActive)     → spawnBurst → removeAndDispose → summonCooldown
ผู้เล่นเปลี่ยน zone           → clearDecorations → populateWorld → setZoneGround
มอนเข้าลาน (toggleRanchActive)→ syncRanchVisuals → monsterMesh → setupMonsterMotion
เปิด Manager                 → applyLifeSimulation → renderManager (ไม่เกี่ยวแผนที่)
ฟักไข่ (hatchEgg)            → makeChild → monsterMesh → scene.add
Evolution (evolveMonster)    → refreshStats → syncRanchVisuals (เปลี่ยนรูป)
Raising Event                → showEventPopup (ไม่เกี่ยวแผนที่โดยตรง)
```

### 3.16 โครงสร้างWild Monster Spawn

```
ZONES[zone].spawn  — array ของ [speciesId, x, z, level, opts]
    │
    ├─ populateWorld สร้าง decorations
    ├─ แล้วสร้าง wild monsters:
    │   for (const [spId, x, z, level, opts] of ZONES[zone].spawn) {
    │     const sp = spById[spId];
    │     const wild = createWild(sp, x, z, level, opts);
    │     wilds.push(wild);
    │   }
    │
    ├─ createWild:
    │   ├─ สร้าง mesh: monsterMesh(sp, false, renderInst, elite, boss)
    │   ├─ ตั้ง position: (x, 0, z)
    │   ├─ ตั้ง userData: worldRole='wild', speciesId, level, hp, etc.
    │   ├─ home position: จุดเกิด (สำหรับ leash)
    │   ├─ respawn timer
    │   └─ scene.add(mesh)
    │
    └─ ตอนเปลี่ยน zone:
        ├─ ลบ wilds เก่า: removeAndDispose ทุกตัว
        ├─ สร้าง wilds ใหม่จาก ZONES[zone].spawn
        └─ wilds = []
```

### 3.17 โครงสร้าง Ranch Visuals

```
state.ranchActive — array ของ instanceId (สูงสุด 6)
    │
    ├─ syncRanchVisuals():
    │   ├─ ลบ ranchVisuals เก่าทั้งหมด
    │   ├─ กรองเฉพาะที่ยังใน storage
    │   ├─ จำกัด 6 ตัว
    │   ├─ สำหรับแต่ละตัว:
    │   │   ├─ สร้าง mesh: monsterMesh(sp, true, inst) — Bighead
    │   │   ├─ ตั้ง position: วงกลมรอบ ranchCenter (7,0,3) รัศมี 1.8
    │   │   ├─ ตั้ง userData: worldRole='ranchVisual'
    │   │   ├─ setupMonsterMotion(mesh, sp, inst)
    │   │   └─ ranchVisuals.set(id, {mesh, phase, home})
    │   └─ scene.add ทุก mesh
    │
    ├─ updateRanchVisuals(dt):
    │   ├─ แต่ละมอนเดินวนเป็นวงกลม
    │   ├─ phase += dt * 0.55
    │   ├─ position = home + cos/sin * radius
    │   └─ animateMonster(mesh, dt, moving)
    │
    └─ ตอนเปลี่ยน zone:
        └─ syncRanchVisuals() — สร้างใหม่ถ้าเข้า hub
```

### 3.18 โครงสร้าง Hub Visibility

```
setHubVisibility(on):
    ├─ npc.visible = on            — ซ่อน/แสดง NPC
    ├─ ranchPad.disk.visible = on  — ซ่อน/แสดงแท่น Ranch
    ├─ breedingPad.disk.visible = on — ซ่อน/แสดงแท่น Breeding
    └─ incubator.visible = on      — ซ่อน/แสดง Incubator

เรียกเมื่อ: เปลี่ยน zone
  hub → on=true (แสดงทุกอย่าง)
  grassland/cave → on=false (ซ่อน ไม่มีใน zone อื่น)
```


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
- **โครงสร้าง Blocky World:**
  - 5 ชั้น: Sky → Ground → Decorations → Structures → Effects
  - ระบบพิกัด: X/Z ±32, Y=0 พื้น, จุดสำคัญ 4 จุด
  - Scene Graph: scene → lights → ground → decorations → structures → player/npc → wilds → effects
  - Zone Switching: clearDecorations → populateWorld → setZoneGround/Lighting (<16ms)
  - Cache: 7 ระบบ (geometry/material/texture/ground/sky/rock/bark/leaf)
  - Shadow: DirectionalLight + castShadow ทุกชิ้น (box shadow เหลี่ยมชัด)
  - LOD: ไม่จำเป็น (12 tri/box ไม่กระทบ) + Fog กลืนไกล
  - Dispose: ใช้ cache ไม่ dispose แชร์
  - World Bounds: พื้น 90×90, ผู้เล่น ±32, มองเห็น ~30, Fog กลืนขอบ
  - Performance: ~5-8ms/frame (60 FPS = 16ms budget)
  - 10 model specs (Rock/Tree/Grass/Flower/Stalagmite/Fence/Pad/Incubator/VFX Decal/VFX Ring)
  - แต่ละ model: geometry + position + scale + rotation + material + texture + shadow + emissive
  - ตารางสรุป: ชิ้นย่อย/triangle/texture/memory/shadow/emissive
  - 5 procedural texture (ground/rock/bark/leaf/sky) ~85KB รวม
  - 3 material types (Standard/Basic/Standard+emissive)
  - Geometry cache: ~20 entries ~6KB
  - Triangle ต่อ zone: hub ~530 / meadow ~420 / cave ~270
  - Player Journey: hub → meadow → cave → กลับ hub (วงจรเต็ม)
  - Zone Feel: hub=ปลอดภัย, meadow=ผจญภัย, cave=อันตราย
  - Visual Landmarks: NPC, Incubator, ลาน, รั้ว, Boss เห็นจากไกล
  - Action Feedback: เดิน/สกิล/จับ/เปลี่ยนzone แผนที่ตอบสนอง
  - Zone Transition: ราบรื่น ไม่กระตุก (box สร้างเร็ว <16ms)
  - Spatial Awareness: grid บอกทิศ + fog บอกขอบเขต
  - Accessibility: คอนทราสต์สูง + รูปทรงต่างกัน + ปุ่ม ≥44px
  - Living World: ต้นไม้เอียง + หญ้าสั่น + ดอกไม้ glow + ไข่หมุน
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