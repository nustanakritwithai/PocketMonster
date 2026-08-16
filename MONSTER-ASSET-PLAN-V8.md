# Monster Life RPG — V8.0 Monster Asset Development Plan
## แผนพัฒนา Asset Monster ทั้งหมด — สไตล์เดิม + Bighead Blocky

> สร้าง: 2026-08-16
> เวอร์ชัน: 2.0 (เพิ่มสไตล์ Bighead Blocky)
> สถานะ: เกม V8.0.0 live — มอน 19 species × 2 รูป (base slime + evolution) = 38 รูป
> สไตล์: สองสไตล์คู่ขนาน — Legacy (เดิม) + Bighead Blocky (ใหม่ จาก PR #30 AE0)
> เป้าหมาย: พัฒนา asset มอนทั้ง 38 รูป ทั้งสองสไตล์ โดยคงสไตล์เดิมและเพิ่ม Bighead Blocky

---

## สารบัญ

0. สไตล์ Bighead Blocky — นิยามและที่มา
1. สถานะปัจจุบัน — สไตล์มอนที่มี
2. หลักออกแบบ — คงสไตล์เดิม เพิ่ม Bighead Blocky
3. ระบบสไตล์ทั้งสอง (Legacy + Bighead)
4. ตารางมอนทั้งหมด (38 รูป × 2 สไตล์)
5. แผนพัฒนาตามสไตล์ — รายละเอียดแต่ละตัว
6. Texture Enhancement — สองสไตล์
7. Visual Signal (Training State → Visual)
8. Evolution Visual Change
9. Animation Enhancement
10. Monster Asset Catalog (asset-presentation)
11. ลำดับการทำ (Phases)
12. ไฟล์ที่กระทบ
13. การตรวจรับ
14. ข้อควรระวัง

---

## 0. สไตล์ Bighead Blocky — นิยามและที่มา

### 0.1 ที่มา

PR #30 (AE0 — Asset Presentation Engine contracts) สร้างระบบ asset-presentation ที่มีสไตล์ใหม่:
- `blocky-bighead-v1` — รูปแบบตัวละครหัวโต ตัวเหลี่ยม
- `four-side-block-v1` — พื้นผิว 4 ด้าน (front/back/left/right) แบบ block

Humanoid catalog (humanoid-core.json) มี 2 styles คู่ขนาน:
1. `legacy-capsule-v1` — สไตล์เดิม (sphere/capsule โค้งมน)
2. `blocky-bighead-v1` — สไตล์ใหม่ (box หัวโต ตัวเหลี่ยม)

### 0.2 นิยาม Bighead Blocky

```
Legacy (เดิม)              Bighead Blocky (ใหม่)
─────────────              ───────────────────
ตัว: sphere/capsule โค้ง    ตัว: box เหลี่ยม
หัว: sphere กลม             หัว: box โต (0.64×0.72×0.56)
แขน: capsule โค้ง           แขน: box เหลี่ยม
ขา: cylinder กลม            ขา: box เหลี่ยม
พื้นผิว: สีทึบ/transparent   พื้นผิว: 4 ด้าน (front/back/L/R) มี texture
สัดส่วน: สมดุล              สัดส่วน: หัวโต ตัวเล็ก (chibi)
```

### 0.3 การประยุกต์ใช้กับมอน

มอนต้องมี 2 สไตล์คู่ขนานเหมือน humanoid:

| สไตล์ | Slime Form | Evolution Form | พื้นผิว |
|-------|-----------|---------------|--------|
| Legacy (เดิม) | sphere เจลาติน | sphere/capsule สัตว์ | สีทึบ/transparent |
| Bighead Blocky | box เจลาตินเหลี่ยม | box สัตว์เหลี่ยม หัวโต | 4 ด้าน + texture |

### 0.4 โครงสร้าง Bighead Blocky Monster

```
Slime Bighead:
  ตัว: box (0.92×0.88×0.80) — เหลี่ยม ไม่กลม
  หัว: รวมกับตัว (slime ไม่มีคอ)
  ตา: box เล็ก 2 จุด (ไม่ใช่ sphere)
  ปาก: box บาง
  หู/เขา/ครีบ: box/cone เหลี่ยม
  พื้นผิว: 4 ด้าน — ด้านหน้ามีหน้า (ตา/ปาก) ด้านข้างมีลาย

Animal Bighead:
  ตัว: box (0.70×0.50×0.90) — นอนเหลี่ยม
  หัว: box โต (0.60×0.55×0.50) — หัวโตเด่น
  ขา: box เล็ก 4 ขา
  ตา: box เล็ก
  จมูก: box เล็ก
  หู: box เหลี่ยม
  หาง: box ยาว
  พื้นผิว: 4 ด้าน — ด้านหน้าหัวมีหน้า ด้านข้างมีลายขน/เกล็ด
```

### 0.5 การสลับสไตล์

```js
const RENDER_STYLES = {
  legacy: { name: 'legacy-capsule-v1', useBox: false },
  bighead: { name: 'blocky-bighead-v1', useBox: true },
};

let currentRenderStyle = 'legacy'; // ค่าเริ่มต้น — เปลี่ยนได้ใน settings

function makeSlimeMesh(color, scale, type, style = currentRenderStyle) {
  if (style === 'bighead') return makeBigheadSlimeMesh(color, scale, type);
  return makeLegacySlimeMesh(color, scale, type); // เดิม
}

function makeAnimalBase(color, scale, opts, style = currentRenderStyle) {
  if (style === 'bighead') return makeBigheadAnimalBase(color, scale, opts);
  return makeLegacyAnimalBase(color, scale, opts); // เดิม
}
```

---

### 1.1 ระบบสไตล์เดิม

เกมมี 3 ชั้นการสร้างมอน:

1. **Slime (base form)** — `makeSlimeMesh(color, scale, type)` — ทุก species เริ่มเป็น slime ทรงกลมเจลาติน มี ears/horns/fins/wings ตาม type (18 type variants)
2. **Animal (evolution form)** — `makeAnimalBase(color, scale, {kind})` — วิวัฒนาการเป็นสัตว์ 3 ชนิด: quadruped (สี่ขา), bird (นก), serpent (งู) + ประกอบ ears/eyes/muzzle/tail/wings/fins/cheeks/whiskers/paws/horns/gems
3. **Humanoid** — `buildHumanoid()` — ผู้เล่น + Keeper NPC (ไม่ใช่มอน แต่ใช้ระบบเดียวกัน)

### 1.2 ส่วนประกอบ (Parts) ที่มี

| Part | ฟังก์ชัน | ใช้กับ |
|------|----------|-------|
| ตา | addEyeSet() | slime + animal |
| หู | addEarPair() | animal (cone/leaf) + slime |
| จมูก | addMuzzle() | animal |
| หาง | addTail() | animal |
| ปีก | addWingPair() | bird + slime (Flying/Fairy) |
| ครีบ | addFinPair() | slime (Water) + animal (bird/serpent) |
| แก้ม | addCheeks() | slime + animal |
| หนวด | addWhiskers() | animal (voltkit) |
| เท้า | addPaw/addPawSet | animal |
| เขา | addHorn() | slime (Bug/Dragon) |
| หนามหลัง | addBackSpikes() | slime (Dragon) |
| แขน | addShoulderedArm() | humanoid |
| มงกุฎ/แหวน/แผ่น | addCone/addPlate/addRing/addOrb | slime type decorations |

### 1.3 สิ่งที่ขาด

- ไม่มี texture ทั้งหมด — สีทึบ (MeshStandardMaterial/MeshPhysicalMaterial)
- ไม่มีพื้นผิวละเอียด (normal map, roughness map)
- ไม่มีลวดลาย (spot, stripe, scale, fur pattern)
- ไม่มี facial expression (ตา/ปากเปลี่ยนตามอารมณ์)
- ไม่มี visual signal สำหรับ training state (Table 41)
- ไม่มี evolution visual change ที่ชัดเจน (นอกจากสี/ขนาด)
- Animation เป็น procedural พื้นฐาน (idle bob, walk bounce) — ไม่มี attack/hurt clip

---

## 2. หลักออกแบบ — คงสไตล์เดิม เพิ่มความสมบูรณ์

### 2.1 กติกา
1. **คงสไตล์เดิม** — slime เป็นเจลาติน วิวัฒนาการเป็นสัตว์ — ไม่เปลี่ยนทิศทางศิลป์
2. **เพิ่ม Bighead Blocky** — สไตล์ใหม่คู่ขนาน หัวโต ตัวเหลี่ยม ตาม PR #30
3. **สองสไตล์ทำงานคู่กัน** — ผู้เล่นเลือกได้ใน settings (legacy / bighead)
4. **Enhance ไม่ใช่ Replace** — เพิ่ม detail ใส่สิ่งที่มี ไม่สร้างใหม่ทั้งตัว
5. **Procedural-first** — ใช้ Three.js primitives ต่อ เพิ่ม texture เป็น option
6. **ทุกตัวต้องดูต่างกันได้** — 18 type ต้องมีเอกลักษณ์ชัด (ทั้งสองสไตล์)
7. **Evolution ต้องเห็นความเปลี่ยน** — slime → animal ต้องชัดเจน (ทั้งสองสไตล์)
8. **Performance ต้องไม่ตก** — ไม่เพิ่ม triangle เกิน 2000/model
9. **Mobile-friendly** — texture ไม่เกิน 128×128
10. **asset-presentation compatible** — monster catalog ใช้ schema จาก AE0

### 2.2 แนวทาง Enhancement

| ระดับ | วิธี | ผล |
|-------|------|----|
| Level 0 (ปัจจุบัน) | สีทึบ + primitives | ใช้ได้แต่ขาด detail |
| Level 1 | เพิ่ม procedural detail (spots, stripes, scales) | มีลวดลายไม่ต้องไฟล์ |
| Level 2 | เพิ่ม canvas texture (procedural สร้างใน JS) | พื้นผิวละเอียดขึ้น |
| Level 3 | เพิ่ม GLB model (external) | สวยที่สุด แต่ต้องมีไฟล์ |

เป้าหมาย: **Level 1-2** (procedural enhancement) ก่อน — ไม่ต้องสร้างไฟล์ภายนอน

---

## 3. ระบบสไตล์เดิม (3 ชั้น)

### 3.1 ชั้นที่ 1: Slime (Base Form)

ทุก species เริ่มเป็น slime ทรงกลมเจลาติน:
- ตัว: sphere สีตาม species (MeshPhysicalMaterial — transparent, transmission, clearcoat)
- แกนกลาง: sphere เล็กสี type accent (emissive)
- ฐานเงา: circle ดำโปร่งใส
- แสงเงา: sphere ขาวโปร่งใส (shine)
- ตา: 2 จุดดำ + คิ้ว (ถ้ามี)
- ปาก: torus arc
- จุกบนหัว: sphere เล็ก
- มงกุฎ: cone สี accent
- ขอบตกแต่ง: ตาม type (ears/horns/fins/wings/rings/plates/orbs)

Type decorations ที่มี (18 type):
- Normal: หู + แก้ม
- Fire: 3 cones (เปลวไฟ) + แก้ม
- Water: ครีบ + orb
- Electric: 2 cones (สายเลย) + 2 plates (แก้มไฟฟ้า)
- Grass: ใบ (leaf ear) + orb
- Ice: 3 cones (ผลึก) โปร่งใส
- Fighting: 2 orbs (หมัด) + plate (หน้าผาก)
- Poison: 3 orbs (พิษ)
- Ground: plate (หัว) + 2 cones (หู)
- Flying: ปีก + orb
- Psychic: แหวน + orb
- Bug: 2 horns + plate (ปีกแข็ง)
- Rock: 3 orbs (ก้อนหิน)
- Ghost: แกนใส + orbs + แหวน
- Dragon: 2 horns + back spikes
- Dark: หู + plate (ผ้าคลุม)
- Steel: plate (หน้ากาก) + 2 orbs (ตะเกียง)
- Fairy: ปีก + orb + แก้ม

### 3.2 ชั้นที่ 2: Animal (Evolution Form)

วิวัฒนาการจาก slime → สัตว์ 3 ชนิด:

**Quadruped (สี่ขา)** — ส่วนใหญ่ (14 species)
- ลำตัว: capsule นอน
- หัว: sphere
- ขา: 4 ขา (cylinder)
- เท้า: 4 paw (orb)
- เพิ่ม: ears, eyes, muzzle, tail, cheeks, whiskers, paws, horns, gems

**Bird (นก)** — 2 species (frostowl, galebird)
- ลำตัว: sphere กลม
- หัว: sphere
- ขา: 2 ขา + paws
- เพิ่ม: wings, eyes, beak, ears

**Serpent (งู)** — ghostpurr เท่านั้น
- ลำตัว: capsule นอน
- หัว: sphere
- ครีบ: fin pair

### 3.3 ชั้นที่ 3: Humanoid (Player + Keeper)
- ไม่ใช่มอน — แยกไว้ ไม่อยู่ในแผนนี้

---

## 4. ตารางมอนทั้งหมด (38 รูป)

### 4.1 Base Form (Slime) — 19 ตัว

| # | Species ID | ชื่อ | Type | สี (hex) | Slime Decoration |
|---|-----------|------|------|---------|-----------------|
| 1 | normalooze | Plain Slime | Normal | #c3b7a1 | หู + แก้ม |
| 2 | flameling | Flare Slime | Fire | #ef6c32 | เปลวไฟ + แก้ม |
| 3 | aquapuff | Aqua Slime | Water | #4f87e8 | ครีบ + orb |
| 4 | voltkit | Volt Slime | Electric | #e8bd22 | สายเลย + plates |
| 5 | mossbun | Moss Slime | Grass | #63b34b | ใบ + orb |
| 6 | frostowl | Frost Slime | Ice | #79c9c9 | ผลึก |
| 7 | punchcub | Brawl Slime | Fighting | #b9342c | หมัด + หน้าผาก |
| 8 | toxitoad | Venom Slime | Poison | #93489e | orbs พิษ |
| 9 | sandmole | Terra Slime | Ground | #cba94e | plate + หู |
| 10 | galebird | Aero Slime | Flying | #8d7cdb | ปีก + orb |
| 11 | mindcoon | Mind Slime | Psychic | #ec4d7f | แหวน + orb |
| 12 | buglet | Bug Slime | Bug | #9cab25 | horns + ปีกแข็ง |
| 13 | rockhorn | Rock Slime | Rock | #a48e38 | ก้อนหิน |
| 14 | ghostpurr | Spirit Slime | Ghost | #61568f | orbs ใส + แหวน |
| 15 | emberdrake | Drake Slime | Dragon | #6a45d3 | horns + back spikes |
| 16 | voidhorn | Shadow Slime | Dark | #584b43 | หู + ผ้าคลุม |
| 17 | ironbug | Metal Slime | Steel | #8e8eaa | หน้ากาก + ตะเกียง |
| 18 | fairimp | Fairy Slime | Fairy | #dc87b8 | ปีก + orb + แก้ม |

### 4.2 Evolution Form (Animal) — 19 ตัว

| # | Form ID | ชื่อ | Type | สไตล์ | Parts ที่เพิ่ม |
|---|---------|------|------|--------|-------------|
| 1 | plainpup | Plainpup | Normal | quadruped | หู + ตา + จมูก + หาง |
| 2 | flameling | Flameling | Fire | quadruped | หูไฟ + ตา + จมูก + หางไฟ + แก้ม |
| 3 | aquapuff | Aquapuff | Water | quadruped | ตา + จมูก + ครีบ + หาง |
| 4 | voltkit | Voltkit | Electric | quadruped | หู + ตา + จมูก + หนวด + หางสายฟ้า |
| 5 | mossbun | Mossbun | Grass | quadruped | ใบ + ตา + จมูก + ใบหัว + หาง |
| 6 | frostowl | Frostowl | Ice | bird | ปีก + ตา + จะงอย + หู |
| 7 | punchcub | Punchcub | Fighting | quadruped | หู + ตา + จมูก + paws |
| 8 | toxitoad | Toxitoad | Poison | quadruped (กว้าง) | ตา + จมูก + paws |
| 9 | sandmole | Sandmole | Ground | quadruped | ตา + จมูก + paws |
| 10 | galebird | Galebird | Flying | bird | ปีก + ตา + จะงอย |
| 11 | mindcoon | Mindcoon | Psychic | quadruped | หู + ตา + จมูก + อัญมณี |
| 12 | buglet | Beetling | Bug | quadruped | หู + ตา + จมูก + ปีกแข็ง + หาง |
| 13 | rockhorn | Rockhorn | Rock | quadruped | หู + ตา + จมูก + horns + หาง |
| 14 | ghostpurr | Ghostpurr | Ghost | serpent | ตา + จมูก + ครีบ |
| 15 | emberdrake | Emberdrake | Dragon | quadruped | หู + ตา + จมูก + horns + หาง + หนามหลัง |
| 16 | voidhorn | Voidhorn | Dark | quadruped | หู + ตา + จมูก + horns + หาง |
| 17 | ironbug | Ironbug | Steel | quadruped | หู + ตา + จมูก + ปีกแข็ง + หาง |
| 18 | fairimp | Fairimp | Fairy | quadruped | หู + ตา + จมูก + ปีก + หาง |

---

## 5. แผนพัฒนาตามสไตล์ — รายละเอียดแต่ละตัว

### 5.1 Enhancement ที่ใช้กับทุกตัว

#### 5.1.1 Procedural Texture (Canvas) — Level 2

สร้าง texture ใน JavaScript โดยใช้ Canvas API — ไม่ต้องมีไฟล์ภายนอน:

```js
function makeMonsterTexture(speciesId, type, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  // พื้นหลัง: สี species
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 128, 128);
  
  // ลวดลายตาม type
  const patterns = {
    Normal: () => { /* จุดเล็กๆ สว่าง */ },
    Fire: () => { /* เปลวไฟซีซ่า */ },
    Water: () => { /* คลื่นน้ำ */ },
    Electric: () => { /* สายฟ้าซิกแซก */ },
    Grass: () => { /* ใบไม้เล็กๆ */ },
    Ice: () => { /* ผลึกเหลี่ยม */ },
    Fighting: () => { /* รอยฟกช้ำ/แผล */ },
    Poison: () => { /* ฟองพิษ */ },
    Ground: () => { /* รอยรอยดิน */ },
    Flying: () => { /* ขนนก */ },
    Psychic: () => { /* เกลียวคลื่นจิต */ },
    Bug: () => { * ลายแมลง/จุด */ },
    Rock: () => { /* รอยร้าวหิน */ },
    Ghost: () => { /* หมอกซีซ่า */ },
    Dragon: () => { /* เกล็ดมังกร */ },
    Dark: () => { /* เงาดำ */ },
    Steel: () => { /* โลหะเงา */ },
    Fairy: () => { /* ดาวกระพริบ */ },
  };
  patterns[type]?.();
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
```

#### 5.1.2 Eye Expression (Level 1)

เพิ่มการเปลี่ยนสีหน้าตามสภาพ:

```js
const EYE_STYLES = {
  happy: { y: 1.02, size: 0.045, curve: 'up' },     // ตาโค้งขึ้น
  normal: { y: 1.02, size: 0.04, curve: 'flat' },   // ตากลม
  tired: { y: 0.98, size: 0.035, curve: 'down' },   // ตาตก
  hurt: { y: 0.95, size: 0.03, curve: 'x' },        // ตาหรี่ (X)
  angry: { y: 1.05, size: 0.04, curve: 'down', browTilt: 0.4 }, // ตาคิ้วต่อ
};
```

#### 5.1.3 Body Shape Modifier (Level 1)

เปลี่ยนรูปร่างตาม training state (Table 41):

```js
function applyTrainingVisual(mesh, inst) {
  const training = inst.training || {};
  // Power สูง → ตัวหนา
  if (training.power > 50) mesh.scale.x *= 1 + (training.power - 50) * 0.001;
  // Defense สูง → ผิวหนา (roughness + metalness)
  if (training.defense > 50) {
    mesh.traverse(o => { if (o.material) { o.material.roughness = 0.9; o.material.metalness = 0.15; }});
  }
  // Speed สูง → เพรียว
  if (training.speed > 50) { mesh.scale.x *= 0.95; mesh.scale.z *= 0.95; }
  // Spirit สูง → aura/glow
  if (training.spirit > 50) {
    mesh.traverse(o => { if (o.material?.emissive) o.material.emissiveIntensity = 0.3; });
  }
}
```

### 5.2 รายละเอียด Enhancement แต่ละ Type

#### Normal (Plain Slime → Plainpup)
- **Slime**: เพิ่มจุดเล็กๆ สว่างกระจาย (procedural canvas)
- **Plainpup**: เพิ่มขนสั้น (roughness สูง) + จุดขนกระจาย
- สี: ครีม/น้ำตาลอ่อน

#### Fire (Flare Slime → Flameling)
- **Slime**: เพิ่มเปลวไฟซีซ่า (canvas: สีส้ม→แดง gradient)
- **Flameling**: เพิ่มลายเปลวไฟบนตัว + หางเป็นไฟ (emissive flicker)
- สี: ส้ม→แดง

#### Water (Aqua Slime → Aquapuff)
- **Slime**: เพิ่มคลื่นน้ำ (canvas: วง concentric)
- **Aquapuff**: เพิ่มลายคลื่น + ครีบใส (opacity ต่ำ)
- สี: ฟ้า→น้ำเงิน

#### Electric (Volt Slime → Voltkit)
- **Slime**: เพิ่มสายฟ้าซิกแซก (canvas: เส้นเหลือง)
- **Voltkit**: เพิ่มลายสายฟ้า + หางเป็นสายฟ้า (emissive pulse)
- สี: เหลือง→ทอง

#### Grass (Moss Slime → Mossbun)
- **Slime**: เพิ่มใบไม้เล็กๆ (canvas: จุดเขียว)
- **Mossbun**: เพิ่มลายใบไม้ + ใบหัว (leaf ear มี vein)
- สี: เขียว

#### Ice (Frost Slime → Frostowl)
- **Slime**: เพิ่มผลึกเหลี่ยม (canvas: รูปทรงเหลี่ยมโปร่งใส)
- **Frostowl**: เพิ่มลายผลึก + ปีกใส (ice crystal)
- สี: ฟ้าอ่อน→ขาว

#### Fighting (Brawl Slime → Punchcub)
- **Slime**: เพิ่มรอยฟกช้ำ/แผล (canvas: จุดแดงเข้ม)
- **Punchcub**: เพิ่มลายรอยแผล + paws ใหญ่ขึ้น
- สี: แดงเข้ม

#### Poison (Venom Slime → Toxitoad)
- **Slime**: เพิ่มฟองพิษ (canvas: วงกลมม่วง)
- **Toxitoad**: เพิ่มลายฟอง + ตัวกว้าง/แบน
- สี: ม่วง

#### Ground (Terra Slime → Sandmole)
- **Slime**: เพิ่มรอยดิน (canvas: จุดน้ำตาล)
- **Sandmole**: เพิ่มลายดิน + paws ใหญ่ (ขุด)
- สี: น้ำตาลทอง

#### Flying (Aero Slime → Galebird)
- **Slime**: เพิ่มขนนก (canvas: เส้นโค้ง)
- **Galebird**: เพิ่มลายขน + ปีกใหญ่ขึ้น
- สี: ม่วงอ่อน

#### Psychic (Mind Slime → Mindcoon)
- **Slime**: เพิ่มเกลียวคลื่นจิต (canvas: เส้นเกลียว)
- **Mindcoon**: เพิ่มลายคลื่น + อัญมณีเรืองแสง
- สี: ชมพู

#### Bug (Bug Slime → Beetling)
- **Slime**: เพิ่มลายแมลง (canvas: จุดเหลือง-เขียว)
- **Beetling**: เพิ่มลายแมลง + ปีกแข็ง (elytra)
- สี: เขียวเหลือง

#### Rock (Rock Slime → Rockhorn)
- **Slime**: เพิ่มรอยร้าวหิน (canvas: เส้นร้าว)
- **Rockhorn**: เพิ่มลายหิน + horns ใหญ่
- สี: น้ำตาลเข้ม

#### Ghost (Spirit Slime → Ghostpurr)
- **Slime**: เพิ่มหมอกซีซ่า (canvas: วงกลมโปร่งใส)
- **Ghostpurr**: เพิ่มลายหมอก + ตัวยาว (serpent) + ลอยได้
- สี: ม่วงจาง

#### Dragon (Drake Slime → Emberdrake)
- **Slime**: เพิ่มเกล็ดมังกร (canvas: รูปเกล็ดซ้อน)
- **Emberdrake**: เพิ่มลายเกล็ด + horns + หนามหลังใหญ่
- สี: ม่วงเข้ม

#### Dark (Shadow Slime → Voidhorn)
- **Slime**: เพิ่มเงาดำ (canvas: จุดดำกระจาย)
- **Voidhorn**: เพิ่มลายเงา + หูเข็ม + มัดหาง
- สี: ดำ-เทา

#### Steel (Metal Slime → Ironbug)
- **Slime**: เพิ่มโลหะเงา (canvas: เส้นเงาโลหะ)
- **Ironbug**: เพิ่มลายโลหะ + ปีกแข็งเงา + ตะเกียงเรืองแสง
- สี: เงิน-เทา

#### Fairy (Fairy Slime → Fairimp)
- **Slime**: เพิ่มดาวกระพริบ (canvas: ดาว 4 แฉก)
- **Fairimp**: เพิ่มลายดาว + ปีกผีเสื้อ + แก้มชมพู
- สี: ชมพู

---

## 6. Texture Enhancement

### 6.1 Procedural Canvas Texture (หลัก) — Legacy Style

สร้าง texture ด้วย Canvas API — ไม่ต้องมีไฟล์:

### 6.2 Four-Side Block Texture — Bighead Style

สไตล์ Bighead ใช้พื้นผิว 4 ด้าน (front/back/left/right) — แต่ละด้านวาดต่างกัน:

```js
function makeFourSideTexture(speciesId, type, colorHex) {
  // สร้าง texture sheet 2×2 (front, back, left, right)
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256; // 128×128 per side
  const ctx = canvas.getContext('2d');
  
  // แบ่ง 4 ช่อง: [front, back, left, right]
  const sides = [
    { x: 0, y: 0, name: 'front' },   // บนซ้าย
    { x: 128, y: 0, name: 'back' },   // บนขวา
    { x: 0, y: 128, name: 'left' },   // ล่างซ้าย
    { x: 128, y: 128, name: 'right' }, // ล่างขวา
  ];
  
  for (const side of sides) {
    ctx.save();
    ctx.translate(side.x, side.y);
    
    // พื้นฐาน
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, 128, 128);
    
    if (side.name === 'front') {
      // ด้านหน้า: หน้า (ตา/ปาก) + ลาย type
      drawFrontFace(ctx, type, colorHex);
      drawTypePattern(ctx, type, colorHex);
    } else if (side.name === 'back') {
      // ด้านหลัง: ลายหลัง + หาง
      drawBackPattern(ctx, type, colorHex);
    } else {
      // ด้านข้าง: ลายข้าง
      drawSidePattern(ctx, type, colorHex, side.name);
    }
    
    ctx.restore();
  }
  
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawFrontFace(ctx, type, colorHex) {
  // ตา: 2 จุดดำ
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(40, 50, 12, 12);  // ตาซ้าย
  ctx.fillRect(76, 50, 12, 12);  // ตาขวา
  // ปาก: แถบเล็ก
  ctx.fillRect(52, 72, 24, 4);
}

function drawBackPattern(ctx, type, colorHex) {
  // ลายหลังตาม type
  drawTypePattern(ctx, type, colorHex);
}

function drawSidePattern(ctx, type, colorHex, side) {
  // ลายข้าง — เข้มขึ้นเล็กน้อย
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(0, 0, 128, 128);
  drawTypePattern(ctx, type, colorHex);
}
```

### 6.3 Bighead Blocky Mesh Builder

```js
function makeBigheadSlimeMesh(color, scale, type) {
  const g = new THREE.Group();
  const colorHex = '#' + color.toString(16).padStart(6, '0');
  const tex = getMonsterTexture(type, type, colorHex, 'bighead');
  
  // ตัว: box เหลี่ยม (ไม่กลม)
  const bodyGeom = boxGeometry(0.92*scale, 0.88*scale, 0.80*scale);
  const bodyMat = new THREE.MeshStandardMaterial({
    color, roughness: 0.18, metalness: 0,
    map: tex, // four-side texture
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.y = 0.50*scale;
  body.castShadow = true;
  g.add(body);
  
  // ตา: box เล็ก (ไม่ใช่ sphere)
  const eyeMat = basicMat(0x111827);
  for (const sx of [-0.18, 0.18]) {
    const eye = new THREE.Mesh(boxGeometry(0.08*scale, 0.08*scale, 0.04*scale), eyeMat);
    eye.position.set(sx*scale, 0.62*scale, -0.38*scale);
    g.add(eye);
  }
  
  // ปาก: box บาง
  const mouth = new THREE.Mesh(boxGeometry(0.20*scale, 0.04*scale, 0.02*scale), basicMat(0x1f2937));
  mouth.position.set(0, 0.42*scale, -0.39*scale);
  g.add(mouth);
  
  // หัวเหลี่ยมเล็กบน (จุก)
  const nub = new THREE.Mesh(boxGeometry(0.24*scale, 0.18*scale, 0.24*scale), bodyMat);
  nub.position.set(0, 0.98*scale, 0);
  nub.castShadow = true;
  g.add(nub);
  
  // Type decoration (เหลี่ยม)
  addBigheadTypeDecoration(g, type, scale, color, bodyMat);
  
  return g;
}

function makeBigheadAnimalBase(color, scale, { kind = 'quadruped', accent = null } = {}) {
  const g = new THREE.Group();
  const colorHex = '#' + color.toString(16).padStart(6, '0');
  const tex = getMonsterTexture('animal', type, colorHex, 'bighead');
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.06, map: tex });
  
  if (kind === 'bird') {
    // ตัว: box กลมเหลี่ยม
    const body = new THREE.Mesh(boxGeometry(0.70*scale, 0.80*scale, 0.70*scale), bodyMat);
    body.position.y = 0.66*scale; body.castShadow = true; g.add(body);
    // หัว: box โต
    const head = new THREE.Mesh(boxGeometry(0.55*scale, 0.50*scale, 0.50*scale), bodyMat);
    head.position.set(0, 1.10*scale, -0.10*scale); head.castShadow = true; g.add(head);
    // ปีก: box บาง
    for (const sx of [-0.42, 0.42]) {
      const wing = new THREE.Mesh(boxGeometry(0.06*scale, 0.40*scale, 0.50*scale), bodyMat);
      wing.position.set(sx*scale, 0.80*scale, 0.05*scale);
      g.add(wing);
    }
    // ขา: 2 ขา box
    for (const sx of [-0.15, 0.15]) {
      const leg = new THREE.Mesh(boxGeometry(0.10*scale, 0.30*scale, 0.10*scale), bodyMat);
      leg.position.set(sx*scale, 0.15*scale, 0.10*scale);
      g.add(leg);
    }
  } else if (kind === 'serpent') {
    // ตัว: box ยาวนอน
    const body = new THREE.Mesh(boxGeometry(0.90*scale, 0.40*scale, 0.45*scale), bodyMat);
    body.position.set(0, 0.50*scale, 0); body.castShadow = true; g.add(body);
    // หัว: box โต
    const head = new THREE.Mesh(boxGeometry(0.50*scale, 0.45*scale, 0.45*scale), bodyMat);
    head.position.set(0, 0.70*scale, -0.40*scale); head.castShadow = true; g.add(head);
  } else {
    // quadruped — สี่ขา
    // ตัว: box นอน
    const body = new THREE.Mesh(boxGeometry(0.65*scale, 0.45*scale, 0.85*scale), bodyMat);
    body.position.set(0, 0.55*scale, 0.05*scale); body.castShadow = true; g.add(body);
    // หัว: box โต (bighead!)
    const head = new THREE.Mesh(boxGeometry(0.55*scale, 0.50*scale, 0.48*scale), bodyMat);
    head.position.set(0, 0.90*scale, -0.30*scale); head.castShadow = true; g.add(head);
    // ขา: 4 ขา box
    for (const [sx, sz] of [[-0.20, 0.25], [0.20, 0.25], [-0.20, -0.15], [0.20, -0.15]]) {
      const leg = new THREE.Mesh(boxGeometry(0.12*scale, 0.35*scale, 0.12*scale), bodyMat);
      leg.position.set(sx*scale, 0.17*scale, sz*scale);
      leg.castShadow = true; g.add(leg);
    }
  }
  return g;
}

function addBigheadTypeDecoration(g, type, scale, color, bodyMat) {
  const accent = parseInt((TYPE_COLOR[type] || '#ffffff').replace('#', ''), 16);
  switch(type) {
    case 'Fire':
      // เปลวไฟ: 3 cones เหลี่ยม
      for (const [x, r, h] of [[-0.15, 0.06, 0.18], [0, 0.07, 0.22], [0.15, 0.06, 0.18]]) {
        const flame = new THREE.Mesh(coneGeometry(r*scale, h*scale, 4), bodyMat);
        flame.position.set(x*scale, 1.10*scale, -0.02*scale);
        flame.rotation.x = -0.2;
        g.add(flame);
      }
      break;
    case 'Water':
      // ครีบ: box บาง 2 ข้าง
      for (const sx of [-0.40, 0.40]) {
        const fin = new THREE.Mesh(boxGeometry(0.04*scale, 0.20*scale, 0.30*scale), bodyMat);
        fin.position.set(sx*scale, 0.70*scale, 0.10*scale);
        g.add(fin);
      }
      break;
    case 'Electric':
      // สายเลย: box เล็กซิกแซก
      for (const sx of [-0.25, 0.25]) {
        const bolt = new THREE.Mesh(boxGeometry(0.06*scale, 0.20*scale, 0.04*scale), bodyMat);
        bolt.position.set(sx*scale, 1.05*scale, -0.02*scale);
        bolt.rotation.z = sx > 0 ? 0.8 : -0.8;
        g.add(bolt);
      }
      break;
    case 'Dragon':
      // เขา: cone เหลี่ยม 2 ข้าง
      for (const sx of [-0.18, 0.18]) {
        const horn = new THREE.Mesh(coneGeometry(0.06*scale, 0.22*scale, 4), bodyMat);
        horn.position.set(sx*scale, 1.15*scale, -0.02*scale);
        horn.rotation.x = -0.2;
        g.add(horn);
      }
      break;
    case 'Flying':
      // ปีก: box บาง 2 ข้าง
      for (const sx of [-0.50, 0.50]) {
        const wing = new THREE.Mesh(boxGeometry(0.08*scale, 0.35*scale, 0.45*scale), bodyMat);
        wing.position.set(sx*scale, 0.70*scale, 0.05*scale);
        g.add(wing);
      }
      break;
    // ... อันอื่นๆ ใช้ box/cone เหลี่ยมแทน sphere
  }
}
```

### 6.4 เดิม — Procedural Canvas Texture (Legacy)

```js
const monsterTextureCache = new Map();

function getMonsterTexture(speciesId, type, colorHex) {
  const key = `${speciesId}:${type}`;
  if (monsterTextureCache.has(key)) return monsterTextureCache.get(key);
  
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  // พื้นฐาน: สี species
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, 128, 128);
  
  // ลายตาม type
  drawTypePattern(ctx, type, colorHex);
  
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  monsterTextureCache.set(key, tex);
  return tex;
}

function drawTypePattern(ctx, type, baseColor) {
  switch(type) {
    case 'Fire':
      // เปลวไฟซีซ่า
      for (let i = 0; i < 12; i++) {
        const x = Math.random() * 128, y = Math.random() * 128;
        const r = 5 + Math.random() * 15;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(255,200,80,0.4)');
        grad.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x-r, y-r, r*2, r*2);
      }
      break;
    case 'Water':
      // คลื่นน้ำ
      ctx.strokeStyle = 'rgba(150,200,255,0.3)';
      ctx.lineWidth = 2;
      for (let y = 10; y < 128; y += 16) {
        ctx.beginPath();
        for (let x = 0; x < 128; x += 4) {
          const yy = y + Math.sin(x * 0.1) * 3;
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      break;
    case 'Electric':
      // สายฟ้า
      ctx.strokeStyle = 'rgba(255,240,100,0.5)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        let x = Math.random() * 128, y = 0;
        ctx.moveTo(x, y);
        while (y < 128) {
          x += (Math.random() - 0.5) * 20;
          y += 10 + Math.random() * 10;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    case 'Grass':
      // ใบไม้เล็ก
      ctx.fillStyle = 'rgba(100,200,80,0.3)';
      for (let i = 0; i < 20; i++) {
        const x = Math.random() * 128, y = Math.random() * 128;
        ctx.beginPath();
        ctx.ellipse(x, y, 3, 6, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'Ice':
      // ผลึกเหลี่ยม
      ctx.strokeStyle = 'rgba(200,240,255,0.4)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const x = Math.random() * 128, y = Math.random() * 128;
        const s = 8 + Math.random() * 12;
        ctx.beginPath();
        for (let j = 0; j < 6; j++) {
          const a = (j / 6) * Math.PI * 2;
          const px = x + Math.cos(a) * s, py = y + Math.sin(a) * s;
          if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
      break;
    case 'Dragon':
      // เกล็ดมังกร
      ctx.strokeStyle = 'rgba(200,180,255,0.3)';
      ctx.lineWidth = 1;
      for (let y = 0; y < 128; y += 12) {
        for (let x = 0; x < 128; x += 12) {
          const offset = (y / 12) % 2 * 6;
          ctx.beginPath();
          ctx.arc(x + offset, y, 5, 0, Math.PI, false);
          ctx.stroke();
        }
      }
      break;
    case 'Steel':
      // เงาโลหะ
      ctx.strokeStyle = 'rgba(220,225,240,0.4)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const y = (i / 6) * 128;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(128, y);
        ctx.stroke();
      }
      break;
    case 'Fairy':
      // ดาวกระพริบ
      ctx.fillStyle = 'rgba(255,200,230,0.4)';
      for (let i = 0; i < 12; i++) {
        const x = Math.random() * 128, y = Math.random() * 128;
        drawStar(ctx, x, y, 4, 3 + Math.random() * 3);
      }
      break;
    // ... อันอื่นๆ ตามลายที่กำหนด
  }
}

function drawStar(ctx, x, y, points, r) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.4;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}
```

### 6.2 การนำไปใช้

ใน `mat()` และ `jelly()` — เพิ่ม optional texture parameter:
```js
function mat(color, rough=.72, metal=.08, texture=null) {
  const key = texture ? `tex:${color}:${texture.uuid}` : `${color}:${rough}:${metal}`;
  return sharedResources.material(key, () => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    if (texture) m.map = texture;
    return m;
  });
}
```

ใน `makeSlimeMesh()` และ `makeAnimalBase()` — ส่ง texture เข้าไป:
```js
function makeSlimeMesh(color, scale=1, type='Normal') {
  const tex = getMonsterTexture(type, type, '#' + color.toString(16).padStart(6,'0'));
  // ... ใช้ tex ใน body material
}
```

---

## 7. Visual Signal (Training State → Visual) — Table 41

| Training State | Visual Signal | วิธีทำ |
|---------------|--------------|-------|
| Power สูง | ตัวหนา/มวลเพิ่ม | `mesh.scale.x += training.power * 0.001` |
| Defense สูง | ผิวหนา/เกราะ | `material.roughness = 0.9; metalness = 0.15` |
| Speed สูง | เพรียว/ท่าทางคล่อง | `mesh.scale.x *= 0.95; mesh.scale.z *= 0.95` |
| Technique สูง | Pattern/marking ละเอียด | `texture.repeat.set(2, 2)` — ลายละเอียดขึ้น |
| Spirit สูง | Aura/Glow/element trail | `emissiveIntensity = 0.3` + particle trail |
| Stress สูง | สีหน้ากระวนกระวาย | `shake offset` + idle เร็วขึ้น |
| Bond สูง | ท่าทางเป็นมิตร/เข้าใกล้ผู้เล่น | lean toward player + heart particle |

โค้ด:
```js
function applyVisualSignal(mesh, inst) {
  const t = inst.training || {};
  const body = mesh.children[0]; // body mesh
  
  // Power
  if (t.power > 50) {
    const factor = 1 + (t.power - 50) * 0.001;
    mesh.scale.x = (mesh.userData.baseScale?.x || 1) * factor;
    mesh.scale.z = (mesh.userData.baseScale?.z || 1) * factor;
  }
  
  // Defense
  if (t.defense > 50) {
    body.material.roughness = 0.85 + (t.defense - 50) * 0.001;
    body.material.metalness = 0.10 + (t.defense - 50) * 0.001;
  }
  
  // Speed
  if (t.speed > 50) {
    const factor = 1 - (t.speed - 50) * 0.0005;
    mesh.scale.x = (mesh.userData.baseScale?.x || 1) * factor;
    mesh.scale.z = (mesh.userData.baseScale?.z || 1) * factor;
  }
  
  // Spirit
  if (t.spirit > 50) {
    body.material.emissiveIntensity = 0.15 + (t.spirit - 50) * 0.003;
  }
}
```

---

## 8. Evolution Visual Change

### 8.1 ปัจจุบัน
- เปลี่ยนสี (path.color)
- เปลี่ยนขนาด (path.scale)
- เปลี่ยน statMods

### 8.2 เพิ่ม
- **Form change**: slime → animal (มีอยู่แล้ว — makeSpeciesMesh เลือก form)
- **Texture change**: slime texture → animal texture (ลายเปลี่ยน)
- **Size jump**: ขนาดโตขึ้นชัดเจน (scale 1.08-1.16)
- **Ring color**: เปลี่ยนสีวงแหวนใต้ตัว (owned → blue)
- **Aura**: เพิ่ม aura particle รอบตัวตอน evolution (ครั้งเดียว)

### 8.3 Evolution Effect

```js
function spawnEvolutionEffect(mesh) {
  const pos = mesh.position.clone();
  // วงแหวนขยาย
  for (let i = 0; i < 3; i++) {
    setTimeout(() => spawnRingPulse(pos, 0xfacc15, { scale: 0.5 + i * 0.3, life: 0.5 }), i * 100);
  }
  // ดาวกระจาย
  spawnBurst(pos, 0xfde68a, { count: 20, life: 0.6, size: 0.08 });
}
```

---

## 9. Animation Enhancement

### 9.1 ปัจจุบัน
- `animateMonster(mesh, dt, moving)` — idle bob + walk bounce
- `triggerMonsterAction(mesh, action, duration)` — attack lean + hurt shake

### 9.2 เพิ่ม
- **Idle variety**: แต่ละ type มี idle เฉพาะ (slime สั่น, bird กระพือปีก, serpent บิด)
- **Attack type-specific**: แต่ละ type โจมตีต่างกัน (Fire = พุ่ง, Water = สาด, Ice = แทง)
- **Hurt reaction**: ตาเปลี่ยนเป็น X + สีซีด
- **Faint**: ล้มนอน + ตาหุบ
- **Happy (bond high)**: กระโดดเล็กๆ + ตาโค้ง
- **Evolution**: แสงเรือง → สลับ model → ทีท่าใหม่

```js
const TYPE_IDLE = {
  Normal: (mesh, dt, phase) => { mesh.position.y += Math.sin(phase) * 0.01; },
  Fire: (mesh, dt, phase) => { mesh.position.y += Math.sin(phase * 1.5) * 0.015; mesh.rotation.y = Math.sin(phase * 0.5) * 0.05; },
  Water: (mesh, dt, phase) => { mesh.position.y += Math.sin(phase * 0.8) * 0.008; mesh.rotation.z = Math.sin(phase * 0.3) * 0.03; },
  Ice: (mesh, dt, phase) => { mesh.position.y += Math.sin(phase * 0.5) * 0.005; }, // นิ่ง
  Flying: (mesh, dt, phase) => { mesh.position.y += Math.sin(phase * 2) * 0.02; }, // ลอยสูง
  Ghost: (mesh, dt, phase) => { mesh.position.y += Math.sin(phase * 0.7) * 0.015; mesh.position.x += Math.sin(phase * 0.3) * 0.01; }, // ลอยเหนือพื้น
};
```

---

## 10. Monster Asset Catalog (asset-presentation)

### 10.1 การเชื่อมต่อกับ AE0 (PR #30)

PR #30 สร้าง `asset-presentation/` module สำหรับ humanoid — ต้องขยายไปยัง monster:

```
asset-presentation/
├── schema.mjs           — validate asset definition (เดิม)
├── catalog.mjs          — load/manage catalog (เดิม)
├── handle-contract.mjs  — AssetHandle interface (เดิม)
├── ownership.mjs        — shared/owned resources (เดิม)
├── anchors.mjs          — presentation anchors (เดิม)
├── requests.mjs         — normalize request (เดิม)
└── index.mjs            — exports (เดิม)

assets/catalog/
├── humanoid-core.json   — Player/Keeper (เดิม)
├── monster-slimes.json  — ใหม่: 19 slime definitions
└── monster-animals.json — ใหม่: 19 animal definitions
```

### 10.2 Monster Catalog Schema

ต้องขยาย ALLOWED_ROLES และ kind ใน schema:

```js
// schema.mjs — เพิ่ม
export const ALLOWED_KINDS = Object.freeze(['character', 'monster']);
export const MONSTER_ROLES = Object.freeze(['wild', 'owned', 'boss', 'elite']);
```

### 10.3 monster-slimes.json (ตัวอย่าง)

```json
{
  "name": "monster-slimes",
  "version": "1.0.0",
  "assets": [
    {
      "id": "monster.slime.normalooze.legacy.v1",
      "kind": "monster",
      "provider": "legacy",
      "style": "legacy-capsule-v1",
      "surfaceStyle": "untextured-v1",
      "rig": "slime-rig-v1",
      "metrics": { "height": 1.0, "bodyRadius": 0.46 },
      "roles": { "wild": {}, "owned": {}, "boss": {}, "elite": {} },
      "speciesId": "normalooze",
      "type": "Normal",
      "form": "slime"
    },
    {
      "id": "monster.slime.normalooze.bighead.v1",
      "kind": "monster",
      "provider": "procedural",
      "style": "blocky-bighead-v1",
      "surfaceStyle": "four-side-block-v1",
      "rig": "slime-rig-v1",
      "metrics": { "height": 1.0, "bodySize": [0.92, 0.88, 0.80] },
      "roles": { "wild": {}, "owned": {}, "boss": {}, "elite": {} },
      "speciesId": "normalooze",
      "type": "Normal",
      "form": "slime"
    }
  ],
  "appearances": [
    {
      "id": "appearance.slime.normalooze.legacy.v1",
      "style": "legacy-capsule-v1",
      "mode": "fallback",
      "parts": { "body": { "color": "#c3b7a1" } }
    },
    {
      "id": "appearance.slime.normalooze.bighead.v1",
      "style": "four-side-block-v1",
      "mode": "fallback",
      "parts": {
        "front": { "face": true, "color": "#c3b7a1" },
        "back": { "color": "#c3b7a1" },
        "left": { "color": "#c3b7a1" },
        "right": { "color": "#c3b7a1" }
      }
    }
  ]
}
```

### 10.4 การใช้งาน

```js
import { loadCatalog, getAssetDef, getAppearance } from './asset-presentation/index.mjs';

async function initMonsterAssets() {
  await loadCatalog('./assets/catalog/monster-slimes.json');
  await loadCatalog('./assets/catalog/monster-animals.json');
}

function resolveMonsterAsset(speciesId, form, style) {
  const id = `monster.${form}.${speciesId}.${style}.v1`;
  const def = getAssetDef(id);
  const appearance = getAppearance(`appearance.${form}.${speciesId}.${style}.v1`);
  return { def, appearance };
}
```

---

## 11. ลำดับการทำ (Phases)

### Phase 1: Procedural Texture System (PR) — Legacy
- [ ] สร้าง `monster-texture.mjs` — canvas texture generator (18 type patterns)
- [ ] สร้าง `getMonsterTexture(type, colorHex, style)` — cache + reuse
- [ ] Wire texture เข้า `mat()` และ `jelly()` — optional texture param
- [ ] ใช้ใน `makeSlimeMesh()` body material (legacy)
- [ ] ใช้ใน `makeAnimalBase()` body material (legacy)
- ไฟล์: monster-texture.mjs, game-v800.js

### Phase 2: Bighead Blocky Mesh Builder (PR)
- [ ] สร้าง `makeBigheadSlimeMesh()` — box geometry หัวโต
- [ ] สร้าง `makeBigheadAnimalBase()` — box animal (quadruped/bird/serpent)
- [ ] สร้าง `addBigheadTypeDecoration()` — 18 type เหลี่ยม
- [ ] สร้าง `makeFourSideTexture()` — 4 ด้าน (front/back/left/right)
- [ ] สร้าง `drawFrontFace()` — ตา/ปากบน texture
- [ ] Wire `currentRenderStyle` + style switch
- [ ] เพิ่ม Settings UI: เลือกสไตล์ (legacy / bighead)
- ไฟล์: game-v800.js, style-v800.css, v800.html

### Phase 3: Monster Asset Catalog (PR)
- [ ] ขยาย schema.mjs — เพิ่ม kind='monster', MONSTER_ROLES
- [ ] สร้าง `assets/catalog/monster-slimes.json` — 19 × 2 styles = 38 defs
- [ ] สร้าง `assets/catalog/monster-animals.json` — 19 × 2 styles = 38 defs
- [ ] สร้าง `resolveMonsterAsset()` — resolve by speciesId+form+style
- [ ] Wire เข้า monsterMesh() — ใช้ catalog เป็น source of truth
- ไฟล์: asset-presentation/schema.mjs, assets/catalog/*.json, game-v800.js

### Phase 4: Visual Signal System (PR)
- [ ] สร้าง `applyVisualSignal(mesh, inst)` — training → visual
- [ ] Wire เข้า `monsterMesh()` หลังสร้าง mesh
- [ ] Wire เข้า `refreshStats()` — อัปเดต visual ตอน stat เปลี่ยน
- [ ] ทำงานทั้งสองสไตล์ (legacy + bighead)
- ไฟล์: game-v800.js

### Phase 5: Eye Expression + Animation (PR)
- [ ] สร้าง `EYE_STYLES` — 5 expressions
- [ ] แก้ `addEyeSet()` legacy + bighead ให้รองรับ expression
- [ ] สร้าง `TYPE_IDLE` — idle เฉพาะ type
- [ ] เพิ่ม attack/faint/happy animation
- [ ] Expression ตาม condition (ทั้งสองสไตล์)
- ไฟล์: game-v800.js

### Phase 6: Evolution Visual + Polish (PR)
- [ ] เพิ่ม `spawnEvolutionEffect()` — aura + ring + burst
- [ ] Wire เข้า `evolveMonster()`
- [ ] เพิ่ม texture transition (slime → animal)
- [ ] ปรับแต่ละ type ให้ชัด (18 type review ทั้งสองสไตล์)
- [ ] เพิ่ม particle trail (Spirit), heart (Bond), shake (Stress)
- ไฟล์: game-v800.js, monster-texture.mjs

---

## 11. ไฟล์ที่กระทบ

| ไฟล์ | Phase | ประเภท |
|------|-------|--------|
| monster-texture.mjs (ใหม่) | 1,6 | สร้างใหม่ — canvas texture generator |
| game-v800.js | 1-6 | Wire texture/visual/animation เข้าเกม |
| tests/v80-asset-monster-*.mjs (ใหม่) | 1-6 | Test per phase |

---

## 12. การตรวจรับ

1. `npm run ci` → ผ่านครบ
2. `node --check game-v800.js` → SYNTAX OK
3. Browser: v800.html → 200 OK
4. มอนทุกตัวแสดง texture ใหม่ (ไม่ใช่สีทึบ)
5. Training state เปลี่ยน visual ของมอนจริง
6. Expression เปลี่ยนตาม condition
7. Animation แต่ละ type ต่างกัน
8. Evolution มี effect ชัดเจน
9. Performance: FPS ไม่ตก (texture 128×128, cache)

---

## 13. ข้อควรระวัง

1. **CanvasTexture ต้อง dispose** — เมื่อไม่ใช้ ต้อง `texture.dispose()` ไม่งั้น memory leak
2. **Cache key ต้อง unique** — ใช้ `type:color` เป็น key ไม่ใช้แค่ type
3. **Texture repeat** — ถี่เกินจะเห็นเป็นจุด หว่างเกินจะไม่เห็น — หาค่าที่พอดี
4. **MeshPhysicalMaterial (jelly)** — texture อาจทำให้ jelly ดูไม่ใส — ลด opacity ลง
5. **Performance** — 18 texture × 128×128 = ~1MB memory ไม่กระทบ
6. **applyVisualSignal ต้องไม่ทับ baseScale** — เก็บ baseScale ไว้ใน userData ก่อน
7. **Type idle ต้องไม่ทำลาย animation เดิม** — เพิ่มไม่ใช่ทับ
8. **Evolution effect ต้องไม่บล็อก** — ใช้ setTimeout/queue ไม่ใช่ await
9. **Slime → Animal transition** — texture เปลี่ยน แต่โครงสร้าง mesh เปลี่ยนอยู่แล้ว
10. **ไม่เพิ่ม GLB** — เฟสนี้ใช้ procedural เท่านั้น — GLB เป็นเฟสถัดไป

---

## สรุป

- มอน 19 species × 2 รูป = 38 รูป ทั้งหมด procedural
- สไตล์เดิม: slime (เจลาติน) → evolution (สัตว์)
- Enhancement 6 Phase: Texture → Visual Signal → Expression → Animation → Evolution Effect → Polish
- ใช้ Canvas API สร้าง texture — ไม่ต้องไฟล์ภายนอน
- Visual Signal ตาม Table 41 (training → visual)
- ไม่เปลี่ยนสไตล์ — เพิ่ม detail ในสิ่งที่มี
- 6 PR = 6 Phase
- Performance: ~1MB texture, ไม่ตก