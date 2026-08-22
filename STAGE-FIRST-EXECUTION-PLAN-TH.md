# Monster Life RPG — แผนการทำงานแบบ Scene-first

สถานะ: Execution Plan  
วันที่: 2026-08-22  
อ้างอิง: `STAGE-ELEMENT-SETS-ROADMAP-TH.md`

## 1. หลักการ

ลำดับการผลิตที่ล็อกไว้คือ:

**Scene/Zone → Navigation → Environment → Stage Flow → Encounter Point → Normal Monster → Rare → Elite → Boss → Reward → QA**

ต้องทำฉากให้เดินได้จริงก่อน แล้วจึงผูกมอนสเตอร์ตามธาตุและ biome ของฉากนั้น การเพิ่มมอนก่อนฉากจะทำให้ตรวจระยะเดิน, จุดเกิด, กล้อง, performance และ mobile readability ได้ยาก

ทุกชุดต้องผ่านฉากเปล่าและ traversal gate ก่อนเริ่มเพิ่ม encounter

## 2. Phase การทำงาน

### Phase 0 — Lock Contract

- ยืนยัน 18 ธาตุและ Type Resolver กลาง
- ยืนยัน `stageId`, `biomeId`, unlock, clear และ reward schema
- ยึด Hub/Ranch แยกจาก Wild Zone
- กำหนด mobile/performance budget
- ห้ามเปลี่ยน Ring 0/Ring 1 ระหว่างทำ content

ผลลัพธ์: stage schema, biome schema, progress schema และ asset checklist

### Phase 1 — Scene Foundation

- สร้าง zone loader และ lifecycle
- สร้าง ground, sky, fog, light และ camera bounds
- สร้าง entry, exit, safe area และ boss arena marker
- สร้าง collision/navigation bounds
- ทำ cleanup เมื่อเปลี่ยน zone
- ผูก quality tier สำหรับ shadow, fog, particle และ decoration

Gate:

- เข้า/ออก zone ได้
- เดินจาก entry ถึง exit ได้
- กล้องไม่หลุดขอบ map
- player ไม่ติด/ทะลุพื้น
- สลับ zone ซ้ำ 10 รอบไม่เกิด error หรือ resource leak

### Phase 2 — Set 1 Scene Blockout

สร้างฉากเปล่าให้ครบก่อน:

1. `grass-meadow` — ทุ่งหญ้า
2. `ember-valley` — หุบเขาไฟ
3. `misty-lake` — ทะเลสาบหมอก
4. `storm-field` — ทุ่งพายุ

แต่ละฉากต้องมี entry, ทางเดินหลัก, จุดพัก, encounter marker อย่างน้อย 2 จุด, elite marker, boss arena และ exit

Gate:

- เดินสำรวจได้โดยไม่มีมอน
- debug marker แสดงตำแหน่งสำคัญได้
- อ่านทางได้บน portrait/landscape
- ฉากแต่ละแห่งแยกกันได้จาก landmark, สี, sky และ ground

### Phase 3 — Scene Environment Polish

- Grass Meadow: ดอกไม้, ต้นไม้, ทางดิน, ลมเบา
- Ember Valley: หินร้อน, ember, แสงส้ม, ควันเบา
- Misty Lake: น้ำ, หมอก, ฝั่ง, ripple
- Storm Field: เสา conductor, เมฆ, spark, แสงฟ้า

Environment รอบแรกเป็น presentation เท่านั้น ห้ามแอบเพิ่ม damage/status หรือเปลี่ยน Type Effectiveness โดยไม่มี design review

Gate:

- ปิด VFX แล้วฉากยังอ่านทางได้
- quality tier ต่ำยังเล่นได้
- landmark ไม่บัง target หรือ UI
- particle อยู่ใน performance budget

### Phase 4 — Stage Flow

- โหลด stage catalog ตาม `stageId`
- แสดง Stage Intro แบบ mobile bottom sheet
- ผูก Encounter A/B กับ trigger
- แยก Elite trigger และ Boss trigger
- เปิด Boss Arena เมื่อเงื่อนไขครบ
- แสดง Clear/Reward และกลับ Hub
- บันทึก state ระหว่าง stage และ reset trigger ได้

ช่วงนี้ใช้ placeholder ได้ ยังไม่ต้องมีมอนจริง แต่ต้องเดิน flow ตั้งแต่ Intro ถึง Boss Arena ได้ครบ

### Phase 5 — เพิ่มมอนตามฉาก Set 1

ทำ Normal ก่อน, Rare ถัดไป, Elite หลัง balance และ Boss เป็นลำดับสุดท้าย

#### Grass Meadow

- Primary: Grass; secondary: Bug, Normal
- Normal: Grass Slime, Leaf Beast, Meadow Bug
- Rare: Flower Variant
- Elite: Meadow Guardianling
- Boss: Meadow Guardian

#### Ember Valley

- Primary: Fire; secondary: Rock, Ground
- Normal: Fire Slime, Ember Cub, Rock Crawler
- Rare: Ash Variant
- Elite: Ember Brute
- Boss: Ember Guardian

#### Misty Lake

- Primary: Water; secondary: Grass, Flying
- Normal: Water Slime, Lake Otter, Mist Bird
- Rare: Moonlit Water Variant
- Elite: Lake Wardenling
- Boss: Lake Warden

#### Storm Field

- Primary: Electric; secondary: Flying, Steel
- Normal: Electric Slime, Spark Hound, Storm Bird
- Rare: Charged Variant
- Elite: Storm Sentinel
- Boss: Storm Core

กติกา:

- species ต้องมี catalog, asset id, fallback และ metadata ครบ
- spawn table ต้องมี level range และ weight ตรวจสอบได้
- primary/secondary type ต้องผ่าน allowed list
- Boss ใช้ `capturePolicy: disabled`
- Elite ใช้ policy และ modifier กลาง

### Phase 6 — Starter Journey และ Leveling

หลัง Set 1 scene/มอนพื้นฐานเล่นได้ ให้ผูก Lv.1–10:

1. Lv.1–2 เดิน/กล้อง/เข้า scene
2. Lv.2–3 Normal encounter และ Basic Attack
3. Lv.3–4 Recall ก่อน Capture
4. Lv.4–5 Skill 1 และ cooldown
5. Lv.5–6 กลับ Ranch/Heal
6. Lv.6–7 ฝึกและอ่าน Monster Detail
7. Lv.7–8 เจอธาตุที่สอง
8. Lv.8–9 จัด Party
9. Lv.9–10 Evolution preview และ Boss แรก

EXP ต้องมาจาก Battle, Capture, Discovery, Quest, Boss และ Activity ตาม config ใน roadmap หลัก ไม่บังคับให้ผู้เล่น grind Normal อย่างเดียว

### Phase 7 — Set 2–4

ทำ pattern เดิมทีละชุด:

- Set 2: Ice, Rock, Ground, Flying, Poison
- Set 3: Psychic, Ghost, Dark, Steel
- Set 4: Dragon, Fairy, Fighting, Normal

ลำดับของทุกชุด: scene blockout → traversal → environment → stage flow → Normal → Rare → Elite → Boss → reward → mobile/performance QA

## 3. Checklist ต่อฉาก

### Scene

- [ ] stageId/biomeId ถูกต้อง
- [ ] ground/sky/fog/light พร้อม
- [ ] entry/exit/safe area พร้อม
- [ ] player และ camera bounds ถูกต้อง
- [ ] encounter, elite และ boss marker ครบ
- [ ] debug overlay ใช้ตรวจตำแหน่งได้
- [ ] low-quality fallback พร้อม

### Monster

- [ ] species อยู่ใน catalog
- [ ] type และ level range ถูกต้อง
- [ ] asset/fallback โหลดได้
- [ ] spawn weight รวมถูกต้อง
- [ ] capture policy ถูกต้อง
- [ ] Rare/Elite อ่านออกจาก visual/UI
- [ ] Monster Instance สร้างและ save ได้

### Player Experience

- [ ] ผู้เล่นรู้ทางไปต่อ
- [ ] เห็นธาตุเด่นและ recommended level
- [ ] มี Heal ก่อน Boss
- [ ] รู้ Recall ก่อน Capture
- [ ] เห็น reward ก่อนเข้า
- [ ] level up มีคำแนะนำถัดไป
- [ ] modal ไม่บัง combat โดยไม่จำเป็น

## 4. PR Sequence

### PR-Scene-01 — Zone lifecycle

Loader, enter/exit, cleanup, bounds และ lifecycle tests

### PR-Scene-02 — Set 1 blockout

Grass, Ember, Lake, Storm พร้อม debug markers และ traversal tests

### PR-Scene-03 — Set 1 environment

Sky, ground, fog, lighting, landmark, VFX fallback และ performance test

### PR-Stage-01 — Stage flow

Stage Select, Intro, trigger, Elite/Boss marker, clear state และ reward route

### PR-Monster-01 — Set 1 Normal

Species catalog, spawn table, asset mapping และ capture integration

### PR-Monster-02 — Rare/Elite/Boss

Rare variant, Elite modifier, Boss profile, arena behavior และ reward

### PR-Level-01 — Starter Journey

Lv.1–10 quests/tutorial, EXP source breakdown, milestones และ first Evolution

### PR-Content-Set2/3/4

ทำซ้ำ pattern เดิมทีละชุด ไม่รวมหลายชุดใน PR เดียวโดยไม่มี dependency ที่จำเป็น

## 5. Test Gates

### Scene gate

- runtime syntax และ active entry parity ผ่าน
- เข้า/ออก zone ซ้ำได้
- camera/player collision ถูกต้อง
- ไม่มี resource leak จากการสลับ zone

### Encounter gate

- spawn ตรง catalog
- seed เดิมให้ผลเดิม
- จำนวน runtime อยู่ใน budget
- reset encounter ได้
- Normal/Rare/Elite policy ถูกต้อง

### Boss gate

- เข้า arena ตามเงื่อนไข
- phase มี telegraph
- Boss จับไม่ได้
- reward จ่ายครั้งเดียว
- clear state save/load ได้

### Leveling gate

- Starter Journey จบได้โดยไม่ grind ซ้ำ
- EXP 6 source ทำงาน
- duplicate callback ไม่เพิ่ม EXP ซ้ำ
- Lv.100 ไม่ลบ Monster Instance
- Mastery หลัง Lv.100 เพิ่มได้

### Mobile gate

- ทดสอบ 360×800 portrait, 412×915 portrait และ 800×360 landscape
- Stage Intro/Reward เป็น bottom sheet
- ปุ่มหลักกดง่าย
- UI ไม่บัง target หรือ Boss bar

## 6. Definition of Done: Set 1

Set 1 เสร็จเมื่อ:

- ฉาก 4 แห่งเดินได้จริงก่อน encounter
- แต่ละฉากมี landmark และ environment identity
- แต่ละฉากมี Normal, Rare, Elite และ Boss ตาม catalog
- เล่นได้ครบ สำรวจ → ต่อสู้ → Recall → จับ → Heal → ฝึก → Evolution → Boss
- Starter Journey Lv.1–10 จบได้
- EXP หลาย source และ UI อธิบายได้
- progress/reward save/load ถูกต้อง
- Boss/Elite policy ถูกต้อง
- portrait/landscape และ performance ผ่าน
- มี test และเอกสารครบ

## 7. ลำดับลงมือจริง

1. ทำ zone lifecycle
2. ทำ Grass Meadow blockout เป็น reference scene
3. ตรวจเดิน/กล้อง/entry/exit บนมือถือ
4. ทำ Ember, Lake และ Storm blockout
5. ใส่ environment และ landmark
6. ผูก Stage Select และ trigger
7. ใส่ Normal Monster ตามฉาก
8. ทดสอบ capture, save และ party
9. ใส่ Rare และ Elite
10. ใส่ Boss และ reward
11. ผูก Starter Journey Lv.1–10
12. เปิด PR Set 1 เมื่อผ่าน DoD
13. ทำ Set 2 ต่อเมื่อปัญหาจาก Set 1 ถูกปิด

**กฎสำคัญ:** ฉากต้องเล่นได้ก่อนมอนสเตอร์ และ Normal Monster ต้องสมดุลก่อน Rare/Elite/Boss เสมอ
