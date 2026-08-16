# Monster Life RPG — V8.0 Blocky Map Theme Plan
## แผนพัฒนาแผนที่ Theme เหลี่ยม (Blocky World)

> สร้าง: 2026-08-16
> เวอร์ชัน: 1.0
> เป้าหมาย: แปลงแผนที่เกมจาก Legacy (sphere/cone/cylinder โค้งมน) เป็น Blocky (box เหลี่ยม) ให้เข้ากับ theme Bighead Blocky ของมอนและ humanoid
> หลัก: เปลี่ยนของเก่า ไม่ทำเพิ่มใหม่

---

## สารบัญ

1. สถานะปัจจุบัน — แผนที่ที่มี
2. หลักการแปลง
3. โครงสร้าง Blocky World
4. แผนที่ทั้ง 3 Zone
5. Blocky Ground + Texture
6. Blocky Decorations
7. Blocky Structures (NPC/Incubator/Pads)
8. Blocky VFX Ground Decals
9. Sky + Fog + Lighting
10. ลำดับการทำ (Phases)
11. ไฟล์ที่กระทบ
12. การตรวจรับ
13. ข้อควรระวัง

---

## 1. สถานะปัจจุบัน — แผนที่ที่มี

### 1.1 โครงสร้างปัจจุบัน

| องค์ประกอบ | ปัจจุบัน (Legacy) | ฟังก์ชัน |
|-----------|------------------|----------|
| พื้นดิน | Plane 90×90 สีทึบ | `ground` |
| ท้องฟ้า | Color 0x65c9f5 | `scene.background` |
| Fog | Fog 0x65c9f5 30-76 | `scene.fog` |
| แสง | Hemisphere + Directional | 2 ดวง |
| ก้อนหิน | dodecahedron (โค้งมน) | `makeRock()` |
| ต้นไม้ | cylinder ต้น + cone พุ่ม | `makeTree()` |
| หญ้า | cone เล็ก 3 ใบ | `makeGrassTuft()` |
| ดอกไม้ | cylinder ก้าน + sphere ดอก | `makeFlower()` |
| หินย้อยถ้ำ | cone แหลม | `makeStalagmite()` |
| เสารั้ว | box (เหลี่ยมอยู่แล้ว) | `makeFencePost()` |
| แท่น Ranch | circle + ring กลม | `makePad()` |
| แท่น Breeding | circle + ring กลม | `makePad()` |
| Incubator | cylinder ฐาน + sphere ไข่ | `incubator` |
| NPC | Bighead Blocky (แล้ว) | `assets.spawn()` |
| Player | Bighead Blocky (แล้ว) | `assets.spawn()` |
| มอน | Legacy (ยังไม่เปลี่ยน) | `makeSpeciesMesh()` |

### 1.2 Zone ทั้ง 3

| Zone | ชื่อ | สีท้องฟ้า | สีพื้น | Decorations |
|------|-----|----------|--------|-------------|
| hub | Ranch Hub | 0x72c7ef (ฟ้าสดใส) | 0x62c96b (เขียว) | หิน 6 + ต้นไม้ 6 + รั้ว + ดอกไม้ 4 + หญ้า 4 |
| grassland | Green Meadow | 0x68d2f5 (ฟ้าอ่อน) | 0x56d364 (เขียวสด) | หิน 6 + ต้นไม้ 7 + หญ้า 8 + ดอกไม้ 3 |
| cave | Echo Cave | 0x334155 (เทาเข้ม) | 0x57606f (เทา) | หิน 6 + หินย้อย 7 |

### 1.3 สรุป
NPC + Player = Bighead แล้ว แต่แผนที่ยังเป็น Legacy ทั้งหมด

---

## 2. หลักการแปลง

1. **เปลี่ยนของเก่า ไม่ทำใหม่** — แปลง decorations ที่มีอยู่ ไม่เพิ่ม zone ใหม่
2. **สไตล์ Blocky** — ทุกอย่างเป็น box/cube ไม่มี sphere/cone/cylinder โค้งมน
3. **เข้ากับ Bighead** — มอนและ humanoid เป็นเหลี่ยม แผนที่ต้องเหลี่ยมด้วย
4. **คงโครงสร้าง 3 Zone** — hub/grassland/cave เหมือนเดิม
5. **คงตำแหน่ง** — พิกัด decorations เหมือนเดิม เปลี่ยนแค่รูปทรง
6. **Voxel-ish ไม่ใช่ Minecraft** — เหลี่ยมแต่ยังสวย มีสีสัน ไม่เป็น cube ล้วน
7. **Performance ดีขึ้น** — box น้อย triangle กว่า sphere/cone/cylinder
8. **Texture เพิ่มได้** — พื้นผิว box ง่ายต่อการใส่ texture

---

## 3. โครงสร้าง Blocky World

### 3.1 เปรียบเทียบ Legacy vs Blocky

```
Legacy (ปัจจุบัน)           Blocky (เป้าหมาย)
──────────────────          ──────────────────
พื้น: plane สีทึบ            พื้น: plane + grid texture (กระเบืดีๆ)
หิน: dodecahedron โค้ง      หิน: box ซ้อนกัน (ก้อนเหลี่ยม)
ต้นไม้: cylinder + cone     ต้นไม้: box ต้น + box พุ่ม (เหลี่ยม)
หญ้า: cone เล็ก             หญ้า: box บางตั้ง (ใบเหลี่ยม)
ดอกไม้: cylinder + sphere   ดอกไม้: box ก้าน + box ดอก
หินย้อย: cone แหลม          หินย้อย: box ซ้อนเล็กลง (แหลมเหลี่ยม)
รั้ว: box (เหลี่ยมอยู่แล้ว)   รั้ว: box (คงเดิม)
แท่น: circle + ring กลม     แท่น: box สี่เหลี่ยม + ขอบ
Incubator: cylinder + sphere Incubator: box ฐาน + box ไข่
```

### 3.2 โครง Blocky World

```
        ┌─────────────────────────────────────┐
        │         ท้องฟ้า (สี)                 │
        │                                     │
        │    ┌──┐          ┌──┐              │
        │    │🌳│          │🪨│              │
        │    └──┘          └──┘              │
        │                                     │
        │   ┌─┐    ┌───┐    ┌─┐              │
        │   │🌿│    │ 🥚│    │🌸│             │
        │   └─┘    └───┘    └─┘              │
        │                                     │
        │  ░░░░░░░░░░░░░░░░░░░░░░░░░░        │
        │  ░░░░░░░ พื้น grid ░░░░░░░░        │
        │  ░░░░░░░░░░░░░░░░░░░░░░░░░░        │
        └─────────────────────────────────────┘
        
        ทุกอย่างเป็น box เหลี่ยม
        พื้นมี grid texture (กระเบืดีๆ)
```

---

## 4. แผนที่ทั้ง 3 Zone

### 4.1 Ranch Hub (บ้าน)

```
สีท้องฟ้า: 0x72c7ef (ฟ้าสดใส) — เหมือนเดิม
สีพื้น: 0x62c96b (เขียว) + grid texture

Decorations (ตำแหน่งเดิม รูปทรงเปลี่ยน):
- หินก้อนเหลี่ยม × 6
- ต้นไม้เหลี่ยม × 6 (มีผลไม้ box)
- เสารั้ว box × 10 (เหมือนเดิม)
- ดอกไม้ box × 4
- หญ้า box × 4
- แท่น Ranch: สี่เหลี่ยม (ไม่กลม)
- แท่น Breeding: สี่เหลี่ยม
- Incubator: box ฐาน + box ไข่
```

### 4.2 Green Meadow (ทุ่ง)

```
สีท้องฟ้า: 0x68d2f5 (ฟ้าอ่อน)
สีพื้น: 0x56d364 (เขียวสด) + grid texture

Decorations:
- หินก้อนเหลี่ยม × 6
- ต้นไม้เหลี่ยม × 7 (มีผลไม้)
- หญ้า box × 8
- ดอกไม้ box × 3
```

### 4.3 Echo Cave (ถ้ำ)

```
สีท้องฟ้า: 0x334155 (เทาเข้ม/มืด)
สีพื้น: 0x57606f (เทา) + grid texture (หิน)
สี Fog: 0x1e293b (เข้ม)

Decorations:
- หินก้อนเหลี่ยม × 6 (สีเทา)
- หินย้อย box ซ้อน × 7 (แหลมเหลี่ยม)
```

---

## 5. Blocky Ground + Texture

### 5.1 Ground Plane

```js
// เดิม: plane สีทึบ
// const ground = new THREE.Mesh(planeGeometry(90,90), new THREE.MeshStandardMaterial({color:0x59cd61,roughness:1}));

// ใหม่: plane + grid texture
function makeGroundTexture(zoneColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  // พื้นหลัง
  const hex = '#' + zoneColor.toString(16).padStart(6, '0');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 128, 128);
  
  // Grid กระเบืดีๆ
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 128; i += 16) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
  }
  
  // จุดเล็กกระจาย (noise)
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 30; i++) {
    ctx.fillRect(Math.random()*128, Math.random()*128, 2, 2);
  }
  
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(20, 20); // กระเบืดีเล็ก
  return tex;
}

// ใช้
const groundTex = makeGroundTexture(0x62c96b);
const ground = new THREE.Mesh(planeGeometry(90, 90),
  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
```

### 5.2 เปลี่ยนพื้นตาม Zone

```js
function setZoneGround(zone) {
  const zoneData = ZONES[zone];
  const tex = makeGroundTexture(zoneData.ground);
  ground.material.map = tex;
  ground.material.color.setHex(zoneData.ground);
  ground.material.needsUpdate = true;
}
```

---

## 6. Blocky Decorations

### 6.1 หินก้อนเหลี่ยม

```js
// เดิม: dodecahedron โค้งมน
// ใหม่: box ซ้อนกัน
function makeRock(x, z, s = 1, tone = 0x945a38) {
  const cluster = new THREE.Group();
  // ก้อนใหญ่
  const main = new THREE.Mesh(boxGeometry(s, s * 0.8, s * 0.9), mat(tone, 0.95, 0.04));
  main.position.y = s * 0.4; main.scale.set(1, 1.28, 1.08);
  cluster.add(main);
  // ก้อนข้าง
  const side = new THREE.Mesh(boxGeometry(s * 0.5, s * 0.4, s * 0.5), mat(tone, 0.98, 0.02));
  side.position.set(s * 0.55, s * 0.2, s * 0.18); side.scale.set(1.1, 0.8, 1);
  cluster.add(side);
  // ก้อนเล็ก
  const pebble = new THREE.Mesh(boxGeometry(s * 0.25, s * 0.2, s * 0.25), mat(tone, 0.99, 0));
  pebble.position.set(-s * 0.48, s * 0.1, -s * 0.22);
  cluster.add(pebble);
  cluster.position.set(x, 0, z);
  cluster.rotation.y = (x * 1.7 + z) * 0.15;
  addDeco(cluster);
  return cluster;
}
```

### 6.2 ต้นไม้เหลี่ยม

```js
// เดิม: cylinder ต้น + cone พุ่ม
// ใหม่: box ต้น + box พุ่ม
function makeTree(x, z, s = 1, { trunk = 0x754428, leaf = 0x18753a, fruit = null } = {}) {
  const g = new THREE.Group();
  // ต้น: box สี่เหลี่ยม
  const bole = new THREE.Mesh(boxGeometry(0.22 * s, 1.55 * s, 0.22 * s), mat(trunk, 0.88, 0.02));
  bole.position.y = 0.78 * s; bole.castShadow = true;
  g.add(bole);
  // พุ่มล่าง: box ใหญ่
  const mid = new THREE.Mesh(boxGeometry(1.05 * s, 1.0 * s, 1.05 * s), mat(leaf, 0.78, 0.03));
  mid.position.y = 1.65 * s; mid.castShadow = true;
  g.add(mid);
  // พุ่มบน: box เล็ก
  const top = new THREE.Mesh(boxGeometry(0.72 * s, 0.7 * s, 0.72 * s), mat(leaf, 0.7, 0.04));
  top.position.y = 2.35 * s; top.castShadow = true;
  g.add(top);
  // ผลไม้: box เล็ก
  if (fruit) {
    for (const [fx, fy, fz] of [[0.35, 1.5, 0.2], [-0.28, 1.7, -0.15], [0.1, 1.95, 0.32]]) {
      const berry = new THREE.Mesh(boxGeometry(0.1 * s, 0.1 * s, 0.1 * s), mat(fruit, 0.55, 0.08));
      berry.position.set(fx * s, fy * s, fz * s);
      g.add(berry);
    }
  }
  g.position.set(x, 0, z); addDeco(g); return g;
}
```

### 6.3 หญ้าเหลี่ยม

```js
// เดิม: cone เล็ก 3 ใบ
// ใหม่: box บางตั้ง
function makeGrassTuft(x, z, s = 1, color = 0x3f9d4a) {
  const g = new THREE.Group();
  for (const [dx, h, tilt] of [[-0.06, 0.28, 0.18], [0.05, 0.34, -0.12], [0, 0.22, 0.04]]) {
    const blade = new THREE.Mesh(boxGeometry(0.05 * s, h * s, 0.05 * s), mat(color, 0.86, 0));
    blade.position.set(dx * s, h * 0.5 * s, 0);
    blade.rotation.z = tilt;
    g.add(blade);
  }
  g.position.set(x, 0, z); addDeco(g); return g;
}
```

### 6.4 ดอกไม้เหลี่ยม

```js
// เดิม: cylinder ก้าน + sphere ดอก
// ใหม่: box ก้าน + box ดอก
function makeFlower(x, z, color = 0xf472b6) {
  const g = new THREE.Group();
  // ก้าน: box บาง
  const stem = new THREE.Mesh(boxGeometry(0.03, 0.22, 0.03), mat(0x4ade80, 0.8, 0));
  stem.position.y = 0.11;
  g.add(stem);
  // ดอก: box เล็ก
  const bloom = new THREE.Mesh(boxGeometry(0.1, 0.1, 0.1), mat(color, 0.5, 0.04));
  bloom.position.y = 0.24;
  g.add(bloom);
  g.position.set(x, 0, z); addDeco(g); return g;
}
```

### 6.5 หินย้อยเหลี่ยม

```js
// เดิม: cone แหลม
// ใหม่: box ซ้อนเล็กลง
function makeStalagmite(x, z, s = 1) {
  const g = new THREE.Group();
  // ฐาน: box ใหญ่
  const base = new THREE.Mesh(boxGeometry(0.6 * s, 0.5 * s, 0.6 * s), mat(0x64748b, 0.92, 0.08));
  base.position.y = 0.25 * s; base.castShadow = true;
  g.add(base);
  // กลาง: box ปานกลาง
  const mid = new THREE.Mesh(boxGeometry(0.35 * s, 0.5 * s, 0.35 * s), mat(0x94a3b8, 0.85, 0.1));
  mid.position.y = 0.75 * s; mid.castShadow = true;
  g.add(mid);
  // ยอด: box เล็ก (เหลี่ยมแหลม)
  const tip = new THREE.Mesh(boxGeometry(0.15 * s, 0.4 * s, 0.15 * s), mat(0x94a3b8, 0.78, 0.12));
  tip.position.y = 1.2 * s; tip.castShadow = true;
  g.add(tip);
  g.position.set(x, 0, z); addDeco(g); return g;
}
```

### 6.6 เสารั้ว (คงเดิม — box อยู่แล้ว)

```js
function makeFencePost(x, z) {
  const post = new THREE.Mesh(boxGeometry(0.1, 0.7, 0.1), mat(0x8b5e34, 0.86, 0.02));
  post.position.set(x, 0.35, z); addDeco(post); return post;
}
// ไม่ต้องเปลี่ยน —  box อยู่แล้ว
```

---

## 7. Blocky Structures (NPC/Incubator/Pads)

### 7.1 แท่น Ranch + Breeding (เหลี่ยม)

```js
// เดิม: circle + ring กลม
// ใหม่: box สี่เหลี่ยม + ขอบ
function makePad(x, z, halfW, halfD, color, opacity = 0.2) {
  // พื้นแท่น: box บาง
  const disk = new THREE.Mesh(
    boxGeometry(halfW * 2, 0.02, halfD * 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide })
  );
  disk.position.set(x, 0.025, z);
  scene.add(disk);
  // ขอบ: 4 เสา box เล็กที่มุม
  const edgeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const edgeH = 0.06;
  for (const [ex, ez] of [[-halfW, -halfD], [halfW, -halfD], [-halfW, halfD], [halfW, halfD]]) {
    const edge = new THREE.Mesh(boxGeometry(0.08, edgeH, 0.08), edgeMat);
    edge.position.set(x + ex, 0.03, z + ez);
    scene.add(edge);
  }
  // เส้นขอบ: box บาง 4 ด้าน
  for (const [w, d, ox, oz] of [
    [halfW * 2, 0.04, 0, -halfD],
    [halfW * 2, 0.04, 0, halfD],
    [0.04, halfD * 2, -halfW, 0],
    [0.04, halfD * 2, halfW, 0],
  ]) {
    const line = new THREE.Mesh(boxGeometry(w, 0.02, d), edgeMat);
    line.position.set(x + ox, 0.03, z + oz);
    scene.add(line);
  }
  return { disk };
}
```

### 7.2 Incubator เหลี่ยม

```js
// เดิม: cylinder ฐาน + sphere ไข่
// ใหม่: box ฐาน + box ไข่ (เหลี่ยม)
const incubator = new THREE.Group();

// ฐาน: box สี่เหลี่ยม
const baseInc = new THREE.Mesh(
  boxGeometry(0.9, 0.35, 0.9),
  new THREE.MeshStandardMaterial({ color: 0x6d28d9, metalness: 0.2, roughness: 0.6 })
);
baseInc.position.y = 0.18;
incubator.add(baseInc);

// ไข่: box เหลี่ยม (ยาวขึ้น)
const eggVisual = new THREE.Mesh(
  boxGeometry(0.5, 0.65, 0.45),
  new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0x7c2d12, emissiveIntensity: 0.12 })
);
eggVisual.scale.y = 1.28;
eggVisual.position.y = 0.72;
incubator.add(eggVisual);

incubator.position.set(5.2, 0, 8.2);
```

---

## 8. Blocky VFX Ground Decals

### 8.1 เดิม

```js
// spawnGroundDecal: circle กลม
const disk = new THREE.Mesh(circleGeometry(r, 40), ...);
```

### 8.2 ใหม่ — สี่เหลี่ยม

```js
function spawnGroundDecal(type, pos, { radius = 1.1, duration = 1.25, intensity = 1 } = {}) {
  // ใช้ box บางแทน circle
  const size = radius * 1.4; // ปรับให้พอดี
  const disk = new THREE.Mesh(
    boxGeometry(size, 0.02, size),
    new THREE.MeshBasicMaterial({
      color: colorNum(type), transparent: true, opacity: 0.4 * intensity,
      side: THREE.DoubleSide,
    })
  );
  disk.rotation.x = -Math.PI / 2;
  disk.position.copy(safeVec3(pos));
  disk.position.y = 0.03;
  scene.add(disk);
  // ขอบสี่เหลี่ยม
  const ring = new THREE.Mesh(
    boxGeometry(size + 0.08, 0.02, size + 0.08),
    new THREE.MeshBasicMaterial({
      color: colorNum(type), transparent: true, opacity: 0.7,
      side: THREE.DoubleSide, wireframe: true,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(disk.position);
  scene.add(ring);
  effects.push({ mesh: disk, life: duration, maxLife: duration, kind: 'ring' });
  effects.push({ mesh: ring, life: duration, maxLife: duration, kind: 'ring' });
}
```

---

## 9. Sky + Fog + Lighting

### 9.1 Sky — คงสีเดิม แต่เพิ่ม option gradient

```js
// เดิม: สีทึบ
scene.background = new THREE.Color(0x65c9f5);

// ใหม่: gradient texture (procedural canvas)
function makeSkyTexture(topColor, bottomColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 2; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, topColor);
  grad.addColorStop(1, bottomColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 128);
  return new THREE.CanvasTexture(canvas);
}

// ใช้
const skyTex = makeSkyTexture('#72c7ef', '#bfefff');
scene.background = skyTex;
```

### 9.2 Zone Sky

| Zone | Sky Top | Sky Bottom | Fog |
|------|---------|-----------|-----|
| hub | #72c7ef | #bfefff | 0x65c9f5 30-76 |
| grassland | #68d2f5 | #c8eeff | 0x68d2f5 30-76 |
| cave | #1a1a2e | #334155 | 0x1e293b 15-50 |

### 9.3 Lighting — คงเดิม

```js
// Hemisphere + Directional — ไม่เปลี่ยน
// แต่ cave อาจลด intensity ลง
```

---

## 10. ลำดับการทำ (Phases)

### Phase 1: Blocky Ground + Grid Texture (PR)
- [ ] สร้าง `makeGroundTexture(zoneColor)` — canvas grid
- [ ] เปลี่ยน ground material → ใช้ texture
- [ ] เปลี่ยน texture ตาม zone (setZoneGround)
- [ ] ทดสอบ: พื้นมี grid กระเบืดีๆ
- ไฟล์: game-v800.js

### Phase 2: Blocky Decorations (PR)
- [ ] แปลง makeRock() — dodecahedron → box ซ้อน
- [ ] แปลง makeTree() — cylinder/cone → box
- [ ] แปลง makeGrassTuft() — cone → box บาง
- [ ] แปลง makeFlower() — cylinder/sphere → box
- [ ] แปลง makeStalagmite() — cone → box ซ้อน
- [ ] makeFencePost() — คงเดิม (box อยู่แล้ว)
- [ ] ทดสอบ: ทุก decoration เป็นเหลี่ยม
- ไฟล์: game-v800.js

### Phase 3: Blocky Structures (PR)
- [ ] แปลง makePad() — circle/ring → box สี่เหลี่ยม
- [ ] แปลง Incubator — cylinder/sphere → box
- [ ] ทดสอบ: แท่น + Incubator เหลี่ยม
- ไฟล์: game-v800.js

### Phase 4: Blocky VFX Decals (PR)
- [ ] แปลง spawnGroundDecal() — circle → box
- [ ] แปลง spawnRingPulse() — torus → box โครง (wireframe)
- [ ] ทดสอบ: VFX พื้นเป็นสี่เหลี่ยม
- ไฟล์: game-v800.js

### Phase 5: Sky + Fog (PR)
- [ ] สร้าง `makeSkyTexture()` — gradient
- [ ] เปลี่ยน scene.background → gradient texture
- [ ] ปรับ fog ตาม zone
- [ ] ทดสอบ: ท้องฟ้ามี gradient
- ไฟล์: game-v800.js

### Phase 6: Polish + Zone Atmosphere (PR)
- [ ] ปรับแสงแต่ละ zone (cave มืดลง)
- [ ] ปรับ grid texture แต่ละ zone (cave = หิน, grassland = หญ้า)
- [ ] ตรวจทุก zone ใน browser
- [ ] ปรับความเข้มของ grid
- ไฟล์: game-v800.js

---

## 11. ไฟล์ที่กระทบ

| ไฟล์ | Phase | ประเภท |
|------|-------|--------|
| game-v800.js | 1-6 | แปลง decorations/ground/structures/VFX/sky |
| tests/v80-blocky-world-*.mjs (ใหม่) | 1-6 | Test per phase |

---

## 12. การตรวจรับ

1. `npm run ci` → ผ่านครบ
2. `node --check game-v800.js` → SYNTAX OK
3. Browser: v800.html → 200 OK
4. พื้นมี grid texture (กระเบืดีๆ)
5. หิน/ต้นไม้/หญ้า/ดอกไม้ เป็น box เหลี่ยม
6. แท่น + Incubator เป็นสี่เหลี่ยม
7. VFX พื้นเป็นสี่เหลี่ยม
8. ท้องฟ้ามี gradient
9. 3 Zone ต่างกันชัด (สี/grid/fog)
10. Performance: FPS ไม่ตก (box น้อย triangle กว่า)

---

## 13. ข้อควรระวัง

1. **Grid texture repeat** — ถี่เกินจะ moire หว่านเกินจะไม่เห็น — ค่าที่ดี ~20×20 repeat บน 90×90 plane
2. **CanvasTexture dispose** — ตอนเปลี่ยน zone ต้อง dispose texture เก่า
3. **Box UV** — box 6 ด้าน ใช้ grid texture ได้ทุกด้าน (แต่ละด้านเห็น grid)
4. **Shadow** — box.castShadow = true ทุก decoration
5. **Fog color** — cave ต้องเข้มกว่า hub/grassland
6. **populateWorld** — ตำแหน่ง decorations คงเดิม เปลี่ยนแค่รูปทรง
7. **VFX wireframe** — ใช้ `wireframe: true` สำหรับขอบสี่เหลี่ยม VFX
8. **ไม่ลบฟังก์ชันเดิม** — เขียนทับในจุดเดิม ไม่สร้างใหม่
9. **Performance** — box(1×1×1) = 12 triangle vs sphere(16×12) = ~300 triangle — ลดลงมาก
10. **Sky gradient** — CanvasTexture 2×128 ขนาดเล็กมาก ~1KB

---

## สรุป

- เป้าหมาย: แปลงแผนที่เก่า 3 zone จาก Legacy → Blocky
- ไม่ทำเพิ่มใหม่ — เปลี่ยนที่มีอยู่
- ทุก decoration: sphere/cone/cylinder → box
- พื้น: สีทึบ → grid texture (procedural canvas)
- แท่น/Incubator: กลม → เหลี่ยม
- VFX: circle → box
- ท้องฟ้า: สีทึบ → gradient
- 6 Phase = 6 PR
- Performance ดีขึ้น: box น้อย triangle กว่า sphere/cone