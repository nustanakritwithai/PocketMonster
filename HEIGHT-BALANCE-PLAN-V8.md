# Height Balance Plan V8.2 — สมดุลด้านความสูงมอนสเตอร์

> แก้ปัญหาความสูงมอนสเตอร์ที่สูงต่ำผิดธรรมชาติ
> Owner: Hermes (plan) → Cursor Agent (implement) → Hermes (review/merge)
> Status: DRAFT v2 — ยังไม่ push รอผู้ใช้อนุมัติ

---

## 1. วิเคราะห์ปัญหา — 7 เลเยอร์ความสูงที่คูณซ้อนกัน

ความสูงมอนสเตอร์ถูกกำหนดโดย 7 ชั้นคูณซ้อน ทำให้ค่าแกว่งจาก 1.06 ถึง 2.16 (แตกต่าง 104%)

### Layer 1: Base geometry (Bighead provider)

| Kind | Body | Head | ความสูง base | ไฟล์ |
|------|------|------|------------|------|
| slime | 0.92×0.88 @ y=0.50 + nub 0.24×0.18 @ y=0.98 | — | 1.07 | provider:457-475 |
| quadruped | 0.65×0.45 @ y=0.55 | 0.55×0.50 @ y=0.90 | 1.15 | provider:521-538 |
| bird | 0.70×0.80 @ y=0.66 | 0.55×0.50 @ y=1.10 | 1.35 | provider:482-504 |
| serpent | 0.90×0.40 @ y=0.50 | 0.50×0.45 @ y=0.70 | 0.93 | provider:506-519 |

ปัญหา: bird สูง 1.35 สูงกว่า serpent 0.93 ถึง 46% ตั้งแต่ยังไม่ใส่อะไรเลย

### Layer 2: Evolution path.scale (species data ใน game-v800.js)

```
const scale=(path?.scale||1)*scaleBase;
```

path.scale อยู่ในช่วง 1.08–1.16 (plainpup=1.08, emberdrake=1.16, voidhorn=1.16)
เพิ่มความสูงอีก 8–16% ก่อนเลเยอร์อื่น

### Layer 3: lifeStage Baby scale

```
const scaleBase=(inst?.lifeStage==='Baby')?.72:1;
```

Baby = 0.72, อื่น ๆ = 1.0
Baby โชว์ข้าง Adult ใน ranch ทำให้ดูแคระเกินจริง

### Layer 4: per-species scale.y override (5 species เท่านั้น)

| Species | scale.x | scale.y | scale.z | ไฟล์ |
|---------|---------|---------|---------|------|
| flame_wolf | 0.88 | 1.06 | 1.24 | game-v800.js:850, provider:436 |
| magma_bear | 1.28 | 0.92 | 1.08 | game-v800.js:868, provider:449 |
| toxitoad | 1.08 | 0.92 | 1.08 | game-v800.js:960, provider:356 |
| rockhorn | 1.12 | 1.05 | 1.16 | game-v800.js:997, provider:382 |
| voidhorn | 1.10 | 1.06 | 1.18 | game-v800.js:1022, provider:406 |

ปัญหา: magma_bear (หมีใหญ่) scale.y=0.92 ทำให้เตี้ยกว่า flame_wolf (หมาป่า) scale.y=1.06
ส่วน 13 species ที่เหลือไม่มี override เลย ทำให้ยืน base ล้วน

### Layer 5: applyVisualGrowth (training)

```
// monster-mark.mjs:27
y: 1 + power * 0.06 + defense * 0.10 - speed * 0.05
```

| สถานะ | y-modifier |
|-------|-----------|
| ไม่ฝึก | 1.00 |
| pure speed | 0.95 (หด 5%) |
| pure defense | 1.10 (+10%) |
| power+defense | 1.16 (+16%) |
| ทุกอย่างเต็ม | 1.11 (+11%) |

ปัญหา: speed ทำให้หด (ค่าติดลบ) และ defense เพิ่มสูงเกินไป

### Layer 6: Wild/Elite/Boss scale (game-v800.js:1831)

```
mesh.scale.multiplyScalar(boss?1.08:1.12);
```

| บทบาท | scale |
|-------|-------|
| Owned (ฝ่ายเรา) | 1.00 |
| Boss | 1.08 |
| Normal wild / Elite | 1.12 |

ปัญหาใหญ่: Boss ×1.08 < Normal wild ×1.12 — บอสเตี้ยกว่ามอนสเตอร์ธรรมดา

### Layer 7: animateMonster per-type pulse (game-v800.js:1513-1538)

ทุกเฟรม animateMonster คูณ scale ด้วย sy ตามธาตุ:

| ธาตุ | sy เพิ่มเติม | ธาตุ | sy เพิ่มเติม |
|------|-------------|------|-------------|
| Normal | +0.08 | Poison | +0.03 |
| Fire | +0.08 | Ground | +0.02 |
| Water | +0.00 | Flying | +0.12 |
| Electric | +0.05 | Psychic | +0.05 |
| Grass | +0.00 | Bug | +0.00 |
| Ice | +0.03 | Rock | +0.015 |
| Fighting | +0.00 | Ghost | +0.08 |
| Dragon | +0.06 | Dark | +0.00 |
| Fairy | +0.08 | Steel | +0.012 |

ปัญหา: Flying +0.12 สูงสุด ทำให้นกกระพริวสูงกว่าทุกตัวตลอดเวลา แม้ base จะสูงอยู่แล้ว

### ผลรวม worst case

```
สูงสุด = base × path.scale × species_y × growth × wild × anim_sy
       = 1.35 × 1.10 × 1.00 × 1.16 × 1.12 × 1.12 = 2.16  (Flying bird)
ต่ำสุด = 1.15 × 1.00 × 0.92 × 1.00 × 1.00 × 1.00 = 1.06  (magma_bear owned ไม่ฝึก)
ช่วง: 1.06 → 2.16 = แตกต่าง 104%
```

---

## 2. เป้าหมาย

| เป้าหมาย | ค่า |
|----------|-----|
| ความสูงมอนสเตอร์ Adult ทุกตัว (ไม่ฝึก, owned) | 0.95–1.20 |
| ความแตกต่างสูงสุด-ต่ำสุด (owned, ไม่ฝึก) | ≤ 25% (ลดจาก 28%) |
| ผล training ต่อความสูง | +0% ถึง +6% (ลดจาก -5% ถึง +16%) |
| ผล wild/boss ต่อความสูง | wild ×1.06, boss ×1.12 (สลับให้ boss ใหญ่กว่า) |
| ผล animation ต่อความสูง | ±0.03 ทุกธาตุ (ลดจาก +0.12 สูงสุด) |
| Baby ไม่เกิน 25% ของ Adult | Baby = 0.85 (ลดจาก 0.72) |
| ความแตกต่างรวม worst case | ≤ 50% (ลดจาก 104%) |

หลักสำคัญ: ความแตกต่างของสปีชีส์ควรเห็นจากสัดส่วน (หัวใหญ่/ตัวกว้าง/ขาสั้น) ไม่ใช่แค่ตัวเลขความสูง

---

## 3. แผนแก้ไข 7 Phases (1 Phase = 1 PR)

### Phase 1: ปรับ Bighead base geometry

เป้า: ทุก kind สูงใกล้กัน ช่วง 0.98–1.12

แก้ `asset-presentation/providers/procedural-bighead-monster.mjs`:

#### Slime (สูงเดิม 1.07 → เป้า 1.02)
```js
// BIGHEAD_SLIME_BODY: y 0.50→0.48, h 0.88→0.84
export const BIGHEAD_SLIME_BODY = Object.freeze({ w: 0.92, h: 0.84, d: 0.80, y: 0.48 });
// nub: y 0.98→0.94, h 0.18→0.14
// ผล: body top = 0.48+0.42 = 0.90, nub top = 0.94+0.07 = 1.01
```

#### Bird (สูงเดิม 1.35 → เป้า 1.12)
```js
// body: h 0.80→0.56, y 0.66→0.60
const body = boxMesh(0.70 * scale, 0.56 * scale, 0.70 * scale, ...);
body.position.y = 0.60 * scale;
// head: h 0.50→0.42, y 1.10→0.92
const head = boxMesh(0.55 * scale, 0.42 * scale, 0.50 * scale, ...);
head.position.set(0, 0.92 * scale, -0.10 * scale);
// wing: y 0.80→0.70
// leg: h 0.30→0.26, y 0.15→0.13
// beak: y 0.98→0.82, z -0.56→-0.48
// eyes: y 1.12→0.96, z -0.43→-0.40
// ผล: body top = 0.60+0.28 = 0.88, head top = 0.92+0.21 = 1.13 → ~1.13
```

#### Serpent (สูงเดิม 0.93 → เป้า 1.00)
```js
// body: h 0.40→0.38, y 0.50→0.52
// head: h 0.45→0.42, y 0.70→0.80
const head = boxMesh(0.50 * scale, 0.42 * scale, 0.45 * scale, ...);
head.position.set(0, 0.80 * scale, -0.40 * scale);
// fin: y 0.62→0.66
// eyes: y 0.78→0.88, z -0.58→-0.50
// ผล: body top = 0.52+0.19 = 0.71, head top = 0.80+0.21 = 1.01 → ~1.01
```

#### Quadruped (สูงเดิม 1.15 → เป้า 1.08)
```js
// body: h 0.45→0.42, y 0.55→0.54
// head: h 0.50→0.44, y 0.90→0.86
const head = boxMesh(0.55 * scale, 0.44 * scale, 0.48 * scale, ...);
head.position.set(0, 0.86 * scale, -0.30 * scale);
// leg: h 0.35→0.32, y 0.17→0.16
// eyes: y 0.98→0.94
// nose: y 0.85→0.81
// ผล: body top = 0.54+0.21 = 0.75, head top = 0.86+0.22 = 1.08 → ~1.08
```

#### สรุปผล Phase 1

| Kind | เดิม | ใหม่ | เป้า |
|------|------|------|------|
| slime | 1.07 | 1.01 | 0.98–1.05 |
| quadruped | 1.15 | 1.08 | 1.05–1.12 |
| bird | 1.35 | 1.13 | 1.08–1.15 |
| serpent | 0.93 | 1.01 | 0.98–1.05 |

**อย่าลืม:** decoration positions (ear, horn, crown, muzzle, tail, wing, cheek, paw) ที่อ้างอิง head/body y ต้องปรับตามสัดส่วน ใช้ ratio = new_y / old_y คูณทุกค่า y ของ decoration

Acceptance gate:
- [ ] `npm run ci` ผ่าน
- [ ] ทุก kind base height อยู่ใน 0.98–1.13
- [ ] decoration ไม่ลอย/ไม่จม (ตรวจด้วย browser)
- [ ] BIGHEAD_SLIME_BODY constant อัปเดต

---

### Phase 2: ปรับ evolution path.scale ให้แคบลง

เป้า: path.scale ช่วง 1.00–1.06 (ลดจาก 1.08–1.16)

แก้ species data ใน `game-v800.js` บรรทัด 370–423:

| Species | path.scale เดิม | path.scale ใหม่ |
|---------|----------------|----------------|
| plainpup | 1.08 | 1.02 |
| flameling | 1.12 | 1.04 |
| aquapuff | 1.12 | 1.04 |
| voltkit | 1.12 | 1.04 |
| mossbun | 1.10 | 1.03 |
| frostowl | 1.10 | 1.03 |
| punchcub | 1.12 | 1.04 |
| toxitoad | 1.10 | 1.03 |
| sandmole | 1.10 | 1.03 |
| galebird | 1.10 | 1.03 |
| mindcoon | 1.10 | 1.03 |
| buglet | 1.10 | 1.03 |
| rockhorn | 1.14 | 1.05 |
| ghostpurr | 1.10 | 1.03 |
| emberdrake | 1.16 | 1.06 |
| voidhorn | 1.16 | 1.06 |
| ironbug | 1.12 | 1.04 |
| fairimp | 1.10 | 1.03 |

หลัก: มอนสเตอร์ที่ evol แล้วโตขึ้นเล็กน้อย (2–6%) ไม่ใช่โตขึ้น 16% ระดับความแตกต่างเห็นจากการเปลี่ยนรูปร่าง (slime → animal) ไม่ใช่จากตัวเลข scale

Acceptance gate:
- [ ] `npm run ci` ผ่าน (โดยเฉพาะ tests ที่เช็ค path.scale)
- [ ] path.scale ทุกตัวอยู่ใน 1.00–1.06
- [ ] balance-sim CR เปลี่ยน < 1% (path.scale เป็น visual เท่านั้น)

---

### Phase 3: ปรับ lifeStage Baby scale

เป้า: Baby 0.85 แทน 0.72 (ลดความแตกต่างจาก 28% เหลือ 15%)

แก้ 2 จุดใน `game-v800.js`:
```js
// บรรทัด 889
const scaleBase=(inst?.lifeStage==='Baby')?.85:1;  // 0.72→0.85

// บรรทัด 1063
const lifeScale=(inst?.lifeStage==='Baby')?.85:1;  // 0.72→0.85
```

Acceptance gate:
- [ ] `npm run ci` ผ่าน
- [ ] Baby สูง 85% ของ Adult (ไม่ใช่ 72%)
- [ ] Baby ใน ranch ไม่ดูแคระเกินจริง

---

### Phase 4: ปรับ per-species scale.y ให้สอดคล้องกับเป้า

เป้า: ทุก species Adult owned ไม่ฝึก สูงในช่วง 0.95–1.20

คำนวณ scale.y ใหม่ = target_height / (base_height × path.scale)

| Species | Kind | Base (P1) | path.scale (P2) | Base×path | Target | scale.y ใหม่ | เดิม |
|---------|------|-----------|-----------------|----------|--------|-------------|------|
| flame_wolf | quadruped | 1.08 | 1.00 | 1.08 | 1.06 | 0.98 | 1.06 |
| magma_bear | quadruped | 1.08 | 1.00 | 1.08 | 1.15 | 1.06 | 0.92 |
| toxitoad | quadruped | 1.08 | 1.03 | 1.11 | 1.02 | 0.92 | 0.92 |
| rockhorn | quadruped | 1.08 | 1.05 | 1.13 | 1.12 | 0.99 | 1.05 |
| voidhorn | serpent | 1.01 | 1.06 | 1.07 | 1.05 | 0.98 | 1.06 |

หลักตั้ง target:
- สัตว์ใหญ่ (magma_bear, rockhorn) สูงกว่าค่ากลาง ~8%
- สัตว์เล็ก/เร็ว (toxitoad, flame_wolf) สูงใกล้ค่ากลางหรือต่ำกว่าเล็กน้อย
- serpent (voidhorn) สูงใกล้ค่ากลาง

แก้ไข:
- `game-v800.js` บรรทัด 850, 868, 960, 997, 1022
- `procedural-bighead-monster.mjs` บรรทัด 356, 382, 406, 436, 449

Acceptance gate:
- [ ] `npm run ci` ผ่าน
- [ ] ทุก species Adult owned ไม่ฝึก สูงใน 0.95–1.20
- [ ] magma_bear สูงกว่า toxitoad อย่างน้อย 10%

---

### Phase 5: ปรับ applyVisualGrowth formula

เป้า: training เพิ่มความสูง 0–6% (ลดจาก -5% ถึง +16%) และไม่มีค่าติดลบ

แก้ `asset-presentation/monster-mark.mjs` บรรทัด 27:
```js
// เดิม
y: 1 + power * 0.06 + defense * 0.10 - speed * 0.05,

// ใหม่
y: 1 + power * 0.02 + defense * 0.03 + spirit * 0.01,
```

แก้ `game-v800.js` บรรทัด 836–838 (legacy applyVisualGrowth):
```js
// เดิม
g.scale.x*=1+power*.10+defense*.08;
g.scale.y*=1+power*.06+defense*.10-speed*.05;
g.scale.z*=1+speed*.12-defense*.04;

// ใหม่
g.scale.x*=1+power*.06+defense*.04;
g.scale.y*=1+power*.02+defense*.03+spirit*.01;  // 0→+6% ไม่มีค่าลบ
g.scale.z*=1+speed*.06+spirit*.02;
```

| สถานะ | y เดิม | y ใหม่ | %เปลี่ยนใหม่ |
|-------|--------|--------|-------------|
| ไม่ฝึก | 1.00 | 1.00 | 0% |
| pure power | 1.06 | 1.02 | +2% |
| pure defense | 1.10 | 1.03 | +3% |
| pure speed | 0.95 | 1.00 | 0% |
| power+defense | 1.16 | 1.05 | +5% |
| ทุกอย่างเต็ม | 1.11 | 1.06 | +6% |

หลัก: training ทำให้มอนสเตอร์โตขึ้นเสมอ (ไม่มีการหด) แต่ไม่เกิน 6%

Acceptance gate:
- [ ] `npm run ci` ผ่าน (โดยเฉพาะ v80-monster-bighead-polish.mjs)
- [ ] มอนสเตอร์ฝึกเต็มทุกสาย สูงไม่เกิน base+6%
- [ ] ไม่มีค่าติดลบใน growth formula

---

### Phase 6: แก้ Wild/Boss scale + animation pulse

#### 6.1 Wild/Boss scale (game-v800.js:1831)

```js
// เดิม
mesh.scale.multiplyScalar(boss?1.08:1.12);

// ใหม่ — สลับให้ boss ใหญ่กว่า wild ธรรมดา
mesh.scale.multiplyScalar(boss?1.12:1.06);
```

| บทบาท | เดิม | ใหม่ |
|-------|------|------|
| Owned | 1.00 | 1.00 |
| Normal/Elite wild | 1.12 | 1.06 |
| Boss | 1.08 | 1.12 |

#### 6.2 animateMonster pulse (game-v800.js:1513–1538)

เป้า: ทุกธาตุ sy เพิ่มไม่เกิน ±0.03

```js
// เดิม — แต่ละ type มีค่าต่างกันมาก
case 'Flying': sy+=Math.abs(Math.sin(p*1.3))*0.12;  // สูงสุด +0.12
case 'Fire':   sy+=Math.abs(Math.sin(p*1.4))*0.08;
case 'Normal': sy+=Math.abs(pulse)*0.08;
// ...

// ใหม่ — ทุกธาตุใช้ช่วงเดียวกัน แตกต่างเฉพาะความถี่/เฟส
case 'Fire':   sy+=Math.abs(Math.sin(p*1.4))*0.03; break;
case 'Water':  sy+=Math.abs(Math.sin(p*0.8))*0.02; break;
case 'Electric': sy+=Math.abs(Math.cos(p*2.1))*0.03; break;
case 'Flying': sy+=Math.abs(Math.sin(p*1.3))*0.03; break;  // ลดจาก 0.12
case 'Ghost':  sy+=Math.sin(p*1.2)*0.03; break;  // ลดจาก 0.08
case 'Dragon': sy+=Math.abs(Math.sin(p*1.15))*0.03; break;  // ลดจาก 0.06
case 'Normal': sy+=Math.abs(pulse)*0.03; break;  // ลดจาก 0.08
case 'Fairy':  sy+=Math.abs(Math.sin(p*1.35))*0.03; break;  // ลดจาก 0.08
// และอื่น ๆ ลดทั้งหมดให้ ≤ 0.03
```

หลก: ความแตกต่างของ animation เห็นจากความถี่และเฟส ไม่ใช่จากขนาด

Acceptance gate:
- [ ] `npm run ci` ผ่าน
- [ ] Boss สูงกว่า normal wild
- [ ] ทุกธาตุ animation sy ≤ 0.03
- [ ] มอนสเตอร์กระพริวไม่สูงกว่ามอนสเตอร์ยืนนิ่ง

---

### Phase 7: ทดสอบ + Legacy alignment

#### 7.1 สร้าง height balance test

ไฟล์ใหม่ `tests/v80-height-balance.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ตรวจ base geometry constants
const provider = readFileSync('asset-presentation/providers/procedural-bighead-monster.mjs', 'utf8');
assert.match(provider, /h:\s*0\.84.*y:\s*0\.48/, 'slime body h=0.84 y=0.48');
assert.match(provider, /0\.56\s*\*\s*scale.*0\.70\s*\*\s*scale/, 'bird body h=0.56');
assert.match(provider, /0\.42\s*\*\s*scale.*0\.50\s*\*\s*scale/, 'serpent head h=0.42');

// ตรวจ path.scale ไม่เกิน 1.06
const game = readFileSync('game-v800.js', 'utf8');
const scaleMatches = [...game.matchAll(/scale:(1\.\d+)/g)];
for (const m of scaleMatches) {
  assert.ok(parseFloat(m[1]) <= 1.06, `path.scale ${m[1]} > 1.06`);
}

// ตรวจ growth formula ไม่มีค่าลบ
assert.match(game, /power\s*\*\s*0\.02\s*\+\s*defense\s*\*\s*0\.03/, 'growth y formula updated');
assert.ok(!game.includes('- speed * 0.05'), 'no negative speed in growth');

// ตรวจ boss > wild
assert.match(game, /boss\?1\.12:1\.06/, 'boss scale > wild scale');

// ตรวจ Baby scale
assert.match(game, /Baby'\)\?\.85:1/, 'Baby scale = 0.85');
```

#### 7.2 Mutant test `tests/v80-height-balance-mutants.mjs`

```js
// พิสูจน์ว่าถ้า bird body height กลับ 0.80 → test fail
// พิสูจน์ว่าถ้า magma_bear scale.y < 0.94 → test fail
// พิสูจน์ว่าถ้า growth มีค่าลบ → test fail
// พิสูจน์ว่าถ้า boss scale < wild scale → test fail
```

#### 7.3 Legacy fallback alignment

ปรับ `makeAnimalBase` (game-v800.js:688–706) ให้สูงใกล้เคียง Bighead ใหม่:

```js
// Quadruped: ลด body length และ head size
body: capsuleGeometry(.24, .42, ...)  // .26→.24, .50→.42
body.position.y = .56  // .62→.56
head: sphereGeometry(.26, ...)  // .30→.26
head.position.y = .88  // 1.0→.88
// ผล: ~1.14 (ลดจาก 1.30)

// Bird: ลด body และ head
body: sphereGeometry(.36, ...)  // .42→.36
body.position.y = .58  // .66→.58
head: sphereGeometry(.24, ...)  // .28→.24
head.position.y = .92  // 1.08→.92
// ผล: ~1.16 (ลดจาก 1.36)

// Serpent: ยก head
head.position.y = .92  // 1.0→.92
body: capsuleGeometry(.25, .50, ...)  // .27→.25, .62→.50
// ผล: ~1.16 (ลดจาก 1.30)
```

Acceptance gate:
- [ ] `npm run ci` ผ่าน (รวม test ใหม่)
- [ ] balance-sim CR เปลี่ยน < 2%
- [ ] balance-validation R5, D1 ผ่าน
- [ ] Legacy quadruped สูง ≤ 1.18
- [ ] Legacy bird สูง ≤ 1.20

---

## 4. ลำดับการทำงาน

| Phase | แก้ไฟล์ | ผู้ทำ | การตรวจ |
|-------|--------|------|---------|
| 1: Bighead base geometry | procedural-bighead-monster.mjs | Cursor | Hermes + ci |
| 2: path.scale แคบลง | game-v800.js | Cursor | Hermes + ci |
| 3: Baby scale 0.85 | game-v800.js | Cursor | Hermes + ci |
| 4: per-species scale.y | game-v800.js + provider | Cursor | Hermes + ci |
| 5: applyVisualGrowth formula | monster-mark.mjs + game-v800.js | Cursor | Hermes + ci |
| 6: Wild/Boss scale + animation | game-v800.js | Cursor | Hermes + ci |
| 7: Tests + Legacy alignment | tests/*.mjs + game-v800.js | Cursor | Hermes + ci |

ทำตามลำดับ 1→7 แต่ละ phase = 1 PR (squash merge, ทำเสร็จ merge แล้วทำต่อ)

---

## 5. ข้อควรระวัง

1. **Decoration positions** — การยก/ลด head และ body ทำให้ ear, horn, crown, muzzle, tail, wing, cheek, paw ต้องปรับตาม ใช้ ratio = new_y / old_y
2. **MONSTER_ANCHOR_Y** — hitText=1.35, label=2.15, bossLabel=2.55 อ้างอิงความสูง ถ้าเปลี่ยน base มาก ต้องปรับ
3. **BIGHEAD_MARK** — crestY=1.40, bossCrestY=1.78 ต้องปรับตามความสูงใหม่
4. **baseScale clone** — animateMonster ใช้ mesh.userData.baseScale (line 1507) เป็นค่าอ้างอิง ถ้า scale เปลี่ยน baseScale ต้องเก็บค่าใหม่
5. **Bighead provider baseScale** — provider:559 เก็บ visual.userData.baseScale ถ้า visual.scale เปลี่ยน ต้องอัปเดต
6. **boss 1.12 × big** — magma_bear boss = 1.15 × 1.06 × 1.12 = 1.37 ยังอยู่ในเกณฑ์ ≤ 1.50
7. **ทดสอบในเบราว์เซอร์** — เปรียบเทียบภาพก่อน/หลังที่ http://127.0.0.1:8081
8. **balance-config.mjs** — ตรวจว่า gameplay stat ไม่ขึ้นกับ visual scale
9. **save-schema** — visual scale เป็น runtime ไม่ save ไม่ต้อง bump save schema
10. **markRingScale** — ใช้ formScale × lifeScale ต้องตรวจว่าค่าใหม่สอดคล้องกัน

---

## 6. ผลลัพธ์ที่คาดหวัง

หลังแก้เสร็จทุก Phase:

```
                 Base   path  Baby  species  growth  wild   anim   รวม
Slime (Adult)    1.01 × 1.03 × 1.0 × 1.00  × 1.00 × 1.00 × 1.03 = 1.07
Quadruped avg    1.08 × 1.03 × 1.0 × 1.00  × 1.00 × 1.00 × 1.03 = 1.15
Bird (Flying)    1.13 × 1.03 × 1.0 × 1.00  × 1.00 × 1.06 × 1.03 = 1.27
Serpent          1.01 × 1.06 × 1.0 × 0.98  × 1.00 × 1.00 × 1.03 = 1.08
magma_bear boss  1.08 × 1.00 × 1.0 × 1.06  × 1.06 × 1.12 × 1.03 = 1.40
```

ช่วงความสูงรวม: 1.07 → 1.40 = แตกต่าง 31% (ลดจาก 104%)
Owned ไม่ฝึก: 1.01 → 1.20 = แตกต่าง 19% (ลดจาก 28%)
Training เพิ่มสูงสูงสุด 6% (ลดจาก 16%)
Boss ใหญ่กว่า wild ธรรมดา (สลับจากเดิมที่เตี้ยกว่า)