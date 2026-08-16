# แผนปฏิบัติงาน — Asset Presentation Engine × Blocky Bighead

เอกสารนี้เป็นแผนลงมือทำทีละเฟส จากสเปกใน [PR #28](https://github.com/nustanakritwithai/PocketMonster/pull/28)

ถ้าข้อความขัดกัน ให้ยึดลำดับนี้:

1. `docs/bighead/BIGHEAD_ASSET_ENGINE_WORK_ORDER_TH.md` — สถาปัตยกรรมและเกต
2. `docs/bighead/FOUR_SIDE_ASSET_STYLE_LOCK_TH.md` — UV / atlas / appearance
3. `docs/bighead/BIGHEAD_PRODUCTION_BLUEPRINT_TH.md` — สัดส่วนและงบ
4. `docs/bighead/CHARACTER_STYLE_BIGHEAD_TH.md` — ทิศทางศิลป์
5. เอกสารนี้ — ลำดับไฟล์ เทส จุดต่อเกม และวิธีเปิดงาน

`ASSET-ENGINE-PLAN-V8.md` จาก #25 **ไม่ใช่ authority** ของงานนี้ ห้ามทำ loader/manifest แบบนั้นอีก

---

## 0. สถานะและกติกาเปิดงาน

สถานะตอนเขียนแผน: `CLOSED — PLAN/READ ONLY`

ห้ามเริ่มซอร์สจนกว่าจะมีคำสั่งตรงตัวทีละเฟส:

| คำสั่งที่ต้องพิมพ์ | ความหมาย |
|---|---|
| `28` | squash สเปก #28 เข้า `main` ก่อนทุกอย่าง |
| `OPEN AE0` | เริ่มสัญญา / schema / เทส Node — ยังไม่แตะภาพเกม |
| `OPEN AE1` | wrap Player/Keeper เดิมผ่าน handle — ภาพเท่า baseline |
| `OPEN FS1` | cuboid UV provider — ยังไม่เปลี่ยนตัวละครในเกม |
| `OPEN FS2` | Asset Lab import/preview/export |
| `OPEN BH0` | สร้าง A/B/C ในแล็บ |
| `LOCK BIGHEAD PROPORTION B` | ล็อกหัว 40% หลังเห็นหลักฐาน A/B/C |
| `OPEN BH1` … `OPEN BH4` | consumer / appearance / เครื่องจริง |

กติกาคงที่ทุกเฟส:

- หนึ่งเฟส = หนึ่งสาขา = หนึ่ง PR = หนึ่ง freeze
- ห้ามรวม AE1+FS1+BH1 ในแพตช์เดียว
- ห้ามแก้ `index.html` / `v800.html` ให้ต่างกันแม้หนึ่งไบต์
- ห้าม bump `ASSET_REVISION` ถ้าไม่ได้อัปเดตทั้งสอง HTML และ `tests/p0-save-identity.mjs`
- ห้ามเพิ่ม dependency / build step / `import 'three'`
- ห้ามย้าย HP, จับมอน, เดิน, collider, กล้อง, save เข้าเอนจิน
- เกมส่ง `AssetRequest` แล้วได้ `AssetHandle` เท่านั้น ห้ามค้น child mesh ตามชื่อ
- พิมพ์เลข PR เพื่อ merge ทีละอัน เหมือนเฟส UX #18–#23

---

## 1. เป้าหมายและนอกขอบเขต

### เป้าหมายสุดท้าย (หลัง BH4)

Player และ Keeper เป็นหัวเหลี่ยม `blocky-bighead-v1` พื้นผิว `four-side-block-v1` ผ่าน Asset Presentation Engine ผู้เล่นแยกสองตัวจาก silhouette ได้โดยไม่ต้องอ่านชื่อ เปลี่ยนหน้าตาได้ด้วย catalog/appearance โดยไม่แก้ `game-v800.js`

### นอกขอบเขตทั้งชุดนี้

- มอนสเตอร์ 19 สปีชีส์ / ฟอร์มอีโวล / Flame Wolf / Magma Bear
- ต้นไม้ หิน รั้ว ของตกแต่งโซน
- เสียง SFX/BGM, ฟอนต์, ไอคอน UI, VFX texture
- GLB ภายนอก
- ระบบแต่งตัวในเซฟเกม
- แก้สูตรดาเมจ จับมอน เทรน อีโวล ผสมพันธุ์

งานมอน/โลกใน [#24](https://github.com/nustanakritwithai/PocketMonster/pull/24) / [#26](https://github.com/nustanakritwithai/PocketMonster/pull/26) คนละแกน อย่าฐานสาขาเอนจินจากสองสายนนั้น

---

## 2. สถาปัตยกรรมเป้าหมาย

```text
Gameplay / World State          game-v800.js เท่านั้น
        │ AssetRequest + visual action + duration
        ▼
Game-to-Asset Adapter           เฟส AE1
        ▼
Asset Presentation Engine
 ├─ Catalog / schema / variants
 ├─ Provider registry           procedural ก่อน, gltf ทีหลัง
 ├─ Resource ownership          shared / owned / pooled
 ├─ Rig / animator
 ├─ Bounds / anchors
 └─ Diagnostics
        ▼
AssetHandle { root, rig, anchors, bounds, play, update, setAppearance, dispose }
```

สัญญา `AssetHandle` ที่ทุก provider ต้องคืน:

| สมาชิก | หน้าที่ | ข้อห้าม |
|---|---|---|
| `root` | gameplay วาง position/rotation | เอนจินห้ามขยับการเดิน |
| `rig` | pivot อ่านอย่างเดียว | เกมห้ามแก้ child mesh |
| `play(action, options)` | ท่าภาพ | duration จากเกมเป็นเจ้าของ |
| `update(dt, visualState)` | อนิเมชัน | ห้ามแตะ `state` |
| `anchor(name, target?)` | จุดโลก ใช้ object ซ้ำได้ | ห้าม `new Vector3` ทุกเฟรมใน hot path |
| `bounds(target?)` | กรอบโลกหลังอัปเดตเมทริกซ์ | |
| `setAppearance(id)` | เปลี่ยน atlas ผ่านแคช | ห้ามแก้ geometry/เกม |
| `dispose()` | เรียกซ้ำได้ | ห้ามทำลาย shared resource |

ไอดีที่ล็อกในแคตตาล็อก:

- ตัวละคร: `character.human.blocky-bighead.v1`
- ผิว Player: `appearance.human.player-orange.v1`
- ผิว Keeper: `appearance.human.keeper-green.v1`
- สไตล์: `blocky-bighead-v1`
- พื้นผิว: `four-side-block-v1`
- ริก: `humanoid-rig-v1`
- บันเดิลพรีโหลด: `humanoid-core`

เอนจินรับ `THREE`, quality profile, shared resource cache, disposer ผ่าน dependency injection ห้ามโหลด Three.js ซ้ำ

---

## 3. เส้นฐานปัจจุบัน (post-UX1)

`main` ตอนเขียนแผน: `80a0d62` (แผน #25 + UX #18–#23)

### ตัวละครใน `game-v800.js`

| จุด | ค่าปัจจุบัน | หลังเอนจิน |
|---|---|---|
| สร้าง Player | `buildPlayerCharacter()` → `buildHumanoid()` ที่ `(0,0,5)` | `assets.spawn(..., { role:'player' })` |
| สร้าง Keeper | `buildKeeperCharacter()` ที่ `(4,0,3)` | `assets.spawn(..., { role:'keeper' })` |
| หัว | `SphereGeometry(.22)` ที่ `y = 1.56` | กล่อง `0.64×0.72×0.56` ที่ `y = 1.44` ตั้งแต่ BH1 |
| ริก | `userData.animRig` | `handle.rig` อ่านอย่างเดียว |
| ท่า | `setHumanoidAction(model, action, duration)` | `handle.play(action, { duration })` |
| เดิน | `animateHumanoid(player/npc, dt, moving)` | `handle.update(dt, { moving })` |
| จุดปา | `player.position + (0, 1.15, 0)` | `handle.anchor('throwOrigin')` |
| เส้นเล็ง | จุดเดียวกัน `y + 1.15` | ต้องเป็น `throwOrigin` อันเดียวกับลูกบอล |
| ตัวเลขโดนผู้เล่น | `y + 1.45` | `handle.anchor('hitText')` |
| ป้ายมอนป่า | `#worldLabels` จากเมช | ไม่เกี่ยวกับ humanoid |
| ปุ่มคุย | CSS `.npc-btn` ที่ตำแหน่ง NPC | `handle.anchor('label')` เมื่อถึง BH2 |
| กล้องมอง | `player.position + (0, 1.10, 0)` | **ห้ามเปลี่ยน** |
| ระยะคุย | `distXZ < 3.4` | **ห้ามเปลี่ยน** |
| เวลาลูกบอล | `0.55` | **ห้ามเปลี่ยน** |
| เวลาท่า | Throw `0.34` / Skill `0.28` / Hurt `0.24` | เกมส่งเข้า `play()` เหมือนเดิม |
| staff กระพริบ | แก้ `orbTop.material.emissiveIntensity` | instance-owned เท่านั้น |

หัว แขน ขา หมวก ผ้ากันเปื้อน กระเป๋า ไม้เท้าตอนนี้เป็นลูกของกรุ๊ปเดียว พิกัดสัมบูรณ์ต่อราก — ยังไม่มี `headPivot` แยกแบบสเปก

### สิ่งที่ผ่านแล้วและต้องไม่พัง

- `npm run ci` ทั้งชุด UX / live-loop / P0
- `index.html` === `v800.html`
- `APP_VERSION = '8.0.0'` • `ASSET_REVISION = '800'`
- `sharedResources` + `userData.shared` + `removeAndDispose`
- ปุ่มไลฟ์ลูปเดิม (อาหาร 7, พัก/เล่น, อุปกรณ์, CR, สกิล)

---

## 4. ลำดับ PR ที่จะเปิด

ทำหลัง `28` เข้า `main` แล้วเท่านั้น แต่ละสาขาแตกจาก `main` หลังเฟสก่อนหน้า squash แล้ว (ถ้า squash แล้วสาขาถัดไปสกปรก ให้ merge `origin/main` แล้วเก็บของเฟสใหม่ แบบ #19–#23)

| ลำดับ | สาขาที่เสนอ | ฐาน | งาน |
|---|---|---|---|
| 0 | `agent/bighead-four-side-docs` | `main` | สเปก #28 — เอกสารอย่างเดียว |
| 1 | `cursor/v800-ae0-contracts-ba33` | `main` หลัง #28 | สัญญา + เทส Node |
| 2 | `cursor/v800-ae1-legacy-adapter-ba33` | `main` หลัง AE0 | wrap humanoid เดิม |
| 3 | `cursor/v800-fs1-four-side-uv-ba33` | `main` หลัง AE1 | UV provider |
| 4 | `cursor/v800-fs2-asset-lab-ba33` | `main` หลัง FS1 | Asset Lab |
| 5 | `cursor/v800-bh0-proportion-lab-ba33` | `main` หลัง FS2 | A/B/C |
| 6 | `cursor/v800-bh1-player-bighead-ba33` | `main` หลัง BH0 + lock | Player consumer |
| 7 | `cursor/v800-bh2-keeper-bighead-ba33` | `main` หลัง BH1 | Keeper consumer |
| 8 | `cursor/v800-bh3-appearance-pack-ba33` | `main` หลัง BH2 | ชุดภาพจริง |
| 9 | `cursor/v800-bh4-acceptance-ba33` | `main` หลัง BH3 | อนิเมชัน / เครื่องจริง |

---

## 5. แผนรายเฟส

### เฟส 0 — รับสเปก (#28)

งาน: squash เอกสารสี่ไฟล์เข้า `main`

ไฟล์ที่มีอยู่แล้วใน #28:

- `docs/bighead/CHARACTER_STYLE_BIGHEAD_TH.md`
- `docs/bighead/BIGHEAD_PRODUCTION_BLUEPRINT_TH.md`
- `docs/bighead/BIGHEAD_ASSET_ENGINE_WORK_ORDER_TH.md`
- `docs/bighead/FOUR_SIDE_ASSET_STYLE_LOCK_TH.md`

เกตผ่าน: PR clean, docs only, `npm test` ของสาขานั้นผ่าน

ห้ามเริ่ม AE0 ถ้า #28 ยังไม่บน `main`

---

### AE0 — สัญญาและความเทสได้

คำสั่งเปิด: `OPEN AE0`

เป้าหมาย: มีโมดูลบริสุทธิ์ที่ Node รันได้โดยไม่โหลด DOM / Three CDN / `game-v800.js` ภาพเกมห้ามเปลี่ยน

#### ไฟล์ที่สร้าง

```text
asset-presentation/schema.mjs
asset-presentation/catalog.mjs
asset-presentation/handle-contract.mjs
asset-presentation/ownership.mjs
asset-presentation/anchors.mjs
asset-presentation/requests.mjs
assets/catalog/humanoid-core.json
tests/v80-ae0-contracts.mjs
tests/v80-ae0-mutants.mjs
```

#### ไฟล์ที่ห้ามแตะ

`game-v800.js`, `style-v800.css`, `index.html`, `v800.html`, `save-schema.mjs`, มอนสเตอร์, โซน

#### สิ่งที่ต้องมีในโมดูล

`schema.mjs`

- ตรวจแคตตาล็อกตัวละคร / appearance
- ดีดฟิลด์เกม: `hp`, `atk`, `def`, `spd`, `speed`, `collider`, `capture`, `captureChance`, `skill`, `interactionRadius`, `save`
- ดีดไอดีซ้ำในบันเดิลเดียวกัน
- บังคับมี `id`, `kind`, `provider`, `style`, `surfaceStyle`, `rig`, `metrics`, `roles`

`catalog.mjs`

- `loadCatalog(data)` / `getAssetDef(id)` / `getAppearance(id)` / `listBundle(name)`
- ไอดีภายนอกเท่านั้น — ห้ามคืน path ไฟล์ให้เกม

`handle-contract.mjs`

- `assertAssetHandle(handle)` ตรวจสมาชิกครบ
- `createNullHandle()` สำหรับเทส — `play`/`update`/`dispose` ไม่พัง

`ownership.mjs`

- ชนิด `sharedImmutable` | `instanceOwnedMutable` | `pooledTransient`
- `register(resource, kind)` / `disposeHandle(owned)` / `disposeSharedCache()` (shutdown เท่านั้น)
- instance dispose ห้ามเรียก `dispose()` ของของที่ mark shared

`anchors.mjs`

- ชื่อล็อก: `throwOrigin`, `hitText`, `label`, `headTop`, `feet`, `backpack`, `staffTip`, `rightHand`
- gameplay locks แยกไฟล์ค่าคงที่: กล้อง `1.10`, คุย `3.40`, ลูกบอล `0.55`, ท่า `0.34/0.28/0.24`
- legacy fallback ของ asset เก่า: throw `y+1.15`, hitText `y+1.45`, label `y+2.00` — ใช้เฉพาะ adapter เดิม ไม่ใช่ค่า Bighead

`requests.mjs`

- รูป `AssetRequest`: `{ assetId, role, appearanceId, quality }`
- ดีดถ้า `role` ไม่ใช่ `player` | `keeper` ในเฟสนี้

`humanoid-core.json`

- นิยาม `character.human.blocky-bighead.v1` ตาม work order §4
- appearance สองชุด (สีล็อกในบลูพรินต์) แต่ยังไม่มีไฟล์ภาพ
- `provider: "procedural"`
- ห้ามมี path เกมหรือสเตท

#### เทส AE0 ที่ต้องผ่าน

- schema ดีดฟิลด์เกมและไอดีซ้ำ
- `assertAssetHandle` ผ่านกับ handle จำลอง
- `dispose()` ครั้งที่ 2 ไม่พังและไม่ dispose ของ shared
- catalog คืนไอดี ไม่คืน filename
- `humanoid-core.json` ผ่าน schema
- `npm run ci` ชุดเดิมครบ + สองไฟล์ใหม่
- `node --check` ทุกไฟล์ใหม่

#### Mutant AE0 (ต้องทำให้เทสแดง)

1. ใส่ `hp` ในนิยามตัวละครแล้วยังผ่าน schema
2. สองไอดีซ้ำในบันเดิลแล้วยังผ่าน
3. handle ไม่มี `anchor` แล้วยังผ่าน `assertAssetHandle`
4. instance dispose ทำลายของที่ mark shared แล้วยังผ่าน

#### เกตปิด AE0

- ไม่มี import Three / `document` / `state`
- ไม่มีภาพใหม่ในเกม
- PR พร้อม merge เมื่อพิมพ์เลข PR

---

### AE1 — เอนจินแกน + adapter ของ humanoid เดิม

คำสั่งเปิด: `OPEN AE1` (หลัง AE0 อยู่บน `main`)

เป้าหมาย: เกมสร้าง/เล่นท่า/อัปเดต Player และ Keeper ผ่าน handle ภาพและพฤติกรรมเท่าตอนนี้ทุกพิกเซลเท่าที่เทสจับได้

#### ไฟล์ที่สร้าง/แก้

```text
asset-presentation/engine.mjs          สร้าง — registry, preload, spawn, diagnostics
asset-presentation/providers/legacy-humanoid.mjs   สร้าง
asset-presentation/game-adapter.mjs    สร้าง — บางส่วนเทสได้ใน Node
game-v800.js                           แก้เฉพาะจุดสร้าง/ท่า/จุดปา
tests/v80-ae1-adapter.mjs              สร้าง
tests/v80-ae1-mutants.mjs              สร้าง
```

#### วิธี wrap ของเดิม (ห้ามสร้าง Bighead)

1. ย้าย `buildHumanoid` / `buildPlayerCharacter` / `buildKeeperCharacter` / `animateHumanoid` / `setHumanoidAction` ออกจากเส้นทางที่เกมเรียกตรง ๆ ไปอยู่ที่ `legacy-humanoid.mjs` หรือเรียกผ่าน adapter ที่ยังใช้ฟังก์ชันเดิม
2. `engine.spawn('character.human.legacy-capsule.v1', { role })` คืน handle ที่ `root` คือกรุ๊ปเดิม
3. `handle.play` ไปที่ `setHumanoidAction`
4. `handle.update` ไปที่ `animateHumanoid`
5. `handle.anchor('throwOrigin')` ใน AE1 ยังคืน `root.position + (0, 1.15, 0)` เพราะของเดิมไม่มี right-hand world anchor ที่เสถียร — บันทึกว่านี่คือ **legacy fallback** จะเลิกใช้ใน BH1
6. `handle.anchor('hitText')` คืน `y + 1.45` แบบเดิม
7. `throwProjectile` และ `updateCaptureAimVisual` ต้องเรียก `playerVisual.anchor('throwOrigin', reuseVec)` อันเดียวกัน
8. `updatePlayer` เรียก `playerVisual.update(dt, { moving })` และ `keeperVisual.update(dt, { moving:false })`
9. `window.MLRPG_ASSETS` ใช้วินิจฉัยได้ ห้ามให้เกมลอจิกพึ่งมัน

สำคัญ: อย่าทำ `import { buildHumanoid } from './game-v800.js'` — แยก builder ออก หรือส่งฟังก์ชันเข้าเอนจินตอนบูต (`bindLegacyHumanoid({ build, animate, setAction })`) เพื่อไม่ให้เอนจินอิมพอร์ตเกม

#### จุดใน `game-v800.js` ที่ต้องตัด (exact)

| ที่ | จาก | เป็น |
|---|---|---|
| สร้างผู้เล่น | `const player=buildPlayerCharacter(); scene.add(player)` | `playerVisual=assets.spawn(...); player=playerVisual.root; scene.add(player)` |
| สร้าง NPC | `buildKeeperCharacter()` | `keeperVisual=assets.spawn(..., { role:'keeper' })` |
| ท่าปา/สกิล/เจ็บ | `setHumanoidAction(player, ...)` | `playerVisual.play(...)` |
| ลูปเดิน | `animateHumanoid(player/npc, ...)` | `playerVisual.update` / `keeperVisual.update` |
| จุดเริ่มลูกบอล | `player.position.clone().add(new THREE.Vector3(0,1.15,0))` | `playerVisual.anchor('throwOrigin', _throwOrigin)` |
| จุดเริ่มเส้นเล็ง | ค่าเดียวกันคนละบรรทัด | เวกเตอร์เดียวกันจาก `throwOrigin` |
| ตัวเลขโดนผู้เล่น | `y + 1.45` | `playerVisual.anchor('hitText', _hitText)` |

ห้ามเปลี่ยน: สปอน `(0,0,5)` `(4,0,3)`, สปีด `5.7`, กล้อง, `isNearNpc`, duration, `resolveCapture`, save

#### เทส AE1

- สตริงคอนแทรกต์: เกมไม่มี `buildPlayerCharacter()` เรียกตรง และมี `assets.spawn` / `playerVisual.play` / `playerVisual.anchor('throwOrigin'`
- เส้นเล็งกับลูกบอลใช้ตัวแปรจุดเดียวกัน
- `dispose()` สองครั้งไม่พัง
- หัวยังเป็นสเฟียร์ (ยังไม่กล่อง) — ล็อกด้วยสตริง `sphereGeometry(.22` ยังอยู่
- ชุด P0 / UX เดิมผ่าน
- mutant: สร้าง humanoid ตรงในเกม; เส้นเล็งคนละจุดกับลูกบอล; กลับไปฮาร์ดโค้ด `y+1.15` คู่ขนานกับ handle

#### เกตปิด AE1

เล่นเกมแล้วดูเหมือนเดิมทุกอย่าง ผู้เล่นยังแคปซูลหัวกลม การ์ดมอน/แท็บ/ป๊อปอัปไม่เปลี่ยน

---

### FS1 — Four-Side geometry / UV

คำสั่งเปิด: `OPEN FS1`

เป้าหมาย: มี provider สร้างกล่อง 6 หน้า + UV ตามแกนที่ล็อก ยังไม่ใส่บน Player/Keeper ในฉากจริง

#### ไฟล์

```text
asset-presentation/four-side/uv.mjs
asset-presentation/four-side/atlas.mjs
asset-presentation/four-side/fallback.mjs
tests/v80-fs1-uv.mjs
tests/v80-fs1-mutants.mjs
```

`game-v800.js` ห้ามเปลี่ยนในเฟสนี้

#### สัญญา UV

| หน้า | แกนท้องถิ่น |
|---|---|
| Front | `-Z` |
| Right | `+X` |
| Back | `+Z` |
| Left | `-X` |
| Top | `+Y` |
| Bottom | `-Y` |

- ห้าม mirror เป็นค่าเริ่มต้น
- gutter ≥ 4 px
- UV inset ไม่ชนไทล์ข้าง
- material ต่อ appearance ไม่เกิน 1 ชุด (ห้าม 4 materials)
- ขาด Left/Right → ใช้ด้านตรงข้ามแบบไม่ mirror
- ขาด Back → สีพื้น ไม่คัดลอกหน้า
- ขาด Top/Bottom → สีจาก palette
- surface offset = `-(depth/2 + epsilon)` ห้ามฝัง `z = -0.28`

เทสทำด้วย typed array / JSON ของ UV ไม่ต้องมี WebGL

#### Mutant FS1

6. ใช้ 4 materials แทน atlas
7. mirror Right/Left หรือ Front เป็น `+Z`

#### เกตปิด FS1

fixture ครบ 6 หน้า, gutter, material count = 1, เกมยังหัวกลม

---

### FS2 — Asset Lab

คำสั่งเปิด: `OPEN FS2`

เป้าหมาย: เครื่องมือนอกเกม สำหรับ `single` / `four` / `strip` พรีวิวซ้ำได้ มีแฮชคงที่

#### ไฟล์

```text
asset-lab/index.html
asset-lab/lab.mjs
asset-lab/compiler.mjs
asset-lab/preview.mjs
tests/v80-fs2-lab.mjs
```

ห้ามผูกเข้า `index.html` ของเกม ห้ามใส่แล็บใน Pages หลักถ้ายังไม่ขอ

ความสามารถขั้นต่ำ:

1. เลือก part (head/torso/arm/leg)
2. รับอินพุตสามโหมด
3. พรีวิว 0°/90°/180°/270° + Top/Bottom
4. กล้อง/แสง/ท่าคงที่
5. แสดงแกน ชื่อหน้า bounds anchors
6. export `appearance.json` + atlas + `contentHash`
7. อินพุตเดิม → แฮชเดิม

ยังไม่เปลี่ยนตัวละครในเกม

---

### BH0 — สัดส่วนในแล็บ

คำสั่งเปิด: `OPEN BH0`

สร้าง A / B / C ด้วยเอนจินเดียวกัน กล้อง/ท่า/สเกลเดียวกัน

| ตัวเลือก | หัว (W×H×D) | ศูนย์หัว Y | สัดส่วน |
|---|---|---|---|
| A | 0.62 × 0.68 × 0.54 | 1.46 | 37.8% |
| B | 0.64 × 0.72 × 0.56 | 1.44 | 40.0% recommended |
| C | 0.66 × 0.76 × 0.58 | 1.42 | 42.2% |

ทุกตัวมียอดหัว `y = 1.80`

หลักฐานที่ต้องเก็บ: หน้า/ขวา/หลัง/ซ้าย/บน/ล่าง + grayscale

**ห้ามล็อก B ในโค้ดเกม** จนกว่าจะมีคำสั่ง `LOCK BIGHEAD PROPORTION B`

เกมยังหัวกลม

---

### BH1 — Player เป็น Bighead

คำสั่งเปิด: `OPEN BH1` หลังล็อกสัดส่วนแล้ว

#### งาน

- provider ใหม่ `procedural-bighead` สร้างตามริก sibling (หัว/ลำตัว/แขน/ขาไม่ซ้อน Y)
- `headPivot.position.y` เป็นค่า root-local ของสัดส่วนที่ล็อก ไม่ใช่ลูกของลำตัว
- หน้า/ผม เป็นลูกของ `headPivot`
- กระเป๋าตามลำตัว ลูกบอลตาม `rightHand`
- สี fallback ตามบลูพรินต์ ยังไม่มีภาพจริง
- หัวเป็นกล่อง ห้าม `SphereGeometry` เป็นทรงหลัก
- `throwOrigin` จากมือขวาจริง เลิก `y+1.15` ของ Player
- เส้นเล็งกับลูกบอลใช้จุดนั้นอันเดียว
- `hitText` จากยอดหัวที่ขยับแล้ว + ช่องว่าง
- กล้อง / ระยะคุย / duration / จับมอน ห้ามเปลี่ยน
- mesh ของ Player เพิ่มได้ไม่เกิน +2 จากของเดิม
- ผมไม่เกิน 5 กล่อง

#### ริกที่บังคับ

```text
characterRoot
└─ visualRoot
   ├─ hipsPivot
   ├─ torsoPivot → torso, chest, backpack
   ├─ headPivot → head, faceSurface, hair
   ├─ leftArmRoot
   ├─ rightArmRoot → rightHandAnchor
   ├─ leftLegRoot
   └─ rightLegRoot
```

อนิเมเตอร์ทุกเฟรม: rest → locomotion → action ห้ามหมุนค้างหลัง Hurt → Throw

#### เทส / mutant BH1

- หัวเป็นกล่อง สัดส่วน 38–42%
- ไม่ double transform
- `throwOrigin` อยู่นอกกรอบหัวตอนปล่อยท่า
- mutant 2, 3, 4, 5, 8, 9 จาก work order §10

Keeper ยังของเดิมจนกว่า BH2

---

### BH2 — Keeper เป็น Bighead

คำสั่งเปิด: `OPEN BH2`

- ใช้ asset/rig เดียวกับ Player เปลี่ยนแค่ `role` / accessories / appearance
- หมวกปีกกว้างกว่าหัว ≥ 0.08 ต่อด้าน เป็นลูกของ `headPivot`
- ผ้ากันเปื้อนตามลำตัว ไม้เท้าตามมือหรือ constraint ที่เทสได้
- ป้าย/ปุ่มคุยมีช่องว่างเหนือหมวก
- ระยะคุย `3.40` คงเดิม
- staff pulse ใช้วัสดุของอินสแตนซ์

ตรวจ grayscale ว่าแยกจาก Player ได้

---

### BH3 — ชุดภาพจริง

คำสั่งเปิด: `OPEN BH3`

```text
assets/appearances/player-orange/
assets/appearances/keeper-green/
```

- Front/Right/Back/Left ต่อพาร์ทหลัก + Top/Bottom เป็นสีสำรอง
- คอมไพล์ผ่าน Asset Lab เป็น atlas + แฮช
- เกมเปลี่ยนหน้าตาด้วย `setAppearance(id)` หรือแก้ JSON ห้ามแก้ builder
- ห้ามเก็บ PNG/atlas ลงเซฟ
- โหลดไม่ได้ → ตารางหมากรุก/สี fallback เกมยังบูต

---

### BH4 — รับงานอนิเมชัน / เครื่องจริง

คำสั่งเปิด: `OPEN BH4`

ตรวจครบ:

- ท่า: Idle, Walk, Throw Capture, Throw Summon, Recall, Skill, Hurt
- มุมกล้อง min/default/max
- จอ 844×390, 915×412, 740×360
- โซน Hub / Grassland / Cave
- quality low/medium/high ใช้เรขาคณิตชุดเดียวกัน
- ไม่มี DOM mutation จากอนิเมชันตัวละคร
- `dispose` ซ้ำไม่เพิ่ม GPU resource
- จอย+กล้องพร้อมกัน, หมุนจอแล้วกลับ, เล่นต่อเนื่อง 10 นาทีบนเครื่องจริง

งบเทียบ post-UX1:

- `createBuffer` ตอนเข้า Ranch ไม่เกินค่าที่มากกว่าระหว่าง `+6` หรือ `+5%`
- draw/mesh ของ Player+Keeper รวมไม่เกิน `+10%`
- ห้ามใช้ FPS จาก SwiftShader เป็นคำตัดสินเดียว

canonical / deploy / release ต้องมีคำตัดสินแยกหลัง BH4

---

## 6. ชุดเทสและ mutant ทั้งสาย

ต่อ `package.json` `test` ท้ายสุดทีละไฟล์เฟส ห้ามลบชุดเดิม

โครงเทสที่เสนอ (Android/Termux รัน `npm test` ได้):

| ไฟล์ | เฟส | ชนิด |
|---|---|---|
| `tests/v80-ae0-contracts.mjs` | AE0 | schema / handle / catalog |
| `tests/v80-ae0-mutants.mjs` | AE0 | 4 mutants ของสัญญา |
| `tests/v80-ae1-adapter.mjs` | AE1 | สตริงคอนแทรกต์ + จุดปาอันเดียว |
| `tests/v80-ae1-mutants.mjs` | AE1 | bypass / จุดคนละที่ |
| `tests/v80-fs1-uv.mjs` | FS1 | 6 หน้า / gutter / material |
| `tests/v80-fs1-mutants.mjs` | FS1 | mirror / 4 materials |
| `tests/v80-fs2-lab.mjs` | FS2 | แฮชซ้ำได้ |
| `tests/v80-bh1-player.mjs` | BH1 | กล่อง / ริก / มือ |
| `tests/v80-bh2-keeper.mjs` | BH2 | หมวก / ไม้เท้า / ป้าย |
| `tests/v80-bh3-appearance.mjs` | BH3 | catalog เท่านั้น |
| `tests/v80-bh4-budget.mjs` | BH4 | นับเมช/วัสดุจากอินเวนทอรีซอร์ส |

Mutant ที่ต้องมีครบตาม work order §10:

1. สร้าง humanoid ตรงในเกม
2. หัวซ้อน Y จนสูงผิด
3. กลับไป `y + 1.15` แทนมือ
4. เส้นเล็งคนละจุดกับลูกบอล
5. แก้ shared material เพื่อกระพริบ
6. 4 materials แทน atlas
7. Front เป็น `+Z` หรือ mirror ซ้ายขวา
8. instance dispose ทำลายของแชร์
9. อนิเมเตอร์ไม่รีเซ็ต rest ก่อน overlay

ทุกเฟส: `npm run ci` ต้องเขียวก่อนขอ merge

---

## 7. โปรโตคอลวัดผล (ตั้งแต่ AE1)

1. ใช้ `main` หลัง UX #23 เป็นพ่อโดยตรงของเดลต้างานนี้
2. ฉาก / quality / จอเดียวกัน วอร์มอัพอย่างน้อย 3 รอบ รายงานทุกจบ
3. บันทึก `renderer.info.render.calls`, triangles, geometries, textures, programs
4. นับเมช/วัสดุ Player และ Keeper แยกก่อนตั้งงบสุดท้าย (ซอร์สปัจจุบันประมาณ Player 36 / Keeper 35 ชิ้น — ต้องยืนยันตอนรัน)
5. หน่วยความจำเท็กซ์เจอร์คิดจากกว้าง×สูง×ฟอร์แมต×mip ห้ามนับแค่จำนวนแผ่น
6. ไม่มี DOM เปลี่ยนจาก `handle.update`
7. ไม่ใช้ FPS ซอฟต์แวร์เป็นคำตัดสินเดียว

---

## 8. ความเสี่ยงและการกัน

| ความเสี่ยง | กันอย่างไร |
|---|---|
| ทำ loader แบบ #25 อีก | เอกสารนี้และ work order มีอำนาจเหนือ `ASSET-ENGINE-PLAN-V8.md` |
| แก้ `buildHumanoid` เป็น Bighead ตรง ๆ | AE1 wrap ของเดิมก่อน BH1 ห้ามข้าม |
| หัวสูงผิดเพราะซ้อนใต้ลำตัว | sibling pivots + เทส root-local |
| เส้นเล็งกับลูกบอลแยกมือ | เวกเตอร์ `throwOrigin` ตัวเดียว |
| พังเซฟ/เวอร์ชัน | ไม่แตะ `save-schema.mjs` / ไม่ bump revision โดยไม่จำเป็น |
| พัง Pages | `index.html` ต้องเท่า `v800.html` |
| ชน #24/#26 | แตกจาก `main` หลังเฟสตัวเองเท่านั้น |
| เอนจินอิมพอร์ตเกม | DI / bind ตอนบูต ห้าม `import './game-v800.js'` |
| staff กระพริบทำลายแคช | clone material ของอินสแตนซ์ |
| รวมหลายเฟสใน PR เดียว | ปฏิเสธรีวิว |

---

## 9. นิยามจบทั้งชุด

- AE0→AE1→FS1→FS2 ผ่านก่อนมี Bighead ในเกม
- มีคำสั่งล็อกสัดส่วนหลังหลักฐาน BH0
- Player/Keeper หัวเหลี่ยมรอบตัว แยก role ได้แบบขาวดำ
- ท่าหลักไม่คลิปหนัก ไม่หลุดชิ้นหน้า/เครื่องประดับ
- ราก กล้อง เป้าลูกบอล ผลจับมอน ระยะคุย เท่าเส้นฐาน
- จุดปา / ตัวเลข / ป้ายมาจากเอนจิน
- เปลี่ยนหน้าตาด้วยไอดี ไม่แก้เกม
- งบและ disposal ผ่าน
- เทส + mutant ครบ
- UV/atlas ผ่าน
- เครื่องจริงผ่านใน BH4
- ยังไม่ปล่อยเวอร์ชันจนกว่าจะมีคำตัดสิน canonical/Git/deploy/release แยก

---

## 10. สิ่งที่ทำได้ตอนนี้โดยไม่เปิดเฟสซอร์ส

- อ่านและแก้เอกสารแผนนี้
- squash #28 เมื่อพิมพ์ `28`
- ห้ามสร้าง `asset-engine.mjs` แบบ #25
- ห้ามสร้างกล่องหัวใน `buildHumanoid`
- ห้ามเพิ่ม GLB / เสียง / ฟอนต์

ขั้นตอนถัดไปที่รอคำสั่ง: พิมพ์ `28` แล้วพิมพ์ `OPEN AE0`
