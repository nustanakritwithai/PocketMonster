# Unified MMORPG HUD + Pocket Feature Dock Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** ออกแบบและสร้าง UI หลักเพียงระบบเดียวสำหรับ Pirate/Pocket/Living World โดยย้ายฟังก์ชันที่จำเป็นจาก HUD ฝั่ง Pocket มาอยู่ในแผง “MMORPG Monitor Dock” ด้านล่าง ซึ่งมีแท็บ แชท, เควส และ Party โดยไม่สร้าง HUD ซ้ำและไม่บังพื้นที่บังคับเกมบนมือถือจอเล็ก

**Architecture:** ให้ parent V9 document เป็นเจ้าของ HUD ที่มองเห็นและรับ touch เพียงชุดเดียว ขณะที่ Pirate iframe และ Pocket gameplay runtime ทำหน้าที่เป็น data/action adapters เท่านั้น แยก state จาก rendering ผ่าน snapshot + command contract กลาง แล้วให้ `unified-mmorpg-hud-v900.mjs` render bottom dock, top status และ control clearance จาก state เดียว ระบบเดิมยังทำงานอยู่ใน migration phase แต่ถูกปิดการมองเห็นทีละส่วนหลัง contract/test ผ่านครบ ไม่ซ่อนหรือรื้อ runtime logic ก่อนมีตัวแทนใน UI ใหม่

**Tech Stack:** HTML/CSS, JavaScript ES modules, DOM CustomEvent/subscription contracts, existing REST/WebSocket chat runtime, Node test harness, Chrome CDP mobile emulation with real pointer/touch input

---

## 1. Current context

- `index.html:114-180` มี Pocket HUD แยกหลายชิ้น ได้แก่ message, target card, `#party`, character entry, shared controls และ `#stageObjective`.
- `style-v900.css:43-55` ซ่อน Pocket HUD หลายส่วนเมื่ออยู่ Pirate human panel ทำให้ฟังก์ชัน Party/Quest/character ไม่ได้ถูกนำมาแสดงใน UI หลักอย่างครบถ้วน.
- `style-v900.css:73-114` มี shared Pirate/Pocket mobile controls แล้ว แต่ยังเป็น control surface อย่างเดียว ยังไม่มี shared information dock.
- `unified-mobile-controls-v900.mjs:5-218` มี adapter ต่อ world สำหรับ movement/camera/action แล้ว แนวทางใหม่ควรต่อยอด pattern นี้ ไม่สร้าง pointer lifecycle ชุดที่สอง.
- `pirate-fruit-offline/unified-input-bridge-v900.mjs:15-30,149-173` เป็น command-only bridge: ส่ง movement/camera/action เข้า Pirate child ได้ แต่ยังไม่มี player HP/resource, target, buffs, cooldown, inventory count หรือ action availability กลับมาที่ parent. แผนต้องสร้าง telemetry contract แบบ sanitize แยกต่างหากก่อน render status ตามภาพ.
- `pirate-fruit-control-hud-v900.mjs:5-17` ปิด HUD เดิมใน Pirate iframe อยู่แล้ว Parent V9 จึงควรเป็น visual authority ต่อไป.
- `game-v800.js:2569-2648` เป็นแหล่งข้อมูลและคำสั่งของ quest tracker.
- `game-v800.js:6587-6673` เป็นแหล่งข้อมูลและคำสั่ง Party รวม HP, fainted, active/summoned, selected slot และ switch action.
- `chat-runtime.mjs:103-170,315-336` ผูกทั้ง transport state และ DOM ของแชทเข้าด้วยกัน ปัจจุบันรองรับ WORLD/ZONE และต้องรักษา auth/abort/reconnect behavior เดิม.
- `tests/chat-ui-layout.mjs` ตรวจตำแหน่ง chat แบบ panel เดิม และ `tests/v90-chat-runtime-lifecycle.mjs` ป้องกัน stale authenticated requests; การออกแบบใหม่ต้องแก้ layout test โดยไม่ลด lifecycle guarantees.
- แผน compact เดิมอยู่ที่ `.hermes/plans/2026-08-31_180748-mobile-small-screen-ui.md`; งานใหม่นี้ครอบ design/architecture ของ HUD และต้องใช้ compact tiers/48px touch target จากแผนเดิมเป็นข้อบังคับ.
- Browser audit ของ production guest flow ยืนยันปัญหาจริงแล้ว: ที่ `568×320` และ `740×280` fullscreen/skills/utility เหลือ `41–43px`, zoom เหลือ `21px`, onboarding proxies เหลือ `28×19`/`32×19`; ส่วน real dual touch ที่ `667×375` ยังแยก pointer ของ joystick/capture ได้ถูกต้อง. ให้ใช้ baseline/cross-frame probe และ state-aware geometry gates ที่เพิ่มในแผน compact เป็น prerequisite ของ Tasks 1, 5D, 7 และ 11.
- Pirate child อยู่ใน sandbox แบบ opaque origin (`allow-scripts allow-pointer-lock allow-fullscreen` ไม่มี `allow-same-origin`) จึงห้ามแก้ test ด้วยการเปิดสิทธิ์เพิ่มหรืออ่าน child DOM จาก parent; geometry/HUD telemetry ต้องส่งผ่าน schema/source/generation-validated message contract เท่านั้น.

## 2. Product decisions for the new HUD

### 2.0 Visual reference direction

ใช้ภาพอ้างอิง `C:\Users\Admin\Downloads\Telegram Desktop\photo_2026-08-31_18-27-29.jpg` เป็นทิศทางด้านองค์ประกอบและความหนาแน่นของข้อมูล โดยไม่คัดลอก asset/logo ของเกมต้นฉบับ:

- **Top-left player status:** portrait ขนาดเล็ก + HP/secondary resource bars + level/name แบบบรรทัดสั้น เป็น status block หลักแทน topbar ยาวเต็มจอ.
- **Left quest module:** quest tracker เป็น panel แนวตั้งพื้นหลังดำโปร่ง มีขอบสีทอง/เขียวและปุ่มยุบติดขอบ; บน PocketMonster จะย้ายเนื้อหาเดียวกันเข้ากับ Quest tab ของ Dock แต่เมื่อพื้นที่พอสามารถ pin panel ทางซ้ายได้.
- **Top-right world utility:** minimap/connection/world status อยู่มุมขวาบน แยกจาก action cluster; ถ้ายังไม่มี minimap จริงให้ใช้ compact world/zone badge ห้ามสร้างแผนที่ปลอม.
- **Right-middle contextual roster:** target/nearby/Party status ใช้แถวสั้นที่มี portrait หรือ status icon + HP bar ไม่ใช้ card ขนาดใหญ่.
- **Bottom-center MMORPG console:** chat log เป็นแถบโปร่งใสต่ำตรงกลางล่าง มีข้อความ 2–4 บรรทัด และ icon tabs สำหรับ Chat/Quest/Party; เมื่อ expanded จึงแสดง input และรายละเอียดเต็ม.
- **Bottom-right combat wheel:** action buttons กระจายเป็นวง/arc รอบปุ่มหลัก คล้ายภาพอ้างอิง แต่ใช้ตำแหน่งจาก clearance tokens และคง hit target 48px; ห้าม scale container ทั้งชุด.
- **Bottom-left movement:** joystick อยู่มุมซ้ายล่างหรือเกิด ณ จุดแตะ โดยไม่วาง panel ทึบใต้ joystick.
- **Visual language:** panel สีดำ/น้ำเงินเข้มโปร่งประมาณ 65–78%, เส้นขอบทองหม่น/เขียว, HP แดง, resource ฟ้า, quest/progress เขียว, text off-white; ลด glow และจำนวนสีพร้อมกันเพื่อให้เกมอ่านง่ายบนจอเล็ก.
- **Information density rule:** แสดงข้อมูลสำคัญเป็น bars/icons ก่อนข้อความยาว; ข้อมูลรองยุบได้ทันที และต้องไม่ปล่อยชื่อ/ข้อความหลายชั้นล้นกลางจอเหมือนสถานการณ์ผู้เล่นหนาแน่นในภาพ.

ภาพอ้างอิงใช้เพื่อกำหนด “ตำแหน่งและลำดับความสำคัญ” ไม่ใช่ให้แสดงทุก panel พร้อมกันบนจอสูง ≤320px; compact tiers ยังคงบังคับ collapse ตามพื้นที่จริง.

### 2.0.1 Authoritative pixel blueprint — ห้ามเปลี่ยนองค์ประกอบเอง

ภาพอ้างอิงมี canvas `1080×608px` และเป็น golden composition ของงานนี้ การ implement ที่ viewport นี้ต้องวาง region ตามตารางต่อไปนี้ โดยยอมให้คลาดเคลื่อนจากกรอบอ้างอิงไม่เกิน `±4px` ต่อขอบหลังหัก safe area แล้ว:

| Region | Reference bounds (x1,y1 → x2,y2) | Normalized bounds | หน้าที่ |
|---|---:|---:|---|
| Player status | `4,4 → 418,84` | x `0.4–38.7%`, y `0.7–13.8%` | portrait, name/level, HP, resource และ mode strip |
| Quest panel | `28,88 → 253,321` | x `2.6–23.4%`, y `14.5–52.8%` | quest title, 3 objective rows, reward/progress footer |
| Left vertical tabs | `0,123 → 33,298` | x `0–3.1%`, y `20.2–49.0%` | quest/event/pin shortcuts |
| System banner | `317,62 → 773,132` | x `29.4–71.6%`, y `10.2–21.7%` | tutorial/system message; ไม่เป็น HUD ถาวร |
| Target/Party roster | `675,157 → 833,264` | x `62.5–77.1%`, y `25.8–43.4%` | 3 compact rows พร้อม icon/status/HP |
| Minimap | `911,0 → 1078,171` | x `84.4–99.8%`, y `0–28.1%` | real map, player heading, POI/players และ map controls |
| Right utilities | `955,186 → 1078,277` | x `88.4–99.8%`, y `30.6–45.6%` | bag/menu/secondary utility buttons |
| Companion shortcuts | `904,287 → 1078,354` | x `83.7–99.8%`, y `47.2–58.2%` | 3 circular monster portraits/status shortcuts |
| Combat action cluster | `789,335 → 1079,607` | x `73.1–99.9%`, y `55.1–99.8%` | main action + skills arranged as the same right-side arc |
| Chat console | `351,512 → 704,608` | x `32.5–65.2%`, y `84.2–100%` | 2–4 log rows, Chat/Quest/Party tabs, input when expanded |
| Bottom system strip | `0,576 → 350,608` | x `0–32.4%`, y `94.7–100%` | connection/device/time/quick system buttons |

**องค์ประกอบย่อยที่ต้องมีครบตามภาพ:**

- Top-left: portrait, level badge, name/title line, HP bar + current/max, secondary resource bar + current/max, mode/percentage row, 2 compact selectors และ buff/status icons 1 แถว.
- Top-center: quick-state circles `1–5` หรือจำนวน action slots ที่ runtime มีจริง โดยแสดง cooldown/selected state; ใต้ลงมาเป็น transient system/tutorial banner.
- Top-right: minimap, local marker/heading, remote/POI markers, map expand/control, home/world utility และ menu/exit utility ที่ map ไปยังคำสั่งจริง.
- Left: vertical tab rail, quest title, objective bullets, highlighted numeric progress/reward, footer action และ mute/settings row เฉพาะเมื่อมี command จริง.
- Right-middle: selected target row และ Party rowsแบบ stacked bars; companion portrait shortcuts 3 ช่องอยู่ถัดลงมา.
- Bottom-center: compact chat rows, system/channel prefix, tab controls, unread, input/send ใน expanded state, adjacent microphone/user/mail/settings shortcutsเมื่อมี feature จริง.
- Bottom-right: primary action, 4 skills, summon/dash/recall, block/weapon/potions ตาม active world, cooldown masks, disabled/empty state และ resource counts.
- Bottom-left: movement touch zone + compact connection/ping/time strip; ห้ามอ่าน battery/deviceข้อมูลที่ browser ให้ไม่ได้หรือปลอมค่า.

วงกลมดำพร้อมลูกศรสีขาวขนาดใหญ่ที่ทับมุมขวาล่างในไฟล์ภาพถือเป็น **viewer/annotation overlay ไม่ใช่ HUD เกม** และห้ามนำมาสร้างใน PocketMonster.

**Internal proportions at 1080×608:**

1. Player portrait visual `60–64px`; status block สูงประมาณ `80px`. HP bar อยู่บน, resource bar อยู่ถัดลงมา, mode/percentage strip อยู่ล่างสุด. Buff icons เรียงหนึ่งแถวใต้ status block ไม่เกิน 7 icons.
2. Quest panel กว้างประมาณ `225px`, พื้นหลังดำโปร่ง, header `36–40px`, objective 3 แถว แถวละ `40–48px`, footer แสดง progress/reward และมี action row ด้านล่าง. ขอบซ้ายมี vertical tab rail แบบภาพ.
3. Minimap เป็นกรอบเกือบสี่เหลี่ยม `167×171px`; ห้ามแทนด้วยปุ่มกลมเพียงปุ่มเดียว. ต้องวาดข้อมูลจาก `pirate-fruit-island-map-v900.mjs`, Pocket zone data และ presence snapshots ที่มีจริง.
4. Target/Party roster ใช้ 3 rows สูง `30–36px`; row ที่เลือกมีขอบทอง, row อันตราย/HP ต่ำใช้แดง, status icon อยู่ซ้ายและ HP bar อยู่ใน row.
5. Companion shortcuts เป็น portrait กลม 3 ช่อง ขนาดภาพประมาณ `54–60px`; touch rect อย่างน้อย `48px` และมี selected/active ring.
6. Action cluster ต้องมี primary button ใหญ่สุดบริเวณขวาล่าง, skill circles ล้อมเป็น arc, utility combat actions อยู่ทางซ้ายของวง และ cooldown แสดงตัวเลขตรงกลาง. ห้ามเปลี่ยนเป็น grid หรือ rectangular tray.
7. Chat console อยู่กลางล่าง ไม่ชิดซ้ายหรือขวา กว้างประมาณหนึ่งในสามจอและสูงประมาณ `96px`; background โปร่งกว่าพาเนล quest เพื่อให้เห็นเกมด้านหลัง.
8. System/tutorial banner อยู่กลางบนและหายเอง; ห้ามใช้พื้นที่กลางบนเป็นพาเนลถาวร.

### 2.0.2 Console interaction model matching the reference

- แถบล่างกลางเป็นศูนย์ควบคุม `Chat | Quest | Party` ตามคำขอเดิม แต่ presentation ต้องคงตำแหน่งในภาพ:
  - `Chat` แสดง log ใน bottom-center console.
  - `Quest` เปิด/ปิด panel ทางซ้ายในกรอบ Quest panel เดิม ไม่ย้าย quest card มาทับกลางจอ.
  - `Party` เปิด/ปิด roster ทางขวากลางและ companion portraits ทางขวา ไม่ย้าย Party list เป็น card ใหญ่กลางล่าง.
- บน Standard tier ทั้ง Chat + pinned Quest + compact Party สามารถแสดงพร้อมกันเหมือนภาพ.
- บน Compact tier console tabs ยังคงตำแหน่งเดิม แต่ Quest/Party panel เปิดได้ทีละหนึ่งฝั่ง.
- บน Ultra-compact tier visual composition ยังคงซ้าย/กลาง/ขวาเหมือนเดิม แต่ซ่อนเนื้อหา panel เหลือ tab/icon; ห้ามย้าย action cluster, chat หรือ status ไปคนละด้าน.
- การ collapse เปลี่ยนเฉพาะรายละเอียดภายใน region ไม่เปลี่ยน anchor ของ region.

### 2.0.3 Exact visual tokens

- `--mmorpg-panel-bg: rgba(15, 20, 16, .74)` สำหรับ Quest/roster; Chat ใช้ opacity `.58–.66`.
- `--mmorpg-frame: #a7a45a` และ highlight `#d8d477`; เส้นขอบ visual `1px`, selected `2px`.
- `--mmorpg-hp: #d52f3d`, `--mmorpg-resource: #2b88d8`, `--mmorpg-progress: #66b94a`.
- Text หลัก `#f3f0d8`, text รอง `#c5c7ae`, warning `#f0c94a`, danger `#ff5a5f`.
- Corner radius ใช้ `0–4px` สำหรับ panels/rows เพื่อรักษาทรงเหลี่ยมแบบภาพ; ใช้วงกลมเฉพาะ portraits, skill buttons และ status icons.
- Panel shadow บาง `0 2px 8px rgba(0,0,0,.45)`; ห้ามใช้ glass blur หนัก, neon glow หรือ card โค้งสมัยใหม่ที่ทำให้สไตล์ผิดจากภาพ.
- Font เป็น condensed/readable game UI; ใช้ font ที่มีอยู่ใน repo ก่อน ห้ามเพิ่ม external font network dependency.
- ข้อความมี shadow ดำบางเพื่ออ่านบนฉากสว่าง แต่ไม่ใช้ outline หนาหลายชั้น.
- Cooldown ใช้ radial dark mask + เลขเวลาสีขาวตรงกลางเหมือนภาพ.

### 2.0.4 Z-order and overlap rules

1. Game canvas/iframe: base layer.
2. Player status, quest, minimap, roster, chat: HUD information layer.
3. Joystick/camera/action controls: input layerเหนือ information panels เฉพาะ interactive rect ของตน.
4. System/tutorial banner and combat feedback: transient layer.
5. Onboarding proxies/modal: top interaction layer แต่ครอบเฉพาะ rect ที่จำเป็น.
6. Fullscreen control: topmost persistent utility.
7. ชื่อผู้เล่น/เอฟเฟกต์ในโลกห้ามดันหรือ reflow HUD; HUD ต้องคง anchor ตามตารางเสมอ.

### 2.1 Single visible UI authority

1. Parent V9 document เป็นเจ้าของ UI ที่มองเห็นทั้งหมดใน Pirate, Pocket และ Living World.
2. Pirate iframe UI เดิมคง `visibility:hidden`/`pointer-events:none` ตาม `PIRATE_FRUIT_CONTROL_HUD_CSS`.
3. Pocket runtime ยังคง gameplay/state logic แต่ไม่ render Party/Quest/Chat ซ้ำหลัง migration สำเร็จ.
4. ห้ามใช้ CSS ซ่อน parent `#hud` ทั้งก้อน เพราะ shared controls และ onboarding proxies ต้องอยู่ตลอดตาม PR #374.
5. ทุก world ส่ง `worldId`, control mode และ feature availability ให้ HUD กลาง เพื่อให้แท็บที่ใช้ไม่ได้แสดง disabled reason แทนการหายเงียบ.

### 2.2 Proposed screen regions

```text
┌──────────────────────────────────────────────────────────┐
│ [รูป+HP/พลัง]             [⛶]       [โลก/แผนที่/เมนู]   │  Top utility rail
│ [เควส pin ได้]                          [Target/Party ย่อ] │
│                                                          │
│                    พื้นที่เห็นเกม                         │
│                                                          │
│ [Joystick zone]   [MMORPG Monitor Dock]   [Action cluster]│
│                   [แชท][เควส][Party]                      │
└──────────────────────────────────────────────────────────┘
```

- **Top utility rail:** ใช้ portrait + HP/resource compact block ทางซ้าย, fullscreen กลางบน และ world/minimap/utility ทางขวา; target combat card แสดงเป็น contextual compact rows ใต้ utility ฝั่งขวาและ auto-hide เมื่อไม่มี target.
- **Bottom-left:** joystick interaction zone เดิม ภาพ joystick เกิด ณ จุดแตะ ไม่เพิ่ม panel ทึบ.
- **Bottom-right:** action cluster แบบ arc/wheel รอบ primary action ใช้ hit target อย่างน้อย 48×48px และไม่ scale ทั้ง container.
- **Bottom-center:** MMORPG Monitor Dock เป็นแผงข้อมูลหลักเพียงแผงเดียวในสไตล์ console โปร่ง มีแท็บ `แชท`, `เควส`, `Party` พร้อม badge/unread/progress.
- **Expanded view:** บนจอสูงพอ Dock เปิดเป็น panel ที่ scroll ภายใน แต่ต้องไม่ครอบ joystick/action hit zones.
- **Collapsed view:** เหลือ tab rail + summary หนึ่งบรรทัด เช่นข้อความล่าสุด, quest progress หรือ active monster HP.
- **Pinned quest:** Standard tier แสดง Quest panel ทางซ้ายเป็นค่าเริ่มต้นเหมือนภาพ; Compact เปิดได้ทีละ side panel และ Ultra-compact เหลือ vertical tab จนผู้ใช้แตะ.

### 2.3 Responsive height tiers

| Tier | เงื่อนไขหลัก | Dock behavior | เป้าหมายความสูง |
|---|---|---|---|
| Standard | `min-height:421px` | เปิด content ได้ปกติ; default collapsed/remembered | collapsed 56px, expanded ≤38dvh |
| Compact | `321px–420px` + coarse pointer landscape | tab rail + content 2–4 แถว; panel อยู่กึ่งกลางระหว่าง controls | collapsed 48px, expanded ≤34dvh |
| Ultra-compact | `max-height:320px` + coarse pointer landscape | default summary-only; แตะแท็บเพื่อเปิด temporary sheet; auto-collapse เมื่อกลับ gameplay | collapsed 42–48px, expanded ≤46dvh แต่ไม่ทับ controls |

- ใช้ความสูงจอเป็นตัวแบ่งหลักตามแผนเดิม ไม่ใช้ width อย่างเดียว.
- Visual icon ลดได้ แต่ interactive rectangle ของ tabs, close, send, party switch, quest controls และ utility buttons ต้อง ≥48×48 CSS px.
- คีย์บอร์ดมือถือเปิดแล้ว Dock ต้องใช้ `visualViewport`/`100dvh` และย้ายเหนือคีย์บอร์ดโดยไม่ทำ document scroll.

### 2.4 Tab behavior

#### Chat tab

- ใช้ transport/auth/reconnect จาก `chat-runtime.mjs` เดิม.
- มี channel selector WORLD/ZONE ตาม server contract ปัจจุบัน; ไม่เพิ่ม PARTY social channel จนกว่าจะยืนยัน backend contract.
- แสดงข้อความแบบ compact MMORPG log: เวลา, ชื่อ, channel color, system/error rows และ unread badge.
- Input + Send แสดงเฉพาะ expanded state; summary state แสดงข้อความล่าสุดหนึ่งบรรทัด.
- เมื่อสลับ channel ต้อง reset cursor/view generation และห้าม stale response เขียน DOM เหมือน behavior ปัจจุบัน.

#### Quest tab

- ใช้ `currentStageObjective`, `stageObjectiveTracker` และ progress จาก Pocket runtime เป็น source of truth.
- Summary แสดงชื่อเควส + step ปัจจุบัน + progress badge.
- Expanded แสดงรายการ step, complete/current/locked state และ status.
- ปุ่ม collapse/expand แทน legacy `#stageObjectiveClose/#stageObjectiveToggle`.
- ใน Pirate/Living World ที่ไม่มี Pocket stage objective ให้แสดง world objective adapter หรือข้อความ “ไม่มีเควสที่ติดตาม” ไม่ render ข้อมูลค้างจาก world ก่อนหน้า.

#### Party tab

- แสดง 3 slots จาก Pocket state: portrait, name, level, HP, condition, fainted, selected และ active/summoned.
- แตะ slot เพื่อเลือก/peek; ปุ่ม `สลับ` เรียก command เดิมและยังเคารพ `characterUI.canSwitchParty()`.
- แตะ active monster summary เพื่อเปิด quick character panel จาก controller เดิม.
- Empty slot แสดงสถานะว่างและคำแนะนำ แต่ไม่สร้าง action จับมอนใหม่ที่ไม่มีใน runtime.
- Summary state แสดง active monster portrait + HP และจำนวน Party; expanded state แสดงครบ 3 slots แบบ horizontal scroll ใน ultra-compact tier.

## 3. Acceptance criteria

1. มี visible HUD authority เพียงชุดเดียวในแต่ละ world; ไม่มี Party/Quest/Chat panel ซ้ำจาก Pocket หรือ Pirate iframe.
2. Chat, Quest และ Party ใช้ tab controller ชุดเดียวใน bottom-center console; Chat render ใน console, Quest render panel ซ้าย และ Party render stack ขวาตามภาพ โดยสลับ/ยุบได้ด้วย touch/keyboard.
3. Pocket Party functionality ครบ: ดูสถานะ 3 slots, เลือก slot, switch, disabled reason, active/fainted/condition และเปิด character quick panel.
4. Quest functionality ครบ: summary, expanded steps, progress state, collapse/expand และ reset อย่างถูกต้องเมื่อเปลี่ยน world.
5. Chat functionality เดิมครบ: WORLD/ZONE, send, unread, pull serialization, abort on logout, suspend/resume และ reconnect.
6. ไม่มี authenticated request หรือ DOM update ค้างหลัง logout/world teardown/channel switch.
7. Dock ไม่ทับ joystick, camera pad, action buttons, fullscreen, onboarding actions หรือ target card ใน viewport matrix.
8. ทุก interactive target ที่จำเป็น ≥48×48 CSS px แม้ภาพ icon เล็กกว่า.
9. Shared controls แสดงก่อน runtime พร้อม, ระหว่าง Pirate onboarding และหลัง onboarding.
10. ไม่มี document overflow เกิน 1px; Dock scroll เฉพาะ content ภายใน.
11. UI update แบบ event/snapshot ไม่สร้าง render loop, duplicate listener หรือ duplicate DOM หลัง world switch/remount.
12. Production cache-bust chain และ deployment gates ผ่านก่อน merge.
13. ที่ viewport 1080×608 ตำแหน่ง region ผ่าน golden layout bounds ทุกขอบภายใน ±4px และ visual regression ไม่มี region ย้ายด้าน/เปลี่ยนรูปแบบ.
14. Action cluster ยังเป็นวง/arc, Chat อยู่กลางล่าง, Quest อยู่ซ้าย, Minimap อยู่ขวาบน และ Party/target อยู่ขวากลางในทุก landscape tier; responsive mode ลดรายละเอียดได้แต่ห้ามสลับตำแหน่งกัน.
15. Legacy replacement matrix ครอบทุก visible Pocket HUD feature โดยไม่มีแถวสถานะ `unmapped`; feature ที่ไม่ applicable ต้องมีเหตุผลและ unavailable state ที่ทดสอบแล้ว.
16. Pirate telemetry ไม่มีค่าปลอม, ตรวจ source/origin/schema/revision ครบ, ไม่เกิน 10 updates/second และถูกล้างเมื่อ reload/teardown.
17. HUD ใช้งานได้ด้วย touch, keyboard และ screen-reader semantics; bars/tabs/buttons มี role/name/state ครบ และ focus ไม่หลุดเข้า hidden panel.
18. ที่ gameplay idle การเปิด HUD ใหม่ไม่เพิ่ม duplicate `requestAnimationFrame`, polling timer หรือ WebSocket และไม่ทำ full-Dock DOM replacement จาก HP/cooldown tick.

---

## 4. Implementation tasks

### Task 1: Capture inventory and geometry before redesign

**Objective:** ระบุ UI legacy ทุกชิ้น, feature owner, คู่ที่ทับกัน และพื้นที่ที่ Dock สามารถใช้จริงก่อนแก้ layout.

**Files:**
- Create: `tests/v90-unified-hud-inventory.mjs`
- Create: `tests/v90-unified-hud-geometry.mjs`
- Modify: `tests/p0-ux1-short-height.mjs`

**Steps:**
1. เขียน failing inventory test ที่ระบุ owner ของ `#gameChat`, `#party`, `#stageObjective`, `#targetCard`, `#globalCharacterBtn`, `#pirateUnifiedControls` และ Pirate iframe HUD.
2. เพิ่ม geometry capture สำหรับ top utility rail, Dock collapsed/expanded, joystick zone, camera zone, actions, target card และ onboarding proxies.
3. เก็บ overlap pairs และ union coverage ไม่บวก rect ที่ซ้ำกัน.
4. เก็บ baseline screenshots/JSON ใน 568×320, 667×375, 740×280, 740×300, 844×300, 740×360, 844×390, 915×412 และ desktop 1280×720.
5. รัน cross-frame probe จากแผน compact เพื่อรวม child minimap/player/tutorial/banner rects กับ shared controls โดยคง Pirate sandbox เดิม; fixture ต้องบันทึก baseline under-48 values และ top-chrome overlap ที่พบจริง.
6. รัน `node tests/v90-mobile-hud-cross-frame-geometry.mjs && node tests/v90-unified-hud-inventory.mjs && node tests/v90-unified-hud-geometry.mjs`; expected: inventory/probe contract PASS และ geometry แสดง baseline violations ที่บันทึกชัดเจน.
7. ห้ามแก้ production UI ใน task นี้.

### Task 2: Define immutable HUD snapshot and command contracts

**Objective:** แยก state/action ของ Chat, Quest, Party และ world context ออกจาก DOM ก่อนสร้าง UI ใหม่.

**Files:**
- Create: `unified-hud-contract-v900.mjs`
- Create: `tests/v90-unified-hud-contract.mjs`

**Contract shape:**
- `context`: `{ worldId, controlMode, onboardingActive, connected, loading, revision }`
- `player`: `{ available, portraitKey, displayName, level, title, hp, hpMax, resourceKind, resource, resourceMax, modeLabel, modePercent, buffs }`
- `chat`: `{ channel, channels, rows, unread, status, canSend }`
- `quest`: `{ available, title, summary, steps, status }`
- `party`: `{ available, selectedSlot, activeInstanceId, canSwitch, slots }`
- `target`: `{ available, id, portraitKey, name, level, hp, hpMax, states }`
- `map`: `{ available, bounds, local, markers, zoneLabel }`
- `actions`: `{ id, visualKey, label, enabled, pressed, cooldownRemaining, cooldownTotal, count, state, reason }[]`
- `utilities`: `{ id, label, visualKey, enabled, badge, reason }[]`
- `banner`: `{ kind, text, expiresAt, revision }`
- commands: `setTab`, `setExpanded`, `setChatChannel`, `sendChat`, `selectPartySlot`, `switchPartySlot`, `openCharacter`, `invokeAction`, `invokeUtility`, `toggleQuest`, `toggleParty`, `toggleMap`

**Steps:**
1. เขียน failing tests สำหรับ validation, immutable snapshots, numeric range clamping, maximum array/string sizes, stable slot/action IDs และ unknown world reset.
2. Implement normalizers ที่คัดลอกเฉพาะ primitive/safe display data ห้ามส่ง mutable game state หรือ DOM nodes.
3. กำหนด monotonic `revision` ต่อ feature เพื่อทิ้ง stale snapshots.
4. กำหนด command result `{ ok, reason, message }` ให้ UI แสดง disabled reason ได้.
5. รัน `node tests/v90-unified-hud-contract.mjs`; expected: PASS.

### Task 2A: Inventory and add sanitized Pirate HUD telemetry

**Objective:** ทำให้ parent HUD แสดงข้อมูล Pirate จริงได้ครบ โดยไม่เดา selector และไม่เปิดสิทธิ์ iframe เพิ่ม.

**Files:**
- Modify: `pirate-fruit-offline/unified-input-bridge-v900.mjs`
- Modify: `boot-pirate-fruit-v900.mjs:97-162`
- Create: `pirate-hud-telemetry-v900.mjs`
- Create: `tests/v90-pirate-hud-telemetry.mjs`

**Steps:**
1. เปิด Pirate child ใน deterministic test แล้วเก็บ inventory ของ original HUD DOM ที่มีจริง: player bars, target, buffs, action buttons, cooldown text/masks, potion/weapon states และ utility controls; บันทึก selector contract ใน test fixtureก่อนเขียน adapter.
2. หาก field ใดไม่มี DOM/API source จริง ให้ mark `available:false`; ห้ามคาดเดา HP, mana, cooldown หรือ item count.
3. สร้าง message type `pocketmonster:pirate-hud-snapshot-v1` พร้อม schema/limits จาก Task 2.
4. Child publish เฉพาะ primitive sanitized display state ไปยัง `allowedParentOrigin`; parent รับเฉพาะ `event.source === frame.contentWindow` และ `event.origin === 'null'` เหมือน bridge ปัจจุบัน.
5. Rate-limit snapshot สูงสุด 10Hz และส่งทันทีเมื่อ state สำคัญเปลี่ยน; ห้าม post ทุก animation frame.
6. Parent invalidates snapshot เมื่อ iframe reload, world switch, pagehide หรือ teardown และห้าม reuse snapshot จาก frame instance เก่า.
7. เพิ่ม tests สำหรับ spoofed source, malformed arrays, oversized strings, NaN/Infinity, stale revision, reload generation และ teardown.
8. รัน `node tests/v90-pirate-hud-telemetry.mjs && node tests/v90-unified-mobile-controls.mjs`; expected: PASS.

### Task 3: Refactor Chat runtime into transport/store + mount adapter

**Objective:** รักษา network lifecycle เดิมแต่เปิด subscribe/command API ให้ Dock ใหม่ โดยไม่ให้ Chat runtime เป็นเจ้าของ visual panel แบบถาวร.

**Files:**
- Modify: `chat-runtime.mjs:19-38,103-170,315-381`
- Modify: `tests/v90-chat-runtime-lifecycle.mjs`
- Create: `tests/v90-chat-hud-adapter.mjs`

**Steps:**
1. เพิ่ม failing tests สำหรับ `subscribe`, current snapshot, send command, channel change, unread update และ unsubscribe.
2. แยก row normalization/store ออกจาก `addMessage()` DOM mutation.
3. ให้ existing fetch/WebSocket lifecycle update store แล้ว notify subscribers.
4. ให้ `mount()` รองรับ migration fallback เท่านั้น; Dock ใหม่ต้องใช้งานได้โดยไม่ต้องสร้าง `#gameChat` legacy markup.
5. คง AbortController, lifecycle generation, serialized pull queue และ explicit auth rejection behavior ทุกกรณี.
6. เพิ่ม safe system/error rows โดยใช้ `textContent` เท่านั้น ไม่ render server HTML.
7. รัน `node tests/v90-chat-runtime-lifecycle.mjs && node tests/v90-chat-hud-adapter.mjs`; expected: PASS.

### Task 4: Publish Pocket Quest snapshots and commands

**Objective:** ให้ HUD กลางอ่าน quest state และควบคุม tracker ได้โดยไม่เข้าถึง closure/DOM ภายใน `game-v800.js` โดยตรง.

**Files:**
- Modify: `game-v800.js:2569-2648,7246-7251`
- Create: `tests/v90-pocket-quest-hud-adapter.mjs`

**Steps:**
1. เขียน failing test สำหรับ ranch/no-stage, active objective, cleared state, world switch reset และ revision ordering.
2. Extract pure presenter จาก `renderStarterJourney()` ให้คืน safe quest snapshot โดยยังใช้ `resolveStageObjective`/`stageObjectiveTracker` เดิม.
3. Publish snapshot เมื่อ objective, zone, progress หรือ active world เปลี่ยน.
4. Map Dock expand/collapse เป็น state ของ unified HUD; legacy dismissed flag ใช้เฉพาะ migration fallback.
5. ยืนยันว่าออกจาก Pocket world แล้ว quest snapshot ไม่มีข้อมูล stale.
6. รัน `node tests/v90-pocket-quest-hud-adapter.mjs && node tests/v82-stage-objectives.mjs`; expected: PASS.

### Task 5: Publish Pocket Party snapshots and commands

**Objective:** นำความสามารถของ bottom monster panel ฝั่ง Pocket มาใช้ครบใน Dock กลาง.

**Files:**
- Modify: `game-v800.js:6587-6673,6709-6750`
- Reuse: `combat-ui-view-model.mjs`
- Reuse: `character-ui-controller.mjs`
- Create: `tests/v90-pocket-party-hud-adapter.mjs`

**Steps:**
1. เขียน failing tests สำหรับ empty/full slots, selected/active/fainted/condition, HP update, canSwitch false และ character quick open.
2. Extract pure Party presenter จาก `renderParty()` โดยใช้ `createPartySlotViewModel()` เดิม.
3. Publish 3 immutable slot snapshots เมื่อ HP/state/selection/summon/recall/party membership เปลี่ยน.
4. Route `selectPartySlot`/`switchPartySlot` ไปยัง `switchPartySlot()` และ `characterUI` เดิม; ห้าม duplicate gameplay mutation.
5. Route `openCharacter` ไปยัง controller เดิมและรักษา read-only rules เมื่อ active summon ยังอยู่.
6. รัน `node tests/v90-pocket-party-hud-adapter.mjs`, `node tests/p0-ux1-combat-hud.mjs` และ character UI focused tests; expected: PASS.

### Task 5A: Publish complete Pocket player, target, buff and action snapshots

**Objective:** ย้ายข้อมูลจาก Pocket HUD เดิมให้ครบก่อนปิด UI เดิม ไม่ย้ายเฉพาะ Party/Quest.

**Files:**
- Modify: `game-v800.js` เฉพาะ presenter paths ของ `renderHUD()`, `updateTarget()`, `renderSkillButtons()`, `msg()` และ selected/active monster state
- Reuse: `combat-ui-view-model.mjs`
- Reuse: existing skill/status presenters used by `game-v800.js`
- Create: `tests/v90-pocket-complete-hud-adapter.mjs`

**Steps:**
1. ทำ inventory จาก Pocket legacy HUD แล้วเขียน matrix `legacy selector → source state → unified field → command` สำหรับ topbar pills, player/active monster HP, resource/uses, buffs/status, target, message/banner, action reason, skill labels/icons/cooldowns/uses, capture/summon/recall และ utility entry.
2. เขียน failing tests ว่าทุก visible legacy datum มี replacement field หรือ explicit `not-applicable` พร้อมเหตุผล; ห้ามมี `unmapped` เมื่อ Task นี้จบ.
3. Extract pure player presenter จาก selected/active monster โดยส่ง portrait key, name, level, HP, resource kind/value, mode and buffs จากข้อมูลจริงเท่านั้น.
4. Extract pure target presenter จาก target card source รวม HP, level, types/status และ clear snapshot ทันทีเมื่อ target หาย/เปลี่ยน world.
5. Extract action presenter จาก skill/capture/summon/recall state รวม enabled, cooldown remaining/total, uses/count, reason และ icon descriptor ที่มีอยู่.
6. เปลี่ยน `msg()` ให้ publish transient banner revision ควบคู่ legacy fallback; identical text ห้ามสร้าง timer/listener ซ้ำ.
7. Publish dirty updates เฉพาะเมื่อ semantic snapshot เปลี่ยน ไม่ publish ทุก render frame.
8. รัน `node tests/v90-pocket-complete-hud-adapter.mjs` พร้อม combat HUD/cooldown/status focused suites; expected: PASS และ mapping matrix ไม่มีช่องว่าง.

### Task 5B: Render the exact top-left status, buffs and top-center indicators

**Objective:** สร้าง player status block และ quick-state indicators ตามภาพโดยรับข้อมูลจาก active-world adapter เดียว.

**Files:**
- Modify: `unified-mmorpg-hud-v900.mjs`
- Modify: `style-v900.css`
- Create: `tests/v90-unified-player-status.mjs`

**Steps:**
1. Render portrait/level/name/title, HP current/max, secondary resource current/max, mode row และ buff row ตาม bounds ในข้อ 2.0.1.
2. HP/resource ใช้ `role=progressbar`, valid aria min/max/now และ clamp visual width 0–100% โดยไม่แก้ค่าต้นทาง.
3. Buff row แสดงสูงสุด 7 icons; ที่เหลือรวม `+N`, expiry/description แสดงผ่าน accessible popover ที่ไม่กิน game input zone.
4. Top-center indicators map จาก first 5 applicable actions; แสดง selected/cooldown stateแต่ไม่สร้าง action handlerชุดใหม่.
5. เมื่อ player snapshot unavailable แสดง skeleton/connection state ไม่แสดงค่าปลอม `100/100`.
6. Portrait fallback ใช้ asset key/initial ที่ sanitize แล้วและต้องไม่โหลด remote URL จาก telemetry.
7. รัน `node tests/v90-unified-player-status.mjs`; expected: PASS ใน Pirate/Pocket/Living unavailable states.

### Task 5C: Render exact target/Party roster and companion shortcut stack

**Objective:** ให้ขวากลางเหมือนภาพและคง Party functionality ของ Pocket ครบ.

**Files:**
- Modify: `unified-mmorpg-hud-v900.mjs`
- Modify: `style-v900.css`
- Create: `tests/v90-unified-roster-stack.mjs`

**Steps:**
1. Row แรกใช้ selected combat target เมื่อมี; rows ที่เหลือใช้ Party/nearby context ตาม active world โดยไม่แสดง entity ซ้ำ.
2. ทุก row มี status icon, compact name, level/state, HP bar และ selected/danger styling.
3. Companion portraits 3 ช่องผูกกับ Party slots เดิม; ring แยก selected, active/summoned, fainted และ unavailable.
4. Touch portrait route ไป command `selectPartySlot`; long-press/secondary action เปิด character quick panel; switch mutationยังผ่าน controller เดิมเพียงครั้งเดียว.
5. Empty slots คงตำแหน่งวงกลมแต่แสดง empty state ไม่ shift action cluster.
6. Pocket world อัปเดต HP/state แบบ keyed rows; Pirate ที่ไม่มี monster Party แสดง target/nearby rows ที่ telemetry มีจริงหรือ hidden placeholdersโดยคง geometry.
7. รัน `node tests/v90-unified-roster-stack.mjs && node tests/v90-pocket-party-hud-adapter.mjs`; expected: PASS.

### Task 5D: Recompose existing shared buttons into the exact combat arc

**Objective:** เปลี่ยนเฉพาะ presentation/state ของปุ่มชุดเดิมให้เหมือนภาพ โดยไม่สร้าง duplicate action controls หรือ input lifecycle.

**Files:**
- Modify: `index.html`/`v900.html` เฉพาะ wrapper/semantic classes ที่จำเป็น
- Modify: `style-v900.css:73-114`
- Modify: `unified-mobile-controls-v900.mjs` เฉพาะ visual-state subscription; ห้ามเพิ่ม pointer owner
- Create: `tests/v90-unified-combat-arc.mjs`

**Steps:**
1. เขียน failing test ว่า action IDs เดิมยังมีเพียงหนึ่ง node และ pointerdown/up ส่งเข้า active adapter ครั้งเดียว.
2. กำหนด primary center/radius variables และ polar/anchored offsets สำหรับ skill1–4, capture/attack, summon/dash, recall/jump, block, weapon, potion1/2.
3. Active world เลือก action mapping: Pirate จาก sanitized telemetry, Pocket จาก complete HUD adapter, Living World แสดงเฉพาะ actions ที่รองรับจริง.
4. Render cooldown radial mask, countdown, pressed state, item count, unavailable reason และ empty slot โดยไม่ใช้ parent `transform:scale()`.
5. ปุ่ม visual เล็กได้ตาม tierแต่ transparent hit rect ≥48px และ hit rect ของเพื่อนบ้านห้าม overlap เกิน geometry tolerance.
6. Onboarding ต้องไม่ disable/hide arc ทั้งชุด; proxies ครอบเฉพาะ onboarding actions ตาม PR #374 behavior.
7. รัน `node tests/v90-unified-combat-arc.mjs && node tests/v90-unified-mobile-controls.mjs && node tests/v90-mobile-dual-pointer-input.mjs`; expected: PASS.

### Task 5E: Implement right utilities, system banner and bottom status strip

**Objective:** เติมองค์ประกอบที่เหลือจากภาพด้วยคำสั่ง/ข้อมูลจริงและไม่มี decorative dead buttons.

**Files:**
- Modify: `unified-mmorpg-hud-v900.mjs`
- Modify: `style-v900.css`
- Reuse: current fullscreen, utility menu, character panel, mute/audio and world routing commands
- Create: `tests/v90-unified-hud-utilities.mjs`

**Steps:**
1. Map utility inventory เป็น fullscreen, menu, character, audio, map expand และ world/home route ที่ runtime มีจริง; unsupported utility ไม่ render เป็นปุ่มกดได้.
2. Right utility circles คงตำแหน่งตามภาพและมี badge/disabled reason จาก contract.
3. System banner queue แสดงทีละข้อความ, dedupe ข้อความซ้ำ, auto-expire, pause timerเมื่อ document hidden และ clear on world teardown.
4. Bottom strip แสดง connection, ping/transport state, local session time และ quick system buttonsจาก source จริง; ห้ามปลอม battery/GMT/device values.
5. Microphone/mail/friends iconsใกล้ chat แสดงเฉพาะเมื่อมี feature contract; หากไม่มีให้คง spacingด้วย noninteractive decorative slotที่ `aria-hidden=true` หรือยุบตาม locked fixture โดยไม่สร้าง dead control.
6. ทุก command ต้องคืน `{ok, reason, message}` และ UI แสดง failure โดยไม่ throw/unhandled rejection.
7. รัน `node tests/v90-unified-hud-utilities.mjs`; expected: PASS.

### Task 6: Build the single MMORPG Monitor Dock

**Objective:** สร้าง DOM หลักเพียงชุดเดียวสำหรับ Chat/Quest/Party พร้อม accessible tab semantics.

**Files:**
- Modify: `index.html` และ mirrored source entries `v900.html` ตาม active-entry contract
- Create: `unified-mmorpg-hud-v900.mjs`
- Modify: `entry-preload.mjs`
- Create: `tests/v90-unified-mmorpg-hud.mjs`

**Steps:**
1. เพิ่ม failing DOM tests ว่ามี `#mmorpgHud`, player status, buff row, quest side panel, minimap, target/Party stack, utility stack, companion shortcuts, shared combat arc, `#mmorpgDock`, bottom strip, tablist และ panels 3 อันเพียงครั้งเดียว.
2. สร้าง shell markup แบบ static ใน active HTML หรือ mount แบบ deterministic หนึ่งครั้งตาม convention ที่ test ยืนยัน และเรียง DOM ตาม z-order ในข้อ 2.0.4.
3. Implement store aggregator ที่ subscribe Chat/Pocket/world context และ render เฉพาะ feature revision ที่เปลี่ยน.
4. Implement tabs พร้อม `role=tablist/tab/tabpanel`, `aria-selected`, roving tabindex, Escape collapse และ focus restore.
5. Implement unread badge, quest progress badge และ active Party HP summary; tabs เป็น controller ของ pinned side regionsตามข้อ 2.0.2 ไม่ย้าย side panels เข้ากลางจอ.
6. ป้องกัน duplicate listeners/DOM เมื่อ `mount()` เรียกซ้ำหรือ scene remount.
7. Import HUD ก่อน world/game overlays ใน `entry-preload.mjs` เพื่อให้ onboarding และ loading state มี shell พร้อม.
8. รัน `node tests/v90-unified-mmorpg-hud.mjs`; expected: PASS.

### Task 7: Apply layout tokens and control-clearance CSS

**Objective:** วาง Dock ตามตำแหน่งใหม่โดยใช้ viewport budget เดียวกับ controls และไม่ทับพื้นที่ touch.

**Files:**
- Modify: `style-v800.css` สำหรับ shared tokens/base visual language
- Modify: `style-v900.css:73-118` สำหรับ V9 world/control layout
- Modify: `tests/chat-ui-layout.mjs`
- Modify: `tests/v90-unified-hud-geometry.mjs`

**Steps:**
1. เพิ่ม failing CSS assertions สำหรับ `--hud-hit-min`, `--hud-top-budget`, `--hud-dock-collapsed`, `--hud-dock-expanded`, `--hud-control-gap`.
2. Style Dock แบบ MMORPG console: translucent dark panel, readable contrast, compact channel/quest state colors และ no decorative background ที่บังเกมเกินจำเป็น.
3. ใช้ CSS grid/flex ภายใน Dock; ห้าม `transform:scale()` ทั้ง Dock หรือ action cluster.
4. แยก visual size จาก 48px hit box สำหรับ tab/icon/close/send/switch.
5. เพิ่ม Standard/Compact/Ultra-compact tiers ตามความสูงในข้อ 2.3.
6. ใช้ safe-area variables, `100dvh` และ visual viewport class/state สำหรับ virtual keyboard.
7. กำหนด clearance zones ให้ Dock ไม่รับ pointer นอก panel และไม่ทับ joystick/camera/actions.
8. รัน `node tests/chat-ui-layout.mjs && node tests/v90-unified-hud-geometry.mjs`; expected: PASS, `violations: []`.

### Task 7A: Build the real top-right minimap required by the reference

**Objective:** เติม minimap จริงในตำแหน่งขวาบน ไม่ใช้ placeholder และไม่อ่านข้อมูลที่ไม่มี source.

**Files:**
- Create: `unified-minimap-v900.mjs`
- Modify: `unified-hud-contract-v900.mjs`
- Reuse: `pirate-fruit-island-map-v900.mjs`
- Reuse: Pocket `ZONES`/player position adapter from `game-v800.js`
- Reuse: online presence snapshots from `online-world-bridge-v900.mjs`
- Create: `tests/v90-unified-minimap.mjs`

**Steps:**
1. เขียน failing tests สำหรับ Pirate island bounds, Pocket zone bounds, local player heading, POI clipping, remote player sanitization และ unknown-world fallback.
2. สร้าง pure world-to-minimap projection ที่ clamp marker เข้า map rect และไม่ mutate source coordinates.
3. วาด terrain/island silhouette จากข้อมูลแผนที่ที่มีจริง; world ที่มีเพียง zone boundary ให้แสดง boundary/POI จริง ไม่แต่งเส้นทางปลอม.
4. แสดง local player marker + heading, portals/objectives และ remote presence ที่ผ่าน sanitizer.
5. วาง map frame ที่ normalized bounds x `84.4–99.8%`, y `0–28.1%` และเพิ่ม transparent 48px hit targets สำหรับ expand/menu controls.
6. จอ Ultra-compact ลด visual map ได้ตาม height token แต่ anchor ต้องอยู่ขวาบนและมี minimum readable size ที่ geometry test กำหนด.
7. รัน `node tests/v90-unified-minimap.mjs && node tests/v90-pirate-fruit-island-map.mjs`; expected: PASS.

### Task 7B: Golden-reference visual regression

**Objective:** ป้องกันการตีความภาพอ้างอิงคลาดเคลื่อนระหว่าง implement/review.

**Files:**
- Create: `tests/v90-mmorpg-hud-reference-layout.mjs`
- Create: `tests/fixtures/v90-mmorpg-hud-reference-regions.json`
- Create: screenshot artifacts under test output only; ห้าม commit ภาพที่มีสิทธิ์ใช้งานไม่ชัดเจนเป็น game asset

**Steps:**
1. บันทึก region bounds จากตาราง 2.0.1 เป็น fixture พร้อม reference viewport 1080×608.
2. เปิด deterministic HUD fixture ที่ไม่มี combat particles/player-name clutter แล้ว capture geometry/screenshot.
3. Assert แต่ละขอบคลาดเคลื่อนไม่เกิน ±4px และ z-order ตรงข้อ 2.0.4.
4. Assert action controls กระจายเป็น arc ด้วย center/radius ranges ไม่ใช่ grid.
5. Assert Chat center, Quest left, map top-right, roster right-middle และ player status top-left.
6. ทำ overlay comparison เพื่อดู anchor/shape; สี/ข้อความ dynamic เปรียบเทียบด้วย masked regions ไม่ใช้ pixel-perfect ทั้งภาพจน flaky.
7. รัน `node tests/v90-mmorpg-hud-reference-layout.mjs`; expected: PASS พร้อม geometry report.

### Task 8: Migrate and retire legacy visible Pocket UI

**Objective:** ปิด UI ฝั่ง Pocket เดิมหลังฟังก์ชันถูกแทนที่ครบ โดยไม่ปิด runtime/state logic.

**Files:**
- Modify: `index.html`, `v900.html`
- Modify: `game-v800.js`
- Modify: `style-v900.css:33-71,115-118`
- Modify: `chat-runtime.mjs`
- Modify: `tests/v90-unified-hud-inventory.mjs`
- Modify: affected legacy tests that assert old selectors

**Migration order:**
1. Chat legacy panel → Dock Chat tab.
2. `#stageObjective/#stageObjectiveToggle` → Dock Quest tab.
3. `#party` → Dock Party tab.
4. `#globalCharacterBtn` → top utility/Party command while keeping existing character panel runtime.
5. Legacy message/target elements migrate only if replacement criteria are written and verified; otherwise remain contextual HUD outside Dock.

**Steps:**
1. เพิ่ม test ว่า feature adapter ทำงานก่อนปิด legacy visual node แต่ละตัว.
2. ปิด legacy renderer path ด้วย explicit unified-HUD capability flag ไม่ใช้ broad `display:none` selector ที่อาจซ่อน shared controls.
3. หลังทุก consumer เปลี่ยนแล้วจึงลบ legacy markup/style/listeners ที่ไม่มีผู้ใช้.
4. คง source-of-truth logic ใน Pocket runtime; ห้าม duplicate Party/Quest state ใน HUD module.
5. ยืนยัน Pirate iframe original HUD ยัง hidden/noninteractive และ parent HUD มีเพียงหนึ่งชุด.
6. รัน inventory และ regression tests; expected: one visible owner per feature.

### Task 9: Preserve onboarding, world switching, teardown and focus behavior

**Objective:** ป้องกัน UI ค้าง/ซ้ำ/รับ input ผิด world ระหว่าง lifecycle transitions.

**Files:**
- Modify: `scene-entry-v900.mjs`
- Modify: `online-world-shell-v900.mjs`
- Modify: `pirate-onboarding-overlay-v900.mjs` เฉพาะ integration signal
- Test: `tests/v90-pirate-onboarding-overlay.mjs`
- Test: `tests/v90-scene-teardown-lifecycle.mjs`
- Create: `tests/v90-unified-hud-world-lifecycle.mjs`

**Steps:**
1. เขียน failing tests สำหรับ loading → onboarding → gameplay, Pirate → Pocket → Living World และ teardown/logout.
2. ระหว่าง onboarding คง controls แสดงตลอด; Dock default collapsed และ onboarding proxies อยู่เหนือเฉพาะ action rect ที่จำเป็น.
3. เมื่อเปลี่ยน world reset unavailable feature snapshots, pending focus, expanded transient sheet และ stale command target.
4. เมื่อ teardown/logout unsubscribe stores, abort chat requests และ clear sensitive rows/input.
5. เมื่อกลับจาก pagehide/pageshow restore transport/HUD เพียงหนึ่ง instance.
6. รัน lifecycle suites; expected: PASS และ diagnostics ไม่มี duplicate listener/subscriber.

### Task 10: Cache-bust and deployment artifacts

**Objective:** ให้ production โหลด HTML/CSS/modules ชุดใหม่ครบทุก entry และไม่มี stale mixed UI.

**Files:**
- Modify: `index.html`, `v900.html`, `scene-v900.html`
- Modify: `entry-preload.mjs`
- Modify: `online-world-shell-v900.mjs` revision chain หาก scene entry เปลี่ยน
- Modify: `scripts/build-github-pages.mjs` เฉพาะเมื่อ asset list ต้องเพิ่ม module ใหม่
- Modify: `tests/v90-unified-pages-artifact.mjs`
- Modify: `tests/v90-unified-online-world.mjs`

**Steps:**
1. Bump CSS/module query versions ทุก upstream edge ที่เปลี่ยน.
2. เพิ่ม module ใหม่ใน page artifact copy allowlist/build manifest หาก build ใช้ explicit list.
3. เพิ่ม assertions ว่า built artifact มี Dock/contract modules และไม่อ้าง stale chat layout revision.
4. รัน `npm run build:pages` แล้ว `node tests/v90-unified-pages-artifact.mjs`; expected: PASS.

### Task 11: Full mobile touch and deployment verification

**Objective:** พิสูจน์ว่าระบบเดียวใช้งานจริงครบทุก feature และไม่ทับ controls ก่อน merge.

**Automated commands:**
1. `node tests/v90-unified-hud-contract.mjs`
2. `node tests/v90-pirate-hud-telemetry.mjs`
3. `node tests/v90-chat-runtime-lifecycle.mjs`
4. `node tests/v90-chat-hud-adapter.mjs`
5. `node tests/v90-pocket-quest-hud-adapter.mjs`
6. `node tests/v90-pocket-party-hud-adapter.mjs`
7. `node tests/v90-pocket-complete-hud-adapter.mjs`
8. `node tests/v90-unified-player-status.mjs`
9. `node tests/v90-unified-roster-stack.mjs`
10. `node tests/v90-unified-combat-arc.mjs`
11. `node tests/v90-unified-hud-utilities.mjs`
12. `node tests/v90-unified-minimap.mjs`
13. `node tests/v90-unified-mmorpg-hud.mjs`
14. `node tests/v90-unified-hud-world-lifecycle.mjs`
15. `node tests/v90-unified-hud-geometry.mjs`
16. `node tests/v90-mmorpg-hud-reference-layout.mjs`
17. `npm run test:v90:pirate-player`
18. `npm run test`
19. `npm run check`
20. `npm run build:pages`
21. `node tests/v90-unified-pages-artifact.mjs`
22. `node tests/v90-deployment-gates.mjs`

**Real touch matrix:**
- Viewports: golden `1080×608`, desktop control `1280×720`, mobile `568×320`, `667×375`, `740×280`, `740×300`, `844×300`, `740×360`, `844×390`, `915×412`.
- Worlds/states: Pirate loading, Pirate onboarding, Pirate gameplay, Pirate target/combat/cooldown/inventory change, Pocket capture, Pocket target/skill cooldown/Party fainted, Living World, character quick/full, virtual keyboard open, pagehide/pageshow, iframe reload, world switch, logout/return.
- Interactions: joystick + camera, joystick + attack, skill + movement dual touch, fullscreen, onboarding Pause, open/collapse Chat/Quest/Party, WORLD/ZONE change, send chat, select/switch Party slot, open character, quest expand/collapse, map expand, utility/menu/audio and reconnect.

**Pass evidence per viewport/state:**
- Geometry JSON reports `violations: []`.
- Required hit rects are ≥48×48 CSS px.
- Screenshot shows one Dock, no duplicate legacy panels and meaningful visible game area.
- Pointer traces prove joystick/action still receive touch while Dock is collapsed/expanded.
- Chat network trace proves no stale request after channel switch/logout.
- Party command changes selected slot exactly once.
- Quest snapshot resets correctly after world switch.
- Controls remain visible throughout onboarding.
- Pirate HUD telemetry values match the child runtime source and disappear on iframe reload/teardown rather than freezing stale values.
- Golden viewport overlay confirms each region within ±4px and confirms the black arrow viewer overlay is absent.
- Compact/Ultra-compact screenshots preserve left/center/right anchors while reducing only internal detail.
- Accessibility pass confirms tab order, visible focus, aria states and no focus inside hidden/collapsed regions.
- Performance diagnostics confirm one HUD instance, one Chat transport, one pointer lifecycle and telemetry rate ≤10Hz.

---

## 5. Files likely to change

**Core/UI:**
- `index.html`
- `v900.html`
- `style-v800.css`
- `style-v900.css`
- `entry-preload.mjs`
- `unified-mobile-controls-v900.mjs` เฉพาะ shared layout/context integration
- `unified-hud-contract-v900.mjs` (new)
- `unified-mmorpg-hud-v900.mjs` (new)

**Feature adapters:**
- `chat-runtime.mjs`
- `game-v800.js`
- `pirate-fruit-offline/unified-input-bridge-v900.mjs`
- `pirate-hud-telemetry-v900.mjs` (new)
- `combat-ui-view-model.mjs` เฉพาะเมื่อ pure Party presenter ต้องเพิ่ม field ที่มี source จริง
- `character-ui-controller.mjs` เฉพาะ command integration ที่ยังไม่มี API

**Lifecycle/build:**
- `scene-entry-v900.mjs`
- `online-world-shell-v900.mjs`
- `scene-v900.html`
- `scripts/build-github-pages.mjs`

**Tests:**
- `tests/chat-ui-layout.mjs`
- `tests/v90-chat-runtime-lifecycle.mjs`
- `tests/v90-unified-mobile-controls.mjs`
- `tests/v90-pirate-onboarding-overlay.mjs`
- `tests/v90-unified-pages-artifact.mjs`
- new focused tests listed in Tasks 1–11 และ Tasks 2A/5A–5E/7A–7B

## 6. Risks and tradeoffs

- `game-v800.js` เป็นไฟล์ใหญ่และ Party/Quest logic อยู่ใน closure; ต้อง extract pure presenter/adapter อย่างแคบ ไม่ refactor gameplay ทั้งไฟล์.
- การลบ legacy DOM เร็วเกินไปอาจทำให้ tests/runtime ที่เรียก `el('party')` หรือ `el('stageObjective')` พัง จึงต้อง migration แบบ adapter-first แล้ว retire ทีละ feature.
- Chat backend ที่เห็นใน repo ยืนยันเฉพาะ WORLD/ZONE; คำว่า Party ในแผนนี้หมายถึง monster roster tab. หากต้องการ social PARTY channel ต้องวาง server membership/authorization contract เพิ่มอีกแผน ห้ามปลอมด้วย client-only filtering.
- Dock expanded อาจบังเกมบนจอสูง 280–320px จึงต้อง default summary-only และเปิดเป็น transient sheet แทนการแสดงทุกอย่างพร้อมกัน.
- Camera pad ครอบพื้นที่ขวากว้าง 55%; Dock ต้องหยุด pointer propagationเฉพาะ rect ของตัวเองและปล่อยพื้นที่รอบข้างให้ camera.
- Runtime-injected CSS ใน `chat-runtime.mjs` มีไว้แก้ cached legacy layout; หลัง migration ต้องลบ/เปลี่ยนอย่างมี cache-bust ไม่ให้ override Dock ใหม่.
- การอัปเดต HP/quest ถี่อาจทำ DOM churn; ใช้ feature revision + keyed slot updates ไม่ replace ทั้ง Dock ทุก frame.

## 7. Locked decisions from the visual reference

1. `Party` หมายถึง monster roster 3 slots ภายใน HUD นี้; social party chat ไม่รวมใน scope จนมี server membership/authorization contract.
2. Chat console อยู่กลางล่างเสมอและเริ่มที่ Chat; tab stateจำได้เฉพาะ session แต่ world switch ต้อง collapse transient panel.
3. Quest อยู่ panel ซ้าย, target/Party อยู่ขวากลาง, minimap อยู่ขวาบน, player status อยู่ซ้ายบน และ combat actions อยู่ขวาล่างตามภาพ; implementer ไม่มีสิทธิ์สลับด้านเพื่อความสะดวก.
4. Target combat HP ต้องมองเห็นโดยไม่เปิด console และใช้ compact roster row ด้านขวา.
5. Standard tier แสดงองค์ประกอบหลักพร้อมกันเหมือนภาพ; Compact/Ultra-compact ลดรายละเอียดภายใน region แต่ไม่เปลี่ยน anchor.
6. Ultra-compact auto-collapse side panel เมื่อผู้ใช้แตะกลับเข้า game canvas ยกเว้น chat keyboard/focus ยังทำงาน.
7. ภาพอ้างอิงเป็น golden layout reference; ห้ามคัดลอก artwork/logo/icon asset ของเกมต้นฉบับ ใช้ PocketMonster assets และข้อมูลจริงแทน.

## 7.1 Definition of complete — checklist บังคับก่อนปิดงาน

- [ ] **Single authority:** Parent มี HUD ที่มองเห็นชุดเดียว; Pirate original HUD hidden/noninteractive; Pocket legacy visual renderers retiredหลัง adapter parity.
- [ ] **Player block:** portrait, level, name/title, HP, resource, mode และ buffs มาจาก active world sourceจริง.
- [ ] **Quest:** title, objective rows, progress/footer, pin/collapse และ reset on world switchครบ.
- [ ] **Chat:** WORLD/ZONE, rows, unread, send, errors, abort/logout, suspend/resume และ keyboard behaviorครบ.
- [ ] **Party:** 3 slots, portrait, HP, condition, selected, active, fainted, empty, switch และ character quick accessครบ.
- [ ] **Target:** selected target name/level/HP/status แสดงขวากลางและ clearทันทีเมื่อ targetหาย.
- [ ] **Minimap:** real local position/heading, POIs, sanitized remote markers, map controls และ unknown-world fallbackครบ.
- [ ] **Actions:** shared nodeชุดเดียว, exact arc, labels/icons, cooldown radial, counts, pressed/disabled/reason และ dual-touchครบ.
- [ ] **Utilities:** fullscreen, menu, character, audio, map/world routesเฉพาะที่มี commandจริง; ไม่มี dead button.
- [ ] **Banner/status:** transient queue, dedupe/expiry, connection/ping/session strip และ teardown clearครบ.
- [ ] **Reference fidelity:** golden 1080×608 bounds ±4px, panel shape/colors/z-orderตรงข้อ 2.0 และไม่มี black-arrow viewer overlay.
- [ ] **Small screens:** viewport matrixไม่มี overlap/overflow, anchorsไม่สลับด้าน, hit targets ≥48px และ onboarding controlsไม่หาย.
- [ ] **Lifecycle/security:** source/origin/schema/revision validation, no stale snapshot/request/listener after reload/world switch/logout.
- [ ] **Accessibility:** roles/names/states/focus/keyboardครบ และ reduced-motion/high-contrast readable.
- [ ] **Performance:** no duplicate RAF/poll/socket/pointer lifecycle, telemetry ≤10Hz, keyed dirty updates และ no full-Dock rerender per tick.
- [ ] **Delivery:** cache-bust chain, build artifacts, full tests, `npm run check`, mobile touch evidence และ deployment gatesผ่าน.

หากองค์ประกอบเดิมของ Pocket ยังไม่มีตัวแทนใน HUD ใหม่ หรือ checklist ข้อใดยังไม่มีหลักฐาน test/geometry/screenshot/runtime trace ให้ถือว่างาน **ยังไม่ครบ** และห้ามปิด task หรือ merge.

## 8. Recommended execution order

1. ทำ Task 1 เก็บ baseline/inventory และล็อก selector/geometry ก่อนแก้ production.
2. ทำ Tasks 2 และ 2A สร้าง full HUD contract + Pirate sanitized telemetry.
3. ทำ Tasks 3–5A แยก Chat/Quest/Party และ Pocket player/target/action data แบบ adapter-first โดยยังคง legacy UI.
4. ทำ Tasks 5B–5E สร้าง status, roster, combat arc, utilities/banner/bottom strip ตาม golden layout.
5. ทำ Task 6 ประกอบ single HUD shell และ tab controller โดยยังเปิดเปรียบเทียบ legacy parity ได้.
6. ทำ Tasks 7, 7A และ 7B ลง exact CSS/minimap/golden regression พร้อม compact tiers.
7. ทำ Task 8 ปิด legacy Pocket UI ทีละ featureเฉพาะแถวที่ replacement matrix ผ่านและไม่มี `unmapped`.
8. ทำ Task 9 ตรวจ onboarding/world lifecycle/security/focus.
9. ทำ Task 10 cache-bust/build artifact chain.
10. ทำ Task 11 full automated, golden, accessibility, performance และ real-touch deployment gates.

ห้ามเริ่มจากการซ่อน `#party`, `#stageObjective` หรือ `#gameChat` ทั้งหมดก่อน adapters และ replacement tests ผ่าน เพราะจะทำให้ฟังก์ชันหายโดยยังไม่มี UI ใหม่รองรับ.
