# Monster Life RPG — V8.0 VFX & Effect Development Plan
## แผนพัฒนาเอฟเฟกต์ทั้งหมด — Blocky Theme + ระบบใหม่

> สร้าง: 2026-08-17
> เวอร์ชัน: 1.0
> สถานะ: local (ยังไม่อัพ)
> เป้าหมาย: ปรับปรุงและเพิ่ม VFX ทั้งหมดให้เข้ากับ Blocky theme และรองรับระบบใหม่ V7.2-V8.0
> หลัก: เปลี่ยนของเก่า + เพิ่มของใหม่ สำหรับระบบที่ยังไม่มีเอฟเฟกต์

---

## สารบัญ

1. สถานะ VFX ปัจจุบัน
2. หลักการออกแบบ
3. แผนแปลง VFX เก่า → Blocky
4. แผน VFX ใหม่สำหรับระบบใหม่
5. รายละเอียด VFX แต่ละตัว
6. ระบบ Particle Pool
7. ระบบ VFX ตาม Type (18 type)
8. VFX ตามสถานการณ์
9. โค้ดเต็มสำหรับแต่ละส่วน
10. Animation Curve & Timing
11. Blend Mode & Depth Test
12. Opacity & Fade Curve
13. Pool Lifecycle & Memory
14. VFX เพิ่มเติม (capture/respawn/heal/zone/hitflash/faint)
15. Screen Flash & Hit Flash
16. Skill VFX — รายละเอียดทุกสกิล (27 สกิล)
17. Skill VFX ตาม Target Type (enemy/area/self)
18. Skill VFX ตาม Effect Type (heal/shield/buffAtk)
19. Skill VFX ตาม Type (18 type × 3 สกิล)
20. Skill VFX Timing & Sequence
21. Throw VFX — ปาบอล/ปาเรียก (ละเอียด)
22. Capture VFX — จับมอน + ดีเลย์รอบจับ (ละเอียด)
23. Summon VFX — เรียกมอน + Recall (ละเอียด)
24. Capture Tension System — ดีเลย์รอบจับ + VFX
25. ลำดับการทำ (Phases)
26. ไฟล์ที่กระทบ
27. การตรวจรับ
28. ข้อควรระวัง
29. สรุป

---

## 1. สถานะ VFX ปัจจุบัน

### 1.1 ระบบ VFX ที่มี (game-v800.js)

| ระบบ | บรรทัด | ฟังก์ชัน | สถานะ | ต้องเปลี่ยน? |
|------|--------|----------|------|------------|
| Particle Pool | 1107 | `sparkPool` (160 max, sphere) | ใช้งาน | sphere → box |
| Burst | 1156 | `spawnBurst()` | ใช้งาน | sphere → box |
| Ring Pulse | 1171 | `spawnRingPulse()` (torus) | ใช้งาน | torus → box wireframe |
| Elemental FX | 1217 | `spawnElementalFX()` (18 type) | ใช้งาน | shape เปลี่ยนบางส่วน |
| ELEMENT_FX | 1174 | 18 type config (core/accent/shape) | ใช้งาน | เพิ่ม shape blocky |
| Ground Decal | 1336 | `spawnGroundDecal()` (circle+ring) | ใช้งาน | circle → box (ในแผนแผนที่) |
| Damage Number | 1314 | `spawnDamageNumber()` (DOM) | ใช้งาน | คงเดิม (ไม่ใช่ 3D) |
| Floating Text | 1326 | `updateFloatingTexts()` (DOM) | ใช้งาน | คงเดิม |
| Camera Shake | 1308 | `triggerCameraShake()` | ใช้งาน | คงเดิม |
| Projectile | 1828 | `throwProjectile()` (sphere) | ใช้งาน | sphere → box |
| Capture Aim | 1840 | `beginCaptureAim()` (line) | ใช้งาน | คงเดิม (line ไม่เกี่ยว) |
| Effects Update | 1172 | `updateEffects()` | ใช้งาน | เพิ่ม update ใหม่ |
| Clear Effects | 1357 | `clearTransientEffects()` | ใช้งาน | คงเดิม |

### 1.2 โหมด spawnElementalFX ที่มี

| โหมด | จำนวน particle | ใช้ตอน |
|------|---------------|--------|
| impact | 7 × power | โจมตีโดนศัตรู |
| burst | 12 × power | ใช้สกิลที่ตัวเอง |
| summon | 14 × power | ปาเรียกมอน |
| trail | 3 × power | กระสุนบิน |
| aura | 7 × power | (มีในโค้ดแต่ใช้น้อย) |

### 1.3 ระบบใหม่ที่ยังไม่มี VFX

| ระบบ | ต้องการ VFX | สถานะ |
|------|-----------|--------|
| Training | ✅ เอฟเฟกต์ฝึก | ยังไม่มี |
| Evolution | ✅ เอฟเฟกต์วิวัฒนาการ | ยังไม่มี |
| Breeding | ✅ เอฟเฟกต์ผสมพันธุ์ | ยังไม่มี |
| Egg Hatch | ✅ เอฟเฟกต์ฟักไข่ | ยังไม่มี (หมุนไข่อย่างเดียว) |
| Raising Event | ✅ popup + result effect | มี popup แต่ไม่มี effect |
| Mastery Up | ✅ notification + effect | มี popup แต่ไม่มี 3D effect |
| Care (rest/play) | ✅ เอฟเฟกต์พัก/เล่น | ยังไม่มี |
| Feed | ✅ เอฟเฟกต์ให้อาหาร | ยังไม่มี |
| Level Up | ✅ เอฟเฟกต์เลเวลอัพ | ยังไม่มี |
| Bond Up | ✅ เอฟเฟกต์ไว้วางใจ | ยังไม่มี |
| Condition Bad | ✅ เอฟเฟกต์สภาพแย่ | ยังไม่มี |

---

## 2. หลักการออกแบบ

1. **Blocky theme** — particle เป็น box ไม่ใช่ sphere
2. **18 type ต่างกัน** — แต่ละ type มีสี + รูปทรง + พฤติกรรมต่างกัน
3. **Performance ต้น** — pool 160 particle หมุนเวียน ไม่สร้างใหม่
4. **สั้นกระชับ** — แต่ละ effect 0.2-0.5 วินาที ไม่เยิ่นเย้อ
5. **ชัดเจน** — ผู้เล่นเห็นแล้วรู้ทันทีว่าเกิดอะไร
6. **ไม่บังจอ** — particle เล็ก ไม่บังมุมมอง
7. **เข้ากับเสียง** — (ถ้ามีเสียงในอนาคต) timing ตรงกัน
8. **ไม่กระทบ gameplay** — VFX เป็น visual เท่านั้น ไม่มี hitbox

---

## 3. แผนแปลง VFX เก่า → Blocky

### 3.1 Particle Pool: sphere → box

```js
// เดิม: sphere 8×8
const sparkPool = createObjectPool({
  create: () => new THREE.Mesh(
    sphereGeometry(1, 8, 8),
    new THREE.MeshStandardMaterial({...})
  ),
});

// ใหม่: box 1×1×1 (12 triangle vs ~128 triangle)
const sparkPool = createObjectPool({
  maxSize: 200, // เพิ่มจาก 160 → 200 (box เบากว่า)
  create: () => new THREE.Mesh(
    boxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.58, metalness: 0.12,
      emissive: 0xffffff, emissiveIntensity: 0.18,
      transparent: true, opacity: 0.9,
    }),
  ),
  reset: mesh => {
    mesh.removeFromParent();
    mesh.visible = false;
    mesh.position.set(0, 0, 0);
    mesh.scale.setScalar(1);
    mesh.rotation.set(0, 0, 0);
    mesh.material.opacity = 0;
  },
  destroy: mesh => disposeObject3D(mesh),
});
```

### 3.2 Ring Pulse: torus → box wireframe

```js
// เดิม: torus
function spawnRingPulse(pos, color, { scale, life, y } = {}) {
  const mesh = new THREE.Mesh(
    torusGeometry(scale, 0.03, 8, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
  );
  mesh.rotation.x = Math.PI / 2;
  // ...
}

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

### 3.3 Projectile: sphere → box

```js
// เดิม: sphere
const mesh = new THREE.Mesh(
  sphereGeometry(0.16, 12, 10),
  new THREE.MeshStandardMaterial({ color, emissive: color, ... })
);

// ใหม่: box เหลี่ยม
const mesh = new THREE.Mesh(
  boxGeometry(0.14, 0.14, 0.14),
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, ... })
);
// เพิ่ม: หมุนตอนบิน
mesh.userData.spin = true;
```

### 3.4 fxGeom: เพิ่ม blocky shapes

```js
// เดิม: 18 shape ใช้ sphere/cone/octahedron/torus/tetrahedron
// ใหม่: เพิ่ม blocky variants

function fxGeom(shape = 'orb', size = 0.06) {
  switch (shape) {
    // Blocky shapes (ใหม่)
    case 'flame': return boxGeometry(size * 0.6, size * 1.8, size * 0.6); // เหลี่ยมไฟ
    case 'drop': return boxGeometry(size * 0.8, size * 1.2, size * 0.8); // เหลี่ยมหยด
    case 'leaf': return boxGeometry(size * 0.9, size * 0.3, size * 0.9); // เหลี่ยมใบ
    case 'crystal': return boxGeometry(size, size * 1.4, size); // เหลี่ยมผลึก
    case 'impact': return boxGeometry(size * 1.5, size * 0.45, size * 1.2); // เหลี่ยมกระแทก
    case 'bubble': return boxGeometry(size * 0.85, size * 0.85, size * 0.85); // เหลี่ยมฟอง
    case 'dust': return boxGeometry(size * 1.2, size * 0.55, size * 1.2); // เหลี่ยมฝุ่น
    case 'feather': return boxGeometry(size * 0.3, size * 1.7, size * 0.5); // เหลี่ยมขน
    case 'halo': return boxGeometry(size * 1.6, size * 0.15, size * 1.6); // เหลี่ยมวงแหวน
    case 'spore': return boxGeometry(size * 0.72, size * 0.72, size * 0.72); // เหลี่ยมสปอร์
    case 'shard': return boxGeometry(size * 0.5, size * 1.5, size * 0.5); // เหลี่ยมเศษ
    case 'mist': return boxGeometry(size * 0.95, size * 0.7, size * 0.95); // เหลี่ยมหมอก
    case 'arc': return boxGeometry(size * 0.5, size * 1.9, size * 0.5); // เหลี่ยมสายฟ้า
    case 'smoke': return boxGeometry(size, size, size); // เหลี่ยมควัน
    case 'metal': return boxGeometry(size, size * 0.52, size * 1.45); // เหลี่ยมโลหะ
    case 'star': return boxGeometry(size * 0.9, size * 0.9, size * 0.9); // เหลี่ยมดาว
    case 'spark': return boxGeometry(size * 1.5, size * 0.35, size * 1.5); // เหลี่ยมประกาย
    default: return boxGeometry(size, size, size); // orb → box
  }
}
```

---

## 4. แผน VFX ใหม่สำหรับระบบใหม่

### 4.1 สรุป VFX ใหม่ 11 ตัว

| # | VFX | ระบบ | คำอธิบาย | ระยะเวลา |
|---|-----|------|---------|---------|
| 1 | Training Effect | Training | ประกายรอบมอน + สีตามสายฝึก | 0.4s |
| 2 | Evolution Effect | Evolution | แสงเรือง + สลับรูป + ระเบิดประกาย | 1.2s |
| 3 | Breeding Effect | Breeding | หัวใจ + เชื่อมสาย + แสง | 0.8s |
| 4 | Egg Hatch Effect | Hatch | ไข่สั่น + ร้าว + แสง + มอนโผล่ | 1.0s |
| 5 | Feed Effect | Food | อาหารตกลง + ประกาย + หัวใจ | 0.5s |
| 6 | Care Rest Effect | Care | พลังงาน Z + ประกายนุ่ม | 0.6s |
| 7 | Care Play Effect | Care | ดาว + เครื่องหมายตกใจ + ประกาย | 0.6s |
| 8 | Level Up Effect | Growth | แสงขึ้นบน + ตัวเลขเลเวล | 0.5s |
| 9 | Bond Up Effect | Bond | หัวใจลอยขึ้น + สีชมพู | 0.4s |
| 10 | Mastery Up Effect | Skill | ดาวเหลี่ยมระเบิด + สีทอง | 0.6s |
| 11 | Condition Bad Effect | Condition | เมฆดำ + สั่น + สีแดง | 0.3s |

---

## 5. รายละเอียด VFX แต่ละตัว

### 5.1 Training Effect

```js
// สีตามสายฝึก
const TRAIN_FX_COLOR = {
  power: 0xef6c32,      // ส้ม
  defense: 0x4f87e8,    // น้ำเงิน
  speed: 0xe8bd22,      // เหลือง
  technique: 0x63b34b,  // เขียว
  spirit: 0xa78bfa,     // ม่วง
};

function spawnTrainingEffect(pos, focus) {
  const color = TRAIN_FX_COLOR[focus] || 0xffffff;
  // ประกาย 8 จุดรอบมอน ลอยขึ้น
  for (let i = 0; i < 8; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(color);
    m.material.emissive.setHex(color);
    const angle = (i / 8) * Math.PI * 2;
    m.position.set(
      pos.x + Math.cos(angle) * 0.6,
      pos.y + 0.3 + Math.random() * 0.3,
      pos.z + Math.sin(angle) * 0.6
    );
    m.scale.setScalar(0.04 + Math.random() * 0.03);
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.4, maxLife: 0.4, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(
        Math.cos(angle) * 0.3,
        0.8 + Math.random() * 0.4,
        Math.sin(angle) * 0.3
      ),
      size: m.scale.x, gravity: 0,
    });
  }
  // ring pulse เหลี่ยม
  spawnRingPulse(pos.clone(), color, { scale: 0.5, life: 0.3, y: 0.08 });
}
```

### 5.2 Evolution Effect

```js
function spawnEvolutionEffect(pos, oldColor, newColor) {
  // ขั้นที่ 1: แสงเรือง (0.0-0.4s)
  const aura = new THREE.Mesh(
    boxGeometry(1.2, 2.0, 1.2),
    new THREE.MeshBasicMaterial({
      color: newColor, transparent: true, opacity: 0,
      wireframe: true,
    })
  );
  aura.position.copy(pos);
  aura.position.y += 1.0;
  scene.add(aura);
  effects.push({
    mesh: aura, life: 1.2, maxLife: 1.2, kind: 'evolution-aura',
    phase: 0, newColor,
  });

  // ขั้นที่ 2: ประกายรอบตัว 20 จุด (0.4-0.8s)
  for (let i = 0; i < 20; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(i % 2 ? newColor : oldColor);
    m.material.emissive.setHex(i % 2 ? newColor : oldColor);
    const angle = (i / 20) * Math.PI * 2;
    m.position.set(
      pos.x + Math.cos(angle) * 0.8,
      pos.y + 0.5 + Math.random() * 1.5,
      pos.z + Math.sin(angle) * 0.8
    );
    m.scale.setScalar(0.06);
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.8, maxLife: 0.8, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(Math.cos(angle) * 0.5, 1.0, Math.sin(angle) * 0.5),
      size: 0.06, gravity: 0.5,
    });
  }

  // ขั้นที่ 3: ring pulse ใหญ่ (0.8-1.2s)
  spawnRingPulse(pos.clone(), newColor, { scale: 1.2, life: 0.4, y: 0.08 });
  triggerCameraShake(0.12, 0.2);
}
```

### 5.3 Breeding Effect

```js
function spawnBreedingEffect(posA, posB) {
  // สายเชื่อม หัวใจ
  const mid = posA.clone().add(posB).multiplyScalar(0.5);
  mid.y += 1.0;
  // หัวใจเหลี่ยม box 6 จุดลอย
  for (let i = 0; i < 6; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(0xec4899);
    m.material.emissive.setHex(0xec4899);
    m.position.set(
      mid.x + (Math.random() - 0.5) * 0.6,
      mid.y + i * 0.15,
      mid.z + (Math.random() - 0.5) * 0.6
    );
    m.scale.setScalar(0.08);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.8, maxLife: 0.8, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(0, 0.5 + Math.random() * 0.3, 0),
      size: 0.08, gravity: -0.2,
    });
  }
  // ring pulse ชมพู
  spawnRingPulse(mid, 0xec4899, { scale: 0.8, life: 0.35, y: 0 });
}
```

### 5.4 Egg Hatch Effect

```js
function spawnHatchEffect(pos) {
  // ขั้น 1: ร้าว (0.0-0.3s) — ประกายขาว
  for (let i = 0; i < 12; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(0xfde68a);
    m.material.emissive.setHex(0xfde68a);
    m.position.set(
      pos.x + (Math.random() - 0.5) * 0.4,
      pos.y + 0.3 + Math.random() * 0.5,
      pos.z + (Math.random() - 0.5) * 0.4
    );
    m.scale.setScalar(0.05);
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.5, maxLife: 0.5, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        0.8 + Math.random() * 0.5,
        (Math.random() - 0.5) * 1.5
      ),
      size: 0.05, gravity: 1.0,
    });
  }
  // ring pulse ทอง
  spawnRingPulse(pos.clone(), 0xfde68a, { scale: 0.8, life: 0.4, y: 0.1 });
  triggerCameraShake(0.08, 0.15);
}
```

### 5.5 Feed Effect

```js
function spawnFeedEffect(pos, foodColor = 0x22c55e) {
  // อาหารตกลง + ประกาย
  for (let i = 0; i < 5; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(foodColor);
    m.material.emissive.setHex(foodColor);
    m.position.set(
      pos.x + (Math.random() - 0.5) * 0.3,
      pos.y + 1.5 + Math.random() * 0.3,
      pos.z + (Math.random() - 0.5) * 0.3
    );
    m.scale.setScalar(0.05);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.5, maxLife: 0.5, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(0, -1.0, 0), // ตกลง
      size: 0.05, gravity: 0,
    });
  }
  // หัวใจเล็ก
  for (let i = 0; i < 3; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(0xec4899);
    m.material.emissive.setHex(0xec4899);
    m.position.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 0.8, pos.z);
    m.scale.setScalar(0.04);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.6, maxLife: 0.6, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(0, 0.6, 0),
      size: 0.04, gravity: -0.1,
    });
  }
}
```

### 5.6 Care Rest Effect

```js
function spawnRestEffect(pos) {
  // ตัว Z ลอย + ประกายนุ่ม
  for (let i = 0; i < 4; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(0x60a5fa);
    m.material.emissive.setHex(0x60a5fa);
    m.position.set(
      pos.x + (Math.random() - 0.5) * 0.4,
      pos.y + 1.0 + i * 0.2,
      pos.z + 0.2
    );
    m.scale.setScalar(0.05);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.6, maxLife: 0.6, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(0, 0.4, 0.1),
      size: 0.05, gravity: -0.05,
    });
  }
}
```

### 5.7 Care Play Effect

```js
function spawnPlayEffect(pos) {
  // ดาวเหลี่ยม + ประกายสดใส
  for (let i = 0; i < 8; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(0xfacc15);
    m.material.emissive.setHex(0xfacc15);
    const angle = (i / 8) * Math.PI * 2;
    m.position.set(
      pos.x + Math.cos(angle) * 0.5,
      pos.y + 0.5 + Math.random() * 0.8,
      pos.z + Math.sin(angle) * 0.5
    );
    m.scale.setScalar(0.06);
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.6, maxLife: 0.6, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(Math.cos(angle) * 0.8, 0.5, Math.sin(angle) * 0.8),
      size: 0.06, gravity: 0.3,
    });
  }
}
```

### 5.8 Level Up Effect

```js
function spawnLevelUpEffect(pos) {
  // แสงขึ้นบน + ring ทอง
  for (let i = 0; i < 10; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(0xfde047);
    m.material.emissive.setHex(0xfde047);
    m.position.set(
      pos.x + (Math.random() - 0.5) * 0.3,
      pos.y + 0.1,
      pos.z + (Math.random() - 0.5) * 0.3
    );
    m.scale.setScalar(0.05);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.5, maxLife: 0.5, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(0, 1.5 + Math.random() * 0.5, 0),
      size: 0.05, gravity: -0.2,
    });
  }
  spawnRingPulse(pos.clone(), 0xfde047, { scale: 0.7, life: 0.3, y: 0.08 });
}
```

### 5.9 Bond Up Effect

```js
function spawnBondUpEffect(pos) {
  // หัวใจเหลี่ยมชมพูลอยขึ้น
  for (let i = 0; i < 5; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(0xec4899);
    m.material.emissive.setHex(0xec4899);
    m.position.set(
      pos.x + (Math.random() - 0.5) * 0.4,
      pos.y + 0.8,
      pos.z + (Math.random() - 0.5) * 0.4
    );
    m.scale.setScalar(0.06);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.5, maxLife: 0.5, kind: 'spark', pooled: true,
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.8, 0),
      size: 0.06, gravity: -0.1,
    });
  }
}
```

### 5.10 Mastery Up Effect

```js
function spawnMasteryUpEffect(pos) {
  // ดาวเหลี่ยมทองระเบิด
  for (let i = 0; i < 12; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(0xfde047);
    m.material.emissive.setHex(0xfde047);
    const angle = (i / 12) * Math.PI * 2;
    m.position.set(pos.x, pos.y + 0.8, pos.z);
    m.scale.setScalar(0.07);
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.6, maxLife: 0.6, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(Math.cos(angle) * 1.2, 0.5 + Math.random() * 0.5, Math.sin(angle) * 1.2),
      size: 0.07, gravity: 0.4,
    });
  }
  spawnRingPulse(pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xfde047, { scale: 0.6, life: 0.3, y: 0 });
}
```

### 5.11 Condition Bad Effect

```js
function spawnConditionBadEffect(pos) {
  // เมฆดำ + สั่น
  for (let i = 0; i < 6; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(0x64748b);
    m.material.emissive.setHex(0x64748b);
    m.material.emissiveIntensity = 0.1;
    m.position.set(
      pos.x + (Math.random() - 0.5) * 0.5,
      pos.y + 0.5 + Math.random() * 0.5,
      pos.z + (Math.random() - 0.5) * 0.5
    );
    m.scale.setScalar(0.08);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.3, maxLife: 0.3, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(0, 0.2, 0),
      size: 0.08, gravity: -0.05,
    });
  }
}
```

---

## 6. ระบบ Particle Pool

### 6.1 โครงสร้าง

```
sparkPool (200 max)
  ├─ acquire() → ขอ particle จาก pool (ถ้าว่างสร้างใหม่)
  ├─ release(mesh) → คืน particle ใส่ pool (reset + ซ่อน)
  └─ สถานะ: active count / pool size

การใช้:
  spawnXXX() → acquire() → ตั้งค่า → scene.add → effects.push
  updateEffects() → ตรวจ life → หมด → release() → คืน pool
```

### 6.2 ขนาด Pool

| สถานการณ์ | particle สูงสุด | หมายเหตุ |
|----------|---------------|---------|
| ต่อสู้ 1 vs 1 | ~30 | skill 7 + burst 12 + trail 3 + etc |
| ต่อสู้ area | ~50 | area 12×3 + impact 7×3 |
| Evolution | ~25 | 20 burst + 5 ring |
| หลายเหตุการณ์พร้อมกัน | ~100 | worst case |
| Pool size | 200 | มี buffer สบาย |

---

## 7. ระบบ VFX ตาม Type (18 type)

### 7.1 ตาราง Type VFX (ปรับปรุง)

| Type | Core | Accent | Shape (Blocky) | Intensity | Speed | พฤติกรรม |
|------|------|--------|---------------|-----------|-------|---------|
| Normal | 0xc4b08b | 0xf5e2be | box | 0.95 | 1.0 | กระจายกลม |
| Fire | 0xff6b2c | 0xffc347 | box สูง | 1.18 | 1.15 | ลอยขึ้น |
| Water | 0x43a5ff | 0xb6efff | box ยาว | 1.08 | 0.95 | ตกลง |
| Electric | 0xffda22 | 0xfff79c | box แบน | 1.22 | 1.35 | ซิกแซก |
| Grass | 0x65c84b | 0xd6ff9f | box บาง | 1.0 | 0.9 | ลอยช้า |
| Ice | 0x8de9ff | 0xf3fdff | box สูง | 1.04 | 0.9 | ตกช้า |
| Fighting | 0xd6493b | 0xffcab9 | box หนา | 1.14 | 1.05 | กระแทก |
| Poison | 0xb259db | 0xf3baff | box เล็ก | 1.0 | 0.88 | ลอยช้า |
| Ground | 0xd0a249 | 0xf6deb4 | box แบน | 1.0 | 0.82 | กระจายต่ำ |
| Flying | 0x8e82ff | 0xece8ff | box บางยาว | 1.02 | 1.08 | ปีกกระพือ |
| Psychic | 0xff5a98 | 0xffd3e8 | box แหวน | 1.1 | 1.02 | หมุนรอบ |
| Bug | 0xa8c42d | 0xedff93 | box เล็ก | 0.98 | 0.95 | กระจายเร็ว |
| Rock | 0xb59b46 | 0xf1deb0 | box ใหญ่ | 0.94 | 0.8 | ตกหนัก |
| Ghost | 0x8870df | 0xe6ddff | box โปร่ง | 1.06 | 0.85 | ลอยไม่ตก |
| Dragon | 0x7f5cff | 0xdccfff | box สูงใหญ่ | 1.18 | 1.12 | พุ่งขึ้น |
| Dark | 0x594942 | 0xc7b7a8 | box ควัน | 1.0 | 0.86 | กระจายช้า |
| Steel | 0xaab0c8 | 0xf0f4ff | box หนา | 1.0 | 0.78 | กระแทกหนัก |
| Fairy | 0xff8fcb | 0xffeff7 | box ดาว | 1.12 | 1.0 | ลอยนุ่ม |

### 7.2 พฤติกรรมพิเศษตาม Type

```js
// ใน updateEffects เพิ่ม type-specific behavior
function updateSparkType(e, dt, t) {
  const cfg = e.typeCfg;
  if (!cfg) return;

  // Fire: ลอยขึ้นเร็ว + สีเข้มขึ้นตอนดับ
  if (cfg.speed > 1.1) e.vel.y += dt * 0.5;

  // Water: ตกลงเร็ว
  if (cfg.speed < 0.95 && cfg.shape === 'drop') e.vel.y -= dt * 0.3;

  // Electric: ซิกแซก
  if (cfg.speed > 1.3) {
    e.mesh.position.x += Math.sin(e.life * 20) * 0.02;
    e.mesh.position.z += Math.cos(e.life * 20) * 0.02;
  }

  // Ghost: ไม่ตก
  if (cfg.shape === 'mist') e.vel.y = Math.max(e.vel.y, 0);
}
```

---

## 8. VFX ตามสถานการณ์

### 8.1 ตารากการเรียกใช้ VFX

| เหตุการณ์ | VFX ที่เรียก | ฟังก์ชันที่เรียก |
|----------|------------|----------------|
| ใช้สกิลโจมตี | spawnElementalFX(burst) + spawnElementalFX(impact) + spawnGroundDecal + spawnDamageNumber + triggerCameraShake | useSkill() |
| ใช้สกิล area | spawnElementalFX(summon) + spawnGroundDecal + spawnElementalFX(impact)×N + spawnDamageNumber×N | useSkill() area |
| ปาเรียกมอน | throwProjectile + spawnElementalFX(trail) + spawnBurst(onHit) | summonThrow() |
| ปาจับ | throwProjectile(capture) + spawnRingPulse(onHit) + spawnBurst | captureThrow() |
| ปราบมอน | spawnRingPulse + spawnBurst + defeatWild | damageWild() → defeatWild() |
| มอน Faint | spawnBurst + removeAndDispose | faintActive() |
| ฝึก (ใหม่) | spawnTrainingEffect | setTraining() |
| วิวัฒนาการ (ใหม่) | spawnEvolutionEffect | evolveMonster() |
| ผสมพันธุ์ (ใหม่) | spawnBreedingEffect | createEgg() |
| ฟักไข่ (ใหม่) | spawnHatchEffect | hatchEgg() |
| ให้อาหาร (ใหม่) | spawnFeedEffect | feedMonster() |
| พักผ่อน (ใหม่) | spawnRestEffect | careAction('rest') |
| เล่นด้วย (ใหม่) | spawnPlayEffect | careAction('play') |
| เลเวลอัพ (ใหม่) | spawnLevelUpEffect | levelUpInstance() |
| ไว้วางใจเพิ่ม (ใหม่) | spawnBondUpEffect | feedMonster/careAction |
| Mastery Up (ใหม่) | spawnMasteryUpEffect | addSkillExp() |
| สภาพแย่ (ใหม่) | spawnConditionBadEffect | applyLifeSimulation() |

---

## 9. โค้ดเต็มสำหรับแต่ละส่วน

(รวมในส่วน 3-5 ข้างต้น — ทุกฟังก์ชันมีโค้ดเต็มพร้อมใช้)

---

## 10. Animation Curve & Timing

### 10.1 Timeline ของแต่ละ VFX

แต่ละ VFX มีช่วงเวลาที่แบ่งเป็น phases:

```
Phase:     Spawn        Active        Fade         End
           (0-10%)      (10-70%)      (70-100%)    (100%)

Spark:     โผล่+ขยาย     เคลื่อน+หมุน   จางลง        หาย
Ring:      ขยายเร็ว      ขยายช้าลง     จาง          หาย
Decal:     โผล่บนพื้น    หมุน+คงที่    จาง          หาย
Damage#:   โผล่+ขยาย     ลอยขึ้น       จาง          หลุด DOM
Aura:      โปร่งใส      เรืองแสง      จาง          หาย
Projectile:ปา→โค้ง       บิน+ประกาย    ชน→ระเบิด    หาย
```

### 10.2 Easing Functions

```js
// ใช้ easing ควบคุมการเคลื่อนไหว:
const Ease = {
  linear: t => t,
  easeOut: t => 1 - (1 - t) * (1 - t),      // ช้าลงตอนท้าย
  easeIn: t => t * t,                         // เร็วขึ้นตอนท้าย
  easeInOut: t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  easeOutBack: t => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2, // เด้นกลับ
  easeOutBounce: t => {
    if (t < 1/2.75) return 7.5625 * t * t;
    if (t < 2/2.75) return 7.5625 * (t -= 1.5/2.75) * t + 0.75;
    if (t < 2.5/2.75) return 7.5625 * (t -= 2.25/2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625/2.75) * t + 0.984375;
  },
};

// การใช้:
// spark: scale = easeOut(t) — ขยายเร็วแล้วช้าลง
// ring: scale = easeOut(t) * 2.8 — ขยายเร็ว
// damage number: scale = easeOutBack(t) — เด้นเข้า
// projectile: position = easeInOut(t) — โค้งนุ่ม
// aura: opacity = easeIn(t) — จางช้าลงตอนท้าย
```

### 10.3 Timing ตามประเภท

| VFX | Spawn (ms) | Active (ms) | Fade (ms) | รวม (ms) |
|-----|-----------|------------|----------|---------|
| Spark (impact) | 30 | 200 | 170 | 400 |
| Spark (burst) | 40 | 300 | 260 | 600 |
| Spark (summon) | 50 | 400 | 350 | 800 |
| Spark (trail) | 20 | 80 | 100 | 200 |
| Ring Pulse | 50 | 200 | 100 | 350 |
| Ground Decal | 80 | 800 | 370 | 1250 |
| Damage Number | 50 | 500 | 350 | 900 |
| Projectile | 0 | 550 (บิน) | 160 (ระเบิด) | 710 |
| Training | 40 | 200 | 160 | 400 |
| Evolution | 1200 | — | — | 1200 (3 ชั้น) |
| Breeding | 80 | 500 | 220 | 800 |
| Hatch | 80 | 300 | 120 | 500 |
| Feed | 50 | 250 | 200 | 500 |
| Rest | 60 | 300 | 240 | 600 |
| Play | 60 | 300 | 240 | 600 |
| Level Up | 50 | 250 | 200 | 500 |
| Bond Up | 40 | 250 | 210 | 500 |
| Mastery Up | 60 | 350 | 190 | 600 |
| Condition Bad | 30 | 150 | 120 | 300 |
| Capture | 0 | 550 (บิน) | 200 (result) | 750 |
| Respawn | 200 | — | — | 200 (โผล่) |
| Heal | 50 | 300 | 250 | 600 |
| Zone Transition | 300 | — | 300 | 600 (fade) |
| Hit Flash | 0 | 80 | 80 | 160 |
| Faint | 0 | 320 | — | 320 |

### 10.4 Stagger (การหน่วงเวลา)

บาง VFX ต้อง stagger เพื่อไม่ให้ประกายโผล่พร้อมกันหมด:

```js
// spawnElementalFX: ประกายไม่โผล่พร้อมกัน
for (let i = 0; i < count; i++) {
  // delay สุ่ม 0-50ms ต่อ particle
  setTimeout(() => spawnOneParticle(i), Math.random() * 50);
}
// หรือใช้ initial delay ใน effect object:
effects.push({ mesh, life, maxLife, kind: 'spark', delay: i * 0.02 });
// ใน updateEffects:
if (e.delay > 0) { e.delay -= dt; return; } // ข้ามไปก่อน
```

---

## 11. Blend Mode & Depth Test

### 11.1 Blend Mode ตามประเภท

| VFX | Blend Mode | เหตุผล |
|-----|-----------|--------|
| Spark (particle) | Normal | สีทึบ เห็นชัด |
| Ring Pulse | Normal | wireframe โปร่ง |
| Ground Decal | Additive | สว่างเรืองบนพื้น |
| Damage Number | Normal (DOM) | ไม่ใช่ 3D |
| Aura | Additive | เรืองแสง |
| Projectile | Normal | ทึบเห็นชัด |
| Smoke/Dark | Normal | ทึบมืด |
| Mist/Ghost | Normal + transparent | โปร่งใส |
| Heal | Additive | สว่างเขียว |
| Screen Flash | Additive (overlay) | แสงทั้งจอ |

### 11.2 Depth Test Configuration

```js
// ส่วนใหญ่: depthTest=true, depthWrite=true (ปกติ)
// แต่ Ground Decal ต้อง:
const decalMat = new THREE.MeshBasicMaterial({
  color, transparent: true, opacity: 0.13,
  side: THREE.DoubleSide,
  depthWrite: false,      // ไม่เขียน depth (ไม่บังของหลัง)
  depthTest: true,        // ตรวจ depth (ไม่โผล่ใต้พื้น)
  blending: THREE.AdditiveBlending, // สว่างทับ
});
// ลำดับ render: หลัง opaque, ก่อน transparent

// Aura/Evolution:
const auraMat = new THREE.MeshBasicMaterial({
  color, transparent: true, opacity: 0,
  depthWrite: false,      // ไม่บังมอนข้างใน
  depthTest: true,
  blending: THREE.AdditiveBlending,
});

// Screen Flash (overlay ทั้งจอ):
const flashMat = new THREE.MeshBasicMaterial({
  color, transparent: true, opacity: 0,
  depthTest: false,       // ไม่ตรวจ depth (บนสุด)
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
```

### 11.3 Render Order

Three.js render ตามลำดับ:
1. Opaque (ground + decorations + structures + monsters)
2. Transparent (VFX + pads + decals + aura)
3. Overlay (screen flash + DOM elements)

Box particle ใช้ Opaque ถ้า opacity=1, ใช้ Transparent ถ้า opacity<1

---

## 12. Opacity & Fade Curve

### 12.1 Opacity ตามช่วงเวลา

```js
// t = life / maxLife (1.0 = เริ่ม, 0.0 = หมด)

// Spark: จางเส้นตรง
opacity = t * 0.9;

// Ring: จางเร็วตอนท้าย
opacity = Math.max(0, t * 0.9);

// Ground Decal: จางช้าๆ ตลอด
opacity = 0.13 * t;  // disc
opacity = 0.42 * t;  // ring
opacity = 0.48 * t;  // inner

// Aura (Evolution): โปร่ง→เรือง→จาง
// ช่วง 0-40%: opacity 0 → 0.6 (เรืองขึ้น)
// ช่วง 40-80%: opacity 0.6 (คงที่)
// ช่วง 80-100%: opacity 0.6 → 0 (จาง)
if (t > 0.8) opacity = 0.6 * (t - 0.8) / 0.2; // จาง
else if (t > 0.4) opacity = 0.6; // คงที่
else opacity = 0.6 * t / 0.4; // เรืองขึ้น

// Damage Number (DOM): โผล่เต็ม → คงที่ → จาง
// ช่วง 0-20%: opacity 0 → 1 (โผล่)
// ช่วง 20-60%: opacity 1 (คงที่)
// ช่วง 60-100%: opacity 1 → 0 (จาง)
if (t > 0.6) opacity = (t - 0.6) / 0.4;
else if (t > 0.2) opacity = 1;
else opacity = t / 0.2;
```

### 12.2 Scale Curve

```js
// Spark: ขยายเร็ว → หด
scale = size * (0.5 + t); // 0.5x → 1.5x

// Ring: ขยายตลอด
scale = 1 + dt * 2.8; // ขยายเรื่อยๆ
// หรือ: scale = easeOut(1-t) * 2.0 + 0.5

// Damage Number: เด้นเข้า → ขยายนิด
scale = 0.88 + (1-t) * 0.28; // 0.88x → 1.16x

// Projectile: คงที่
scale = 1; // ไม่เปลี่ยน

// Aura: ขยายช้าๆ
scale = 1 + (1-t) * 0.3; // 1.0x → 1.3x
```

---

## 13. Pool Lifecycle & Memory

### 13.1 Object Pool State Machine

```
            acquire()
  FREE ──────────────→ ACTIVE
   ↑                     │
   │ release()           │ life <= 0
   │                     │
   └──── RESET ←─────────┘
         (position=0, scale=1, opacity=0, visible=false)
```

### 13.2 Pool Statistics

```js
const sparkPool = createObjectPool({
  maxSize: 200,
  create: () => boxMesh(...),
  reset: mesh => { ... },
  destroy: mesh => disposeObject3D(mesh),
});

// ตรวจสอบ:
sparkPool.stats() → {
  poolSize: 200,     // ความจุรวม
  activeCount: 45,   // กำลังใช้งาน
  freeCount: 155,    // ว่าง
  created: 200,      // สร้างรวมตลอดกาล
  acquired: 1240,    // ขอใช้รวม
  released: 1195,    // คืนรวม
  peak: 95,          // สูงสุดที่เคยใช้พร้อมกัน
}
```

### 13.3 Memory ต่อ Particle

```
Box particle:
  Geometry: BoxGeometry(1,1,1) [shared cache] = 0 bytes ต่อตัว
  Material: MeshStandardMaterial [shared] = 0 bytes ต่อตัว
  Mesh object: ~200 bytes (position, rotation, scale, userData)
  → รวม: ~200 bytes ต่อ particle
  → 200 particles = ~40KB

เทียบกับ sphere particle:
  Sphere(1, 8, 8) = 128 triangle vs Box = 12 triangle
  ลด 90% triangle → ลด GPU memory 90%
```

### 13.4 Pool ไม่พอ (Exhaustion)

```js
// ถ้า acquire() แล้ว pool ว่าง:
const m = sparkPool.acquire(); // สร้างใหม่ชั่วคราศ
m.userData.temporary = true;   // ทำเครื่องหมาย

// ตอน release:
if (m.userData.temporary) {
  disposeObject3D(m); // ทำลาย ไม่คืน pool
} else {
  sparkPool.release(m); // คืน pool
}
// แต่ในทางปฏิบัติ 200 ก็พอ — peak ~95
```

---

## 14. VFX เพิ่มเติม (capture/respawn/heal/zone/hitflash/faint)

### 14.1 Capture VFX (จับมอนสำเร็จ/ล้มเหลว)

```js
function spawnCaptureResultEffect(pos, success) {
  if (success) {
    // สำเร็จ: ประกายเขียว + ring ใหญ่ + แสงขึ้น
    for (let i = 0; i < 10; i++) {
      const m = sparkPool.acquire();
      m.visible = true;
      m.material.color.setHex(0x22c55e);
      m.material.emissive.setHex(0x22c55e);
      m.position.set(pos.x + (Math.random()-0.5)*0.4, pos.y + 0.3, pos.z + (Math.random()-0.5)*0.4);
      m.scale.setScalar(0.06);
      scene.add(m);
      effects.push({
        mesh: m, life: 0.5, maxLife: 0.5, kind: 'spark', pooled: true,
        vel: new THREE.Vector3(0, 1.0 + Math.random()*0.5, 0),
        size: 0.06, gravity: -0.1,
      });
    }
    spawnRingPulse(pos.clone(), 0x22c55e, { scale: 0.8, life: 0.4, y: 0.1 });
    triggerScreenFlash(0x22c55e, 0.15, 0.2);
  } else {
    // ล้มเหลว: ประกายแดง + ring เล็ก
    for (let i = 0; i < 5; i++) {
      const m = sparkPool.acquire();
      m.visible = true;
      m.material.color.setHex(0xef4444);
      m.material.emissive.setHex(0xef4444);
      m.position.set(pos.x + (Math.random()-0.5)*0.3, pos.y + 0.5, pos.z + (Math.random()-0.5)*0.3);
      m.scale.setScalar(0.04);
      scene.add(m);
      effects.push({
        mesh: m, life: 0.3, maxLife: 0.3, kind: 'spark', pooled: true,
        vel: new THREE.Vector3(0, 0.3, 0),
        size: 0.04, gravity: 0.5,
      });
    }
    spawnRingPulse(pos.clone(), 0xef4444, { scale: 0.4, life: 0.2, y: 0.1 });
  }
}
```

### 14.2 Respawn VFX (มอนป่าเกิดใหม่)

```js
function spawnRespawnEffect(pos) {
  // ประกายขาวโผล่ขึ้น + ring เล็ก
  for (let i = 0; i < 6; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(0xffffff);
    m.material.emissive.setHex(0xffffff);
    m.material.emissiveIntensity = 0.3;
    m.position.set(pos.x + (Math.random()-0.5)*0.3, pos.y, pos.z + (Math.random()-0.5)*0.3);
    m.scale.setScalar(0.05);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.3, maxLife: 0.3, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(0, 0.8, 0),
      size: 0.05, gravity: -0.1,
    });
  }
  spawnRingPulse(pos.clone(), 0xffffff, { scale: 0.4, life: 0.2, y: 0.05 });
}
```

### 14.3 Heal VFX (ฟื้น HP ที่ NPC)

```js
function spawnHealEffect(pos) {
  // ประกายเขียวลอยขึ้น + ring เขียว
  for (let i = 0; i < 8; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(0x4ade80);
    m.material.emissive.setHex(0x4ade80);
    m.position.set(pos.x + (Math.random()-0.5)*0.5, pos.y + 0.1, pos.z + (Math.random()-0.5)*0.5);
    m.scale.setScalar(0.05);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.6, maxLife: 0.6, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(0, 1.0 + Math.random()*0.3, 0),
      size: 0.05, gravity: -0.1,
    });
  }
  spawnRingPulse(pos.clone(), 0x4ade80, { scale: 0.6, life: 0.3, y: 0.08 });
}
```

### 14.4 Zone Transition VFX

```js
function spawnZoneTransitionEffect(zoneName) {
  // Flash สีของ zone สั้นๆ
  const zoneColors = { hub: 0x62c96b, grassland: 0x68d2f5, cave: 0x334155 };
  const color = zoneColors[zoneName] || 0xffffff;
  triggerScreenFlash(color, 0.2, 0.3);
  // ไม่มี 3D particle — ใช้แค่ screen flash
}
```

### 14.5 Faint VFX (มอนล้ม)

```js
function spawnFaintEffect(pos) {
  // ประกายแดง + ตกลง + camera shake
  for (let i = 0; i < 12; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(0xef4444);
    m.material.emissive.setHex(0xef4444);
    m.position.set(pos.x + (Math.random()-0.5)*0.5, pos.y + 0.6, pos.z + (Math.random()-0.5)*0.5);
    m.scale.setScalar(0.06);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.32, maxLife: 0.32, kind: 'spark', pooled: true,
      vel: new THREE.Vector3((Math.random()-0.5)*0.8, 0.5, (Math.random()-0.5)*0.8),
      size: 0.06, gravity: 1.2,
    });
  }
  triggerCameraShake(0.1, 0.15);
  triggerScreenFlash(0xef4444, 0.1, 0.15);
}
```

### 14.6 Evolution Shimmer (ระหว่างสลับรูป)

```js
function spawnEvolutionShimmer(pos) {
  // ชั้นกลางของ evolution: ประกายหมุนรอบตัว
  for (let i = 0; i < 16; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(0xfde047);
    m.material.emissive.setHex(0xfde047);
    const angle = (i / 16) * Math.PI * 2;
    const radius = 0.5 + Math.random() * 0.3;
    m.position.set(pos.x + Math.cos(angle) * radius, pos.y + 0.5 + Math.random(), pos.z + Math.sin(angle) * radius);
    m.scale.setScalar(0.04);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.6, maxLife: 0.6, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(0, 0.3, 0),
      size: 0.04, gravity: -0.1,
      // หมุนรอบ: เพิ่ม angular velocity
      angularVel: angle + Math.PI,
    });
  }
}
```

---

## 15. Screen Flash & Hit Flash

### 15.1 Screen Flash (แสงทั้งจอ)

```js
let screenFlashEl = null;
function triggerScreenFlash(color = 0xffffff, opacity = 0.15, duration = 0.2) {
  if (!screenFlashEl) {
    screenFlashEl = document.createElement('div');
    screenFlashEl.id = 'screenFlash';
    screenFlashEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;opacity:0;transition:opacity 0.1s ease-out;';
    document.body.appendChild(screenFlashEl);
  }
  const hex = '#' + color.toString(16).padStart(6, '0');
  screenFlashEl.style.background = hex;
  screenFlashEl.style.opacity = String(opacity);
  setTimeout(() => {
    screenFlashEl.style.opacity = '0';
  }, duration * 1000);
}
```

### 15.2 Hit Flash (ตัวมอนกระพริบ)

```js
// ตอนโดนตี: ตัวมอนกระพริบขาว
function hitFlash(mesh) {
  if (!mesh || !mesh.material) return;
  const origColor = mesh.material.color.clone();
  const origEmissive = mesh.material.emissive?.clone();
  mesh.material.color.setHex(0xffffff);
  if (mesh.material.emissive) mesh.material.emissive.setHex(0xffffff);
  if (mesh.material.emissiveIntensity !== undefined) mesh.material.emissiveIntensity = 0.8;
  setTimeout(() => {
    if (mesh.material) {
      mesh.material.color.copy(origColor);
      if (mesh.material.emissive && origEmissive) mesh.material.emissive.copy(origEmissive);
      if (mesh.material.emissiveIntensity !== undefined) mesh.material.emissiveIntensity = 0.18;
    }
  }, 80);
}

// ใช้ใน damageWild:
function damageWild(w, dmg, meta) {
  // ... existing ...
  hitFlash(w.mesh); // เพิ่ม
  // ...
}
```

### 15.3 Hit Flash สำหรับ Bighead Monster (multi-material)

```js
// Bighead monster มีหลาย mesh ใน group → flash ทุกชิ้น
function hitFlashGroup(group) {
  group.traverse(child => {
    if (child.isMesh && child.material) {
      const orig = {
        color: child.material.color.clone(),
        emissive: child.material.emissive?.clone(),
        intensity: child.material.emissiveIntensity,
      };
      child.material.color.setHex(0xffffff);
      if (child.material.emissive) child.material.emissive.setHex(0xffffff);
      if (child.material.emissiveIntensity !== undefined) child.material.emissiveIntensity = 0.8;
      setTimeout(() => {
        if (child.material) {
          child.material.color.copy(orig.color);
          if (child.material.emissive && orig.emissive) child.material.emissive.copy(orig.emissive);
          if (child.material.emissiveIntensity !== undefined) child.material.emissiveIntensity = orig.intensity;
        }
      }, 80);
    }
  });
}
```

---

---

## 16. Skill VFX — รายละเอียดทุกสกิล (27 สกิล)

เกมมี 19 species × 3 สกิลต่อ species = 57 สกิล (แต่บางสกิลใช้ซ้ำ type) รวม 27 สกิลไม่ซ้ำ

### 16.1 ตารางสกิลทั้งหมด

| # | สกิล | Type | Power | Target | Effect | VFX ปัจจุบัน | VFX ที่ต้องเพิ่ม |
|---|------|------|-------|--------|--------|-------------|---------------|
| 1 | Tackle | Normal | 24 | enemy | — | burst+impact | เพิ่ม trail ตัว |
| 2 | Echo Pound | Normal | 18 | area | — | summon+impact×N | เพิ่ม wave ring |
| 3 | Focus Pose | Normal | 0 | self | buffAtk | summon | เพิ่ม buff aura |
| 4 | Flame Burst | Fire | 28 | enemy | — | burst+impact | เพิ่ม flame trail |
| 5 | Fire Ring | Fire | 20 | area | — | summon+impact×N | เพิ่ม ring ไฟ |
| 6 | Warm Up | Fire | 0 | self | buffAtk | summon | เพิ่ม flame aura |
| 7 | Bubble Lance | Water | 26 | enemy | — | burst+impact | เพิ่ม water stream |
| 8 | Tidal Splash | Water | 19 | area | — | summon+impact×N | เพิ่ม wave |
| 9 | Water Veil | Water | 0 | self | shield | summon | เพิ่ม shield bubble |
| 10 | Volt Dash | Electric | 29 | enemy | — | burst+impact | เพิ่ม lightning bolt |
| 11 | Thunder Field | Electric | 18 | area | — | summon+impact×N | เพิ่ม electric field |
| 12 | Overcharge | Electric | 0 | self | buffAtk | summon | เพิ่ม spark aura |
| 13 | Leaf Pulse | Grass | 24 | enemy | — | burst+impact | เพิ่ม leaf spiral |
| 14 | Seed Burst | Grass | 17 | area | — | summon+impact×N | เพิ่ม seed scatter |
| 15 | Regrowth | Grass | 0 | self | heal | summon | เพิ่ม heal glow |
| 16 | Frost Wing | Ice | 30 | enemy | — | burst+impact | เพิ่ม ice shard |
| 17 | Hail Sweep | Ice | 20 | area | — | summon+impact×N | เพิ่ม ice field |
| 18 | Ice Guard | Ice | 0 | self | shield | summon | เพิ่ม ice shield |
| 19 | Combo Punch | Fighting | 30 | enemy | — | burst+impact | เพิ่ม punch trail |
| 20 | Shockwave Kick | Fighting | 21 | area | — | summon+impact×N | เพิ่ม shockwave |
| 21 | Battle Cry | Fighting | 0 | self | buffAtk | summon | เพิ่ม rage aura |
| 22 | Toxic Spit | Poison | 25 | enemy | — | burst+impact | เพิ่ม poison stream |
| 23 | Venom Cloud | Poison | 19 | area | — | summon+impact×N | เพิ่ม poison cloud |
| 24 | Acid Skin | Poison | 0 | self | shield | summon | เพิ่ม poison shield |
| 25 | Mud Shot | Ground | 27 | enemy | — | burst+impact | เพิ่ม mud blob |
| 26 | Quake Ring | Ground | 20 | area | — | summon+impact×N | เพิ่ม quake crack |
| 27 | Sand Guard | Ground | 0 | self | shield | summon | เพิ่ม sand shield |
| 28 | Gust Peck | Flying | 27 | enemy | — | burst+impact | เพิ่ม wind slash |
| 29 | Feather Storm | Flying | 19 | area | — | summon+impact×N | เพิ่ม feather scatter |
| 30 | Wind Focus | Flying | 0 | self | buffAtk | summon | เพิ่ม wind aura |
| 31 | Mind Bolt | Psychic | 28 | enemy | — | burst+impact | เพิ่ม psychic bolt |
| 32 | Psy Wave | Psychic | 20 | area | — | summon+impact×N | เพิ่ม psy field |
| 33 | Inner Focus | Psychic | 0 | self | heal | summon | เพิ่ม psy heal |
| 34 | Pin Bite | Bug | 26 | enemy | — | burst+impact | เพิ่mand bite flash |
| 35 | Swarm Spin | Bug | 18 | area | — | summon+impact×N | เพิ่ม swarm ring |
| 36 | Carapace Boost | Bug | 0 | self | shield | summon | เพิ่ม bug shell |
| 37 | Stone Crash | Rock | 29 | enemy | — | burst+impact | เพิ่ม rock shard |
| 38 | Pebble Burst | Rock | 20 | area | — | summon+impact×N | เพิ่ม pebble scatter |
| 39 | Rock Guard | Rock | 0 | self | shield | summon | เพิ่ม rock shield |
| 40 | Phantom Paw | Ghost | 28 | enemy | — | burst+impact | เพิ่ม ghost claw |
| 41 | Haunt Pulse | Ghost | 20 | area | — | summon+impact×N | เพิ่ม haunt field |
| 42 | Fade Veil | Ghost | 0 | self | shield | summon | เพิ่ม ghost shield |
| 43 | Dragon Flame | Dragon | 34 | enemy | — | burst+impact | เพิ่ม dragon breath |
| 44 | Scale Burst | Dragon | 22 | area | — | summon+impact×N | เพิ่ม scale ring |
| 45 | Ancient Rage | Dragon | 0 | self | buffAtk | summon | เพิ่ม rage aura ใหญ่ |
| 46 | Night Crash | Dark | 31 | enemy | — | burst+impact | เพิ่ม dark slash |
| 47 | Shadow Burst | Dark | 21 | area | — | summon+impact×N | เพิ่ม shadow field |
| 48 | Void Guard | Dark | 0 | self | shield | summon | เพิ่ม dark shield |
| 49 | Steel Cutter | Steel | 31 | enemy | — | burst+impact | เพิ่ม metal slash |
| 50 | Metal Swarm | Steel | 18 | area | — | summon+impact×N | เพิ่ม metal fragments |
| 51 | Iron Shell | Steel | 0 | self | shield | summon | เพิ่ม steel shell |
| 52 | Fairy Spark | Fairy | 26 | enemy | — | burst+impact | เพิ่ม fairy spark |
| 53 | Star Dust | Fairy | 18 | area | — | summon+impact×N | เพิ่ม star scatter |
| 54 | Blessing | Fairy | 0 | self | heal | summon | เพิ่ม fairy heal |

---

## 17. Skill VFX ตาม Target Type (enemy/area/self)

### 17.1 Enemy Target (single-hit) — 18 สกิล

```
Sequence (0.55s):

  0ms:   playerVisual.play('skill')     → ผู้เล่นท่าปา
  0ms:   triggerMonsterAction('attack') → มอนท่าโจมตี
  0ms:   spawnElementalFX(type, attacker, 'burst', 1)
         → 12 particle ที่ตัวผู้โจมตี (เหมือนชาร์จพลัง)
  0ms:   spawnElementalFX(type, target, 'impact', 0.9)
         → 7 particle ที่ตัวเป้าหมาย (เหมือนโดน)
  0ms:   spawnGroundDecal(type, target)
         → วงพื้นเหลี่ยม สีตาม type
  0ms:   damageWild(target, damage)
         → spawnDamageNumber + hitFlash + scale shrink
  0ms:   triggerCameraShake(eff>1?0.14:0.09, 0.16)

  +200ms: (เพิ่มใหม่) spawnSkillTrail(type, attacker→target)
         → เส้น particle จากผู้โจมตีไปเป้าหมาย

  400ms: particle หมด life → release pool
  550ms: ground decal หมด → dispose
```

### 17.2 Area Target (multi-hit) — 18 สกิล

```
Sequence (1.45s):

  0ms:   playerVisual.play('skill')
  0ms:   triggerMonsterAction('attack', 0.26)
  0ms:   spawnElementalFX(type, attacker, 'summon', 0.9)
         → 14 particle ที่ตัวผู้โจมตี (ชาร์จใหญ่)
  0ms:   spawnGroundDecal(type, attacker, {radius: move.range*0.7})
         → วงพื้นใหญ่รอบผู้โจมตี
  0ms:   triggerCameraShake(0.11, 0.17)

  +50ms: (เพิ่มใหม่) spawnAreaWave(type, attacker, move.range)
         → วงกลมขยายออก (box wireframe ขยาย)

  50ms:  for each target:
           spawnElementalFX(type, target, 'impact', 0.75)
           → 7 particle ที่แต่ละเป้าหมาย
           spawnGroundDecal(type, target)
           damageWild(target, damage)

  400ms: particle หมด
  1050ms: ground decal เล็กหมด
  1450ms: ground decal ใหญ่หมด
```

### 17.3 Self Target (buff/heal/shield) — 18 สกิล

```
Sequence (1.2s):

  0ms:   triggerMonsterAction('attack', 0.22)
  0ms:   spawnElementalFX(type, attacker, 'summon', 0.8)
         → 14 particle รอบตัว (เหมือนชาร์จพลัง)
  0ms:   spawnGroundDecal(type, attacker, {radius: 1.2})
         → วงพื้นรอบตัว

  +200ms: (เพิ่มใหม่) spawnBuffAura(type, attacker, effect)
         → aura ล้อมรอบตัว สีตาม effect:
           - heal: เขียว + ลอยขึ้น
           - shield: ฟ้า + โปร่งใส
           - buffAtk: ส้ม/แดง + พุ่งขึ้น

  0ms:   if heal: spawnDamageNumber(gain, healing=true, label='HEAL')
  0ms:   if shield: (เพิ่มใหม่) spawnShieldRing(attacker, type)
         → วงโล่ะแสงรอบตัว
  0ms:   if buffAtk: (เพิ่มใหม่) spawnBuffRing(attacker, type)
         → วงเปลวไฟ/พลังรอบตัว

  1200ms: ground decal หมด → aura หาย
```

---

## 18. Skill VFX ตาม Effect Type (heal/shield/buffAtk)

### 18.1 Heal VFX (3 สกิล: Regrowth/Inner Focus/Blessing)

```js
function spawnHealSkillEffect(pos, type) {
  const cfg = typeFx(type);
  // ประกายเขียวลอยขึ้น รอบตัว
  for (let i = 0; i < 10; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(0x4ade80);
    m.material.emissive.setHex(0x4ade80);
    const angle = (i / 10) * Math.PI * 2;
    m.position.set(
      pos.x + Math.cos(angle) * 0.5,
      pos.y + 0.2 + Math.random() * 0.3,
      pos.z + Math.sin(angle) * 0.5
    );
    m.scale.setScalar(0.05);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.8, maxLife: 0.8, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(0, 1.0 + Math.random() * 0.3, 0),
      size: 0.05, gravity: -0.1,
    });
  }
  // ring pulse เขียว
  spawnRingPulse(pos.clone(), 0x4ade80, { scale: 0.8, life: 0.4, y: 0.1 });
  // + type particle (เพิ่มเติมตาม type)
  spawnElementalFX(type, pos, 'aura', 0.5);
}
```

### 18.2 Shield VFX (9 สกิล: Water Veil/Ice Guard/Acid Skin/Sand Guard/Carapace/Rock Guard/Fade Veil/Void Guard/Iron Shell)

```js
function spawnShieldSkillEffect(pos, type, duration) {
  const cfg = typeFx(type);
  // วงโล่ะแสงรอบตัว — box wireframe โปร่งใส
  const shieldMesh = new THREE.Mesh(
    boxGeometry(1.4, 1.8, 1.4),
    new THREE.MeshBasicMaterial({
      color: cfg.core, transparent: true, opacity: 0,
      wireframe: true, depthWrite: false,
    })
  );
  shieldMesh.position.copy(pos);
  shieldMesh.position.y += 0.9;
  scene.add(shieldMesh);
  effects.push({
    mesh: shieldMesh, life: duration, maxLife: duration, kind: 'shield-aura',
  });
  // ประกายขึ้นรอบตัว
  for (let i = 0; i < 8; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(cfg.core);
    m.material.emissive.setHex(cfg.core);
    const angle = (i / 8) * Math.PI * 2;
    m.position.set(
      pos.x + Math.cos(angle) * 0.6,
      pos.y + 0.1,
      pos.z + Math.sin(angle) * 0.6
    );
    m.scale.setScalar(0.04);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.6, maxLife: 0.6, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(0, 0.8, 0),
      size: 0.04, gravity: -0.05,
    });
  }
}
```

### 18.3 BuffAtk VFX (6 สกิล: Focus Pose/Warm Up/Overcharge/Wind Focus/Battle Cry/Ancient Rage)

```js
function spawnBuffAtkSkillEffect(pos, type, duration) {
  const cfg = typeFx(type);
  // เปลวพลังรอบตัว — particle พุ่งขึ้น
  for (let i = 0; i < 12; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(cfg.accent);
    m.material.emissive.setHex(cfg.accent);
    m.material.emissiveIntensity = 0.6;
    const angle = (i / 12) * Math.PI * 2;
    m.position.set(
      pos.x + Math.cos(angle) * 0.4,
      pos.y + 0.1,
      pos.z + Math.sin(angle) * 0.4
    );
    m.scale.setScalar(0.05);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.7, maxLife: 0.7, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(0, 1.5 + Math.random() * 0.5, 0),
      size: 0.05, gravity: -0.3,
    });
  }
  // ring pulse สี accent
  spawnRingPulse(pos.clone(), cfg.accent, { scale: 0.7, life: 0.35, y: 0.1 });
  // (เพิ่มใหม่) aura คงอยู่ตลอด duration
  const auraMesh = new THREE.Mesh(
    boxGeometry(1.2, 2.0, 1.2),
    new THREE.MeshBasicMaterial({
      color: cfg.accent, transparent: true, opacity: 0,
      wireframe: true, depthWrite: false,
    })
  );
  auraMesh.position.copy(pos);
  auraMesh.position.y += 1.0;
  scene.add(auraMesh);
  effects.push({
    mesh: auraMesh, life: duration, maxLife: duration, kind: 'buff-aura',
  });
}
```

---

## 19. Skill VFX ตาม Type (18 type × 3 สกิล)

### 19.1 Type-specific Skill Trail (เพิ่มใหม่)

แต่ละ type มีเส้น particle จากผู้โจมตีไปเป้าหมาย แบบต่างกัน:

```js
function spawnSkillTrail(type, fromPos, toPos) {
  const cfg = typeFx(type);
  const dist = fromPos.distanceTo(toPos);
  const count = Math.max(4, Math.round(dist * 3));

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(i % 2 ? cfg.accent : cfg.core);
    m.material.emissive.setHex(i % 2 ? cfg.accent : cfg.core);

    // ตำแหน่ง: lerp จาก from → to + โค้ง
    m.position.lerpVectors(fromPos, toPos, t);
    m.position.y += Math.sin(t * Math.PI) * 0.5; // โค้งขึ้น
    m.scale.setScalar(0.04 * (1 - t * 0.5)); // เล็กลงตอนท้าย
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(m);

    // Type-specific behavior:
    const vel = new THREE.Vector3();
    switch (cfg.shape) {
      case 'flame': vel.y = 0.3; break;           // Fire: ลอยขึ้น
      case 'drop': vel.y = -0.2; break;           // Water: ตกลง
      case 'spark': vel.x = Math.sin(i) * 0.5; break; // Electric: ซิกแซก
      case 'mist': vel.y = 0.05; break;           // Ghost: ลอยช้า
      case 'dust': vel.y = -0.3; break;           // Ground: ตกหนัก
      case 'shard': vel.y = -0.4; break;          // Rock: ตกหนักมาก
      default: vel.set(0, 0.1, 0);
    }

    effects.push({
      mesh: m, life: 0.3, maxLife: 0.3, kind: 'spark', pooled: true,
      vel, size: m.scale.x, gravity: 0.2,
    });
  }
}
```

### 19.2 Type-specific Area Wave (เพิ่มใหม่)

```js
function spawnAreaWave(type, pos, range) {
  const cfg = typeFx(type);
  // วงขยายออก — box wireframe ขยาย
  const wave = new THREE.Mesh(
    boxGeometry(0.5, 0.05, 0.5),
    new THREE.MeshBasicMaterial({
      color: cfg.core, transparent: true, opacity: 0.8,
      wireframe: true, depthWrite: false,
    })
  );
  wave.position.copy(pos);
  wave.position.y = 0.06;
  scene.add(wave);
  effects.push({
    mesh: wave, life: 0.5, maxLife: 0.5, kind: 'area-wave',
    expandTo: range * 2,
  });

  // + particle กระจายตาม type
  for (let i = 0; i < 8; i++) {
    const m = sparkPool.acquire();
    m.visible = true;
    m.material.color.setHex(cfg.accent);
    m.material.emissive.setHex(cfg.accent);
    const angle = (i / 8) * Math.PI * 2;
    m.position.set(pos.x, pos.y + 0.2, pos.z);
    m.scale.setScalar(0.05);
    scene.add(m);
    effects.push({
      mesh: m, life: 0.4, maxLife: 0.4, kind: 'spark', pooled: true,
      vel: new THREE.Vector3(Math.cos(angle) * range, 0.3, Math.sin(angle) * range),
      size: 0.05, gravity: 0.3,
    });
  }
}

// ใน updateEffects เพิ่ม:
if (e.kind === 'area-wave') {
  const t = 1 - e.life / e.maxLife;
  const scale = 0.5 + t * (e.expandTo || 3);
  e.mesh.scale.set(scale, 1, scale);
  e.mesh.material.opacity = (1 - t) * 0.8;
}
```

### 19.3 ตาราง Type × Skill VFX โดยละเอียด

| Type | Skill 1 (enemy) | Skill 2 (area) | Skill 3 (self) | Trail พิเศษ |
|------|----------------|----------------|----------------|-------------|
| Normal | Tackle — พุ่งชน | Echo Pound — wave กลม | Focus Pose — สีทอง | เส้นตรงสั้น |
| Fire | Flame Burst — เปลวไฟ | Fire Ring — วงไฟ | Warm Up — aura ส้ม | เปลวไฟลอยขึ้น |
| Water | Bubble Lance — กระแทกน้ำ | Tidal Splash — wave น้ำ | Water Veil — ฟองน้ำ | หยดน้ำตก |
| Electric | Volt Dash — สายฟ้าพุ่ง | Thunder Field — สนามไฟฟ้า | Overcharge — ประกาย | ซิกแซกเหลือง |
| Grass | Leaf Pulse — ใบพุ่ง | Seed Burst — เมล็ดกระจาย | Regrowth — เขียวลอย | ใบหมุน |
| Ice | Frost Wing — ผลึกแหลม | Hail Sweep — ลูกเห็บ | Ice Guard — โล่ะผลึก | ผลึกตกช้า |
| Fighting | Combo Punch — หมัด | Shockwave Kick — คลื่นกระแทก | Battle Cry — aura แดง | เส้นหมัดเร็ว |
| Poison | Toxic Spit — พิษพุ่ง | Venom Cloud — หมอกพิษ | Acid Skin — โล่ะพิษ | พิษเปื้อน |
| Ground | Mud Shot — โคลนพุ่ง | Quake Ring — รอยแยก | Sand Guard — โล่ะทราย | โคลนตกหนัก |
| Flying | Gust Peck — ลม slashed | Feather Storm — ขนกระจาย | Wind Focus — aura ลม | ลมเฉียบ |
| Psychic | Mind Bolt — พลังจิต | Psy Wave — สนามจิต | Inner Focus — สมาธิ | สายเรืองแสง |
| Bug | Pin Bite — กัด | Swarm Spin — วงแมลง | Carapace Boost — เปลือก | แมลงบิน |
| Rock | Stone Crash — หินตก | Pebble Burst — กรวด | Rock Guard — โล่ะหิน | หินตกหนัก |
| Ghost | Phantom Paw — เงากรงเล็บ | Haunt Pulse — สนามผี | Fade Veil — โล่ะผี | เงาลอยช้า |
| Dragon | Dragon Flame — มังกรพ่นไฟ | Scale Burst — เกล็ดกระจาย | Ancient Rage — aura ใหญ่ | ไฟมังกรใหญ่ |
| Dark | Night Crash — มืดพุ่ง | Shadow Burst — เงากระจาย | Void Guard — โล่ะมืด | มืดทึบ |
| Steel | Steel Cutter — โลหะ slashed | Metal Swarm — เศษโลหะ | Iron Shell — โล่ะเหล็ก | โลหะแวบ |
| Fairy | Fairy Spark — ประกายน้ำตาล | Star Dust — ดาวกระจาย | Blessing — รัศมี | ประกายนุ่ม |

---

## 20. Skill VFX Timing & Sequence

### 20.1 Enemy Skill Timeline (ละเอียด)

```
t=0ms:   useSkill(index) เรียก
         ├─ playerVisual.play('skill', 0.28)    → ผู้เล่นท่าปา (280ms)
         ├─ triggerMonsterAction(mesh, 'attack', 0.24) → มอนท่าโจมตี (240ms)
         ├─ spawnElementalFX(type, attacker, 'burst', 1)
         │   → 12 particle ที่ตัวผู้โจมตี (400ms life)
         │   → particle โผล่+ขยาย เหมือนชาร์จพลัง
         ├─ (เพิ่มใหม่) spawnSkillTrail(type, attacker→target)
         │   → 4-12 particle เส้นจาก attacker ไป target (300ms)
         │   → โค้งขึ้น + type-specific behavior
         ├─ spawnElementalFX(type, target, 'impact', 0.9)
         │   → 7 particle ที่ตัวเป้าหมาย (400ms)
         │   → กระจายรอบเป้าหมาย เหมือนโดน
         ├─ spawnGroundDecal(type, target)
         │   → box สี่เหลี่ยมบนพื้น (1150ms)
         │   → สีตาม type + wireframe ขอบ
         ├─ damageWild(target, damage)
         │   ├─ spawnDamageNumber(damage, target+1.35y)
         │   │   → DOM floating text (900ms)
         │   │   → สีตาม type + SUPER/RESIST label
         │   ├─ (เพิ่มใหม่) hitFlashGroup(target.mesh)
         │   │   → ตัวมอนกระพริบขาว (80ms)
         │   ├─ mesh.scale *= 0.94 (สั่น)
         │   └─ setTimeout 90ms → scale คืน
         ├─ triggerCameraShake(eff>1?0.14:0.09, 0.16)
         │   → กล้องสั่น (160ms)
         │   → แรงสั่นตาม effectiveness
         └─ msg(skill name + damage + effectiveness)

t=80ms:  hitFlash หมด → สีคืนปกติ
t=90ms:  target scale คืน
t=160ms: camera shake หมด
t=240ms: มอนโจมตี animation หมด
t=280ms: ผู้เล่นท่าปา หมด
t=300ms: skill trail หมด
t=400ms: burst + impact particle หมด → release pool
t=900ms: damage number หมด → DOM remove
t=1150ms: ground decal หมด → dispose
```

### 20.2 Area Skill Timeline (ละเอียด)

```
t=0ms:   useSkill(index) area
         ├─ playerVisual.play('skill', 0.28)
         ├─ triggerMonsterAction(mesh, 'attack', 0.26)
         ├─ spawnElementalFX(type, attacker, 'summon', 0.9)
         │   → 14 particle รอบตัวผู้โจมตี (800ms)
         │   → ชาร์จใหญ่กว่า enemy
         ├─ spawnGroundDecal(type, attacker, {radius: range*0.7})
         │   → วงพื้นใหญ่รอบผู้โจมตี (1450ms)
         ├─ (เพิ่มใหม่) spawnAreaWave(type, attacker, range)
         │   → box wireframe ขยายจาก 0.5 → range*2 (500ms)
         │   → + 8 particle กระจายตาม type
         ├─ triggerCameraShake(0.11, 0.17)
         └─ for each target (stagger 50ms):
             t+50ms×i:
               ├─ spawnElementalFX(type, target, 'impact', 0.75)
               ├─ spawnGroundDecal(type, target)
               ├─ damageWild(target)
               └─ (เพิ่มใหม่) hitFlashGroup(target.mesh)

t=170ms: camera shake หมด
t=400ms: first target impact particle หมด
t=500ms: area wave หมด
t=800ms: summon particle หมด
t=1050ms: small ground decals หมด
t=1450ms: large ground decal หมด
```

### 20.3 Self Skill Timeline (ละเอียด)

```
t=0ms:   useSkill(index) self
         ├─ triggerMonsterAction(mesh, 'attack', 0.22)
         ├─ spawnElementalFX(type, attacker, 'summon', 0.8)
         │   → 14 particle รอบตัว (800ms)
         ├─ spawnGroundDecal(type, attacker, {radius: 1.2})
         │   → วงพื้นรอบตัว (1200ms)
         ├─ if heal:
         │   ├─ spawnDamageNumber(gain, healing=true, 'HEAL')
         │   └─ (เพิ่มใหม่) spawnHealSkillEffect(pos, type)
         │       → เขียวลอยขึ้น + ring pulse (800ms)
         ├─ if shield:
         │   └─ (เพิ่มใหม่) spawnShieldSkillEffect(pos, type, duration)
         │       → box wireframe aura คงอยู่ (duration seconds)
         │       → + 8 particle ขึ้นรอบตัว (600ms)
         └─ if buffAtk:
             └─ (เพิ่มใหม่) spawnBuffAtkSkillEffect(pos, type, duration)
                 → 12 particle พุ่งขึ้น (700ms)
                 → + box wireframe aura คงอยู่ (duration seconds)
                 → + ring pulse accent (350ms)

t=350ms: buff ring pulse หมด
t=600ms: shield/buff startup particle หมด
t=700ms: buffAtk startup particle หมด
t=800ms: summon particle หมด
t=1200ms: ground decal หมด
t=duration: shield/buff aura หมด (5-9s)
```

### 20.4 Cooldown VFX (เพิ่มใหม่)

```js
// แสดง cooldown บนปุ่มสกิล — dim + timer
function renderSkillCooldown(button, cd) {
  if (cd > 0) {
    button.classList.add('on-cooldown');
    button.style.opacity = '0.5';
    // แสดงเวลาที่เหลือ
    const cdText = cd.toFixed(1) + 's';
    button.dataset.cd = cdText;
  } else {
    button.classList.remove('on-cooldown');
    button.style.opacity = '1';
    delete button.dataset.cd;
  }
}
```

---

## 21. Throw VFX — ปาบอล/ปาเรียก (ละเอียด)

### 21.1 Throw VFX แบบใหม่ (Blocky + เพิ่ม detail)

```js
function throwProjectile(type, targetPos, onHit) {
  const isCapture = type === 'capture';
  const color = isCapture ? 0x3b82f6 : 0x8b5cf6;
  // กระสุน: box เหลี่ยม (เดิม sphere)
  const mesh = new THREE.Mesh(
    boxGeometry(0.14, 0.14, 0.14),
    new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.45,
      transparent: true, opacity: 0.96, roughness: 0.3, metalness: 0.4,
    })
  );
  mesh.position.copy(playerThrowOrigin());
  mesh.castShadow = true;
  mesh.userData.spin = true;
  mesh.userData.spinSpeed = (Math.random() - 0.5) * 10;
  scene.add(mesh);
  spawnBurst(mesh.position.clone(), color, { count: 5, life: 0.18, size: 0.04 });
  projectiles.push({ mesh, type, color, start: mesh.position.clone(), end: targetPos.clone(), t: 0, duration: 0.55, onHit, lastTrail: 0, spinSpeed: mesh.userData.spinSpeed });
}
```

### 21.2 Throw Timeline

```
ปาเรียก (summonThrow):
  t=0:    playerVisual.play('throw', 0.34) → ท่าปา
  t=0:    throwProjectile('summon', end) → box กระสุน + burst
  t=0-550ms: กระสุนบินโค้ง (parabola) + หมุน
    ทุก 80ms: trail particle ตาม type
  t=550:  ถึงเป้า → spawnBurst(8) + spawnRingPulse + onHit → spawnOwned

ปาจับ (executeCaptureThrow):
  t=0:    playerVisual.play('throw', 0.34)
  t=0:    captureBalls--
  t=0:    throwProjectile('capture', end) → box กระสุน + burst
  t=0-550ms: กระสุนบินโค้ง + trail ฟ้า
  t=550:  ถึงเป้า → spawnBurst(8) + spawnRingPulse + onHit → startCaptureSequence
```

---

## 22. Capture VFX — จับมอน + ดีเลย์รอบจับ (ละเอียด)

### 22.1 Capture Flow ใหม่ (มีดีเลย์ 5 ชั้น)

```
บอลกระทบ → ดูดมอน → ตกพื้น → ตึงเครียด 1.7s → ผลลัพธ์
  200ms      400ms     200ms      1700ms       สำเร็จ/ล้มเหลว
  ──────────────────────────────────────────────
  รวม: 2500ms (2.5 วินาที)
```

### 22.2 Capture Sequence 5 ชั้น

| ชั้น | เวลา | สิ่งที่เกิด | VFX |
|-----|------|-----------|-----|
| 1. Impact | 0-200ms | บอลกระทบ + ซ่อนมอน | burst ขาว 10 + ring ฟ้า + flash ขาว + shake |
| 2. Suck | 200-600ms | บอลโต + ดูดมอนเข้า | particle วิ่งเข้าหาบอล + ring ฟ้า |
| 3. Drop | 600-800ms | บอลตกพื้น + เด้ง | burst ฟ้า 4 + บอลเด้ง |
| 4. Tension | 800-2500ms | บอลสั่น + แสงกระพริบ | สั่นรุนแรงขึ้น + ฟ้า→เหลือง→แดง + UI |
| 5. Result | 2500ms | สำเร็จ/ล้มเหลว | สำเร็จ=เขียว 16 / ล้มเหลว=แดง 8 + มอนออก |

### 22.3 Tension Phase ละเอียด

```
t=800ms (เริ่ม tension):
  ├─ บอลสั่น: สั่นรุนแรงขึ้นเรื่อยๆ (0.01 → 0.05)
  ├─ แสงกระพริบ:
  │   0-50%:  ฟ้า (0x3b82f6) → กระพริบ ช้า
  │   50-80%: เหลือง (0xfacc15) → กระพริบ เร็วขึ้น
  │   80-100%: แดง (0xef4444) → กระพริบ เร็วมาก
  ├─ particle รอบบอล: น้อยลงเรื่อยๆ (สงบ)
  └─ UI: จุด 1→2→3 ดวง + สั่น + สีเปลี่ยน

t=2500ms (ผลลัพธ์):
  สำเร็จ:
    ├─ spawnBurst(16 เขียว, 0.5s)
    ├─ spawnRingPulse(เขียว, 0.9) + spawnRingPulse(เขียว, 1.2)
    ├─ spawnGroundDecal(type, 1.2)
    ├─ triggerCameraShake(0.1, 0.2)
    ├─ triggerScreenFlash(เขียว, 0.2, 0.3)
    ├─ ทำลายบอล + มอน
    └─ msg('จับ สำเร็จ! [X%]')
  ล้มเหลว:
    ├─ spawnBurst(8 แดง, 0.3s)
    ├─ spawnRingPulse(แดง, 0.5)
    ├─ triggerScreenFlash(แดง, 0.1, 0.15)
    ├─ ทำลายบอล + มอนออกมากระเด้ง
    ├─ มอนโกรธ (state='chase')
    └─ msg('จับ ไม่สำเร็จ [X%] • บอลแตก!')
```

### 22.4 Capture Tension UI

```html
<!-- DOM overlay กลางจอ -->
<div id="captureTension">
  <div class="capture-tension-ball">⚪</div>
  <div class="capture-tension-name">[ชื่อมอน]</div>
  <div class="capture-tension-chance">[X]%</div>
  <div class="capture-tension-dots">
    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
  </div>
</div>
```

```css
#captureTension { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center; z-index:9000; pointer-events:none; }
.capture-tension-ball { font-size:48px; animation:ballShake 0.1s infinite; }
.capture-tension-name { font-size:16px; font-weight:bold; color:#fff; text-shadow:0 0 8px rgba(0,0,0,0.8); }
.capture-tension-chance { font-size:14px; color:#94a3b8; }
.capture-tension-dots { display:flex; gap:8px; justify-content:center; margin-top:12px; }
.dot { width:10px; height:10px; border-radius:2px; background:#334155; transition:background 0.2s; }
.dot.active { background:#3b82f6; }
#captureTension.yellow .dot.active { background:#facc15; }
#captureTension.red .dot.active { background:#ef4444; }
#captureTension.red .capture-tension-ball { animation:ballShake 0.05s infinite; }
@keyframes ballShake { 0%{transform:translateX(0)} 25%{transform:translateX(-2px)} 75%{transform:translateX(2px)} 100%{transform:translateX(0)} }
```

### 22.5 Capture Sequence โค้ดเต็ม

```js
let captureSequence = null;

function startCaptureSequence(wild) {
  if (!wild || wild.dead) { msg('ปาพลาด • เสีย Capture Ball 1 ลูก'); renderHUD(); saveGame(false); return; }
  const pos = wild.mesh.position.clone();
  const sp = spById[wild.speciesId];
  const name = wildDisplayName(wild);
  const chance = captureChance(wild);
  if (wild.capturePolicy === 'disabled') { msg(`Boss ${name} จับไม่ได้`); return; }
  const success = Math.random() < chance;
  wild.mesh.visible = false;
  const ballMesh = new THREE.Mesh(boxGeometry(0.28,0.28,0.28),
    new THREE.MeshStandardMaterial({ color:0x3b82f6, emissive:0x3b82f6, emissiveIntensity:0.3, roughness:0.2, metalness:0.6 }));
  ballMesh.position.copy(pos); ballMesh.position.y = 0.7; ballMesh.castShadow = true;
  scene.add(ballMesh);
  captureSequence = { wild, ballMesh, pos, sp, name, chance, success, phase:'impact', phaseTime:0, wildOriginalScale: wild.mesh.scale.clone() };
}

function updateCaptureSequence(dt) {
  if (!captureSequence) return;
  const cs = captureSequence; cs.phaseTime += dt;
  if (cs.phase === 'impact') {
    if (cs.phaseTime < 0.05) {
      spawnBurst(cs.pos.clone().add(new THREE.Vector3(0,0.7,0)), 0xffffff, {count:10,life:0.3,size:0.05});
      spawnRingPulse(cs.pos.clone(), 0x3b82f6, {scale:0.5,life:0.25,y:0.1});
      triggerCameraShake(0.08, 0.15); triggerScreenFlash(0xffffff, 0.15, 0.1);
    }
    cs.ballMesh.position.y = 0.7 + Math.sin(cs.phaseTime * 30) * 0.03;
    if (cs.phaseTime >= 0.2) { cs.phase = 'suck'; cs.phaseTime = 0; }
  } else if (cs.phase === 'suck') {
    const t = cs.phaseTime / 0.4;
    cs.ballMesh.scale.setScalar(1.0 + t * 0.3);
    if (Math.random() < 0.5) {
      const m = sparkPool.acquire(); m.visible = true;
      m.material.color.setHex(0x60a5fa); m.material.emissive.setHex(0x60a5fa);
      const angle = Math.random() * Math.PI * 2;
      m.position.set(cs.pos.x+Math.cos(angle)*0.8, cs.pos.y+0.5+Math.random()*0.5, cs.pos.z+Math.sin(angle)*0.8);
      m.scale.setScalar(0.04); scene.add(m);
      const dir = cs.ballMesh.position.clone().sub(m.position).normalize();
      effects.push({mesh:m,life:0.3,maxLife:0.3,kind:'spark',pooled:true,vel:dir.multiplyScalar(2.0),size:0.04,gravity:0});
    }
    if (cs.phaseTime < 0.05) spawnRingPulse(cs.pos.clone(), 0x60a5fa, {scale:0.6,life:0.3,y:0.1});
    if (cs.phaseTime >= 0.4) { cs.phase = 'drop'; cs.phaseTime = 0; }
  } else if (cs.phase === 'drop') {
    const t = cs.phaseTime / 0.2;
    cs.ballMesh.position.y = 0.7 - t * 0.55;
    cs.ballMesh.scale.setScalar(1.3 - t * 0.3);
    if (t > 0.8) cs.ballMesh.position.y = 0.15 + Math.sin((t-0.8)/0.2*Math.PI)*0.08;
    if (cs.phaseTime < 0.05) spawnBurst(cs.pos.clone().add(new THREE.Vector3(0,0.15,0)), 0x60a5fa, {count:4,life:0.15,size:0.03});
    if (cs.phaseTime >= 0.2) { cs.phase = 'tension'; cs.phaseTime = 0; cs.ballMesh.position.y = 0.15; cs.ballMesh.scale.setScalar(1.0); showCaptureTensionUI(cs.name, cs.chance); }
  } else if (cs.phase === 'tension') {
    const t = cs.phaseTime / 1.7;
    const shakeIntensity = 0.01 + t * 0.04;
    cs.ballMesh.position.x = cs.pos.x + (Math.random()-0.5) * shakeIntensity;
    cs.ballMesh.position.z = cs.pos.z + (Math.random()-0.5) * shakeIntensity;
    const flashColor = t < 0.5 ? 0x3b82f6 : (t < 0.8 ? 0xfacc15 : 0xef4444);
    const flashRate = 0.1 + t * 0.15;
    if (Math.floor(cs.phaseTime / flashRate) !== Math.floor((cs.phaseTime - dt) / flashRate)) {
      cs.ballMesh.material.emissive.setHex(flashColor);
      cs.ballMesh.material.emissiveIntensity = 0.3 + Math.random() * 0.3;
    }
    if (Math.random() < 0.3 * (1 - t)) {
      const m = sparkPool.acquire(); m.visible = true;
      m.material.color.setHex(flashColor); m.material.emissive.setHex(flashColor);
      m.position.set(cs.pos.x+(Math.random()-0.5)*0.4, 0.15+Math.random()*0.2, cs.pos.z+(Math.random()-0.5)*0.4);
      m.scale.setScalar(0.02); scene.add(m);
      effects.push({mesh:m,life:0.2,maxLife:0.2,kind:'spark',pooled:true,vel:new THREE.Vector3(0,0.1,0),size:0.02,gravity:0});
    }
    updateCaptureTensionUI(t);
    if (cs.phaseTime >= 1.7) { cs.phase = 'result'; cs.phaseTime = 0; hideCaptureTensionUI(); }
  } else if (cs.phase === 'result') {
    if (cs.success) finishCaptureSuccess(cs); else finishCaptureFail(cs);
    captureSequence = null;
  }
}

function finishCaptureSuccess(cs) {
  spawnBurst(cs.pos.clone().add(new THREE.Vector3(0,0.5,0)), 0x22c55e, {count:16,life:0.5,size:0.06});
  spawnRingPulse(cs.pos.clone(), 0x22c55e, {scale:0.9,life:0.4,y:0.1});
  spawnRingPulse(cs.pos.clone(), 0x22c55e, {scale:1.2,life:0.5,y:0.1});
  spawnGroundDecal(wildTypes(cs.wild)[0], cs.pos.clone(), {radius:1.2,duration:0.8,intensity:0.85});
  triggerCameraShake(0.1, 0.2); triggerScreenFlash(0x22c55e, 0.2, 0.3);
  removeAndDispose(scene, cs.ballMesh);
  const inst = makeInstance(cs.sp, cs.wild.level, {origin:'captured',genes:cs.wild.genes,gender:cs.wild.gender,bond:24,evolutionPath:cs.wild.evolutionPath,secondaryType:wildPath(cs.wild)?.secondaryType??cs.sp.types[1]??null});
  state.collection.push(inst);
  const empty = state.party.findIndex(x => x === null);
  if (empty >= 0) state.party[empty] = inst.instanceId; else state.storage.push(inst.instanceId);
  cs.wild.dead = true; removeAndDispose(scene, cs.wild.mesh); removeWildLabel(cs.wild);
  state.exp += 5;
  msg(`จับ ${cs.name} สำเร็จ! ${empty>=0?'เข้า Party ช่อง '+(empty+1):'ส่งเข้า Storage'}${cs.wild.elite?' • ELITE':''} (${Math.round(cs.chance*100)}%)`);
  renderAll(); saveGame(false); respawnWild(cs.wild, 8000); retireWild(cs.wild);
}

function finishCaptureFail(cs) {
  spawnBurst(cs.pos.clone().add(new THREE.Vector3(0,0.5,0)), 0xef4444, {count:8,life:0.3,size:0.04});
  spawnRingPulse(cs.pos.clone(), 0xef4444, {scale:0.5,life:0.2,y:0.1});
  triggerScreenFlash(0xef4444, 0.1, 0.15);
  removeAndDispose(scene, cs.ballMesh);
  cs.wild.mesh.visible = true; cs.wild.mesh.scale.copy(cs.wildOriginalScale);
  cs.wild.mesh.position.y = 0.3;
  setTimeout(() => { if (!cs.wild.dead) cs.wild.mesh.position.y = 0; }, 200);
  cs.wild.engaged = true; cs.wild.state = 'chase';
  msg(`จับ ${cs.name} ไม่สำเร็จ (${Math.round(cs.chance*100)}%) • บอลแตก! มอนโกรธ`);
}
```

---

## 23. Summon VFX — เรียกมอน + Recall (ละเอียด)

### 23.1 Summon Arrival Effect (เพิ่มใหม่)

```js
function spawnSummonArrivalEffect(pos, type) {
  const cfg = typeFx(type);
  spawnRingPulse(pos.clone(), cfg.core, {scale:0.8,life:0.4,y:0.08});
  spawnRingPulse(pos.clone(), cfg.core, {scale:1.0,life:0.5,y:0.08});
  for (let i = 0; i < 12; i++) {
    const m = sparkPool.acquire(); m.visible = true;
    m.material.color.setHex(i%2?cfg.accent:cfg.core);
    m.material.emissive.setHex(i%2?cfg.accent:cfg.core);
    m.material.emissiveIntensity = 0.5;
    const angle = (i/12)*Math.PI*2;
    m.position.set(pos.x+Math.cos(angle)*0.6, pos.y+0.3+Math.random()*0.5, pos.z+Math.sin(angle)*0.6);
    m.scale.setScalar(0.05);
    scene.add(m);
    effects.push({mesh:m,life:0.6,maxLife:0.6,kind:'spark',pooled:true,vel:new THREE.Vector3(0,0.8+Math.random()*0.4,0),size:0.05,gravity:-0.1});
  }
  // แสงเสาขึ้นจากพื้น
  const beam = new THREE.Mesh(boxGeometry(0.3,2.5,0.3),
    new THREE.MeshBasicMaterial({color:cfg.core,transparent:true,opacity:0.3,depthWrite:false,blending:THREE.AdditiveBlending}));
  beam.position.copy(pos); beam.position.y += 1.25;
  scene.add(beam);
  effects.push({mesh:beam,life:0.4,maxLife:0.4,kind:'summon-beam'});
  triggerCameraShake(0.05, 0.1);
}
```

### 23.2 Recall Effect (เพิ่มใหม่)

```js
function spawnRecallEffect(pos, type) {
  // แสงเสาลง (กลับด้าน summon)
  const beam = new THREE.Mesh(boxGeometry(0.3,2.5,0.3),
    new THREE.MeshBasicMaterial({color:0x60a5fa,transparent:true,opacity:0.4,depthWrite:false,blending:THREE.AdditiveBlending}));
  beam.position.copy(pos); beam.position.y += 1.25;
  scene.add(beam);
  effects.push({mesh:beam,life:0.3,maxLife:0.3,kind:'recall-beam'});
  // particle พุ่งขึ้น (มอนกลับเข้าบอล)
  for (let i = 0; i < 8; i++) {
    const m = sparkPool.acquire(); m.visible = true;
    m.material.color.setHex(0x60a5fa); m.material.emissive.setHex(0x60a5fa);
    m.position.set(pos.x+(Math.random()-0.5)*0.5, pos.y+Math.random()*1.0, pos.z+(Math.random()-0.5)*0.5);
    m.scale.setScalar(0.04); scene.add(m);
    effects.push({mesh:m,life:0.3,maxLife:0.3,kind:'spark',pooled:true,vel:new THREE.Vector3(0,1.5,0),size:0.04,gravity:-0.3});
  }
}
```

### 23.3 Summon Timeline ละเอียด

```
t=0:     summonThrow() → playerVisual.play('throw') + throwProjectile('summon')
t=0-550: กระสุน box บินโค้ง + หมุน + trail type-specific
t=550:   ถึง → spawnBurst(8) + spawnRingPulse
         → spawnOwned → spawnSummonArrivalEffect:
           ├─ ringPulse × 2 (type color)
           ├─ 12 particle รอบตัว
           ├─ แสงเสาขึ้น (summon-beam, 400ms)
           ├─ cameraShake(0.05, 0.1)
           └─ spawnElementalFX(type, 'summon', 1.05)
t=950:   summon-beam หมด
t=1150:  particle หมด
```

### 23.4 Recall Timeline ละเอียด

```
t=0:     recall() → playerVisual.play('recall', 0.28)
         ├─ spawnRingPulse(ฟ้า, 0.62, 0.26)
         ├─ spawnBurst(ฟ้า, 8, 0.24)
         ├─ spawnRecallEffect:
         │   ├─ แสงเสาลง (recall-beam, 300ms)
         │   └─ 8 particle พุ่งขึ้น
         └─ removeAndDispose(mesh)
t=280:   ท่าเรียกกลับ หมด
t=300:   recall-beam หมด
t=1000:  summonCooldownUntil หมด
```

---

## 24. Capture Tension System — สรุป

### 24.1 ทำไมต้องมีดีเลย์

- **ตื่นเต้น**: ผู้เล่นรอผลลัพธ์ 2.5 วินาที → ใจเต้น
- **ความหวัง**: แสงเปลี่ยน ฟ้า→เหลือง→แดง → รู้สึกใกล้สำเร็จ/ใกล้ล้มเหลว
- **ประสบการณ์**: เหมือนเกมจับมอนจริง (Pokémon-style)
- **ความคาดหวัง**: ดีเลย์ทำให้ผลลัพธ์มีค่ามากขึ้น

### 24.2 ระยะเวลารวม

| ชั้น | เวลา | รวมสะสม |
|-----|------|--------|
| Impact | 200ms | 200ms |
| Suck | 400ms | 600ms |
| Drop | 200ms | 800ms |
| Tension | 1700ms | 2500ms |
| Result | 0ms (ทันที) | 2500ms |

### 24.3 Wire เข้า game-v800.js

```js
// แทนที่ resolveCapture:
function resolveCapture(w) {
  if (w.dead) return;
  startCaptureSequence(w); // ใหม่
}

// ใน update loop: เพิ่ม
updateCaptureSequence(dt);

// ใน clearTransientEffects: เพิ่ม
if (captureSequence) {
  if (captureSequence.ballMesh) removeAndDispose(scene, captureSequence.ballMesh);
  if (captureSequence.wild?.mesh) captureSequence.wild.mesh.visible = true;
  captureSequence = null;
}
hideCaptureTensionUI();
```

---

- [ ] เปลี่ยน sparkPool: sphere → box (บรรทัด 1107)
- [ ] เพิ่ม maxSize: 200
- [ ] เพิ่ม rotation reset ใน reset()
- [ ] ทดสอบ: spawnBurst ใช้ box
- ไฟล์: game-v800.js

### Phase 2: Blocky Ring Pulse + Projectile (PR)
- [ ] เปลี่ยน spawnRingPulse: torus → box wireframe (บรรทัด 1171)
- [ ] เปลี่ยน throwProjectile: sphere → box (บรรทัด 1828)
- [ ] เพิ่ม rotation ตอนบิน
- [ ] ทดสอบ: ring + projectile เหลี่ยม
- ไฟล์: game-v800.js

### Phase 3: Blocky fxGeom (PR)
- [ ] เปลี่ยน fxGeom 18 shape: sphere/cone → box (บรรทัด 1196)
- [ ] ทดสอบ: แต่ละ type ใช้ box shape
- ไฟล์: game-v800.js

### Phase 4: VFX ใหม่ สำหรับระบบใหม่ (PR)
- [ ] spawnTrainingEffect + TRAIN_FX_COLOR
- [ ] spawnEvolutionEffect
- [ ] spawnBreedingEffect
- [ ] spawnHatchEffect
- [ ] spawnFeedEffect
- [ ] spawnRestEffect + spawnPlayEffect
- [ ] spawnLevelUpEffect
- [ ] spawnBondUpEffect
- [ ] spawnMasteryUpEffect
- [ ] spawnConditionBadEffect
- [ ] Wire เข้าทุกฟังก์ชันที่เกี่ยวข้อง
- ไฟล์: game-v800.js

### Phase 5: Type-specific Behavior (PR)
- [ ] เพิ่ม updateSparkType() ใน updateEffects
- [ ] Fire ลอยขึ้น / Water ตกลง / Electric ซิกแซก / Ghost ไม่ตก
- [ ] ทดสอบ: แต่ละ type พฤติกรรมต่างกัน
- ไฟล์: game-v800.js

### Phase 6: Polish + Performance (PR)
- [ ] ปรับ particle count ตาม power
- [ ] ปรับ opacity curve (fade out นุ่มขึ้น)
- [ ] ปรับ emissive intensity
- [ ] ตรวจ pool size ไม่เกิน 200
- [ ] ตรวจ FPS ไม่ตก
- ไฟล์: game-v800.js

---

## 11. ไฟล์ที่กระทบ

| ไฟล์ | Phase | บรรทัดที่แก้ | ประเภท |
|------|-------|-----------|--------|
| game-v800.js | 1 | 1107-1120 | sparkPool |
| game-v800.js | 2 | 1171, 1828 | ring + projectile |
| game-v800.js | 3 | 1196-1216 | fxGeom |
| game-v800.js | 4 | ใหม่ ~200 บรรทัด | 11 VFX ใหม่ |
| game-v800.js | 5 | 1172 | updateEffects |
| game-v800.js | 6 | ปรับตาม | polish |
| tests/v80-vfx-*.mjs (ใหม่) | 1-6 | — | test |

---

## 12. การตรวจรับ

1. `npm run ci` → ผ่านครบ
2. `node --check game-v800.js` → SYNTAX OK
3. Browser: v800.html → 200 OK
4. sparkPool ใช้ box (ไม่ใช่ sphere)
5. spawnRingPulse ใช้ box wireframe (ไม่ใช่ torus)
6. throwProjectile ใช้ box (ไม่ใช่ sphere)
7. fxGeom 18 shape ใช้ box
8. 11 VFX ใหม่ทำงาน (training/evolution/breeding/hatch/feed/rest/play/levelup/bond/mastery/condition)
9. 18 type พฤติกรรมต่างกัน (Fire ลอย, Water ตก, Electric ซิกแซก)
10. Pool ไม่เกิน 200 particle
11. FPS ไม่ตก (<16ms/frame)

---

## 13. ข้อควรระวัง

1. **Pool exhaustion** — ถ้า effect เยอะเกิน pool หมด → acquire สร้างใหม่ชั่วคราว → ต้อง release คืน
2. **Effect overlap** — หลาย effect พร้อมกันอาจสร้าง particle เยอะ → จำกัด maxConcurrent
3. **DOM vs 3D** — damage number และ floating text เป็น DOM ไม่ใช่ 3D → ไม่เปลี่ยน
4. **Wireframe box** — มี 12 edges อาจดูเยอะ → ใช้ wireframe เฉพาะ ring pulse
5. **Emissive** — emissive สูงเกินจะ blow out → จำกัด 0.1-0.7
6. **Gravity** — แต่ละ type ต้องมี gravity ต่างกัน (Fire ลอย, Rock ตกหนัก)
7. **Life cycle** — ทุก effect ต้อง release คืน pool ไม่งั้น leak
8. **Zone change** — clearTransientEffects ต้อง clear ทั้ง effects + groundDecals + floatingTexts
9. **Performance** — 200 box particle = 2400 triangle = น้อยมาก (60 FPS สบาย)
10. **ไม่บังจอ** — particle ขนาด 0.03-0.08 หน่วย = เล็ก ไม่บัง

---

## 20. สรุป

- เปลี่ยน VFX เก่า: sphere/torus → box (4 ระบบ)
- เพิ่ม VFX ใหม่: 17 ตัว สำหรับระบบใหม่ + เพิ่มเติม
- 18 type มีพฤติกรรมต่างกัน (blocky shapes + type-specific movement)
- Particle pool 200 box (2400 triangle น้อยมาก)
- **Animation Curve & Timing:**
  - 5 easing functions (linear/easeOut/easeIn/easeInOut/easeOutBack)
  - Timing ตาราง 25 VFX (spawn/active/fade มิลลิวินาที)
  - Stagger ประกายไม่โผล่พร้อมกัน
- **Blend Mode & Depth Test:**
  - Normal vs Additive ตามประเภท
  - depthWrite=false สำหรับ decal/aura/flash
  - Render order: Opaque → Transparent → Overlay
- **Opacity & Fade Curve:**
  - Spark: เส้นตรง | Aura: 3 ช่วง (เรือง→คงที่→จาง)
  - Damage Number: 3 ช่วง (โผล่→คงที่→จาง)
  - Scale curve ต่างกันต่อประเภท
- **Pool Lifecycle:**
  - State machine: FREE → ACTIVE → RESET → FREE
  - Memory: ~200 bytes/particle × 200 = ~40KB
  - Exhaustion: สร้างชั่วคราศ + ทำลายตอนคืน
- **VFX เพิ่มเติม:**
  - Capture (สำเร็จ=เขียว/ล้มเหลว=แดง)
  - Respawn (ขาวโผล่)
  - Heal (เขียวลอย)
  - Zone Transition (screen flash สี zone)
  - Faint (แดงตก + shake + flash)
  - Evolution Shimmer (ทองหมุนรอบ)
- **Screen Flash & Hit Flash:**
  - Screen Flash: DOM overlay แสงทั้งจอ
  - Hit Flash: ตัวมอนกระพริบขาว 80ms
  - Hit Flash Group: สำหรับ Bighead multi-material
- 7 Phase = 7 PR
- ทุกฟังก์ชันมีโค้ดเต็มพร้อมใช้
- 18 ข้อตรวจรับ + 10 ข้อควรระวัง