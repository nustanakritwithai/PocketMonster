# SKILL ICON UI PLAN V8 — ไอคอนสัญลักษณ์สกิล + ปุ่มปา

> ใช้ ECC planner agent approach: วิเคราะห์ → ออกแบบ → phases → implement

## ปัญหาปัจจุบัน

ปุ่มสกิลแสดง "S1/S2/S3" เป็นตัวหนังสือ ปุ่มปาจับ/ปาเรียก/Recall แสดง "CAP/SUM/REC"
ไม่มีไอคอนสัญลักษณ์แสดงลักษณะของสกิล ผู้เล่นไม่รู้ว่าสกิลอะไรโดยไม่อ่านชื่อ

## โครงสร้างปัจจุบัน

```
index.html:
  <button id="skill1Btn" class="action skill skill1"><span>S1</span><small>สกิล 1</small></button>
  <button id="skill2Btn" class="action skill skill2"><span>S2</span><small>สกิล 2</small></button>
  <button id="skill3Btn" class="action skill skill3"><span>S3</span><small>สกิล 3</small></button>
  <button id="captureBtn" class="action capture">ปาจับ</button>
  <button id="summonBtn" class="action summon">ปาเรียก</button>
  <button id="recallBtn" class="action recall">Recall</button>

game-v800.js:
  renderCombatPresentation() (line 3087):
    - skill buttons: setTextIfChanged(key, `S${index+1}`) + setTextIfChanged(name, skill.name)
    - capture: setActionStyle(capture, 'Water', 'CAP', ...)
    - summon: setActionStyle(summon, activeType, 'SUM', ...)
    - recall: setActionStyle(recallButton, 'Psychic', 'REC', ...)
  
  setActionStyle(button, type, label, sub) (line 1577):
    - เปลี่ยน CSS variables --action-main / --action-accent ตามธาตุ
    - เก็บ dataset.label / dataset.sub / dataset.type

style-v800.css:
  .skill1/.skill2/.skill3 — position + size
  .action span — font-size:21px
  .action small — font-size:9px
```

## แนวทาง

ใช้ Canvas API วาดไอคอนสัญลักษณ์ของแต่ละธาตุเป็น data URI แล้วใส่เป็น background-image ของปุ่ม
ไม่ต้องโหลดไฟล์รูปภายนอก — วาดบน canvas สร้างเป็น PNG data URL เหมือนที่ทำ skill sprite texture

## ไอคอนสัญลักษณ์ 18 ธาตุ

| Type | สัญลักษณ์ | คำอธิบาย |
|------|-----------|----------|
| Normal | วงกลมทึบ | พลังพื้นฐาน |
| Fire | เปลวไฟ 3 เปลว | ไฟลุก |
| Water | หยดน้ำ | น้ำ |
| Electric | สายฟ้าเซ็กแซก | ฟ้าผ่า |
| Grass | ใบไม้ | พืช |
| Ice | ผลึกหิมะ 6 แฉก | น้ำแข็ง |
| Fighting | หมัด | ต่อสู้ |
| Poison | หัวกะโหลกพิษ | พิษ |
| Ground | ภูเขา/ก้อนดิน | ดิน |
| Flying | ปีกนก | บิน |
| Psychic | ดวงตาที่สาม | จิต |
| Bug | แมลง | แมลง |
| Rock | ก้อนหิน | หิน |
| Ghost | ผีหุ่นกระบอก | วิญญาณ |
| Dragon | มังกร | มังกร |
| Dark | เดือนเสีเข้ม | มืด |
| Steel | ดาบ/เฟือง | เหล็ก |
| Fairy | ดาวเรืองแสง | ภูต |

## ไอคอนปุ่มปา

| ปุ่ม | สัญลักษณ์ | คำอธิบาย |
|------|-----------|----------|
| Capture (ปาจับ) | ลูกบอลพร้อมวงแหวน | Capture Ball |
| Summon (ปาเรียก) | เสาแสงเรียก | เรียกมอน |
| Recall (เรียกกลับ) | ลูกศรหมุนกลับ | ดึงกลับ |

## Phases

### Phase 1: สร้าง icon texture cache + วาดไอคอน 18 ธาตุ

**สิ่งที่ต้องสร้าง:**
- `skillIconCache` — Map แคไอคอน data URI ของแต่ละ type
- `getSkillIcon(type)` — วาดไอคอนบน canvas 64×64 สร้างเป็น data URL
- แต่ละ type มีสัญลักษณ์เฉพาะ (วาดด้วย canvas path)
- สีตาม ELEMENT_FX core/accent

**ไฟล์ที่แก้:**
- game-v800.js: เพิ่ม skillIconCache + getSkillIcon

**Test:**
- test ใหม่ `tests/v80-skill-icons.mjs`

### Phase 2: สร้าง action icon (capture/summon/recall)

**สิ่งที่ต้องสร้าง:**
- `getActionIcon(actionId)` — วาดไอคอนปุ่มปา 3 แบบ
- capture: ลูกบอล + วงแหวน
- summon: เสาแสง
- recall: ลูกศรหมุน

**ไฟล์ที่แก้:**
- game-v800.js: เพิ่ม getActionIcon

**Test:**
- เพิ่มใน test เดียวกับ Phase 1

### Phase 3: เดินสายไอคอนเข้า renderCombatPresentation

**สิ่งที่ต้องทำ:**
- ใน `renderCombatPresentation()` เปลี่ยน `setTextIfChanged(key, 'S1')` เป็นการตั้ง background-image ของ span เป็นไอคอนธาตุ
- ใน `setActionStyle()` เพิ่มการตั้ง background-image ของปุ่มเป็นไอคอนธาตุ
- capture/summon/recall ใช้ getActionIcon แทนข้อความ

**การเปลี่ยนแปลง:**
- skill button: `<span>` กลายเป็นไอคอนธาตุ (background-image), `<small>` ยังเป็นชื่อสกิล
- capture button: ไอคอนลูกบอล แทน "ปาจับ"
- summon button: ไอคอนเสาแสง แทน "ปาเรียก"
- recall button: ไอคอนลูกศร แทน "Recall"

**CSS:**
- `.action span` — เพิ่ม background-size: contain, background-repeat: no-repeat, background-position: center
- `.action.capture`, `.action.summon`, `.action.recall` — เพิ่ม background-size: contain

**ไฟล์ที่แก้:**
- game-v800.js: แก้ renderCombatPresentation + setActionStyle
- style-v800.css: เพิ่ม background properties

**Test:**
- เพิ่ม assertions ใน test เดียวกัน

## ลำดับการทำ

| Phase | ขอบเขต | PR |
|-------|--------|-----|
| P1 | icon texture cache + 18 ธาตุ + 3 ปุ่มปา | 1 PR |
| P2 | wiring เข้า renderCombatPresentation + CSS | 1 PR (รวม P1) |

ทำรวดเดียว 1 PR ครับ — ขอบเขตเล็กพอ

## ข้อจำกัด

- ไอคอนวาดบน canvas 64×64 (เล็กเพราะใช้บนปุ่มเล็ก)
- ใช้สีจาก ELEMENT_FX core/accent
- data URI PNG (ไม่ต้องโหลดไฟล์ภายนอก)
- ไอคอนต้องชัดเจนบนจอมือถือ (ขนาดปุ่ม 54-66px)
- ไม่เปลี่ยนขนาดปุ่มหรือตำแหน่ง — เปลี่ยนเฉพาะ content ภายใน

## Acceptance Gates

1. `npm run ci` — ทุก suites pass (+ test ใหม่)
2. ไอคอนแสดงบนปุ่มสกิล 3 ปุ่ม + ปุ่มปา 3 ปุ่ม
3. ไอคอนเปลี่ยนตามธาตุของมอนที่เลือก
4. ไม่ทำลาย cooldown VFX (grayscale + timer ยังทำงาน)