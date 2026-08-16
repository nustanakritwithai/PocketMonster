# Monster Life RPG — V8.0 UX/UI Master Plan
## แผนออกแบบการแสดงผลและการโต้ตอบระบบ Progression Core ทั้งหมด

> สร้าง: 2026-08-16
> เวอร์ชัน: 2.0 (ปรับปรุงรายละเอียดเต็ม)
> สถานะ: ระบบ logic ทำงานครบ (V7.2-V8.0 integration PR #5-#14 merged)
> เป้าหมาย: ออกแบบ UI ให้ผู้เล่นมองเห็นและโต้ตอบกับระบบใหม่ทั้งหมดได้ครบ
> ไฟล์ที่กระทบ: game-v710.js (2087 บรรทัด), style-v710.css (193 บรรทัด), v710.html (209 บรรทัด)

---

## สารบัญ

1. หลักออกแบบ
2. สถานะปัจจุบัน — อะไรทำงานแล้ว / อะไรยังไม่แสดง
3. โครงสร้าง Manager ใหม่ (6 แท็บ)
4. แท็บที่ 1: มอน (Collection) — ปรับปรุงการ์ดเดิม
5. แท็บที่ 2: ฝึก (Training) — ใหม่
6. แท็บที่ 3: สกิล (Skills) — ใหม่
7. แท็บที่ 4: อุปกรณ์ (Equipment) — ใหม่
8. แท็บที่ 5: Evolution — ปรับปรุง
9. แท็บที่ 6: Breeding — ปรับปรุง
10. In-Game Popups (นอก Manager)
11. สถานะเกม (Game State) ที่เพิ่ม
12. ลำดับการทำ (Implementation Phases)
13. ไฟล์ที่กระทบและขอบเขตการแก้
14. การตรวจรับ (Acceptance Gates)
15. ข้อควรระวัง (Pitfalls)
16. ทดสอบด้วยมือ (Manual Smoke Test)
17. สถาปัตยกรรม CSS และจุดเสี่ยง
18. Accessibility & Touch
19. ตัวอย่างโค้ดเต็ม (Reference Implementation)

---

## 1. หลักออกแบบ (Design Principles)

### 1.1 ข้อจำกัดเฉพาะ
- จอมือถือแนวนอน Full Screen (landscape, 320-960px width, 360-560px height)
- ภาษาไทยเป็นหลัก — คำสั้นกระชับ ไม่เกิน 1 บรรทัดต่อ label
- ไม่มี icon font ไม่มี SVG sprite — ใช้ emoji/unicode เท่านั้น
- ไม่มี framework CSS — เขียน vanilla CSS ต่อจากที่มี
- Touch-first: ปุ่มขั้นต่ำ 44x44px (var(--touch-min) มีอยู่แล้วใน CSS)
- ไม่ใช้ hover เป็นหลัก — ทุก action ต้องแตะได้
- backdrop-filter: blur สำหรับ panel ทับบนเกม (มีอยู่แล้ว)

### 1.2 หลักจัดลำดับข้อมูล (Progressive Disclosure)
- ภาพรวมก่อน → แตะเพื่อดูรายละเอียด
- ตัวเลขสำคัญ: ตัวหนา สีขาว (#fff)
- ตัวเลขรอง: สี #cbd5e1
- ตัวเลขจาง/ปิดการใช้งาน: สี #94a3b8
- แถบความคืบหน้า (progress bar) ใช้สีตามประเภท ไม่ใช้สีเดียวทั้งหมด
- สีสถานะสอดคล้องกันทุกหน้า: เขียว=ดี, เหลือง=ปกติ/เตือน, ส้ม=อันตราย, แดง=วิกฤต

### 1.3 โครงสร้างสี (Color System)

ใช้ต่อจากที่มีอยู่ ไม่สร้างใหม่:

```
พื้นหลัง:
  panel     #0f172a (manager-card, training-summary)
  card      #111827 (base card)
  item      #1f2937 / #162033 (monster card, line card)
  inner     #0b1220 (summary box, condition box)

ข้อความ:
  สำคัญ     #ffffff
  รอง       #cbd5e1
  จาง       #94a3b8

Accent (ปุ่ม/แท็บ):
  น้ำเงิน    #2563eb (default action, active tab)
  ม่วง      #7c3aed (party, evolution)
  เขียวเข้ม #166534 (food, heal)
  ส้ม       #d97706 (training, skill)
  ฟ้า       #0891b2 (care-rest)
  ชมพู      #db2777 (care-play, breeding)

สถานะ:
  ดี        #22c55e, #166534, #86efac, #dcfce7
  ปกติ      #334155, #cbd5e1
  เตือน     #facc15, #d97706, #a16207
  อันตราย   #ef4444, #991b1b, #881337, #fca5a5

ระบบเฉพาะ:
  Gene       #c4b5fd (ม่วงจาง) — เหมือนเดิม
  Training   #86efac (เขียวจาง) — เหมือนเดิม
  Condition  6 ระดับ (เขียว→ฟ้า→เทา→เหลือง→ส้ม→แดง)
  Skill      #c4b5fd (ม่วง) + 5 ระดับ mastery (จาง→เข้ม)
  Equipment  #fde68a (ทอง) — สำหรับไอเทมที่สวมใส่
```

### 1.4 ขนาดตัวอักษร (Typography Scale)

```
หัวข้อแท็บ/ซีก:     12px font-weight:900
หัวข้อการ์ด:         13px font-weight:700
ชื่อมอน:             12px font-weight:700
ข้อมูลมอน (meta):    10px
Needs chip:          9px
Gene line:           9px
Training pool:       9px (header 10px)
Skill chip:          8px
Equip slot:          8px (name 10px)
ปุ่ม:                10-11px font-weight:800
รายละเอียดย่อย:      8-9px color:#94a3b8
```

### 1.5 ระยะห่าง (Spacing)

```
การ์ด padding:       9-10px
ช่องไส้ระหว่างการ์ด:   7-8px (margin-bottom)
Chip gap:            4px
Bar height:          4-8px (ตามความสำคัญ)
Button gap:          4-5px
Section gap:         10-12px
```

---

## 2. สถานะปัจจุบัน — อะไรทำงานแล้ว / อะไรยังไม่แสดง

### 2.1 ระบบที่ logic ทำงานแล้ว (wired ใน PR #5-#14)

| ระบบ | ฟังก์ชันที่เรียกใช้ | สถานะ UI |
|------|-------------------|---------|
| Gene scale D-C-B-A-S | POTENTIAL_MOD + randomGenes | แสดงใน geneHTML (แต่เดิม 4 ตัว, ตอนนี้ 5 ตัว) |
| Training pool 5 สาย | addTrainingExp, setTraining | ปุ่ม 5 สาย + badge แสดง pool (แสดงรวม ไม่มี breakdown) |
| simulateLife | applyLifeSimulation → simulateLife | ไม่แสดงผลตรงๆ (ค่าเปลี่ยนใน background) |
| deriveCondition | deriveCondition | แสดงใน needsHTML เป็น chip (ไม่มีสี) |
| Battle growth | resolveBattleGrowth + applyBattleGrowth | แสดงใน msg (สั้นๆ) |
| Party share | resolvePartyShareGrowth | ไม่แสดง (เงียบ) |
| Food & care | resolveFeed, careRest, carePlay | ปุ่มให้อาหับ 3 ปุ่ม (ไม่มีปุ่ม care) |
| Skill mastery | computeSkillExp, addSkillExp | แสดง rank-up ใน msg (ไม่มีหน้าจอ skill) |
| Equipment | equipItem, getEquipmentFlat | คำนวณใน refreshStats (ไม่มีหน้าจอ equip) |
| Evolution history | appendHistory, evolutionHistory | ไม่แสดงประวัติ |
| Raising events | triggerRaisingEvent, resolveRaisingEvent | แสดงใน msg (ไม่มี popup) |
| Breeding canBreed | canBreedFn | ตรวจใน createEgg (ไม่แสดง warning ล่วงหน้า) |
| Birth history | appendHistory | ไม่แสดง |

### 2.2 สรุปช่องว่าง UI

- ไม่มีแท็บ Training / Skills / Equipment เลย
- การ์ดมอนไม่แสดง: condition สี, training breakdown, skill mastery, equipment slots
- ไม่มีปุ่ม Care (rest/play)
- ไม่มี popup สำหรับ raising events (แสดงใน msg แทน)
- ไม่มี notification สำหรับ mastery rank-up (แสดงใน msg แทน)
- ไม่มี condition indicator ใน party bar
- Evolution ไม่แสดง history / budget / identity lock
- Breeding ไม่แสดง gene inheritance preview / close-relative warning

---

## 3. โครงสร้าง Manager ใหม่ (6 แท็บ)

### 3.1 โครงปัจจุบัน (3 แท็บ)
```
[จัดการมอน] [Evolution] [Breeding / Egg]
```

### 3.2 โครงใหม่ (6 แท็บ)
```
[มอน] [ฝึก] [สกิล] [อุปกรณ์] [Evolution] [Breeding]
```

### 3.3 การเปลี่ยน HTML — v710.html บรรทัดที่ 124-128

แทนที่:
```html
<div class="manager-tabs">
  <button class="manager-tab active" data-manager-tab="collection">จัดการมอน</button>
  <button class="manager-tab" data-manager-tab="evolution">Evolution</button>
  <button class="manager-tab" data-manager-tab="breeding">Breeding / Egg</button>
</div>
```

ด้วย:
```html
<div class="manager-tabs">
  <button class="manager-tab active" data-manager-tab="collection">มอน</button>
  <button class="manager-tab" data-manager-tab="training">ฝึก</button>
  <button class="manager-tab" data-manager-tab="skills">สกิล</button>
  <button class="manager-tab" data-manager-tab="equipment">อุปกรณ์</button>
  <button class="manager-tab" data-manager-tab="evolution">Evolution</button>
  <button class="manager-tab" data-manager-tab="breeding">Breeding</button>
</div>
```

### 3.4 การเพิ่ม tab panes — v710.html หลังบรรทัดที่ 140

เพิ่มก่อน `<section class="evolution-panel...`:
```html
<!-- Training pane -->
<div class="manager-tab-pane" data-tab-pane="training">
  <div id="trainingPanel"></div>
</div>

<!-- Skills pane -->
<div class="manager-tab-pane" data-tab-pane="skills">
  <div id="skillsPanel"></div>
</div>

<!-- Equipment pane -->
<div class="manager-tab-pane" data-tab-pane="equipment">
  <div id="equipmentPanel"></div>
</div>
```

### 3.5 CSS สำหรับ 6 แท็บ

ปัจจุบัน `.manager-tabs` มี `flex-wrap:wrap` อยู่แล้ว แต่ 6 ปุ่มอาจล้นบนจอแคบ
เพิ่มใน style-v710.css:

```css
/* 6-tab manager — ปุ่มเล็กลงถ้าจอแคบ */
.manager-tabs{gap:5px}
.manager-tab{padding:7px 10px;font-size:11px}
@media(max-width:700px){
  .manager-tab{padding:6px 8px;font-size:10px}
}
@media(max-width:500px){
  .manager-tab{padding:5px 7px;font-size:9px;letter-spacing:-.3px}
}
```

### 3.6 JS — อัปเดต setManagerTab

ปัจจุบัน setManagerTab อยู่ที่บรรทัด 1067:
```js
function setManagerTab(tab='collection'){
  currentManagerTab=tab;
  document.querySelectorAll('[data-manager-tab]').forEach(b=>b.classList.toggle('active',b.dataset.managerTab===tab));
  document.querySelectorAll('[data-tab-pane]').forEach(p=>p.classList.toggle('active',p.dataset.tabPane===tab));
  if(tab==='collection')renderManager();
  if(tab==='evolution')renderEvolution();
  if(tab==='breeding')renderBreeding();
}
```

เพิ่ม:
```js
  if(tab==='training')renderTraining();
  if(tab==='skills')renderSkills();
  if(tab==='equipment')renderEquipment();
```

---

## 4. แท็บที่ 1: มอน (Collection) — ปรับปรุงการ์ดเดิม

### 4.1 ส่วนที่ต้องเพิ่มใน monsterCard (บรรทัด 1716-1722)

การ์ดมอนปัจจุบันประกอบด้วย:
1. monster-title (ชื่อ + type badges)
2. monster-meta (Lv, Gen, HP/ATK/DEF/SPD, Bond)
3. needsHTML (4 chips: หิว/พลัง/อารมณ์/สภาพ)
4. geneHTML (Gene HP/ATK/DEF/SPD/Trait)
5. training-badge (เฉพาะ storage: Training focus + pool + lvEXP)
6. feed-actions (3 ปุ่ม: โปรตีน/สุขภาพ/ของโปรด)
7. train-actions (5 ปุ่ม: Power/Defense/Speed/Technique/Spirit — เฉพาะ storage)
8. manager-actions (ปุ่ม: เข้า Party/ฝาก Storage, ปล่อย Ranch, ดู Evolution)

ส่วนที่ต้องเพิ่ม/แก้:

#### 4.1.1 needsHTML — เพิ่มสี Condition
ปัจจุบัน (บรรทัด 1714):
```js
function needsHTML(inst){return `<div class="need-row">
  <div class="need-chip">หิว <strong>${fmt(inst.hunger)}</strong></div>
  <div class="need-chip">พลัง <strong>${fmt(inst.energy)}</strong></div>
  <div class="need-chip">อารมณ์ <strong>${fmt(inst.mood)}</strong></div>
  <div class="need-chip">สภาพ <strong>${deriveCondition(inst)||'normal'}</strong></div>
</div>`;}
```

ใหม่:
```js
function needsHTML(inst){
  syncToBodyMind(inst);
  const cond=deriveCondition(inst)||'normal';
  return `<div class="need-row">
    <div class="need-chip">หิว <strong>${fmt(inst.hunger)}</strong></div>
    <div class="need-chip">พลัง <strong>${fmt(inst.energy)}</strong></div>
    <div class="need-chip">อารมณ์ <strong>${fmt(inst.mood)}</strong></div>
    <div class="need-chip cond-${cond}">สภาพ <strong>${cond}</strong></div>
  </div>`;
}
```

ตารางสี Condition chip:
| Band | สีพื้นหลัง | สีตัวอักษร | เงื่อนไข score |
|------|----------|-----------|--------------|
| excellent | #166534 | #dcfce7 | ≥88 |
| good | #1d4ed8 | #bfdbfe | ≥72 |
| normal | #334155 | #cbd5e1 | ≥52 |
| tired | #a16207 | #fef3c7 | ≥36 |
| fatigued | #c2410c | #fed7aa | ≥20 |
| bad | #991b1b | #fee2e2 | <20 |

CSS:
```css
.need-chip.cond-excellent{background:#166534;color:#dcfce7}
.need-chip.cond-good{background:#1d4ed8;color:#bfdbfe}
.need-chip.cond-normal{background:#334155;color:#cbd5e1}
.need-chip.cond-tired{background:#a16207;color:#fef3c7}
.need-chip.cond-fatigued{background:#c2410c;color:#fed7aa}
.need-chip.cond-bad{background:#991b1b;color:#fee2e2}
```

#### 4.1.2 training-badge → trainingPoolHTML — เพิ่ม breakdown 5 สาย

ปัจจุบัน (ใน monsterCard บรรทัด 1718):
```js
${where==='storage'?`<div class="training-badge">Training ${TRAIN_FOCUS[inst.trainingFocus]||'Power'} • Pool ${instTrainingUsed(inst)}/${40+8*inst.level} • LvEXP ${Math.floor(inst.trainingExp||0)}/${trainingNeed(inst.level)}</div>`:''}
```

ใหม่ — แทนด้วย trainingPoolHTML:
```js
${where==='storage'?trainingPoolHTML(inst):''}
```

ฟังก์ชันใหม่:
```js
function trainingPoolHTML(inst){
  const used=instTrainingUsed(inst);
  const cap=40+8*inst.level;
  const pct=cap>0?Math.round(used/cap*100):0;
  const focus=inst.trainingFocus||'power';
  const linesHTML=TRAINING_LINES.map(l=>{
    const val=inst.training?.[l]||0;
    const maxBand=BALANCE_CONFIG.training.diminishing.find(b=>val<b.upTo)||{upTo:200};
    const linePct=Math.min(100,Math.round(val/maxBand.upTo*100));
    const isFocus=l===focus;
    return `<div class="pool-line ${isFocus?'focus':''}">
      <span class="line-name">${l[0].toUpperCase()+l.slice(1)}</span>
      <div class="line-bar"><div class="line-fill line-${l}" style="width:${linePct}%"></div></div>
      <span class="line-val">${val}</span>
    </div>`;
  }).join('');
  return `<div class="training-pool">
    <div class="pool-header">
      <span>Training Pool</span>
      <span class="pool-count">${used} / ${cap}</span>
    </div>
    <div class="pool-bar"><div class="pool-bar-fill" style="width:${pct}%"></div></div>
    <div class="pool-lines">${linesHTML}</div>
  </div>`;
}
```

CSS:
```css
.training-pool{margin-top:6px;font-size:9px}
.pool-header{display:flex;justify-content:space-between;color:#86efac;margin-bottom:3px}
.pool-header .pool-count{color:#fff;font-weight:700}
.pool-bar{height:6px;background:#111827;border-radius:999px;overflow:hidden}
.pool-bar-fill{height:100%;background:linear-gradient(90deg,#22c55e,#84cc16);transition:width .3s}
.pool-lines{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;margin-top:5px}
.pool-line{display:flex;align-items:center;gap:4px;font-size:8px}
.pool-line.focus .line-name{color:#facc15;font-weight:700}
.line-name{width:48px;color:#94a3b8;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.line-bar{flex:1;height:4px;background:#111827;border-radius:999px;overflow:hidden;min-width:30px}
.line-fill{height:100%;transition:width .3s;border-radius:999px}
.line-fill.line-power{background:#ef4444}
.line-fill.line-defense{background:#3b82f6}
.line-fill.line-speed{background:#22c55e}
.line-fill.line-technique{background:#a855f7}
.line-fill.line-spirit{background:#f59e0b}
.line-val{width:24px;text-align:right;color:#cbd5e1;flex-shrink:0;font-weight:600}
```

#### 4.1.3 skillsMiniHTML — แสดงสกิล + mastery rank (ใหม่)

```js
const MASTERY_DOTS={novice:'●○○○○',familiar:'●●○○○',skilled:'●●●○○',expert:'●●●●○',master:'●●●●●'};
const MASTERY_TH={novice:'เริ่มต้น',familiar:'คุ้นเคย',skilled:'ชำนาญ',expert:'เชี่ยวชาญ',master:'ระดับปรมาจารย์'};

function skillsMiniHTML(inst){
  if(!Array.isArray(inst.skills)||!inst.skills.length)return '';
  return `<div class="skill-mini">${inst.skills.map(s=>{
    const rank=s.masteryRank||'novice';
    return `<span class="skill-chip ${rank}" title="${MASTERY_TH[rank]}">${s.skillId} ${MASTERY_DOTS[rank]}</span>`;
  }).join('')}</div>`;
}
```

CSS:
```css
.skill-mini{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}
.skill-chip{font-size:8px;border-radius:6px;padding:2px 5px;color:#c4b5fd;display:inline-flex;align-items:center;gap:3px;white-space:nowrap}
.skill-chip.master{background:#422006;color:#fde68a;border:1px solid #f59e0b33}
.skill-chip.expert{background:#4c1d95;color:#ddd6fe;border:1px solid #7c3aed33}
.skill-chip.skilled{background:#1e3a8a;color:#bfdbfe;border:1px solid #2563eb33}
.skill-chip.familiar{background:#334155;color:#cbd5e1}
.skill-chip.novice{background:#1f2937;color:#94a3b8}
```

#### 4.1.4 equipMiniHTML — แสดงช่องอุปกรณ์ (ใหม่)

```js
function equipMiniHTML(inst){
  if(!inst.equipment)return '';
  const slots=EQUIPMENT_SLOTS;
  const hasAny=slots.some(s=>inst.equipment[s]);
  if(!hasAny)return '';
  return `<div class="equip-mini">${slots.map(s=>{
    const item=inst.equipment[s];
    return `<span class="equip-slot ${item?'filled':''}">${item?item.id:'—'}</span>`;
  }).join('')}</div>`;
}
```

CSS:
```css
.equip-mini{display:flex;gap:3px;margin-top:4px;font-size:8px}
.equip-slot{flex:1;background:#1f2937;border-radius:6px;padding:2px 4px;text-align:center;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.equip-slot.filled{color:#fde68a;background:#422006;border:1px solid #f59e0b22}
```

#### 4.1.5 careActionsHTML — ปุ่ม Care (ใหม่)

```js
function careActionsHTML(inst,where){
  if(where!=='storage')return '';
  return `<div class="care-actions">
    <button data-care="rest">💤 พักผ่อน</button>
    <button data-care="play">🎾 เล่นด้วย</button>
  </div>`;
}
```

CSS:
```css
.care-actions{display:flex;gap:4px;margin-top:4px}
.care-actions button{border:0;border-radius:8px;padding:6px 7px;color:#fff;font-weight:800;font-size:9px;cursor:pointer;flex:1}
.care-actions button[data-care="rest"]{background:#0891b2}
.care-actions button[data-care="play"]{background:#db2777}
.care-actions button:active{transform:scale(.97)}
```

Wire ใน monsterCard:
```js
wrap.querySelectorAll('[data-care]').forEach(b=>b.onclick=()=>careAction(inst.instanceId,b.dataset.care));
```

#### 4.1.6 การ์ดมอนฉบับเต็ม — ลำดับส่วนใหม่

```
┌─────────────────────────────────────────────────┬──────────────┐
│ 🔥 Flameling Lv.5 • Juvenile • Gen 1            │              │
│ HP 45/45 • ATK 22 • DEF 14 • SPD 18 • Bond 30   │  [เข้า Party] │
│                                                 │  [ปล่อย Ranch]│
│ [หิว 78] [พลัง 82] [อารมณ์ 72] [สภาพ Good]        │  [ดู Evolution]│
│                                                 │              │
│ Gene HP B • ATK A • DEF C • SPD B               │              │
│                                                 │              │
│ Training Pool              120 / 200            │              │
│ [████████████████████░░░░░░░░░░░░] 60%          │              │
│   Power*    ████░░ 80                           │              │
│   Defense   ██░░░░ 40                           │              │
│   Speed     ░░░░░░  0                           │              │
│   Technique ░░░░░░  0                           │              │
│   Spirit    ░░░░░░  0                           │              │
│  (* = สายที่เลือก)                                │              │
│                                                 │              │
│ Skills: [Ember Blast ●●●○○] [Flame Shield ●●○○○]│              │
│ Equip:  [—] [Power Ring] [—]                    │              │
│                                                 │              │
│ [โปรตีน] [สุขภาพ] [ของโปรด]                      │              │
│ [💤 พักผ่อน] [🎾 เล่นด้วย]                         │              │
│ [Power] [Defense] [Speed] [Technique] [Spirit]  │              │
└─────────────────────────────────────────────────┴──────────────┘
```

ลำดับใน wrap.innerHTML:
1. monster-title (เดิม)
2. monster-meta (เดิม)
3. needsHTML (แก้ — เพิ่มสี condition)
4. geneHTML (เดิม)
5. trainingPoolHTML (ใหม่ — แทน training-badge)
6. skillsMiniHTML (ใหม่)
7. equipMiniHTML (ใหม่)
8. feed-actions (เดิม)
9. careActionsHTML (ใหม่)
10. train-actions (เดิม — 5 ปุ่ม)

---

## 5. แท็บที่ 2: ฝึก (Training) — ใหม่

### 5.1 โครงหน้าจอ

```
┌─────────────────────────────────────────────────────────────────┐
│  เลือกมอน: [Flameling Lv.5 ▼]                                   │
│                                                                 │
│  ┌─ Training Pool ──────────────────────────────────────────┐  │
│  │  120 / 200                                    60%        │  │
│  │  [████████████████████░░░░░░░░░░░░]                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ Power (เลือก) ────────────────────────────────────────┐    │
│  │  ค่าปัจจุบัน: 80          แถบ: 0.8x (51-100)              │    │
│  │  [████████████████████░░░░░░░░░░░░] 80/100              │    │
│  │  Aptitude: ★★★☆☆ (1.0x)                                │    │
│  │  [ฝึก Power +~6]                                         │    │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ Defense ──────────────────────────────────────────────┐    │
│  │  ค่าปัจจุบัน: 40          แถบ: 1.0x (0-50)                │    │
│  │  [████████░░░░░░░░░░░░░░░░░░] 40/50                     │    │
│  │  Aptitude: ★★★★☆ (1.05x)                               │    │
│  │  [ฝึก Defense +~7]                                       │    │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  (ซ้ำสำหรับ Speed / Technique / Spirit)                         │
│                                                                 │
│  ┌─ สภาพปัจจุบัน ────────────────────────────────────────────┐  │
│  │  สภาพ: Good → 1.05x training gain                        │  │
│  │  Training Food: ไม่มี buff                                 │  │
│  │  Diminishing: ใช่ — ค่ามาก = gain ลดลง (1.0→0.8→0.6→0.4→0)│  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 HTML
```html
<div class="manager-tab-pane" data-tab-pane="training">
  <div id="trainingPanel"></div>
</div>
```

### 5.3 CSS
```css
.training-panel{padding:4px}
.monster-selector{display:flex;gap:8px;align-items:center;margin-bottom:12px}
.monster-selector select{
  background:#1f2937;color:#fff;border:1px solid #ffffff22;
  border-radius:10px;padding:8px 10px;font-size:12px;font-weight:700;flex:1;
  appearance:auto;-webkit-appearance:auto
}
.monster-selector select:focus{outline:2px solid #2563eb}

.training-summary{
  background:#0b1220;border:1px solid #ffffff18;border-radius:14px;
  padding:10px;margin-bottom:10px
}

.training-line-card{
  background:#162033;border:1px solid #ffffff14;border-radius:12px;
  padding:10px;margin-bottom:8px
}
.training-line-card.focus-active{
  border-color:#facc1544;box-shadow:0 0 0 1px #facc1522 inset
}

.training-line-header{
  display:flex;justify-content:space-between;align-items:center;margin-bottom:6px
}
.training-line-header b{font-size:13px;color:#fff}
.training-line-header .focus-tag{
  font-size:8px;background:#d97706;color:#fff;border-radius:999px;padding:2px 6px
}

.training-line-stats{
  display:flex;gap:10px;font-size:10px;color:#94a3b8;margin-bottom:5px;flex-wrap:wrap
}
.training-line-stats .dim{color:#facc15;font-weight:600}
.training-line-stats .apt{color:#86efac}
.training-line-stats strong{color:#fff}

.line-progress{height:8px;background:#111827;border-radius:999px;overflow:hidden;margin:4px 0}
.line-progress-fill{height:100%;border-radius:999px;transition:width .3s}
.line-progress-fill.power{background:#ef4444}
.line-progress-fill.defense{background:#3b82f6}
.line-progress-fill.speed{background:#22c55e}
.line-progress-fill.technique{background:#a855f7}
.line-progress-fill.spirit{background:#f59e0b}

.train-btn{
  border:0;border-radius:10px;padding:8px 14px;color:#fff;
  font-weight:900;font-size:11px;cursor:pointer;background:#d97706;
  width:100%;margin-top:6px;min-height:40px
}
.train-btn:active{transform:scale(.97)}
.train-btn:disabled{background:#334155;color:#64748b;cursor:not-allowed}

.condition-box{
  background:#0b1220;border:1px solid #ffffff18;border-radius:12px;
  padding:10px;margin-top:10px;font-size:11px;line-height:1.6
}
.condition-box strong{color:#fff}

.apt-stars{color:#facc15;letter-spacing:2px;font-size:11px}
.apt-stars .empty{color:#334155}

.training-info{
  font-size:9px;color:#64748b;margin-top:6px;line-height:1.4;
  padding:6px;background:#0b1220;border-radius:8px
}
```

### 5.4 JS — renderTraining()

```js
function renderTraining(){
  const panel=el('trainingPanel');
  if(!panel)return;

  const allIds=[...state.party.filter(Boolean),...state.storage];
  if(!allIds.length){
    panel.innerHTML='<div class="manager-empty">ยังไม่มีมอน — ไปจับมอนก่อน</div>';
    return;
  }

  const selectedId=state.trainingSelectedId||allIds[0];
  const inst=getInst(selectedId);
  if(!inst){
    state.trainingSelectedId=null;
    panel.innerHTML='<div class="manager-empty">เลือกมอนไม่ถูกต้อง</div>';
    return;
  }

  // คำนวณ pool
  const used=instTrainingUsed(inst);
  const cap=40+8*inst.level;
  const poolPct=cap>0?Math.round(used/cap*100):0;
  const poolFull=used>=cap;

  // คำนวณ condition
  syncToBodyMind(inst);
  const cond=deriveCondition(inst)||'normal';
  const condMult=BALANCE_CONFIG.condition[cond]?.training??1.0;
  const condTH={excellent:'ดีเยี่ยม',good:'ดี',normal:'ปกติ',tired:'เหนื่อย',fatigued:'อ่อนเพลีย',bad:'แย่'};

  // ตรวจ training food buff
  const hasBuff=(inst.activeBuffs||[]).some(b=>b.expiresAt>Date.now());

  // สร้างการ์ด 5 สาย
  const linesHTML=TRAINING_LINES.map(line=>{
    const val=inst.training?.[line]||0;
    const dim=balanceFormulas.diminishingMultiplier(val);
    const apt=inst.aptitude?.[line]||3;
    const aptMult=balanceFormulas.aptitudeMultiplier(apt);
    const stars='★'.repeat(apt)+'☆'.repeat(5-apt);

    // หาแถบ diminishing ปัจจุบัน
    const bands=BALANCE_CONFIG.training.diminishing;
    const currentBand=bands.find(b=>val<b.upTo)||{upTo:200,multiplier:0};
    const bandLabel=currentBand.multiplier===1.0?'0-50':
                    currentBand.multiplier===0.8?'51-100':
                    currentBand.multiplier===0.6?'101-150':
                    currentBand.multiplier===0.4?'151-200':'200+';

    const valPct=Math.min(100,Math.round(val/currentBand.upTo*100));
    const isFocus=line===(inst.trainingFocus||'power');
    const gain=Math.round(trainingNeed(inst.level)*0.15*dim*aptMult*condMult);

    return `<div class="training-line-card ${isFocus?'focus-active':''}">
      <div class="training-line-header">
        <b>${line[0].toUpperCase()+line.slice(1)}</b>
        ${isFocus?'<span class="focus-tag">เลือกอยู่</span>':''}
      </div>
      <div class="training-line-stats">
        <span>ค่า: <strong>${val}</strong></span>
        <span class="dim">ลดลด: ${dim}x (${bandLabel})</span>
        <span class="apt">Apt: <span class="apt-stars">${stars}</span> (${aptMult}x)</span>
      </div>
      <div class="line-progress"><div class="line-progress-fill ${line}" style="width:${valPct}%"></div></div>
      <button class="train-btn" onclick="setTraining('${inst.instanceId}','${line}')" ${poolFull?'disabled':''}>
        ${poolFull?'Pool เต็ม':`ฝึก ${line} +${gain}`}
      </button>
    </div>`;
  }).join('');

  panel.innerHTML=`<div class="training-panel">
    <div class="monster-selector">
      <select onchange="state.trainingSelectedId=this.value;renderTraining()">
        ${allIds.map(id=>{
          const m=getInst(id);
          if(!m)return '';
          return `<option value="${id}" ${id===selectedId?'selected':''}>${displayName(m)} Lv.${m.level} • ${m.lifeStage}</option>`;
        }).join('')}
      </select>
    </div>
    <div class="training-summary">
      <div class="pool-header">
        <span>Training Pool (รวม 5 สาย)</span>
        <span class="pool-count">${used} / ${cap}</span>
      </div>
      <div class="pool-bar"><div class="pool-bar-fill" style="width:${poolPct}%"></div></div>
    </div>
    ${linesHTML}
    <div class="condition-box">
      <div>สภาพ: <strong class="cond-${cond}">${condTH[cond]||cond}</strong> → ${condMult}x training gain</div>
      <div>Training Food: ${hasBuff?'<span style="color:#fde68a">มี buff ทำงาน</span>':'ไม่มี buff'}</div>
    </div>
    <div class="training-info">
      Pool = 40 + 8xLevel (รวมทุกสาย) • ค่ามาก = gain ลดลง (diminishing return) •
      Aptitude ดาวเยอะ = gain เพิ่ม • สภาพดี = gain เพิ่ม
    </div>
  </div>`;
}
```

---

## 6. แท็บที่ 3: สกิล (Skills) — ใหม่

### 6.1 โครงหน้าจอ

```
┌─────────────────────────────────────────────────────────────────┐
│  เลือกมอน: [Flameling Lv.5 ▼]                                   │
│                                                                 │
│  ┌─ สกิลที่เรียนรู้ (2) ──────────────────────────────────────────┐ │
│  │                                                            │ │
│  │  ⚔ Ember Blast [Fire]                  ชำนาญ ●●●○○          │ │
│  │  EXP: 280/300 → เชี่ยวชาญ           [93%] ████████████░░    │ │
│  │  Power: 20 • CD: 3s • Type: Fire • STAB                    │ │
│  │  Raw Power bonus: +5%                                      │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │  🛡 Flame Shield [Fire]                คุ้นเคย ●●○○○          │ │
│  │  EXP: 85/100 → ชำนาญ              [85%] ██████████░░░░░    │ │
│  │  Shield 30% • 5s • Type: Fire                              │ │
│  │  Raw Power bonus: +2%                                      │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ สกิลที่ยังไม่เรียน (1) ──────────────────────────────────────┐ │
│  │  🔥 Inferno Strike [Fire]                                  │ │
│  │  Power: 35 • CD: 6s • Area • Type: Fire                    │ │
│  │  ใช้สกิลในการต่อสู้เพื่อสะสม EXP → เรียนรู้อัตโนมัติ              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ หลัก Mastery ─────────────────────────────────────────────┐  │
│  │  ระดับ: เริ่มต้น → คุ้นเคย → ชำนาญ → เชี่ยวชาญ → ปรมาจารย์       │  │
│  │  EXP สะสม: 100 / 300 / 700 / 1500                          │  │
│  │  Power bonus: +0% / +2% / +5% / +8% / +11%                 │  │
│  │  ใช้สกิลซ้ำๆ ใน battle เดียว = EXP ลดลง (novelty decay)      │  │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 CSS
```css
.skills-panel{padding:4px}
.skills-section-title{
  font-size:13px;margin:12px 0 6px;color:#fff;font-weight:700;
  border-bottom:1px solid #ffffff14;padding-bottom:4px
}

.skill-card{
  background:#162033;border:1px solid #ffffff14;border-radius:12px;
  padding:10px;margin-bottom:8px
}
.skill-card-header{
  display:flex;justify-content:space-between;align-items:center;
  margin-bottom:5px;gap:6px
}
.skill-card-header b{font-size:12px;color:#fff}
.skill-card-header .type-badge{font-size:8px;padding:2px 5px;min-width:30px}

.skill-mastery-label{
  font-size:10px;color:#c4b5fd;font-weight:700;white-space:nowrap
}
.skill-mastery-label.master{color:#fde68a}
.skill-mastery-label.expert{color:#ddd6fe}
.skill-mastery-label.skilled{color:#bfdbfe}
.skill-mastery-label.familiar{color:#cbd5e1}
.skill-mastery-label.novice{color:#94a3b8}

.skill-mastery-bar{
  height:6px;background:#111827;border-radius:999px;overflow:hidden;margin:4px 0
}
.skill-mastery-fill{
  height:100%;border-radius:999px;transition:width .3s
}
.skill-mastery-fill.master{background:linear-gradient(90deg,#f59e0b,#fbbf24)}
.skill-mastery-fill.expert{background:linear-gradient(90deg,#7c3aed,#a855f7)}
.skill-mastery-fill.skilled{background:linear-gradient(90deg,#2563eb,#3b82f6)}
.skill-mastery-fill.familiar{background:linear-gradient(90deg,#475569,#64748b)}
.skill-mastery-fill.novice{background:linear-gradient(90deg,#334155,#475569)}

.skill-detail{font-size:9px;color:#94a3b8;margin-top:3px;line-height:1.5}
.skill-detail .power-bonus{color:#86efac;font-weight:600}
.skill-exp-text{font-size:9px;color:#94a3b8;margin:2px 0}
.skill-exp-text strong{color:#fff}

.skill-locked{opacity:.6}
.skill-locked .skill-card-header b{color:#94a3b8}
.skill-req{font-size:9px;color:#fca5a5;margin-top:3px}
.skill-req .ok{color:#86efac}

.skill-help{
  font-size:9px;color:#64748b;margin-top:12px;padding:8px;
  background:#0b1220;border-radius:8px;line-height:1.5
}
.skill-help b{color:#94a3b8}
```

### 6.3 JS — renderSkills()

ต้อง import `SKILL_MASTERY` จาก balance-config.mjs เพิ่มเติม:
```js
import { BALANCE_CONFIG, BALANCE_SCHEMA_VERSION, SKILL_MASTERY } from './balance-config.mjs';
```

```js
const MASTERY_ORDER=['novice','familiar','skilled','expert','master'];
const MASTERY_TH={novice:'เริ่มต้น',familiar:'คุ้นเคย',skilled:'ชำนาญ',expert:'เชี่ยวชาญ',master:'ปรมาจารย์'};
const MASTERY_NEXT_TH={novice:'คุ้นเคย',familiar:'ชำนาญ',skilled:'เชี่ยวชาญ',expert:'ปรมาจารย์'};
const MASTERY_DOTS={novice:'●○○○○',familiar:'●●○○○',skilled:'●●●○○',expert:'●●●●○',master:'●●●●●'};

function renderSkills(){
  const panel=el('skillsPanel');
  if(!panel)return;

  const allIds=[...state.party.filter(Boolean),...state.storage];
  if(!allIds.length){
    panel.innerHTML='<div class="manager-empty">ยังไม่มีมอน — ไปจับมอนก่อน</div>';
    return;
  }

  const selectedId=state.skillsSelectedId||allIds[0];
  const inst=getInst(selectedId);
  if(!inst){
    state.skillsSelectedId=null;
    panel.innerHTML='<div class="manager-empty">เลือกมอนไม่ถูกต้อง</div>';
    return;
  }

  const speciesSkills=getMonsterSkills(inst);
  const thresholds=BALANCE_CONFIG.skill.masteryThresholds;
  const thresholdList={novice:0,familiar:100,skilled:300,expert:700,master:1500};

  // สกิลที่เรียนแล้ว
  const learnedHTML=(inst.skills||[]).map(s=>{
    const def=speciesSkills.find(d=>d.name===s.skillId)||{};
    const rank=s.masteryRank||'novice';
    const exp=s.masteryExp||0;
    const orderIdx=MASTERY_ORDER.indexOf(rank);
    const isMaster=rank==='master';
    const nextRank=MASTERY_ORDER[orderIdx+1];
    const nextThresh=thresholds[nextRank];
    const prevThresh=thresholdList[rank];
    const expInBand=exp-prevThresh;
    const bandSize=nextThresh?(nextThresh-prevThresh):1;
    const pct=isMaster?100:Math.min(100,Math.round(expInBand/bandSize*100));
    const rawPower=SKILL_MASTERY[rank]?.rawPower??0;
    const rawPowerPct=Math.round(rawPower*100);

    return `<div class="skill-card">
      <div class="skill-card-header">
        <b>${def.name||s.skillId} ${typeBadge(def.type||'Normal')}</b>
        <span class="skill-mastery-label ${rank}">${MASTERY_TH[rank]} ${MASTERY_DOTS[rank]}</span>
      </div>
      <div class="skill-exp-text">
        EXP: <strong>${exp}</strong>${nextThresh?`/${nextThresh}`:''}
        ${!isMaster?`→ ${MASTERY_NEXT_TH[rank]}`:' (สูงสุด)'}
      </div>
      <div class="skill-mastery-bar"><div class="skill-mastery-fill ${rank}" style="width:${pct}%"></div></div>
      <div class="skill-detail">
        Power: ${def.power||'—'} • CD: ${def.cooldown||'—'}s • ${def.targetType||'enemy'}
      </div>
      <div class="skill-detail">
        <span class="power-bonus">Raw Power bonus: +${rawPowerPct}%</span>
        ${s.mutationId?` • Mutation: ${s.mutationId}`:''}
      </div>
    </div>`;
  }).join('');

  // สกิลที่ยังไม่เรียน
  const learnedIds=new Set((inst.skills||[]).map(s=>s.skillId));
  const candidatesHTML=speciesSkills.filter(s=>!learnedIds.has(s.name)).map(s=>{
    return `<div class="skill-card skill-locked">
      <div class="skill-card-header">
        <b>${s.name} ${typeBadge(s.type)}</b>
      </div>
      <div class="skill-detail">Power: ${s.power||'—'} • CD: ${s.cooldown||'—'}s • ${s.targetType||'enemy'}</div>
      <div class="skill-detail">ใช้สกิลในการต่อสู้เพื่อสะสม EXP → เรียนรู้อัตโนมัติ</div>
    </div>`;
  }).join('');

  panel.innerHTML=`<div class="skills-panel">
    <div class="monster-selector">
      <select onchange="state.skillsSelectedId=this.value;renderSkills()">
        ${allIds.map(id=>{
          const m=getInst(id);
          if(!m)return '';
          return `<option value="${id}" ${id===selectedId?'selected':''}>${displayName(m)} Lv.${m.level} • ${m.lifeStage}</option>`;
        }).join('')}
      </select>
    </div>
    ${learnedHTML?
      `<div class="skills-section-title">สกิลที่เรียนรู้ (${(inst.skills||[]).length})</div>${learnedHTML}`:
      '<div class="manager-empty">ยังไม่ได้เรียนสกิล — ใช้สกิลในการต่อสู้เพื่อสะสม EXP</div>'
    }
    ${candidatesHTML?
      `<div class="skills-section-title">สกิลที่ยังไม่เรียน (${speciesSkills.length-learnedIds.size})</div>${candidatesHTML}`:''
    }
    <div class="skill-help">
      <b>ระดับ Mastery:</b> เริ่มต้น → คุ้นเคย → ชำนาญ → เชี่ยวชาญ → ปรมาจารย์<br>
      <b>EXP สะสม:</b> 100 / 300 / 700 / 1500<br>
      <b>Power bonus:</b> +0% / +2% / +5% / +8% / +11%<br>
      ใช้สกิลซ้ำๆ ใน battle เดียว = EXP ลดลง (novelty decay 0.7x)
    </div>
  </div>`;
}
```

---

## 7. แท็บที่ 4: อุปกรณ์ (Equipment) — ใหม่

### 7.1 โครงหน้าจอ

```
┌─────────────────────────────────────────────────────────────────┐
│  เลือกมอน: [Flameling Lv.5 ▼]                                   │
│                                                                 │
│  ┌─ สรุปพลังจากอุปกรณ์ ────────────────────────────────────────┐ │
│  │  HP +12 • ATK +8 • DEF +5 • SPD +3                          │ │
│  │  Power Budget: [██████████░░░░] 9.5% (ควร 8-12%) ✅          │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ Gear ──────────────────────────────────────────────────────┐ │
│  │  [เปล่า]                                   [ใส่]             │ │
│  │  สล็อตอุปกรณ์หลัก — เกราะ/อาวุธ                                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌─ Charm ─────────────────────────────────────────────────────┐ │
│  │  Power Ring                                                 │ │
│  │  ATK +8 (cap 10)                          [ถอด]             │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌─ Utility ────────────────────────────────────────────────────┐ │
│  │  [เปล่า]                                   [ใส่]             │ │
│  │  สล็อตเสริม — อาหารเสริม/ไอเทมใช้แล้วทิ้ง                         │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ หลักอุปกรณ์ ────────────────────────────────────────────────┐ │
│  │  3 สล็อก: Gear / Charm / Utility                             │ │
│  │  ถอดได้ตลอดเวลา (reversible) — ไม่ทำลายสถิติ                 │ │
│  │  Affix ประเภทเดียวกัน — รวมกันแล้วไม่เกิน cap                 │ │
│  │  พลังรวมจากอุปกรณ์ทั้งหมด — ควรอยู่ 8-12% ของ combat power      │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 CSS
```css
.equipment-panel{padding:4px}

.equip-summary{
  background:#0b1220;border:1px solid #ffffff18;border-radius:14px;
  padding:10px;margin-bottom:12px
}
.equip-summary-stats{
  display:flex;gap:10px;flex-wrap:wrap;font-size:11px;margin-bottom:8px
}
.equip-summary-stats span{color:#fde68a;font-weight:700}
.equip-summary-stats span.zero{color:#64748b;font-weight:400}

.budget-label{font-size:10px;color:#94a3b8;margin-bottom:3px}
.budget-bar{height:6px;background:#111827;border-radius:999px;overflow:hidden;margin:3px 0}
.budget-fill{height:100%;transition:width .3s}
.budget-fill.ok{background:#22c55e}
.budget-fill.over{background:#ef4444}
.budget-fill.under{background:#facc15}
.budget-range{font-size:9px;color:#64748b;margin-top:2px}

.equip-slot-card{
  background:#162033;border:1px solid #ffffff14;border-radius:12px;
  padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;
  align-items:center;gap:8px
}
.equip-slot-info{min-width:0;flex:1}
.equip-slot-name{font-size:12px;font-weight:700;color:#fff;margin-bottom:2px}
.equip-slot-item{font-size:11px;color:#fde68a;font-weight:600}
.equip-slot-empty{font-size:11px;color:#64748b}
.equip-slot-desc{font-size:8px;color:#64748b;margin-top:2px}
.equip-affix{font-size:9px;color:#94a3b8;margin-top:3px}
.equip-affix .affix-stat{color:#86efac}

.equip-btn{
  border:0;border-radius:10px;padding:8px 14px;font-weight:800;
  font-size:11px;cursor:pointer;min-height:40px;min-width:50px
}
.equip-btn.equip{background:#0891b2;color:#fff}
.equip-btn.unequip{background:#991b1b;color:#fff}
.equip-btn:active{transform:scale(.97)}

.equip-help{
  font-size:9px;color:#64748b;margin-top:12px;padding:8px;
  background:#0b1220;border-radius:8px;line-height:1.5
}
.equip-help b{color:#94a3b8}
```

### 7.3 JS — renderEquipment()

```js
function renderEquipment(){
  const panel=el('equipmentPanel');
  if(!panel)return;

  const allIds=[...state.party.filter(Boolean),...state.storage];
  if(!allIds.length){
    panel.innerHTML='<div class="manager-empty">ยังไม่มีมอน — ไปจับมอนก่อน</div>';
    return;
  }

  const selectedId=state.equipSelectedId||allIds[0];
  const inst=getInst(selectedId);
  if(!inst){
    state.equipSelectedId=null;
    panel.innerHTML='<div class="manager-empty">เลือกมอนไม่ถูกต้อง</div>';
    return;
  }

  const flat=getEquipmentFlat(inst);
  const equippedCount=equippedItems(inst).length;
  const budgetMin=BALANCE_CONFIG.equipment.budget.min*100;
  const budgetMax=BALANCE_CONFIG.equipment.budget.max*100;
  // คำนวณ budget โดยประมาณ (flat stats / total stats)
  const totalAtk=(inst.atk||0)+(flat.atk||0);
  const totalDef=(inst.def||0)+(flat.def||0);
  const flatTotal=(flat.hp||0)+(flat.atk||0)+(flat.def||0)+(flat.spd||0);
  const statTotal=inst.maxHp+inst.atk+inst.def+inst.spd;
  const budgetPct=statTotal>0?Math.round(flatTotal/statTotal*100*10)/10:0;
  const budgetClass=budgetPct<budgetMin?'under':budgetPct>budgetMax?'over':'ok';
  const budgetStatus=budgetPct<budgetMin?'น้อยไป':budgetPct>budgetMax?'มากไป':'สมดุล';

  const slotDesc={gear:'สล็อตอุปกรณ์หลัก — เกราะ/อาวุธ',charm:'สล็อตเสริม — เครื่องราง',utility:'สล็อตอาหารเสริม/ไอเทมใช้แล้วทิ้ง'};

  const slotsHTML=EQUIPMENT_SLOTS.map(slot=>{
    const item=inst.equipment?.[slot];
    if(item){
      const affixes=(item.affixes||[]).map(a=>{
        const val=a.value??0;
        const cap=a.cap??'∞';
        return `<span class="affix-stat">${a.stat||a.derived} +${val}</span>${a.cap!=null?` (cap ${cap})`:''}`;
      }).join(', ');
      return `<div class="equip-slot-card">
        <div class="equip-slot-info">
          <div class="equip-slot-name">${slot}</div>
          <div class="equip-slot-item">${item.id}</div>
          ${affixes?`<div class="equip-affix">${affixes}</div>`:''}
        </div>
        <button class="equip-btn unequip" onclick="unequipMonster('${inst.instanceId}','${slot}')">ถอด</button>
      </div>`;
    }
    return `<div class="equip-slot-card">
      <div class="equip-slot-info">
        <div class="equip-slot-name">${slot}</div>
        <div class="equip-slot-empty">ว่าง</div>
        <div class="equip-slot-desc">${slotDesc[slot]||''}</div>
      </div>
      <button class="equip-btn equip">ใส่</button>
    </div>`;
  }).join('');

  const flatHTML=['hp','atk','def','spd'].map(s=>{
    const v=flat[s]||0;
    return `<span class="${v===0?'zero':''}">${s.toUpperCase()} +${v}</span>`;
  }).join(' • ');

  panel.innerHTML=`<div class="equipment-panel">
    <div class="monster-selector">
      <select onchange="state.equipSelectedId=this.value;renderEquipment()">
        ${allIds.map(id=>{
          const m=getInst(id);
          if(!m)return '';
          return `<option value="${id}" ${id===selectedId?'selected':''}>${displayName(m)} Lv.${m.level}</option>`;
        }).join('')}
      </select>
    </div>
    <div class="equip-summary">
      <div class="equip-summary-stats">${flatHTML}</div>
      ${equippedCount>0?`
        <div class="budget-label">Power Budget: ${budgetPct}% (ควร ${budgetMin}-${budgetMax}%) — ${budgetStatus}</div>
        <div class="budget-bar"><div class="budget-fill ${budgetClass}" style="width:${Math.min(100,budgetPct*5)}%"></div></div>
        <div class="budget-range">0% — ${budgetMin}% — ${budgetMax}% — 20%</div>
      `:'<div class="budget-label">ยังไม่ได้ใส่อุปกรณ์</div>'}
    </div>
    ${slotsHTML}
    <div class="equip-help">
      <b>3 สล็อก:</b> Gear / Charm / Utility<br>
      <b>ถอดได้ตลอดเวลา</b> (reversible) — ไม่ทำลายสถิติ<br>
      <b>Affix ประเภทเดียวกัน</b> — รวมกันแล้วไม่เกิน cap<br>
      <b>พลังรวม</b> — ควรอยู่ ${budgetMin}-${budgetMax}% ของ combat power
    </div>
  </div>`;
}
```

---

## 8. แท็บที่ 5: Evolution — ปรับปรุง

### 8.1 ส่วนเพิ่มจากเดิม

renderEvolution ปัจจุบัน (บรรทัด 1705) แสดง:
- ชื่อมอน + type
- stat mods (HP×/ATK×/DEF×/SPD×)
- skills หลัง evolution
- เงื่อนไข (Lv, Bond, Training, Environment)
- ปุ่มยืนยัน

ส่วนเพิ่ม:
1. Evolution History (ประวัติการวิวัฒนาการ)
2. Skill Carry % (สกิลที่ส่งต่อ 70-100%)
3. Identity Lock (Gene/Parents/Generation ไม่เปลี่ยน)
4. Power Budget badge (5-8%)

### 8.2 CSS เพิ่ม
```css
.evo-history{
  font-size:9px;color:#94a3b8;margin-top:8px;padding:8px;
  background:#0b1220;border-radius:8px;border:1px solid #ffffff08
}
.evo-history-title{font-weight:700;color:#cbd5e1;margin-bottom:4px}
.evo-history-item{padding:3px 0;border-bottom:1px solid #ffffff08}
.evo-history-item:last-child{border-bottom:0}

.evo-identity-lock{
  font-size:9px;color:#86efac;margin-top:5px;
  padding:5px 7px;background:#0b1220;border-radius:7px;
  border:1px solid #22c55e22
}

.evo-budget-badge{
  display:inline-block;font-size:9px;padding:2px 7px;
  border-radius:999px;font-weight:700
}
.evo-budget-badge.ok{background:#166534;color:#dcfce7}
.evo-budget-badge.warn{background:#78350f;color:#fde68a}

.evo-skill-carry{font-size:9px;color:#c4b5fd;margin-top:4px}
```

### 8.3 JS — เพิ่มใน renderEvolution()

ในส่วนที่สร้าง evo-card แต่ละใบ เพิ่ม:

```js
// หลังบรรทัดเงื่อนไข (st.text):
`<div class="evo-skill-carry">Skill Carry: 70-100% mastery EXP ส่งต่อ</div>`
`<div class="evo-identity-lock">🔒 Gene / Parents / Generation ไม่เปลี่ยน (Identity Lock)</div>`

// หลังปุ่ม — เพิ่ม history (ถ้ามี):
const histHTML=(inst.evolutionHistory||[]).length?
  `<div class="evo-history">
    <div class="evo-history-title">ประวัติ Evolution</div>
    ${(inst.evolutionHistory||[]).map(h=>
      `<div class="evo-history-item">${h.from||'base'} → ${h.to} • ${new Date(h.at).toLocaleDateString('th-TH',{year:'2-digit',month:'short',day:'numeric'})}</div>`
    ).join('')}
  </div>`:'';
```

---

## 9. แท็บที่ 6: Breeding — ปรับปรุง

### 9.1 ส่วนเพิ่มจากเดิม

renderBreeding ปัจจุบัน (บรรทัด 1726) แสดง:
- ปุ่มเลือก Parent A / Parent B
- ข้อความ compatibility
- inherit preview (ผู้ถือไข่ + Gene trait)
- รายการไข่ใน Incubator

ส่วนเพิ่ม:
1. Gene Inheritance Preview — ตารางโอกาส gene แต่ละตัว
2. Close-Relative Warning — แสดงสถานะว่าเป็นญาติสนิทหรือไม่
3. Generation Counter — แสดง Gen ของลูก
4. Birth History — ประวัติการฟัก

### 9.2 CSS เพิ่ม
```css
.gene-inherit-preview{
  display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px
}
.gene-inherit-cell{
  background:#0b1220;border-radius:8px;padding:6px;text-align:center
}
.gene-inherit-cell .gene-label{
  color:#94a3b8;font-size:8px;display:block;margin-bottom:2px
}
.gene-inherit-cell .gene-pred{
  color:#c4b5fd;font-weight:700;font-size:11px
}
.gene-inherit-cell .gene-pct{
  color:#64748b;font-size:7px;margin-top:1px
}

.close-relative-warn{
  background:#7f1d1d;color:#fee2e2;border-radius:8px;
  padding:6px 8px;font-size:10px;margin-top:6px;font-weight:600
}
.close-relative-ok{
  background:#166534;color:#dcfce7;border-radius:8px;
  padding:6px 8px;font-size:10px;margin-top:6px;font-weight:600
}

.gen-counter{
  display:inline-block;font-size:10px;font-weight:700;
  background:#1e1b4b;color:#c4b5fd;border-radius:999px;
  padding:3px 8px;margin-top:6px
}

.birth-history{
  font-size:9px;color:#94a3b8;margin-top:8px;padding:8px;
  background:#0b1220;border-radius:8px;border:1px solid #ffffff08
}
.birth-history-item{padding:3px 0;border-bottom:1px solid #ffffff08}
```

### 9.3 JS — เพิ่มใน renderBreeding()

ในส่วน `if(a&&b){` เพิ่ม:

```js
// Gene inheritance preview
const genePreview=CORE_GENES.map(g=>{
  const ga=a.genes?.[g]||'B';
  const gb=b.genes?.[g]||'B';
  return `<div class="gene-inherit-cell">
    <span class="gene-label">${g.toUpperCase()}</span>
    <span class="gene-pred">${ga}/${gb}</span>
    <span class="gene-pct">45%/45%/10%</span>
  </div>`;
}).join('');

// Close-relative check
const relative=isCloseRelative(a,b);
const relativeHTML=relative?
  `<div class="close-relative-warn">⚠ ญาติสนิท — ไม่สามารถผสมพันธุ์ได้</div>`:
  `<div class="close-relative-ok">✓ ไม่ใช่ญาติสนิท — ผสมพันธุ์ได้</div>`;

// Generation counter
const childGen=Math.max(a.generation||1,b.generation||1)+1;
const genHTML=`<div class="gen-counter">ลูกรุ่น Gen ${childGen}</div>`;

// อัปเดต inheritPreview
el('inheritPreview').innerHTML=`
  ผู้ถือไข่: <b>${holder?displayName(holder):'ไม่พบ'}</b> • Species ตามผู้ถือไข่<br>
  ${genHTML}
  ${relativeHTML}
  <div class="gene-inherit-preview">${genePreview}</div>
  <div style="font-size:8px;color:#64748b;margin-top:4px">
    45% จาก A • 45% จาก B • 10% mutation (70%เหมือน / 15%ดีขึ้น / 15%แย่ลง)
  </div>
`;
```

---

## 10. In-Game Popups (นอก Manager)

### 10.1 Raising Event Popup (ใหม่)

#### 10.1.1 HTML — เพิ่มใน v710.html ก่อนปิด <div id="hud">
```html
<div id="eventPopup" class="event-popup hidden">
  <div class="event-card">
    <div class="event-icon" id="eventIcon">★</div>
    <div class="event-title" id="eventTitle"></div>
    <div class="event-choices" id="eventChoices"></div>
  </div>
</div>
```

#### 10.1.2 CSS
```css
.event-popup{
  position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
  z-index:200;pointer-events:auto
}
.event-popup.hidden{display:none}
.event-card{
  background:linear-gradient(180deg,#1e1b4b,#0f172a);
  border:2px solid #7c3aed;border-radius:20px;
  padding:18px 22px;min-width:280px;max-width:340px;
  box-shadow:0 20px 60px #0009,0 0 0 4px #7c3aed22;
  text-align:center
}
.event-icon{font-size:28px;margin-bottom:6px}
.event-title{
  font-size:14px;font-weight:900;color:#c4b5fd;
  margin-bottom:14px;line-height:1.4
}
.event-choices{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.event-choices button{
  border:0;border-radius:12px;padding:12px 18px;
  font-size:12px;font-weight:800;cursor:pointer;
  background:#2563eb;color:#fff;min-width:100px;min-height:44px
}
.event-choices button:active{transform:scale(.96)}
.event-choices button.secondary{background:#334155}
```

#### 10.1.3 JS
```js
function showEventPopup(inst,eventDef){
  const popup=el('eventPopup');if(!popup)return;
  el('eventTitle').textContent=`${displayName(inst)}: ${eventDef.id}`;
  const choices=el('eventChoices');
  choices.innerHTML='';
  for(const c of getChoices(eventDef)){
    const btn=document.createElement('button');
    btn.textContent=c.label;
    btn.onclick=()=>{
      resolveRaisingEvent(c.id);
      popup.classList.add('hidden');
    };
    choices.appendChild(btn);
  }
  popup.classList.remove('hidden');
}
```

แก้ triggerRaisingEvent ให้เรียก showEventPopup แทน msg:
```js
// เดิม: msg(`★ ${displayName(inst)}: ${picked.def.id} — เลือก: ${choiceText}`);
// ใหม่:
showEventPopup(inst,picked.def);
```

### 10.2 Skill Mastery Notification (ใหม่)

#### 10.2.1 CSS
```css
.mastery-popup{
  position:fixed;top:60px;right:10px;z-index:150;
  background:linear-gradient(180deg,#4c1d95,#1e1b4b);
  color:#ddd6fe;border:1px solid #a855f7;border-radius:14px;
  padding:10px 14px;font-size:12px;font-weight:800;
  box-shadow:0 12px 30px #0009;
  animation:masterySlide .4s ease;max-width:260px
}
@keyframes masterySlide{
  from{opacity:0;transform:translateX(30px)}
  to{opacity:1;transform:translateX(0)}
}
.mastery-popup.fade{animation:masteryFade .5s ease forwards}
@keyframes masteryFade{
  to{opacity:0;transform:translateX(30px)}
}
```

#### 10.2.2 JS
```js
function showMasteryPopup(monName,skillName,newRank){
  const popup=document.createElement('div');
  popup.className='mastery-popup';
  popup.innerHTML=`★ ${monName} • ${skillName} → <b>${(MASTERY_TH[newRank]||newRank).toUpperCase()}</b>!`;
  document.body.appendChild(popup);
  setTimeout(()=>{
    popup.classList.add('fade');
    setTimeout(()=>popup.remove(),500);
  },3000);
}
```

แก้ใน useSkill ที่แสดง rank-up:
```js
// เดิม: if(sResult&&sResult.rankedUp)msg(`★ ${displayName(a.inst)} • ${move.name} mastery → ${sResult.toRank.toUpperCase()}!`);
// ใหม่:
if(sResult&&sResult.rankedUp)showMasteryPopup(displayName(a.inst),move.name,sResult.toRank);
```

### 10.3 Condition Indicator ใน Party Bar (ใหม่)

#### 10.3.1 CSS
```css
.party-cond-dot{
  width:7px;height:7px;border-radius:50%;display:inline-block;
  flex-shrink:0;margin-left:3px
}
.party-cond-dot.excellent{background:#22c55e;box-shadow:0 0 4px #22c55e88}
.party-cond-dot.good{background:#3b82f6}
.party-cond-dot.normal{background:#64748b}
.party-cond-dot.tired{background:#facc15}
.party-cond-dot.fatigued{background:#f97316}
.party-cond-dot.bad{background:#ef4444;box-shadow:0 0 4px #ef444488}
```

#### 10.3.2 JS — เพิ่มใน renderParty() (บรรทัด ~1868)

หลัง `mini.append(name,hp,detail,stateLabel);`:
```js
// V8.0: Condition dot
syncToBodyMind(inst);
const condDot=document.createElement('span');
condDot.className='party-cond-dot '+(deriveCondition(inst)||'normal');
condDot.title='สภาพ: '+(deriveCondition(inst)||'normal');
mini.append(condDot);
```

### 10.4 Battle Result Breakdown (ปรับปรุง msg)

ปัจจุบันใน defeatWild (บรรทัด ~1331):
```js
msg(`${tag}${wildDisplayName(w)} ถูกปราบ +${12*w.level} EXP${activeSummon?` • ${displayName(activeSummon.inst)} +${monGain} EXP${ups?` • Level Up +${ups}`:''}${trainSummary}`:''}`);
```

ใหม่ — แยกบรรทัด อ่านง่ายขึ้น:
```js
let battleMsg=`${tag}${wildDisplayName(w)} ถูกปราบ\n  +${12*w.level} Player EXP`;
if(activeSummon){
  battleMsg+=`\n  ${displayName(activeSummon.inst)}: +${monGain} Growth EXP`;
  if(ups)battleMsg+=` • Lv.Up +${ups}!`;
  if(trainSummary)battleMsg+=trainSummary;
  // Party share
  const share=resolvePartyShareGrowth({enemy,activeGrowthExp:monGain});
  if(share>0){
    const partyMembers=state.party.filter(id=>id&&id!==inst.instanceId);
    if(partyMembers.length)battleMsg+=`\n  Party Share: +${share} EXP ละ/ตัว (${partyMembers.length} ตัว)`;
  }
}
msg(battleMsg);
```

---

## 11. สถานะเกม (Game State) ที่เพิ่ม

เพิ่มใน `state` object (บรรทัด ~28):

```js
// V8.0 UI state — selected monster per tab
trainingSelectedId:null,
skillsSelectedId:null,
equipSelectedId:null,
```

---

## 12. ลำดับการทำ (Implementation Phases)

### Phase 1: ปรับปรุงการ์ดมอนเดิม
- เปลี่ยน needsHTML — เพิ่มสี Condition chip
- เพิ่ม trainingPoolHTML — แทน training-badge เดิม
- เพิ่ม skillsMiniHTML — แสดง mastery rank ในการ์ด
- เพิ่ม equipMiniHTML — แสดงช่องอุปกรณ์ในการ์ด
- เพิ่ม careActionsHTML — ปุ่ม พักผ่อน/เล่นด้วย
- อัปเดต monsterCard wrap.innerHTML — เพิ่มส่วนใหม่ทั้งหมด
- เพิ่ม CSS สำหรับส่วนใหม่
- ไฟล์: game-v710.js, style-v710.css
- การตรวจ: npm run ci 34/34 + browser 200 OK

### Phase 2: แท็บ Training
- เพิ่ม tab button + pane ใน v710.html
- สร้าง renderTraining() ใน game-v710.js
- อัปเดต setManagerTab — เพิ่ม 'training'
- เพิ่ม state.trainingSelectedId
- เพิ่ม CSS สำหรับ training panel
- ไฟล์: game-v710.js, style-v710.css, v710.html

### Phase 3: แท็บ Skills
- เพิ่ม tab button + pane
- สร้าง renderSkills()
- import SKILL_MASTERY จาก balance-config.mjs
- อัปเดต setManagerTab
- เพิ่ม state.skillsSelectedId
- เพิ่ม MASTERY_TH / MASTERY_DOTS constants
- เพิ่ม CSS
- ไฟล์: game-v710.js, style-v710.css, v710.html

### Phase 4: แท็บ Equipment
- เพิ่ม tab button + pane
- สร้าง renderEquipment()
- อัปเดต setManagerTab
- เพิ่ม state.equipSelectedId
- เพิ่ม CSS
- ไฟล์: game-v710.js, style-v710.css, v710.html

### Phase 5: Evolution + Breeding ปรับปรุง
- เพิ่ม Evolution History + identity lock + skill carry
- เพิ่ม Gene Inheritance Preview + close-relative warning + gen counter
- อัปเดต renderEvolution() + renderBreeding()
- เพิ่ม CSS
- ไฟล์: game-v710.js, style-v710.css

### Phase 6: In-game popups
- เพิ่ม event popup HTML + CSS + JS
- เพิ่ม mastery notification
- เพิ่ม condition dot ใน party bar
- ปรับปรุง battle result breakdown
- เปลี่ยน triggerRaisingEvent ให้เรียก showEventPopup
- เปลี่ยน useSkill rank-up ให้เรียก showMasteryPopup
- ไฟล์: game-v710.js, style-v710.css, v710.html

---

## 13. ไฟล์ที่กระทบและขอบเขตการแก้

| ไฟล์ | ขนาดปัจจุบัน | Phase | ประเภทการแก้ | ประมาณการเพิ่ม |
|------|-----------|-------|-----------|-------------|
| game-v710.js | 2087 บรรทัด | 1-6 | เพิ่มฟังก์ชัน render, แก้ monsterCard, แก้ renderParty | ~250 บรรทัด |
| style-v710.css | 193 บรรทัด | 1-6 | เพิ่ม CSS classes ใหม่ | ~200 บรรทัด |
| v710.html | 209 บรรทัด | 2,3,4,6 | เพิ่ม tab buttons, panes, popup HTML | ~30 บรรทัด |

---

## 14. การตรวจรับ (Acceptance Gates)

แต่ละ Phase ต้องผ่าน:

1. `npm run ci` → 34/34 suites PASS
2. `node --check game-v710.js` → SYNTAX OK
3. Browser test:
   - `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/v710.html` → 200
   - `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/game-v710.js` → 200
   - `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/style-v710.css` → 200
4. ตรวจไฟล์ที่เสิร์ฟมี code ใหม่ (grep หา keyword ใหม่)
5. ไม่ทำลาย save เดิม (save-schema version 8 compatible)
6. ไม่เพิ่ม dependency ใหม่ (ไม่มี npm install)
7. ไม่เพิ่มไฟล์ใหม่ (ทุกอย่างใน 3 ไฟล์ที่มีอยู่)

---

## 15. ข้อควรระวัง (Pitfalls)

1. **need-row grid** — เดิมใช้ `repeat(3,1fr)` ใน CSS หลัก (บรรทัด 7) และ `repeat(4,1fr)` ใน media query (บรรทัด 41) — ต้องเปลี่ยนเป็น `repeat(4,1fr)` หรือ `repeat(auto-fit,minmax(60px,1fr))` ให้รองรับ 4 chips ไม่ล้น

2. **monsterCard สูงมาก** — การ์ดอาจสูงเกินจอบนมือถือ — ใช้ `max-height` + `overflow:auto` หรือใช้ `<details>` สำหรับส่วนย่อย (training/skills/equip) เพื่อย่อได้

3. **select dropdown บนมือถือ** — ใช้ native `<select>` ดีที่สุดบน touch (เลื่อน list ได้เอง) — แต่ต้องตั้ง `appearance:auto` เพราะ CSS เดิมอาจซ่อนลูกศร

4. **z-index ลำดับ** — ต้องเรียงให้ถูก:
   - startup status: 9999
   - immersive gate: 10000
   - event popup: 200 (สูงกว่า manager 100 และ picker 150)
   - mastery popup: 150 (สูงกว่า manager 100 แต่ต่ำกว่า picker)
   - manager: 100
   - monster picker: 150
   - utility menu: 30
   - HUD: 7-8

5. **CSS specificity** — media queries เดิมใช้ `!important` หลายจุด (บรรทัด 88, 107) — ระวังตอน override คลาสใหม่ — อาจต้องเพิ่ม `!important` ด้วย หรือเขียนให้ specific กว่า

6. **train-actions 5 ปุ่ม** — บนจอ 320px อาจล้น — ใช้ `flex-wrap:wrap` (มีอยู่แล้ว) + ลด padding/font-size ใน media query

7. **skill-progression import** — ต้อง import `SKILL_MASTERY` จาก `balance-config.mjs` เพิ่ม (ไม่ใช่จาก skill-progression.mjs — ฟังก์ชัน masteryRawPower อยู่ใน skill-progression แต่ค่า const อยู่ใน balance-config)

8. **pool-lines grid 5 สาย** — ใน 2 columns (grid-template-columns:1fr 1fr) จะได้ 3 บรรทัด (2+2+1) — บรรทัดสุดท้ายมี 1 ช่อง — อาจใช้ 3 columns แทน หรือ flex-wrap

9. **syncToBodyMind ใน render** — เรียก syncToBodyMind ใน needsHTML และ renderTraining — ระวัง double-sync (เรียกสองครั้งในการ render ครั้งเดียว) — ไม่อันตรายแต่สิ้นเปลือง

10. **innerHTML และ event handler** — การ์ดมอนใช้ `wrap.innerHTML=...` แล้ว querySelectorAll เพื่อ bind event — ต้องทำเหมือนกันสำหรับส่วนใหม่ (careActionsHTML, skillsMiniHTML ไม่มีปุ่มจึงไม่ต้อง bind)

11. **equippedItems คืน array** — ตรวจทุกครั้งว่า inst.equipment มีอยู่ก่อนเรียก — ใช้ `inst.equipment?.[slot]` เสมอ

12. **balance-formulas import** — renderTraining ใช้ `balanceFormulas.diminishingMultiplier` และ `balanceFormulas.aptitudeMultiplier` — import อยู่แล้วในบรรทัด 5 (`import * as balanceFormulas`) แต่ต้องตรวจว่าฟังก์ชัน export อยู่

---

## 16. ทดสอบด้วยมือ (Manual Smoke Test)

หลังแต่ละ Phase ต้องทดสอบด้วยมือใน browser:

### Phase 1 — การ์ดมอน
1. เปิด http://127.0.0.1:8081/v710.html
2. ไปที่ Ranch Hub → คุย NPC → เปิด Manager
3. แท็บ "มอน" → เห็นการ์ดมอน
4. ตรวจ: สภาพ chip มีสี (ไม่ใช่สีเดียวทุกตัว)
5. ตรวจ: Training Pool bar แสดง used/capacity + 5 สาย breakdown
6. ตรวจ: Skills mini แสดงชื่อสกิล + จุด mastery
7. ตรวจ: Equip mini แสดง 3 ช่อง (หรือ "—" ถ้าว่าง)
8. ตรวจ: ปุ่ม พักผ่อน/เล่นด้วย แสดงและแตะได้
9. แตะ "พักผ่อน" → msg แสดงพลังเพิ่ม
10. แตะ "เล่นด้วย" → msg แสดงอารมณ์เพิ่ม

### Phase 2 — แท็บ Training
1. แตะแท็บ "ฝึก"
2. เห็น dropdown เลือกมอน
3. เห็น Training Pool bar รวม
4. เห็น 5 การ์ดสาย training
5. แตะ "ฝึก Power" → ค่าเพิ่ม, bar เคลื่อน
6. สลับมอนใน dropdown → ข้อมูลเปลี่ยน

### Phase 3 — แท็บ Skills
1. แตะแท็บ "สกิล"
2. เห็นสกิลที่เรียน (ถ้ามี) + mastery bar
3. เห็นสกิลที่ยังไม่เรียน
4. เห็นหลัก Mastery ด้านล่าง

### Phase 4 — แท็บ Equipment
1. แตะแท็บ "อุปกรณ์"
2. เห็น 3 ช่อง (Gear/Charm/Utility)
3. เห็นสรุป stats จากอุปกรณ์
4. แตะ "ถอด" (ถ้ามีอุปกรณ์) → สถิติเปลี่ยน

### Phase 5 — Evolution + Breeding
1. แท็บ Evolution → เห็น history (ถ้าเคยวิวัฒนาการ)
2. เห็น identity lock + skill carry
3. แท็บ Breeding → เลือกพ่อแม่ → เห็น gene preview
4. เห็น close-relative warning (ถ้าเลือกญาติ)

### Phase 6 — Popups
1. เล่นเกมจนมอนมีสภาพเปลี่ยน → เห็น condition dot ใน party bar
2. ใช้สกิลจน rank-up → เห็น mastery popup มุมขวาบน
3. รอ raising event trigger → เห็น event popup กลางจอ
4. เลือกตัวเลือก → popup หาย → ผลใน msg
5. ปราบมอน → เห็น battle result แยกบรรทัด

---

## 17. สถาปัตยกรรม CSS และจุดเสี่ยง

### 17.1 โครง CSS ปัจจุบัน
style-v710.css มี 193 บรรทัด แบ่งเป็น:
- บรรทัด 2-12: base layout (topbar, message, target-card, type-badge, party, controls)
- บรรทัด 7: manager (card, tabs, item, needs, feed, train, gene)
- บรรทัด 8: breeding panel
- บรรทัด 9: startup status
- บรรทัด 10-11: media queries (max-width:700px, max-height:560px)
- บรรทัด 13-16: V6 Ring 0+1 (zone-travel, aim-reticle, skill buttons)
- บรรทัด 19-27: V6.1-V6.2 (visibility, hunt flow)
- บรรทัด 29-42: V6.4 (visual polish, fullscreen, manager tabs)
- บรรทัด 43-62: media queries (V6.4)
- บรรทัด 63-79: V6.5 (mobile game UI pass — compact topbar, party slot, picker)
- บรรทัด 80-88: V6.9 (premium combat UI)
- บรรทัด 89-107: V7+ (tab styling, party compact, etc.)
- บรรทัด 108+: media queries (V7+)

### 17.2 จุดเสี่ยง CSS
1. **บรรทัด 41**: `.need-row{grid-template-columns:repeat(4,1fr)}` — override ใน V6.4 — ต้องระวังถ้าเปลี่ยนจำนวน chips
2. **บรรทัด 107**: `.manager-tab.active{background:linear-gradient(180deg,#3b82f6,#1d4ed8)!important}` — ใช้ `!important` — ถ้าเพิ่ม 6 แท็บต้องไม่ชนกับจุดนี้
3. **บรรทัด 7**: `.manager-item{display:flex}` — การ์ดมอนเป็น flex row — เพิ่มเนื้อหาด้านซ้าย (monster-main) จะทำให้สูงขึ้น
4. **backdrop-filter** — ใช้หลายชั้น (topbar, party, manager-card) — เพิ่ม popup อาจทำให้ช้าลงบนอุปกรณ์เก่า

### 17.3 กลยุทธ์เพิ่ม CSS
- เพิ่ม CSS ใหม่ท้ายไฟล์ทั้งหมด (หลังบรรทัด 193)
- ใช้ comment แยกส่วน: `/* V8.0 UX/UI — Phase N: [ชื่อ] */`
- ไม่แก้ CSS เดิม ยกเว้นจำเป็น (เช่น need-row grid columns)
- ถ้าต้อง override เดิม — เขียนต่อท้ายด้วย specificity สูงกว่า ไม่ใช้ `!important` เว้นเมื่อจำเป็น

---

## 18. Accessibility & Touch

### 18.1 ARIA
- แท็บ: `role="tab"` + `aria-selected` (เดิมไม่มี — เพิ่มได้แต่ไม่จำเป็นถ้าไม่มี screen reader)
- popup: `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
- progress bar: `role="progressbar"` + `aria-valuenow` + `aria-valuemin` + `aria-valuemax`

### 18.2 Touch
- ปุ่มขั้นต่ำ 44x44px (var(--touch-min) มีอยู่ในบรรทัด 145)
- ปุ่มแท็บ: ลด padding ใน media query แต่ไม่ต่ำกว่า 44px height
- select dropdown: native ดีที่สุด
- แตะการ์ดมอน: ไม่มี hover effect บนมือถือ — ไม่ต้องเพิ่ม

### 18.3 ความเร็วในการแตะ
- ปุ่ม train: แตะแล้วสะสมทันที (ไม่รอ dialog)
- ปุ่ม care: แตะแล้วทำงานทันที
- ปุ่ม equip/unequip: แตะแล้วทำงานทันที (ไม่ต้อง confirm — เพราะ reversible)
- ปุ่ม evolution: มี confirm dialog (เดิมมีอยู่แล้ว — เพราะย้อนกลับไม่ได้)

---

## 19. ตัวอย่างโค้ดเต็ม (Reference Implementation)

ส่วนนี้รวมโค้ดเต็มสำหรับแต่ละฟังก์ชันใหม่ พร้อมตำแหน่งที่จะแทรกในไฟล์:

### 19.1 ตำแหน่งแทรกใน game-v710.js

```
บรรทัด 5: import * as balanceFormulas (เดิม — เพิ่ม SKILL_MASTERY import)
บรรทัด 10-14: import modules (เดิม — ไม่เพิ่ม)
บรรทัด 28: state object (เดิม — เพิ่ม trainingSelectedId ฯลฯ)
บรรทัด 255: TRAIN_FOCUS (เดิม — ไม่เพิ่ม)
บรรทัด 1067: setManagerTab (แก้ — เพิ่ม training/skills/equipment)
บรรทัด 1540: V7.1.0 Ranch section (เดิม — เพิ่ม MASTERY_TH/MASTERY_DOTS ที่นี่)
บรรทัด 1574: trainingPoolHTML (ใหม่ — แทรกก่อน monsterCard)
บรรทัด 1575: skillsMiniHTML (ใหม่)
บรรทัด 1576: equipMiniHTML (ใหม่)
บรรทัด 1577: careActionsHTML (ใหม่)
บรรทัด 1580: renderTraining (ใหม่ — แทรกหลัง careAction)
บรรทัด 1581: renderSkills (ใหม่)
บรรทัด 1582: renderEquipment (ใหม่)
บรรทัด 1714: needsHTML (แก้ — เพิ่มสี condition)
บรรทัด 1716: monsterCard (แก้ — เพิ่มส่วนใหม่ใน innerHTML)
บรรทัด 1705: renderEvolution (แก้ — เพิ่ม history/identity)
บรรทัด 1726: renderBreeding (แก้ — เพิ่ม gene preview/relative)
บรรทัด 1838: renderParty (แก้ — เพิ่ม condition dot)
บรรทัด ~1331: defeatWild msg (แก้ — battle result breakdown)
บรรทัด ~1640: triggerRaisingEvent (แก้ — ใช้ showEventPopup)
บรรทัด ~1430: useSkill rank-up (แก้ — ใช้ showMasteryPopup)
```

### 19.2 ตำแหน่งแทรกใน style-v710.css

```
ท้ายไฟล์ทั้งหมด (หลังบรรทัด 193):
/* V8.0 UX/UI — Phase 1: Monster Card */
(Condition chip colors, training pool, skill mini, equip mini, care actions)

/* V8.0 UX/UI — Phase 2: Training Tab */
(training panel, line card, condition box)

/* V8.0 UX/UI — Phase 3: Skills Tab */
(skill card, mastery bar, mastery label)

/* V8.0 UX/UI — Phase 4: Equipment Tab */
(equip summary, slot card, budget bar)

/* V8.0 UX/UI — Phase 5: Evolution + Breeding */
(evo history, identity lock, gene inherit, relative warning)

/* V8.0 UX/UI — Phase 6: In-Game Popups */
(event popup, mastery popup, condition dot, party cond)

/* V8.0 UX/UI — Media Queries */
(6-tab responsive, monster-selector, pool-lines)
```

### 19.3 ตำแหน่งแทรกใน v710.html

```
บรรทัด 124-128: manager-tabs (แก้ — 6 ปุ่ม)
บรรทัด 130-140: collection pane (เดิม — ไม่เพิ่ม)
หลังบรรทัด 140: เพิ่ม training/skills/equipment panes (ใหม่)
บรรทัด 142-150: evolution pane (เดิม — ไม่เพิ่ม)
บรรทัด 152-175: breeding pane (เดิม — ไม่เพิ่ม)
ก่อนปิด <div id="hud"> (บรรทัด ~195): event popup HTML (ใหม่)
```

---

## 20. สรุป

- ระบบ logic ทำงานครบแล้ว (V7.2-V8.0, PR #5-#14)
- UI ยังแสดงไม่ครบ — ผู้เล่นมองเห็นเพียงบางส่วน
- แผนนี้แบ่งเป็น 6 Phase = 6 PR
- แต่ละ Phase กระทบ 3 ไฟล์: game-v710.js, style-v710.css, v710.html
- ลำดับ: การ์ดมอน → Training → Skills → Equipment → Evo/Breed → Popups
- ทุก Phase ต้องผ่าน CI 34/34 + browser test
- ไม่เพิ่มไฟล์ใหม่ ไม่เพิ่ม dependency
- โค้ดตัวอย่างเต็มสำหรับทุกฟังก์ชันใหม่พร้อมตำแหน่งแทรก
- CSS เพิ่มท้ายไฟล์ ไม่แก้ของเดิม (ยกเว้น need-row grid)
- ทดสอบด้วยมือ 10 ขั้นตอนต่อ Phase