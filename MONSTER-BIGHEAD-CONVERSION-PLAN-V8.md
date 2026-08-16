# Monster Life RPG — V8.0 Monster Bighead Conversion Plan
## แผนแปลงมอนเตอร์เก่าให้เข้ากับ Theme Asset ใหม่ (Bighead Blocky)

> สร้าง: 2026-08-16
> เวอร์ชัน: 1.0
> เป้าหมาย: แปลงมอนเตอร์เก่า 19 species × 2 forms = 38 รูป จาก Legacy (sphere/capsule) เป็น Bighead Blocky (box หัวโต ตัวเหลี่ยม)
> หลัก: เปลี่ยนมอนเก่าก่อน ไม่เน้นทำเพิ่มใหม่

---

## สารบัญ

1. สถานะปัจจุบัน — อะไรใช้ Bighead แล้ว / อะไรยังไม่ใช้
2. หลักการแปลง
3. โครงสร้าง Bighead Monster Mesh
4. แผนแปลงทีละตัว — 38 รูป
5. Bighead Slime Builder
6. Bighead Animal Builder
7. Type Decoration (Bighead)
8. Four-Side Texture (เฉพาะมอน)
9. การ Wire เข้า game-v800.js
10. ลำดับการทำ (Phases)
11. ไฟล์ที่กระทบ
12. การตรวจรับ
13. ข้อควรระวัง

---

## 1. สถานะปัจจุบัน

### 1.1 ที่ใช้ Bighead แล้ว
- Player (humanoid) — `assets.spawn('character.human.blocky-bighead.v1')`
- Keeper NPC (humanoid) — `assets.spawn('character.human.blocky-bighead.v1')`
- asset-presentation engine — สร้างสำเร็จ
- four-side texture — มี PNG สำหรับ humanoid (player-orange, keeper-green)
- procedural-bighead.mjs — provider สำหรับ humanoid

### 1.2 ที่ยังใช้ Legacy (ต้องแปลง)
- มอนทั้งหมด 19 species × 2 forms = 38 รูป
- ใช้ `makeSlimeMesh()` (sphere ทรงกลมเจลาติน)
- ใช้ `makeAnimalBase()` (sphere/capsule สัตว์)
- ใช้ `makeSpeciesMesh()` → เลือก slime หรือ animal ตาม evolution
- ใช้ `monsterMesh()` → ห่อด้วย ring + crest
- ใช้ `applyVisualGrowth()` → training → visual
- ไม่มี four-side texture สำหรับมอน
- ไม่มี monster catalog (assets/catalog/monster-*.json)

### 1.3 สรุป
Humanoid ใช้ Bighead แล้ว — มอนยังเป็น Legacy ทั้งหมด
ต้องสร้าง Bighead monster provider + แปลง monsterMesh ให้เรียกใช้

---

## 2. หลักการแปลง

1. **เปลี่ยนมอนเก่า ไม่ทำใหม่** — แปลง 38 รูปที่มีอยู่ ไม่เพิ่ม species
2. **สไตล์ Bighead Blocky** — ตัวเหลี่ยม (box) หัวโต (chibi) ตามสไตล์ humanoid
3. **คง type identity** — 18 type ต้องดูต่างกันได้ (เขา/ปีก/ครีบ/เปลวไฟ ฯลฯ)
4. **คง slime → evolution** — โครงสร้าง 2 ชั้นเหมือนเดิม
5. **ใช้ asset-presentation engine** — ผ่าน `assets.spawn()` เหมือน humanoid
6. **Four-side texture** — 4 ด้าน (front/back/left/right) เหมือน humanoid
7. **Fallback: Legacy** — ถ้า Bighead ไม่พร้อม ใช้ Legacy ชั่วคราว
8. **Performance ไม่ตก** — box geometry น้อย triangle กว่า sphere

---

## 3. โครงสร้าง Bighead Monster Mesh

### 3.1 เปรียบเทียบ Legacy vs Bighead

```
Legacy (ปัจจุบัน)                Bighead (เป้าหมาย)
──────────────────               ──────────────────
Slime:
  ตัว: sphere (0.46r, 20×16)      ตัว: box (0.92×0.88×0.80)
  แกน: sphere เล็ก                 แกน: box เล็ก (หรือไม่มี)
  ตา: sphere ดำ 2 จุด              ตา: box ดำ 2 จุด
  ปาก: torus arc                   ปาก: box บาง
  จุก: sphere เล็ก                  จุก: box เล็ก
  มงกุฎ: cone                      มงกุฎ: cone 4 เหลี่ยม
  หู/เขา: cone/sphere              หู/เขา: cone 4 เหลี่ยม/box
  พื้นผิว: สีทึบ/transparent        พื้นผิว: four-side texture

Animal (quadruped):
  ตัว: capsule นอน                 ตัว: box นอน (0.65×0.45×0.85)
  หัว: sphere (0.30r)              หัว: box โต (0.55×0.50×0.48)
  ขา: cylinder 4 ขา                ขา: box 4 ขา
  ตา: sphere ดำ                    ตา: box ดำ
  จมูก: sphere                     จมูก: box เล็ก
  หู: cone/sphere                  หู: box/cone 4 เหลี่ยม
  หาง: cylinder                    หาง: box ยาว
  พื้นผิว: สีทึบ                    พื้นผิว: four-side texture

Animal (bird):
  ตัว: sphere                      ตัว: box (0.70×0.80×0.70)
  หัว: sphere                      หัว: box โต (0.55×0.50×0.50)
  ปีก: sphere pair                 ปีก: box บาง 2 ข้าง
  ขา: cylinder 2 ขา                ขา: box 2 ขา
  จะงอย: cone                      จะงอย: cone 4 เหลี่ยม

Animal (serpent):
  ตัว: capsule ยาว                 ตัว: box ยาว (0.90×0.40×0.45)
  หัว: sphere                      หัว: box โต (0.50×0.45×0.45)
  ครีบ: sphere pair                ครีบ: box บาง
```

### 3.2 โครง Bighead Slime

```
        ┌──────────┐
        │ จุก box  │  ← ส่วนบนเล็ก
        ├──────────┤
        │  ตา  ตา  │  ← หน้าด้าน front
        │          │
        │   ปาก    │
        ├──────────┤
        │  ตัว box │  ← เหลี่ยม ไม่กลม
        │  (หู/เขา) │  ← type decoration ข้าง
        └──────────┘
```

### 3.3 โครง Bighead Animal (quadruped)

```
    ┌────────┐
    │ หัว box│ ← โต (bighead!)
    │ ตา ตา  │
    │ จมูก   │
    └──┬─┬───┘
       │ │
   ┌───┴─┴───┐
   │ ตัว box  │ ← นอนเหลี่ยม
   ├──┘ └──┤
   │ขา  ขา │ ← 4 ขา box
   │ขา  ขา │
   └────────┘
```

---

## 4. แผนแปลงทีละตัว — 38 รูป

### 4.1 Slime Form (19 ตัว) — แปลงจาก makeSlimeMesh → makeBigheadSlimeMesh

| # | Species | Type | สี | Decoration → Bighead |
|---|---------|------|----|---------------------|
| 1 | normalooze | Normal | #c3b7a1 | หู box + แก้ม box |
| 2 | flameling | Fire | #ef6c32 | เปลวไฟ cone×3 + แก้ม |
| 3 | aquapuff | Water | #4f87e8 | ครีบ box×2 + orb |
| 4 | voltkit | Electric | #e8bd22 | สายเลย box×2 + plate×2 |
| 5 | mossbun | Grass | #63b34b | ใบ cone + orb |
| 6 | frostowl | Ice | #79c9c9 | ผลึก cone×3 ใส |
| 7 | punchcub | Fighting | #b9342c | หมัด box×2 + plate |
| 8 | toxitoad | Poison | #93489e | orb×3 พิษ |
| 9 | sandmole | Ground | #cba94e | plate + หู cone×2 |
| 10 | galebird | Flying | #8d7cdb | ปีก box×2 + orb |
| 11 | mindcoon | Psychic | #ec4d7f | แหวน torus + orb |
| 12 | buglet | Bug | #9cab25 | เขา cone×2 + plate |
| 13 | rockhorn | Rock | #a48e38 | orb×3 ก้อนหิน |
| 14 | ghostpurr | Ghost | #61568f | orb×2 ใส + แหวน |
| 15 | emberdrake | Dragon | #6a45d3 | เขา cone×2 + หนามหลัง |
| 16 | voidhorn | Dark | #584b43 | หู box + plate |
| 17 | ironbug | Steel | #8e8eaa | plate หน้ากาก + orb×2 |
| 18 | fairimp | Fairy | #dc87b8 | ปีก box×2 + orb + แก้ม |

### 4.2 Evolution Form (19 ตัว) — แปลงจาก makeAnimalBase → makeBigheadAnimalBase

| # | Form | Type | สไตล์ | Parts → Bighead |
|---|------|------|--------|----------------|
| 1 | plainpup | Normal | quadruped | หู box + ตา + จมูก + หาง box |
| 2 | flameling | Fire | quadruped | หู cone + ตา + จมูก + หางไฟ + แก้ม |
| 3 | aquapuff | Water | quadruped | ตา + จมูก + ครีบ box + หาง |
| 4 | voltkit | Electric | quadruped | หู + ตา + จมูก + หนวด + หางสายฟ้า |
| 5 | mossbun | Grass | quadruped | ใบ + ตา + จมูก + ใบหัว + หาง |
| 6 | frostowl | Ice | bird | ปีก box + ตา + จะงอย + หู |
| 7 | punchcub | Fighting | quadruped | หู + ตา + จมูก + paw box |
| 8 | toxitoad | Poison | quadruped (กว้าง) | ตา + จมูก + paw |
| 9 | sandmole | Ground | quadruped | ตา + จมูก + paw |
| 10 | galebird | Flying | bird | ปีก box + ตา + จะงอย |
| 11 | mindcoon | Psychic | quadruped | หู + ตา + จมูก + อัญมณี box |
| 12 | buglet | Bug | quadruped | หู + ตา + จมูก + ปีกแข็ง box + หาง |
| 13 | rockhorn | Rock | quadruped | หู + ตา + จมูก + เขา cone + หาง |
| 14 | ghostpurr | Ghost | serpent | ตา + จมูก + ครีบ box |
| 15 | emberdrake | Dragon | quadruped | หู + ตา + จมูก + เขา + หาง + หนาม |
| 16 | voidhorn | Dark | quadruped | หู + ตา + จมูก + เขา + หาง |
| 17 | ironbug | Steel | quadruped | หู + ตา + จมูก + ปีกแข็ง + หาง |
| 18 | fairimp | Fairy | quadruped | หู + ตา + จมูก + ปีก box + หาง |

---

## 5. Bighead Slime Builder

```js
// asset-presentation/providers/procedural-bighead-monster.mjs

import { GAMEPLAY_LOCKS } from '../anchors.mjs';
import { assertAssetHandle } from '../handle-contract.mjs';
import { registerOwned } from '../ownership.mjs';

export function createBigheadMonsterProvider({ THREE }) {
  // Cache shared geometry
  const boxGeom = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const coneGeom = (r, h, seg = 4) => new THREE.ConeGeometry(r, h, seg);
  const torusGeom = (r, t, rs, ts) => new THREE.TorusGeometry(r, t, rs, ts);

  function mat(color, rough = 0.72, metal = 0.06) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  }

  function boxMesh(w, h, d, color, rough, metal) {
    const m = new THREE.Mesh(boxGeom(w, h, d), mat(color, rough, metal));
    m.castShadow = true;
    return m;
  }

  function addBoxEyes(g, { y, z, spread, size }) {
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
    for (const sx of [-spread, spread]) {
      const eye = new THREE.Mesh(boxGeom(size, size, size * 0.5), eyeMat);
      eye.position.set(sx, y, z);
      g.add(eye);
    }
  }

  function addBoxMouth(g, { y, z, w = 0.20, h = 0.04 }) {
    const mouth = new THREE.Mesh(boxGeom(w, h, 0.02), new THREE.MeshBasicMaterial({ color: 0x1f2937 }));
    mouth.position.set(0, y, z);
    g.add(mouth);
  }

  function makeBigheadSlime(color, scale, type) {
    const g = new THREE.Group();
    const bodyMat = mat(color, 0.18, 0); // เจลาตินเหลี่ยม

    // ตัว: box เหลี่ยม
    const body = boxMesh(0.92 * scale, 0.88 * scale, 0.80 * scale, color, 0.18, 0);
    body.position.y = 0.50 * scale;
    g.add(body);

    // ตา: box เล็ก
    addBoxEyes(g, { y: 0.62 * scale, z: -0.38 * scale, spread: 0.18 * scale, size: 0.08 * scale });

    // ปาก: box บาง
    addBoxMouth(g, { y: 0.42 * scale, z: -0.39 * scale });

    // จุกบนหัว: box เล็ก
    const nub = boxMesh(0.24 * scale, 0.18 * scale, 0.24 * scale, color, 0.18, 0);
    nub.position.y = 0.98 * scale;
    g.add(nub);

    // Type decoration
    addBigheadSlimeDecoration(g, type, scale, color, bodyMat, { boxMesh, coneGeom, torusGeom, mat });

    return g;
  }

  function makeBigheadAnimal(color, scale, { kind = 'quadruped', accent = null } = {}) {
    const g = new THREE.Group();
    const bodyMat = mat(color, 0.72, 0.06);
    const headColor = accent || color;

    if (kind === 'bird') {
      const body = boxMesh(0.70 * scale, 0.80 * scale, 0.70 * scale, color, 0.72, 0.06);
      body.position.y = 0.66 * scale;
      g.add(body);

      const head = boxMesh(0.55 * scale, 0.50 * scale, 0.50 * scale, headColor, 0.70, 0.06);
      head.position.set(0, 1.10 * scale, -0.10 * scale);
      g.add(head);

      // ปีก box บาง
      for (const sx of [-0.42, 0.42]) {
        const wing = boxMesh(0.06 * scale, 0.40 * scale, 0.50 * scale, color, 0.72, 0.06);
        wing.position.set(sx * scale, 0.80 * scale, 0.05 * scale);
        g.add(wing);
      }

      // ขา 2 ขา
      for (const sx of [-0.15, 0.15]) {
        const leg = boxMesh(0.10 * scale, 0.30 * scale, 0.10 * scale, color, 0.8, 0.04);
        leg.position.set(sx * scale, 0.15 * scale, 0.10 * scale);
        g.add(leg);
      }

      // จะงอย cone 4 เหลี่ยม
      const beak = new THREE.Mesh(coneGeom(0.09 * scale, 0.22 * scale, 4), mat(0xf6ad31, 0.7, 0.05));
      beak.position.set(0, 0.98 * scale, -0.56 * scale);
      beak.rotation.x = -Math.PI / 2;
      g.add(beak);

      // ตา
      addBoxEyes(g, { y: 1.12 * scale, z: -0.43 * scale, spread: 0.12 * scale, size: 0.06 * scale });

    } else if (kind === 'serpent') {
      const body = boxMesh(0.90 * scale, 0.40 * scale, 0.45 * scale, color, 0.72, 0.08);
      body.position.set(0, 0.50 * scale, 0);
      g.add(body);

      const head = boxMesh(0.50 * scale, 0.45 * scale, 0.45 * scale, headColor, 0.70, 0.06);
      head.position.set(0, 0.70 * scale, -0.40 * scale);
      g.add(head);

      // ครีบ box
      for (const sx of [-0.35, 0.35]) {
        const fin = boxMesh(0.04 * scale, 0.18 * scale, 0.25 * scale, color, 0.72, 0.08);
        fin.position.set(sx * scale, 0.62 * scale, 0.06 * scale);
        g.add(fin);
      }

      addBoxEyes(g, { y: 0.78 * scale, z: -0.58 * scale, spread: 0.10 * scale, size: 0.05 * scale });

    } else {
      // quadruped — สี่ขา
      const body = boxMesh(0.65 * scale, 0.45 * scale, 0.85 * scale, color, 0.72, 0.06);
      body.position.set(0, 0.55 * scale, 0.05 * scale);
      g.add(body);

      // หัว box โต (bighead!)
      const head = boxMesh(0.55 * scale, 0.50 * scale, 0.48 * scale, headColor, 0.70, 0.06);
      head.position.set(0, 0.90 * scale, -0.30 * scale);
      g.add(head);

      // ขา 4 ขา box
      for (const [sx, sz] of [[-0.20, 0.25], [0.20, 0.25], [-0.20, -0.15], [0.20, -0.15]]) {
        const leg = boxMesh(0.12 * scale, 0.35 * scale, 0.12 * scale, color, 0.78, 0.04);
        leg.position.set(sx * scale, 0.17 * scale, sz * scale);
        g.add(leg);
      }

      addBoxEyes(g, { y: 0.98 * scale, z: -0.50 * scale, spread: 0.10 * scale, size: 0.06 * scale });

      // จมูก box เล็ก
      const nose = boxMesh(0.08 * scale, 0.06 * scale, 0.06 * scale, 0x1f2937, 0.8, 0);
      nose.position.set(0, 0.85 * scale, -0.52 * scale);
      g.add(nose);
    }

    return g;
  }

  // Provider interface
  return function bigheadMonsterProvider({ def, request, THREE: T }) {
    const Three = T || THREE;
    const speciesId = def.speciesId;
    const form = def.form || 'slime';
    const type = def.type || 'Normal';
    const color = def.color || 0xc3b7a1;
    const scale = (def.metrics?.scale) || 1;

    let mesh;
    if (form === 'slime') {
      mesh = makeBigheadSlime(color, scale, type);
    } else {
      const kind = def.metrics?.kind || 'quadruped';
      const accent = def.metrics?.accent || null;
      mesh = makeBigheadAnimal(color, scale, { kind, accent });
    }

    const root = new Three.Group();
    root.add(mesh);

    const handle = {
      id: def.id,
      role: request.role || 'wild',
      root,
      rig: Object.freeze({ rest: Object.freeze({}), pivots: Object.freeze({}) }),
      play() { return handle; },
      update() { return handle; },
      anchor(name, target) {
        const out = target || { x: 0, y: 0, z: 0 };
        out.x = root.position.x;
        out.z = root.position.z;
        out.y = root.position.y + (name === 'label' ? 1.5 : name === 'feet' ? 0 : 1.0);
        return out;
      },
      bounds(target) {
        const out = target || { minY: 0, maxY: 0 };
        out.minY = root.position.y;
        out.maxY = root.position.y + 1.5 * scale;
        return out;
      },
      setAppearance() { return handle; },
      dispose() {
        mesh.traverse(o => {
          o.geometry?.dispose?.();
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material?.dispose?.();
        });
        return handle;
      },
      get disposed() { return false; },
    };

    return assertAssetHandle(handle);
  };
}
```

---

## 6. Bighead Animal Builder

(รวมในส่วน 5 ข้างต้น — makeBigheadAnimal ทำ 3 ชนิด: quadruped, bird, serpent)

---

## 7. Type Decoration (Bighead Slime)

```js
function addBigheadSlimeDecoration(g, type, scale, color, bodyMat, { boxMesh, coneGeom, torusGeom, mat }) {
  const accent = TYPE_COLOR_NUM[type] || 0xffffff;
  switch (type) {
    case 'Normal':
      // หู box + แก้ม box
      for (const sx of [-0.40, 0.40]) {
        const ear = boxMesh(0.08 * scale, 0.15 * scale, 0.04 * scale, 0xd6c4a5, 0.7, 0);
        ear.position.set(sx * scale, 0.85 * scale, -0.01 * scale);
        g.add(ear);
      }
      break;
    case 'Fire':
      // เปลวไฟ cone 4 เหลี่ยม × 3
      for (const [x, r, h] of [[-0.15, 0.06, 0.18], [0, 0.07, 0.22], [0.15, 0.06, 0.18]]) {
        const flame = new THREE.Mesh(coneGeom(r * scale, h * scale, 4), mat(0xff7a2f, 0.3, 0.1));
        flame.position.set(x * scale, 1.10 * scale, -0.02 * scale);
        g.add(flame);
      }
      break;
    case 'Water':
      // ครีบ box บาง × 2
      for (const sx of [-0.40, 0.40]) {
        const fin = boxMesh(0.04 * scale, 0.20 * scale, 0.30 * scale, 0x8ed8ff, 0.4, 0);
        fin.position.set(sx * scale, 0.70 * scale, 0.10 * scale);
        g.add(fin);
      }
      break;
    case 'Electric':
      // สายเลย box ซิกแซก × 2
      for (const sx of [-0.25, 0.25]) {
        const bolt = boxMesh(0.06 * scale, 0.20 * scale, 0.04 * scale, 0xffef66, 0.4, 0.1);
        bolt.position.set(sx * scale, 1.05 * scale, -0.02 * scale);
        bolt.rotation.z = sx > 0 ? 0.8 : -0.8;
        g.add(bolt);
      }
      break;
    case 'Grass':
      // ใบ cone 4 เหลี่ยม
      const leaf = new THREE.Mesh(coneGeom(0.08 * scale, 0.20 * scale, 4), mat(0x7bdc63, 0.5, 0));
      leaf.position.set(0, 1.10 * scale, -0.02 * scale);
      g.add(leaf);
      break;
    case 'Ice':
      // ผลึก cone 4 เหลี่ยม ใส × 3
      for (const [x, h] of [[-0.10, 0.14], [0, 0.18], [0.10, 0.14]]) {
        const crystal = new THREE.Mesh(coneGeom(0.05 * scale, h * scale, 4),
          new THREE.MeshStandardMaterial({ color: 0xdafdff, transparent: true, opacity: 0.76, roughness: 0.08 }));
        crystal.position.set(x * scale, 1.08 * scale, -0.02 * scale);
        g.add(crystal);
      }
      break;
    case 'Fighting':
      // หมัด box × 2
      for (const sx of [-0.42, 0.42]) {
        const fist = boxMesh(0.08 * scale, 0.08 * scale, 0.08 * scale, 0xd84c43, 0.6, 0);
        fist.position.set(sx * scale, 0.52 * scale, -0.25 * scale);
        g.add(fist);
      }
      break;
    case 'Dragon':
      // เขา cone 4 เหลี่ยม × 2
      for (const sx of [-0.18, 0.18]) {
        const horn = new THREE.Mesh(coneGeom(0.06 * scale, 0.22 * scale, 4), mat(0xa78bfa, 0.4, 0.15));
        horn.position.set(sx * scale, 1.15 * scale, -0.02 * scale);
        horn.rotation.x = -0.2;
        g.add(horn);
      }
      break;
    case 'Flying':
      // ปีก box บาง × 2
      for (const sx of [-0.50, 0.50]) {
        const wing = boxMesh(0.08 * scale, 0.35 * scale, 0.45 * scale, 0xd4cbff, 0.5, 0);
        wing.position.set(sx * scale, 0.70 * scale, 0.05 * scale);
        g.add(wing);
      }
      break;
    case 'Fairy':
      // ปีก box × 2 + แก้ม
      for (const sx of [-0.48, 0.48]) {
        const wing = boxMesh(0.06 * scale, 0.28 * scale, 0.35 * scale, 0xffc4e8, 0.4, 0);
        wing.position.set(sx * scale, 0.72 * scale, 0.05 * scale);
        g.add(wing);
      }
      break;
    // ... อันอื่นๆ ใช้ box/cone 4 เหลี่ยมแทน sphere
  }
}
```

---

## 8. Four-Side Texture (เฉพาะมอน)

### 8.1 การทำงาน

มอน Bighead ใช้พื้นผิว 4 ด้านเหมือน humanoid — แต่ละด้านวาดต่างกัน:

```
        ┌─────────┬─────────┐
        │  FRONT  │  BACK   │
        │  (หน้า)  │  (หลัง)  │
        │  ตา ปาก  │  ลาย    │
        ├─────────┼─────────┤
        │  LEFT   │  RIGHT  │
        │  (ซ้าย)  │  (ขวา)  │
        │  ลายข้าง │  ลายข้าง │
        └─────────┴─────────┘
```

### 8.2 Procedural Canvas (ไม่ต้องไฟล์)

```js
function makeMonsterFourSideTexture(type, colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Front (บนซ้าย 128×128)
  ctx.save(); ctx.translate(0, 0);
  ctx.fillStyle = colorHex; ctx.fillRect(0, 0, 128, 128);
  drawMonsterFront(ctx, type); // ตา + ปาก + ลาย
  ctx.restore();

  // Back (บนขวา)
  ctx.save(); ctx.translate(128, 0);
  ctx.fillStyle = colorHex; ctx.fillRect(0, 0, 128, 128);
  drawMonsterBack(ctx, type); // ลายหลัง
  ctx.restore();

  // Left (ล่างซ้าย)
  ctx.save(); ctx.translate(0, 128);
  ctx.fillStyle = colorHex; ctx.fillRect(0, 0, 128, 128);
  drawMonsterSide(ctx, type); // ลายข้าง
  ctx.restore();

  // Right (ล่างขวา)
  ctx.save(); ctx.translate(128, 128);
  ctx.fillStyle = colorHex; ctx.fillRect(0, 0, 128, 128);
  drawMonsterSide(ctx, type); // ลายข้าง (ซ้ำ)
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
```

### 8.3 การใช้ใน mesh

```js
// ใน makeBigheadSlime / makeBigheadAnimal
const tex = getMonsterFourSideTexture(type, colorHex);
const bodyMat = new THREE.MeshStandardMaterial({
  color, roughness: 0.72, metalness: 0.06,
  map: tex,
});
// Box geometry 6 ด้าน — UV ต้อง map ให้ถูกด้าน
// front = +Z, back = -Z, left = -X, right = +X, top = +Y, bottom = -Y
```

---

## 9. การ Wire เข้า game-v800.js

### 9.1 ปัจจุบัน

```js
// game-v800.js บรรทัด 979
function monsterMesh(sp, owned, inst, elite, boss) {
  const g = makeSpeciesMesh(sp, inst); // ← Legacy
  // ring + crest
  return g;
}
```

### 9.2 เป้าหมาย

```js
function monsterMesh(sp, owned, inst, elite, boss) {
  const path = inst ? getEvolutionPath(inst) : null;
  const form = path ? path.form : 'slime';
  const type = sp.types[0];
  const color = path?.color ?? sp.color;
  
  // ลอง Bighead ก่อน
  const assetId = `monster.${form}.${sp.id}.bighead.v1`;
  try {
    const handle = assets.spawn(assetId, {
      role: owned ? 'owned' : 'wild',
      quality: qualityProfile.tier,
    });
    const g = handle.root;
    // ring + crest
    addMonsterRing(g, { owned, elite, boss, inst, sp });
    return applyVisualGrowth(g, inst);
  } catch (e) {
    // Fallback: Legacy
    const g = makeSpeciesMesh(sp, inst);
    addMonsterRing(g, { owned, elite, boss, inst, sp });
    return applyVisualGrowth(g, inst);
  }
}
```

### 9.3 Monster Catalog

ต้องสร้าง `assets/catalog/monster-slimes.json` และ `monster-animals.json`:

```json
{
  "name": "monster-slimes",
  "version": "1.0.0",
  "assets": [
    {
      "id": "monster.slime.normalooze.bighead.v1",
      "kind": "monster",
      "provider": "procedural",
      "style": "blocky-bighead-v1",
      "surfaceStyle": "four-side-block-v1",
      "rig": "slime-rig-v1",
      "metrics": { "scale": 1.0 },
      "roles": { "wild": {}, "owned": {}, "boss": {}, "elite": {} },
      "speciesId": "normalooze",
      "type": "Normal",
      "form": "slime",
      "color": 12822561
    }
    // ... 19 ตัว
  ]
}
```

### 9.4 การ Register Provider

```js
// game-v800.js — หลัง registerProvider สำหรับ humanoid
import { createBigheadMonsterProvider } from './asset-presentation/providers/procedural-bighead-monster.mjs';

assets.registerProvider('procedural', createBigheadMonsterProvider({ THREE }));
// หรือ register แยก:
// assets.registerProvider('bighead-monster', createBigheadMonsterProvider({ THREE }));
```

### 9.5 การ Preload Catalog

```js
// ตอนเริ่มเกม
await assets.preloadBundle('monster-slimes', './assets/catalog/monster-slimes.json');
await assets.preloadBundle('monster-animals', './assets/catalog/monster-animals.json');
```

---

## 10. ลำดับการทำ (Phases)

### Phase 1: Bighead Monster Provider (PR)
- [ ] สร้าง `asset-presentation/providers/procedural-bighead-monster.mjs`
- [ ] makeBigheadSlime() — box body + box eyes + box mouth + box nub
- [ ] makeBigheadAnimal() — quadruped/bird/serpent all-box
- [ ] addBigheadSlimeDecoration() — 18 type variants (box/cone 4-sided)
- [ ] Provider interface: spawn → AssetHandle
- [ ] ทดสอบ: provider สร้าง mesh ได้
- ไฟล์: asset-presentation/providers/procedural-bighead-monster.mjs

### Phase 2: Monster Catalog (PR)
- [ ] ขยาย schema.mjs — kind='monster', MONSTER_ROLES
- [ ] สร้าง `assets/catalog/monster-slimes.json` — 19 defs
- [ ] สร้าง `assets/catalog/monster-animals.json` — 19 defs
- [ ] แต่ละ def: id, kind, provider, style, surfaceStyle, rig, metrics, roles, speciesId, type, form, color
- [ ] ทดสอบ: catalog validate ผ่าน
- ไฟล์: asset-presentation/schema.mjs, assets/catalog/monster-*.json

### Phase 3: Wire เข้า game-v800.js (PR)
- [ ] Import createBigheadMonsterProvider
- [ ] Register provider
- [ ] Preload monster catalog
- [ ] แก้ monsterMesh() — ลอง Bighead ก่อน fallback Legacy
- [ ] ทดสอบ: มอนแสดงเป็น Bighead ในเกม
- ไฟล์: game-v800.js

### Phase 4: Four-Side Texture (PR)
- [ ] สร้าง `getMonsterFourSideTexture(type, colorHex)` — canvas 256×256
- [ ] drawMonsterFront() — ตา/ปาก บน texture
- [ ] drawMonsterBack() — ลายหลัง
- [ ] drawMonsterSide() — ลายข้าง
- [ ] Wire texture เข้า body material
- [ ] ทดสอบ: มอนมีลาย 4 ด้าน
- ไฟล์: game-v800.js หรือ monster-texture.mjs

### Phase 5: Evolution Form Decoration (PR)
- [ ] addBigheadAnimalDecoration() — หู/จมูก/หาง/ปีก box สำหรับ 19 forms
- [ ] ทดสอบ: แต่ละ evolution form ดูต่างกัน
- ไฟล์: asset-presentation/providers/procedural-bighead-monster.mjs

### Phase 6: Polish + Ring/Crest/VisualGrowth (PR)
- [ ] ปรับ ring + crest ให้เข้ากับ Bighead
- [ ] applyVisualGrowth ทำงานกับ Bighead
- [ ] ปรับแต่ละ type ให้ชัด (18 type review)
- [ ] ทดสอบทุกตัวใน browser
- ไฟล์: game-v800.js

---

## 11. ไฟล์ที่กระทบ

| ไฟล์ | Phase | ประเภท |
|------|-------|--------|
| asset-presentation/providers/procedural-bighead-monster.mjs (ใหม่) | 1,5 | สร้างใหม่ |
| asset-presentation/schema.mjs | 2 | ขยาย kind/roles |
| assets/catalog/monster-slimes.json (ใหม่) | 2 | สร้างใหม่ |
| assets/catalog/monster-animals.json (ใหม่) | 2 | สร้างใหม่ |
| game-v800.js | 3,4,6 | Wire เข้าเกม |
| tests/v80-monster-bighead-*.mjs (ใหม่) | 1-6 | Test per phase |

---

## 12. การตรวจรับ

1. `npm run ci` → ผ่านครบ
2. `node --check game-v800.js` → SYNTAX OK
3. Browser: v800.html → 200 OK
4. มอนทุกตัวแสดงเป็น Bighead (box หัวโต)
5. 18 type ดูต่างกันได้
6. Slime → Evolution เปลี่ยนรูปชัด
7. Fallback: ถ้า catalog ไม่มี → ใช้ Legacy ได้
8. Performance: FPS ไม่ตก (box น้อย triangle กว่า sphere)

---

## 13. ข้อควรระวัง

1. **Provider name collision** — procedural-bighead.mjs มีอยู่สำหรับ humanoid — อาจต้องใช้ชื่อแยกหรือ register รวม
2. **Schema validation** — kind='monster' ต้องขยาย schema ก่อน ไม่งั้น validate ไม่ผ่าน
3. **Color format** — catalog JSON เก็บ color เป็น number (0xc3b7a1 = 12822561) ไม่ใช่ string
4. **Box UV mapping** — box 6 ด้าน ต้อง map UV ให้ถูกด้าน (front/back/left/right/top/bottom) — ใช้ applyBoxAtlasUVs จาก four-side/apply.mjs
5. **Scale** — slime scale ≈ 1.0, animal scale ≈ 1.08-1.16 (ตาม evolution path)
6. **Ring + Crest** — ต้องปรับขนาดให้เข้ากับ box (ไม่ใช่ sphere)
7. **applyVisualGrowth** — ทำงานกับ Group ไม่ใช่ Mesh — ต้องเข้าถึง mesh ใน group
8. **Shadow** — box.castShadow = true ทุกตัว
9. **Fallback path** — ถ้า assets.spawn ล้มเหลว ต้อง catch แล้วใช้ makeSpeciesMesh เดิม
10. **ไม่ลบ Legacy** — makeSlimeMesh/makeAnimalBase/makeSpeciesMesh คงไว้เป็น fallback

---

## สรุป

- เป้าหมาย: แปลงมอนเก่า 38 รูป จาก Legacy → Bighead Blocky
- ไม่ทำเพิ่มใหม่ — เปลี่ยนที่มีอยู่
- 6 Phase: Provider → Catalog → Wire → Texture → Decoration → Polish
- ใช้ asset-presentation engine เหมือน humanoid
- Four-side texture สำหรับมอน (procedural canvas)
- Fallback Legacy คงไว้
- Performance: box < sphere (triangle น้อยกว่า)