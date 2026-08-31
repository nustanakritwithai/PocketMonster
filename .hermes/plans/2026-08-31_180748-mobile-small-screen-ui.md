# Mobile Small-Screen HUD Compaction Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** ปรับ HUD และแผงควบคุมบนมือถือจอเล็กให้ไม่ทับกัน ลดพื้นที่ที่บังเกม และยังคงกด/ลากด้วยนิ้วได้จริงทุกโหมดของ V9

**Architecture:** ใช้ “viewport budget” ตามความสูงจอและ coarse pointer แทนการย่อทั้งหน้าแบบเดียว โดยแยกขนาดภาพ (visual size) ออกจากพื้นที่สัมผัสขั้นต่ำ 48px, กำหนดพื้นที่สงวนด้านบน/ล่างด้วย CSS variables และจัดลำดับการลดรายละเอียดเมื่อพื้นที่ไม่พอ จากนั้นวัด geometry จริงใน Pirate, Pocket/capture และ overlay states ด้วย touch input จริง

**Tech Stack:** HTML/CSS, JavaScript ES modules, Node test harness, Chrome CDP mobile emulation

---

## Current context

- HUD หลักส่วนใหญ่กำหนดใน `style-v800.css`; V9 shared Pirate/Pocket controls และ iframe overrides อยู่ใน `style-v900.css`.
- `style-v800.css:148-203` มี safe-area variables, touch minimum 48px และ short-height rules เดิม แต่มีหลาย media pass ซ้อนกันและกำหนด `top`/`bottom` แบบค่าคงที่ จึงเสี่ยงชนกันบนจอเตี้ย.
- `style-v900.css:75-114` ใช้ action cluster แบบ absolute และย่อทั้ง `.controls-right` ที่ `max-height:420px`; การ scale ทั้ง cluster อาจทำให้ปุ่มดูใหญ่/ทับกันหรือ hit target เล็กตามไปด้วย.
- `tests/p0-ux1-short-height.mjs` มี geometry checks สำหรับ topbar, target, party, reason และ action buttons แต่ยังไม่รวม V9 fullscreen button, quest tracker/toggle, onboarding proxies และพื้นที่เกมที่เหลือให้มองเห็น.
- จุดทดสอบหลัก: 740×280, 740×300, 844×300, 740×360, 844×390, 915×412 และ desktop control 1280×720.
- ห้ามแก้ด้วยการซ่อนแผงควบคุมมือถือทั้งชุด เพราะ PR #374 กำหนดให้ controls แสดงตลอด onboarding.

### Browser-verified baseline — 2026-08-31

ตรวจ runtime ที่ deploy จริงผ่าน guest flow: launcher `https://pocketmonster-game.web.app/` redirect ไป `https://nustanakritwithai.github.io/PocketMonster/?world=pirate-fruit&panel=human`, top-level สร้าง `#onlineWorldSceneFrame` และ scene สร้าง sandboxed `#pirateFruitFrame` อีกชั้นหนึ่ง.

- ที่ `568×320`, coarse pointer + `navigator.maxTouchPoints=5`, outer scene controls วัดได้จริง: fullscreen `41×41`, skill 1–3 `41×41`, skill 4 `43×43`, summon/recall/block/weapon/potion `41×41`, zoom `21×21`; มีเพียง primary capture `60×60` ที่ผ่านขั้นต่ำ 48px.
- ที่ `740×280` ได้ขนาดต่ำกว่า 48px ชุดเดียวกัน: fullscreen/skills/utility `41–43px`, zoom `21px`; จึงเป็น regression ที่เกิดจาก visual scaling จริง ไม่ใช่การคาดเดาจาก CSS.
- ระหว่าง onboarding ที่ `568×320`, proxy `prev` วัดได้ `28×19` และ `pause` `32×19`, ต่ำกว่า acceptance criterion อย่างชัดเจน.
- Screenshot จริงแสดง top chrome หลาย owner ซ้อนในแนวตั้งเดียวกัน: child minimap, WORLD ONLINE banner, account/session pill, chat toggle, Pirate utility/status และ fullscreen; ด้านล่างมี player status/guide/zoom/action arc พร้อมกันจนกินพื้นที่เกมมาก.
- Real CDP touch บน onboarding Pause ทำให้ proxy หาย `2 → 0` และ shared controls ยัง visible พร้อมปุ่ม 14 ปุ่มหลังปิด overlay; behavior นี้เป็น positive baseline ที่ห้ามทำพัง.
- Real dual touch ที่ `667×375` ส่ง pointer คนละ ID เข้า `#joystick` และ `#captureBtn` ครบ `pointerdown → pointerup`; ต้องรักษา multi-pointer ownership นี้หลังจัด layout.
- `#pirateFruitFrame` ใช้ sandbox `allow-scripts allow-pointer-lock allow-fullscreen` โดยไม่มี `allow-same-origin`; parent จึงอ่าน child DOM geometry โดยตรงไม่ได้ แม้ URL อยู่ origin เดียวกัน. Browser geometry harness ต้องวัดภายใน child แล้วส่ง sanitized report ผ่าน contract ที่จำกัด source/origin/schema แทนการถอด sandbox.
- `tests/p0-ux1-short-height.mjs` ปัจจุบันมีเพียง 7 viewport entries, ยังขาด `568×320` และ `667×375`, ตรวจเฉพาะ Pocket action selectors และบังคับ target/party/reason ให้ visible เสมอ ซึ่งขัดกับ compact-tier design ที่อนุญาตให้ collapse.

## Acceptance criteria

1. ไม่มี UI ด้านบนทับ UI ด้านล่าง หรือทับ action cluster ในทุก viewport ที่ระบุ.
2. ปุ่ม action, fullscreen, close, pause และ joystick interaction มีพื้นที่สัมผัสอย่างน้อย 48×48 CSS px; ปุ่มที่วาดเล็กกว่าได้ต้องมี transparent hit area ครบ 48px.
3. Pirate/Pocket controls แสดงก่อน runtime พร้อม, ระหว่าง onboarding และหลังปิด onboarding.
4. HUD chrome รวมกันบังพื้นที่เกมไม่เกินเป้าหมาย:
   - จอสูง ≤320px: top chrome ≤52px, bottom/side chrome ≤35% ของพื้นที่ภาพ
   - จอสูง 321–420px: top chrome ≤60px, bottom/side chrome ≤32%
5. ข้อความรองที่ไม่จำเป็นถูก clamp/ย่อ/ย้ายเข้าปุ่มเปิดดู แทนการย่อปุ่มหลักจนกดยาก.
6. ไม่มี horizontal/vertical document overflow เกิน 1px.
7. ผ่าน real `touchStart`/`touchEnd` สำหรับ joystick + action พร้อมกัน, fullscreen และ onboarding proxy.
8. Browser harness วัดทั้ง parent, scene และ sandboxed Pirate child โดยไม่เพิ่ม `allow-same-origin` และไม่ขยายข้อมูล telemetry เกิน geometry/visibility/semantic ID ที่จำเป็น.
9. Production run ต้องบันทึก launcher URL, final URL, HTML/CSS/module revision และ viewport ก่อนรับ screenshot เป็นหลักฐาน เพื่อแยก source ปัจจุบันออกจาก stale deployed cache.

---

### Task 1: เก็บ baseline geometry และจัดหมวด UI ที่ชนกัน

**Objective:** ระบุคู่ element ที่ทับกันจริงและพื้นที่เกมที่ถูกบังก่อนแก้ เพื่อไม่ปรับ CSS แบบเดา.

**Files:**
- Modify: `tests/p0-ux1-short-height.mjs:1-103`
- Create: `tests/v90-mobile-hud-geometry.mjs`

**Steps:**
1. เพิ่ม selectors สำหรับ `#persistentFullscreenBtn`, `#stageObjective`, `#stageObjectiveToggle`, `#globalCharacterBtn`, `#chatToggleBtn`, joystick active area และ onboarding proxy layer.
2. เพิ่ม geometry pairs: topbar×quest, topbar×fullscreen, party×joystick, party×actions, quest×joystick, fullscreen×top chrome, proxy×action cluster.
3. เพิ่ม calculation ของ `unobstructedGameArea` และ `chromeCoverageRatio` โดยนับเฉพาะ visible rects และ union rect ไม่บวกพื้นที่ซ้ำสองครั้ง.
4. เพิ่ม viewport 667×375 และ 568×320 เพื่อครอบคลุมมือถือจอเล็กจริง.
5. รัน `node tests/p0-ux1-short-height.mjs`; expected: unit helpers PASS.
6. เปิด V9 ด้วย Chrome CDP แบบ coarse pointer ในแต่ละ viewport เก็บ JSON geometry + screenshot สำหรับ Pirate onboarding, Pirate gameplay และ Pocket capture.
7. บันทึก baseline violations ใน test fixture โดยไม่แก้ CSS ใน task นี้.

### Task 1A: สร้าง cross-frame geometry probe สำหรับ Pirate sandbox

**Objective:** วัด HUD child จริงได้โดยคง sandbox security boundary และทำให้ automated test เห็น overlap ข้าม parent/scene/child.

**Files:**
- Create: `pirate-fruit-offline/mobile-hud-geometry-probe-v900.mjs`
- Create: `mobile-hud-geometry-collector-v900.mjs`
- Modify: `pirate-fruit-offline/index.html` เฉพาะ module entry/cache revision
- Modify: `scene-v900.html` และ `entry-preload.mjs` สำหรับ collector lifecycle
- Create: `tests/v90-mobile-hud-cross-frame-geometry.mjs`

**Steps:**
1. เขียน failing tests สำหรับ message type, exact allowed semantic IDs, finite/clamped rects, viewport/revision/generation และ maximum payload size.
2. Child วัดเฉพาะ rect/visibility ของ minimap, player bars, quest/tutorial card, child utilities และ transient banners; ห้ามส่ง DOM, text ผู้เล่น, token หรือ mutable runtime object.
3. Child post report ไป `allowedParentOrigin`; scene รับเฉพาะ `event.source === pirateFruitFrame.contentWindow`, opaque `event.origin === 'null'`, schema version และ current frame generation.
4. Scene รวม child rectsกับ shared control rectsใน coordinate system เดียว เพราะ iframe เต็ม viewport; หากภายหลัง frame ไม่เต็มจอให้แปลงด้วย frame offset/scale ที่วัดจริง.
5. Collector คำนวณ union coverage และ overlap pairs โดยไม่บวกพื้นที่ซ้ำ และ clear report เมื่อ iframe reload/world switch/pagehide/teardown.
6. Rate-limit probe ≤5Hz ใน QA mode และ disable ใน production ปกติ เว้นแต่เปิด deterministic test flag; ห้ามสร้าง RAF/polling loop ถาวร.
7. ทดสอบ spoofed source, wrong origin, stale generation, oversized payload, NaN/Infinity และ child unavailable.
8. รัน `node tests/v90-mobile-hud-cross-frame-geometry.mjs`; expected: PASS โดย sandbox ยังไม่มี `allow-same-origin`.

---

### Task 2: สร้าง CSS viewport-budget variables กลาง

**Objective:** ให้ทุก HUD region ใช้ชุดขนาดและ inset เดียวกัน แทน media rules ที่กระจัดกระจาย.

**Files:**
- Modify: `style-v800.css` ใกล้ `/* UX1 Combat HUD Foundation */`
- Test: `tests/p0-ux1-combat-hud.mjs`
- Test: `tests/p0-ux1-short-height.mjs`

**Steps:**
1. เขียน failing assertions สำหรับ variables: `--hud-top-budget`, `--hud-bottom-budget`, `--hud-visual-scale`, `--hud-gap`, `--hud-hit-min`.
2. กำหนดค่า default และ overrides ที่ใช้ `@media (pointer:coarse) and (orientation:landscape) and (max-height:420px)` และ tier เพิ่มที่ `max-height:320px`.
3. ใช้ `clamp()` สำหรับ visual dimensions และ font size แต่ตรึง `--hud-hit-min:48px`.
4. เปลี่ยนตำแหน่งหลักให้ผูกกับ safe area + budget variables โดยไม่เปลี่ยน desktop layout.
5. รัน `node tests/p0-ux1-combat-hud.mjs && node tests/p0-ux1-short-height.mjs`; expected: PASS.

---

### Task 3: Compact top HUD และข้อความที่บังกลางจอ

**Objective:** ลดความสูงและความกว้างของ topbar/target/quest โดยรักษาข้อมูลสำคัญและปุ่มที่กดได้.

**Files:**
- Modify: `style-v800.css` rules สำหรับ `.compact-topbar`, `.pill`, `.target-card`, `.quest-tracker`, `.quest-tracker-toggle`, `.message`, `.hunt-btn`
- Modify: `style-v900.css:17-22,115-118` เฉพาะ V9 overrides
- Test: `tests/p0-ux1-short-height.mjs`
- Test: `tests/v90-mobile-hud-geometry.mjs`

**Steps:**
1. เพิ่ม failing geometry assertions ว่า topbar ไม่ชน target/quest/fullscreen.
2. จอ ≤420px: ลด padding/font, ซ่อน label รอง, จำกัด pill ให้หนึ่งบรรทัดด้วย ellipsis และย้ายข้อมูลที่ไม่จำเป็นเข้า utility menu.
3. จอ ≤320px: เปลี่ยน quest tracker เป็นปุ่ม compact ตามค่าเริ่มต้น; เปิด card เมื่อผู้ใช้แตะเท่านั้น.
4. Clamp target text และซ่อนรายละเอียดรองก่อนลด HP/bar ที่จำเป็น.
5. ใช้ logical safe inset (`var(--safe-top/right/left)`) ทุกตำแหน่ง.
6. รัน focused tests และตรวจ screenshot เปรียบเทียบทุก viewport.

---

### Task 4: Compact bottom HUD โดยไม่ลด touch targets

**Objective:** ลด party strip และ action chrome ที่บังจอ พร้อมไม่ให้ joystick/action ชนกัน.

**Files:**
- Modify: `style-v800.css` rules สำหรับ `.party`, `.party-slot.compact`, `.controls-left`, `.controls-right`, `.action-reason`
- Modify: `style-v900.css:75-114`
- Test: `tests/p0-ux1-short-height.mjs`
- Test: `tests/v90-persistent-fullscreen-input.mjs`
- Test: `tests/v90-mobile-hud-geometry.mjs`

**Steps:**
1. เพิ่ม failing assertions สำหรับ party×joystick, party×actions และ minimum hit boxes.
2. เพิ่ม failing assertions จาก baseline จริงว่า fullscreen/skill/summon/recall/block/weapon/potions/zoom ทุกปุ่มมี **outer event target rect** ≥48×48; ห้ามนับ icon/pseudo-element เป็น hit rect หาก pointer target จริงยังเล็ก.
3. ลดเฉพาะ visual circle/icon ด้วย pseudo-element หรือ inner visual; ให้ outer button/hit regionคง ≥48px และ hit rect โปร่งใสของปุ่มข้างเคียงไม่ overlap กัน.
4. จัด action cluster ด้วย variables ต่อ tier แทน `transform:scale()` ทั้ง container เพื่อไม่ทำให้ hit targetเล็ก; expected หลังแก้คือ baseline `41–43px` และ `21px` กลายเป็นอย่างน้อย `48px` โดยยังอยู่ใน viewport.
5. จอ ≤320px: ลด party card เหลือ portrait + HP/state, ซ่อน metadata รอง และจำกัดจำนวน card ที่เห็นพร้อมกันโดยให้ scroll แนวนอน.
6. ย้าย `action-reason` ไปเหนือ party หรือ auto-hide หลังเวลาสั้น แทนวางในพื้นที่ action cluster.
7. คง joystick input zone กว้างพอสำหรับนิ้ว แต่ลดเฉพาะ visual base/knob.
8. ตรวจ fullscreen button ยังอยู่กลางบน, ไม่ชน topbar และรับ touch ได้หนึ่งครั้ง.

---

### Task 5: Compact modal/sheet และ onboarding สำหรับจอเตี้ย

**Objective:** ทำให้ overlays ใช้พื้นที่แนวตั้งอย่างมีลำดับและไม่ซ้อนกับ controls ที่ต้องแสดงตลอด.

**Files:**
- Modify: `style-v800.css` blocks `Character UI mobile landscape overflow guard`, `Mobile menu density pass`, NPC sheets และ stage sheets
- Modify: `pirate-fruit-offline/assets/index-C3SJLfq8.css` เฉพาะเมื่อยืนยันว่า source CSS นี้เป็น asset ที่ deploy จริงและไม่มี source upstream อื่น
- Test: `tests/v80-character-ui-mobile-landscape-overflow.mjs`
- Test: `tests/v80-mobile-menu-density.mjs`
- Test: `tests/v90-pirate-onboarding-overlay.mjs`

**Steps:**
1. เขียน failing tests สำหรับ `max-height`, internal scroll, compact header และ landscape short-height breakpoint.
2. ให้ sheet ใช้ `max-height:calc(100dvh - safe areas)` และ scroll ภายใน; ห้าม document scroll.
3. ซ่อนคำอธิบายยาว/ภาพตกแต่งก่อนลด action buttons.
4. Onboarding card ใช้ short-height + coarse-pointer rule; clamp body copy และคงปุ่ม ย้อน/พักไว้/ทำต่อ ≥48px.
5. Proxy outer rect ต้อง ≥48×48 แม้ child visual button วาดเพียง `28×19`/`32×19`; proxy ต้องตรงกับ semantic action และห้าม overlap proxy ข้างเคียงหรือ shared controls.
6. คง parent controls visible; proxies อยู่เฉพาะ rect ของ onboarding actions และถูกลบเมื่อ overlay ปิด.
7. ทดสอบ real touch บน “พักไว้” และยืนยัน proxy count `2 → 0`, controls root ยัง visible และ shared buttons ยัง mount เพียงชุดเดียว.

---

### Task 6: Cache-bust production chain และป้องกัน regression

**Objective:** ให้ browser โหลด CSS/HTML/module ใหม่ครบทุก entry หลังแก้ layout.

**Files:**
- Modify: `index.html`
- Modify: `v900.html`
- Modify: `scene-v900.html`
- Modify: `online-world-shell-v900.mjs` หาก scene HTML เปลี่ยน
- Modify: Pirate offline entry/import chain หาก child CSS เปลี่ยน
- Modify: cache assertions ใน `tests/v90-unified-online-world.mjs`, `tests/v90-unified-pages-artifact.mjs`, `tests/v90-pirate-save-integration.mjs`

**Steps:**
1. Bump `style-v800.css` และ `style-v900.css` references ในทุก HTML entry ที่ใช้ไฟล์เหล่านี้.
2. หาก `scene-v900.html` เปลี่ยน ให้ bump `shellRevision` และ upstream shell → entry preload → top-level HTML chain.
3. หาก Pirate child asset เปลี่ยน ให้ bump offline HTML URL → Pirate boot → world catalog → shell/scene consumers.
4. เพิ่ม exact-version assertions เพื่อป้องกัน stale edge.
5. รัน cache-chain tests; expected: PASS.

---

### Task 7: Full verification matrix และ rollout

**Objective:** พิสูจน์ว่า layout ไม่ทับกันและ gameplay touch ยังทำงานก่อน merge/deploy.

**Files:**
- Test: all files above
- No production edits unless verification finds a proven failure

**Automated commands:**
1. `node tests/p0-ux1-short-height.mjs`
2. `node tests/p0-ux1-combat-hud.mjs`
3. `node tests/v80-character-ui-mobile-landscape-overflow.mjs`
4. `node tests/v80-mobile-menu-density.mjs`
5. `npm run test:v90:pirate-player`
6. `npm run check`
7. `npm run build:pages`
8. `node tests/v90-unified-pages-artifact.mjs`
9. `node tests/v90-deployment-gates.mjs`

**Browser matrix (real touch, landscape):**
- 568×320, 667×375, 740×280, 740×300, 844×300, 740×360, 844×390, 915×412.
- States: login/immersive, Pirate loading, Pirate onboarding, Pirate gameplay, Pocket capture, quest open/closed, character quick panel, utility menu.
- Interactions: joystick + camera dual touch, joystick + attack, fullscreen, onboarding Pause, quest close, menu close.

**Pass evidence per viewport/state:**
- Geometry JSON has `violations: []`.
- `chromeCoverageRatio` within acceptance target.
- Required touch rectangles ≥48×48.
- Screenshot shows no top/bottom overlap and meaningful visible game area.
- Controls remain visible through onboarding lifecycle.
- Viewport matrix มี 9 entries รวม desktop control: mobile 8 ขนาดตามรายการ + `1280×720`; unit test ห้ามคง assertion เดิมที่ count = 7.
- State-aware geometry contract แยก `required-visible`, `allowed-collapsed`, `required-hidden` ต่อ tier/state; ห้ามบังคับ target/party/reason visible ใน ultra-compact แล้วรายงาน false failure.
- Touch trace ที่ `667×375` ต้องมี pointer IDs แยกระหว่าง joystick กับ action และแต่ละ targetได้รับ down/up อย่างละหนึ่งครั้ง.
- Onboarding Pause trace ต้องรักษา positive baseline: proxy ถูกลบหลัง touch และ controls ไม่หาย.
- Production evidence ระบุ final deployed URL/revision; local source test ต้องเปิด built local artifact โดยไม่ยอมให้ redirect ไป production แล้วเข้าใจผิดว่าเป็นโค้ด local.

## Risks and tradeoffs

- ลด visual size ได้ แต่ห้ามลด hit target ต่ำกว่า 48px; hit areas ที่โปร่งใสต้องไม่ซ้อนกันเอง.
- การใช้ `transform:scale()` บน parent control cluster ทำให้ทั้งภาพและ hit testing ย่อ จึงควรเลิกใช้ใน compact tier.
- CSS ใน `style-v800.css` มีหลาย historical media pass; override ใหม่ต้องอยู่ใน block ที่มีชื่อชัดเจนและมี tests ไม่ควรแก้กฎกระจัดกระจายหลายจุด.
- จอ 740×280 รุนแรงมาก อาจต้อง collapse nonessential panels เป็น toggles แทนการพยายามแสดงทุกอย่างพร้อมกัน.
- การแก้ minified Pirate asset โดยตรงเป็นทางเลือกสุดท้าย; ต้องหา source ที่ build asset ก่อนเสมอ.

## Open questions to resolve during baseline capture

1. UI ที่ผู้ใช้เห็นทับกันอยู่ใน Pirate gameplay, Pocket capture หรือทั้งสองโหมด?
2. อุปกรณ์จริงมี viewport/CSS pixels และ safe-area inset เท่าไร?
3. Party bar และ quest card รายการใดจำเป็นต้องเห็นตลอด เทียบกับยอม collapse เป็นปุ่มได้?
4. ต้องการให้ fullscreen button อยู่บนสุดกลางเหมือนปัจจุบัน หรือย้ายชิดมุมเพื่อคืนพื้นที่ภาพกลางจอ?
